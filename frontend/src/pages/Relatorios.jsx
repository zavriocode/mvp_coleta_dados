import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CabecalhoAdministrativo from '../components/CabecalhoAdministrativo';
import CampoFormulario from '../components/CampoFormulario';
import CampoSelecao from '../components/CampoSelecao';
import Carregando from '../components/Carregando';
import MensagemRetorno from '../components/MensagemRetorno';
import { baixarCsv, baixarExcel, buscarResumo } from '../services/relatorioService';
import { removerToken } from '../utils/armazenamentoToken';
import { obterUsuario } from '../utils/armazenamentoToken';
import { listarEventos } from '../services/eventoService';
import { buscarOpcoesFormulario, listarOrigens } from '../services/contatoService';

const FILTROS_INICIAIS = {
  bairro: '',
  problema: '',
  origem: '',
  dataInicial: '',
  dataFinal: '',
  eventoId: ''
};

const ROTULOS_RELATORIO = {
  autorizado: 'Autorizado',
  nao_informado: 'Não informado',
  recusado: 'Recusado',
  revogado: 'Revogado'
};

function formatarRotulo(nome) {
  if (typeof nome === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(nome)) {
    const partes = nome.split('-');
    return partes[2] + '/' + partes[1] + '/' + partes[0];
  }

  return ROTULOS_RELATORIO[nome] || nome || 'Não informado';
}

function prepararValorFiltro(valor) {
  return formatarRotulo(valor) === 'Não informado' ? 'nao_informado' : valor;
}

function ordenarPorTotal(itens) {
  return (itens || []).slice().sort(function (primeiro, segundo) {
    return segundo.total - primeiro.total;
  });
}

function GraficoResumo(propriedades) {
  const itensRecebidos = propriedades.itens || [];
  const itensOrdenados = propriedades.preservarOrdem
    ? itensRecebidos.slice(-propriedades.limite)
    : ordenarPorTotal(itensRecebidos).slice(0, propriedades.limite);
  const total = itensRecebidos.reduce(function (soma, item) {
    return soma + item.total;
  }, 0);
  const maiorTotal = itensOrdenados.reduce(function (maior, item) {
    return item.total > maior ? item.total : maior;
  }, 0);
  const itensGrafico = itensOrdenados.slice(0, 4);

  return (
    <section className={'cartao grafico-relatorio ' + (propriedades.destaque ? 'grafico-relatorio-destaque' : '')}>
      <div className="cabecalho-grafico-relatorio">
        <div>
          <span>{propriedades.subtitulo}</span>
          <h2>{propriedades.titulo}</h2>
        </div>
        <strong>{total.toLocaleString('pt-BR')}</strong>
      </div>

      {itensOrdenados.length === 0 && (
        <p className="sem-dados-relatorio">Sem dados para os filtros aplicados.</p>
      )}

      {itensOrdenados.length > 0 && (
        <>
          <div className="visual-grafico-relatorio" aria-label={propriedades.titulo}>
            {itensGrafico.map(function (item) {
              const altura = maiorTotal ? Math.max((item.total / maiorTotal) * 100, 8) : 0;
              return (
                <button
                  className="coluna-grafico-relatorio"
                  key={item.nome}
                  type="button"
                  onClick={function () { propriedades.aoSelecionar(item); }}
                  title={'Mostrar contatos: ' + formatarRotulo(item.nome)}
                >
                  <span className="area-coluna-grafico-relatorio">
                    <span style={{ height: altura + '%' }} />
                  </span>
                  <small>{formatarRotulo(item.nome)}</small>
                </button>
              );
            })}
          </div>

          <div className="legenda-grafico-relatorio">
            {itensOrdenados.map(function (item) {
              const percentual = total ? Math.round((item.total / total) * 100) : 0;
              return (
                <button
                  className="item-grafico-relatorio"
                  key={item.nome}
                  type="button"
                  onClick={function () { propriedades.aoSelecionar(item); }}
                  title={'Mostrar contatos: ' + formatarRotulo(item.nome)}
                >
                  <span className="marcador-grafico-relatorio" />
                  <span title={formatarRotulo(item.nome)}>{formatarRotulo(item.nome)}</span>
                  <strong>{item.total}</strong>
                  <small>{percentual}%</small>
                </button>
              );
            })}
          </div>
        </>
      )}

      {itensRecebidos.length > propriedades.limite && (
        <small className="observacao-grafico-relatorio">
          Exibindo {propriedades.limite} de {itensRecebidos.length} resultados.
        </small>
      )}
    </section>
  );
}

