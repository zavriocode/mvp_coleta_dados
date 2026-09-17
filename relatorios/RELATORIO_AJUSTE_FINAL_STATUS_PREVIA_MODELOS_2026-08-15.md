# Relatório — Status de campanhas e prévia dos modelos

**Projeto:** ACORDA RJ  
**Data:** 15 de agosto de 2026  
**Ambiente:** PostgreSQL temporário, frontend local e Meta fake  
**Produção, deploy, commit e push:** não realizados

## 1. Erro real da DigitalOcean

**Status anterior:** `rascunho`  
**Status que o backend tentou gravar:** `pronta`

A constraint histórica `campanhas_status_valido` aceitava:

```text
rascunho, agendada, ativa, pausada, concluida, cancelada
```

A máquina de estados atual e legítima do backend utiliza:

```text
rascunho, pronta, ativa, pausada, concluida, cancelada
```

O fluxo foi:

```text
campanhaService.alterarStatus
→ campanhaModel.alterarStatus
→ UPDATE campanhas SET status = 'pronta'
→ PostgreSQL 23514 em campanhas_status_valido
```

Arquivos e funções responsáveis:

- `backend/src/modules/campanhas/campanhaService.js`, função `alterarStatus`: valida a transição oficial `rascunho → pronta`;
- `backend/src/modules/campanhas/campanhaModel.js`, função `alterarStatus`: executa o `UPDATE` parametrizado.

A causa era a coexistência do contrato histórico com `agendada` e da constraint
adicionada posteriormente com `pronta`. O código estava correto; a constraint
histórica publicada estava desatualizada.

## 2. Correção estrutural

Foi criada a migration incremental:

```text
016_alinhar_status_campanhas.sql
```

Ela:

- trava somente a tabela `campanhas` durante a alteração;
- remove as duas constraints de status conhecidas;
- converte com segurança eventual estado legado `agendada` para `pronta`;
- interrompe a migration se encontrar estado desconhecido;
- recria uma única `campanhas_status_valido` com os seis estados oficiais.

A constraint permanece obrigatória e continua rejeitando qualquer string fora
da máquina de estados. O schema de banco vazio e o ledger também foram alinhados
à migration `016`.

O teste de regressão reproduziu primeiro o `23514` real em `rascunho → pronta`,
aplicou a migration em banco existente temporário e repetiu a mesma função do
sistema com sucesso. Também confirmou a conversão de `agendada`, a permanência
de uma única constraint e a rejeição de estado desconhecido.

## 3. Prévia visual dos modelos

A seção **Prévia da mensagem** foi adicionada ao lado do formulário de criação e
edição em `CampanhasAdministrativas.jsx`.

Ela representa em tempo real somente os componentes já suportados:

- cabeçalho de texto ou imagem;
- texto principal;
- rodapé;
- botão de URL, telefone, resposta rápida ou SAIR;
- valores personalizados.

Na prévia, `{{1}}`, `{{2}}` e seguintes usam exemplos fictícios conforme a
configuração: João, Copacabana, Saneamento básico ou o texto fixo informado.
Variável ainda sem configuração permanece visível como `{{n}}`.

Imagem escolhida no dispositivo usa apenas `URL.createObjectURL` no navegador e
é liberada com `URL.revokeObjectURL`. Imagem por URL é exibida quando possível;
falha de carregamento mostra um placeholder amigável. Nenhuma das opções faz
upload durante a prévia.

Os botões são elementos visuais sem ação. A prévia não abre URL, não executa
SAIR, não altera consentimento e não chama backend. Modelos existentes carregam
seus componentes pelo mesmo mapeamento já usado na edição. Formulários
incompletos exibem textos e imagens de apoio.

No desktop, formulário e prévia ficam lado a lado. Em tablet e celular, a prévia
passa para baixo do formulário e ocupa a largura disponível.

## 4. Arquivos relevantes alterados

### Status e schema

- `backend/database/migrations/016_alinhar_status_campanhas.sql`;
- `backend/database/criar_banco.sql`;
- `backend/scripts/testarStatusCampanhaMigration.js`;
- `backend/scripts/testarSchemaVazio.js`;
- `backend/scripts/testarEstruturaBanco.js`;
- `backend/scripts/testarJornadasE2E.js`;
- `backend/package.json`.

### Prévia

- `frontend/src/pages/CampanhasAdministrativas.jsx`;
- `frontend/src/styles/administrativo.css`;
- `frontend/src/utils/previaModeloMensagem.js`;
- `frontend/scripts/testarPreviaModeloMensagem.js`;
- `frontend/package.json`.

Os demais arquivos modificados no Git pertencem à correção já validada do fluxo
simplificado de envio e foram preservados.

## 5. Testes e resultados

```text
npm run testar:status-campanha
Regressão rascunho → pronta aprovada; 23514 corrigido.

npm run testar:previa-modelo
19 verificações aprovadas.

npm run testar:campanhas
27 verificações aprovadas.

npm run testar:templates-meta
38 verificações aprovadas.

npm run testar:schema-vazio
31 tabelas, 166 bairros e 16 migrations validadas.

npm run testar:fluxo-campanhas-meta
7 grupos aprovados; fluxo simplificado com 2.421 verificações aprovado.

npm run build
72 módulos transformados; build aprovado.
```

Também foram aprovados:

- sintaxe dos sete arquivos backend relevantes;
- busca de marcadores incompletos;
- `git diff --check`.

## 6. Segurança e conclusão

- nenhuma chamada real à Meta;
- nenhum envio real de WhatsApp;
- nenhum acesso ou alteração em produção;
- custo real zero.

**TECNICAMENTE APTO PARA SEGUIR AO TESTE REAL CONTROLADO**, após a migration
`016` ser aplicada pelo processo normal de migrations no ambiente publicado.

