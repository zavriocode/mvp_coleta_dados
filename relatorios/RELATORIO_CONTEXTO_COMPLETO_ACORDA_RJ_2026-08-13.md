# ACORDA RJ — Relatório completo para continuidade em novo chat

**Data de consolidação:** 13 de agosto de 2026  
**Finalidade:** fornecer contexto suficiente para outro chat compreender, manter e evoluir o sistema sem inventar regras.  
**Fonte:** código atual, schema PostgreSQL, READMEs, Prompt Mestre e relatórios de testes existentes no repositório.

> Este documento descreve o sistema no estado atual do repositório. Ele não contém senhas, tokens, URLs privadas de banco ou outras credenciais. Antes de qualquer mudança, o novo chat deve ler também `PROMPT_MESTRE.md`, verificar `git status` e inspecionar os arquivos diretamente relacionados.

## 1. Resumo do produto

O **ACORDA RJ** é um sistema real de coleta e gestão de contatos comunitários. Ele possui:

- formulário público para cadastro geral;
- o mesmo formulário público usado em inscrições de eventos por link exclusivo;
- painel administrativo para contatos, eventos, importações, relatórios, privacidade, usuários, backups e campanhas;
- gestão de consentimentos e solicitações de exclusão;
- campanhas segmentadas em lotes;
- integração oficial com a WhatsApp Cloud API da Meta;
- webhook seguro para status, opt-out e alteração oficial de capacidade;
- PostgreSQL com histórico, auditoria, constraints, índices e proteção contra duplicidade e concorrência.

O sistema tem dois perfis internos:

- `administrador`;
- `operador`.

## 2. Tecnologias e arquitetura

### Backend

- Node.js 24;
- Express 5;
- CommonJS (`require` e `module.exports`);
- PostgreSQL;
- pacote `pg`;
- SQL parametrizado;
- bcrypt;
- JSON Web Token;
- Helmet;
- CORS;
- compression;
- express-rate-limit;
- multer;
- ExcelJS;
- sem TypeScript;
- sem ORM, Prisma ou Sequelize.

Arquitetura predominante:

```text
rota -> controller -> service -> model -> PostgreSQL
```

Os módulos ficam em `backend/src/modules/`. Configuração compartilhada, middlewares e utilitários permanecem separados.

### Frontend

- React 19;
- React Router 7;
- Vite 8;
- JavaScript;
- CSS responsivo próprio;
- `qrcode.react` para QR Codes de eventos.

O frontend fica em `frontend/` e utiliza páginas, componentes, serviços e utilitários separados.

### Hospedagem planejada/utilizada

- frontend: Vercel;
- backend: DigitalOcean App Platform;
- banco: PostgreSQL gerenciado da DigitalOcean.

O domínio público adotado é `https://acorda-rj.vercel.app`. O domínio antigo com `acorda-vk` foi mantido/redirecionado para preservar links eventualmente já divulgados. A situação efetiva desses domínios deve ser conferida no painel da Vercel antes de alterações.

## 3. Identidade e endereços do frontend

A identidade visível oficial é **ACORDA RJ**.

Rotas públicas:

| Rota | Função |
|---|---|
| `/` | Redireciona para `/participar`. |
| `/participar` | Cadastro público geral. |
| `/participar?evento=<id>` | Inscrição no evento indicado usando o mesmo formulário. |
| `/privacidade` | Política de Privacidade. |
| `/termos` | Termos de Uso. |
| `/excluir-dados` | Orientações para solicitar exclusão. |
| `/login` | Login administrativo, sem link exposto no formulário público. |

Rotas administrativas do frontend:

| Rota | Tela |
|---|---|
| `/admin` | Visão geral. |
| `/admin/contatos` | Listagem, busca e filtros de contatos. |
| `/admin/contatos/:id` | Detalhes, histórico e ações do contato. |
| `/admin/contatos/novo` | Cadastro manual. |
| `/admin/campanhas` | Campanhas, público, lotes, capacidade e mensageria. |
| `/admin/importacoes` | Importação VCF/CSV/XLSX e histórico. |
| `/admin/relatorios` | Relatórios e gráficos. |
| `/admin/eventos` | Eventos, QR Codes e participantes. |
| `/admin/usuarios` | Usuários; somente administrador. |
| `/admin/solicitacoes-exclusao` | Pedidos de exclusão; somente administrador. |
| `/admin/backups` | Backup de dados; somente administrador. |

