# Fase 2 — decisão adicional sobre reconciliação de templates

> **Documento histórico de bloqueio.** A decisão foi posteriormente aprovada e
> implementada; “não implementada” abaixo descreve apenas aquele momento. Estado
> final: [../STATUS_FINAL_DO_PROJETO.md](../STATUS_FINAL_DO_PROJETO.md).

Data: 16/09/2026.

Estado: implementação suspensa pela regra de parar diante de nova decisão
arquitetural relevante. A Fase 2 NÃO está implementada nem validada.

## Decisões já aprovadas — não estão sendo reabertas

A sequência aprovada será mantida: autenticação do backup, inspeção isolada,
confirmação forte, manutenção persistente, drenagem comprovada, backup de
segurança, download/custódia, restore, validação, reconciliação, novo login/revisão
e liberação manual.

A alternativa escolhida é A: schema de controle no mesmo PostgreSQL, sem FKs
para dados operacionais, excluído do dump operacional e do conjunto restaurado.
Essa escolha evita um segundo banco de controle e mantém manutenção, auth_epoch,
operações/auditoria de restore, caixa de webhooks e metadados do pré-backup fora
do snapshot operacional. Trata-se de decisão de desenho, ainda não de código.

## Novo achado concreto

O processador existente não trata somente status de mensagens e opt-out.
Ele também recebe `message_template_status_update`.

Evidências na revisão atual do código:

- `backend/src/modules/mensageria/mensageriaService.js`, função
  `processarWebhook`: encaminha eventos de templates para
  `templateMetaService.processarAtualizacaoDoWebhook`.
- `backend/src/modules/campanhas/templateMetaService.js:256`: reconhece
  `APPROVED`, `IN_APPEAL`, `PENDING`, `REJECTED`, `PENDING_DELETION`, `DELETED`,
  `DISABLED`, `FLAGGED` e `REINSTATED`.
- Nesse método, somente `PENDING_DELETION`, `DELETED`, `DISABLED` e `FLAGGED`
  seguem o caminho sem consulta externa. Os demais passam por
  `metaProvider.buscarTemplateOficialPorId` na linha 272.
- `backend/src/modules/mensageria/metaCloudApiProvider.js:497`: essa função
  executa GET real na Meta para obter identificação, nome, idioma, status,
  categoria, formato dos parâmetros e componentes.
- `backend/src/modules/campanhas/campanhaModel.js:958`: o resultado consultado
  é usado para sincronizar o template e seus componentes, não apenas um rótulo
  de status.

Portanto, reproduzir integralmente a caixa preservada pelo processador atual
pode chamar a Meta. Nenhuma chamada foi feita nesta análise.

## Por que não resolver silenciosamente

Há três restrições simultâneas: não chamar Meta no restore, reconciliar eventos
preservados antes de liberar envios e não mudar regras já validadas de templates.

Reutilizar o processador sem separar esse caso viola a primeira. Marcar o evento
como reconciliado sem processá-lo viola a segunda. Aplicar diretamente um evento
como APPROVED, substituindo a consulta que hoje valida também os componentes,
muda comportamento validado e pode deixar status/configuração divergentes.

Manter os eventos pendentes é seguro, mas, sem uma via aprovada para resolvê-los,
a liberação deve permanecer bloqueada. Isso cria uma consequência operacional
relevante: a manutenção pode ficar sem caminho administrativo de conclusão.

## Decisão recomendada, ainda não autorizada

Separar explicitamente duas etapas:

1. **Restore e reconciliação local:** nenhuma chamada à Meta e nenhum envio.
   Preservar todos os eventos; aplicar somente os que podem ser tratados sem
   consulta externa, com idempotência. Os demais continuam pendentes e impedem
   a liberação. Payloads mistos precisam de acompanhamento por evento para não
   atrasar opt-outs nem repetir alterações já aplicadas.
2. **Revisão administrativa posterior ao restore, ainda em manutenção:** uma
   ação manual específica e auditada de consulta oficial dos templates
   pendentes. Reutilizar a validação existente, sem criar templates e sem
   enviar mensagens. Falha ou pendência não resolvida mantém manutenção.
   Só então permitir a revisão final e a liberação explícita.

Essa segunda etapa precisa de autorização expressa como exceção limitada à
consulta oficial durante a revisão posterior. Não será executada nesta tarefa:
qualquer implementação/teste usaria exclusivamente provider mock.

Se nenhuma consulta oficial for permitida nem nessa revisão, será necessário
definir outro procedimento de resolução antes de habilitar a liberação. Não
será criado um botão para ignorar silenciosamente eventos pendentes.

## Trabalho executado e limites

- Leitura do pedido original, da decisão anterior e dos módulos afetados.
- Verificação dos dois agendamentos existentes: recuperação de mensageria e
  sincronização de templates; ambos precisam de barreira e drenagem.
- Verificação de que o login atual grava no banco operacional; também precisa
  de tratamento para não desestabilizar o snapshot durante manutenção.
- Nenhum código funcional, migration, `.env` ou dado foi alterado.
- Nenhum acesso a banco local ou de produção; nenhum restore ou backup executado.
- Nenhuma chamada Meta, envio, commit, push ou deploy.
- Único arquivo criado nesta retomada: este relatório. O relatório arquitetural
  anterior, já presente no working tree, foi preservado.
- Testes funcionais, testes isolados, build e `node --check`: não executados;
  não houve implementação a validar. Não declarar a Fase 2 concluída.
- `git diff --check`: executado sem erros; o relatório novo, não rastreado,
  também foi verificado separadamente quanto a whitespace.

Próximo passo depende apenas da decisão sobre a consulta manual pós-restore;
as aprovações anteriores continuam válidas.
