const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const usuarioModel = require('../usuarios/usuarioModel');
const criarAppError = require('../../utils/AppError');

const HASH_COMPARACAO = '$2b$12$WFusZMI33Zk44zfKmJeAv.3S/6Y9FkAkbUJX2GLcQc.pQ32yQsoL6';

function normalizarEmail(email) {
  return email.trim().toLowerCase();
}

function lerConfiguracaoInteira(nome, valorPadrao, minimo, maximo) {
  const valor = Number(process.env[nome] || valorPadrao);

  if (!Number.isInteger(valor) || valor < minimo || valor > maximo) {
    throw new Error(nome + ' possui uma configuração inválida.');
  }

  return valor;
}

function prepararContexto(contextoRecebido) {
  const contexto = contextoRecebido || {};
  const enderecoIp = typeof contexto.enderecoIp === 'string' && contexto.enderecoIp
    ? contexto.enderecoIp.slice(0, 64)
    : 'nao-identificado';
  const agenteUsuario = typeof contexto.agenteUsuario === 'string'
    ? contexto.agenteUsuario.slice(0, 500)
    : null;

  return { enderecoIp, agenteUsuario };
}

function bloqueioEstaAtivo(usuario) {
  if (!usuario.bloqueado_ate) {
    return false;
  }

  return new Date(usuario.bloqueado_ate).getTime() > Date.now();
}

async function registrarTentativa(usuario, email, contexto, sucesso, motivo) {
  await usuarioModel.registrarTentativa({
    usuarioId: usuario ? usuario.id : null,
    email,
    enderecoIp: contexto.enderecoIp,
    agenteUsuario: contexto.agenteUsuario,
    sucesso,
    motivo
  });
}

function validarDadosRecebidos(dadosRecebidos) {
  if (!dadosRecebidos || typeof dadosRecebidos !== 'object' || Array.isArray(dadosRecebidos)) {
    throw criarAppError('Email e senha são obrigatórios.', 400);
  }

  if (typeof dadosRecebidos.email !== 'string' || dadosRecebidos.email.trim() === '') {
    throw criarAppError('Email é obrigatório.', 400);
  }

  if (typeof dadosRecebidos.senha !== 'string' || dadosRecebidos.senha === '') {
    throw criarAppError('Senha é obrigatória.', 400);
  }
}