Sessão expirada remove o token local e redireciona ao login. A navegação relevante volta ao topo da página.

## 4. Formulário público e contatos

### Campos do cadastro público

- nome completo;
- telefone;
- idade;
- bairro;
- principal necessidade/categoria do problema;
- aceite obrigatório de privacidade;
- autorização opcional para mensagens;
- autorização opcional para ligações.

Não existem no formulário:

- descrição livre do problema;
- pergunta sobre eleição;
- data de nascimento.

Regras:

- idade obrigatória entre 16 e 120 anos;
- bairro deve existir e estar ativo no catálogo PostgreSQL;
- problema deve existir no catálogo centralizado do backend;
- aceite de privacidade é obrigatório e não equivale a consentimento de comunicação;
- autorizações opcionais começam desmarcadas;
- textos de privacidade/consentimento são configuráveis e versionados;
- o telefone é normalizado para impedir duplicidade por espaços, parênteses, hífens ou código do país;
- `telefone_normalizado` é único no banco;
- a exibição usa um padrão brasileiro de telefone;
- telefone existente não cria outro contato;
- o fluxo público não sobrescreve silenciosamente campos já preenchidos;
- campos vazios podem ser complementados conforme as regras existentes;
- alterações permitidas geram histórico;
- se nada mudou, não é criado histórico repetido.

Mensagem oficial de sucesso:

```text
Cadastro realizado com sucesso. Obrigado por contribuir com o projeto Acorda RJ.
```

### Regra oficial dos consentimentos

Estados relevantes:

- não informado;
- autorizado;
- recusado;
- revogado.

Regra atual e deliberada:

- **não informado é elegível para campanhas/mensageria**;
- autorizado também é elegível;
- recusado, revogado, bloqueado ou com exclusão pendente não pode ser reservado nem enviado;
- a barreira é conferida na seleção e novamente imediatamente antes do provider Meta;
- importação e reimportação não inventam consentimento e não removem opt-out.

## 5. Eventos

O sistema permite vários eventos ativos simultaneamente, inclusive com períodos iguais.

Cada evento possui:

- nome;
- início;
- fim;
- status;
- link exclusivo do formulário;
- QR Code exclusivo.

Não são exigidos campos separados de local, link, descrição ou período adicional de inscrição.

Fluxo:

1. O cadastro geral continua em `/participar`.
2. O link do evento usa `/participar?evento=<id>`.
3. No evento, a primeira etapa pede nome completo e telefone.
4. Se o telefone não existir, abre o formulário completo e cria o contato.
5. Se telefone e nome corresponderem a um contato existente, a pessoa pode confirmar a inscrição sem preencher tudo novamente.
6. O contato original permanece único e mantém sua origem original.
7. É criado somente o vínculo contato/evento.
8. O mesmo contato pode participar de vários eventos.
9. A constraint de unicidade impede o mesmo contato de ser vinculado duas vezes ao mesmo evento.
10. Se já estiver inscrito, a interface apenas informa isso.
11. “Meus dados mudaram” permite atualização declarada pelo próprio contato, com histórico/auditoria.
12. Nome divergente não expõe dados privados nem cria vínculo.
13. Se o evento encerrar entre a abertura e o envio do formulário, a transação é cancelada sem persistência parcial.

Operadores consultam eventos e participantes. Somente administradores criam, editam, ativam, encerram ou excluem logicamente eventos.

## 6. Gestão administrativa de contatos

Operadores e administradores podem:

- listar contatos;
- buscar por nome e telefone;
- filtrar;
- abrir detalhes;
- cadastrar manualmente;
- editar conforme as regras existentes;
- consultar histórico;
- revogar consentimentos;
- solicitar exclusão.

