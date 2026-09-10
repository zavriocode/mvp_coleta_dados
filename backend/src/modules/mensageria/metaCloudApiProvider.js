const ENDERECO_GRAPH = 'https://graph.facebook.com';
const {
  analisarRequisitosDeEnvio,
  obterDescritoresVariaveis,
  obterPosicoesVariaveis
} = require('./analisadorRequisitosTemplate');

let executarFetch = function () { return fetch.apply(globalThis, arguments); };
let registrarEstruturaParaLog = function (registro) {
  if (process.env.NODE_ENV !== 'test') console.info(JSON.stringify(registro));
};

function textoSeguro(valor, maximo) {
  if (valor === undefined || valor === null) return null;
  return String(valor).replace(/[\r\n\t]+/g, ' ').trim().slice(0, maximo) || null;
}

function removerCredenciaisDoTexto(valor, maximo) {
  let resultado = textoSeguro(valor, maximo);
  if (!resultado) return null;
  resultado = resultado
    .replace(/authorization\s*[:=]\s*bearer\s+[^\s,;]+/gi, '[CREDENCIAL_REMOVIDA]')
    .replace(/bearer\s+[^\s,;]+/gi, '[CREDENCIAL_REMOVIDA]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[EMAIL_REMOVIDO]')
    .replace(/(^|\D)\+?\d{10,15}(?!\d)/g, '$1[TELEFONE_REMOVIDO]');
  const segredos = [
    process.env.WHATSAPP_ACCESS_TOKEN,
    process.env.META_APP_SECRET,
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    process.env.DATABASE_URL,
    process.env.BANCO_SENHA,
    process.env.JWT_SECRET,
    process.env.PGPASSWORD
  ].filter(function (item) { return typeof item === 'string' && item.length >= 4; });
  segredos.forEach(function (segredo) {
    resultado = resultado.split(segredo).join('[CREDENCIAL_REMOVIDA]');
  });
  return resultado;
}

function codigoTecnicoSeguro(valor) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  return textoSeguro(valor, 80);
}

function registrarErroTecnicoMeta(resposta, corpo, operacao) {
  const externo = corpo && corpo.error && typeof corpo.error === 'object' ? corpo.error : {};
  const dadosErro = externo.error_data && typeof externo.error_data === 'object'
    ? externo.error_data
    : {};
  const registro = {
    nivel: 'erro',
    evento: 'erro_meta_cloud_api',
    operacao: textoSeguro(operacao, 40),
    statusMeta: Number(resposta && resposta.status) || null,
    mensagemMeta: removerCredenciaisDoTexto(externo.message, 1000),
    codigoMeta: codigoTecnicoSeguro(externo.code),
    subcodigoMeta: codigoTecnicoSeguro(externo.error_subcode),
    tipoMeta: removerCredenciaisDoTexto(externo.type, 100),
    detalhesMeta: removerCredenciaisDoTexto(dadosErro.details, 2000),
    produtoMeta: removerCredenciaisDoTexto(dadosErro.messaging_product, 100),
    fbtraceId: removerCredenciaisDoTexto(externo.fbtrace_id, 255)
  };
  try { console.error(JSON.stringify(registro)); }
  catch (erroLog) { /* O log técnico não pode alterar o tratamento do envio. */ }
}

function criarErroIntegracao(mensagem, codigo, statusHttp, permiteNovaTentativa, resultadoIndeterminado) {
  const erro = new Error(mensagem);
  erro.codigoIntegracao = textoSeguro(codigo, 80) || 'META_ERRO';
  erro.statusHttpExterno = Number(statusHttp) || null;
  erro.permiteNovaTentativa = permiteNovaTentativa === true;
  erro.resultadoIndeterminado = resultadoIndeterminado === true;
  return erro;
}

function criarErroConfiguracaoEnvio(mensagem, codigo) {
  const erro = criarErroIntegracao(mensagem, codigo, 409, true);
  erro.erroLocal = true;
  return erro;
}

function obterConfiguracao() {
  const configuracao = {
    token: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    appId: process.env.META_APP_ID,
    versao: process.env.META_GRAPH_API_VERSION
  };
  if (!configuracao.token || !configuracao.phoneNumberId || !configuracao.businessAccountId || !configuracao.versao) {
    throw criarErroIntegracao('A integracao com o WhatsApp nao esta configurada.', 'META_NAO_CONFIGURADA', 503, false);
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(configuracao.versao) || !/^\d+$/.test(configuracao.phoneNumberId) || !/^\d+$/.test(configuracao.businessAccountId)) {
    throw criarErroIntegracao('A configuracao da integracao com o WhatsApp e invalida.', 'META_CONFIGURACAO_INVALIDA', 503, false);
  }
  return configuracao;
}

