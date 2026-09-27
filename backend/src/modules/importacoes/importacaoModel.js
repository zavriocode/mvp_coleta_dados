const banco = require('../../config/banco');
const configuracaoImportacao = require('../../config/importacao');
const historicoContatoModel = require('../contatos/historicoContatoModel');
const criarAppError = require('../../utils/AppError');

const TAMANHO_LOTE_PRE_VISUALIZACAO = configuracaoImportacao.TAMANHO_LOTE;

async function listar() {
  const resultado = await banco.query(`
    SELECT
      importacao.id,
      importacao.nome_arquivo,
      importacao.formato,
      importacao.status,
      importacao.total_recebido,
      importacao.criado_em,
      importacao.confirmado_em,
      (
        SELECT COUNT(*)::integer
        FROM importacao_linhas AS linha
        WHERE linha.importacao_id = importacao.id
          AND linha.resultado = 'criado'
          AND linha.contato_id IS NOT NULL
      ) AS total_contatos_criados,
      origem.id AS origem_id,
      origem.nome AS origem_nome,
      usuario.nome AS usuario_nome
    FROM importacoes AS importacao
    INNER JOIN origens AS origem ON origem.id = importacao.origem_id
    INNER JOIN usuarios AS usuario ON usuario.id = importacao.usuario_id
    ORDER BY importacao.criado_em DESC, importacao.id DESC
  `);

  return resultado.rows;
}

async function excluir(importacaoId) {
  const cliente = await banco.connect();

  try {
    await cliente.query('BEGIN');
    const resultado = await cliente.query(
      'SELECT id, status FROM importacoes WHERE id = $1 FOR UPDATE',
      [importacaoId]
    );

    if (!resultado.rows[0]) {
      const erro = new Error('Importação não encontrada.');
      erro.codigoAplicacao = 'IMPORTACAO_NAO_ENCONTRADA';
      throw erro;
    }

    if (resultado.rows[0].status === 'processando') {
      const erro = new Error('Importação em processamento.');
      erro.codigoAplicacao = 'IMPORTACAO_EM_PROCESSAMENTO';
      throw erro;
    }

    const contatosImportados = await cliente.query(
      `
        SELECT contato.id
        FROM contatos AS contato
        WHERE EXISTS (
          SELECT 1
          FROM importacao_linhas AS linha
          WHERE linha.importacao_id = $1
            AND linha.resultado = 'criado'
            AND linha.contato_id = contato.id
        )
        FOR UPDATE
      `,
      [importacaoId]
    );
    const contatosIds = contatosImportados.rows.map(function (contato) {
      return contato.id;
    });

    if (contatosIds.length > 0) {
      const participacoes = await cliente.query(
        `
          SELECT id, lote_original_id
          FROM campanha_participacoes
          WHERE contato_id = ANY($1::bigint[])
          FOR UPDATE
        `,
        [contatosIds]
      );
      const participacoesIds = participacoes.rows.map(function (participacao) {
        return participacao.id;
      });
      const lotesIds = Array.from(new Set(participacoes.rows.map(function (participacao) {
        return participacao.lote_original_id;
      })));

      if (participacoesIds.length > 0) {
        await cliente.query(
          'DELETE FROM historico_status_mensageria WHERE participacao_id = ANY($1::bigint[])',
          [participacoesIds]
        );
        await cliente.query(
          'DELETE FROM campanha_tentativas WHERE participacao_id = ANY($1::bigint[])',
          [participacoesIds]
        );
        await cliente.query(
          'DELETE FROM campanha_participacoes WHERE id = ANY($1::bigint[])',
          [participacoesIds]
        );
      }

      if (lotesIds.length > 0) {
        await cliente.query(
          `
            UPDATE campanha_lotes AS lote
            SET tamanho_efetivo = (
              SELECT COUNT(*)::integer
              FROM campanha_participacoes AS participacao
              WHERE participacao.lote_original_id = lote.id
            )
            WHERE lote.id = ANY($1::bigint[])
              AND EXISTS (
                SELECT 1
                FROM campanha_participacoes AS participacao
                WHERE participacao.lote_original_id = lote.id
              )
          `,
          [lotesIds]
        );
        await cliente.query(
          `
            DELETE FROM campanha_lotes AS lote
            WHERE lote.id = ANY($1::bigint[])
              AND NOT EXISTS (
                SELECT 1
                FROM campanha_participacoes AS participacao
                WHERE participacao.lote_original_id = lote.id
              )
          `,
          [lotesIds]
        );
      }

      await cliente.query(
        'DELETE FROM contatos WHERE id = ANY($1::bigint[])',
        [contatosIds]
      );
    }

    await cliente.query('DELETE FROM importacoes WHERE id = $1', [importacaoId]);
    await cliente.query('COMMIT');

    return {
      importacaoId,
      totalContatosExcluidos: contatosIds.length
    };
  } catch (erro) {
    await cliente.query('ROLLBACK');
    throw erro;
  } finally {
    cliente.release();
  }
}

