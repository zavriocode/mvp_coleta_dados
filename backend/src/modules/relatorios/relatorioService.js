const contatoService = require('../contatos/contatoService');
const ExcelJS = require('exceljs');
const criarAppError = require('../../utils/AppError');
const formatarDataRio = require('../../utils/formatarDataRio');

function obterLimiteRelatorio() {
  const limite = Number(process.env.RELATORIO_LIMITE_REGISTROS || 50000);

  if (!Number.isInteger(limite) || limite < 100 || limite > 200000) {
    throw new Error('RELATORIO_LIMITE_REGISTROS possui valor inválido.');
  }

  return limite;
}

async function buscarContatos(parametros) {
  const limite = obterLimiteRelatorio();
  const contatos = await contatoService.listarContatosParaRelatorio(
    parametros,
    limite + 1
  );

  if (contatos.length > limite) {
    throw criarAppError(
      'O resultado possui mais de ' + limite + ' contatos. Aplique filtros antes de gerar ou exportar o relatório.',
      413
    );
  }

  return contatos;
}

function adicionarContagem(mapa, chaveRecebida) {
  const chave = chaveRecebida || 'Não informado';
  mapa[chave] = (mapa[chave] || 0) + 1;
}

function transformarMapa(mapa) {
  return Object.keys(mapa).sort().map(function (nome) {
    return { nome, total: mapa[nome] };
  });
}

function adicionarProblemaPorBairro(mapa, bairroRecebido, problemaRecebido) {
  const bairro = bairroRecebido || 'Não informado';
  const problema = problemaRecebido || 'Não informado';

  if (!mapa[bairro]) {
    mapa[bairro] = {};
  }

  adicionarContagem(mapa[bairro], problema);
}

function transformarProblemasPorBairro(mapa) {
  return Object.keys(mapa).sort().map(function (bairro) {
    const problemas = transformarMapa(mapa[bairro]).sort(function (primeiro, segundo) {
      return segundo.total - primeiro.total;
    });
    const total = problemas.reduce(function (soma, item) {
      return soma + item.total;
    }, 0);

    return { bairro, total, problemas };
  }).sort(function (primeiro, segundo) {
    return segundo.total - primeiro.total;
  });
}

function obterFaixaEtaria(idade) {
  if (idade === null || idade === undefined) {
    return 'Não informado';
  }
  if (idade <= 24) {
    return 'Até 24';
  }
  if (idade <= 34) {
    return '25 a 34';
  }
  if (idade <= 44) {
    return '35 a 44';
  }
  if (idade <= 59) {
    return '45 a 59';
  }
  return '60 ou mais';
}

function obterDiaCadastro(valor) {
  if (!valor) {
    return null;
  }

  const data = valor instanceof Date ? valor : new Date(valor);

  if (Number.isNaN(data.getTime())) {
    return null;
  }

  return formatarDataRio(data);
}

async function gerarResumo(parametros) {
  const contatos = await buscarContatos(parametros);
  const bairro = {};
  const problema = {};
  const faixaEtaria = {};
  const origem = {};
  const mensagens = {};
  const ligacoes = {};
  const periodo = {};
  const problemasPorBairro = {};

  contatos.forEach(function (contato) {
    adicionarContagem(bairro, contato.bairro);
    adicionarContagem(problema, contato.problema);
    adicionarContagem(faixaEtaria, obterFaixaEtaria(contato.idade));
    adicionarContagem(origem, contato.origemAtual);
    adicionarContagem(mensagens, contato.autorizacaoMensagens);
    adicionarContagem(ligacoes, contato.autorizacaoLigacoes);
    adicionarContagem(periodo, obterDiaCadastro(contato.criadoEm));
    adicionarProblemaPorBairro(problemasPorBairro, contato.bairro, contato.problema);
  });

  return {
    totalContatos: contatos.length,
    porBairro: transformarMapa(bairro),
    porProblema: transformarMapa(problema),
    porFaixaEtaria: transformarMapa(faixaEtaria),
    porOrigem: transformarMapa(origem),
    porAutorizacaoMensagens: transformarMapa(mensagens),
    porAutorizacaoLigacoes: transformarMapa(ligacoes),
    porPeriodo: transformarMapa(periodo),
    problemasPorBairro: transformarProblemasPorBairro(problemasPorBairro)
  };
}

