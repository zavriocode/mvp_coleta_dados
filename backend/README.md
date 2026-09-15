# Backend — ACORDA RJ

API do projeto Acorda RJ construída com Node.js, Express, PostgreSQL, CommonJS e SQL parametrizado. A organização é modular por funcionalidade: controller → service → model.

Telefones são exibidos no padrão `(DD) 99999-9999` ou `(DD) 9999-9999`. A prevenção de duplicidade usa `telefone_normalizado`, com apenas números.

## Instalação e ambiente

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Antes de iniciar o servidor, o `prestart` executa apenas `npm run banco:migrar`. O runner usa ledger, checksum SHA-256 e advisory lock para aplicar somente migrations pendentes. Arquivos já aplicados não podem ser alterados.

Variáveis principais:

```env
NODE_ENV=development
PORTA=3000
BANCO_HOST=localhost
BANCO_PORTA=5432
BANCO_USUARIO=postgres
BANCO_SENHA=sua_senha
BANCO_NOME=criar_banco
BANCO_SSL=false
BANCO_SSL_REJEITAR_NAO_AUTORIZADO=true
BANCO_POOL_MAX=5
BANCO_POOL_OCIOSO_MS=30000
BANCO_CONEXAO_TEMPO_LIMITE_MS=5000
BANCO_CONEXAO_TEMPO_MAXIMO_SEGUNDOS=300
BANCO_COMANDO_TEMPO_LIMITE_MS=15000
BANCO_CONSULTA_TEMPO_LIMITE_MS=20000
BANCO_BLOQUEIO_TEMPO_LIMITE_MS=5000
BANCO_TRANSACAO_OCIOSA_TEMPO_LIMITE_MS=15000
JWT_SECRET=troque_por_um_segredo_forte
JWT_TEMPO_EXPIRACAO=8h
FRONTEND_URL=http://localhost:5173
API_REQUISICOES_CONCORRENTES=100
API_LIMITE_JANELA_MS=60000
API_LIMITE_MAXIMO=1200
PUBLICO_LIMITE_JANELA_MS=900000
PUBLICO_LIMITE_MAXIMO=5
BAIRROS_CACHE_MS=300000
PG_DUMP_CAMINHO=
BACKUP_TEMPO_LIMITE_MS=600000
BACKUP_CONEXAO_TEMPO_LIMITE_SEGUNDOS=10
BACKUP_MAX_FILA_BANCO=2
BACKUP_BANCO_TAMANHO_MAXIMO_BYTES=2147483648
BACKUP_RETENCAO_TEMPORARIA_MS=900000
RELATORIO_LIMITE_REGISTROS=50000
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
META_APP_SECRET=
META_APP_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
META_GRAPH_API_VERSION=
META_REQUISICAO_TIMEOUT_MS=10000
META_TEMPLATES_SINCRONIZACAO_AUTOMATICA=true
META_TEMPLATES_SINCRONIZACAO_ATRASO_INICIAL_MS=5000
META_TEMPLATES_SINCRONIZACAO_INTERVALO_MS=900000
WHATSAPP_OPTOUT_BUTTON_ID=nao_quero_mais_receber
```

As credenciais Meta ficam somente no ambiente do backend e nunca no frontend.
Os valores do `.env.example` são placeholders e não devem conter dados reais.

Também é possível usar `DATABASE_URL`. O `.env` não deve ser versionado.

Em produção, `DATABASE_URL` deve usar `sslmode=require`, `verify-ca` ou `verify-full`; `JWT_SECRET` deve possuir pelo menos 32 bytes; `FRONTEND_URL` deve ser HTTPS. A aplicação falha antes de abrir a porta quando uma dessas configurações críticas está insegura ou ausente.

## Resiliência e carga pública

- o catálogo de 166 bairros permanece em cache por cinco minutos, com proteção contra várias cargas simultâneas;
- as opções públicas usam cache HTTP curto de 30 segundos;
- cada combinação de IP e telefone pode tentar o cadastro cinco vezes em 15 minutos por padrão;
- o limite global padrão é alto, 1.200 requisições por IP/minuto, para não bloquear eventos legítimos;
- no máximo 100 requisições ficam ativas por processo; excesso recebe 503 e `Retry-After`;
- o pool usa cinco conexões por instância, com limites de conexão, consulta, comando, bloqueio e transação ociosa;
- falhas temporárias de PostgreSQL retornam 503 sem expor detalhes;
- conexões ociosas com erro são removidas do pool sem derrubar silenciosamente a API;
- cada resposta possui `X-Request-Id` para investigação;
- respostas JSON maiores que 1 KB são comprimidas;
- corpos JSON são limitados a 32 KB;
- SIGTERM/SIGINT encerram servidor e pool de forma graciosa;
- filtros, eventos e relatórios usam explicitamente `America/Sao_Paulo`.

