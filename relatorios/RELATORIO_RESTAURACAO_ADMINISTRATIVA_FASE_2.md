# Fase 2 — restauração administrativa segura

> **Relatório de implementação da Fase 2.** O empacotamento e a UX evoluíram
> depois desta entrega para um único `.acorda` e fluxo simplificado. Consulte
> [RELATORIO_BACKUP_ARQUIVO_UNICO.md](RELATORIO_BACKUP_ARQUIVO_UNICO.md) e
> [../STATUS_FINAL_DO_PROJETO.md](../STATUS_FINAL_DO_PROJETO.md).

Data: 16/09/2026. Projeto: ACORDA RJ.

Implementação local após as aprovações arquiteturais. Este relatório substitui,
quanto ao estado do trabalho, os dois relatórios anteriores de decisão/bloqueio,
que foram preservados como histórico.

## 1. Resultado e limites

Fluxo implementado na aba Backup existente: upload autenticado, inspeção em
banco descartável, confirmação forte, manutenção persistente, drenagem,
pré-backup, download/custódia, restore transacional, validação, novo login,
reconciliação, revisão e liberação manual.

Validação feita em PostgreSQL **local descartável**, com pg_dump/pg_restore 18.4.
Não foi acessado ou alterado o banco de produção. Não houve chamada real à Meta,
envio real, deploy, commit ou push. `.env` não foi alterado.

Esta validação não representa homologação do ambiente DigitalOcean nem elimina
os pré-requisitos e limites operacionais da seção 11.

## 2. Controle fora do snapshot

Escolhida a alternativa A: schema `recuperacao` no mesmo PostgreSQL.

Migration nova: `023_controle_recuperacao.sql`. Migrations 001–022 não alteradas.
O bootstrap `criar_banco.sql` e seu teste foram atualizados para 23 migrations.

Estrutura mínima:

- `estado`: manutenção, auth_epoch, operação corrente;
- `operacoes`: fases, resumo da inspeção e referência/metadados do pré-backup;
- `auditoria`: responsável, eventos, instantes, IP quando disponível;
- `admissoes`: comprovantes técnicos de requisições/jobs admitidos e concluídos;
- `webhooks`: eventos autenticados preservados individualmente, pendência/erro.

Sem FKs para tabelas operacionais. Não são copiadas coleções de contatos,
campanhas, usuários ou tentativas para o controle. Resumos contêm contagens,
hashes e metadados, não cópia paralela dos registros de negócio.

O dump operacional usa `--exclude-schema=recuperacao`. O restore também exclui
esse schema e não usa `--create`. A inspeção rejeita um archive cujo catálogo
inclua o controle. Manutenção, auditoria, eventos preservados e auth_epoch
sobreviveram ao ciclo de recuo do snapshot no teste.

## 3. Formato e procedência

Mantido PostgreSQL custom (`PGDMP`), estrutura e dados operacionais completos.
Adicionado manifesto HMAC-SHA256 com chave exclusiva, fora do banco:

- identificador do backup e versão `acorda-custom-v1`;
- instante da transação que exportou o snapshot;
- SHA-256 do arquivo e tamanho;
- versão PostgreSQL e migrations com checksums;
- declaração de exclusão do schema de controle.

O manifesto assinado fica no histórico do backup; a chave não fica no banco,
arquivo de dump, resposta HTTP ou log. A assinatura usa serialização canônica
e comparação em tempo constante. JWT/segredos Meta não são reutilizados.

O download no frontend solicita **dois arquivos**: dump e manifesto JSON.
Ambos precisam ser guardados. A assinatura autentica, mas NÃO cifra os dados.
Armazenar essas cópias com controle de acesso adequado.

Backups antigos sem manifesto autenticado não são promovidos pelo painel.
Continuam sendo artefatos técnicos existentes, mas não é possível fabricar
retroativamente sua procedência com segurança.

## 4. Upload e inspeção

