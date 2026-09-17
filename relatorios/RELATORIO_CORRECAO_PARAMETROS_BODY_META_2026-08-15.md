# Relatório — Correção dos parâmetros do BODY na Meta

**Projeto:** ACORDA RJ  
**Data:** 15 de agosto de 2026  
**Validação:** provider Meta fake e PostgreSQL temporário isolado  
**Produção, deploy, commit e push:** não realizados

## 1. BODY usado no cenário equivalente

O banco local conectado não contém a tentativa de produção `8` nem templates
externos `APPROVED`. Portanto, o texto exato persistido em produção não pôde ser
lido e não foi inventado como se fosse uma evidência real.

Para reproduzir o contrato confirmado pelo erro Meta 132000, o teste equivalente
usou o componente sincronizado:

```json
{ "type": "body", "text": "Ola {{1}}, confirme sua participacao." }
```

## 2. Quantidade de variáveis

O BODY equivalente possui exatamente uma variável posicional: `{{1}}`. A
configuração operacional existente associou essa posição a `nome_contato`, e o
contato artificial forneceu `Maria da Silva`.

Também foram exercitados BODY com `{{1}}` e `{{2}}` e BODY sem variável.

## 3. Por que o payload enviava zero

O analisador de requisitos normalizava o tipo do componente com
`toUpperCase()` e reconhecia tanto `BODY` quanto `body`. O montador do payload,
porém, procurava somente a igualdade literal `item.type === 'BODY'`.

No cenário sincronizado com `type: "body"`, a configuração passava pela análise,
mas o provider não encontrava o componente oficial. Como consequência, obtinha
zero posições e não adicionava o componente `body` ao payload.

## 4. Local onde o parâmetro era perdido

O parâmetro era perdido em:

```text
backend/src/modules/mensageria/metaCloudApiProvider.js
→ montarComponentesEnvio
→ busca de corpoOficial
```

O fluxo anterior permanecia coerente até esse ponto:

```text
meta_componentes → analisadorRequisitosTemplate → configuração operacional
→ mensageriaService → metaCloudApiProvider → montagem do payload
```

## 5. Correção aplicada

A busca do BODY no provider passou a usar a mesma normalização do analisador:

```js
String(item && item.type || '').toUpperCase() === 'BODY'
```

A resolução continua usando as posições reais do texto e o mapeamento existente,
na ordem `{{1}}`, `{{2}}` e seguintes. Nenhum parâmetro é criado quando não há
variável.

Quando o dado mapeado está ausente, o provider interrompe antes do `fetch` fake
com `CONFIGURACAO_ENVIO_INCOMPLETA`. Não envia array vazio nem classifica a
falha local como recusa da Meta.

## 6. Payload final fake do BODY

O JSON inspecionado imediatamente antes do `fetch` fake foi equivalente a:

```json
{
  "type": "body",
  "parameters": [
    {
      "type": "text",
      "text": "Maria da Silva"
    }
  ]
}
```

O mesmo payload preservou o `HEADER IMAGE` por Media ID e o botão SAIR. O
QUICK_REPLY oficial comum não recebeu configuração artificial.

## 7. Regressão específica do erro 132000

Foi criado:

```text
backend/scripts/testarRegressaoParametrosBodyMeta.js
```

Resultado:

```text
Regressao Meta 132000: 13 verificacoes aprovadas;
BODY esperado/enviado = 1/1, 2/2 e 0/0.
```

O teste confirma também que dado ausente bloqueia antes do provider fake.

## 8. Demais testes executados

```text
npm run testar:requisitos-templates
22 verificações aprovadas.

npm run testar:templates-meta
38 verificações aprovadas.

npm run testar:meta
16 verificações aprovadas.

npm run testar:fluxo-campanhas-meta
12 grupos aprovados, incluindo a regressão 132000.
```

O fluxo isolado criou e removeu seu banco PostgreSQL temporário. Também passaram
as verificações de sintaxe dos arquivos JavaScript alterados.

## 9. Build

```text
npm run build
72 módulos transformados; build aprovado.
```

## 10. Integridade do diff

```text
git diff --check
Aprovado.
```

Nenhuma migration, tabela, campanha, lote, capacidade, webhook, opt-out,
concorrência ou idempotência foi alterada.

## 11. Ausência de chamada real à Meta

Todos os envios foram interceptados por `definirFetchParaTeste`. Nenhuma
requisição real foi feita à Graph API, nenhuma mensagem foi enviada e nenhum
custo real foi gerado.

## 12. Resultado

No cenário equivalente externo, `APPROVED`, com `HEADER IMAGE`, BODY com `{{1}}`
e botões oficiais, o provider fake recebe agora exatamente **um parâmetro no
BODY**, preenchido com o valor real do mapeamento configurado.

**REGRESSÃO META 132000 CORRIGIDA E VALIDADA LOCALMENTE.**
