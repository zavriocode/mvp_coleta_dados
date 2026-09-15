const express = require('express');
const autorizarAdministrador = require('../../middlewares/autorizarAdministrador');
const backupController = require('./backupController');

const roteador = express.Router();

roteador.use(autorizarAdministrador);
roteador.get('/', backupController.listar);
roteador.post('/banco', backupController.gerar);
roteador.get('/:id/download', backupController.baixar);

module.exports = roteador;
