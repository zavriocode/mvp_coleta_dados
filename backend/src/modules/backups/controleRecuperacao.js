const crypto = require('crypto');
const banco = require('../../config/banco');
const erro = require('../../utils/AppError');
const admissoesLocais = new Set();

async function transacao(fn) {
  const c = await banco.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}
async function estado(c = banco) {
  return (await c.query('SELECT * FROM recuperacao.estado WHERE id=true')).rows[0];
}
async function auditar(evento, usuarioId = null, operacaoId = null, dados = {}, c = banco) {
  await c.query(`INSERT INTO recuperacao.auditoria(evento,usuario_id,operacao_id,dados)
    VALUES ($1,$2,$3,$4)`, [evento, usuarioId, operacaoId, JSON.stringify(dados)]);
}
async function admitir(tipo) {
  const id = await transacao(async c => {
    const e = (await c.query('SELECT * FROM recuperacao.estado WHERE id=true FOR UPDATE')).rows[0];
    if (e.manutencao) return null;
    const id = crypto.randomUUID();
    await c.query('INSERT INTO recuperacao.admissoes(id,tipo) VALUES ($1,$2)', [id, tipo]);
    return id;
  });
  if (id) admissoesLocais.add(id);
  return id;
}
async function concluir(id) {
  if (id) await banco.query('UPDATE recuperacao.admissoes SET concluido_em=now() WHERE id=$1 AND concluido_em IS NULL', [id]);
  admissoesLocais.delete(id);
}
async function verificarPendenciasAnteriores() {
  const r = await banco.query('SELECT id FROM recuperacao.admissoes WHERE concluido_em IS NULL');
  // Outra instância pode estar trabalhando. Ausência local NÃO prova conclusão.
  if (r.rows.some(x => !admissoesLocais.has(x.id))) {
    throw erro('Há operações de outra instância ou de uma execução anterior sem conclusão comprovada. A preparação não foi iniciada. Aguarde a conclusão ou solicite verificação técnica; não repita a restauração.', 409);
  }
}
async function job(nome, fn) {
  const id = await admitir('job:' + nome);
  if (!id) return { executado: false, motivo: 'manutencao' };
  try { return await fn(); } finally { await concluir(id); }
}
async function middleware(req, res, next) {
  // O webhook tem admissão própria depois de validar a assinatura.
  const p = req.path;
  if (p === '/api/saude/vivo') return next();
  if (p === '/api/webhooks/whatsapp' || p.startsWith('/api/admin/restauracoes')) return next();
  try {
    if (p === '/api/saude/pronto' && (await estado()).manutencao) {
      return res.status(200).json({ mensagem:'Aplicação em manutenção administrativa.', manutencao:true });
    }
    let id, terminou = false;
    // Instalar antes do await: finish pode ocorrer enquanto a admissão é gravada.
    const finalizar = () => {
      terminou = true;
      if (id) concluir(id).catch(() => console.error('Admissão sem conclusão; drenagem ficará bloqueada.'));
    };
    res.once('finish', finalizar);
    id = await admitir('http');
    if (terminou || res.destroyed || req.aborted) {
      // Nenhum handler de negócio foi admitido neste caminho.
      res.removeListener('finish', finalizar);
      await concluir(id);
      return;
    }
    if (!id) {
      if (p === '/api/autenticacao/login') return next(); // login somente leitura em manutenção
      throw erro('Sistema em manutenção. Somente a recuperação administrativa está disponível.', 503);
    }
    // Não concluir em close/aborted: encerramento HTTP não prova término do handler.
    next();
  } catch (e) { next(e); }
}
async function ativar(id, usuarioId) {
  await transacao(async c => {
    const e = (await c.query('SELECT * FROM recuperacao.estado WHERE id=true FOR UPDATE')).rows[0];
    if (e.manutencao) throw erro('Já existe manutenção ativa.', 409);
    await c.query('UPDATE recuperacao.estado SET manutencao=true, auth_epoch=auth_epoch+1, operacao_id=$1, atualizado_em=now() WHERE id=true', [id]);
    await auditar('manutencao_ativada', usuarioId, id, {}, c);
  });
}
async function exigirDrenagem() {
  const abertas = (await banco.query('SELECT count(*)::int AS n FROM recuperacao.admissoes WHERE concluido_em IS NULL')).rows[0].n;
  if (abertas !== 0) throw erro('Drenagem não comprovada: operações admitidas ainda não concluídas. Nenhum restore autorizado.', 409);
}
async function reconhecerInterrupcao() {
  const c=await banco.connect();let lock=false,descartar=false;
  try{
    lock=(await c.query('SELECT pg_try_advisory_lock(82175001) AS ok')).rows[0].ok;
    if(!lock)return; // Outra instância ainda é responsável pela operação.
    const e=await estado(c);
    if(!e.manutencao||!e.operacao_id)return;
    const r=await c.query(`UPDATE recuperacao.operacoes SET fase='recuperacao_necessaria',
      erro='Processo interrompido; resultado deve ser verificado tecnicamente. Manutenção preservada.',atualizado_em=now()
      WHERE id=$1 AND fase IN ('drenando','backup_pre_restore','restaurando','validando_pos_restore') RETURNING id`,[e.operacao_id]);
    if(r.rowCount)await auditar('interrupcao_detectada',null,e.operacao_id,{},c);
  }finally{
    if(lock)await c.query('SELECT pg_advisory_unlock(82175001)').catch(()=>{descartar=true;});
    c.release(descartar);
  }
}
function separar(payload) {
  const resultado = [];
  for (const entrada of payload.entry || []) for (const mudanca of entrada.changes || []) {
    const value = mudanca.value || {};
    const anexar = (v, tipo, requerMeta) => resultado.push({ tipo, requerMeta,
      payload: { ...payload, entry: [{ ...entrada, changes: [{ ...mudanca, value: v }] }] } });
    if (mudanca.field === 'messages') {
      const base = { ...value }; delete base.messages; delete base.statuses;
      for (const status of value.statuses || []) anexar({ ...base, statuses: [status] }, 'status', false);
      for (const mensagem of value.messages || []) anexar({ ...base, messages: [mensagem] }, 'mensagem', false);
      if (!(value.messages || []).length && !(value.statuses || []).length) anexar(value, 'outro', false);
    } else {
      const template = mudanca.field === 'message_template_status_update';
      const externo = template && !['PENDING_DELETION', 'DELETED', 'DISABLED', 'FLAGGED'].includes(value.event);
      anexar(value, template ? 'template' : 'outro', externo);
    }
  }
  return resultado;
}
async function receberWebhook(payload, processar) {
  const { canonico } = require('./manifestoBackup');
  const admissao = await transacao(async c => {
    // Decisão e persistência atômicas com ativação e liberação da manutenção.
    const e = (await c.query('SELECT * FROM recuperacao.estado WHERE id=true FOR UPDATE')).rows[0];
    if (!e.manutencao) {
      const id=crypto.randomUUID();
      await c.query("INSERT INTO recuperacao.admissoes(id,tipo) VALUES ($1,'webhook')",[id]);
      return id;
    }
    for (const evento of separar(payload)) {
      const chave = crypto.createHash('sha256').update(canonico(evento.payload)).digest('hex');
      await c.query(`INSERT INTO recuperacao.webhooks(chave,payload,tipo,requer_meta) VALUES ($1,$2,$3,$4)
        ON CONFLICT (chave) DO NOTHING`, [chave, JSON.stringify(evento.payload), evento.tipo, evento.requerMeta]);
    }
    return null;
  });
  if (admissao) {
    admissoesLocais.add(admissao);
    try { return await processar(payload); } finally { await concluir(admissao); }
  }
  return { preservado: true };
}
module.exports = { estado, auditar, transacao, admitir, concluir, job, middleware, ativar, exigirDrenagem, verificarPendenciasAnteriores, receberWebhook, separar, reconhecerInterrupcao };
