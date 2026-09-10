require('dotenv').config({ quiet: true });

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const pg = require('pg');

const NOME_BANCO = 'acorda_rj_campanhas_qa_' + process.pid;
const SCRIPTS = [
  'testarCampanhasEscala.js',
  'testarCampanhas.js',
  'testarExclusaoArquivamentoCampanhas.js',
  'testarTemplatesMeta.js',
  'testarRequisitosEnvioTemplates.js',
  'testarRegressaoParametrosBodyMeta.js',
  'testarReprocessamentoParametrosBodyMeta.js',
  'testarParametrosNomeadosMeta.js',
  'testarLogErroMeta.js',
  'testarPersistenciaImagemTemplate.js',
  'testarExclusaoModelos.js',
  'testarTemplatesExternosMeta.js',
  'testarIntegracaoMeta.js',
  'testarWebhookMensageria.js',
  'testarCenarioFinalCampanhaMeta.js',
  'testarEnvioCampanhaSimplificado.js',
  'testarResilienciaMensageria.js'
];

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

function urlBanco(nomeBanco) {
  if (process.env.DATABASE_URL) {
    const endereco = new URL(process.env.DATABASE_URL);
    endereco.pathname = '/' + nomeBanco;
    return endereco.toString();
  }
  return 'postgresql://' + encodeURIComponent(process.env.BANCO_USUARIO || '') + ':' +
    encodeURIComponent(process.env.BANCO_SENHA || '') + '@' +
    (process.env.BANCO_HOST || '127.0.0.1') + ':' + (process.env.BANCO_PORTA || '5432') +
    '/' + nomeBanco + (process.env.BANCO_SSL === 'true' ? '?sslmode=require' : '');
}

async function removerBanco(cliente) {
  await cliente.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [NOME_BANCO]);
  await cliente.query('DROP DATABASE IF EXISTS "' + NOME_BANCO + '"');
}

function executarScript(arquivo, ambiente) {
  return new Promise(function (resolver, rejeitar) {
    const processo = childProcess.spawn(process.execPath, [path.join(__dirname, arquivo)], {
      cwd: path.join(__dirname, '..'), env: ambiente, shell: false, windowsHide: true,
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
  const administracao = new pg.Client(configuracao('postgres'));
  let administracaoConectada = false;
  let bancoTeste;
  try {
    await administracao.connect();
    administracaoConectada = true;
    await removerBanco(administracao);
    await administracao.query('CREATE DATABASE "' + NOME_BANCO + '"');
    bancoTeste = new pg.Client(configuracao(NOME_BANCO));
    await bancoTeste.connect();
    const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'criar_banco.sql'), 'utf8');
    await bancoTeste.query(schema);
    const senhaHash = await bcrypt.hash('SenhaQACampanhas123!', 4);
    await bancoTeste.query(`
      INSERT INTO usuarios (nome,email,senha_hash,perfil,ativo)
      VALUES ('QA Campanhas Admin','qa.campanhas@invalid.local',$1,'administrador',TRUE)
    `, [senhaHash]);
    await bancoTeste.end();
    bancoTeste = null;

    const ambiente = Object.assign({}, process.env, {
      NODE_ENV: 'test', DATABASE_URL: urlBanco(NOME_BANCO),
      META_GRAPH_API_VERSION: 'v99.0', META_APP_ID: '1122334455',
      WHATSAPP_ACCESS_TOKEN: 'token-qa-falso', WHATSAPP_PHONE_NUMBER_ID: '123456789',
      WHATSAPP_BUSINESS_ACCOUNT_ID: '987654321',
      META_APP_SECRET: 'segredo-qa-falso', WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'verify-qa-falso',
      WHATSAPP_OPTOUT_BUTTON_ID: 'nao_quero_mais_receber'
    });
    const resultados = [];
    let indice;
    for (indice = 0; indice < SCRIPTS.length; indice += 1) {
      resultados.push(await executarScript(SCRIPTS[indice], ambiente));
    }
    console.log(resultados.join('\n'));
    console.log('Fluxo isolado campanhas -> Meta mock: 17 grupos aprovados; nenhuma chamada real executada.');
  } finally {
    if (bancoTeste) await bancoTeste.end().catch(function () {});
    if (administracaoConectada) await removerBanco(administracao).catch(function () {});
    await administracao.end().catch(function () {});
  }
}

executar().catch(function (erro) {
  console.error(erro.stack || erro.message);
  process.exitCode = 1;
});
