import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import CampoFormulario from '../components/CampoFormulario';
import CampoSelecao from '../components/CampoSelecao';
import CampoSelecaoPesquisavel from '../components/CampoSelecaoPesquisavel';
import MarcaAcordaRJ from '../components/MarcaAcordaRJ';
import MensagemRetorno from '../components/MensagemRetorno';
import {
  TEXTO_AVISO_PRIVACIDADE,
  TEXTO_LIGACOES,
  TEXTO_MENSAGENS
} from '../data/textosConsentimento';
import {
  buscarOpcoesFormulario,
  cadastrarContato,
  inscreverContatoExistenteEvento,
  verificarContatoEvento
} from '../services/contatoService';

const ETAPA_IDENTIFICACAO = 'identificacao';
const ETAPA_CONFIRMACAO = 'confirmacao';
const ETAPA_FORMULARIO_COMPLETO = 'formulario_completo';

const FORMULARIO_INICIAL = {
  nome: '',
  telefone: '',
  idade: '',
  bairro: '',
  problema: '',
  aceitePrivacidade: false,
  autorizacaoMensagens: false,
  autorizacaoLigacoes: false
};

const TEXTOS_CONSENTIMENTO_INICIAIS = {
  avisoPrivacidade: { texto: TEXTO_AVISO_PRIVACIDADE },
  mensagens: { texto: TEXTO_MENSAGENS },
  ligacoes: { texto: TEXTO_LIGACOES }
};

function validarFormulario(dadosFormulario, bairroConfirmado, bairros, categoriasProblema) {
  if (!dadosFormulario.nome.trim()) {
    return 'Informe seu nome.';
  }

  if (dadosFormulario.nome.trim().length < 2) {
    return 'O nome deve ter pelo menos 2 caracteres.';
  }

  if (!dadosFormulario.telefone.trim()) {
    return 'Informe seu telefone.';
  }

  const quantidadeDigitos = dadosFormulario.telefone.replace(/\D/g, '').length;

  if (quantidadeDigitos < 10 || quantidadeDigitos > 15) {
    return 'Informe um telefone válido, com DDD.';
  }

  const idade = Number(dadosFormulario.idade);

  if (!Number.isInteger(idade) || idade < 0 || idade > 32767) {
    return 'Informe uma idade inteira válida.';
  }

  if (!bairroConfirmado || !bairros.includes(dadosFormulario.bairro)) {
    return 'Digite e selecione seu bairro na lista.';
  }

  if (!categoriasProblema.includes(dadosFormulario.problema)) {
    return 'Selecione a principal necessidade do seu bairro.';
  }

  if (!dadosFormulario.aceitePrivacidade) {
    return 'É necessário confirmar o consentimento para participar do projeto.';
  }

  return '';
}

function validarIdentificacaoEvento(dadosFormulario) {
  if (!dadosFormulario.nome.trim() || dadosFormulario.nome.trim().length < 2) {
    return 'Informe seu nome completo.';
  }

  const quantidadeDigitos = dadosFormulario.telefone.replace(/\D/g, '').length;

  if (quantidadeDigitos < 10 || quantidadeDigitos > 15) {
    return 'Informe um telefone válido, com DDD.';
  }

  return '';
}

