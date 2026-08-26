const path = require('path');
const { Readable } = require('stream');
const ExcelJS = require('exceljs');
const importacaoModel = require('./importacaoModel');
const criarAppError = require('../../utils/AppError');
const normalizarTelefone = require('../../utils/normalizarTelefone');
const formatarTelefone = require('../../utils/formatarTelefone');
const normalizarNomePessoa = require('../../utils/normalizarNomePessoa');
const categoriasProblema = require('../../config/categoriasProblema');
const configuracaoImportacao = require('../../config/importacao');
const bairroService = require('../bairros/bairroService');
const leitorVcf = require('./leitorVcf');

async function listar() {
  const importacoes = await importacaoModel.listar();

  return importacoes.map(function (importacao) {
    return {
      id: importacao.id,
      nomeArquivo: importacao.nome_arquivo,
      formato: importacao.formato,
      status: importacao.status,
      totalRecebido: importacao.total_recebido,
      criadoEm: importacao.criado_em,
      confirmadoEm: importacao.confirmado_em,
      totalContatosCriados: Number(importacao.total_contatos_criados || 0),
      origem: {
        id: importacao.origem_id,
        nome: importacao.origem_nome
      },
      responsavel: importacao.usuario_nome
    };
  });
}

async function excluir(importacaoIdRecebido) {
  const importacaoId = Number(importacaoIdRecebido);

  if (!Number.isInteger(importacaoId) || importacaoId < 1) {
    throw criarAppError('Identificador da importação inválido.', 400);
  }

  try {
    return await importacaoModel.excluir(importacaoId);
  } catch (erro) {
    if (erro.codigoAplicacao === 'IMPORTACAO_NAO_ENCONTRADA') {
      throw criarAppError('Importação não encontrada.', 404);
    }

    if (erro.codigoAplicacao === 'IMPORTACAO_EM_PROCESSAMENTO') {
      throw criarAppError('Não é possível excluir uma importação em processamento.', 409);
    }

    throw erro;
  }
}

