# STATUS FINAL DO PROJETO — ACORDA RJ

- Versão documental: 17/09/2026
- Estado: **concluído; escopo funcional congelado**
- Ambiente: **pronto para operação controlada**

**SISTEMA APROVADO PARA OPERAÇÃO CONTROLADA.**

Esta é a referência canônica do estado entregue. Relatórios datados preservam a
evolução e as evidências de cada fase; quando descreverem comportamento antigo,
devem ser interpretados como históricos.

A descrição técnica oficial e o roteiro de reconstrução estão em
`DOCUMENTACAO_TECNICA_OFICIAL.md` e `PROMPT_MESTRE.md`, respectivamente. A versão
PDF oficial está em `output/pdf/DOCUMENTACAO_TECNICA_OFICIAL_ACORDA_RJ.pdf`.

## Arquitetura e tecnologias

- Frontend React 19, React Router 7 e Vite 8, publicado na Vercel.
- Backend Node.js 24, Express 5 e CommonJS, publicado como componente com raiz
  `backend` na DigitalOcean App Platform.
- PostgreSQL 18 gerenciado é a fonte de verdade operacional.
- SQL direto e parametrizado pelo pacote `pg`; não há ORM.
- WhatsApp Cloud API é a integração oficial. A Meta é a fonte de verdade dos
  estados oficiais externos de mensagens e templates.
- `pg_dump` e `pg_restore` 18.x são instalados no runtime pelo `backend/Aptfile`.
- O backend é a autoridade de autenticação, autorização e regras. O frontend
  apenas apresenta estados e nunca decide permissão ou segurança.

Fluxo predominante:

```text
Vercel/React -> HTTPS -> Express -> service/model -> PostgreSQL 18
                                  -> WhatsApp Cloud API
Meta webhook -> HMAC -> caixa/reconciliação -> PostgreSQL 18
```

## Módulos e fluxo funcional

- Autenticação JWT, bloqueio por tentativas e perfis `operador` e
  `administrador`; operações críticas são protegidas novamente no backend.
- Cadastro público e administrativo de contatos, telefone canônico único,
  eventos, importações VCF/CSV/XLSX, filtros, relatórios e exportações.
- Consentimentos versionados, aceite de privacidade, revogação, bloqueio e
  solicitações de exclusão com auditoria.
- Campanhas com snapshot de filtros, reservas transacionais, lotes idempotentes,
  participações únicas e tentativas persistidas.
- Templates oficiais sincronizados com a Meta, submissão administrativa e
  proteção contra exclusão indevida de templates oficiais, aprovados, vinculados
  ou com histórico.
- Capacidade móvel de 24 horas limitada pelo menor valor entre a proteção interna
  e o limite oficial finito conhecido da Meta.
- Webhooks autenticados por HMAC, idempotentes e capazes de preservar eventos
  antecipados, duplicados, fora de ordem ou recebidos durante manutenção.
- Opt-out revoga mensagens, bloqueia o contato e impede novas tentativas.

## Mensageria e recuperação segura

Estados internos: `pendente`, `enviando`, `enviada`, `entregue`, `lida` e
`falhou`. Transições confirmadas e histórico técnico são persistidos.

- Duplo clique, concorrência e repetição são contidos por idempotência, locks e
  unicidade no PostgreSQL.
- Erro explícito do provider pode seguir a política segura de nova tentativa.
- Timeout, queda de conexão ou aceite sem confirmação completa geram resultado
  indeterminado quando não é possível provar o resultado externo.
- Tentativa indeterminada nunca é reenviada automaticamente.
- Após restart, somente pendências comprovadamente seguras são retomadas;
  confirmadas e indeterminadas não são duplicadas.
- Nenhuma operação crítica depende somente de estado mantido no navegador.

## Backup e restauração

O backup administrativo atual é um arquivo único
`acorda-rj-completo-AAAA-MM-DD_HH-mm-ss.acorda`:

- contém dump PostgreSQL custom completo e manifesto autenticado;
- inclui estrutura, dados, sequences, constraints, índices, funções, triggers e
  large objects do conjunto operacional;
- exclui o schema preservado `recuperacao`;
- usa SHA-256 e HMAC com `BACKUP_ASSINATURA_CHAVE` exclusiva;
- não é criptografado: deve ser guardado como dado sensível;
- é temporário no backend, de download administrativo único, e deve ser
  custodiado fora da App Platform.

A restauração administrativa:

1. recebe um único `.acorda` por streaming para arquivo privado temporário;
2. autentica manifesto, hash, formato, versão PostgreSQL e migrations;
3. inspeciona o candidato em banco isolado e exige administrador ativo;
4. exige confirmação administrativa forte;
5. ativa manutenção persistente e incrementa `auth_epoch`;
6. drena requisições e jobs já admitidos;
7. gera backup pré-restore do estado estabilizado e exige download/custódia;
8. restaura sem chamar a Meta e sem enviar mensagens;
9. valida dados, objetos e sequences;
10. reconcilia webhooks preservados;
11. exige novo login, revisão e liberação manual.

Falha de drenagem, pré-backup, restore ou validação mantém a manutenção e o
estado de recuperação necessária. O sistema nunca se libera automaticamente.
O upload, os hashes de tabelas e large objects são incrementais; o dump não é
carregado integralmente na RAM.

## Banco, migrations e retenção

- Schema operacional: 31 tabelas e catálogo inicial de 166 bairros.
- Migrations: **001 a 023**, contínuas e registradas com checksum SHA-256.
- Últimas migrations: `022_metadados_backup_completo.sql` e
  `023_controle_recuperacao.sql`.
