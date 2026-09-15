const banco = require('../../config/banco');

async function iniciar(usuarioId, formato) {
  const resultado = await banco.query(
    `INSERT INTO backups_banco (usuario_id, formato)
     VALUES ($1, $2)
     RETURNING id`,
    [usuarioId, formato]
  );
  return resultado.rows[0].id;
}

async function concluir(id, dados) {
  await banco.query(
    `UPDATE backups_banco
     SET status = 'concluido',
         nome_arquivo = $2,
         tamanho_bytes = $3,
         sha256 = $4,
         mensagem_erro = NULL,
         concluido_em = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [id, dados.nomeArquivo, dados.tamanhoBytes, dados.sha256]
  );
}

async function falhar(id, mensagem) {
  await banco.query(
    `UPDATE backups_banco
     SET status = 'falhou',
         mensagem_erro = $2,
         concluido_em = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [id, mensagem]
  );
}

async function listar() {
  const resultado = await banco.query(
    `SELECT
      backup.id,
      backup.status,
      backup.nome_arquivo,
      backup.formato,
      backup.tamanho_bytes,
      backup.sha256,
      backup.mensagem_erro,
      backup.criado_em,
      backup.concluido_em,
      usuario.nome AS usuario_nome
     FROM backups_banco AS backup
     LEFT JOIN usuarios AS usuario ON usuario.id = backup.usuario_id
     ORDER BY backup.criado_em DESC, backup.id DESC
     LIMIT 50`
  );
  return resultado.rows;
}

async function buscarPorId(id) {
  const resultado = await banco.query(
    `SELECT
      backup.id,
      backup.status,
      backup.nome_arquivo,
      backup.formato,
      backup.tamanho_bytes,
      backup.sha256,
      backup.mensagem_erro,
      backup.criado_em,
      backup.concluido_em,
      usuario.nome AS usuario_nome
     FROM backups_banco AS backup
     LEFT JOIN usuarios AS usuario ON usuario.id = backup.usuario_id
     WHERE backup.id = $1`,
    [id]
  );
  return resultado.rows[0] || null;
}

module.exports = { buscarPorId, concluir, falhar, iniciar, listar };
