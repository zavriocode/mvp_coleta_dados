const crypto = require('crypto');
const criarErro = require('../../utils/AppError');

function chave() {
  const segredo = process.env.BACKUP_ASSINATURA_CHAVE || '';
  if (!/^[a-f0-9]{64}$/i.test(segredo) ||
      [process.env.JWT_SECRET, process.env.JWT_SEGREDO, process.env.META_APP_SECRET,
        process.env.WHATSAPP_ACCESS_TOKEN].includes(segredo)) {
    throw criarErro('Configure uma chave exclusiva BACKUP_ASSINATURA_CHAVE de 32 bytes hexadecimais.', 503);
  }
  return Buffer.from(segredo, 'hex');
}
function canonico(valor) {
  if (Array.isArray(valor)) return '[' + valor.map(canonico).join(',') + ']';
  if (valor && typeof valor === 'object') return '{' + Object.keys(valor).sort()
    .map(k => JSON.stringify(k) + ':' + canonico(valor[k])).join(',') + '}';
  return JSON.stringify(valor);
}
function assinar(dados) {
  return { dados, assinatura: crypto.createHmac('sha256', chave()).update(canonico(dados)).digest('hex') };
}
function verificar(manifesto) {
  if (!manifesto || !manifesto.dados || !/^[a-f0-9]{64}$/.test(manifesto.assinatura || '')) {
    throw criarErro('Manifesto autenticado obrigatório; backups legados não são aceitos no restore administrativo.', 400);
  }
  const esperado = assinar(manifesto.dados).assinatura;
  if (!crypto.timingSafeEqual(Buffer.from(esperado, 'hex'), Buffer.from(manifesto.assinatura, 'hex'))) {
    throw criarErro('Assinatura do backup inválida.', 400);
  }
  const d = manifesto.dados;
  if (d.formato !== 'acorda-custom-v1' || d.schemaControleExcluido !== 'recuperacao' ||
      !/^[A-F0-9]{64}$/.test(d.sha256 || '') || !Number.isSafeInteger(d.tamanhoBytes) || d.tamanhoBytes < 32 ||
      !Array.isArray(d.migrations) || !d.backupId || !Number.isFinite(Date.parse(d.criadoEm))) {
    throw criarErro('Formato de manifesto incompatível.', 400);
  }
  return d;
}
module.exports = { assinar, verificar, canonico, chave };