function escaparCsv(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor);

  return '"' + texto.replace(/"/g, '""') + '"';
}

async function gerarCsv(parametros) {
  const contatos = await buscarContatos(parametros);
  const cabecalho = [
    'id', 'nome', 'telefone', 'idade', 'bairro', 'categoria_problema',
    'descricao_problema', 'origem', 'status',
    'autorizacao_mensagens', 'autorizacao_ligacoes', 'aceite_privacidade',
    'criado_em'
  ];
  const linhas = [cabecalho.map(escaparCsv).join(';')];

  contatos.forEach(function (contato) {
    linhas.push([
      contato.id,
      contato.nome,
      contato.telefone,
      contato.idade,
      contato.bairro,
      contato.problema,
      contato.descricaoProblema,
      contato.origemAtual,
      contato.statusContato,
      contato.autorizacaoMensagens,
      contato.autorizacaoLigacoes,
      contato.aceitePrivacidade,
      contato.criadoEm
    ].map(escaparCsv).join(';'));
  });

  return '\uFEFF' + linhas.join('\r\n');
}

async function gerarExcel(parametros) {
  const contatos = await buscarContatos(parametros);
  const pasta = new ExcelJS.Workbook();
  pasta.creator = 'ACORDA RJ';
  pasta.created = new Date();
  const planilha = pasta.addWorksheet('Contatos', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  planilha.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Nome', key: 'nome', width: 32 },
    { header: 'Telefone', key: 'telefone', width: 20 },
    { header: 'Idade', key: 'idade', width: 10 },
    { header: 'Bairro', key: 'bairro', width: 24 },
    { header: 'Categoria do problema', key: 'problema', width: 30 },
    { header: 'Descrição do problema', key: 'descricaoProblema', width: 38 },
    { header: 'Origem', key: 'origemAtual', width: 24 },
    { header: 'Evento(s)', key: 'eventos', width: 34 },
    { header: 'Status', key: 'statusContato', width: 18 },
    { header: 'Mensagens', key: 'autorizacaoMensagens', width: 18 },
    { header: 'Ligações', key: 'autorizacaoLigacoes', width: 18 },
    { header: 'Aceite de privacidade', key: 'aceitePrivacidade', width: 22 },
    { header: 'Criado em', key: 'criadoEm', width: 24 }
  ];

  contatos.forEach(function (contato) {
    planilha.addRow({
      id: contato.id,
      nome: contato.nome,
      telefone: contato.telefone,
      idade: contato.idade,
      bairro: contato.bairro,
      problema: contato.problema,
      descricaoProblema: contato.descricaoProblema,
      origemAtual: contato.origemAtual,
      eventos: (contato.eventos || []).map(function (evento) {
        return evento.nome;
      }).join(', '),
      statusContato: contato.statusContato,
      autorizacaoMensagens: contato.autorizacaoMensagens,
      autorizacaoLigacoes: contato.autorizacaoLigacoes,
      aceitePrivacidade: contato.aceitePrivacidade ? 'Sim' : 'Não',
      criadoEm: contato.criadoEm ? new Date(contato.criadoEm) : null
    });
  });

  planilha.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  planilha.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFF5C00' }
  };
  planilha.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: planilha.columns.length }
  };
  planilha.getColumn('criadoEm').numFmt = 'dd/mm/yyyy hh:mm';

  return pasta.xlsx.writeBuffer();
}

module.exports = {
  gerarResumo,
  gerarCsv,
  gerarExcel
};
