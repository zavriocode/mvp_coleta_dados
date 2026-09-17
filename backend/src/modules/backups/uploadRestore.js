const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const multer = require('multer');
const capacidade = require('./capacidadeRestore');
const criarErro = require('../../utils/AppError');

async function removerArquivo(arquivo) {
  if (!arquivo) return;
  // Descriptor criado por este storage, nunca caminho recebido do cliente.
  await fs.promises.unlink(arquivo.path).catch(e => { if (e.code !== 'ENOENT') throw e; });
  if (arquivo.diretorioExclusivo) await fs.promises.rmdir(arquivo.destination).catch(e => {
    if (!['ENOENT', 'ENOTEMPTY'].includes(e.code)) throw e;
  });
}
function criarStorage() {
  return {
    async _handleFile(req, file, callback) {
      let descritor;
      try {
        const cfg = capacidade.configuracao();
        capacidade.verificarMemoria();
        await capacidade.disco(os.tmpdir());
        const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'acorda-upload-'));
        await fs.promises.chmod(dir, 0o700);
        descritor = { destination: dir, filename: crypto.randomUUID() + '.dump', diretorioExclusivo: true };
        descritor.path = path.join(dir, descritor.filename);
        req.artefatoRestore = descritor;
        let size = 0, proximaVerificacao = 0;
        const contador = new Transform({ highWaterMark: 65536, transform(chunk, encoding, cb) {
          size += chunk.length;
          if (size > cfg.maxBytes) return cb(capacidade.insuficiente());
          const verificar = size >= proximaVerificacao;
          if (verificar) proximaVerificacao = size + 4 * 1024 * 1024;
          (verificar ? capacidade.disco(dir, 4 * 1024 * 1024) : Promise.resolve())
            .then(() => cb(null, chunk), cb);
        } });
        const escrita = fs.createWriteStream(descritor.path, { flags: 'wx', mode: 0o600, highWaterMark: 65536 });
        const interromper = () => file.stream.destroy(req.restoreUploadErro || criarErro('O envio foi interrompido. Selecione o backup e tente novamente.', 400));
        req.once('aborted', interromper);
        req.once('restore-timeout', interromper);
        if (req.aborted || req.restoreUploadErro) interromper();
        try { await pipeline(file.stream, contador, escrita); }
        finally { req.off('aborted', interromper); req.off('restore-timeout', interromper); }
        if (file.stream.truncated) throw capacidade.insuficiente();
        callback(null, { ...descritor, size });
      } catch (e) {
        await removerArquivo(descritor).catch(() => {});
        callback(['ENOSPC','EDQUOT','EFBIG'].includes(e.code) ? capacidade.insuficiente() : e);
      }
    },
    _removeFile(req, file, cb) { removerArquivo(file).then(() => cb(null), cb); }
  };
}
let recebendo = false;
function receberUpload(req, res, next) {
  let cfg;
  try { cfg = capacidade.configuracao(); } catch(e) { return next(e); }
  if (recebendo) return next(criarErro('Outro backup está sendo enviado. Aguarde e tente novamente.', 409));
  const comprimento = Number(req.headers['content-length']);
  if (Number.isFinite(comprimento) && comprimento > cfg.maxBytes + 262144) return next(capacidade.insuficiente());
  recebendo = true;
  const upload = multer({ storage: criarStorage(), limits: {
    // Busboy sinaliza truncamento ao atingir (não só ultrapassar) fileSize.
    // O contador rejeita > maxBytes; um arquivo exatamente no limite é íntegro.
    fileSize: cfg.maxBytes + 1, files: 1, fields: 3, fieldSize: 131072, parts: 5
  } }).single('backup');
  const timer = setTimeout(() => {
    req.restoreUploadErro = criarErro('O envio demorou mais que o permitido. Verifique sua conexão e tente novamente.', 408);
    req.emit('restore-timeout');
    // Também encerra clientes que ainda não enviaram a parte do arquivo.
    if (!res.headersSent) res.status(408).json({ mensagem: req.restoreUploadErro.message });
    req.destroy();
  }, cfg.uploadTimeoutMs);
  let encerrado = false;
  const finalizar = async e => {
    if (encerrado) return;
    encerrado = true; clearTimeout(timer); recebendo = false;
    req.off('aborted', abortado);
    if (e) {
      await removerArquivo(req.file || req.artefatoRestore).catch(() => {});
      if (e.code === 'LIMIT_FILE_SIZE') e = capacidade.insuficiente();
      else if (e instanceof multer.MulterError) e = criarErro('Não foi possível receber o backup. Selecione um arquivo .acorda válido e tente novamente.', 400);
    }
    if (!res.headersSent && !req.aborted) next(e);
  };
  const abortado = () => finalizar(req.restoreUploadErro || criarErro('Envio interrompido.', 400));
  req.once('aborted', abortado);
  upload(req, res, finalizar);
}
module.exports = { receberUpload, criarStorage, removerArquivo };
