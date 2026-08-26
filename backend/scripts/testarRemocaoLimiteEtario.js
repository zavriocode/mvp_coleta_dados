require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const pg = require('pg');

const NOME_BANCO = 'acorda_rj_idade_qa_' + process.pid;

function configuracao(nomeBanco) {
  if (process.env.DATABASE_URL) {
    const endereco = new URL(process.env.DATABASE_URL);
    endereco.pathname = '/' + nomeBanco;
    return { connectionString: endereco.toString() };
  }
  return {
    host: process.env.BANCO_HOST,
    port: Number(process.env.BANCO_PORTA) || 5432,
    user: process.env.BANCO_USUARIO,
    password: process.env.BANCO_SENHA,
    database: nomeBanco,
    ssl: process.env.BANCO_SSL === 'true'
  };
}

async function removerBanco(cliente) {
  await cliente.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [NOME_BANCO]);
  await cliente.query('DROP DATABASE IF EXISTS "' + NOME_BANCO + '"');
}

function confirmar(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

async function inserirContato(cliente, telefone, idade) {
  return cliente.query(`
    INSERT INTO contatos (
      telefone, telefone_normalizado, consentimento_armazenamento, idade
    ) VALUES ($1,$1,TRUE,$2)
    RETURNING id, idade
  `, [telefone, idade]);
}

async function executar() {
  const administracao = new pg.Client(configuracao('postgres'));
  let bancoTeste;
  let administracaoConectada = false;
  try {
    await administracao.connect();
    administracaoConectada = true;
    await removerBanco(administracao);
    await administracao.query('CREATE DATABASE "' + NOME_BANCO + '"');

    bancoTeste = new pg.Client(configuracao(NOME_BANCO));
    await bancoTeste.connect();
    const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'criar_banco.sql'), 'utf8');
    await bancoTeste.query(schema);

    await inserirContato(bancoTeste, '21900000001', 40);
    await bancoTeste.query(`
      ALTER TABLE contatos DROP CONSTRAINT contatos_idade_valida;
      ALTER TABLE contatos ADD CONSTRAINT contatos_idade_valida CHECK (
        idade IS NULL OR idade BETWEEN 16 AND 120
      );
      UPDATE textos_formulario SET ativo=FALSE WHERE tipo='aviso_privacidade';
      INSERT INTO textos_formulario (tipo,versao,texto,ativo)
      VALUES (
        'aviso_privacidade','aviso_privacidade_v3',
        'Tenho 16 anos ou mais e aceito o aviso de privacidade usado antes desta alteração.',TRUE
      ) ON CONFLICT (tipo,versao) DO UPDATE SET ativo=TRUE;
    `);

    let rejeicaoAntiga;
    try { await inserirContato(bancoTeste, '21900000002', 13); }
    catch (erro) { rejeicaoAntiga = erro; }
    confirmar(rejeicaoAntiga && rejeicaoAntiga.code === '23514',
      'A constraint anterior deveria rejeitar idade 13.');

    const migration = fs.readFileSync(
      path.join(__dirname, '..', 'database', 'migrations', '019_remover_limite_etario_cadastros.sql'),
      'utf8'
    );
    await bancoTeste.query(migration);

    const adolescente = (await inserirContato(bancoTeste, '21900000002', 13)).rows[0];
    confirmar(adolescente.idade === 13, 'A migration deve permitir o cadastro com idade 13.');
    confirmar((await bancoTeste.query(
      "SELECT idade FROM contatos WHERE telefone_normalizado='21900000001'"
    )).rows[0].idade === 40, 'A migration deve preservar as idades existentes.');

    let idadeNegativa;
    try { await inserirContato(bancoTeste, '21900000003', -1); }
    catch (erro) { idadeNegativa = erro; }
    confirmar(idadeNegativa && idadeNegativa.code === '23514',
      'A constraint deve continuar rejeitando idade negativa.');

    const textos = (await bancoTeste.query(`
      SELECT versao,texto,ativo FROM textos_formulario
      WHERE tipo='aviso_privacidade' ORDER BY versao
    `)).rows;
    const textoNovo = textos.find(function (item) { return item.versao === 'aviso_privacidade_v4'; });
    const textoAntigo = textos.find(function (item) { return item.versao === 'aviso_privacidade_v3'; });
    confirmar(textoNovo && textoNovo.ativo === true && !textoNovo.texto.includes('16 anos'),
      'O aviso ativo deve ser a versão sem restrição etária.');
    confirmar(textoAntigo && textoAntigo.ativo === false,
      'O aviso anterior deve permanecer preservado e inativo para auditoria.');

    console.log('Limite etario removido: idade 13 aceita, dados anteriores e textos historicos preservados.');
  } finally {
    if (bancoTeste) await bancoTeste.end().catch(function () {});
    if (administracaoConectada) {
      await removerBanco(administracao).catch(function () {});
      await administracao.end().catch(function () {});
    }
  }
}

executar().catch(function (erro) {
  console.error(erro.stack || erro.message);
  process.exitCode = 1;
});
