# Prompt Mestre de reconstrução - ACORDA RJ

Versão consolidada: 17/09/2026.

## Finalidade

Este é o roteiro mestre para reconstruir o ACORDA RJ do zero caso o código-fonte
precise ser refeito. Ele define ordem de construção, arquitetura, funcionalidades,
regras de negócio, segurança, banco, testes e publicação.

Não basta produzir uma interface parecida. A reconstrução deve preservar as
garantias homologadas. Consulte também `STATUS_FINAL_DO_PROJETO.md`,
`README_TECNICO.md`, os READMEs de backend/frontend, as migrations 001-023 e os
relatórios finais. O projeto atual está concluído e com escopo congelado; este
roteiro só deve ser executado com autorização humana expressa.

---

## INÍCIO DO PROMPT PARA RECONSTRUÇÃO

Reconstrua integralmente o sistema profissional **ACORDA RJ**. Trabalhe em marcos
verificáveis, na ordem indicada, e não avance quando um critério obrigatório
falhar. Não invente funcionalidades nem altere regras durante a reconstrução.

## 1. Resultado esperado

Entregue um sistema web com:

- formulário público e inscrição em eventos;
- gestão de contatos, origens, bairros e históricos;
- consentimentos independentes para mensagens e ligações;
- privacidade, revogação, bloqueio e solicitações de exclusão;
- cadastro manual e importação VCF, CSV e XLSX;
- eventos, participantes, links e QR Code;
- relatórios e exportações autorizadas;
- usuários `operador` e `administrador`;
- campanhas, lotes, participações e tentativas persistidas;
- templates e mensageria pela WhatsApp Cloud API;
- webhook autenticado, idempotente e tolerante a eventos fora de ordem;
- opt-out que bloqueia novos envios;
- backup completo em arquivo único `.acorda`;
- restore administrativo seguro, auditado e liberado manualmente;
- frontend na Vercel, backend e PostgreSQL gerenciado na DigitalOcean.

## 2. Regras imutáveis

1. O backend é a autoridade de autenticação, autorização e regras.
2. O frontend nunca é a única barreira de segurança.
3. PostgreSQL é a fonte de verdade operacional.
4. A Meta é a fonte dos estados oficiais externos de mensagens, templates e
   capacidade.
5. Mutações relevantes são persistidas, transacionais quando necessário e
   auditáveis.
6. Resultado indeterminado nunca é reenviado automaticamente.
7. Opt-out impede novos envios.
8. Webhooks são autenticados, duráveis, idempotentes e tolerantes à ordem.
9. Operação crítica não depende apenas da memória do processo.
10. Dados e históricos de negócio não expiram automaticamente por idade.
11. Cleanup automático remove somente artefatos técnicos temporários.
12. Templates não são apagados automaticamente. Exclusão é manual/lógica e
    protege aprovados, oficiais, vinculados ou com histórico.
13. Backup/restore não carregam o dump completo na memória.
14. Restore não chama a Meta, não cria template e não envia mensagem.
15. Restore nunca libera manutenção automaticamente.
16. Segredos nunca entram no Git, frontend, logs, respostas ou documentação.
17. Migration aplicada nunca é editada; crie migration incremental.
18. Produção, Meta real, deploy, commit e push exigem autorização específica.

## 3. Arquitetura obrigatória

- Frontend: React 19, React Router 7, Vite 8, JavaScript e CSS.
- Backend: Node.js 24, Express 5, CommonJS e JavaScript.
- Banco: PostgreSQL 18 com `pg`, SQL parametrizado e sem ORM.
- Integração: WhatsApp Cloud API oficial e webhook Meta.
- Ferramentas: `pg_dump` e `pg_restore` da versão principal do servidor.

Fluxo interno do backend:

```text
route -> middleware -> controller -> service -> model -> PostgreSQL
```

Estrutura mínima:

```text
backend/
  database/migrations/
  scripts/
  src/config/
  src/middlewares/
  src/modules/
  src/utils/
frontend/
  scripts/
  src/components/
  src/data/
  src/pages/
  src/services/
  src/styles/
  src/utils/
relatorios/
```

## 4. Marco 0 - preparar o repositório