function resolverParametro(parametro, comando, posicao) {
  const origens = {
    nome_contato: comando.nomeContato,
    bairro: comando.bairroContato,
    problema: comando.problemaContato,
    fixo: parametro.valor
  };
  const valor = textoSeguro(origens[parametro.origem], 1000);
  if (!valor) {
    throw criarErroConfiguracaoEnvio(
      'Este contato nao possui a informacao necessaria para preencher {{' + posicao + '}}.',
      'CONFIGURACAO_ENVIO_INCOMPLETA'
    );
  }
  return valor;
}

function validarConfiguracaoParaEnvio(comando) {
  const analise = analisarRequisitosDeEnvio({
    origem: comando.templateOrigem,
    statusOficial: comando.templateStatusOficial,
    nome: comando.templateNome,
    idioma: comando.templateIdioma,
    componentes: comando.templateComponentes
  }, comando.templateConfiguracaoEnvio, {
    identificadorOptOut: process.env.WHATSAPP_OPTOUT_BUTTON_ID
  });
  if (analise.validoParaEnvio) return analise;
  const somenteStatus = analise.pendencias.every(function (item) {
    return item.tipo === 'status_oficial';
  });
  const mensagem = analise.pendencias.map(function (item) { return item.mensagem; }).join(' ');
  throw criarErroConfiguracaoEnvio(
    mensagem,
    somenteStatus ? 'TEMPLATE_NAO_APROVADO' : 'CONFIGURACAO_ENVIO_INCOMPLETA'
  );
}

function montarComponentesEnvio(comando) {
  const configuracao = comando.templateConfiguracaoEnvio || {};
  const componentesOficiais = Array.isArray(comando.templateComponentes) ? comando.templateComponentes : [];
  const componentes = [];
  const cabecalhoOficial = componentesOficiais.find(function (item) { return item.type === 'HEADER'; });
  const descritoresCabecalho = obterDescritoresVariaveis(cabecalhoOficial);
  if (cabecalhoOficial && cabecalhoOficial.format === 'IMAGE') {
    const cabecalho = configuracao.cabecalho;
    const valorImagem = cabecalho.valor.trim();
    const imagem = cabecalho.origem === 'id' ? { id: valorImagem } : { link: valorImagem };
    componentes.push({ type: 'header', parameters: [{ type: 'image', image: imagem }] });
  } else if (cabecalhoOficial && cabecalhoOficial.format === 'TEXT' && descritoresCabecalho.length) {
    componentes.push({
      type: 'header',
      parameters: descritoresCabecalho.map(function (descritor) {
        const parametro = {
          type: 'text',
          text: resolverParametro(
            configuracao.cabecalho.parametros[descritor.posicao - 1],
            comando,
            descritor.marcador
          )
        };
        if (descritor.nome) parametro.parameter_name = descritor.nome;
        return parametro;
      })
    });
  }
  const corpoOficial = componentesOficiais.find(function (item) {
    return String(item && item.type || '').toUpperCase() === 'BODY';
  });
  const descritoresCorpo = obterDescritoresVariaveis(corpoOficial);
  if (descritoresCorpo.length) {
    componentes.push({
      type: 'body',
      parameters: descritoresCorpo.map(function (descritor) {
        const parametro = {
          type: 'text',
          text: resolverParametro(
            configuracao.corpo[descritor.posicao - 1],
            comando,
            descritor.marcador
          )
        };
        if (descritor.nome) parametro.parameter_name = descritor.nome;
        return parametro;
      })
    });
  }
  const grupoBotoes = componentesOficiais.find(function (item) { return item.type === 'BUTTONS'; });
  const botoesOficiais = grupoBotoes && Array.isArray(grupoBotoes.buttons) ? grupoBotoes.buttons : [];
  const configuracoesBotoes = Array.isArray(configuracao.botoes) ? configuracao.botoes : [];
  botoesOficiais.forEach(function (botaoOficial, indice) {
    const botao = configuracoesBotoes.find(function (item) { return item.indice === indice; });
    const urlDinamica = botaoOficial.type === 'URL' && obterPosicoesVariaveis(botaoOficial.url).length > 0;
    const optOutConfigurado = botaoOficial.type === 'QUICK_REPLY' && botao && botao.origem === 'opt_out';
    if (urlDinamica || optOutConfigurado) {
      const valor = botao.origem === 'opt_out'
        ? process.env.WHATSAPP_OPTOUT_BUTTON_ID
        : resolverParametro(botao, comando, 1);
      componentes.push({
        type: 'button',
        sub_type: botao.subtipo,
        index: String(indice),
        parameters: [{ type: botao.subtipo === 'quick_reply' ? 'payload' : 'text', [botao.subtipo === 'quick_reply' ? 'payload' : 'text']: valor }]
      });
    }
  });
  return componentes;
}

