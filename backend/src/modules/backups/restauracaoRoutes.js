const express = require('express');
const fs = require('fs');
const { receberUpload, removerArquivo } = require('./uploadRestore');
const service = require('./restauracaoService');
const router = express.Router();
router.use(require('../../middlewares/autorizarAdministrador'));
router.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
const wrap=fn=>async(req,res,next)=>{try{res.json(await fn(req,res));}catch(e){next(e);}};
router.get('/',wrap(()=>service.listar()));
router.get('/:id/revisao/:tabela',wrap(req=>service.revisar(req.params.id,req.params.tabela,req.query.pagina||0)));
router.post('/upload',receberUpload,async(req,res,next)=>{
    try{
      if(!req.file)throw require('../../utils/AppError')('Arquivo de backup obrigatório.',400);
      await fs.promises.chmod(req.file.path,0o600);
      const manifesto=await require('./pacoteBackup').abrir(req.file,req.body.manifesto);
      const resultado=await service.receber(req.file,manifesto,
        {email:req.body.email,senha:req.body.senha},req.usuario,req.ip);
      res.status(201).json(resultado);
    }catch(e){
      if(e instanceof SyntaxError)e=require('../../utils/AppError')('Manifesto JSON inválido.',400);
      if(req.file)await removerArquivo(req.file).catch(()=>{});
      next(e);
    }
});
router.post('/:id/iniciar',async(req,res,next)=>{
  try { res.json(await service.iniciar(req.params.id,req.body,req.usuario)); }
  catch(e) {
    // A requisição original foi autenticada antes da troca de auth_epoch.
    // Devolve apenas o estado seguro; não exige polling com token já invalidado.
    if(e.recuperacao) return res.status(e.statusHttp || 500).json({mensagem:e.recuperacao.erro,recuperacao:e.recuperacao});
    next(e);
  }
});
router.get('/:id/pre-backup',async(req,res,next)=>{
  try{
    const pre=await service.download(req.params.id);
    await require('./pacoteBackup').enviar(res,pre.caminhoArquivo,pre.manifesto,pre.nomeArquivo);
    await service.registrarDownload(req.params.id,req.usuario);
  }catch(e){if(!res.headersSent)next(e);}
});
router.post('/:id/executar',wrap(req=>service.executar(req.params.id,req.body,req.usuario)));
router.post('/:id/cancelar',wrap(req=>service.cancelarAntesRestore(req.params.id,req.body,req.usuario)));
router.post('/:id/reconciliar',wrap(req=>service.reconciliar(req.params.id,req.usuario,false)));
router.post('/:id/templates',wrap(req=>service.reconciliar(req.params.id,req.usuario,true)));
router.post('/:id/liberar',wrap(req=>service.liberar(req.params.id,req.body,req.usuario)));
module.exports=router;