async function realizarLogin(dadosRecebidos, contextoRecebido) {
  validarDadosRecebidos(dadosRecebidos);
  const controle = require('../backups/controleRecuperacao');
  const estadoControle = await controle.estado();
  if (estadoControle.manutencao) {
    // Não escrever no snapshot operacional durante manutenção.
    // Limitação persistente de tentativas fica na auditoria preservada.
    const banco = require('../../config/banco');
    const contexto = prepararContexto(contextoRecebido);
    const recentes = await banco.query(`SELECT count(*)::int AS n FROM recuperacao.auditoria
      WHERE evento='login_manutencao_falhou' AND criado_em > now()-interval '15 minutes'
      AND dados->>'ip'=$1`, [contexto.enderecoIp]);
    if (recentes.rows[0].n >= 10) throw criarAppError('Aguarde antes de tentar novamente.', 429);
    const u = await usuarioModel.buscarPorEmail(normalizarEmail(dadosRecebidos.email));
    const senhaOk = await bcrypt.compare(dadosRecebidos.senha, u ? u.senha_hash : HASH_COMPARACAO);
    if (!u || !senhaOk || !u.ativo || u.perfil !== 'administrador' || bloqueioEstaAtivo(u)) {
      await controle.auditar('login_manutencao_falhou', null, estadoControle.operacao_id, { ip: contexto.enderecoIp });
      throw criarAppError('Credenciais administrativas inválidas.', 401);
    }
    const token = jwt.sign({ id: u.id, email: u.email, perfil: u.perfil, auth_epoch: String(estadoControle.auth_epoch) },
      process.env.JWT_SECRET || process.env.JWT_SEGREDO,
      { algorithm: 'HS256', expiresIn: process.env.JWT_TEMPO_EXPIRACAO || process.env.JWT_EXPIRACAO });
    await controle.auditar('login_manutencao', u.id, estadoControle.operacao_id);
    return { token, usuario: { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil } };
  }

  const limiteFalhasConta = lerConfiguracaoInteira('LOGIN_LIMITE_CONTA', 5, 3, 20);
  const limiteFalhasIp = lerConfiguracaoInteira('LOGIN_LIMITE_IP', 20, 5, 200);
  const janelaMinutos = lerConfiguracaoInteira('LOGIN_JANELA_MINUTOS', 15, 1, 1440);
  const bloqueioMinutos = lerConfiguracaoInteira('LOGIN_BLOQUEIO_MINUTOS', 15, 1, 1440);
  const contexto = prepararContexto(contextoRecebido);
  const email = normalizarEmail(dadosRecebidos.email);
  const contagensFalhas = await Promise.all([
    usuarioModel.contarFalhasRecentesPorIp(contexto.enderecoIp, janelaMinutos),
    usuarioModel.contarFalhasRecentesPorEmail(email, janelaMinutos)
  ]);
  const falhasDoIp = contagensFalhas[0];
  const falhasDoEmail = contagensFalhas[1];

  if (falhasDoIp >= limiteFalhasIp || falhasDoEmail >= limiteFalhasConta) {
    const usuarioLimitado = await usuarioModel.buscarPorEmail(email);
    await registrarTentativa(
      usuarioLimitado,
      email,
      contexto,
      false,
      'conta_bloqueada'
    );
    throw criarAppError(
      'Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.',
      429
    );
  }

  const usuario = await usuarioModel.buscarPorEmail(email);

  if (usuario && usuario.bloqueado_ate && !bloqueioEstaAtivo(usuario)) {
    await usuarioModel.liberarBloqueioExpirado(usuario.id);
    usuario.tentativas_login_falhas = 0;
    usuario.bloqueado_ate = null;
  }

  if (usuario && bloqueioEstaAtivo(usuario)) {
    await registrarTentativa(usuario, email, contexto, false, 'conta_bloqueada');
    throw criarAppError(
      'Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.',
      429
    );
  }

  const hashParaComparacao = usuario ? usuario.senha_hash : HASH_COMPARACAO;
  const senhaCorreta = await bcrypt.compare(dadosRecebidos.senha, hashParaComparacao);

  if (!usuario || !senhaCorreta) {
    if (usuario) {
      await usuarioModel.registrarFalhaDoUsuario(
        usuario.id,
        limiteFalhasConta,
        bloqueioMinutos
      );
    }

    await registrarTentativa(usuario, email, contexto, false, 'credenciais_invalidas');
    throw criarAppError('Email ou senha inválidos.', 401);
  }

  if (usuario.ativo !== true) {
    await registrarTentativa(usuario, email, contexto, false, 'usuario_inativo');
    throw criarAppError('Email ou senha inválidos.', 401);
  }

  const segredoJwt = process.env.JWT_SECRET || process.env.JWT_SEGREDO;
  const tempoExpiracao = process.env.JWT_TEMPO_EXPIRACAO || process.env.JWT_EXPIRACAO;

  if (!segredoJwt) {
    throw new Error('JWT_SECRET não está configurado.');
  }

  if (!tempoExpiracao) {
    throw new Error('JWT_TEMPO_EXPIRACAO não está configurado.');
  }

  await usuarioModel.registrarLoginBemSucedido(usuario.id);
  await registrarTentativa(usuario, email, contexto, true, 'sucesso');

  const token = jwt.sign(
    {
      auth_epoch: String(estadoControle.auth_epoch),
      id: usuario.id,
      email: usuario.email,
      perfil: usuario.perfil
    },
    segredoJwt,
    { algorithm: 'HS256', expiresIn: tempoExpiracao }
  );

  return {
    token,
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil
    }
  };
}

module.exports = {
  realizarLogin
};