function normalizarCabecalho(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function criarSlug(valor) {
  const slug = normalizarCabecalho(valor).replace(/_/g, '-');

  return slug || 'importacao';
}

function analisarCsv(texto) {
  const primeiraLinha = texto.split(/\r?\n/, 1)[0] || '';
  const delimitador = (primeiraLinha.match(/;/g) || []).length >
    (primeiraLinha.match(/,/g) || []).length ? ';' : ',';
  const linhas = [];
  let linha = [];
  let campo = '';
  let entreAspas = false;
  let indice;

  for (indice = 0; indice < texto.length; indice += 1) {
    const caractere = texto[indice];
    const proximo = texto[indice + 1];

    if (caractere === '"' && entreAspas && proximo === '"') {
      campo += '"';
      indice += 1;
    } else if (caractere === '"') {
      entreAspas = !entreAspas;
    } else if (caractere === delimitador && !entreAspas) {
      linha.push(campo);
      campo = '';
    } else if ((caractere === '\n' || caractere === '\r') && !entreAspas) {
      if (caractere === '\r' && proximo === '\n') {
        indice += 1;
      }
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else {
      campo += caractere;
    }
  }

  if (campo || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }

  return linhas;
}

function textoCelula(celula) {
  if (!celula) {
    return '';
  }

  if (celula.text !== undefined) {
    return String(celula.text).trim();
  }

  return String(celula.value || '').trim();
}

async function analisarXlsx(buffer) {
  const leitor = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(buffer), {
    worksheets: 'emit',
    sharedStrings: 'cache',
    styles: 'ignore',
    hyperlinks: 'ignore'
  });
  const linhas = [];
  let primeiraPlanilhaEncontrada = false;

  try {
    for await (const planilha of leitor) {
      if (primeiraPlanilhaEncontrada) {
        break;
      }

      primeiraPlanilhaEncontrada = true;

      for await (const linhaExcel of planilha) {
        const valores = [];
        let indice;

        for (indice = 1; indice <= linhaExcel.cellCount; indice += 1) {
          valores.push(textoCelula(linhaExcel.getCell(indice)));
        }

        linhas.push(valores);
      }
    }
  } catch (erro) {
    throw criarAppError(
      'Não foi possível ler o arquivo XLSX. Verifique se a planilha está válida.',
      400
    );
  }

  return linhas;
}

function detectarFormato(arquivo) {
  const extensao = path.extname(arquivo.originalname || '').toLowerCase();
  const inicioTexto = arquivo.buffer.subarray(0, 4096).toString('utf8').replace(/^\uFEFF/, '');
  const assinaturaZip = arquivo.buffer.length >= 4 &&
    arquivo.buffer[0] === 0x50 && arquivo.buffer[1] === 0x4B &&
    arquivo.buffer[2] === 0x03 && arquivo.buffer[3] === 0x04;

  if (assinaturaZip || extensao === '.xlsx') {
    return 'xlsx';
  }

  if (/BEGIN:VCARD/i.test(inicioTexto) || extensao === '.vcf') {
    return 'vcf';
  }

  if (extensao === '.csv') {
    return 'csv';
  }

  const primeiraLinha = inicioTexto.split(/\r?\n/, 1)[0] || '';
  const cabecalhos = primeiraLinha.split(/[;,]/).map(normalizarCabecalho);

  if (cabecalhos.some(function (cabecalho) {
    return ['telefone', 'celular', 'whatsapp'].includes(cabecalho);
  })) {
    return 'csv';
  }

  throw criarAppError(
    'Não foi possível identificar este arquivo. Selecione o arquivo de contatos do celular ou uma planilha válida.',
    400
  );
}

function converterLinhasParaObjetos(linhas) {
  if (linhas.length < 2) {
    return [];
  }

  const cabecalhos = linhas[0].map(normalizarCabecalho);

  return linhas.slice(1).map(function (valores, indiceLinha) {
    const objeto = {};

    cabecalhos.forEach(function (cabecalho, indiceColuna) {
      if (cabecalho) {
        objeto[cabecalho] = String(valores[indiceColuna] || '').trim();
      }
    });

    return {
      numeroLinha: indiceLinha + 2,
      valores: objeto
    };
  }).filter(function (linha) {
    return Object.keys(linha.valores).some(function (chave) {
      return linha.valores[chave] !== '';
    });
  });
}

function buscarValor(objeto, aliases) {
  let indice;

  for (indice = 0; indice < aliases.length; indice += 1) {
    if (objeto[aliases[indice]] !== undefined) {
      return objeto[aliases[indice]];
    }
  }

  return '';
}

function validarLinha(linha, telefonesDoArquivo, bairrosAtivos) {
  const valores = linha.valores;
  const telefone = buscarValor(valores, ['telefone', 'celular', 'whatsapp']);
  const telefoneNormalizado = normalizarTelefone(telefone);
  const nome = normalizarNomePessoa(
    buscarValor(valores, ['nome', 'nome_completo'])
  );
  const bairroInformado = buscarValor(valores, ['bairro']) || null;
  const bairro = bairroInformado
    ? bairroService.encontrarNomeCanonico(bairroInformado, bairrosAtivos)
    : null;
  const idadeTexto = buscarValor(valores, ['idade']);
  const problema = buscarValor(valores, ['categoria', 'categoria_problema', 'problema']) || null;
  const descricaoProblema = buscarValor(
    valores,
    ['descricao', 'descricao_problema', 'detalhes']
  ) || null;
  const idade = idadeTexto === '' ? null : Number(idadeTexto);
  const erros = [];

  if (telefoneNormalizado.length < 10 || telefoneNormalizado.length > 15) {
    erros.push('Telefone ausente ou inválido.');
  }

  if (telefoneNormalizado && telefonesDoArquivo.has(telefoneNormalizado)) {
    erros.push('Telefone duplicado no arquivo.');
  }

  if (nome && (nome.length < 2 || nome.length > 150)) {
    erros.push('Nome inválido.');
  }

  if (bairroInformado && !bairro) {
    erros.push('Bairro não pertence ao catálogo oficial do Rio de Janeiro.');
  }

  if (idade !== null && (!Number.isInteger(idade) || idade < 0 || idade > 32767)) {
    erros.push('Idade deve ser um número inteiro válido.');
  }

  if (problema && !categoriasProblema.includes(problema)) {
    erros.push('Categoria de problema inválida.');
  }

  if (descricaoProblema && descricaoProblema.length > 1000) {
    erros.push('Descrição possui mais de 1000 caracteres.');
  }

  if (telefoneNormalizado) {
    telefonesDoArquivo.add(telefoneNormalizado);
  }

  return {
    numeroLinha: linha.numeroLinha,
    dados: {
      telefone: formatarTelefone(telefoneNormalizado),
      telefoneNormalizado,
      nome,
      bairro,
      idade,
      problema,
      descricaoProblema
    },
    valida: erros.length === 0,
    erroValidacao: erros.length > 0 ? erros.join(' ') : null,
    resultado: erros.some(function (erro) {
      return erro === 'Telefone duplicado no arquivo.';
    }) ? 'duplicado' : (erros.length > 0 ? 'invalido' : 'pendente')
  };
}

async function preVisualizar(arquivo, nomeOrigem, usuario) {
  if (!arquivo) {
    throw criarAppError('Selecione um arquivo de contatos ou uma planilha.', 400);
  }

  if (typeof nomeOrigem !== 'string' || nomeOrigem.trim().length < 2) {
    throw criarAppError('Informe a origem da lista.', 400);
  }

  const formato = detectarFormato(arquivo);
  let matrizes;
  let objetos;

  if (formato === 'csv') {
    matrizes = analisarCsv(arquivo.buffer.toString('utf8').replace(/^\uFEFF/, ''));
    objetos = converterLinhasParaObjetos(matrizes);
  } else if (formato === 'xlsx') {
    matrizes = await analisarXlsx(arquivo.buffer);
    objetos = converterLinhasParaObjetos(matrizes);
  } else if (formato === 'vcf') {
    objetos = leitorVcf.analisarVcf(arquivo.buffer);
  }

  if (objetos.length === 0) {
    throw criarAppError('O arquivo não possui linhas de dados.', 400);
  }

  if (objetos.length > configuracaoImportacao.LIMITE_LINHAS) {
    throw criarAppError(
      'O arquivo excede o limite de ' + configuracaoImportacao.LIMITE_LINHAS + ' linhas.',
      400
    );
  }

  const telefones = new Set();
  const bairrosAtivos = await bairroService.listarNomesAtivos();
  const linhas = objetos.map(function (linha) {
    return validarLinha(linha, telefones, bairrosAtivos);
  });
  const origemTratada = nomeOrigem.trim();
  const importacao = await importacaoModel.criarPreVisualizacao({
    nomeArquivo: arquivo.originalname,
    formato,
    nomeOrigem: origemTratada,
    slugOrigem: criarSlug(origemTratada),
    usuarioId: usuario.id
  }, linhas);

  return {
    importacaoId: importacao.id,
    origem: importacao.origem,
    totalRecebido: linhas.length,
    validos: linhas.filter(function (linha) { return linha.valida; }).length,
    invalidos: linhas.filter(function (linha) { return !linha.valida; }).length,
    linhas: linhas.slice(0, 100).map(function (linha) {
      return {
        numeroLinha: linha.numeroLinha,
        dados: linha.dados,
        valida: linha.valida,
        erro: linha.erroValidacao
      };
    })
  };
}

async function confirmar(importacaoIdRecebido, usuario) {
  const importacaoId = Number(importacaoIdRecebido);

  if (!Number.isInteger(importacaoId) || importacaoId < 1) {
    throw criarAppError('Identificador da importação inválido.', 400);
  }

  try {
    return await importacaoModel.confirmar(importacaoId, usuario.id);
  } catch (erro) {
    if (erro.codigoAplicacao === 'IMPORTACAO_NAO_ENCONTRADA') {
      throw criarAppError('Importação não encontrada.', 404);
    }

    if (erro.codigoAplicacao === 'IMPORTACAO_PROCESSADA') {
      throw criarAppError('Esta importação já foi processada.', 409);
    }

    if (erro.codigoAplicacao === 'IMPORTACAO_EM_ANDAMENTO') {
      throw criarAppError(
        'Outra importação está sendo processada. Aguarde a conclusão e tente novamente.',
        409
      );
    }

    throw erro;
  }
}

module.exports = {
  preVisualizar,
  confirmar,
  excluir,
  listar
};
