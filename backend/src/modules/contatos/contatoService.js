const contatoModel = require('./contatoModel');
const solicitacaoExclusaoService = require('../exclusoes/solicitacaoExclusaoService');
const criarAppError = require('../../utils/AppError');
const normalizarTelefone = require('../../utils/normalizarTelefone');
const formatarTelefone = require('../../utils/formatarTelefone');
const categoriasProblema = require('../../config/categoriasProblema');
const textoFormularioModel = require('./textoFormularioModel');
const bairroService = require('../bairros/bairroService');
const eventoModel = require('../eventos/eventoModel');

function validarCampoTexto(valor, nomeCampo, tamanhoMinimo, tamanhoMaximo) {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw criarAppError(nomeCampo + ' é obrigatório.', 400);
  }

  const textoTratado = valor.trim();

  if (textoTratado.length < tamanhoMinimo) {
    throw criarAppError(
      nomeCampo + ' deve ter pelo menos ' + tamanhoMinimo + ' caracteres.',
      400
    );
  }

  if (textoTratado.length > tamanhoMaximo) {
    throw criarAppError(
      nomeCampo + ' deve ter no máximo ' + tamanhoMaximo + ' caracteres.',
      400
    );
  }

  return textoTratado;
}

function obterPrimeiroCampoInformado(dadosRecebidos, nomesCampos) {
  let indice;

  for (indice = 0; indice < nomesCampos.length; indice += 1) {
    if (Object.prototype.hasOwnProperty.call(dadosRecebidos, nomesCampos[indice])) {
      return dadosRecebidos[nomesCampos[indice]];
    }
  }

  return undefined;
}

function validarBooleano(valor, nomeCampo, obrigatorio) {
  if (valor === undefined) {
    if (obrigatorio) {
      throw criarAppError(nomeCampo + ' é obrigatório.', 400);
    }

    return false;
  }

  if (typeof valor !== 'boolean') {
    throw criarAppError(nomeCampo + ' deve ser verdadeiro ou falso.', 400);
  }

  return valor;
}

function validarIdade(valor) {
  if (!Number.isInteger(valor) || valor < 0 || valor > 32767) {
    throw criarAppError('Informe uma idade inteira válida.', 400);
  }

  return valor;
}

function validarEventoExibido(dadosRecebidos) {
  if (!Object.prototype.hasOwnProperty.call(dadosRecebidos, 'eventoIdExibido')) {
    return undefined;
  }

  if (dadosRecebidos.eventoIdExibido === null || dadosRecebidos.eventoIdExibido === '') {
    return null;
  }

  const eventoId = Number(dadosRecebidos.eventoIdExibido);

  if (!Number.isInteger(eventoId) || eventoId < 1) {
    throw criarAppError('O evento exibido no formulário é inválido.', 400);
  }

  return eventoId;
}

function validarCampoOpcional(valor, nomeCampo, tamanhoMaximo) {
  if (valor === undefined || valor === null || valor === '') {
    return null;
  }

  if (typeof valor !== 'string') {
    throw criarAppError(nomeCampo + ' é inválido.', 400);
  }

  const textoTratado = valor.trim();

  if (!textoTratado) {
    return null;
  }

  if (textoTratado.length > tamanhoMaximo) {
    throw criarAppError(
      nomeCampo + ' deve ter no máximo ' + tamanhoMaximo + ' caracteres.',
      400
    );
  }

  return textoTratado;
}

