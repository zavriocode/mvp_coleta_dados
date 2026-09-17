# Relatorio da sincronizacao segura do limite da Meta

**Projeto:** ACORDA RJ  
**Data:** 12 de agosto de 2026  
**Validacao:** local e com mocks; sem deploy e sem envio real.

## Fonte oficial

A Meta disponibiliza o limite atual pelo endpoint do numero comercial:

```text
GET /{BUSINESS_PHONE_NUMBER_ID}?fields=whatsapp_business_manager_messaging_limit
```

O campo anterior `messaging_limit_tier` esta obsoleto. Mudancas de capacidade
podem ser informadas pelo webhook oficial `business_capability_update`, no campo
`max_daily_conversations_per_business`.

Referencias oficiais consultadas:

- https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits
- https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api

## Regra implementada

- o limite interno continua configuravel somente por administrador, com motivo e auditoria;
- o limite oficial e armazenado separadamente;
- o limite efetivo e sempre o menor entre a protecao interna e o limite oficial finito;
- um aumento oficial nao aumenta sozinho a protecao interna;
- uma reducao oficial diminui imediatamente a capacidade de novas reservas e envios;
- `TIER_UNLIMITED` mantem a protecao interna como teto;
- falha, timeout, token invalido ou resposta desconhecida preservam o ultimo valor oficial valido;
- reservas, envios, alteracao manual e sincronizacao compartilham a mesma trava transacional;
- nenhuma credencial, resposta bruta ou token e armazenado no historico.

## Banco e API

Migration criada:

```text
011_sincronizar_limite_meta.sql
```

Tabela criada:

```text
sincronizacoes_limite_meta
```

Rota administrativa:

```text
POST /api/admin/campanhas/configuracao/limite/sincronizar-meta
```

O painel apresenta limite efetivo, protecao interna, tier oficial, uso nas
ultimas 24 horas e capacidade disponivel.

## Testes

- `npm run testar:limite-meta`: 21 verificacoes aprovadas;
- `npm run testar:campanhas`: 27 verificacoes aprovadas;
- `npm run testar:webhook`: 7 verificacoes aprovadas;
- `npm run testar:schema-vazio`: 30 tabelas, 11 migrations e 166 bairros;
- `npm run build`: build do frontend aprovado.

Foram simulados aumento, reducao, resposta invalida, timeout, indisponibilidade,
token invalido, webhook assinado, permissao de operador, auditoria e concorrencia.

## Producao

Nada desta alteracao foi validado em producao. Para a atualizacao automatica por
webhook funcionar, o app da Meta precisa estar inscrito no campo
`business_capability_update`. A consulta administrativa funciona somente com as
credenciais e permissoes oficiais validas do ambiente.