Filtros existentes incluem:

- nome;
- telefone;
- bairro;
- problema;
- origem;
- status;
- idade mínima e máxima;
- período de cadastro;
- consentimentos de mensagens e ligações;
- evento ou sem evento;
- ordenação;
- paginação.

Valores ausentes aparecem visualmente como **Não informado**, mas permanecem `NULL` no banco quando apropriado.

## 7. Importações

Formatos aceitos:

- VCF exportado por iPhone/celular;
- CSV;
- XLSX.

Limites atuais:

- até 5 MB;
- até 20.000 registros por arquivo;
- carga de 15.000 contatos já foi validada em teste.

O sistema:

- identifica o formato automaticamente;
- apresenta pré-visualização antes de confirmar;
- normaliza telefones;
- classifica novos, existentes, repetidos e inválidos;
- não duplica telefone equivalente;
- importa nome quando ele existe;
- trata nome puramente numérico como ausente;
- deixa campos ausentes como `NULL` e mostra “Não informado” na interface;
- pode complementar somente os campos permitidos de contato existente;
- não cria consentimentos automaticamente;
- preserva bloqueios e opt-out em reimportações;
- registra origem, arquivo, status, quantidades, responsável e data.

Administradores podem excluir uma importação. Essa operação:

- exclui contatos que foram criados por aquele lote;
- preserva contatos preexistentes que foram apenas complementados ou ignorados;
- exige confirmação explícita;
- não está disponível para operador.

## 8. Privacidade, revogações e exclusões

O sistema registra separadamente:

- aceite de privacidade;
- autorização de mensagens;
- autorização de ligações;
- texto e versão apresentados;
- origem;
- data/hora;
- histórico de alterações e revogações.

Revogações não são apagadas. Uma correção deve preservar o evento anterior e registrar um novo evento.

Solicitação de exclusão:

- operador ou administrador pode registrar;
- enquanto pendente, bloqueia campanhas e envios;
- somente administrador aprova ou rejeita;
- rejeição restaura o estado anterior correto sem transformar “não informado” em recusa;
- aprovação remove fisicamente o contato conforme a decisão oficial do projeto;
- histórico/auditoria administrativa é preservado na medida permitida pelos relacionamentos existentes.

## 9. Usuários e permissões

| Ação | Operador | Administrador |
|---|---:|---:|
| Consultar/cadastrar/editar contatos | Sim | Sim |
| Importar contatos | Sim | Sim |
| Revogar consentimento | Sim | Sim |
| Solicitar exclusão | Sim | Sim |
| Consultar eventos e participantes | Sim | Sim |
| Gerenciar eventos | Não | Sim |
| Consultar campanhas | Sim | Sim |
| Criar lotes | Sim | Sim |
| Criar/editar campanhas e templates | Não | Sim |
| Enviar/reprocessar tentativa autorizada | Sim | Sim |
| Excluir importação | Não | Sim |
| Exportar CSV/XLSX | Não | Sim |
| Gerar backup | Não | Sim |
| Aprovar/rejeitar exclusão | Não | Sim |
| Gerenciar usuários | Não | Sim |
| Alterar proteção interna/sincronizar Meta | Não | Sim |

Um administrador pode:

- criar operador;
- criar outro administrador;
- atualizar o próprio nome;
- alterar a própria senha confirmando a senha atual;
- redefinir a senha de operador.

Um administrador não pode editar os dados nem redefinir a senha de outro administrador.

## 10. Relatórios, exportações e backups

Relatórios incluem:

- totais gerais;
- contatos por bairro;
- principais necessidades;
- faixa etária;
- origem dos contatos;
- consentimentos;
- problemas por bairro;
- filtros clicáveis que abrem a listagem correspondente;
- tratamento correto do valor “Não informado”.

Exportações:

- CSV;
- XLSX;
- exclusivas para administrador.

Backup pelo painel:

- exclusivo para administrador;
- backup somente dos dados em SQL;
- não inclui criação de estrutura/tabelas;
- usa `pg_dump --data-only`;
- gera SHA-256;
- arquivo temporário é removido após o download;
- registra histórico, responsável, data, estado, tamanho e hash;
- ausência do `pg_dump` retorna erro controlado sem derrubar a API.

