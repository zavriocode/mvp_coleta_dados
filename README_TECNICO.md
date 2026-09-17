# README técnico — ACORDA RJ

Estado consolidado em 17/09/2026. Consulte também
[STATUS_FINAL_DO_PROJETO.md](STATUS_FINAL_DO_PROJETO.md) e a
[Documentação Técnica Oficial](DOCUMENTACAO_TECNICA_OFICIAL.md).

## 1. Arquitetura

```text
frontend React/Vite (Vercel)
        |
        | HTTPS/JSON ou multipart autenticado
        v
backend Node.js/Express (DigitalOcean App Platform)
        |                         |
        v                         v
PostgreSQL 18              WhatsApp Cloud API
        ^                         |
        |                         v
        +--- webhook HMAC / caixa preservada
```

O backend é a autoridade de segurança e regras. PostgreSQL é a fonte de verdade
operacional. A Meta é a fonte dos estados oficiais externos. O frontend nunca
decide autorização e nenhuma operação crítica depende somente do cliente.

Fluxo interno predominante:

```text
route -> middleware -> controller -> service -> model -> PostgreSQL
```

Tecnologias:

- Node.js 24, Express 5, CommonJS e JavaScript;
- PostgreSQL 18 e pacote `pg`, com SQL parametrizado e sem ORM;
- bcrypt, JWT, Helmet, CORS, rate limit e limites de concorrência;
- React 19, React Router 7, Vite 8 e Fetch API;
- `pg_dump`/`pg_restore` 18.x no runtime.

## 2. Módulos

| Módulo | Responsabilidade |
|---|---|
| autenticação/usuários | Login, JWT, bloqueio, `auth_epoch`, operador e administrador. |
| contatos/origens/bairros | Cadastro, unicidade por telefone, filtros e histórico. |
| consentimentos/privacidade/exclusões | Aceites, revogações, bloqueios e solicitações auditadas. |
| eventos | Gestão, participantes, links e QR Code. |
| importações | VCF, CSV e XLSX com confirmação e rastreabilidade. |
| relatórios | Indicadores e exportações CSV/XLSX. |
| campanhas | Segmentação, snapshots, lotes, reservas e capacidade. |
| templates Meta | Sincronização, submissão, estados oficiais e imagens. |
| mensageria | Tentativas, provider, recovery, webhook e opt-out. |
| backups/restauração | `.acorda`, inspeção, manutenção, restore e revisão. |

## 3. Autenticação e autorização

- JWT Bearer com expiração configurável e versão global `auth_epoch`.
- Senhas somente como hash bcrypt.
- Bloqueio temporário por excesso de falhas de conta/e-mail/IP.
- Todas as rotas `/api/admin/*` autenticam no backend.
- Ações administrativas usam middleware de administrador; esconder botão no
  frontend é somente UX.
- Restore incrementa `auth_epoch`; sessões anteriores deixam de ser válidas.
- Respostas privadas usam `Cache-Control: no-store`.

## 4. Contatos, consentimentos e retenção

Telefone canônico possui unicidade no banco. Cadastro público, manual e importado
convergem para as mesmas regras de consistência. Consentimentos de mensagens e
ligações são independentes e versionados; recusa, revogação, bloqueio ou pedido
de exclusão pendente impedem elegibilidade conforme a regra do fluxo.

Dados de negócio e históricos não expiram automaticamente. Cleanup remove apenas
artefatos técnicos temporários. Exclusões administrativas seguem rotas, locks,
transações, dependências e auditoria próprias.

## 5. Campanhas e mensageria

- Campanha preserva template e snapshot dos filtros.
- Lotes possuem chave idempotente e reserva transacional.
- `UNIQUE (campanha_id, contato_id)` impede repetição do contato na campanha.
- Tentativas persistem `pendente`, `enviando`, `enviada`, `entregue`, `lida` ou
  `falhou`, com histórico de transições.
- Capacidade efetiva é o menor valor entre a proteção interna e o limite oficial
  finito conhecido da Meta.
- Somente templates oficiais aptos podem ser enviados.
- Erro externo é sanitizado antes de log/persistência.

Timeout ou queda após a possível aceitação do provider pode produzir resultado
indeterminado. Esse estado nunca é reenviado automaticamente. No restart, o
recovery retoma somente pendências comprovadamente seguras; confirmadas e
indeterminadas não são duplicadas.

## 6. Webhooks e opt-out

