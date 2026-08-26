const banco = require('../../config/banco');
const consentimentoModel = require('./consentimentoModel');
const aceitePrivacidadeModel = require('./aceitePrivacidadeModel');
const historicoContatoModel = require('./historicoContatoModel');
const textoFormularioModel = require('./textoFormularioModel');
const eventoModel = require('../eventos/eventoModel');

async function buscarOrigemFormularioPublico(cliente) {
  const resultado = await cliente.query(
    `
      SELECT id, nome
      FROM origens
      WHERE slug = 'formulario-publico'
        AND ativa = TRUE
      LIMIT 1
    `
  );

  if (!resultado.rows[0]) {
    throw new Error('A origem formulario-publico não está configurada.');
  }

  return resultado.rows[0];
}

function campoEstaVazio(valor) {
  return valor === null || valor === undefined || (
    typeof valor === 'string' && valor.trim() === ''
  );
}

function normalizarNomeParaComparacao(nome) {
  if (typeof nome !== 'string') {
    return '';
  }

  return nome
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function nomesCorrespondem(nomeAtual, nomeInformado) {
  const nomeAtualNormalizado = normalizarNomeParaComparacao(nomeAtual);
  const nomeInformadoNormalizado = normalizarNomeParaComparacao(nomeInformado);

  return Boolean(
    nomeAtualNormalizado &&
    nomeInformadoNormalizado &&
    nomeAtualNormalizado === nomeInformadoNormalizado
  );
}

async function criarContatoPublico(cliente, dadosDoContato, origem) {
  const consulta = `
    INSERT INTO contatos (
      nome,
      telefone,
      telefone_normalizado,
      bairro,
      problema,
      consentimento_armazenamento,
      consentimento_mensagens,
      consentimento_armazenamento_em,
      consentimento_mensagens_em,
      consentimento_tratamento_dados,
      consentimento_whatsapp,
      consentimento_ligacoes,
      consentimentos_atualizados_em,
      origem_atual,
      status_contato,
      bloqueado_para_mensagens,
      atualizado_em,
      origem_id,
      idade
    )
    VALUES (
      $1, $2, $3, $4, $5,
      TRUE, FALSE, CURRENT_TIMESTAMP, NULL,
      NULL, NULL, NULL, NULL,
      $6, 'ativo', FALSE, CURRENT_TIMESTAMP,
      $7, $8
    )
    ON CONFLICT (telefone_normalizado) DO NOTHING
    RETURNING *
  `;
  const valores = [
    dadosDoContato.nome,
    dadosDoContato.telefone,
    dadosDoContato.telefoneNormalizado,
    dadosDoContato.bairro,
    dadosDoContato.problema,
    origem.nome,
    origem.id,
    dadosDoContato.idade
  ];
  const resultado = await cliente.query(consulta, valores);

  return resultado.rows[0] || null;
}

async function buscarContatoParaAtualizacao(cliente, telefoneNormalizado) {
  const resultado = await cliente.query(
    `
      SELECT *
      FROM contatos
      WHERE telefone_normalizado = $1
      LIMIT 1
      FOR UPDATE
    `,
    [telefoneNormalizado]
  );

  return resultado.rows[0] || null;
}

async function complementarCamposVazios(cliente, contato, dadosDoContato, origemId) {
  const campos = [
    { coluna: 'nome', propriedade: 'nome' },
    { coluna: 'bairro', propriedade: 'bairro' },
    { coluna: 'problema', propriedade: 'problema' },
    { coluna: 'idade', propriedade: 'idade' }
  ];
  const atribuicoes = [];
  const valores = [];
  const dadosAnteriores = {};
  const dadosNovos = {};

  campos.forEach(function (campo) {
    const valorAtual = contato[campo.coluna];
    const valorRecebido = dadosDoContato[campo.propriedade];

    if (campoEstaVazio(valorAtual) && !campoEstaVazio(valorRecebido)) {
      valores.push(valorRecebido);
      atribuicoes.push(campo.coluna + ' = $' + valores.length);
      dadosAnteriores[campo.propriedade] = valorAtual;
      dadosNovos[campo.propriedade] = valorRecebido;
    }
  });

  if (atribuicoes.length === 0) {
    return [];
  }

  valores.push(contato.id);
  atribuicoes.push('atualizado_em = CURRENT_TIMESTAMP');

  await cliente.query(
    'UPDATE contatos SET ' + atribuicoes.join(', ') +
      ' WHERE id = $' + valores.length,
    valores
  );
  await historicoContatoModel.registrar(cliente, contato.id, {
    tipoEvento: 'complemento_cadastro_publico',
    dadosAnteriores,
    dadosNovos,
    origemId,
    registradoPorUsuarioId: null
  });

  return Object.keys(dadosNovos);
}

async function registrarDivergenciasEvento(
  cliente,
  contato,
  dadosDoContato,
  origemId,
  eventoId
) {
  const campos = [
    { coluna: 'nome', propriedade: 'nome' },
    { coluna: 'bairro', propriedade: 'bairro' },
    { coluna: 'problema', propriedade: 'problema' },
    { coluna: 'idade', propriedade: 'idade' }
  ];
  const dadosAnteriores = {};
  const dadosInformados = {};

  campos.forEach(function (campo) {
    const valorAtual = contato[campo.coluna];
    const valorRecebido = dadosDoContato[campo.propriedade];

    if (
      !campoEstaVazio(valorAtual) &&
      !campoEstaVazio(valorRecebido) &&
      String(valorAtual).trim() !== String(valorRecebido).trim()
    ) {
      dadosAnteriores[campo.propriedade] = valorAtual;
      dadosInformados[campo.propriedade] = valorRecebido;
    }
  });

  if (Object.keys(dadosInformados).length === 0) {
    return [];
  }

  const contextoAnterior = {
    eventoId,
    campos: dadosAnteriores
  };
  const contextoInformado = {
    eventoId,
    campos: dadosInformados
  };
  const historicoExistente = await cliente.query(
    `
      SELECT id
      FROM historico_contatos
      WHERE contato_id = $1
        AND tipo_evento = 'divergencia_cadastro_publico_evento'
        AND dados_anteriores = $2::jsonb
        AND dados_novos = $3::jsonb
        AND origem_id = $4
      LIMIT 1
    `,
    [
      contato.id,
      JSON.stringify(contextoAnterior),
      JSON.stringify(contextoInformado),
      origemId
    ]
  );

  if (historicoExistente.rows[0]) {
    return Object.keys(dadosInformados);
  }

  await historicoContatoModel.registrar(cliente, contato.id, {
    tipoEvento: 'divergencia_cadastro_publico_evento',
    dadosAnteriores: contextoAnterior,
    dadosNovos: contextoInformado,
    origemId,
    registradoPorUsuarioId: null
  });

  return Object.keys(dadosInformados);
}

async function atualizarDadosDeclaradosNoEvento(
  cliente,
  contato,
  dadosDoContato,
  origemId,
  eventoId
) {
  const campos = [
    { coluna: 'nome', propriedade: 'nome' },
    { coluna: 'bairro', propriedade: 'bairro' },
    { coluna: 'problema', propriedade: 'problema' },
    { coluna: 'idade', propriedade: 'idade' }
  ];
  const atribuicoes = [];
  const valores = [];
  const dadosAnteriores = {};
  const dadosNovos = {};

  campos.forEach(function (campo) {
    const valorAtual = contato[campo.coluna];
    const valorRecebido = dadosDoContato[campo.propriedade];
    const valoresIguais = campo.propriedade === 'nome'
      ? nomesCorrespondem(valorAtual, valorRecebido)
      : String(valorAtual).trim() === String(valorRecebido).trim();

    if (!valoresIguais) {
      valores.push(valorRecebido);
      atribuicoes.push(campo.coluna + ' = $' + valores.length);
      dadosAnteriores[campo.propriedade] = valorAtual;
      dadosNovos[campo.propriedade] = valorRecebido;
    }
  });

  if (atribuicoes.length === 0) {
    return [];
  }

  valores.push(contato.id);
  atribuicoes.push('atualizado_em = CURRENT_TIMESTAMP');

  await cliente.query(
    'UPDATE contatos SET ' + atribuicoes.join(', ') +
      ' WHERE id = $' + valores.length,
    valores
  );
  await historicoContatoModel.registrar(cliente, contato.id, {
    tipoEvento: 'atualizacao_cadastro_publico_evento',
    dadosAnteriores: {
      eventoId,
      campos: dadosAnteriores
    },
    dadosNovos: {
      eventoId,
      campos: dadosNovos
    },
    origemId,
    registradoPorUsuarioId: null
  });

  return Object.keys(dadosNovos);
}

async function vincularContatoAoEvento(cliente, contatoId, eventoId) {
  const resultado = await cliente.query(
    `
      INSERT INTO contato_eventos (contato_id, evento_id)
      VALUES ($1, $2)
      ON CONFLICT (contato_id, evento_id) DO NOTHING
      RETURNING id
    `,
    [contatoId, eventoId]
  );

  return Boolean(resultado.rows[0]);
}

async function registrarPrivacidadeEAutorizacoes(
  cliente,
  contatoId,
  dadosDoContato,
  origem,
  textos
) {
  await aceitePrivacidadeModel.registrarSeDiferente(cliente, contatoId, {
    texto: textos.aviso_privacidade.texto,
    versao: textos.aviso_privacidade.versao,
    origemId: origem.id,
    canal: 'formulario_publico',
    registradoPorUsuarioId: null
  });

  if (dadosDoContato.autorizacaoMensagens === true) {
    await consentimentoModel.registrarAutorizacaoSeDiferente(cliente, contatoId, {
      tipo: 'mensagens',
      texto: textos.mensagens.texto,
      versao: textos.mensagens.versao,
      origemId: origem.id,
      canal: 'formulario_publico',
      registradoPorUsuarioId: null
    });
    await cliente.query(
      `
        UPDATE contatos
        SET bloqueado_para_mensagens = FALSE,
            atualizado_em = CURRENT_TIMESTAMP
        WHERE id = $1
          AND NOT EXISTS (
            SELECT 1
            FROM solicitacoes_exclusao AS solicitacao
            WHERE solicitacao.contato_id = contatos.id
              AND solicitacao.status = 'pendente'
          )
      `,
      [contatoId]
    );
  }

  if (dadosDoContato.autorizacaoLigacoes === true) {
    await consentimentoModel.registrarAutorizacaoSeDiferente(cliente, contatoId, {
      tipo: 'ligacoes',
      texto: textos.ligacoes.texto,
      versao: textos.ligacoes.versao,
      origemId: origem.id,
      canal: 'formulario_publico',
      registradoPorUsuarioId: null
    });
    await cliente.query(
      `
        UPDATE contatos
        SET bloqueado_para_ligacoes = FALSE,
            atualizado_em = CURRENT_TIMESTAMP
        WHERE id = $1
          AND NOT EXISTS (
            SELECT 1
            FROM solicitacoes_exclusao AS solicitacao
            WHERE solicitacao.contato_id = contatos.id
              AND solicitacao.status = 'pendente'
          )
      `,
      [contatoId]
    );
  }
}

async function salvarCadastroPublico(dadosDoContato) {
  const cliente = await banco.connect();

  try {
    await cliente.query('BEGIN');
    const origem = await buscarOrigemFormularioPublico(cliente);
    const textos = await textoFormularioModel.buscarAtivos(cliente);
    const eventoAtivo = Number.isInteger(dadosDoContato.eventoIdExibido)
      ? await eventoModel.buscarDisponivelPorId(dadosDoContato.eventoIdExibido, cliente)
      : null;

    if (
      Number.isInteger(dadosDoContato.eventoIdExibido) &&
      !eventoAtivo
    ) {
      const erroContexto = new Error('O contexto de evento do formulário foi alterado.');
      erroContexto.codigoAplicacao = 'CONTEXTO_EVENTO_ALTERADO';
      throw erroContexto;
    }

    if (!textos.aviso_privacidade || !textos.mensagens || !textos.ligacoes) {
      throw new Error('Os textos ativos do formulário não estão completos.');
    }

    let contato = await criarContatoPublico(cliente, dadosDoContato, origem);
    let contatoCriado = true;
    let camposComplementados = [];
    let vinculoEventoCriado = false;

    if (!contato) {
      contatoCriado = false;
      contato = await buscarContatoParaAtualizacao(
        cliente,
        dadosDoContato.telefoneNormalizado
      );

      if (!contato) {
        throw new Error('Não foi possível localizar o contato concorrente.');
      }

      if (
        eventoAtivo &&
        !nomesCorrespondem(
          contato.nome,
          dadosDoContato.nomeConfirmacao || dadosDoContato.nome
        )
      ) {
        const erroIdentidade = new Error('Não foi possível confirmar os dados informados.');
        erroIdentidade.codigoAplicacao = 'IDENTIDADE_EVENTO_NAO_CONFIRMADA';
        throw erroIdentidade;
      }

      if (eventoAtivo && dadosDoContato.atualizarDadosEvento === true) {
        camposComplementados = await atualizarDadosDeclaradosNoEvento(
          cliente,
          contato,
          dadosDoContato,
          origem.id,
          eventoAtivo.id
        );
      } else {
        camposComplementados = await complementarCamposVazios(
          cliente,
          contato,
          dadosDoContato,
          origem.id
        );
      }

      if (eventoAtivo && dadosDoContato.atualizarDadosEvento !== true) {
        await registrarDivergenciasEvento(
          cliente,
          contato,
          dadosDoContato,
          origem.id,
          eventoAtivo.id
        );
      }
    }

    await registrarPrivacidadeEAutorizacoes(
      cliente,
      contato.id,
      dadosDoContato,
      origem,
      textos
    );

    if (eventoAtivo) {
      vinculoEventoCriado = await vincularContatoAoEvento(
        cliente,
        contato.id,
        eventoAtivo.id
      );
    }

    await cliente.query('COMMIT');

    return {
      contatoCriado,
      camposComplementados,
      vinculoEventoCriado,
      eventoAtivo
    };
  } catch (erro) {
    await cliente.query('ROLLBACK');
    throw erro;
  } finally {
    cliente.release();
  }
}

async function verificarContatoParaEvento(dadosIdentificacao) {
  const eventoAtivo = await eventoModel.buscarDisponivelPorId(
    dadosIdentificacao.eventoIdExibido
  );

  if (!eventoAtivo) {
    const erroContexto = new Error('O contexto de evento do formulário foi alterado.');
    erroContexto.codigoAplicacao = 'CONTEXTO_EVENTO_ALTERADO';
    throw erroContexto;
  }

  if (!eventoAtivo) {
    const erroSemEvento = new Error('Não há evento ativo para esta operação.');
    erroSemEvento.codigoAplicacao = 'EVENTO_NAO_ATIVO';
    throw erroSemEvento;
  }

  const resultado = await banco.query(
    `
      SELECT
        contato.id,
        contato.nome,
        EXISTS (
          SELECT 1
          FROM contato_eventos AS vinculo
          WHERE vinculo.contato_id = contato.id
            AND vinculo.evento_id = $2
        ) AS ja_inscrito
      FROM contatos AS contato
      WHERE contato.telefone_normalizado = $1
      LIMIT 1
    `,
    [dadosIdentificacao.telefoneNormalizado, eventoAtivo.id]
  );
  const contato = resultado.rows[0] || null;

  if (!contato) {
    return {
      situacao: 'novo',
      eventoAtivo
    };
  }

  if (!nomesCorrespondem(contato.nome, dadosIdentificacao.nome)) {
    const erroIdentidade = new Error('Não foi possível confirmar os dados informados.');
    erroIdentidade.codigoAplicacao = 'IDENTIDADE_EVENTO_NAO_CONFIRMADA';
    throw erroIdentidade;
  }

  return {
    situacao: contato.ja_inscrito ? 'ja_inscrito' : 'contato_encontrado',
    eventoAtivo
  };
}

async function inscreverContatoExistenteNoEvento(dadosIdentificacao) {
  const cliente = await banco.connect();

  try {
    await cliente.query('BEGIN');
    const eventoAtivo = await eventoModel.buscarDisponivelPorId(
      dadosIdentificacao.eventoIdExibido,
      cliente
    );

    if (!eventoAtivo) {
      const erroContexto = new Error('O contexto de evento do formulário foi alterado.');
      erroContexto.codigoAplicacao = 'CONTEXTO_EVENTO_ALTERADO';
      throw erroContexto;
    }

    if (!eventoAtivo) {
      const erroSemEvento = new Error('Não há evento ativo para esta operação.');
      erroSemEvento.codigoAplicacao = 'EVENTO_NAO_ATIVO';
      throw erroSemEvento;
    }

    const contato = await buscarContatoParaAtualizacao(
      cliente,
      dadosIdentificacao.telefoneNormalizado
    );

    if (!contato || !nomesCorrespondem(contato.nome, dadosIdentificacao.nome)) {
      const erroIdentidade = new Error('Não foi possível confirmar os dados informados.');
      erroIdentidade.codigoAplicacao = 'IDENTIDADE_EVENTO_NAO_CONFIRMADA';
      throw erroIdentidade;
    }

    const vinculoEventoCriado = await vincularContatoAoEvento(
      cliente,
      contato.id,
      eventoAtivo.id
    );

    await cliente.query('COMMIT');

    return {
      vinculoEventoCriado,
      eventoAtivo
    };
  } catch (erro) {
    await cliente.query('ROLLBACK');
    throw erro;
  } finally {
    cliente.release();
  }
}

async function buscarOrigemAtivaPorId(cliente, origemId) {
  const resultado = await cliente.query(
    'SELECT id, nome FROM origens WHERE id = $1 AND ativa = TRUE',
    [origemId]
  );

  return resultado.rows[0] || null;
}

async function criarContatoManual(cliente, dadosDoContato, origem) {
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
        NULL, NULL, NULL, $6, $7,
        FALSE, CURRENT_TIMESTAMP,
        $8, $9, $10
      )
      ON CONFLICT (telefone_normalizado) DO NOTHING
      RETURNING *
    `,
    [
      dadosDoContato.nome,
      dadosDoContato.telefone,
      dadosDoContato.telefoneNormalizado,
      dadosDoContato.bairro,
      dadosDoContato.problema,
      origem.nome,
      dadosDoContato.status,
      origem.id,
      dadosDoContato.idade,
      dadosDoContato.descricaoProblema
    ]
  );

  return resultado.rows[0] || null;
}

async function atualizarContatoManual(cliente, contato, dadosDoContato, origem, usuarioId) {
  const campos = [
    { coluna: 'nome', propriedade: 'nome' },
    { coluna: 'bairro', propriedade: 'bairro' },
    { coluna: 'problema', propriedade: 'problema' },
    { coluna: 'idade', propriedade: 'idade' },
    { coluna: 'descricao_problema', propriedade: 'descricaoProblema' },
    { coluna: 'status_contato', propriedade: 'status' }
  ];
  const atribuicoes = [];
  const valores = [];
  const anteriores = {};
  const novos = {};

  campos.forEach(function (campo) {
    const atual = contato[campo.coluna];
    const recebido = dadosDoContato[campo.propriedade];

    if (!campoEstaVazio(recebido) && String(atual || '') !== String(recebido)) {
      valores.push(recebido);
      atribuicoes.push(campo.coluna + ' = $' + valores.length);
      anteriores[campo.propriedade] = atual;
      novos[campo.propriedade] = recebido;
    }
  });

  if (atribuicoes.length === 0) {
    return [];
  }

  valores.push(contato.id);
  atribuicoes.push('atualizado_em = CURRENT_TIMESTAMP');
  await cliente.query(
    'UPDATE contatos SET ' + atribuicoes.join(', ') +
      ' WHERE id = $' + valores.length,
    valores
  );
  await historicoContatoModel.registrar(cliente, contato.id, {
    tipoEvento: 'atualizacao_cadastro_manual',
    dadosAnteriores: anteriores,
    dadosNovos: novos,
    origemId: origem.id,
    registradoPorUsuarioId: usuarioId
  });

  return Object.keys(novos);
}

async function registrarRespostaManual(
  cliente,
  contatoId,
  tipo,
  estado,
  texto,
  origem,
  usuarioId
) {
  if (estado === 'nao_informado') {
    return null;
  }

  const registro = await consentimentoModel.registrarRespostaSeDiferente(
    cliente,
    contatoId,
    {
      tipo,
      resposta: estado === 'autorizado',
      estado,
    texto: texto.texto,
    versao: texto.versao,
    canal: 'cadastro_manual',
    origemRegistro: 'resposta_expressa',
    registradoPorUsuarioId: usuarioId,
      origemId: origem.id
    }
  );

  if (estado === 'autorizado' && tipo === 'mensagens') {
    await cliente.query(
      `
        UPDATE contatos
        SET bloqueado_para_mensagens = FALSE,
            atualizado_em = CURRENT_TIMESTAMP
        WHERE id = $1
          AND NOT EXISTS (
            SELECT 1
            FROM solicitacoes_exclusao AS solicitacao
            WHERE solicitacao.contato_id = contatos.id
              AND solicitacao.status = 'pendente'
          )
      `,
      [contatoId]
    );
  }

  if (estado === 'recusado' && tipo === 'mensagens') {
    await cliente.query(
      `
        UPDATE contatos
        SET bloqueado_para_mensagens = TRUE,
            atualizado_em = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [contatoId]
    );
  }

  if (estado === 'autorizado' && tipo === 'ligacoes') {
    await cliente.query(
      `
        UPDATE contatos
        SET bloqueado_para_ligacoes = FALSE,
            atualizado_em = CURRENT_TIMESTAMP
        WHERE id = $1
          AND NOT EXISTS (
            SELECT 1
            FROM solicitacoes_exclusao AS solicitacao
            WHERE solicitacao.contato_id = contatos.id
              AND solicitacao.status = 'pendente'
          )
      `,
      [contatoId]
    );
  }


  if (estado === 'recusado' && tipo === 'ligacoes') {
    await cliente.query(
      `
        UPDATE contatos
        SET bloqueado_para_ligacoes = TRUE,
            atualizado_em = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [contatoId]
    );
  }

  return registro;
}

async function salvarCadastroManual(dadosDoContato, usuarioId) {
  const cliente = await banco.connect();

  try {
    await cliente.query('BEGIN');
    const origem = await buscarOrigemAtivaPorId(cliente, dadosDoContato.origemId);
    const textos = await textoFormularioModel.buscarAtivos(cliente);

    if (!origem) {
      const erroOrigem = new Error('Origem não encontrada.');
      erroOrigem.codigoAplicacao = 'ORIGEM_NAO_ENCONTRADA';
      throw erroOrigem;
    }

    if (!textos.aviso_privacidade || !textos.mensagens || !textos.ligacoes) {
      throw new Error('Os textos ativos do formulário não estão completos.');
    }

    let contato = await criarContatoManual(cliente, dadosDoContato, origem);
    let contatoCriado = true;
    let camposAlterados = [];

    if (!contato) {
      contatoCriado = false;
      contato = await buscarContatoParaAtualizacao(
        cliente,
        dadosDoContato.telefoneNormalizado
      );
      camposAlterados = await atualizarContatoManual(
        cliente,
        contato,
        dadosDoContato,
        origem,
        usuarioId
      );
    }

    if (dadosDoContato.aceitePrivacidade === true) {
      await aceitePrivacidadeModel.registrarSeDiferente(cliente, contato.id, {
        texto: textos.aviso_privacidade.texto,
        versao: textos.aviso_privacidade.versao,
        origemId: origem.id,
        canal: 'cadastro_manual',
        registradoPorUsuarioId: usuarioId
      });
    }

    await registrarRespostaManual(
      cliente,
      contato.id,
      'mensagens',
      dadosDoContato.autorizacaoMensagens,
      textos.mensagens,
      origem,
      usuarioId
    );
    await registrarRespostaManual(
      cliente,
      contato.id,
      'ligacoes',
      dadosDoContato.autorizacaoLigacoes,
      textos.ligacoes,
      origem,
      usuarioId
    );

    await cliente.query('COMMIT');

    return {
      id: contato.id,
      contatoCriado,
      camposAlterados
    };
  } catch (erro) {
    await cliente.query('ROLLBACK');
    throw erro;
  } finally {
    cliente.release();
  }
}

function consentimentoEstaAutorizado(consentimento) {
  return consentimento && (
    consentimento.estado === 'autorizado' ||
    (consentimento.estado === null && consentimento.resposta === true)
  );
}

async function revogarConsentimentos(contatoId, tipos, motivo, usuarioId) {
  const cliente = await banco.connect();

  try {
    await cliente.query('BEGIN');
    const resultadoContato = await cliente.query(
      `
        SELECT
          id,
          origem_id,
          bloqueado_para_mensagens,
          bloqueado_para_ligacoes
        FROM contatos
        WHERE id = $1
        FOR UPDATE
      `,
      [contatoId]
    );
    const contato = resultadoContato.rows[0];

    if (!contato) {
      await cliente.query('ROLLBACK');
      return null;
    }

    const consentimentosAtivos = await consentimentoModel.buscarAtivosPorTipos(
      cliente,
      contatoId,
      tipos
    );
    const consentimentosPorTipo = {};
    const tiposRevogados = [];

    consentimentosAtivos.forEach(function (consentimento) {
      consentimentosPorTipo[consentimento.tipo] = consentimento;
    });

    let indice;
    for (indice = 0; indice < tipos.length; indice += 1) {
      const tipo = tipos[indice];
      const consentimentoAtual = consentimentosPorTipo[tipo];

      if (!consentimentoEstaAutorizado(consentimentoAtual)) {
        continue;
      }

      const registro = await consentimentoModel.registrarRespostaSeDiferente(
        cliente,
        contatoId,
        {
          tipo,
          resposta: false,
          estado: 'revogado',
          texto: consentimentoAtual.texto_apresentado,
          versao: consentimentoAtual.versao_texto,
          canal: 'area_administrativa',
          origemRegistro: 'revogacao',
          registradoPorUsuarioId: usuarioId,
          origemId: consentimentoAtual.origem_id,
          motivoRevogacao: motivo
        }
      );

      if (registro) {
        tiposRevogados.push(tipo);
      }
    }

    const bloquearMensagens = tipos.includes('mensagens');
    const bloquearLigacoes = tipos.includes('ligacoes');
    const bloqueioMensagensAlterado = bloquearMensagens &&
      contato.bloqueado_para_mensagens !== true;
    const bloqueioLigacoesAlterado = bloquearLigacoes &&
      contato.bloqueado_para_ligacoes !== true;
    let contatoAtualizado = contato;

    if (bloqueioMensagensAlterado || bloqueioLigacoesAlterado) {
      const resultadoAtualizacao = await cliente.query(
        `
          UPDATE contatos
          SET bloqueado_para_mensagens = CASE
                WHEN $2 = TRUE THEN TRUE
                ELSE bloqueado_para_mensagens
              END,
              bloqueado_para_ligacoes = CASE
                WHEN $3 = TRUE THEN TRUE
                ELSE bloqueado_para_ligacoes
              END,
              atualizado_em = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING
            bloqueado_para_mensagens,
            bloqueado_para_ligacoes
        `,
        [contatoId, bloquearMensagens, bloquearLigacoes]
      );
      contatoAtualizado = resultadoAtualizacao.rows[0];
    }

    const houveAlteracao = tiposRevogados.length > 0 ||
      bloqueioMensagensAlterado || bloqueioLigacoesAlterado;

    if (houveAlteracao) {
      await historicoContatoModel.registrar(cliente, contatoId, {
        tipoEvento: 'revogacao_consentimentos',
        dadosAnteriores: {
          bloqueadoParaMensagens: contato.bloqueado_para_mensagens,
          bloqueadoParaLigacoes: contato.bloqueado_para_ligacoes
        },
        dadosNovos: {
          tiposSolicitados: tipos,
          tiposRevogados,
          motivo,
          bloqueadoParaMensagens: contatoAtualizado.bloqueado_para_mensagens,
          bloqueadoParaLigacoes: contatoAtualizado.bloqueado_para_ligacoes
        },
        origemId: contato.origem_id,
        registradoPorUsuarioId: usuarioId
      });
    }

    await cliente.query('COMMIT');

    return {
      alterado: houveAlteracao,
      tiposRevogados,
      bloqueadoParaMensagens: contatoAtualizado.bloqueado_para_mensagens,
      bloqueadoParaLigacoes: contatoAtualizado.bloqueado_para_ligacoes
    };
  } catch (erro) {
    await cliente.query('ROLLBACK');
    throw erro;
  } finally {
    cliente.release();
  }
}

function construirFiltros(filtros) {
  const condicoes = [];
  const valores = [];

  if (filtros.nome) {
    valores.push('%' + filtros.nome + '%');
    condicoes.push('contato.nome ILIKE $' + valores.length);
  }

  if (filtros.telefone) {
    valores.push('%' + filtros.telefone + '%');
    condicoes.push('contato.telefone_normalizado LIKE $' + valores.length);
  }

  if (filtros.bairro) {
    if (filtros.bairro === 'nao_informado') {
      condicoes.push("NULLIF(BTRIM(contato.bairro), '') IS NULL");
    } else {
      valores.push('%' + filtros.bairro + '%');
      condicoes.push('contato.bairro ILIKE $' + valores.length);
    }
  }

  if (filtros.problema) {
    if (filtros.problema === 'nao_informado') {
      condicoes.push("NULLIF(BTRIM(contato.problema), '') IS NULL");
    } else {
      valores.push('%' + filtros.problema + '%');
      condicoes.push('contato.problema ILIKE $' + valores.length);
    }
  }

  if (filtros.origem) {
    if (filtros.origem === 'nao_informado') {
      condicoes.push(`
        COALESCE(
          NULLIF(BTRIM(origem.nome), ''),
          NULLIF(BTRIM(contato.origem_atual), '')
        ) IS NULL
      `);
    } else {
      valores.push('%' + filtros.origem + '%');
      condicoes.push(
        "COALESCE(origem.nome, contato.origem_atual, '') ILIKE $" + valores.length
      );
    }
  }

  if (filtros.status) {
    if (filtros.status === 'nao_informado') {
      condicoes.push("NULLIF(BTRIM(contato.status_contato), '') IS NULL");
    } else {
      valores.push(filtros.status);
      condicoes.push('contato.status_contato = $' + valores.length);
    }
  }

  if (filtros.statusAtendimento === 'nunca_enviado') {
    condicoes.push(`
      NOT EXISTS (
        SELECT 1 FROM comunicacoes AS comunicacao_enviada
        WHERE comunicacao_enviada.contato_id = contato.id
          AND comunicacao_enviada.enviada_em IS NOT NULL
      )
    `);
  } else if (filtros.statusAtendimento === 'nao_respondeu') {
    condicoes.push(`
      (
        SELECT comunicacao_status.status
        FROM comunicacoes AS comunicacao_status
        WHERE comunicacao_status.contato_id = contato.id
        ORDER BY comunicacao_status.criado_em DESC, comunicacao_status.id DESC
        LIMIT 1
      ) IN ('enviada', 'aguardando_resposta', 'sem_resposta')
    `);
  } else if (filtros.statusAtendimento) {
    valores.push(filtros.statusAtendimento);
    condicoes.push(`
      (
        SELECT comunicacao_status.status
        FROM comunicacoes AS comunicacao_status
        WHERE comunicacao_status.contato_id = contato.id
        ORDER BY comunicacao_status.criado_em DESC, comunicacao_status.id DESC
        LIMIT 1
      ) = $${valores.length}
    `);
  }

  if (filtros.consentimentoWhatsapp !== undefined) {
    if (filtros.consentimentoWhatsapp === null) {
      condicoes.push('contato.consentimento_whatsapp IS NULL');
    } else {
      valores.push(filtros.consentimentoWhatsapp);
      condicoes.push('contato.consentimento_whatsapp = $' + valores.length);
    }
  }

  if (filtros.consentimentoLigacoes !== undefined) {
    if (filtros.consentimentoLigacoes === null) {
      condicoes.push('contato.consentimento_ligacoes IS NULL');
    } else {
      valores.push(filtros.consentimentoLigacoes);
      condicoes.push('contato.consentimento_ligacoes = $' + valores.length);
    }
  }

  if (filtros.idadeNaoInformada) {
    condicoes.push('contato.idade IS NULL');
  }

  if (filtros.cadastroIncompleto) {
    condicoes.push(`(
      NULLIF(BTRIM(contato.nome), '') IS NULL
      OR NULLIF(BTRIM(contato.bairro), '') IS NULL
      OR NULLIF(BTRIM(contato.problema), '') IS NULL
      OR contato.idade IS NULL
    )`);
  }

  if (filtros.autorizacaoMensagens) {
    valores.push(filtros.autorizacaoMensagens);
    condicoes.push(`
      COALESCE((
        SELECT consentimento.estado
        FROM consentimentos AS consentimento
        WHERE consentimento.contato_id = contato.id
          AND consentimento.tipo = 'mensagens'
        ORDER BY consentimento.criado_em DESC, consentimento.id DESC
        LIMIT 1
      ), 'nao_informado') = $${valores.length}
    `);
  }

  if (filtros.autorizacaoLigacoes) {
    valores.push(filtros.autorizacaoLigacoes);
    condicoes.push(`
      COALESCE((
        SELECT consentimento.estado
        FROM consentimentos AS consentimento
        WHERE consentimento.contato_id = contato.id
          AND consentimento.tipo = 'ligacoes'
        ORDER BY consentimento.criado_em DESC, consentimento.id DESC
        LIMIT 1
      ), 'nao_informado') = $${valores.length}
    `);
  }

  if (filtros.dataInicial) {
    valores.push(filtros.dataInicial);
    condicoes.push(
      "contato.criado_em >= ($" + valores.length +
      "::date::timestamp AT TIME ZONE 'America/Sao_Paulo')"
    );
  }

  if (filtros.dataFinal) {
    valores.push(filtros.dataFinal);
    condicoes.push(
      "contato.criado_em < ((($" + valores.length +
      "::date + 1)::timestamp) AT TIME ZONE 'America/Sao_Paulo')"
    );
  }

  if (filtros.eventoId === 'sem_evento') {
    condicoes.push(`
      NOT EXISTS (
        SELECT 1 FROM contato_eventos AS contato_evento_filtro
        WHERE contato_evento_filtro.contato_id = contato.id
      )
    `);
  } else if (filtros.eventoId) {
    valores.push(filtros.eventoId);
    condicoes.push(`
      EXISTS (
        SELECT 1 FROM contato_eventos AS contato_evento_filtro
        WHERE contato_evento_filtro.contato_id = contato.id
          AND contato_evento_filtro.evento_id = $${valores.length}
      )
    `);
  }

  const clausulaWhere = condicoes.length > 0
    ? 'WHERE ' + condicoes.join(' AND ')
    : '';

  return {
    clausulaWhere,
    valores
  };
}

async function listar(filtros, pagina, limite) {
  const filtrosSql = construirFiltros(filtros);
  const valores = filtrosSql.valores.slice();
  const deslocamento = (pagina - 1) * limite;
  const posicaoLimite = valores.length + 1;
  const posicaoDeslocamento = valores.length + 2;

  valores.push(limite);
  valores.push(deslocamento);

  const ordenacoes = {
    mais_recentes: 'contato.criado_em DESC, contato.id DESC',
    mais_antigos: 'contato.criado_em ASC, contato.id ASC',
    nome_asc: 'contato.nome ASC, contato.id ASC',
    nome_desc: 'contato.nome DESC, contato.id DESC'
  };
  const ordem = ordenacoes[filtros.ordenacao] || ordenacoes.mais_recentes;
  const consulta = `
    SELECT
      contato.id,
      contato.nome,
      contato.telefone,
      contato.bairro,
      contato.problema,
      contato.idade,
      contato.descricao_problema,
      contato.consentimento_tratamento_dados,
      contato.consentimento_whatsapp,
      contato.consentimento_ligacoes,
      contato.origem_atual,
      contato.status_contato,
      ultima_comunicacao.status AS status_atendimento,
      ultima_comunicacao.criado_em AS ultimo_atendimento_em,
      contato.bloqueado_para_mensagens,
      contato.bloqueado_para_ligacoes,
      solicitacao_pendente.solicitada_em AS exclusao_solicitada_em,
      solicitacao_pendente.solicitada_por_usuario_id AS exclusao_solicitada_por_usuario_id,
      contato.criado_em,
      COALESCE(origem.nome, contato.origem_atual) AS origem_nome,
      COALESCE((
        SELECT JSONB_AGG(
          JSONB_BUILD_OBJECT(
            'id', evento.id,
            'nome', evento.nome,
            'cadastrado_em', contato_evento.cadastrado_em
          ) ORDER BY contato_evento.cadastrado_em DESC
        )
        FROM contato_eventos AS contato_evento
        INNER JOIN eventos AS evento ON evento.id = contato_evento.evento_id
        WHERE contato_evento.contato_id = contato.id
      ), '[]'::jsonb) AS eventos_vinculados,
      COALESCE((
        SELECT consentimento.estado
        FROM consentimentos AS consentimento
        WHERE consentimento.contato_id = contato.id
          AND consentimento.tipo = 'mensagens'
        ORDER BY consentimento.criado_em DESC, consentimento.id DESC
        LIMIT 1
      ), 'nao_informado') AS autorizacao_mensagens,
      COALESCE((
        SELECT consentimento.estado
        FROM consentimentos AS consentimento
        WHERE consentimento.contato_id = contato.id
          AND consentimento.tipo = 'ligacoes'
        ORDER BY consentimento.criado_em DESC, consentimento.id DESC
        LIMIT 1
      ), 'nao_informado') AS autorizacao_ligacoes,
      EXISTS (
        SELECT 1
        FROM aceites_privacidade AS aceite
        WHERE aceite.contato_id = contato.id
          AND aceite.aceito = TRUE
      ) AS aceite_privacidade
    FROM contatos AS contato
    LEFT JOIN origens AS origem ON origem.id = contato.origem_id
    LEFT JOIN LATERAL (
      SELECT solicitacao.solicitada_em, solicitacao.solicitada_por_usuario_id
      FROM solicitacoes_exclusao AS solicitacao
      WHERE solicitacao.contato_id = contato.id AND solicitacao.status = 'pendente'
      LIMIT 1
    ) AS solicitacao_pendente ON TRUE
    LEFT JOIN LATERAL (
      SELECT comunicacao.status, comunicacao.criado_em
      FROM comunicacoes AS comunicacao
      WHERE comunicacao.contato_id = contato.id
      ORDER BY comunicacao.criado_em DESC, comunicacao.id DESC
      LIMIT 1
    ) AS ultima_comunicacao ON TRUE
    ${filtrosSql.clausulaWhere}
    ORDER BY ${ordem}
    LIMIT $${posicaoLimite}
    OFFSET $${posicaoDeslocamento}
  `;

  const resultado = await banco.query(consulta, valores);

  return resultado.rows;
}

async function contar(filtros) {
  const filtrosSql = construirFiltros(filtros);
  const consulta = `
    SELECT COUNT(*)::integer AS total
    FROM contatos AS contato
    LEFT JOIN origens AS origem ON origem.id = contato.origem_id
    ${filtrosSql.clausulaWhere}
  `;

  const resultado = await banco.query(consulta, filtrosSql.valores);

  return resultado.rows[0].total;
}

async function buscarDetalhes(id) {
  const resultados = await Promise.all([
    banco.query(
      `
        SELECT
          contato.*,
          COALESCE(origem.nome, contato.origem_atual) AS origem_nome,
          origem.slug AS origem_slug,
          origem.tipo AS origem_tipo,
          solicitacao_pendente.solicitada_em AS exclusao_solicitada_em,
          solicitacao_pendente.solicitada_por_usuario_id AS exclusao_solicitada_por_usuario_id,
          usuario_exclusao.nome AS exclusao_solicitada_por_usuario_nome
          ,COALESCE((
            SELECT JSONB_AGG(
              JSONB_BUILD_OBJECT(
                'id', evento.id,
                'nome', evento.nome,
                'cadastrado_em', contato_evento.cadastrado_em
              ) ORDER BY contato_evento.cadastrado_em DESC
            )
            FROM contato_eventos AS contato_evento
            INNER JOIN eventos AS evento ON evento.id = contato_evento.evento_id
            WHERE contato_evento.contato_id = contato.id
          ), '[]'::jsonb) AS eventos_vinculados
        FROM contatos AS contato
        LEFT JOIN origens AS origem ON origem.id = contato.origem_id
        LEFT JOIN LATERAL (
          SELECT solicitacao.solicitada_em, solicitacao.solicitada_por_usuario_id
          FROM solicitacoes_exclusao AS solicitacao
          WHERE solicitacao.contato_id = contato.id AND solicitacao.status = 'pendente'
          LIMIT 1
        ) AS solicitacao_pendente ON TRUE
        LEFT JOIN usuarios AS usuario_exclusao
          ON usuario_exclusao.id = solicitacao_pendente.solicitada_por_usuario_id
        WHERE contato.id = $1
      `,
      [id]
    ),
    banco.query(
      `
        SELECT
          consentimento.id,
          consentimento.tipo,
          consentimento.resposta,
          consentimento.estado,
          consentimento.texto_apresentado,
          consentimento.versao_texto,
          consentimento.canal,
          consentimento.origem_registro,
          consentimento.ativo,
          consentimento.criado_em,
          consentimento.revogado_em,
          consentimento.motivo_revogacao,
          consentimento.registro_anterior_id,
          origem.nome AS origem_nome,
          usuario.nome AS registrado_por_usuario_nome
        FROM consentimentos AS consentimento
        LEFT JOIN origens AS origem ON origem.id = consentimento.origem_id
        LEFT JOIN usuarios AS usuario
          ON usuario.id = consentimento.registrado_por_usuario_id
        WHERE consentimento.contato_id = $1
        ORDER BY consentimento.criado_em DESC, consentimento.id DESC
      `,
      [id]
    ),
    banco.query(
      `
        SELECT
          aceite.id,
          aceite.aceito,
          aceite.texto_apresentado,
          aceite.versao_texto,
          aceite.canal,
          aceite.criado_em,
          origem.nome AS origem_nome
        FROM aceites_privacidade AS aceite
        LEFT JOIN origens AS origem ON origem.id = aceite.origem_id
        WHERE aceite.contato_id = $1
        ORDER BY aceite.criado_em DESC, aceite.id DESC
      `,
      [id]
    ),
    banco.query(
      `
        SELECT
          historico.id,
          historico.tipo_evento,
          historico.dados_anteriores,
          historico.dados_novos,
          historico.criado_em,
          origem.nome AS origem_nome,
          usuario.nome AS usuario_nome
        FROM historico_contatos AS historico
        LEFT JOIN origens AS origem ON origem.id = historico.origem_id
        LEFT JOIN usuarios AS usuario ON usuario.id = historico.registrado_por_usuario_id
        WHERE historico.contato_id = $1
        ORDER BY historico.criado_em DESC, historico.id DESC
      `,
      [id]
    ),
    banco.query(
      `SELECT comunicacao.*, evento.nome AS evento_nome, modelo.nome AS modelo_nome,
        numero.nome AS numero_nome, numero.numero AS numero_whatsapp,
        usuario.nome AS operador_nome
       FROM comunicacoes AS comunicacao
       LEFT JOIN eventos AS evento ON evento.id=comunicacao.evento_id
       LEFT JOIN modelos_mensagem AS modelo ON modelo.id=comunicacao.modelo_id
       INNER JOIN numeros_whatsapp AS numero ON numero.id=comunicacao.numero_whatsapp_id
       INNER JOIN usuarios AS usuario ON usuario.id=comunicacao.operador_usuario_id
       WHERE comunicacao.contato_id=$1 ORDER BY comunicacao.criado_em DESC`,
      [id]
    )
  ]);

  if (!resultados[0].rows[0]) {
    return null;
  }

  return {
    contato: resultados[0].rows[0],
    consentimentos: resultados[1].rows,
    aceitesPrivacidade: resultados[2].rows,
    historico: resultados[3].rows,
    comunicacoes: resultados[4].rows
  };
}

module.exports = {
  inscreverContatoExistenteNoEvento,
  salvarCadastroPublico,
  salvarCadastroManual,
  revogarConsentimentos,
  listar,
  contar,
  construirFiltros,
  buscarDetalhes,
  verificarContatoParaEvento
};
