# Relatório — Ajustes finais de produto e UX

**Projeto:** ACORDA RJ  
**Data:** 15 de agosto de 2026  
**Validação:** PostgreSQL local e temporário isolado, provider Meta fake e Microsoft Edge local  
**Produção, Meta real, deploy, commit e push:** não acessados ou realizados

## 1. Construtor de modelos

O administrador agora monta o modelo em uma sequência operacional: identificação,
conteúdo, cabeçalho e imagem, personalizações, rodapé, botões e prévia. É possível
salvar o rascunho, reabri-lo sem perder a ordem dos componentes e enviá-lo pelo
fluxo existente para análise oficial.

A interface distingue os três momentos:

- rascunho: criação e edição do conteúdo;
- em análise: acompanhamento, sem apresentar configuração de envio prematura;
- aprovado: configuração operacional de imagem, personalizações e botão SAIR,
  sem alterar o conteúdo aprovado pela Meta.

A Meta permanece como fonte de verdade. Nenhuma aprovação local foi criada.

## 2. Botões implementados

A interface oferece somente o subconjunto usado e suportado pelo ACORDA RJ:

- **Abrir link**, persistido como `URL`;
- **Ligar**, persistido como `PHONE_NUMBER`;
- **Não receber mais contatos**, persistido como `QUICK_REPLY` e associado
  explicitamente ao fluxo SAIR.

O administrador pode adicionar, remover e ordenar os botões. A ordem visual é a
mesma ordem preservada no componente oficial e usada posteriormente no índice do
envio. Um `QUICK_REPLY` comum não é transformado silenciosamente em opt-out.

## 3. Regras e limites

O backend valida antes da submissão:

- de um a três botões na área de botões;
- somente os três tipos expostos pelo sistema;
- no máximo dois botões de link ou ligação;
- no máximo um botão de ligação;
- no máximo um botão de opt-out;
- texto obrigatório;
- URL pública HTTPS;
- telefone obrigatório;
- exemplo e configuração quando a URL possui variável.

Esses limites formam o subconjunto conservador deliberadamente suportado pelo
ACORDA RJ; não são apresentados como uma enumeração universal de tudo que a Meta
possa oferecer. Não foram expostos Flow, catálogo, OTP ou outros componentes sem
uso validado no produto.

Os contratos foram confrontados com a coleção oficial da WhatsApp Business
Platform, inclusive os exemplos de dois botões de ação, dois botões de resposta
e envio de modelo interativo:

- https://www.postman.com/meta/whatsapp-business-platform/folder/lczy75a/templates
- https://www.postman.com/meta/whatsapp-business-platform/request/n3jhmr4/create-template-w-image-header-text-body-text-footer-and-2-call-to-action-buttons
- https://www.postman.com/meta/whatsapp-business-platform/request/uvx80vi/create-template-w-text-header-text-body-text-footer-and-2-quick-reply-buttons
- https://www.postman.com/meta/whatsapp-business-platform/request/lwtlz1k/send-message-template-interactive

## 4. Persistência e SAIR

Os vários botões continuam armazenados em `meta_componentes` e suas associações
operacionais em `meta_configuracao_envio`, ambos já existentes. Nenhuma migration
foi necessária para modelos.

O botão **Não receber mais contatos** usa a posição real escolhida pelo
administrador. A configuração conserva `origem: opt_out`; o envio e o webhook
continuam usando `WHATSAPP_OPTOUT_BUTTON_ID`. O fluxo já validado de revogação
global, bloqueio de mensagens e ligações, histórico, inelegibilidade e
idempotência não foi modificado.

## 5. Prévia e UX

A prévia acompanha cabeçalho, imagem, BODY, valores de exemplo, rodapé e todos os
botões na ordem atual. Ela continua estritamente visual.

Na criação do BODY, o administrador pode posicionar o cursor e escolher **Nome
da pessoa**, **Bairro**, **Principal necessidade** ou **Outro texto**. A interface
insere automaticamente o próximo marcador posicional oficial (`{{1}}`, `{{2}}`
e seguintes), já associa seu significado e preenche um exemplo inicial. O
payload continua usando o contrato oficial da Meta; a descrição amigável existe
somente na interface.