async function obterOuCriarOrigem(cliente, nome, slugBase) {
  const existente = await cliente.query(
    `
      SELECT id, nome
      FROM origens
      WHERE LOWER(nome) = LOWER($1)
        AND tipo = 'importacao'
      LIMIT 1
    `,
    [nome]
  );

  if (existente.rows[0]) {
    return existente.rows[0];
  }

  let slug = slugBase;
  let tentativa = 0;

  while (tentativa < 5) {
    const insercao = await cliente.query(
      `
        INSERT INTO origens (nome, slug, tipo, ativa)
        VALUES ($1, $2, 'importacao', TRUE)
        ON CONFLICT DO NOTHING
        RETURNING id, nome
      `,
      [nome, slug]
    );

    if (insercao.rows[0]) {
      return insercao.rows[0];
    }

    tentativa += 1;
    slug = slugBase + '-' + tentativa;
  }

  throw new Error('Não foi possível criar uma origem para a importação.');
}

async function criarPreVisualizacao(dados, linhas) {
  const cliente = await banco.connect();

  try {
    await cliente.query('BEGIN');
    const origem = await obterOuCriarOrigem(cliente, dados.nomeOrigem, dados.slugOrigem);
    const importacao = await cliente.query(
      `
        INSERT INTO importacoes (
          nome_arquivo, formato, origem_id, usuario_id, total_recebido, relatorio
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        RETURNING id
      `,
      [dados.nomeArquivo, dados.formato, origem.id, dados.usuarioId, linhas.length,
        JSON.stringify({ consentimentoMigrado: dados.consentimentoMigrado === true })]
    );
    let inicioLote;

    for (
      inicioLote = 0;
      inicioLote < linhas.length;
      inicioLote += TAMANHO_LOTE_PRE_VISUALIZACAO
    ) {
      const lote = linhas
        .slice(inicioLote, inicioLote + TAMANHO_LOTE_PRE_VISUALIZACAO)
        .map(function (linha) {
          return {
            numero_linha: linha.numeroLinha,
            dados: linha.dados,
            valida: linha.valida,
            erro_validacao: linha.erroValidacao,
            resultado: linha.resultado
          };
        });

      await cliente.query(
        `
          INSERT INTO importacao_linhas (
            importacao_id, numero_linha, dados, valida, erro_validacao, resultado
          )
          SELECT
            $1,
            linha.numero_linha,
            linha.dados,
            linha.valida,
            linha.erro_validacao,
            linha.resultado
          FROM jsonb_to_recordset($2::jsonb) AS linha (
            numero_linha INTEGER,
            dados JSONB,
            valida BOOLEAN,
            erro_validacao TEXT,
            resultado VARCHAR(30)
          )
          ORDER BY linha.numero_linha
        `,
        [importacao.rows[0].id, JSON.stringify(lote)]
      );
    }

    await cliente.query('COMMIT');

    return {
      id: importacao.rows[0].id,
      origem
    };
  } catch (erro) {
    await cliente.query('ROLLBACK');
    throw erro;
  } finally {
    cliente.release();
  }
}

function valorVazio(valor) {
  return valor === null || valor === undefined || (
    typeof valor === 'string' && valor.trim() === ''
  );
}

