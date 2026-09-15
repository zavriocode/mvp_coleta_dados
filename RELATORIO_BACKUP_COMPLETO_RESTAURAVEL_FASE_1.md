# Backup completo restaurável — fase 1

## 1. Resultado e formatos

**BACKUP COMPLETO VALIDADO COMO RESTAURÁVEL EM AMBIENTE ISOLADO.**

- Anterior: SQL plain, `--data-only --blobs --no-owner`. Não havia filtros de
  tabelas ou schemas, mas faltavam as definições necessárias para banco vazio.
- Final: PostgreSQL custom, `--format=custom --blobs --no-owner --no-acl`,
  arquivo `acorda-rj-completo-AAAA-MM-DD_HH-mm-ss.dump`.
- `pg_dump`: PostgreSQL 18.4. `pg_restore`: PostgreSQL 18.4.
- Backup restaurado em banco vazio: **SIM**, criado com `TEMPLATE template0`,
  sem schema ou migrations aplicados ao destino antes da restauração.
- Aplicação iniciou sobre o banco restaurado: **SIM**. Uma instância HTTP local
  de `app.js` respondeu à prontidão, autenticou o administrador e consultou
  contatos, campanhas e backups. Não foi iniciado `server.js` com suas tarefas
  periódicas de integração, nem executado `npm start/prestart` no destino.

## 2. Conteúdo

Inclui todas as tabelas e objetos acessíveis do banco, sem seleção/exclusão de
tabelas: estrutura, dados, schemas necessários, sequences, PKs, FKs, CHECKs,
índices, funções, triggers e large objects. Inclui usuários da aplicação e hashes
de senha, consentimentos, bloqueios, exclusões, campanhas, lotes, participações,
tentativas, identificadores Meta persistidos, timestamps, estados oficiais,
resultados indeterminados, webhooks, históricos e auditoria.

Não inclui arquivos `.env`, secrets de ambiente, arquivos temporários, código
da aplicação, roles/senhas do cluster PostgreSQL, ACLs, configuração da
DigitalOcean nem conteúdo de arquivos externos referenciado por URL. O teste
verificou ausência de marcadores secretos do ambiente no SQL extraído do dump.
O backup não remove valores de colunas: secrets indevidamente persistidos em
campos de dados também seriam copiados. Não gravar tokens em dados operacionais.

## 3. Integridade comparada

Foram comparados valores completos das linhas (não apenas contagens), estado das
sequences, definições de constraints, índices, funções, triggers e large objects.

| Objeto | Quantidade |
|---|---:|
| Tabelas | 31 |
| Registros | 240 |
| Sequences | 29 |
| Constraints, incluindo NOT NULL | 404 |
| Índices | 113 |
| Funções | 1 |
| Triggers não internos | 12 |
| Large objects | 1 |

Contagens por tabela com dados:

| Tabela | Registros |
|---|---:|
| bairros | 166 |
| schema_migrations | 22 |
| contatos | 5 |
| consentimentos | 5 |
| solicitacoes_exclusao | 5 |
| campanha_participacoes | 5 |
| campanha_tentativas | 5 |
| eventos_webhook_mensageria | 5 |
| historico_contatos | 5 |
| historico_status_mensageria | 5 |
| textos_formulario | 3 |
| origens | 2 |
| usuarios | 1 |
| modelos_mensagem | 1 |
| campanhas | 1 |
| campanha_lotes | 1 |
| configuracoes_sistema | 1 |
| historico_configuracoes_sistema | 1 |
| backups_banco | 1 |

Também foram comparadas, vazias: aceites_privacidade, comunicacoes,
contato_eventos, eventos, historico_comunicacoes, historico_eventos,
historico_modelos_mensagem_meta, importacao_linhas, importacoes,
numeros_whatsapp, sincronizacoes_limite_meta e tentativas_login. Esses fluxos
não receberam fixtures adicionais nesta fase; suas estruturas foram restauradas.

Sequences válidas: **SIM**. O próximo valor de cada identity foi comparado ao
maior ID da tabela, e foi criado um usuário depois do restore sem colisão.
Constraints/FKs válidas: **SIM**. Nenhuma constraint não validada nem índice
inválido. Todas as FKs foram criadas pelo restore sobre os dados recuperados.

### Divergências explicadas

Não houve perda inesperada de dados. O registro da própria geração aparece
como `processando` no snapshot restaurado; na origem já está concluído, com nome,
tamanho, hash e metadados. Apenas esses campos dessa linha foram normalizados
na comparação. É impossível incluir no próprio dump a finalização e o hash
desse mesmo arquivo ainda não terminado.

O PostgreSQL reescreveu casts e parênteses de alguns CHECKs ao executar o SQL
extraído. A comparação reaplicou as definições originais pelo parser do próprio
PostgreSQL em transação desfeita no banco A e confirmou igualdade; não removeu
operadores/casts por regex nem ignorou CHECKs divergentes.

## 4. Metadados e segurança

