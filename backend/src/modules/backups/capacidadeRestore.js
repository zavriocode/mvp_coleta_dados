const fs = require('fs');
const os = require('os');
const erro = require('../../utils/AppError');

const MENSAGEM_CAPACIDADE = 'Este backup excede a capacidade atual do servidor para restauração. Entre em contato com o suporte.';
function inteiro(nome, padrao, minimo = 1, maximo = Number.MAX_SAFE_INTEGER) {
  const n = Number(process.env[nome] || padrao);
  if (!Number.isSafeInteger(n) || n < minimo || n > maximo) throw erro('A restauração precisa de uma configuração do suporte.', 503);
  return n;
}
function configuracao() {
  return {
    maxBytes: inteiro('RESTORE_UPLOAD_MAX_BYTES', 268435456, 1, Number.MAX_SAFE_INTEGER - 1),
    reservaDisco: inteiro('RESTORE_DISCO_RESERVA_BYTES', 268435456),
    memoriaLivreMinima: inteiro('RESTORE_MEMORIA_LIVRE_MIN_BYTES', 134217728),
    uploadTimeoutMs: inteiro('RESTORE_UPLOAD_TIMEOUT_MS', 900000, 1, 2147483647 - 5000),
    processamentoTimeoutMs: inteiro('RESTORE_PROCESSAMENTO_TIMEOUT_MS', 1800000, 1, 2147483647),
    expansaoMaxBytes: inteiro('RESTORE_EXPANSAO_MAX_BYTES', 2147483648),
    bancoDisponivelBytes: process.env.RESTORE_BANCO_DISPONIVEL_BYTES
      ? inteiro('RESTORE_BANCO_DISPONIVEL_BYTES', 2147483648) : null
  };
}
function insuficiente() { return erro(MENSAGEM_CAPACIDADE, 413); }
function verificarMemoria() {
  const memoria = typeof process.availableMemory === 'function' ? process.availableMemory() : os.freemem();
  if (memoria < configuracao().memoriaLivreMinima) throw insuficiente();
}
async function disco(diretorio, necessario = 0) {
  const stat = await fs.promises.statfs(diretorio);
  const livre = Number(stat.bavail) * Number(stat.bsize);
  if (!Number.isSafeInteger(livre) || livre < necessario + configuracao().reservaDisco) throw insuficiente();
  return livre;
}
async function verificarProcessamento(diretorio, expansao, banco) {
  const cfg = configuracao();
  verificarMemoria();
  if (expansao > cfg.expansaoMaxBytes) throw insuficiente();
  const atual = Number((await banco.query('SELECT pg_database_size(current_database())::text AS n')).rows[0].n);
  // Reserva conservadora para inspeção, índices/WAL e cópia de segurança.
  // É planejamento de capacidade, não garantia contra consumo externo concorrente.
  const necessario = Math.max(expansao * 4, atual * 2);
  await disco(diretorio, atual * 2);
  if (cfg.bancoDisponivelBytes !== null) {
    if (necessario > cfg.bancoDisponivelBytes) throw insuficiente();
  } else {
    // Só medir filesystem do PostgreSQL quando o servidor é comprovadamente local.
    const alvo = (await banco.query('SELECT inet_server_addr()::text AS ip')).rows[0].ip;
    if (!['127.0.0.1', '::1'].includes(String(alvo).split('/')[0])) throw insuficiente();
    try {
      const dados = (await banco.query("SELECT current_setting('data_directory') AS dir")).rows[0].dir;
      await disco(dados, necessario);
    } catch (_) { throw insuficiente(); }
  }
  return { expansao, necessario };
}
module.exports = { configuracao, inteiro, disco, insuficiente, verificarMemoria, verificarProcessamento, MENSAGEM_CAPACIDADE };
