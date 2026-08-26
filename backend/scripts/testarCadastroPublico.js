require('dotenv').config({ quiet: true });

const assert = require('assert');
const aplicacao = require('../src/app');
const banco = require('../src/config/banco');
const contatoModel = require('../src/modules/contatos/contatoModel');

const PREFIXO_TELEFONE = '2199998';
let eventoIdExibidoTeste;

function criarDados(sufixo, alteracoes) {
  return Object.assign({
    nome: 'Teste Cadastro Público',
    telefone: PREFIXO_TELEFONE + sufixo,
    idade: 35,
    bairro: 'Vila Kennedy',
    problema: 'Saúde',
    aceitePrivacidade: true,
    autorizacaoMensagens: false,
    autorizacaoLigacoes: false,
    eventoIdExibido: eventoIdExibidoTeste
  }, alteracoes || {});
}

async function requisitar(baseUrl, caminho, opcoes) {
  const resposta = await fetch(baseUrl + caminho, Object.assign({
    headers: {
      'Content-Type': 'application/json'
    }
  }, opcoes || {}));
  const corpo = await resposta.json();

  return {
    status: resposta.status,
    corpo
  };
}

async function buscarResumoContato(telefone) {
  const resultado = await banco.query(
    `
      SELECT
        contato.id,
        contato.nome,
        contato.bairro,
        contato.problema,
        contato.idade,
        contato.descricao_problema,
        (SELECT COUNT(*)::integer FROM historico_contatos WHERE contato_id = contato.id) AS historicos,
        (SELECT COUNT(*)::integer FROM aceites_privacidade WHERE contato_id = contato.id) AS aceites,
        (
          SELECT COUNT(*)::integer
          FROM consentimentos
          WHERE contato_id = contato.id
            AND tipo IN ('mensagens', 'ligacoes')
        ) AS autorizacoes
      FROM contatos AS contato
      WHERE contato.telefone_normalizado = $1
    `,
    [telefone]
  );

  return resultado.rows[0] || null;
}

async function buscarAutorizacao(telefone, tipo) {
  const resultado = await banco.query(
    `
      SELECT
        consentimento.tipo,
        consentimento.texto_apresentado,
        consentimento.versao_texto,
        consentimento.canal,
        consentimento.estado,
        consentimento.criado_em
      FROM consentimentos AS consentimento
      INNER JOIN contatos AS contato ON contato.id = consentimento.contato_id
      WHERE contato.telefone_normalizado = $1
        AND consentimento.tipo = $2
        AND consentimento.ativo = TRUE
    `,
    [telefone, tipo]
  );

  return resultado.rows[0] || null;
}

async function limparDadosTemporarios() {
  const cliente = await banco.connect();

  try {
    await cliente.query('BEGIN');
    const contatos = await cliente.query(
      `SELECT id FROM contatos WHERE telefone_normalizado LIKE $1`,
      [PREFIXO_TELEFONE + '%']
    );
    const ids = contatos.rows.map(function (contato) {
      return contato.id;
    });

    if (ids.length > 0) {
      await cliente.query('DELETE FROM aceites_privacidade WHERE contato_id = ANY($1::bigint[])', [ids]);
      await cliente.query('DELETE FROM consentimentos WHERE contato_id = ANY($1::bigint[])', [ids]);
      await cliente.query('DELETE FROM historico_contatos WHERE contato_id = ANY($1::bigint[])', [ids]);
      await cliente.query('DELETE FROM contatos WHERE id = ANY($1::bigint[])', [ids]);
    }

    await cliente.query('COMMIT');
  } catch (erro) {
    await cliente.query('ROLLBACK');
    throw erro;
  } finally {
    cliente.release();
  }
}

