# Relatório — Persistência da imagem de envio dos modelos

**Projeto:** ACORDA RJ  
**Data:** 15 de agosto de 2026  
**Validação:** PostgreSQL temporário isolado, API real local, frontend compilado e Meta fake  
**Produção, deploy, commit e push:** não realizados

## 1. Causa raiz

O frontend montava corretamente `image.link` ou `image.id` e chamava a rota
correta. A configuração era perdida antes do `UPDATE`: ao validar um template
externo com botão oficial `QUICK_REPLY`, o backend exigia que todo botão desse
tipo tivesse configuração local de opt-out.

Um botão de resposta rápida sincronizado diretamente da Meta pode existir sem
ser o botão de descadastro do ACORDA RJ. Nesse cenário, o backend respondia:

```text
Configure todos os botoes parametrizados antes de continuar.
```

O `PUT` era rejeitado e `meta_configuracao_envio` nunca chegava ao model nem ao
banco. A prévia continuava mostrando o arquivo ou URL mantido apenas no estado
React, dando a impressão de que o salvamento havia ocorrido.

## 2. Correção aplicada

- a edição de configuração de um template externo não exige configuração local
  para um `QUICK_REPLY` oficial comum;
- modelos criados no ACORDA RJ continuam exigindo a configuração do botão de
  opt-out, preservando a barreira anterior;
- URL continua obrigada a usar HTTPS;
- arquivo do dispositivo continua sendo enviado ao endpoint de mídia fake no
  teste e somente o Media ID retornado é persistido;
- `blob:` permanece exclusivo da prévia e nunca é aceito como configuração;
- o `UPDATE` do JSONB e o registro de histórico passaram a ocorrer na mesma
  transação, sob advisory lock do modelo;
- erros de salvamento agora aparecem com a mensagem operacional **Não foi
  possível salvar a configuração da imagem**;
- foi adicionada remoção intencional, com confirmação e aviso de que novos
  envios ficarão bloqueados até outra imagem ser configurada.

Nenhuma migration foi necessária.

## 3. Payload HTTP

### Salvamento por URL

```json
{
  "configuracaoEnvio": {
    "cabecalho": {
      "tipo": "imagem",
      "origem": "link",
      "valor": "https://example.com/imagem-salva.jpg"
    },
    "corpo": [],
    "botoes": []
  },
  "removerImagem": false
}
```

### Salvamento do dispositivo

O arquivo é enviado primeiro ao fluxo de mídia. A URL temporária `blob:` não
participa do payload persistente. Depois do retorno fake da Meta:

```json
{
  "configuracaoEnvio": {
    "cabecalho": {
      "tipo": "imagem",
      "origem": "id",
      "valor": "media-id-browser-qa"
    },
    "corpo": [],
    "botoes": []
  },
  "removerImagem": false
}
```

Antes da correção, o conteúdo da imagem já era montado, mas a validação global
dos botões retornava HTTP 400 antes da persistência. Depois da correção, o mesmo
conteúdo válido alcança o model e é gravado em `meta_configuracao_envio`.

## 4. Persistência e reabertura

- `image.link` permanece como `cabecalho.origem = link` e a URL reaparece ao
  reabrir a edição;
- `image.id` permanece como `cabecalho.origem = id`; o Media ID não é exposto
  como URL e a prévia informa **Imagem configurada para envio**;
- trocar URL → dispositivo e dispositivo → URL substitui corretamente somente
  a configuração operacional;
- editar nome/outro campo de um rascunho preserva sua imagem configurada;
- o template externo permanece com `meta_origem = meta`,
  `meta_status_oficial = APPROVED` e sem nova submissão.

## 5. Sincronização Meta

O sincronizador continua atualizando somente os dados oficiais pertinentes,
como status e componentes. O teste executou:

```text
configurar image.link → salvar → sincronizar Meta fake → reler
```

O `meta_configuracao_envio` local permaneceu intacto. A sincronização não mudou
a origem, não removeu a aprovação e não criou nova submissão.

## 6. Remoção intencional

A imagem só é apagada quando o administrador usa **Remover imagem configurada**,
confirma a ação e salva. O payload envia `removerImagem: true`; o backend valida
que o template possui `HEADER IMAGE`, grava `cabecalho: null` e preserva corpo,
botões, status oficial e origem.

Sem mídia, a barreira já existente `MIDIA_TEMPLATE_NAO_CONFIGURADA` volta a
bloquear o envio até uma nova imagem ser configurada.

## 7. Reprocessamento e provider fake

O teste de templates externos preservou a tentativa antiga e confirmou que uma
nova tentativa utiliza a configuração salva. Foram validados separadamente:

- `image.link` no payload do provider fake;
- `image.id` no payload do provider fake;
- uma participação e um lote, sem duplicação.

Nenhuma regra de campanha, capacidade, lote, opt-out, webhook, concorrência ou
idempotência foi alterada.

## 8. Arquivos alterados

### Backend

- `backend/src/modules/campanhas/templateMetaService.js`;
- `backend/src/modules/campanhas/campanhaModel.js`;
- `backend/scripts/testarPersistenciaImagemTemplate.js`;
- `backend/scripts/testarTemplatesExternosMeta.js`;
- `backend/scripts/testarFluxoCampanhasMetaIsolado.js`;
- `backend/package.json`.

### Frontend

- `frontend/src/pages/CampanhasAdministrativas.jsx`;
- `frontend/src/services/campanhaService.js`;
- `frontend/src/styles/administrativo.css`;
- `frontend/scripts/testarPreviaModeloMensagem.js`;
- `frontend/scripts/testarPreviaImagemRenderizada.js`.

### Relatório

- `RELATORIO_CORRECAO_PERSISTENCIA_IMAGEM_MODELOS_2026-08-15.md`.

## 9. Testes e resultados

```text
npm run testar:fluxo-campanhas-meta
9 grupos aprovados.

Persistência da imagem do template: 15 verificações aprovadas.
Templates externos da Meta: 21 verificações aprovadas.
Templates oficiais da Meta: 38 verificações aprovadas.
Campanhas, lotes e mensageria: 27 verificações aprovadas.
Integração Meta com mocks: 16 verificações aprovadas.
Envio simplificado: 2.421 verificações aprovadas.

npm run testar:previa-modelo
36 verificações aprovadas.

npm run build
72 módulos transformados; build aprovado.

npm run testar:previa-imagem-renderizada
URL, Media ID, reabertura, remoção, desktop e celular aprovados.

git diff --check
Aprovado.
```

O teste novo atravessou frontend renderizado, payload HTTP, rota, controller,
service, model, transação, PostgreSQL, nova listagem, upload fake e sincronização
fake. O banco temporário foi removido ao final.

## 10. Segurança e conclusão

- nenhuma chamada real à Meta;
- nenhum upload real;
- nenhuma mensagem real;
- nenhum banco de produção acessado;
- nenhuma migration criada ou modificada;
- nenhum deploy, commit ou push;
- custo real zero.

**PRONTO PARA REPETIR O TESTE REAL CONTROLADO APÓS PUBLICAR A CORREÇÃO.**