async function validarDadosDoContato(dadosRecebidos) {
  if (!dadosRecebidos || typeof dadosRecebidos !== 'object' || Array.isArray(dadosRecebidos)) {
    throw criarAppError('Os dados do contato são obrigatórios.', 400);
  }

  const nome = validarCampoTexto(dadosRecebidos.nome, 'Nome', 2, 150);
  const telefone = validarCampoTexto(dadosRecebidos.telefone, 'Telefone', 1, 30);
  const bairroInformado = validarCampoTexto(dadosRecebidos.bairro, 'Bairro', 2, 150);
  const problema = validarCampoTexto(
    dadosRecebidos.problema,
    'Categoria do problema',
    3,
    500
  );
  const aceitePrivacidade = validarBooleano(
    obterPrimeiroCampoInformado(
      dadosRecebidos,
      ['aceitePrivacidade', 'consentimentoTratamentoDados', 'consentimentoArmazenamento']
    ),
    'O aceite do Aviso de Privacidade',
    true
  );
  const autorizacaoMensagens = validarBooleano(
    obterPrimeiroCampoInformado(
      dadosRecebidos,
      ['autorizacaoMensagens', 'consentimentoWhatsapp', 'consentimentoMensagens']
    ),
    'Autorização de mensagens',
    false
  );
  const autorizacaoLigacoes = validarBooleano(
    obterPrimeiroCampoInformado(
      dadosRecebidos,
      ['autorizacaoLigacoes', 'consentimentoLigacoes']
    ),
    'Autorização de ligações',
    false
  );
  const telefoneNormalizado = normalizarTelefone(telefone);
  const bairro = await bairroService.validarBairroAtivo(bairroInformado);
  const atualizarDadosEvento = validarBooleano(
    dadosRecebidos.atualizarDadosEvento,
    'Atualização dos dados do evento',
    false
  );
  const nomeConfirmacao = dadosRecebidos.nomeConfirmacao === undefined
    ? null
    : validarCampoTexto(dadosRecebidos.nomeConfirmacao, 'Nome de confirmação', 2, 150);

  if (!categoriasProblema.includes(problema)) {
    throw criarAppError('Selecione uma categoria de problema válida.', 400);
  }

  if (aceitePrivacidade !== true) {
    throw criarAppError('O consentimento para participação é obrigatório.', 400);
  }

  if (telefoneNormalizado.length < 10 || telefoneNormalizado.length > 15) {
    throw criarAppError('O telefone informado é inválido.', 400);
  }

  if (atualizarDadosEvento && !nomeConfirmacao) {
    throw criarAppError('Confirme o nome usado para localizar o cadastro.', 400);
  }

  return {
    nome,
    telefone: formatarTelefone(telefoneNormalizado),
    telefoneNormalizado,
    idade: validarIdade(dadosRecebidos.idade),
    bairro,
    problema,
    eventoIdExibido: validarEventoExibido(dadosRecebidos),
    atualizarDadosEvento,
    nomeConfirmacao,
    aceitePrivacidade,
    autorizacaoMensagens,
    autorizacaoLigacoes
  };
}

function transformarContatoParaResposta(contato) {
  return {
    id: contato.id,
    nome: contato.nome,
    telefone: contato.telefone,
    bairro: contato.bairro,
    problema: contato.problema,
    idade: contato.idade,
    descricaoProblema: contato.descricao_problema,
    consentimentoArmazenamento: contato.consentimento_tratamento_dados,
    consentimentoMensagens: contato.consentimento_whatsapp,
    consentimentoTratamentoDados: contato.consentimento_tratamento_dados,
    consentimentoWhatsapp: contato.consentimento_whatsapp,
    consentimentoLigacoes: contato.consentimento_ligacoes,
    autorizacaoMensagens: contato.autorizacao_mensagens,
    autorizacaoLigacoes: contato.autorizacao_ligacoes,
    aceitePrivacidade: contato.aceite_privacidade,
    origemAtual: contato.origem_nome || contato.origem_atual,
    statusContato: contato.status_contato,
    statusAtendimento: contato.status_atendimento || 'nunca_enviado',
    ultimoAtendimentoEm: contato.ultimo_atendimento_em,
    bloqueadoParaMensagens: contato.bloqueado_para_mensagens,
    bloqueadoParaLigacoes: contato.bloqueado_para_ligacoes,
    exclusaoSolicitadaEm: contato.exclusao_solicitada_em,
    exclusaoSolicitadaPor: contato.exclusao_solicitada_por_usuario_id
      ? {
          id: contato.exclusao_solicitada_por_usuario_id,
          nome: contato.exclusao_solicitada_por_usuario_nome || null
        }
      : null,
    criadoEm: contato.criado_em,
    eventos: Array.isArray(contato.eventos_vinculados)
      ? contato.eventos_vinculados.map(function (evento) {
          return {
            id: evento.id,
            nome: evento.nome,
            cadastradoEm: evento.cadastrado_em
          };
        })
      : []
  };
}

