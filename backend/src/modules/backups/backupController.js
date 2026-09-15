const backupService = require('./backupService');

async function listar(requisicao, resposta, proximo) {
  try {
    return resposta.status(200).json({
      mensagem: 'Histórico de backups listado com sucesso.',
      backups: await backupService.listar()
    });
  } catch (erro) {
    return proximo(erro);
  }
}

async function gerar(requisicao, resposta, proximo) {
  try {
    const backup = await backupService.gerar(requisicao.usuario);
    return resposta.status(201).json({
      mensagem: 'Backup gerado com sucesso. O arquivo está disponível temporariamente para download.',
      backup
    });
  } catch (erro) {
    return proximo(erro);
  }
}

async function baixar(requisicao, resposta, proximo) {
  let backup;
  try {
    backup = await backupService.prepararDownload(requisicao.params.id);
    resposta.setHeader('X-Backup-SHA256', backup.sha256);
    resposta.setHeader('Content-Type', 'application/sql; charset=utf-8');
    resposta.setHeader('Cache-Control', 'private, no-store');

    return resposta.download(
      backup.caminhoArquivo,
      backup.nomeArquivo,
      async function (erro) {
        try {
          await backupService.removerTemporario(backup.diretorio);
        } catch (erroLimpeza) {
          console.error('Não foi possível remover o backup temporário:', erroLimpeza.message);
        }
        if (erro && !resposta.headersSent) {
          return proximo(erro);
        }
        return undefined;
      }
    );
  } catch (erro) {
    return proximo(erro);
  }
}

module.exports = { baixar, gerar, listar };