Migration incremental **022_metadados_backup_completo.sql**: acrescenta somente
`versao_postgresql` e `migrations` ao histórico existente. Necessária porque os
campos anteriores não guardavam essas informações. Aplicada apenas no banco A
descartável pelo migrador normal; o bootstrap vazio foi atualizado em conjunto.
Nenhuma migration antiga foi modificada.

Metadados e dump usam o mesmo snapshot exportado em transação de leitura.
Mantidos ADMIN only, autenticação, download privado único, SHA-256, expiração,
limites existentes, timeout e advisory lock de concorrência. Diretório temporário
recebe modo 0700 e arquivo 0600 em sistemas POSIX; no Windows vale também a ACL
da conta do processo. Execução sem shell e senha em ambiente do subprocesso.
Stderr bruto do pg_dump deixou de ser persistido/exposto, pois pode conter dados
sensíveis; a falha informa as categorias a verificar sem copiar o conteúdo.

## 5. Testes

`npm run testar:backup-completo-isolado`:

- 40 verificações do módulo administrativo: geração, auditoria, formato completo,
  metadados, download real por HTTP, SHA-256, 401/403, download repetido 410 e
  pg_dump ausente 503;
- 20 verificações de geração/falha: concorrência 409, expiração disparando o
  callback real, cleanup e geração interrompida, saída parcial, erro de escrita,
  incompatibilidade simulada e timeout de subprocesso;
- 46 verificações de restauração: banco vazio, dados/objetos, sequences, secrets
  externos ausentes, pg_restore ausente, arquivo arbitrário, dump truncado e
  versão de arquivo incompatível. Arquivos inválidos também foram executados
  contra B com `--single-transaction --clean --if-exists`; houve erro e o estado
  de B permaneceu igual ao estado anterior;
- 7 verificações da aplicação HTTP local sobre B;
- schema vazio validado: 31 tabelas, 166 bairros e 22 migrations, com checksums;
- migration 022 testada como atualização de estrutura anterior em A descartável.

Os cenários de falha do gerador substituem o subprocesso apenas no teste;
backup e restore de sucesso usam os executáveis PostgreSQL reais. Não foi
provocada falta real de disco nem incompatibilidade com servidor de outra versão.

Frontend: 12 verificações existentes aprovadas; build aprovado com 72 módulos.
`node --check`: seis arquivos JavaScript backend aprovados.
`git diff --check`: aprovado.

## 6. Arquivos alterados/criados nesta fase

- backend/database/migrations/022_metadados_backup_completo.sql;
- backend/database/criar_banco.sql;
- backend/src/modules/backups/backupService.js;
- backend/src/modules/backups/backupModel.js;
- backend/src/modules/backups/backupController.js;
- backend/scripts/testarBackups.js;
- backend/scripts/testarBackupCompletoIsolado.js;
- backend/scripts/testarSchemaVazio.js;
- backend/package.json;
- backend/README.md;
- frontend/src/pages/BackupsAdministrativos.jsx;
- frontend/src/services/backupService.js;
- frontend/README.md;
- este relatório.

O relatório de planejamento anterior foi preservado como diagnóstico histórico.

## 7. Riscos residuais e fase 2

- Restore administrativo, upload, assinatura, manutenção e promoção para produção
  não foram implementados. O arquivo não é criptografado nem autenticado.
- Dumps de terceiros podem executar código. Esta validação só restaura arquivos
  gerados pelo próprio teste; cabeçalho e hash calculado não comprovam procedência.
- O arquivo temporário e seu endereço em memória não sobrevivem de forma garantida
  à perda/recriação do container; baixar e guardar fora do servidor é necessário.
  Uma queda abrupta pode deixar registro processando ou temporário órfão; o
  cleanup validado cobre os caminhos controlados de sucesso/falha/expiração.
- ACLs, dono/roles, credenciais externas e recursos remotos exigem configuração
  separada no ambiente de recuperação. Referências a imagens não recuperam o
  arquivo remoto. Alterações e eventos posteriores ao snapshot não estão no dump.
- O teste não mede desempenho com banco de produção nem carga concorrente real;
  contagens/fixtures correspondem apenas ao conjunto local documentado.
- Antes da fase 2: definir autenticação de procedência, limite de upload, ambiente
  isolado de inspeção, custódia da cópia pré-restore, manutenção abrangendo jobs e
  requisições, confirmação forte, auditoria independente e revisão de sessões,
  consentimentos e tentativas recuperados antes de liberar a operação.
- Runtime: pg_dump compatível (18.x para servidor 18); pg_restore compatível para
  restauração técnica/testes. psql não foi necessário neste fluxo custom.
- Campanhas e histórico local são recuperáveis com seus IDs, estados e timestamps;
  não dependem de reconstrução pela Meta. O teste não enviou mensagens.

## 8. Isolamento

O runner ignorou DATABASE_URL de entrada, validou BANCO_HOST loopback e o IP do
servidor PostgreSQL. Criou nomes aleatórios exclusivos para A/B, aplicou a
migration só em A, restaurou B vazio e removeu ambos e os arquivos temporários
ao terminar. A conexão de produção, DigitalOcean, secrets de produção, Meta,
deploy, commit e push não foram usados nem alterados.