Os limites são configuráveis. Não os aumente antes de um teste de carga em homologação. Em múltiplas instâncias, o rate limit em memória passa a valer por instância; para proteção global contra ataque distribuído, configure também WAF/rate limiting na borda.

## Banco de dados

Para banco novo e vazio:

```powershell
psql --set ON_ERROR_STOP=1 --dbname criar_banco --file database/criar_banco.sql
```

O projeto utiliza migrations incrementais em `database/migrations`. Para banco existente, gere e valide um backup e execute:

```powershell
npm run banco:migrar
```

O runner cria e consulta `schema_migrations`, verifica o checksum de cada arquivo, serializa execuções concorrentes com advisory lock e aplica cada migration em transação própria. Nunca edite uma migration já registrada; crie a próxima versão.

As migrations de campanhas/mensageria são `006_criar_campanhas_lotes_mensageria.sql`,
`007_adicionar_triggers_campanhas.sql`, `009_integrar_meta_cloud_api.sql`,
`011_sincronizar_limite_meta.sql`, `012_identificar_webhook_meta.sql`,
`013_gerenciar_templates_oficiais_meta.sql`,
`014_garantir_auditoria_campanhas.sql` e
`015_atualizar_templates_por_webhook_meta.sql`. O suporte
ao arquivo de contatos do iPhone foi incorporado por
`010_permitir_importacao_vcf.sql`. A exclusão manual e não destrutiva de
rascunhos de modelos foi incorporada por
`020_excluir_modelos_sem_apagar_historico.sql`.

O `database/criar_banco.sql` continua exclusivo para banco vazio e já registra as migrations incorporadas. Nunca execute o schema completo em banco com estrutura ou dados.

Para aplicar a identidade pública e os textos atuais de consentimento em um banco
existente, sem apagar versões anteriores:

```powershell
npm run atualizar-identidade-publica
```

O comando é idempotente. Ele mantém uma versão ativa de cada tipo, preserva as
versões anteriores e não altera consentimentos já registrados. As versões ativas
são `aviso_privacidade_v3`, `mensagens_whatsapp_v3` e `ligacoes_v3`.

O schema atual tem 31 tabelas:

- cadastros: `bairros`, `origens`, `usuarios`, `contatos`;
- privacidade: `consentimentos`, `aceites_privacidade`, `historico_contatos`, `solicitacoes_exclusao`;
- eventos: `eventos`, `historico_eventos`, `contato_eventos`;
- operação: `importacoes`, `importacao_linhas`, `tentativas_login`, `textos_formulario`, `backups_banco`, `schema_migrations`;
- histórico legado: `numeros_whatsapp`, `comunicacoes`, `historico_comunicacoes`;
- campanhas: `modelos_mensagem`, `historico_modelos_mensagem_meta`, `campanhas`, `campanha_lotes`,
  `campanha_participacoes`, `campanha_tentativas`,
  `historico_status_mensageria`, `configuracoes_sistema`,
  `historico_configuracoes_sistema`, `eventos_webhook_mensageria`,
  `sincronizacoes_limite_meta`.

As tabelas manuais antigas permanecem somente para preservar histórico. Novos
registros usam campanhas, lotes, participações únicas e tentativas.

As colunas anteriores de compatibilidade em `contatos` foram mantidas apenas quando ainda participam das interfaces de importação e resposta da API. Os antigos marcadores de exclusão lógica foram removidos. O fluxo oficial usa `solicitacoes_exclusao`.

## Regras de negócio atuais

- `/participar` é sempre o cadastro geral e nunca escolhe automaticamente um evento ativo.
- Cada evento usa o link exclusivo `/participar?evento=<id>` e somente esse contexto cria o vínculo em `contato_eventos`.
- Vários eventos podem estar ativos simultaneamente. A disponibilidade de cada formulário depende do status e do próprio período de inscrições.
- O QR exclusivo usa `GET /api/publico/contatos/opcoes?eventoId=<id>`. O backend
  aceita somente o evento informado que continuar ativo e dentro do período;
  após encerramento ou expiração, retorna HTTP `410`.
