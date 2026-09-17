# Backend — ACORDA RJ

API concluída em Node.js 24, Express 5, CommonJS e PostgreSQL 18. O backend é a
autoridade de segurança, autorização e regras de negócio.

## Instalação local

```powershell
npm ci
Copy-Item .env.example .env
npm start
```

`npm start` executa primeiro `npm run banco:migrar`. Use banco local/descartável
para testes. Nunca execute runners contra uma origem não confirmada.

Saúde:

- `GET /api/saude/vivo`: processo ativo;
- `GET /api/saude/pronto`: banco e estrutura crítica disponíveis.

## Runtime de produção

- DigitalOcean App Platform com source/root `backend`;
- buildpack Node, sem Dockerfile;
- `Aptfile` instala PostgreSQL client 18.4;
- `heroku-postbuild` executa `pg_dump --version`;
- `prestart` aplica migrations pendentes;
- `start` executa `node src/server.js`.

Produção valida antes do startup a presença de JWT, origem HTTPS, banco TLS,
assinatura de backup e configurações essenciais Meta/webhook. Os nomes e padrões
estão em `.env.example`; valores reais ficam somente na DigitalOcean.

## Banco

- 31 tabelas operacionais e 166 bairros iniciais;
- migrations 001 a 023, com checksum SHA-256 e advisory lock;
- PostgreSQL é a fonte de verdade operacional;
- `database/criar_banco.sql` serve somente para banco vazio;
- `npm run banco:migrar` é o único caminho para banco existente.

Dados e históricos de negócio não expiram automaticamente. Cleanup automático
remove somente artefatos técnicos temporários.

## Segurança

- JWT Bearer, bcrypt, `auth_epoch`, bloqueio por tentativas e perfis;
- autenticação em `/api/admin/*` e autorização de administrador no backend;
- Helmet, CORS por `FRONTEND_URL`, rate limit, limite de concorrência e body;
- SQL parametrizado, transações, constraints, locks e timeouts;
- HMAC em webhook e logs/erros sanitizados;
- uploads privados com nomes internos, limites e streaming;
- subprocessos `pg_dump`/`pg_restore` sem shell.

## Campanhas e mensageria

Campanhas preservam snapshot de filtros. Lotes possuem idempotência; reservas são
transacionais e a participação é única por campanha/contato. A capacidade efetiva
usa o menor valor entre a proteção interna e o limite oficial finito da Meta.

Tentativas persistem estados técnicos e histórico. Confirmadas não são reenviadas.
Timeout ou queda após possível aceite pode gerar resultado indeterminado; esse
estado nunca é reenviado automaticamente. Após restart, recovery retoma somente
pendências comprovadamente seguras.

O webhook valida HMAC sobre corpo bruto, é idempotente e preserva eventos
antecipados, duplicados, fora de ordem e durante manutenção. Opt-out bloqueia novos
envios. A Meta é a fonte dos estados oficiais externos.

## Templates Meta

Templates oficiais podem ser sincronizados, criados e submetidos por administrador.
Somente templates aptos são enviados. Exclusão é manual/lógica e deve proteger
templates aprovados, oficiais, vinculados ou com histórico. Sincronização automática
e webhook atualizam estados; consulta manual é contingência.

## Backup

Administrador gera `acorda-rj-completo-AAAA-MM-DD_HH-mm-ss.acorda`:

- dump custom completo do PostgreSQL;
- manifesto HMAC, SHA-256, versão PostgreSQL e migrations;
- schema `recuperacao` explicitamente excluído;
- lock, timeout, limite de fila/tamanho e histórico;
- download autenticado único e retenção apenas do arquivo temporário.

O arquivo não é criptografado. Deve ser baixado e guardado fora da App Platform.
O backup gerenciado/PITR do provedor continua sendo proteção complementar.

## Restore

Restauração administrativa recebe um único `.acorda` por streaming. O fluxo
autentica, inspeciona em banco isolado, exige administrador ativo e confirmação
forte, ativa manutenção, invalida sessões, drena trabalhos, gera backup
pré-restore, exige custódia, restaura, valida, reconcilia webhooks e aguarda
liberação manual.

Restore não chama a Meta nem envia mensagens. Falha nunca vira sucesso e não
libera manutenção automaticamente. O schema `recuperacao` preserva manutenção,
`auth_epoch`, operações, auditoria, webhooks e referência do pré-backup fora do
snapshot operacional.

Para PostgreSQL remoto, configurar `RESTORE_BANCO_DISPONIVEL_BYTES` com orçamento
confirmado pelo suporte. Upload, expansão, disco, memória, registro e processamento
possuem guardas. Dump, hashes e large objects são tratados incrementalmente.

## Rotas administrativas principais

Todas exigem JWT; operações marcadas administrativas exigem `administrador`.

- `/api/admin/contatos`, `/origens`, `/importacoes`, `/relatorios`, `/eventos`;
- `/api/admin/campanhas`, `/mensageria`;
- `/api/admin/solicitacoes-exclusao`, `/usuarios`;
- `/api/admin/backups`, `/restauracoes`.

Webhook público: `/api/webhooks/whatsapp`. Cadastro público:
`/api/publico/contatos`. Login: `/api/autenticacao/login`.

## Testes recomendados

```powershell
npm run testar:correcoes-finais
npm run testar:fluxo-campanhas-meta
npm run testar:backup-completo-isolado
npm run testar:restore-isolado
npm run testar:upload-restore-isolado
npm run testar:e2e
```

Os runners isolados exigem `BANCO_HOST` loopback e usam providers falsos. Consulte
o `package.json` para as suítes específicas.

Documentação canônica: [../STATUS_FINAL_DO_PROJETO.md](../STATUS_FINAL_DO_PROJETO.md).
