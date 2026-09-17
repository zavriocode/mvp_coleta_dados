const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const http=require('node:http');
const {Readable}=require('node:stream');
const {pipeline}=require('node:stream/promises');
process.env.BACKUP_ASSINATURA_CHAVE=crypto.randomBytes(32).toString('hex');
const pacote=require('../src/modules/backups/pacoteBackup');
const m=require('../src/modules/backups/manifestoBackup');
async function main(){
  const dir=await fs.promises.mkdtemp(path.join(os.tmpdir(),'acorda-pacote-qa-'));let server,n=0;
  const ok=(v)=>{assert.ok(v);n++;};
  try{
    const raw=path.join(dir,'raw.dump'),hash=crypto.createHash('sha256');
    async function* dados(){const h=Buffer.from('PGDMP');hash.update(h);yield h;for(let i=0;i<512;i++){const c=crypto.randomBytes(65536);hash.update(c);yield c;}}
    await pipeline(Readable.from(dados()),fs.createWriteStream(raw));
    const tamanho=(await fs.promises.stat(raw)).size;
    const manifest=m.assinar({formato:'acorda-custom-v1',schemaControleExcluido:'recuperacao',sha256:hash.digest('hex').toUpperCase(),tamanhoBytes:tamanho,migrations:[],backupId:'1',criadoEm:new Date().toISOString()});
    server=http.createServer((req,res)=>pacote.enviar(res,raw,manifest,'backup.dump').catch(e=>{res.destroy(e);}));await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const resp=await fetch('http://127.0.0.1:'+server.address().port),arquivo=path.join(dir,'arquivo.acorda');
    ok(resp.status===200);ok(resp.headers.get('content-disposition').includes('backup.acorda'));
    await pipeline(Readable.fromWeb(resp.body),fs.createWriteStream(arquivo));
    const h=crypto.createHash('sha256');for await(const c of fs.createReadStream(arquivo))h.update(c);
    ok(h.digest('hex').toUpperCase()===resp.headers.get('x-backup-sha256'));
    const copia=path.join(dir,'copia.acorda');await fs.promises.copyFile(arquivo,copia);
    assert.deepEqual(await pacote.abrir({path:copia}),manifest);n++;
    ok((await fs.promises.stat(copia)).size===tamanho);
    const rawHash=crypto.createHash('sha256');for await(const c of fs.createReadStream(copia))rawHash.update(c);ok(rawHash.digest('hex').toUpperCase()===manifest.dados.sha256);
    // Corrupção de assinatura, dump, truncamento, conteúdo adicional e header hostil.
    for(const tipo of ['assinatura','conteudo','truncado','adicional','comprimento','chave']){
      await fs.promises.copyFile(arquivo,copia);const f=await fs.promises.open(copia,'r+');const chave=process.env.BACKUP_ASSINATURA_CHAVE;
      try{
        if(tipo==='assinatura'){const j=Buffer.from(JSON.stringify(manifest));const offset=j.indexOf(Buffer.from(manifest.assinatura));await f.write(Buffer.from(manifest.assinatura[0]==='0'?'1':'0'),0,1,pacote.MAGIC.length+4+offset);}
        if(tipo==='conteudo'){const b=Buffer.alloc(1);await f.read(b,0,1,(await f.stat()).size-1);b[0]^=1;await f.write(b,0,1,(await f.stat()).size-1);}
        if(tipo==='truncado')await f.truncate((await f.stat()).size-1);
        if(tipo==='adicional')await f.write(Buffer.from('x'),0,1,(await f.stat()).size);
        if(tipo==='comprimento')await f.write(Buffer.from([255,255,255,255]),0,4,pacote.MAGIC.length);
        if(tipo==='chave')process.env.BACKUP_ASSINATURA_CHAVE=crypto.randomBytes(32).toString('hex');
      }finally{await f.close();}
      try{await assert.rejects(()=>pacote.abrir({path:copia}));n++;}finally{process.env.BACKUP_ASSINATURA_CHAVE=chave;}
    }
    await assert.rejects(()=>pacote.abrir({path:raw}));n++;
    assert.deepEqual(await pacote.abrir({path:raw},JSON.stringify(manifest)),manifest);n++;
    console.log('Pacote único: '+n+' verificações aprovadas; 32 MiB por streaming, assinatura, hash, corrupções e compatibilidade técnica.');
  }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}assert.ok(path.basename(dir).startsWith('acorda-pacote-qa-'));await fs.promises.rm(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