O backup do painel não substitui os backups gerenciados da DigitalOcean nem o teste periódico de restauração.

## 11. Campanhas, lotes e mensageria

### Campanhas

O administrador cria campanha com:

- nome;
- template/mensagem;
- filtros existentes.

A finalidade técnica continua interna por compatibilidade e não é exigida na interface.

Estados da campanha:

- `rascunho`;
- `pronta`;
- `ativa`;
- `pausada`;
- `concluida`;
- `cancelada`.

A tela apresenta:

- público encontrado;
- público apto;
- público não apto;
- lista mascarada de prévia;
- quantidade mostrada versus total real;
- aviso quando o público supera a capacidade;
- métricas da campanha;
- lotes;
- contatos de cada lote;
- falhas aptas a reprocessamento;
- estado do template na Meta.

Criar campanha não envia mensagem. Criar lote apenas separa os contatos para os próximos envios.

### Lotes e duplicidade

- lotes são criados em transação;
- usam advisory lock e `FOR UPDATE SKIP LOCKED`;
- chave de idempotência impede clique duplo de criar lote duplicado;
- não existe reserva parcial indevida quando a capacidade é excedida;
- o mesmo contato não pode participar duas vezes da mesma campanha;
- o mesmo contato pode participar de campanhas diferentes;
- se houver menos contatos disponíveis que o solicitado, o tamanho efetivo é informado;
- listas muito grandes são apresentadas como prévia sem fingir que os itens visíveis são o total completo.

### Tentativas e status

Cada participação pode ter tentativas numeradas. Estados técnicos:

- `pendente`;
- `enviando`;
- `enviada`;
- `entregue`;
- `lida`;
- `falhou`.

Reprocessar uma falha:

- mantém a participação e o lote;
- cria uma nova tentativa;
- preserva tentativa e erro anteriores;
- registra histórico;
- não permite reprocessar repetidamente a mesma tentativa antiga.

## 12. Integração oficial com a Meta/WhatsApp

O sistema utiliza a WhatsApp Cloud API oficial; não usa ManyChat nem bot paralelo.

Provider:

- endpoint oficial `POST /{PHONE_NUMBER_ID}/messages`;
- envio de template;
- token e identificadores somente no backend;
- timeout;
- sanitização de erros;
- armazenamento do external message ID;
- nenhuma credencial é enviada ao frontend.

Antes do provider, o backend verifica novamente:

- tentativa pendente;
- campanha ativa;
- lote e participação válidos;
- template ativo, configurado e aprovado;
- recusa/revogação/bloqueio;
- exclusão pendente;
- capacidade disponível.

Webhook público:

- `GET /api/webhooks/whatsapp` para challenge;
- `POST /api/webhooks/whatsapp` com corpo bruto limitado;
- HMAC SHA-256 e comparação segura;
- idempotência;
- não persiste payload bruto;
- processa `sent`, `delivered`, `read` e `failed`;
- relaciona pelo identificador externo;
- impede regressão indevida de status;
- processa opt-out pelo identificador configurado;
- processa `business_capability_update`.

Opt-out:

- revoga mensagens;
- registra origem e data/hora;
- bloqueia futuras reservas e envios;
- não apaga o contato;
- webhook repetido não duplica o evento.

## 13. Capacidade de mensageria

Existem três valores distintos:

1. **Limite oficial Meta:** informado oficialmente pela Meta.
2. **Limite de segurança/proteção interna:** definido pelo administrador com motivo e auditoria.
3. **Capacidade operacional efetiva:** menor valor entre proteção interna e limite oficial Meta finito.

Regra:

```text
capacidade efetiva = min(proteção interna, limite oficial Meta finito)
```

