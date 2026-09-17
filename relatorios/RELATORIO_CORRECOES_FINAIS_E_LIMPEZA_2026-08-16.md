# Relatório — Correções finais e situação da limpeza

**Projeto:** ACORDA RJ  
**Data:** 16 de agosto de 2026  
**Validação:** PostgreSQL temporário local, frontend compilado e testes isolados  
**Meta real:** não acessada  
**Limpeza de produção:** não executada

## 1. Erro 500 na exclusão de contato

A aprovação da exclusão apagava diretamente o contato, mas participações de
campanha ainda apontavam para ele por chave estrangeira sem cascata. O
PostgreSQL recusava o `DELETE` e a API devolvia erro 500 genérico.

A exclusão passou a remover, na mesma transação, históricos de status,
tentativas e participações da pessoa antes de apagar o contato. Foram validados
contato com histórico, contato sem histórico, repetição e permissão. Erros
esperados agora retornam respostas controladas.

## 2. Telefones duplicados

Cadastro manual, formulário público e importação já utilizavam
`telefone_normalizado`, mas registros antigos podiam conter o país `55` ou
`0055` e, assim, representar o mesmo telefone com valores diferentes.

Foi criada a migration incremental
`018_garantir_telefone_canonico_unico.sql`. Ela:

- aplica a normalização canônica já usada pelo projeto;
- detecta colisões antes de modificar dados;
- não mescla nem apaga contatos automaticamente;
- mantém índice único sobre `telefone_normalizado`;
- interrompe a execução se duas pessoas passarem a compartilhar o mesmo valor.

Cadastro manual, formulário e concorrência básica foram testados com diferentes
formatações e conservaram somente um contato por telefone canônico.

### Situação do PostgreSQL local existente

A migration 018 foi aprovada em banco temporário e em banco vazio. No banco
local existente, sua aplicação foi interrompida com segurança porque os IDs 6
(`Rayane`, cadastro manual) e 178 (`Eu`, origem `Lista-Rayane`) convergem para o
mesmo telefone canônico. Nenhum dos dois foi apagado ou mesclado. Esse banco
local permanece pendente de decisão manual sobre qual registro é correto.

## 3. Público atual da campanha

Ao reabrir uma campanha, a tela passou a oferecer **Atualizar público**. A ação
reutiliza os filtros salvos e a mesma regra dinâmica de elegibilidade existente.
Ela mostra:

- Encontrados;
- Já receberam;
- Aptos para próximo envio;
- Não aptos.

A consulta considera novos contatos, consentimentos, bloqueios e exclusões no
momento da leitura. Ela não cria lote, participação, tentativa, reserva ou
envio, e não volta a disponibilizar quem já recebeu naquela campanha.

## 4. Exclusão permanente de campanhas

A regra inicialmente implementada arquivava campanhas com histórico. Por
decisão posterior de produto, a ação **Excluir campanha** passou a ser sempre
permanente, inclusive quando já houve mensagens.

Sob transação e trava da campanha, são removidos:

- históricos de status da mensageria;
- tentativas;
- participações;
- lotes;
- comunicações vinculadas;
- a própria campanha.

A interface alerta que a ação e o histórico operacional serão apagados.
Campanhas arquivadas anteriormente também recebem a ação de exclusão permanente.
A migration 017 foi preservada sem alteração para compatibilidade com dados já
arquivados.

## 5. Exclusão de administradores e operadores

Um administrador pode excluir outro administrador ou um operador. Permanecem as
proteções:

- não excluir a própria conta;
- não excluir o último administrador ativo;
- operador não pode excluir usuários;
- acesso da conta removida é invalidado imediatamente;
- repetição retorna usuário inexistente.

### Regra final para registros vinculados

Ao apagar a conta, também são removidos históricos atribuídos a ela, incluindo:

- históricos de eventos, comunicações, modelos, configurações e contatos;
- solicitações e históricos de exclusão;
- importações e respectivas linhas;
- tentativas de login;
- históricos de backup e sincronização de limite.

Eventos, templates, campanhas, lotes, comunicações e números de WhatsApp não são
apagados por causa da conta. Referências obrigatórias desses registros passam
para o administrador que executou a exclusão; referências opcionais ao usuário
removido ficam nulas. Consentimentos e dados dos contatos são preservados.

