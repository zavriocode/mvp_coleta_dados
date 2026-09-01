# Relatório — Ajustes finais de produção e modelos

**Projeto:** ACORDA RJ
**Data:** 1º de setembro de 2026
**Validação funcional:** PostgreSQL local e temporário isolado, Meta fake
**Produção:** somente evidências de leitura da auditoria anterior; nenhuma escrita
**Meta real, deploy, commit e push:** não realizados

## 1. Conta test1

A permanência da conta `test1`, com perfil administrador e ativa, foi validada
expressamente pelo cliente. A conta não foi excluída, desativada ou modificada e
continua sendo considerada um administrador autorizado do sistema.

## 2. Exclusão manual de modelos

O administrador passou a receber a ação **Excluir rascunho** somente quando o
backend confirma que o modelo é um rascunho interno, ainda não submetido à Meta,
sem campanha, comunicação ou histórico operacional associado.

A ação exige a confirmação:

```text
Tem certeza que deseja excluir este modelo?
Essa ação não poderá ser desfeita.
```

A exclusão é lógica e individual. O modelo deixa a listagem operacional, fica
indisponível para edição e submissão, mas seu registro e histórico permanecem no
banco para auditoria. A operação registra data, administrador responsável e o
evento `exclusao_logica`. Não existe limpeza automática.

A rota é exclusiva de administrador e recalcula a elegibilidade dentro de uma
transação, com lock, imediatamente antes da alteração. Portanto, ocultar ou
forjar o botão no navegador não contorna a proteção do backend.

## 3. Modelos elegíveis e protegidos

Podem ser excluídos somente modelos que atendam simultaneamente a todos estes
critérios:

- origem interna;
- estado de rascunho;
- ainda sem identificador de template da Meta;
- sem vínculo com campanha;
- sem comunicação registrada;
- sem histórico de submissão, sincronização, webhook ou configuração de envio.

Ficam protegidos:

- qualquer template com status oficial `APPROVED`;
- qualquer modelo oficial ou já submetido à Meta;
- modelos vinculados a campanhas;
- modelos com comunicação ou histórico operacional associado;
- configurações e históricos de modelos.

Quando a exclusão é bloqueada, a API devolve conflito com a mensagem:

```text
Este modelo não pode ser excluído porque está aprovado pela Meta ou possui histórico associado.
```

Os modelos vistos na auditoria de produção não foram alterados. Os rascunhos
`Saudação` e `teste2` são apenas candidatos visuais; a ação só será exibida após
a publicação se a verificação atual de vínculos confirmar que continuam
elegíveis. Os dois modelos `APPROVED` permanecem absolutamente protegidos.

## 4. Migration 020

Foi criada a migration incremental:

```text
020_excluir_modelos_sem_apagar_historico.sql
```

Ela adiciona `excluido_em` e `excluido_por_usuario_id`, preserva a referência ao
administrador e inclui a ação de auditoria `exclusao_logica`. Nenhum modelo ou
histórico existente é apagado pela migration.

A migration 020 foi aplicada pelo migrador normal somente no PostgreSQL local e
também validada em PostgreSQL temporário isolado. Não foi aplicada em produção.

## 5. Backup e recuperação

A evidência disponível identifica PostgreSQL 18 hospedado na DigitalOcean e
anexado à App Platform. O snapshot de leitura da auditoria mostrou zero backups
concluídos ou falhos no histórico interno `backups_banco`; portanto, nenhum
backup gerado pelo painel do ACORDA RJ foi comprovado em produção.

O material disponível não permite distinguir com segurança se o componente
anexado é uma **Managed Database** ou uma **Dev Database**. Essa confirmação
continua pendente no painel da DigitalOcean, sem qualquer alteração feita nesta
tarefa:

- se for Managed Database, a DigitalOcean documenta backup automático diário,
  retenção de sete dias e restauração para um novo cluster;
- se for Dev Database da App Platform, a DigitalOcean informa que não existe
  backup integrado e recomenda Managed Database para produção.

Referências oficiais vigentes:

- https://docs.digitalocean.com/products/databases/postgresql/how-to/restore-from-backups/
- https://docs.digitalocean.com/support/how-do-i-back-up-my-dev-database-on-app-platform/

Nenhuma restauração ou configuração de backup foi executada. O mecanismo local
de backup e restauração do sistema já havia sido validado em banco temporário,
mas isso não substitui a confirmação do backup gerenciado de produção.

## 6. Tabelas legadas

As cinco tabelas extras identificadas no banco publicado são:

- `campanha_contatos`;
- `envios_campanha`;
- `eventos_manychat`;
- `respostas_campanha`;
- `sincronizacoes_manychat`.

A busca no código atual não encontrou leitura ou escrita nessas tabelas. Elas
não fazem parte das 31 tabelas do schema vigente. A recomendação futura é
inventariar conteúdo e dependências diretamente em produção, gerar backup e só
então planejar uma migration específica de remoção. Nenhum `DROP` ou alteração
de schema legado foi executado agora.

## 7. Arquivos alterados

### Backend e banco

- `backend/database/migrations/020_excluir_modelos_sem_apagar_historico.sql`;
- `backend/database/criar_banco.sql`;
- `backend/src/modules/campanhas/campanhaModel.js`;
- `backend/src/modules/campanhas/campanhaService.js`;
- `backend/src/modules/campanhas/campanhaController.js`;
- `backend/src/modules/campanhas/campanhaRoutes.js`;
- `backend/scripts/testarExclusaoModelos.js`;
- `backend/scripts/testarFluxoCampanhasMetaIsolado.js`;
- `backend/scripts/testarSchemaVazio.js`;
- `backend/scripts/testarEstruturaBanco.js`;
- `backend/package.json`;
- `backend/README.md`.

### Frontend

- `frontend/src/pages/CampanhasAdministrativas.jsx`;
- `frontend/src/services/campanhaService.js`;
- `frontend/scripts/testarPreviaModeloMensagem.js`.

### Relatório

- `RELATORIO_AJUSTES_FINAIS_PRODUCAO_MODELOS_2026-09-01.md`.

## 8. Testes executados

```text
Schema vazio PostgreSQL temporário
31 tabelas, 166 bairros e 20 migrations validadas.

Fluxo campanhas → Meta fake
16 grupos aprovados; nenhuma chamada real.

Exclusão manual protegida de modelos
18 verificações aprovadas:
- administrador exclui rascunho elegível;
- operador recebe 403;
- APPROVED recebe 409 e permanece;
- modelo vinculado recebe 409 e campanha permanece;
- modelo com histórico recebe 409 e histórico permanece;
- exclusão lógica preserva registro, autoria e auditoria;
- repetição recebe 404;
- listagem remove somente o rascunho excluído.

Regressões do fluxo isolado
- templates oficiais da Meta: 42 verificações;
- requisitos de templates: 26 verificações;
- parâmetros nomeados: 21 verificações;
- templates externos: 22 verificações;
- integração Meta fake: 16 verificações;
- webhook: 16 verificações;
- cenário final de campanha: 22 verificações;
- envio simplificado: 2.421 verificações.

Estrutura do PostgreSQL local
25 verificações aprovadas após aplicação normal da migration 020.

Frontend
63 verificações de interface aprovadas.

Build frontend
72 módulos transformados; aprovado.

node --check
Arquivos backend alterados aprovados.
```

Nenhum modelo, usuário ou histórico foi limpo automaticamente. Nenhuma chamada
real à Meta, envio de mensagem, deploy, commit ou push foi realizado.