- Banco vazio: aplicar `backend/database/criar_banco.sql`.
- Banco existente: executar somente `npm run banco:migrar`.
- Nunca aplicar o bootstrap sobre banco ocupado nem editar migration aplicada.

Contatos, consentimentos, bloqueios, campanhas, lotes, participações, tentativas,
webhooks, históricos, auditoria e registros de backup/restore não expiram por
idade. Cleanup automático pode remover somente arquivos, diretórios, sessões de
upload e outros artefatos técnicos temporários. Exclusões de negócio continuam
dependendo das ações e regras administrativas próprias.

## Variáveis obrigatórias em produção

Não registrar valores reais no Git. Configurar no painel seguro da DigitalOcean:

- runtime e origem: `NODE_ENV`, `FRONTEND_URL`, `JWT_SECRET`,
  `JWT_TEMPO_EXPIRACAO`;
- banco: `DATABASE_URL` com TLS ou o conjunto `BANCO_HOST`, `BANCO_PORTA`,
  `BANCO_NOME`, `BANCO_USUARIO`, `BANCO_SENHA`, `BANCO_SSL` e, quando aplicável,
  `BANCO_SSL_CA_BASE64`;
- backup: `BACKUP_ASSINATURA_CHAVE`; `PG_DUMP_CAMINHO` e
  `PG_RESTORE_CAMINHO` somente se os executáveis não estiverem no `PATH`;
- Meta/webhook: `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET`,
  `META_APP_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
  `WHATSAPP_BUSINESS_ACCOUNT_ID`, `META_GRAPH_API_VERSION` e
  `WHATSAPP_OPTOUT_BUTTON_ID`;
- restore remoto: `RESTORE_BANCO_DISPONIVEL_BYTES`, definido pelo suporte a
  partir da capacidade realmente disponível no PostgreSQL gerenciado.

Limites, timeouts, rate limits e demais opções estão documentados em
`backend/.env.example`. No frontend/Vercel: `VITE_API_URL`,
`VITE_WHATSAPP_NUMERO` e `VITE_PRIVACIDADE_EMAIL`.

## Estado final validado

As validações finais isoladas incluíram:

- aproximadamente 2.000 contatos, concorrência e zero duplicidade observada;
- zero reenvio automático de resultado indeterminado e restart seguro;
- opt-out, webhook antecipado, duplicado, fora de ordem e durante manutenção;
- falhas explícitas/indeterminadas do provider, banco indisponível, rollback,
  locks, pool e retomada;
- backup e restauração reais com PostgreSQL, `pg_dump` e `pg_restore` 18.4;
- arquivo inválido/adulterado/truncado, assinatura, ausência de administrador,
  falhas antes/durante/depois do restore e sessão antiga;
- upload por streaming, tamanho excedido, timeout, interrupção, disco, memória e
  concorrência;
- autenticação, autorização, perfis, dependências, frontend, build, migrations,
  instalação limpa e testes de falha.

Os resultados locais não são garantia absoluta de produção. Os testes finais não
enviaram mensagens reais nem chamaram a Meta real.

## Checklist operacional de deploy

- [ ] Revisar diff e garantir ausência de `.env`, tokens, dumps ou dados reais.
- [ ] Confirmar branch/repositório e raiz `backend` na DigitalOcean.
- [ ] Confirmar todas as variáveis obrigatórias sem revelar valores.
- [ ] Confirmar PostgreSQL 18, TLS e capacidade para restore remoto.
- [ ] Confirmar `pg_dump --version` e `pg_restore --version` como 18.x.
- [ ] Executar migrations pendentes uma única vez pelo `prestart`.
- [ ] Publicar o frontend na Vercel com a URL HTTPS da API.
- [ ] Conferir CORS, domínio, webhook Meta e health checks.
- [ ] Fazer deploy em janela acompanhada, sem campanha ativa.
- [ ] Manter backup/PITR do provedor e plano de rollback operacional.

## Smoke test pós-deploy

- [ ] `/api/saude/vivo` retorna 200 e `/api/saude/pronto` retorna 200.
- [ ] Login válido funciona; senha errada e perfil sem permissão são recusados.
- [ ] Formulário público carrega opções e grava um cadastro controlado sem
  duplicar telefone.
- [ ] Listagem, filtros, detalhes, eventos, importação e relatórios carregam.
- [ ] Campanhas/templates abrem sem iniciar envio.
- [ ] Verificação GET do webhook responde ao challenge configurado.
- [ ] Gerar um backup administrativo, baixar uma vez e conferir o comprovante;
  não restaurar produção como smoke test.
- [ ] Conferir logs, pool, memória, latência e ausência de erros repetidos.

## Monitoramento operacional

- RSS/heap, event-loop delay, fila e ocupação do pool PostgreSQL.
- Respostas 429/503, timeouts, locks e falhas de conexão.
- Tentativas em `enviando` por tempo anormal e resultados indeterminados.
- Webhooks pendentes/sem correlação e falhas de HMAC.
- Capacidade oficial Meta, opt-outs e divergências de templates.
- Espaço temporário, falhas de backup e estado de operações de restore.
- Liveness/readiness, reinícios e erros não tratados.

## Ressalvas reais

- A homologação local não reproduziu integralmente Linux/cgroup de 512 MiB da
  DigitalOcean.
- Meta, DigitalOcean, Vercel e rede podem falhar independentemente da aplicação.
- Mudanças futuras de API Meta, infraestrutura ou regras operacionais podem exigir
  manutenção e nova homologação.
- O primeiro uso real, especialmente o primeiro envio, deve ser acompanhado com
  lote controlado, logs, métricas e possibilidade de interrupção.
