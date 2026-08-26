import requisitar from './api';

async function cadastrarContato(dadosDoContato) {
  return requisitar('/api/publico/contatos', {
    method: 'POST',
    body: JSON.stringify(dadosDoContato)
  });
}

async function buscarOpcoesFormulario(forcarAtualizacao, eventoId) {
  const parametros = new URLSearchParams();

  if (forcarAtualizacao) {
    parametros.set('atualizacao', String(Date.now()));
  }

  if (eventoId) {
    parametros.set('eventoId', String(eventoId));
  }

  const consulta = parametros.toString();
  const caminho = '/api/publico/contatos/opcoes' + (consulta ? '?' + consulta : '');

  return requisitar(caminho, {
    method: 'GET'
  });
}

async function verificarContatoEvento(dadosIdentificacao) {
  return requisitar('/api/publico/contatos/verificar-evento', {
    method: 'POST',
    body: JSON.stringify(dadosIdentificacao)
  });
}

async function inscreverContatoExistenteEvento(dadosIdentificacao) {
  return requisitar('/api/publico/contatos/inscrever-evento', {
    method: 'POST',
    body: JSON.stringify(dadosIdentificacao)
  });
}

async function listarContatos(filtros, pagina, limite, sinal) {
  const parametros = new URLSearchParams();

  if (filtros.nome) {
    parametros.set('nome', filtros.nome);
  }

  if (filtros.telefone) {
    parametros.set('telefone', filtros.telefone);
  }

  if (filtros.bairro) {
    parametros.set('bairro', filtros.bairro);
  }

  if (filtros.problema) {
    parametros.set('problema', filtros.problema);
  }

  if (filtros.consentimentoWhatsapp) {
    parametros.set('consentimentoWhatsapp', filtros.consentimentoWhatsapp);
  }

  if (filtros.consentimentoLigacoes) {
    parametros.set('consentimentoLigacoes', filtros.consentimentoLigacoes);
  }

  if (filtros.origem) {
    parametros.set('origem', filtros.origem);
  }

  if (filtros.status) {
    parametros.set('status', filtros.status);
  }

  if (filtros.statusAtendimento) {
    parametros.set('statusAtendimento', filtros.statusAtendimento);
  }

  if (filtros.autorizacaoMensagens) {
    parametros.set('autorizacaoMensagens', filtros.autorizacaoMensagens);
  }

  if (filtros.autorizacaoLigacoes) {
    parametros.set('autorizacaoLigacoes', filtros.autorizacaoLigacoes);
  }

  if (filtros.dataInicial) {
    parametros.set('dataInicial', filtros.dataInicial);
  }

  if (filtros.dataFinal) {
    parametros.set('dataFinal', filtros.dataFinal);
  }

  if (filtros.ordenacao) {
    parametros.set('ordenacao', filtros.ordenacao);
  }

  if (filtros.eventoId) {
    parametros.set('eventoId', filtros.eventoId);
  }

  parametros.set('pagina', String(pagina));
  parametros.set('limite', String(limite));

  return requisitar('/api/admin/contatos?' + parametros.toString(), {
    method: 'GET',
    autenticado: true,
    signal: sinal
  });
}

async function buscarDetalhesContato(id, sinal) {
  return requisitar('/api/admin/contatos/' + id, {
    method: 'GET',
    autenticado: true,
    signal: sinal
  });
}

async function revogarConsentimentos(id, tipo, motivo) {
  return requisitar('/api/admin/contatos/' + id + '/revogar-consentimentos', {
    method: 'POST',
    autenticado: true,
    body: JSON.stringify({ tipo, motivo: motivo || null })
  });
}

async function solicitarExclusaoContato(id) {
  return requisitar('/api/admin/contatos/' + id + '/solicitacao-exclusao', {
    method: 'POST',
    autenticado: true
  });
}

async function listarOrigens(sinal) {
  return requisitar('/api/admin/origens', {
    method: 'GET',
    autenticado: true,
    signal: sinal
  });
}

async function cadastrarContatoManual(dadosDoContato) {
  return requisitar('/api/admin/contatos', {
    method: 'POST',
    autenticado: true,
    body: JSON.stringify(dadosDoContato)
  });
}

async function preVisualizarImportacao(arquivo, origem) {
  const formulario = new FormData();
  formulario.append('arquivo', arquivo);
  formulario.append('origem', origem);
  return requisitar('/api/admin/importacoes/pre-visualizar', {
    method: 'POST', autenticado: true, body: formulario
  });
}

async function confirmarImportacao(id) {
  return requisitar('/api/admin/importacoes/' + id + '/confirmar', {
    method: 'POST', autenticado: true
  });
}

async function listarImportacoes() {
  return requisitar('/api/admin/importacoes', {
    method: 'GET',
    autenticado: true
  });
}

async function excluirImportacao(id) {
  return requisitar('/api/admin/importacoes/' + id, {
    method: 'DELETE',
    autenticado: true
  });
}

export {
  buscarOpcoesFormulario,
  buscarDetalhesContato,
  cadastrarContatoManual,
  cadastrarContato,
  confirmarImportacao,
  excluirImportacao,
  inscreverContatoExistenteEvento,
  listarContatos,
  listarImportacoes,
  listarOrigens,
  preVisualizarImportacao,
  revogarConsentimentos,
  solicitarExclusaoContato,
  verificarContatoEvento
};