- O frontend envia `eventoIdExibido`; o backend confirma que aquele evento específico continua aceitando inscrições antes de persistir.
- No link exclusivo de um evento disponível, o formulário começa solicitando nome completo e telefone. Se o telefone não existir, o preenchimento completo é liberado.
- Se o telefone existir, nome completo e telefone precisam corresponder ao cadastro. A API não devolve os dados pessoais armazenados.
- Depois da confirmação, o contato original recebe somente o vínculo com o evento. A origem e o tipo de entrada não mudam.
- A restrição única `(contato_id, evento_id)` e o `ON CONFLICT` impedem duas inscrições do mesmo contato no mesmo evento.
- A unicidade `(contato_id, evento_id)` impede inscrição duplicada, sem limitar a quantidade de eventos ativos.
- Um reenvio para o mesmo evento retorna `200` e informa que a inscrição já está registrada, sem duplicar o vínculo.
- O formulário geral continua funcionando normalmente, independentemente dos eventos ativos.
- Um telefone não sobrescreve silenciosamente dados existentes; somente campos vazios podem ser complementados no fluxo público.
- A opção `Meus dados mudaram` somente é liberada após a correspondência de nome completo e telefone. As alterações declaradas são aplicadas com o evento em contexto e registradas como `atualizacao_cadastro_publico_evento`.
- Autorizações de mensagens e ligações são independentes e versionadas; o
  frontend as envia conforme o estado visível das caixas no momento do envio.
- No formulário público, ambas começam desmarcadas. `mensagens` representa o
  opt-in específico para WhatsApp; uma resposta não marcada não cria autorização.
- Para campanhas, consentimento de mensagens não informado permanece elegível.
  Recusa ou revogação expressa, bloqueio ativo e exclusão pendente impedem a
  reserva e o envio.
- `consentimentos` guarda separadamente tipo, resposta, estado, texto, versão,
  canal, origem, data, revogação, motivo e vínculo com o registro anterior.
- Revogar cria um novo registro ligado ao anterior por `registro_anterior_id`; nenhuma rota apaga revogações.
- Pedido pendente bloqueia mensagens e ligações.
- Operador pode pedir exclusão, mas não pode aprovar, rejeitar ou exportar.
- Administrador pode aprovar ou rejeitar. Aprovação exclui fisicamente o contato e dados pessoais relacionados.
- `consentimentos` e `solicitacoes_exclusao` preservam a trilha administrativa após a exclusão, com `contato_id` nulo e o identificador original numérico.
- As exportações CSV e Excel exigem perfil `administrador` e aplicam o mesmo conjunto de filtros.
- O resumo de relatórios também devolve `problemasPorBairro`, com total e
  distribuição das categorias para cada bairro.
- A quantidade máxima de registros carregados por uma exportação é configurada em `RELATORIO_LIMITE_REGISTROS`, evitando consumo de memória sem limite.
- O backup pelo painel exige perfil `administrador`, inclui estrutura e dados com `pg_dump --format=custom --blobs --no-owner --no-acl`, impede gerações simultâneas, usa subprocesso sem shell e registra SHA-256, versão PostgreSQL e migrations em `backups_banco`. O download também exige autenticação administrativa, é de uso único e o arquivo privado é removido após o download ou ao expirar a retenção temporária.
- Campanhas preservam o snapshot dos filtros e bloqueiam mudança de segmentação
  depois da primeira reserva.
- `UNIQUE (campanha_id, contato_id)` impede duplicidade na mesma campanha e
  permite o mesmo contato em campanhas diferentes.
- Lotes usam transação, advisory lock, `FOR UPDATE SKIP LOCKED` e chave de
  idempotência. Uma falha desfaz integralmente lote e reservas.
- O limite móvel inicial é 250 em 24 horas. Alterações exigem administrador,
  motivo e histórico com valor anterior e novo.
- Cada participação possui lote original e tentativas independentes. Reprocessar
  preserva a falha e cria nova tentativa na mesma participação.