async function cadastrarContato(dadosRecebidos) {
  const dadosDoContato = await validarDadosDoContato(dadosRecebidos);

  try {
    return await contatoModel.salvarCadastroPublico(dadosDoContato);
  } catch (erro) {
    if (erro.codigoAplicacao === 'CONTEXTO_EVENTO_ALTERADO') {
      throw criarAppError(
        'O evento exibido no formulário mudou. Revise o evento atual e envie novamente.',
        409
      );
    }

    if (erro.codigoAplicacao === 'IDENTIDADE_EVENTO_NAO_CONFIRMADA') {
      throw criarAppError(
        'Não foi possível confirmar o cadastro com o nome e o telefone informados. Revise os dados ou procure a equipe do evento.',
        422
      );
    }

    throw erro;
  }
}

function validarIdentificacaoEvento(dadosRecebidos) {
  if (!dadosRecebidos || typeof dadosRecebidos !== 'object' || Array.isArray(dadosRecebidos)) {
    throw criarAppError('Os dados de identificação são obrigatórios.', 400);
  }

  const nome = validarCampoTexto(dadosRecebidos.nome, 'Nome completo', 2, 150);
  const telefone = validarCampoTexto(dadosRecebidos.telefone, 'Telefone', 1, 30);
  const telefoneNormalizado = normalizarTelefone(telefone);
  const eventoIdExibido = validarEventoExibido(dadosRecebidos);

  if (telefoneNormalizado.length < 10 || telefoneNormalizado.length > 15) {
    throw criarAppError('O telefone informado é inválido.', 400);
  }

  if (!Number.isInteger(eventoIdExibido) || eventoIdExibido < 1) {
    throw criarAppError('O evento exibido no formulário é obrigatório.', 400);
  }

  return {
    nome,
    telefoneNormalizado,
    eventoIdExibido
  };
}

function tratarErroIdentificacaoEvento(erro) {
  if (erro.codigoAplicacao === 'CONTEXTO_EVENTO_ALTERADO') {
    throw criarAppError(
      'O evento exibido no formulário mudou. Atualize a página e tente novamente.',
      409
    );
  }

  if (erro.codigoAplicacao === 'EVENTO_NAO_ATIVO') {
    throw criarAppError('Não há evento ativo para esta operação.', 409);
  }

  if (erro.codigoAplicacao === 'IDENTIDADE_EVENTO_NAO_CONFIRMADA') {
    throw criarAppError(
      'Não foi possível confirmar o cadastro com o nome e o telefone informados. Revise os dados ou procure a equipe do evento.',
      422
    );
  }

  throw erro;
}

async function verificarContatoEvento(dadosRecebidos) {
  const dadosIdentificacao = validarIdentificacaoEvento(dadosRecebidos);

  try {
    return await contatoModel.verificarContatoParaEvento(dadosIdentificacao);
  } catch (erro) {
    return tratarErroIdentificacaoEvento(erro);
  }
}

async function inscreverContatoExistenteEvento(dadosRecebidos) {
  const dadosIdentificacao = validarIdentificacaoEvento(dadosRecebidos);

  try {
    return await contatoModel.inscreverContatoExistenteNoEvento(dadosIdentificacao);
  } catch (erro) {
    return tratarErroIdentificacaoEvento(erro);
  }
}

