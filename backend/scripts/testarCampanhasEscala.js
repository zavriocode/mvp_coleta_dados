require('dotenv').config({ quiet: true });

const crypto = require('crypto');
const banco = require('../src/config/banco');
const campanhaService = require('../src/modules/campanhas/campanhaService');

let verificacoes = 0;

function confirmar(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
  verificacoes += 1;
}

async function criarCampanha(nome, templateId, filtros, usuario) {
  const campanha = await campanhaService.criar({
    nome,
    finalidade: 'Validacao isolada de escala, filtros e concorrencia.',
    modeloId: templateId,
    filtros
  }, usuario);
  return campanhaService.alterarStatus(campanha.id, 'pronta', usuario);
}

async function executar() {
  const nomeBanco = String(process.env.DATABASE_URL || '').match(/\/([^/?]+)(?:\?|$)/);
  if (process.env.NODE_ENV !== 'test' || !nomeBanco || !nomeBanco[1].startsWith('acorda_rj_campanhas_qa_')) {
    throw new Error('Este teste so pode executar no banco temporario isolado de campanhas.');
  }

  const marca = 'QA_ESCALA_' + Date.now();
  const agoraInicial = new Date('2026-01-01T12:00:00.000Z');
  const usuario = (await banco.query(
    "SELECT id,nome,email,perfil FROM usuarios WHERE perfil='administrador' AND ativo=TRUE ORDER BY id LIMIT 1"
  )).rows[0];
  confirmar(Boolean(usuario), 'Administrador QA nao encontrado.');

  const bairros = (await banco.query(
    'SELECT nome FROM bairros WHERE ativo=TRUE ORDER BY id LIMIT 2'
  )).rows;
  const origens = (await banco.query(
    'SELECT id,nome FROM origens WHERE ativa=TRUE ORDER BY id LIMIT 2'
  )).rows;
  confirmar(bairros.length === 2 && origens.length === 2, 'Catalogos insuficientes para o teste.');

  const eventos = (await banco.query(`
    INSERT INTO eventos (
      nome, motivo, data_inicial, data_final, inscricoes_inicio, inscricoes_fim,
      status, criado_por_usuario_id, atualizado_por_usuario_id
    ) VALUES
      ($1, 'QA', '2026-01-01', '2026-12-31', '2026-01-01', '2026-12-31', 'ativo', $3, $3),
      ($2, 'QA', '2026-01-01', '2026-12-31', '2026-01-01', '2026-12-31', 'ativo', $3, $3)
    RETURNING id
  `, [marca + ' EVENTO A', marca + ' EVENTO B', usuario.id])).rows;

  const nomes = [];
  const telefones = [];
  const bairrosContatos = [];
  const problemas = [];
  const origemIds = [];
  const idades = [];
  let indice;
  for (indice = 0; indice < 10000; indice += 1) {
    nomes.push(marca + ' CONTATO ' + String(indice).padStart(5, '0'));
    telefones.push('5521' + String(700000000 + indice));
    bairrosContatos.push(indice < 5000 ? bairros[0].nome : bairros[1].nome);
    problemas.push(indice % 2 === 0 ? 'Saude' : 'Iluminacao publica');
    origemIds.push(indice < 7000 ? origens[0].id : origens[1].id);
    idades.push(16 + (indice % 65));
  }

  const contatos = (await banco.query(`
    INSERT INTO contatos (
      nome, telefone, telefone_normalizado, bairro, problema, idade, origem_id,
      consentimento_armazenamento, consentimento_mensagens, status_contato
    )
    SELECT nome, telefone, telefone, bairro, problema, idade, origem_id,
      TRUE, FALSE, 'ativo'
    FROM UNNEST(
      $1::text[], $2::text[], $3::text[], $4::text[], $5::smallint[], $6::bigint[]
    ) AS dados(nome, telefone, bairro, problema, idade, origem_id)
    RETURNING id
  `, [nomes, telefones, bairrosContatos, problemas, idades, origemIds])).rows;
  confirmar(contatos.length === 10000, 'A carga deve conter 10.000 contatos elegiveis.');

  await banco.query(`
    INSERT INTO consentimentos (
      contato_id, contato_id_original, tipo, resposta, texto_apresentado,
      versao_texto, canal, origem_registro, ativo, estado, origem_id
    )
    SELECT id, id, 'mensagens', TRUE, 'QA autorizado', 'qa_v1',
      'cadastro_manual', 'resposta_expressa', TRUE, 'autorizado', origem_id
    FROM contatos WHERE id = ANY($1::bigint[])
  `, [contatos.slice(0, 1000).map(function (item) { return item.id; })]);

  await banco.query(`
    INSERT INTO contato_eventos (contato_id, evento_id)
    SELECT id, $2 FROM contatos WHERE id = ANY($1::bigint[])
  `, [contatos.slice(0, 3000).map(function (item) { return item.id; }), eventos[0].id]);
  await banco.query(`
    INSERT INTO contato_eventos (contato_id, evento_id)
    SELECT id, $2 FROM contatos WHERE id = ANY($1::bigint[])
  `, [contatos.slice(2000, 5000).map(function (item) { return item.id; }), eventos[1].id]);

  const impedidos = (await banco.query(`
    INSERT INTO contatos (
      nome, telefone, telefone_normalizado, bairro, problema, idade, origem_id,
      consentimento_armazenamento, consentimento_mensagens, status_contato,
      bloqueado_para_mensagens
    ) VALUES
      ($1 || ' RECUSADO', '5521999900001', '5521999900001', $2, 'Saude', 50, $3, TRUE, FALSE, 'ativo', FALSE),
      ($1 || ' REVOGADO', '5521999900002', '5521999900002', $2, 'Saude', 50, $3, TRUE, FALSE, 'ativo', TRUE),
      ($1 || ' BLOQUEADO', '5521999900003', '5521999900003', $2, 'Saude', 50, $3, TRUE, FALSE, 'ativo', TRUE),
      ($1 || ' EXCLUSAO', '5521999900004', '5521999900004', $2, 'Saude', 50, $3, TRUE, FALSE, 'ativo', FALSE),
      ($1 || ' OPTOUT', '5521999900005', '5521999900005', $2, 'Saude', 50, $3, TRUE, FALSE, 'ativo', TRUE)
    RETURNING id, nome, origem_id
  `, [marca, bairros[1].nome, origens[1].id])).rows;

  await banco.query(`
    INSERT INTO consentimentos (
      contato_id, contato_id_original, tipo, resposta, texto_apresentado,
      versao_texto, canal, origem_registro, ativo, estado, origem_id, revogado_em
    ) VALUES
      ($1, $1, 'mensagens', FALSE, 'QA recusado', 'qa_v1', 'cadastro_manual', 'resposta_expressa', TRUE, 'recusado', $3, NULL),
      ($2, $2, 'mensagens', FALSE, 'QA revogado', 'qa_v1', 'whatsapp', 'revogacao', FALSE, 'revogado', $3, CURRENT_TIMESTAMP)
  `, [impedidos[0].id, impedidos[1].id, origens[1].id]);
  await banco.query(`
    INSERT INTO solicitacoes_exclusao (
      contato_id, contato_id_original, solicitada_em, status, solicitada_por_usuario_id
    ) VALUES ($1, $1, CURRENT_TIMESTAMP, 'pendente', $2)
  `, [impedidos[3].id, usuario.id]);

  const template = await campanhaService.salvarTemplate(null, {
    nome: marca + ' TEMPLATE', categoria: 'QA', conteudo: 'Ola {{1}}', ativo: true,
    metaNome: ('qa_escala_' + Date.now()).toLowerCase(), metaIdioma: 'pt_BR',
    metaCategoria: 'MARKETING',
    componentes: [{ type: 'BODY', text: 'Ola {{1}}', exemplos: ['Pessoa QA'] }],
    configuracaoEnvio: { corpo: [{ origem: 'nome_contato' }], botoes: [] }
  }, usuario);

  await campanhaService.atualizarLimite({ valor: 2000, motivo: marca }, usuario);

  async function validarPrevia(filtros, esperadoEncontrado, esperadoApto, descricao) {
    const previa = await campanhaService.visualizarPreviaFiltros({ filtros, quantidade: 20 });
    confirmar(
      previa.publicoEncontrado === esperadoEncontrado &&
      previa.publicoApto === esperadoApto &&
      previa.publicoNaoApto === esperadoEncontrado - esperadoApto,
      'Filtro inconsistente: ' + descricao + '. Recebido: ' + JSON.stringify(previa)
    );
    return previa;
  }

  await validarPrevia({ nome: marca }, 10005, 10000, 'universo total');
  await validarPrevia({ nome: marca, bairro: bairros[0].nome }, 5000, 5000, 'bairro');
  await validarPrevia({ nome: marca, problema: 'Iluminacao publica' }, 5000, 5000, 'problema');
  await validarPrevia({ nome: marca, origem: origens[0].nome }, 7000, 7000, 'origem');
  await validarPrevia({ nome: marca, autorizacaoMensagens: 'autorizado' }, 1000, 1000, 'consentimento autorizado');
  await validarPrevia({ nome: marca, autorizacaoMensagens: 'recusado' }, 1, 0, 'consentimento recusado');
  await validarPrevia({ nome: marca, eventoId: eventos[0].id }, 3000, 3000, 'evento A');
  await validarPrevia({ nome: marca, eventoId: eventos[1].id }, 3000, 3000, 'evento B');
  await validarPrevia({ nome: marca, eventoId: 'sem_evento' }, 5005, 5000, 'sem evento');
  const principal = await criarCampanha(marca + ' PRINCIPAL', template.id, { nome: marca }, usuario);
  const previaLote = await campanhaService.visualizarPublico(principal.id, 5000);
  confirmar(previaLote.publicoEncontrado === 10005 && previaLote.publicoApto === 10000,
    'A previa da campanha deve manter os totais integrais.');
  confirmar(previaLote.quantidadeEfetiva === 2000 && previaLote.contatos.length === 1000 && previaLote.listaLimitada,
    'O limite visual nao pode alterar a quantidade efetiva do lote.');

  campanhaService.definirRelogioParaTeste(function () { return agoraInicial; });
  let excesso;
  try {
    await campanhaService.criarLote(principal.id, {
      tamanho: 2001, chaveIdempotencia: marca + '-excesso'
    }, usuario);
  } catch (erro) { excesso = erro; }
  confirmar(excesso && excesso.statusHttp === 409 && excesso.capacidade === 2000,
    'Pedido acima da capacidade deve ser bloqueado integralmente.');
  confirmar(Number((await banco.query(
    'SELECT COUNT(*) total FROM campanha_participacoes WHERE campanha_id=$1', [principal.id]
  )).rows[0].total) === 0, 'Pedido bloqueado nao pode criar participacao parcial.');

  const lotes = [];
  for (indice = 0; indice < 5; indice += 1) {
    const instante = new Date(agoraInicial.getTime() + indice * 25 * 60 * 60 * 1000);
    campanhaService.definirRelogioParaTeste(function () { return instante; });
    lotes.push(await campanhaService.criarLote(principal.id, {
      tamanho: 2000, chaveIdempotencia: marca + '-lote-' + indice
    }, usuario));
  }
  confirmar(lotes.every(function (item) { return item.lote.tamanho_efetivo === 2000; }),
    'Os cinco lotes sucessivos devem possuir 2.000 contatos.');
  const unicos = (await banco.query(`
    SELECT COUNT(*)::integer total, COUNT(DISTINCT contato_id)::integer unicos
    FROM campanha_participacoes WHERE campanha_id=$1
  `, [principal.id])).rows[0];
  confirmar(unicos.total === 10000 && unicos.unicos === 10000,
    'A campanha deve avancar por 10.000 contatos sem duplicidade.');
  const impeditivosReservados = Number((await banco.query(`
    SELECT COUNT(*) total FROM campanha_participacoes
    WHERE campanha_id=$1 AND contato_id=ANY($2::bigint[])
  `, [principal.id, impedidos.map(function (item) { return item.id; })])).rows[0].total);
  confirmar(impeditivosReservados === 0, 'Contatos impedidos nao podem entrar em lotes.');

  const instanteConcorrencia = new Date(agoraInicial.getTime() + 150 * 60 * 60 * 1000);
  campanhaService.definirRelogioParaTeste(function () { return instanteConcorrencia; });
  const dupla = await criarCampanha(marca + ' DUPLO', template.id, { nome: marca }, usuario);
  const cliqueDuplo = await Promise.all([
    campanhaService.criarLote(dupla.id, { tamanho: 100, chaveIdempotencia: marca + '-duplo' }, usuario),
    campanhaService.criarLote(dupla.id, { tamanho: 100, chaveIdempotencia: marca + '-duplo' }, usuario)
  ]);
  confirmar(cliqueDuplo[0].lote.id === cliqueDuplo[1].lote.id,
    'Clique duplo deve reutilizar o mesmo lote idempotente.');

  const campanhaA = await criarCampanha(marca + ' CONCORRENTE A', template.id, { nome: marca }, usuario);
  const campanhaB = await criarCampanha(marca + ' CONCORRENTE B', template.id, { nome: marca }, usuario);
  const disputa = await Promise.allSettled([
    campanhaService.criarLote(campanhaA.id, { tamanho: 1200, chaveIdempotencia: marca + '-a' }, usuario),
    campanhaService.criarLote(campanhaB.id, { tamanho: 1200, chaveIdempotencia: marca + '-b' }, usuario)
  ]);
  confirmar(disputa.filter(function (item) { return item.status === 'fulfilled'; }).length === 1,
    'Somente uma reserva concorrente de 1.200 pode vencer apos o lote de 100.');
  confirmar(disputa.filter(function (item) {
    return item.status === 'rejected' && item.reason.statusHttp === 409;
  }).length === 1, 'A segunda reserva concorrente deve falhar por capacidade.');
  const capacidade = await campanhaService.obterLimite();
  confirmar(capacidade.utilizado === 1300 && capacidade.disponivel === 700,
    'A concorrencia deve preservar capacidade global 2.000.');

  const campanhaDiferente = disputa.find(function (item) { return item.status === 'fulfilled'; }).value;
  const intersecao = Number((await banco.query(`
    SELECT COUNT(*) total
    FROM campanha_participacoes principal
    INNER JOIN campanha_participacoes outra ON outra.contato_id=principal.contato_id
    WHERE principal.campanha_id=$1 AND outra.campanha_id=$2
  `, [principal.id, campanhaDiferente.lote.campanha_id])).rows[0].total);
  confirmar(intersecao === 1200, 'Contatos elegiveis podem participar de campanha diferente.');

  console.log('Escala, filtros e lotes: ' + verificacoes + ' verificacoes aprovadas.');
}

executar().catch(function (erro) {
  console.error(erro.stack || erro.message);
  process.exitCode = 1;
}).finally(async function () {
  campanhaService.definirRelogioParaTeste(null);
  await banco.end();
});
