# ACORDA RJ

Sistema concluído de coleta e gestão de contatos comunitários, eventos,
consentimentos, importações, relatórios, campanhas e mensageria oficial pela
WhatsApp Cloud API.

## Estado atual

**SISTEMA APROVADO PARA OPERAÇÃO CONTROLADA.**

- Entrega consolidada em 17/09/2026; escopo funcional congelado.
- Backend: Node.js 24, Express 5, CommonJS e PostgreSQL 18.
- Frontend: React 19, React Router 7 e Vite 8.
- Banco: 31 tabelas operacionais, 166 bairros e migrations 001 a 023.
- Produção: frontend na Vercel; API e PostgreSQL gerenciado na DigitalOcean.
- Backup: arquivo único `.acorda`, dump custom completo e manifesto assinado.
- Restore: administrativo, isolado, com manutenção, pré-backup, validação,
  reconciliação e liberação manual.

O documento canônico da entrega, arquitetura, variáveis, checklists e ressalvas é
[STATUS_FINAL_DO_PROJETO.md](STATUS_FINAL_DO_PROJETO.md).

## Funcionalidades principais

- formulário público e eventos com QR Code;
- contatos únicos por telefone canônico, filtros, histórico e cadastro interno;
- consentimentos, aceite de privacidade, revogações, bloqueios e exclusões;
- importação VCF/CSV/XLSX e relatórios/exportações CSV/XLSX;
- usuários `operador` e `administrador`, com autorização no backend;
- campanhas, lotes idempotentes, tentativas e estados de mensageria;
- templates oficiais, capacidade Meta, HMAC, webhook idempotente e opt-out;
- proteção contra duplicidade e contra reenvio automático de resultado
  indeterminado;
- recovery seguro após restart;
- backup e restauração administrativa completa.

## Regras operacionais essenciais

- PostgreSQL é a fonte de verdade operacional; a Meta é a fonte dos estados
  oficiais externos.
- O frontend nunca autoriza uma operação crítica.
- Tentativas indeterminadas nunca são reenviadas automaticamente.
- Opt-out impede novos envios.
- Dados históricos não expiram automaticamente; somente artefatos técnicos
  temporários podem ser removidos por cleanup.
- Restore nunca envia mensagem nem executa operação mutável na Meta e nunca
  libera o sistema automaticamente.

## Instalação local

Backend:

```powershell
cd backend
npm ci
Copy-Item .env.example .env
npm start
```

Frontend, em outro terminal:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env
npm run dev
```

Endereços padrão:

- formulário: `http://localhost:5173/participar`;
- login: `http://localhost:5173/login`;
- liveness: `http://localhost:3000/api/saude/vivo`;
- readiness: `http://localhost:3000/api/saude/pronto`.

## Banco de dados

Banco novo e vazio:

```powershell
createdb criar_banco
psql --set ON_ERROR_STOP=1 --dbname criar_banco --file backend/database/criar_banco.sql
```

Banco existente:

```powershell
cd backend
npm run banco:migrar
```

Nunca execute `criar_banco.sql` em banco ocupado. Migrations aplicadas não podem
ser editadas ou apagadas.

## Ambientes e segredos

O frontend recebe apenas valores públicos. Banco, JWT, assinatura de backup e
credenciais Meta pertencem ao backend e devem ser configurados no painel seguro
da DigitalOcean. `.env.example` contém somente nomes e exemplos, nunca valores
reais. Consulte [backend/.env.example](backend/.env.example).

## Validação

Use os runners isolados para evitar qualquer banco externo:

```powershell
cd backend
npm run testar:correcoes-finais
npm run testar:fluxo-campanhas-meta
npm run testar:backup-completo-isolado
npm run testar:restore-isolado
npm run testar:e2e

cd ..\frontend
npm run testar:backups
npm run testar:restauracao-renderizada
npm run build
```

Os runners isolados exigem PostgreSQL em loopback. Não execute a suíte genérica
contra uma configuração cuja origem não tenha sido confirmada.

## Documentação

- [Status final e checklists](STATUS_FINAL_DO_PROJETO.md)
- [Documentação Técnica Oficial](DOCUMENTACAO_TECNICA_OFICIAL.md)
- [Documentação Técnica Oficial em PDF](output/pdf/DOCUMENTACAO_TECNICA_OFICIAL_ACORDA_RJ.pdf)
- [Documentação técnica consolidada](README_TECNICO.md)
- [Backend](backend/README.md)
- [Frontend](frontend/README.md)
- [Prompt mestre de reconstrução do zero](PROMPT_MESTRE.md)
- [Homologação pré-deploy](relatorios/RELATORIO_HOMOLOGACAO_PRE_DEPLOY_2026-09-17.md)
- [Auditoria final](relatorios/RELATORIO_AUDITORIA_FINAL_ENTREGA_2026-09-17.md)

Os demais arquivos em `relatorios/` são evidências históricas por fase e não
substituem o status final nem uma nova validação após alterações.
