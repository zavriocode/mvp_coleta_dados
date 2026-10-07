import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CabecalhoAdministrativo from '../components/CabecalhoAdministrativo';
import CampoFormulario from '../components/CampoFormulario';
import CampoSelecao from '../components/CampoSelecao';
import Carregando from '../components/Carregando';
import MensagemRetorno from '../components/MensagemRetorno';
import {
  alterarPropriaSenha,
  atualizarProprioNome,
  criarUsuario,
  excluirUsuario,
  listarUsuarios,
  redefinirSenhaUsuario
} from '../services/usuarioService';
import { obterUsuario, removerToken, salvarUsuario } from '../utils/armazenamentoToken';

const DADOS_INICIAIS = {
  nome: '',
  email: '',
  senha: '',
  perfil: 'operador'
};

const OPCOES_PERFIL = [
  { valor: 'operador', rotulo: 'Operador' },
  { valor: 'administrador', rotulo: 'Administrador' }
];

const formatadorData = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short'
});

function formatarData(valor) {
  const data = new Date(valor);

  if (Number.isNaN(data.getTime())) {
    return '—';
  }

  return formatadorData.format(data);
}

function UsuariosAdministrativos() {
  const navegacao = useNavigate();
  const usuarioInicial = obterUsuario();
  const [usuarioAtual, setUsuarioAtual] = useState(usuarioInicial);
  const [nomeProprio, setNomeProprio] = useState(usuarioInicial ? usuarioInicial.nome : '');
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [mensagemNome, setMensagemNome] = useState('');
  const [tipoMensagemNome, setTipoMensagemNome] = useState('informacao');
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenhaPropria, setNovaSenhaPropria] = useState('');
  const [confirmacaoSenhaPropria, setConfirmacaoSenhaPropria] = useState('');
  const [alterandoSenhaPropria, setAlterandoSenhaPropria] = useState(false);
  const [mensagemSenhaPropria, setMensagemSenhaPropria] = useState('');
  const [tipoMensagemSenhaPropria, setTipoMensagemSenhaPropria] = useState('informacao');
  const [dados, setDados] = useState(DADOS_INICIAIS);
  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [tipoMensagem, setTipoMensagem] = useState('informacao');
  const [versaoLista, setVersaoLista] = useState(0);
  const [usuarioSelecionado, setUsuarioSelecionado] = useState(null);
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmacaoSenha, setConfirmacaoSenha] = useState('');
  const [redefinindoSenha, setRedefinindoSenha] = useState(false);
  const [mensagemSenha, setMensagemSenha] = useState('');
  const [tipoMensagemSenha, setTipoMensagemSenha] = useState('informacao');
  const [excluindoUsuarioId, setExcluindoUsuarioId] = useState(null);

  useEffect(function () {
    const controlador = new AbortController();

    async function carregarUsuarios() {
      setCarregando(true);

      try {
        const resposta = await listarUsuarios(controlador.signal);
        setUsuarios(resposta.usuarios || []);
      } catch (erro) {
        if (erro.name === 'AbortError') {
          return;
        }

        if (erro.statusHttp === 401) {
          removerToken();
          navegacao('/login', { replace: true });
          return;
        }

        if (erro.statusHttp === 403) {
          navegacao('/admin', { replace: true });
          return;
        }

        setTipoMensagem('erro');
        setMensagem(erro.message);
      } finally {
        if (!controlador.signal.aborted) {
          setCarregando(false);
        }
      }
    }

    carregarUsuarios();
    return function () { controlador.abort(); };
  }, [navegacao, versaoLista]);

  function alterar(evento) {
    setDados(Object.assign({}, dados, {
      [evento.target.name]: evento.target.value
    }));
  }

  async function excluirConta(usuario) {
    if (!usuarioAtual || Number(usuarioAtual.id) === Number(usuario.id)) {
      setTipoMensagem('erro');
      setMensagem('Você não pode excluir sua própria conta.');
      return;
    }

    const perfil = usuario.perfil === 'administrador' ? 'administrador' : 'operador';
    const pergunta = 'Deseja excluir este ' + perfil + '?\nEle perderá o acesso. Históricos vinculados à conta e importações realizadas por ela serão apagados. Eventos, modelos e campanhas continuarão disponíveis.';
    if (!window.confirm(pergunta)) return;

    setExcluindoUsuarioId(usuario.id);
    setMensagem('');
    try {
      const resposta = await excluirUsuario(usuario.id);
      setTipoMensagem('sucesso');
      setMensagem(resposta.mensagem);
      setVersaoLista(versaoLista + 1);
    } catch (erro) {
      setTipoMensagem('erro');
      setMensagem(erro.message);
    } finally {
      setExcluindoUsuarioId(null);
    }
  }

  async function salvarNomeProprio(evento) {
    evento.preventDefault();
    setMensagemNome('');
    setSalvandoNome(true);

    try {
      const resposta = await atualizarProprioNome(nomeProprio.trim());
      const usuarioAtualizado = Object.assign({}, usuarioAtual, resposta.usuario);
      salvarUsuario(usuarioAtualizado);
      setUsuarioAtual(usuarioAtualizado);
      setNomeProprio(usuarioAtualizado.nome);
      setTipoMensagemNome('sucesso');
      setMensagemNome(resposta.mensagem);
      setVersaoLista(versaoLista + 1);
    } catch (erro) {
      if (erro.statusHttp === 401) {
        removerToken();
        navegacao('/login', { replace: true });
        return;
      }

      setTipoMensagemNome('erro');
      setMensagemNome(erro.message);
    } finally {
      setSalvandoNome(false);
    }
  }

  async function enviar(evento) {
    evento.preventDefault();
    setMensagem('');
    setSalvando(true);

    try {
      const resposta = await criarUsuario({
        nome: dados.nome.trim(),
        email: dados.email.trim(),
        senha: dados.senha,
        perfil: dados.perfil
      });
      setDados(DADOS_INICIAIS);
      setTipoMensagem('sucesso');
      setMensagem(resposta.mensagem);
      setVersaoLista(versaoLista + 1);
    } catch (erro) {
      if (erro.statusHttp === 401) {
        removerToken();
        navegacao('/login', { replace: true });
        return;
      }

      if (erro.statusHttp === 403) {
        navegacao('/admin', { replace: true });
        return;
      }

      setTipoMensagem('erro');
      setMensagem(erro.message);
    } finally {
      setSalvando(false);
    }
  }

  async function enviarAlteracaoSenhaPropria(evento) {
    evento.preventDefault();
    setMensagemSenhaPropria('');

    if (novaSenhaPropria.length < 12) {
      setTipoMensagemSenhaPropria('erro');
      setMensagemSenhaPropria('A nova senha deve ter pelo menos 12 caracteres.');
      return;
    }

    if (novaSenhaPropria !== confirmacaoSenhaPropria) {
      setTipoMensagemSenhaPropria('erro');
      setMensagemSenhaPropria('A confirmação da senha não corresponde à nova senha.');
      return;
    }

    setAlterandoSenhaPropria(true);

    try {
      const resposta = await alterarPropriaSenha(senhaAtual, novaSenhaPropria);
      setSenhaAtual('');
      setNovaSenhaPropria('');
      setConfirmacaoSenhaPropria('');
      setTipoMensagemSenhaPropria('sucesso');
      setMensagemSenhaPropria(resposta.mensagem);
    } catch (erro) {
      if (erro.statusHttp === 401) {
        removerToken();
        navegacao('/login', { replace: true });
        return;
      }

      setTipoMensagemSenhaPropria('erro');
      setMensagemSenhaPropria(erro.message);
    } finally {
      setAlterandoSenhaPropria(false);
    }
  }

  function abrirRedefinicaoSenha(usuario) {
    setUsuarioSelecionado(usuario);
    setNovaSenha('');
    setConfirmacaoSenha('');
    setMensagemSenha('');
  }

  function cancelarRedefinicaoSenha() {
    setUsuarioSelecionado(null);
    setNovaSenha('');
    setConfirmacaoSenha('');
    setMensagemSenha('');
  }

  async function enviarRedefinicaoSenha(evento) {
    evento.preventDefault();
    setMensagemSenha('');

    if (novaSenha.length < 12) {
      setTipoMensagemSenha('erro');
      setMensagemSenha('A nova senha deve ter pelo menos 12 caracteres.');
      return;
    }

    if (novaSenha !== confirmacaoSenha) {
      setTipoMensagemSenha('erro');
      setMensagemSenha('A confirmação da senha não corresponde à nova senha.');
      return;
    }

    setRedefinindoSenha(true);

    try {
      const resposta = await redefinirSenhaUsuario(usuarioSelecionado.id, novaSenha);
      setUsuarioSelecionado(null);
      setNovaSenha('');
      setConfirmacaoSenha('');
      setTipoMensagemSenha('sucesso');
      setMensagemSenha(resposta.mensagem);
    } catch (erro) {
      if (erro.statusHttp === 401) {
        removerToken();
        navegacao('/login', { replace: true });
        return;
      }

      if (erro.statusHttp === 403) {
        navegacao('/admin', { replace: true });
        return;
      }

      setTipoMensagemSenha('erro');
      setMensagemSenha(erro.message);
    } finally {
      setRedefinindoSenha(false);
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
          titulo="Usuários"
          subtitulo="Cadastre administradores e operadores do ACORDA RJ."
        />

        <div className="grade-gestao-usuarios">
          <section className="cartao painel-usuario-formulario">
            <div className="cabecalho-secao">
              <div>
                <span className="etiqueta-pagina">Meu perfil</span>
                <h2>Nome no sistema</h2>
              </div>
            </div>

            <MensagemRetorno mensagem={mensagemNome} tipo={tipoMensagemNome} />

            <form className="formulario-filtros formulario-meu-perfil" onSubmit={salvarNomeProprio}>
              <CampoFormulario
                id="nomeProprio"
                nome="nomeProprio"
                rotulo="Seu nome"
                valor={nomeProprio}
                aoAlterar={function (evento) { setNomeProprio(evento.target.value); }}
                obrigatorio
                desabilitado={salvandoNome}
                tamanhoMinimo={2}
                tamanhoMaximo={150}
              />
              <button className="botao botao-secundario" type="submit" disabled={salvandoNome}>
                {salvandoNome ? 'Salvando...' : 'Salvar meu nome'}
              </button>
            </form>

            <div className="cabecalho-secao cabecalho-alterar-senha-propria">
              <div>
                <span className="etiqueta-pagina">Segurança</span>
                <h2>Alterar minha senha</h2>
              </div>
            </div>

            <MensagemRetorno mensagem={mensagemSenhaPropria} tipo={tipoMensagemSenhaPropria} />

            <form className="formulario-filtros" onSubmit={enviarAlteracaoSenhaPropria}>
              <CampoFormulario
                id="senhaAtual"
                rotulo="Senha atual"
                tipo="password"
                valor={senhaAtual}
                aoAlterar={function (evento) { setSenhaAtual(evento.target.value); }}
                obrigatorio
                desabilitado={alterandoSenhaPropria}
                tamanhoMaximo={72}
                autoComplete="current-password"
              />
              <CampoFormulario
                id="novaSenhaPropria"
                rotulo="Nova senha"
                tipo="password"
                valor={novaSenhaPropria}
                aoAlterar={function (evento) { setNovaSenhaPropria(evento.target.value); }}
                obrigatorio
                desabilitado={alterandoSenhaPropria}
                tamanhoMinimo={12}
                tamanhoMaximo={72}
                autoComplete="new-password"
                ajuda="Use pelo menos 12 caracteres."
              />
              <CampoFormulario
                id="confirmacaoSenhaPropria"
                rotulo="Confirmar nova senha"
                tipo="password"
                valor={confirmacaoSenhaPropria}
                aoAlterar={function (evento) { setConfirmacaoSenhaPropria(evento.target.value); }}
                obrigatorio
                desabilitado={alterandoSenhaPropria}
                tamanhoMinimo={12}
                tamanhoMaximo={72}
                autoComplete="new-password"
              />
              <button className="botao botao-secundario" type="submit" disabled={alterandoSenhaPropria}>
                {alterandoSenhaPropria ? 'Alterando...' : 'Alterar minha senha'}
              </button>
            </form>

            <hr className="separador-usuarios" />

            <div className="cabecalho-secao">
              <div>
                <span className="etiqueta-pagina">Acesso interno</span>
                <h2>Novo usuário</h2>
              </div>
            </div>

            <MensagemRetorno mensagem={mensagem} tipo={tipoMensagem} />

            <form className="formulario-filtros" onSubmit={enviar}>
              <CampoFormulario id="nome" rotulo="Nome" valor={dados.nome} aoAlterar={alterar} obrigatorio desabilitado={salvando} />
              <CampoFormulario id="email" rotulo="Email" tipo="email" valor={dados.email} aoAlterar={alterar} obrigatorio desabilitado={salvando} autoComplete="off" ajuda="Usado como identificador de acesso ao sistema." />
              <CampoFormulario id="senha" rotulo="Senha inicial" tipo="password" valor={dados.senha} aoAlterar={alterar} obrigatorio desabilitado={salvando} tamanhoMinimo={12} tamanhoMaximo={72} autoComplete="new-password" ajuda="Use pelo menos 12 caracteres." />
              <CampoSelecao id="perfil" rotulo="Perfil de acesso" valor={dados.perfil} aoAlterar={alterar} opcoes={OPCOES_PERFIL} desabilitado={salvando} />

              <div className="explicacao-perfis">
                <p><strong>Operador:</strong> acessa contatos, cadastros, importações e relatórios.</p>
                <p><strong>Administrador:</strong> possui os mesmos acessos e também gerencia usuários.</p>
                <p>Administradores podem excluir outras contas, mas nunca a própria conta ou o último administrador ativo.</p>
              </div>

              <button className="botao botao-primario" type="submit" disabled={salvando}>
                {salvando ? 'Criando...' : 'Criar usuário'}
              </button>
            </form>
          </section>

          <section className="cartao painel-lista-usuarios">
            <div className="cabecalho-resultados">
              <div>
                <h2>Equipe cadastrada</h2>
                <p>{usuarios.length} usuário(s)</p>
              </div>
            </div>

            <MensagemRetorno mensagem={mensagemSenha} tipo={tipoMensagemSenha} />

            {usuarioSelecionado && (
              <form className="painel-redefinir-senha" onSubmit={enviarRedefinicaoSenha}>
                <div>
                  <span className="etiqueta-pagina">Redefinição administrativa</span>
                  <h3>Nova senha para {usuarioSelecionado.nome}</h3>
                  <p>{usuarioSelecionado.email} · {usuarioSelecionado.perfil}</p>
                </div>

                <div className="grade-redefinir-senha">
                  <CampoFormulario
                    id="novaSenhaUsuario"
                    nome="novaSenhaUsuario"
                    rotulo="Nova senha"
                    tipo="password"
                    valor={novaSenha}
                    aoAlterar={function (evento) { setNovaSenha(evento.target.value); }}
                    obrigatorio
                    desabilitado={redefinindoSenha}
                    tamanhoMinimo={12}
                    tamanhoMaximo={72}
                    autoComplete="new-password"
                  />
                  <CampoFormulario
                    id="confirmacaoSenhaUsuario"
                    nome="confirmacaoSenhaUsuario"
                    rotulo="Confirmar nova senha"
                    tipo="password"
                    valor={confirmacaoSenha}
                    aoAlterar={function (evento) { setConfirmacaoSenha(evento.target.value); }}
                    obrigatorio
                    desabilitado={redefinindoSenha}
                    tamanhoMinimo={12}
                    tamanhoMaximo={72}
                    autoComplete="new-password"
                  />
                </div>

                <div className="acoes-redefinir-senha">
                  <button className="botao botao-primario" type="submit" disabled={redefinindoSenha}>
                    {redefinindoSenha ? 'Redefinindo...' : 'Salvar nova senha'}
                  </button>
                  <button className="botao botao-secundario" type="button" onClick={cancelarRedefinicaoSenha} disabled={redefinindoSenha}>
                    Cancelar
                  </button>
                </div>
              </form>
            )}

            {carregando && <Carregando mensagem="Carregando usuários..." />}
            {!carregando && usuarios.length === 0 && <p className="sem-dados-dashboard">Nenhum usuário cadastrado.</p>}
            {!carregando && usuarios.length > 0 && (
              <div className="tabela-responsiva">
                <table className="tabela-usuarios">
                  <thead>
                    <tr><th>Nome</th><th>Email</th><th>Perfil</th><th>Status</th><th>Criado em</th><th>Ações</th></tr>
                  </thead>
                  <tbody>
                    {usuarios.map(function (usuario) {
                      return (
                        <tr key={usuario.id}>
                          <td><strong>{usuario.nome}</strong></td>
                          <td>{usuario.email}</td>
                          <td><span className={'badge-perfil badge-perfil-' + usuario.perfil}>{usuario.perfil}</span></td>
                          <td>{usuario.ativo ? 'Ativo' : 'Inativo'}</td>
                          <td>{formatarData(usuario.criadoEm)}</td>
                          <td>
                            {usuarioAtual && Number(usuarioAtual.id) === Number(usuario.id) ? (
                              <span className="texto-conta-atual">Conta atual</span>
                            ) : (
                              <span className="acoes-tabela">
                                {usuario.perfil === 'operador' && <button
                                  className="botao botao-secundario botao-redefinir-senha"
                                  type="button"
                                  onClick={function () { abrirRedefinicaoSenha(usuario); }}
                                >
                                  Redefinir senha
                                </button>}
                                <button
                                  className="botao botao-perigo"
                                  type="button"
                                  disabled={excluindoUsuarioId === usuario.id}
                                  onClick={function () { excluirConta(usuario); }}
                                >
                                  {excluindoUsuarioId === usuario.id ? 'Excluindo...' : 'Excluir usuário'}
                                </button>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

export default UsuariosAdministrativos;
