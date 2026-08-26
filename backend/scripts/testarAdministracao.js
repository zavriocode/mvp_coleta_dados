require('dotenv').config({ quiet: true });

const assert = require('assert');
const bcrypt = require('bcrypt');
const aplicacao = require('../src/app');
const banco = require('../src/config/banco');
const formatarDataRio = require('../src/utils/formatarDataRio');

const EMAIL_TESTE = 'teste.admin.mvp@invalid.local';
const TELEFONE_TESTE = '21999987001';
const TELEFONE_NAO_INFORMADO = '21999987002';

async function requisitar(baseUrl, caminho, opcoes) {
  const resposta = await fetch(baseUrl + caminho, Object.assign({
    headers: { 'Content-Type': 'application/json' }
  }, opcoes || {}));
  const corpo = await resposta.json();

  return { status: resposta.status, corpo };
}

async function limpar() {
  const cliente = await banco.connect();

  try {
    await cliente.query('BEGIN');
    const contatos = await cliente.query(
      'SELECT id FROM contatos WHERE telefone_normalizado = ANY($1::text[])',
      [[TELEFONE_TESTE, TELEFONE_NAO_INFORMADO]]
    );

    let indice;
    for (indice = 0; indice < contatos.rows.length; indice += 1) {
      const id = contatos.rows[indice].id;
      await cliente.query('DELETE FROM aceites_privacidade WHERE contato_id = $1', [id]);
      await cliente.query('DELETE FROM consentimentos WHERE contato_id = $1', [id]);
      await cliente.query('DELETE FROM historico_contatos WHERE contato_id = $1', [id]);
      await cliente.query('DELETE FROM contatos WHERE id = $1', [id]);
    }

    await cliente.query('DELETE FROM tentativas_login WHERE email_informado = $1', [EMAIL_TESTE]);
    await cliente.query('DELETE FROM usuarios WHERE email = $1', [EMAIL_TESTE]);
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

  try {
    await limpar();
    const senhaHash = await bcrypt.hash('SenhaTeste123!', 4);
    await banco.query(
      'INSERT INTO usuarios (nome, email, senha_hash) VALUES ($1, $2, $3)',
      ['Administrador temporário', EMAIL_TESTE, senhaHash]
    );
    servidor = aplicacao.listen(0);
    await new Promise(function (resolver, rejeitar) {
      servidor.once('listening', resolver);
      servidor.once('error', rejeitar);
    });
    const baseUrl = 'http://127.0.0.1:' + servidor.address().port;

    assert.strictEqual((await requisitar(baseUrl, '/api/admin/contatos')).status, 401);
    assert.strictEqual((await requisitar(baseUrl, '/api/admin/contatos', {
      headers: { Authorization: 'Bearer invalido' }
    })).status, 401);
    assert.strictEqual((await requisitar(baseUrl, '/api/autenticacao/login', {
      method: 'POST',
      body: JSON.stringify({ email: EMAIL_TESTE, senha: 'errada' })
    })).status, 401);

    const login = await requisitar(baseUrl, '/api/autenticacao/login', {
      method: 'POST',
      body: JSON.stringify({ email: EMAIL_TESTE, senha: 'SenhaTeste123!' })
    });
    assert.strictEqual(login.status, 200);
    assert.ok(login.corpo.token);
    const cabecalhos = { Authorization: 'Bearer ' + login.corpo.token };

    const contatoNaoInformado = await banco.query(
      `
        INSERT INTO contatos (
          nome,
          telefone,
          telefone_normalizado,
          consentimento_armazenamento
        )
        VALUES ('Contato sem dados complementares', $1, $1, TRUE)
        RETURNING id
      `,
      [TELEFONE_NAO_INFORMADO]
    );

    const cadastro = await requisitar(baseUrl, '/api/publico/contatos', {
      method: 'POST',
      body: JSON.stringify({
        nome: 'Contato Administrativo Teste',
        telefone: TELEFONE_TESTE,
        idade: 42,
        bairro: 'Vila Kennedy',
        problema: 'Saúde',
        descricaoProblema: 'Teste da tela administrativa',
        aceitePrivacidade: true,
        autorizacaoMensagens: true,
        autorizacaoLigacoes: false
      })
    });
    assert.strictEqual(cadastro.status, 201);

    const hoje = formatarDataRio(new Date());
    const parametros = new URLSearchParams({
      nome: 'Administrativo',
      telefone: '(21) 99998-7001',
      bairro: 'Vila',
      problema: 'Saú',
      origem: 'Formulário',
      autorizacaoMensagens: 'autorizado',
      autorizacaoLigacoes: 'nao_informado',
      dataInicial: hoje,
      dataFinal: hoje,
      ordenacao: 'nome_asc',
      pagina: '1',
      limite: '1'
    });
    const listagem = await requisitar(
      baseUrl,
      '/api/admin/contatos?' + parametros.toString(),
      { headers: cabecalhos }
    );
    assert.strictEqual(listagem.status, 200);
    assert.strictEqual(listagem.corpo.contatos.length, 1);
    assert.strictEqual(listagem.corpo.paginacao.limite, 1);
    assert.strictEqual(listagem.corpo.contatos[0].idade, 42);
    assert.strictEqual(listagem.corpo.contatos[0].autorizacaoMensagens, 'autorizado');
    assert.strictEqual(listagem.corpo.contatos[0].autorizacaoLigacoes, 'nao_informado');
    assert.strictEqual(listagem.corpo.contatos[0].aceitePrivacidade, true);
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(listagem.corpo.contatos[0], 'telefone_normalizado'),
      false
    );

    const id = listagem.corpo.contatos[0].id;
    const detalhes = await requisitar(baseUrl, '/api/admin/contatos/' + id, {
      headers: cabecalhos
    });
    assert.strictEqual(detalhes.status, 200);
    assert.strictEqual(detalhes.corpo.contato.id, id);
    assert.strictEqual(detalhes.corpo.aceitesPrivacidade.length, 1);
    assert.strictEqual(detalhes.corpo.consentimentos.length, 1);
    assert.strictEqual((await requisitar(baseUrl, '/api/admin/contatos/999999999', {
      headers: cabecalhos
    })).status, 404);
    assert.strictEqual((await requisitar(baseUrl, '/api/admin/contatos?pagina=0', {
      headers: cabecalhos
    })).status, 400);

    const filtrosNaoInformados = [
      'bairro=nao_informado',
      'problema=nao_informado',
      'origem=nao_informado',
      'idadeNaoInformada=true',
      'bairro=' + encodeURIComponent('Não informado'),
      'problema=' + encodeURIComponent('Não informado'),
      'origem=' + encodeURIComponent('Não informado')
    ];

    let indiceFiltro;
    for (indiceFiltro = 0; indiceFiltro < filtrosNaoInformados.length; indiceFiltro += 1) {
      const respostaNaoInformado = await requisitar(
        baseUrl,
        '/api/admin/contatos?telefone=' + TELEFONE_NAO_INFORMADO +
          '&' + filtrosNaoInformados[indiceFiltro],
        { headers: cabecalhos }
      );
      assert.strictEqual(
        respostaNaoInformado.status,
        200,
        JSON.stringify(respostaNaoInformado.corpo)
      );
      assert.strictEqual(respostaNaoInformado.corpo.contatos.length, 1);
      assert.strictEqual(
        respostaNaoInformado.corpo.contatos[0].id,
        contatoNaoInformado.rows[0].id
      );
    }

    const filtrosEtariosLegados = await requisitar(
      baseUrl,
      '/api/admin/contatos?telefone=' + TELEFONE_TESTE + '&idadeMinima=1000&idadeMaxima=1001',
      { headers: cabecalhos }
    );
    assert.strictEqual(filtrosEtariosLegados.status, 200);
    assert.strictEqual(filtrosEtariosLegados.corpo.contatos.length, 1);

    console.log('Administração: 44 verificações aprovadas.');
    console.log('Login, JWT, filtros combinados, paginação e detalhes aprovados.');
  } finally {
    if (servidor) {
      await new Promise(function (resolver) {
        servidor.close(resolver);
      });
    }

    await limpar();
    await banco.end();
  }
}

executar().catch(function (erro) {
  console.error(erro);
  process.exitCode = 1;
});
