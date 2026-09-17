# Relatório — Opt-out no histórico da mensagem e do contato

**Projeto:** ACORDA RJ  
**Data:** 17 de agosto de 2026  
**Validação:** PostgreSQL temporário isolado e provider Meta fake  
**Meta real, produção, deploy, commit e push:** não realizados

## 1. Evento oficial utilizado

O sistema continua separando dois contratos recebidos pelo webhook oficial:

- `statuses[]` mantém os estados oficiais `sent`, `delivered`, `read` e
  `failed` da mensagem;
- `messages[]` representa a mensagem recebida quando a pessoa interage. Para um
  botão de resposta rápida de template, o webhook informa uma mensagem do tipo
  `button`, com o identificador operacional em `button.payload` e, quando
  disponível, a mensagem original em `context.id`.

O opt-out somente é reconhecido quando o payload recebido é igual a
`WHATSAPP_OPTOUT_BUTTON_ID`. O texto visível do botão não participa dessa
decisão. Uma resposta rápida comum não é tratada como opt-out.

Referências oficiais consultadas:

- https://www.postman.com/meta/whatsapp-business-platform/folder/vzaxn16/webhook-payload-reference
- https://www.postman.com/meta/whatsapp-business-platform/folder/1dtuocp/messages-object
- https://www.postman.com/meta/whatsapp-business-platform/request/lwtlz1k/send-message-template-interactive

## 2. Alteração realizada

O evento `opt_out_whatsapp`, que já era gravado de forma idempotente somente
após o webhook real, passou a ser lido no histórico do envio pela associação
com a tentativa registrada no `context.id`.

Nos detalhes do envio, a interface apresenta separadamente:

```text
Status da mensagem
Lida — data e hora

Ação do contato
Não deseja mais receber contatos — data e hora
```

O status `lida` não é substituído nem reinterpretado. Bloqueios ou
consentimentos revogados sem o evento `opt_out_whatsapp` não geram a indicação
de clique.

No histórico do contato, o mesmo evento passou a usar a descrição amigável
**Ação do contato — Não deseja mais receber contatos**, sem exibir payload,
tipo técnico, identificador de mensagem ou detalhes do webhook.

O motivo de auditoria deixou de depender do rótulo literal `SAIR` e passou a
descrever o botão de não receber mais contatos. Revogação, bloqueio global,
inelegibilidade e idempotência permaneceram inalterados.

## 3. Arquivos alterados

- `backend/src/modules/campanhas/campanhaModel.js`;
- `backend/src/modules/campanhas/campanhaService.js`;
- `backend/src/modules/mensageria/mensageriaModel.js`;
- `backend/scripts/testarCenarioFinalCampanhaMeta.js`;
- `frontend/src/pages/CampanhasAdministrativas.jsx`;
- `frontend/src/pages/DetalhesContato.jsx`;
- `frontend/scripts/testarPreviaModeloMensagem.js`;
- `RELATORIO_AJUSTE_HISTORICO_OPTOUT_2026-08-17.md`.

Nenhuma migration, tabela, template, payload de envio, regra de campanha,
capacidade, consentimento, bloqueio ou integração Meta foi alterada.

## 4. Testes

```text
npm run testar:fluxo-campanhas-meta
15 grupos aprovados.

Cenário E2E final de 2 contatos: 22 verificações aprovadas.
Envio simplificado de campanhas: 2.421 verificações aprovadas.
```

O cenário confirmou:

1. mensagem lida sem opt-out permanece somente como `lida`;
2. mensagem lida com webhook real de opt-out mantém `lida` e acrescenta a ação;
3. bloqueio sem evento de clique não produz a ação;
4. texto visual diferente de `SAIR` continua funcionando pelo payload correto;
5. resposta rápida comum, mesmo com texto `SAIR`, não produz opt-out;
6. webhook repetido não duplica o histórico;
7. revogação e barreira anterior ao provider continuam funcionando.

Também foram aprovados:

```text
npm run testar:previa-modelo
60 verificações aprovadas.

npm run build
72 módulos transformados; build aprovado.

node --check
Quatro arquivos backend alterados aprovados.

git diff --check
Aprovado.
```

## 5. Conclusão

A Meta continua sendo a fonte de verdade. Os estados da mensagem vêm
exclusivamente de `statuses[]`; a ação de opt-out só aparece quando o webhook
oficial entrega uma mensagem recebida cujo payload corresponde à associação
operacional configurada.

Nenhuma chamada real à Meta foi feita, nenhuma mensagem foi enviada e nenhuma
alteração foi realizada em produção.

**AJUSTE DO HISTÓRICO DE OPT-OUT APROVADO LOCALMENTE.**
