# Relatório — Correção de resiliência de envio e webhook Meta

**Projeto:** ACORDA RJ  
**Data:** 10 de setembro de 2026  
**Validação:** PostgreSQL temporário local e provider Meta fake  
**Produção, Meta real, deploy, commit e push:** não acessados ou realizados

## 1. Problemas corrigidos

Foram corrigidas exclusivamente as duas janelas identificadas na auditoria:

1. uma falha de transporte ou interrupção depois da chamada ao provider podia
   deixar a tentativa em `enviando` sem distinguir falha confirmada de resultado
   desconhecido;
2. um status oficial recebido antes de o identificador da mensagem estar
   associado à tentativa era registrado como consumido e não podia ser
   correlacionado posteriormente.

Os estados oficiais continuam vindo exclusivamente da Meta. O sistema não
transforma ausência de resposta em `sent`, `delivered`, `read` ou `failed`.

## 2. Recuperação de tentativas

O tratamento agora distingue três resultados:

- **envio confirmado:** a resposta aceita contém o identificador oficial e a
  tentativa é confirmada localmente;
- **falha confirmada:** a Meta devolve uma resposta explícita de erro e a
  tentativa segue o fluxo já existente de falha;
- **resultado desconhecido:** timeout, falha de rede, resposta aceita sem
  identificador ou interrupção antes da confirmação local não são tratados como
  falha confirmada.

O resultado desconhecido é persistido na tentativa, mantém o vínculo e o
histórico original e desabilita nova tentativa automática. A tentativa continua
protegida pelo estado `enviando`, mas recebe a marca específica
`resultado_indeterminado_em` e não entra na lista de falhas reenviáveis.

Na interface administrativa, o histórico apresenta:

```text
Confirmação pendente — não reenviar
```

Tentativas `enviando` interrompidas há mais de dois minutos são identificadas
como indeterminadas. A recuperação roda na inicialização e a cada minuto, com
proteção contra execuções sobrepostas. Ela nunca chama o provider e nunca
reenvia mensagens.

Essa estratégia evita duplicidade. Se não existe identificador ou webhook
oficial capaz de confirmar o resultado, a tentativa permanece bloqueada para
avaliação, sem o sistema inventar um estado.

## 3. Webhook antecipado

O registro existente de eventos de webhook passou a diferenciar evento
**pendente** de evento **processado**.

Quando um `status` oficial chega antes da correlação:

- o identificador da mensagem, o estado oficial, o timestamp oficial e o erro
  sanitizado, quando existente, são persistidos;
- o evento permanece pendente, sem atualizar tentativa ou histórico incorretos;
- a repetição do mesmo webhook reutiliza o registro, sem duplicá-lo;
- quando o identificador é associado à tentativa, os eventos pendentes são
  processados na mesma transação;
- eventos ainda pendentes e já correlacionáveis também são retomados pela
  recuperação periódica.

As notificações podem chegar fora da ordem de entrega. O processamento agora
usa o timestamp oficial do `statuses[]` junto com a progressão dos estados para
impedir regressões. Um evento atrasado é preservado como processado, mas não
substitui um estado oficial posterior.

A assinatura HMAC, o corpo bruto do webhook, o opt-out e sua idempotência não
foram alterados.

Referências oficiais verificadas:

- https://www.postman.com/meta/whatsapp-business-platform/folder/fuaee8l/statuses-object
- https://www.postman.com/meta/whatsapp-business-platform/request/rgtfq23/message-status-update-notifications
- https://www.postman.com/meta/whatsapp-business-platform/folder/vzaxn16/webhook-payload-reference

## 4. Migration

Foi necessária a migration incremental:

```text
021_resiliencia_envio_webhook.sql
```

Ela reutiliza `campanha_tentativas` e `eventos_webhook_mensageria` e adiciona
somente os campos necessários para:

- marcar resultado indeterminado;
- registrar o timestamp oficial do último status aplicado;
- conservar o conteúdo sanitizado do status antecipado;
- controlar correlação pendente/processada;
- localizar rapidamente tentativas indeterminadas e eventos pendentes.

