# Relatório da integração com a WhatsApp Cloud API

**Projeto:** ACORDA RJ  
**Data:** 12 de agosto de 2026  
**Situação:** implementação e validação local concluídas, sem deploy e sem envio real.

## 1. Objetivo

Integrar o módulo de mensageria existente à WhatsApp Cloud API oficial da Meta,
preservando campanhas, lotes, participações, tentativas, capacidade, consentimentos,
auditoria e webhook já existentes.

## 2. O que já existia e foi preservado

- campanhas e filtros;
- lotes e reservas;
- participações únicas por contato e campanha;
- tentativas e reprocessamento;
- capacidade móvel configurável de 24 horas;
- histórico de status;
- webhook GET/POST com validação HMAC;
- estados `pendente`, `enviando`, `enviada`, `entregue`, `lida` e `falhou`;
- bloqueios, consentimentos e solicitações de exclusão.

## 3. Banco de dados

Foi criada a migration incremental:

```text
backend/database/migrations/009_integrar_meta_cloud_api.sql
```

A migration adiciona aos templates internos:

- nome oficial na Meta;
- idioma;
- categoria oficial;
- status `rascunho`, `em_analise`, `aprovado` ou `rejeitado`.

Nenhuma tabela existente foi apagada e nenhum dado pessoal foi alterado. O arquivo
`backend/database/criar_banco.sql` também foi atualizado para bancos novos.

A migration foi executada somente no banco PostgreSQL local `criar_banco`. Ela não
foi executada em produção.

## 4. Backend

Foi criado um provider exclusivo para a Meta em:

```text
backend/src/modules/mensageria/metaCloudApiProvider.js
```

O provider:

- usa `POST /{PHONE_NUMBER_ID}/messages`;
- monta o payload oficial de template;
- usa exclusivamente variáveis de ambiente;
- possui timeout;
- trata indisponibilidade, erro HTTP, erro Meta e resposta inválida;
- retorna o identificador externo da mensagem;
- não registra token, App Secret, headers ou payload bruto.

Foi criado o endpoint autenticado:

```text
POST /api/admin/mensageria/tentativas/:id/enviar
```

Antes de chamar a Meta, o backend verifica novamente:

1. tentativa pendente;
2. campanha ativa;
3. participação e lote válidos;
4. template ativo, configurado e aprovado na Meta;
5. bloqueio global para mensagens;
6. solicitação de exclusão pendente;
7. capacidade disponível na janela móvel de 24 horas.

Travas transacionais e advisory locks impedem dois envios simultâneos da mesma
tentativa. Reenvios continuam exigindo nova tentativa explícita.

## 5. Webhook e status

O webhook existente foi preservado. Ele continua tratando eventos oficiais:

- `sent`;
- `delivered`;
- `read`;
- `failed`.

Os eventos são relacionados pelo identificador externo da Meta. Eventos repetidos
ou atrasados não duplicam histórico nem fazem o status regredir.

## 6. Opt-out

Foi implementado o processamento do quick reply identificado por:

```text
nao_quero_mais_receber
```

O identificador pode ser configurado por `WHATSAPP_OPTOUT_BUTTON_ID`.

Ao receber o evento, o sistema:

- normaliza o telefone enviado oficialmente pela Meta;
- identifica o contato;
- registra a revogação do consentimento de mensagens;
- registra origem WhatsApp/Meta e data/hora;
- preserva o histórico;
- marca `bloqueado_para_mensagens`;
- impede futuras reservas e envios;
- não exclui o contato;
- trata repetições do webhook de forma idempotente.

Importações de contatos existentes não alteram o campo de bloqueio e, portanto,
não removem o opt-out.

## 7. Frontend

A tela de campanhas passou a:

- exibir a situação oficial do template na Meta;
- permitir configurar nome oficial, idioma, categoria e status;
- informar quando um template ainda não está aprovado;
- desabilitar visualmente o envio quando campanha, tentativa ou template não
  estiverem aptos;
