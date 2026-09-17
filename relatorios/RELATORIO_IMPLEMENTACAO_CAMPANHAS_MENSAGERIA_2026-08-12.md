# Relatório da implementação — Campanhas, Lotes e Mensageria — 12-08-2026

Este documento registra exclusivamente a implementação dos módulos de campanhas,
lotes e mensageria do **ACORDA RJ**.

Implementação original validada em: **8 de agosto de 2026**.
Integração com a WhatsApp Cloud API atualizada e validada localmente em: **12 de agosto de 2026**.

## 1. Resultado da implementação

O sistema passou a possuir um fluxo próprio para:

1. criar campanhas livres e independentes;
2. selecionar um template;
3. preservar o snapshot dos filtros utilizados;
4. calcular público encontrado, apto e não apto;
5. reservar contatos em lotes;
6. impedir duplicidade dentro da mesma campanha;
7. controlar capacidade em uma janela móvel de 24 horas;
8. criar tentativas vinculadas às participações;
9. registrar estados técnicos e seu histórico;
10. registrar falhas e reprocessá-las sem apagar a tentativa anterior;
11. receber eventos oficiais por webhook autenticado.

A arquitetura agora suporta envio real pela Graph API oficial exclusivamente quando as
credenciais de produção estiverem configuradas. Os testes usam provider simulado e não
realizam qualquer envio externo.

## 2. Banco de dados

### 2.1 Migrations criadas

- `backend/database/migrations/006_criar_campanhas_lotes_mensageria.sql`
- `backend/database/migrations/007_adicionar_triggers_campanhas.sql`
- `backend/database/migrations/009_integrar_meta_cloud_api.sql`

A migration `006` cria a estrutura principal. A migration `007` adiciona os
triggers de atualização de data em uma migration incremental, preservando o
checksum da migration `006` que já havia sido executada.

As duas migrations foram aplicadas no banco local `criar_banco`. Uma segunda
execução do runner confirmou que não existiam migrations pendentes e que nenhum
script foi reaplicado.

### 2.2 Alterações na tabela `campanhas`

A tabela existente foi preservada e recebeu:

- `finalidade`;
- `modelo_id`;
- `filtros_snapshot` em JSONB;
- `status`;
- `responsavel_usuario_id`;
- datas de prontidão, ativação, pausa, conclusão e cancelamento.

Foram adicionadas constraints de status e relacionamentos com templates e
usuários. Campanhas antigas foram compatibilizadas sem apagar seus registros.

Estados aceitos:

- `rascunho`;
- `pronta`;
- `ativa`;
- `pausada`;
- `concluida`;
- `cancelada`.

### 2.3 Novas tabelas

#### `campanha_lotes`

Registra campanha, quantidade solicitada, quantidade efetiva, ordem, status,
chave de idempotência, criador e datas.

Proteções principais:

- ordem única dentro da campanha;
- chave de idempotência única dentro da campanha;
- tamanhos válidos;
- estados de lote controlados por constraint.

#### `campanha_participacoes`

Representa o vínculo único entre um contato e uma campanha, preservando o lote
original.

A constraint `UNIQUE (campanha_id, contato_id)` impede que o mesmo contato seja
reservado duas vezes na mesma campanha. O mesmo contato continua podendo
participar de campanhas diferentes.

#### `campanha_tentativas`

Registra cada tentativa técnica de uma participação, incluindo número da
tentativa, status, identificador externo e erro sanitizado.

Proteções principais:

- número da tentativa único por participação;
- identificador externo único;
- status controlado por constraint.

#### `historico_status_mensageria`

Armazena histórico imutável das transições, contendo estado anterior, novo
estado, origem, tentativa, erro sanitizado e data.

#### `configuracoes_sistema`

Armazena configurações operacionais. Foi criado o valor inicial:

```text
limite_mensagens_24h = 250
```

O limite não está fixado diretamente na regra de negócio.

#### `historico_configuracoes_sistema`

Audita alterações de configuração com valor anterior, novo valor, usuário,
motivo e data.

#### `eventos_webhook_mensageria`

Registra somente identificadores normalizados dos eventos processados para
garantir idempotência. O payload bruto não é armazenado.

### 2.4 Índices e triggers

Foram adicionados índices para:

- campanhas por status e data;
- lotes por campanha;
- participações por lote, campanha, status e data de reserva;
- tentativas por status e data;
- histórico por participação e data.

Triggers atualizam `atualizado_em` nas tabelas de lotes e participações.

### 2.5 Estrutura final

