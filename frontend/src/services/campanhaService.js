import requisitar from './api';

function listarCampanhas(incluirArquivadas){return requisitar('/api/admin/campanhas'+(incluirArquivadas?'?arquivadas=true':''),{method:'GET',autenticado:true});}
function criarCampanha(dados){return requisitar('/api/admin/campanhas',{method:'POST',autenticado:true,body:JSON.stringify(dados)});}
function atualizarCampanha(id,dados){return requisitar('/api/admin/campanhas/'+id,{method:'PUT',autenticado:true,body:JSON.stringify(dados)});}
function alterarStatusCampanha(id,status){return requisitar('/api/admin/campanhas/'+id+'/status',{method:'POST',autenticado:true,body:JSON.stringify({status})});}
function excluirCampanha(id){return requisitar('/api/admin/campanhas/'+id,{method:'DELETE',autenticado:true});}
function visualizarPublicoCampanha(id,quantidade){return requisitar('/api/admin/campanhas/'+id+'/publico?quantidade='+encodeURIComponent(quantidade||250),{method:'GET',autenticado:true});}
function visualizarPreviaFiltros(filtros){return requisitar('/api/admin/campanhas/publico/previa',{method:'POST',autenticado:true,body:JSON.stringify({filtros,quantidade:20})});}
function listarLotesCampanha(id){return requisitar('/api/admin/campanhas/'+id+'/lotes',{method:'GET',autenticado:true});}
function listarContatosLote(id,loteId){return requisitar('/api/admin/campanhas/'+id+'/lotes/'+loteId+'/contatos',{method:'GET',autenticado:true});}
function listarFalhasCampanha(id){return requisitar('/api/admin/campanhas/'+id+'/falhas',{method:'GET',autenticado:true});}
function reprocessarTentativa(id){return requisitar('/api/admin/mensageria/tentativas/'+id+'/reprocessar',{method:'POST',autenticado:true});}
function enviarTentativa(id){return requisitar('/api/admin/mensageria/tentativas/'+id+'/enviar',{method:'POST',autenticado:true});}
function prepararEnvioCampanha(id,quantidade,chaveIdempotencia){return requisitar('/api/admin/campanhas/'+id+'/envios',{method:'POST',autenticado:true,body:JSON.stringify({quantidade,chaveIdempotencia})});}
function listarTemplates(){return requisitar('/api/admin/campanhas/templates',{method:'GET',autenticado:true});}
function criarTemplate(dados){return requisitar('/api/admin/campanhas/templates',{method:'POST',autenticado:true,body:JSON.stringify(dados)});}
function prepararImagemTemplate(arquivo){const formulario=new FormData();formulario.append('imagem',arquivo);return requisitar('/api/admin/campanhas/templates/imagem-exemplo',{method:'POST',autenticado:true,body:formulario});}
function prepararImagemEnvioTemplate(arquivo){const formulario=new FormData();formulario.append('imagem',arquivo);return requisitar('/api/admin/campanhas/templates/imagem-envio',{method:'POST',autenticado:true,body:formulario});}
function atualizarTemplate(id,dados){return requisitar('/api/admin/campanhas/templates/'+id,{method:'PUT',autenticado:true,body:JSON.stringify(dados)});}
function excluirTemplate(id){return requisitar('/api/admin/campanhas/templates/'+id,{method:'DELETE',autenticado:true});}
function submeterTemplateMeta(id){return requisitar('/api/admin/campanhas/templates/'+id+'/submeter-meta',{method:'POST',autenticado:true});}
function sincronizarTemplatesMeta(){return requisitar('/api/admin/campanhas/templates/sincronizar-meta',{method:'POST',autenticado:true});}
function configurarEnvioTemplate(id,configuracaoEnvio,removerImagem){return requisitar('/api/admin/campanhas/templates/'+id+'/configuracao-envio',{method:'PUT',autenticado:true,body:JSON.stringify({configuracaoEnvio,removerImagem:removerImagem===true})});}
function obterCapacidade(){return requisitar('/api/admin/campanhas/configuracao/limite',{method:'GET',autenticado:true});}
function atualizarLimite(valor,motivo){return requisitar('/api/admin/campanhas/configuracao/limite',{method:'PUT',autenticado:true,body:JSON.stringify({valor,motivo})});}
function sincronizarLimiteMeta(){return requisitar('/api/admin/campanhas/configuracao/limite/sincronizar-meta',{method:'POST',autenticado:true});}

export {alterarStatusCampanha,atualizarCampanha,atualizarLimite,atualizarTemplate,configurarEnvioTemplate,criarCampanha,criarTemplate,enviarTentativa,excluirCampanha,excluirTemplate,listarCampanhas,listarContatosLote,listarFalhasCampanha,listarLotesCampanha,listarTemplates,obterCapacidade,prepararEnvioCampanha,prepararImagemEnvioTemplate,prepararImagemTemplate,reprocessarTentativa,sincronizarLimiteMeta,sincronizarTemplatesMeta,submeterTemplateMeta,visualizarPreviaFiltros,visualizarPublicoCampanha};
