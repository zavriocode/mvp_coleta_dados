const banco = require('../../config/banco');
const templateMetaService = require('./templateMetaService');

const INTERVALO_PADRAO_MS = 15 * 60 * 1000;
const ATRASO_INICIAL_PADRAO_MS = 5000;
let temporizadorInicial = null;
let temporizadorRecorrente = null;
let executando = false;

function numeroConfigurado(nome, padrao, minimo, maximo) {
  const recebido = Number(process.env[nome]);
  if (!Number.isFinite(recebido)) return padrao;
  const inteiro = Math.trunc(recebido);
  if (inteiro < minimo || inteiro > maximo) return padrao;
  return inteiro;
}

function possuiConfiguracaoMeta() {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN &&
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID &&
    process.env.META_GRAPH_API_VERSION
  );
}

function deveIniciar() {
  if (process.env.META_TEMPLATES_SINCRONIZACAO_AUTOMATICA === 'false') return false;
  return process.env.NODE_ENV === 'production' && possuiConfiguracaoMeta();
}

function registrarResultado(resumo) {
  console.log(JSON.stringify({
    nivel: 'info',
    evento: 'sincronizacao_automatica_templates_meta',
    total: resumo.total,
    criados: resumo.criados,
    atualizados: resumo.atualizados,
    indisponibilizados: resumo.indisponibilizados
  }));
}

function registrarFalha(erro) {
  console.error(JSON.stringify({
    nivel: 'erro',
    evento: 'falha_sincronizacao_automatica_templates_meta',
    codigo: erro.codigoIntegracao || 'SINCRONIZACAO_TEMPLATES_FALHOU'
  }));
}

async function executarAdmitido() {
  if (executando || !possuiConfiguracaoMeta()) {
    return { executado: false, motivo: executando ? 'sincronizacao_em_andamento' : 'meta_nao_configurada' };
  }
  executando = true;
  let cliente = null;
  let travaAdquirida = false;
  try {
    cliente = await banco.connect();
    travaAdquirida = (await cliente.query(
      'SELECT pg_try_advisory_lock(41032, 0) AS adquirida'
    )).rows[0].adquirida;
    if (!travaAdquirida) return { executado: false, motivo: 'outra_instancia_sincronizando' };
    const resumo = await templateMetaService.sincronizarAutomaticamente();
    registrarResultado(resumo);
    return { executado: true, resumo };
  } catch (erro) {
    registrarFalha(erro);
    return { executado: false, motivo: 'falha_meta', codigo: erro.codigoIntegracao || null };
  } finally {
    if (travaAdquirida && cliente) {
      try { await cliente.query('SELECT pg_advisory_unlock(41032, 0)'); }
      catch (erro) { registrarFalha(erro); }
    }
    if (cliente) cliente.release();
    executando = false;
  }
}

async function executarAgora() {
  return require('../backups/controleRecuperacao').job('templates', executarAdmitido);
}

function iniciar() {
  if (!deveIniciar() || temporizadorInicial || temporizadorRecorrente) return false;
  const atrasoInicial = numeroConfigurado(
    'META_TEMPLATES_SINCRONIZACAO_ATRASO_INICIAL_MS',
    ATRASO_INICIAL_PADRAO_MS,
    0,
    5 * 60 * 1000
  );
  const intervalo = numeroConfigurado(
    'META_TEMPLATES_SINCRONIZACAO_INTERVALO_MS',
    INTERVALO_PADRAO_MS,
    60 * 1000,
    24 * 60 * 60 * 1000
  );
  temporizadorInicial = setTimeout(function () {
    temporizadorInicial = null;
    executarAgora();
  }, atrasoInicial);
  temporizadorInicial.unref();
  temporizadorRecorrente = setInterval(executarAgora, intervalo);
  temporizadorRecorrente.unref();
  return true;
}

function parar() {
  if (temporizadorInicial) clearTimeout(temporizadorInicial);
  if (temporizadorRecorrente) clearInterval(temporizadorRecorrente);
  temporizadorInicial = null;
  temporizadorRecorrente = null;
}

module.exports = { executarAgora, iniciar, parar };