async function criarContatoImportado(cliente, dados, origem) {
  const resultado = await cliente.query(
    `
      INSERT INTO contatos (
        nome, telefone, telefone_normalizado, bairro, problema,
        consentimento_armazenamento, consentimento_mensagens,
        consentimento_armazenamento_em, consentimento_mensagens_em,
        consentimento_tratamento_dados, consentimento_whatsapp,
        consentimento_ligacoes, origem_atual, status_contato,
        bloqueado_para_mensagens, atualizado_em,
        origem_id, idade, descricao_problema
      )
      VALUES (
        $1, $2, $3, $4, $5,
        TRUE, FALSE, CURRENT_TIMESTAMP, NULL,
        NULL, NULL, NULL, $6, 'importado',
        FALSE, CURRENT_TIMESTAMP,
        $7, $8, $9
      )
      ON CONFLICT (telefone_normalizado) DO NOTHING
      RETURNING id
    `,
    [
      dados.nome,
      dados.telefone,
      dados.telefoneNormalizado,
      dados.bairro,
      dados.problema,
      origem.nome,
      origem.id,
      dados.idade,
      dados.descricaoProblema
    ]
  );

  return resultado.rows[0] || null;
}

async function criarContatosImportadosEmLote(cliente, linhas, origem) {
  const registros = linhas.map(function (linha) {
    return {
      nome: linha.dados.nome,
      telefone: linha.dados.telefone,
      telefone_normalizado: linha.dados.telefoneNormalizado,
      bairro: linha.dados.bairro,
      problema: linha.dados.problema,
      idade: linha.dados.idade,
      descricao_problema: linha.dados.descricaoProblema
    };
  });
  const resultado = await cliente.query(
    `
      INSERT INTO contatos (
        nome, telefone, telefone_normalizado, bairro, problema,
        consentimento_armazenamento, consentimento_mensagens,
        consentimento_armazenamento_em, consentimento_mensagens_em,
        consentimento_tratamento_dados, consentimento_whatsapp,
        consentimento_ligacoes, origem_atual, status_contato,
        bloqueado_para_mensagens, atualizado_em,
        origem_id, idade, descricao_problema
      )
      SELECT
        registro.nome,
        registro.telefone,
        registro.telefone_normalizado,
        registro.bairro,
        registro.problema,
        TRUE,
        FALSE,
        CURRENT_TIMESTAMP,
        NULL,
        NULL,
        NULL,
        NULL,
        $2,
        'importado',
        FALSE,
        CURRENT_TIMESTAMP,
        $3,
        registro.idade,
        registro.descricao_problema
      FROM jsonb_to_recordset($1::jsonb) AS registro (
        nome VARCHAR(150),
        telefone VARCHAR(30),
        telefone_normalizado VARCHAR(15),
        bairro VARCHAR(150),
        problema VARCHAR(200),
        idade INTEGER,
        descricao_problema TEXT
      )
      ON CONFLICT (telefone_normalizado) DO NOTHING
      RETURNING id, telefone_normalizado
    `,
    [JSON.stringify(registros), origem.nome, origem.id]
  );

  return resultado.rows;
}

async function complementarContatoImportado(cliente, contato, dados, origem, usuarioId) {
  const campos = [
    { coluna: 'nome', propriedade: 'nome' },
    { coluna: 'bairro', propriedade: 'bairro' },
    { coluna: 'problema', propriedade: 'problema' },
    { coluna: 'idade', propriedade: 'idade' },
    { coluna: 'descricao_problema', propriedade: 'descricaoProblema' }
  ];
  const atribuicoes = [];
  const valores = [];
  const anteriores = {};
  const novos = {};

  campos.forEach(function (campo) {
    if (valorVazio(contato[campo.coluna]) && !valorVazio(dados[campo.propriedade])) {
      valores.push(dados[campo.propriedade]);
      atribuicoes.push(campo.coluna + ' = $' + valores.length);
      anteriores[campo.propriedade] = contato[campo.coluna];
      novos[campo.propriedade] = dados[campo.propriedade];
    }
  });

  if (atribuicoes.length === 0) {
    return [];
  }

  valores.push(contato.id);
  atribuicoes.push('atualizado_em = CURRENT_TIMESTAMP');
  await cliente.query(
    'UPDATE contatos SET ' + atribuicoes.join(', ') + ' WHERE id = $' + valores.length,
    valores
  );
  await historicoContatoModel.registrar(cliente, contato.id, {
    tipoEvento: 'complemento_importacao',
    dadosAnteriores: anteriores,
    dadosNovos: novos,
    origemId: origem.id,
    registradoPorUsuarioId: usuarioId
  });

  return Object.keys(novos);
}