1. Crie projetos independentes em `backend` e `frontend`.
2. Declare Node `24.x` nos dois `package.json`.
3. Backend: instale Express, `pg`, bcrypt, JWT, Helmet, CORS, compression,
   express-rate-limit, dotenv, multer e ExcelJS.
4. Frontend: instale React, React DOM, React Router e QR Code React; configure
   Vite e o plugin React.
5. Ignore `.env`, dumps, `.acorda`, temporários, uploads, `node_modules` e builds.
6. Crie `.env.example` sem valores reais e mantenha ambientes separados.
7. Padronize UTF-8, erros seguros e logs estruturados sem segredos.

Aceite: instalações limpas pelos lockfiles funcionam sem segredo versionado.

## 5. Marco 1 - banco e migrations

### 5.1 Bootstrap e migrador

1. Crie `backend/database/criar_banco.sql` somente para banco vazio.
2. Crie `schema_migrations` com nome, versão, checksum SHA-256 e data.
3. Implemente `scripts/executarMigrations.js` com advisory lock, ordem estrita,
   checksum e transação por migration.
4. Recuse migration aplicada cujo conteúdo divergiu.
5. Use `npm run banco:migrar` em banco existente; nunca use o bootstrap nele.

### 5.2 Evolução obrigatória

Reproduza as migrations com os mesmos nomes e objetivos:

1. `001_validar_estrutura_atual.sql` - estrutura inicial e validações.
2. `002_normalizar_nomes_importados.sql` - normalização de nomes.
3. `003_garantir_eventos_participantes.sql` - eventos e participantes.
4. `004_permitir_varios_eventos_ativos.sql` - vários eventos ativos.
5. `005_padronizar_telefones_contatos.sql` - telefone canônico.
6. `006_criar_campanhas_lotes_mensageria.sql` - campanhas e mensageria.
7. `007_adicionar_triggers_campanhas.sql` - invariantes de campanhas.
8. `008_permitir_backup_sql_dados.sql` - histórico inicial de backup.
9. `009_integrar_meta_cloud_api.sql` - integração e IDs da Meta.
10. `010_permitir_importacao_vcf.sql` - importação VCF.
11. `011_sincronizar_limite_meta.sql` - capacidade oficial.
12. `012_identificar_webhook_meta.sql` - identidade de webhook.
13. `013_gerenciar_templates_oficiais_meta.sql` - templates oficiais.
14. `014_garantir_auditoria_campanhas.sql` - auditoria de campanhas.
15. `015_atualizar_templates_por_webhook_meta.sql` - webhook de template.
16. `016_alinhar_status_campanhas.sql` - estados coerentes.
17. `017_arquivar_campanhas_com_historico.sql` - arquivamento histórico.
18. `018_garantir_telefone_canonico_unico.sql` - unicidade definitiva.
19. `019_remover_limite_etario_cadastros.sql` - cadastro sem limite etário.
20. `020_excluir_modelos_sem_apagar_historico.sql` - exclusão lógica protegida.
21. `021_resiliencia_envio_webhook.sql` - indeterminação e resiliência.
22. `022_metadados_backup_completo.sql` - metadados do backup.
23. `023_controle_recuperacao.sql` - controle preservado de recuperação.

Estado final: 31 tabelas operacionais, 166 bairros, PKs, FKs, `NOT NULL`,
`CHECK`, unicidades, índices, sequences, funções e triggers válidos. O schema
`recuperacao` não possui FK para o conjunto operacional.

Aceite: bootstrap vazio funciona; segunda execução do migrador não altera nada;
checksum divergente falha; constraints, índices e sequences são válidos.

## 6. Marco 2 - fundação do backend

1. Crie o pool em `src/config/banco.js` com TLS, limites e timeouts.
2. Aceite `DATABASE_URL` ou `BANCO_*`, sem imprimir credenciais.
3. Faça validação fail-fast do ambiente de produção.
4. Crie `AppError`, request ID, 404 e handler central.
5. Configure Helmet, CORS por origem exata, compression, limite de body, rate
   limit, limite de concorrência e `Cache-Control: no-store` em dados privados.
6. Separe liveness de readiness.
7. Implemente desligamento gracioso do HTTP, jobs e pool.
8. Execute subprocessos sem shell e não exponha `stderr` bruto.