function montarPayload(comando) {
  const telefone = String(comando.telefone || '').replace(/\D/g, '');
  if (telefone.length < 10 || telefone.length > 15) {
    throw criarErroIntegracao('O telefone do contato e invalido para o WhatsApp.', 'TELEFONE_INVALIDO', 422, false);
  }
  validarConfiguracaoParaEnvio(comando);
  const template = { name: comando.templateNome, language: { code: comando.templateIdioma } };
  const componentes = montarComponentesEnvio(comando);
  if (componentes.length) template.components = componentes;
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to: telefone, type: 'template', template };
}

function parametroOperacionalConfigurado(parametro) {
  if (!parametro || !['nome_contato', 'bairro', 'problema', 'fixo'].includes(parametro.origem)) return false;
  return parametro.origem !== 'fixo' || Boolean(textoSeguro(parametro.valor, 1000));
}

function resumirComponenteOficial(componente) {
  const tipo = String(componente && componente.type || '').toUpperCase();
  const resumo = { tipo };
  if (componente && componente.format) resumo.formato = String(componente.format).toUpperCase();
  if (componente && componente.parameter_format) {
    resumo.formatoParametros = String(componente.parameter_format).toUpperCase();
  }
  if (tipo === 'BODY') resumo.quantidadeVariaveis = obterDescritoresVariaveis(componente).length;
  if (tipo === 'BUTTONS') resumo.quantidadeBotoes = Array.isArray(componente.buttons)
    ? componente.buttons.length : 0;
  return resumo;
}

function resumirComponentePayload(componente) {
  const parametros = Array.isArray(componente && componente.parameters)
    ? componente.parameters : [];
  return {
    tipo: String(componente && componente.type || '').toLowerCase(),
    quantidadeParametros: parametros.length,
    nomesParametros: parametros.map(function (parametro) {
      return textoSeguro(parametro && parametro.parameter_name, 100);
    }).filter(Boolean)
  };
}

function registrarEstruturaEnvioTemplateMeta(comando, payload) {
  const componentesOficiais = Array.isArray(comando.templateComponentes)
    ? comando.templateComponentes : [];
  const configuracao = comando.templateConfiguracaoEnvio || {};
  const configuracaoCorpo = Array.isArray(configuracao.corpo) ? configuracao.corpo : [];
  const corpoOficial = componentesOficiais.find(function (item) {
    return String(item && item.type || '').toUpperCase() === 'BODY';
  });
  const descritoresEsperados = obterDescritoresVariaveis(corpoOficial);
  const variaveisEsperadas = descritoresEsperados.map(function (item) { return item.posicao; });
  const nomesEsperados = descritoresEsperados.map(function (item) { return item.nome; }).filter(Boolean);
  const variaveisConfiguradas = descritoresEsperados.filter(function (descritor) {
    return parametroOperacionalConfigurado(configuracaoCorpo[descritor.posicao - 1]);
  }).map(function (item) { return item.posicao; });
  const componentesPayload = payload && payload.template && Array.isArray(payload.template.components)
    ? payload.template.components : [];
  const corpoPayload = componentesPayload.find(function (item) {
    return String(item && item.type || '').toLowerCase() === 'body';
  });
  const parametrosCorpo = corpoPayload && Array.isArray(corpoPayload.parameters)
    ? corpoPayload.parameters : [];
  const variaveisResolvidas = descritoresEsperados.filter(function (descritor, indice) {
    const parametro = parametrosCorpo[indice];
    return parametro && parametro.type === 'text' && Boolean(textoSeguro(parametro.text, 1000));
  }).map(function (item) { return item.posicao; });
  const registro = {
    nivel: 'info',
    evento: 'estrutura_envio_template_meta',
    operacao: 'envio',
    nomeTemplate: textoSeguro(comando.templateNome, 512),
    idioma: textoSeguro(comando.templateIdioma, 35),
    origemTemplate: textoSeguro(comando.templateOrigem, 20),
    statusTemplate: textoSeguro(comando.templateStatusOficial, 50),
    componentesOficiais: componentesOficiais.map(resumirComponenteOficial),
    componentesPayload: componentesPayload.map(resumirComponentePayload),
    body: {
      formatoParametros: String(corpoOficial && corpoOficial.parameter_format || 'POSITIONAL').toUpperCase(),
      nomesEsperados,
      variaveisEsperadas,
      variaveisConfiguradas,
      variaveisResolvidas
    }
  };
  registrarEstruturaParaLog(registro);
  return registro;
}