async function listarOpcoesFormulario(eventoIdRecebido) {
  let eventoAtivo;

  if (eventoIdRecebido !== undefined && eventoIdRecebido !== null && eventoIdRecebido !== '') {
    const eventoId = Number(eventoIdRecebido);

    if (!Number.isInteger(eventoId) || eventoId < 1) {
      throw criarAppError('O identificador do evento é inválido.', 400);
    }

    eventoAtivo = await eventoModel.buscarDisponivelPorId(eventoId);

    if (!eventoAtivo) {
      throw criarAppError(
        'Este evento foi encerrado ou não está mais disponível para inscrições.',
        410
      );
    }
  } else {
    eventoAtivo = null;
  }

  const resultados = await Promise.all([
    bairroService.listarNomesAtivos(),
    textoFormularioModel.listarAtivos()
  ]);
  const textos = resultados[1];

  if (!textos.aviso_privacidade || !textos.mensagens || !textos.ligacoes) {
    throw criarAppError('Os textos ativos do formulário não estão completos.', 503);
  }

  return {
    bairros: resultados[0],
    categoriasProblema: categoriasProblema.slice(),
    textosConsentimento: {
      avisoPrivacidade: textos.aviso_privacidade,
      mensagens: textos.mensagens,
      ligacoes: textos.ligacoes
    },
    eventoAtivo: eventoAtivo
      ? {
          id: eventoAtivo.id,
          nome: eventoAtivo.nome,
          motivo: eventoAtivo.motivo,
          descricao: eventoAtivo.descricao,
          dataInicial: eventoAtivo.data_inicial,
          dataFinal: eventoAtivo.data_final,
          local: eventoAtivo.local_evento,
          link: eventoAtivo.link_evento,
          inscricoesInicio: eventoAtivo.inscricoes_inicio,
          inscricoesFim: eventoAtivo.inscricoes_fim
        }
      : null,
    contextoCadastro: eventoAtivo
      ? 'Este cadastro será vinculado ao evento ' + eventoAtivo.nome + '.'
      : null
  };
}

function validarEstadoAutorizacao(valor, nomeCampo) {
  const estados = ['nao_informado', 'autorizado', 'recusado'];

  if (valor === undefined || valor === null || valor === '') {
    return 'nao_informado';
  }

  if (typeof valor !== 'string' || !estados.includes(valor)) {
    throw criarAppError(nomeCampo + ' é inválida.', 400);
  }

  return valor;
}

async function validarDadosCadastroManual(dadosRecebidos) {
  if (!dadosRecebidos || typeof dadosRecebidos !== 'object' || Array.isArray(dadosRecebidos)) {
    throw criarAppError('Os dados do contato são obrigatórios.', 400);
  }

  const telefone = validarCampoTexto(dadosRecebidos.telefone, 'Telefone', 1, 30);
  const telefoneNormalizado = normalizarTelefone(telefone);
  const problema = validarCampoTexto(
    dadosRecebidos.problema,
    'Categoria do problema',
    3,
    500
  );
  const origemId = Number(dadosRecebidos.origemId);
  const bairroInformado = validarCampoTexto(dadosRecebidos.bairro, 'Bairro', 2, 150);
  const bairro = await bairroService.validarBairroAtivo(bairroInformado);

  if (telefoneNormalizado.length < 10 || telefoneNormalizado.length > 15) {
    throw criarAppError('O telefone informado é inválido.', 400);
  }

  if (!categoriasProblema.includes(problema)) {
    throw criarAppError('Selecione uma categoria de problema válida.', 400);
  }

  if (!Number.isInteger(origemId) || origemId < 1) {
    throw criarAppError('Origem é obrigatória.', 400);
  }

  return {
    nome: validarCampoTexto(dadosRecebidos.nome, 'Nome', 2, 150),
    telefone: formatarTelefone(telefoneNormalizado),
    telefoneNormalizado,
    bairro,
    idade: validarIdade(dadosRecebidos.idade),
    problema,
    descricaoProblema: validarCampoOpcional(
      dadosRecebidos.descricaoProblema,
      'Descrição do problema',
      1000
    ),
    origemId,
    status: validarCampoTexto(dadosRecebidos.status, 'Status', 2, 50),
    aceitePrivacidade: validarBooleano(
      dadosRecebidos.aceitePrivacidade,
      'Aceite do Aviso de Privacidade',
      false
    ),
    autorizacaoMensagens: validarEstadoAutorizacao(
      dadosRecebidos.autorizacaoMensagens,
      'Autorização de mensagens'
    ),
    autorizacaoLigacoes: validarEstadoAutorizacao(
      dadosRecebidos.autorizacaoLigacoes,
      'Autorização de ligações'
    )
  };
}

async function cadastrarContatoManual(dadosRecebidos, usuario) {
  if (!usuario || !usuario.id) {
    throw criarAppError('Usuário autenticado não identificado.', 401);
  }

  const dados = await validarDadosCadastroManual(dadosRecebidos);

  try {
    return await contatoModel.salvarCadastroManual(dados, usuario.id);
  } catch (erro) {
    if (erro.codigoAplicacao === 'ORIGEM_NAO_ENCONTRADA') {
      throw criarAppError('A origem informada não existe ou está inativa.', 400);
    }

    throw erro;
  }
}