Ordem dos middlewares/rotas: segurança e limites; manutenção persistente;
webhook com corpo bruto; JSON; público/autenticação; JWT em `/api/admin/*`;
módulos administrativos; 404; tratamento de erro.

Aceite: erros são seguros, produção recusa configuração incompleta e o processo
encerra sem conexão de banco ocupada.

## 7. Marco 3 - autenticação e usuários

1. Modele usuário ativo com nome, e-mail normalizado, bcrypt e perfil.
2. Implemente login sem revelar se o e-mail existe.
3. Registre tentativas e bloqueie por conta/e-mail/IP.
4. Emita JWT expirável com `auth_epoch` global.
5. Valide JWT e `auth_epoch` em toda rota administrativa.
6. Autorize ações de administrador no backend.
7. Proteja criação, alteração e desativação de usuários.
8. Faça restore invalidar todas as sessões anteriores.

Aceite: 401 para sessão inválida, 403 para perfil insuficiente, senha nunca é
retornada e esconder botão não substitui autorização.

## 8. Marco 4 - contatos, privacidade e eventos

### Contatos

1. Use a mesma normalização no cadastro público, manual e importado.
2. Trate telefone canônico como identidade única.
3. Preserve origem, bairro, timestamps e histórico.
4. Implemente busca, filtros, paginação, detalhes e alterações auditáveis.
5. Impeça duplicidade por constraint, inclusive sob concorrência.

### Consentimentos e privacidade

1. Separe consentimentos de mensagens e ligações.
2. Versione texto, decisão, origem e data.
3. Registre aceite de privacidade e textos públicos versionados.
4. Preserve histórico em revogação e bloqueio.
5. Faça exclusão/anonimização administrativa com dependências, transação,
   auditoria e filtros explícitos.
6. Nunca exclua dados de negócio automaticamente por idade.

### Eventos

1. Permita vários eventos ativos.
2. Gere link público e QR Code.
3. Garanta vínculo único contato/evento.
4. Preserve participantes após encerramento.

Aceite: concorrência não duplica telefone; consentimentos são independentes;
revogado/bloqueado fica inelegível; evento não duplica participante.

## 9. Marco 5 - importações e relatórios

1. Aceite VCF, CSV e XLSX com tamanho e tipo limitados.
2. Normalize nomes e telefones como no cadastro manual.
3. Use prévia/confirmação e registre arquivo, linhas e resultado.
4. Explicite duplicidades, linhas inválidas e falhas parciais.
5. Evite carregar toda a entrada na memória sem necessidade.
6. Implemente relatórios e CSV/XLSX com limite configurável.
7. Revalide filtros e autorização no backend.

Aceite: reimportação não duplica contato; erro por linha é rastreável; exportação
respeita limite, filtro e perfil.

## 10. Marco 6 - campanhas e templates

### Campanhas

1. Persista campanha, template e snapshot imutável dos filtros.
2. Calcule elegibilidade por consentimento, bloqueio, exclusão, capacidade e
   estado do template.
3. Crie lotes com chave idempotente, ordem e tamanhos solicitado/efetivo.
4. Reserve participantes em transação e sob lock.
5. Garanta `UNIQUE (campanha_id, contato_id)`.
6. Preserve lote original; reprocessamento cria tentativa, não participação.
7. Arquive sem remover histórico.

### Templates

1. Persista ID oficial, nome, idioma, categoria, status, componentes e parâmetros.
2. Implemente submissão administrativa e sincronização oficial.
3. Envie somente templates oficialmente aptos.
4. Atualize estado por sincronização e webhook.
5. Nunca exclua automaticamente.
6. Exclusão manual é lógica e recusada para aprovado, oficial, vinculado ou com
   histórico; recalcule dependências sob lock/transação.

Aceite: duplo clique não cria dois lotes, contato participa uma vez, snapshot não
muda retroativamente e template protegido não é excluído.

## 11. Marco 7 - mensageria resiliente

1. Isole a WhatsApp Cloud API em provider com timeout e erro sanitizado.
2. Persista a tentativa antes da chamada externa.
3. Use `pendente`, `enviando`, `enviada`, `entregue`, `lida` e `falhou`, com
   histórico de transições.
