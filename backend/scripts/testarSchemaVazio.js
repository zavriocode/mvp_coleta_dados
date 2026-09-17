require('dotenv').config({ quiet: true });

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pg = require('pg');

const NOME_BANCO = 'criar_banco_schema_teste_' + process.pid;

function criarConfiguracao(nomeBanco) {
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
  await cliente.query(
    'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
    [NOME_BANCO]
  );
  await cliente.query('DROP DATABASE IF EXISTS "' + NOME_BANCO + '"');
}

async function executar() {
  const administracao = new pg.Client(criarConfiguracao('postgres'));
  let bancoTeste;
  let administracaoConectada = false;

  try {
    await administracao.connect();
    administracaoConectada = true;
    await removerBanco(administracao);
    await administracao.query('CREATE DATABASE "' + NOME_BANCO + '"');

    bancoTeste = new pg.Client(criarConfiguracao(NOME_BANCO));
    await bancoTeste.connect();
    const schema = fs.readFileSync(
      path.join(__dirname, '..', 'database', 'criar_banco.sql'),
      'utf8'
    );
    await bancoTeste.query(schema);
    const resultado = await bancoTeste.query(
      `SELECT
        (SELECT COUNT(*)::integer FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS tabelas,
        (SELECT COUNT(*)::integer FROM bairros WHERE ativo = TRUE) AS bairros,
        (SELECT COUNT(*)::integer FROM origens WHERE ativa = TRUE) AS origens,
        (SELECT COUNT(*)::integer FROM textos_formulario WHERE ativo = TRUE) AS textos,
        (SELECT COUNT(*)::integer FROM usuarios) AS usuarios,
        (SELECT COUNT(*)::integer FROM contatos) AS contatos,
        (SELECT COUNT(*)::integer FROM schema_migrations) AS migrations`
    );
    assert.deepStrictEqual(resultado.rows[0], {
      tabelas: 31,
      bairros: 166,
      origens: 2,
      textos: 3,
      usuarios: 0,
      contatos: 0,
      migrations: 23
    });
    const diretorioMigrations = path.join(__dirname, '..', 'database', 'migrations');
    const migrationsArquivos = fs.readdirSync(diretorioMigrations)
      .filter(function (nome) { return /^\d{3}_[a-z0-9_]+\.sql$/.test(nome); })
      .sort()
      .map(function (nome) {
        const conteudo = fs.readFileSync(path.join(diretorioMigrations, nome), 'utf8');
        return {
          versao: nome.slice(0, 3),
          nome_arquivo: nome,
          checksum_sha256: crypto.createHash('sha256').update(conteudo, 'utf8').digest('hex')
        };
      });
    const migrationsLedger = await bancoTeste.query(`
      SELECT versao, nome_arquivo, checksum_sha256
      FROM schema_migrations
      ORDER BY versao
    `);
    assert.deepStrictEqual(
      migrationsLedger.rows,
      migrationsArquivos,
      'O ledger do schema final nao corresponde aos arquivos de migration.'
    );
    console.log('Schema final validado em banco vazio: 31 tabelas operacionais, controle preservado, 166 bairros e 23 migrations.');
  } finally {
    if (bancoTeste) {
      await bancoTeste.end();
    }
    if (administracaoConectada) {
      await removerBanco(administracao);
      await administracao.end();
    }
  }
}

executar().catch(function (erro) {
  console.error(erro.stack || erro.message);
  process.exitCode = 1;
});
