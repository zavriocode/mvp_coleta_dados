// Sem dotenv, banco ou aplicação: exercita o middleware real em processo isolado.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const {fork}=require('node:child_process');
const {once}=require('node:events');
const MiB=1024*1024;
const pausa=ms=>new Promise(r=>setTimeout(r,ms));
function bytesEmDisco(dir){let n=0;for(const f of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,f.name);try{n+=f.isDirectory()?bytesEmDisco(p):fs.statSync(p).size;}catch(e){if(e.code!=='ENOENT')throw e;}}return n;}
async function servidor(){
  const express=require('express');
  const {receberUpload,removerArquivo}=require('../src/modules/backups/uploadRestore');
  const app=express();let inicial=process.memoryUsage(),rssMax=inicial.rss,heapMax=inicial.heapUsed,discoMax=0;
  const amostrar=()=>{const m=process.memoryUsage();rssMax=Math.max(rssMax,m.rss);heapMax=Math.max(heapMax,m.heapUsed);discoMax=Math.max(discoMax,bytesEmDisco(process.env.TEMP));};
  const timer=setInterval(amostrar,20);
  app.post('/upload',receberUpload,async(req,res,next)=>{try{
    amostrar();assert.ok(req.file);assert.match(req.file.filename,/^[a-f0-9-]+\.dump$/);assert.ok(!req.file.path.includes('travessia'));
    const digest=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(req.file.path))digest.update(chunk);
    const tamanho=fs.statSync(req.file.path).size;await removerArquivo(req.file);
    res.json({tamanho,hash:digest.digest('hex')});
  }catch(e){await removerArquivo(req.file).catch(()=>{});next(e);}});
  app.use((e,req,res,next)=>{res.status(e.statusHttp||400).json({mensagem:e.message});});
  const s=app.listen(0,'127.0.0.1');await once(s,'listening');
  process.send({porta:s.address().port});
  process.on('message',async m=>{if(m==='medir'){
    await pausa(150);amostrar();const final=process.memoryUsage();
    process.send({inicial,rssMax,heapMax,final,discoMax,restante:bytesEmDisco(process.env.TEMP),diretorios:fs.readdirSync(process.env.TEMP).length});
  }else if(m==='fechar'){clearInterval(timer);s.closeAllConnections();s.close(()=>process.exit(0));}});
}
async function enviar(porta,caso){
  const boundary='qa-stream-'+crypto.randomBytes(8).toString('hex');
  const inicio=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="backup"; filename="../../travessia.dump"\r\nContent-Type: application/octet-stream\r\n\r\n`);
  const fim=Buffer.from(`\r\n--${boundary}--\r\n`), bloco=Buffer.alloc(65536,0x61),hash=crypto.createHash('sha256');
  return new Promise((resolve,reject)=>{
    let encerrado=false;
    const req=http.request({hostname:'127.0.0.1',port:porta,path:'/upload',method:'POST',headers:{'Content-Type':'multipart/form-data; boundary='+boundary,...(caso.declarado?{'Content-Length':inicio.length+caso.bytes+fim.length}:{})}},res=>{
      let corpo='';res.on('data',d=>corpo+=d);res.on('end',()=>{encerrado=true;resolve({status:res.statusCode,corpo:JSON.parse(corpo)});});
    });
    req.on('error',e=>{encerrado=true;if(caso.abortar||caso.timeout)resolve({status:'interrompido'});else reject(e);});
    (async()=>{
      req.write(inicio);
      for(let pos=0;pos<caso.bytes&&!encerrado;pos+=bloco.length){
        const chunk=bloco.subarray(0,Math.min(bloco.length,caso.bytes-pos));hash.update(chunk);
        if(!req.write(chunk))await new Promise(resolve=>{
          const fim=()=>{req.off('drain',fim);req.off('close',fim);resolve();};
          req.once('drain',fim);req.once('close',fim);
        });
        if(caso.abortar&&pos>=MiB){req.destroy();return;}
        if(caso.lento)await pausa(caso.lento);
      }
      if(!encerrado){if(caso.truncado)req.end();else req.end(fim);}
    })().catch(e=>{if(!encerrado)reject(e);});
  });
}
async function principal(){
  const casos=[
    {nome:'pequeno',bytes:MiB,status:200},{nome:'medio',bytes:32*MiB,status:200},
    {nome:'grande_acima_do_antigo_limite',bytes:280*MiB,status:200},
    {nome:'proximo_limite',bytes:320*MiB-1,status:200},
    {nome:'limite_exato',bytes:320*MiB,status:200},
    {nome:'acima_limite_chunked',bytes:320*MiB+1,status:413},
    {nome:'acima_limite_declarado',bytes:322*MiB,declarado:true,status:413},
    {nome:'interrompido',bytes:16*MiB,abortar:true},
    {nome:'conexao_lenta',bytes:4*MiB,lento:15,status:200},
    {nome:'timeout',bytes:4*MiB,lento:40,timeout:true},
    {nome:'multipart_truncado',bytes:MiB,truncado:true,status:400},
    {nome:'disco_insuficiente',bytes:MiB,reserva:'9007199254740000',status:413},
    {nome:'memoria_insuficiente',bytes:MiB,memoria:'9007199254740000',status:413},
    {nome:'concorrente',bytes:4*MiB,lento:10,concorrente:true,status:200}
  ];
  const resultados=[];
  for(const caso of casos){
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'acorda-upload-qa-'));
    const child=fork(__filename,['servidor'],{execArgv:['--max-old-space-size=128'],windowsHide:true,env:{...process.env,DATABASE_URL:'',TEMP:dir,TMP:dir,NODE_ENV:'test',RESTORE_UPLOAD_MAX_BYTES:String(320*MiB),RESTORE_UPLOAD_TIMEOUT_MS:caso.timeout?'200':'60000',RESTORE_DISCO_RESERVA_BYTES:caso.reserva||String(16*MiB),RESTORE_MEMORIA_LIVRE_MIN_BYTES:caso.memoria||String(128*MiB)},stdio:['ignore','inherit','inherit','ipc']});
    try{
      const [{porta}]=await once(child,'message');const inicio=Date.now();
      const transferencia=enviar(porta,caso);
      if(caso.concorrente){await pausa(100);assert.equal((await enviar(porta,{bytes:65536})).status,409,'Segundo upload simultâneo deve ser recusado');}
      const r=await transferencia;const duracaoMs=Date.now()-inicio;
      if(caso.status)assert.equal(r.status,caso.status,caso.nome);
      if(caso.timeout)assert.ok([408,'interrompido'].includes(r.status));
      if(caso.status===200){assert.equal(r.corpo.tamanho,caso.bytes);const digest=crypto.createHash('sha256'),bloco=Buffer.alloc(65536,0x61);for(let p=0;p<caso.bytes;p+=bloco.length)digest.update(bloco.subarray(0,Math.min(bloco.length,caso.bytes-p)));assert.equal(r.corpo.hash,digest.digest('hex'));}
      if(caso.status===413)assert.equal(r.corpo.mensagem,require('../src/modules/backups/capacidadeRestore').MENSAGEM_CAPACIDADE);
      if(caso.abortar||caso.timeout||caso.truncado){await pausa(200);assert.equal((await enviar(porta,{bytes:65536})).status,200,'Novo upload permitido após falha');}
      const medicao=once(child,'message');child.send('medir');const [m]=await medicao;
      assert.equal(m.restante,0,'Arquivo temporário restante em '+caso.nome);assert.equal(m.diretorios,0,'Diretório temporário restante em '+caso.nome);
      assert.ok(m.rssMax<200*MiB,'RSS do processo de upload excedeu 200 MiB');
      const resultado={cenario:caso.nome,bytes:caso.bytes,status:r.status,duracaoMs,rssInicial:m.inicial.rss,rssMaximo:m.rssMax,rssFinal:m.final.rss,crescimentoRSS:m.rssMax-m.inicial.rss,heapInicial:m.inicial.heapUsed,heapMaximo:m.heapMax,heapFinal:m.final.heapUsed,discoMaximo:m.discoMax,discoFinal:m.restante};
      resultados.push(resultado);console.log(JSON.stringify(resultado));
    }finally{
      child.send('fechar');await Promise.race([once(child,'exit'),pausa(3000)]);if(child.exitCode===null)child.kill();
      const resolvido=path.resolve(dir);assert.ok(resolvido.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolvido).startsWith('acorda-upload-qa-'));
      fs.rmSync(resolvido,{recursive:true,force:true,maxRetries:5,retryDelay:100});
    }
  }
  console.log('Upload isolado: '+resultados.length+' cenários aprovados; hash/tamanho íntegros; nenhum artefato restante.');
}
(process.argv[2]==='servidor'?servidor():principal()).catch(e=>{console.error(e);process.exitCode=1;});
