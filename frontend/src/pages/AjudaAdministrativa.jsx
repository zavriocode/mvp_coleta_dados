import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import CabecalhoAdministrativo from '../components/CabecalhoAdministrativo';
import { obterUsuario, removerToken } from '../utils/armazenamentoToken';

const MODULOS = [
  {
    id: 'inicio',
    titulo: 'Início',
    resumo: 'Veja rapidamente os números principais e acesse cada área pelo menu.',
    imagem: '/guia/inicio.png',
    rota: '/admin',
    acao: 'Ir para a visão geral',
    marcadores: [
      { numero: 1, x: 5, y: 18, titulo: 'Menu principal', texto: 'Leva você para contatos, campanhas, eventos e as demais áreas.' },
      { numero: 2, x: 33, y: 27, titulo: 'Indicadores', texto: 'Mostram um resumo atualizado dos cadastros.' },
      { numero: 3, x: 58, y: 62, titulo: 'Visão dos dados', texto: 'Use os quadros para entender como os contatos estão distribuídos.' }
    ]
  },
  {
    id: 'contatos',
    titulo: 'Contatos',
    resumo: 'Localize pessoas, aplique filtros e abra o cadastro completo.',
    imagem: '/guia/contatos.png',
    rota: '/admin/contatos',
    acao: 'Ir para Contatos',
    marcadores: [
      { numero: 1, x: 29, y: 23, titulo: 'Busca', texto: 'Digite nome ou telefone para localizar uma pessoa.' },
      { numero: 2, x: 56, y: 42, titulo: 'Filtros', texto: 'Combine bairro, evento, origem e autorizações.' },
      { numero: 3, x: 8, y: 29, titulo: 'Novo cadastro', texto: 'Abre o formulário de cadastro manual.' },
      { numero: 4, x: 49, y: 72, titulo: 'Lista', texto: 'Mostra os resultados; dados pessoais foram ocultados nesta imagem.' },
      { numero: 5, x: 88, y: 78, titulo: 'Detalhes e páginas', texto: 'Abra o contato para ver consentimentos, bloqueios e histórico; use a paginação para continuar.' }
    ]
  },
  {
    id: 'eventos',
    titulo: 'Eventos',
    resumo: 'Crie eventos, acompanhe o período e compartilhe o link ou QR Code.',
    imagem: '/guia/eventos.png',
    rota: '/admin/eventos',
    acao: 'Ir para Eventos',
    marcadores: [
      { numero: 1, x: 31, y: 24, titulo: 'Nome e período', texto: 'Informe o nome, o início e o fim do evento.' },
      { numero: 2, x: 29, y: 35, titulo: 'Cadastrar evento', texto: 'Cria o evento. Esta ação é exclusiva de administrador.' },
      { numero: 3, x: 43, y: 55, titulo: 'Eventos cadastrados', texto: 'Aqui aparecem status, período, participantes e ações.' },
      { numero: 4, x: 84, y: 56, titulo: 'Link e QR Code', texto: 'Nas ações do evento você encontra o link, o QR Code e os participantes.' }
    ]
  },
  {
    id: 'importacoes',
    titulo: 'Importações',
    resumo: 'Traga contatos de VCF, CSV ou XLSX com uma prévia antes de confirmar.',
    imagem: '/guia/importacoes.png',
    rota: '/admin/importacoes',
    acao: 'Ir para Importações',
    marcadores: [
      { numero: 1, x: 33, y: 28, titulo: 'Origem e arquivo', texto: 'Dê um nome à origem e escolha um arquivo VCF, CSV ou XLSX.' },
      { numero: 2, x: 77, y: 28, titulo: 'Pré-visualização', texto: 'Analisa o arquivo sem importar os contatos.' },
      { numero: 3, x: 44, y: 52, titulo: 'Classificação', texto: 'Confira novos, existentes, repetidos e inválidos.' },
      { numero: 4, x: 78, y: 55, titulo: 'Confirmar importação', texto: 'Só fica disponível depois da revisão da prévia.' },
      { numero: 5, x: 55, y: 78, titulo: 'Histórico', texto: 'Mostra os arquivos processados e seus resultados.' }
    ]
  },
  {
    id: 'campanhas',
    titulo: 'Campanhas',
    resumo: 'Escolha o público, confira quanto pode enviar agora e continue depois na mesma campanha.',
    imagem: '/guia/campanhas.png',
    rota: '/admin/campanhas',
    acao: 'Ir para Campanhas',
    destaqueEnvio: true,
    marcadores: [
      { numero: 1, x: 35, y: 22, titulo: 'Capacidade', texto: 'Mostra quanto ainda pode ser usado com segurança.' },
      { numero: 2, x: 88, y: 47, titulo: 'Nova campanha', texto: 'Define nome, modelo e filtros. Não envia mensagens.' },
      { numero: 3, x: 40, y: 62, titulo: 'Público', texto: 'Encontrados correspondem aos filtros; aptos podem receber; não aptos estão impedidos.' },
      { numero: 4, x: 58, y: 70, titulo: 'Pode enviar agora', texto: 'O sistema calcula automaticamente a maior quantidade segura para este momento.' },
      { numero: 5, x: 74, y: 76, titulo: 'Enviar e continuar', texto: '“Enviar agora” pede confirmação. Os contatos restantes continuam na mesma campanha.' },
      { numero: 6, x: 88, y: 89, titulo: 'Excluir campanha', texto: 'A exclusão é permanente. Se já houver envios, o histórico operacional da campanha também será apagado.' }
    ]
  },
  {
    id: 'templates',
    titulo: 'Modelos de mensagem',
    resumo: 'Prepare o texto oficial, acompanhe a análise da Meta e configure o envio.',
    imagem: '/guia/modelos.png',
    rota: '/admin/campanhas',
    acao: 'Ir para Modelos de mensagem',
    somenteAdministrador: true,
    mostrarModeloPersonalizado: true,
    marcadores: [
      { numero: 1, x: 35, y: 19, titulo: 'Identificação', texto: 'Informe o nome para a equipe, o nome usado na Meta, o idioma e a categoria oficial.' },
      { numero: 2, x: 39, y: 41, titulo: 'Escreva normalmente', texto: 'Digite o texto principal sem precisar memorizar códigos de personalização.' },
      { numero: 3, x: 38, y: 57, titulo: 'Adicionar ao texto', texto: 'Posicione o cursor e escolha Nome da pessoa, Bairro, Principal necessidade ou Outro texto. O marcador oficial é inserido automaticamente.' },
      { numero: 4, x: 39, y: 75, titulo: 'Confira cada informação', texto: 'O sistema mostra que {{1}} é a primeira informação, {{2}} é a segunda e o que cada uma representa.' },
      { numero: 5, x: 76, y: 44, titulo: 'Prévia da mensagem', texto: 'Confira o resultado com exemplos, imagem, rodapé e todos os botões na ordem escolhida.' },
      { numero: 6, x: 39, y: 91, titulo: 'Rascunho e análise', texto: 'Salve para continuar depois. Enviar para análise encaminha o modelo à Meta, mas não envia mensagens aos contatos.' }
    ]
  },
  {
    id: 'relatorios',
    titulo: 'Relatórios',
    resumo: 'Entenda os indicadores e abra a lista correspondente a cada categoria.',
    imagem: '/guia/relatorios.png',
    rota: '/admin/relatorios',
    acao: 'Ir para Relatórios',
    marcadores: [
      { numero: 1, x: 35, y: 22, titulo: 'Indicadores', texto: 'Apresentam os totais gerais do cadastro.' },
      { numero: 2, x: 54, y: 53, titulo: 'Gráficos', texto: 'Mostram bairros, necessidades, idades, origens e autorizações.' },
      { numero: 3, x: 78, y: 30, titulo: 'Abrir contatos', texto: 'Clique em uma categoria para abrir a listagem já filtrada.' },
      { numero: 4, x: 86, y: 14, titulo: 'Exportar', texto: 'Quando disponível, o administrador pode baixar CSV ou Excel.' }
    ]
  },
  {
    id: 'optout',
    titulo: 'Consentimentos e SAIR',
    resumo: 'Veja onde aparecem bloqueios, autorizações e o histórico da decisão da pessoa.',
    imagem: '/guia/privacidade-optout.png',
    rota: '/admin/contatos',
    acao: 'Consultar contatos',
    mostrarFluxoSair: true,
    marcadores: [
      { numero: 1, x: 69, y: 27, titulo: 'Privacidade e bloqueios', texto: 'Mostra se mensagens e ligações estão bloqueadas.' },
      { numero: 2, x: 70, y: 54, titulo: 'Botão SAIR', texto: 'Quando a pessoa toca em SAIR, as autorizações de mensagens e ligações são revogadas.' },
      { numero: 3, x: 66, y: 80, titulo: 'Consentimentos', texto: 'Exibe os registros de autorização, recusa ou revogação.' },
      { numero: 4, x: 43, y: 92, titulo: 'Históricos', texto: 'Preservam alterações e comunicações anteriores.' }
    ]
  },
  {
    id: 'exclusoes',
    titulo: 'Solicitações de exclusão',
    resumo: 'Acompanhe pedidos pendentes e decisões administrativas.',
    imagem: '/guia/exclusoes.png',
    rota: '/admin/solicitacoes-exclusao',
    acao: 'Ir para Exclusões',
    somenteAdministrador: true,
    marcadores: [
      { numero: 1, x: 36, y: 31, titulo: 'Pedidos recebidos', texto: 'A lista mostra o pedido, o status e quando ele foi registrado.' },
      { numero: 2, x: 77, y: 42, titulo: 'Análise', texto: 'Somente administrador pode aprovar ou rejeitar.' },
      { numero: 3, x: 48, y: 66, titulo: 'Proteção durante a análise', texto: 'Enquanto o pedido está pendente, novas comunicações ficam bloqueadas.' }
    ]
  },
  {
    id: 'usuarios',
    titulo: 'Usuários',
    resumo: 'Crie acessos individuais e mantenha os perfis da equipe organizados.',
    imagem: '/guia/usuarios.png',
    rota: '/admin/usuarios',
    acao: 'Ir para Usuários',
    somenteAdministrador: true,
    marcadores: [
      { numero: 1, x: 35, y: 30, titulo: 'Meu acesso', texto: 'O administrador pode atualizar o próprio nome e senha.' },
      { numero: 2, x: 69, y: 31, titulo: 'Novo usuário', texto: 'Crie uma conta individual e escolha administrador ou operador.' },
      { numero: 3, x: 54, y: 72, titulo: 'Equipe', texto: 'Consulte perfis, situação e ações disponíveis para cada usuário.' }
    ]
  },
  {
    id: 'backups',
    titulo: 'Backups',
    resumo: 'Gere e baixe uma cópia dos dados antes de operações importantes.',
    imagem: '/guia/backups.png',
    rota: '/admin/backups',
    acao: 'Ir para Backups',
    somenteAdministrador: true,
    marcadores: [
      { numero: 1, x: 75, y: 25, titulo: 'Gerar backup', texto: 'Cria uma cópia SQL dos dados. Somente administrador.' },
      { numero: 2, x: 47, y: 49, titulo: 'Histórico', texto: 'Mostra data, situação, tamanho e responsável.' },
      { numero: 3, x: 82, y: 54, titulo: 'Baixar e guardar', texto: 'Baixe o arquivo e mantenha-o em local seguro, pois contém dados pessoais.' }
    ]
  }
];

