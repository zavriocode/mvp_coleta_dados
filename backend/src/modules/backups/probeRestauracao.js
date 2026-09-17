// Processo filho exclusivo da inspeção: sem server.js, timers ou chamadas Meta.
const assert = require('node:assert/strict');
assert.match(process.env.BANCO_NOME || '', /^acorda_inspecao_[a-f0-9]{24}$/);
const fetchOriginal=global.fetch;
global.fetch=(url,...args)=>{
  assert.match(String(url),/^http:\/\/127\.0\.0\.1:/);
  return fetchOriginal(url,...args);
};
async function executar(){
  let input='';for await(const chunk of process.stdin)input+=chunk;
  const credenciais=JSON.parse(input);
  const banco=require('../../config/banco');
  const server=require('../../app').listen(0,'127.0.0.1');
  try{
    await new Promise(resolve=>server.once('listening',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    assert.equal((await fetch(base+'/api/saude/pronto')).status,200);
    const login=await fetch(base+'/api/autenticacao/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(credenciais)});
    assert.equal(login.status,200);
    const {token}=await login.json();
    for(const rota of ['/api/admin/contatos','/api/admin/backups'])assert.equal((await fetch(base+rota,{headers:{Authorization:'Bearer '+token}})).status,200);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await banco.end();}
}
executar().catch(()=>{process.exitCode=1;});
