require('dotenv').config({ quiet: true });

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const pg = require('pg');
const crypto = require('crypto');

const NOME_BANCO = 'acorda_rj_e2e_' + process.pid;
const SCRIPTS = [
  ['A e C', 'testarCadastroManual.js'],
  ['B e C', 'testarCadastroPublico.js'],
  ['D, E e F', 'testarImportacoes.js'],
  ['D e E - carga', 'testarImportacaoCarga.js'],
  ['G e I', 'testarEventosExclusoes.js'],
  ['H e I', 'testarPrivacidadeAdministrativa.js'],
  ['J e N', 'testarCampanhas.js'],
  ['Templates oficiais Meta', 'testarTemplatesMeta.js'],
  ['K e L', 'testarIntegracaoMeta.js'],
  ['K, L e M', 'testarWebhookMensageria.js'],
  ['M', 'testarSincronizacaoLimiteMeta.js'],
  ['O', 'testarSegurancaUsuarios.js'],
  ['Coerencia administrativa', 'testarAdministracao.js'],
  ['Coerencia de filtros e relatorios', 'testarRelatorios.js'],
  ['Backup operacional', 'testarBackups.js'],
  ['Falhas controladas', 'testarResiliencia.js']
];

function garantirPostgresLocal() {
  const host = String(process.env.BANCO_HOST || '').toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error('O teste E2E isolado exige BANCO_HOST local e nunca utiliza DATABASE_URL.');
  }
}

function criarConfiguracao(nomeBanco) {
  return {
    host: process.env.BANCO_HOST,
    port: Number(process.env.BANCO_PORTA) || 5432,
    user: process.env.BANCO_USUARIO,
    password: process.env.BANCO_SENHA,
    database: nomeBanco,
    ssl: false
  };
}

function criarUrlBanco(nomeBanco) {
  const usuario = encodeURIComponent(process.env.BANCO_USUARIO || '');
  const senha = encodeURIComponent(process.env.BANCO_SENHA || '');
  const host = process.env.BANCO_HOST || '127.0.0.1';
  const porta = process.env.BANCO_PORTA || '5432';
  return 'postgresql://' + usuario + ':' + senha + '@' + host + ':' + porta +
    '/' + nomeBanco;
}

async function removerBanco(administracao) {
  await administracao.query(
    'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
    [NOME_BANCO]
  );
  await administracao.query('DROP DATABASE IF EXISTS "' + NOME_BANCO + '"');
}

function executarScript(nomeArquivo, ambiente) {
  return new Promise(function (resolver, rejeitar) {
    const processo = childProcess.spawn(
      process.execPath,
      [path.join(__dirname, nomeArquivo)],
      {
        cwd: path.join(__dirname, '..'),
        env: ambiente,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
    let saida = '';
    let erroRecebido = '';

    processo.stdout.on('data', function (dados) { saida += dados.toString(); });
    processo.stderr.on('data', function (dados) { erroRecebido += dados.toString(); });
    processo.once('error', rejeitar);
    processo.once('close', function (codigo) {
      if (codigo !== 0) {
        const erro = new Error(
          nomeArquivo + ' falhou com codigo ' + codigo + '.\n' +
          saida + '\n' + erroRecebido
        );
        erro.codigoSaida = codigo;
        rejeitar(erro);
        return;
      }
      resolver((saida + erroRecebido).trim());
    });
  });
}

async function prepararBanco(bancoTeste) {
  const schema = fs.readFileSync(
    path.join(__dirname, '..', 'database', 'criar_banco.sql'),
    'utf8'
  );
  await bancoTeste.query(schema);
  const senhaHash = await bcrypt.hash('SenhaE2ESegura123!', 4);
  await bancoTeste.query(
    `INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo)
     VALUES ('QA E2E Administrador', 'qa.e2e.admin@invalid.local', $1,
       'administrador', TRUE)`,
    [senhaHash]
  );
}

async function validarEstadoFinal(bancoTeste) {
  const estado = (await bancoTeste.query(`
    SELECT
      (SELECT COUNT(*)::integer FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS tabelas,
      (SELECT COUNT(*)::integer FROM bairros WHERE ativo = TRUE) AS bairros,
      (SELECT COUNT(*)::integer FROM schema_migrations) AS migrations,
      (SELECT COUNT(*)::integer FROM contatos
        WHERE nome ILIKE '%TESTE%' OR nome ILIKE '%QA%') AS contatos_qa,
      (SELECT COUNT(*)::integer FROM usuarios
        WHERE email LIKE '%@invalid.local' AND email <> 'qa.e2e.admin@invalid.local') AS usuarios_qa,
      (SELECT COUNT(*)::integer FROM campanhas
        WHERE nome LIKE 'TESTE_%') AS campanhas_qa,
      (SELECT COUNT(*)::integer FROM eventos
        WHERE nome ILIKE '%teste%' OR nome ILIKE '%mutirao%') AS eventos_qa
  `)).rows[0];

  if (estado.tabelas !== 31 || estado.bairros !== 166 || estado.migrations !== 23) {
    throw new Error('Estrutura do banco isolado divergiu durante as jornadas.');
  }
  if (
    estado.contatos_qa !== 0 || estado.usuarios_qa !== 0 ||
    estado.campanhas_qa !== 0 || estado.eventos_qa !== 0
  ) {
    throw new Error('Um teste deixou dados QA residuais no banco isolado: ' + JSON.stringify(estado));
  }

  return estado;
}

async function executar() {
  garantirPostgresLocal();
  const administracao = new pg.Client(criarConfiguracao('postgres'));
  let bancoTeste;
  let administracaoConectada = false;
  const resultados = [];

  try {
    await administracao.connect();
    administracaoConectada = true;
    await removerBanco(administracao);
    await administracao.query('CREATE DATABASE "' + NOME_BANCO + '"');

    bancoTeste = new pg.Client(criarConfiguracao(NOME_BANCO));
    await bancoTeste.connect();
    await prepararBanco(bancoTeste);

    const ambiente = Object.assign({}, process.env, {
      DATABASE_URL: criarUrlBanco(NOME_BANCO),
      NODE_ENV: 'test',
      BANCO_SSL: 'false',
      JWT_SECRET: crypto.randomBytes(40).toString('hex'),
      JWT_TEMPO_EXPIRACAO: '1h',
      BACKUP_ASSINATURA_CHAVE: crypto.randomBytes(32).toString('hex'),
      META_GRAPH_API_VERSION: 'v99.0',
      META_APP_ID: '1122334455',
      WHATSAPP_ACCESS_TOKEN: 'token-qa-falso',
      WHATSAPP_PHONE_NUMBER_ID: '123456789',
      WHATSAPP_BUSINESS_ACCOUNT_ID: '987654321'
    });

    let indice;
    for (indice = 0; indice < SCRIPTS.length; indice += 1) {
      const jornada = SCRIPTS[indice][0];
      const arquivo = SCRIPTS[indice][1];
      const saida = await executarScript(arquivo, ambiente);
      resultados.push({ jornada, arquivo, saida });
      console.log('[APROVADO] Jornada ' + jornada + ' - ' + arquivo);
    }

    const estado = await validarEstadoFinal(bancoTeste);
    console.log('Coerencia final aprovada: ' + JSON.stringify(estado));
    console.log('QA E2E isolado: ' + resultados.length + ' grupos de jornadas aprovados.');
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
