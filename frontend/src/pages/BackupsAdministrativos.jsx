import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CabecalhoAdministrativo from '../components/CabecalhoAdministrativo';
import Carregando from '../components/Carregando';
import MensagemRetorno from '../components/MensagemRetorno';
import { baixarBackup, gerarBackup, listarBackups } from '../services/backupService';
import { removerToken } from '../utils/armazenamentoToken';

function formatarData(valor) {
  if (!valor) {
    return '—';
  }
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(valor));
}

function formatarTamanho(valor) {
  const bytes = Number(valor || 0);
  if (!bytes) {
    return '—';
  }
  return (bytes / 1024 / 1024).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + ' MB';
}

const ROTULOS_STATUS = {
  aguardando: 'Aguardando',
  processando: 'Processando',
  concluido: 'Concluído',
  falhou: 'Erro'
};

function BackupsAdministrativos() {
  const navegacao = useNavigate();
  const [backups, setBackups] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [baixandoId, setBaixandoId] = useState(null);
  const [mensagem, setMensagem] = useState('');
  const [tipoMensagem, setTipoMensagem] = useState('informacao');

  async function carregar() {
    setCarregando(true);
    try {
      const resposta = await listarBackups();
      setBackups(resposta.backups || []);
    } catch (erro) {
      if (erro.statusHttp === 401) {
        removerToken();
        navegacao('/login', { replace: true });
      } else {
        setTipoMensagem('erro');
        setMensagem(erro.message);
      }
    } finally {
      setCarregando(false);
    }
  }

  useEffect(function () {
    carregar();
  }, []);

  async function gerarNovoBackup() {
    if (!window.confirm('Gerar agora um novo backup dos dados do sistema?')) {
      return;
    }

    setGerando(true);
    setMensagem('');
    try {
      const resultado = await gerarBackup();
      setTipoMensagem('sucesso');
      setMensagem(resultado.mensagem || 'Backup gerado com sucesso. Clique em Baixar para salvar o arquivo.');
      await carregar();
    } catch (erro) {
      if (erro.statusHttp === 401) {
        removerToken();
        navegacao('/login', { replace: true });
      } else {
        setTipoMensagem('erro');
        setMensagem(erro.message);
      }
    } finally {
      setGerando(false);
    }
  }

  async function baixar(id) {
    setBaixandoId(id);
    setMensagem('');
    try {
      const resultado = await baixarBackup(id);
      const url = URL.createObjectURL(resultado.arquivo);
      const link = document.createElement('a');
      link.href = url;
      link.download = resultado.nomeArquivo;
      link.click();
      URL.revokeObjectURL(url);
      setTipoMensagem('sucesso');
      setMensagem('Backup baixado com sucesso e removido do armazenamento temporário do sistema.');
      await carregar();
    } catch (erro) {
      if (erro.statusHttp === 401) {
        removerToken();
        navegacao('/login', { replace: true });
      } else {
        setTipoMensagem('erro');
        setMensagem(erro.message);
      }
    } finally {
      setBaixandoId(null);
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
          titulo="Backups"
          subtitulo="Baixe uma cópia de todos os registros armazenados no sistema."
        />

        <section className="cartao painel-filtros">
          <div className="cabecalho-secao">
            <div>
              <span className="etiqueta-pagina">Proteção dos dados</span>
              <h2>Backup completo</h2>
            </div>
            <p>Gera uma cópia da estrutura e dos registros do sistema, incluindo contatos, usuários, campanhas e históricos. Guarde o arquivo em local seguro. A recuperação exige suporte técnico; não está disponível neste painel.</p>
          </div>
          <button className="botao botao-primario" type="button" disabled={gerando} onClick={gerarNovoBackup}>
            {gerando ? 'Processando backup...' : 'Gerar novo backup'}
          </button>
          <p className="texto-auxiliar-backup">Após a geração, use o botão Baixar no histórico. O arquivo fica disponível temporariamente e é removido depois do download.</p>
        </section>

        <MensagemRetorno mensagem={mensagem} tipo={tipoMensagem} />

        <section className="cartao painel-resultados">
          <div className="cabecalho-resultados"><div><h2>Histórico</h2><p>Últimas 50 operações.</p></div></div>
          {carregando && <Carregando mensagem="Carregando histórico..." />}
          {!carregando && backups.length === 0 && <p className="estado-vazio">Nenhum backup gerado.</p>}
          {!carregando && backups.length > 0 && (
            <div className="tabela-responsiva">
              <table className="tabela-contatos">
                <thead><tr><th>Arquivo</th><th>Status</th><th>Tamanho</th><th>Responsável</th><th>Data</th><th>SHA-256</th><th>Ações</th></tr></thead>
                <tbody>
                  {backups.map(function (backup) {
                    return (
                      <tr key={backup.id}>
                        <td>{backup.nomeArquivo || 'Não gerado'}<br /><small>{backup.formato === 'custom' ? 'Completo' : 'Legado — somente dados'}{backup.versaoPostgresql ? ' · PostgreSQL ' + backup.versaoPostgresql : ''}</small></td>
                        <td>{ROTULOS_STATUS[backup.status] || backup.status}</td>
                        <td>{formatarTamanho(backup.tamanhoBytes)}</td>
                        <td>{backup.usuario || 'Usuário removido'}</td>
                        <td>{formatarData(backup.concluidoEm || backup.criadoEm)}</td>
                        <td className="texto-hash-backup" title={backup.sha256 || backup.mensagemErro || ''}>{backup.sha256 || backup.mensagemErro || '—'}</td>
                        <td>
                          {backup.disponivelParaDownload ? (
                            <button
                              className="botao botao-secundario botao-backup-download"
                              type="button"
                              disabled={baixandoId === backup.id}
                              onClick={function () { baixar(backup.id); }}
                            >
                              {baixandoId === backup.id ? 'Baixando...' : 'Baixar'}
                            </button>
                          ) : (
                            <span className="texto-backup-indisponivel">
                              {backup.status === 'concluido' ? 'Arquivo removido' : '—'}
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
    </main>
  );
}

export default BackupsAdministrativos;