function FormularioPublico() {
  const [parametrosBusca] = useSearchParams();
  const eventoQr = parametrosBusca.get('evento') || '';
  const numeroWhatsapp = String(import.meta.env.VITE_WHATSAPP_NUMERO || '').replace(/\D/g, '');
  const emailPrivacidade = String(import.meta.env.VITE_PRIVACIDADE_EMAIL || '').trim();
  const linkWhatsapp = numeroWhatsapp.length >= 10 && numeroWhatsapp.length <= 15
    ? 'https://wa.me/' + numeroWhatsapp
    : '';
  const whatsappFormatado = numeroWhatsapp.length === 13 && numeroWhatsapp.startsWith('55')
    ? '(' + numeroWhatsapp.slice(2, 4) + ') ' + numeroWhatsapp.slice(4, 9) + '-' + numeroWhatsapp.slice(9)
    : numeroWhatsapp;
  const [dadosFormulario, setDadosFormulario] = useState(FORMULARIO_INICIAL);
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [tipoMensagem, setTipoMensagem] = useState('informacao');
  const [bairroConfirmado, setBairroConfirmado] = useState(false);
  const [bairros, setBairros] = useState([]);
  const [categoriasProblema, setCategoriasProblema] = useState([]);
  const [carregandoOpcoes, setCarregandoOpcoes] = useState(true);
  const [contextoCadastro, setContextoCadastro] = useState('');
  const [eventoIdExibido, setEventoIdExibido] = useState(null);
  const [etapaFormulario, setEtapaFormulario] = useState(ETAPA_FORMULARIO_COMPLETO);
  const [nomeConfirmacao, setNomeConfirmacao] = useState('');
  const [formularioDisponivel, setFormularioDisponivel] = useState(true);
  const [textosConsentimento, setTextosConsentimento] = useState(
    TEXTOS_CONSENTIMENTO_INICIAIS
  );

  function aplicarContextoFormulario(resposta) {
    const eventoAtivo = resposta.eventoAtivo || null;

    setContextoCadastro(
      eventoAtivo ? resposta.contextoCadastro || '' : ''
    );
    setEventoIdExibido(eventoAtivo ? eventoAtivo.id : null);
    setEtapaFormulario(
      eventoAtivo ? ETAPA_IDENTIFICACAO : ETAPA_FORMULARIO_COMPLETO
    );
    setNomeConfirmacao('');
  }

  useEffect(function () {
    let paginaAtiva = true;

    async function carregarOpcoes() {
      try {
        const resposta = await buscarOpcoesFormulario(false, eventoQr);

        const bairrosRecebidos = resposta.bairros;
        const categoriasRecebidas = resposta.categoriasProblema;
        const textosRecebidos = resposta.textosConsentimento;

        if (
          !Array.isArray(bairrosRecebidos) ||
          bairrosRecebidos.length === 0 ||
          !Array.isArray(categoriasRecebidas) ||
          categoriasRecebidas.length === 0 ||
          !textosRecebidos ||
          !textosRecebidos.avisoPrivacidade ||
          !textosRecebidos.mensagens ||
          !textosRecebidos.ligacoes
        ) {
          throw new Error('O catálogo do formulário está indisponível.');
        }

        if (paginaAtiva) {
          setBairros(bairrosRecebidos);
          setCategoriasProblema(categoriasRecebidas);
          setTextosConsentimento(textosRecebidos);
          setFormularioDisponivel(true);
          aplicarContextoFormulario(resposta);
        }
      } catch (erro) {
        if (paginaAtiva) {
          setTipoMensagem('erro');
          setFormularioDisponivel(erro.statusHttp !== 400 && erro.statusHttp !== 410);
          setMensagem(
            erro.statusHttp === 400 || erro.statusHttp === 410
              ? erro.message
              : 'Não foi possível carregar os bairros. Tente novamente em alguns instantes.'
          );
        }
      } finally {
        if (paginaAtiva) {
          setCarregandoOpcoes(false);
        }
      }
    }

    carregarOpcoes();

    return function () {
      paginaAtiva = false;
    };
  }, [eventoQr]);

  function alterarCampo(evento) {
    const campo = evento.target.name;
    const valor = evento.target.type === 'checkbox'
      ? evento.target.checked
      : evento.target.value;

    setDadosFormulario(Object.assign({}, dadosFormulario, {
      [campo]: valor
    }));
  }

  function alterarBairro(valor) {
    setBairroConfirmado(false);
    setDadosFormulario(Object.assign({}, dadosFormulario, {
      bairro: valor
    }));
  }

  function selecionarBairro(bairro) {
    setBairroConfirmado(true);
    setDadosFormulario(Object.assign({}, dadosFormulario, {
      bairro
    }));
  }

  async function recarregarContextoEvento() {
    try {
      const opcoesAtualizadas = await buscarOpcoesFormulario(true, eventoQr);
      aplicarContextoFormulario(opcoesAtualizadas);
    } catch (erroAtualizacao) {
      setMensagem(
        'O evento do formulário mudou e não foi possível atualizar o contexto. Recarregue a página.'
      );
    }
  }

  async function verificarCadastroNoEvento(evento) {
    evento.preventDefault();
    setMensagem('');

    const mensagemValidacao = validarIdentificacaoEvento(dadosFormulario);

    if (mensagemValidacao) {
      setTipoMensagem('erro');
      setMensagem(mensagemValidacao);
      return;
    }

    setEnviando(true);

    try {
      const resposta = await verificarContatoEvento({
        nome: dadosFormulario.nome.trim(),
        telefone: dadosFormulario.telefone.trim(),
        eventoIdExibido
      });

      if (resposta.situacao === 'novo') {
        setEtapaFormulario(ETAPA_FORMULARIO_COMPLETO);
        setTipoMensagem('informacao');
        setMensagem(resposta.mensagem);
        return;
      }

      if (resposta.situacao === 'ja_inscrito') {
        setTipoMensagem('sucesso');
        setMensagem(resposta.mensagem);
        setDadosFormulario(FORMULARIO_INICIAL);
        return;
      }

      setNomeConfirmacao(dadosFormulario.nome.trim());
      setEtapaFormulario(ETAPA_CONFIRMACAO);
      setTipoMensagem('informacao');
      setMensagem(resposta.mensagem);
    } catch (erro) {
      setTipoMensagem('erro');
      setMensagem(erro.message);

      if (erro.statusHttp === 409) {
        await recarregarContextoEvento();
      }
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarParticipacaoEvento() {
    setMensagem('');
    setEnviando(true);

    try {
      const resposta = await inscreverContatoExistenteEvento({
        nome: nomeConfirmacao,
        telefone: dadosFormulario.telefone.trim(),
        eventoIdExibido
      });

      setTipoMensagem('sucesso');
      setMensagem(resposta.mensagem);
      setDadosFormulario(FORMULARIO_INICIAL);
      setNomeConfirmacao('');
      setEtapaFormulario(ETAPA_IDENTIFICACAO);
    } catch (erro) {
      setTipoMensagem('erro');
      setMensagem(erro.message);

      if (erro.statusHttp === 409) {
        await recarregarContextoEvento();
      }
    } finally {
      setEnviando(false);
    }
  }

  function abrirAtualizacaoDados() {
    setEtapaFormulario(ETAPA_FORMULARIO_COMPLETO);
    setTipoMensagem('informacao');
    setMensagem('Atualize os campos necessários e conclua sua participação no evento.');
  }

  function voltarParaIdentificacao() {
    setEtapaFormulario(ETAPA_IDENTIFICACAO);
    setNomeConfirmacao('');
    setMensagem('');
    setDadosFormulario(FORMULARIO_INICIAL);
    setBairroConfirmado(false);
  }

  async function enviarFormulario(evento) {
    evento.preventDefault();
    setMensagem('');

    const mensagemValidacao = validarFormulario(
      dadosFormulario,
      bairroConfirmado,
      bairros,
      categoriasProblema
    );

    if (mensagemValidacao) {
      setTipoMensagem('erro');
      setMensagem(mensagemValidacao);
      return;
    }

    setEnviando(true);

    try {
      const resposta = await cadastrarContato({
        nome: dadosFormulario.nome.trim(),
        telefone: dadosFormulario.telefone.trim(),
        idade: Number(dadosFormulario.idade),
        bairro: dadosFormulario.bairro.trim(),
        problema: dadosFormulario.problema.trim(),
        eventoIdExibido,
        atualizarDadosEvento: Boolean(nomeConfirmacao),
        nomeConfirmacao: nomeConfirmacao || undefined,
        aceitePrivacidade: dadosFormulario.aceitePrivacidade,
        autorizacaoMensagens: dadosFormulario.autorizacaoMensagens,
        autorizacaoLigacoes: dadosFormulario.autorizacaoLigacoes
      });

      setTipoMensagem('sucesso');
      setMensagem(resposta.mensagem || 'Cadastro realizado com sucesso.');
      setDadosFormulario(FORMULARIO_INICIAL);
      setBairroConfirmado(false);
      setNomeConfirmacao('');
      setEtapaFormulario(
        eventoIdExibido ? ETAPA_IDENTIFICACAO : ETAPA_FORMULARIO_COMPLETO
      );
    } catch (erro) {
      setTipoMensagem('erro');
      setMensagem(erro.message);

      if (erro.statusHttp === 409) {
        await recarregarContextoEvento();
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="pagina-publica">
      <header className="cabecalho-publico">
        <div className="conteudo-cabecalho-publico">
          <div className="identidade-projeto">
            <MarcaAcordaRJ className="marca-cabecalho-publico" />
          </div>
          <span className="responsavel-cabecalho-publico">
            Diogo Ventura · Rio de Janeiro
          </span>
        </div>
      </header>

      <section className="apresentacao-publica" aria-labelledby="titulo-formulario">
        <span>Participação cidadã</span>
        <h1 id="titulo-formulario">Sua voz pode ajudar a transformar o seu bairro.</h1>
        <p>
          Informe a principal necessidade da sua região e ajude a identificar
          as demandas dos bairros do Rio de Janeiro.
        </p>
        <p className="promocao-projeto">
          <strong>Projeto de participação cidadã promovido por Diogo Ventura.</strong>
        </p>
      </section>

      <section className="cartao cartao-formulario" aria-labelledby="titulo-formulario">
        {contextoCadastro && (
          <p className="contexto-cadastro-publico">{contextoCadastro}</p>
        )}

        <MensagemRetorno mensagem={mensagem} tipo={tipoMensagem} />

        {formularioDisponivel && eventoIdExibido && etapaFormulario === ETAPA_IDENTIFICACAO && (
          <form
            className="formulario-publico formulario-identificacao-evento"
            onSubmit={verificarCadastroNoEvento}
            noValidate
          >
            <p className="orientacao-etapa-evento">
              Informe seu nome completo e telefone. Se você já estiver em nossa
              base, poderá confirmar a participação sem preencher tudo novamente.
            </p>

            <div className="grade-formulario">
              <CampoFormulario
                id="nome"
                rotulo="Nome completo"
                valor={dadosFormulario.nome}
                aoAlterar={alterarCampo}
                placeholder="Seu nome completo"
                obrigatorio
                desabilitado={enviando}
                tamanhoMinimo={2}
                tamanhoMaximo={150}
                autoComplete="name"
              />

              <CampoFormulario
                id="telefone"
                rotulo="Telefone"
                tipo="tel"
                valor={dadosFormulario.telefone}
                aoAlterar={alterarCampo}
                placeholder="(21) 99999-9999"
                obrigatorio
                desabilitado={enviando}
                tamanhoMaximo={30}
                autoComplete="tel"
                inputMode="tel"
              />
            </div>

            <div className="acoes-formulario-publico">
              <button
                className="botao botao-primario botao-enviar"
                type="submit"
                disabled={enviando || carregandoOpcoes}
              >
                {enviando ? 'Verificando...' : 'Continuar'}
              </button>

              {linkWhatsapp && (
                <a
                  className="botao-whatsapp-publico"
                  href={linkWhatsapp}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Falar pelo WhatsApp
                </a>
              )}
            </div>
          </form>
        )}

        {formularioDisponivel && eventoIdExibido && etapaFormulario === ETAPA_CONFIRMACAO && (
          <div className="formulario-publico confirmacao-participacao-evento">
            <h2>Confirmar participação</h2>
            <p>
              O cadastro foi confirmado pelo nome completo e telefone informados.
              Nenhum dado pessoal foi exibido ou alterado.
            </p>

            <div className="acoes-formulario-publico">
              <button
                className="botao botao-primario botao-enviar"
                type="button"
                onClick={confirmarParticipacaoEvento}
                disabled={enviando}
              >
                {enviando ? 'Confirmando...' : 'Confirmar participação'}
              </button>
              <button
                className="botao botao-secundario"
                type="button"
                onClick={abrirAtualizacaoDados}
                disabled={enviando}
              >
                Meus dados mudaram
              </button>
              <button
                className="botao botao-secundario"
                type="button"
                onClick={voltarParaIdentificacao}
                disabled={enviando}
              >
                Voltar
              </button>
            </div>
          </div>
        )}

        {formularioDisponivel && etapaFormulario === ETAPA_FORMULARIO_COMPLETO && (
          <form className="formulario-publico" onSubmit={enviarFormulario} noValidate>
            {eventoIdExibido && (
              <p className="orientacao-etapa-evento">
                {nomeConfirmacao
                  ? 'Informe os dados atuais. As alterações serão registradas no histórico antes da participação no evento.'
                  : 'Este telefone ainda não está na base. Complete o cadastro para participar do evento.'}
              </p>
            )}

            <div className="grade-formulario">
              <CampoFormulario
                id="nome"
                rotulo="Nome completo"
                valor={dadosFormulario.nome}
                aoAlterar={alterarCampo}
                placeholder="Seu nome completo"
                obrigatorio
                desabilitado={enviando}
                tamanhoMinimo={2}
                tamanhoMaximo={150}
                autoComplete="name"
              />

              <CampoFormulario
                id="telefone"
                rotulo="Telefone"
                tipo="tel"
                valor={dadosFormulario.telefone}
                aoAlterar={alterarCampo}
                placeholder="(21) 99999-9999"
                obrigatorio
                desabilitado={enviando || Boolean(nomeConfirmacao)}
                tamanhoMaximo={30}
                autoComplete="tel"
                inputMode="tel"
              />

              <CampoFormulario
                id="idade"
                rotulo="Idade"
                tipo="number"
                valor={dadosFormulario.idade}
                aoAlterar={alterarCampo}
                placeholder="Ex.: 35"
                obrigatorio
                desabilitado={enviando}
                minimo={0}
                passo={1}
                inputMode="numeric"
                ajuda="Informe a idade atual em anos completos."
              />

              <CampoSelecaoPesquisavel
                id="bairro"
                rotulo="Bairro"
                valor={dadosFormulario.bairro}
                aoAlterar={alterarBairro}
                aoSelecionar={selecionarBairro}
                opcoes={bairros}
                placeholder="Digite para buscar"
                obrigatorio
                desabilitado={enviando || carregandoOpcoes}
              />

              <CampoSelecao
                id="problema"
                rotulo="Principal necessidade"
                valor={dadosFormulario.problema}
                aoAlterar={alterarCampo}
                opcoes={categoriasProblema}
                placeholder="Selecione uma categoria"
                obrigatorio
                desabilitado={enviando}
              />
            </div>

            <fieldset className="grupo-consentimentos" disabled={enviando}>
              <legend>Privacidade e autorizações</legend>

              <label className="opcao-consentimento" htmlFor="aceitePrivacidade">
                <input
                  id="aceitePrivacidade"
                  name="aceitePrivacidade"
                  type="checkbox"
                  checked={dadosFormulario.aceitePrivacidade}
                  onChange={alterarCampo}
                  required
                />
                <span>
                  {textosConsentimento.avisoPrivacidade.texto}
                  <strong aria-hidden="true"> *</strong>
                </span>
              </label>

              <label className="opcao-consentimento" htmlFor="autorizacaoMensagens">
                <input
                  id="autorizacaoMensagens"
                  name="autorizacaoMensagens"
                  type="checkbox"
                  checked={dadosFormulario.autorizacaoMensagens}
                  onChange={alterarCampo}
                />
                <span>{textosConsentimento.mensagens.texto}</span>
              </label>

              <label className="opcao-consentimento" htmlFor="autorizacaoLigacoes">
                <input
                  id="autorizacaoLigacoes"
                  name="autorizacaoLigacoes"
                  type="checkbox"
                  checked={dadosFormulario.autorizacaoLigacoes}
                  onChange={alterarCampo}
                />
                <span>{textosConsentimento.ligacoes.texto}</span>
              </label>
            </fieldset>

            <p className="aviso-direitos">
              Você poderá solicitar a correção, a exclusão dos seus dados ou a
              revogação das autorizações concedidas. Consulte a nossa{' '}
              <Link to="/privacidade">Política de Privacidade</Link>.
            </p>

            <p className="legenda-obrigatorios">* Campos obrigatórios</p>

            {(linkWhatsapp || emailPrivacidade) && (
              <aside className="atendimento-formulario-publico" aria-label="Canais de atendimento">
                <strong>Canais oficiais</strong>
                <div>
                  {linkWhatsapp && (
                    <a href={linkWhatsapp} rel="noopener noreferrer" target="_blank">
                      WhatsApp: {whatsappFormatado}
                    </a>
                  )}
                  {emailPrivacidade && (
                    <a href={'mailto:' + emailPrivacidade}>
                      E-mail: {emailPrivacidade}
                    </a>
                  )}
                </div>
              </aside>
            )}

            <div className="acoes-formulario-publico">
              <button
                className="botao botao-primario botao-enviar"
                type="submit"
                disabled={enviando || carregandoOpcoes || bairros.length === 0}
              >
                {carregandoOpcoes
                  ? 'Carregando bairros...'
                  : enviando
                    ? 'Enviando...'
                    : eventoIdExibido
                      ? nomeConfirmacao
                        ? 'Atualizar e participar'
                        : 'Cadastrar e participar'
                      : 'Enviar minha resposta'}
              </button>

              {eventoIdExibido && (
                <button
                  className="botao botao-secundario"
                  type="button"
                  onClick={voltarParaIdentificacao}
                  disabled={enviando}
                >
                  Voltar
                </button>
              )}

              {linkWhatsapp && (
                <a
                  className="botao-whatsapp-publico"
                  href={linkWhatsapp}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Falar pelo WhatsApp
                </a>
              )}
            </div>
          </form>
        )}
      </section>

      <section className="resumo-privacidade-publico" aria-labelledby="titulo-privacidade-resumida">
        <div>
          <h2 id="titulo-privacidade-resumida">Privacidade e transparência</h2>
          <p>
            Seus dados ajudam a organizar as demandas dos bairros e são tratados
            conforme as escolhas feitas no formulário.
          </p>
        </div>
        <nav className="links-legais-formulario" aria-label="Informações legais">
          <Link to="/privacidade">Privacidade</Link>
          <Link to="/termos">Termos</Link>
          <Link to="/excluir-dados">Excluir dados</Link>
        </nav>

      </section>

      <footer className="rodape-publico">
        <div className="identificacao-rodape">
          <MarcaAcordaRJ className="marca-rodape-publico" />
          <p>
            <strong>Responsável pela iniciativa e pelo tratamento dos dados:</strong>{' '}
            Diogo Ventura.
          </p>
        </div>
      </footer>
    </main>
  );
}

export default FormularioPublico;
