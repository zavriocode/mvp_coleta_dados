// Auditoria exclusivamente local: banco descartável, provider fake e processos novos.
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');
const crypto = require('crypto');
const { monitorEventLoopDelay } = require('perf_hooks');

async function worker() {
  const banco = require('../src/config/banco');
  const campanha = require('../src/modules/campanhas/campanhaService');
  const msg = require('../src/modules/mensageria/mensageriaService');
  const model = require('../src/modules/mensageria/mensageriaModel');
  const nome = (await banco.query('SELECT current_database() AS nome')).rows[0].nome;
  assert.match(nome, /^acorda_rj_campanhas_qa_auditoria_/);
  let checks = 0, ativos = 0, concorrencia = 0, chamadas = 0;
  const ok = (valor, texto) => { assert.ok(valor, texto); checks++; };
  const delay = monitorEventLoopDelay({ resolution: 20 }); delay.enable();
  const inicio = process.memoryUsage(), pico = { ...inicio };
  let conexoes = 0, ocupadas = 0;
  const amostrar = () => {
    const m = process.memoryUsage();
    for (const k of Object.keys(m)) pico[k] = Math.max(pico[k], m[k]);
    conexoes = Math.max(conexoes, banco.totalCount);
    ocupadas = Math.max(ocupadas, banco.totalCount - banco.idleCount);
  };
  const timer = setInterval(amostrar, 20);
  const comeco = Date.now();
  const usuario = (await banco.query("SELECT id,nome,email,perfil FROM usuarios WHERE perfil='administrador' LIMIT 1")).rows[0];
  const origem = (await banco.query('SELECT id FROM origens LIMIT 1')).rows[0];
  const bairro = (await banco.query('SELECT nome FROM bairros WHERE ativo=TRUE LIMIT 1')).rows[0].nome;
  const frontend = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/CampanhasAdministrativas.jsx'), 'utf8');
  const tamanhoGrupo = Number(frontend.match(/const concorrencia=(\d+)/)[1]);
  const status = (id, tipo, ts) => ({ entry: [{ changes: [{ value: { statuses: [{ id, status: tipo, timestamp: String(ts) }] } }] }] });
  const buscar = async id => (await banco.query('SELECT * FROM campanha_tentativas WHERE id=$1', [id])).rows[0];
  async function fixture(nomeC, n, base) {
    const modelo = (await banco.query(`INSERT INTO modelos_mensagem
      (nome,categoria,texto,ativo,meta_nome,meta_idioma,meta_categoria,meta_status,meta_template_id,
       meta_status_oficial,meta_componentes,meta_configuracao_envio,meta_origem)
      VALUES ($1,'Geral','Olá',TRUE,$1,'pt_BR','MARKETING','aprovado',$1,'APPROVED',
      '[{"type":"BODY","text":"Olá"}]','{}','meta') RETURNING id`, [nomeC])).rows[0];
    await banco.query(`INSERT INTO contatos (nome,telefone,telefone_normalizado,bairro,problema,idade,
      origem_id,consentimento_armazenamento,status_contato)
      SELECT $1 || ' ' || i, ('219' || lpad(($5+i)::text,8,'0')), ('219' || lpad(($5+i)::text,8,'0')),
      $2,'Saude',30,$3,TRUE,'ativo' FROM generate_series(1,$4::int) i`, [nomeC,bairro,origem.id,n,base]);
    const c = await campanha.criar({ nome:nomeC, finalidade:'QA isolado', modeloId:modelo.id, filtros:{nome:nomeC} }, usuario);
    await campanha.alterarStatus(c.id, 'pronta', usuario);
    return c;
  }
  async function fake(url, opcoes) {
    const payload = JSON.parse(opcoes.body);
    ativos++; concorrencia = Math.max(concorrencia,ativos); chamadas++;
    // Ledger exclusivo de teste simula cobrança externa sobrevivendo ao restart.
    const r = await banco.query('INSERT INTO qa_aceites(destino) VALUES($1) RETURNING id', [payload.to]);
    await new Promise(resolve => setTimeout(resolve, 5));
    ativos--;
    return { ok:true, status:200, json:async()=>({messages:[{id:'wamid.audit.'+r.rows[0].id}]}) };
  }
  msg.definirProviderParaTeste(fake);
  async function enviar(ids) {
    for(let i=0;i<ids.length;i+=tamanhoGrupo) {
      const r = await Promise.allSettled(ids.slice(i,i+tamanhoGrupo).map(id=>msg.enviar(id)));
      ok(r.every(x=>x.status==='fulfilled'), 'Falha no lote normal');
    }
  }
  try {
    const fase = process.argv[3];
    if(fase === 'queda') {
      const c = await fixture('QA_RESTART',8,40000);
      const p = await campanha.prepararEnvio(c.id,{quantidade:8,chaveIdempotencia:'restart'},usuario);
      await enviar(p.tentativas.slice(0,4));
      msg.definirProviderParaTeste(async (...args)=>{
        await fake(...args);
        console.log('QUEDA_APOS_ACEITE');
        process.exit(73);
      });
      await msg.enviar(p.tentativas[4]);
      throw new Error('Queda não ocorreu');
    }
    if(fase === 'retomada') {
      const c = (await banco.query("SELECT id FROM campanhas WHERE nome='QA_RESTART'")).rows[0];
      msg.definirRelogioParaTeste(()=>new Date(Date.now()+180000));
      await msg.recuperarProcessamentoPendente();
      ok(chamadas===0,'Recovery chamou provider');
      const amb = (await banco.query("SELECT t.* FROM campanha_tentativas t JOIN campanha_participacoes p ON p.id=t.participacao_id WHERE p.campanha_id=$1 AND t.status='enviando'",[c.id])).rows[0];
      ok(amb && amb.resultado_indeterminado_em && !amb.permite_nova_tentativa,'Ambiguidade desprotegida');
      await assert.rejects(msg.enviar(amb.id)); checks++;
      await assert.rejects(msg.reprocessar(amb.id)); checks++;
      const p = await campanha.prepararEnvio(c.id,{quantidade:3,chaveIdempotencia:'retomada'},usuario);
      ok(p.tentativas.length===3,'Retomada não selecionou só pendentes');
      await enviar(p.tentativas);
      ok(chamadas===3,'Retomada repetiu confirmados');
      ok(Number((await banco.query('SELECT COUNT(*) n FROM qa_aceites')).rows[0].n)===2008,'Cobranças fake divergentes');
    } else {
      await campanha.atualizarLimite({valor:10000,motivo:'Auditoria isolada'},usuario);
      await banco.query(`INSERT INTO sincronizacoes_limite_meta(limite_anterior,limite_novo,tier_anterior,tier_novo,origem,status,usuario_id)
        VALUES(10000,10000,'TIER_10000','TIER_10000','webhook_meta','sucesso',$1)`,[usuario.id]);
      const c = await fixture('QA_ESCALA',2000,10000);
      ok((await campanha.visualizarPublico(c.id,10000)).publicoApto===2000,'Público inicial');
      for(let lote=0;lote<4;lote++) {
        const pedidos = await Promise.all([0,1].map(()=>campanha.prepararEnvio(c.id,{quantidade:500,chaveIdempotencia:'escala-'+lote},usuario)));
        assert.deepEqual(pedidos[0].tentativas,pedidos[1].tentativas); checks++;
        const ids=pedidos[0].tentativas;
        if(lote===0) {
          const duplo=await Promise.allSettled([msg.enviar(ids[0]),msg.enviar(ids[0])]);
          ok(duplo.filter(x=>x.status==='fulfilled').length===1,'Duplo envio');
          await enviar(ids.slice(1));
        } else await enviar(ids);
        amostrar(); console.log(JSON.stringify({lote:lote+1,memoria:process.memoryUsage()}));
      }
      ok(chamadas===2000,'Não enviou exatamente 2000');
      const resumo=(await banco.query(`SELECT count(*)::int n,count(DISTINCT p.contato_id)::int unicos,
        count(*) FILTER(WHERE t.status='enviada')::int enviadas FROM campanha_participacoes p
        JOIN campanha_tentativas t ON t.participacao_id=p.id WHERE p.campanha_id=$1`,[c.id])).rows[0];
      ok(resumo.n===2000&&resumo.unicos===2000&&resumo.enviadas===2000,'Totais incorretos');
      ok((await campanha.visualizarPublico(c.id,10000)).restantes===0,'Restaram contatos');
      console.log('ESCALA_2000_OK');
    }
    ok(Number((await banco.query('SELECT count(*) n FROM (SELECT destino FROM qa_aceites GROUP BY destino HAVING count(*)>1) d')).rows[0].n)===0,'Aceite duplicado');
    if(fase==='retomada') {
      const c=await fixture('QA_FALHAS',4,50000);
      const p=await campanha.prepararEnvio(c.id,{quantidade:4,chaveIdempotencia:'falhas'},usuario);
      // Ausência de ID oficial: nunca permitir retry.
      msg.definirProviderParaTeste(async()=>({ok:true,status:200,json:async()=>({messages:[]})}));
      await assert.rejects(msg.enviar(p.tentativas[0])); checks++;
      ok(Boolean((await buscar(p.tentativas[0])).resultado_indeterminado_em),'Resposta sem ID não protegida');
      // Falha PostgreSQL dentro de concluirEnvio: trigger provoca erro após o UPDATE inicial;
      // a transação deve desfazer status/ID antes da marcação de incerteza.
      await banco.query(`CREATE FUNCTION qa_falha() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA indisponibilidade'; END $$;
        CREATE TRIGGER qa_falha BEFORE UPDATE ON campanha_participacoes FOR EACH ROW EXECUTE FUNCTION qa_falha()`);
      msg.definirProviderParaTeste(fake);
      // Início também toca participação: validar rollback anterior ao provider.
      const antes=chamadas;
      await assert.rejects(msg.enviar(p.tentativas[1])); checks++;
      ok(chamadas===antes && (await buscar(p.tentativas[1])).status==='pendente','Rollback antes do provider falhou');
      await banco.query('DROP TRIGGER qa_falha ON campanha_participacoes');
      msg.definirProviderParaTeste(async(...args)=>{
        const resposta=await fake(...args);
        await banco.query('CREATE TRIGGER qa_falha BEFORE UPDATE ON campanha_participacoes FOR EACH ROW EXECUTE FUNCTION qa_falha()');
        return resposta;
      });
      await assert.rejects(msg.enviar(p.tentativas[1])); checks++;
      await banco.query('DROP TRIGGER qa_falha ON campanha_participacoes');
      const t=await buscar(p.tentativas[1]);
      ok(t.status==='enviando'&&!t.identificador_externo&&t.resultado_indeterminado_em,'Confirmação parcial após falha SQL');
      msg.definirProviderParaTeste(fake);
      await assert.rejects(msg.enviar(t.id)); checks++;
      // Webhook recebido antes da correlação, timestamp oficial e repetição.
      await model.iniciarEnvio(p.tentativas[2],new Date());
      const ts=Math.floor(Date.now()/1000);
      ok((await msg.processarWebhook(status('wamid.early','read',ts)))[0].pendente,'Evento antecipado descartado');
      await model.concluirEnvio(p.tentativas[2],'wamid.early',new Date());
      const early=await buscar(p.tentativas[2]);
      ok(early.status==='lida'&&new Date(early.status_externo_em).getTime()===ts*1000,'Timestamp/correlação');
      ok((await msg.processarWebhook(status('wamid.early','read',ts)))[0].motivo==='evento_repetido','Webhook duplicado');
      await msg.processarWebhook(status('wamid.early','sent',ts-10));
      ok((await buscar(early.id)).status==='lida','Status regrediu');
      // Conexão do pool recusada antes de iniciar: não há chamada externa nem alteração.
      const conectar=banco.connect;
      banco.connect=async()=>{throw new Error('QA conexão indisponível');};
      const antesBanco=chamadas;
      try {await assert.rejects(msg.enviar(p.tentativas[3])); checks++;} finally {banco.connect=conectar;}
      ok(chamadas===antesBanco&&(await buscar(p.tentativas[3])).status==='pendente','Falha conexão alterou estado');
      await msg.enviar(p.tentativas[3]);
      ok((await buscar(p.tentativas[3])).status==='enviada','Não retomou após reconexão');
    }
    await new Promise(r=>setTimeout(r,50)); amostrar();
    ok(banco.waitingCount===0&&banco.totalCount===banco.idleCount,'Pool não liberado');
    console.log(JSON.stringify({fase:process.argv[3],checks,inicio,pico,final:process.memoryUsage(),
      duracaoMs:Date.now()-comeco,concorrencia,conexoes,ocupadas,eventLoopMaxMs:delay.max/1e6,eventLoopP99Ms:delay.percentile(99)/1e6}));
  } finally {clearInterval(timer); delay.disable(); await banco.end();}
}

