const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const backupModel = require('./backupModel');
const banco = require('../../config/banco');
const criarAppError = require('../../utils/AppError');
const manifestoBackup = require('./manifestoBackup');

const arquivosTemporarios = new Map();

function lerConfiguracaoBanco() {
  if (process.env.DATABASE_URL) {
    const endereco = new URL(process.env.DATABASE_URL);
    return {
      host: endereco.hostname,
      porta: endereco.port || '5432',
      usuario: decodeURIComponent(endereco.username),
      senha: decodeURIComponent(endereco.password),
      banco: endereco.pathname.replace(/^\//, ''),
      ssl: endereco.searchParams.get('sslmode') || ''
    };
  }

  return {
    host: process.env.BANCO_HOST,
    porta: process.env.BANCO_PORTA || '5432',
    usuario: process.env.BANCO_USUARIO,
    senha: process.env.BANCO_SENHA,
    banco: process.env.BANCO_NOME,
    ssl: process.env.BANCO_SSL === 'true' ? 'require' : 'disable'
  };
}

function localizarPgDump() {
  if (process.env.PG_DUMP_CAMINHO) {
    return process.env.PG_DUMP_CAMINHO;
  }

  const caminhoWindows = 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe';
  if (process.platform === 'win32' && fs.existsSync(caminhoWindows)) {
    return caminhoWindows;
  }

  return 'pg_dump';
}

function criarNomeArquivo() {
  const data = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
  return 'acorda-rj-completo-' + data + '.acorda';
}

function lerInteiro(nome, valorPadrao, minimo, maximo) {
  const valor = Number(process.env[nome] || valorPadrao);

  if (!Number.isInteger(valor) || valor < minimo || valor > maximo) {
    throw new Error(nome + ' possui valor inválido.');
  }

  return valor;
}

function executarPgDump(executavel, argumentos, ambiente, limiteMs) {
  return new Promise(function (resolver, rejeitar) {
    const processo = childProcess.spawn(executavel, argumentos, {
      env: ambiente,
      windowsHide: true,
      shell: false
    });
    let encerradoPorTempo = false;
    const temporizador = setTimeout(function () {
      encerradoPorTempo = true;
      processo.kill();
    }, limiteMs);

    // Não registrar stderr: pode conter identificadores ou dados sensíveis do banco.
    processo.stderr.resume();
    processo.stdout.resume();
    processo.once('error', function (erro) {
      clearTimeout(temporizador);
      if (erro.code === 'ENOENT') {
        rejeitar(criarAppError(
          'O servidor não possui o pg_dump necessário para gerar o backup.',
          503
        ));
        return;
      }
      rejeitar(new Error('Não foi possível iniciar a ferramenta de backup.'));
    });
    processo.once('close', function (codigo) {
      clearTimeout(temporizador);
      if (encerradoPorTempo) {
        rejeitar(new Error('A geração do backup excedeu o tempo limite.'));
        return;
      }
      if (codigo !== 0) {
        rejeitar(new Error('A ferramenta de backup falhou. Verifique conexão, permissões, espaço e compatibilidade da versão PostgreSQL.'));
        return;
      }
      resolver();
    });
  });
}

function calcularSha256(caminhoArquivo) {
  return new Promise(function (resolver, rejeitar) {
    const hash = crypto.createHash('sha256');
    const leitura = fs.createReadStream(caminhoArquivo);
    leitura.on('error', rejeitar);
    leitura.on('data', function (dados) { hash.update(dados); });
    leitura.on('end', function () { resolver(hash.digest('hex').toUpperCase()); });
  });
}

async function removerTemporario(diretorio) {
  if (diretorio) {
    await fs.promises.rm(diretorio, { recursive: true, force: true });
  }
}

function normalizarRegistro(registro) {
  const temporario = arquivosTemporarios.get(String(registro.id));
  const disponivel = Boolean(temporario && temporario.expiraEm.getTime() > Date.now());
  return {
    id: registro.id,
    status: registro.status,
    nomeArquivo: registro.nome_arquivo,
    formato: registro.formato,
    versaoPostgresql: registro.versao_postgresql,
    migrations: registro.migrations,
    manifesto: registro.manifesto,
    tamanhoBytes: registro.tamanho_bytes,
    sha256: registro.sha256,
    mensagemErro: registro.mensagem_erro,
    usuario: registro.usuario_nome,
    criadoEm: registro.criado_em,
    concluidoEm: registro.concluido_em,
    disponivelParaDownload: disponivel,
    expiraEm: disponivel ? temporario.expiraEm : null
  };
}

async function removerArquivoDisponivel(id, temporarioEsperado) {
  const chave = String(id);
  const temporario = arquivosTemporarios.get(chave);
  if (!temporario || (temporarioEsperado && temporario !== temporarioEsperado)) {
    return;
  }

  arquivosTemporarios.delete(chave);
  clearTimeout(temporario.temporizador);
  await removerTemporario(temporario.diretorio);
}

function disponibilizarTemporariamente(id, dados) {
  const retencaoMs = lerInteiro('BACKUP_RETENCAO_TEMPORARIA_MS', 900000, 60000, 3600000);
  const expiraEm = new Date(Date.now() + retencaoMs);
  const temporario = Object.assign({}, dados, { expiraEm });

  temporario.temporizador = setTimeout(function () {
    removerArquivoDisponivel(id, temporario).catch(function (erro) {
      console.error('Não foi possível remover um backup temporário expirado:', resumirErro(erro));
    });
  }, retencaoMs);
  temporario.temporizador.unref();
  arquivosTemporarios.set(String(id), temporario);
}

function resumirErro(erro) {
  const mensagem = erro && erro.message ? erro.message : 'Falha desconhecida.';
  return mensagem.replace(/postgresql:\/\/[^\s]+/gi, '[endereco protegido]').slice(0, 1000);
}

async function gerar(usuario) {
  manifestoBackup.chave();
  const limiteFila = lerInteiro('BACKUP_MAX_FILA_BANCO', 2, 0, 100);

  if (banco.waitingCount > limiteFila) {
    throw criarAppError(
      'O banco está atendendo muitas solicitações. Tente gerar o backup em um horário de menor movimento.',
      503
    );
  }

  const clienteBloqueio = await banco.connect();
  let bloqueio;

  try {
    bloqueio = await clienteBloqueio.query(
      'SELECT pg_try_advisory_lock(82174999) AS adquirido'
    );
  } catch (erro) {
    clienteBloqueio.release();
    throw erro;
  }

  if (bloqueio.rows[0].adquirido !== true) {
    clienteBloqueio.release();
    throw criarAppError('Já existe um backup sendo gerado. Aguarde a conclusão.', 409);
  }

  let registroId;
  let diretorio;
  let snapshotAberto = false;

  try {
    registroId = await backupModel.iniciar(usuario.id, 'custom');
    const limiteTamanhoBanco = lerInteiro(
      'BACKUP_BANCO_TAMANHO_MAXIMO_BYTES',
      2147483648,
      10485760,
      17179869184
    );
    const tamanhoBanco = await clienteBloqueio.query(
      'SELECT pg_database_size(current_database()) AS tamanho_bytes'
    );

    if (Number(tamanhoBanco.rows[0].tamanho_bytes) > limiteTamanhoBanco) {
      throw criarAppError(
        'O banco excede o limite seguro para backup temporário pelo painel. Use o backup gerenciado do provedor.',
        503
      );
    }

    const configuracao = lerConfiguracaoBanco();
    const limiteMs = Number(process.env.BACKUP_TEMPO_LIMITE_MS || 600000);
    if (!Number.isInteger(limiteMs) || limiteMs < 10000 || limiteMs > 3600000) {
      throw new Error('BACKUP_TEMPO_LIMITE_MS possui valor inválido.');
    }

    // Validar retenção antes de criar/publicar qualquer arquivo.
    lerInteiro('BACKUP_RETENCAO_TEMPORARIA_MS', 900000, 60000, 3600000);
    diretorio = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'acorda-rj-'));
    await fs.promises.chmod(diretorio, 0o700);
    const nomeArquivo = criarNomeArquivo();
    const caminhoArquivo = path.join(diretorio, nomeArquivo);
    const argumentos = [
      '--format=custom',
      '--exclude-schema=recuperacao',
      '--blobs',
      '--no-owner',
      '--no-acl',
      '--no-password',
      '--encoding=UTF8',
      '--host=' + configuracao.host,
      '--port=' + configuracao.porta,
      '--username=' + configuracao.usuario,
      '--file=' + caminhoArquivo,
      configuracao.banco
    ];
    const ambiente = Object.assign({}, process.env, {
      PGPASSWORD: configuracao.senha,
      PGCONNECT_TIMEOUT: String(lerInteiro(
        'BACKUP_CONEXAO_TEMPO_LIMITE_SEGUNDOS',
        10,
        1,
        120
      ))
    });

    if (configuracao.ssl) {
      ambiente.PGSSLMODE = configuracao.ssl;
    }

    await clienteBloqueio.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    snapshotAberto = true;
    await clienteBloqueio.query("SELECT set_config('idle_in_transaction_session_timeout', $1, true)", [String(limiteMs + 30000)]);
    const snapshot = await clienteBloqueio.query(
      "SELECT pg_export_snapshot() AS id, current_setting('server_version') AS versao, transaction_timestamp() AS criado_em"
    );
    const migrations = await clienteBloqueio.query(
      'SELECT versao, nome_arquivo, checksum_sha256 FROM public.schema_migrations ORDER BY versao'
    );
    argumentos.unshift('--snapshot=' + snapshot.rows[0].id);
    await executarPgDump(localizarPgDump(), argumentos, ambiente, limiteMs);
    await clienteBloqueio.query('COMMIT');
    snapshotAberto = false;
    const estatisticas = await fs.promises.stat(caminhoArquivo);
    const arquivo = await fs.promises.open(caminhoArquivo, 'r');
    const cabecalho = Buffer.alloc(5);
    try { await arquivo.read(cabecalho, 0, 5, 0); } finally { await arquivo.close(); }
    if (estatisticas.size < 32 || cabecalho.toString('ascii') !== 'PGDMP') {
      throw new Error('A ferramenta não gerou um arquivo custom PostgreSQL válido.');
    }
    await fs.promises.chmod(caminhoArquivo, 0o600);
    const sha256 = await calcularSha256(caminhoArquivo);
    const manifesto = manifestoBackup.assinar({ formato: 'acorda-custom-v1',
      schemaControleExcluido: 'recuperacao', backupId: String(registroId),
      criadoEm: snapshot.rows[0].criado_em.toISOString(), tamanhoBytes: estatisticas.size, sha256,
      versaoPostgresql: snapshot.rows[0].versao, migrations: migrations.rows });
    await backupModel.concluir(registroId, {
      manifesto,
      nomeArquivo,
      tamanhoBytes: estatisticas.size,
      sha256,
      versaoPostgresql: snapshot.rows[0].versao,
      migrations: migrations.rows
    });
    const registroConcluido = await backupModel.buscarPorId(registroId);
    disponibilizarTemporariamente(registroId, {
      caminhoArquivo,
      diretorio,
      nomeArquivo,
      sha256,
      manifesto
    });
    diretorio = null;

    return normalizarRegistro(registroConcluido);
  } catch (erro) {
    if (registroId) {
      try {
        await backupModel.falhar(registroId, resumirErro(erro));
      } catch (erroAuditoria) {
        console.error('Não foi possível auditar a falha do backup:', erroAuditoria.message);
      }
    }
    await removerTemporario(diretorio);
    throw erro;
  } finally {
    let descartarConexao = false;
    try {
      if (snapshotAberto) await clienteBloqueio.query('ROLLBACK');
      await clienteBloqueio.query('SELECT pg_advisory_unlock(82174999)');
    } catch (_) {
      descartarConexao = true;
    } finally {
      clienteBloqueio.release(descartarConexao);
    }
  }
}

async function listar() {
  const registros = await backupModel.listar();
  return registros.map(normalizarRegistro);
}

async function prepararDownload(id) {
  if (!/^\d+$/.test(String(id)) || Number(id) < 1) {
    throw criarAppError('Backup inválido.', 400);
  }

  const registro = await backupModel.buscarPorId(id);
  if (!registro) {
    throw criarAppError('Backup não encontrado.', 404);
  }
  if (registro.status !== 'concluido') {
    throw criarAppError('Este backup ainda não está disponível para download.', 409);
  }

  const temporario = arquivosTemporarios.get(String(id));
  if (!temporario || temporario.expiraEm.getTime() <= Date.now()) {
    if (temporario) {
      await removerArquivoDisponivel(id, temporario);
    }
    throw criarAppError(
      'O arquivo temporário não está mais disponível. Gere um novo backup.',
      410
    );
  }

  arquivosTemporarios.delete(String(id));
  clearTimeout(temporario.temporizador);
  return temporario;
}

module.exports = { gerar, listar, prepararDownload, removerTemporario,
  calcularSha256, lerConfiguracaoBanco, localizarPgDump, executarPgDump };
