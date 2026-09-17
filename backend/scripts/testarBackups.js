require('dotenv').config({ quiet: true });

const assert = require('assert');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const aplicacao = require('../src/app');
const banco = require('../src/config/banco');

const EMAIL_ADMIN = 'backup.admin@invalid.local';
const EMAIL_OPERADOR = 'backup.operador@invalid.local';
const SENHA = 'BackupTeste123!';
let total = 0;

function verificar(condicao, mensagem) {
  total += 1;
  assert.ok(condicao, mensagem);
}

async function limpar() {
  const emails = [EMAIL_ADMIN, EMAIL_OPERADOR];
  await banco.query(
    `DELETE FROM backups_banco
     WHERE usuario_id IN (SELECT id FROM usuarios WHERE email = ANY($1::text[]))`,
    [emails]
  );
  await banco.query('DELETE FROM tentativas_login WHERE email_informado = ANY($1::text[])', [emails]);
  await banco.query('DELETE FROM usuarios WHERE email = ANY($1::text[])', [emails]);
}

async function requisitarJson(baseUrl, caminho, opcoes) {
  const resposta = await fetch(baseUrl + caminho, Object.assign({
    headers: { 'Content-Type': 'application/json' }
  }, opcoes || {}));
  return { status: resposta.status, corpo: await resposta.json() };
}

async function login(baseUrl, email) {
  return requisitarJson(baseUrl, '/api/autenticacao/login', {
    method: 'POST',
    body: JSON.stringify({ email, senha: SENHA })
  });
}

