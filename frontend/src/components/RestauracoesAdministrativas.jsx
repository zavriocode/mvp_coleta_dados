import {useEffect, useRef, useState} from 'react';
import {obterUrlBase} from '../services/api';
import {obterToken} from '../utils/armazenamentoToken';
import '../styles/restauracoes.css';

async function requisicao(caminho,body,binario=false){
  const multipart=body instanceof FormData;
  const r=await fetch(obterUrlBase()+'/api/admin/restauracoes'+caminho,{
    method:body?'POST':'GET',headers:{Authorization:'Bearer '+obterToken(),...(!multipart&&body?{'Content-Type':'application/json'}:{})},
    body:multipart?body:body?JSON.stringify(body):undefined
  });
  if(!r.ok){let d;try{d=await r.json();}catch{}
    const e=new Error(d?.mensagem||'Não foi possível concluir. Atualize o status antes de tentar novamente.');e.status=r.status;e.recuperacao=d?.recuperacao;throw e;}
  return binario?r.blob():r.json();
}
const tamanho=n=>Number(n||0)<1000000?`${(Number(n||0)/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})} KB`:`${(Number(n)/1000000).toLocaleString('pt-BR',{maximumFractionDigits:1})} MB`;
const data=n=>n?new Date(n).toLocaleString('pt-BR'):'Não informada';
const etapas=['Enviar backup','Preparar','Restaurar e concluir'];
const progresso=['Preparando sistema','Entrando em manutenção','Finalizando operações em andamento','Criando backup de segurança','Restaurando dados','Validando integridade','Reconciliando eventos','Aguardando revisão administrativa','Sistema liberado'];
const fases={validando:'Validando backup',valido:'Backup válido',rejeitado:'Backup não pôde ser validado',drenando:'Finalizando operações',backup_pre_restore:'Criando cópia de segurança',aguardando_custodia:'Aguardando cópia externa',restaurando:'Restaurando dados',validando_pos_restore:'Validando integridade',aguardando_revisao:'Aguardando revisão',abortado_antes_restore:'Interrompido antes da restauração',recuperacao_necessaria:'Recuperação necessária',liberado:'Sistema liberado'};
const rotulos={usuarios:'Acessos dos administradores',consentimentos:'Consentimentos',bloqueios:'Bloqueios de contato',campanhas:'Campanhas',tentativas:'Histórico de tentativas',indeterminados:'Envios com resultado desconhecido',eventosPosteriores:'Eventos posteriores ao backup',meta:'Coerência com a Meta',capacidade:'Capacidade de envio',secrets:'Credenciais e configurações protegidas'};
const tabelas={usuarios:'Usuários',contatos:'Contatos',consentimentos:'Consentimentos',campanhas:'Campanhas',campanha_tentativas:'Tentativas de envio',eventos_webhook_mensageria:'Eventos de mensagens',configuracoes_sistema:'Configurações',modelos_mensagem:'Modelos de mensagem'};
function Confirmacao({senha,setSenha,frase,setFrase,texto}){
  return <div className="restore-confirmacao"><label>Senha administrativa atual<input type="password" autoComplete="current-password" value={senha} onChange={e=>setSenha(e.target.value)}/></label><label>Digite <strong>{texto}</strong> para confirmar<input autoComplete="off" spellCheck={false} value={frase} onChange={e=>setFrase(e.target.value)}/></label></div>;
}
function Arquivo({id,titulo,accept,arquivo,onChange}){
  return <div className={'restore-arquivo '+(arquivo?'selecionado':'')}><span className="restore-arquivo-icone" aria-hidden="true">▤</span><div><label htmlFor={id}>{titulo}</label><p>{arquivo?arquivo.name:'Nenhum arquivo selecionado'}</p><small>{arquivo?`${tamanho(arquivo.size)} · Selecionado`:'Selecione o arquivo salvo no seu computador.'}</small><input id={id} type="file" accept={accept} onChange={e=>onChange(e.target.files[0]||null)}/></div></div>;
}
export default function RestauracoesAdministrativas(){
  const [dados,setDados]=useState(null),[msg,setMsg]=useState(''),[erro,setErro]=useState(false),[ocupado,setOcupado]=useState('');
  const [detalheErro,setDetalheErro]=useState('');
  const [etapa,setEtapa]=useState(0),[selecionada,setSelecionada]=useState(null);
  const [arquivo,setArquivo]=useState(null),[email,setEmail]=useState(''),[senhaBackup,setSenhaBackup]=useState('');
  const [senha,setSenha]=useState(''),[frase,setFrase]=useState(''),[novoLogin,setNovoLogin]=useState(false);
  const [custodia,setCustodia]=useState(false),[checklist,setChecklist]=useState({}),[cancelando,setCancelando]=useState(false),[liberando,setLiberando]=useState(false);
  const [revisao,setRevisao]=useState(null),[tabela,setTabela]=useState('usuarios'),[pagina,setPagina]=useState(0);
  const [conferencia,setConferencia]=useState(null);
  const titulo=useRef(null);
  async function carregar(){const d=await requisicao('');setDados(d);return d;}
  function falha(e){
    setErro(true);setDetalheErro(e.message);
    if(e.recuperacao){
      const r=e.recuperacao;
      setDados(anterior=>({...anterior,estado:{...anterior?.estado,manutencao:r.manutencao,operacao_id:r.id},operacoes:(anterior?.operacoes||[]).map(x=>x.id===r.id?{...x,fase:r.fase,erro:r.erro}:x)}));
      setEtapa(4);setNovoLogin(!!r.novoLoginObrigatorio);setMsg(r.erro);
    }
    else if(e.status===413||e.status===409)setMsg(e.message);
    else if(e.status===401){setNovoLogin(true);setErro(false);setMsg('Confirme seu acesso entrando novamente.');}
    else if(etapa<2)setMsg('Confira se o backup foi gerado pelo sistema e se as credenciais estão corretas. Se o problema continuar, procure o suporte.');
    else setMsg('Não foi possível concluir esta etapa. Atualize o status antes de tentar novamente. Se houver uma restauração em andamento, não a repita; procure o suporte.');
  }
  useEffect(()=>{carregar().catch(falha);},[]);
  const operacoes=dados?.operacoes||[];
  const o=operacoes.find(x=>x.id===dados?.estado?.operacao_id&&dados?.estado?.manutencao)||operacoes.find(x=>x.id===selecionada);
  const emManutencao=!!dados?.estado?.manutencao;
  const fase=o?.fase;
  const pendencias=dados?.pendencias||[];
  const revisaoPermitida=['aguardando_revisao','abortado_antes_restore'].includes(fase);
  const etapaVisivel=emManutencao||fase==='liberado'?4:etapa;
  const passoVisivel=etapaVisivel<2?0:etapaVisivel<4?1:2;
  const restaurado=fase==='aguardando_revisao'||(fase==='liberado'&&!!o?.dados?.restauradoEm);
  // Apenas leitura: nunca inicia nem repete uma operação de restauração.
  useEffect(()=>{
    if(novoLogin||(!ocupado&&!emManutencao))return;
    let vivo=true,emConsulta=false;
    const timer=setInterval(async()=>{if(emConsulta)return;emConsulta=true;try{const d=await requisicao('');if(vivo)setDados(d);}catch(e){if(vivo&&e.status===401)falha(e);}finally{emConsulta=false;}},2500);
    return()=>{vivo=false;clearInterval(timer);};
  },[ocupado,emManutencao,novoLogin]);
  useEffect(()=>{titulo.current?.focus();},[etapaVisivel]);
  async function acao(nome,fn){
    setOcupado(nome);setMsg('');setErro(false);setDetalheErro('');
    try{const renovarLogin=await fn();if(renovarLogin!==true)await carregar();}catch(e){falha(e);}finally{setSenha('');setSenhaBackup('');setFrase('');setOcupado('');}
  }
  function avancar(n){setEtapa(n);setMsg('');setErro(false);setDetalheErro('');setSenha('');setFrase('');}
  async function enviar(){
    if(!arquivo||!email||!senhaBackup)throw new Error('Selecione o backup e confirme o acesso do administrador do backup.');
    const f=new FormData();f.append('backup',arquivo);f.append('email',email);f.append('senha',senhaBackup);
    const r=await requisicao('/upload',f);setSelecionada(r.id);setEtapa(2);
    setMsg('Backup válido. Confira os dados antes de continuar.');
  }
  async function baixar(){
    const blob=await requisicao('/'+o.id+'/pre-backup',null,true);
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=o.dados.preBackup.nomeArquivo.replace(/\.dump$/i,'.acorda');a.click();URL.revokeObjectURL(url);
    setMsg('Confira o backup baixado e guarde-o em um local seguro fora do sistema.');
  }
  const post=(suffix)=>acao(suffix,async()=>{
    const r=await requisicao('/'+o.id+'/'+suffix,{senha,frase,custodia,checklist});
    setSelecionada(o.id);
    if(['iniciar','executar'].includes(suffix)){
      setEtapa(4);setNovoLogin(true);
      if(r.fase)setDados(anterior=>({...anterior,estado:{...anterior.estado,manutencao:true,operacao_id:o.id},operacoes:anterior.operacoes.map(item=>item.id===o.id?r:item)}));
      else if(suffix==='executar'&&r.novoLoginObrigatorio){
        // Este retorno só ocorre após restore e validação bem-sucedidos no servidor.
        setDados(anterior=>({...anterior,operacoes:anterior.operacoes.map(item=>item.id===o.id?{...item,fase:'aguardando_revisao'}:item)}));
      }
    }
    if(r.novoLoginObrigatorio)setNovoLogin(true);
    setMsg(suffix==='liberar'?'Sistema liberado após revisão administrativa.':'Etapa registrada. Consulte o andamento abaixo.');
    return ['iniciar','executar'].includes(suffix)||!!r.novoLoginObrigatorio;
  });
  const confirmado=!!senha&&frase==='RESTAURAR SISTEMA';
  const m=o?.dados?.manifesto?.dados;
  const indice={drenando:2,backup_pre_restore:3,aguardando_custodia:4,restaurando:4,validando_pos_restore:5,aguardando_revisao:pendencias.length?6:7,liberado:9}[fase]??0;
  const emErro=['recuperacao_necessaria','abortado_antes_restore'].includes(fase);
  return <section className="cartao painel-resultados restauracoes" aria-labelledby="restore-titulo" aria-busy={!!ocupado}>
    <header className="restore-cabecalho"><div><span className="restore-eyebrow">RECUPERAÇÃO DO SISTEMA</span><h2 id="restore-titulo" ref={titulo} tabIndex={-1}>Restaurar backup</h2><p>Use esta opção para recuperar o sistema a partir de um backup anterior.</p></div><span className={'restore-badge '+(emManutencao?'aviso':'')}>{emManutencao?'Manutenção ativa':'Área protegida'}</span></header>
    <ol className="restore-etapas" aria-label="Etapas da restauração">{etapas.map((e,i)=><li key={e} className={i===passoVisivel?'atual':i<passoVisivel?'feito':''} aria-current={i===passoVisivel?'step':undefined}><span>{i<passoVisivel?'✓':i+1}</span>{e}</li>)}</ol>
    {restaurado&&<div className="restore-aviso sucesso restore-resultado"><div role="status"><strong>Restauração concluída com sucesso.</strong><p>{fase==='liberado'?'Os dados foram restaurados e o sistema está liberado.':'Os dados foram restaurados e a integridade foi validada. O sistema permanece em manutenção até a revisão e liberação manual.'}</p></div>
      <dl className="restore-resumo">
        <div><dt>Backup utilizado</dt><dd>{o.dados.nomeArquivo||'Nome não registrado nesta operação'} · {data(m?.criadoEm)}</dd></div>
        <div><dt>Concluída em</dt><dd>{o.dados.restauradoEm?data(o.dados.restauradoEm):'Consulte após entrar novamente'}</dd></div>
        <div><dt>Verificação de integridade</dt><dd>Aprovada</dd></div>
        <div><dt>Situação</dt><dd>{fase==='liberado'?'Sistema liberado':'Aguardando revisão e liberação manual'}</dd></div>
        {['contatos','campanhas','historico_status_mensageria'].map(k=><div key={k}><dt>{({contatos:'Contatos recuperados',campanhas:'Campanhas recuperadas',historico_status_mensageria:'Registros do histórico de mensagens'})[k]}</dt><dd>{o.dados.resumo?.contagens?.[k]===undefined?'Não informado':Number(o.dados.resumo.contagens[k]).toLocaleString('pt-BR')}</dd></div>)}
      </dl><p>Quantidades do backup verificado. Alterações posteriores e reconciliações podem mudar os dados atuais.</p>
      {fase==='liberado'?<a className="botao botao-primario" href="/admin/contatos">Conferir dados restaurados</a>:<button className="botao botao-primario" disabled={novoLogin||!!ocupado} onClick={()=>acao('conferencia',async()=>{const r=await requisicao('/'+o.id+'/revisao/contatos?pagina=0');setConferencia({id:o.id,registros:r.registros});})}>Conferir dados restaurados</button>}
      {novoLogin&&<p>Entre novamente para consultar os dados com segurança.</p>}
      {conferencia?.id===o.id&&<div><h3>Contatos atuais — primeiros 100</h3><p>Procure um contato conhecido para conferir. Esta consulta não altera dados.</p>{conferencia.registros.length?<ul>{conferencia.registros.map((r,i)=><li key={r.id||i}>{r.nome||'Sem nome'} — {r.telefone||r.telefone_normalizado||'Sem telefone'}</li>)}</ul>:<p>Nenhum contato encontrado.</p>}</div>}
    </div>}
    {msg&&<div className={'restore-aviso '+(erro?'erro':'sucesso')} role={erro?'alert':'status'}>{erro&&etapaVisivel<2&&<strong>Backup não pôde ser validado. </strong>}{msg}</div>}
    {erro&&detalheErro&&<details className="restore-detalhes"><summary>Ver detalhes técnicos do erro</summary><p>{detalheErro}</p></details>}
    {ocupado&&<div className="restore-loading" role="status"><span className="restore-spinner"/>{ocupado==='upload'?'Enviando e validando backup. Isso pode levar alguns minutos.':'Processando com segurança. Aguarde a confirmação do servidor.'}</div>}
    {novoLogin&&<div className="restore-aviso aviso"><strong>Entre novamente para continuar.</strong><p>As sessões anteriores foram encerradas por segurança. A manutenção não será liberada automaticamente. Após entrar, volte à aba Backup.</p><a className="botao botao-primario" href="/login">Fazer novo login</a></div>}
    {!dados&&!erro&&<p role="status">Carregando restaurações…</p>}
    <fieldset className="restore-conteudo" disabled={!!ocupado||novoLogin||!dados}>
      {!emManutencao&&etapa<2&&<form className="restore-card" onSubmit={e=>{e.preventDefault();acao('upload',enviar);}}><h3>1. Envie o backup</h3><p>Escolha o arquivo e informe uma conta administrativa que existia nele. Vamos verificar o conteúdo e o acesso, sem alterar seus dados.</p><div className="restore-arquivos"><Arquivo id="restore-backup" titulo="Arquivo do backup" accept=".acorda" arquivo={arquivo} onChange={setArquivo}/></div><div className="restore-campos"><label>E-mail do administrador do backup<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Senha dessa conta no backup<input type="password" required autoComplete="current-password" value={senhaBackup} onChange={e=>setSenhaBackup(e.target.value)}/></label></div><div className="restore-acoes"><button className="botao botao-primario" disabled={!arquivo||!email||!senhaBackup}>Validar backup</button></div></form>}
      {!emManutencao&&o?.fase==='valido'&&etapa>=2&&etapa<4&&<><div className="restore-card restore-validado"><span className="restore-badge sucesso">✓ Backup válido</span><h3>Backup selecionado</h3><dl className="restore-resumo"><div><dt>Backup de</dt><dd>{data(m?.criadoEm)}</dd></div><div><dt>Tamanho</dt><dd>{tamanho(m?.tamanhoBytes)}</dd></div><div><dt>Compatibilidade</dt><dd>Versão compatível com este sistema</dd></div><div><dt>Conteúdo verificado</dt><dd>{o.dados.resumo?.tabelas} tabelas · {Object.values(o.dados.resumo?.contagens||{}).reduce((a,b)=>a+Number(b),0).toLocaleString('pt-BR')} registros</dd></div></dl><p>Contatos, campanhas, histórico de mensagens, consentimentos, configurações e demais dados do sistema.</p><details className="restore-detalhes"><summary>Ver detalhes técnicos</summary><p>PostgreSQL {m?.versaoPostgresql} · Identificador {o.id}</p><pre>{JSON.stringify(o.dados.resumo?.contagens,null,2)}</pre></details></div>
        <div className="restore-card"><h3>2. Prepare a restauração</h3><p>Confira o resumo acima. Ao confirmar, o sistema entrará em manutenção e criará uma cópia de segurança. Os dados atuais só serão substituídos depois que você baixar essa cópia e autorizar a restauração.</p><Confirmacao {...{senha,setSenha,frase,setFrase}} texto="RESTAURAR SISTEMA"/><div className="restore-acoes"><button className="botao restore-destrutivo" disabled={!confirmado} onClick={()=>post('iniciar')}>Confirmar e preparar sistema</button><button className="botao botao-secundario" onClick={()=>{setSelecionada(null);avancar(0);}}>Selecionar outro backup</button></div></div>
      </>}
      {o&&etapaVisivel===4&&<><div className="restore-card"><div className="restore-titulo-linha"><h3>Acompanhe a restauração</h3><button className="botao botao-secundario" onClick={()=>acao('atualizar',carregar)}>Atualizar status</button></div><p>{fases[fase]||'Aguardando confirmação do servidor'}</p>{emErro&&<div className="restore-aviso erro" role="alert"><strong>{fases[fase]}</strong><p>{o.erro} Não repita a restauração. Preserve a cópia de segurança e procure o suporte.</p></div>}
        <ol className="restore-progresso">{progresso.map((p,i)=>{
          const manual=fase==='aguardando_custodia'||(fase==='aguardando_revisao'&&!['reconciliar','templates'].includes(ocupado));
          const estado=emErro?'aguardando':i<indice?'concluido':i===indice&&!manual?'andamento':'aguardando';
          return <li key={p} className={estado}><span aria-hidden="true">{estado==='concluido'?'✓':i+1}</span><div>{p}<small>{estado==='concluido'?'Concluído':estado==='andamento'?'Em andamento':i===indice&&manual?'Aguardando sua ação':'Aguardando'}</small></div></li>;
        })}</ol>{emErro&&<p className="restore-aviso erro">Erro na operação — manutenção preservada. Subetapas sem confirmação não são marcadas como concluídas.</p>}</div>
        {o.dados.preBackup&&fase!=='liberado'&&<div className="restore-card"><h3>Guarde a cópia de segurança</h3><p>Esta cópia foi criada depois de estabilizar o sistema. Ela permite recuperar o estado anterior se for necessário.</p><button className="botao botao-primario" onClick={()=>acao('download',baixar)}>Baixar cópia de segurança</button></div>}
        {fase==='aguardando_custodia'&&<div className="restore-card"><h3>{cancelando?'Cancelar antes de restaurar':'Última confirmação antes de substituir os dados'}</h3>{!cancelando&&<label className="restore-check"><input type="checkbox" checked={custodia} disabled={!o.dados.downloadConcluido} onChange={e=>setCustodia(e.target.checked)}/>Baixei, conferi e guardei a cópia de segurança fora do sistema.</label>}{!o.dados.downloadConcluido&&!cancelando&&<p>Baixe a cópia de segurança primeiro. Depois, atualize o status caso necessário.</p>}<Confirmacao {...{senha,setSenha,frase,setFrase}} texto={cancelando?'CANCELAR RESTAURACAO':'RESTAURAR SISTEMA'}/><div className="restore-acoes"><button className="botao restore-destrutivo" disabled={cancelando?(!senha||frase!=='CANCELAR RESTAURACAO'):(!confirmado||!custodia||!o.dados.downloadConcluido)} onClick={()=>post(cancelando?'cancelar':'executar')}>{cancelando?'Confirmar cancelamento':'Restaurar dados agora'}</button><button className="botao botao-secundario" onClick={()=>{setCancelando(!cancelando);setSenha('');setFrase('');}}>{cancelando?'Voltar':'Quero cancelar'}</button></div><p>O sistema permanecerá em manutenção até a revisão e liberação manual, inclusive em caso de cancelamento.</p></div>}
        {revisaoPermitida&&<><div className="restore-card"><h3>Confira os eventos preservados</h3><p>Precisamos aplicar os eventos recebidos durante a manutenção antes de liberar o sistema. Nenhuma mensagem será enviada por esta ação.</p><p><strong>{pendencias.length?`${pendencias.length} pendência(s) listada(s)`:'Nenhuma pendência encontrada'}</strong></p><div className="restore-acoes"><button className="botao botao-primario" onClick={()=>post('reconciliar')}>Conferir eventos locais</button>{pendencias.some(p=>p.requer_meta)&&<button className="botao botao-secundario" onClick={()=>post('templates')}>Consultar modelos pendentes na Meta</button>}</div><p>A consulta de modelos é manual e somente leitura.</p><details className="restore-detalhes"><summary>Ver detalhes das pendências</summary>{pendencias.map(p=><p key={p.id}>#{p.id} · {p.tipo} · {p.erro||'Aguardando conferência'}</p>)}</details></div><div className="restore-card"><h3>Revise o sistema antes de liberar</h3><p>Confira os dados recuperados e os eventos posteriores ao backup. Em caso de dúvida, mantenha a manutenção e procure o suporte.</p><details className="restore-detalhes"><summary>Consultar dados para revisão administrativa</summary><div className="restore-campos"><label>Dados<select value={tabela} onChange={e=>{setTabela(e.target.value);setPagina(0);setRevisao(null);}}>{Object.entries(tabelas).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Página (a partir de zero)<input type="number" min="0" value={pagina} onChange={e=>setPagina(Number(e.target.value))}/></label></div><button className="botao botao-secundario" onClick={()=>acao('consulta',async()=>setRevisao(await requisicao('/'+o.id+'/revisao/'+tabela+'?pagina='+pagina)))}>Consultar</button>{revisao&&<pre>{JSON.stringify(revisao,null,2)}</pre>}</details><div className="restore-checklist">{(dados.checklist||[]).map(k=><label className="restore-check" key={k}><input type="checkbox" checked={!!checklist[k]} onChange={e=>setChecklist({...checklist,[k]:e.target.checked})}/>{rotulos[k]||k}: revisado</label>)}</div>{!liberando?<button className="botao botao-primario" disabled={pendencias.length>0||!dados.checklist?.length||!dados.checklist.every(k=>checklist[k])} onClick={()=>{setLiberando(true);setFrase('');setSenha('');}}>Continuar para liberação</button>:<><Confirmacao {...{senha,setSenha,frase,setFrase}} texto="LIBERAR SISTEMA"/><button className="botao botao-primario" disabled={!senha||frase!=='LIBERAR SISTEMA'||pendencias.length>0||!dados.checklist.every(k=>checklist[k])} onClick={()=>post('liberar')}>Liberar sistema após revisão</button></>}</div></>}
        {fase==='liberado'&&<div className="restore-aviso sucesso" role="status">Sistema liberado após revisão administrativa. O histórico desta operação foi preservado.</div>}
      </>}
    </fieldset>
    {!emManutencao&&etapaVisivel===4&&!novoLogin&&<button className="botao botao-secundario" disabled={!!ocupado} onClick={()=>{setSelecionada(null);avancar(0);}}>Voltar à seleção de backup</button>}
    <details className="restore-historico"><summary>Histórico de restaurações ({operacoes.length})</summary><p>O histórico é preservado. Arquivos temporários podem não estar mais disponíveis.</p>{operacoes.map(item=><div className="restore-historico-item" key={item.id}><div><strong>{fases[item.fase]||item.fase}</strong><p>{data(item.criado_em)} · Responsável #{item.usuario_id}</p></div><button className="botao botao-secundario" disabled={!!ocupado||novoLogin||emManutencao} onClick={()=>{setSelecionada(item.id);setChecklist({});setLiberando(false);avancar(item.fase==='valido'?2:4);}}>Ver operação</button></div>)}</details>
  </section>;
}
