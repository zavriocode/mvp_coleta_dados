function exigirTexto(nome) {
  const valor = process.env[nome];

  if (typeof valor !== 'string' || !valor.trim()) {
    throw new Error(nome + ' deve ser configurado em produção.');
  }

  return valor.trim();
}

function validarUrlHttps(nome, valor) {
  let endereco;

  try {
    endereco = new URL(valor);
  } catch (erro) {
    throw new Error(nome + ' deve conter uma URL válida.');
  }

  if (endereco.protocol !== 'https:') {
    throw new Error(nome + ' deve usar HTTPS em produção.');
  }

  return endereco;
}

function validarAmbiente() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const segredoJwt = exigirTexto('JWT_SECRET');
  const frontendUrl = exigirTexto('FRONTEND_URL');

  if (Buffer.byteLength(segredoJwt, 'utf8') < 32) {
    throw new Error('JWT_SECRET deve possuir pelo menos 32 bytes em produção.');
  }

  validarUrlHttps('FRONTEND_URL', frontendUrl);
  exigirTexto('JWT_TEMPO_EXPIRACAO');

  [
    'BACKUP_ASSINATURA_CHAVE',
    'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
    'META_APP_SECRET',
    'META_APP_ID',
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_BUSINESS_ACCOUNT_ID',
    'META_GRAPH_API_VERSION',
    'WHATSAPP_OPTOUT_BUTTON_ID'
  ].forEach(exigirTexto);

  if (process.env.DATABASE_URL) {
    const enderecoBanco = validarUrlHttpsBanco(process.env.DATABASE_URL);
    const modoSsl = enderecoBanco.searchParams.get('sslmode');

    if (!['require', 'verify-ca', 'verify-full'].includes(modoSsl)) {
      throw new Error('DATABASE_URL deve habilitar TLS com sslmode em produção.');
    }
  } else {
    exigirTexto('BANCO_HOST');
    exigirTexto('BANCO_USUARIO');
    exigirTexto('BANCO_SENHA');
    exigirTexto('BANCO_NOME');

    if (process.env.BANCO_SSL !== 'true') {
      throw new Error('BANCO_SSL deve ser true em produção.');
    }
  }
}

function validarUrlHttpsBanco(valor) {
  let endereco;

  try {
    endereco = new URL(valor);
  } catch (erro) {
    throw new Error('DATABASE_URL deve conter uma URL válida.');
  }

  if (endereco.protocol !== 'postgresql:' && endereco.protocol !== 'postgres:') {
    throw new Error('DATABASE_URL deve usar o protocolo PostgreSQL.');
  }

  return endereco;
}

module.exports = validarAmbiente;
