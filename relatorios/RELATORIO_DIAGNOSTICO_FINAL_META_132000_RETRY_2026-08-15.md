# Relatório — Diagnóstico do Meta 132000 no reprocessamento

**Projeto:** ACORDA RJ  
**Data:** 15 de agosto de 2026  
**Validação:** rota HTTP real local, PostgreSQL temporário e provider Meta fake  
**Produção, deploy, commit e push:** não realizados

## 1. Por que o teste anterior passou e produção continuou com zero

O teste anterior chamava o provider diretamente com um comando já montado. Ele
provava a montagem isolada, mas não atravessava autenticação, rota, controller,
reprocessamento, nova tentativa e a query SQL usada em produção.

O novo teste percorreu todo esse caminho e também terminou com um parâmetro no
BODY. Portanto, o retry atual do repositório **não reproduziu** a perda. Sem os
dados estruturais da tentativa de produção ou uma identificação verificável da
versão publicada, afirmar outra causa seria hipótese.

## 2. Objeto que chega ao envio da tentativa

`mensageriaModel.iniciarEnvio` lê, sob transação e locks, a tentativa,
participação, campanha, contato e modelo. O objeto retornado contém:

```text
meta_nome
meta_idioma
meta_origem
meta_status_oficial
meta_componentes
meta_configuracao_envio
contato_nome
contato_bairro
contato_problema
telefone_normalizado
```

`mensageriaService.enviar` repassa esses campos diretamente ao provider. Não foi
encontrado objeto reduzido, nova leitura parcial ou serialização intermediária
no reprocessamento.

## 3. Componentes oficiais observados no teste real local

O template externo `APPROVED` persistido em JSONB e relido pela mesma query
produziu a estrutura segura:

```json
[
  { "tipo": "HEADER", "formato": "IMAGE" },
  { "tipo": "BODY", "quantidadeVariaveis": 1 },
  { "tipo": "BUTTONS", "quantidadeBotoes": 2 }
]
```

Nenhum texto, URL, Media ID ou conteúdo das variáveis é incluído no log.

## 4. Variáveis esperadas, configuradas e resolvidas

No caminho HTTP completo do retry:

```json
{
  "variaveisEsperadas": [1],
  "variaveisConfiguradas": [1],
  "variaveisResolvidas": [1]
}
```

O valor de `{{1}}` foi obtido do mapeamento existente, mas não foi registrado.

## 5. Ponto exato onde o BODY desaparecia

No checkout atual, o BODY **não desaparece** em nenhum ponto do caminho real
local. A sequência comprovada foi:

```text
POST /tentativas/:id/reprocessar
→ nova tentativa pendente
→ POST /tentativas/:id/enviar
→ controller
→ service
→ mensageriaModel.iniciarEnvio
→ JSONB completos do modelo
→ montarPayload
→ log estrutural
→ fetch fake com body.parameters.length = 1
```

Assim, o erro de produção não autoriza concluir que a query ou o retry remove o
BODY. O próximo log de produção é necessário para distinguir dados oficiais
diferentes, versão publicada diferente ou formato de variável ainda não
observado localmente.

## 6. Alterações aplicadas

Foi adicionado, imediatamente antes da chamada HTTP, o evento:

```text
estrutura_envio_template_meta
```

Ele registra somente:

- nome técnico e idioma do template;
- origem e status oficial;
- tipos, formato e contagens dos componentes oficiais;
- tipos e quantidades de parâmetros do payload;
- posições esperadas, configuradas e resolvidas do BODY.

Também foi adicionada uma invariância pré-Meta: para variáveis posicionais
suportadas, as quantidades esperada, configurada, resolvida e enviada devem ser
iguais. Qualquer divergência é bloqueada localmente com
`CONFIGURACAO_ENVIO_INCOMPLETA`; nenhum parâmetro vazio ou artificial é criado.

## 7. Estrutura final do payload

O log do teste registrou:

```json
{
  "componentesPayload": [
    { "tipo": "header", "quantidadeParametros": 1 },
    { "tipo": "body", "quantidadeParametros": 1 },
    { "tipo": "button", "quantidadeParametros": 1 }
  ],
  "body": {
    "variaveisEsperadas": [1],
    "variaveisConfiguradas": [1],
    "variaveisResolvidas": [1]
  }
}
```

O teste confirmou que o evento não contém telefone, nome do contato, valor da
variável, URL, Media ID, token ou cabeçalho Authorization.

## 8. Confirmação no caminho real de retry

```text
Retry HTTP Meta BODY: 12 verificações aprovadas;
esperado/configurado/resolvido/enviado = 1/1/1/1.
```

Um segundo cenário removeu o dado usado por `{{1}}`. A API respondeu 409,
persistiu `CONFIGURACAO_ENVIO_INCOMPLETA` e não chamou o fetch fake.

## 9. Testes

```text
npm run testar:fluxo-campanhas-meta
13 grupos aprovados.

npm run testar:regressao-body-meta
13 verificações aprovadas; 1/1, 2/2 e 0/0.

npm run testar:requisitos-templates
22 verificações aprovadas.

npm run testar:templates-meta
38 verificações aprovadas.

npm run testar:meta
16 verificações aprovadas.
```

Também passaram as verificações de sintaxe dos arquivos JavaScript alterados.
O PostgreSQL temporário foi removido pelo orquestrador.

## 10. Build

```text
npm run build
72 módulos transformados; build aprovado.
```

## 11. Integridade do diff e conclusão

```text
git diff --check
Aprovado.
```

Nenhuma migration, imagem, botão, SAIR, template oficial, sincronização,
campanha, capacidade, lote, opt-out, webhook, concorrência ou idempotência foi
alterada.

Nenhuma chamada real foi feita à Meta.

### Leitura objetiva do próximo teste controlado

- se o evento não aparecer, a versão publicada não contém esta instrumentação
  ou a requisição não atingiu a instância esperada;
- se o evento mostrar BODY esperado `0`, os componentes persistidos em produção
  diferem do cenário posicional testado;
- se mostrar esperado/configurado/resolvido/enviado `1/1/1/1` e a Meta ainda
  informar `0/1`, será necessário confrontar o formato oficial completo do
  template, sem valores pessoais, antes de alterar o payload.

**O RETRY LOCAL ESTÁ VALIDADO EM 1/1/1/1; A CAUSA ESPECÍFICA DE PRODUÇÃO NÃO FOI
INVENTADA E SERÁ IDENTIFICÁVEL PELO NOVO LOG ESTRUTURAL.**