function validarCorrespondenciaParametrosBody(registro) {
  const corpoPayload = registro.componentesPayload.find(function (item) { return item.tipo === 'body'; });
  const quantidadeEnviada = corpoPayload ? corpoPayload.quantidadeParametros : 0;
  const quantidadeEsperada = registro.body.variaveisEsperadas.length;
  const nomesEnviados = corpoPayload && Array.isArray(corpoPayload.nomesParametros)
    ? corpoPayload.nomesParametros : [];
  const nomesEsperados = Array.isArray(registro.body.nomesEsperados)
    ? registro.body.nomesEsperados : [];
  if (quantidadeEnviada !== quantidadeEsperada ||
    registro.body.variaveisConfiguradas.length !== quantidadeEsperada ||
    registro.body.variaveisResolvidas.length !== quantidadeEsperada ||
    nomesEnviados.length !== nomesEsperados.length ||
    nomesEnviados.some(function (nome, indice) { return nome !== nomesEsperados[indice]; })) {
    throw criarErroConfiguracaoEnvio(
      'A configuracao dos valores personalizados do modelo esta incompleta.',
      'CONFIGURACAO_ENVIO_INCOMPLETA'
    );
  }
}

async function lerResposta(resposta) {
  try { return await resposta.json(); }
  catch (erro) { throw criarErroIntegracao('A Meta retornou uma resposta invalida.', 'META_RESPOSTA_INVALIDA', resposta.status, true); }
}

function prepararErroMeta(resposta, corpo, operacao) {
  const externo = corpo && corpo.error || {};
  const codigo = textoSeguro(externo.code || externo.error_subcode, 80) || 'META_HTTP_' + resposta.status;
  let mensagem = resposta.status === 401 ? 'A credencial da Meta foi recusada.' : 'A Meta recusou a operação solicitada.';
  if (operacao === 'template') mensagem = resposta.status === 401 ? mensagem : 'A Meta recusou o template. Revise os campos e exemplos informados.';
  if (operacao === 'imagem') mensagem = resposta.status === 401 ? 'A conexao com a Meta precisa ser conferida pelo administrador.' : 'Nao foi possivel enviar a imagem. Verifique o arquivo e tente novamente.';
  return criarErroIntegracao(mensagem, codigo, resposta.status, resposta.status >= 500 || resposta.status === 429);
}

async function requisitarMeta(caminho, opcoes, operacao) {
  const configuracao = obterConfiguracao();
  const controlador = new AbortController();
  const timeoutMs = Number(process.env.META_REQUISICAO_TIMEOUT_MS || 10000);
  const temporizador = setTimeout(function () { controlador.abort(); }, timeoutMs);
  try {
    const resposta = await executarFetch(ENDERECO_GRAPH + '/' + configuracao.versao + '/' + caminho, Object.assign({}, opcoes, {
      headers: Object.assign({ Authorization: 'Bearer ' + configuracao.token }, opcoes && opcoes.headers),
      signal: controlador.signal
    }));
    let corpo;
    try { corpo = await lerResposta(resposta); }
    catch (erroResposta) {
      if (!resposta.ok) registrarErroTecnicoMeta(resposta, null, operacao);
      erroResposta.resultadoIndeterminado = resposta.ok === true;
      throw erroResposta;
    }
    if (!resposta.ok) {
      registrarErroTecnicoMeta(resposta, corpo, operacao);
      throw prepararErroMeta(resposta, corpo, operacao);
    }
    return { corpo, status: resposta.status };
  } catch (erro) {
    if (erro.name === 'AbortError') throw criarErroIntegracao('A Meta nao respondeu dentro do tempo esperado.', 'META_TIMEOUT', 504, false, true);
    if (erro.codigoIntegracao) throw erro;
    throw criarErroIntegracao('Nao foi possivel comunicar com a Meta.', 'META_INDISPONIVEL', 503, false, true);
  } finally { clearTimeout(temporizador); }
}

