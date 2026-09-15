# Frontend — ACORDA RJ

Interface React/Vite do projeto Acorda RJ. O frontend consome somente rotas reais do backend e não usa dados simulados.

Telefones são apresentados em um único padrão visual: `(DD) 99999-9999` ou `(DD) 9999-9999`.

## Instalação

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Variáveis:

```env
VITE_API_URL=http://localhost:3000
VITE_WHATSAPP_NUMERO=5521999999999
VITE_PRIVACIDADE_EMAIL=seu-email-de-privacidade@example.com
```

O WhatsApp deve conter país, DDD e número, somente com dígitos. Reinicie o Vite após mudar o `.env`. O botão abre `wa.me` em nova aba e não envia o formulário automaticamente.
Substitua o endereço de exemplo pelo e-mail oficial criado para o projeto.

## Páginas

| Rota | Acesso | Função |
|---|---|---|
| `/participar` | público | Formulário geral responsivo; `?evento=<id>` ativa o contexto exclusivo. |
| `/privacidade` | público | Política de Privacidade, finalidades, compartilhamento, retenção e direitos. |
| `/termos` | público | Termos de utilização do formulário público. |
| `/excluir-dados` | público | Orientações e canal para solicitar exclusão ou revogação. |
| `/login` | público | Login administrativo. |
| `/admin` | JWT | Visão geral. |
| `/admin/contatos` | operador/admin | Busca, filtros, evento e paginação. |
| `/admin/contatos/:id` | operador/admin | Dados, eventos, histórico, revogações e pedido de exclusão. |
| `/admin/contatos/novo` | operador/admin | Cadastro e edição manual. |
| `/admin/importacoes` | operador/admin | Pré-visualização e confirmação de arquivo de contatos do celular, CSV ou XLSX. |
| `/admin/campanhas` | operador/admin | Campanhas, segmentação, prévia, lotes, métricas e capacidade; escrita administrativa protegida. |
| `/admin/relatorios` | operador/admin | Indicadores e gráficos; CSV e Excel aparecem somente para admin. |
| `/admin/backups` | admin | Geração, download e histórico auditado de backups custom completos do PostgreSQL. |
| `/admin/eventos` | operador/admin | Operador consulta eventos e participantes; administrador também cria, edita, ativa e encerra. |
| `/admin/solicitacoes-exclusao` | admin | Aprovar com exclusão física ou rejeitar pedidos. |
| `/admin/usuarios` | admin | Definir o próprio nome e senha, criar operadores/administradores e redefinir senhas de operadores. |

## Formulário público

Campos atuais:

- nome;
- telefone;
- bairro selecionado no catálogo carregado do backend;
- idade atual informada como número inteiro, sem restrição etária para cadastro
  no navegador, na API e pelo banco;
- categoria do problema;
- autorização opcional para mensagens;
- autorização opcional para ligações;
- aceite obrigatório do Aviso de Privacidade.

As autorizações opcionais de mensagens pelo WhatsApp e ligações iniciam
desmarcadas e exigem escolha voluntária da pessoa. O aceite obrigatório do Aviso
de Privacidade também inicia desmarcado. Não marcar as autorizações opcionais não
impede o cadastro.

O texto do WhatsApp identifica Acorda RJ e Diogo Ventura, informa as categorias
de conteúdo e orienta a revogação pelo canal oficial de privacidade. A
autorização de ligação possui texto e caixa separados. O formulário contém
links para Privacidade, Termos e Exclusão de dados.

A Política de Privacidade identifica o controlador, dados, finalidades, bases
legais, proteção de crianças e adolescentes, comunicações políticas, fornecedores, transferências
internacionais, retenção, segurança e direitos. O canal oficial precisa ser
configurado em `VITE_PRIVACIDADE_EMAIL` antes do início da coleta oficial.

Os textos exibidos são carregados da configuração ativa do backend. Assim, texto
e versão mostrados à pessoa são os mesmos gravados no histórico do PostgreSQL.

O formulário não exibe descrição do problema. `/participar` é sempre o cadastro geral. Cada evento possui link próprio em `/participar?evento=<id>`.

