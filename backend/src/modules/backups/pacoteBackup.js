// Envelope versionado: cabeçalho + verificação autenticada + dump custom original.
// Não usa ZIP, nomes internos recebidos ou extração de caminhos do cliente.
const fs=require('fs');
const crypto=require('crypto');
const {Readable}=require('stream');
const {pipeline}=require('stream/promises');
const manifesto=require('./manifestoBackup');
const erro=require('../../utils/AppError');
const MAGIC=Buffer.from('ACORDA_BACKUP_1\n');
const MAX_JSON=131072;
function cabecalho(m){
  manifesto.verificar(m);
  const json=Buffer.from(JSON.stringify(m));
  if(json.length>MAX_JSON)throw erro('Verificação do backup excede a capacidade suportada.',413);
  const n=Buffer.alloc(4);n.writeUInt32BE(json.length);
  return Buffer.concat([MAGIC,n,json]);
}
async function* partes(arquivo,m){yield cabecalho(m);yield* fs.createReadStream(arquivo,{highWaterMark:65536});}
function nomeArquivo(nome){return nome.endsWith('.acorda')?nome:nome.replace(/\.dump$/i,'')+'.acorda';}
async function enviar(res,arquivo,m,nome){
  const d=manifesto.verificar(m),stat=await fs.promises.stat(arquivo);
  if(stat.size!==d.tamanhoBytes)throw erro('Backup temporário inválido. Gere um novo backup.',409);
  const hash=crypto.createHash('sha256').update(cabecalho(m)),conteudo=crypto.createHash('sha256');
  for await(const chunk of fs.createReadStream(arquivo,{highWaterMark:65536})){hash.update(chunk);conteudo.update(chunk);}
  if(conteudo.digest('hex').toUpperCase()!==d.sha256)throw erro('Backup temporário alterado. Gere um novo backup.',409);
  res.setHeader('Content-Type','application/octet-stream');
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Content-Disposition','attachment; filename="'+nomeArquivo(nome).replace(/[^a-zA-Z0-9._-]/g,'_')+'"');
  res.setHeader('Content-Length',stat.size+cabecalho(m).length);
  res.setHeader('X-Backup-SHA256',hash.digest('hex').toUpperCase());
  res.setHeader('X-Backup-Conteudo-SHA256',d.sha256);
  await pipeline(Readable.from(partes(arquivo,m)),res);
}
async function abrir(arquivo,legado){
  const fd=await fs.promises.open(arquivo.path,'r+');
  try{
    const h=Buffer.alloc(MAGIC.length+4);const l=await fd.read(h,0,h.length,0);
    if(!h.subarray(0,MAGIC.length).equals(MAGIC)){
      // Compatibilidade técnica com o par antigo, nunca aceite de dump sem assinatura.
      if(h.subarray(0,5).toString()==='PGDMP'&&legado){const m=JSON.parse(legado);manifesto.verificar(m);return m;}
      throw erro('Selecione um backup completo gerado pelo sistema. Backups antigos precisam ser convertidos pelo suporte ou gerados novamente.',400);
    }
    const tamanho=h.readUInt32BE(MAGIC.length);
    if(l.bytesRead!==h.length||tamanho<2||tamanho>MAX_JSON)throw erro('Arquivo de backup inválido ou incompleto.',400);
    const json=Buffer.alloc(tamanho);const j=await fd.read(json,0,tamanho,h.length);
    if(j.bytesRead!==tamanho)throw erro('Arquivo de backup incompleto.',400);
    const m=JSON.parse(json.toString('utf8')),d=manifesto.verificar(m),inicio=h.length+tamanho;
    if((await fd.stat()).size!==inicio+d.tamanhoBytes)throw erro('Arquivo de backup incompleto ou alterado.',400);
    // Deslocamento para a esquerda, em blocos: não duplica o dump em disco/RAM.
    const bloco=Buffer.alloc(65536),hash=crypto.createHash('sha256');let pos=0;
    while(pos<d.tamanhoBytes){
      const {bytesRead}=await fd.read(bloco,0,Math.min(bloco.length,d.tamanhoBytes-pos),inicio+pos);
      if(!bytesRead)throw erro('Arquivo de backup incompleto.',400);
      hash.update(bloco.subarray(0,bytesRead));let escritos=0;
      while(escritos<bytesRead){const r=await fd.write(bloco,escritos,bytesRead-escritos,pos+escritos);if(!r.bytesWritten)throw erro('Não foi possível preparar o backup.',503);escritos+=r.bytesWritten;}
      pos+=bytesRead;
    }
    if(hash.digest('hex').toUpperCase()!==d.sha256)throw erro('Arquivo de backup alterado. A verificação de integridade falhou.',400);
    await fd.truncate(d.tamanhoBytes);arquivo.size=d.tamanhoBytes;
    return m;
  }finally{await fd.close();}
}
module.exports={enviar,abrir,partes,nomeArquivo,MAGIC};