async function enviarTemplate(comando) {
  const configuracao = obterConfiguracao();
  const payload = montarPayload(comando);
  const estrutura = registrarEstruturaEnvioTemplateMeta(comando, payload);
  validarCorrespondenciaParametrosBody(estrutura);
  const resposta = await requisitarMeta(configuracao.phoneNumberId + '/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  }, 'envio');
  const identificador = resposta.corpo && Array.isArray(resposta.corpo.messages) && resposta.corpo.messages[0] && resposta.corpo.messages[0].id;
  if (!identificador) throw criarErroIntegracao('A Meta nao confirmou o identificador da mensagem.', 'META_RESPOSTA_INVALIDA', resposta.status, false, true);
  return { identificadorExterno: textoSeguro(identificador, 255) };
}

async function criarTemplateOficial(payload) {
  const configuracao = obterConfiguracao();
  const resposta = await requisitarMeta(configuracao.businessAccountId + '/message_templates', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  }, 'template');
  if (!resposta.corpo || !resposta.corpo.id || !resposta.corpo.status) {
    throw criarErroIntegracao('A Meta retornou uma resposta incompleta ao criar o template.', 'META_RESPOSTA_INVALIDA', resposta.status, true);
  }
  return resposta.corpo;
}

async function prepararImagemExemplo(conteudo, tipoMime) {
  const configuracao = obterConfiguracao();
  if (!configuracao.appId || !/^\d+$/.test(configuracao.appId)) {
    throw criarErroIntegracao(
      'O aplicativo da Meta nao esta configurado para preparar imagens de template.',
      'META_APP_NAO_CONFIGURADO',
      503,
      false
    );
  }
  if (!Buffer.isBuffer(conteudo) || conteudo.length === 0) {
    throw criarErroIntegracao('A imagem de exemplo e invalida.', 'META_IMAGEM_INVALIDA', 400, false);
  }

  const parametros = new URLSearchParams({
    file_length: String(conteudo.length),
    file_type: tipoMime
  });
  const sessao = await requisitarMeta(
    configuracao.appId + '/uploads?' + parametros.toString(),
    { method: 'POST' },
    'template'
  );
  const identificadorSessao = textoSeguro(sessao.corpo && sessao.corpo.id, 4000);
  if (!identificadorSessao || !identificadorSessao.startsWith('upload:')) {
    throw criarErroIntegracao(
      'A Meta nao confirmou a preparacao da imagem de exemplo.',
      'META_RESPOSTA_INVALIDA',
      sessao.status,
      true
    );
  }

  const upload = await requisitarMeta(identificadorSessao, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      file_offset: '0'
    },
    body: conteudo
  }, 'template');
  const handle = textoSeguro(upload.corpo && upload.corpo.h, 4000);
  if (!handle) {
    throw criarErroIntegracao(
      'A Meta nao confirmou a imagem de exemplo do template.',
      'META_RESPOSTA_INVALIDA',
      upload.status,
      true
    );
  }
  return { handle };
}

async function prepararImagemEnvio(conteudo, tipoMime, nomeArquivo) {
  const configuracao = obterConfiguracao();
  if (!Buffer.isBuffer(conteudo) || conteudo.length === 0) {
    throw criarErroIntegracao('Selecione uma imagem JPG ou PNG valida.', 'META_IMAGEM_INVALIDA', 400, false);
  }
  const formulario = new FormData();
  formulario.append('messaging_product', 'whatsapp');
  formulario.append('file', new Blob([conteudo], { type: tipoMime }), nomeArquivo || 'imagem');
  const resposta = await requisitarMeta(
    configuracao.phoneNumberId + '/media',
    { method: 'POST', body: formulario },
    'imagem'
  );
  const id = textoSeguro(resposta.corpo && resposta.corpo.id, 255);
  if (!id) {
    throw criarErroIntegracao(
      'Nao foi possivel preparar a imagem para o envio. Tente novamente.',
      'META_RESPOSTA_INVALIDA', resposta.status, true
    );
  }
  return { id };
}