- O envio usa exclusivamente a WhatsApp Cloud API oficial, por template aprovado.
- O provider possui timeout, erros sanitizados e trava contra envio duplicado da mesma tentativa.
- O quick reply com identificador `WHATSAPP_OPTOUT_BUTTON_ID` registra revogação global e bloqueia campanhas futuras.
- O limite efetivo e o menor entre a protecao interna auditada e o ultimo limite
  oficial valido da Meta. A consulta usa
  `whatsapp_business_manager_messaging_limit`; o webhook
  `business_capability_update` aplica reducoes e demais mudancas oficiais.
- Aumento oficial nao eleva sozinho a protecao interna. Falha da Meta preserva o
  ultimo valor valido e nunca libera capacidade adicional.

## Rotas

Públicas:

| Método | Rota | Função |
|---|---|---|
| GET | `/api/teste` | Saúde da API e PostgreSQL. |
| GET | `/api/saude/vivo` | Liveness sem depender do banco. |
| GET | `/api/saude/pronto` | Readiness com conexão e estrutura crítica do PostgreSQL. |
| GET | `/api/publico/contatos/opcoes` | Bairros e categorias; aceita `eventoId` para validar um formulário exclusivo. |
| POST | `/api/publico/contatos/verificar-evento` | Verifica nome completo e telefone sem retornar dados pessoais. |
| POST | `/api/publico/contatos/inscrever-evento` | Confirma o vínculo de um contato existente com o evento informado. |
| POST | `/api/publico/contatos` | Cadastro geral ou inscrição no evento explicitamente informado. |
| POST | `/api/autenticacao/login` | Login e emissão do JWT. |

Administrativas com JWT:

| Método | Rota | Perfil |
|---|---|---|
| GET/POST | `/api/admin/contatos` | operador/admin |
| GET | `/api/admin/contatos/:id` | operador/admin |
| POST | `/api/admin/contatos/:id/revogar-consentimentos` | operador/admin |
| POST | `/api/admin/contatos/:id/solicitacao-exclusao` | operador/admin |
| GET | `/api/admin/eventos` | operador/admin |
| POST/PUT | `/api/admin/eventos` e `/api/admin/eventos/:id` | admin |
| POST | `/api/admin/eventos/:id/ativar` | admin |
| POST | `/api/admin/eventos/:id/encerrar` | admin |
| DELETE | `/api/admin/eventos/:id` | admin; exclusão lógica com histórico preservado |
| GET | `/api/admin/eventos/:id/participantes` | operador/admin |
| PATCH | `/api/admin/eventos/:id/participantes/:contatoId` | operador/admin |
| GET/POST | `/api/admin/campanhas` | leitura operador/admin; criação admin |
| PUT | `/api/admin/campanhas/:id` | admin; bloqueada após reservas |
| POST | `/api/admin/campanhas/:id/status` | admin |
| GET | `/api/admin/campanhas/:id/publico` | operador/admin |
| GET/POST | `/api/admin/campanhas/:id/lotes` | operador/admin; reserva atômica |
| GET | `/api/admin/campanhas/:id/falhas` | operador/admin; falhas atuais aptas a reprocessamento |
| GET/POST/PUT | `/api/admin/campanhas/templates` | leitura operador/admin; escrita admin |
| POST | `/api/admin/campanhas/templates/sincronizar-meta` | importa e atualiza templates oficiais; admin |
| POST | `/api/admin/campanhas/templates/imagem-exemplo` | prepara JPG/PNG de exemplo pela API oficial da Meta; admin |
| POST | `/api/admin/campanhas/templates/:id/submeter-meta` | envia rascunho para análise da Meta; admin |
| PUT | `/api/admin/campanhas/templates/:id/configuracao-envio` | configura parâmetros de envio sem editar a estrutura oficial; admin |
| GET | `/api/admin/campanhas/configuracao/limite` | operador/admin |
| PUT | `/api/admin/campanhas/configuracao/limite` | admin; exige motivo |
| POST | `/api/admin/campanhas/configuracao/limite/sincronizar-meta` | admin; consulta o limite oficial |
| POST | `/api/admin/mensageria/tentativas/:id/reprocessar` | operador/admin |
| POST | `/api/admin/mensageria/tentativas/:id/enviar` | operador/admin; exige campanha ativa e template Meta aprovado |
| GET/POST | `/api/webhooks/whatsapp` | público; verificação e eventos assinados |
| GET | `/api/admin/solicitacoes-exclusao` | admin |
| POST | `/api/admin/solicitacoes-exclusao/:id/aprovar` | admin |
| POST | `/api/admin/solicitacoes-exclusao/:id/rejeitar` | admin |
| GET | `/api/admin/relatorios/resumo` | operador/admin |
| GET | `/api/admin/relatorios/exportar.csv` | admin |
| GET | `/api/admin/relatorios/exportar.xlsx` | admin |
| GET | `/api/admin/backups` | admin |
| POST | `/api/admin/backups/banco` | admin |
| GET/POST | `/api/admin/usuarios` | admin |
| PATCH | `/api/admin/usuarios/meu-perfil` | admin, somente o próprio nome |
| PATCH | `/api/admin/usuarios/meu-perfil/senha` | admin, própria senha e confirmação da senha atual |
| PATCH | `/api/admin/usuarios/:id/senha` | admin, somente senha de operador |
| GET | `/api/admin/importacoes` | operador/admin |
| POST | `/api/admin/importacoes/pre-visualizar` | operador/admin |
| POST | `/api/admin/importacoes/:id/confirmar` | operador/admin |
| DELETE | `/api/admin/importacoes/:id` | admin |

