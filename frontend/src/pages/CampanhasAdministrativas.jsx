import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CabecalhoAdministrativo from '../components/CabecalhoAdministrativo';
import MensagemRetorno from '../components/MensagemRetorno';
import Carregando from '../components/Carregando';
import { obterUsuario, removerToken } from '../utils/armazenamentoToken';
import { resolverImagemPrevia, substituirVariaveisPrevia } from '../utils/previaModeloMensagem';
import { buscarOpcoesFormulario, listarOrigens } from '../services/contatoService';
import { listarEventos } from '../services/eventoService';
import {
  alterarStatusCampanha,
  atualizarLimite,
  atualizarTemplate,
  configurarEnvioTemplate,
  criarCampanha,
  criarTemplate,
  enviarTentativa,
  excluirCampanha,
  excluirTemplate,
  listarCampanhas,
  listarContatosLote,
  listarFalhasCampanha,
  listarLotesCampanha,
  listarTemplates,
  obterCapacidade,
  prepararEnvioCampanha,
  prepararImagemEnvioTemplate,
  prepararImagemTemplate,
  reprocessarTentativa,
  sincronizarLimiteMeta,
  sincronizarTemplatesMeta,
  submeterTemplateMeta,
  visualizarPreviaFiltros,
  visualizarPublicoCampanha
} from '../services/campanhaService';

const CAMPANHA_INICIAL={nome:'',modeloId:'',bairro:'',problema:'',origem:'',eventoId:'',autorizacaoMensagens:'',cadastroIncompleto:false};
const TEMPLATE_INICIAL={nome:'',categoria:'Geral',conteudo:'',ativo:true,metaNome:'',metaIdioma:'pt_BR',metaCategoria:'MARKETING',statusOficial:null,cabecalhoTipo:'nenhum',cabecalhoTexto:'',cabecalhoExemplo:'',cabecalhoOrigem:'nome_contato',cabecalhoValor:'',imagemHandle:'',imagemArquivo:null,imagemModo:'dispositivo',imagemEnvio:'',imagemEnvioArquivo:null,removerImagemEnvio:false,rodape:'',botoes:[],botoesOficiais:[],parametrosCorpo:[]};
function novoBotao(){return {acao:'url',texto:'',url:'',exemplo:'',valorEnvio:'',telefone:''};}

function quantidadeParametros(texto){const numeros=Array.from(String(texto||'').matchAll(/\{\{(\d+)\}\}/g),function(item){return Number(item[1]);});return numeros.length?Math.max.apply(null,numeros):0;}
function marcadoresParametrosComponente(componente){
  if(!componente)return [];
  if(String(componente.parameter_format||'').toUpperCase()==='NAMED'){
    const nomes=Array.from(String(componente.text||'').matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g),function(item){return item[1];});
    return Array.from(new Set(nomes));
  }
  return Array.from({length:quantidadeParametros(componente.text)},function(_,indice){return String(indice+1);});
}

function textoStatus(status){
  const textos={
    rascunho:'Rascunho',pronta:'Pronta para envio',ativa:'Em andamento',pausada:'Pausada',concluida:'Encerrada',cancelada:'Cancelada',
    em_analise:'Enviado para análise',aprovado:'Aprovado pela Meta',rejeitado:'Rejeitado pela Meta',indisponivel:'Indisponível',pendente:'Pendente',enviando:'Enviando',enviada:'Enviada',
    entregue:'Entregue',lida:'Lida',falhou:'Falhou'
  };
  return textos[status]||String(status||'').replaceAll('_',' ');
}
function explicacaoStatusTemplate(status){
  const textos={rascunho:'Ainda não foi enviado para análise.',em_analise:'A Meta ainda está avaliando este modelo.',aprovado:'Pode ser usado em campanhas quando estiver disponível no ACORDA RJ.',rejeitado:'A Meta não aprovou este modelo. Revise as orientações antes de criar outro.',indisponivel:'Este modelo não está disponível na conta oficial conectada.'};
  return textos[status]||'';
}
function textoCategoriaMeta(categoria){
  const categorias={MARKETING:'Marketing',UTILITY:'Utilidade'};
  return categorias[String(categoria||'').toUpperCase()]||categoria||'Categoria não informada';
}
function possuiCabecalhoImagem(item){
  return Array.isArray(item.meta_componentes)&&item.meta_componentes.some(function(componente){
    return componente.type==='HEADER'&&componente.format==='IMAGE';
  });
}
function possuiImagemConfigurada(item){
  const cabecalho=item.meta_configuracao_envio&&item.meta_configuracao_envio.cabecalho;
  return Boolean(cabecalho&&cabecalho.tipo==='imagem'&&['id','link'].includes(cabecalho.origem)&&cabecalho.valor);
}
function telefoneMascarado(valor){return String(valor||'Nao informado').replaceAll('*','•');}
function formatarQuantidade(valor){return Number(valor||0).toLocaleString('pt-BR');}
function formatarDataHoraHistorico(valor){return valor?new Date(valor).toLocaleString('pt-BR'):'Data não informada';}
function rotuloContatos(quantidade){return Number(quantidade)===1?'contato':'contatos';}
function formatarTierMeta(valor){
  if(!valor)return 'Não informado';
  const faixas={TIER_50:'Faixa de 50',TIER_250:'Faixa de 250',TIER_1K:'Faixa de 1.000',TIER_2K:'Faixa de 2.000',TIER_10K:'Faixa de 10.000',TIER_100K:'Faixa de 100.000',TIER_UNLIMITED:'Sem limite definido'};
  if(faixas[valor])return faixas[valor];
  const quantidade=String(valor).replace('TIER_','');
  return /^\d+$/.test(quantidade)?'Faixa de '+Number(quantidade).toLocaleString('pt-BR'):textoStatus(valor);
}
function textoPreviaPublico(previa){
  const aptos=Number(previa.publicoApto||0);
  const exibidos=Array.isArray(previa.contatos)?previa.contatos.length:0;
  if(aptos===0)return 'Nenhum contato pode participar desta campanha com os filtros atuais.';
  if(exibidos>=aptos)return 'Exibindo todos os '+formatarQuantidade(aptos)+' '+rotuloContatos(aptos)+' aptos. Criar a campanha apenas salva esta seleção; nenhuma mensagem será enviada agora.';
  return 'Exibindo '+formatarQuantidade(exibidos)+' de '+formatarQuantidade(aptos)+' '+rotuloContatos(aptos)+' '+(aptos===1?'apto':'aptos')+'. Esta é apenas uma prévia. Ao enviar, o sistema considerará todos os contatos aptos e respeitará a capacidade disponível.';
}

function ListaContatosCampanha({contatos,vazia}){
  if(!contatos||contatos.length===0)return <div className="estado-vazio-campanha"><strong>{vazia||'Nenhum contato disponível.'}</strong></div>;
  return <div className="lista-contatos-campanha">{contatos.map(function(contato,indice){return <article className="contato-previa-campanha" key={contato.nome+'-'+contato.telefoneMascarado+'-'+indice}>
    <div><strong>{contato.nome}</strong><span>{telefoneMascarado(contato.telefoneMascarado)}</span></div>
    <dl><div><dt>Bairro</dt><dd>{contato.bairro}</dd></div><div><dt>Problema</dt><dd>{contato.problema}</dd></div>{contato.status&&!contato.tentativaStatus&&<div><dt>Status</dt><dd>{textoStatus(contato.status)}</dd></div>}{contato.tentativaStatus&&<div><dt>Status da mensagem</dt><dd>{contato.resultadoIndeterminadoEm?'Confirmação pendente — não reenviar':textoStatus(contato.tentativaStatus)} — {formatarDataHoraHistorico(contato.resultadoIndeterminadoEm||contato.tentativaStatusEm)}</dd></div>}{contato.acaoContato==='opt_out'&&<div><dt>Ação do contato</dt><dd>Não deseja mais receber contatos — {formatarDataHoraHistorico(contato.acaoContatoEm)}</dd></div>}</dl>
  </article>;})}</div>;
}

function PreviaModeloMensagem({template}){
  const [imagemLocal,setImagemLocal]=useState({arquivo:null,endereco:''});
  const [imagemInvalida,setImagemInvalida]=useState(false);
  const arquivoImagem=template.imagemEnvioArquivo||template.imagemArquivo;
  useEffect(function(){
    if(template.cabecalhoTipo!=='imagem'||template.imagemModo==='internet'||!arquivoImagem){setImagemLocal({arquivo:null,endereco:''});return undefined;}
    const endereco=URL.createObjectURL(arquivoImagem);
    setImagemLocal({arquivo:arquivoImagem,endereco});
    return function(){URL.revokeObjectURL(endereco);};
  },[arquivoImagem,template.cabecalhoTipo,template.imagemModo]);
  const enderecoLocal=imagemLocal.arquivo===arquivoImagem?imagemLocal.endereco:'';
  const imagemPrevia=resolverImagemPrevia(template,enderecoLocal);
  useEffect(function(){setImagemInvalida(false);},[imagemPrevia.endereco,imagemPrevia.estado]);
  const configuracaoCabecalho=template.cabecalhoOrigem?{origem:template.cabecalhoOrigem,valor:template.cabecalhoValor}:null;
  const textoCabecalho=substituirVariaveisPrevia(template.cabecalhoTexto,[configuracaoCabecalho]);
  const textoCorpo=substituirVariaveisPrevia(template.conteudo,template.parametrosCorpo);
  const botoesPrevia=Array.isArray(template.botoesOficiais)&&template.botoesOficiais.length
    ?template.botoesOficiais
    :(Array.isArray(template.botoes)?template.botoes.map(function(botao,indice){return {indice,texto:botao.texto||(botao.acao==='optout'?'SAIR':'Ação da mensagem')};}):[]);
  return <aside className="previa-modelo-mensagem" aria-labelledby="titulo-previa-modelo">
    <div className="cabecalho-previa-modelo"><div><span>Visualização</span><h4 id="titulo-previa-modelo">Prévia da mensagem</h4></div><small>Prévia ilustrativa</small></div>
    <div className="fundo-previa-whatsapp"><article className="bolha-previa-whatsapp">
      {template.cabecalhoTipo==='imagem'&&(imagemPrevia.estado==='carregar'&&!imagemInvalida?<img src={imagemPrevia.endereco} alt="Imagem selecionada para o cabeçalho" onError={function(){setImagemInvalida(true);}}/>:<div className="imagem-vazia-previa"><span aria-hidden="true">▧</span><strong>{imagemInvalida||imagemPrevia.estado==='invalida'?'Não foi possível carregar esta imagem':imagemPrevia.estado==='configurada'?'Imagem configurada para envio':'Sua imagem aparecerá aqui'}</strong></div>)}
      {template.cabecalhoTipo==='texto'&&<strong className="texto-cabecalho-previa">{textoCabecalho||'Seu cabeçalho aparecerá aqui.'}</strong>}
      <p className="texto-corpo-previa">{textoCorpo||'Seu texto aparecerá aqui.'}</p>
      {template.rodape&&<small className="rodape-previa">{template.rodape}</small>}
      {botoesPrevia.map(function(botao){return <div className="botao-previa" aria-disabled="true" key={'previa-botao-'+botao.indice}>{botao.texto||'Ação da mensagem'}</div>;})}
      <time>12:34</time>
    </article></div>
    <p>Os exemplos são fictícios e nenhum botão executa uma ação nesta prévia.</p>
  </aside>;
}