A explicação de variáveis deixou de ficar escondida em um tópico expansível. Ela
agora permanece visível e informa diretamente:

- `{{1}}` é a primeira informação personalizada;
- `{{2}}` é a segunda informação personalizada;
- os próximos números seguem a mesma ordem;
- `{{1}} = Nome da pessoa` e `{{2}} = Bairro` resultam, por exemplo, em
  **“Olá, João! Seu bairro é Copacabana”**.

O campo **Texto principal** também não exige que o operador memorize ou digite
manualmente a sintaxe. A seção **Adicionar ao texto** insere o marcador na
posição atual do cursor. O formato `{{n}}` permanece visível para manter a
mensagem fiel ao modelo que será analisado, mas seu significado fica identificado
logo abaixo por linguagem operacional.

Termos como `QUICK_REPLY`, índice, payload, Media ID, `parameter_name`, Graph API
e `header_handle` não aparecem para o operador. Modelos aprovados com mídia por
ID mostram **Imagem da mensagem — Configurada**, com ações claras para trocar ou
remover; nenhuma URL temporária ou `blob:` é persistida.

A organização visual final mantém formulário e prévia como uma composição única
no desktop, aproximadamente em 64%/36%. O formulário passou a apresentar as
seções Identificação, Conteúdo, Personalização, Rodapé, Botões, Disponibilidade e
Ações finais. Campos usam larguras e espaçamentos consistentes; rodapé e botões
ocupam linhas próprias; disponibilidade fica próxima das ações; e a prévia não
mantém altura vazia desnecessária. Em tablet e celular, o formulário aparece
primeiro e a prévia abaixo, em uma coluna e sem rolagem horizontal.

## 6. Exclusão permanente de campanhas

Somente administrador recebe e pode executar **Excluir campanha**. A rota também
é protegida no backend. Por decisão final de produto, a exclusão agora é sempre
permanente, inclusive quando a campanha já possui envios.

A operação usa transação e trava por campanha, remove histórico de status,
tentativas, participações, lotes e comunicações vinculadas e, por último, remove
a campanha. A confirmação informa claramente que o histórico operacional será
apagado. Campanhas arquivadas anteriormente também podem ser excluídas.

Locks, constraints e a barreira de criação de envio foram preservados.

## 7. Migration 017 e banco local

A migration incremental criada no ajuste anterior permanece no histórico:

```text
017_arquivar_campanhas_com_historico.sql
```

Ela adiciona somente `arquivada_em`, `arquivada_por_usuario_id`, chave estrangeira
para o administrador responsável e índice de listagem. Esses campos são mantidos
para compatibilidade com campanhas que já tenham sido arquivadas, mas a operação
final **Excluir campanha** não cria novos arquivamentos: ela apaga permanentemente.

Após autorização explícita, a migration 017 foi aplicada pelo migrador normal
somente no PostgreSQL local. A estrutura local foi revalidada e os dados
artificiais do teste foram removidos. O banco publicado não foi acessado.

## 8. Como usar

A central foi atualizada depois da interface e agora descreve criação do modelo,
conteúdo, imagem, personalizações, vários botões, link, SAIR, prévia, análise,
aprovação, configuração do modelo aprovado, campanhas, aptos e não aptos, envio,
continuação, revogação global e exclusão permanente de campanhas.

O tópico **Modelos de mensagem** foi novamente alinhado após a personalização
assistida. Ele explica **Adicionar ao texto**, `{{1}}`/`{{2}}`, link, ligação,
SAIR, rascunho, análise e configuração depois da aprovação. A imagem
`frontend/public/guia/modelos.png` foi regenerada em Edge com dados artificiais
para representar a interface final, incluindo prévia e múltiplos botões.

## 9. Arquivos alterados

### Backend e banco

