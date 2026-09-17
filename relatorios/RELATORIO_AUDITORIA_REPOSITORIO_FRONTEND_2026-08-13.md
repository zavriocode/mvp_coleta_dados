# Relatório — Higiene do repositório e segurança do frontend

**Projeto:** ACORDA RJ  
**Data:** 13 de agosto de 2026  
**Validação:** local, sem deploy e sem alteração do banco

## 1. Higiene do repositório

- O Git estava limpo antes da auditoria.
- Não foram encontrados dumps, backups, builds, logs ou arquivos `.env` reais
  versionados.
- Os únicos arquivos de ambiente rastreados são os `.env.example`.
- Nenhum arquivo de código foi removido: todos os módulos frontend possuem
  referência no grafo de imports e os scripts backend têm uso em `package.json`,
  operação, testes ou documentação.
- Todas as migrations `001` a `012` foram preservadas sem alteração.
- O antigo `README_IMPLEMENTACAO_CAMPANHAS_MENSAGERIA.md` foi preservado e
  renomeado para `RELATORIO_IMPLEMENTACAO_CAMPANHAS_MENSAGERIA_2026-08-12.md`,
  deixando claro que é evidência histórica, não documentação canônica.
- Os relatórios datados foram mantidos por seu valor de auditoria e manutenção.
- O README raiz foi consolidado como entrada curta e atual. A documentação
  detalhada permanece em `README_TECNICO.md`, `backend/README.md`,
  `frontend/README.md` e `PROMPT_MESTRE.md`.
- Foram corrigidas referências obsoletas a 22/29 tabelas, 11 migrations, fluxo
  manual antigo, finalidade visível da campanha e integração Meta apenas futura.
- O caminho local e o hash de um backup particular foram removidos do README
  público. Os exemplos de WhatsApp e e-mail passaram a usar placeholders.

## 2. Segurança do frontend

### Segredos e configuração

- Não há `JWT_SECRET`, `DATABASE_URL`, senha de banco, token Meta ou chave
  privada no código-fonte ou no bundle de produção.
- Variáveis `VITE_*` são tratadas como públicas. Apenas URL da API, telefone
  público e e-mail público são usados no frontend.
- O build não gerou source maps.
- A leitura da URL da API foi centralizada também nos downloads de backup e
  relatório. Configuração ausente agora produz a mesma falha controlada usada
  pelas demais requisições, em vez de `TypeError`.

### Autenticação e autorização

- O frontend protege a navegação e esconde ações administrativas, mas o backend
  continua sendo a autoridade final.
- Usuários, backups, exclusões, exportações, eventos, campanhas, templates e
  configuração de capacidade têm autorização conferida nas rotas backend.
- Senhas e hashes não são devolvidos pelas APIs administrativas.
- Login e todas as respostas `/api/admin` agora incluem
  `Cache-Control: no-store` e `Pragma: no-cache`.
- O JWT permanece no `localStorage`. Não foi migrado silenciosamente para cookie
  HttpOnly porque isso exige alteração coordenada de autenticação, CORS e CSRF.
  Essa migração permanece uma possibilidade de endurecimento futuro, não uma
  correção isolada segura.

### XSS, dados e rede

- Não foram encontrados `dangerouslySetInnerHTML`, `innerHTML`, `eval` ou
  construção dinâmica de função.
- Links externos do WhatsApp usam HTTPS e `noopener noreferrer`.
- Prévia e lotes de campanhas recebem telefone mascarado e somente os campos
  operacionais necessários.
- O backend usa Helmet, CORS com origem configurada, limites de corpo,
  rate limiting, controle de concorrência e mensagens genéricas de erro.
- O webhook continua isolado antes do parser JSON, com corpo bruto limitado e
  validação HMAC existente.
- `vercel.json` mantém CSP, HSTS, `nosniff`, bloqueio de iframe, política de
  referência e política de permissões.
- Não foram encontrados endpoints locais ou de teste no bundle de produção.

## 3. Dependências

As auditorias iniciais encontraram vulnerabilidades transitivas em
`ip-address`, `nanoid` e `postcss`. Os lockfiles foram atualizados apenas para
versões compatíveis corrigidas.

Resultado final:

```text
Backend: 0 vulnerabilidades
Frontend: 0 vulnerabilidades
```

## 4. Validação executada

- `node --check src/app.js`: aprovado;
- `node --check scripts/testarSegurancaUsuarios.js`: aprovado;
- `npm run testar:seguranca`: aprovado;
- validação de `no-store` no login e em rota administrativa: aprovada;
- `npm audit --omit=dev` no backend: 0 vulnerabilidades;
- `npm audit` no frontend: 0 vulnerabilidades;
- `npm run build` no frontend: 70 módulos, build aprovado;
- busca de segredos e source maps no bundle: nenhum resultado;
- `git diff --check`: executado na conferência final;
- migrations: 12 arquivos preservados e sem diff.

## 5. Pendências reais

- A sessão administrativa ainda usa JWT no `localStorage`; uma futura migração
  para cookie HttpOnly deve incluir desenho e testes de CSRF e CORS.
- A auditoria foi local. Cabeçalhos e configuração efetiva devem ser conferidos
  novamente nos domínios publicados após o próximo deploy.
- Nenhuma mudança foi implantada e nenhuma migration foi executada.