- valor inicial interno: 250;
- não existe `250` hardcoded como regra permanente da Meta;
- uso considera janela móvel de 24 horas;
- capacidade é liberada conforme envios saem da janela;
- capacidade é recalculada dentro da operação protegida antes de reservar ou enviar;
- concorrência não pode ultrapassar o limite;
- redução oficial da Meta reduz imediatamente novos envios;
- aumento oficial não aumenta automaticamente a proteção interna;
- falha/timeout/token inválido preserva o último valor oficial válido;
- sincronização automática ocorre por `business_capability_update`;
- “Sincronizar agora” é contingência/conferência manual;
- somente administrador altera o limite interno ou executa sincronização manual;
- alteração exige motivo e gera auditoria.

## 14. Segurança e resiliência

- bcrypt para senhas;
- JWT HS256 explicitamente fixado;
- usuário é recarregado e usuário inativo é bloqueado;
- autorização definitiva no backend;
- SQL parametrizado;
- validação de entrada e lista explícita de campos;
- Helmet;
- CORS por `FRONTEND_URL`;
- respostas privadas com `Cache-Control: no-store`;
- rate limiting global, de login e de cadastro público;
- limitação de concorrência/backpressure com 503 e `Retry-After`;
- body JSON limitado;
- webhook bruto limitado a 256 KB;
- pool PostgreSQL e timeouts configuráveis;
- liveness e readiness;
- encerramento gracioso;
- mensagens internas genéricas, sem stack trace para o cliente;
- `X-Request-Id`;
- compressão;
- CSP e cabeçalhos de segurança na Vercel;
- sem `dangerouslySetInnerHTML`, `eval` ou segredos no bundle;
- nenhuma vulnerabilidade conhecida nas auditorias npm de 13/08/2026.

O JWT ainda é mantido em `localStorage`. Migrar para cookie HttpOnly exigiria projeto coordenado de autenticação, CORS e CSRF; não deve ser feito como alteração isolada.

## 15. Banco de dados

Banco oficial conectado: `criar_banco`.

Estado do schema final:

- 30 tabelas;
- 166 bairros ativos;
- 12 migrations registradas.

Tabelas:

```text
schema_migrations
bairros
origens
usuarios
eventos
historico_eventos
contatos
contato_eventos
consentimentos
solicitacoes_exclusao
aceites_privacidade
historico_contatos
importacoes
importacao_linhas
numeros_whatsapp
modelos_mensagem
campanhas
comunicacoes
historico_comunicacoes
campanha_lotes
campanha_participacoes
campanha_tentativas
historico_status_mensageria
configuracoes_sistema
historico_configuracoes_sistema
eventos_webhook_mensageria
sincronizacoes_limite_meta
tentativas_login
backups_banco
textos_formulario
```

As tabelas históricas de comunicação foram preservadas mesmo quando um fluxo anterior deixou de ser operacional. Não apagar tabelas ou dados apenas porque parecem antigos sem confirmar relacionamentos, auditoria e uso real.

Migrations:

```text
001_validar_estrutura_atual.sql
002_normalizar_nomes_importados.sql
003_garantir_eventos_participantes.sql
004_permitir_varios_eventos_ativos.sql
005_padronizar_telefones_contatos.sql
006_criar_campanhas_lotes_mensageria.sql
007_adicionar_triggers_campanhas.sql
008_permitir_backup_sql_dados.sql
009_integrar_meta_cloud_api.sql
010_permitir_importacao_vcf.sql
011_sincronizar_limite_meta.sql
012_identificar_webhook_meta.sql
```

Regras de manutenção:

- nunca editar ou apagar migration aplicada;
- banco existente recebe somente migrations pendentes;
- banco novo e vazio pode ser criado com `backend/database/criar_banco.sql`;
- nunca executar o schema final sobre banco já populado;
- runner usa ledger, checksum SHA-256, transações e advisory lock;
- mudança estrutural em produção exige backup e teste de restauração.

## 16. Endpoints principais da API

### Públicos

```text
GET  /api/teste
GET  /api/saude/vivo
GET  /api/saude/pronto
GET  /api/publico/contatos/opcoes
POST /api/publico/contatos/verificar-evento
POST /api/publico/contatos/inscrever-evento
POST /api/publico/contatos
POST /api/autenticacao/login
GET  /api/webhooks/whatsapp
POST /api/webhooks/whatsapp
```

