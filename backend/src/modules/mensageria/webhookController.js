const crypto = require('crypto');
const mensageriaService = require('./mensageriaService');

function verificar(req, res) {
  const modo = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const desafio = req.query['hub.challenge'];
  if (modo === 'subscribe' && token && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).type('text/plain').send(String(desafio || ''));
  }
  return res.status(403).json({ mensagem: 'Verificacao recusada.' });
}

function assinaturaValida(corpo, assinatura) {
  const segredo = process.env.META_APP_SECRET;
  if (!segredo || !Buffer.isBuffer(corpo) || typeof assinatura !== 'string' || !assinatura.startsWith('sha256=')) return false;
  const esperada = 'sha256=' + crypto.createHmac('sha256', segredo).update(corpo).digest('hex');
  const recebida = Buffer.from(assinatura, 'utf8');
  const calculada = Buffer.from(esperada, 'utf8');
  return recebida.length === calculada.length && crypto.timingSafeEqual(recebida, calculada);
}

async function receber(req, res, next) {
  try {
    if (!assinaturaValida(req.body, req.get('X-Hub-Signature-256'))) {
      return res.status(403).json({ mensagem: 'Assinatura invalida.' });
    }
    let payload;
    try { payload = JSON.parse(req.body.toString('utf8')); }
    catch (erro) { return res.status(400).json({ mensagem: 'Payload invalido.' }); }
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.entry)) {
      return res.status(400).json({ mensagem: 'Estrutura do webhook invalida.' });
    }
    await require('../backups/controleRecuperacao').receberWebhook(payload, mensageriaService.processarWebhook);
    return res.status(200).json({ recebido: true });
  } catch (erro) { return next(erro); }
}

module.exports = { receber, verificar };