Nenhuma tabela paralela foi criada. A migration foi validada tanto no schema
vazio quanto como atualização incremental após a migration 020, sempre em
PostgreSQL temporário local. Ela não foi aplicada ao banco local principal nem
à produção.

## 5. Testes simulados

O teste dedicado cobriu oito cenários:

1. `pendente → enviando → provider aceita → enviada`;
2. falha de transporte após início da chamada, classificada como desconhecida;
3. tentativa antiga presa em `enviando`, identificada sem reenvio;
4. webhook `read` antes da persistência do identificador, mantido pendente e
   correlacionado depois;
5. repetição do mesmo webhook sem duplicação;
6. `sent`, `delivered`, `read` e `failed` entregues fora de ordem;
7. cenário isolado com 2.000 contatos e lotes sucessivos;
8. opt-out real simulado durante campanha ativa, com repetição idempotente.

Resultados:

```text
Resiliência de envio e webhook
16 verificações aprovadas em 8 cenários.

Fluxo campanhas → Meta fake
17 grupos aprovados; nenhuma chamada real executada.

Envio simplificado
2.421 verificações aprovadas com 2.000 contatos.

Cenário E2E final
22 verificações aprovadas.

Integração Meta com mocks
16 verificações aprovadas.

Webhook de mensageria
16 verificações aprovadas.

Schema vazio
31 tabelas, 166 bairros e 21 migrations aprovadas.

Migration incremental 021
Aprovada em PostgreSQL temporário local.

Prévia frontend
64 verificações aprovadas.
```

## 6. Arquivos alterados

### Backend e banco

- `backend/database/migrations/021_resiliencia_envio_webhook.sql`;
- `backend/database/criar_banco.sql`;
- `backend/src/modules/mensageria/mensageriaModel.js`;
- `backend/src/modules/mensageria/mensageriaService.js`;
- `backend/src/modules/mensageria/metaCloudApiProvider.js`;
- `backend/src/modules/campanhas/campanhaModel.js`;
- `backend/src/modules/campanhas/campanhaService.js`;
- `backend/src/server.js`;
- `backend/scripts/testarResilienciaMensageria.js`;
- `backend/scripts/testarFluxoCampanhasMetaIsolado.js`;
- `backend/scripts/testarSchemaVazio.js`;
- `backend/scripts/testarEstruturaBanco.js`;
- `backend/package.json`.

### Frontend

- `frontend/src/pages/CampanhasAdministrativas.jsx`;
- `frontend/scripts/testarPreviaModeloMensagem.js`.

### Relatório

- `RELATORIO_CORRECAO_RESILIENCIA_ENVIO_WEBHOOK_META_2026-09-10.md`.

O relatório anterior da auditoria permanece como registro do estado anterior à
correção.

## 7. Build e verificações finais

```text
npm run build
72 módulos transformados; aprovado.

node --check
Oito arquivos backend relevantes aprovados.

git diff --check
Aprovado; somente avisos informativos de conversão LF/CRLF do Git no Windows.
```

## 8. Segurança e conclusão

- nenhuma chamada real à Meta;
- nenhuma mensagem real enviada;
- nenhum limite real consumido;
- nenhum template real criado ou alterado;
- nenhum banco permanente ou de produção alterado;
- nenhum secret ou variável de ambiente alterado;
- nenhum deploy, commit ou push.

A Meta continua sendo a fonte de verdade. O sistema não presume sucesso nem
falha quando o resultado externo é desconhecido, não reenvia automaticamente
uma tentativa ambígua e não perde silenciosamente um status oficial que chegou
antes da correlação local.

**CORREÇÃO APROVADA EM AMBIENTE ISOLADO E PRONTA PARA VALIDAÇÃO MANUAL ANTES DA
PUBLICAÇÃO CONTROLADA DA MIGRATION 021 E DO CÓDIGO.**