async function listarTemplatesOficiais() {
  const configuracao = obterConfiguracao();
  const templates = [];
  const cursores = new Set();
  let cursor = null;
  for (let pagina = 0; pagina < 100; pagina += 1) {
    const parametros = new URLSearchParams({
      fields: 'id,name,language,status,category,parameter_format,components',
      limit: '100'
    });
    if (cursor) parametros.set('after', cursor);
    const resposta = await requisitarMeta(configuracao.businessAccountId + '/message_templates?' + parametros.toString(), { method: 'GET' }, 'template');
    if (!resposta.corpo || !Array.isArray(resposta.corpo.data)) {
      throw criarErroIntegracao('A Meta retornou uma lista de templates invalida.', 'META_RESPOSTA_INVALIDA', resposta.status, true);
    }
    templates.push.apply(templates, resposta.corpo.data);
    const proximo = resposta.corpo.paging && resposta.corpo.paging.next && resposta.corpo.paging.cursors && resposta.corpo.paging.cursors.after;
    if (!proximo) return templates;
    if (cursores.has(proximo)) throw criarErroIntegracao('A paginacao da Meta retornou um cursor repetido.', 'META_RESPOSTA_INVALIDA', resposta.status, true);
    cursores.add(proximo); cursor = proximo;
  }
  throw criarErroIntegracao('A Meta excedeu o limite seguro de paginas de templates.', 'META_RESPOSTA_INVALIDA', 502, true);
}

async function buscarTemplateOficialPorNome(nome) {
  const configuracao = obterConfiguracao();
  const parametros = new URLSearchParams({
    fields: 'id,name,language,status,category,parameter_format,components',
    name: nome
  });
  const resposta = await requisitarMeta(configuracao.businessAccountId + '/message_templates?' + parametros.toString(), { method: 'GET' }, 'template');
  if (!resposta.corpo || !Array.isArray(resposta.corpo.data)) throw criarErroIntegracao('A Meta retornou uma resposta de template invalida.', 'META_RESPOSTA_INVALIDA', resposta.status, true);
  return resposta.corpo.data;
}

async function buscarTemplateOficialPorId(idRecebido) {
  const id = String(idRecebido || '').trim();
  if (!/^\d+$/.test(id)) {
    throw criarErroIntegracao('O identificador oficial do template e invalido.', 'META_TEMPLATE_INVALIDO', 400, false);
  }
  const parametros = new URLSearchParams({
    fields: 'id,name,language,status,category,parameter_format,components'
  });
  const resposta = await requisitarMeta(id + '?' + parametros.toString(), { method: 'GET' }, 'template');
  if (!resposta.corpo || String(resposta.corpo.id || '') !== id) {
    throw criarErroIntegracao('A Meta retornou um template invalido.', 'META_RESPOSTA_INVALIDA', resposta.status, true);
  }
  return resposta.corpo;
}

async function consultarLimiteMensageria() {
  const configuracao = obterConfiguracao();
  const parametros = new URLSearchParams({ fields: 'whatsapp_business_manager_messaging_limit' });
  const resposta = await requisitarMeta(configuracao.phoneNumberId + '?' + parametros.toString(), { method: 'GET' }, 'limite');
  const tier = textoSeguro(resposta.corpo && resposta.corpo.whatsapp_business_manager_messaging_limit, 40);
  if (!tier) throw criarErroIntegracao('A Meta nao informou o limite oficial de mensageria.', 'META_LIMITE_AUSENTE', resposta.status, true);
  return { tier };
}

function definirFetchParaTeste(funcao) { executarFetch = funcao || function () { return fetch.apply(globalThis, arguments); }; }
function definirRegistradorEstruturaParaTeste(funcao) {
  registrarEstruturaParaLog = funcao || function (registro) {
    if (process.env.NODE_ENV !== 'test') console.info(JSON.stringify(registro));
  };
}

module.exports = {
  buscarTemplateOficialPorId, buscarTemplateOficialPorNome, consultarLimiteMensageria, criarTemplateOficial,
  definirFetchParaTeste, definirRegistradorEstruturaParaTeste, enviarTemplate, listarTemplatesOficiais, montarPayload,
  prepararImagemEnvio, prepararImagemExemplo,
  validarConfiguracaoParaEnvio
};
