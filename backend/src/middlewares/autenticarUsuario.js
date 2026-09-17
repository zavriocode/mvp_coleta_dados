const jwt = require('jsonwebtoken');
const usuarioModel = require('../modules/usuarios/usuarioModel');
const criarAppError = require('../utils/AppError');

async function autenticarUsuario(requisicao, resposta, proximo) {
  const authorization = requisicao.headers.authorization;

  if (!authorization) {
    return proximo(criarAppError('Token não fornecido.', 401));
  }

  const partesDoAuthorization = authorization.split(' ');
  const palavraBearer = partesDoAuthorization[0];
  const token = partesDoAuthorization[1];

  if (!token) {
    return proximo(criarAppError('Token não fornecido.', 401));
  }

  if (partesDoAuthorization.length !== 2 || palavraBearer !== 'Bearer') {
    return proximo(criarAppError('Token inválido.', 401));
  }

  const segredoJwt = process.env.JWT_SECRET || process.env.JWT_SEGREDO;

  if (!segredoJwt) {
    return proximo(new Error('JWT_SECRET não está configurado.'));
  }

  try {
    const dadosDoToken = jwt.verify(token, segredoJwt, { algorithms: ['HS256'] });
    const controle = await require('../modules/backups/controleRecuperacao').estado();
    if (String(dadosDoToken.auth_epoch ?? 0) !== String(controle.auth_epoch)) {
      return proximo(criarAppError('Sessão invalidada pela recuperação. Faça novo login.', 401));
    }
    const usuario = await usuarioModel.buscarPorId(dadosDoToken.id);

    if (!usuario || usuario.ativo !== true) {
      return proximo(criarAppError('Token inválido.', 401));
    }

    requisicao.usuario = {
      auth_epoch: String(controle.auth_epoch),
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil
    };

    return proximo();
  } catch (erro) {
    if (erro.statusHttp) {
      return proximo(erro);
    }

    return proximo(criarAppError('Token inválido.', 401));
  }
}

module.exports = autenticarUsuario;