A listagem e os relatórios aceitam `eventoId=<id>` ou `eventoId=sem_evento`, além dos filtros documentados no frontend. Os filtros `bairro`, `problema` e `origem` aceitam `nao_informado`; para idade ausente, use `idadeNaoInformada=true`. Na tela de eventos, `Ver participantes` abre a listagem já filtrada; nome completo e telefone formatado podem ser pesquisados junto com o evento.

A listagem de importações retorna apenas metadados do lote, sem os dados dos contatos. A exclusão é restrita ao administrador e não pode ocorrer enquanto o lote está sendo processado. Ao excluir uma importação, o backend remove transacionalmente os contatos que foram criados por aquele lote e suas dependências; contatos que já existiam e foram apenas complementados ou ignorados são preservados. As linhas técnicas da importação são removidas em cascata. Nomes exclusivamente numéricos são tratados como ausentes; códigos antigos são preservados em `historico_contatos` antes da normalização.

O mesmo endpoint de pré-visualização reconhece automaticamente CSV, XLSX e VCF. Arquivos VCF exportados pelo iPhone podem conter vários contatos e mais de um telefone por contato; cada telefone vira uma linha da pré-visualização, o nome é lido de `FN` ou `N`, e contatos sem telefone são sinalizados como inválidos. Números brasileiros com `+55`, espaços, parênteses ou hífens usam a mesma forma normalizada para impedir duplicidades.

## Administradores

Para criar o primeiro administrador em banco sem usuário:

```powershell
npm run criar-admin -- "Nome" "email@dominio.com" "SenhaForte123!"
```

Depois, somente um administrador autenticado cria operadores ou outros administradores. Cada administrador pode atualizar o próprio nome, alterar a própria senha mediante confirmação da senha atual e redefinir senhas de operadores, mas não pode alterar a conta de outro administrador.

## Operação do banco

Backup completo:

```powershell
node scripts/backupBanco.js "C:\caminho\absoluto\AAAA-MM-DD_HHmmss"
```

O comando gera `criar_banco.backup` e `manifesto.json` com SHA-256. Para testar uma restauração em banco separado:

```powershell
node scripts/restaurarBackupTeste.js "C:\caminho\criar_banco.backup" nome_banco_teste
```

Sincronizar contadores após uma limpeza controlada:

```powershell
npm run banco:sincronizar-sequencias
```

No painel, um administrador pode gerar um backup em `/admin/backups` e baixá-lo pelo botão exibido no histórico. O servidor precisa ter `pg_dump` compatível com a versão do PostgreSQL. Configure `PG_DUMP_CAMINHO` quando o executável não estiver no `PATH`.

Na DigitalOcean App Platform, `Aptfile` declara o cliente PostgreSQL 18. O `heroku-postbuild` executa apenas `pg_dump --version` pelo PATH: isso não comprova a versão selecionada pelo serviço. Valide `"$PG_DUMP_CAMINHO" --version` no runtime quando a variável estiver definida. O cliente precisa ser compatível com a versão do servidor; a validação desta fase utilizou ferramentas 18.4 exclusivamente em PostgreSQL local isolado.