async function executar() {
  let servidor;
  let diretorio;

  try {
    await limpar();
    const hash = await bcrypt.hash(SENHA, 4);
    await banco.query(
      `INSERT INTO usuarios (nome, email, senha_hash, perfil)
       VALUES ('Admin Backup', $1, $3, 'administrador'),
              ('Operador Backup', $2, $3, 'operador')`,
      [EMAIL_ADMIN, EMAIL_OPERADOR, hash]
    );
    servidor = aplicacao.listen(0);
    await new Promise(function (resolver, rejeitar) {
      servidor.once('listening', resolver);
      servidor.once('error', rejeitar);
    });
    const baseUrl = 'http://127.0.0.1:' + servidor.address().port;
    const admin = await login(baseUrl, EMAIL_ADMIN);
    const operador = await login(baseUrl, EMAIL_OPERADOR);
    verificar(admin.status === 200, 'Login do administrador falhou.');
    verificar(operador.status === 200, 'Login do operador falhou.');
    const adminHeaders = { Authorization: 'Bearer ' + admin.corpo.token };
    const operadorHeaders = { Authorization: 'Bearer ' + operador.corpo.token };

    verificar((await fetch(baseUrl + '/api/admin/backups')).status === 401, 'Histórico sem token não retornou 401.');
    verificar((await fetch(baseUrl + '/api/admin/backups', { headers: operadorHeaders })).status === 403, 'Operador acessou histórico de backup.');
    verificar((await fetch(baseUrl + '/api/admin/backups/banco', { method: 'POST', headers: operadorHeaders })).status === 403, 'Operador gerou backup.');

    const geracao = await requisitarJson(baseUrl, '/api/admin/backups/banco', {
      method: 'POST',
      headers: adminHeaders
    });
    verificar(geracao.status === 201, 'Administrador não conseguiu gerar backup.');
    verificar(geracao.corpo.backup.status === 'concluido', 'Geração não retornou backup concluído.');
    verificar(geracao.corpo.backup.disponivelParaDownload === true, 'Arquivo não ficou disponível para download.');
    verificar(Boolean(geracao.corpo.backup.nomeArquivo), 'Nome do arquivo não foi auditado.');
    verificar(Number(geracao.corpo.backup.tamanhoBytes) > 0, 'Tamanho do arquivo não foi auditado.');
    verificar(geracao.corpo.backup.usuario === 'Admin Backup', 'Responsável pelo backup não foi auditado.');
    verificar(Boolean(geracao.corpo.backup.concluidoEm), 'Data de conclusão não foi auditada.');

    const backupId = geracao.corpo.backup.id;
    verificar(
      (await fetch(baseUrl + '/api/admin/backups/' + backupId + '/download')).status === 401,
      'Download sem token não retornou 401.'
    );
    verificar(
      (await fetch(baseUrl + '/api/admin/backups/' + backupId + '/download', { headers: operadorHeaders })).status === 403,
      'Operador baixou backup.'
    );

    const resposta = await fetch(baseUrl + '/api/admin/backups/' + backupId + '/download', {
      headers: adminHeaders
    });
    verificar(resposta.status === 200, 'Administrador não conseguiu baixar backup concluído.');
    verificar(
      /^attachment; filename="acorda-rj-completo-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.acorda"$/.test(
        resposta.headers.get('content-disposition') || ''
      ),
      'Nome do arquivo de backup não segue o padrão oficial.'
    );
    const buffer = Buffer.from(await resposta.arrayBuffer());
    verificar(buffer.subarray(0, 16).toString() === 'ACORDA_BACKUP_1\n', 'Pacote completo ausente.');
    diretorio = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'teste-backup-'));
    const arquivo = path.join(diretorio, 'teste.dump');
    await fs.promises.writeFile(arquivo, buffer);
    const verificacao=await require('../src/modules/backups/pacoteBackup').abrir({path:arquivo});
    verificar(verificacao.assinatura===geracao.corpo.backup.manifesto.assinatura,'Verificação não veio no arquivo');
    const executavelRestore = process.env.PG_RESTORE_CAMINHO || (process.platform === 'win32'
      ? 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_restore.exe' : 'pg_restore');
    const leitura = childProcess.spawnSync(executavelRestore, ['--file=-', arquivo], {
      encoding: 'utf8', windowsHide: true, shell: false, timeout: 30000, maxBuffer: 16 * 1024 * 1024
    });
    verificar(leitura.status === 0, 'pg_restore não conseguiu ler o arquivo completo.');
    const conteudo = leitura.stdout;
    verificar(
      (resposta.headers.get('content-type') || '').includes('application/octet-stream'),
      'Resposta não foi identificada como arquivo binário.'
    );
    verificar(conteudo.includes('PostgreSQL database dump'), 'Arquivo SQL não possui cabeçalho válido do PostgreSQL.');
    verificar(conteudo.includes('COPY public.usuarios'), 'Backup não contém os dados da tabela de usuários.');
    verificar(conteudo.includes(EMAIL_ADMIN), 'Backup não preservou os registros existentes no momento da geração.');
    verificar(!/CREATE\s+DATABASE/i.test(conteudo), 'Backup incluiu criação de banco.');
    verificar(/CREATE\s+TABLE/i.test(conteudo), 'Backup não incluiu criação de tabela.');
    verificar(/CREATE\s+(SCHEMA|INDEX|TRIGGER|FUNCTION)/i.test(conteudo), 'Backup não incluiu estrutura do banco.');
    verificar(geracao.corpo.backup.formato === 'custom', 'Formato incorreto na auditoria.');
    verificar(Boolean(geracao.corpo.backup.versaoPostgresql), 'Versão PostgreSQL não registrada.');
    verificar(geracao.corpo.backup.migrations.some(item => item.versao === '022'), 'Migration não registrada.');
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase();
    verificar(resposta.headers.get('x-backup-sha256') === sha256, 'SHA-256 do download não confere.');
    verificar(
      (resposta.headers.get('cache-control') || '').includes('no-store'),
      'Download não desabilitou armazenamento em cache.'
    );

    const historico = await requisitarJson(baseUrl, '/api/admin/backups', {
      headers: Object.assign({ 'Content-Type': 'application/json' }, adminHeaders)
    });
    verificar(historico.status === 200, 'Histórico de backups falhou.');
    const backupExecutado = historico.corpo.backups.find(function (backup) {
      return backup.sha256 === verificacao.dados.sha256;
    });
    verificar(Boolean(backupExecutado), 'Histórico não contém a operação executada.');
    verificar(backupExecutado.status === 'concluido', 'Backup não foi marcado como concluído.');
    verificar(backupExecutado.sha256 === verificacao.dados.sha256, 'Histórico não preservou o SHA-256 do conteúdo.');
    verificar(backupExecutado.disponivelParaDownload === false, 'Arquivo temporário continuou disponível após o download.');
    verificar(
      (await fetch(baseUrl + '/api/admin/backups/' + backupId + '/download', { headers: adminHeaders })).status === 410,
      'Download repetido não foi bloqueado após a remoção temporária.'
    );
    verificar(
      (await fetch(baseUrl + '/api/admin/backups/invalido/download', { headers: adminHeaders })).status === 400,
      'Identificador de backup inválido não retornou 400.'
    );

    const caminhoOriginal = process.env.PG_DUMP_CAMINHO;
    process.env.PG_DUMP_CAMINHO = path.join(diretorio, 'pg_dump_inexistente');
    const falha = await fetch(baseUrl + '/api/admin/backups/banco', {
      method: 'POST',
      headers: adminHeaders
    });
    if (caminhoOriginal === undefined) {
      delete process.env.PG_DUMP_CAMINHO;
    } else {
      process.env.PG_DUMP_CAMINHO = caminhoOriginal;
    }
    verificar(falha.status === 503, 'Ausência do pg_dump não retornou 503.');
    const historicoComFalha = await requisitarJson(baseUrl, '/api/admin/backups', {
      headers: Object.assign({ 'Content-Type': 'application/json' }, adminHeaders)
    });
    verificar(historicoComFalha.corpo.backups[0].status === 'falhou', 'Falha do backup não foi auditada.');
    verificar(Boolean(historicoComFalha.corpo.backups[0].mensagemErro), 'Auditoria da falha não guardou diagnóstico.');

    console.log('Backups administrativos: ' + total + ' verificações aprovadas.');
  } finally {
    if (servidor) {
      await new Promise(function (resolver) { servidor.close(resolver); });
    }
    if (diretorio) {
      await fs.promises.rm(diretorio, { recursive: true, force: true });
    }
    await limpar();
    await banco.end();
  }
}

executar().catch(function (erro) {
  console.error(erro.stack || erro.message);
  process.exitCode = 1;
});
