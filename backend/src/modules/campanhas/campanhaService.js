const crypto = require('crypto');
const criarAppError = require('../../utils/AppError');
const contatoService = require('../contatos/contatoService');
const campanhaModel = require('./campanhaModel');
const limiteMetaService = require('./limiteMetaService');
const templateMetaService = require('./templateMetaService');

let obterAgora = function () { return new Date(); };

function validarId(valor, nome) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id < 1) throw criarAppError(nome + ' invalido.', 400);
  return id;
}

function validarTexto(valor, nome, maximo) {
  const texto = typeof valor === 'string' ? valor.trim() : '';
  if (texto.length < 2 || texto.length > maximo) throw criarAppError(nome + ' invalido.', 400);
  return texto;
}

function prepararDados(dados) {
  const modeloId = validarId(dados.modeloId, 'Template');
  const filtros = contatoService.prepararFiltros(dados.filtros || {});
  return {
    nome: validarTexto(dados.nome, 'Nome', 150),
    finalidade: validarTexto(dados.finalidade, 'Finalidade', 2000),
    modeloId,
    filtros
  };
}

function validarQuantidadePrevia(valor, padrao) {
  const quantidade = valor === undefined || valor === null || valor === '' ? padrao : Number(valor);
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 10000) {
    throw criarAppError('Quantidade da previa invalida.', 400);
  }
  return quantidade;
}

function apresentarContatos(contatos) {
  return contatos.map(function (contato) {
    return {
      nome: contato.nome || 'Nao informado',
      telefoneMascarado: contato.telefone_mascarado,
      bairro: contato.bairro || 'Nao informado',
      problema: contato.problema || 'Nao informado',
      status: contato.status || undefined,
      tentativaId: contato.tentativa_id ? Number(contato.tentativa_id) : undefined,
      tentativaStatus: contato.tentativa_status || undefined,
      tentativaStatusEm: contato.tentativa_status_em || undefined,
      acaoContato: contato.acao_contato || undefined,
      acaoContatoEm: contato.acao_contato_em || undefined
    };
  });
}

async function listar(incluirArquivadas) {
  const capacidade = await campanhaModel.obterCapacidade(obterAgora());
  const campanhas = await campanhaModel.listar(incluirArquivadas === true);
  return campanhas.map(function (campanha) {
    return Object.assign({}, campanha, {
      restante: Number(campanha.pendente || 0) + Number(campanha.enviando || 0),
      capacidadeDisponivel: capacidade.disponivel
    });
  });
}

async function excluirOuArquivar(idRecebido, usuario) {
  const id = validarId(idRecebido, 'Campanha');
  const resultado = await campanhaModel.excluirOuArquivar(id, usuario.id);
  if (!resultado) throw criarAppError('Campanha nao encontrada.', 404);
  return resultado;
}

async function criar(dados, usuario) {
  try {
    return await campanhaModel.criar(prepararDados(dados || {}), usuario.id);
  } catch (erro) {
    if (erro.codigo === 'TEMPLATE_INVALIDO' || erro.codigo === 'USUARIO_INVALIDO') {
      throw criarAppError(erro.message, 409);
    }

    if (erro.code === '23503') {
      throw criarAppError('O template ou o responsável selecionado não está mais disponível.', 409);
    }

    throw erro;
  }
}

async function atualizar(idRecebido, dados, usuario) {
  const id = validarId(idRecebido, 'Campanha');
  const campanha = await campanhaModel.atualizar(id, prepararDados(dados || {}), usuario.id);
  if (!campanha) throw criarAppError('Campanha nao encontrada ou segmentacao bloqueada por reservas existentes.', 409);
  return campanha;
}

