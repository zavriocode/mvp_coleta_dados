# Relatório — Auditoria final do backend e integrações

**Projeto:** ACORDA RJ  
**Data:** 13 de agosto de 2026  
**Resultado:** **GO PARA ENTREGA**  
**Validação:** ambiente local e integrações Meta simuladas; sem deploy, sem acesso à produção e sem envio real.

Este relatório conclui somente a auditoria de backend, regras de negócio,
integrações, banco, migrations e operação. A auditoria de frontend, dependências
e higiene do repositório permanece registrada separadamente em
`RELATORIO_AUDITORIA_REPOSITORIO_FRONTEND_2026-08-13.md` e não foi repetida.

## 1. Achados por gravidade

### Crítico

Nenhum achado crítico permaneceu aberto.

### Alto — corrigido

- Uma recusa ou revogação explícita de mensagens poderia depender somente do
  campo auxiliar de bloqueio do contato. Uma inconsistência nesse campo poderia
  permitir que o contato entrasse no público apto ou chegasse ao início do envio.
- A seleção da campanha e o início do envio agora consultam também o
  consentimento ativo e impedem contatos com estado `recusado`, `revogado` ou
  resposta expressamente falsa.
- A regra oficial foi preservada: consentimento **não informado é elegível**;
  somente recusa, revogação, bloqueio ou exclusão pendente impedem a operação.

### Médio — corrigido

- Ao rejeitar um pedido de exclusão, o sistema restaurava o bloqueio pela
  ausência de autorização. Isso transformava indevidamente “não informado” em
  bloqueio. A restauração agora bloqueia somente quando existe recusa ou
  revogação ativa.
- A resposta manual `recusado` agora atualiza, na mesma transação, o bloqueio de
  mensagens ou ligações correspondente. Uma autorização posterior continua
  respeitando a exclusão pendente.
- JWTs eram validados pela família compatível inferida pela biblioteca. A
  emissão e a validação agora fixam explicitamente `HS256`; um token HS384,
  mesmo assinado com o segredo correto, é recusado.
- O teste estrutural ainda conferia somente oito migrations. Foi atualizado
  para validar o ledger completo das migrations `001` a `012`.

### Baixo — observado, não bloqueante

- Algumas consultas administrativas de detalhe, histórico e participantes de
  evento retornam o conjunto completo. Não houve problema concreto no volume
  atual nem no teste de importação com 15 mil contatos. Paginação nesses pontos
  pode ser planejada quando o volume real justificar, pois alterar agora os
  contratos de API e interface seria uma mudança funcional fora desta auditoria.

## 2. Correções realizadas

- elegibilidade de campanhas baseada também em recusa/revogação expressa;
- barreira final de consentimento imediatamente antes do provider Meta;
- sincronização dos bloqueios ao registrar resposta manual recusada;
- restauração correta dos bloqueios após rejeição de exclusão;
- algoritmo JWT explicitamente limitado a HS256;
- teste do ledger atualizado para as 12 migrations atuais;
- cenários de regressão adicionados para recusa explícita e consentimento não
  informado.

Nenhuma tabela, migration ou dado existente foi alterado por essas correções.

### Arquivos alterados nesta continuação

- `backend/src/middlewares/autenticarUsuario.js`;
- `backend/src/modules/autenticacao/autenticacaoService.js`;
- `backend/src/modules/campanhas/campanhaModel.js`;
- `backend/src/modules/contatos/contatoModel.js`;
- `backend/src/modules/exclusoes/solicitacaoExclusaoModel.js`;
- `backend/src/modules/mensageria/mensageriaModel.js`;
- `backend/scripts/testarCampanhas.js`;
- `backend/scripts/testarEstruturaBanco.js`;
- `backend/scripts/testarIntegracaoMeta.js`;
- `backend/scripts/testarPrivacidadeAdministrativa.js`;
- `backend/scripts/testarSegurancaUsuarios.js`;
- `backend/README.md`;
- `README_TECNICO.md`;
- `RELATORIO_AUDITORIA_FINAL_BACKEND_2026-08-13.md`.

As demais alterações já existentes no worktree pertencem à auditoria anterior e
foram preservadas.

## 3. Regras de negócio validadas

- usuários, perfis, criação e alteração de senha;
- autenticação, JWT, usuário inativo e autorização administrativa;
- contatos, normalização, duplicidade, edição e histórico;
- cadastro público e cadastro manual;
- importação CSV, XLSX e VCF, reimportação, carga e exclusão administrativa;
- formulários públicos, idade, bairros, eventos e múltiplos eventos;
- consentimentos, recusa, revogação, não informado, bloqueios e exclusões;
- relatórios, filtros, exportações CSV/XLSX e backups de dados;
- campanhas, templates, público encontrado/apto/não apto;
- lotes, participações únicas, tentativas, falhas e reprocessamento;
- limite interno, limite oficial Meta e capacidade efetiva em janela móvel de
  24 horas;
- concorrência, idempotência e ausência de reservas parciais indevidas.

## 4. Integrações entre módulos

Foram validados os fluxos:

```text
formulário -> contato -> consentimento -> banco
contato -> filtros -> campanha -> participação -> lote
campanha -> lote -> tentativa -> mensageria -> provider Meta mock
Meta mock -> webhook -> tentativa -> histórico
business_capability_update -> limite oficial -> capacidade efetiva -> campanhas
bloqueio/recusa -> elegibilidade -> reserva -> tentativa de envio
```

O mesmo contato continua único no sistema e pode participar de campanhas e
eventos diferentes sem duplicação indevida.

## 5. Backend e cibersegurança

- SQL dinâmico limitado a fragmentos internos permitidos; valores externos
  seguem parametrizados;
- controllers, services e models preservam validação e listas explícitas de
  campos, sem mass assignment identificado;
- rotas administrativas possuem autenticação e autorização no backend;
- middleware JWT recarrega o usuário e bloqueia usuário inativo;
- algoritmo JWT fixado em HS256;
- Helmet, CORS configurado, limites de corpo, rate limiting e controle de
  concorrência permanecem ativos;
- respostas de erro não expõem stack trace ao cliente;
- tokens, segredos e payload bruto do webhook não são persistidos em logs;
- webhook mantém corpo bruto limitado, HMAC com comparação segura e
  idempotência;
- locks transacionais, constraints e rollback preservam capacidade e
  duplicidade sob concorrência.

Não foram identificados IDOR, escalada de privilégio ou SQL Injection nos
fluxos auditados.

## 6. Meta, webhook e mensageria

Todos os testes foram feitos com mocks/fakes e sem envio real.

Foram validados:

- template aprovado e não aprovado;
- identificador externo;
- timeout, token inválido e erro da Meta;
- estados `sent`, `delivered`, `read` e `failed`;
- falha e reprocessamento preservando tentativa anterior;
- opt-out e reimportação sem recriar autorização;
- recusa explícita impedindo acesso ao provider;
- consentimento não informado permanecendo elegível;
- sincronização manual e automática de capacidade;
- `business_capability_update`, redução, aumento e evento repetido;
- limite oficial, proteção interna e menor limite efetivo;
- concorrência sem ultrapassar a capacidade.

## 7. DevOps, migrations e backups

- o comando real `npm start` executou o runner e iniciou o servidor na porta
  configurada;
- o runner confirmou nenhuma migration pendente;
- o ledger contém `001` a `012`, incluindo `009`, `011` e `012`;
- o schema final criou com sucesso um banco vazio com 30 tabelas e 166 bairros;
- uma conexão propositalmente inválida fez o runner abortar com código diferente
  de zero, sem marcar migration como aplicada;
- checksum, advisory lock e transação por migration permanecem ativos;
- configuração sensível continua por variáveis de ambiente;
- backup pelo painel é exclusivo do administrador, usa `pg_dump --data-only`,
  arquivo temporário, SHA-256, lock e remoção após download;
- ausência de `pg_dump` gera erro controlado HTTP 503, sem derrubar a aplicação.

## 8. Performance e concorrência

- importação de 15 mil contatos foi validada sem divisão manual do arquivo;
- índices cobrem telefone normalizado, consentimentos ativos, eventos,
  importações, campanhas, participações, tentativas e históricos críticos;
- a unicidade por campanha/contato impede dupla participação;
- locks e `FOR UPDATE SKIP LOCKED` impedem dupla reserva;
- a capacidade é recalculada dentro da operação protegida antes de reservar ou
  enviar;
- não foi identificado N+1 bloqueante nos fluxos críticos testados.

## 9. Testes executados

### Suíte integrada do backend

`npm test` aprovado integralmente:

- banco: 22 verificações;
- normalização de nomes: 7;
- cadastro público: 42;
- administração: 43;
- cadastro manual: 24;
- importações: aprovado;
- relatórios: 25;
- segurança e usuários: aprovado;
- privacidade: 18;
- eventos e exclusões: 54;
- campanhas, lotes e mensageria: 27;
- webhook: 10;
- backups: 22;
- resiliência: 22.

### Testes complementares

- integração Meta com mocks: 16 verificações;
- sincronização segura do limite Meta: 24 verificações;
- schema vazio: 30 tabelas e 166 bairros;
- importação de carga: 15.000 contatos, aprovada;
- runner com conexão inválida: falha controlada, exit code 1;
- `node --check` nos arquivos alterados: aprovado;
- `git diff --check`: aprovado.

O build do frontend não foi repetido porque essa etapa já foi concluída na
auditoria anterior e nenhum arquivo frontend foi alterado nesta continuação.

## 10. Pendências dependentes de produção/Meta

- aplicar no ambiente publicado qualquer migration ainda pendente e conferir o
  ledger de produção antes do deploy;
- validar health checks, CORS e variáveis efetivas nos domínios publicados;
- confirmar credenciais, templates aprovados e assinatura ativa do webhook na
  conta real da Meta;
- realizar backup de produção e validar restauração conforme o procedimento
  operacional antes de uma mudança estrutural;
- executar um smoke test controlado em produção após o deploy.

Nenhuma dessas validações externas foi declarada como concluída nesta auditoria.