O backup completo usa `acorda-rj-completo-AAAA-MM-DD_HH-mm-ss.dump`, formato custom binário do PostgreSQL. Inclui estrutura, dados, sequências, constraints, índices, funções, triggers e large objects acessíveis no banco, sem filtros de tabelas. A restauração técnica usa `pg_restore` compatível sobre um banco vazio, sem aplicar migrations antes. Não existe restore administrativo nesta fase. Arquivos legados `.sql` continuam sendo somente dados e precisam de estrutura compatível prévia.

A migration 022 acrescenta apenas versão PostgreSQL e ledger de migrations à auditoria. O snapshot exportado é compartilhado com pg_dump, para que os metadados representem a mesma leitura dos dados. O registro da própria geração aparece como `processando` dentro do dump: a conclusão, tamanho e hash são gravados na origem depois da geração. Preservar esse registro histórico não significa que um processo de backup continue ativo após restauração.

Execute `npm run testar:backup-completo-isolado` para criar dois bancos locais descartáveis, gerar pelo módulo e comparar uma restauração real. O runner ignora DATABASE_URL recebida e exige BANCO_HOST loopback. Usa pg_dump e pg_restore 18 no Windows; em Linux, esses executáveis precisam estar no PATH. Não executa o script legado de restauração genérica.

O dump não inclui `.env`, arquivos locais, roles/senhas do cluster, permissões externas, tokens de ambiente nem imagens remotas apontadas por URL. Inclui hashes de senha dos usuários da aplicação e todos os dados persistidos: não gravar secrets em campos do banco. Não é criptografado nem assinado. Hash calculado no download não autentica um arquivo recebido de terceiros. A recuperação requer guardar o arquivo com segurança e reconfigurar as integrações externas separadamente. `pg_restore` pode executar código contido no dump; nesta fase só são restaurados arquivos produzidos pelo próprio teste isolado.

Para não afetar o formulário durante picos, o painel recusa iniciar backup quando a fila do banco já está acima do limite configurado. Também há limite preventivo de tamanho para o arquivo temporário. Por padrão, o arquivo fica disponível por até 15 minutos (`BACKUP_RETENCAO_TEMPORARIA_MS`) e é removido no primeiro download. Em produção, o mecanismo principal deve ser o backup/PITR do PostgreSQL gerenciado; o backup do painel deve ser executado em horário de menor movimento, baixado e armazenado fora da App Platform.

## Testes

```powershell
npm test
node --check src/app.js
npm run testar:schema-vazio
npm run testar:importacao-carga
```

Em 13/08/2026, a validação de segurança e usuários foi executada novamente com
sucesso, incluindo autenticação, perfis, senhas, bloqueio de tentativas e
cabeçalhos `no-store` das respostas privadas. Os resultados completos e datados
das implementações de campanhas e Meta ficam nos relatórios `RELATORIO_*.md`.
Execute novamente os comandos acima antes de cada publicação relevante; não
trate uma contagem histórica como validação do código atual.

O teste de schema cria um banco temporário vazio, aplica `database/criar_banco.sql`, valida 31 tabelas, 20 migrations registradas e 166 bairros e remove o banco temporário ao final.

O teste de carga de importação gera 15.000 contatos temporários, percorre pré-visualização, confirmação e persistência, valida a rejeição de 20.001 linhas, remove todos os dados de teste e ressincroniza as sequências utilizadas. Ele recusa execução quando `NODE_ENV=production`.

VCF, CSV e XLSX aceitam até 5 MB e 20.000 registros. O limite de arquivo permanece conservador para o plano de 512 MiB, pois arquivos XLSX são descompactados em memória. Pré-visualização e confirmação trabalham em lotes parametrizados de 500. Se um lote apresentar falha inesperada, a confirmação retorna ao processamento isolado das linhas daquele lote, preservando o relatório individual. Um advisory lock do PostgreSQL permite somente uma confirmação de importação por vez; tentativas simultâneas recebem `409`, sem ocupar todo o pool necessário ao formulário público.

Backups operacionais devem permanecer fora do repositório. Registre o caminho,
o hash SHA-256 e o resultado do teste de restauração em um inventário privado,
nunca neste README público.

## Pendências reais

- política de retenção e armazenamento externo dos arquivos de backup em produção;
- política definitiva de retenção dos registros administrativos após exclusão.