O arquivo `backend/database/criar_banco.sql` foi atualizado para representar o
estado atual do banco, incluindo:

- 30 tabelas;
- constraints;
- relacionamentos;
- índices;
- triggers;
- configuração inicial do limite;
- ledger das migrations.

As tabelas históricas `numeros_whatsapp`, `comunicacoes` e
`historico_comunicacoes` foram preservadas. Elas não integram o novo fluxo
operacional, mas seus dados históricos não foram apagados.

## 3. Backend

### 3.1 Módulo de campanhas

Criado em `backend/src/modules/campanhas/`:

- `campanhaController.js`;
- `campanhaService.js`;
- `campanhaModel.js`;
- `campanhaRoutes.js`.

Responsabilidades implementadas:

- criação, listagem e atualização de campanhas;
- controle dos estados da campanha;
- criação e edição de templates;
- cálculo do público e métricas agregadas;
- criação e consulta de lotes;
- consulta das falhas atuais;
- consulta e alteração administrativa do limite;
- auditoria da alteração do limite;
- bloqueio da alteração de segmentação depois de existirem reservas.

Os filtros não foram reimplementados em paralelo. O módulo reutiliza a
preparação e a construção canônica de filtros do módulo de contatos. Foram
incluídas nessa estrutura compartilhada as regras de cadastro incompleto.

### 3.2 Reserva atômica e concorrência

A reserva de lotes utiliza:

- transação PostgreSQL;
- advisory lock transacional;
- bloqueio de linhas com `FOR UPDATE ... SKIP LOCKED`;
- constraints de unicidade;
- chave de idempotência.

Com isso:

- lotes seguintes não repetem contatos da mesma campanha;
- clique duplo com a mesma chave retorna o mesmo lote;
- duas operações concorrentes não duplicam a reserva;
- uma falha durante a reserva provoca rollback;
- ultrapassar o limite móvel falha integralmente, sem reserva parcial;
- solicitar 250 com apenas 100 contatos disponíveis cria um lote efetivo de 100.

### 3.3 Público apto

O cálculo usa a mesma semântica para prévia, contagem e reserva. São respeitados
os filtros atualmente suportados, como nome, bairro, problema, evento,
consentimentos e cadastro incompleto.

O módulo não concede nem modifica consentimentos. Um consentimento apenas não
informado não torna universalmente o contato inapto. Contatos explicitamente
bloqueados para mensagens ou com exclusão pendente não entram no público apto.

### 3.4 Limite móvel de 24 horas

O cálculo de capacidade está centralizado no serviço de campanhas e consulta o
valor armazenado no banco.

- valor inicial: 250;
- administrador consulta e altera;
- operador somente consulta;
- alteração exige motivo;
- valor anterior, novo valor, responsável e data ficam auditados;
- o relógio pode ser substituído nos testes para validar janelas distintas.

### 3.5 Módulo de mensageria

Criado em `backend/src/modules/mensageria/`:

- `mensageriaController.js`;
- `mensageriaService.js`;
- `mensageriaModel.js`;
- `mensageriaRoutes.js`;
- `webhookController.js`;
- `webhookRoutes.js`.

Contratos internos preparados:

- preparar um futuro envio sem realizá-lo;
- receber identificador externo;
- atualizar status de entrega;
- processar webhook;
- reprocessar falhas.

Status técnicos:

- `pendente`;
- `enviando`;
- `enviada`;
- `entregue`;
- `lida`;
- `falhou`.

Eventos repetidos, atrasados ou incompatíveis são tratados sem regressão
indevida do estado. Todas as alterações válidas criam histórico.

### 3.6 Falha e reprocessamento

O reprocessamento:

- mantém a mesma participação;
- mantém o mesmo lote original;
- cria uma nova tentativa numerada;
- preserva a tentativa e o erro anteriores;
- registra a transição no histórico;
- impede que uma tentativa antiga já reprocessada seja processada novamente.

O erro externo `130497` foi simulado. Ele é armazenado de forma sanitizada e não
é presumido automaticamente como recuperável.

### 3.7 Webhook preparado

Rotas públicas:

```text
GET  /api/webhooks/whatsapp
POST /api/webhooks/whatsapp
```

O `GET` valida `hub.mode`, `hub.verify_token` e devolve `hub.challenge` quando o
token é válido. Uma verificação inválida retorna HTTP 403.

O `POST`:

- recebe corpo bruto limitado a 256 KB;
- calcula HMAC SHA-256 sobre os bytes exatos recebidos;
- utiliza comparação segura com `timingSafeEqual`;
- valida uma estrutura mínima do JSON;
- normaliza eventos de `sent`, `delivered`, `read`, `failed` e mensagens
  recebidas;
- garante idempotência por identificador externo;
- não persiste payload bruto;
- não registra telefone completo, token, segredo ou assinatura.

O parser de corpo bruto está restrito à rota do webhook e é registrado antes do
parser JSON global, sem alterar as demais rotas.

### 3.8 Rotas administrativas criadas

| Método | Rota | Permissão/finalidade |
|---|---|---|
| GET | `/api/admin/campanhas` | operador e administrador |
| POST | `/api/admin/campanhas` | administrador |
| PUT | `/api/admin/campanhas/:id` | administrador, antes de reservas |
| POST | `/api/admin/campanhas/:id/status` | administrador |
| GET | `/api/admin/campanhas/:id/publico` | operador e administrador |
| GET | `/api/admin/campanhas/:id/lotes` | operador e administrador |
| POST | `/api/admin/campanhas/:id/lotes` | operador e administrador |
| GET | `/api/admin/campanhas/:id/falhas` | operador e administrador |
| GET | `/api/admin/campanhas/templates` | operador e administrador |
| POST | `/api/admin/campanhas/templates` | administrador |
| PUT | `/api/admin/campanhas/templates/:id` | administrador |
| GET | `/api/admin/campanhas/configuracao/limite` | operador e administrador |
| PUT | `/api/admin/campanhas/configuracao/limite` | administrador, exige motivo |
| POST | `/api/admin/campanhas/configuracao/limite/sincronizar-meta` | administrador; consulta oficial da Meta |
| POST | `/api/admin/mensageria/tentativas/:id/reprocessar` | usuário autenticado |
| POST | `/api/admin/mensageria/tentativas/:id/enviar` | usuário autenticado; envio oficial controlado |

### 3.9 Remoção do fluxo manual antigo

Foram removidos do backend:

- `backend/src/modules/comunicacoes/comunicacaoController.js`;
- `backend/src/modules/comunicacoes/comunicacaoService.js`;
- `backend/src/modules/comunicacoes/comunicacaoModel.js`;
- `backend/src/modules/comunicacoes/comunicacaoRoutes.js`;
- `backend/scripts/testarComunicacoes.js`;
- montagem da rota `/api/admin/comunicacoes`.

Os dados e as tabelas históricas foram preservados.

## 4. Frontend

### 4.1 Nova página administrativa

Criado:

- `frontend/src/pages/CampanhasAdministrativas.jsx`;
- `frontend/src/services/campanhaService.js`.

O menu passou a exibir **Campanhas**, na rota:

```text
/admin/campanhas
```

Fluxo disponibilizado:

1. criar campanha;
2. selecionar template;
3. selecionar filtros existentes;
4. visualizar público encontrado, apto e não apto;
5. criar lote;
6. consultar lotes e quantidades efetivas;
7. acompanhar métricas técnicas;
8. consultar e reprocessar falhas atuais;
9. pausar, retomar, concluir ou cancelar conforme a permissão;
10. consultar capacidade disponível na janela móvel.

Filtros apresentados pela tela incluem bairro, problema, evento,
consentimento e cadastro incompleto.

O painel apresenta métricas vindas do banco, sem executar uma consulta separada
para cada campanha:

- público encontrado;
- público apto e não apto;
- reservado;
- pendente;
- enviado;
- entregue;
- lido;
- falhou;
- restante;
- lotes;
- capacidade disponível.

### 4.2 Templates

Administradores podem criar, editar e ativar ou desativar templates. Operadores
podem consultá-los para acompanhar as campanhas.

### 4.3 Remoções no frontend

Foram removidos:

- `frontend/src/pages/ComunicacoesAdministrativas.jsx`;
- `frontend/src/services/comunicacaoService.js`;
- rota `/admin/comunicacoes`;
- item antigo de mensagens no menu;
- botões de envio manual existentes na listagem e nos detalhes dos contatos.

O histórico antigo exibido nos detalhes do contato foi preservado porque contém
dados já existentes, mas ele não inicia novos atendimentos manuais.

## 5. Arquivos de suporte atualizados