4. Diferencie falha explícita de resultado indeterminado.
5. Timeout, desconexão, aceite sem ID ou falha após possível aceite são
   indeterminados quando o resultado externo não é comprovável.
6. Nunca converta indeterminação em sucesso falso ou retry automático.
7. Após restart, retome somente pendências comprovadamente seguras.
8. Use idempotência, locks e unicidades contra envio duplo.
9. Capacidade efetiva é o menor valor entre proteção interna e limite oficial
   finito conhecido.
10. Durante manutenção, não admita novo envio.

Aceite: concorrência/restart não duplicam; confirmada não é reenviada;
indeterminada permanece para revisão.

## 12. Marco 8 - webhook e opt-out

1. GET valida o verify token; POST usa os bytes exatos do corpo.
2. Valide HMAC SHA-256 em tempo seguro antes do processamento.
3. Defina identidade estável por evento.
4. Duplicado não duplica efeito; fora de ordem não regride estado.
5. Evento antecipado/sem correlação fica preservado para reconciliação.
6. Payload misto é acompanhado por evento.
7. Opt-out não espera template: revoga mensagens, bloqueia contato e impede envio.
8. Em manutenção, persista no schema `recuperacao` antes de responder sucesso.
9. Reconcilie antes de liberar novos envios.
10. Evento de template que exige consulta oficial fica pendente para ação manual
    auditada; restore local não consulta a Meta.

Aceite: HMAC inválido não processa; duplicado e fora de ordem são seguros;
evento antecipado é correlacionado; opt-out bloqueia imediatamente.

## 13. Marco 9 - backup completo

Formato: `acorda-rj-completo-AAAA-MM-DD_HH-mm-ss.acorda`.

1. Gere dump custom completo com `--blobs --no-owner --no-acl`.
2. Exclua explicitamente o schema `recuperacao`.
3. Use snapshot consistente para dump e metadados.
4. Inclua manifesto com formato, PostgreSQL, migrations, data e hashes.
5. Autentique com HMAC e `BACKUP_ASSINATURA_CHAVE` externa ao banco.
6. Calcule SHA-256 por streaming.
7. Rode `pg_dump` sem shell, com timeout e senha só no ambiente filho.
8. Use diretório/arquivo privados, limites e advisory lock.
9. Registre status, nome, tamanho, formato e metadados.
10. Permita download administrativo único e expire apenas o temporário.
11. Informe que assinatura não é criptografia.

O backup não inclui `.env`, credenciais externas, configuração da hospedagem ou
arquivo remoto por URL. Contém dados pessoais e hashes e deve ser custodiado fora
da App Platform.

Aceite: banco vazio recupera linhas, sequences, constraints, índices, funções,
triggers e large objects; adulteração/truncamento/assinatura inválida falham.

## 14. Marco 10 - restauração administrativa

O schema `recuperacao`, no mesmo PostgreSQL e fora do dump, guarda somente
manutenção, `auth_epoch`, operações/auditoria, webhooks preservados e referência
do pré-backup. Não possui FK para dados operacionais.

Fluxo obrigatório:

1. receber um `.acorda` por streaming em diretório privado;
2. validar tamanho, timeout, disco, memória, expansão e tamanho de registro;
3. autenticar manifesto e conteúdo;
4. validar PostgreSQL e migrations;
5. inspecionar em banco isolado;
6. comparar estrutura e exigir administrador ativo;
7. exigir senha atual e confirmação forte;
8. verificar operações incompatíveis;
9. ativar manutenção e incrementar `auth_epoch`;
10. bloquear admissões e drenar requisições/jobs;
11. abortar se a drenagem não for comprovada;
12. gerar pré-backup após estabilização; abortar se falhar;
13. exigir download/custódia externa do pré-backup;
14. restaurar apenas o conjunto operacional;
15. não chamar Meta nem enviar mensagem;
16. validar dados, objects, sequences e integridade;
17. reconciliar localmente webhooks preservados;
18. exigir novo login;
19. mostrar comprovante com arquivo, datas, integridade e contagens;
20. permitir conferência somente leitura;
21. liberar somente por ação manual explícita.