function ProblemasPorBairro(propriedades) {
  const bairros = (propriedades.itens || []).slice(0, 15);

  return (
    <section className="cartao painel-problemas-bairro">
      <div className="cabecalho-grafico-relatorio">
        <div>
          <span>Análise territorial</span>
          <h2>Principais necessidades por bairro</h2>
        </div>
        <strong>{(propriedades.itens || []).length}</strong>
      </div>

      {bairros.length === 0 && (
        <p className="sem-dados-relatorio">Sem dados para os filtros aplicados.</p>
      )}

      <div className="tabela-responsiva">
        <table className="tabela-problemas-bairro">
          <thead>
            <tr><th>Bairro</th><th>Cadastros</th><th>Necessidades registradas</th></tr>
          </thead>
          <tbody>
            {bairros.map(function (item) {
              return (
                <tr key={item.bairro}>
                  <td>
                    <button type="button" onClick={function () { propriedades.aoSelecionar(item.bairro, ''); }}>
                      {item.bairro}
                    </button>
                  </td>
                  <td>{item.total}</td>
                  <td>
                    <div className="lista-problemas-bairro">
                      {item.problemas.map(function (problema) {
                        return (
                          <button
                            key={problema.nome}
                            type="button"
                            onClick={function () { propriedades.aoSelecionar(item.bairro, problema.nome); }}
                          >
                            {problema.nome} <strong>{problema.total}</strong>
                          </button>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function IndicadorRelatorio(propriedades) {
  return (
    <article className="cartao indicador-relatorio">
      <span>{propriedades.rotulo}</span>
      <strong>{propriedades.valor.toLocaleString('pt-BR')}</strong>
      <small>{propriedades.detalhe}</small>
    </article>
  );
}

function Relatorios() {
  const navegacao = useNavigate();
  const [filtros, setFiltros] = useState(FILTROS_INICIAIS);
  const [filtrosAplicados, setFiltrosAplicados] = useState(FILTROS_INICIAIS);
  const [resumo, setResumo] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState('');
  const [eventos, setEventos] = useState([]);
  const [bairros, setBairros] = useState([]);
  const [categoriasProblema, setCategoriasProblema] = useState([]);
  const [origens, setOrigens] = useState([]);
  const usuario = obterUsuario();
  const podeExportar = usuario && usuario.perfil === 'administrador';

  useEffect(function () {
    Promise.all([listarEventos(), buscarOpcoesFormulario(), listarOrigens()]).then(function (respostas) {
      setEventos(respostas[0].eventos || []);
      setBairros(respostas[1].bairros || []);
      setCategoriasProblema(respostas[1].categoriasProblema || []);
      setOrigens(respostas[2].origens || []);
    }).catch(function () {
      setEventos([]);
      setBairros([]);
      setCategoriasProblema([]);
      setOrigens([]);
    });
  }, []);

  useEffect(function () {
    const controlador = new AbortController();

    async function carregar() {
      setCarregando(true);
      try {
        const resposta = await buscarResumo(filtrosAplicados, controlador.signal);
        setResumo(resposta.resumo);
        setMensagem('');
      } catch (erro) {
        if (erro.name === 'AbortError') {
          return;
        }
        if (erro.statusHttp === 401) {
          removerToken();
          navegacao('/login', { replace: true });
          return;
        }
        setMensagem(erro.message);
      } finally {
        if (!controlador.signal.aborted) {
          setCarregando(false);
        }
      }
    }

    carregar();
    return function () { controlador.abort(); };
  }, [filtrosAplicados, navegacao]);

  function alterar(evento) {
    setFiltros(Object.assign({}, filtros, { [evento.target.name]: evento.target.value }));
  }

  function aplicar(evento) {
    evento.preventDefault();
    setFiltrosAplicados(Object.assign({}, filtros));
  }

  function abrirContatos(filtro, valor) {
    const parametros = new URLSearchParams();

    Object.keys(filtrosAplicados).forEach(function (chave) {
      if (filtrosAplicados[chave]) {
        parametros.set(chave, filtrosAplicados[chave]);
      }
    });
    parametros.set(filtro, prepararValorFiltro(valor));
    navegacao('/admin/contatos?' + parametros.toString());
  }

  function abrirProblemasBairro(bairro, problema) {
    const parametros = new URLSearchParams({ bairro: prepararValorFiltro(bairro) });
    if (problema) {
      parametros.set('problema', prepararValorFiltro(problema));
    }
    navegacao('/admin/contatos?' + parametros.toString());
  }

  function abrirDiaCadastro(item) {
    const parametros = new URLSearchParams();

    Object.keys(filtrosAplicados).forEach(function (chave) {
      if (filtrosAplicados[chave]) {
        parametros.set(chave, filtrosAplicados[chave]);
      }
    });
    parametros.set('dataInicial', item.nome);
    parametros.set('dataFinal', item.nome);
    navegacao('/admin/contatos?' + parametros.toString());
  }

  async function exportar(formato) {
    try {
      const resultado = formato === 'xlsx'
        ? await baixarExcel(filtrosAplicados)
        : await baixarCsv(filtrosAplicados);
      const url = URL.createObjectURL(resultado.arquivo);
      const link = document.createElement('a');
      link.href = url;
      link.download = resultado.nomeArquivo;
      link.click();
      URL.revokeObjectURL(url);
    } catch (erro) {
      if (erro.statusHttp === 401) {
        removerToken();
        navegacao('/login', { replace: true });
      } else {
        setMensagem(erro.message);
      }
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
          titulo="Relatórios"
          subtitulo="Analise segmentos e exporte os dados autorizados."
        />
        <Link className="link-voltar" to="/admin/contatos">← Voltar para contatos</Link>

        <section className="cartao painel-filtros">
          <div className="cabecalho-secao">
            <div>
              <span className="etiqueta-pagina">Análise operacional</span>
              <h2>Relatórios e segmentação</h2>
            </div>
          </div>
          <form className="formulario-filtros" onSubmit={aplicar}>
            <fieldset className="grade-filtros">
              <CampoSelecao id="bairro" rotulo="Bairro" valor={filtros.bairro} aoAlterar={alterar} opcoes={bairros} placeholder="Todos" />
              <CampoSelecao id="problema" rotulo="Categoria" valor={filtros.problema} aoAlterar={alterar} opcoes={categoriasProblema} placeholder="Todas" />
              <CampoSelecao
                id="origem"
                rotulo="Origem"
                valor={filtros.origem}
                aoAlterar={alterar}
                opcoes={[
                  { valor: 'nao_informado', rotulo: 'Não informado' }
                ].concat(origens.map(function (origem) {
                  return { valor: origem.nome, rotulo: origem.nome };
                }))}
                placeholder="Todas"
              />
              <CampoFormulario id="dataInicial" rotulo="Data inicial" tipo="date" valor={filtros.dataInicial} aoAlterar={alterar} />
              <CampoFormulario id="dataFinal" rotulo="Data final" tipo="date" valor={filtros.dataFinal} aoAlterar={alterar} />
              <CampoSelecao id="eventoId" rotulo="Evento" valor={filtros.eventoId} aoAlterar={alterar} opcoes={[{ valor: 'sem_evento', rotulo: 'Cadastro geral (sem evento)' }].concat(eventos.map(function (item) { return { valor: String(item.id), rotulo: item.nome }; }))} placeholder="Todos" />
            </fieldset>
            <div className="acoes-filtros">
              <button className="botao botao-primario" type="submit">Atualizar gráficos</button>
              {podeExportar && (
                <>
                  <button className="botao botao-secundario" type="button" onClick={function () { exportar('csv'); }}>Exportar CSV</button>
                  <button className="botao botao-secundario" type="button" onClick={function () { exportar('xlsx'); }}>Exportar Excel</button>
                </>
              )}
            </div>
          </form>
        </section>

        {mensagem && <MensagemRetorno mensagem={mensagem} tipo="erro" />}
        {carregando && <Carregando mensagem="Gerando relatório..." />}
        {!carregando && resumo && (
          <>
            <section className="grade-indicadores-relatorio" aria-label="Indicadores do relatório">
              <IndicadorRelatorio rotulo="Total filtrado" valor={resumo.totalContatos} detalhe="Contatos encontrados" />
              <IndicadorRelatorio rotulo="Bairros" valor={resumo.porBairro.length} detalhe="Regiões representadas" />
              <IndicadorRelatorio rotulo="Categorias" valor={resumo.porProblema.length} detalhe="Necessidades diferentes" />
              <IndicadorRelatorio rotulo="Origens" valor={resumo.porOrigem.length} detalhe="Fontes de cadastro" />
            </section>

            <div className="grade-graficos-relatorio">
              <GraficoResumo titulo="Contatos por bairro" subtitulo="Distribuição territorial" itens={resumo.porBairro} limite={10} destaque aoSelecionar={function (item) { abrirContatos('bairro', item.nome); }} />
              <GraficoResumo titulo="Principais necessidades" subtitulo="Categorias informadas" itens={resumo.porProblema} limite={10} destaque aoSelecionar={function (item) { abrirContatos('problema', item.nome); }} />
              <GraficoResumo titulo="Faixa etária" subtitulo="Perfil dos contatos" itens={resumo.porFaixaEtaria} limite={8} />
              <GraficoResumo titulo="Origem dos contatos" subtitulo="Canais de entrada" itens={resumo.porOrigem} limite={8} aoSelecionar={function (item) { abrirContatos('origem', item.nome); }} />
              <GraficoResumo titulo="Mensagens" subtitulo="Autorizações" itens={resumo.porAutorizacaoMensagens} limite={8} aoSelecionar={function (item) { abrirContatos('autorizacaoMensagens', item.nome); }} />
              <GraficoResumo titulo="Ligações" subtitulo="Autorizações" itens={resumo.porAutorizacaoLigacoes} limite={8} aoSelecionar={function (item) { abrirContatos('autorizacaoLigacoes', item.nome); }} />
              <GraficoResumo titulo="Cadastros por dia" subtitulo="Evolução recente" itens={resumo.porPeriodo} limite={12} preservarOrdem aoSelecionar={abrirDiaCadastro} />
            </div>

            <ProblemasPorBairro itens={resumo.problemasPorBairro} aoSelecionar={abrirProblemasBairro} />
          </>
        )}
      </div>
    </main>
  );
}

export default Relatorios;