- `backend/src/app.js`;
- `backend/src/modules/contatos/contatoModel.js`;
- `backend/src/modules/contatos/contatoService.js`;
- `backend/src/modules/teste/testeRoutes.js`;
- `backend/package.json`;
- `backend/database/criar_banco.sql`;
- `backend/scripts/testarEstruturaBanco.js`;
- `backend/scripts/testarSchemaVazio.js`;
- `backend/.env.example`;
- `frontend/src/App.jsx`;
- `frontend/src/components/CabecalhoAdministrativo.jsx`;
- `frontend/src/components/TabelaContatos.jsx`;
- `frontend/src/pages/DetalhesContato.jsx`;
- `backend/README.md`;
- `frontend/README.md`;
- `README_TECNICO.md`;
- `PROMPT_MESTRE.md`.

## 6. Testes executados

### 6.1 Sintaxe diretamente relacionada

Foi executado `node --check` nos arquivos alterados dos módulos de campanhas,
mensageria, contatos, aplicação e scripts de teste.

Resultado: **sem erros de sintaxe**.

### 6.2 Runner de migrations

Comando:

```bash
npm run banco:migrar
```

Resultado final:

```text
Banco atualizado. Nenhuma migration pendente.
```

Isso confirmou a idempotência do runner após a aplicação das migrations `006`
e `007`.

### 6.3 Estrutura do banco

Comando:

```bash
npm run testar:banco
```

Resultado:

```text
Estrutura atual, catálogo de bairros e integridade: 22 verificações aprovadas.
```

### 6.4 Campanhas, lotes e mensageria

Comando:

```bash
npm run testar:campanhas
```

Resultado:

```text
Campanhas, lotes e mensageria: 17 verificações aprovadas.
```

O teste persistiu e conferiu no PostgreSQL:

- criação de 600 contatos temporários;
- lote de 250 contatos;
- nova janela com outros 250;
- terceira janela solicitando 250 e reservando os 100 restantes;
- total de 600 participações e 600 contatos únicos;
- uso dos mesmos contatos em uma campanha diferente;
- ausência de duplicidade dentro da campanha;
- combinação de filtros por nome e problema;
- bloqueio integral ao ultrapassar o limite;
- inexistência de lote parcial após falha;
- clique duplo concorrente retornando o mesmo lote;
- fluxo `pendente → enviando → enviada → entregue → lida`;
- falha simulada com código `130497`;
- reprocessamento na mesma participação e no mesmo lote;
- preservação da primeira tentativa;
- bloqueio de alteração administrativa por operador;
- persistência da auditoria de alteração do limite.

Todos os contatos, campanhas, lotes, tentativas e registros temporários criados
por esse teste foram removidos ao final. O limite anterior foi restaurado.

### 6.5 Webhook

Comando:

```bash
npm run testar:webhook
```

Resultado:

```text
Webhook de mensageria: 6 verificações aprovadas.
```

Foram validados:

- GET com token fake válido e devolução do challenge;
- GET inválido retornando HTTP 403;
- POST com assinatura fake válida;
- repetição do mesmo evento sem duplicação;
- assinatura inválida retornando HTTP 403;
- corpo JSON malformado retornando HTTP 400.

Os identificadores fake utilizados foram removidos do banco após o teste.

### 6.6 Banco vazio

Comando:

```bash
npm run testar:schema-vazio
```

Resultado:

```text
Schema final validado em banco vazio: 30 tabelas e 166 bairros.
```

### 6.7 Build do frontend

Comando:

```bash
npm run build
```

Resultado:

```text
69 módulos transformados.
Build concluído com sucesso.
```

### 6.8 Validações finais

- `git diff --check`: aprovado;
- nenhuma referência operacional aos arquivos removidos foi encontrada;
- nenhuma campanha, participação ou contato temporário permaneceu no banco;
- as migrations `006` e `007` aparecem no ledger;
- nenhum segredo real foi adicionado ao repositório.

## 7. Variáveis de ambiente

Placeholders adicionados a `backend/.env.example`:

```env
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
META_APP_SECRET=
```

Os valores reais não foram configurados nem versionados.

## 8. Pendências intencionais

Permanecem para uma etapa futura:

- configurar credenciais reais da Meta;
- configurar e validar credenciais reais da WhatsApp Cloud API;
- executar o primeiro envio acompanhado em produção;
- mover processamento pesado para fila ou worker se o volume futuro exigir;
- configurar e validar o webhook em ambiente de produção.

Não foram realizados nesta implementação:

- chamadas à Graph API;
- envio ou simulação de mensagem real enviada;
- deploy;
- configuração da Meta;
- instalação de Redis, BullMQ, RabbitMQ ou SDK externo de mensageria;
- commit ou push automático.