async function buscarContatosPorTelefones(cliente, telefones) {
  if (telefones.length === 0) {
    return new Map();
  }

  const resultado = await cliente.query(
    'SELECT * FROM contatos WHERE telefone_normalizado = ANY($1::varchar[]) FOR UPDATE',
    [telefones]
  );
  const contatos = new Map();

  resultado.rows.forEach(function (contato) {
    contatos.set(contato.telefone_normalizado, contato);
  });

  return contatos;
}

async function atualizarResultadosEmLote(cliente, resultados) {
  if (resultados.length === 0) {
    return;
  }

  await cliente.query(
    `
      UPDATE importacao_linhas AS destino
      SET resultado = registro.resultado,
          contato_id = registro.contato_id
      FROM jsonb_to_recordset($1::jsonb) AS registro (
        linha_id BIGINT,
        resultado VARCHAR(30),
        contato_id BIGINT
      )
      WHERE destino.id = registro.linha_id
    `,
    [JSON.stringify(resultados)]
  );
}

async function processarLote(cliente, linhas, origem, usuarioId) {
  const contatosCriados = await criarContatosImportadosEmLote(cliente, linhas, origem);
  const criadosPorTelefone = new Map();

  contatosCriados.forEach(function (contato) {
    criadosPorTelefone.set(contato.telefone_normalizado, contato);
  });

  const telefonesExistentes = linhas.filter(function (linha) {
    return !criadosPorTelefone.has(linha.dados.telefoneNormalizado);
  }).map(function (linha) {
    return linha.dados.telefoneNormalizado;
  });
  const existentesPorTelefone = await buscarContatosPorTelefones(
    cliente,
    telefonesExistentes
  );
  const resultados = [];
  let indice;

  for (indice = 0; indice < linhas.length; indice += 1) {
    const linha = linhas[indice];
    const telefoneNormalizado = linha.dados.telefoneNormalizado;
    const contatoCriado = criadosPorTelefone.get(telefoneNormalizado);

    if (contatoCriado) {
      resultados.push({
        linha_id: linha.id,
        resultado: 'criado',
        contato_id: contatoCriado.id
      });
      continue;
    }

    const contatoExistente = existentesPorTelefone.get(telefoneNormalizado);

    if (!contatoExistente) {
      throw new Error('Contato existente não localizado após conflito de telefone.');
    }

    const campos = await complementarContatoImportado(
      cliente,
      contatoExistente,
      linha.dados,
      origem,
      usuarioId
    );
    resultados.push({
      linha_id: linha.id,
      resultado: campos.length > 0 ? 'complementado' : 'ignorado',
      contato_id: contatoExistente.id
    });
  }

  await atualizarResultadosEmLote(cliente, resultados);

  return resultados;
}

function registrarResultado(relatorio, resultado) {
  const propriedades = {
    criado: 'criados',
    complementado: 'complementados',
    ignorado: 'ignorados'
  };
  const propriedade = propriedades[resultado];

  if (propriedade) {
    relatorio[propriedade] += 1;
  }
}