`GET /api/webhooks/whatsapp` valida o token de verificação. O `POST` usa os bytes
exatos do corpo, HMAC SHA-256 e comparação em tempo seguro.

Eventos possuem idempotência e tratamento de ordem. Evento antecipado ou sem
correlação permanece preservado. Durante manutenção, o webhook validado é salvo
no schema `recuperacao` antes do HTTP 200 e reconciliado antes da liberação.
Payload misto acompanha cada evento separadamente para que opt-out não espere
consulta de template. Opt-out revoga mensagens e impede novos envios.

## 7. Backup completo

Endpoint administrativo gera um único arquivo
`acorda-rj-completo-AAAA-MM-DD_HH-mm-ss.acorda`.

- `pg_dump --format=custom --blobs --no-owner --no-acl`;
- estrutura e dados operacionais completos;
- schema `recuperacao` excluído;
- manifesto autenticado, SHA-256, versão PostgreSQL e ledger de migrations;
- subprocesso sem shell e senha apenas no ambiente do processo;
- lock de concorrência, timeout, limite preventivo e histórico;
- download autenticado único e remoção do artefato temporário.

O `.acorda` não inclui `.env`, credenciais externas, configuração da hospedagem ou
conteúdo remoto apontado por URL. Ele contém dados pessoais e hashes de senha da
aplicação, não é criptografado e deve ser custodiado como sensível.

## 8. Restore administrativo

O upload é gravado por streaming em diretório privado; não usa `memoryStorage`
nem materializa o dump inteiro em RAM. Nome do cliente não determina o caminho.
Tamanho, timeout, disco, memória, expansão e tamanho de registro possuem guardas.

Etapas obrigatórias:

1. autenticar arquivo/manifesto e verificar compatibilidade;
2. inspecionar em banco isolado e confirmar administrador ativo;
3. exigir senha/frase administrativa;
4. ativar manutenção persistente e invalidar sessões;
5. drenar operações admitidas;
6. gerar e custodiar backup pré-restore estabilizado;
7. restaurar sem Meta ou envio;
8. validar estrutura, dados, sequences e objetos;
9. reconciliar a caixa de webhooks;
10. novo login, revisão e liberação manual.

Falha mantém manutenção e recuperação necessária. O schema `recuperacao` fica no
mesmo PostgreSQL, fora do dump operacional, sem FK para dados restaurados.

## 9. Banco e migrations

- 31 tabelas operacionais;
- 166 bairros iniciais;
- migrations contínuas 001–023;
- migration 022: metadados do backup completo;
- migration 023: controle preservado de recuperação;
- ledger com nome, versão e checksum SHA-256;
- advisory lock e transação por migration.

Para banco vazio, use `database/criar_banco.sql`. Para banco existente, use
somente `npm run banco:migrar`. Nunca edite migration aplicada.

## 10. Runtime e publicação

Backend na DigitalOcean App Platform:

- source/root: `backend`;
- buildpack Node, sem Dockerfile;
- `Aptfile` instala PostgreSQL client 18.4;
- `heroku-postbuild` confirma `pg_dump --version`;
- `prestart` executa migrations;
- `start` executa `node src/server.js`;
- `/api/saude/vivo` é liveness;
- `/api/saude/pronto` valida banco e estrutura crítica.

Frontend na Vercel: publicar `frontend`, configurar variáveis públicas e apontar
`VITE_API_URL` para a API HTTPS. Configurar `FRONTEND_URL` no backend com a origem
exata da Vercel.

As variáveis obrigatórias, checklists e monitoramento estão em
[STATUS_FINAL_DO_PROJETO.md](STATUS_FINAL_DO_PROJETO.md). Os nomes e padrões
completos ficam em `backend/.env.example` e `frontend/.env.example`; nunca gravar
valores reais nesses arquivos.

## 11. Testes finais

A homologação final cobriu aproximadamente 2.000 contatos, concorrência,
duplicidade, indeterminação, restart, provider e banco indisponíveis, rollback,
locks, webhooks, opt-out, backup/restore real, upload grande, autenticação,
autorização, dependências, frontend, build, migrations e instalação limpa.

Resultado: **SISTEMA APROVADO PARA OPERAÇÃO CONTROLADA.**

Isso não garante comportamento absoluto de serviços externos ou produção. Não
houve envio Meta real; o primeiro uso deve ser acompanhado operacionalmente.