### Administrativos autenticados

```text
/api/admin/contatos
/api/admin/origens
/api/admin/importacoes
/api/admin/relatorios
/api/admin/usuarios
/api/admin/eventos
/api/admin/solicitacoes-exclusao
/api/admin/backups
/api/admin/campanhas
/api/admin/mensageria
```

Autorizações por perfil são conferidas em cada rota sensível no backend.

## 17. Variáveis de ambiente

Frontend, somente valores públicos:

```env
VITE_API_URL=
VITE_WHATSAPP_NUMERO=
VITE_PRIVACIDADE_EMAIL=
```

Backend, grupos principais:

- `NODE_ENV`, `PORTA`;
- `DATABASE_URL` ou `BANCO_*`;
- `FRONTEND_URL`;
- `JWT_SECRET`, `JWT_TEMPO_EXPIRACAO`;
- limites de login, API e cadastro público;
- pool e timeouts PostgreSQL;
- `PG_DUMP_CAMINHO` e limites de backup;
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`;
- `META_APP_SECRET`;
- `WHATSAPP_ACCESS_TOKEN`;
- `WHATSAPP_PHONE_NUMBER_ID`;
- `WHATSAPP_BUSINESS_ACCOUNT_ID`;
- `META_GRAPH_API_VERSION`;
- `META_REQUISICAO_TIMEOUT_MS`;
- `WHATSAPP_OPTOUT_BUTTON_ID`.

Nunca colocar valores reais em `.env.example`, código, documentação pública ou Git.

## 18. Inicialização local

Backend:

```powershell
cd backend
npm install
Copy-Item .env.example .env
npm start
```

Frontend, em outro terminal:

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Endereços locais padrão:

- formulário: `http://localhost:5173/participar`;
- login: `http://localhost:5173/login`;
- API: `http://localhost:3000/api/teste`.

`npm start` executa `npm run banco:migrar` antes de iniciar a API.

## 19. Testes e estado de qualidade

Em 13/08/2026, o sistema recebeu decisão:

```text
GO E2E PARA DEPLOY
```

O QA E2E isolado aprovou 15 grupos de jornadas:

- cadastro manual;
- formulário público;
- retorno de contato existente;
- CSV;
- XLSX;
- reimportação;
- múltiplos eventos;
- consentimentos;
- exclusão;
- campanha completa;
- mensageria Meta mock;
- opt-out;
- limite Meta;
- concorrência;
- permissões.

Resultados confirmados:

- 30 tabelas;
- 166 bairros;
- 12 migrations;
- importação de 15.000 contatos;
- nenhum dado QA residual;
- banco temporário removido;
- build Vite com 70 módulos.

Comandos principais:

```powershell
cd backend
npm test
npm run testar:e2e
npm run testar:schema-vazio
npm run testar:meta
npm run testar:limite-meta

cd ..\frontend
npm run build
```

Não executar testes destrutivos ou de integração contra o banco de produção. Os testes E2E usam banco temporário e isolado.

## 20. O que foi validado e o que ainda depende de ambiente externo

### Validado localmente/com mocks

- regras de negócio;
- banco e migrations;
- formulários;
- contatos e consentimentos;
- eventos;
- importações;
- exclusões;
- campanhas e lotes;
- concorrência e idempotência;
- provider Meta simulado;
- webhook simulado;
- opt-out;
- sincronização manual e automática do limite;
- segurança;
- backup local;
- build frontend.

### Não deve ser declarado como validado sem nova conferência

- estado atual do deploy publicado;
- migrations efetivamente aplicadas hoje em produção;
- credenciais e permissões atuais da conta Meta real;
- aprovação atual dos templates na Meta;
- entrega real em aparelho;
- recebimento real de webhook pela infraestrutura da Meta;
- backup e restauração recentes do banco de produção;
- CORS, health checks e cabeçalhos efetivos após o deploy mais recente.

## 21. Estado local no momento deste relatório

