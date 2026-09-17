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
    await require('./pacoteBackup').enviar(resposta,backup.caminhoArquivo,backup.manifesto,backup.nomeArquivo);
  } catch (erro) {
    if (!resposta.headersSent) return proximo(erro);
  } finally {
    if(backup)await backupService.removerTemporario(backup.diretorio).catch(()=>console.error('Não foi possível remover o backup temporário.'));
  }
}

module.exports = { baixar, gerar, listar };
