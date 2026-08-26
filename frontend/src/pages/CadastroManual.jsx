import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import CabecalhoAdministrativo from '../components/CabecalhoAdministrativo';
import CampoFormulario from '../components/CampoFormulario';
import CampoSelecao from '../components/CampoSelecao';
import CampoSelecaoPesquisavel from '../components/CampoSelecaoPesquisavel';
import MensagemRetorno from '../components/MensagemRetorno';
import {
  buscarOpcoesFormulario,
  buscarDetalhesContato,
  cadastrarContatoManual,
  listarOrigens
} from '../services/contatoService';
import { removerToken } from '../utils/armazenamentoToken';

const DADOS_INICIAIS = {
  nome: '',
  telefone: '',
  bairro: '',
  idade: '',
  problema: '',
  origemId: '',
  status: 'ativo',
  aceitePrivacidade: false,
  autorizacaoMensagens: 'nao_informado',
  autorizacaoLigacoes: 'nao_informado'
};

const OPCOES_AUTORIZACAO = [
  { valor: 'nao_informado', rotulo: 'Não informado' },
  { valor: 'autorizado', rotulo: 'Autorizado' },
  { valor: 'recusado', rotulo: 'Recusado explicitamente' }
];

function CadastroManual() {
  const navegacao = useNavigate();
  const [parametrosBusca] = useSearchParams();
  const contatoId = parametrosBusca.get('contatoId');
  const editando = Boolean(contatoId);
  const [dados, setDados] = useState(DADOS_INICIAIS);
  const [origens, setOrigens] = useState([]);
  const [bairros, setBairros] = useState([]);
  const [categoriasProblema, setCategoriasProblema] = useState([]);
  const [bairroConfirmado, setBairroConfirmado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [tipoMensagem, setTipoMensagem] = useState('informacao');
  const [carregandoEdicao, setCarregandoEdicao] = useState(true);

  useEffect(function () {
    const controlador = new AbortController();

    async function carregarDados() {
      try {
        const resultados = await Promise.all([
          listarOrigens(controlador.signal),
          buscarOpcoesFormulario(),
          editando
            ? buscarDetalhesContato(contatoId, controlador.signal)
            : Promise.resolve(null)
        ]);
        const respostaOrigens = resultados[0];
        const respostaOpcoes = resultados[1];
        const detalhes = resultados[2];
        const bairrosRecebidos = respostaOpcoes.bairros;
        const categoriasRecebidas = respostaOpcoes.categoriasProblema;

        if (
          !Array.isArray(bairrosRecebidos) ||
          bairrosRecebidos.length === 0 ||
          !Array.isArray(categoriasRecebidas) ||
          categoriasRecebidas.length === 0
        ) {
          throw new Error('Os catálogos de cadastro estão indisponíveis.');
        }

        setBairros(bairrosRecebidos);
        setCategoriasProblema(categoriasRecebidas);
        const opcoes = (respostaOrigens.origens || []).map(function (origem) {
          return { valor: String(origem.id), rotulo: origem.nome };
        });
        setOrigens(opcoes);

        if (detalhes) {
          const contato = detalhes.contato;
          const bairroDoContato = contato.bairro || '';

          setDados(Object.assign({}, DADOS_INICIAIS, {
            nome: contato.nome || '',
            telefone: contato.telefone || '',
            bairro: bairroDoContato,
            idade: contato.idade === null || contato.idade === undefined
              ? ''
              : String(contato.idade),
            problema: contato.problema || '',
            origemId: contato.origem && contato.origem.id
              ? String(contato.origem.id)
              : '',
            status: contato.statusContato || 'ativo'
          }));
          setBairroConfirmado(
            Boolean(bairroDoContato) && bairrosRecebidos.includes(bairroDoContato)
          );
          return;
        }

        const origemManual = (respostaOrigens.origens || []).find(function (origem) {
          return origem.slug === 'cadastro-manual';
        });

        if (origemManual) {
          setDados(Object.assign({}, DADOS_INICIAIS, {
            origemId: String(origemManual.id)
          }));
        }
      } catch (erro) {
        if (erro.statusHttp === 401) {
          removerToken();
          navegacao('/login', { replace: true });
        } else if (erro.name !== 'AbortError') {
          setTipoMensagem('erro');
          setMensagem(erro.message);
        }
      } finally {
        if (!controlador.signal.aborted) {
          setCarregandoEdicao(false);
        }
      }
    }

    carregarDados();

    return function () {
      controlador.abort();
    };
  }, [contatoId, editando, navegacao]);

  function alterar(evento) {
    const campo = evento.target.name;
    const valor = evento.target.type === 'checkbox'
      ? evento.target.checked
      : evento.target.value;
    setDados(Object.assign({}, dados, { [campo]: valor }));
  }

  function alterarBairro(valor) {
    setBairroConfirmado(false);
    setDados(Object.assign({}, dados, { bairro: valor }));
  }

  function selecionarBairro(valor) {
    setBairroConfirmado(true);
    setDados(Object.assign({}, dados, { bairro: valor }));
  }

  async function enviar(evento) {
    evento.preventDefault();
    setMensagem('');

    if (!bairroConfirmado || !bairros.includes(dados.bairro)) {
      setTipoMensagem('erro');
      setMensagem('Digite e selecione o bairro na lista.');
      return;
    }

    setEnviando(true);

    try {
      const resposta = await cadastrarContatoManual(Object.assign({}, dados, {
        idade: Number(dados.idade),
        origemId: Number(dados.origemId)
      }));
      navegacao('/admin/contatos/' + resposta.contatoId, { replace: true });
    } catch (erro) {
      if (erro.statusHttp === 401) {
        removerToken();
        navegacao('/login', { replace: true });
        return;
      }

      setTipoMensagem('erro');
      setMensagem(erro.message);
    } finally {
      setEnviando(false);
    }
  }

  function sair() {
    removerToken();
    navegacao('/login', { replace: true });
  }

  return (
    <main className="pagina-administrativa">
      <div className="conteudo-administrativo">
        <CabecalhoAdministrativo
          aoSair={sair}
          titulo={editando ? 'Editar contato' : 'Novo cadastro'}
          subtitulo={editando
            ? 'Atualize os dados com registro automático no histórico.'
            : 'Registre um contato pela equipe administrativa.'}
        />
        <Link
          className="link-voltar"
          to={editando ? '/admin/contatos/' + contatoId : '/admin/contatos'}
        >
          ← {editando ? 'Voltar para o contato' : 'Voltar para contatos'}
        </Link>

        <section className="cartao painel-filtros">
          <div className="cabecalho-secao">
            <div>
              <span className="etiqueta-pagina">Operação interna</span>
              <h2>{editando ? 'Edição de contato' : 'Cadastro manual'}</h2>
            </div>
            <p>
              {editando
                ? 'Operadores e administradores podem editar. O telefone e a origem permanecem fixos.'
                : 'Dados existentes somente serão alterados com registro no histórico.'}
            </p>
          </div>
          <MensagemRetorno mensagem={mensagem} tipo={tipoMensagem} />

          <form className="formulario-filtros" onSubmit={enviar}>
            <fieldset className="grade-filtros" disabled={enviando || carregandoEdicao}>
              <CampoFormulario id="nome" rotulo="Nome" valor={dados.nome} aoAlterar={alterar} obrigatorio />
              <CampoFormulario id="telefone" rotulo="Telefone" tipo="tel" valor={dados.telefone} aoAlterar={alterar} desabilitado={editando} obrigatorio />
              <CampoFormulario id="idade" rotulo="Idade" tipo="number" valor={dados.idade} aoAlterar={alterar} minimo={0} passo={1} obrigatorio />
              <CampoSelecaoPesquisavel id="bairro" rotulo="Bairro" valor={dados.bairro} aoAlterar={alterarBairro} aoSelecionar={selecionarBairro} opcoes={bairros} obrigatorio />
              <CampoSelecao id="problema" rotulo="Categoria" valor={dados.problema} aoAlterar={alterar} opcoes={categoriasProblema} placeholder="Selecione" obrigatorio />
              <CampoSelecao id="origemId" rotulo="Origem" valor={dados.origemId} aoAlterar={alterar} opcoes={origens} placeholder="Selecione" desabilitado={editando} obrigatorio />
              <CampoFormulario id="status" rotulo="Status" valor={dados.status} aoAlterar={alterar} obrigatorio />
              <CampoSelecao id="autorizacaoMensagens" rotulo="Autorização de mensagens" valor={dados.autorizacaoMensagens} aoAlterar={alterar} opcoes={OPCOES_AUTORIZACAO} />
              <CampoSelecao id="autorizacaoLigacoes" rotulo="Autorização de ligações" valor={dados.autorizacaoLigacoes} aoAlterar={alterar} opcoes={OPCOES_AUTORIZACAO} />
              <label className="opcao-consentimento opcao-consentimento-admin" htmlFor="aceitePrivacidade">
                <input id="aceitePrivacidade" name="aceitePrivacidade" type="checkbox" checked={dados.aceitePrivacidade} onChange={alterar} />
                <span>A pessoa aceitou expressamente o Aviso de Privacidade apresentado.</span>
              </label>
            </fieldset>
            <button className="botao botao-primario" type="submit" disabled={enviando || carregandoEdicao}>
              {enviando
                ? 'Salvando...'
                : editando
                  ? 'Salvar alterações'
                  : 'Salvar contato'}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

export default CadastroManual;
