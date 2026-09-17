# Relatório — Qualidade, organização e manutenibilidade

**Projeto:** ACORDA RJ  
**Data:** 14 de agosto de 2026  
**Ambiente:** repositório local e bancos PostgreSQL temporários e isolados  
**Produção/Meta real:** não acessadas  
**Deploy, commit, push e envio real:** não realizados

## 1. Integridade

- Não foram encontrados arquivos corrompidos, truncados ou vazios inesperados.
- A leitura estrita confirmou 198 arquivos de texto válidos em UTF-8.
- Não há conflitos de merge, `TODO`, `FIXME` ou `HACK` relevantes.
- Não há dumps, backups, logs, builds, cobertura, caches ou arquivos de ambiente reais versionados.
- Todos os imports relativos do backend e frontend resolvem para arquivos existentes.
- O grafo analisado possui 119 módulos e não contém dependências circulares.
- As mudanças locais anteriores de campanhas, templates e Meta foram preservadas; nenhuma foi descartada ou reimplementada.

## 2. Achados críticos

Nenhum achado crítico. Não foi identificada exposição de segredo, corrupção,
risco objetivo de perda de dados, quebra de migration ou falha funcional
remanescente.

## 3. Achados estruturais e classificação

### Importante — corrigido

Os formulários de criação de campanha e salvamento/configuração de template não
bloqueavam uma segunda submissão enquanto a primeira requisição estava em
andamento. Foram adicionados estados explícitos de processamento, bloqueio dos
controles envolvidos e feedback textual. Isso reduz o risco de registros ou
uploads repetidos por duplo clique sem alterar API ou regra de negócio.

### Melhoria — corrigida

O `backend/README.md` ainda informava quatorze migrations, enquanto o schema e o
ledger atuais possuem quinze. A contagem foi corrigida.

### Melhoria — corrigida

`backend/src/config/evento.js` não possuía qualquer importação ou referência no
backend, scripts, testes ou documentação. Era um resíduo isolado de uma
estratégia antiga de lock. Foi removido após confirmação no grafo e em busca
textual.

## 4. Arquivos corrigidos

- `frontend/src/pages/CampanhasAdministrativas.jsx`: proteção contra submissão
  repetida de campanha e template;
- `backend/README.md`: contagem atual de migrations;
- `RELATORIO_QUALIDADE_ORGANIZACAO_MANUTENIBILIDADE_2026-08-14.md`: este
  relatório.

As demais alterações já existentes no Git pertencem à implementação legítima e
validada do fluxo Campanhas → Meta; foram auditadas e preservadas.

## 5. Arquivo removido e motivo

- `backend/src/config/evento.js`: módulo órfão, sem consumidores e sem efeito no
  runtime. A remoção não altera locks atuais, eventos, banco ou contratos.

Nenhum arquivo histórico, migration, relatório de auditoria ou dado foi
removido.

## 6. Arquitetura

- O backend preserva o fluxo `rota → controller → service → model → PostgreSQL`.
- Autenticação e autorização permanecem nas rotas/middlewares e nas barreiras
  críticas do backend.
- Campanhas reutilizam a preparação canônica dos filtros de contatos.
- Templates, provider Meta, webhook e capacidade continuam separados por
  responsabilidade.
- O frontend mantém páginas, componentes, serviços, utilitários e estilos em
  seus diretórios próprios.
- Nenhuma mudança arquitetural foi necessária.

## 7. Duplicações e qualidade

- Não foi encontrada duplicação perigosa de regra de negócio.
- A dupla checagem de elegibilidade na seleção e imediatamente antes do provider
  foi mantida por ser defesa em profundidade, não duplicação acidental.
- Os `console.log` encontrados pertencem a ciclo de vida do servidor, scripts
  operacionais e testes; não existem logs casuais com dados privados.
- Não foram encontrados `catch` vazios em código operacional, Promises críticas
  sem tratamento ou código comentado abandonado.
- A inserção set-based recente de lotes foi preservada e validada; não há N+1
  nesse fluxo.

## 8. Migrations e schema

- Existem 15 migrations sequenciais, de `001` a `015`, sem lacunas ou
  duplicações.
- Nenhuma migration aplicada foi alterada nesta auditoria.
- `criar_banco.sql` cria 31 tabelas e registra as 15 migrations no ledger.
- O runner mantém checksum SHA-256, transação, advisory lock e rejeição de
  migration aplicada que tenha sido modificada.
- Foram confirmadas constraints de telefone normalizado, contato/evento,
  campanha/contato, idempotência de lote, número de tentativa, external message
  ID, webhook, consentimento ativo e exclusão pendente.
