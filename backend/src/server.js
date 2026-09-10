require('dotenv').config({ quiet: true });

const aplicacao = require('./app');
const banco = require('./config/banco');
const validarAmbiente = require('./config/validarAmbiente');
const sincronizacaoAutomaticaTemplates = require('./modules/campanhas/sincronizacaoAutomaticaTemplates');
const mensageriaService = require('./modules/mensageria/mensageriaService');

const porta = Number(process.env.PORT || process.env.PORTA) || 3000;
let recuperacaoMensageriaEmAndamento = false;

async function recuperarMensageria() {
  if (recuperacaoMensageriaEmAndamento) return;
  recuperacaoMensageriaEmAndamento = true;
  try {
    const resultado = await mensageriaService.recuperarProcessamentoPendente();
    if (resultado.tentativasIndeterminadas || resultado.eventosCorrelacionados) {
      console.info(JSON.stringify({ evento: 'recuperacao_mensageria', resultado }));
    }
  } catch (erro) {
    console.error('Falha ao recuperar pendências de mensageria:', erro.message);
  } finally {
    recuperacaoMensageriaEmAndamento = false;
  }
}

validarAmbiente();

const servidor = aplicacao.listen(porta, function () {
  console.log('Servidor iniciado na porta ' + porta + '.');
  sincronizacaoAutomaticaTemplates.iniciar();
  recuperarMensageria();
});

const temporizadorRecuperacaoMensageria = setInterval(recuperarMensageria, 60000);
temporizadorRecuperacaoMensageria.unref();

servidor.requestTimeout = 30000;
servidor.headersTimeout = 65000;
servidor.keepAliveTimeout = 60000;
servidor.maxRequestsPerSocket = 1000;

let encerramentoIniciado = false;

function encerrarAplicacao(motivo, erroFatal) {
  if (encerramentoIniciado) {
    return;
  }

  encerramentoIniciado = true;
  clearInterval(temporizadorRecuperacaoMensageria);
  sincronizacaoAutomaticaTemplates.parar();
  const codigoSaida = erroFatal ? 1 : 0;
  console.log('Encerrando aplicação: ' + motivo + '.');

  const temporizador = setTimeout(function () {
    console.error('Encerramento forçado após exceder o tempo limite.');
    process.exit(1);
  }, 25000);
  temporizador.unref();

  servidor.close(function (erroFechamento) {
    banco.end()
      .then(function () {
        clearTimeout(temporizador);

        if (erroFechamento) {
          console.error('Erro ao encerrar o servidor:', erroFechamento.message);
          process.exitCode = 1;
          return;
        }

        process.exitCode = codigoSaida;
      })
      .catch(function (erroBanco) {
        clearTimeout(temporizador);
        console.error('Erro ao encerrar o pool PostgreSQL:', erroBanco.message);
        process.exitCode = 1;
      });
  });

  if (typeof servidor.closeIdleConnections === 'function') {
    servidor.closeIdleConnections();
  }
}

process.once('SIGTERM', function () {
  encerrarAplicacao('SIGTERM', false);
});

process.once('SIGINT', function () {
  encerrarAplicacao('SIGINT', false);
});

process.once('uncaughtException', function (erro) {
  console.error('Exceção não tratada:', erro);
  encerrarAplicacao('uncaughtException', true);
});

process.once('unhandledRejection', function (motivo) {
  console.error('Promise rejeitada sem tratamento:', motivo);
  encerrarAplicacao('unhandledRejection', true);
});