Rotas protegidas por autenticação e ADMIN. Upload privado com nome aleatório,
limite de 256 MiB, limite de campos e timeout de recebimento. Nenhum nome enviado
pelo usuário determina caminho local. Não há rota estática para arquivos.

Antes de executar conteúdo: assinatura, tamanho, SHA-256, magic custom, versão
principal PostgreSQL, ledger atual e checksums dos arquivos de migration.

Após autenticação, `pg_restore` é executado primeiro em um database aleatório
`acorda_inspecao_*`, criado exclusivamente para a operação. O banco de inspeção
é removido no encerramento, inclusive em rejeição. Não se aplica migration de
negócio ao candidato para mascarar incompatibilidade.

Inspeção compara estrutura, tabelas, colunas, PK/FK e metadados de constraints,
índices e suas definições, funções, triggers, migrations; verifica constraints
validadas e índices válidos. Registra contagens e hashes de conteúdo de todas
as tabelas públicas, estado das sequences e conteúdo de large objects.
Sequences de identidade são confrontadas com os maiores IDs.

Exige administrador ativo, hash de senha utilizável e não bloqueado. Além da
contagem, o usuário informa **credenciais de um ADMIN realmente contido no
backup**. Um processo filho inicia a aplicação sobre a inspeção e verifica
prontidão, login e consultas autenticadas. Não inicia `server.js`, jobs ou Meta.

Antes da confirmação, a tela apresenta snapshot, tamanho, hash abreviado,
PostgreSQL, migrations, tabelas e contagens. Há aviso de perda de dados posteriores.

## 5. Manutenção, drenagem e pré-backup

Início exige senha atual do ADMIN e frase `RESTAURAR SISTEMA`.

A ativação da manutenção e a admissão de operações são serializadas pela linha
do controle. Requisições de negócio, webhooks em fluxo normal e os dois jobs
periódicos recebem comprovantes de admissão.

Durante manutenção, cadastro, campanhas, reservas/envios, importações, backups
normais e alterações administrativas são bloqueados. Recuperação periódica de
mensageria e sincronização automática de templates passam pela mesma barreira.
São permitidos os controles administrativos da recuperação, login restrito a
ADMIN, webhook preservado e verificações de saúde. Prontidão informa manutenção
sem tornar a instância artificialmente morta durante uma operação longa.

A drenagem só aprova quando não há admissões abertas. O fechamento antecipado
do socket não é usado como prova de conclusão do handler. Não há timeout que
apague uma admissão e presuma que a operação terminou. Esgotado o limite de
drenagem, a operação aborta ANTES do restore e mantém manutenção.

Somente então o pré-backup completo é gerado e autenticado. Falha impede restore.
Seus metadados/manifesto ficam no controle, mesmo que o histórico operacional
de backups seja revertido posteriormente.

O servidor registra o término do download; ainda exige confirmação explícita
de custódia externa, senha e frase antes de restaurar. Essa confirmação é uma
declaração do administrador: o servidor não comprova a gravação física no disco
do computador. A cópia temporária de segurança não é apagada após download nem
por idade durante a recuperação; permanece até a liberação manual.

Há cancelamento explícito enquanto aguarda custódia, antes da etapa destrutiva,
com frase `CANCELAR RESTAURACAO` e senha. Não libera manutenção automaticamente:
reconciliação/revisão/liberação continuam necessárias.

## 6. Restore, sessões e falhas

Advisory lock de recuperação impede duas operações simultâneas. Antes de
restaurar, são novamente conferidos manutenção, fase, drenagem, candidato,
pré-backup, estrutura, download e declaração de custódia.

Restore com `--clean --if-exists --single-transaction --exit-on-error`, sem
`--create`, sem dono/ACL e excluindo o controle. Senha PostgreSQL é passada por
ambiente do processo, não argumento de linha de comando.

Depois do término da ferramenta, novo retrato deve corresponder ao snapshot
inspecionado: registros, contagens/hashes, estrutura, sequences e large objects.
Não se declara conclusão apenas por exit code zero.