async function alterarStatus(idRecebido, status, usuario) {
  const id = validarId(idRecebido, 'Campanha');
  const permitidos = ['pronta','ativa','pausada','concluida','cancelada'];
  if (!permitidos.includes(status)) throw criarAppError('Status de campanha invalido.', 400);
  const campanha = await campanhaModel.buscarPorId(id);
  if (!campanha) throw criarAppError('Campanha nao encontrada.', 404);
  if (campanha.arquivada_em) throw criarAppError('Campanha arquivada nao pode ser alterada.', 409);
  const transicoes = {
    rascunho: ['pronta','cancelada'], pronta: ['ativa','cancelada'],
    ativa: ['pausada','concluida','cancelada'], pausada: ['ativa','concluida','cancelada'],
    concluida: [], cancelada: []
  };
  if (!transicoes[campanha.status].includes(status)) throw criarAppError('Transicao de campanha invalida.', 409);
  return campanhaModel.alterarStatus(id, status, usuario.id);
}

async function visualizarPublico(idRecebido, quantidadeRecebida) {
  const id = validarId(idRecebido, 'Campanha');
  const quantidade = validarQuantidadePrevia(quantidadeRecebida, 250);
  const campanha = await campanhaModel.buscarPorId(id);
  if (!campanha) throw criarAppError('Campanha nao encontrada.', 404);
  const resultados = await Promise.all([
    campanhaModel.contarPublico(campanha.filtros_snapshot, false),
    campanhaModel.contarPublico(campanha.filtros_snapshot, true),
    campanhaModel.obterCapacidade(obterAgora()),
    campanhaModel.contarDisponiveis(campanha.filtros_snapshot, id),
    campanhaModel.listarTentativasPendentesCampanha(id, 10000, null),
    campanhaModel.contarJaReceberam(campanha.filtros_snapshot, id)
  ]);
  const agora = obterAgora();
  const inicioJanela = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
  const pendentesNaJanela = resultados[4].filter(function (tentativa) {
    return new Date(tentativa.reservado_em) >= inicioJanela;
  }).length;
  const pendentesForaDaJanela = resultados[4].length - pendentesNaJanela;
  const pendentesPossiveisAgora = pendentesNaJanela + Math.min(
    resultados[2].disponivel,
    pendentesForaDaJanela
  );
  const podeEnviarAgora = resultados[4].length > 0
    ? pendentesPossiveisAgora
    : Math.min(resultados[2].disponivel, resultados[3]);
  const quantidadeEfetiva = Math.min(quantidade, podeEnviarAgora);
  const limiteLista = Math.min(quantidadeEfetiva, 1000);
  const contatos = limiteLista > 0
    ? await campanhaModel.listarCandidatos(campanha.filtros_snapshot, id, limiteLista)
    : [];
  return {
    publicoEncontrado: resultados[0], publicoApto: resultados[1],
    publicoNaoApto: resultados[0] - resultados[1], capacidade: resultados[2],
    jaReceberam: resultados[5],
    aptosProximoEnvio: resultados[3],
    naoAptosProximoEnvio: Math.max(0, resultados[0] - resultados[5] - resultados[3]),
    restantes: resultados[3] + resultados[4].length,
    novosRestantes: resultados[3], pendentesEnvio: resultados[4].length,
    podeEnviarAgora, quantidadeSolicitada: quantidade,
    quantidadeEfetiva, contatos: apresentarContatos(contatos),
    listaLimitada: quantidadeEfetiva > limiteLista
  };
}

async function visualizarPreviaFiltros(dados) {
  const filtros = contatoService.prepararFiltros(dados && dados.filtros || {});
  const quantidade = validarQuantidadePrevia(dados && dados.quantidade, 20);
  const resultados = await Promise.all([
    campanhaModel.contarPublico(filtros, false),
    campanhaModel.contarPublico(filtros, true),
    campanhaModel.listarCandidatos(filtros, null, Math.min(quantidade, 100))
  ]);
  return {
    publicoEncontrado: resultados[0],
    publicoApto: resultados[1],
    publicoNaoApto: resultados[0] - resultados[1],
    contatos: apresentarContatos(resultados[2]),
    listaLimitada: resultados[1] > resultados[2].length
  };
}