function tratarFiltroTexto(valor, nomeFiltro) {
  if (valor === undefined || valor === null || valor === '') {
    return '';
  }

  if (typeof valor !== 'string') {
    throw criarAppError('O filtro ' + nomeFiltro + ' é inválido.', 400);
  }

  return valor.trim();
}

function tratarFiltroConsentimento(valor, nomeFiltro) {
  if (valor === undefined || valor === '') {
    return undefined;
  }

  if (valor === 'true') {
    return true;
  }

  if (valor === 'false') {
    return false;
  }

  if (valor === 'null') {
    return null;
  }

  throw criarAppError('O filtro ' + nomeFiltro + ' é inválido.', 400);
}

function tratarNumeroPaginacao(valor, valorPadrao, nomeCampo) {
  if (valor === undefined || valor === null || valor === '') {
    return valorPadrao;
  }

  const numero = Number(valor);

  if (!Number.isInteger(numero) || numero < 1) {
    throw criarAppError('O campo ' + nomeCampo + ' é inválido.', 400);
  }

  return numero;
}

function tratarOpcaoFiltro(valor, nomeCampo, opcoes) {
  if (valor === undefined || valor === null || valor === '') {
    return '';
  }

  if (typeof valor !== 'string' || !opcoes.includes(valor)) {
    throw criarAppError('O filtro ' + nomeCampo + ' é inválido.', 400);
  }

  return valor;
}

function tratarDataFiltro(valor, nomeCampo) {
  if (valor === undefined || valor === null || valor === '') {
    return '';
  }

  const data = typeof valor === 'string'
    ? new Date(valor + 'T00:00:00Z')
    : new Date('invalida');

  if (
    typeof valor !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(valor) ||
    Number.isNaN(data.getTime()) ||
    data.toISOString().slice(0, 10) !== valor
  ) {
    throw criarAppError('O filtro ' + nomeCampo + ' é inválido.', 400);
  }

  return valor;
}

function tratarFiltroPossivelmenteNaoInformado(valor, nomeCampo) {
  const texto = tratarFiltroTexto(valor, nomeCampo);
  const textoComparacao = texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return textoComparacao === 'nao informado' || texto === 'nao_informado'
    ? 'nao_informado'
    : texto;
}

