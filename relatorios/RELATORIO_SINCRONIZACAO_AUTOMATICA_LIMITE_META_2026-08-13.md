# Relatório — Sincronização automática do limite Meta

**Projeto:** ACORDA RJ  
**Data:** 13 de agosto de 2026  
**Validação:** ambiente local, com mocks e sem envio real  
**Deploy:** não realizado

## 1. Comportamento automático

O processamento existente do webhook `business_capability_update` foi validado
e ajustado para atualizar automaticamente o limite oficial informado pela Meta.

Quando um evento oficial válido chega ao backend, o sistema:

1. preserva a validação HMAC existente;
2. identifica e valida o valor oficial recebido;
3. atualiza somente o limite oficial Meta;
4. registra data, hora e origem `webhook_meta`;
5. mantém o histórico de auditoria;
6. recalcula imediatamente a capacidade operacional efetiva;
7. não exige ação manual do administrador.

Eventos consecutivos repetidos, com o mesmo tier e o mesmo limite, não criam
registros duplicados. Payloads inválidos, incompletos ou sem o campo oficial não
alteram o último limite oficial válido.

Não foram alterados a validação HMAC, os locks, a autorização administrativa ou
o tratamento conservador de falhas.

## 2. Regra de capacidade preservada

A capacidade operacional efetiva continua sendo calculada por:

```text
min(proteção interna, limite oficial Meta finito)
```

Exemplo:

```text
Limite oficial Meta: 2.000
Proteção interna: 150
Capacidade operacional efetiva: 150
```

Se a Meta reduzir o limite oficial para um valor inferior à proteção interna, o
valor efetivo também é reduzido imediatamente para novas reservas e envios.

Se a Meta aumentar o limite, a proteção interna não é aumentada automaticamente.

## 3. Painel de campanhas

O painel passou a apresentar separadamente:

- limite oficial Meta;
- tier oficial informado;
- data e hora da última atualização oficial;
- proteção interna;
- capacidade operacional efetiva;
- utilização nas últimas 24 horas;
- capacidade restante.

O campo usado para alterar a proteção interna agora exibe como valor inicial a
própria proteção interna, e não o limite efetivo.

O painel também informa que a atualização automática está ativa e que o botão
`Sincronizar Meta` serve somente para conferência ou contingência.

## 4. Sincronização manual

A rota e o botão de sincronização manual foram preservados. O administrador
continua podendo consultar novamente a Meta quando precisar confirmar o estado
oficial.

Operadores comuns continuam sem permissão para alterar a proteção interna ou
executar operações administrativas de capacidade.

## 5. Banco de dados

Foi criada a migration incremental:

```text
012_identificar_webhook_meta.sql
```

Ela permite registrar a origem `webhook_meta` sem remover a origem histórica
`webhook` dos registros antigos.

A migration foi aplicada somente no banco local `criar_banco`. Uma segunda
execução do runner confirmou que nenhuma migration foi reaplicada.

## 6. Arquivos alterados

- `backend/database/migrations/012_identificar_webhook_meta.sql`;
- `backend/database/criar_banco.sql`;
- `backend/src/modules/campanhas/campanhaModel.js`;
- `backend/src/modules/campanhas/limiteMetaService.js`;
- `backend/scripts/testarSincronizacaoLimiteMeta.js`;
- `backend/scripts/testarWebhookMensageria.js`;
- `backend/scripts/testarSchemaVazio.js`;
- `frontend/src/pages/CampanhasAdministrativas.jsx`;
- `frontend/src/styles/administrativo.css`.

## 7. Testes executados

### Sincronização do limite Meta

```text
Sincronização segura do limite Meta: 24 verificações aprovadas.
```

Foram cobertos aumento, redução, limite oficial maior e menor que a proteção
interna, evento duplicado, valor inválido, indisponibilidade, timeout, token
inválido, auditoria e permissão de operador.

### Webhook

```text
Webhook de mensageria: 10 verificações aprovadas.
```

Foram cobertos assinatura válida, assinatura inválida, aumento, redução,
duplicidade, campo ausente e payload malformado.

### Campanhas e concorrência

```text
Campanhas, lotes e mensageria: 27 verificações aprovadas.
```

Foi confirmada a proteção contra operações concorrentes ultrapassarem a
capacidade efetiva.

### Banco vazio

```text
Schema final validado em banco vazio: 30 tabelas e 166 bairros.
```

O ledger contém 12 migrations, incluindo a migration `012`.

### Frontend

```text
Build concluído com sucesso: 70 módulos transformados.
```

## 8. Pendências reais

- a migration `012` ainda precisa ser aplicada no banco de produção;
- a alteração ainda não foi implantada;
- o comportamento novo foi validado localmente e com mocks, não em produção;
- nenhuma mensagem real foi enviada durante os testes.