O visual público usa a identidade `Acorda RJ`, cabeçalho laranja, apresentação destacada e laterais com elementos laranja discretos. Nome, bairro e categoria ocupam a largura total; telefone e idade ficam lado a lado quando houver espaço e são empilhados no celular. A aba do formulário, login e painel mostram `ACORDA RJ`.
Após o formulário, um resumo compacto mantém acesso direto às páginas de
Privacidade, Termos e Exclusão sem repetir textos longos.

No link exclusivo de um evento ativo e com inscrições abertas, a primeira etapa solicita somente nome completo e telefone. Se o telefone não existir, o formulário completo é aberto com os dois campos preservados. Se ambos corresponderem a um contato existente, a tela permite confirmar a inscrição sem mostrar dados pessoais nem exigir novamente bairro, idade, categoria ou consentimentos. Nome divergente não cria contato nem vínculo. Se a inscrição já existir, a tela apenas informa o resultado sem duplicar o registro.

Depois da identificação, `Meus dados mudaram` abre o formulário completo. O telefone fica bloqueado, os dados declarados são enviados com o nome usado na confirmação e o backend registra as alterações no histórico antes de concluir o vínculo.

O identificador do evento exibido acompanha o envio. Se o administrador trocar ou encerrar o evento enquanto a pessoa preenche, o backend retorna `409`; o frontend atualiza o contexto, mantém os campos preenchidos e pede um novo envio consciente.

Ao criar um evento, o administrador pode visualizar, copiar e baixar um QR Code
SVG exclusivo. Ele aponta para `/participar?evento=<id>` e deixa de aceitar
inscrições quando o evento é encerrado ou sai do período. O endereço normal
`/participar` permanece disponível exclusivamente para o cadastro geral.
O administrador também pode excluir um evento. Ele desaparece do painel e deixa
de aceitar inscrições, enquanto participantes e históricos permanecem preservados.

## Campanhas e lotes

O menu `Campanhas` substitui a antiga tela manual. O administrador cria e edita
templates, define nome e os filtros da campanha. A finalidade técnica permanece
interna. Administradores também podem salvar rascunhos, submetê-los para análise
e sincronizar templates oficiais existentes na WABA. Os status também são
atualizados automaticamente pelo webhook oficial; a sincronização manual serve
como conferência ou contingência. O backend também reconcilia a lista oficial
ao iniciar e periodicamente. Templates ausentes da WABA atual permanecem no
histórico, mas são ocultados das opções operacionais. O status não pode ser
alterado manualmente: somente `APPROVED` oficial libera novos envios. A
configuração de imagem, parâmetros e opt-out permanece separada da estrutura
oficial sincronizada. A finalidade técnica permanece interna para compatibilidade
e não é exigida na interface. Bairro, problema,
evento, cadastro incompleto e consentimento usam a mesma semântica dos filtros de
contatos. A tela mostra público encontrado, apto, não apto, capacidade móvel de
24 horas, reservas, lotes e estados técnicos.

Campanhas seguem `rascunho`, `pronta`, `ativa`, `pausada`, `concluida` ou
`cancelada`. Uma campanha pronta ou ativa pode receber lotes. Se houver menos
contatos aptos que o tamanho solicitado, a interface informa o tamanho efetivo.
O mesmo contato pode participar de campanhas diferentes, mas nunca duas vezes da
mesma campanha. A tela mostra o estado oficial do template na Meta e habilita o
envio apenas para campanha ativa, tentativa pendente e template aprovado. A
validação definitiva ocorre no backend e nenhuma credencial Meta entra no bundle.

O resumo de capacidade mostra a proteção interna, o último tier oficial válido,
o limite efetivo, a quantidade usada nas últimas 24 horas e o saldo disponível.
Somente administrador vê as ações para alterar a proteção interna ou solicitar
uma sincronização oficial com a Meta. Nenhuma credencial é enviada ao frontend.

## Painel e permissões

Operadores e administradores podem cadastrar, editar, consultar, revogar consentimentos, solicitar exclusão e abrir a tela de eventos. Para operador, eventos são somente leitura e permitem acessar participantes. Somente administradores veem os controles de criação, edição, ativação e encerramento, além de usuários, fila de exclusões e backups. Os botões de exportação CSV e Excel também aparecem somente para administrador.

Na tela de eventos, o botão `Ver participantes` abre a listagem de contatos com o evento previamente selecionado. Os campos de nome e telefone continuam disponíveis para conferir rapidamente a inscrição.