function prepararFiltros(parametrosRecebidos) {
  const nome = tratarFiltroTexto(parametrosRecebidos.nome, 'nome');
  const telefoneRecebido = tratarFiltroTexto(parametrosRecebidos.telefone, 'telefone');
  const bairro = tratarFiltroPossivelmenteNaoInformado(
    parametrosRecebidos.bairro,
    'bairro'
  );
  const problema = tratarFiltroPossivelmenteNaoInformado(
    parametrosRecebidos.problema,
    'problema'
  );
  const origem = tratarFiltroPossivelmenteNaoInformado(
    parametrosRecebidos.origem,
    'origem'
  );
  const status = tratarFiltroPossivelmenteNaoInformado(
    parametrosRecebidos.status,
    'status'
  );
  const statusAtendimento = tratarOpcaoFiltro(
    parametrosRecebidos.statusAtendimento,
    'statusAtendimento',
    [
      'nunca_enviado',
      'preparada',
      'enviada',
      'nao_respondeu',
      'aguardando_resposta',
      'respondido',
      'sem_resposta',
      'recusou_atendimento',
      'numero_invalido',
      'concluido'
    ]
  );
  const consentimentoWhatsapp = tratarFiltroConsentimento(
    parametrosRecebidos.consentimentoWhatsapp,
    'consentimentoWhatsapp'
  );
  const consentimentoLigacoes = tratarFiltroConsentimento(
    parametrosRecebidos.consentimentoLigacoes,
    'consentimentoLigacoes'
  );
  const idadeNaoInformada = tratarOpcaoFiltro(
    parametrosRecebidos.idadeNaoInformada,
    'idadeNaoInformada',
    ['true']
  ) === 'true';
  const cadastroIncompleto = tratarOpcaoFiltro(
    parametrosRecebidos.cadastroIncompleto,
    'cadastroIncompleto',
    ['true']
  ) === 'true';
  const autorizacaoMensagens = tratarOpcaoFiltro(
    parametrosRecebidos.autorizacaoMensagens,
    'autorizacaoMensagens',
    ['nao_informado', 'autorizado', 'recusado', 'revogado']
  );
  const autorizacaoLigacoes = tratarOpcaoFiltro(
    parametrosRecebidos.autorizacaoLigacoes,
    'autorizacaoLigacoes',
    ['nao_informado', 'autorizado', 'recusado', 'revogado']
  );
  const dataInicial = tratarDataFiltro(parametrosRecebidos.dataInicial, 'dataInicial');
  const dataFinal = tratarDataFiltro(parametrosRecebidos.dataFinal, 'dataFinal');
  const ordenacao = tratarOpcaoFiltro(
    parametrosRecebidos.ordenacao || 'mais_recentes',
    'ordenacao',
    ['mais_recentes', 'mais_antigos', 'nome_asc', 'nome_desc']
  );
  let eventoId = '';
  let telefone = '';

  if (parametrosRecebidos.eventoId === 'sem_evento') {
    eventoId = 'sem_evento';
  } else if (
    parametrosRecebidos.eventoId !== undefined &&
    parametrosRecebidos.eventoId !== null &&
    parametrosRecebidos.eventoId !== ''
  ) {
    const eventoRecebido = Number(parametrosRecebidos.eventoId);

    if (!Number.isInteger(eventoRecebido) || eventoRecebido < 1) {
      throw criarAppError('O filtro eventoId é inválido.', 400);
    }

    eventoId = eventoRecebido;
  }

  if (dataInicial && dataFinal && dataInicial > dataFinal) {
    throw criarAppError('A data inicial não pode ser posterior à data final.', 400);
  }

  if (telefoneRecebido) {
    telefone = normalizarTelefone(telefoneRecebido);

    if (!telefone) {
      throw criarAppError('O filtro telefone é inválido.', 400);
    }
  }

  return {
    nome,
    telefone,
    bairro,
    problema,
    consentimentoWhatsapp,
    consentimentoLigacoes,
    origem,
    status,
    statusAtendimento,
    idadeNaoInformada,
    cadastroIncompleto,
    autorizacaoMensagens,
    autorizacaoLigacoes,
    dataInicial,
    dataFinal,
    ordenacao,
    eventoId
  };
}

function transformarConsentimento(consentimento) {
  return {
    id: consentimento.id,
    tipo: consentimento.tipo,
    resposta: consentimento.resposta,
    estado: consentimento.estado || (consentimento.resposta ? 'autorizado' : 'recusado'),
    textoApresentado: consentimento.texto_apresentado,
    versaoTexto: consentimento.versao_texto,
    canal: consentimento.canal,
    origemRegistro: consentimento.origem_registro,
    origem: consentimento.origem_nome,
    ativo: consentimento.ativo,
    criadoEm: consentimento.criado_em,
    revogadoEm: consentimento.revogado_em,
    registradoPor: consentimento.registrado_por_usuario_nome || null,
    motivoRevogacao: consentimento.motivo_revogacao || null,
    registroAnteriorId: consentimento.registro_anterior_id || null
  };
}

function validarIdentificadorContato(idRecebido) {
  const id = Number(idRecebido);

  if (!Number.isInteger(id) || id < 1) {
    throw criarAppError('Identificador do contato inválido.', 400);
  }

  return id;
}

function validarUsuarioResponsavel(usuario) {
  if (!usuario || !usuario.id) {
    throw criarAppError('Usuário autenticado não identificado.', 401);
  }
}

async function revogarConsentimentos(idRecebido, dadosRecebidos, usuario) {
  validarUsuarioResponsavel(usuario);
  const id = validarIdentificadorContato(idRecebido);
  const tipoRecebido = dadosRecebidos && dadosRecebidos.tipo;
  const tiposPorOpcao = {
    mensagens: ['mensagens'],
    ligacoes: ['ligacoes'],
    ambos: ['mensagens', 'ligacoes']
  };
  const tipos = tiposPorOpcao[tipoRecebido];
  const motivo = validarCampoOpcional(
    dadosRecebidos && dadosRecebidos.motivo,
    'Motivo da revogação',
    500
  );

  if (!tipos) {
    throw criarAppError(
      'Tipo de revogação inválido. Use mensagens, ligacoes ou ambos.',
      400
    );
  }

  const resultado = await contatoModel.revogarConsentimentos(
    id,
    tipos,
    motivo,
    usuario.id
  );

  if (!resultado) {
    throw criarAppError('Contato não encontrado.', 404);
  }

  return resultado;
}

