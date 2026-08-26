require('dotenv').config({ quiet: true });

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const pg = require('pg');

const NOME_BANCO = 'acorda_rj_correcoes_finais_qa_' + process.pid;
const SCRIPTS = [
  'testarTelefoneCanonicoMigration.js',
  'testarCadastroPublico.js',
  'testarAdministracao.js',
  'testarCadastroManual.js',
  'testarImportacoes.js',
  'testarRelatorios.js',
  'testarEventosExclusoes.js',
  'testarCampanhas.js',
  'testarSegurancaUsuarios.js',
  'testarExclusaoArquivamentoCampanhas.js',
  'testarSchemaVazio.js'
];

function garantirPostgresLocal() {
  const host = String(process.env.BANCO_HOST || '').toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error('O teste isolado exige BANCO_HOST local e nunca utiliza DATABASE_URL.');
  }
}

function configuracao(database) {
  return {
    host: process.env.BANCO_HOST,
    port: Number(process.env.BANCO_PORTA) || 5432,
    user: process.env.BANCO_USUARIO,
    password: process.env.BANCO_SENHA,
    database,
    ssl: false
  };
}

function urlLocal(database) {
  return 'postgresql://' + encodeURIComponent(process.env.BANCO_USUARIO || '') + ':' +
    encodeURIComponent(process.env.BANCO_SENHA || '') + '@' +
    process.env.BANCO_HOST + ':' + (process.env.BANCO_PORTA || '5432') + '/' + database;
}

async function removerBanco(cliente) {
  await cliente.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [NOME_BANCO]);
  await cliente.query('DROP DATABASE IF EXISTS "' + NOME_BANCO + '"');
}

function executarScript(arquivo, ambiente) {
  return new Promise(function (resolver, rejeitar) {
    const processo = childProcess.spawn(process.execPath, [path.join(__dirname, arquivo)], {
      cwd: path.join(__dirname, '..'),
      env: ambiente,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let saida = '';
    let erros = '';
    processo.stdout.on('data', function (dados) { saida += dados.toString(); });
    processo.stderr.on('data', function (dados) { erros += dados.toString(); });
    processo.once('error', rejeitar);
    processo.once('close', function (codigo) {
      if (codigo !== 0) return rejeitar(new Error(arquivo + ' falhou.\n' + saida + '\n' + erros));
      resolver((saida + erros).trim());
    });
  });
}

async function executar() {
  garantirPostgresLocal();
  const administracao = new pg.Client(configuracao('postgres'));
  let bancoTeste = null;
  let administracaoConectada = false;

  try {
    await administracao.connect();
    administracaoConectada = true;
    await removerBanco(administracao);
    await administracao.query('CREATE DATABASE "' + NOME_BANCO + '"');
    bancoTeste = new pg.Client(configuracao(NOME_BANCO));
    await bancoTeste.connect();
    await bancoTeste.query(fs.readFileSync(
      path.join(__dirname, '..', 'database', 'criar_banco.sql'),
      'utf8'
    ));
    const senhaHash = await bcrypt.hash('SenhaQACorrecoes123!', 4);
    await bancoTeste.query(
      `INSERT INTO usuarios (nome,email,senha_hash,perfil,ativo)
       VALUES ('QA Correções Admin','qa.correcoes@invalid.local',$1,'administrador',TRUE)`,
      [senhaHash]
    );
    await bancoTeste.end();
    bancoTeste = null;

    const ambiente = Object.assign({}, process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: urlLocal(NOME_BANCO),
      BANCO_SSL: 'false'
    });
    const resultados = [];
    let indice;
    for (indice = 0; indice < SCRIPTS.length; indice += 1) {
      resultados.push(await executarScript(SCRIPTS[indice], ambiente));
    }
    console.log(resultados.join('\n'));
    console.log('Correções finais: 11 grupos locais isolados aprovados.');
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
