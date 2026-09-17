// Interface real em Edge, API inteiramente simulada. Nenhuma chamada ao backend/Meta.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const raiz=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pausa=ms=>new Promise(r=>setTimeout(r,ms));
let checks=0;
const ok=(v,m)=>{assert.ok(v,m);checks++;};
function conectar(url){return new Promise((resolve,reject)=>{
  const ws=new WebSocket(url),pendentes=new Map();let id=0;
  ws.onopen=()=>resolve({send:(method,params={})=>new Promise((r,j)=>{pendentes.set(++id,[r,j]);ws.send(JSON.stringify({id,method,params}));}),close:()=>ws.close()});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(!pendentes.has(m.id))return;const [r,j]=pendentes.get(m.id);pendentes.delete(m.id);m.error?j(new Error(m.error.message)):r(m.result);};ws.onerror=reject;
});}
const mock=String.raw`
localStorage.setItem('tokenAdministrativo','token-qa-isolado');
localStorage.setItem('usuarioAdministrativo',JSON.stringify({id:1,nome:'Administrador QA',perfil:'administrador'}));
window.__qa={erro:false,atraso:0,chamadas:[],dados:{estado:{manutencao:false},operacoes:[],pendencias:[],checklist:['usuarios','consentimentos','bloqueios','campanhas','tentativas','indeterminados','eventosPosteriores','meta','capacidade','secrets']}};
window.__qa.falhaIniciar=${process.env.QA_FALHA_INICIAR==='1'};
window.__op={id:'11111111-1111-4111-8111-111111111111',usuario_id:1,criado_em:'2026-09-17T12:00:00Z',fase:'valido',dados:{manifesto:{dados:{criadoEm:'2026-09-15T17:04:00Z',versaoPostgresql:'18.4',tamanhoBytes:293601280}},resumo:{tabelas:31,contagens:{contatos:2000,campanhas:4,consentimentos:2000}}}};
window.fetch=async (input,options={})=>{
  const url=String(input);window.__qa.chamadas.push({url,method:options.method||'GET',body:typeof options.body==='string'?JSON.parse(options.body):null});
  const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
  if(url.includes('/restauracoes')){
    if(url.endsWith('/upload')){await new Promise(r=>setTimeout(r,window.__qa.atraso));if(window.__qa.erro)return json({mensagem:'O arquivo não pôde ser validado. Selecione o backup completo.'},400);window.__qa.dados.operacoes=[window.__op];return json(window.__op,201);}
    if(url.endsWith('/iniciar')){
      window.__qa.tokenExpirado=true;
      window.__qa.dados.estado={manutencao:true,operacao_id:window.__op.id};
      if(window.__qa.falhaIniciar){
        // Deixa o polling receber 401 antes da falha de drenagem, como no caso real.
        await new Promise(r=>setTimeout(r,3000));
        window.__op.fase='abortado_antes_restore';window.__op.erro='Não foi possível comprovar o término das operações em andamento. Nenhuma restauração foi executada. Manutenção preservada.';
        return json({mensagem:window.__op.erro,recuperacao:{id:window.__op.id,fase:window.__op.fase,erro:window.__op.erro,manutencao:true,novoLoginObrigatorio:true}},409);
      }
      window.__op.fase='aguardando_custodia';window.__op.dados.preBackup={nomeArquivo:'seguranca.acorda',manifesto:{dados:{}}};return json(window.__op);
    }
    if(window.__qa.tokenExpirado)return json({mensagem:'Sessão encerrada.'},401);
    if(url.endsWith('/pre-backup')){window.__op.dados.downloadConcluido=true;return new Response('QA');}
    if(url.endsWith('/executar')){window.__op.fase='aguardando_revisao';window.__op.dados.restauradoEm='2026-09-17T12:00:00Z';window.__op.dados.nomeArquivo='backup-teste.acorda';return json({...window.__op,novoLoginObrigatorio:true});}
    if(url.endsWith('/liberar')){window.__op.fase='liberado';window.__qa.dados.estado.manutencao=false;return json(window.__op);}
    if(url.endsWith('/reconciliar')||url.endsWith('/templates'))return json({});
    if(url.includes('/revisao/'))return json({registros:[{id:1,nome:'Contato de conferência QA',telefone:'21900000000'}]});
    return json(window.__qa.dados);
  }
  if(url.includes('/api/'))return json({backups:[]});
  throw new Error('Rede não autorizada no QA visual: '+url);
};
`;
let servidor,navegador,cliente,dir;
try{
  dir=fs.mkdtempSync(path.join(os.tmpdir(),'acorda-restore-ux-'));
  servidor=http.createServer((req,res)=>{
    const p=new URL(req.url,'http://127.0.0.1').pathname;
    let alvo=path.resolve(raiz,'dist','.'+p);
    if(!alvo.startsWith(path.join(raiz,'dist')+path.sep)||!fs.existsSync(alvo)||fs.statSync(alvo).isDirectory())alvo=path.join(raiz,'dist/index.html');
    res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(alvo)]||'application/octet-stream');fs.createReadStream(alvo).pipe(res);
  });await new Promise(r=>servidor.listen(0,'127.0.0.1',r));
  const debug=9600+Math.floor(Math.random()*200);
  navegador=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--user-data-dir='+path.join(dir,'perfil'),'--remote-debugging-port='+debug,'about:blank'],{stdio:'ignore',windowsHide:true});
  let url;
  for(let i=0;i<80&&!url;i++){try{url=(await(await fetch('http://127.0.0.1:'+debug+'/json/list')).json()).find(x=>x.type==='page')?.webSocketDebuggerUrl;}catch{}if(!url)await pausa(100);}
  assert.ok(url);cliente=await conectar(url);
  await cliente.send('Page.enable');await cliente.send('Network.enable');await cliente.send('Network.setBlockedURLs',{urls:['https://*','http://localhost:3000/*']});
  await cliente.send('Page.addScriptToEvaluateOnNewDocument',{source:mock});
  await cliente.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await cliente.send('Page.navigate',{url:'http://127.0.0.1:'+servidor.address().port+'/admin/backups'});
  const evalua=async expression=>{const r=await cliente.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const espera=async expression=>{for(let i=0;i<100;i++){if(await evalua(`Boolean(${expression})`))return;await pausa(50);}throw new Error('Timeout: '+expression);};
  const botao=t=>`Array.from(document.querySelectorAll('.restauracoes button')).find(e=>e.textContent.trim()===${JSON.stringify(t)})`;
  const clicar=async t=>{ok(await evalua(`!!${botao(t)} && !${botao(t)}.matches(':disabled')`),'Botão disponível: '+t);await evalua(`${botao(t)}.click()`);await pausa(70);};
  const preencher=async(sel,valor)=>{await evalua(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(valor)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await pausa(50);};
  const captura=async nome=>{await evalua(`document.querySelector('.restauracoes').scrollIntoView({block:'start'})`);await pausa(80);const r=await cliente.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(dir,nome+'.png'),Buffer.from(r.data,'base64'));};
  await espera(`document.querySelector('.restore-conteudo') && !document.querySelector('.restore-conteudo').disabled`);
  ok(await evalua(`document.querySelectorAll('.restore-etapas li').length===3 && !!document.querySelector('.restore-campos input[type=password]')`),'Upload e credenciais juntos em fluxo de três etapas');
  ok(await evalua(`document.querySelectorAll('.restauracoes input[type=file]').length===1 && !document.getElementById('restore-verificacao')`),'Apenas um arquivo de backup, sem verificação separada');
  ok(await evalua(`${botao('Validar backup')}.disabled`),'Sem arquivos não valida');
  ok(await evalua(`!document.querySelector('.restauracoes').innerText.match(/MiB|HMAC|pg_restore|PGDMP|RESTORE_UPLOAD/)`),'Sem linguagem técnica na abertura');
  await captura('desktop-selecao');
  await cliente.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  ok(await evalua(`document.documentElement.scrollWidth<=innerWidth`),'Seleção mobile sem overflow');await captura('mobile-selecao');
  await cliente.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await evalua(`(()=>{for(const [id,nome,tipo] of [['restore-backup','backup-teste.acorda','application/octet-stream']]){const d=new DataTransfer();d.items.add(new File(['{}'],nome,{type:tipo}));const e=document.getElementById(id);e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));}})()`);await pausa(100);
  ok(await evalua(`!document.querySelector('.restore-confirmacao')`),'Credencial de inspeção separada da confirmação destrutiva');
  await preencher('.restore-campos input[type=email]','admin@invalid.local');await preencher('.restore-campos input[type=password]','QA123!');
  await evalua(`window.__qa.erro=true;window.__qa.atraso=500`);await clicar('Validar backup');
  ok(await evalua(`!!document.querySelector('.restore-loading') && ${botao('Validar backup')}.matches(':disabled')`),'Loading e bloqueio durante upload');
  await espera(`document.querySelector('.restore-aviso.erro') && !document.querySelector('.restore-loading')`);
  ok(await evalua(`document.querySelector('.restore-aviso.erro').innerText.includes('Backup não pôde ser validado')`),'Erro amigável de validação');
  ok(await evalua(`!document.querySelector('.restore-confirmacao')`),'Erro não avança para restauração');
  await evalua(`window.__qa.erro=false`);await preencher('.restore-campos input[type=password]','QA123!');await clicar('Validar backup');
  await espera(`!!document.querySelector('.restore-validado') && !document.querySelector('.restore-loading')`);
  ok(await evalua(`document.querySelector('.restore-validado').innerText.includes('31 tabelas')`),'Resumo validado mostra conteúdo');
  ok(await evalua(`!document.querySelector('.restore-detalhes').open`),'Detalhes técnicos recolhidos');
  ok(await evalua(`!${botao('Continuar para confirmação')} && !document.querySelector('.restore-check')`),'Sem tela intermediária nem aceite repetido antes da preparação');
  ok(await evalua(`!!document.querySelector('.restore-confirmacao') && !document.querySelector('.restore-resultado')`),'Preparação junto ao resumo; backup válido não significa restauração concluída');
  await captura('desktop-revisao');
  ok(await evalua(`${botao('Confirmar e preparar sistema')}.disabled`),'Confirmação vazia bloqueia ação');
  await preencher('.restore-confirmacao input[type=password]','QA123!');await preencher('.restore-confirmacao input:not([type=password])','RESTAURAR');
  ok(await evalua(`${botao('Confirmar e preparar sistema')}.disabled`),'Frase parcial bloqueia ação');
  await preencher('.restore-confirmacao input:not([type=password])','RESTAURAR SISTEMA');await clicar('Confirmar e preparar sistema');
  await espera(`document.querySelector('a[href="/login"]')`);
  await espera(`!document.querySelector('.restore-loading')`);
  ok(await evalua(`document.querySelector('.restore-conteudo').disabled`),'Novo login exigido após manutenção');
  ok(await evalua(`window.__qa.chamadas.filter(x=>x.url.endsWith('/iniciar')).length===1`),'Preparação chamada somente uma vez');
  if(process.env.QA_FALHA_INICIAR==='1'){
    ok(await evalua(`!document.querySelector('.restore-resultado')`),'Aborto não mostra sucesso de restauração');
    ok(await evalua(`document.querySelector('.restauracoes').innerText.includes('Nenhuma restauração foi executada')`),'Falha de drenagem informa que não houve restore');
    ok(await evalua(`!!document.querySelector('.restore-progresso') && !document.querySelector('.restore-confirmacao')`),'Fase persistida substitui formulário antigo mesmo após polling 401');
    await captura('aborto-drenagem');
    // O restante da suíte valida custódia/revisão em OUTRO cenário inteiramente mock.
    await evalua(`window.__op.fase='aguardando_custodia';window.__op.dados.preBackup={nomeArquivo:'seguranca.acorda',manifesto:{dados:{}}};delete window.__op.erro`);
  }else{
    ok(await evalua(`!document.querySelector('.restore-aviso.erro')`),'Sucesso não vira erro por consulta com token antigo');
  }
  // Simula novo login/reabertura: persiste apenas o estado mock, não credenciais.
  const estado=await evalua(`JSON.stringify(window.__qa.dados)`);
  await cliente.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__qa.dados=${estado};window.__op=window.__qa.dados.operacoes[0];`});
  await cliente.send('Page.reload');await espera(`document.querySelector('.restore-progresso')`);
  ok(await evalua(`${botao('Restaurar dados agora')}.disabled`),'Sem custódia não restaura');
  ok(await evalua(`document.querySelector('.restore-check input').disabled`),'Custódia aguarda download no servidor');
  // O teste não baixa conteúdo real; confirma metadado de download via estado fake.
  await evalua(`window.__op.dados.downloadConcluido=true`);await clicar('Atualizar status');
  await evalua(`document.querySelector('.restore-check input').click()`);await preencher('.restore-confirmacao input[type=password]','QA123!');await preencher('.restore-confirmacao input:not([type=password])','RESTAURAR SISTEMA');
  await clicar('Restaurar dados agora');await espera(`document.querySelector('a[href="/login"]')`);
  ok(await evalua(`document.querySelector('.restore-resultado')?.innerText.includes('Restauração concluída com sucesso') && document.querySelector('.restore-resultado')?.innerText.includes('permanece em manutenção')`),'Sucesso imediato distingue restore de liberação');
  const revisao=await evalua(`JSON.stringify(window.__qa.dados)`);
  await cliente.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__qa.dados=${revisao};window.__op=window.__qa.dados.operacoes[0];`});await cliente.send('Page.reload');await espera(`!!document.querySelector('.restore-checklist')`);
  ok(await evalua(`!!document.querySelector('.restore-resultado')`),'Sucesso persiste após novo login');
  ok(await evalua(`document.querySelector('.restore-resultado').innerText.includes('backup-teste.acorda') && document.querySelector('.restore-resultado').innerText.includes('Aprovada') && document.querySelector('.restore-resultado').innerText.includes('2.000')`),'Comprovante identifica arquivo, integridade e quantidade de contatos');
  await clicar('Conferir dados restaurados');
  await espera(`document.querySelector('.restore-resultado').innerText.includes('Contato de conferência QA')`);
  ok(await evalua(`window.__qa.chamadas.some(x=>x.url.endsWith('/revisao/contatos?pagina=0')&&x.method==='GET')`),'Conferência somente leitura em manutenção');
  ok(await evalua(`${botao('Continuar para liberação')}.disabled`),'Checklist obrigatório');
  await evalua(`window.__qa.dados.pendencias=[{id:1,tipo:'template',requer_meta:true}]`);await clicar('Atualizar status');
  ok(await evalua(`!!${botao('Consultar modelos pendentes na Meta')}`),'Consulta manual disponível apenas para pendência');
  await evalua(`document.querySelectorAll('.restore-checklist input').forEach(e=>e.click())`);await pausa(80);
  ok(await evalua(`${botao('Continuar para liberação')}.disabled`),'Pendências bloqueiam liberação mesmo com checklist');
  await captura('desktop-progresso');await cliente.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  ok(await evalua(`document.documentElement.scrollWidth<=innerWidth`),'Progresso mobile sem overflow');await captura('mobile-progresso');
  await evalua(`window.__qa.dados.pendencias=[]`);await clicar('Atualizar status');await clicar('Continuar para liberação');
  ok(await evalua(`${botao('Liberar sistema após revisão')}.disabled`),'Liberação exige senha e frase');
  await preencher('.restore-confirmacao input[type=password]','QA123!');await preencher('.restore-confirmacao input:not([type=password])','LIBERAR SISTEMA');await clicar('Liberar sistema após revisão');
  await espera(`document.querySelector('.restore-resultado')?.innerText.includes('sistema está liberado')`);
  ok(await evalua(`document.querySelector('.restore-resultado a')?.getAttribute('href')==='/admin/contatos'`),'Após liberação botão abre cadastro normal');
  ok(await evalua(`document.querySelectorAll('.restore-progresso .concluido').length===9`),'Nove etapas concluídas após liberação explícita');
  ok(await evalua(`window.__qa.chamadas.filter(x=>x.url.endsWith('/executar')).length===0`),'Nenhum reenvio de restore após reabrir para revisão');
  await evalua(`delete window.__op.dados.restauradoEm`);await clicar('Atualizar status');
  ok(await evalua(`!document.querySelector('.restore-resultado')`),'Liberação de operação abortada não afirma que houve restore');
  console.log('UX restauração: '+checks+' verificações aprovadas. Capturas: '+dir);
}finally{
  if(cliente){await Promise.race([cliente.send('Browser.close').catch(()=>{}),pausa(1000)]);cliente.close();}
  if(navegador){navegador.kill();await pausa(500);}if(servidor){servidor.closeAllConnections();await new Promise(r=>servidor.close(r));}
  if(dir){const perfil=path.resolve(dir,'perfil');assert.equal(path.dirname(perfil),path.resolve(dir));fs.rmSync(perfil,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
  // Capturas técnicas mantidas para inspeção; nenhum dado real é usado.
}