Último commit observado antes da criação deste documento:

```text
661c2aa melhorias de vizualização.pt2
```

Existem alterações locais de UX na tela de Campanhas ainda não declaradas como publicadas:

- `frontend/src/pages/CampanhasAdministrativas.jsx`;
- `frontend/src/styles/administrativo.css`.

Essas alterações tornam a tela mais clara para usuários leigos:

- explicam encontrados, aptos e não aptos;
- informam quantos contatos da prévia são exibidos do total;
- esclarecem capacidade Meta versus limite de segurança;
- explicam que criar campanha ou lote não envia mensagens;
- tornam estados de capacidade, template e falhas mais explícitos.

O build dessas alterações foi aprovado com 70 módulos. Antes de qualquer nova mudança, executar `git status` para confirmar se elas já foram commitadas ou continuam pendentes.

## 22. Regras obrigatórias para o novo chat

1. Ler `PROMPT_MESTRE.md` e os READMEs antes de alterar código.
2. Verificar `git status` e preservar alterações do usuário.
3. Não recriar o projeto.
4. Não apagar ou recriar o banco.
5. Não alterar dados de produção sem backup, plano e autorização explícita.
6. Não editar migrations aplicadas.
7. Usar migration incremental para futura mudança estrutural em banco existente.
8. Preservar arquitetura modular e fluxo controller -> service -> model.
9. Manter CommonJS no backend, SQL parametrizado e ausência de ORM.
10. Não confundir **contatos** com “contratos”. O sistema trabalha com contatos.
11. Não inventar rota, tabela, campo, regra da Meta ou regra de negócio.
12. Confirmar contratos reais no código antes de documentar ou integrar.
13. Não expor `.env`, tokens, banco, senhas ou credenciais.
14. Não declarar produção validada quando o teste foi apenas local/mock.
15. Ao verificar sintaxe, verificar também a lógica do fluxo afetado.
16. Testar proporcionalmente ao risco e ao escopo, sem executar suítes destrutivas em produção.
17. Não implementar ManyChat ou automação paralela; a integração atual é a Cloud API oficial da Meta.
18. Preservar a regra de que consentimento não informado é elegível e recusa/revogação bloqueiam.
19. Preservar telefone único por `telefone_normalizado`.
20. Preservar históricos, auditoria, locks, idempotência e constraints.

## 23. Documentos canônicos e evidências

Ordem recomendada de leitura:

1. `PROMPT_MESTRE.md` — contexto e regras para continuidade/reconstrução;
2. `README.md` — visão geral;
3. `README_TECNICO.md` — arquitetura e contratos detalhados;
4. `backend/README.md` — operação do backend;
5. `frontend/README.md` — operação do frontend;
6. `RELATORIO_QA_E2E_JORNADAS_2026-08-13.md` — QA final;
7. `RELATORIO_AUDITORIA_FINAL_BACKEND_2026-08-13.md` — auditoria de regras e segurança;
8. `RELATORIO_AUDITORIA_REPOSITORIO_FRONTEND_2026-08-13.md` — frontend e higiene;
9. relatórios de campanhas, Meta, capacidade e importação VCF.

Os relatórios datados são evidências do momento em que foram executados. O código e o banco efetivamente conectados continuam sendo a fonte final para confirmar o estado presente.

## 24. Texto curto para iniciar o novo chat

Copie este bloco junto com o arquivo:

```text
Você assumirá a manutenção do sistema real ACORDA RJ. Leia integralmente o arquivo RELATORIO_CONTEXTO_COMPLETO_ACORDA_RJ_2026-08-13.md e depois leia PROMPT_MESTRE.md. Antes de alterar qualquer arquivo, confira o git status e inspecione somente os módulos relacionados ao meu pedido. Preserve o banco, dados, migrations aplicadas, arquitetura, contratos HTTP, permissões, auditoria, idempotência e regras de consentimento. Não invente regras ou endpoints. Diferencie sempre validação local/mock de validação em produção. Implemente somente o que eu autorizar, teste o fluxo afetado e informe os arquivos alterados.
```
