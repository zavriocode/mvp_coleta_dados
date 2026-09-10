require('dotenv').config({ quiet: true });

process.env.NODE_ENV = 'test';
process.env.WHATSAPP_ACCESS_TOKEN = 'token-falso-resiliencia';
process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789';
process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = '987654321';
process.env.META_GRAPH_API_VERSION = 'v99.0';
process.env.WHATSAPP_OPTOUT_BUTTON_ID = 'optout_teste_resiliencia';

const crypto = require('crypto');
const banco = require('../src/config/banco');
const mensageriaModel = require('../src/modules/mensageria/mensageriaModel');
const mensageriaService = require('../src/modules/mensageria/mensageriaService');

let verificacoes = 0;

function confirmar(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
  verificacoes += 1;
}

async function confirmarRejeicao(promessa, trecho) {
  try { await promessa; }
  catch (erro) {
    confirmar(erro.message.toLowerCase().includes(trecho.toLowerCase()), 'Erro inesperado: ' + erro.message);
    return erro;
  }
  throw new Error('A operação deveria ter sido rejeitada.');
}

async function criarCenario(sufixo) {
  const usuario = (await banco.query(
    "SELECT id FROM usuarios WHERE ativo=TRUE AND perfil='administrador' ORDER BY id LIMIT 1"
  )).rows[0];
  const origem = (await banco.query(
    'SELECT id FROM origens WHERE ativa=TRUE ORDER BY id LIMIT 1'
  )).rows[0];
  const telefone = '21987' + String(sufixo).padStart(6, '0').slice(-6);
  const template = (await banco.query(`
    INSERT INTO modelos_mensagem (
      nome,categoria,texto,ativo,meta_nome,meta_idioma,meta_categoria,meta_status,
      meta_template_id,meta_status_oficial,meta_componentes,meta_configuracao_envio,
      meta_origem,criado_por_usuario_id,atualizado_por_usuario_id
    ) VALUES ($1,'Teste','Mensagem de teste',TRUE,$2,'pt_BR','MARKETING','aprovado',
      $3,'APPROVED','[{"type":"BODY","text":"Mensagem de teste"}]','{}','meta',$4,$4)
    RETURNING id
  `, ['Resiliência ' + sufixo, 'resiliencia_' + sufixo, 'meta-resiliencia-' + sufixo, usuario.id])).rows[0];
  const contato = (await banco.query(`
    INSERT INTO contatos (
      nome,telefone,telefone_normalizado,bairro,problema,
      consentimento_armazenamento,origem_id
    ) VALUES ($1,$2,$2,'Centro','Teste',TRUE,$3)
    RETURNING id,telefone_normalizado
  `, ['Contato resiliência ' + sufixo, telefone, origem.id])).rows[0];
  const campanha = (await banco.query(`
    INSERT INTO campanhas (
      nome,descricao,finalidade,modelo_id,filtros_snapshot,status,ativo,
      responsavel_usuario_id,criado_por_usuario_id,atualizado_por_usuario_id
    ) VALUES ($1,'Teste','Teste',$2,'{}','ativa',TRUE,$3,$3,$3)
    RETURNING id
  `, ['Campanha resiliência ' + sufixo, template.id, usuario.id])).rows[0];
  const lote = (await banco.query(`
    INSERT INTO campanha_lotes (
      campanha_id,tamanho_solicitado,tamanho_efetivo,ordem,
      chave_idempotencia,criado_por_usuario_id
    ) VALUES ($1,1,1,1,$2,$3)
    RETURNING id
  `, [campanha.id, crypto.randomUUID(), usuario.id])).rows[0];
  const participacao = (await banco.query(`
    INSERT INTO campanha_participacoes (
      campanha_id,contato_id,lote_original_id,status,reservado_em
    ) VALUES ($1,$2,$3,'pendente',CURRENT_TIMESTAMP)
    RETURNING id
  `, [campanha.id, contato.id, lote.id])).rows[0];
  const tentativa = (await banco.query(`
    INSERT INTO campanha_tentativas (participacao_id,numero_tentativa,status)
    VALUES ($1,1,'pendente') RETURNING id
  `, [participacao.id])).rows[0];
  return { campanha, contato, participacao, tentativa };
}

function payloadStatus(identificador, status, timestamp, erro) {
  const item = { id: identificador, status, timestamp: String(timestamp) };
  if (erro) item.errors = [erro];
  return { entry: [{ changes: [{ value: { statuses: [item] } }] }] };
}