function CampanhasAdministrativas(){
  const navegacao=useNavigate();
  const usuario=obterUsuario();
  const administrador=usuario&&usuario.perfil==='administrador';
  const [campanhas,setCampanhas]=useState([]);
  const [templates,setTemplates]=useState([]);
  const [capacidade,setCapacidade]=useState(null);
  const [bairros,setBairros]=useState([]);
  const [problemas,setProblemas]=useState([]);
  const [origens,setOrigens]=useState([]);
  const [eventos,setEventos]=useState([]);
  const [formulario,setFormulario]=useState(CAMPANHA_INICIAL);
  const [previaCriacao,setPreviaCriacao]=useState(null);
  const [mostrarCriacao,setMostrarCriacao]=useState(false);
  const [mostrarArquivadas,setMostrarArquivadas]=useState(false);
  const [template,setTemplate]=useState(TEMPLATE_INICIAL);
  const [templateEdicao,setTemplateEdicao]=useState(null);
  const [templateOficialEdicao,setTemplateOficialEdicao]=useState(false);
  const [selecionada,setSelecionada]=useState(null);
  const [publico,setPublico]=useState(null);
  const [atualizandoPublico,setAtualizandoPublico]=useState(false);
  const [lotes,setLotes]=useState([]);
  const [falhas,setFalhas]=useState([]);
  const [tamanho,setTamanho]=useState(250);
  const [loteAberto,setLoteAberto]=useState(null);
  const [contatosLote,setContatosLote]=useState([]);
  const [carregandoLote,setCarregandoLote]=useState(false);
  const [enviandoCampanha,setEnviandoCampanha]=useState(false);
  const [progressoEnvio,setProgressoEnvio]=useState(null);
  const [salvandoCampanha,setSalvandoCampanha]=useState(false);
  const [salvandoTemplate,setSalvandoTemplate]=useState(false);
  const [mensagem,setMensagem]=useState('');
  const [carregando,setCarregando]=useState(true);
  const envioEmAndamento=useRef(false);
  const textoTemplateRef=useRef(null);

  async function carregar(){
    setCarregando(true);
    try{
      const resultados=await Promise.allSettled([listarCampanhas(mostrarArquivadas),listarTemplates(),obterCapacidade(),buscarOpcoesFormulario(),listarEventos(),listarOrigens()]);
      const falhaAutenticacao=resultados.find(function(resultado){return resultado.status==='rejected'&&resultado.reason.statusHttp===401;});
      if(falhaAutenticacao){removerToken();navegacao('/login',{replace:true});return [];}

      let campanhasAtuais=campanhas;
      if(resultados[0].status==='fulfilled'){
        campanhasAtuais=resultados[0].value.campanhas||[];
        setCampanhas(campanhasAtuais);
      }
      if(resultados[1].status==='fulfilled')setTemplates(resultados[1].value.templates||[]);
      if(resultados[2].status==='fulfilled')setCapacidade(resultados[2].value.capacidade);
      if(resultados[3].status==='fulfilled'){
        setBairros(resultados[3].value.bairros||[]);
        setProblemas(resultados[3].value.categoriasProblema||[]);
      }
      if(resultados[4].status==='fulfilled')setEventos(resultados[4].value.eventos||[]);
      if(resultados[5].status==='fulfilled')setOrigens(resultados[5].value.origens||[]);

      const falhaCampanhas=resultados[0].status==='rejected';
      const falhaTemplates=resultados[1].status==='rejected';
      const falhaAuxiliar=resultados.slice(2).some(function(resultado){return resultado.status==='rejected';});
      if(falhaCampanhas)setMensagem('Não foi possível carregar as campanhas. Atualize a página para tentar novamente.');
      else if(falhaTemplates)setMensagem('Não foi possível carregar os templates. Atualize a página antes de criar uma campanha.');
      else if(falhaAuxiliar)setMensagem('Algumas opções auxiliares não puderam ser carregadas. Atualize a página para tentar novamente.');
      return campanhasAtuais;
    }catch(erro){
      if(erro.statusHttp===401){removerToken();navegacao('/login',{replace:true});}
      else setMensagem(erro.message);
      return [];
    }finally{setCarregando(false);}
  }

  useEffect(function(){carregar();},[mostrarArquivadas]);
  useEffect(function(){
    if(!selecionada||selecionada.arquivada_em||!['rascunho','pronta','ativa'].includes(selecionada.status))return undefined;
    const quantidade=Number(tamanho);
    if(!Number.isInteger(quantidade)||quantidade<1||quantidade>10000)return undefined;
    let ativo=true;
    const temporizador=window.setTimeout(function(){
      visualizarPublicoCampanha(selecionada.id,quantidade).then(function(resposta){if(ativo)setPublico(resposta.publico);}).catch(function(erro){if(ativo)setMensagem(erro.message);});
    },350);
    return function(){ativo=false;window.clearTimeout(temporizador);};
  },[tamanho,selecionada]);

  function sair(){removerToken();navegacao('/login',{replace:true});}
  function montarFiltros(){
    const filtros={};
    if(formulario.bairro)filtros.bairro=formulario.bairro;
    if(formulario.problema)filtros.problema=formulario.problema;
    if(formulario.origem)filtros.origem=formulario.origem;
    if(formulario.eventoId)filtros.eventoId=formulario.eventoId;
    if(formulario.autorizacaoMensagens)filtros.autorizacaoMensagens=formulario.autorizacaoMensagens;
    if(formulario.cadastroIncompleto)filtros.cadastroIncompleto='true';
    return filtros;
  }
  function alterar(evento){
    const alvo=evento.target;
    setFormulario(Object.assign({},formulario,{[alvo.name]:alvo.type==='checkbox'?alvo.checked:alvo.value}));
    setPreviaCriacao(null);
  }
  function limparFiltrosCriacao(){
    setFormulario(Object.assign({},formulario,{bairro:'',problema:'',origem:'',eventoId:'',autorizacaoMensagens:'',cadastroIncompleto:false}));
    setPreviaCriacao(null);
    setMensagem('Filtros removidos. A próxima prévia considerará todos os contatos aptos.');
  }

  async function verPreviaCriacao(){
    try{
      const resposta=await visualizarPreviaFiltros(montarFiltros());
      setPreviaCriacao(resposta.publico);
      setMensagem('Prévia atualizada. Revise o público antes de criar a campanha.');
    }catch(erro){setMensagem(erro.message);}
  }

  async function salvarCampanha(evento){
    evento.preventDefault();
    if(salvandoCampanha)return;
    if(!previaCriacao){setMensagem('Veja a prévia do público antes de criar a campanha.');return;}
    setSalvandoCampanha(true);
    try{
      const resposta=await criarCampanha({
        nome:formulario.nome,
        finalidade:'Campanha criada pelo painel administrativo.',
        modeloId:formulario.modeloId,
        filtros:montarFiltros()
      });
      setMensagem(resposta.mensagem);
      setCampanhas(function(atuais){return [resposta.campanha].concat(atuais.filter(function(item){return item.id!==resposta.campanha.id;}));});
      setFormulario(CAMPANHA_INICIAL);
      setPreviaCriacao(null);
      setMostrarCriacao(false);
      await abrirCampanha(resposta.campanha,250);
    }catch(erro){setMensagem(erro.message);}finally{setSalvandoCampanha(false);}
  }

  async function salvarTemplate(evento){
    evento.preventDefault();
    if(salvandoTemplate)return;
    if(templateOficialEdicao&&template.statusOficial!=='APPROVED'){setMensagem('Este modelo ainda não está aprovado. Aguarde a decisão oficial da Meta antes de configurar o envio.');return;}
    setSalvandoTemplate(true);
    try{
      const componentes=[];
      const configuracaoEnvio={corpo:[],botoes:[]};
      let imagemHandle=template.imagemHandle;
      if(template.cabecalhoTipo==='imagem'&&!templateOficialEdicao&&template.imagemArquivo){
        setMensagem('Preparando a imagem de exemplo na Meta...');
        const respostaImagem=await prepararImagemTemplate(template.imagemArquivo);
        imagemHandle=respostaImagem.imagem.handle;
      }
      if(template.cabecalhoTipo==='texto'){
        componentes.push({type:'HEADER',format:'TEXT',text:template.cabecalhoTexto,exemplos:template.cabecalhoExemplo?[template.cabecalhoExemplo]:[]});
        if(quantidadeParametros(template.cabecalhoTexto))configuracaoEnvio.cabecalho={tipo:'texto',parametros:[{origem:template.cabecalhoOrigem,valor:template.cabecalhoOrigem==='fixo'?template.cabecalhoValor:undefined}]};
      }
      if(template.cabecalhoTipo==='imagem'){
        if(!templateOficialEdicao){
          if(!imagemHandle)throw new Error('Selecione a imagem de exemplo usada na analise da Meta.');
          componentes.push({type:'HEADER',format:'IMAGE',handleExemplo:imagemHandle});
        }
        let imagemEnvio=template.imagemEnvio;
        if(template.imagemModo==='dispositivo'&&template.imagemEnvioArquivo){
          setMensagem('Preparando a imagem que será usada nas mensagens...');
          const respostaImagemEnvio=await prepararImagemEnvioTemplate(template.imagemEnvioArquivo);
          imagemEnvio=respostaImagemEnvio.imagem.id;
        }
        if(!imagemEnvio&&!template.removerImagemEnvio)throw new Error(template.imagemModo==='dispositivo'?'Escolha a imagem que será usada nas mensagens.':'Informe a URL pública da imagem usada nas mensagens.');
        if(imagemEnvio)configuracaoEnvio.cabecalho={tipo:'imagem',origem:template.imagemModo==='dispositivo'?'id':'link',valor:imagemEnvio};
      }
      componentes.push({type:'BODY',text:template.conteudo,exemplos:template.parametrosCorpo.map(function(item){return item.exemplo;})});
      configuracaoEnvio.corpo=template.parametrosCorpo.map(function(item){return {origem:item.origem,valor:item.origem==='fixo'?item.valor:undefined};});
      if(template.rodape)componentes.push({type:'FOOTER',text:template.rodape});
      if(templateOficialEdicao){
        configuracaoEnvio.botoes=template.botoesOficiais.reduce(function(lista,botao){
          if(botao.tipo==='QUICK_REPLY'&&botao.optOut)lista.push({indice:botao.indice,subtipo:'quick_reply',origem:'opt_out'});
          else if(botao.configuracao&&botao.configuracao.origem)lista.push(Object.assign({},botao.configuracao,{indice:botao.indice}));
          return lista;
        },[]);
      }else if(template.botoes.length){
        componentes.push({type:'BUTTONS',buttons:template.botoes.map(function(botao,indice){
          if(botao.acao==='optout'){
            configuracaoEnvio.botoes.push({indice,subtipo:'quick_reply',origem:'opt_out'});
            return {type:'QUICK_REPLY',text:botao.texto||'SAIR'};
          }
          if(botao.acao==='telefone')return {type:'PHONE_NUMBER',text:botao.texto,phone_number:botao.telefone};
          if(String(botao.url||'').includes('{{1}}'))configuracaoEnvio.botoes.push({indice,subtipo:'url',origem:'fixo',valor:botao.valorEnvio});
          return {type:'URL',text:botao.texto,url:botao.url,exemplo:botao.exemplo};
        })});
      }
      const dados=Object.assign({},template,{componentes,configuracaoEnvio});
      const resposta=templateOficialEdicao?await configurarEnvioTemplate(templateEdicao,configuracaoEnvio,template.removerImagemEnvio):(templateEdicao?await atualizarTemplate(templateEdicao,dados):await criarTemplate(dados));
      setMensagem(resposta.mensagem);
      setTemplate(TEMPLATE_INICIAL);
      setTemplateEdicao(null);
      setTemplateOficialEdicao(false);
      await carregar();
    }catch(erro){setMensagem(templateOficialEdicao?'Não foi possível salvar as informações de envio. '+erro.message:erro.message);}finally{setSalvandoTemplate(false);}
  }
  function editarTemplate(item){
    const componentes=item.meta_componentes||[];
    const cabecalho=componentes.find(function(componente){return componente.type==='HEADER';});
    const rodape=componentes.find(function(componente){return componente.type==='FOOTER';});
    const botoes=componentes.find(function(componente){return componente.type==='BUTTONS';});
    const envio=item.meta_configuracao_envio||{};
    setTemplateEdicao(item.id);
    setTemplateOficialEdicao(Boolean(item.meta_template_id));
    const body=componentes.find(function(componente){return componente.type==='BODY';});
    const exemplos=body&&body.example&&body.example.body_text&&body.example.body_text[0]||[];
    const exemplosNomeados=body&&body.example&&Array.isArray(body.example.body_text_named_params)?body.example.body_text_named_params:[];
    const marcadores=marcadoresParametrosComponente(body);
    const parametros=marcadores.map(function(marcador,indice){
      const parametro=(envio.corpo||[])[indice]||{};
      const exemploNomeado=exemplosNomeados.find(function(exemplo){return exemplo&&exemplo.param_name===marcador;});
      return {marcador,origem:parametro.origem||'',valor:parametro.valor||'',exemplo:exemplos[indice]||(exemploNomeado&&exemploNomeado.example)||''};
    });
    const botoesOficiais=botoes&&Array.isArray(botoes.buttons)?botoes.buttons.map(function(botao,indice){
      const configuracao=(envio.botoes||[]).find(function(item){return item.indice===indice;})||{};
      return {indice,tipo:String(botao.type||'').toUpperCase(),texto:botao.text||'',url:botao.url||'',telefone:botao.phone_number||'',optOut:configuracao.origem==='opt_out',configuracao};
    }):[];
    const botoesRascunho=botoesOficiais.map(function(botao){
      return {acao:botao.tipo==='QUICK_REPLY'?'optout':(botao.tipo==='PHONE_NUMBER'?'telefone':'url'),texto:botao.texto,url:botao.url||'',exemplo:'',valorEnvio:botao.configuracao&&botao.configuracao.valor||'',telefone:botao.telefone||''};
    });
    const configuracaoCabecalho=envio.cabecalho&&Array.isArray(envio.cabecalho.parametros)&&envio.cabecalho.parametros[0]||{};
    setTemplate({nome:item.nome,categoria:item.categoria,conteudo:item.texto,ativo:item.ativo,metaNome:item.meta_nome||'',metaIdioma:item.meta_idioma||'pt_BR',metaCategoria:item.meta_categoria||'MARKETING',statusOficial:item.meta_status_oficial||null,cabecalhoTipo:cabecalho?(cabecalho.format==='IMAGE'?'imagem':'texto'):'nenhum',cabecalhoTexto:cabecalho&&cabecalho.text||'',cabecalhoExemplo:cabecalho&&cabecalho.example&&cabecalho.example.header_text&&cabecalho.example.header_text[0]||'',cabecalhoOrigem:configuracaoCabecalho.origem||'nome_contato',cabecalhoValor:configuracaoCabecalho.valor||'',imagemHandle:cabecalho&&cabecalho.example&&cabecalho.example.header_handle&&cabecalho.example.header_handle[0]||'',imagemArquivo:null,imagemModo:envio.cabecalho&&envio.cabecalho.origem==='link'?'internet':'dispositivo',imagemEnvio:envio.cabecalho&&envio.cabecalho.valor||'',imagemEnvioArquivo:null,removerImagemEnvio:false,rodape:rodape&&rodape.text||'',botoes:botoesRascunho,botoesOficiais,parametrosCorpo:parametros});
  }
  function alterarAcaoBotaoOficial(indice,optOut){setTemplate(Object.assign({},template,{botoesOficiais:template.botoesOficiais.map(function(botao){return botao.indice===indice?Object.assign({},botao,{optOut}):botao;})}));}
  function alterarTextoTemplate(evento){const conteudo=evento.target.value;const quantidade=quantidadeParametros(conteudo);const parametros=Array.from({length:quantidade},function(_,indice){return template.parametrosCorpo[indice]||{marcador:String(indice+1),origem:indice===0?'nome_contato':'fixo',valor:'',exemplo:''};});setTemplate(Object.assign({},template,{conteudo,parametrosCorpo:parametros}));}
  function alterarParametroCorpo(indice,campo,valor){setTemplate(Object.assign({},template,{parametrosCorpo:template.parametrosCorpo.map(function(item,posicao){return posicao===indice?Object.assign({},item,{[campo]:valor}):item;})}));}
  function inserirInformacaoPersonalizada(origem){
    const campo=textoTemplateRef.current;
    const inicio=campo&&Number.isInteger(campo.selectionStart)?campo.selectionStart:template.conteudo.length;
    const fim=campo&&Number.isInteger(campo.selectionEnd)?campo.selectionEnd:inicio;
    const numero=quantidadeParametros(template.conteudo)+1;
    const marcador='{{'+numero+'}}';
    const exemplos={nome_contato:'João',bairro:'Copacabana',problema:'Saneamento básico',fixo:''};
    const conteudo=template.conteudo.slice(0,inicio)+marcador+template.conteudo.slice(fim);
    const parametros=template.parametrosCorpo.concat([{marcador:String(numero),origem,valor:'',exemplo:exemplos[origem]||''}]);
    setTemplate(Object.assign({},template,{conteudo,parametrosCorpo:parametros}));
    window.requestAnimationFrame(function(){if(textoTemplateRef.current){const posicao=inicio+marcador.length;textoTemplateRef.current.focus();textoTemplateRef.current.setSelectionRange(posicao,posicao);}});
  }
  function adicionarBotao(){if(template.botoes.length<3)setTemplate(Object.assign({},template,{botoes:template.botoes.concat([novoBotao()])}));}
  function alterarBotao(indice,campo,valor){setTemplate(Object.assign({},template,{botoes:template.botoes.map(function(item,posicao){return posicao===indice?Object.assign({},item,{[campo]:valor}):item;})}));}
  function removerBotao(indice){setTemplate(Object.assign({},template,{botoes:template.botoes.filter(function(_,posicao){return posicao!==indice;})}));}
  function moverBotao(indice,direcao){const destino=indice+direcao;if(destino<0||destino>=template.botoes.length)return;const botoes=template.botoes.slice();const atual=botoes[indice];botoes[indice]=botoes[destino];botoes[destino]=atual;setTemplate(Object.assign({},template,{botoes}));}
  async function sincronizarTemplates(){try{const resposta=await sincronizarTemplatesMeta();setMensagem(resposta.mensagem+' '+resposta.resumo.total+' template(s) recebido(s).');await carregar();}catch(erro){setMensagem(erro.message);}}
  async function submeterTemplate(item){if(!window.confirm('Enviar este template para análise da Meta? Isso não envia mensagens aos contatos.'))return;try{const resposta=await submeterTemplateMeta(item.id);setMensagem(resposta.mensagem);await carregar();}catch(erro){setMensagem(erro.message);}}
  async function removerTemplate(item){
    if(!window.confirm('Tem certeza que deseja excluir este modelo?\nEssa ação não poderá ser desfeita.'))return;
    try{
      const resposta=await excluirTemplate(item.id);
      if(templateEdicao===item.id){setTemplateEdicao(null);setTemplateOficialEdicao(false);setTemplate(TEMPLATE_INICIAL);}
      setMensagem(resposta.mensagem);
      await carregar();
    }catch(erro){setMensagem(erro.message);}
  }

  async function abrirCampanha(item){
    try{
      if(item.arquivada_em){
        const historico=await Promise.all([listarLotesCampanha(item.id),listarFalhasCampanha(item.id)]);
        setSelecionada(item);setPublico(null);setLotes(historico[0].lotes||[]);setFalhas(historico[1].falhas||[]);setLoteAberto(null);
        window.scrollTo({top:0,behavior:'smooth'});return;
      }
      const respostas=await Promise.all([
        visualizarPublicoCampanha(item.id,10000),
        listarLotesCampanha(item.id),
        listarFalhasCampanha(item.id)
      ]);
      setSelecionada(item);
      setPublico(respostas[0].publico);
      setLotes(respostas[1].lotes||[]);
      setFalhas(respostas[2].falhas||[]);
      setTamanho(Number(respostas[0].publico.podeEnviarAgora||0));
      setLoteAberto(null);
      window.scrollTo({top:0,behavior:'smooth'});
    }catch(erro){setMensagem(erro.message);}
  }

  async function atualizarPublicoAtual(){
    if(!selecionada||atualizandoPublico)return;
    setAtualizandoPublico(true);
    try{
      const resposta=await visualizarPublicoCampanha(selecionada.id,1000);
      setPublico(resposta.publico);
      setTamanho(Number(resposta.publico.podeEnviarAgora||0));
      setMensagem('Público atual recalculado com os filtros salvos da campanha.');
    }catch(erro){setMensagem(erro.message);}
    finally{setAtualizandoPublico(false);}
  }

  async function abrirLote(lote){
    setLoteAberto(lote);
    setContatosLote([]);
    setCarregandoLote(true);
    try{const resposta=await listarContatosLote(selecionada.id,lote.id);setContatosLote(resposta.contatos||[]);}
    catch(erro){setMensagem(erro.message);setLoteAberto(null);}
    finally{setCarregandoLote(false);}
  }

  async function reprocessar(item){
    if(!window.confirm('Tentar enviar novamente a mensagem que falhou? O envio anterior continuará registrado no histórico.'))return;
    try{const resposta=await reprocessarTentativa(item.id);setMensagem(resposta.mensagem);await abrirCampanha(selecionada);}
    catch(erro){setMensagem(erro.message);}
  }

  async function mudarStatus(status){
    if(status==='concluida'&&!window.confirm('Encerrar esta campanha? Depois disso, nenhum novo envio poderá ser iniciado.'))return;
    if(status==='cancelada'&&!window.confirm('Cancelar esta campanha? Depois disso, nenhum novo envio poderá ser iniciado.'))return;
    try{
      const resposta=await alterarStatusCampanha(selecionada.id,status);
      setMensagem(resposta.mensagem);
      const atualizadas=await carregar();
      const item=atualizadas.find(function(campanha){return campanha.id===selecionada.id;})||resposta.campanha;
      await abrirCampanha(item);
    }catch(erro){setMensagem(erro.message);}
  }

  async function removerCampanha(item){
    const possuiHistorico=Number(item.quantidade_lotes||0)>0||Number(item.reservado||0)>0||Number(item.enviado||0)>0||Number(item.entregue||0)>0||Number(item.lido||0)>0||Number(item.falhou||0)>0;
    const pergunta=possuiHistorico?'Esta campanha já possui envios. A campanha e todo o histórico operacional ligado a ela serão apagados permanentemente. Deseja continuar?':'Deseja excluir esta campanha permanentemente?';
    if(!window.confirm(pergunta))return;
    try{
      const resposta=await excluirCampanha(item.id);
      setMensagem(resposta.mensagem);
      if(selecionada&&selecionada.id===item.id){setSelecionada(null);setPublico(null);setLotes([]);setFalhas([]);}
      await carregar();
    }catch(erro){setMensagem(erro.message);}
  }

  async function processarTentativas(tentativas){
    let enviados=0;
    let falhas=0;
    const concorrencia=4;
    for(let inicio=0;inicio<tentativas.length;inicio+=concorrencia){
      const grupo=tentativas.slice(inicio,inicio+concorrencia);
      const resultados=await Promise.allSettled(grupo.map(function(tentativaId){return enviarTentativa(tentativaId);}));
      resultados.forEach(function(resultado){if(resultado.status==='fulfilled')enviados+=1;else falhas+=1;});
      setProgressoEnvio({concluidos:Math.min(inicio+grupo.length,tentativas.length),total:tentativas.length,enviados,falhas});
    }
    return {enviados,falhas};
  }

  async function enviarAgora(){
    if(envioEmAndamento.current||!selecionada||!publico)return;
    const quantidade=Number(tamanho);
    const maximo=Number(publico.podeEnviarAgora||0);
    if(!Number.isInteger(quantidade)||quantidade<1||quantidade>maximo){setMensagem('Informe uma quantidade entre 1 e '+formatarQuantidade(maximo)+'.');return;}
    if(!window.confirm('Você está prestes a enviar esta mensagem para '+formatarQuantidade(quantidade)+' '+rotuloContatos(quantidade)+'. Deseja confirmar o envio?'))return;
    envioEmAndamento.current=true;
    setEnviandoCampanha(true);
    setProgressoEnvio({concluidos:0,total:quantidade,enviados:0,falhas:0});
    const nomeChave='acorda-rj-envio-campanha-'+selecionada.id;
    let chave=sessionStorage.getItem(nomeChave);
    if(!chave){chave=crypto.randomUUID();sessionStorage.setItem(nomeChave,chave);}
    try{
      const preparacao=await prepararEnvioCampanha(selecionada.id,quantidade,chave);
      sessionStorage.removeItem(nomeChave);
      const tentativas=preparacao.resultado.tentativas||[];
      if(tentativas.length===0)throw new Error('Nenhuma mensagem ficou pendente para este envio. Atualize a campanha e tente novamente.');
      const resultado=await processarTentativas(tentativas);
      const atualizadas=await carregar();
      const item=atualizadas.find(function(campanha){return campanha.id===selecionada.id;})||selecionada;
      await abrirCampanha(item);
      setMensagem(resultado.falhas===0
        ?formatarQuantidade(resultado.enviados)+' '+rotuloContatos(resultado.enviados)+' processados com sucesso.'
        :formatarQuantidade(resultado.enviados)+' enviados e '+formatarQuantidade(resultado.falhas)+' com falha. As falhas permanecem no histórico e podem ser tentadas novamente.');
    }catch(erro){setMensagem(erro.message);}
    finally{envioEmAndamento.current=false;setEnviandoCampanha(false);setProgressoEnvio(null);}
  }

  async function salvarLimite(){
    if(!capacidade)return;
    const valor=window.prompt('Novo limite de segurança para 24 horas:',String(capacidade.limiteInterno));
    if(!valor)return;
    const motivo=window.prompt('Informe o motivo da alteração:');
    if(!motivo)return;
    try{const resposta=await atualizarLimite(Number(valor),motivo);setCapacidade(resposta.capacidade);setMensagem(resposta.mensagem);}
    catch(erro){setMensagem(erro.message);}
  }

  async function sincronizarMeta(){
    try{
      const resposta=await sincronizarLimiteMeta();
      setCapacidade(resposta.capacidade);
      setMensagem(resposta.mensagem);
    }catch(erro){setMensagem(erro.message);}
  }

  const podeEnviarAgora=publico?Number(publico.podeEnviarAgora||0):0;
  const quantidadeEnvio=Number(tamanho);
  const quantidadeValida=Number.isInteger(quantidadeEnvio)&&quantidadeEnvio>=1&&quantidadeEnvio<=podeEnviarAgora;
  const podeEnviar=Boolean(selecionada&&!selecionada.arquivada_em&&['pronta','ativa'].includes(selecionada.status)&&selecionada.modelo_meta_status_oficial==='APPROVED'&&quantidadeValida&&!enviandoCampanha);
  const restantes=publico?Number(publico.restantes||0):0;
  const enviados=selecionada?Number(selecionada.enviado||0)+Number(selecionada.entregue||0)+Number(selecionada.lido||0):0;
  const aptosPrevia=previaCriacao?Number(previaCriacao.publicoApto||0):0;
  const capacidadeDisponivel=capacidade?Number(capacidade.disponivel||0):null;
  const previaUltrapassaCapacidade=capacidadeDisponivel!==null&&aptosPrevia>capacidadeDisponivel;

  return <main className="pagina-administrativa"><div className="conteudo-administrativo campanhas-pagina">
    <CabecalhoAdministrativo aoSair={sair} titulo="Campanhas" subtitulo="Crie campanhas, confira o público e envie com segurança."/>
    {mensagem&&<MensagemRetorno mensagem={mensagem} tipo="informacao"/>}

    <section className="resumo-capacidade-campanha" aria-labelledby="titulo-capacidade-campanha">
      <div className="cabecalho-capacidade-campanha">
        <div className="capacidade-restante-campanha">
          <span id="titulo-capacidade-campanha">Capacidade restante</span>
          <strong>{capacidade?Number(capacidade.disponivel).toLocaleString('pt-BR'):'—'} <small>disponíveis de {capacidade?Number(capacidade.limite).toLocaleString('pt-BR'):'—'}</small></strong>
        </div>
        <span className="status-sincronizacao-capacidade"><span className="indicador-sincronizacao-capacidade" aria-hidden="true"/>Sincronização automática ativa</span>
      </div>
      <dl className="metricas-capacidade-campanha">
        <div><dt>Limite oficial Meta</dt><dd>{capacidade?(!capacidade.tierMeta?'Não sincronizado':capacidade.limiteMeta===null?'Ilimitado':Number(capacidade.limiteMeta).toLocaleString('pt-BR')):'—'}</dd><small>Concedido pela Meta</small></div>
        <div><dt>Limite de segurança</dt><dd>{capacidade?Number(capacidade.limiteInterno).toLocaleString('pt-BR'):'—'}</dd><small>Definido no sistema</small></div>
        <div><dt>Utilizado nas últimas 24h</dt><dd>{capacidade?Number(capacidade.utilizado).toLocaleString('pt-BR'):'—'}</dd></div>
        <div><dt>Faixa da conta na Meta</dt><dd>{capacidade?formatarTierMeta(capacidade.tierMeta):'—'}</dd></div>
        <div><dt>Última atualização</dt><dd>{capacidade&&capacidade.sincronizadoEm?new Date(capacidade.sincronizadoEm).toLocaleString('pt-BR'):'—'}</dd></div>
      </dl>
      {!capacidade||!capacidade.tierMeta?<p className="aviso-capacidade-campanha">O limite oficial da Meta ainda não está disponível. O sistema continua respeitando o limite de segurança configurado.</p>:<p className="ajuda-capacidade-campanha">O sistema sempre respeita o menor valor entre o limite concedido pela Meta e o limite de segurança.</p>}
      {administrador&&<div className="acoes-capacidade-campanha"><span>“Sincronizar agora” apenas confere o limite oficial; não altera o limite de segurança.</span><button className="botao botao-secundario" type="button" onClick={sincronizarMeta}>Sincronizar agora</button><button className="botao botao-secundario" type="button" onClick={salvarLimite}>Ajustar limite de segurança</button></div>}
    </section>

    <section className="cartao campanhas-listagem">
      <div className="cabecalho-resultados"><div><span className="etiqueta-pagina">1. Escolha</span><h2>Campanhas</h2><p>Abra uma campanha para acompanhar o público, continuar os envios e conferir os resultados.</p>{administrador&&<label className="filtro-campanhas-arquivadas"><input type="checkbox" checked={mostrarArquivadas} onChange={function(evento){setMostrarArquivadas(evento.target.checked);setSelecionada(null);}}/> Mostrar campanhas arquivadas</label>}</div>{administrador&&<button className="botao botao-primario" type="button" onClick={function(){setMostrarCriacao(!mostrarCriacao);setSelecionada(null);}}>{mostrarCriacao?'Fechar criação':'Nova campanha'}</button>}</div>
      {carregando?<Carregando mensagem="Carregando campanhas..."/>:campanhas.length===0?<div className="estado-vazio-campanha"><strong>Nenhuma campanha cadastrada.</strong><span>Crie a primeira campanha para começar.</span></div>:<div className="grade-campanhas">{campanhas.map(function(item){return <article className={'cartao-campanha-resumo '+(selecionada&&selecionada.id===item.id?'ativo':'')+(item.arquivada_em?' arquivado':'')} key={item.id}>
        <div><span className={'status-campanha status-'+item.status}>{item.arquivada_em?'Arquivada':textoStatus(item.status)}</span><h3>{item.nome}</h3><p>Mensagem: {item.modelo_nome||'Não informada'} · Aprovação: {item.modelo_meta_status_oficial==='APPROVED'?'Aprovado pela Meta':textoStatus(item.modelo_meta_status||'rascunho')}</p></div>
        <div className="rodape-cartao-campanha"><span>{formatarQuantidade(Number(item.enviado||0)+Number(item.entregue||0)+Number(item.lido||0))} enviados</span><div><button className="botao botao-secundario" type="button" onClick={function(){abrirCampanha(item);}}>Abrir campanha</button>{administrador&&<button className="botao botao-perigo" type="button" onClick={function(){removerCampanha(item);}}>Excluir campanha</button>}</div></div>
      </article>;})}</div>}
    </section>

    {mostrarCriacao&&administrador&&<section className="cartao campanha-criacao">
      <div className="cabecalho-secao"><div><span className="etiqueta-pagina">2. Configure</span><h2>Nova campanha</h2><p>Informe o nome, escolha a mensagem e defina quais contatos deseja encontrar.</p></div></div>
      <form onSubmit={salvarCampanha}>
        <fieldset className="grade-criacao-campanha">
          <label>Nome da campanha<input className="campo-input" name="nome" value={formulario.nome} onChange={alterar} required/></label>
          <label>Mensagem que será usada<select className="campo-input" name="modeloId" value={formulario.modeloId} onChange={alterar} required><option value="">Selecione uma mensagem</option>{templates.filter(function(item){return item.ativo;}).map(function(item){return <option key={item.id} value={item.id}>{item.nome}</option>;})}</select></label>
          <label>Bairro<select className="campo-input" name="bairro" value={formulario.bairro} onChange={alterar}><option value="">Todos</option><option value="nao_informado">Não informado</option>{bairros.map(function(item){return <option key={item} value={item}>{item}</option>;})}</select></label>
          <label>Problema<select className="campo-input" name="problema" value={formulario.problema} onChange={alterar}><option value="">Todos</option><option value="nao_informado">Não informado</option>{problemas.map(function(item){return <option key={item} value={item}>{item}</option>;})}</select></label>
          <label>Origem<select className="campo-input" name="origem" value={formulario.origem} onChange={alterar}><option value="">Todas</option><option value="nao_informado">Não informado</option>{origens.map(function(item){return <option key={item.id} value={item.nome}>{item.nome}</option>;})}</select></label>
          <label>Evento<select className="campo-input" name="eventoId" value={formulario.eventoId} onChange={alterar}><option value="">Todos</option><option value="sem_evento">Sem evento</option>{eventos.map(function(item){return <option key={item.id} value={item.id}>{item.nome}</option>;})}</select></label>
          <label>Autorização para mensagens<select className="campo-input" name="autorizacaoMensagens" value={formulario.autorizacaoMensagens} onChange={alterar}><option value="">Todas as situações</option><option value="nao_informado">Não informado</option><option value="autorizado">Autorizado</option><option value="recusado">Recusado</option><option value="revogado">Revogado</option></select></label>
          <label className="opcao-cadastro-incompleto"><input type="checkbox" name="cadastroIncompleto" checked={formulario.cadastroIncompleto} onChange={alterar}/> Somente cadastros incompletos</label>
        </fieldset>
        <p className="aviso-combinacao-filtros">Os filtros funcionam juntos: o contato precisa corresponder a todas as opções selecionadas. A prévia não envia mensagens.</p>
        <div className="acoes-fluxo-campanha"><button className="botao botao-secundario" type="button" onClick={limparFiltrosCriacao} disabled={salvandoCampanha}>Limpar filtros</button><button className="botao botao-secundario" type="button" onClick={verPreviaCriacao} disabled={salvandoCampanha}>Ver prévia do público</button>{previaCriacao&&<button className="botao botao-primario" type="submit" disabled={salvandoCampanha}>{salvandoCampanha?'Criando campanha...':'Criar campanha'}</button>}</div>
      </form>
      {previaCriacao&&<div className="bloco-previa-campanha"><div className="metricas-previa-campanha"><article><span>Encontrados</span><strong>{formatarQuantidade(previaCriacao.publicoEncontrado)}</strong><small>Correspondem aos filtros escolhidos.</small></article><article><span>Aptos para a campanha</span><strong>{formatarQuantidade(previaCriacao.publicoApto)}</strong><small>Podem participar desta campanha.</small></article><article><span>Não aptos</span><strong>{formatarQuantidade(previaCriacao.publicoNaoApto)}</strong><small>Foram encontrados, mas estão impedidos.</small></article></div>{Number(previaCriacao.publicoEncontrado)>0&&Number(previaCriacao.publicoApto)===0&&<p className="aviso-estado-campanha">Os filtros encontraram contatos, mas nenhum pode participar desta campanha. Revise os filtros ou as condições desses cadastros.</p>}{previaUltrapassaCapacidade&&<p className="aviso-capacidade-publico"><strong>{formatarQuantidade(aptosPrevia)} contatos estão aptos, mas a capacidade restante permite até {formatarQuantidade(capacidadeDisponivel)} neste momento.</strong><span>A campanha pode ser criada normalmente. O sistema mostrará quanto pode ser enviado em cada momento.</span></p>}<div className="cabecalho-lista-previa"><div><h3>Contatos da prévia</h3><p>Os telefones estão protegidos e mostram somente os últimos dígitos.</p></div><span>{formatarQuantidade(previaCriacao.contatos.length)} exibidos</span></div><ListaContatosCampanha contatos={previaCriacao.contatos} vazia={Number(previaCriacao.publicoEncontrado)===0?'Nenhum contato corresponde aos filtros escolhidos. Revise os filtros e gere uma nova prévia.':'Nenhum contato pode participar desta campanha com os filtros atuais.'}/><p className="aviso-lista-limitada">{textoPreviaPublico(previaCriacao)}</p><p className="ajuda-criar-campanha">Criar a campanha apenas salva o público e as configurações. Nenhuma mensagem será enviada agora.</p></div>}
    </section>}

    {selecionada&&<section className="cartao campanha-detalhes">
      <div className="cabecalho-campanha-aberta"><div><span className="etiqueta-pagina">Campanha aberta</span><h2>{selecionada.nome}</h2><div className="linha-informacoes-campanha"><span className={'status-campanha status-'+selecionada.status}>{selecionada.arquivada_em?'Arquivada':textoStatus(selecionada.status)}</span><span>Mensagem: {selecionada.modelo_nome||'Não informada'}</span><span>Aprovação na Meta: {selecionada.modelo_meta_status_oficial==='APPROVED'?'Aprovado pela Meta':textoStatus(selecionada.modelo_meta_status||'rascunho')}</span></div>{selecionada.arquivada_em?<p className="aviso-estado-campanha">Esta campanha está arquivada. O histórico permanece disponível, mas novos envios e alterações estão bloqueados.</p>:!selecionada.modelo_nome?<p className="aviso-estado-campanha">Esta campanha não possui uma mensagem associada e não pode realizar envios.</p>:selecionada.modelo_meta_status_oficial!=='APPROVED'&&<p className="aviso-estado-campanha">A mensagem ainda não está oficialmente aprovada pela Meta. É possível conferir o público, mas o envio permanece bloqueado.</p>}</div><button className="botao botao-secundario" type="button" onClick={function(){setSelecionada(null);setPublico(null);}}>Voltar às campanhas</button></div>

      <div className="metricas-campanha metricas-envio-campanha"><article><span>Aptos</span><strong>{publico?formatarQuantidade(publico.publicoApto):0}</strong></article><article><span>Enviados</span><strong>{formatarQuantidade(enviados)}</strong></article><article><span>Restantes</span><strong>{formatarQuantidade(restantes)}</strong></article><article className="metrica-envio-disponivel"><span>Pode enviar agora</span><strong>{formatarQuantidade(podeEnviarAgora)}</strong></article></div>

      {!selecionada.arquivada_em&&<section className="painel-publico-atual-campanha"><div className="cabecalho-secao"><div><span className="etiqueta-pagina">Filtros salvos</span><h3>Público atual</h3><p>A consulta considera os contatos e consentimentos existentes neste momento. Ela não cria envio nem reserva contatos.</p></div><button className="botao botao-secundario" type="button" disabled={atualizandoPublico} onClick={atualizarPublicoAtual}>{atualizandoPublico?'Atualizando...':'Atualizar público'}</button></div>{publico&&<><div className="metricas-previa-campanha metricas-publico-atual"><article><span>Encontrados</span><strong>{formatarQuantidade(publico.publicoEncontrado)}</strong><small>Correspondem aos filtros salvos.</small></article><article><span>Já receberam</span><strong>{formatarQuantidade(publico.jaReceberam)}</strong><small>Já foram processados com sucesso nesta campanha.</small></article><article><span>Aptos para próximo envio</span><strong>{formatarQuantidade(publico.aptosProximoEnvio)}</strong><small>Ainda podem entrar em um novo envio.</small></article><article><span>Não aptos</span><strong>{formatarQuantidade(publico.naoAptosProximoEnvio)}</strong><small>Estão bloqueados, sem consentimento ou já vinculados a esta campanha.</small></article></div><ListaContatosCampanha contatos={publico.contatos} vazia="Nenhum contato está apto para o próximo envio."/></>}</section>}

      {!selecionada.arquivada_em&&<div className="acoes-status-campanha">{selecionada.status==='rascunho'&&administrador&&<button className="botao botao-primario" type="button" onClick={function(){mudarStatus('pronta');}}>Disponibilizar para envio</button>}{selecionada.status==='ativa'&&administrador&&<button className="botao botao-secundario" type="button" onClick={function(){mudarStatus('pausada');}}>Pausar envios</button>}{selecionada.status==='pausada'&&administrador&&<button className="botao botao-primario" type="button" onClick={function(){mudarStatus('ativa');}}>Retomar envios</button>}{['ativa','pausada'].includes(selecionada.status)&&administrador&&<button className="botao botao-secundario" type="button" onClick={function(){mudarStatus('concluida');}}>Encerrar campanha</button>}{['rascunho','pronta','ativa','pausada'].includes(selecionada.status)&&administrador&&<button className="botao botao-perigo" type="button" onClick={function(){mudarStatus('cancelada');}}>Cancelar campanha</button>}</div>}

      {!selecionada.arquivada_em&&['rascunho','pronta','ativa'].includes(selecionada.status)&&<div className="bloco-envio-campanha">
        <div className="cabecalho-secao"><div><span className="etiqueta-pagina">Próximo envio</span><h3>{enviados>0?'Continuar envio':'Enviar campanha'}</h3><p>O sistema já calculou a maior quantidade segura para este momento.</p></div></div>
        {podeEnviarAgora>0?<div className="controle-envio-campanha"><label>Quantidade<input className="campo-input" type="number" min="1" max={podeEnviarAgora} value={tamanho} disabled={enviandoCampanha} onChange={function(evento){setTamanho(evento.target.value);}}/><small>Você pode enviar de 1 até {formatarQuantidade(podeEnviarAgora)} agora.</small></label><button className="botao botao-primario botao-enviar-campanha" type="button" disabled={!podeEnviar} onClick={enviarAgora}>{enviandoCampanha?'Enviando...':(enviados>0?'Continuar envio':'Enviar agora')}</button></div>:restantes===0?<div className="estado-sem-capacidade-campanha"><strong>Todos os contatos aptos desta campanha já foram processados.</strong><span>Consulte o histórico abaixo para conferir os envios e eventuais falhas.</span></div>:<div className="estado-sem-capacidade-campanha"><strong>Não há capacidade disponível para novos envios neste momento.</strong><span>Os {formatarQuantidade(restantes)} contatos restantes continuam salvos nesta campanha.</span></div>}
        {progressoEnvio&&<div className="progresso-envio-campanha" role="status" aria-live="polite"><strong>Processando {formatarQuantidade(progressoEnvio.concluidos)} de {formatarQuantidade(progressoEnvio.total)}</strong><span>{formatarQuantidade(progressoEnvio.enviados)} enviados · {formatarQuantidade(progressoEnvio.falhas)} falhas</span><progress max={progressoEnvio.total} value={progressoEnvio.concluidos}/></div>}
        {podeEnviarAgora===0&&restantes>0&&<p className="ajuda-continuar-campanha">Você poderá continuar o envio nesta mesma campanha quando houver capacidade disponível.</p>}
      </div>}

      <details className="secao-secundaria-campanha secao-lotes-campanha"><summary>Histórico de envios ({lotes.length})</summary>{lotes.length===0?<div className="estado-vazio-campanha"><strong>Nenhum envio iniciado.</strong></div>:<div className="grade-lotes-campanha">{lotes.map(function(lote){return <article className="cartao-lote-campanha" key={lote.id}><div><span>Envio {lote.ordem}</span><strong>{formatarQuantidade(lote.tamanho_efetivo)} {rotuloContatos(lote.tamanho_efetivo)}</strong></div><dl><div><dt>Status</dt><dd>{textoStatus(lote.status)}</dd></div><div><dt>Iniciado em</dt><dd>{new Date(lote.criado_em).toLocaleString('pt-BR')}</dd></div></dl><button className="botao botao-secundario" type="button" onClick={function(){abrirLote(lote);}}>Ver detalhes do envio</button></article>;})}</div>}</details>

      {falhas.length>0&&<details className="secao-secundaria-campanha"><summary>Mensagens que falharam e podem ser enviadas novamente ({falhas.length})</summary><div className="lista-falhas-campanha">{falhas.map(function(item){return <article key={item.id}><div><strong>{item.contato_nome||'Não informado'}</strong><span>Envio {item.lote_ordem} · Tentativa nº {item.numero_tentativa}</span><small>{item.codigo_erro_externo||'Sem código'} — {item.titulo_erro||'Falha'}</small></div><button className="botao botao-secundario" type="button" onClick={function(){reprocessar(item);}}>Tentar enviar novamente</button></article>;})}</div></details>}
    </section>}

    {administrador&&<details className="cartao secao-secundaria-campanha gerenciar-templates-campanha"><summary>Gerenciar modelos de mensagem</summary><div className="conteudo-templates-campanha">
      <div className="cabecalho-gerenciamento-templates"><div><h3>Modelos de mensagem</h3><p>Crie a mensagem que será avaliada pela Meta ou atualize a lista com os modelos da conta oficial.</p><Link className="link-ajuda-contextual" to="/admin/ajuda#templates">Precisa de ajuda? Veja o passo a passo</Link></div><button className="botao botao-secundario" type="button" onClick={sincronizarTemplates}>Atualizar modelos da Meta</button></div>
      <div className="editor-template-campanha"><form onSubmit={salvarTemplate}>{!templateOficialEdicao&&<fieldset className="grade-criacao-campanha grade-template-mensagem">
        <h4 className="titulo-secao-template">1. Identificação</h4>
        <label className="campo-nome-modelo">Nome do modelo<input className="campo-input" value={template.nome} disabled={templateOficialEdicao} onChange={function(evento){setTemplate(Object.assign({},template,{nome:evento.target.value}));}} required/><small>Nome usado pela equipe para localizar esta mensagem.</small></label>
        <label className="campo-nome-meta">Nome usado na Meta<input className="campo-input" value={template.metaNome} disabled={templateOficialEdicao} onChange={function(evento){setTemplate(Object.assign({},template,{metaNome:evento.target.value.toLowerCase().replace(/\s+/g,'_')}));}} placeholder="exemplo_campanha" required/><small>É gerado em letras minúsculas e sem espaços, conforme a regra da Meta.</small></label>
        <label className="campo-idioma-modelo">Idioma<select className="campo-input" value={template.metaIdioma} disabled={templateOficialEdicao} onChange={function(evento){setTemplate(Object.assign({},template,{metaIdioma:evento.target.value}));}}><option value="pt_BR">Português (Brasil)</option><option value="en_US">Inglês (EUA)</option></select></label>
        <label className="campo-categoria-modelo">Categoria na Meta<select className="campo-input" value={template.metaCategoria} disabled={templateOficialEdicao} onChange={function(evento){setTemplate(Object.assign({},template,{metaCategoria:evento.target.value}));}}><option value="MARKETING">Marketing</option><option value="UTILITY">Utilidade</option></select><small>{template.metaCategoria==='UTILITY'?'Mensagens relacionadas a uma ação, serviço ou informação esperada pelo usuário.':'Mensagens de divulgação, convites, campanhas e comunicação promocional.'}</small></label>
        <label className="campo-cabecalho-modelo">Cabeçalho<select className="campo-input" value={template.cabecalhoTipo} disabled={templateOficialEdicao} onChange={function(evento){setTemplate(Object.assign({},template,{cabecalhoTipo:evento.target.value}));}}><option value="nenhum">Sem cabeçalho</option><option value="texto">Texto</option><option value="imagem">Imagem</option></select></label>
        <h4 className="titulo-secao-template titulo-conteudo-template">2. Conteúdo da mensagem</h4>
        {template.cabecalhoTipo==='texto'&&<><label>Texto do cabeçalho<input className="campo-input" value={template.cabecalhoTexto} onChange={function(evento){setTemplate(Object.assign({},template,{cabecalhoTexto:evento.target.value}));}} placeholder="Opcionalmente use {{1}} para uma informação personalizada" required/></label>{quantidadeParametros(template.cabecalhoTexto)>0&&<><label>Exemplo do valor no cabeçalho<input className="campo-input" value={template.cabecalhoExemplo} onChange={function(evento){setTemplate(Object.assign({},template,{cabecalhoExemplo:evento.target.value}));}} required/><small>Exemplo que a Meta usará ao analisar o modelo.</small></label><label>O que deve aparecer em {'{{1}}'}?<select className="campo-input" value={template.cabecalhoOrigem} onChange={function(evento){setTemplate(Object.assign({},template,{cabecalhoOrigem:evento.target.value}));}}><option value="nome_contato">Nome da pessoa</option><option value="bairro">Bairro</option><option value="problema">Principal necessidade</option><option value="fixo">Texto igual para todos</option></select></label>{template.cabecalhoOrigem==='fixo'&&<label>Texto do cabeçalho igual para todos<input className="campo-input" value={template.cabecalhoValor} onChange={function(evento){setTemplate(Object.assign({},template,{cabecalhoValor:evento.target.value}));}} required/></label>}</>}</>}
        {template.cabecalhoTipo==='imagem'&&<><label>Imagem de exemplo para aprovação<input className="campo-input campo-arquivo-template" type="file" accept="image/jpeg,image/png" disabled={templateOficialEdicao} required={!templateOficialEdicao&&!template.imagemHandle} onChange={function(evento){setTemplate(Object.assign({},template,{imagemArquivo:evento.target.files&&evento.target.files[0]||null}));}}/><small>{templateOficialEdicao?'A imagem de exemplo já pertence ao modelo enviado à Meta.':template.imagemArquivo?'Imagem selecionada e pronta para preparar ao salvar.':template.imagemHandle?'Imagem de exemplo já preparada. Selecione outra somente para substituir.':'Imagem que a Meta utilizará para analisar este modelo. Selecione JPG ou PNG de até 5 MB.'}</small></label><fieldset className="escolha-imagem-envio"><legend>Imagem usada nas mensagens</legend><p>Imagem que aparecerá para as pessoas quando esta campanha for enviada.</p><label><input type="radio" name="imagemModo" value="dispositivo" checked={template.imagemModo==='dispositivo'} onChange={function(){if(template.imagemModo!=='dispositivo')setTemplate(Object.assign({},template,{imagemModo:'dispositivo',imagemEnvio:'',imagemEnvioArquivo:null,removerImagemEnvio:false}));}}/> Escolher imagem do dispositivo</label><label><input type="radio" name="imagemModo" value="internet" checked={template.imagemModo==='internet'} onChange={function(){if(template.imagemModo!=='internet')setTemplate(Object.assign({},template,{imagemModo:'internet',imagemEnvio:'',imagemEnvioArquivo:null,removerImagemEnvio:false}));}}/> Usar imagem da internet</label>{template.imagemModo==='dispositivo'?<label>Escolher imagem<input className="campo-input campo-arquivo-template" type="file" accept="image/jpeg,image/png" required={!template.imagemEnvio&&!template.removerImagemEnvio} onChange={function(evento){setTemplate(Object.assign({},template,{imagemEnvioArquivo:evento.target.files&&evento.target.files[0]||null,removerImagemEnvio:false}));}}/><small>{template.imagemEnvio&&!template.imagemEnvioArquivo?'Já existe uma imagem preparada. Escolha outra apenas para substituir.':'Selecione um JPG ou PNG de até 5 MB no computador ou celular.'}</small></label>:<label>Endereço público da imagem<input className="campo-input" type="url" value={template.imagemEnvio} onChange={function(evento){setTemplate(Object.assign({},template,{imagemEnvio:evento.target.value,removerImagemEnvio:false}));}} placeholder="https://..." required={!template.removerImagemEnvio}/><small>Use esta opção se a imagem já estiver disponível em um site na internet.</small></label>}{templateOficialEdicao&&template.imagemEnvio&&<button className="botao botao-secundario" type="button" onClick={function(){if(window.confirm('Remover a imagem configurada para os próximos envios? O modelo continuará aprovado, mas novos envios ficarão bloqueados até outra imagem ser configurada.'))setTemplate(Object.assign({},template,{imagemEnvio:'',imagemEnvioArquivo:null,removerImagemEnvio:true}));}}>Remover imagem configurada</button>}{template.removerImagemEnvio&&<p className="aviso-configuracao-imagem" role="status">A imagem será removida ao salvar. O modelo continuará aprovado, mas não poderá ser enviado até uma nova imagem ser configurada.</p>}</fieldset></>}
        <label className="campo-template-conteudo">Texto principal<textarea ref={textoTemplateRef} className="campo-input" value={template.conteudo} disabled={templateOficialEdicao} onChange={alterarTextoTemplate} placeholder="Ex.: Olá! Temos um convite para você." required/><small>{templateOficialEdicao?'Os valores entre chaves foram definidos no modelo oficial da Meta. Escolha abaixo de onde vem cada informação.':'Escreva normalmente e use as opções abaixo para inserir informações que mudam para cada pessoa.'}</small></label>
        {!templateOficialEdicao&&<h4 className="titulo-secao-template">3. Personalização</h4>}
        {!templateOficialEdicao&&<section className="atalhos-personalizacao-template" aria-label="Adicionar informação personalizada ao texto"><strong>Adicionar ao texto</strong><p>Posicione o cursor onde a informação deve aparecer e escolha uma opção:</p><div><button type="button" onClick={function(){inserirInformacaoPersonalizada('nome_contato');}}>Nome da pessoa</button><button type="button" onClick={function(){inserirInformacaoPersonalizada('bairro');}}>Bairro</button><button type="button" onClick={function(){inserirInformacaoPersonalizada('problema');}}>Principal necessidade</button><button type="button" onClick={function(){inserirInformacaoPersonalizada('fixo');}}>Outro texto</button></div></section>}
        {template.parametrosCorpo.length>0&&<aside className="ajuda-valores-personalizados" aria-label="Explicação dos valores personalizados"><strong>O que significam {'{{1}}'}, {'{{2}}'} e os próximos números?</strong><p>Cada número marca uma informação que será preenchida automaticamente para cada pessoa. <b>{'{{1}}'}</b> é a primeira informação, <b>{'{{2}}'}</b> é a segunda, e assim por diante.</p><p>Exemplo: se você escrever “Olá, <b>{'{{1}}'}</b>! Seu bairro é <b>{'{{2}}'}</b>”, escolha abaixo <b>{'{{1}}'} = Nome da pessoa</b> e <b>{'{{2}}'} = Bairro</b>. Para João, de Copacabana, a mensagem ficará: “Olá, João! Seu bairro é Copacabana”.</p></aside>}
        {template.parametrosCorpo.length>0&&<h4 className="titulo-valores-personalizados">Valores personalizados desta mensagem</h4>}
        {template.parametrosCorpo.map(function(parametro,indice){return <div className="configuracao-parametro-template" key={'parametro-'+indice}><strong>{'{{'+(parametro.marcador||indice+1)+'}}'}</strong><label>Exemplo para a Meta<input className="campo-input" value={parametro.exemplo} onChange={function(evento){alterarParametroCorpo(indice,'exemplo',evento.target.value);}} required={!templateOficialEdicao}/><small>Use um exemplo parecido com o valor real que será enviado.</small></label><label>O que deve aparecer aqui?<select className="campo-input" value={parametro.origem} required onChange={function(evento){alterarParametroCorpo(indice,'origem',evento.target.value);}}><option value="">Escolha uma informação</option><option value="nome_contato">Nome da pessoa</option><option value="bairro">Bairro</option><option value="problema">Principal necessidade</option><option value="fixo">Texto igual para todos</option></select></label>{parametro.origem==='fixo'&&<label>Texto que será igual para todos<input className="campo-input" value={parametro.valor} onChange={function(evento){alterarParametroCorpo(indice,'valor',evento.target.value);}} required/></label>}</div>;})}
        <h4 className="titulo-secao-template">4. Rodapé</h4>
        <label className="campo-template-conteudo campo-rodape-modelo">Rodapé opcional<input className="campo-input" value={template.rodape} disabled={templateOficialEdicao} onChange={function(evento){setTemplate(Object.assign({},template,{rodape:evento.target.value}));}}/></label>
        <h4 className="titulo-secao-template">5. Botões</h4>
        <section className="construtor-botoes-modelo"><div className="cabecalho-construtor-botoes"><div><h4>Botões da mensagem</h4><p>Adicione somente as ações que a pessoa realmente poderá usar.</p></div><button className="botao botao-secundario" type="button" onClick={adicionarBotao} disabled={template.botoes.length>=3}>+ Adicionar botão</button></div>
          {template.botoes.length===0&&<p className="estado-vazio-botoes">Este modelo não possui botões.</p>}
          {template.botoes.map(function(botao,indice){return <article className="editor-botao-modelo" key={'botao-'+indice}><div className="cabecalho-editor-botao"><strong>Botão {indice+1}</strong><div><button type="button" aria-label="Mover botão para cima" disabled={indice===0} onClick={function(){moverBotao(indice,-1);}}>↑</button><button type="button" aria-label="Mover botão para baixo" disabled={indice===template.botoes.length-1} onClick={function(){moverBotao(indice,1);}}>↓</button><button type="button" onClick={function(){removerBotao(indice);}}>Remover</button></div></div><label>Tipo de ação<select className="campo-input" value={botao.acao} onChange={function(evento){alterarBotao(indice,'acao',evento.target.value);}}><option value="url">Abrir link</option><option value="telefone">Ligar</option><option value="optout">Não receber mais contatos</option></select></label><label>Texto do botão<input className="campo-input" value={botao.texto} placeholder={botao.acao==='optout'?'SAIR':'Ex.: Quero participar!'} onChange={function(evento){alterarBotao(indice,'texto',evento.target.value);}} required/></label>{botao.acao==='url'&&<><label>Endereço do link<input className="campo-input" value={botao.url} onChange={function(evento){alterarBotao(indice,'url',evento.target.value);}} placeholder="https://exemplo.com" required/></label>{botao.url.includes('{{1}}')&&<><label>Exemplo do final do link<input className="campo-input" value={botao.exemplo} onChange={function(evento){alterarBotao(indice,'exemplo',evento.target.value);}} required/></label><label>Valor usado no envio<input className="campo-input" value={botao.valorEnvio} onChange={function(evento){alterarBotao(indice,'valorEnvio',evento.target.value);}} required/></label></>}</>}{botao.acao==='telefone'&&<label>Número para ligação<input className="campo-input" value={botao.telefone} onChange={function(evento){alterarBotao(indice,'telefone',evento.target.value);}} placeholder="+5521999999999" required/></label>}{botao.acao==='optout'&&<p className="ajuda-botao-sair">Este botão será associado ao fluxo SAIR e impedirá novos contatos com essa pessoa.</p>}</article>;})}
          <small>Esta interface oferece até três botões: no máximo dois para link ou ligação e um para não receber mais contatos.</small>
        </section>
        <h4 className="titulo-secao-template">6. Disponibilidade</h4>
        <label className="opcao-cadastro-incompleto disponibilidade-template"><input type="checkbox" checked={template.ativo} onChange={function(evento){setTemplate(Object.assign({},template,{ativo:evento.target.checked}));}}/> Disponível para uso no ACORDA RJ</label>
      </fieldset>}{templateOficialEdicao&&<fieldset className={'configuracao-modelo-oficial '+(template.statusOficial==='APPROVED'?'':'nao-aprovado')}>
        <section className="resumo-modelo-oficial"><span>Modelo oficial</span><strong>{template.nome}</strong><p>{template.statusOficial==='APPROVED'?'Aprovado pela Meta ✓':template.statusOficial==='PENDING'?'Em análise pela Meta':'Status oficial: '+textoStatus(template.statusOficial)}</p></section>
        {template.cabecalhoTipo==='imagem'&&<section className="secao-configuracao-modelo"><h4>Imagem da mensagem</h4><p className="estado-imagem-modelo">{template.imagemEnvio&&!template.removerImagemEnvio?'Configurada ✓':'Não configurada'}</p><div className="opcoes-imagem-modelo"><label><input type="radio" name="imagemModo" value="dispositivo" checked={template.imagemModo==='dispositivo'} onChange={function(){setTemplate(Object.assign({},template,{imagemModo:'dispositivo',imagemEnvioArquivo:null,removerImagemEnvio:false}));}}/> Trocar por imagem do dispositivo</label><label><input type="radio" name="imagemModo" value="internet" checked={template.imagemModo==='internet'} onChange={function(){setTemplate(Object.assign({},template,{imagemModo:'internet',imagemEnvio:'',imagemEnvioArquivo:null,removerImagemEnvio:false}));}}/> Usar imagem da internet</label></div>{template.imagemModo==='dispositivo'?<label>Escolher nova imagem<input className="campo-input campo-arquivo-template" type="file" accept="image/jpeg,image/png" required={!template.imagemEnvio&&!template.removerImagemEnvio} onChange={function(evento){setTemplate(Object.assign({},template,{imagemEnvioArquivo:evento.target.files&&evento.target.files[0]||null,removerImagemEnvio:false}));}}/><small>Se nenhuma nova imagem for escolhida, a imagem já configurada será mantida.</small></label>:<label>Endereço público da imagem<input className="campo-input" type="url" value={template.imagemEnvio} onChange={function(evento){setTemplate(Object.assign({},template,{imagemEnvio:evento.target.value,removerImagemEnvio:false}));}} placeholder="https://..." required={!template.removerImagemEnvio}/></label>}{template.imagemEnvio&&!template.removerImagemEnvio&&<button className="botao botao-secundario" type="button" onClick={function(){if(window.confirm('Remover a imagem configurada? Novos envios ficarão bloqueados até outra imagem ser configurada.'))setTemplate(Object.assign({},template,{imagemEnvio:'',imagemEnvioArquivo:null,removerImagemEnvio:true}));}}>Remover imagem</button>}{template.removerImagemEnvio&&<p className="aviso-configuracao-imagem" role="status">A imagem será removida ao salvar. O modelo continuará aprovado, mas ficará indisponível para novos envios até uma nova imagem ser configurada.</p>}</section>}
        {template.parametrosCorpo.length>0&&<section className="secao-configuracao-modelo"><h4>Personalização</h4>{template.parametrosCorpo.map(function(parametro,indice){return <div className="linha-personalizacao-modelo" key={'parametro-oficial-'+indice}><strong>{'{{'+(parametro.marcador||indice+1)+'}}'}</strong><span aria-hidden="true">→</span><label><span className="somente-leitor">Informação usada em {'{{'+(parametro.marcador||indice+1)+'}}'}</span><select className="campo-input" value={parametro.origem} required onChange={function(evento){alterarParametroCorpo(indice,'origem',evento.target.value);}}><option value="">Escolha uma informação</option><option value="nome_contato">Nome da pessoa</option><option value="bairro">Bairro</option><option value="problema">Principal necessidade</option><option value="fixo">Texto igual para todos</option></select></label>{parametro.origem==='fixo'&&<label>Texto igual para todos<input className="campo-input" value={parametro.valor} onChange={function(evento){alterarParametroCorpo(indice,'valor',evento.target.value);}} required/></label>}</div>;})}</section>}
        {template.botoesOficiais.length>0&&<section className="secao-configuracao-modelo"><h4>Botões da mensagem</h4>{template.botoesOficiais.map(function(botao){return <article className="botao-oficial-modelo" key={'botao-oficial-'+botao.indice}><strong>{botao.texto||'Botão sem nome'}</strong>{botao.tipo==='URL'&&<p>Abre o link configurado no modelo oficial.</p>}{botao.tipo==='QUICK_REPLY'&&<label><input type="checkbox" checked={botao.optOut} onChange={function(evento){alterarAcaoBotaoOficial(botao.indice,evento.target.checked);}}/> Associar este botão à ação <strong>SAIR — Não receber mais contatos</strong></label>}{!['URL','QUICK_REPLY'].includes(botao.tipo)&&<p>Ação definida no modelo oficial.</p>}</article>;})}</section>}
      </fieldset>}
      <div className="bloco-acoes-template"><h4 className="titulo-secao-template">7. Ações finais</h4><p className="aviso-estado-campanha">{templateOficialEdicao?(template.statusOficial==='APPROVED'?'O conteúdo aprovado não é alterado aqui. Estas informações servem somente para preparar o envio.':'A Meta é a fonte do status oficial. Aguarde a análise ou atualize a lista antes de configurar o envio.'):'Salvar cria somente um rascunho. Enviar para análise faz a Meta avaliar o modelo e não envia mensagens para contatos.'}</p>
      <div className="acoes-fluxo-campanha">
        {(!templateOficialEdicao||template.statusOficial==='APPROVED')&&<button className="botao botao-primario" type="submit" disabled={salvandoTemplate}>{salvandoTemplate?'Salvando...':(templateOficialEdicao?'Salvar informações de envio':'Salvar rascunho')}</button>}
        {templateEdicao&&<button className="botao botao-secundario" type="button" disabled={salvandoTemplate} onClick={function(){setTemplateEdicao(null);setTemplateOficialEdicao(false);setTemplate(TEMPLATE_INICIAL);}}>{templateOficialEdicao&&template.statusOficial!=='APPROVED'?'Fechar':'Cancelar edição'}</button>}
      </div></div></form><PreviaModeloMensagem template={template}/></div>
      <div className="lista-templates-campanha">{templates.map(function(item){
        const aprovado=item.meta_status_oficial==='APPROVED';
        const emAnalise=['PENDING','IN_APPEAL'].includes(item.meta_status_oficial);
        const imagemPendente=aprovado&&possuiCabecalhoImagem(item)&&!possuiImagemConfigurada(item);
        const textoAcao=!item.meta_template_id?'Editar rascunho':aprovado?(imagemPendente?'Configurar imagem':'Definir informações de envio'):emAnalise?'Acompanhar análise':'Ver modelo';
        return <article key={item.id}><div><strong>{item.nome}</strong><span>{item.meta_nome||'Ainda sem nome na Meta'} · {item.meta_idioma||'Idioma não informado'} · {textoCategoriaMeta(item.meta_categoria)}</span><span className={'status-campanha status-'+item.meta_status}>{textoStatus(item.meta_status||'rascunho')}</span><small>{explicacaoStatusTemplate(item.meta_status||'rascunho')}</small>{item.meta_origem==='meta'&&<small>Sincronizado diretamente da conta oficial da Meta.</small>}{imagemPendente&&<span className="configuracao-pendente-template"><strong>Imagem para envio</strong> Não configurada</span>}{item.meta_sincronizado_em&&<small>Última atualização: {new Date(item.meta_sincronizado_em).toLocaleString('pt-BR')}</small>}</div><div className="acoes-template-meta"><button className="botao botao-secundario" type="button" onClick={function(){editarTemplate(item);}}>{textoAcao}</button>{!item.meta_template_id&&<button className="botao botao-primario" type="button" title="Envia o modelo para avaliação. Não envia mensagens para contatos." onClick={function(){submeterTemplate(item);}}>Enviar para análise da Meta</button>}{item.pode_excluir&&<button className="botao botao-perigo" type="button" onClick={function(){removerTemplate(item);}}>Excluir rascunho</button>}</div></article>;
      })}</div>
    </div></details>}

    {loteAberto&&<div className="sobreposicao-campanha" role="presentation" onMouseDown={function(evento){if(evento.target===evento.currentTarget)setLoteAberto(null);}}><section className="painel-contatos-lote" role="dialog" aria-modal="true" aria-labelledby="titulo-contatos-lote"><div className="cabecalho-campanha-aberta"><div><span className="etiqueta-pagina">Envio {loteAberto.ordem}</span><h2 id="titulo-contatos-lote">{formatarQuantidade(loteAberto.tamanho_efetivo)} contatos neste envio</h2><p>Telefones aparecem mascarados para proteger os dados.</p></div><button className="botao botao-secundario" type="button" onClick={function(){setLoteAberto(null);}}>Fechar detalhes</button></div>{carregandoLote?<Carregando mensagem="Carregando detalhes do envio..."/>:<ListaContatosCampanha contatos={contatosLote}/>}</section></div>}
  </div></main>;
}

export default CampanhasAdministrativas;