function obterModuloPeloHash(hash) {
  const identificador = decodeURIComponent(String(hash || '').replace(/^#/, ''));
  return MODULOS.find(function (modulo) { return modulo.id === identificador; }) || MODULOS[0];
}

function AjudaAdministrativa() {
  const navegacao = useNavigate();
  const localizacao = useLocation();
  const usuario = obterUsuario();
  const usuarioAdministrador = usuario && usuario.perfil === 'administrador';
  const [moduloSelecionado, setModuloSelecionado] = useState(function () {
    return obterModuloPeloHash(localizacao.hash);
  });

  useEffect(function () {
    setModuloSelecionado(obterModuloPeloHash(localizacao.hash));
  }, [localizacao.hash]);

  function selecionarModulo(modulo) {
    setModuloSelecionado(modulo);
    navegacao({ pathname: '/admin/ajuda', hash: '#' + modulo.id }, { replace: true });
    window.setTimeout(function () {
      document.getElementById('guia-visual-selecionado')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  function sair() {
    removerToken();
    navegacao('/login', { replace: true });
  }

  return (
    <main className="pagina-administrativa">
      <div className="conteudo-administrativo ajuda-pagina ajuda-visual-pagina">
        <CabecalhoAdministrativo
          aoSair={sair}
          titulo="Como usar"
          subtitulo="Escolha uma área, veja a tela e siga os números."
        />

        <section className="cartao ajuda-visual-introducao">
          <div>
            <span className="etiqueta-pagina">Guia visual</span>
            <h2>Aprenda olhando a tela</h2>
            <p>As imagens abaixo são da interface real. Os dados pessoais foram ocultados.</p>
          </div>
          <div className="ajuda-regra-rapida" aria-label="Como usar esta ajuda">
            <span>1. Escolha</span><span>2. Observe</span><span>3. Faça</span>
          </div>
        </section>

        <nav className="ajuda-modulos" aria-label="Módulos do guia">
          {MODULOS.map(function (modulo) {
            const ativo = modulo.id === moduloSelecionado.id;
            return (
              <button
                aria-current={ativo ? 'page' : undefined}
                className={'ajuda-modulo-card' + (ativo ? ' ativo' : '')}
                key={modulo.id}
                onClick={function () { selecionarModulo(modulo); }}
                type="button"
              >
                <span>{modulo.titulo}</span>
                {modulo.somenteAdministrador && <small>Somente administrador</small>}
              </button>
            );
          })}
        </nav>

        <section className="cartao ajuda-guia-selecionado" id="guia-visual-selecionado">
          <header className="ajuda-guia-cabecalho">
            <div>
              <span className="etiqueta-pagina">Guia de {moduloSelecionado.titulo}</span>
              <h2>{moduloSelecionado.titulo}</h2>
              <p>{moduloSelecionado.resumo}</p>
            </div>
            {moduloSelecionado.somenteAdministrador && <span className="ajuda-selo-admin">Somente administrador</span>}
          </header>

          <figure className="ajuda-imagem-figura">
            <div className="ajuda-imagem-wrapper">
              <img
                alt={'Tela real de ' + moduloSelecionado.titulo + ' com dados sensíveis ocultados'}
                key={moduloSelecionado.imagem}
                loading="eager"
                src={moduloSelecionado.imagem}
              />
              {moduloSelecionado.marcadores.map(function (marcador) {
                return (
                  <span
                    aria-hidden="true"
                    className="ajuda-marcador"
                    key={marcador.numero}
                    style={{ left: marcador.x + '%', top: marcador.y + '%' }}
                    title={marcador.titulo}
                  >
                    {marcador.numero}
                  </span>
                );
              })}
            </div>
            <figcaption>Toque ou use o zoom do navegador para ampliar a imagem.</figcaption>
          </figure>

          <div className="ajuda-explicacoes-marcadores">
            {moduloSelecionado.marcadores.map(function (marcador) {
              return (
                <article key={marcador.numero}>
                  <span>{marcador.numero}</span>
                  <div><h3>{marcador.titulo}</h3><p>{marcador.texto}</p></div>
                </article>
              );
            })}
          </div>

          {moduloSelecionado.destaqueEnvio && (
            <div className="ajuda-fluxo-envio" aria-label="Etapas seguras de uma campanha">
              <div><strong>Criar campanha</strong><span>Não envia</span></div>
              <i aria-hidden="true">→</i>
              <div><strong>Conferir quantidade</strong><span>Cálculo automático</span></div>
              <i aria-hidden="true">→</i>
              <div className="envia"><strong>Enviar agora</strong><span>Envia após confirmação</span></div>
            </div>
          )}

          {moduloSelecionado.mostrarModeloPersonalizado && (
            <div className="ajuda-exemplos-template">
              <article>
                <span className="etiqueta-pagina">Valores personalizados</span>
                <p className="ajuda-mensagem-exemplo">Olá, <mark>{'{{1}}'}</mark>! Você está convidado para <mark>{'{{2}}'}</mark>.</p>
                <p><strong>{'{{1}}'}</strong> é a primeira informação personalizada, <strong>{'{{2}}'}</strong> é a segunda, e assim por diante.</p>
                <div className="ajuda-mapeamento-template"><span>{'{{1}}'} → Nome da pessoa</span><span>{'{{2}}'} → Bairro</span></div>
                <small>Use “Adicionar ao texto”; o sistema insere e configura os marcadores oficiais automaticamente.</small>
              </article>
              <article>
                <span className="etiqueta-pagina">Imagens</span>
                <div className="ajuda-comparacao-imagens">
                  <div><strong>Imagem de exemplo</strong><span>A Meta usa para analisar o modelo.</span></div>
                  <div><strong>Imagem da mensagem</strong><span>É o que as pessoas realmente verão.</span></div>
                </div>
                <small>A imagem da mensagem pode vir do dispositivo ou de uma URL pública da internet.</small>
              </article>
              <article>
                <span className="etiqueta-pagina">Botões da mensagem</span>
                <div className="ajuda-comparacao-imagens">
                  <div><strong>Abrir link</strong><span>Leva a pessoa para o endereço configurado.</span></div>
                  <div><strong>Ligar</strong><span>Abre a ligação para o número configurado.</span></div>
                  <div><strong>Não receber mais contatos</strong><span>Ativa o fluxo SAIR e bloqueia novas comunicações.</span></div>
                </div>
                <small>Adicione, remova ou ordene os botões. Somente “Não receber mais contatos” ativa o fluxo SAIR.</small>
              </article>
              <article>
                <span className="etiqueta-pagina">Depois de criar</span>
                <div className="ajuda-comparacao-imagens">
                  <div><strong>Rascunho</strong><span>Pode ser reaberto e alterado.</span></div>
                  <div><strong>Em análise</strong><span>Aguarde a decisão oficial da Meta.</span></div>
                  <div><strong>Aprovado</strong><span>Configure imagem, personalizações e SAIR para o envio.</span></div>
                </div>
                <small>A Meta é sempre a fonte do status. O ACORDA RJ não aprova modelos localmente.</small>
              </article>
            </div>
          )}

          {moduloSelecionado.mostrarFluxoSair && (
            <div className="ajuda-fluxo-sair" aria-label="Fluxo de saída das mensagens">
              <span>Pessoa recebe</span><i aria-hidden="true">→</i><span>Toca em SAIR</span><i aria-hidden="true">→</i><span>ACORDA RJ registra</span><i aria-hidden="true">→</i><strong>Mensagens e ligações bloqueadas</strong>
            </div>
          )}

          <footer className="ajuda-guia-rodape">
            {!moduloSelecionado.somenteAdministrador || usuarioAdministrador ? (
              <Link className="botao botao-primario" to={moduloSelecionado.rota}>{moduloSelecionado.acao}</Link>
            ) : (
              <p className="aviso-permissao-ajuda">Seu perfil pode consultar este guia, mas não possui acesso a essa tela.</p>
            )}
            <p><strong>Dúvida pequena?</strong> Veja a explicação ao lado do próprio campo. <strong>Dúvida sobre o fluxo?</strong> Volte a este guia.</p>
          </footer>
        </section>
      </div>
    </main>
  );
}

export default AjudaAdministrativa;
