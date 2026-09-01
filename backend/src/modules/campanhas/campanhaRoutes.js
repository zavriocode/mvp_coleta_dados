const express = require('express');
const multer = require('multer');
const controller = require('./campanhaController');
const autorizarAdministrador = require('../../middlewares/autorizarAdministrador');
const criarAppError = require('../../utils/AppError');
const roteador = express.Router();
const uploadImagem = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }
});

function receberImagem(requisicao, resposta, proximo) {
  uploadImagem.single('imagem')(requisicao, resposta, function (erro) {
    if (erro) {
      return proximo(criarAppError('A imagem deve ser JPG ou PNG e ter no maximo 5 MB.', 400));
    }
    return proximo();
  });
}

roteador.get('/templates', controller.listarTemplates);
roteador.post('/templates/sincronizar-meta', autorizarAdministrador, controller.sincronizarTemplatesMeta);
roteador.post('/templates/imagem-exemplo', autorizarAdministrador, receberImagem, controller.prepararImagemTemplate);
roteador.post('/templates/imagem-envio', autorizarAdministrador, receberImagem, controller.prepararImagemEnvioTemplate);
roteador.post('/templates', autorizarAdministrador, controller.criarTemplate);
roteador.post('/templates/:id/submeter-meta', autorizarAdministrador, controller.submeterTemplate);
roteador.put('/templates/:id/configuracao-envio', autorizarAdministrador, controller.configurarEnvioTemplate);
roteador.put('/templates/:id', autorizarAdministrador, controller.atualizarTemplate);
roteador.delete('/templates/:id', autorizarAdministrador, controller.excluirTemplate);
roteador.get('/configuracao/limite', controller.obterLimite);
roteador.put('/configuracao/limite', autorizarAdministrador, controller.atualizarLimite);
roteador.post('/configuracao/limite/sincronizar-meta', autorizarAdministrador, controller.sincronizarLimiteMeta);
roteador.post('/publico/previa', autorizarAdministrador, controller.visualizarPreviaFiltros);
roteador.get('/', controller.listar);
roteador.post('/', autorizarAdministrador, controller.criar);
roteador.put('/:id', autorizarAdministrador, controller.atualizar);
roteador.post('/:id/status', autorizarAdministrador, controller.alterarStatus);
roteador.delete('/:id', autorizarAdministrador, controller.excluirOuArquivar);
roteador.get('/:id/publico', controller.visualizarPublico);
roteador.post('/:id/envios', controller.prepararEnvio);
roteador.get('/:id/lotes', controller.listarLotes);
roteador.post('/:id/lotes', controller.criarLote);
roteador.get('/:id/lotes/:loteId/contatos', controller.listarContatosLote);
roteador.get('/:id/falhas', controller.listarFalhas);

module.exports = roteador;