- `backend/database/migrations/017_arquivar_campanhas_com_historico.sql`;
- `backend/database/criar_banco.sql`;
- `backend/src/modules/campanhas/campanhaController.js`;
- `backend/src/modules/campanhas/campanhaModel.js`;
- `backend/src/modules/campanhas/campanhaRoutes.js`;
- `backend/src/modules/campanhas/campanhaService.js`;
- `backend/src/modules/campanhas/templateMetaService.js`;
- `backend/scripts/testarConstrutorBotoesModelos.js`;
- `backend/scripts/testarExclusaoArquivamentoCampanhas.js`;
- `backend/scripts/testarTemplatesMeta.js`;
- `backend/scripts/testarFluxoCampanhasMetaIsolado.js`;
- `backend/scripts/testarSchemaVazio.js`;
- `backend/scripts/testarEstruturaBanco.js`;
- `backend/scripts/testarJornadasE2E.js`;
- `backend/package.json`;
- `backend/README.md`.

### Frontend

- `frontend/src/pages/CampanhasAdministrativas.jsx`;
- `frontend/src/pages/AjudaAdministrativa.jsx`;
- `frontend/src/services/campanhaService.js`;
- `frontend/src/styles/administrativo.css`;
- `frontend/public/guia/modelos.png`;
- `frontend/scripts/testarPreviaModeloMensagem.js`;
- `frontend/scripts/testarPreviaImagemRenderizada.js`.

## 10. Testes executados

```text
npm run testar:construtor-botoes
Construtor de botoes: 10 verificacoes aprovadas.

npm run testar:exclusao-campanhas
Exclusão permanente de campanhas: 7 verificações aprovadas.

npm run testar:templates-meta
Templates oficiais da Meta: 42 verificações aprovadas.

npm run testar:fluxo-campanhas-meta
15 grupos aprovados; envio simplificado: 2.421 verificações aprovadas.

npm run testar:schema-vazio
31 tabelas, 166 bairros e 17 migrations validadas.

npm run testar:banco
Estrutura, catálogo e integridade: 25 verificações aprovadas.

npm run testar:previa-modelo
Prévia visual de modelos e guia: 57 verificações aprovadas, incluindo organização das seções, proporção desktop, responsividade e correspondência da aba Como usar.

npm run testar:previa-imagem-renderizada
Composição desktop/mobile, salvamento de rascunho, personalização, imagem, múltiplos botões, ordenação e prévia aprovados em Edge real.
```

Os testes de regressão incluíram modelo sem botão, URL, URL + SAIR, ordem real,
combinações rejeitadas antes do provider, rascunho reaberto, submissão fake,
modelo externo `APPROVED`, SAIR, status de webhook, campanha limpa, campanha com
histórico, permissão administrativa, exclusão permanente com envios, desktop e celular.

## 11. Validação manual pelo usuário

Com backend, frontend e PostgreSQL locais, o usuário confirmou manualmente:

```text
escrever “Olá, ”
→ clicar em Nome da pessoa
→ sistema inserir {{1}} e associar Nome da pessoa
→ clicar em Bairro
→ sistema inserir {{2}} e associar Bairro
→ prévia resolver os exemplos corretamente
```

O teste manual foi concluído com sucesso. Essa evolução alterou somente a
experiência de criação, a prévia, a ajuda e os testes frontend. Não foram
alterados `metaCloudApiProvider.js`, `mensageriaService.js`, webhook, montagem do
payload de envio, BODY NAMED, HEADER IMAGE ou processamento do botão SAIR.

## 12. Build e integridade

```text
npm run build
72 módulos transformados; build aprovado.

node --check
Oito arquivos backend relevantes aprovados.

git diff --check
Aprovado.
```

## 13. Segurança e conclusão

- nenhuma chamada real à Meta;
- nenhum template real criado ou submetido;
- nenhuma mensagem real enviada;
- nenhum acesso ao banco de produção;
- nenhum secret ou variável de ambiente alterado;
- nenhum deploy, commit ou push;
- custo real zero.

**PRONTO PARA VALIDAÇÃO MANUAL LOCAL E, APÓS PUBLICAÇÃO CONTROLADA DA MIGRATION
017 E DO CÓDIGO, PARA O PRÓXIMO TESTE REAL AUTORIZADO.**
