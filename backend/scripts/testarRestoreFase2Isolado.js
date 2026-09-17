const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const cp=require('node:child_process');
const pg=require('pg');
const raiz=path.join(__dirname,'..');
function filho(args,env){return new Promise((resolve,reject)=>{
  const p=cp.spawn(process.execPath,['--require',path.join(__dirname,'bloquearRedeExternaQa.js'),...args],{cwd:raiz,env,windowsHide:true,shell:false});
  let s='';p.stdout.on('data',d=>{s+=d;});p.stderr.on('data',d=>{s+=d;});
  p.on('error',reject);p.on('close',code=>code===0?resolve(s):reject(new Error(s)));
});}
async function principal(){
  require('dotenv').config({path:path.join(raiz,'.env'),quiet:true});
  assert.ok(['localhost','127.0.0.1','::1'].includes(process.env.BANCO_HOST),'Somente PostgreSQL loopback.');
  const nome='acorda_rj_campanhas_qa_'+crypto.randomBytes(10).toString('hex');
  const c=new pg.Client({host:process.env.BANCO_HOST,port:Number(process.env.BANCO_PORTA||5432),user:process.env.BANCO_USUARIO,password:process.env.BANCO_SENHA,database:'postgres',ssl:false});
  let criado=false,db;
  try{
    await c.connect();assert.ok(['127.0.0.1','::1'].includes((await c.query('SELECT inet_server_addr()::text AS ip')).rows[0].ip.split('/')[0]));
    await c.query('CREATE DATABASE "'+nome+'" TEMPLATE template0');criado=true;
    db=new pg.Client({host:process.env.BANCO_HOST,port:Number(process.env.BANCO_PORTA||5432),user:process.env.BANCO_USUARIO,password:process.env.BANCO_SENHA,database:nome,ssl:false});await db.connect();
    await db.query(fs.readFileSync(path.join(raiz,'database/criar_banco.sql'),'utf8'));
    const env={...process.env,DATABASE_URL:'',BANCO_NOME:nome,BANCO_SSL:'false',NODE_ENV:'test',
      JWT_SECRET:crypto.randomBytes(32).toString('hex'),JWT_TEMPO_EXPIRACAO:'1h',BACKUP_ASSINATURA_CHAVE:crypto.randomBytes(32).toString('hex'),
      FRONTEND_URL:'http://127.0.0.1',RESTORE_DRENAGEM_MS:'10'};
    for(const k of Object.keys(env))if(/^(META_|WHATSAPP_|MANYCHAT_)/.test(k))env[k]='qa-inativo';
    env.META_APP_SECRET='qa-hmac';
    env.WHATSAPP_BUSINESS_ACCOUNT_ID='987654321';
    env.WHATSAPP_ACCESS_TOKEN='qa-inativo';
    env.WHATSAPP_PHONE_NUMBER_ID='123456789';
    env.META_GRAPH_API_VERSION='v99.0';
    env.PG_DUMP_CAMINHO='C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe';
    env.PG_RESTORE_CAMINHO='C:\\Program Files\\PostgreSQL\\18\\bin\\pg_restore.exe';
    console.log(await filho([path.join(__dirname,'executarMigrations.js')],env));
    console.log(await filho([__filename,'worker'],env));
    // Regressão existente, mesmo banco descartável e provider fake próprio.
    for(const script of ['testarResilienciaMensageria.js','testarBackups.js','testarWebhookMensageria.js','testarEnvioCampanhaSimplificado.js']){
      // Fixture nova somente no banco aleatório criado acima, já confirmado loopback.
      assert.equal((await db.query('SELECT current_database() n')).rows[0].n,nome);
      await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA recuperacao CASCADE');
      await db.query(fs.readFileSync(path.join(raiz,'database/criar_banco.sql'),'utf8'));
      const h=await require('bcrypt').hash('RestoreQA123!',4);
      await db.query("INSERT INTO usuarios(nome,email,senha_hash,perfil) VALUES ('QA restore','restore@invalid.local',$1,'administrador')",[h]);
      await db.query("INSERT INTO usuarios(nome,email,senha_hash,perfil) VALUES ('QA campanhas','qa.campanhas@invalid.local',$1,'administrador')",[await require('bcrypt').hash('SenhaQACampanhas123!',4)]);
      const u=new URL('postgresql://localhost');u.hostname=env.BANCO_HOST;u.port=env.BANCO_PORTA||'5432';u.username=env.BANCO_USUARIO;u.password=env.BANCO_SENHA;u.pathname='/'+nome;
      console.log(await filho([path.join(__dirname,script)],{...env,DATABASE_URL:u.toString()}));
    }
  }finally{
    if(db)await db.end();
    if(criado){await c.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1',[nome]);await c.query('DROP DATABASE "'+nome+'"');}
    await c.end();
  }
}
async function worker(){
  assert.match(process.env.BANCO_NOME,/^acorda_rj_campanhas_qa_[a-f0-9]{20}$/);
  assert.equal(process.env.DATABASE_URL,'');
  const banco=require('../src/config/banco'),backup=require('../src/modules/backups/backupService');
  const controle=require('../src/modules/backups/controleRecuperacao'),s=require('../src/modules/backups/restauracaoService');
  const f=require('../src/modules/backups/ferramentasRestore'),m=require('../src/modules/backups/manifestoBackup');
  const bcrypt=require('bcrypt');let n=0,server,dir;
  const ok=(v,msg)=>{assert.ok(v,msg);n++;};
  const rejeita=async fn=>{await assert.rejects(fn);n++;};
  const senha='RestoreQA123!';
  const realFetch=global.fetch;
  global.fetch=(url,...args)=>{assert.match(String(url),/^http:\/\/127\.0\.0\.1:/,'Nenhuma chamada externa.');return realFetch(url,...args);};
  try{
    const hash=await bcrypt.hash(senha,4);
    const usuario=(await banco.query("INSERT INTO usuarios(nome,email,senha_hash,perfil) VALUES ('QA restore','restore@invalid.local',$1,'administrador') RETURNING id,nome,email,perfil",[hash])).rows[0];
    const operador=(await banco.query("INSERT INTO usuarios(nome,email,senha_hash,perfil) VALUES ('QA operador','operador@invalid.local',$1,'operador') RETURNING id",[hash])).rows[0];
    const contato=(await banco.query("INSERT INTO contatos(nome,telefone,telefone_normalizado,consentimento_armazenamento) VALUES ('QA optout','21900000000','21900000000',true) RETURNING id")).rows[0];
    const modelo=(await banco.query("INSERT INTO modelos_mensagem(nome,categoria,texto,meta_template_id,criado_por_usuario_id) VALUES ('QA template','QA','Mensagem QA','12345',$1) RETURNING id",[usuario.id])).rows[0];
    const campanha=(await banco.query("INSERT INTO campanhas(nome,finalidade,modelo_id,responsavel_usuario_id,criado_por_usuario_id,atualizado_por_usuario_id) VALUES ('QA campanha','Teste',$1,$2,$2,$2) RETURNING id",[modelo.id,usuario.id])).rows[0];
    const lote=(await banco.query("INSERT INTO campanha_lotes(campanha_id,tamanho_solicitado,tamanho_efetivo,ordem,chave_idempotencia,criado_por_usuario_id) VALUES ($1,1,1,1,'restore-qa',$2) RETURNING id",[campanha.id,usuario.id])).rows[0];
    const participacao=(await banco.query("INSERT INTO campanha_participacoes(campanha_id,contato_id,lote_original_id,status) VALUES ($1,$2,$3,'enviada') RETURNING id",[campanha.id,contato.id,lote.id])).rows[0];
    const tentativa=(await banco.query("INSERT INTO campanha_tentativas(participacao_id,numero_tentativa,status,identificador_externo) VALUES ($1,1,'enviada','wamid.qa.status') RETURNING id",[participacao.id])).rows[0];
    server=require('../src/app').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    const base='http://127.0.0.1:'+server.address().port;
    async function login(email='restore@invalid.local'){
      const r=await fetch(base+'/api/autenticacao/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,senha})});assert.equal(r.status,200);return (await r.json()).token;
    }
    let token=await login();const antigo=token;
    async function req(url,body,t=token){return fetch(base+url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
    const opToken=await login('operador@invalid.local');
    // Desconexão durante a admissão: nenhum handler foi iniciado, pode concluir.
    const {EventEmitter}=require('node:events');
    const trava=await banco.connect();
    await trava.query('BEGIN');await trava.query('SELECT * FROM recuperacao.estado FOR UPDATE');
    const resposta=new EventEmitter();let chamadasHandler=0;
    const admissaoPendente=controle.middleware({path:'/api/admin/contatos'},resposta,()=>{chamadasHandler++;});
    resposta.destroyed=true;resposta.emit('close');
    await trava.query('COMMIT');trava.release();await admissaoPendente;
    ok(chamadasHandler===0,'Cliente desconectado antes da admissão não executa handler');
    await controle.exigirDrenagem();n++;
    // Depois de next, close não comprova término de trabalho admitido.
    const emExecucao=new EventEmitter();
    await controle.middleware({path:'/api/admin/contatos'},emExecucao,()=>{chamadasHandler++;});
    emExecucao.emit('close');
    await rejeita(()=>controle.exigirDrenagem());
    emExecucao.emit('finish');
    for(let i=0;i<100;i++){try{await controle.exigirDrenagem();break;}catch(e){if(i===99)throw e;await new Promise(r=>setTimeout(r,10));}}
    ok(chamadasHandler===1,'Trabalho admitido só concluído com finish, nunca por close');
    ok((await req('/api/admin/restauracoes',null,opToken)).status===403,'Não ADMIN bloqueado');
    ok((await req('/api/admin/restauracoes/upload',{},opToken)).status===403,'Não ADMIN não envia arquivo');
    await banco.query("UPDATE usuarios SET ativo=false WHERE perfil='administrador'");
    const semAdmin=await backup.gerar(usuario),dumpSemAdmin=await backup.prepararDownload(semAdmin.id);
    await banco.query("UPDATE usuarios SET ativo=true WHERE perfil='administrador'");
    try{await rejeita(()=>f.inspecionar(dumpSemAdmin.caminhoArquivo,semAdmin.manifesto,{email:usuario.email,senha}));}
    finally{await backup.removerTemporario(dumpSemAdmin.diretorio);}
    await controle.auditar('qa_historico_antigo',usuario.id);
    await banco.query("UPDATE recuperacao.auditoria SET criado_em='1970-01-01' WHERE evento='qa_historico_antigo'");
    // Histórico real de ALTER/DROP deixa attnum com lacunas. O dump recompõe
    // as posições físicas sem mudar nomes, tipos, CHECKs ou vínculos.
    await banco.query(`CREATE TABLE public.qa_restore_pai (
      id integer PRIMARY KEY, removida text, codigo integer UNIQUE CHECK(codigo>0));
      ALTER TABLE public.qa_restore_pai DROP COLUMN removida;
      CREATE TABLE public.qa_restore_filho (
        id integer PRIMARY KEY, removida text, codigo integer REFERENCES public.qa_restore_pai(codigo),
        rotulo varchar(20), valor numeric(10,2));
      ALTER TABLE public.qa_restore_filho DROP COLUMN removida;
      CREATE INDEX qa_restore_z ON public.qa_restore_filho(rotulo);
      CREATE INDEX qa_restore_a ON public.qa_restore_filho(valor);
      CREATE FUNCTION public.qa_restore_func(text) RETURNS text LANGUAGE sql AS 'SELECT $1';
      CREATE FUNCTION public.qa_restore_func(integer) RETURNS integer LANGUAGE sql AS 'SELECT $1';`);
    // Mais de dois FETCHs para provar que o hash incremental mantém o contrato.
    await banco.query(`INSERT INTO contatos(nome,telefone,telefone_normalizado,consentimento_armazenamento)
      SELECT 'QA cursor '||n,'218'||lpad(n::text,8,'0'),'218'||lpad(n::text,8,'0'),true FROM generate_series(1,2100) n`);
    const lo=(await banco.query("SELECT lo_from_bytea(0,decode(repeat('ab',2097169),'hex')) AS id")).rows[0].id;
    const retratoEscala=await f.retrato(banco);
    const esperado=(await banco.query(`SELECT count(*)::int quantidade,
      md5(coalesce(string_agg(h,'' ORDER BY h),'')) hash FROM (SELECT md5(to_jsonb(t)::text) h FROM contatos t) s`)).rows[0];
    assert.deepEqual(retratoEscala.dados.contatos,esperado);n++;
    ok(retratoEscala.objetos.find(x=>x.oid===String(lo)).hash===crypto.createHash('md5').update(Buffer.alloc(2097169,0xab)).digest('hex'),'Large object incremental íntegro');
    const b=await backup.gerar(usuario);ok(!!m.verificar(b.manifesto),'Manifesto legítimo');
    const a=await backup.prepararDownload(b.id);dir=a.diretorio;
    await f.autenticarArquivo(a.caminhoArquivo,b.manifesto);n++;
    for(const [chave,valor] of [['RESTORE_EXPANSAO_MAX_BYTES','1'],['RESTORE_REGISTRO_MAX_BYTES','10'],['RESTORE_BANCO_DISPONIVEL_BYTES','1'],['RESTORE_MEMORIA_LIVRE_MIN_BYTES','9007199254740000']]){
      const anterior=process.env[chave];process.env[chave]=valor;
      try{await assert.rejects(()=>f.verificarCapacidade(a.caminhoArquivo),e=>e.statusHttp===413);n++;}
      finally{if(anterior===undefined)delete process.env[chave];else process.env[chave]=anterior;}
      ok(!(await controle.estado()).manutencao,'Recusa de capacidade antes da manutenção');
    }
    const adulterado=structuredClone(b.manifesto);adulterado.dados.tamanhoBytes++;
    await rejeita(()=>f.autenticarArquivo(a.caminhoArquivo,adulterado));
    await rejeita(()=>f.autenticarArquivo(a.caminhoArquivo,{...b.manifesto,assinatura:'0'.repeat(64)}));
    await rejeita(()=>f.autenticarArquivo(a.caminhoArquivo,m.assinar({...b.manifesto.dados,versaoPostgresql:'17.0'})));
    await rejeita(()=>f.autenticarArquivo(a.caminhoArquivo,m.assinar({...b.manifesto.dados,migrations:[]})));
    const parcial=path.join(dir,'parcial.dump');await fs.promises.writeFile(parcial,Buffer.from('arbitrario'));
    await rejeita(()=>f.autenticarArquivo(parcial,b.manifesto));
    const bytesOriginal=await fs.promises.readFile(a.caminhoArquivo);
    await fs.promises.writeFile(parcial,bytesOriginal.subarray(0,Math.floor(bytesOriginal.length/2)));
    await rejeita(()=>f.autenticarArquivo(parcial,b.manifesto));
    const modificado=Buffer.from(bytesOriginal);modificado[modificado.length-1]^=1;
    await fs.promises.writeFile(parcial,modificado);
    await rejeita(()=>f.autenticarArquivo(parcial,b.manifesto));
    await fs.promises.writeFile(parcial,Buffer.alloc(64,65));
    const hashArbitrario=await backup.calcularSha256(parcial);
    await rejeita(()=>f.autenticarArquivo(parcial,m.assinar({...b.manifesto.dados,tamanhoBytes:64,sha256:hashArbitrario})));
    const arquivo={path:a.caminhoArquivo,destination:dir};
    const alvoEstrutural='acorda_estrutura_qa_'+crypto.randomBytes(10).toString('hex');
    await banco.query('CREATE DATABASE "'+alvoEstrutural+'" TEMPLATE template0');
    const estruturaClient=new pg.Client(f.configuracao(alvoEstrutural));
    try{
      await f.restaurar(a.caminhoArquivo,alvoEstrutural);await estruturaClient.connect();
      const antesEstrutura=(await f.retrato(banco)).estrutura,depoisEstrutura=(await f.retrato(estruturaClient)).estrutura;
      for(const chave of Object.keys(antesEstrutura)){
        assert.deepEqual(depoisEstrutura[chave],antesEstrutura[chave],'Estrutura lógica preservada: '+chave);n++;
      }
      const alteracoes=[
        ['ALTER TABLE qa_restore_filho ALTER COLUMN rotulo TYPE varchar(21)','colunas'],
        ['ALTER TABLE qa_restore_filho ALTER COLUMN valor TYPE numeric(10,3)','colunas'],
        ['ALTER TABLE qa_restore_filho DROP CONSTRAINT qa_restore_filho_codigo_fkey; ALTER TABLE qa_restore_filho ADD CONSTRAINT qa_restore_filho_codigo_fkey FOREIGN KEY(codigo) REFERENCES qa_restore_pai(id)','constraints'],
        ['ALTER TABLE qa_restore_filho DROP CONSTRAINT qa_restore_filho_codigo_fkey; ALTER TABLE qa_restore_filho ADD CONSTRAINT qa_restore_filho_codigo_fkey FOREIGN KEY(codigo) REFERENCES qa_restore_pai(codigo) ON DELETE CASCADE','constraints'],
        ['DROP INDEX qa_restore_z; CREATE INDEX qa_restore_z ON qa_restore_filho(valor)','indices'],
        ["CREATE OR REPLACE FUNCTION public.qa_restore_func(integer) RETURNS integer LANGUAGE sql AS 'SELECT $1+1'",'funcoes']
      ];
      for(const [sql,chave] of alteracoes){
        await estruturaClient.query(sql);
        assert.notDeepEqual((await f.retrato(estruturaClient)).estrutura[chave],antesEstrutura[chave],'Divergência real recusada: '+chave);n++;
        await f.restaurar(a.caminhoArquivo,alvoEstrutural,true);
      }
    }finally{await estruturaClient.end();await banco.query('DROP DATABASE "'+alvoEstrutural+'"');}
    const invalidos=new FormData();invalidos.append('backup',new Blob([bytesOriginal]),'invalido.dump');invalidos.append('manifesto','{');
    const antesUpload=fs.readdirSync(os.tmpdir()).filter(x=>x.startsWith('acorda-upload-'));
    ok((await fetch(base+'/api/admin/restauracoes/upload',{method:'POST',headers:{Authorization:'Bearer '+token},body:invalidos})).status===400,'Verificação inválida recusada via HTTP');
    assert.deepEqual(fs.readdirSync(os.tmpdir()).filter(x=>x.startsWith('acorda-upload-')),antesUpload);n++;
    const pacote=require('../src/modules/backups/pacoteBackup');
    const partes=[];for await(const p of pacote.partes(a.caminhoArquivo,b.manifesto))partes.push(p);
    const form=new FormData();form.append('backup',new Blob(partes),'candidato.acorda');form.append('email',usuario.email);form.append('senha',senha);
    const upload=await fetch(base+'/api/admin/restauracoes/upload',{method:'POST',headers:{Authorization:'Bearer '+token},body:form});
    const o=await upload.json();assert.equal(upload.status,201,o.mensagem);ok(o.fase==='valido','Upload HTTP e inspeção isolada');
    await banco.query("UPDATE contatos SET nome='POSTERIOR' WHERE id=$1",[contato.id]);
    const antiga=crypto.randomUUID();
    await banco.query("INSERT INTO recuperacao.admissoes(id,tipo,iniciado_em) VALUES ($1,'http','1970-01-01')",[antiga]);
    const bloqueioAnterior=await req('/api/admin/restauracoes/'+o.id+'/iniciar',{frase:'RESTAURAR SISTEMA',senha});
    ok(bloqueioAnterior.status===409,'Pendência anterior bloqueia preparação via HTTP');
    ok(!(await controle.estado()).manutencao,'Pendência anterior não ativa manutenção nem invalida sessão');
    ok((await banco.query('SELECT concluido_em FROM recuperacao.admissoes WHERE id=$1',[antiga])).rows[0].concluido_em===null,'Pendência não expira por idade');
    await controle.concluir(antiga); // Comprovante sintético deste teste, nunca uma admissão real.
    const inicioHttp=await req('/api/admin/restauracoes/'+o.id+'/iniciar',{frase:'RESTAURAR SISTEMA',senha});
    ok(inicioHttp.status===200&&(await inicioHttp.json()).fase==='aguardando_custodia','Preparação real pela rota HTTP');
    ok((await controle.estado()).manutencao,'Manutenção persistente');
    ok((await req('/api/admin/restauracoes',null,antigo)).status===401,'Sessão anterior rejeitada');token=await login();
    for(const rota of ['/api/admin/campanhas','/api/admin/importacoes','/api/admin/mensageria/enviar'])ok((await req(rota,{})).status===503,'Bloqueio '+rota);
    let rodou=false;await controle.job('qa',()=>{rodou=true;});ok(!rodou,'Job bloqueado');
    ok((await require('../src/modules/campanhas/sincronizacaoAutomaticaTemplates').executarAgora()).motivo==='manutencao','Job real de templates bloqueado');
    await rejeita(()=>s.iniciar(o.id,{frase:'RESTAURAR SISTEMA',senha},usuario));
    await rejeita(()=>s.executar(o.id,{frase:'RESTAURAR SISTEMA',senha,custodia:true},usuario));
    const webhook={object:'whatsapp_business_account',entry:[{id:'987654321',changes:[
      {field:'messages',value:{statuses:[{id:'wamid.qa.status',status:'read',timestamp:'1789550000'}],messages:[{id:'wamid.qa.optout',from:'5521900000000',interactive:{button_reply:{id:process.env.WHATSAPP_OPTOUT_BUTTON_ID||'nao_quero_mais_receber'}}}]}},
      {field:'message_template_status_update',value:{message_template_id:'12345',event:'APPROVED'}},
      {field:'message_template_status_update',value:{message_template_id:'67890',event:'REJECTED'}}]}]};
    const raw=JSON.stringify(webhook),signature='sha256='+crypto.createHmac('sha256','qa-hmac').update(raw).digest('hex');
    for(let i=0;i<2;i++)ok((await fetch(base+'/api/webhooks/whatsapp',{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature-256':signature},body:raw})).status===200,'Webhook preservado');
    ok((await banco.query('SELECT count(*)::int n FROM recuperacao.webhooks')).rows[0].n===4,'Payload misto individual/idempotente');
    ok((await fetch(base+'/api/webhooks/whatsapp',{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature-256':'sha256=invalida'},body:raw})).status===403,'HMAC inválido recusado');
    const preResponse=await req('/api/admin/restauracoes/'+o.id+'/pre-backup');
    const preBytes=Buffer.from(await preResponse.arrayBuffer());
    ok(preResponse.status===200 && preBytes.subarray(0,pacote.MAGIC.length).equals(pacote.MAGIC),'Download único real pré-restore');
    const preLocal=path.join(dir,'pre.acorda');await fs.promises.writeFile(preLocal,preBytes);
    const preManifesto=await pacote.abrir({path:preLocal});
    await f.autenticarArquivo(preLocal,preManifesto);n++;
    for(let i=0;i<50 && !(await s.obter(o.id)).dados.downloadConcluido;i++)await new Promise(r=>setTimeout(r,10));
    await s.executar(o.id,{frase:'RESTAURAR SISTEMA',senha,custodia:true},usuario);
    ok((await banco.query('SELECT nome FROM contatos WHERE id=$1',[contato.id])).rows[0].nome==='QA optout','Retorno ao snapshot');
    ok((await controle.estado()).manutencao,'Manutenção após restore');
    ok((await req('/api/admin/restauracoes')).status===401,'Token pré-restore inválido');token=await login();
    const revisao=await req('/api/admin/restauracoes/'+o.id+'/revisao/usuarios');
    const usuariosRevisados=await revisao.json();
    ok(revisao.status===200 && !JSON.stringify(usuariosRevisados).includes('senha_hash'),'Revisão somente leitura sem hashes de senha');
    await s.reconciliar(o.id,usuario,false);
    ok((await banco.query('SELECT bloqueado_para_mensagens FROM contatos WHERE id=$1',[contato.id])).rows[0].bloqueado_para_mensagens,'Opt-out local sem aguardar template');
    ok((await banco.query('SELECT status FROM campanha_tentativas WHERE id=$1',[tentativa.id])).rows[0].status==='lida','Status oficial reconciliado sem esperar template');
    const contagem=(await banco.query('SELECT count(*)::int n FROM historico_contatos')).rows[0].n;
    await s.reconciliar(o.id,usuario,false);
    ok((await banco.query('SELECT count(*)::int n FROM historico_contatos')).rows[0].n===contagem,'Reconciliação idempotente');
    await s.reconciliar(o.id,usuario,true); // fetch externo é bloqueado pelo teste
    ok((await banco.query('SELECT count(*)::int n FROM recuperacao.webhooks WHERE aplicado_em IS NULL')).rows[0].n===2,'Meta indisponível permanece pendente');
    const checklist=Object.fromEntries((await s.listar()).checklist.map(k=>[k,true]));
    await rejeita(()=>s.liberar(o.id,{senha,frase:'LIBERAR SISTEMA',checklist},usuario));
    const provider=require('../src/modules/mensageria/metaCloudApiProvider');let consultas=0;
    provider.definirFetchParaTeste(async(url,options)=>{
      assert.equal(options.method,'GET');assert.ok(url.includes('/12345?')||url.includes('/67890?'));consultas++;
      const id=url.includes('/12345?')?'12345':'67890';
      return {ok:true,status:200,json:async()=>({id,name:'template_qa_'+id,language:'pt_BR',status:id==='12345'?'APPROVED':'REJECTED',category:'MARKETING',components:[{type:'BODY',text:'Mensagem QA'}]})};
    });
    await s.reconciliar(o.id,usuario,true);provider.definirFetchParaTeste();
    ok(consultas===2,'Somente GET de templates no mock');
    ok((await banco.query("SELECT meta_status_oficial FROM modelos_mensagem WHERE meta_template_id='12345'")).rows[0].meta_status_oficial==='APPROVED','Regra oficial de template preservada');
    ok((await banco.query("SELECT meta_status_oficial FROM modelos_mensagem WHERE meta_template_id='67890'")).rows[0].meta_status_oficial==='REJECTED','REJECTED reconciliado por GET oficial mock');
    await s.liberar(o.id,{senha,frase:'LIBERAR SISTEMA',checklist},usuario);
    ok(!(await controle.estado()).manutencao,'Liberação manual');
    ok((await req('/api/admin/campanhas')).status===200,'Operação após liberação');
    ok((await s.obter(o.id)).fase==='liberado','Histórico preservado após cleanup');
    ok((await banco.query('SELECT count(*)::int n FROM recuperacao.auditoria')).rows[0].n>0,'Auditoria sobrevive');
    ok((await banco.query("SELECT 1 FROM recuperacao.auditoria WHERE evento='qa_historico_antigo' AND criado_em='1970-01-01'")).rowCount===1,'Histórico antigo não expira');
    const id=await controle.admitir('qa_drenagem');await rejeita(()=>controle.exigirDrenagem());await controle.concluir(id);
    // Falhas da máquina de estados em alvo descartável; nunca executado em produção.
    for(const modo of ['drenagem','pre_backup','cancelamento','pg_restore','conexao','pos_validacao']){
      const novo=await backup.gerar(usuario),arq=await backup.prepararDownload(novo.id);
      const oper=await s.receber({path:arq.caminhoArquivo,destination:arq.diretorio},novo.manifesto,{email:usuario.email,senha},usuario,'127.0.0.1');
      const originalGerar=backup.gerar,originalRestore=f.restaurar,originalRetrato=f.retrato;
      let admission;
      try{
        if(modo==='drenagem')admission=await controle.admitir('qa_em_execucao');
        if(modo==='pre_backup')backup.gerar=async()=>{throw new Error('falha simulada');};
        if(['drenagem','pre_backup'].includes(modo)){
          token=await login();
          const falhaHttp=await req('/api/admin/restauracoes/'+oper.id+'/iniciar',{frase:'RESTAURAR SISTEMA',senha});
          const resultadoFalha=await falhaHttp.json();
          ok(falhaHttp.status>=400&&resultadoFalha.recuperacao?.fase==='abortado_antes_restore','Falha HTTP traz fase persistida '+modo);
          ok(resultadoFalha.recuperacao.novoLoginObrigatorio===true,'Falha após manutenção informa novo login '+modo);
          ok((await req('/api/admin/restauracoes')).status===401,'Token antigo invalidado mesmo com aborto '+modo);
          ok((await s.obter(oper.id)).fase==='abortado_antes_restore','Aborto seguro '+modo);
        }else if(modo==='cancelamento'){
          await s.iniciar(oper.id,{frase:'RESTAURAR SISTEMA',senha},usuario);
          await s.cancelarAntesRestore(oper.id,{frase:'CANCELAR RESTAURACAO',senha},usuario);
          ok((await s.obter(oper.id)).fase==='abortado_antes_restore','Cancelamento explícito antes do restore');
        }else{
          await s.iniciar(oper.id,{frase:'RESTAURAR SISTEMA',senha},usuario);
          await s.registrarDownload(oper.id,usuario);
          const estadoAntes=await f.retrato(banco);
          if(modo==='pg_restore')f.restaurar=async(file,db,clean)=>{
            const bytes=await fs.promises.readFile(file),parcial=path.join(arq.diretorio,'falha.dump');
            await fs.promises.writeFile(parcial,bytes.subarray(0,Math.floor(bytes.length/2)));
            return originalRestore(parcial,db,clean);
          };
          if(modo==='conexao')f.restaurar=async()=>{
            const client=new pg.Client(f.configuracao(process.env.BANCO_NOME));await client.connect();client.on('error',()=>{});
            try{await client.query('BEGIN');await client.query("UPDATE contatos SET nome='NAO_PERSISTIR'");await client.query('SELECT pg_terminate_backend(pg_backend_pid())');}
            finally{await client.end().catch(()=>{});}
          };
          if(modo==='pos_validacao'){
            let chamadas=0;f.retrato=async c=>{chamadas++;if(chamadas===2)throw new Error('Validação simulada');return originalRetrato(c);};
          }
          await rejeita(()=>s.executar(oper.id,{frase:'RESTAURAR SISTEMA',senha,custodia:true},usuario));
          ok((await s.obter(oper.id)).fase==='recuperacao_necessaria','Falha fechada '+modo);
          ok(fs.existsSync((await s.download(oper.id)).caminhoArquivo),'Cópia pré-restore preservada '+modo);
          if(modo!=='pos_validacao'){assert.deepEqual(await originalRetrato(banco),estadoAntes);n++;}
          await rejeita(()=>s.liberar(oper.id,{senha,frase:'LIBERAR SISTEMA',checklist},usuario));
        }
        ok((await controle.estado()).manutencao,'Nunca libera automaticamente '+modo);
      }finally{
        backup.gerar=originalGerar;f.restaurar=originalRestore;f.retrato=originalRetrato;
        if(admission)await controle.concluir(admission);
        // Reset EXCLUSIVAMENTE do cenário QA para testar a falha seguinte.
        await banco.query('UPDATE recuperacao.estado SET manutencao=false,operacao_id=NULL WHERE id=true');
        await s.limpar(oper.id);await fs.promises.rm(arq.diretorio,{recursive:true,force:true});
      }
    }
    const lock=await banco.connect();await lock.query('SELECT pg_advisory_lock(82175001)');
    try{await rejeita(()=>s.reconciliar(o.id,usuario));}finally{await lock.query('SELECT pg_advisory_unlock(82175001)');lock.release();}
    const interrompida=crypto.randomUUID();
    await banco.query("INSERT INTO recuperacao.operacoes(id,usuario_id,fase) VALUES ($1,$2,'restaurando')",[interrompida,usuario.id]);
    await controle.ativar(interrompida,usuario.id);await controle.reconhecerInterrupcao();
    ok((await s.obter(interrompida)).fase==='recuperacao_necessaria','Reinício detecta operação interrompida');
    ok((await controle.estado()).manutencao,'Reinício não libera manutenção');
    await banco.query('UPDATE recuperacao.estado SET manutencao=false,operacao_id=NULL WHERE id=true');
    console.log('Fase2: '+n+' verificações aprovadas.');
  }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await banco.end();if(dir)await fs.promises.rm(dir,{recursive:true,force:true});}
}
(process.argv[2]==='worker'?worker():principal()).catch(e=>{console.error(e.stack);process.exitCode=1;});