async function executar() {
  let servidor;
  let baseUrl;
  let idsEventosAtivosPreservados = [];
  const legadosAntes = await banco.query(
    `
      SELECT id, contato_id, tipo, resposta, texto_apresentado, versao_texto,
        canal, origem_registro, criado_em, revogado_em, ativo, estado, origem_id
      FROM consentimentos
      WHERE tipo IN ('tratamento_dados', 'mensagens_whatsapp')
      ORDER BY id
    `
  );

  try {
    await limparDadosTemporarios();
    const eventosAtivos = await banco.query(
      "SELECT id FROM eventos WHERE status = 'ativo' ORDER BY id"
    );
    idsEventosAtivosPreservados = eventosAtivos.rows.map(function (evento) {
      return evento.id;
    });

    if (idsEventosAtivosPreservados.length > 0) {
      await banco.query(
        "UPDATE eventos SET status = 'rascunho' WHERE id = ANY($1::bigint[])",
        [idsEventosAtivosPreservados]
      );
    }

    servidor = aplicacao.listen(0);
    await new Promise(function (resolver, rejeitar) {
      servidor.once('listening', resolver);
      servidor.once('error', rejeitar);
    });
    baseUrl = 'http://127.0.0.1:' + servidor.address().port;

    const opcoes = await requisitar(baseUrl, '/api/publico/contatos/opcoes');
    eventoIdExibidoTeste = opcoes.corpo.eventoAtivo
      ? opcoes.corpo.eventoAtivo.id
      : null;
    assert.strictEqual(opcoes.status, 200);
    assert.ok(opcoes.corpo.categoriasProblema.includes('Saúde'));
    assert.strictEqual(opcoes.corpo.bairros.length, 166);
    assert.ok(opcoes.corpo.bairros.includes('Argentino'));
    assert.ok(opcoes.corpo.bairros.includes('São Cristóvão'));
    assert.strictEqual(
      opcoes.corpo.textosConsentimento.avisoPrivacidade.versao,
      'aviso_privacidade_v4'
    );
    assert.strictEqual(
      opcoes.corpo.textosConsentimento.mensagens.versao,
      'mensagens_whatsapp_v3'
    );
    assert.ok(opcoes.corpo.textosConsentimento.mensagens.texto.includes('WhatsApp'));
    assert.ok(opcoes.corpo.textosConsentimento.mensagens.texto.includes('revogar'));
    assert.strictEqual(
      opcoes.corpo.textosConsentimento.ligacoes.versao,
      'ligacoes_v3'
    );

    assert.strictEqual((await requisitar(baseUrl, '/api/publico/contatos', {
      method: 'POST', body: JSON.stringify(criarDados('000', { bairro: 'Bairro inventado' }))
    })).status, 400);

    const semIdade = criarDados('001');
    delete semIdade.idade;
    assert.strictEqual((await requisitar(baseUrl, '/api/publico/contatos', {
      method: 'POST', body: JSON.stringify(semIdade)
    })).status, 400);
    const cadastroAdolescente = await requisitar(baseUrl, '/api/publico/contatos', {
      method: 'POST', body: JSON.stringify(criarDados('002', { idade: 13 }))
    });
    assert.strictEqual(cadastroAdolescente.status, 201);
    assert.strictEqual((await buscarResumoContato(PREFIXO_TELEFONE + '002')).idade, 13);
    assert.strictEqual((await requisitar(baseUrl, '/api/publico/contatos', {
      method: 'POST', body: JSON.stringify(criarDados('003', { telefone: '123' }))
    })).status, 400);
    assert.strictEqual((await requisitar(baseUrl, '/api/publico/contatos', {
      method: 'POST', body: JSON.stringify(criarDados('004', { problema: '' }))
    })).status, 400);
    assert.strictEqual((await requisitar(baseUrl, '/api/publico/contatos', {
      method: 'POST', body: JSON.stringify(criarDados('005', { aceitePrivacidade: false }))
    })).status, 400);

    const semAutorizacoes = await requisitar(baseUrl, '/api/publico/contatos', {
      method: 'POST', body: JSON.stringify(criarDados('010', {
        bairro: 'vila kennedy',
        idade: 16
      }))
    });
    assert.strictEqual(semAutorizacoes.status, 201);
    assert.strictEqual(
      semAutorizacoes.corpo.mensagem,
      'Cadastro realizado com sucesso. Obrigado por contribuir com o projeto Acorda RJ.'
    );
    let resumo = await buscarResumoContato(PREFIXO_TELEFONE + '010');
    assert.strictEqual(resumo.aceites, 1);
    assert.strictEqual(resumo.autorizacoes, 0);
    assert.strictEqual(resumo.bairro, 'Vila Kennedy');
    assert.strictEqual(resumo.idade, 16);
    assert.strictEqual(resumo.descricao_problema, null);

    assert.strictEqual((await requisitar(baseUrl, '/api/publico/contatos', {
      method: 'POST', body: JSON.stringify(criarDados('011', { autorizacaoMensagens: true }))
    })).status, 201);
    resumo = await buscarResumoContato(PREFIXO_TELEFONE + '011');
    assert.strictEqual(resumo.autorizacoes, 1);
    const autorizacaoMensagens = await buscarAutorizacao(
      PREFIXO_TELEFONE + '011',
      'mensagens'
    );
    assert.strictEqual(autorizacaoMensagens.versao_texto, 'mensagens_whatsapp_v3');
    assert.strictEqual(autorizacaoMensagens.canal, 'formulario_publico');
    assert.strictEqual(autorizacaoMensagens.estado, 'autorizado');
    assert.ok(autorizacaoMensagens.texto_apresentado.includes('WhatsApp'));
    assert.ok(autorizacaoMensagens.criado_em);

    assert.strictEqual((await requisitar(baseUrl, '/api/publico/contatos', {
      method: 'POST', body: JSON.stringify(criarDados('012', { autorizacaoLigacoes: true }))
    })).status, 201);
    resumo = await buscarResumoContato(PREFIXO_TELEFONE + '012');
    assert.strictEqual(resumo.autorizacoes, 1);
    const autorizacaoLigacoes = await buscarAutorizacao(
      PREFIXO_TELEFONE + '012',
      'ligacoes'
    );
    assert.strictEqual(autorizacaoLigacoes.versao_texto, 'ligacoes_v3');
    assert.strictEqual(autorizacaoLigacoes.canal, 'formulario_publico');
    assert.strictEqual(autorizacaoLigacoes.estado, 'autorizado');
    assert.ok(autorizacaoLigacoes.criado_em);

    const ambos = criarDados('013', {
      autorizacaoMensagens: true,
      autorizacaoLigacoes: true
    });
    assert.strictEqual((await requisitar(baseUrl, '/api/publico/contatos', {
      method: 'POST', body: JSON.stringify(ambos)
    })).status, 201);
    assert.strictEqual((await requisitar(baseUrl, '/api/publico/contatos', {
      method: 'POST', body: JSON.stringify(ambos)
    })).status, 201);
    resumo = await buscarResumoContato(PREFIXO_TELEFONE + '013');
    assert.strictEqual(resumo.aceites, 1);
    assert.strictEqual(resumo.autorizacoes, 2);
    assert.strictEqual(resumo.historicos, 0);

    const origemExistente = await banco.query(
      "SELECT id FROM origens WHERE slug = 'cadastro-manual'"
    );
    await banco.query(
      `
        INSERT INTO contatos (
          nome, telefone, telefone_normalizado, bairro, problema,
          consentimento_armazenamento, consentimento_mensagens,
          consentimento_armazenamento_em, origem_atual, status_contato,
          bloqueado_para_mensagens, origem_id
        )
        VALUES ($1, $2, $2, $3, $4, TRUE, FALSE, CURRENT_TIMESTAMP,
          'Cadastro manual', 'ativo', FALSE, $5)
      `,
      [
        'Nome preservado',
        PREFIXO_TELEFONE + '020',
        'Bangu',
        'Educação',
        origemExistente.rows[0].id
      ]
    );
    const complemento = criarDados('020', {
      nome: 'Nome novo ignorado',
      bairro: 'Vila Kennedy',
      problema: 'Saúde',
      idade: 44
    });
    assert.strictEqual((await requisitar(baseUrl, '/api/publico/contatos', {
      method: 'POST', body: JSON.stringify(complemento)
    })).status, 201);
    resumo = await buscarResumoContato(PREFIXO_TELEFONE + '020');
    assert.strictEqual(resumo.nome, 'Nome preservado');
    assert.strictEqual(resumo.bairro, 'Bangu');
    assert.strictEqual(resumo.problema, 'Educação');
    assert.strictEqual(resumo.idade, 44);
    assert.strictEqual(resumo.descricao_problema, null);
    assert.strictEqual(resumo.historicos, 1);
    assert.strictEqual((await requisitar(baseUrl, '/api/publico/contatos', {
      method: 'POST', body: JSON.stringify(Object.assign({}, complemento, {
        idade: 60,
        descricaoProblema: 'Campo removido enviado por cliente antigo'
      }))
    })).status, 201);
    resumo = await buscarResumoContato(PREFIXO_TELEFONE + '020');
    assert.strictEqual(resumo.idade, 44);
    assert.strictEqual(resumo.descricao_problema, null);
    assert.strictEqual(resumo.historicos, 1);

    let falhaEsperada = false;
    try {
      await contatoModel.salvarCadastroPublico({
        nome: 'Teste de rollback',
        telefone: PREFIXO_TELEFONE + '030',
        telefoneNormalizado: PREFIXO_TELEFONE + '030',
        idade: -1,
        bairro: 'Vila Kennedy',
        problema: 'Saúde',
        aceitePrivacidade: true,
        autorizacaoMensagens: true,
        autorizacaoLigacoes: true
      });
    } catch (erro) {
      falhaEsperada = true;
    }
    assert.strictEqual(falhaEsperada, true);
    assert.strictEqual(await buscarResumoContato(PREFIXO_TELEFONE + '030'), null);

    const legadosDepois = await banco.query(
      `
        SELECT id, contato_id, tipo, resposta, texto_apresentado, versao_texto,
          canal, origem_registro, criado_em, revogado_em, ativo, estado, origem_id
        FROM consentimentos
        WHERE tipo IN ('tratamento_dados', 'mensagens_whatsapp')
        ORDER BY id
      `
    );
    assert.deepStrictEqual(legadosDepois.rows, legadosAntes.rows);

    console.log('Cadastro público: 43 verificações aprovadas.');
    console.log('Consentimentos anteriores preservados: ' + legadosDepois.rowCount + ' registros.');
    console.log('Rollback: contato inválido não persistido.');
  } finally {
    if (servidor) {
      await new Promise(function (resolver) {
        servidor.close(resolver);
      });
    }

    await limparDadosTemporarios();
    if (idsEventosAtivosPreservados.length > 0) {
      await banco.query(
        "UPDATE eventos SET status = 'ativo' WHERE id = ANY($1::bigint[])",
        [idsEventosAtivosPreservados]
      );
    }
    await banco.end();
  }
}

executar().catch(function (erro) {
  console.error(erro);
  process.exitCode = 1;
});