async function principal() {
  const pg=require('pg');
  const host=process.env.BANCO_HOST;
  assert.ok(['127.0.0.1','localhost','::1'].includes(host),'Somente PostgreSQL local autorizado');
  const nome='acorda_rj_campanhas_qa_auditoria_'+process.pid;
  const cfg={host,port:Number(process.env.BANCO_PORTA)||5432,user:process.env.BANCO_USUARIO,password:process.env.BANCO_SENHA,database:'postgres',ssl:false};
  const admin=new pg.Client(cfg); await admin.connect();
  const url=new URL('postgresql://localhost'); url.hostname=host; url.port=String(cfg.port); url.username=cfg.user; url.password=cfg.password; url.pathname='/'+nome;
  const env={...process.env,DATABASE_URL:url.toString(),BANCO_SSL:'false',NODE_ENV:'test',
    JWT_SECRET:crypto.randomBytes(40).toString('hex'),JWT_TEMPO_EXPIRACAO:'1h',
    BACKUP_ASSINATURA_CHAVE:crypto.randomBytes(32).toString('hex'),
    META_GRAPH_API_VERSION:'v99.0',META_APP_ID:'1122334455',META_APP_SECRET:'fake',WHATSAPP_ACCESS_TOKEN:'fake',
    WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_BUSINESS_ACCOUNT_ID:'987654321',WHATSAPP_WEBHOOK_VERIFY_TOKEN:'fake',WHATSAPP_OPTOUT_BUTTON_ID:'nao_quero_mais_receber'};
  async function run(arquivo,args=[],codigo=0) {
    await new Promise((resolve,reject)=>{
      const child=cp.spawn(process.execPath,[arquivo,...args],{cwd:path.join(__dirname,'..'),env,windowsHide:true,stdio:'inherit'});
      child.once('error',reject); child.once('exit',c=>c===codigo?resolve():reject(new Error(arquivo+' exit '+c)));
    });
  }
  try {
    await admin.query('CREATE DATABASE "'+nome+'"');
    const db=new pg.Client({...cfg,database:nome}); await db.connect();
    try {
      await db.query(fs.readFileSync(path.join(__dirname,'../database/criar_banco.sql'),'utf8'));
      const hash=await require('bcrypt').hash('SenhaQACampanhas123!',4);
      await db.query("INSERT INTO usuarios(nome,email,senha_hash,perfil) VALUES('QA Admin','qa.campanhas@invalid.local',$1,'administrador')",[hash]);
      await db.query('CREATE TABLE qa_aceites(id BIGINT GENERATED ALWAYS AS IDENTITY, destino text NOT NULL)');
    } finally {await db.end();}
    await run(__filename,['worker','escala']);
    await run(__filename,['worker','queda'],73);
    await run(__filename,['worker','retomada']);
    for(const script of ['testarResilienciaMensageria.js','testarWebhookMensageria.js','testarCenarioFinalCampanhaMeta.js','testarBackups.js','testarCampanhas.js']) {
      const fresh=new pg.Client({...cfg,database:nome}); await fresh.connect();
      try {
        await fresh.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS recuperacao CASCADE');
        await fresh.query(fs.readFileSync(path.join(__dirname,'../database/criar_banco.sql'),'utf8'));
        const hash=await require('bcrypt').hash('SenhaQACampanhas123!',4);
        await fresh.query("INSERT INTO usuarios(nome,email,senha_hash,perfil) VALUES('QA Admin','qa.campanhas@invalid.local',$1,'administrador')",[hash]);
      } finally {await fresh.end();}
      await run(path.join(__dirname,script));
    }
  } finally {
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1',[nome]);
    await admin.query('DROP DATABASE IF EXISTS "'+nome+'"'); await admin.end();
  }
}
(process.argv[2]==='worker'?worker():principal()).catch(e=>{console.error(e.message);process.exitCode=1;});
