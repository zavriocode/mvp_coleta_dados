// Preload exclusivo dos testes: nenhuma requisição HTTP externa é permitida.
const original=global.fetch;
global.fetch=(entrada,...args)=>{
  const u=new URL(typeof entrada==='string'||entrada instanceof URL?entrada:entrada.url);
  if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname)) throw new Error('QA: rede externa bloqueada.');
  return original(entrada,...args);
};
for(const protocolo of ['http','https']){
  const mod=require(protocolo);
  for(const metodo of ['request','get']){
    const orig=mod[metodo];
    mod[metodo]=function(entrada,...args){
      const host=typeof entrada==='string'||entrada instanceof URL?new URL(entrada).hostname:entrada.hostname||entrada.host||'localhost';
      if(!['127.0.0.1','localhost','::1','[::1]'].includes(host))throw new Error('QA: rede externa bloqueada.');
      return orig.call(this,entrada,...args);
    };
  }
}