async function solicitarExclusao(idRecebido, dadosRecebidos, usuario) {
  validarUsuarioResponsavel(usuario);
  return solicitacaoExclusaoService.solicitar(idRecebido, dadosRecebidos, usuario);
}

async function detalharContato(idRecebido) {
  const id = validarIdentificadorContato(idRecebido);

  const resultado = await contatoModel.buscarDetalhes(id);

  if (!resultado) {
    throw criarAppError('Contato não encontrado.', 404);
  }

  const contatoComAutorizacoes = Object.assign({}, resultado.contato);
  ['mensagens', 'ligacoes'].forEach(function (tipo) {
    const consentimento = resultado.consentimentos.find(function (item) {
      return item.tipo === tipo && item.ativo === true;
    });
    const estado = consentimento && (
      consentimento.estado || (consentimento.resposta ? 'autorizado' : 'recusado')
    ) || 'nao_informado';
    contatoComAutorizacoes['autorizacao_' + tipo] = estado;
  });
  const contato = transformarContatoParaResposta(contatoComAutorizacoes);

  contato.origem = {
    id: resultado.contato.origem_id,
    nome: resultado.contato.origem_nome,
    slug: resultado.contato.origem_slug,
    tipo: resultado.contato.origem_tipo
  };

  return {
    contato,
    consentimentos: resultado.consentimentos.map(transformarConsentimento),
    aceitesPrivacidade: resultado.aceitesPrivacidade.map(function (aceite) {
      return {
        id: aceite.id,
        aceito: aceite.aceito,
        textoApresentado: aceite.texto_apresentado,
        versaoTexto: aceite.versao_texto,
        canal: aceite.canal,
        origem: aceite.origem_nome,
        criadoEm: aceite.criado_em
      };
    }),
    historico: resultado.historico.map(function (historico) {
      return {
        id: historico.id,
        tipoEvento: historico.tipo_evento,
        dadosAnteriores: historico.dados_anteriores,
        dadosNovos: historico.dados_novos,
        origem: historico.origem_nome,
        usuario: historico.usuario_nome,
        criadoEm: historico.criado_em
      };
    }),
    comunicacoes: resultado.comunicacoes
  };
}

async function listarContatos(parametrosRecebidos) {
  const parametros = parametrosRecebidos || {};
  const pagina = tratarNumeroPaginacao(parametros.pagina, 1, 'pagina');
  const limiteRecebido = tratarNumeroPaginacao(parametros.limite, 20, 'limite');
  const limite = Math.min(limiteRecebido, 100);
  const filtros = prepararFiltros(parametros);
  const resultados = await Promise.all([
    contatoModel.listar(filtros, pagina, limite),
    contatoModel.contar(filtros)
  ]);
  const contatosEncontrados = resultados[0];
  const totalRegistros = resultados[1];
  const totalPaginas = Math.ceil(totalRegistros / limite);
  const contatos = contatosEncontrados.map(function (contato) {
    return transformarContatoParaResposta(contato);
  });

  return {
    contatos,
    paginacao: {
      paginaAtual: pagina,
      limite,
      totalRegistros,
      totalPaginas
    }
  };
}

async function listarContatosParaRelatorio(parametrosRecebidos, limite) {
  const filtros = prepararFiltros(parametrosRecebidos || {});
  const contatosEncontrados = await contatoModel.listar(
    filtros,
    1,
    limite
  );

  return contatosEncontrados.map(function (contato) {
    return transformarContatoParaResposta(contato);
  });
}

module.exports = {
  cadastrarContato,
  inscreverContatoExistenteEvento,
  listarContatos,
  listarOpcoesFormulario,
  detalharContato,
  revogarConsentimentos,
  solicitarExclusao,
  cadastrarContatoManual,
  listarContatosParaRelatorio,
  verificarContatoEvento,
  prepararFiltros
};
