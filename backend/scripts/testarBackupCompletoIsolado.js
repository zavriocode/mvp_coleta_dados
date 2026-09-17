// Este runner nunca usa DATABASE_URL de entrada. Só bancos locais com nome aleatório.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const pg = require('pg');
const bcrypt = require('bcrypt');
const raiz = path.join(__dirname, '..');
const senha = 'TesteIsoladoBackup123!';
let verificacoes = 0;
function verificar(valor, mensagem) { assert.ok(valor, mensagem); verificacoes++; }
function acesso(database) {
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(process.env.BANCO_HOST), 'Exige BANCO_HOST local.');
  assert.match(database, /^(postgres|acorda_backup_qa_[a-f0-9]+_[ab])$/);
  return { host: process.env.BANCO_HOST, port: Number(process.env.BANCO_PORTA || 5432),
    user: process.env.BANCO_USUARIO, password: process.env.BANCO_SENHA, database,
    ssl: false, connectionTimeoutMillis: 5000 };
}
function ambientePg(database) {
  const c = acesso(database);
  return { ...process.env, PGHOST: c.host, PGPORT: String(c.port), PGUSER: c.user,
    PGPASSWORD: c.password, PGDATABASE: database, PGSSLMODE: 'disable', PGCONNECT_TIMEOUT: '5' };
}
async function processo(exe, args, env) {
  return new Promise((resolve, reject) => {
    const filho = cp.spawn(exe, args, { env, cwd: raiz, shell: false, windowsHide: true });
    let out = '', err = '';
    const timer = setTimeout(() => filho.kill(), 180000);
    filho.stdout.on('data', data => { out += data; });
    filho.stderr.on('data', data => { err += data; });
    filho.once('error', erro => { clearTimeout(timer); reject(erro); });
    filho.once('close', code => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}
async function executarScript(script, env) {
  const r = await processo(process.execPath, [script], env);
  assert.equal(r.code, 0, 'Falhou ' + path.basename(script) + ': ' + r.out + r.err);
  console.log(r.out.trim());
}
async function popular(c) {
  const hash = await bcrypt.hash(senha, 4);
  const u = (await c.query(`INSERT INTO usuarios(nome,email,senha_hash,perfil)
    VALUES ('QA Backup','backup@invalid.local',$1,'administrador') RETURNING id`, [hash])).rows[0].id;
  const m = (await c.query(`INSERT INTO modelos_mensagem(nome,categoria,texto,criado_por_usuario_id)
    VALUES ('Modelo QA','teste','Conteúdo sintético',$1) RETURNING id`, [u])).rows[0].id;
  const campanha = (await c.query(`INSERT INTO campanhas(nome,finalidade,modelo_id,responsavel_usuario_id,
    criado_por_usuario_id,atualizado_por_usuario_id) VALUES ('Campanha QA','teste',$2,$1,$1,$1) RETURNING id`, [u, m])).rows[0].id;
  const lote = (await c.query(`INSERT INTO campanha_lotes(campanha_id,tamanho_solicitado,tamanho_efetivo,
    ordem,chave_idempotencia,criado_por_usuario_id) VALUES ($1,5,5,1,'qa-backup',$2) RETURNING id`, [campanha, u])).rows[0].id;
  const estados = ['enviada', 'entregue', 'lida', 'falhou', 'enviando'];
  for (const [i, status] of estados.entries()) {
    const telefone = '2190000000' + i;
    const contato = (await c.query(`INSERT INTO contatos(nome,telefone,telefone_normalizado,
      consentimento_armazenamento,idade,bloqueado_para_mensagens,bloqueado_para_ligacoes)
      VALUES ('Contato QA',$1,$1,true,13,$2,$2) RETURNING id`, [telefone, i === 2])).rows[0].id;
    await c.query(`INSERT INTO consentimentos(contato_id,contato_id_original,tipo,resposta,texto_apresentado,
      versao_texto,canal,origem_registro,estado) VALUES ($1,$1,'mensagens',false,'Texto QA','qa','whatsapp','revogacao','revogado')`, [contato]);
    await c.query(`INSERT INTO historico_contatos(contato_id,tipo_evento,dados_novos,registrado_por_usuario_id)
      VALUES ($1,'opt_out_whatsapp','{"teste":true}',$2)`, [contato,u]);
    const p = (await c.query(`INSERT INTO campanha_participacoes(campanha_id,contato_id,lote_original_id,status)
      VALUES ($1,$2,$3,$4) RETURNING id`, [campanha,contato,lote,status])).rows[0].id;
    const t = (await c.query(`INSERT INTO campanha_tentativas(participacao_id,numero_tentativa,status,
      identificador_externo,status_externo_em,resultado_indeterminado_em,resultado_indeterminado_codigo)
      VALUES ($1,1,$2::text,$3,'2026-01-01T12:00:00Z',CASE WHEN $2::text='enviando' THEN now() END,
      CASE WHEN $2::text='enviando' THEN 'qa_indeterminado' END) RETURNING id`, [p,status,i === 4 ? null : 'wamid.qa.' + i])).rows[0].id;
    await c.query(`INSERT INTO historico_status_mensageria(participacao_id,tentativa_id,status_novo,origem)
      VALUES ($1,$2,$3,'webhook')`, [p,t,status]);
    await c.query(`INSERT INTO eventos_webhook_mensageria(identificador_externo,tipo_evento,identificador_mensagem,
      estado_processamento,dados_evento) VALUES ($1,'status',$2,$3,'{"fixture":true}')`,
    ['evento.qa.' + i,'wamid.qa.' + i,i === 4 ? 'pendente' : 'processado']);
    await c.query(`INSERT INTO solicitacoes_exclusao(contato_id,contato_id_original,solicitada_por_usuario_id)
      VALUES ($1,$1,$2)`, [contato,u]);
  }
  await c.query(`INSERT INTO historico_configuracoes_sistema(chave,valor_anterior,valor_novo,motivo,usuario_id)
    VALUES ('limite_diario_mensagens',100,200,'Auditoria QA',$1)`, [u]);
  await c.query("SELECT lo_from_bytea(0, decode('000102ff', 'hex'))");
  return u;
}
async function retrato(c) {
  const tabelas = (await c.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)).rows;
  const dados = {};
  for (const { tablename } of tabelas) {
    assert.match(tablename, /^[a-z_]+$/);
    dados[tablename] = (await c.query(`SELECT to_jsonb(t) AS linha FROM public."${tablename}" t ORDER BY to_jsonb(t)::text`)).rows.map(x => x.linha);
  }
  const sequencias = {};
  for (const { sequencename } of (await c.query(`SELECT sequencename FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename`)).rows) {
    assert.match(sequencename, /^[a-z_]+$/);
    sequencias[sequencename] = (await c.query(`SELECT last_value::text,is_called FROM public."${sequencename}"`)).rows;
  }
  return { dados, sequencias,
    constraints: (await c.query(`SELECT conrelid::regclass::text AS tabela, conname,contype,convalidated,
      pg_get_constraintdef(oid) AS definicao FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1,2`)).rows,
    indices: (await c.query(`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1,2`)).rows,
    funcoes: (await c.query(`SELECT proname,pg_get_functiondef(oid) AS definicao FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY 1`)).rows,
    triggers: (await c.query(`SELECT tgname,pg_get_triggerdef(oid) AS definicao FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1,2`)).rows,
    objetos: (await c.query(`SELECT oid,encode(lo_get(oid),'hex') AS conteudo FROM pg_largeobject_metadata ORDER BY oid`)).rows };
}
async function worker() {
  acesso(process.env.BANCO_NOME);
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(url.hostname, process.env.BANCO_HOST);
  assert.equal(url.pathname, '/' + process.env.BANCO_NOME);
  // Bloqueia chamadas HTTP externas inclusive se algum fluxo mudar futuramente.
  const fetchOriginal = global.fetch;
  global.fetch = (url, opts) => {
    assert.equal(new URL(url).hostname, '127.0.0.1', 'Rede externa proibida no QA.');
    return fetchOriginal(url, opts);
  };
  const banco = require('../src/config/banco');
  const service = require('../src/modules/backups/backupService');
  const app = require('../src/app');
  let server;
  try {
    if (process.argv[3] === 'restaurado') {
      server = app.listen(0, '127.0.0.1');
      await new Promise(resolve => server.once('listening', resolve));
      const base = 'http://127.0.0.1:' + server.address().port;
      verificar((await fetch(base + '/api/saude/pronto')).status === 200, 'Prontidão restaurada');
      const login = await fetch(base + '/api/autenticacao/login', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({email:'backup@invalid.local',senha}) });
      verificar(login.status === 200, 'Login restaurado');
      const token = (await login.json()).token;
      for (const endpoint of ['/api/admin/campanhas', '/api/admin/backups', '/api/admin/contatos']) {
        verificar((await fetch(base + endpoint,{headers:{Authorization:'Bearer '+token}})).status === 200, endpoint);
      }
      verificar(Number((await banco.query('SELECT count(*) AS n FROM historico_status_mensageria')).rows[0].n) === 5, 'Históricos acessíveis');
      const antes = (await banco.query('SELECT max(id)::text AS id FROM usuarios')).rows[0].id;
      const novo = await banco.query(`INSERT INTO usuarios(nome,email,senha_hash) VALUES ('Novo QA','novo@invalid.local','hash-qa') RETURNING id`);
      verificar(BigInt(novo.rows[0].id) > BigInt(antes), 'Identity pós-restore');
      console.log('Aplicação sobre B: ' + verificacoes + ' verificações aprovadas.');
      return;
    }
    const usuario = { id: process.env.QA_USUARIO_ID };
    const registro = await service.gerar(usuario);
    verificar(registro.formato === 'custom' && registro.migrations.length === 23, 'Metadados');
    // Arquivo pelo mesmo fluxo de geração/download do painel, sem pg_dump paralelo.
    const arquivo = await service.prepararDownload(registro.id);
    await fs.promises.copyFile(arquivo.caminhoArquivo, process.env.QA_ARQUIVO);
    await service.removerTemporario(arquivo.diretorio);
    // Arquivo contém este registro em processando: o fechamento sucede o snapshot.
    await fs.promises.writeFile(process.env.QA_RESULTADO, JSON.stringify({ registro, retrato: await retrato(banco) }));
    const temporarios = async () => (await fs.promises.readdir(os.tmpdir())).filter(x => x.startsWith('acorda-rj-')).sort();
    const baseline = await temporarios();
    const spawnOriginal = cp.spawn;
    const rmOriginal = fs.promises.rm;
    const timers = [];
    const timeoutOriginal = global.setTimeout;
    try {
      // Contenção em conexão diferente da conexão utilizada pelo módulo.
      const lock = await banco.connect();
      await lock.query('SELECT pg_advisory_lock(82174999)');
      try { await assert.rejects(service.gerar(usuario), e => e.statusHttp === 409); verificacoes++; }
      finally { await lock.query('SELECT pg_advisory_unlock(82174999)'); lock.release(); }
      for (const modo of ['interrompido','parcial','escrita','incompativel','timeout']) {
        cp.spawn = (_exe, args, options) => {
          const destino = args.find(x => x.startsWith('--file=')).slice(7);
          const programa = modo === 'timeout' ? 'setInterval(()=>{},1000)' :
            modo === 'escrita' ? "require('fs').writeFileSync(process.argv[1]+'/inexistente/arquivo','x')" :
            modo === 'parcial' ? "require('fs').writeFileSync(process.argv[1],'PGDMP')" :
            "require('fs').writeFileSync(process.argv[1],'PGDMP-parcial');process.stderr.write('segredo-qa');process.exit(1)";
          return spawnOriginal(process.execPath, ['-e', programa, destino], options);
        };
        if (modo === 'timeout') global.setTimeout = (fn,ms,...args) => timeoutOriginal(fn, ms === 600000 ? 30 : ms,...args);
        await assert.rejects(service.gerar(usuario)); verificacoes++;
        global.setTimeout = timeoutOriginal;
        const ultimo = (await service.listar())[0];
        verificar(ultimo.status === 'falhou' && !ultimo.disponivelParaDownload && !ultimo.mensagemErro.includes('segredo-qa'), 'Falha auditada: ' + modo);
        assert.deepEqual(await temporarios(), baseline); verificacoes++;
      }
      cp.spawn = spawnOriginal;
      // Dispara o callback real da expiração antecipadamente, sem mudar a regra de produção.
      global.setTimeout = (fn,ms,...args) => {
        if (ms === 900000) timers.push(fn);
        return timeoutOriginal(fn,ms,...args);
      };
      const expira = await service.gerar(usuario);
      global.setTimeout = timeoutOriginal;
      verificar(timers.length === 1, 'Timer de expiração criado');
      let limpeza;
      fs.promises.rm = (...args) => { limpeza = rmOriginal(...args); return limpeza; };
      timers[0]();
      if (limpeza) await limpeza;
      await assert.rejects(service.prepararDownload(expira.id), e => e.statusHttp === 410); verificacoes++;
      assert.deepEqual(await temporarios(), baseline); verificacoes++;
    } finally {
      cp.spawn = spawnOriginal; fs.promises.rm = rmOriginal; global.setTimeout = timeoutOriginal;
    }
    console.log('Geração, snapshot, concorrência e falhas: ' + verificacoes + ' verificações aprovadas.');
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await banco.end();
  }
}
async function principal() {
  require('dotenv').config({ quiet: true, path: path.join(raiz,'.env') });
  acesso('postgres');
  const identificador = crypto.randomBytes(8).toString('hex');
  const a = 'acorda_backup_qa_' + identificador + '_a';
  const b = 'acorda_backup_qa_' + identificador + '_b';
  const criados = [];
  const admin = new pg.Client(acesso('postgres'));
  let conexaoA, conexaoB, dir;
  try {
    await admin.connect();
    const alvo = (await admin.query('SELECT inet_server_addr()::text AS ip')).rows[0].ip;
    assert.ok(['127.0.0.1','::1'].includes(String(alvo).split('/')[0]), 'Servidor PostgreSQL deve ser loopback.');
    for (const nome of [a,b]) { await admin.query('CREATE DATABASE "' + nome + '" TEMPLATE template0'); criados.push(nome); }
    conexaoA = new pg.Client(acesso(a)); await conexaoA.connect();
    await conexaoA.query(fs.readFileSync(path.join(raiz,'database/criar_banco.sql'),'utf8'));
    // Reconstruir apenas em A descartável o estado anterior para testar upgrade normal.
    await conexaoA.query('ALTER TABLE backups_banco DROP COLUMN versao_postgresql, DROP COLUMN migrations');
    await conexaoA.query("DELETE FROM schema_migrations WHERE versao='022'");
    await conexaoA.query('DROP SCHEMA recuperacao CASCADE');
    await conexaoA.query('ALTER TABLE backups_banco DROP COLUMN manifesto');
    await conexaoA.query("DELETE FROM schema_migrations WHERE versao='023'");
    dir = await fs.promises.mkdtemp(path.join(os.tmpdir(),'backup-completo-qa-'));
    const env = { ...process.env, DATABASE_URL: '', NODE_ENV:'test', BANCO_NOME:a, BANCO_SSL:'false',
      JWT_SECRET:crypto.randomBytes(32).toString('hex'), JWT_TEMPO_EXPIRACAO:'1h', FRONTEND_URL:'http://127.0.0.1',
      BACKUP_ASSINATURA_CHAVE:crypto.randomBytes(32).toString('hex'),
      QA_ARQUIVO:path.join(dir,'backup.dump'), QA_RESULTADO:path.join(dir,'resultado.json') };
    for (const chave of Object.keys(env)) if (/^(META_|WHATSAPP_|MANYCHAT_)/.test(chave)) env[chave] = 'qa-inativo';
    const url = nome => { const c=acesso(nome); return 'postgresql://'+encodeURIComponent(c.user)+':'+encodeURIComponent(c.password)+'@'+(c.host==='::1'?'[::1]':c.host)+':'+c.port+'/'+nome; };
    env.DATABASE_URL = url(a);
    const bin = 'C:\\Program Files\\PostgreSQL\\18\\bin';
    env.PG_DUMP_CAMINHO = process.platform === 'win32' ? path.join(bin,'pg_dump.exe') : 'pg_dump';
    env.PG_RESTORE_CAMINHO = process.platform === 'win32' ? path.join(bin,'pg_restore.exe') : 'pg_restore';
    for (const exe of [env.PG_DUMP_CAMINHO,env.PG_RESTORE_CAMINHO]) {
      const r = await processo(exe,['--version'],env); assert.equal(r.code,0); console.log(r.out.trim());
    }
    await executarScript(path.join(__dirname,'executarMigrations.js'),env);
    await executarScript(path.join(__dirname,'testarSchemaVazio.js'),env);
    env.QA_USUARIO_ID = await popular(conexaoA);
    await executarScript(path.join(__dirname,'testarBackups.js'),env);
    let r = await processo(process.execPath,[__filename,'worker'],env);
    assert.equal(r.code,0,r.out+r.err); console.log(r.out.trim());
    conexaoB = new pg.Client(acesso(b)); await conexaoB.connect();
    verificar((await conexaoB.query("SELECT count(*) AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n === '0', 'Banco B vazio');
    const args = ['--single-transaction','--exit-on-error','--no-owner','--no-acl','--no-password','--dbname='+b,env.QA_ARQUIVO];
    r = await processo(env.PG_RESTORE_CAMINHO,args,ambientePg(b));
    assert.equal(r.code,0,'Restauração falhou: '+r.err);
    const esperado = JSON.parse(fs.readFileSync(env.QA_RESULTADO,'utf8'));
    const obtido = await retrato(conexaoB);
    const registroA = esperado.retrato.dados.backups_banco.find(x => String(x.id) === String(esperado.registro.id));
    const registroB = obtido.dados.backups_banco.find(x => String(x.id) === String(esperado.registro.id));
    verificar(registroA.status === 'concluido' && registroB.status === 'processando', 'Diferença temporal auditada');
    // Somente a finalização do próprio backup não existia no snapshot. Nada é ignorado nas outras linhas.
    for (const k of ['status','nome_arquivo','tamanho_bytes','sha256','concluido_em','versao_postgresql','migrations','manifesto']) registroA[k] = registroB[k];
    // PostgreSQL reinterpreta CHECKs (casts de arrays/parênteses) ao restaurar.
    // Comparar a mesma definição após uma passagem pelo parser do próprio servidor,
    // em transação desfeita; não remover operadores/casts com regex permissiva.
    await conexaoA.query('BEGIN');
    try {
      for (const con of esperado.retrato.constraints.filter(x => x.contype === 'c')) {
        assert.match(con.tabela, /^[a-z_]+$/); assert.match(con.conname, /^[a-z_][a-z_0-9]*$/);
        await conexaoA.query(`ALTER TABLE public."${con.tabela}" DROP CONSTRAINT "${con.conname}"`);
        await conexaoA.query(`ALTER TABLE public."${con.tabela}" ADD CONSTRAINT "${con.conname}" ${con.definicao}`);
        con.definicao = (await conexaoA.query(`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint
          WHERE conrelid=$1::regclass AND conname=$2`, [con.tabela,con.conname])).rows[0].d;
      }
    } finally { await conexaoA.query('ROLLBACK'); }
    assert.deepEqual(obtido,esperado.retrato); verificacoes++;
    verificar(obtido.constraints.every(x => x.convalidated), 'Constraints validadas');
    const invalidos = (await conexaoB.query('SELECT count(*) AS n FROM pg_index WHERE NOT indisvalid')).rows[0].n;
    verificar(invalidos === '0', 'Índices válidos');
    const identidades = (await conexaoB.query(`SELECT table_name,column_name,
      pg_get_serial_sequence('public.' || quote_ident(table_name), column_name) AS seq
      FROM information_schema.columns WHERE table_schema='public' AND is_identity='YES'`)).rows;
    for (const col of identidades) {
      assert.match(col.table_name,/^[a-z_]+$/); assert.match(col.column_name,/^[a-z_]+$/);
      const max = (await conexaoB.query(`SELECT COALESCE(max("${col.column_name}"),0)::text AS n FROM public."${col.table_name}"`)).rows[0].n;
      const next = (await conexaoB.query('SELECT nextval($1::regclass)::text AS n',[col.seq])).rows[0].n;
      verificar(BigInt(next)>BigInt(max),'Sequence válida: '+col.seq);
    }
    console.log('Contagens comparadas: '+JSON.stringify(Object.fromEntries(Object.entries(obtido.dados).map(([k,v])=>[k,v.length]))));
    console.log('Estruturas: '+JSON.stringify({tabelas:Object.keys(obtido.dados).length,registros:Object.values(obtido.dados).reduce((n,v)=>n+v.length,0),
      sequencias:Object.keys(obtido.sequencias).length,constraints:obtido.constraints.length,indices:obtido.indices.length,funcoes:obtido.funcoes.length,triggers:obtido.triggers.length,largeObjects:obtido.objetos.length}));
    const sql = await processo(env.PG_RESTORE_CAMINHO,['--file=-',env.QA_ARQUIVO],env);
    assert.equal(sql.code,0);
    for (const chave of ['JWT_SECRET','DATABASE_URL','META_APP_SECRET','WHATSAPP_TOKEN']) {
      if (env[chave]) verificar(!sql.out.includes(env[chave]),'Secret externo ausente: '+chave);
    }
    await assert.rejects(processo(path.join(dir,'pg_restore_ausente'),[],env),e=>e.code==='ENOENT'); verificacoes++;
    const bytes = fs.readFileSync(env.QA_ARQUIVO);
    for (const [nome,buffer] of [['invalido',Buffer.from('not a dump')],['parcial',bytes.subarray(0,Math.floor(bytes.length/2))],
      ['incompativel',Buffer.from(bytes)]]) {
      if (nome === 'incompativel') buffer[5] = 127;
      const arquivo = path.join(dir,nome); fs.writeFileSync(arquivo,buffer);
      const falha = await processo(env.PG_RESTORE_CAMINHO,['--file=-',arquivo],env);
      verificar(falha.code !== 0,'Rejeição do arquivo '+nome);
      const antesFalha = await retrato(conexaoB);
      const falhaBanco = await processo(env.PG_RESTORE_CAMINHO,
        ['--clean','--if-exists','--single-transaction','--exit-on-error','--no-owner','--no-acl',
          '--no-password','--dbname='+b,arquivo],ambientePg(b));
      verificar(falhaBanco.code !== 0,'Restore inválido não pode declarar sucesso: '+nome);
      assert.deepEqual(await retrato(conexaoB),antesFalha); verificacoes++;
    }
    // Instala somente o controle externo ao snapshot no banco B novo, não operacional.
    const controleSql=fs.readFileSync(path.join(raiz,'database/migrations/023_controle_recuperacao.sql'),'utf8').split('ALTER TABLE public.backups_banco')[0];
    await conexaoB.query(controleSql);
    r = await processo(process.execPath,[__filename,'worker','restaurado'],{...env,BANCO_NOME:b,DATABASE_URL:url(b)});
    assert.equal(r.code,0,r.out+r.err); console.log(r.out.trim());
    console.log('Backup completo isolado: '+verificacoes+' verificações de restauração aprovadas.');
  } finally {
    if(conexaoA) await conexaoA.end(); if(conexaoB) await conexaoB.end();
    for(const nome of criados.reverse()) {
      await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1',[nome]);
      await admin.query('DROP DATABASE "'+nome+'"');
    }
    await admin.end();
    if(dir) await fs.promises.rm(dir,{recursive:true,force:true});
  }
}
(process.argv[2] === 'worker' ? worker() : principal()).catch(erro => {
  console.error(erro.stack || erro.message); process.exitCode=1;
});
