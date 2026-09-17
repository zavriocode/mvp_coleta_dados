# Auditoria final de entrega — ACORDA RJ

Data: 17/09/2026.

## Parecer

**B) PRONTO COM RESSALVAS.**

**SISTEMA APROVADO PARA OPERAÇÃO CONTROLADA.**

Não há bloqueador crítico ou alto conhecido pendente. A ressalva é operacional:
a auditoria não acessou produção, não chamou a Meta real e não enviou mensagens.
O primeiro uso real deve ser acompanhado, com lote inicial controlado, métricas,
logs e possibilidade de interrupção.

## Achados

### CRÍTICO

Nenhum.

### ALTO

1. **Dependência de upload com vulnerabilidade de negação de serviço**
   - Arquivos: `backend/package.json` e `backend/package-lock.json`.
   - Causa: `multer` 2.2.0 possuía avisos de segurança de severidade alta.
   - Impacto: requisições multipart especialmente construídas poderiam consumir
     recursos excessivos no endpoint administrativo de restauração.
   - Correção: atualização para `multer` 2.4.0 e nova execução dos testes de
     upload, incluindo arquivos de até 320 MiB, limite excedido, interrupção,
     timeout, truncamento, disco, memória e concorrência.
   - Status: **corrigido**. `npm audit --omit=dev`: zero vulnerabilidades.

### MÉDIO

1. **Dependência transitiva vulnerável**
   - Arquivo: `backend/package-lock.json`.
   - Causa: versão anterior de `qs` com aviso de segurança moderado.
   - Impacto: exposição indireta a comportamento inseguro no processamento de
     parâmetros.
   - Correção: atualização para `qs` 6.16.0.
   - Status: **corrigido**. Auditorias backend e frontend: zero vulnerabilidades.

2. **Dois runners declarados isolados aceitavam `DATABASE_URL` externa**
   - Arquivos: `backend/scripts/testarFluxoCampanhasMetaIsolado.js` e
     `backend/scripts/testarJornadasE2E.js`.
   - Causa: preferência por `DATABASE_URL`, mesmo existindo configuração local.
   - Impacto: risco de um teste tentar usar banco não local. Durante esta
     auditoria, uma execução inicial resolveu o endereço configurado de produção,
     mas a conexão TCP expirou antes de ser estabelecida; nenhuma query ou
     alteração foi executada.
   - Correção: os runners agora ignoram `DATABASE_URL`, exigem explicitamente
     `BANCO_HOST` loopback e desabilitam SSL para o PostgreSQL descartável local.
   - Status: **corrigido** e revalidado em banco local temporário.

### BAIXO

1. **Infraestrutura de testes desatualizada após as fases de backup/restore**
   - Arquivos: `backend/scripts/auditarProntidaoOperacional.js` e
     `backend/scripts/testarJornadasE2E.js`.
   - Causa: reset incompleto do schema preservado `recuperacao`, ausência de
     chave temporária de assinatura e expectativa antiga de 17 migrations.
   - Impacto: falsos negativos no teste, sem efeito no runtime da aplicação.
   - Correção: reset completo do banco descartável, segredo aleatório por
     execução e expectativa alinhada às 23 migrations atuais.
   - Status: **corrigido**; os runners completos passaram.

2. **Texto legado mencionava dois arquivos no upload de restauração**
   - Arquivo: `backend/src/modules/backups/uploadRestore.js`.
   - Causa: mensagem anterior à adoção do pacote único `.acorda`.
   - Impacto: instrução confusa em caso de falha de upload.
   - Correção: mensagem alinhada ao fluxo atual de arquivo único.
   - Status: **corrigido** e coberto pelos testes de upload.

### MELHORIA FUTURA

1. A inspeção de restore compara tabelas, migrations, colunas, constraints,
   índices, funções, triggers, dados, sequences e large objects. Para constraints,
   valida tipo, colunas, referências e propriedades, mas não mantém uma prova
   semântica independente de cada expressão `CHECK` no retrato online. O dump é
   assinado, o hash é validado e as migrations têm checksum, reduzindo o risco.
   Status: **aceito conscientemente**, sem bloqueio para operação controlada.

2. A carga de aproximadamente 2.000 contatos foi validada localmente e de forma
   isolada. Latência, limites e comportamento reais da Meta e da infraestrutura
   de produção não foram medidos por determinação do escopo. Status: **aceito
   conscientemente**; iniciar com lote controlado e monitorado.

## Resultado por área

- Mensageria ~2.000: **APROVADA** — 2.000 mensagens distintas concluídas, sem
  duplicação; concorrência 3; pool encerrado sem conexões ocupadas.
- Duplicidade encontrada: **NÃO**.
- Reenvio indeterminado: **NÃO** — aceite externo sem confirmação permanece
  indeterminado e não é reenviado automaticamente.
- Restart seguro: **SIM** — retomada apenas de pendências seguras; nenhuma chamada
  ao provider para tentativas indeterminadas.
- Webhook/opt-out: **OK** — HMAC, idempotência, evento antecipado, repetido e fora
  de ordem cobertos.
- Segurança: **OK** — autenticação, autorização administrativa, validação,
  rate limit, CORS, headers, HMAC, upload e ausência de segredos rastreados
  revisados; auditorias de dependências sem vulnerabilidades.
- Banco: **OK** — 23 migrations contínuas, bootstrap vazio, 31 tabelas, 166
  bairros, constraints, índices, FKs, sequences, transações e locks exercitados.
- Backup/restore: **OK** — PostgreSQL 18.4 real em bancos descartáveis; restauração
  completa de 31 tabelas e 241 registros, controle preservado, manutenção,
  custódia, validação e liberação manual.
- Frontend: **OK** — fluxos de backup/restauração, prévias e estados renderizados
  aprovados; build com 74 módulos.
- Build/testes: **OK**.

## Evidências principais

- Prontidão/carga: 511 verificações; 2.000 mensagens; duração aproximada de
  12 s; RSS máximo de 116,83 MiB; heap máximo de 36,10 MiB; event loop máximo
  de 33,98 ms.
- Recuperação de mensageria: 24 verificações, incluindo queda após aceite,
  reinício e proteção contra reenvio incerto.
- Campanhas: 2.421 verificações na suíte principal, além das suítes de fluxo,
  concorrência, templates, provider mockado, webhook e resiliência.
- Restore Fase 2: 112 verificações, sem rede externa e sem chamadas Meta.
- Backup completo: `pg_dump`/`pg_restore` 18.4, banco vazio restaurado, dados e
  objetos comparados, aplicação consultada sobre o destino restaurado.
- Upload: 14 cenários, incluindo streaming e limite exato de 320 MiB.
- E2E: 16 grupos de jornadas; nenhuma sobra QA e estrutura final coerente.
- Frontend: build e quatro suítes específicas aprovados.
- Todos os JavaScript de `backend/src` e `backend/scripts`: `node --check` OK.
- `git diff --check`: OK.
- Bancos temporários da auditoria: removidos; consulta final retornou lista vazia.

## Limites e entrega

- Nenhuma conexão com produção foi estabelecida e nenhuma alteração de produção
  ocorreu.
- Nenhuma chamada Meta real ou mensagem real foi enviada.
- Nenhum deploy, commit ou push foi executado.
- As correções permanecem no working tree para revisão e commit do responsável.
