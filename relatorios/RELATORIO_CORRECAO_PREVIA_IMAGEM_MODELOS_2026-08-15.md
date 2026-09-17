# Relatório — Correção da imagem na prévia dos modelos

**Projeto:** ACORDA RJ  
**Data:** 15 de agosto de 2026  
**Validação:** frontend compilado em Edge real, com a CSP de publicação  
**Produção, backend e Meta:** não acessados  
**Deploy, commit e push:** não realizados

## 1. Causa raiz

O estado React e a condição do cabeçalho já utilizavam corretamente o valor
interno `imagem`. A falha principal estava na política de segurança do frontend:

```text
img-src 'self' data:
```

Ela bloqueava as duas fontes usadas pela prévia:

- `blob:` criado por `URL.createObjectURL(File)` para arquivo do dispositivo;
- `https:` para imagem pública informada por URL.

A CSP passou a permitir explicitamente imagens de `'self'`, `data:`, `blob:` e
`https:`. Nenhuma permissão de script, conexão com a Meta ou execução remota foi
ampliada.

## 2. Por que os testes anteriores passaram

O teste anterior não renderizava o React em um navegador. Ele verificava por
expressões regulares se o arquivo-fonte continha `URL.createObjectURL`,
`URL.revokeObjectURL` e os textos da prévia. Assim, confirmava a presença do
código, mas não que o navegador aceitava o `src` sob a CSP efetiva.

O teste agora valida também a resolução dos estados da imagem e há um teste
separado que abre o build em Edge real com a mesma CSP configurada para a
publicação.

## 3. Correção aplicada

- alinhada a CSP às fontes realmente usadas pela prévia;
- centralizada a resolução da imagem em estados explícitos: vazia, carregar,
  inválida, configurada e sem cabeçalho;
- aceita URL somente com protocolo HTTPS;
- preservado o aviso amigável para URL inacessível;
- Media ID existente não é tratado como URL nem inventa endereço: a interface
  mostra **Imagem configurada para envio**;
- a URL local fica associada ao `File` que a originou, impedindo imagem antiga
  durante trocas;
- cada URL `blob:` é revogada quando o arquivo, modo ou componente muda.

## 4. Fluxos conferidos

### Arquivo do dispositivo

```text
input file → evento change → File no estado React
→ URL.createObjectURL(File) → src blob: da imagem → renderização
```

Trocar ou remover o arquivo elimina a referência anterior e revoga sua URL.

### Imagem da internet

```text
input URL → evento change → URL no estado React
→ validação HTTPS → src https: da imagem → renderização
```

URL vazia exibe o placeholder. URL inválida ou inacessível exibe **Não foi
possível carregar esta imagem**, sem quebrar o formulário.

### Troca entre origens

- dispositivo → internet: o `blob:` deixa de controlar a prévia e a URL HTTPS
  passa a ser a fonte;
- internet → dispositivo: a URL é descartada e a prévia aguarda um novo arquivo;
- nenhum estado antigo reaparece depois da remoção.

## 5. Validação visual real

O build foi servido localmente com a CSP de `vercel.json` e aberto no Microsoft
Edge em modo headless. O teste interagiu com os controles reais da tela e
conferiu o elemento `<img>`, seu `src`, carregamento e dimensões naturais.

Foram aprovados:

1. HEADER IMAGE com arquivo PNG do dispositivo;
2. HEADER IMAGE com URL HTTPS;
3. troca dispositivo → URL;
4. troca URL → dispositivo;
5. remoção do arquivo;
6. URL inacessível e aviso amigável;
7. desktop em 1440 × 1000;
8. celular em 390 × 844, sem ultrapassar a largura da tela.

A API foi isolada apenas para montar a tela administrativa; não houve login
real, banco, backend, upload, envio ou chamada à Meta.

## 6. Arquivos alterados nesta correção

- `frontend/vercel.json`;
- `frontend/src/pages/CampanhasAdministrativas.jsx`;
- `frontend/src/utils/previaModeloMensagem.js`;
- `frontend/scripts/testarPreviaModeloMensagem.js`;
- `frontend/scripts/testarPreviaImagemRenderizada.js`;
- `frontend/package.json`;
- `RELATORIO_CORRECAO_PREVIA_IMAGEM_MODELOS_2026-08-15.md`.

Nenhuma migration, tabela, regra de campanha, capacidade, lote, opt-out,
webhook, status oficial, reprocessamento ou integração Meta foi alterada.

## 7. Testes e resultados

```text
npm run testar:previa-imagem-renderizada
Prévia renderizada: arquivo, URL, trocas, remoção, falha, desktop e celular aprovados.

npm run testar:previa-modelo
Prévia visual de modelos: 33 verificações aprovadas.

npm run build
72 módulos transformados; build aprovado.

git diff --check
Aprovado.
```

## 8. Segurança e conclusão

- nenhuma chamada real à Meta;
- nenhum upload real;
- nenhuma mensagem enviada;
- nenhum acesso ao banco ou backend;
- nenhum deploy, commit ou push;
- custo real zero.

**CORREÇÃO DA PRÉVIA APROVADA EM NAVEGADOR REAL PARA DESKTOP E CELULAR.**