- apresentar erros de domínio sem exibir a resposta bruta da Meta;
- permitir enviar uma tentativa pela lista de contatos do lote.

Nenhuma credencial Meta é enviada ao frontend.

## 8. Variáveis necessárias

```env
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
META_GRAPH_API_VERSION=
META_REQUISICAO_TIMEOUT_MS=10000
WHATSAPP_OPTOUT_BUTTON_ID=nao_quero_mais_receber
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
META_APP_SECRET=
```

Os valores reais não foram adicionados ao repositório.

## 9. Testes executados

### Integração Meta com mocks

```powershell
npm run testar:meta
```

Resultado: **16 verificações aprovadas**.

Foram validados:

- payload e endpoint oficiais;
- template aprovado;
- bloqueio de template não aprovado antes do provider;
- sucesso com armazenamento do ID externo;
- timeout;
- erro Meta sanitizado;
- clique duplo e concorrência sem duplicidade;
- capacidade recalculada antes do provider;
- opt-out persistente;
- bloqueio de tentativa posterior;
- idempotência do opt-out.

### Webhook

```powershell
npm run testar:webhook
```

Resultado: **6 verificações aprovadas**.

### Campanhas, lotes e mensageria

```powershell
npm run testar:campanhas
```

Resultado: **27 verificações aprovadas**.

### Schema vazio

```powershell
npm run testar:schema-vazio
```

Resultado: **29 tabelas, 166 bairros e 9 migrations validadas**.

### Frontend

```powershell
npm run build
```

Resultado: **69 módulos transformados e build concluído**.

Também foram executados `node --check`, nova execução idempotente do runner de
migrations e `git diff --check`.

## 10. Situação da validação

### Validado por teste local/mock

- provider e payload;
- persistência de tentativa e ID externo;
- erros e timeout;
- concorrência;
- capacidade;
- webhook e transições de status;
- opt-out;
- migration e schema vazio;
- build do frontend.

### Validado em produção

Nada desta integração foi validado em produção. Não houve deploy, alteração nas
configurações da Meta ou envio real.

## 11. Pendências para o primeiro teste em produção

1. criar e validar backup do banco de produção;
2. aplicar somente a migration `009` pelo runner;
3. configurar as credenciais reais no backend;
4. cadastrar e aprovar o template no WhatsApp Manager;
5. configurar o quick reply com o mesmo identificador do opt-out;
6. validar o webhook no painel da Meta;
7. executar um primeiro envio controlado para número autorizado;
8. acompanhar `sent`, `delivered`, `read` ou `failed` no histórico.

Templates oficiais que utilizem variáveis dinâmicas exigirão a definição explícita
dos componentes antes do primeiro envio desse modelo.

Em 12 de agosto de 2026, uma etapa posterior incorporou a fonte oficial
`whatsapp_business_manager_messaging_limit` e o webhook
`business_capability_update`. A regra completa e os testes estao em
`RELATORIO_SINCRONIZACAO_LIMITE_META_2026-08-12.md`.

## 12. Arquivos principais alterados

- `backend/database/migrations/009_integrar_meta_cloud_api.sql`;
- `backend/database/criar_banco.sql`;
- `backend/src/modules/mensageria/metaCloudApiProvider.js`;
- `backend/src/modules/mensageria/mensageriaService.js`;
- `backend/src/modules/mensageria/mensageriaModel.js`;
- `backend/src/modules/mensageria/mensageriaController.js`;
- `backend/src/modules/mensageria/mensageriaRoutes.js`;
- `backend/src/modules/campanhas/campanhaModel.js`;
- `backend/src/modules/campanhas/campanhaService.js`;
- `backend/scripts/testarIntegracaoMeta.js`;
- `frontend/src/pages/CampanhasAdministrativas.jsx`;
- `frontend/src/services/campanhaService.js`;
- `.env.example` e READMEs relacionados.