async function processarLinhaIndividual(cliente, linha, origem, usuarioId, relatorio) {
  await cliente.query('SAVEPOINT processar_linha');

  try {
    const dados = linha.dados;
    const contatoCriado = await criarContatoImportado(cliente, dados, origem);
    let contatoId;
    let resultadoLinha;

    if (contatoCriado) {
      contatoId = contatoCriado.id;
      resultadoLinha = 'criado';
    } else {
      const existente = await cliente.query(
        'SELECT * FROM contatos WHERE telefone_normalizado = $1 FOR UPDATE',
        [dados.telefoneNormalizado]
      );
      const campos = await complementarContatoImportado(
        cliente,
        existente.rows[0],
        dados,
        origem,
        usuarioId
      );
      contatoId = existente.rows[0].id;
      resultadoLinha = campos.length > 0 ? 'complementado' : 'ignorado';
    }

    await cliente.query(
      'UPDATE importacao_linhas SET resultado = $1, contato_id = $2 WHERE id = $3',
      [resultadoLinha, contatoId, linha.id]
    );
    await cliente.query('RELEASE SAVEPOINT processar_linha');
    registrarResultado(relatorio, resultadoLinha);
  } catch (erroLinha) {
    await cliente.query('ROLLBACK TO SAVEPOINT processar_linha');
    relatorio.erros.push({ linha: linha.numero_linha, erro: erroLinha.message });
    await cliente.query(
      "UPDATE importacao_linhas SET resultado = 'erro', erro_validacao = $1 WHERE id = $2",
      [erroLinha.message, linha.id]
    );
    await cliente.query('RELEASE SAVEPOINT processar_linha');
  }
}

