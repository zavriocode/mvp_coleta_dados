const crypto = require('crypto');
const banco = require('../../config/banco');
const controle = require('./controleRecuperacao');
const backup = require('./backupService');
const ferramentas = require('./ferramentasRestore');
const { canonico } = require('./manifestoBackup');
const erro = require('../../utils/AppError');
const arquivos = new Map();
const CHECKLIST = ['usuarios','consentimentos','bloqueios','campanhas','tentativas',
  'indeterminados','eventosPosteriores','meta','capacidade','secrets'];

async function obter(id) {
  if (!/^[a-f0-9-]{36}$/i.test(id || '')) throw erro('Operação inválida.',400);
  const r = (await banco.query('SELECT * FROM recuperacao.operacoes WHERE id=$1',[id])).rows[0];
  if (!r) throw erro('Operação não encontrada.',404);
  return r;
}
async function fase(id, valor, dados = {}, mensagem = null) {
  await banco.query(`UPDATE recuperacao.operacoes SET fase=$2,dados=dados||$3::jsonb,
    erro=$4,atualizado_em=now() WHERE id=$1`,[id,valor,JSON.stringify(dados),mensagem]);
  await controle.auditar(valor,null,id);
}
async function exclusivo(fn) {
  const c = await banco.connect(); let adquirido = false, descartar=false;
  try {
    adquirido = (await c.query('SELECT pg_try_advisory_lock(82175001) AS ok')).rows[0].ok;
    if (!adquirido) throw erro('Outra operação de recuperação está em andamento.',409);
    return await fn();
  } finally {
    if (adquirido) await c.query('SELECT pg_advisory_unlock(82175001)').catch(() => {descartar=true;});
    c.release(descartar);
  }
}
function local(id) {
  const a = arquivos.get(id);
  if (!a) throw erro('Artefato local indisponível nesta instância. Não executar restore; mantenha a cópia externa.',409);
  return a;
}
async function reautenticar(usuario, senha) {
  const u = await require('../usuarios/usuarioModel').buscarCredenciaisPorId(usuario.id);
  if (!u || !u.ativo || u.perfil !== 'administrador' || typeof senha !== 'string' ||
      !await require('bcrypt').compare(senha,u.senha_hash)) throw erro('Reautenticação administrativa recusada.',401);
}
async function receber(arquivo, manifesto, credenciais, usuario, ip) {
  return exclusivo(async () => {
    if ((await controle.estado()).manutencao) throw erro('Manutenção ativa; não iniciar outro restore.',409);
    const id = crypto.randomUUID();
    await banco.query(`INSERT INTO recuperacao.operacoes(id,usuario_id,fase,dados) VALUES ($1,$2,'validando',$3)`,
      [id,usuario.id,JSON.stringify({ip:String(ip || '').slice(0,64)})]);
    await controle.auditar('upload_recebido',usuario.id,id);
    try {
      const retrato = await ferramentas.inspecionar(arquivo.path,manifesto,credenciais);
      const a = { arquivo:arquivo.path, diretorio:arquivo.destination, descritor:arquivo, manifesto, retrato };
      arquivos.set(id,a);
      a.timer = setTimeout(() => {
        obter(id).then(o => { if (['valido','rejeitado','liberado'].includes(o.fase)) return limpar(id); })
          .catch(() => {});
      },3600000); a.timer.unref();
      await fase(id,'valido',{nomeArquivo:typeof arquivo.originalname==='string'?require('path').basename(arquivo.originalname).slice(0,255):null,manifesto,resumo:{tabelas:retrato.estrutura.tabelas.length,
        contagens: Object.fromEntries(Object.entries(retrato.dados).map(([k,v])=>[k,v.quantidade])), admins:retrato.admins}});
      return obter(id);
    } catch(e) {
      await fase(id,'rejeitado',{},'Inspeção/autenticidade recusada; nenhuma restauração operacional executada.');
      throw e;
    }
  });
}
async function iniciar(id,dados,usuario) {
  return exclusivo(async () => {
    const o = await obter(id); const a = local(id);
    if (o.fase !== 'valido' || dados.frase !== 'RESTAURAR SISTEMA') throw erro('Confirmação RESTAURAR SISTEMA obrigatória.',409);
    await reautenticar(usuario,dados.senha);
    await ferramentas.autenticarArquivo(a.arquivo,a.manifesto);
    await ferramentas.verificarCapacidade(a.arquivo);
    await controle.verificarPendenciasAnteriores();
    await controle.ativar(id,usuario.id);
    clearTimeout(a.timer);
    await fase(id,'drenando');
    try {
      // Aguarda operações admitidas. Sem expirar comprovantes ou presumir conclusão.
      const tempo=Number(process.env.RESTORE_DRENAGEM_MS || 30000);
      if(!Number.isInteger(tempo)||tempo<1||tempo>60000)throw erro('RESTORE_DRENAGEM_MS inválido.',503);
      const limite = Date.now()+tempo;
      for (;;) {
        try { await controle.exigirDrenagem(); break; }
        catch(e) { if (Date.now()>=limite) throw e; await new Promise(r=>setTimeout(r,100)); }
      }
      await fase(id,'backup_pre_restore');
      const pre = await backup.gerar(usuario);
      a.pre = await backup.prepararDownload(pre.id); a.preManifesto = pre.manifesto;
      await ferramentas.autenticarArquivo(a.pre.caminhoArquivo,pre.manifesto);
      await fase(id,'aguardando_custodia',{preBackup:pre});
      return obter(id);
    } catch(e) {
      const drenando = (await obter(id)).fase === 'drenando';
      const mensagem = drenando
        ? 'Não foi possível comprovar o término das operações em andamento. Nenhuma restauração foi executada. Manutenção preservada.'
        : 'Não foi possível preparar o backup de segurança. Nenhuma restauração foi executada. Manutenção preservada.';
      await fase(id,'abortado_antes_restore',{},mensagem);
      e.recuperacao = { id, fase:'abortado_antes_restore', erro:mensagem, manutencao:true, novoLoginObrigatorio:true };
      throw e;
    }
  });
}
async function download(id) {
  const o = await obter(id); const a = local(id);
  if (!a.pre || !o.dados.preBackup) throw erro('Backup de segurança indisponível.',409);
  return { ...a.pre, manifesto:a.preManifesto };
}
async function registrarDownload(id,usuario) {
  await banco.query("UPDATE recuperacao.operacoes SET dados=dados||'{\"downloadConcluido\":true}'::jsonb WHERE id=$1",[id]);
  await controle.auditar('pre_backup_download_concluido',usuario.id,id);
}
async function executar(id,dados,usuario) {
  return exclusivo(async () => {
    const o = await obter(id); const a = local(id); const e = await controle.estado();
    if (!e.manutencao || e.operacao_id !== id || o.fase !== 'aguardando_custodia' ||
        !o.dados.downloadConcluido || dados.custodia !== true || dados.frase !== 'RESTAURAR SISTEMA') {
      throw erro('Exigidos manutenção, download concluído, custódia externa e confirmação explícita.',409);
    }
    await reautenticar(usuario,dados.senha);
    await controle.exigirDrenagem();
    await ferramentas.autenticarArquivo(a.arquivo,a.manifesto);
    await ferramentas.autenticarArquivo(a.pre.caminhoArquivo,a.preManifesto);
    await ferramentas.verificarCapacidade(a.arquivo);
    const antes = await ferramentas.retrato(banco);
    if (canonico(antes.estrutura)!==canonico(a.retrato.estrutura)) throw erro('Estrutura mudou após inspeção.',409);
    await controle.auditar('custodia_externa_confirmada',usuario.id,id,{sha256:a.pre.sha256});
    await fase(id,'restaurando');
    try {
      // Invalida inclusive tokens emitidos durante a espera pelo download.
      await banco.query('UPDATE recuperacao.estado SET auth_epoch=auth_epoch+1 WHERE id=true');
      // Eventos preservados de recuperações anteriores também podem ter sido
      // removidos pelo recuo do snapshot. Nunca apagar esses comprovantes.
      await banco.query(`UPDATE recuperacao.webhooks SET aplicado_em=NULL
        WHERE recebido_em >= $1::timestamptz`,[a.manifesto.dados.criadoEm]);
      await ferramentas.restaurar(a.arquivo,backup.lerConfiguracaoBanco().banco,true);
      await fase(id,'validando_pos_restore');
      const depois = await ferramentas.retrato(banco);
      if (canonico(depois)!==canonico(a.retrato)) throw erro('Conteúdo restaurado diverge do snapshot inspecionado.',409);
      await banco.query('UPDATE recuperacao.estado SET auth_epoch=auth_epoch+1 WHERE id=true');
      await fase(id,'aguardando_revisao',{restauradoEm:new Date().toISOString()});
      return { ...await obter(id), novoLoginObrigatorio:true };
    } catch(e) {
      await fase(id,'recuperacao_necessaria',{},'Falha de restauração ou validação. Não liberar. Cópia pré-restore preservada.');
      throw e;
    }
  });
}
async function reconciliar(id,usuario,templates=false) {
  return exclusivo(async () => {
    const o = await obter(id), e = await controle.estado();
    if (!e.manutencao || e.operacao_id !== id || !['aguardando_revisao','abortado_antes_restore'].includes(o.fase)) throw erro('Reconciliação não permitida nesta fase.',409);
    const eventos = (await banco.query(`SELECT * FROM recuperacao.webhooks WHERE aplicado_em IS NULL
      AND requer_meta=$1 ORDER BY id LIMIT 1000`,[templates])).rows;
    let aplicados=0,pendentes=0;
    for(const item of eventos) {
      try {
        const resultados = await require('../mensageria/mensageriaService').processarWebhook(item.payload);
        if (item.erro === 'Correlação ausente; revisão técnica necessária.' &&
            resultados.some(r=>r.motivo==='evento_repetido')) throw erro('Correlação ausente; revisão técnica necessária.',409);
        // Ausência de correlação não é sucesso de reconciliação.
        if (!resultados.length || resultados.some(r=> /nao_encontrad|desconhecid|pendente|invalido|divergente/.test(r.motivo || ''))) throw erro('Correlação ausente; revisão técnica necessária.',409);
        await banco.query('UPDATE recuperacao.webhooks SET aplicado_em=now(),erro=NULL WHERE id=$1',[item.id]); aplicados++;
      } catch(e) {
        await banco.query('UPDATE recuperacao.webhooks SET erro=$2 WHERE id=$1',[item.id,
          e.message==='Correlação ausente; revisão técnica necessária.'?e.message:'Reconciliação pendente; tentativa manual necessária.']); pendentes++;
      }
    }
    await controle.auditar(templates?'reconciliacao_templates_manual':'reconciliacao_local',usuario.id,id,{aplicados,pendentes});
    return {aplicados,pendentes};
  });
}
async function liberar(id,dados,usuario) {
  return exclusivo(async () => {
    await reautenticar(usuario,dados.senha);
    if(dados.frase!=='LIBERAR SISTEMA' || CHECKLIST.some(k=>dados.checklist?.[k]!==true)) throw erro('Revisão administrativa completa obrigatória.',409);
    await controle.exigirDrenagem();
    await controle.transacao(async c=>{
      const e=(await c.query('SELECT * FROM recuperacao.estado WHERE id=true FOR UPDATE')).rows[0];
      const o=await obter(id);
      if(!e.manutencao || e.operacao_id!==id || !['aguardando_revisao','abortado_antes_restore'].includes(o.fase)) throw erro('Liberação proibida nesta fase.',409);
      if((await c.query('SELECT 1 FROM recuperacao.webhooks WHERE aplicado_em IS NULL LIMIT 1')).rowCount) throw erro('Existem eventos pendentes; não é permitido ignorá-los.',409);
      await c.query("UPDATE recuperacao.operacoes SET fase='liberado',atualizado_em=now() WHERE id=$1",[id]);
      await controle.auditar('liberacao_manual',usuario.id,id,{checklist:dados.checklist},c);
      await c.query('UPDATE recuperacao.estado SET manutencao=false,operacao_id=NULL,atualizado_em=now() WHERE id=true');
    });
    await limpar(id);
    return {liberado:true};
  });
}
async function cancelarAntesRestore(id,dados,usuario){
  return exclusivo(async()=>{
    await reautenticar(usuario,dados.senha);
    const o=await obter(id),e=await controle.estado();
    if(dados.frase!=='CANCELAR RESTAURACAO' || !e.manutencao || e.operacao_id!==id || o.fase!=='aguardando_custodia')
      throw erro('Cancelamento permitido somente antes da etapa destrutiva, com confirmação explícita.',409);
    await fase(id,'abortado_antes_restore',{},'Cancelamento administrativo antes da substituição. Revisão/reconciliação e liberação manual ainda obrigatórias.');
    await controle.auditar('cancelamento_pre_destructivo',usuario.id,id);
    return obter(id);
  });
}
async function limpar(id) {
  const a=arquivos.get(id); if(!a)return;
  clearTimeout(a.timer);
  await require('./uploadRestore').removerArquivo(a.descritor || {path:a.arquivo});
  if(a.pre)await backup.removerTemporario(a.pre.diretorio);
  arquivos.delete(id);
}
async function listar() {
  return {estado:await controle.estado(),operacoes:(await banco.query('SELECT * FROM recuperacao.operacoes ORDER BY criado_em DESC LIMIT 50')).rows,
    pendencias:(await banco.query('SELECT id,tipo,requer_meta,erro,recebido_em FROM recuperacao.webhooks WHERE aplicado_em IS NULL ORDER BY id LIMIT 1000')).rows,checklist:CHECKLIST};
}
async function revisar(id,tabela,pagina=0) {
  const o=await obter(id);
  if(!['aguardando_revisao','abortado_antes_restore'].includes(o.fase)) throw erro('Revisão disponível somente após estabilização.',409);
  const permitidas=['usuarios','contatos','consentimentos','campanhas','campanha_tentativas','eventos_webhook_mensageria','configuracoes_sistema','modelos_mensagem'];
  if(!permitidas.includes(tabela) || !Number.isSafeInteger(Number(pagina)) || Number(pagina)<0) throw erro('Consulta de revisão inválida.',400);
  const ordem=tabela==='configuracoes_sistema'?'chave':'id';
  const rows=await banco.query(`SELECT to_jsonb(t)-'senha_hash' AS registro FROM public."${tabela}" t ORDER BY ${ordem} LIMIT 100 OFFSET $1`,[Number(pagina)*100]);
  return {tabela,pagina:Number(pagina),registros:rows.rows.map(x=>x.registro)};
}
module.exports={receber,iniciar,download,registrarDownload,executar,reconciliar,liberar,listar,obter,limpar,revisar,cancelarAntesRestore};
