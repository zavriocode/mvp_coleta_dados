# Homologação pré-deploy e testes de falha — ACORDA RJ

Data: 17/09/2026.

## Parecer

**B) PRONTO COM RESSALVAS.**

**SISTEMA APROVADO PARA OPERAÇÃO CONTROLADA.**

Não há bloqueador funcional conhecido. A ressalva existe porque o teste foi
executado em Windows, sem reproduzir o cgroup Linux real de 512 MiB nem a etapa
APT da DigitalOcean, e nenhuma chamada real à Meta foi permitida.

## CRÍTICO

Nenhum achado no sistema.

## ALTO

Nenhum achado pendente no sistema.

## MÉDIO

### Produção aceitava iniciar com integrações obrigatórias ausentes

- Cenário: `NODE_ENV=production` sem chave de assinatura, HMAC ou credenciais
  essenciais da Meta.
- Causa: `backend/src/config/validarAmbiente.js` validava JWT, frontend e banco,
  mas não as integrações necessárias ao funcionamento completo.
- Impacto: o processo poderia ficar saudável enquanto backup, webhook ou
  mensageria falhariam apenas no primeiro uso.
- Correção: validação fail-fast por presença de nove variáveis obrigatórias.
- Status: **corrigido**; ausências e configuração completa foram testadas, e a
  regressão local de 11 grupos permaneceu aprovada.

### Incidente no harness de porta indisponível

- Cenário: tentativa de testar porta ocupada em processo filho.
- Causa: o harness removeu `DATABASE_URL`; o `dotenv` então recarregou a URL do
  `.env` local. O processo permaneceu ativo por aproximadamente cinco segundos.
- Impacto: a URL externa foi analisada e pode ter ocorrido tentativa de conexão.
  O log local não confirmou conexão, query ou alteração, mas também não permite
  provar que nenhuma tentativa chegou ao servidor remoto.
- Correção: processo encerrado; testes posteriores mantiveram `DATABASE_URL`
  explicitamente vazio e usaram porta de banco local recusada.
- Status: **contido; confirmação externa não executada**, pois consultar produção
  contrariaria o escopo. Não é defeito do runtime da aplicação.

## BAIXO

### `.env` local incompleto

- Cenário: comparação apenas dos nomes com `backend/.env.example`.
- Causa: o arquivo local continha banco e JWT, mas omitia limites, caminhos das
  ferramentas PostgreSQL e chave de backup.
- Impacto: comportamento dependente de defaults e backup sem assinatura local.
- Correção: todas as chaves foram adicionadas, uma chave de backup aleatória foi
  gerada, caminhos do PostgreSQL 18 foram configurados e sincronização Meta local
  foi desativada. Credenciais Meta desconhecidas ficaram vazias.
- Status: **corrigido para uso local**. Nenhum valor existente foi sobrescrito.

### Dependências transitivas obsoletas na instalação limpa

- Cenário: `npm ci` exibiu avisos para `inflight`, `lodash.isequal`, `rimraf`,
  `glob` e `fstream`, transitivos de dependências atuais.
- Impacto: manutenção futura; `npm audit` não apontou vulnerabilidades.
- Correção: nenhuma troca ampla de biblioteca foi feita nesta homologação.
- Status: **aceito conscientemente**.

## MELHORIA FUTURA

- Executar a mesma matriz em staging Linux com buildpack real, camada APT e
  limite efetivo de 512 MiB.
- Automatizar em ambiente Linux o cenário de porta já ocupada; o bind concorrente
  não foi reproduzido de forma confiável no Windows.
- Ampliar a automação visual genérica para 403, 404, 413, 429 e 500 em todas as
  páginas. Os componentes e serviços possuem tratamento, mas a automação visual
  atual é mais profunda em backup/restore, login e imagens.

## Resultado obrigatório

- Runtime limpo: **OK COM RESSALVA DE PLATAFORMA**.
- Cenário ~2.000: **OK** — 511 verificações, 2.000 mensagens distintas.
- Duplicidade: **NÃO**.
- Indeterminado reenviado: **NÃO**.
- Restart: **OK** — queda após aceite e recuperação segura validadas.
- Banco: **OK** — 23 migrations, 31 tabelas, rollback, locks, constraints,
  sequences e ausência de resíduos QA.
- Webhook/opt-out: **OK** — HMAC, duplicado, antecipado, fora de ordem,
  manutenção e payload misto exercitados.
- Backup: **OK** — 41 verificações administrativas e 20 de geração/falha.
- Restore: **OK** — 112 verificações da Fase 2 e 46 de restauração completa.
- Segurança: **OK** — autenticação, perfis, rate limit, HMAC, upload, logs e
  dependências; `npm audit` retornou zero vulnerabilidades nos dois projetos.
- Frontend/UX: **OK COM RESSALVA DE COBERTURA** — 12, 44 e 64 verificações,
  layout desktop/mobile e build aprovados.
- Memória/pool: **OK** — carga de 2.000 atingiu RSS máximo aproximado de
  111,18 MiB; upload grande atingiu aproximadamente 119,80 MiB; pool terminou
  sem conexão ocupada ou artefato de upload.
- Build/testes: **OK** — instalação limpa pelo lockfile, frontend com 74 módulos,
  `node --check`, E2E de 16 grupos e suítes isoladas aprovadas.

## Runtime e DigitalOcean

- Node local: 24.14.0; projeto declara Node 24.x.
- PostgreSQL, `pg_dump` e `pg_restore`: 18.4.
- Build atual: buildpack, sem Dockerfile; raiz esperada do componente backend:
  `backend`; `Aptfile` está dentro dessa raiz.
- O `Aptfile` instala PostgreSQL client 18.4. Com o diretório do cliente no
  `PATH`, o comando real `npm run heroku-postbuild` aprovou `pg_dump --version`.
- Sem simular a camada APT no Windows, esse comando não encontra `pg_dump` pelo
  `PATH`; o runtime da aplicação local usa os caminhos absolutos configurados.
- Cópia limpa sem `.env` e sem `node_modules`: `npm ci`, bootstrap, `prestart`,
  `start`, liveness e readiness aprovados sobre banco descartável.

## Isolamento e limpeza

- Providers Meta foram exclusivamente falsos/mocks; nenhuma mensagem real foi
  enviada e nenhuma operação Meta real foi chamada pelas suítes aprovadas.
- Bancos descartáveis foram removidos; a verificação final não deixou banco de
  homologação conhecido.
- A política da ferramenta recusou a remoção recursiva da cópia limpa, já
  verificada dentro de `%TEMP%`. Ela permanece em
  `C:\Users\gabriellindo\AppData\Local\Temp\acorda-homologacao-25f7ccc9258644c7b883152dd78f84fa`
  e contém apenas a cópia de código, dependências instaladas e build temporário.
- Nenhum deploy, commit ou push foi executado.