`auth_epoch` é incrementado ao ativar manutenção e novamente na etapa destrutiva
e após sua validação. Isso invalida também tokens emitidos enquanto o responsável
baixava a cópia de segurança. Cada requisição autenticada verifica a versão
preservada. É obrigatório novo login após restore.

Login em manutenção consulta credenciais operacionais, mas grava auditoria e
limitação de falhas somente no controle, evitando modificar o snapshot estabilizado.
Operadores não podem entrar por esse fluxo. Fora de manutenção, o login normal
mantém suas regras existentes, com a adição do auth_epoch ao token.

Falha de restore, queda de conexão ou falha de validação posterior deixa
`recuperacao_necessaria`, mantém manutenção e conserva o pré-backup. Não há
liberação automática nem rollback compensatório inventado após commit.

Na inicialização, operações interrompidas em fases críticas são reconhecidas
sob lock e marcadas como recuperação necessária. Ausência de artefato local
impede continuar a etapa destrutiva; nunca dispara outro restore por conta própria.

## 7. Webhooks e templates

HMAC continua sendo validado antes de qualquer persistência. Em manutenção,
decisão e armazenamento ocorrem em transação serializada com ativação/liberação.
HTTP 200 somente depois da persistência. Falha do banco não é tratada como sucesso.

Payloads mistos são separados por status/mensagem/mudança. Deduplicação por chave
do evento preservado e idempotência do processamento existente. Opt-out/status
podem ser reconciliados sem esperar templates.

Depois do novo login, a ação de reconciliação local usa o serviço existente,
apenas para eventos que não exigem consulta externa. Eventos de template que
dependem da consulta oficial permanecem pendentes.

`Reconciliar templates pendentes` é uma ação manual ADMIN, ainda em manutenção.
Reutiliza a consulta GET e a validação existentes. Nos testes, somente provider
mock; nenhum POST de envio/criação/edição/submissão é chamado pelo restore.

Falhas de consulta mantêm pendência e erro sanitizado para nova tentativa.
Eventos sem correlação não são considerados resolvidos simplesmente por retry.
Não existe botão para ignorar pendências. Eventos de recuperações anteriores
preservados após a data do candidato também são recolocados para reconciliação
quando o snapshot recua, pois sua aplicação operacional pode ter sido revertida.

Liberação exige fila sem pendências, senha, frase `LIBERAR SISTEMA` e checklist
com usuários, consentimentos, bloqueios, campanhas, tentativas, indeterminados,
eventos posteriores, Meta, capacidade e secrets. Há consultas somente leitura
para revisão de dados restaurados, paginadas, sem senha_hash. A liberação é auditada.

## 8. Mensageria normal e retenção

Não foram alterados `metaCloudApiProvider.js`, `mensageriaService.js`,
`mensageriaModel.js` ou `campanhaModel.js`. Nenhum redesenho de payload, lote,
reserva, participação, tentativa, idempotência, status, capacidade ou opt-out.
Os pontos compartilhados alterados são entrada do webhook e entrada dos jobs.

Há custo adicional de consultas de admissão e auth_epoch, não uma alegação de
latência idêntica. As regras funcionais foram verificadas pelas regressões abaixo.

Não foi adicionado TTL/purge de dados operacionais ou históricos. Nem o controle
tem exclusão automática por idade. O teste preserva auditoria datada de 1970.
Cleanup remove arquivos técnicos, não seus registros históricos. Backups normais
mantêm sua política de arquivo temporário; candidato não promovido tem expiração
técnica; pré-backup em recuperação é preservado até liberação.

## 9. Testes executados

Comandos principais, na pasta backend:

```text
node scripts/testarRestoreFase2Isolado.js
node scripts/testarBackupCompletoIsolado.js
```

O runner reconstrói a conexão com BANCO_* loopback e ignora DATABASE_URL de
entrada. Confirma endereço local, cria nomes aleatórios e remove somente bancos
que criou. Testes de regressão recebem fixtures novas nesse banco descartável.
O preload de QA bloqueia HTTP externo, além dos providers fake existentes.

Resultados:

| Suíte | Resultado |
|---|---|
| Fase 2: ciclo e falhas | 74 verificações |
| Resiliência de mensageria | 16 verificações / 8 cenários |
| Backup administrativo | 40 verificações |
| Webhook existente | 16 verificações |
| Envio simplificado, incluindo aproximadamente 2.000 contatos | 2.421 verificações |
| Fase 1: geração, snapshot, concorrência e falhas | 20 verificações |
| Fase 1: restauração/integridade | 46 verificações |
| Aplicação sobre banco restaurado da Fase 1 | 7 verificações |
| Frontend: teste existente de backups | 12 verificações |
| Build frontend | Aprovado, 73 módulos |

A suíte de backup também é chamada pelo runner da Fase 1; não somar duplicatas
como cobertura diferente. Bootstrap vazio e upgrade 022/023 foram executados
somente nos bancos descartáveis. Comparação da Fase 1: 31 tabelas operacionais,
241 registros sintéticos, 29 sequences, 404 constraints, 113 índices, 1 função,
12 triggers e 1 large object.

Foram testados upload HTTP legítimo, arquivo arbitrário, truncado e adulterado,
manifesto/assinatura inválidos, versão/ledger incompatíveis, ausência de ADMIN
utilizável, operador bloqueado, download HTTP do pré-backup, falta de custódia,
drenagem pendente, falha do pré-backup, contenção do lock de restore, cancelamento
pré-destrutivo, pg_restore real com archive truncado, conexão PostgreSQL terminada
durante transação, falha injetada de validação posterior, invalidação de sessões,
bloqueio de campanhas/envio/importação/jobs, HMAC inválido, payload misto,
opt-out, status read, templates APPROVED/REJECTED, consulta mock indisponível,
idempotência, revisão sem hashes de senha, liberação manual e detecção de interrupção.

Queda de conexão foi simulada em transação PostgreSQL real no ponto do executor;
não é um teste de queda física do host nem de toda a rede DigitalOcean. A falha
pós-restore é injetada para exercitar a máquina de estados. Logs de erro Meta
mostrados nas regressões correspondem a respostas fake deliberadas.

Ciclo comprovado: snapshot A → alteração posterior → manutenção/drenagem →
pré-backup/download → restore → dados anteriores recuperados → token antigo
recusado → novo login → manutenção continua → eventos locais reconciliados →
templates via GET mock → revisão → liberação manual.

`node --check` aplicado aos 20 arquivos JavaScript backend envolvidos.
`git diff --check` sem erros. Frontend: build e teste de código existente;
não foi realizado ensaio visual/interativo em navegador nesta tarefa.

## 10. Arquivos

Novos:

- `backend/database/migrations/023_controle_recuperacao.sql`
- `backend/src/modules/backups/controleRecuperacao.js`
- `backend/src/modules/backups/manifestoBackup.js`
- `backend/src/modules/backups/ferramentasRestore.js`
- `backend/src/modules/backups/probeRestauracao.js`
- `backend/src/modules/backups/restauracaoService.js`
- `backend/src/modules/backups/restauracaoRoutes.js`
- `backend/scripts/testarRestoreFase2Isolado.js`
- `backend/scripts/bloquearRedeExternaQa.js`
- `frontend/src/components/RestauracoesAdministrativas.jsx`
- este relatório.

Alterados:

- `backend/.env.example`, `backend/package.json`, `backend/database/criar_banco.sql`;
- `backend/scripts/testarSchemaVazio.js`, `backend/scripts/testarBackupCompletoIsolado.js`;
- `backend/src/app.js`, `backend/src/server.js`;
- `backend/src/middlewares/autenticarUsuario.js`;
- `backend/src/modules/autenticacao/autenticacaoService.js`;
- `backend/src/modules/backups/backupModel.js`, `backupService.js`;
- `backend/src/modules/campanhas/sincronizacaoAutomaticaTemplates.js`;
- `backend/src/modules/mensageria/webhookController.js`;
- `frontend/src/pages/BackupsAdministrativos.jsx`.