async function confirmar(importacaoId, usuarioId, perfil) {
  const cliente = await banco.connect();

  try {
    await cliente.query('BEGIN');
    const bloqueio = await cliente.query(
      'SELECT pg_try_advisory_xact_lock($1, $2) AS obtido',
      [configuracaoImportacao.CHAVE_BLOQUEIO_1, configuracaoImportacao.CHAVE_BLOQUEIO_2]
    );

    if (!bloqueio.rows[0].obtido) {
      const erro = new Error('Outra importação está sendo processada.');
      erro.codigoAplicacao = 'IMPORTACAO_EM_ANDAMENTO';
      throw erro;
    }

    const importacao = await cliente.query(
      `
        SELECT importacao.*, origem.nome AS origem_nome
        FROM importacoes AS importacao
        INNER JOIN origens AS origem ON origem.id = importacao.origem_id
        WHERE importacao.id = $1
        FOR UPDATE
      `,
      [importacaoId]
    );

    if (!importacao.rows[0]) {
      const erro = new Error('Importação não encontrada.');
      erro.codigoAplicacao = 'IMPORTACAO_NAO_ENCONTRADA';
      throw erro;
    }

    if (importacao.rows[0].status !== 'pre_visualizada') {
      const erro = new Error('Importação já processada.');
      erro.codigoAplicacao = 'IMPORTACAO_PROCESSADA';
      throw erro;
    }

    const consentimentoMigrado = importacao.rows[0].relatorio?.consentimentoMigrado === true;
    if (consentimentoMigrado && perfil !== 'administrador') {
      throw criarAppError('Somente administradores podem confirmar consentimento prévio.', 403);
    }

    await cliente.query(
      "UPDATE importacoes SET status = 'processando' WHERE id = $1",
      [importacaoId]
    );
    const linhas = await cliente.query(
      'SELECT * FROM importacao_linhas WHERE importacao_id = $1 ORDER BY numero_linha',
      [importacaoId]
    );
    const relatorio = {
      totalRecebido: linhas.rowCount,
      criados: 0,
      complementados: 0,
      ignorados: 0,
      duplicados: 0,
      invalidos: 0,
      erros: []
    };
    const origem = {
      id: importacao.rows[0].origem_id,
      nome: importacao.rows[0].origem_nome
    };
    const linhasValidas = [];
    let indice;

    for (indice = 0; indice < linhas.rows.length; indice += 1) {
      const linha = linhas.rows[indice];

      if (!linha.valida) {
        const resultadoInvalido = linha.resultado === 'duplicado' ? 'duplicado' : 'invalido';
        relatorio[resultadoInvalido === 'duplicado' ? 'duplicados' : 'invalidos'] += 1;
        relatorio.erros.push({ linha: linha.numero_linha, erro: linha.erro_validacao });
        continue;
      }

      linhasValidas.push(linha);
    }

    let inicioLote;

    for (
      inicioLote = 0;
      inicioLote < linhasValidas.length;
      inicioLote += configuracaoImportacao.TAMANHO_LOTE
    ) {
      const lote = linhasValidas.slice(
        inicioLote,
        inicioLote + configuracaoImportacao.TAMANHO_LOTE
      );

      await cliente.query('SAVEPOINT processar_lote');

      try {
        const resultados = await processarLote(cliente, lote, origem, usuarioId);
        await cliente.query('RELEASE SAVEPOINT processar_lote');
        resultados.forEach(function (resultado) {
          registrarResultado(relatorio, resultado.resultado);
        });
      } catch (erroLote) {
        await cliente.query('ROLLBACK TO SAVEPOINT processar_lote');
        await cliente.query('RELEASE SAVEPOINT processar_lote');

        for (indice = 0; indice < lote.length; indice += 1) {
          await processarLinhaIndividual(
            cliente,
            lote[indice],
            origem,
            usuarioId,
            relatorio
          );
        }
      }
    }

    if (consentimentoMigrado) {
      // Somente IDs efetivamente criados nesta transação. ON CONFLICT e contatos
      // existentes nunca concedem autorização nem substituem recusas/revogações.
      const migrados = await cliente.query(`
        INSERT INTO consentimentos (
          contato_id, contato_id_original, tipo, resposta, texto_apresentado,
          versao_texto, canal, origem_registro, registrado_por_usuario_id,
          ativo, estado, origem_id
        )
        SELECT contato.id, contato.id, 'mensagens', TRUE,
          'Consentimento prévio declarado pelo administrador: sistema/base anterior. '
          || 'Evidência externa: arquivo ' || $3 || '. Não coletado pelo ACORDA RJ.',
          'consentimento-migrado-v1', 'importacao', 'migracao_legado', $2,
          TRUE, 'autorizado', $4
        FROM contatos AS contato
        WHERE EXISTS (
          SELECT 1 FROM importacao_linhas AS linha
          WHERE linha.importacao_id = $1 AND linha.resultado = 'criado'
            AND linha.contato_id = contato.id
        )
          AND contato.bloqueado_para_mensagens = FALSE
          AND contato.consentimento_whatsapp IS NULL
          AND NOT EXISTS (SELECT 1 FROM consentimentos c WHERE c.contato_id = contato.id)
        RETURNING contato_id
      `, [importacaoId, usuarioId, importacao.rows[0].nome_arquivo, origem.id]);
      const ids = migrados.rows.map(item => item.contato_id);
      await cliente.query(`
        UPDATE contatos SET consentimento_mensagens = TRUE,
          consentimento_mensagens_em = CURRENT_TIMESTAMP, consentimento_whatsapp = TRUE,
          consentimentos_atualizados_em = CURRENT_TIMESTAMP
        WHERE id = ANY($1::bigint[])
      `, [ids]);
      await cliente.query(`
        INSERT INTO historico_contatos (
          contato_id, tipo_evento, dados_anteriores, dados_novos, origem_id,
          registrado_por_usuario_id
        )
        SELECT id, 'consentimento_migrado', '{}'::jsonb, $2::jsonb, $3, $4
        FROM contatos WHERE id = ANY($1::bigint[])
      `, [ids, JSON.stringify({ importacaoId, nomeArquivo: importacao.rows[0].nome_arquivo,
        origemConsentimento: 'sistema/base anterior', consentimentoWhatsapp: true,
        coletadoPeloAcordaRJ: false }), origem.id, usuarioId]);
      relatorio.consentimentoMigrado = true;
      relatorio.totalConsentimentosMigrados = ids.length;
      relatorio.origemConsentimento = 'sistema/base anterior';
      relatorio.administradorResponsavelId = usuarioId;
      relatorio.importacaoId = importacaoId;
      relatorio.nomeArquivo = importacao.rows[0].nome_arquivo;
      relatorio.totalImportado = relatorio.criados;
      relatorio.registradoEm = (await cliente.query('SELECT CURRENT_TIMESTAMP AS data')).rows[0].data;
    }

    await cliente.query(
      `
        UPDATE importacoes
        SET status = 'concluida', relatorio = $1::jsonb, confirmado_em = CURRENT_TIMESTAMP
        WHERE id = $2
      `,
      [JSON.stringify(relatorio), importacaoId]
    );
    await cliente.query('COMMIT');

    return relatorio;
  } catch (erro) {
    await cliente.query('ROLLBACK');
    throw erro;
  } finally {
    cliente.release();
  }
}

module.exports = {
  criarPreVisualizacao,
  confirmar,
  excluir,
  listar
};
