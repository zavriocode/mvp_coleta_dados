const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const testeRoutes = require('./modules/teste/testeRoutes');
const contatoPublicoRoutes = require('./modules/contatos/contatoPublicoRoutes');
const contatoAdminRoutes = require('./modules/contatos/contatoAdminRoutes');
const autenticacaoRoutes = require('./modules/autenticacao/autenticacaoRoutes');
const origemRoutes = require('./modules/origens/origemRoutes');
const campanhaRoutes = require('./modules/campanhas/campanhaRoutes');
const mensageriaRoutes = require('./modules/mensageria/mensageriaRoutes');
const webhookRoutes = require('./modules/mensageria/webhookRoutes');
const importacaoRoutes = require('./modules/importacoes/importacaoRoutes');
const relatorioRoutes = require('./modules/relatorios/relatorioRoutes');
const usuarioRoutes = require('./modules/usuarios/usuarioRoutes');
const eventoRoutes = require('./modules/eventos/eventoRoutes');
const solicitacaoExclusaoRoutes = require('./modules/exclusoes/solicitacaoExclusaoRoutes');
const backupRoutes = require('./modules/backups/backupRoutes');
const autenticarUsuario = require('./middlewares/autenticarUsuario');
const identificarRequisicao = require('./middlewares/identificarRequisicao');
const criarLimitadorConcorrencia = require('./middlewares/limitarConcorrencia');
const limitadores = require('./middlewares/limitarRequisicoes');
const rotaNaoEncontrada = require('./middlewares/rotaNaoEncontrada');
const tratarErro = require('./middlewares/tratarErro');

const aplicacao = express();

function impedirCacheDeDadosPrivados(requisicao, resposta, proximo) {
  resposta.setHeader('Cache-Control', 'no-store');
  resposta.setHeader('Pragma', 'no-cache');
  return proximo();
}

const saltosProxy = Number(process.env.TRUST_PROXY_HOPS || 0);

if (Number.isInteger(saltosProxy) && saltosProxy > 0) {
  aplicacao.set('trust proxy', saltosProxy);
}

aplicacao.use(helmet());
aplicacao.use(cors({
  origin: process.env.FRONTEND_URL,
  exposedHeaders: ['Content-Disposition', 'X-Backup-SHA256', 'X-Request-Id']
}));
aplicacao.use(identificarRequisicao);
aplicacao.use(compression({ threshold: 1024 }));
aplicacao.use(limitadores.criarLimitadorGlobal());
aplicacao.use(criarLimitadorConcorrencia());
aplicacao.use(require('./modules/backups/controleRecuperacao').middleware);
aplicacao.use('/api/webhooks/whatsapp', webhookRoutes);
aplicacao.use(express.json({ limit: '32kb', strict: true }));
aplicacao.post(
  [
    '/api/publico/contatos',
    '/api/publico/contatos/verificar-evento',
    '/api/publico/contatos/inscrever-evento'
  ],
  limitadores.criarLimitadorCadastroPublico()
);
aplicacao.use('/api', testeRoutes);
aplicacao.use('/api/publico/contatos', contatoPublicoRoutes);
aplicacao.use('/api/autenticacao', impedirCacheDeDadosPrivados);
aplicacao.use('/api/autenticacao', autenticacaoRoutes);
aplicacao.use('/api/admin', impedirCacheDeDadosPrivados);
aplicacao.use('/api/admin', autenticarUsuario);
aplicacao.use('/api/admin/restauracoes', require('./modules/backups/restauracaoRoutes'));
aplicacao.use('/api/admin/contatos', contatoAdminRoutes);
aplicacao.use('/api/admin/origens', origemRoutes);
aplicacao.use('/api/admin/campanhas', campanhaRoutes);
aplicacao.use('/api/admin/mensageria', mensageriaRoutes);
aplicacao.use('/api/admin/importacoes', importacaoRoutes);
aplicacao.use('/api/admin/relatorios', relatorioRoutes);
aplicacao.use('/api/admin/usuarios', usuarioRoutes);
aplicacao.use('/api/admin/eventos', eventoRoutes);
aplicacao.use('/api/admin/solicitacoes-exclusao', solicitacaoExclusaoRoutes);
aplicacao.use('/api/admin/backups', backupRoutes);
aplicacao.use(rotaNaoEncontrada);
aplicacao.use(tratarErro);

module.exports = aplicacao;