Os relatórios de decisão anteriores já estavam no working tree e foram preservados.

## 11. Antes de produção e riscos residuais

1. Configurar `BACKUP_ASSINATURA_CHAVE` exclusiva, guardar fora do banco e manter
   cópia segura. Gerar localmente com:

   ```text
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Não enviar a chave no chat, não versionar e não reutilizar JWT/Meta. Perder ou
   trocar a chave impede autenticar cópias assinadas pela chave anterior; não
   há rotação multichave nesta implementação.
2. Configurar `PG_RESTORE_CAMINHO` para o binário 18 compatível e confirmar também
   pg_dump. `RESTORE_DRENAGEM_MS` padrão 30000, permitido 1–60000. Nenhuma dessas
   configurações foi aplicada em produção nesta tarefa.
3. Aplicar migration 023 em janela autorizada e verificar permissões de criação/
   remoção de database temporário, ownership dos objetos operacionais, leitura
   de large objects e espaço para candidato + inspeção + pré-backup.
4. Manter **uma instância backend durante este fluxo**. Arquivos temporários e
   mapa de disponibilidade são locais à instância, como no backup existente.
   Não há armazenamento compartilhado nem retomada transparente de upload após
   reinício. Com outra instância ou arquivo perdido, a operação falha fechada.
5. Não reiniciar/deployar durante restore. Se houver interrupção, a manutenção e
   auditoria sobrevivem, mas poderá ser necessária recuperação técnica com a
   cópia externa. Admissões sem conclusão não são expurgadas para forçar drenagem:
   exigem investigação. Não há botão para fingir que uma operação terminou.
6. Não executar scripts SQL, migrations ou outras escritas externas à aplicação
   durante a janela. A barreira cobre requisições/jobs instrumentados deste
   backend, não usuários que escrevam diretamente no PostgreSQL.
7. Restore antigo remove alterações operacionais posteriores por definição.
   Eventos ocorridos antes da manutenção e ausentes no candidato não são
   reconstruídos por adivinhação. O pré-backup e a revisão humana são essenciais.
8. Eventos preservados sem contato/tentativa/template correlacionável podem
   exigir intervenção técnica. Continuam pendentes e bloqueiam liberação;
   não são descartados para tornar o painel verde.
9. Objetos extras que `pg_restore --clean` não remova, como large objects ausentes
   no candidato, podem causar divergência na validação posterior. Isso mantém
   recuperação necessária; não há exclusão suplementar automática não prevista.
10. Inspeção em database separado NÃO é sandbox para SQL malicioso assinado.
    A chave e os administradores/origem do dump devem ser confiáveis. O restore
    PostgreSQL executa código do archive. Nunca autenticar arquivos de origem
    desconhecida apenas para contornar a proteção.
11. Homologar UX no navegador, múltiplos downloads, proxy/timeouts, permissões e
    dimensionamento na infraestrutura de staging equivalente antes de disponibilizar
    a operação a clientes. Build não substitui esse ensaio visual/infraestrutural.
12. O schema de controle não está no dump operacional por projeto. Backup de
    desastre do cluster/controle deve ser tratado no plano operacional do provedor;
    este fluxo não promete recuperar a perda integral desse controle usando apenas
    um dump operacional.

Referência técnica: [pg_restore 18](https://www.postgresql.org/docs/18/app-pgrestore.html)
para exclusão de schema, limites de `--clean`, transação única e execução de SQL
do archive; [pg_dump 18](https://www.postgresql.org/docs/18/app-pgdump.html)
para formato custom e exclusão do schema de controle.

## Parecer

FASE 2 DE RESTAURAÇÃO VALIDADA EM AMBIENTE ISOLADO, SEM ALTERAÇÃO FUNCIONAL DO
FLUXO NORMAL DE MENSAGERIA.

Parecer limitado aos cenários executados e às condições acima. Não é autorização
de deploy nem validação ao vivo de produção. Trabalho encerrado sem commit/push/deploy.