async function criarLote(campanhaIdRecebido, dados, usuario, opcoes) {
  const campanhaId = validarId(campanhaIdRecebido, 'Campanha');
  const tamanho = Number(dados.tamanho);
  if (!Number.isInteger(tamanho) || tamanho < 1 || tamanho > 10000) throw criarAppError('Tamanho do lote invalido.', 400);
  const chave = typeof dados.chaveIdempotencia === 'string' && dados.chaveIdempotencia.trim()
    ? dados.chaveIdempotencia.trim().slice(0, 100)
    : crypto.randomUUID();
  try {
    return await campanhaModel.criarLoteAtomico(
      campanhaId,
      tamanho,
      chave,
      usuario.id,
      obterAgora(),
      opcoes && opcoes.exigirQuantidadeIntegral === true
    );
  } catch (erro) {
    if (erro.codigo === 'CAPACIDADE_INSUFICIENTE') {
      const appError = criarAppError('Capacidade insuficiente. Disponivel nas ultimas 24 horas: ' + erro.capacidade + '.', 409);
      appError.capacidade = erro.capacidade;
      appError.limite = erro.limite;
      appError.utilizado = erro.utilizado;
      throw appError;
    }
    if (erro.codigo === 'PUBLICO_INSUFICIENTE') {
      const appError = criarAppError(erro.message, 409);
      appError.disponivel = erro.disponivel;
      throw appError;
    }
    if (erro.codigo === 'CAMPANHA_INDISPONIVEL' || erro.codigo === 'SEM_CONTATOS') throw criarAppError(erro.message, 409);
    throw erro;
  }
}

function ordenarTentativasParaEnvio(tentativas, agora) {
  const inicioJanela = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
  return tentativas.slice().sort(function (a, b) {
    const aNaJanela = new Date(a.reservado_em) >= inicioJanela;
    const bNaJanela = new Date(b.reservado_em) >= inicioJanela;
    if (aNaJanela !== bNaJanela) return aNaJanela ? -1 : 1;
    return Number(a.id) - Number(b.id);
  });
}

async function prepararEnvio(idRecebido, dados, usuario) {
  const campanhaId = validarId(idRecebido, 'Campanha');
  const tamanho = Number(dados && dados.quantidade);
  if (!Number.isInteger(tamanho) || tamanho < 1 || tamanho > 10000) {
    throw criarAppError('Quantidade de envio invalida.', 400);
  }
  const chave = typeof dados.chaveIdempotencia === 'string' && dados.chaveIdempotencia.trim()
    ? dados.chaveIdempotencia.trim().slice(0, 100)
    : crypto.randomUUID();
  const campanha = await campanhaModel.buscarPorId(campanhaId);
  if (!campanha) throw criarAppError('Campanha nao encontrada.', 404);
  if (!['pronta', 'ativa'].includes(campanha.status)) {
    throw criarAppError('A campanha nao esta disponivel para novos envios.', 409);
  }
  if (campanha.modelo_meta_status_oficial !== 'APPROVED') {
    throw criarAppError('A mensagem precisa estar aprovada pela Meta antes do envio.', 409);
  }

  const agora = obterAgora();
  const pendentes = ordenarTentativasParaEnvio(
    await campanhaModel.listarTentativasPendentesCampanha(campanhaId, 10000, null),
    agora
  );
  if (pendentes.length > 0) {
    const capacidade = await campanhaModel.obterCapacidade(agora);
    const inicioJanela = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
    const naJanela = pendentes.filter(function (tentativa) {
      return new Date(tentativa.reservado_em) >= inicioJanela;
    });
    const foraDaJanela = pendentes.filter(function (tentativa) {
      return new Date(tentativa.reservado_em) < inicioJanela;
    }).slice(0, capacidade.disponivel);
    const disponiveis = naJanela.concat(foraDaJanela);
    if (tamanho > disponiveis.length) {
      throw criarAppError('A quantidade solicitada ultrapassa o que pode ser enviado agora.', 409);
    }
    return {
      retomado: true,
      repetido: false,
      lote: null,
      tentativas: disponiveis.slice(0, tamanho).map(function (tentativa) { return Number(tentativa.id); })
    };
  }

  const previa = await visualizarPublico(campanhaId, 10000);
  if (tamanho > previa.podeEnviarAgora) {
    throw criarAppError('A quantidade solicitada ultrapassa o que pode ser enviado agora.', 409);
  }
  const reserva = await criarLote(
    campanhaId,
    { tamanho, chaveIdempotencia: chave },
    usuario,
    { exigirQuantidadeIntegral: true }
  );
  const tentativas = await campanhaModel.listarTentativasPendentesCampanha(
    campanhaId,
    tamanho,
    reserva.lote.id
  );
  return {
    retomado: false,
    repetido: reserva.repetido,
    lote: reserva.lote,
    tentativas: tentativas.map(function (tentativa) { return Number(tentativa.id); })
  };
}

