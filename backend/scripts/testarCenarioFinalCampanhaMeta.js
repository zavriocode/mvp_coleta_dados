require('dotenv').config({ quiet: true });

const crypto = require('crypto');
const banco = require('../src/config/banco');
const campanhaService = require('../src/modules/campanhas/campanhaService');
const contatoService = require('../src/modules/contatos/contatoService');
const mensageriaService = require('../src/modules/mensageria/mensageriaService');

let verificacoes = 0;
function confirmar(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
  verificacoes += 1;
}

async function criarCampanha(nome, modeloId, filtros, usuario) {
  const campanha = await campanhaService.criar({
    nome, finalidade: 'Cenario E2E final isolado.', modeloId, filtros
  }, usuario);
  return campanhaService.alterarStatus(campanha.id, 'pronta', usuario);
}

async function executar() {
  const bancoTemporario = String(process.env.DATABASE_URL || '').includes('acorda_rj_campanhas_qa_');
  if (process.env.NODE_ENV !== 'test' || !bancoTemporario) {
    throw new Error('O cenario final exige o banco temporario isolado.');
  }
  const marca = 'QA_FINAL_' + Date.now();
  const usuario = (await banco.query(
    "SELECT id,nome,email,perfil FROM usuarios WHERE perfil='administrador' AND ativo=TRUE ORDER BY id LIMIT 1"
  )).rows[0];
  const origem = (await banco.query('SELECT id FROM origens WHERE ativa=TRUE ORDER BY id LIMIT 1')).rows[0];
  const bairro = (await banco.query('SELECT nome FROM bairros WHERE ativo=TRUE ORDER BY id LIMIT 1')).rows[0].nome;
  confirmar(Boolean(usuario && origem && bairro), 'Fixtures administrativas indisponiveis.');

  const evento = (await banco.query(`
    INSERT INTO eventos (
      nome,motivo,data_inicial,data_final,inscricoes_inicio,inscricoes_fim,status,
      criado_por_usuario_id,atualizado_por_usuario_id
    ) VALUES ($1,'QA','2026-01-01','2026-12-31','2026-01-01','2026-12-31','ativo',$2,$2)
    RETURNING id
  `, [marca + ' EVENTO', usuario.id])).rows[0];

  const template = await campanhaService.salvarTemplate(null, {
    nome: marca + ' TEMPLATE IMAGEM', categoria: 'QA', ativo: true,
    metaNome: ('qa_final_imagem_' + Date.now()).toLowerCase(), metaIdioma: 'pt_BR',
    metaCategoria: 'MARKETING', conteudo: 'Ola {{1}}',
    componentes: [
      { type: 'HEADER', format: 'IMAGE', handleExemplo: '4::handle-oficial-falso' },
      { type: 'BODY', text: 'Ola {{1}}', exemplos: ['Pessoa QA'] },
      { type: 'FOOTER', text: 'ACORDA RJ' }
    ],
    configuracaoEnvio: {
      cabecalho: { tipo: 'imagem', origem: 'link', valor: 'https://example.com/acorda-rj-qa.jpg' },
      corpo: [{ origem: 'nome_contato' }],
      botoes: []
    }
  }, usuario);
  await banco.query(`
    UPDATE modelos_mensagem
    SET meta_template_id='9900001', meta_status='aprovado',
      meta_status_oficial='APPROVED', meta_origem='meta',
      meta_componentes=$2::jsonb, meta_configuracao_envio=$3::jsonb,
      texto='Ola {{nome}}'
    WHERE id=$1
  `, [template.id, JSON.stringify([
    { type: 'HEADER', format: 'IMAGE' },
    { type: 'BODY', parameter_format: 'NAMED', text: 'Ola {{nome}}' },
    { type: 'FOOTER', text: 'ACORDA RJ' },
    { type: 'BUTTONS', buttons: [
      { type: 'URL', text: 'Quero Participar!', url: 'https://example.com/participar' },
      { type: 'QUICK_REPLY', text: 'SAIR' }
    ] }
  ]), JSON.stringify({
    cabecalho: { tipo: 'imagem', origem: 'link', valor: 'https://example.com/acorda-rj-qa.jpg' },
    corpo: [{ origem: 'nome_contato' }],
    botoes: [{ indice: 1, subtipo: 'quick_reply', origem: 'opt_out' }]
  })]);

  const contatos = (await banco.query(`
    INSERT INTO contatos (
      nome,telefone,telefone_normalizado,bairro,problema,idade,origem_id,
      consentimento_armazenamento,consentimento_mensagens,status_contato
    ) VALUES
      ($1,'5521988800001','5521988800001',$3,'Saude',30,$4,TRUE,FALSE,'ativo'),
      ($2,'5521988800002','5521988800002',$3,'Saude',31,$4,TRUE,FALSE,'ativo')
    RETURNING id,nome,telefone_normalizado
  `, [marca + ' ANA', marca + ' BRUNO', bairro, origem.id])).rows;
  await banco.query(`
    INSERT INTO contato_eventos (contato_id,evento_id)
    SELECT id,$2 FROM contatos WHERE id=ANY($1::bigint[])
  `, [contatos.map(function (item) { return item.id; }), evento.id]);

  const campanha = await criarCampanha(marca + ' CAMPANHA', template.id, {
    eventoId: evento.id, bairro, problema: 'Saude'
  }, usuario);
  const previa = await campanhaService.visualizarPublico(campanha.id, 2);
  confirmar(previa.publicoEncontrado === 2 && previa.publicoApto === 2 && previa.publicoNaoApto === 0,
    'A previa final deve encontrar exatamente dois contatos aptos.');
  const lote = await campanhaService.criarLote(campanha.id, {
    tamanho: 2, chaveIdempotencia: marca + '-dois'
  }, usuario);
  confirmar(lote.lote.tamanho_efetivo === 2, 'O lote final deve conter exatamente dois contatos.');

  const tentativas = (await banco.query(`
    SELECT tentativa.id,contato.telefone_normalizado
    FROM campanha_tentativas tentativa
    INNER JOIN campanha_participacoes participacao ON participacao.id=tentativa.participacao_id
    INNER JOIN contatos contato ON contato.id=participacao.contato_id
    WHERE participacao.campanha_id=$1 ORDER BY tentativa.id
  `, [campanha.id])).rows;
  confirmar(tentativas.length === 2, 'Cada participacao deve possuir uma tentativa.');

  const payloads = [];
  mensageriaService.definirProviderParaTeste(async function (url, opcoes) {
    const payload = JSON.parse(opcoes.body);
    payloads.push(payload);
    confirmar(url.endsWith('/v99.0/123456789/messages'), 'Endpoint Meta mock divergente.');
    confirmar(payload.template.components[0].type === 'header' &&
      payload.template.components[0].parameters[0].image.link === 'https://example.com/acorda-rj-qa.jpg',
    'HEADER IMAGE nao chegou ao payload final.');
    const cabecalhoPayload = payload.template.components.find(function (item) { return item.type === 'header'; });
    const corpoPayload = payload.template.components.find(function (item) { return item.type === 'body'; });
    const botaoPayload = payload.template.components.find(function (item) { return item.type === 'button'; });
    confirmar(cabecalhoPayload.parameters.length === 1 && corpoPayload.parameters.length === 1 &&
      corpoPayload.parameters[0].parameter_name === 'nome' &&
      botaoPayload.sub_type === 'quick_reply' && botaoPayload.index === '1' &&
      botaoPayload.parameters.length === 1 &&
      botaoPayload.parameters[0].payload === process.env.WHATSAPP_OPTOUT_BUTTON_ID,
    'HEADER, BODY NAMED ou QUICK_REPLY SAIR divergiram no payload final.');
    return {
      ok: true, status: 200,
      json: async function () { return { messages: [{ id: 'wamid.qa.' + payload.to }] }; }
    };
  });
  const envios = await Promise.all(tentativas.map(function (item) {
    return mensageriaService.enviar(item.id);
  }));
  confirmar(envios.length === 2 && payloads.length === 2 &&
    new Set(envios.map(function (item) { return item.identificadorExterno; })).size === 2,
  'Os dois envios mock concorrentes devem produzir IDs externos distintos.');
  const estados = (await banco.query(`
    SELECT tentativa.status AS tentativa_status, participacao.status AS participacao_status,
      (SELECT COUNT(*) FROM historico_status_mensageria historico
       WHERE historico.participacao_id=participacao.id) AS historicos
    FROM campanha_tentativas tentativa
    INNER JOIN campanha_participacoes participacao ON participacao.id=tentativa.participacao_id
    WHERE participacao.campanha_id=$1
  `, [campanha.id])).rows;
  confirmar(estados.every(function (item) {
    return item.tentativa_status === 'enviada' && item.participacao_status === 'enviada' &&
      Number(item.historicos) >= 3;
  }), 'Estado ou historico dos envios nao foi persistido.');

  await mensageriaService.processarWebhook({
    entry: [{ changes: [{ value: { statuses: tentativas.map(function (item) {
      return { id: 'wamid.qa.' + item.telefone_normalizado, status: 'read' };
    }) } }] }]
  });
  const historicoSomenteLeitura = await campanhaService.listarContatosLote(campanha.id, lote.lote.id);
  confirmar(historicoSomenteLeitura.every(function (item) {
    return item.tentativaStatus === 'lida' && item.tentativaStatusEm && !item.acaoContato;
  }), 'Mensagem lida sem opt-out deve permanecer apenas como lida no historico.');

  await banco.query('UPDATE contatos SET bloqueado_para_mensagens=TRUE WHERE id=$1', [contatos[1].id]);
  const historicoContatoBloqueado = await campanhaService.listarContatosLote(campanha.id, lote.lote.id);
  const segundoBloqueado = historicoContatoBloqueado.find(function (item) {
    return item.tentativaId === Number(tentativas[1].id);
  });
  confirmar(segundoBloqueado && !segundoBloqueado.acaoContato,
    'Bloqueio sem evento de clique nao pode ser apresentado como opt-out.');
  await banco.query('UPDATE contatos SET bloqueado_para_mensagens=FALSE WHERE id=$1', [contatos[1].id]);

  const primeiro = tentativas[0];
  const eventoBarreira = (await banco.query(`
    INSERT INTO eventos (
      nome,motivo,data_inicial,data_final,inscricoes_inicio,inscricoes_fim,status,
      criado_por_usuario_id,atualizado_por_usuario_id
    ) VALUES ($1,'QA','2026-01-01','2026-12-31','2026-01-01','2026-12-31','ativo',$2,$2)
    RETURNING id
  `, [marca + ' BARREIRA', usuario.id])).rows[0];
  await banco.query('INSERT INTO contato_eventos (contato_id,evento_id) VALUES ($1,$2)', [contatos[0].id, eventoBarreira.id]);
  const campanhaBarreira = await criarCampanha(marca + ' BARREIRA', template.id, { eventoId: eventoBarreira.id }, usuario);
  await campanhaService.criarLote(campanhaBarreira.id, { tamanho: 1, chaveIdempotencia: marca + '-barreira' }, usuario);
  const tentativaBarreira = (await banco.query(`
    SELECT tentativa.id FROM campanha_tentativas tentativa
    INNER JOIN campanha_participacoes participacao ON participacao.id=tentativa.participacao_id
    WHERE participacao.campanha_id=$1
  `, [campanhaBarreira.id])).rows[0];
  const respostaRapidaComum = await mensageriaService.processarWebhook({
    entry: [{ changes: [{ value: { messages: [{
      id: 'wamid.qa.quick-reply.' + crypto.randomUUID(), from: primeiro.telefone_normalizado,
      context: { id: 'wamid.qa.' + primeiro.telefone_normalizado },
      type: 'button', button: { payload: 'resposta_rapida_comum', text: 'SAIR' }
    }] } }] }]
  });
  const historicosAntesOptOut = (await banco.query(
    "SELECT COUNT(*)::integer total FROM historico_contatos WHERE contato_id=$1 AND tipo_evento='opt_out_whatsapp'",
    [contatos[0].id]
  )).rows[0].total;
  confirmar(respostaRapidaComum[0].processado === true && historicosAntesOptOut === 0,
    'QUICK_REPLY comum nao pode gerar opt-out, mesmo com texto visual SAIR.');

  const identificadorOptOut = 'wamid.qa.optout.' + crypto.randomUUID();
  const optout = await mensageriaService.processarWebhook({
    entry: [{ changes: [{ value: { messages: [{
      id: identificadorOptOut, from: primeiro.telefone_normalizado,
      context: { id: 'wamid.qa.' + primeiro.telefone_normalizado },
      type: 'button', button: { payload: process.env.WHATSAPP_OPTOUT_BUTTON_ID, text: 'ENCERRAR CONTATOS' }
    }] } }] }]
  });
  confirmar(optout[0].processado === true, 'O opt-out do primeiro contato nao foi processado.');
  const detalhe = await contatoService.detalharContato(contatos[0].id);
  const consentimentoMensagens = detalhe.consentimentos.find(function (item) { return item.tipo === 'mensagens'; });
  const consentimentoLigacoes = detalhe.consentimentos.find(function (item) { return item.tipo === 'ligacoes'; });
  const historicoOptOut = detalhe.historico.find(function (item) { return item.tipoEvento === 'opt_out_whatsapp'; });
  confirmar(detalhe.contato.bloqueadoParaMensagens === true && detalhe.contato.bloqueadoParaLigacoes === true &&
    detalhe.contato.autorizacaoMensagens === 'revogado' && detalhe.contato.autorizacaoLigacoes === 'revogado' &&
    consentimentoMensagens.estado === 'revogado' && consentimentoLigacoes.estado === 'revogado' &&
    consentimentoMensagens.canal === 'whatsapp' && consentimentoLigacoes.canal === 'whatsapp' &&
    historicoOptOut && historicoOptOut.dadosNovos.origem === 'WhatsApp/Meta',
  'O painel nao receberia o bloqueio global e as duas revogacoes: ' + JSON.stringify({
    contato: detalhe.contato, mensagens: consentimentoMensagens, ligacoes: consentimentoLigacoes
  }));
  const historicoComOptOut = await campanhaService.listarContatosLote(campanha.id, lote.lote.id);
  const primeiroComOptOut = historicoComOptOut.find(function (item) {
    return item.tentativaId === Number(primeiro.id);
  });
  const segundoSemOptOut = historicoComOptOut.find(function (item) {
    return item.tentativaId === Number(tentativas[1].id);
  });
  confirmar(primeiroComOptOut && primeiroComOptOut.tentativaStatus === 'lida' &&
    primeiroComOptOut.tentativaStatusEm && primeiroComOptOut.acaoContato === 'opt_out' &&
    primeiroComOptOut.acaoContatoEm && segundoSemOptOut && !segundoSemOptOut.acaoContato,
  'A leitura deve ser preservada e o opt-out real exibido como acao separada apenas no contato correto.');
  const chamadasAntesBarreira = payloads.length;
  let erroBarreira;
  try { await mensageriaService.enviar(tentativaBarreira.id); } catch (erro) { erroBarreira = erro; }
  confirmar(erroBarreira && erroBarreira.statusHttp === 409 && payloads.length === chamadasAntesBarreira,
    'A barreira imediatamente anterior ao provider nao bloqueou o contato apos SAIR.');
  const repeticao = await mensageriaService.processarWebhook({
    entry: [{ changes: [{ value: { messages: [{
      id: identificadorOptOut, from: primeiro.telefone_normalizado,
      type: 'button', button: { payload: process.env.WHATSAPP_OPTOUT_BUTTON_ID, text: 'ENCERRAR CONTATOS' }
    }] } }] }]
  });
  const quantidadeHistoricosOptOut = (await banco.query(
    "SELECT COUNT(*)::integer total FROM historico_contatos WHERE contato_id=$1 AND tipo_evento='opt_out_whatsapp'",
    [contatos[0].id]
  )).rows[0].total;
  confirmar(repeticao[0].motivo === 'evento_repetido' && quantidadeHistoricosOptOut === 1,
    'O webhook repetido duplicou o historico do SAIR.');

  const campanhaPosterior = await criarCampanha(marca + ' POS OPTOUT', template.id, {
    eventoId: evento.id, bairro, problema: 'Saude'
  }, usuario);
  const previaPosterior = await campanhaService.visualizarPublico(campanhaPosterior.id, 2);
  confirmar(previaPosterior.publicoEncontrado === 2 && previaPosterior.publicoApto === 1 &&
    previaPosterior.publicoNaoApto === 1 && previaPosterior.quantidadeEfetiva === 1,
  'O opt-out deve retirar somente o primeiro contato do publico apto posterior.');
  const lotePosterior = await campanhaService.criarLote(campanhaPosterior.id, {
    tamanho: 2, chaveIdempotencia: marca + '-posterior'
  }, usuario);
  const reservadoPosterior = (await banco.query(`
    SELECT contato_id FROM campanha_participacoes WHERE campanha_id=$1
  `, [campanhaPosterior.id])).rows;
  confirmar(lotePosterior.lote.tamanho_efetivo === 1 &&
    reservadoPosterior[0].contato_id === contatos[1].id,
  'A nova reserva deve manter o segundo contato e excluir o contato em opt-out.');

  console.log('Cenario E2E final de 2 contatos: ' + verificacoes + ' verificacoes aprovadas.');
}

executar().catch(function (erro) {
  console.error(erro.stack || erro.message);
  process.exitCode = 1;
}).finally(async function () {
  mensageriaService.definirProviderParaTeste();
  await banco.end();
});