async function buscarTentativa(id) {
  return (await banco.query(`
    SELECT status,identificador_externo,resultado_indeterminado_em,
      resultado_indeterminado_codigo,status_externo_em,permite_nova_tentativa
    FROM campanha_tentativas WHERE id=$1
  `, [id])).rows[0];
}

async function executar() {
  const nomeBanco = (await banco.query('SELECT current_database() AS nome')).rows[0].nome;
  if (!String(nomeBanco).startsWith('acorda_rj_campanhas_qa_')) {
    throw new Error('Este teste só pode ser executado no PostgreSQL temporário isolado.');
  }
  await banco.query("UPDATE configuracoes_sistema SET valor_inteiro=20000 WHERE chave='limite_mensagens_24h'");

  const normal = await criarCenario('101');
  mensageriaService.definirProviderParaTeste(async function () {
    return { ok: true, status: 200, json: async function () { return { messages: [{ id: 'wamid.resiliencia.normal' }] }; } };
  });
  const envioNormal = await mensageriaService.enviar(normal.tentativa.id);
  confirmar(envioNormal.status === 'enviada', 'O fluxo normal não confirmou o envio.');
  const normalPersistida = await buscarTentativa(normal.tentativa.id);
  confirmar(normalPersistida.status === 'enviada' && normalPersistida.identificador_externo === 'wamid.resiliencia.normal',
    'O fluxo normal não persistiu status e identificador juntos.');

  const timeout = await criarCenario('102');
  mensageriaService.definirProviderParaTeste(async function () {
    const erro = new Error('Falha de rede simulada');
    throw erro;
  });
  await confirmarRejeicao(mensageriaService.enviar(timeout.tentativa.id), 'não será reenviada automaticamente');
  const timeoutPersistida = await buscarTentativa(timeout.tentativa.id);
  confirmar(timeoutPersistida.status === 'enviando' && timeoutPersistida.resultado_indeterminado_em &&
    timeoutPersistida.permite_nova_tentativa === false,
  'A falha de transporte não foi distinguida como resultado indeterminado.');
  const chamadasAntes = 0;
  let chamadasDepois = chamadasAntes;
  mensageriaService.definirProviderParaTeste(async function () {
    chamadasDepois += 1;
    return { ok: true, status: 200, json: async function () { return { messages: [{ id: 'wamid.nao.deveria.enviar' }] }; } };
  });
  await confirmarRejeicao(mensageriaService.enviar(timeout.tentativa.id), 'processada');
  confirmar(chamadasDepois === chamadasAntes, 'Resultado indeterminado foi reenviado automaticamente.');

  const interrompida = await criarCenario('103');
  const agora = new Date('2026-09-10T15:10:00.000Z');
  await mensageriaModel.iniciarEnvio(interrompida.tentativa.id, new Date(agora.getTime() - 5 * 60 * 1000));
  const recuperadas = await mensageriaModel.recuperarTentativasParadas(agora, 2 * 60 * 1000);
  const interrompidaPersistida = await buscarTentativa(interrompida.tentativa.id);
  confirmar(recuperadas === 1 && interrompidaPersistida.resultado_indeterminado_codigo === 'PROCESSO_INTERROMPIDO',
    'A tentativa interrompida não foi identificada com segurança.');

  const antecipada = await criarCenario('104');
  await mensageriaModel.iniciarEnvio(antecipada.tentativa.id, agora);
  const idAntecipado = 'wamid.resiliencia.antecipado';
  const respostaAntecipada = await mensageriaService.processarWebhook(payloadStatus(idAntecipado, 'read', 1789053300));
  confirmar(respostaAntecipada[0].pendente === true && respostaAntecipada[0].motivo === 'tentativa_nao_encontrada',
    'O webhook antecipado deveria permanecer pendente.');
  const eventoPendente = (await banco.query(`
    SELECT estado_processamento FROM eventos_webhook_mensageria
    WHERE identificador_externo=$1
  `, [idAntecipado + ':lida'])).rows[0];
  confirmar(eventoPendente.estado_processamento === 'pendente', 'O webhook antecipado foi descartado.');
  await mensageriaModel.concluirEnvio(antecipada.tentativa.id, idAntecipado, agora);
  const antecipadaPersistida = await buscarTentativa(antecipada.tentativa.id);
  const eventoCorrelacionado = (await banco.query(`
    SELECT estado_processamento FROM eventos_webhook_mensageria
    WHERE identificador_externo=$1
  `, [idAntecipado + ':lida'])).rows[0];
  confirmar(antecipadaPersistida.status === 'lida' && eventoCorrelacionado.estado_processamento === 'processado',
    'O webhook antecipado não foi associado após a confirmação local.');
  const repetido = await mensageriaService.processarWebhook(payloadStatus(idAntecipado, 'read', 1789053300));
  confirmar(repetido[0].motivo === 'evento_repetido', 'O webhook repetido não foi idempotente.');

  const foraDeOrdem = await criarCenario('105');
  mensageriaService.definirProviderParaTeste(async function () {
    return { ok: true, status: 200, json: async function () { return { messages: [{ id: 'wamid.resiliencia.ordem' }] }; } };
  });
  await mensageriaService.enviar(foraDeOrdem.tentativa.id);
  await mensageriaService.processarWebhook(payloadStatus('wamid.resiliencia.ordem', 'delivered', 1789053200));
  const atrasado = await mensageriaService.processarWebhook(payloadStatus('wamid.resiliencia.ordem', 'sent', 1789053100));
  await mensageriaService.processarWebhook(payloadStatus('wamid.resiliencia.ordem', 'read', 1789053400));
  const falhaAntiga = await mensageriaService.processarWebhook(payloadStatus(
    'wamid.resiliencia.ordem', 'failed', 1789053300, { code: 131000, message: 'Falha antiga simulada' }
  ));
  const ordemPersistida = await buscarTentativa(foraDeOrdem.tentativa.id);
  confirmar(atrasado[0].motivo === 'evento_atrasado' && falhaAntiga[0].motivo === 'evento_atrasado' &&
    ordemPersistida.status === 'lida', 'Eventos oficiais fora de ordem regrediram o status.');

  const falhaConfirmada = await criarCenario('106');
  mensageriaService.definirProviderParaTeste(async function () {
    return { ok: false, status: 400, json: async function () { return { error: { code: 131000, message: 'Falha confirmada simulada' } }; } };
  });
  await confirmarRejeicao(mensageriaService.enviar(falhaConfirmada.tentativa.id), 'recusou');
  const falhaPersistida = await buscarTentativa(falhaConfirmada.tentativa.id);
  confirmar(falhaPersistida.status === 'falhou' && !falhaPersistida.resultado_indeterminado_em,
    'A rejeição explícita do provider não foi distinguida da incerteza de transporte.');

  const optout = await criarCenario('107');
  mensageriaService.definirProviderParaTeste(async function () {
    return { ok: true, status: 200, json: async function () { return { messages: [{ id: 'wamid.resiliencia.optout' }] }; } };
  });
  await mensageriaService.enviar(optout.tentativa.id);
  const idOptout = 'wamid.resiliencia.optout.entrada';
  const payloadOptout = { entry: [{ changes: [{ value: { messages: [{
    id: idOptout, from: '55' + optout.contato.telefone_normalizado,
    context: { id: 'wamid.resiliencia.optout' }, type: 'button',
    button: { payload: process.env.WHATSAPP_OPTOUT_BUTTON_ID, text: 'Parar contatos' }
  }] } }] }] };
  await mensageriaService.processarWebhook(payloadOptout);
  const contatoBloqueado = (await banco.query(`
    SELECT bloqueado_para_mensagens,bloqueado_para_ligacoes FROM contatos WHERE id=$1
  `, [optout.contato.id])).rows[0];
  const repeticaoOptout = await mensageriaService.processarWebhook(payloadOptout);
  confirmar(contatoBloqueado.bloqueado_para_mensagens && contatoBloqueado.bloqueado_para_ligacoes &&
    repeticaoOptout[0].motivo === 'evento_repetido', 'O opt-out perdeu atomicidade ou idempotência.');

  const historicosIndeterminados = Number((await banco.query(`
    SELECT COUNT(*) AS total FROM historico_status_mensageria
    WHERE codigo_erro_sanitizado IN ('META_INDISPONIVEL','PROCESSO_INTERROMPIDO')
  `)).rows[0].total);
  confirmar(historicosIndeterminados === 2, 'O histórico dos resultados indeterminados não foi preservado uma única vez.');

  console.log('Resiliência de envio e webhook: ' + verificacoes + ' verificações aprovadas em 8 cenários.');
}

executar().catch(function (erro) {
  console.error(erro.stack || erro.message);
  process.exitCode = 1;
}).finally(async function () {
  mensageriaService.definirProviderParaTeste();
  await banco.end();
});
