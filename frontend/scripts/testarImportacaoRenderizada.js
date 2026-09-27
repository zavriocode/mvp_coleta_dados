import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const perfilTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'acorda-ui-importacao-'));
const aguardar = ms => new Promise(resolve => setTimeout(resolve, ms));
let navegador, socket, checks = 0;
const servidor = http.createServer((req, res) => {
  const rota = new URL(req.url, 'http://localhost').pathname;
  const arquivo = path.join(raiz, 'dist', rota.startsWith('/assets/') ? path.basename(rota) : 'index.html');
  const real = rota.startsWith('/assets/') ? path.join(raiz, 'dist/assets', path.basename(rota)) : arquivo;
  res.setHeader('Content-Type', real.endsWith('.js') ? 'text/javascript' : real.endsWith('.css') ? 'text/css' : 'text/html');
  fs.createReadStream(real).pipe(res);
});
try {
  await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + servidor.address().port;
  navegador = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=' + perfilTemp, 'about:blank'],
    { windowsHide: true, stdio: 'ignore' });
  let porta;
  for (let i = 0; i < 100; i++) {
    try { porta = fs.readFileSync(path.join(perfilTemp, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break; } catch { await aguardar(100); }
  }
  assert.ok(porta, 'Edge iniciado');
  const alvos = await (await fetch('http://127.0.0.1:' + porta + '/json/list')).json();
  socket = new WebSocket(alvos.find(a => a.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0; const pendentes = new Map();
  socket.addEventListener('message', e => {
    const m = JSON.parse(e.data); if (!pendentes.has(m.id)) return;
    const p = pendentes.get(m.id); pendentes.delete(m.id);
    if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
  });
  const enviar = (method, params = {}) => new Promise((resolve, reject) => {
    pendentes.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  const avaliar = async expression => {
    const r = await enviar('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert.ok(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value;
  };
  const esperar = async expression => {
    for (let i = 0; i < 80; i++) { if (await avaliar(expression)) { checks++; return; } await aguardar(100); }
    throw new Error('Condição não atingida: ' + expression + '\n' + await avaliar('document.body.innerText'));
  };
  await enviar('Page.addScriptToEvaluateOnNewDocument', { source: `
    localStorage.setItem('tokenAdministrativo','qa');
    if (!localStorage.getItem('usuarioAdministrativo')) localStorage.setItem('usuarioAdministrativo',JSON.stringify({id:1,nome:'QA',perfil:'administrador'}));
    window.__flags=[];
    window.fetch=async (url,options={})=>{
      let body={origens:[{id:1,nome:'Base anterior',tipo:'importacao'}],importacoes:[]};
      if(String(url).endsWith('/pre-visualizar')) {
        const flag=options.body.get('consentimentoMigrado');window.__flags.push(flag);
        body={mensagem:'Validado',importacao:{importacaoId:1,consentimentoMigrado:flag==='true',totalRecebido:1,validos:1,invalidos:0,linhas:[]}};
      } else if(String(url).endsWith('/confirmar')) body={mensagem:'Concluído',relatorio:{criados:1,consentimentoMigrado:true,totalConsentimentosMigrados:1}};
      return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
    };
  ` });
  await enviar('Page.enable');
  await enviar('Page.navigate', { url: base + '/admin/importacoes' });
  await esperar("!!document.querySelector('#consentimento-migrado')");
  assert.equal(await avaliar("document.querySelector('#consentimento-migrado').checked"), false); checks++;
  await esperar("document.querySelector('#origem-importacao')?.options.length > 1");
  await avaliar(`(() => {
    const campo=document.querySelector('#origem-importacao'); campo.value='Base anterior'; campo.dispatchEvent(new Event('change',{bubbles:true}));
    const file=document.querySelector('#arquivo-importacao'), dt=new DataTransfer();dt.items.add(new File(['telefone;nome\\n21999999999;QA'],'qa.csv',{type:'text/csv'}));file.files=dt.files;file.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  await avaliar("document.querySelector('#consentimento-migrado').click()");
  await avaliar("document.querySelector('.formulario-importacao').requestSubmit()");
  await esperar("!!document.querySelector('.botao-confirmar-importacao')");
  assert.equal(await avaliar('window.__flags[0]'), 'true'); checks++;
  await esperar("document.body.innerText.includes('Aplicável somente aos novos contatos')");
  await avaliar("document.querySelector('#consentimento-migrado').click()");
  await esperar("!document.querySelector('.botao-confirmar-importacao')");
  await avaliar("document.querySelector('.formulario-importacao').requestSubmit()");
  await esperar("!!document.querySelector('.botao-confirmar-importacao')");
  assert.equal(await avaliar('window.__flags[1]'), 'false'); checks++;
  await avaliar("document.querySelector('#consentimento-migrado').click()");
  await esperar("!document.querySelector('.botao-confirmar-importacao')");
  await avaliar("document.querySelector('.formulario-importacao').requestSubmit()");
  await esperar("!!document.querySelector('.botao-confirmar-importacao')");
  await avaliar("document.querySelector('.botao-confirmar-importacao').click()");
  await esperar("document.body.innerText.includes('Consentimentos migrados: 1')");
  assert.equal(await avaliar("document.querySelector('#consentimento-migrado').checked"), false); checks++;
  await avaliar("localStorage.setItem('usuarioAdministrativo',JSON.stringify({id:2,nome:'Operador QA',perfil:'operador'}))");
  await enviar('Page.reload');
  await esperar("!!document.querySelector('#arquivo-importacao')");
  assert.equal(await avaliar("!!document.querySelector('#consentimento-migrado')"), false); checks++;
  console.log(JSON.stringify({ interfaceChecks: checks, admin: true, operadorSemOpcao: true, resetPorImportacao: true }));
  await enviar('Browser.close').catch(() => {});
} catch (erro) {
  console.error(erro.stack);
  process.exitCode = 1;
} finally {
  socket?.close();
  if (navegador && navegador.exitCode === null) {
    await Promise.race([new Promise(resolve => navegador.once('exit', resolve)), aguardar(3000)]);
    if (navegador.exitCode === null) navegador.kill();
  }
  await new Promise(resolve => servidor.close(resolve));
  try { fs.rmSync(perfilTemp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
  catch { console.error('Perfil temporário retido: ' + perfilTemp); }
}