async function listarLotes(idRecebido) {
  return campanhaModel.listarLotes(validarId(idRecebido, 'Campanha'));
}

async function listarContatosLote(campanhaIdRecebido, loteIdRecebido) {
  const campanhaId = validarId(campanhaIdRecebido, 'Campanha');
  const loteId = validarId(loteIdRecebido, 'Lote');
  return apresentarContatos(await campanhaModel.listarContatosLote(campanhaId, loteId));
}

async function listarFalhas(idRecebido) {
  return campanhaModel.listarFalhas(validarId(idRecebido, 'Campanha'));
}

async function obterLimite() {
  return campanhaModel.obterCapacidade(obterAgora());
}

async function atualizarLimite(dados, usuario) {
  const valor = Number(dados.valor);
  const motivo = validarTexto(dados.motivo, 'Motivo', 1000);
  if (!Number.isInteger(valor) || valor < 1 || valor > 100000) throw criarAppError('Limite invalido.', 400);
  await campanhaModel.atualizarLimite(valor, motivo, usuario.id);
  return obterLimite();
}

async function sincronizarLimiteMeta(usuario) {
  return limiteMetaService.sincronizarPorApi(usuario);
}

async function listarTemplates() { return campanhaModel.listarTemplates(); }

async function excluirTemplate(idRecebido, usuario) {
  const id = validarId(idRecebido, 'Modelo');
  let template;
  try {
    template = await campanhaModel.excluirTemplate(id, usuario.id);
  } catch (erro) {
    if (erro.codigo === 'TEMPLATE_EXCLUSAO_PROTEGIDA') throw criarAppError(erro.message, 409);
    throw erro;
  }
  if (!template) throw criarAppError('Modelo não encontrado.', 404);
  return template;
}

async function salvarTemplate(idRecebido, dados, usuario) {
  const id = idRecebido ? validarId(idRecebido, 'Template') : null;
  let template;
  try { template = await templateMetaService.salvarRascunho(id, dados, usuario); }
  catch (erro) { if (erro.codigo === 'TEMPLATE_JA_SUBMETIDO') throw criarAppError(erro.message, 409); throw erro; }
  if (!template) throw criarAppError('Template nao encontrado.', 404);
  return template;
}

async function submeterTemplate(id, usuario) { return templateMetaService.submeter(id, usuario); }
async function sincronizarTemplatesMeta(usuario) { return templateMetaService.sincronizar(usuario); }
async function configurarEnvioTemplate(id, dados, usuario) { return templateMetaService.configurarEnvio(id, dados, usuario); }
async function prepararImagemTemplate(arquivo) { return templateMetaService.prepararImagem(arquivo); }
async function prepararImagemEnvioTemplate(arquivo) { return templateMetaService.prepararImagemEnvio(arquivo); }

function definirRelogioParaTeste(funcao) {
  obterAgora = funcao || function () { return new Date(); };
}

module.exports = {
  alterarStatus, atualizar, atualizarLimite, configurarEnvioTemplate, criar, criarLote,
  excluirOuArquivar, excluirTemplate,
  definirRelogioParaTeste, listar, listarContatosLote, listarFalhas, listarLotes,
  listarTemplates, obterLimite, prepararImagemEnvioTemplate, prepararImagemTemplate, salvarTemplate, sincronizarLimiteMeta, visualizarPreviaFiltros,
  prepararEnvio, visualizarPublico, submeterTemplate, sincronizarTemplatesMeta
};