Essa regra também vale quando o usuário removido é operador.

## 6. Limpeza controlada de produção

Depois dos testes locais, foi tentado somente o inventário `READ ONLY` usando a
conexão autorizada. A conexão terminou por timeout antes de abrir sessão,
compatível com a restrição de fontes confiáveis da DigitalOcean.

Consequentemente:

- nenhuma consulta de inventário chegou ao PostgreSQL publicado;
- nenhum `DELETE`, `UPDATE` ou migration foi executado em produção;
- João Evangelista, Julinha e Gabriel Suliano não foram confirmados nem apagados
  por esta execução;
- campanhas, históricos e templates de teste em produção não foram removidos;
- não foi possível confirmar as contagens finais da importação ou dos contatos
  reais;
- a limpeza manual pela interface permanece pendente após a publicação do código.

## 7. Segurança do `.env.example`

Uma URL real de banco entrou acidentalmente no `.env.example`. O GitHub bloqueou
o push por proteção de segredos. O valor foi removido do arquivo e do commit
enviado; o `.env.example` voltou a ficar igual ao arquivo seguro do remoto. O
arquivo real `backend/.env` permanece ignorado pelo Git.

O commit sanitizado publicado é `644d2d9`. A rotação coordenada da credencial do
banco continua recomendada, pois ela chegou a aparecer em commit bloqueado e em
captura durante o diagnóstico.

## 8. Arquivos principais alterados

### Backend e banco

- `backend/database/migrations/018_garantir_telefone_canonico_unico.sql`;
- `backend/database/criar_banco.sql`;
- `backend/src/modules/exclusoes/solicitacaoExclusaoModel.js`;
- `backend/src/modules/campanhas/campanhaController.js`;
- `backend/src/modules/campanhas/campanhaModel.js`;
- `backend/src/modules/campanhas/campanhaService.js`;
- `backend/src/modules/usuarios/usuarioController.js`;
- `backend/src/modules/usuarios/usuarioModel.js`;
- `backend/src/modules/usuarios/usuarioRoutes.js`;
- `backend/src/modules/usuarios/usuarioService.js`;
- scripts de teste de cadastro, exclusões, campanhas, usuários, telefone e schema;
- `backend/package.json` e `backend/README.md`.

### Frontend

- `frontend/src/pages/CampanhasAdministrativas.jsx`;
- `frontend/src/pages/UsuariosAdministrativos.jsx`;
- `frontend/src/pages/AjudaAdministrativa.jsx`;
- `frontend/src/services/usuarioService.js`;
- `frontend/src/styles/administrativo.css`.

## 9. Testes e resultados

```text
npm run testar:correcoes-finais
7 grupos locais isolados aprovados.

Telefone canônico e colisão sem mesclagem: aprovados.
Cadastro manual, formulário, formatações e concorrência: 30 verificações.
Exclusão de contatos, permissões e repetição: 59 verificações.
Campanhas e público atual: 31 verificações.
Exclusão de administrador e operador: aprovada.
Exclusão permanente de campanha com envio: 7 verificações.
Schema vazio: 31 tabelas, 166 bairros e 18 migrations.

npm run build
72 módulos transformados; build aprovado.

node --check
Arquivos backend alterados aprovados.

git diff --check
Aprovado.
```

Nenhuma chamada real foi feita à Meta e nenhuma mensagem real foi enviada.

## 10. Estado de publicação

O conjunto anterior foi publicado no commit `644d2d9`. A alteração mais recente,
que apaga os históricos/importações ao excluir administrador ou operador, foi
publicada posteriormente no commit `7883522`. No momento deste relatório,
`origin/main` já aponta para `7883522`.

## Conclusão

As quatro correções funcionais e as mudanças posteriores de produto foram
validadas localmente. A exclusão de campanhas agora é permanente e a exclusão de
usuários remove seus históricos/importações sem apagar eventos, templates,
campanhas ou contatos.

A limpeza dos dados de teste em produção **não foi concluída** porque a conexão
foi bloqueada antes da abertura de sessão. Não foi declarado como removido ou
preservado nenhum registro de produção que não tenha sido efetivamente
consultado.