- Não houve mudança estrutural nem acesso ao banco de produção.

## 9. Segredos e configuração

- Somente arquivos `.env.example` são rastreados pelo Git.
- Não foram encontrados token Meta, senha, connection string, JWT secret ou
  credencial real no código ou bundle.
- Variáveis `VITE_*` continuam restritas a informações públicas do frontend.
- `META_APP_ID` está documentado apenas como placeholder de configuração.
- O `.gitignore` cobre ambientes reais, dependências, build e resíduos locais.
- Erros da Meta e do PostgreSQL permanecem sanitizados para o cliente.

## 10. Frontend

- Imports e build foram aprovados.
- Não há source maps no build de produção.
- Estados de processamento agora impedem submissão repetida nos dois formulários
  auditados.
- Requisições `FormData` continuam sem cabeçalho JSON forçado.
- Loading e feedback de erro permanecem controlados.
- Nenhum redesenho ou mudança funcional foi feito.

## 11. Documentação

- A documentação canônica está coerente com 31 tabelas e 15 migrations.
- A variável `META_APP_ID`, a rota administrativa de imagem e o suporte a
  HEADER IMAGE estão documentados nas alterações legítimas já existentes.
- A contagem antiga encontrada no README do backend foi corrigida.
- Relatórios datados foram mantidos como evidência histórica, sem tratá-los como
  fonte superior ao código atual.

## 12. Testes

### Sintaxe

```text
104 arquivos JavaScript do backend aprovados por node --check.
```

### Fluxo focado Campanhas → Meta

```text
Escala, filtros e lotes: 26 verificações aprovadas.
Campanhas, lotes e mensageria: 27 verificações aprovadas.
Templates oficiais da Meta: 30 verificações aprovadas.
Integração Meta com mocks: 16 verificações aprovadas.
Webhook de mensageria: 16 verificações aprovadas.
Cenário E2E final de 2 contatos: 16 verificações aprovadas.
Fluxo isolado: 6 grupos aprovados; nenhuma chamada real.
```

### Jornadas E2E

```text
16 grupos de jornadas aprovados.
Coerência final: 31 tabelas, 166 bairros e 15 migrations.
Resíduos QA: zero contatos, usuários, campanhas ou eventos.
```

Foram cobertos cadastro, formulário, importações, carga, eventos, exclusões,
privacidade, campanhas, templates, Meta fake, webhook, capacidade, usuários,
relatórios, backups e resiliência.

### Dependências

```text
Backend: npm ls aprovado; npm audit --omit=dev com 0 vulnerabilidades.
Frontend: npm ls aprovado; npm audit com 0 vulnerabilidades.
```

Dependências opcionais ausentes listadas pelo npm são próprias das plataformas
e pré-processadores não utilizados; não representam pacote obrigatório faltando.

## 13. Build

```text
Vite: 70 módulos transformados; build concluído com sucesso.
Source maps gerados: 0.
```

## 14. Git diff e resíduos

- `git diff --check`: aprovado.
- Marcadores de conflito: nenhum.
- Alterações em `backend/database` durante esta auditoria: nenhuma.
- Arquivos `.env` reais rastreados: nenhum.
- As mudanças legítimas anteriores continuam sem commit, junto com as três
  correções desta auditoria e este relatório.
- Os avisos de conversão futura LF/CRLF são de política de fim de linha do Git no
  Windows e não indicam corrupção ou falha de whitespace.

## 15. Pendências

Não existe pendência local impeditiva encontrada nesta revisão. Continuam fora
do que foi validado, por dependerem de ambiente externo:

- deploy e smoke test dos domínios publicados;
- credenciais, permissões e status efetivos da conta Meta real;
- migration/startup efetivamente executados no próximo deploy;
- envio real controlado e recebimento real de webhook;
- restauração recente de backup de produção.

Esses itens não foram simulados como validação de produção.

## 16. Itens deliberadamente não refatorados

- `campanhaModel.js` e `CampanhasAdministrativas.jsx` são extensos, porém estão
  funcionais e cobertos pelos testes; dividi-los agora seria refatoração ampla e
  desnecessariamente arriscada.
- A checagem de elegibilidade em mais de uma barreira foi preservada por
  segurança.
- O JWT em `localStorage` não foi migrado isoladamente; uma mudança para cookie
  HttpOnly exige desenho conjunto de autenticação, CORS e CSRF.
- Tabelas e relatórios históricos foram preservados.
- Não foram alterados contratos HTTP, status, filtros, migrations, locks,
  constraints, schema ou regras Meta.

## Conclusão

**APTO PARA ENTREGA — ORGANIZAÇÃO E INTEGRIDADE APROVADAS**