Falha preserva o pré-backup, mantém manutenção e marca **RECUPERAÇÃO
NECESSÁRIA**. PostgreSQL remoto exige `RESTORE_BANCO_DISPONIVEL_BYTES` confiável.

Aceite: sessão antiga é inválida; qualquer falha mantém manutenção; controle e
webhooks sobrevivem; nenhuma integração externa é disparada.

## 15. Marco 11 - frontend

Implemente:

| Rota | Acesso | Função |
|---|---|---|
| `/participar` | público | Cadastro geral/por evento. |
| `/privacidade`, `/termos`, `/excluir-dados` | público | Transparência e direitos. |
| `/login` | público | Acesso interno. |
| `/admin` | autenticado | Visão geral. |
| `/admin/contatos` | autenticado | Lista, filtros, detalhes e cadastro. |
| `/admin/importacoes` | autenticado | VCF/CSV/XLSX. |
| `/admin/relatorios` | autenticado | Indicadores e exportações. |
| `/admin/eventos` | autenticado | Eventos e participantes. |
| `/admin/campanhas` | autenticado | Campanhas, templates e tentativas. |
| `/admin/ajuda` | autenticado | Ajuda administrativa. |
| `/admin/usuarios` | administrador | Usuários. |
| `/admin/solicitacoes-exclusao` | administrador | Solicitações de direitos. |
| `/admin/backups` | administrador | Backup e restore. |

1. Centralize Fetch e injete Bearer Token.
2. Em 401, encerre a sessão local e volte ao login.
3. Retry automático somente para GET transitório; nunca para mutação.
4. Use loading/disabled em ações críticas.
5. Exiba vazio, sucesso e erro sem stack/segredo.
6. Rotas protegidas são UX; backend sempre revalida.
7. Faça desktop/mobile, labels e teclado.
8. Restore possui três momentos: enviar; revisar/preparar; restaurar/conferir/
   liberar.
9. Upload validado não significa restore concluído.
10. Mostre sucesso apenas após restore e validação.

Aceite: públicas funcionam sem token; privadas redirecionam; perfil insuficiente
não executa ação; mutações não duplicam; build aprova.

## 16. Marco 12 - jobs e recuperação do processo

1. No startup, detecte restore interrompido sem liberar manutenção.
2. Rode sincronização de templates somente quando permitida.
3. Recupere mensageria sob controle persistente e sem sobreposição.
4. Pare jobs antes de fechar HTTP e banco.
5. Drenagem conhece trabalhos admitidos; desconexão não prova término.

Aceite: jobs iguais não sobrepõem; manutenção bloqueia mutações; restart preserva
estado crítico.

## 17. Marco 13 - ambientes

No backend documente, sem valores reais:

- runtime/origem: `NODE_ENV`, `PORTA`, `FRONTEND_URL`;
- banco: `DATABASE_URL` ou `BANCO_*`, TLS, CA, pool e timeouts;
- autenticação: JWT, expiração e limites de login;
- HTTP: proxy, concorrência e rate limits;
- backup: ferramentas, timeouts, fila, tamanho, retenção e assinatura;
- restore: drenagem, upload, processamento, disco, memória, expansão, registro e
  espaço remoto;
- relatórios: limite de registros;
- Meta: verify token, app secret/ID, access token, IDs do telefone/conta, versão
  Graph, timeout, sincronização e opt-out.

Produção falha antes de abrir a porta se JWT, HTTPS, banco TLS, assinatura ou
integrações essenciais estiverem ausentes.

Frontend usa somente `VITE_API_URL`, `VITE_WHATSAPP_NUMERO` e
`VITE_PRIVACIDADE_EMAIL`. Nunca recebe banco, JWT, assinatura ou segredo Meta.

## 18. Marco 14 - testes obrigatórios

Sintaxe/build não bastam. Crie testes de lógica, autorização, estados e falhas.

- Banco: bootstrap, migrations, checksums, locks, rollback, FKs e sequences.
- Básicos: normalização, contatos, eventos, privacidade, exclusões e importações.
- Segurança: login, bloqueio, JWT, perfis e autorização server-side.
- Campanhas: snapshot, elegibilidade, lote idempotente e participação única.
- Meta simulada: templates, parâmetros, capacidade e erros, sempre com mock.
- Resiliência: sucesso, falha explícita, indeterminação, queda e restart.
- Webhook: HMAC, duplicado, antecipado, fora de ordem, opt-out e manutenção.
- Backup/restore: PostgreSQL real descartável, integridade, adulteração, upload,
  capacidade, falhas por etapa, `auth_epoch` e schema preservado.
