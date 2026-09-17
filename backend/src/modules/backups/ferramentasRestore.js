const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const pg = require('pg');
const banco = require('../../config/banco');
const backup = require('./backupService');
const manifesto = require('./manifestoBackup');
const erro = require('../../utils/AppError');
const capacidade = require('./capacidadeRestore');

function configuracao(database) {
  const options = { ...banco.options, password: banco.options.password,
    statement_timeout: 120000, query_timeout: 130000 };
  if (options.connectionString) {
    const u = new URL(options.connectionString); u.pathname = '/' + database; options.connectionString = u.toString();
  } else options.database = database;
  return options;
}
function exe() {
  if (process.env.PG_RESTORE_CAMINHO) return process.env.PG_RESTORE_CAMINHO;
  return process.platform === 'win32' ? 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_restore.exe' : 'pg_restore';
}
async function executar(args, database, observarChunk) {
  const prazo = capacidade.configuracao().processamentoTimeoutMs;
  const c = backup.lerConfiguracaoBanco();
  const env = { ...process.env, PGPASSWORD: c.senha, PGHOST: c.host,
    PGPORT: String(c.porta), PGUSER: c.usuario, PGCONNECT_TIMEOUT: '10',
    PGAPPNAME: 'acorda-restore', PGOPTIONS: '-c lock_timeout=10000 -c statement_timeout=' + prazo };
  if (c.ssl) env.PGSSLMODE = c.ssl;
  if (database) env.PGDATABASE = database;
  return new Promise((resolve, reject) => {
    const child = cp.spawn(exe(), args, { env, shell: false, windowsHide: true });
    let output = '', timed = false, falhaObservacao;
    const timer = setTimeout(() => { timed = true; child.kill(); }, prazo);
    child.stderr.resume(); // Não expor SQL/dados/credenciais em erro.
    child.stdout.on('data', chunk => {
      if (falhaObservacao) return;
      try {
        if (observarChunk) observarChunk(chunk);
        else if (output.length + chunk.length <= 2000000) output += chunk;
        else throw capacidade.insuficiente();
      } catch(e) { falhaObservacao=e; child.kill(); }
    });
    child.once('error', () => { clearTimeout(timer); reject(erro('pg_restore indisponível.', 503)); });
    child.once('close', code => {
      clearTimeout(timer);
      if (falhaObservacao) reject(falhaObservacao);
      else if (code !== 0 || timed) reject(erro('pg_restore falhou ou excedeu o limite. Consulte a auditoria de recuperação.', 409));
      else resolve(output);
    });
  });
}
async function autenticarArquivo(arquivo, m) {
  const d = manifesto.verificar(m);
  const stat = await fs.promises.stat(arquivo);
  if (!stat.isFile() || stat.size !== d.tamanhoBytes || await backup.calcularSha256(arquivo) !== d.sha256) {
    throw erro('Arquivo truncado/adulterado ou tamanho divergente.', 400);
  }
  const fd = await fs.promises.open(arquivo, 'r'); const magic = Buffer.alloc(5);
  try { await fd.read(magic, 0, 5, 0); } finally { await fd.close(); }
  if (magic.toString() !== 'PGDMP') throw erro('Arquivo não é PostgreSQL custom.', 400);
  const versao = (await banco.query("SELECT current_setting('server_version') AS v")).rows[0].v;
  if (String(d.versaoPostgresql).split('.')[0] !== versao.split('.')[0]) throw erro('Versão PostgreSQL incompatível.', 409);
  const migrations = (await banco.query('SELECT versao,nome_arquivo,checksum_sha256 FROM public.schema_migrations ORDER BY versao')).rows;
  if (manifesto.canonico(migrations) !== manifesto.canonico(d.migrations)) throw erro('Migrations incompatíveis.', 409);
  const dir = path.join(__dirname, '../../../database/migrations');
  for (const item of migrations) {
    if (!/^\d{3}_[a-z0-9_]+\.sql$/.test(item.nome_arquivo)) throw erro('Ledger inválido.', 409);
    const hash = crypto.createHash('sha256').update(await fs.promises.readFile(path.join(dir, item.nome_arquivo))).digest('hex');
    if (hash !== item.checksum_sha256) throw erro('Checksum de migration incompatível com a aplicação.', 409);
  }
  const toc = await executar(['--list', arquivo]);
  if (/\brecuperacao\b/.test(toc)) throw erro('Dump contém o schema de controle; restauração recusada.', 400);
  return d;
}
const quote = s => '"' + String(s).replace(/"/g, '""') + '"';
async function verificarCapacidade(arquivo) {
  const cfg=capacidade.configuracao();
  let expansao=0, linha=0;
  const limiteLinha=capacidade.inteiro('RESTORE_REGISTRO_MAX_BYTES',8388608);
  // Mede expansão sem materializar SQL em RAM/disco e sem executar seu conteúdo.
  await executar(['--file=-',arquivo],undefined,chunk=>{
    expansao+=chunk.length;
    if(expansao>cfg.expansaoMaxBytes)throw capacidade.insuficiente();
    let inicio=0,lf;
    while((lf=chunk.indexOf(10,inicio))!==-1){
      linha+=lf-inicio;
      if(linha>limiteLinha)throw capacidade.insuficiente();
      linha=0;inicio=lf+1;
    }
    linha+=chunk.length-inicio;
    if(linha>limiteLinha)throw capacidade.insuficiente();
  });
  return capacidade.verificarProcessamento(path.dirname(arquivo),expansao,banco);
}
async function hashTabela(c,tabela) {
  const proprio=c instanceof pg.Pool;
  const cliente=proprio?await c.connect():c;
  const cursor='hash_restore_'+crypto.randomBytes(8).toString('hex');
  try {
    await cliente.query('BEGIN READ ONLY');
    await cliente.query("SET LOCAL work_mem='4MB'");
    await cliente.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT md5(to_jsonb(t)::text) h FROM public.${quote(tabela)} t ORDER BY h`);
    const digest=crypto.createHash('md5');let quantidade=0;
    for(;;){
      const lote=await cliente.query(`FETCH FORWARD 1000 FROM ${cursor}`);
      for(const linha of lote.rows)digest.update(linha.h);
      quantidade+=lote.rowCount;
      if(!lote.rowCount)break;
    }
    await cliente.query('COMMIT');
    return {quantidade,hash:digest.digest('hex')};
  } catch(e){await cliente.query('ROLLBACK').catch(()=>{});throw e;}
  finally{if(proprio)cliente.release();}
}
async function retrato(c) {
  const tabelas = (await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r => r.tablename);
  const migrations = (await c.query('SELECT versao,nome_arquivo,checksum_sha256 FROM public.schema_migrations ORDER BY versao')).rows;
  const colunas = (await c.query(`SELECT table_name,column_name,data_type,is_nullable,is_identity,column_default,
    udt_schema,udt_name,character_maximum_length,numeric_precision,numeric_scale,datetime_precision,
    collation_schema,collation_name,identity_generation,is_generated,generation_expression
    FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`)).rows;
  const constraints = (await c.query(`SELECT r.relname,c.conname,c.contype,c.convalidated,
    CASE WHEN c.conkey IS NULL THEN NULL ELSE ARRAY(
      SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(numero,ordem)
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.numero ORDER BY k.ordem
    ) END AS colunas,
    CASE WHEN c.confkey IS NULL THEN NULL ELSE ARRAY(
      SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(numero,ordem)
      JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.numero ORDER BY k.ordem
    ) END AS colunas_referenciadas,
    c.confupdtype,c.confdeltype,c.confmatchtype,c.condeferrable,c.condeferred,
    CASE WHEN c.confrelid=0 THEN NULL ELSE
      (SELECT quote_ident(ns.nspname)||'.'||quote_ident(t.relname) FROM pg_class t
       JOIN pg_namespace ns ON ns.oid=t.relnamespace WHERE t.oid=c.confrelid)
    END AS referencia
    FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' ORDER BY r.relname,c.conname`)).rows;
  const indices = (await c.query(`SELECT r.relname,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid) AS definicao FROM pg_index i JOIN pg_class r ON r.oid=i.indexrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' ORDER BY r.relname,definicao`)).rows;
  const funcoes = (await c.query(`SELECT p.proname,pg_get_functiondef(p.oid) AS def FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'
    ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)`)).rows;
  const triggers = (await c.query(`SELECT r.relname,t.tgname,pg_get_triggerdef(t.oid) AS def FROM pg_trigger t
    JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY r.relname,t.tgname`)).rows;
  if (constraints.some(x => !x.convalidated) || indices.some(x => !x.indisvalid || !x.indisready)) throw erro('Constraints ou índices inválidos.', 409);
  const dados = {};
  for (const t of tabelas) dados[t] = await hashTabela(c,t);
  const sequencias = {};
  for (const { sequencename } of (await c.query("SELECT sequencename FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")).rows) {
    sequencias[sequencename] = (await c.query(`SELECT last_value::text,is_called FROM public.${quote(sequencename)}`)).rows[0];
  }
  for (const col of colunas.filter(x => x.is_identity === 'YES')) {
    const seq = (await c.query('SELECT pg_get_serial_sequence($1,$2) AS s', ['public.' + quote(col.table_name), col.column_name])).rows[0].s;
    const val = (await c.query(`SELECT last_value::text,is_called FROM ${seq}`)).rows[0];
    const max = (await c.query(`SELECT max(${quote(col.column_name)})::text AS m FROM public.${quote(col.table_name)}`)).rows[0].m;
    if (max !== null && (BigInt(val.last_value) < BigInt(max) || (!val.is_called && BigInt(val.last_value) <= BigInt(max)))) throw erro('Sequence incompatível com os registros.', 409);
  }
  const objetos = (await c.query('SELECT oid::text FROM pg_largeobject_metadata ORDER BY oid')).rows;
  for(const objeto of objetos){
    const digest=crypto.createHash('md5');let offset=0;
    for(;;){
      const bytes=(await c.query('SELECT lo_get($1::oid,$2::bigint,1048576) AS dados',[objeto.oid,offset])).rows[0].dados;
      digest.update(bytes);offset+=bytes.length;
      if(bytes.length<1048576)break;
    }
    objeto.hash=digest.digest('hex');
  }
  const admins = (await c.query(`SELECT count(*)::int AS n FROM public.usuarios WHERE ativo AND perfil='administrador'
    AND senha_hash ~ '^\\$2[aby]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}$' AND (bloqueado_ate IS NULL OR bloqueado_ate<=now())`)).rows[0].n;
  if (!admins) throw erro('Backup não possui administrador ativo com credencial utilizável.', 409);
  return { estrutura: { tabelas, migrations, colunas, constraints, indices, funcoes, triggers }, dados, sequencias, objetos, admins };
}
async function restaurar(arquivo, database, limpar = false) {
  const args = ['--single-transaction', '--exit-on-error', '--no-owner', '--no-acl', '--no-password',
    '--exclude-schema=recuperacao', '--dbname=' + database];
  if (limpar) args.push('--clean', '--if-exists');
  return executar([...args, arquivo], database);
}
async function inspecionar(arquivo, m, credenciais) {
  await autenticarArquivo(arquivo, m);
  await verificarCapacidade(arquivo);
  const nome = 'acorda_inspecao_' + crypto.randomBytes(12).toString('hex');
  let criado = false, c;
  try {
    await banco.query('CREATE DATABASE ' + quote(nome) + ' TEMPLATE template0'); criado = true;
    await restaurar(arquivo, nome);
    c = new pg.Client(configuracao(nome)); await c.connect();
    const r = await retrato(c);
    const schemas = (await c.query("SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('information_schema','public')")).rows;
    if (schemas.length) throw erro('Schemas não operacionais no backup.', 409);
    const atual = await retrato(banco);
    if (manifesto.canonico(r.estrutura) !== manifesto.canonico(atual.estrutura)) throw erro('Estrutura incompatível com o ambiente atual.', 409);
    const u = (await c.query("SELECT senha_hash FROM usuarios WHERE lower(email)=lower($1) AND ativo AND perfil='administrador' AND (bloqueado_ate IS NULL OR bloqueado_ate<=now())", [credenciais.email])).rows[0];
    if (!u || !await require('bcrypt').compare(credenciais.senha || '', u.senha_hash)) throw erro('Confirme credenciais de um administrador ativo contido no backup.', 409);
    // Exercita os mesmos Models consultados pela aplicação sem iniciar jobs ou Meta.
    await c.query('SELECT id FROM public.campanhas LIMIT 1');
    await c.query('SELECT id,telefone_normalizado FROM public.contatos LIMIT 1');
    // Instalar somente o controle no alvo temporário para inicializar a aplicação
    // atual. Nunca aplicar migrations de negócio no candidato para fazê-lo passar.
    const controleSql=await fs.promises.readFile(path.join(__dirname,'../../../database/migrations/023_controle_recuperacao.sql'),'utf8');
    await c.query(controleSql.split('ALTER TABLE public.backups_banco')[0]);
    const env={...process.env,BANCO_NOME:nome};
    if(env.DATABASE_URL){const url=new URL(env.DATABASE_URL);url.pathname='/'+nome;env.DATABASE_URL=url.toString();}
    await new Promise((resolve,reject)=>{
      const child=cp.spawn(process.execPath,[path.join(__dirname,'probeRestauracao.js')],{env,shell:false,windowsHide:true,stdio:['pipe','ignore','ignore']});
      const timer=setTimeout(()=>child.kill(),30000);
      child.once('error',()=>{clearTimeout(timer);reject(erro('Não foi possível verificar a aplicação isolada.',409));});
      child.once('close',code=>{clearTimeout(timer);code===0?resolve():reject(erro('Aplicação não passou na inspeção isolada de login/prontidão/consultas.',409));});
      child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(credenciais));
    });
    return r;
  } finally {
    if (c) await c.end();
    // Nome gerado internamente e banco criado exclusivamente por esta execução.
    if (criado) await banco.query('DROP DATABASE ' + quote(nome));
  }
}
module.exports = { autenticarArquivo, inspecionar, restaurar, retrato, configuracao, executar, verificarCapacidade };