Na visão geral e nos relatórios, bairros, categorias e demais barras são
clicáveis e abrem a listagem com o filtro correspondente. O relatório inclui a
quantidade de contatos por bairro e a distribuição das necessidades dentro de
cada bairro. Bairro e categoria também são filtros em formato de seleção.
Os gráficos usam cartões claros responsivos, barras verticais, totais destacados
e legendas com quantidade e percentual para facilitar a leitura em diferentes telas.
Ao selecionar `Não informado` em bairro, categoria, origem, idade ou consentimento,
a listagem mostra somente os contatos que realmente não possuem aquele dado.

Na gestão de usuários, o administrador pode atualizar o próprio nome, alterar a própria senha informando a senha atual e criar contas com perfil de operador ou administrador. Outros administradores aparecem protegidos e não podem ter seus dados ou senha alterados; a redefinição administrativa de senha fica disponível somente para operadores.

Contatos importados somente com telefone mantêm nome, bairro, idade e categoria como `NULL` no banco. Nomes exclusivamente numéricos também são tratados como ausentes, evitando exibir códigos de planilha como nomes de pessoas. Na listagem, nos detalhes e na pré-visualização da importação, esses valores aparecem visualmente como “Não informado”.

A importação aceita um único arquivo de contatos do celular (VCF), CSV ou XLSX com até 5 MB e 20.000 registros. O usuário utiliza um seletor único e o sistema identifica o formato automaticamente. No arquivo do iPhone, nome e telefone são extraídos sem exigir conversão manual; outros dados permanecem como “Não informado”. A origem é escolhida em um dropdown com as fontes de importação existentes, com opção para cadastrar uma nova. Durante a confirmação, o botão permanece bloqueado e informa que a importação está em andamento.
O seletor de arquivo usa um botão próprio, mostra o nome escolhido e continua
compatível com teclado e leitores de tela.

A própria página apresenta o histórico resumido dos lotes, com origem, arquivo, status, quantidade, contatos criados, responsável e data, sem mostrar dados pessoais. Operadores apenas consultam; administradores podem excluir a importação após confirmação explícita. A exclusão remove os contatos criados por aquele lote e preserva contatos que já existiam antes e foram somente complementados ou ignorados.

Ao gerar um backup, o frontend baixa o arquivo retornado pelo backend e exibe o hash SHA-256. O histórico informa responsável, data, estado, tamanho e hash, sem expor credenciais do banco.

Os arquivos possuem nomes distintos: o backup completo usa `acorda-rj-completo-AAAA-MM-DD_HH-mm-ss.dump`; as planilhas usam `acorda-rj-contatos-AAAA-MM-DD_HH-mm-ss.xlsx` ou `.csv`. O histórico distingue o formato completo dos backups SQL legados somente de dados. A restauração exige suporte técnico; não há upload/restore administrativo nesta fase.

Sessões expiradas removem o token local e redirecionam ao login. O frontend esconde ações sem permissão, mas a autorização definitiva é sempre conferida pelo backend.

Consultas `GET` repetem automaticamente falhas transitórias de conexão ou respostas 502/503/504, usando atrasos progressivos. Envios e alterações não são repetidos automaticamente, evitando duplicação acidental.

Na Vercel, `vercel.json` aplica CSP, bloqueio de iframe, `nosniff`, política de referência, política de permissões e HSTS. A CSP permite comunicação HTTPS com a API e bloqueia scripts, objetos e frames externos.

## Build

```powershell
npm run build
```

Resultado de 13/08/2026: Vite 8.1.5, 70 módulos transformados e build concluído.

## Vercel

1. Publique a pasta `frontend`.
2. Configure `VITE_API_URL` com a URL HTTPS do backend.
3. Configure `VITE_WHATSAPP_NUMERO`.
4. Configure `VITE_PRIVACIDADE_EMAIL` com o e-mail oficial criado para os titulares.
5. Faça novo deploy após alterar variáveis.
6. Configure `FRONTEND_URL` no backend com o domínio final da Vercel.
7. Confirme os cabeçalhos de segurança no domínio publicado.

A Vercel informa o domínio final na página do projeto. Use esse mesmo domínio com `/participar` para o formulário e `/login` para o acesso administrativo. O formulário não exibe link para o login.