- Frontend: rotas, perfis, loading, erros, clique duplo, desktop/mobile e build.
- E2E: jornadas completas e carga aproximada de 2.000 contatos.

Runners destrutivos recusam host não loopback. Não execute teste, migration ou
restore sem confirmar a origem do banco. Ao final, rode `git diff --check`.

Aceite global: zero duplicidade observada; zero retry automático de indeterminado;
zero chamada Meta real; nenhum resíduo conhecido; instalação limpa; audit sem
vulnerabilidade conhecida; todos os fluxos afetados aprovados.

## 19. Marco 15 - publicação

### DigitalOcean

1. Raiz do componente: `backend`.
2. Buildpack Node, sem Dockerfile.
3. `Aptfile` instala PostgreSQL client 18.4.
4. `heroku-postbuild` comprova `pg_dump --version`.
5. `prestart` aplica migrations; `start` executa `src/server.js`.
6. Segredos ficam no painel seguro.
7. Configure liveness/readiness e PostgreSQL 18 TLS.

### Vercel

1. Publique `frontend`.
2. Configure as três variáveis públicas.
3. Aponte a API HTTPS e faça `FRONTEND_URL` corresponder exatamente.
4. Valide SPA, CORS, CSP/HSTS, login e rotas diretas.

### Smoke pós-deploy

1. Verifique saúde e login/perfis.
2. Faça cadastro público controlado sem duplicidade.
3. Confira listagens, filtros, eventos, importação e relatórios.
4. Abra campanhas/templates sem enviar.
5. Verifique challenge GET do webhook.
6. Gere e baixe backup; não restaure produção como smoke.
7. Confira logs, pool, memória, latência e jobs.

Primeiro envio real: somente autorizado, em lote pequeno, monitorado e com
possibilidade imediata de interrupção.

## 20. Operação contínua

Monitore liveness/readiness, reinícios, RSS/heap, event loop, pool, 429/503,
timeouts, locks, tentativas antigas em `enviando`, indeterminadas, webhooks
pendentes, HMAC inválido, opt-outs, capacidade Meta, templates, temporários,
backup, restore e migrations. Mantenha backup/PITR do provedor como proteção
complementar e teste restore periodicamente apenas em isolamento.

## 21. Documentação obrigatória

Atualize a cada marco: `README.md`, `README_TECNICO.md`, READMEs de backend e
frontend, `.env.example`, `STATUS_FINAL_DO_PROJETO.md` e relatórios datados.
Marque documentos superados como históricos. Separe revisão estática, teste
local, ambiente isolado e evidência real de produção.

## 22. Condições de parada

Pare e documente se houver decisão arquitetural nova, banco não confirmado,
risco de Meta real, migration divergente, dependência inesperada, drenagem não
comprovada, pré-backup/validação falhos, segredo no diff ou quantidade destrutiva
diferente do esperado. Nunca contorne uma barreira para aparentar sucesso.

## 23. Estado de referência final

A reconstrução deve atingir:

- Node 24, Express 5, React 19, React Router 7, Vite 8 e PostgreSQL 18;
- migrations 001-023, 31 tabelas operacionais e 166 bairros;
- backend DigitalOcean e frontend Vercel;
- mensageria resistente a duplicidade, concorrência, restart e indeterminação;
- webhook HMAC, idempotência, opt-out e reconciliação;
- backup `.acorda` e restauração administrativa segura;
- históricos sem expiração automática;
- escopo congelado após aprovação.

Conclusão esperada após testes e ressalvas documentadas:

**SISTEMA APROVADO PARA OPERAÇÃO CONTROLADA.**

Limitações: serviços externos podem falhar; ambiente local não reproduz todo o
cgroup Linux da DigitalOcean; homologação não enviou mensagem Meta real; mudanças
futuras de API/infra exigem nova avaliação e regressão proporcional.

## FIM DO PROMPT PARA RECONSTRUÇÃO
