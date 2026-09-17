# Relatório — Auditoria final de prontidão para produção

**Projeto:** ACORDA RJ

**Data:** 1º de setembro de 2026

**Código auditado:** commit `f6b294f718f5f88bcf9e4641a2c1f9162818ebef`

**Evidências:** PostgreSQL local e temporário, provider Meta fake, HTTP público e
consultas agregadas `READ ONLY` no PostgreSQL publicado

**Alterações no sistema, Meta, banco e produção:** não realizadas

## 1. Resultado executivo

Os fluxos funcionais e as barreiras técnicas principais foram aprovados. O
sistema preservou autenticação e autorização, isolamento lógico por contato,
filtros de campanhas, deduplicação, capacidade, idempotência, payloads de
template, estados oficiais da Meta, webhook, opt-out e restauração local.

A produção, porém, ainda possui dois riscos operacionais altos:

1. uma conta de teste ativa com perfil de administrador;
2. modelos de teste ou exemplo ativos, incluindo um segundo modelo `APPROVED`
   que não é o modelo oficial destinado à campanha.

Por isso, esta auditoria **não declara o ambiente apto para iniciar os cerca de
2.000 envios** enquanto esses dois itens não forem resolvidos e revalidados.
Nenhuma correção ou exclusão foi executada durante a auditoria.

## 2. Escopo e método

Foram auditados:

- controle de acesso, JWT, perfis e bloqueio de login;
- isolamento de contatos, consentimentos, históricos, relatórios e exportações;
- campanhas, filtros, público, lotes, capacidade e concorrência;
- templates, BODY `NAMED`, HEADER IMAGE, botões e opt-out;
- webhook, estados oficiais e idempotência;
- secrets, logs, CORS, rate limiting, headers, entradas e dependências;
- migrations, constraints, índices, duplicidades e prontidão do banco;
- backup, restauração e comportamento com volume de 2.000 envios.

Não foram usados token Meta, mensagem real, envio real, template real ou escrita
no banco publicado. As consultas de produção foram executadas em transação
`BEGIN READ ONLY`, finalizada com `ROLLBACK`, e retornaram somente agregados e
nomes técnicos.

Não foi aberta uma sessão administrativa autenticada em produção nem foram
consultados dois contatos reais. O isolamento foi validado no cenário integrado
local com dados artificiais e pela estrutura das consultas parametrizadas. Essa
distinção impede apresentar teste local como evidência de leitura de pessoas
reais.

## 3. Pontos aprovados

### 3.1 Acesso e permissões

- chamadas sem token e com token malformado retornaram `401` na API publicada;
- o backend autentica todas as rotas sob `/api/admin` e relê o usuário ativo no
  banco a cada requisição;
- gestão de usuários, exportações, backups, criação/configuração de templates,
  criação de campanhas e mudanças administrativas possuem proteção por perfil;
- os testes confirmaram `401` sem autenticação, `403` para operador em ações
  exclusivas, bloqueio de tentativas de login e invalidação de conta removida;
- própria conta e último administrador ativo permanecem protegidos pelas regras
  atuais;
- produção possui três administradores ativos, portanto não há risco de ausência
  total de administrador após a remoção controlada da conta de teste.

### 3.2 Isolamento de dados

- listagem, detalhe, filtros e paginação usam parâmetros SQL e IDs explícitos;
- relatórios e exportações aplicam o mesmo conjunto de filtros;
- o cenário integrado com dois contatos confirmou histórico, status e opt-out
  associados somente ao contato correto;
- variáveis de template foram resolvidas separadamente por contato no provider
  fake;
- a busca por interpolação SQL encontrou somente fragmentos internos fixos ou
  selecionados por listas permitidas, enquanto valores externos continuam
  parametrizados.

### 3.3 Campanhas e público

- contatos bloqueados, com consentimento recusado/revogado ou exclusão pendente
  são retirados dos aptos;
- a criação da campanha apenas persiste a configuração e não envia mensagens;
- `UNIQUE (campanha_id, contato_id)` impede repetir o contato dentro da mesma
  campanha;
- campanhas diferentes podem alcançar novamente o mesmo contato quando ele
  continua elegível, que é a regra atual do produto;
- filtros, reservas atômicas, chave de idempotência, locks e concorrência foram
  aprovados;
- o teste de escala criou 10.000 contatos artificiais, avançou em cinco lotes de
  2.000 sem duplicidade dentro da campanha e bloqueou estouro concorrente de
  capacidade;
- produção informou limite interno `2000`, último limite oficial `2000` e zero
  tentativas `pendente/enviando` paradas há mais de 30 minutos.

### 3.4 Meta, webhook e opt-out

- nenhum status é fabricado: `sent`, `delivered`, `read` e `failed` são
  processados a partir de `statuses[]`;
- a resposta a botão de template é tratada como mensagem recebida do tipo
  `button`; o opt-out depende do payload operacional configurado, e não do texto
  visível do botão;
- webhook repetido não duplica evento ou histórico;
- opt-out revoga mensagens e ligações, aplica os dois bloqueios, registra
  histórico e impede nova reserva e novo envio antes do provider;
- BODY nomeado, HEADER IMAGE, URL e resposta rápida foram aprovados em mocks;
- os contratos conferidos correspondem à coleção oficial da
  [WhatsApp Business Platform](https://www.postman.com/meta/whatsapp-business-platform/folder/tduohwq/webhook-payload-reference),
  inclusive [estados de mensagem](https://www.postman.com/meta/whatsapp-business-platform/request/rgtfq23/message-status-update-notifications)
  e [objeto de mensagens recebidas](https://www.postman.com/meta/whatsapp-business-platform/folder/1dtuocp/messages-object).

### 3.5 Segurança técnica

- `.env` de backend e frontend estão ignorados e nenhum `.env` está rastreado;
- a URI real anteriormente bloqueada pelo GitHub não está alcançável no
  histórico atual;
- os únicos exemplos de URI encontrados em commits alcançáveis usam host e
  credenciais locais fictícias;
- logs estruturais da Meta removem token, autorização e segredos;
- respostas `500` não devolvem stack ou diagnóstico interno;
- webhook valida `X-Hub-Signature-256` com `META_APP_SECRET`;
- JSON e uploads têm limites de tamanho;
- rate limiting global e específico do cadastro público, limite de concorrência,
  timeouts do PostgreSQL e pool limitado estão ativos;
- frontend publicado respondeu com CSP, HSTS, `nosniff`, `DENY` para frames e
  política de referenciador;
- API publicada respondeu com HSTS, CSP, `nosniff`, identificador de requisição,
  `no-store` e CORS fixado em `https://acorda-rj.vercel.app`;
- uma origem não autorizada recebeu cabeçalho para a origem oficial, portanto o
  navegador não a considera origem permitida;
- `npm audit` encontrou zero vulnerabilidades conhecidas tanto no backend quanto
  no frontend.

### 3.6 Banco de produção

- migrations `018` e `019` constam no ledger normal;
- zero constraints não validadas;
- zero índices inválidos;
- zero grupos de telefone canônico duplicado;
- zero contatos sem chave canônica de telefone;
- aviso ativo `aviso_privacidade_v4`;
- endpoint publicado de prontidão respondeu `200`.

### 3.7 Backup e restauração

- o fluxo administrativo local confirmou autorização exclusiva, geração SQL,
  conteúdo esperado, SHA-256, auditoria de sucesso e auditoria de falha;
- foi criado um backup completo local e restaurado em PostgreSQL temporário;
- a restauração encontrou 31 tabelas e preservou as contagens verificadas de
  usuários, contatos e consentimentos;
- o banco restaurado e os arquivos temporários foram removidos depois do teste;
- nenhum backup ou restauração foi executado em produção.

## 4. Riscos encontrados

### Alto — conta administrativa de teste ativa em produção

**Evidência:** usuário `test1`, ID técnico 7, ativo, perfil `administrador`.

**Impacto:** uma conta esquecida ou com credencial compartilhada possui todas as
permissões administrativas, inclusive usuários, campanhas, templates,
exportações e backups.

**Por que deve ser tratado antes dos envios:** viola diretamente o requisito de
não manter acessos de teste e amplia desnecessariamente a superfície de acesso a
dados pessoais e operações reais.

**Módulos relacionados:** `usuarios`, autenticação e
`frontend/src/pages/UsuariosAdministrativos.jsx`.

**Recomendação:** confirmar que a conta é realmente artificial, excluí-la pelo
fluxo administrativo já existente e testar que o login deixou de funcionar.
Não remover contas reais e manter pelo menos um administrador ativo.

### Alto — modelos de teste/exemplo ativos no ambiente real

**Evidência:** produção possui dez modelos ativos:

- dois `APPROVED`: `Hello World` e `Convite Pesquisa Acorda Rj`;
- seis modelos Meta `NOT_FOUND`, incluindo exemplos `Jaspers Market` e uma cópia
  de `Hello World`;
- dois rascunhos internos: `Saudação` e `teste2`.

**Impacto:** o modelo `Hello World` aprovado pode ser selecionado em uma campanha
real; os demais modelos aumentam a chance de escolha errada e poluem a operação.
O envio bloqueia modelos não aprovados, mas não distingue um modelo de exemplo
`APPROVED` do modelo oficial pretendido.

**Por que deve ser tratado antes dos envios:** uma campanha de 2.000 contatos
pode usar o template aprovado errado por erro operacional.

**Módulos relacionados:** `modelos_mensagem`, campanhas e
`frontend/src/pages/CampanhasAdministrativas.jsx`.

**Recomendação:** conferir individualmente os IDs e manter disponível para uso
somente `Convite Pesquisa Acorda Rj`, preservando integralmente seus componentes,
imagem, configuração, variáveis e botões. Não apagar nem alterar o template
oficial sem identificação inequívoca.

### Médio — cinco tabelas legadas permanecem no banco publicado

**Evidência:** produção possui 36 tabelas, enquanto o schema atual validado cria
31. As cinco tabelas adicionais são:

- `campanha_contatos`;
- `envios_campanha`;
- `eventos_manychat`;
- `respostas_campanha`;
- `sincronizacoes_manychat`.

O código atual não consulta essas tabelas. Os testes estruturais também verificam
que os gatilhos legados associados não estão ativos.

**Impacto:** não há evidência de quebra funcional, mas tabelas não utilizadas
podem conservar dados antigos fora dos fluxos atuais de exclusão, retenção e
auditoria.

**Recomendação:** antes de qualquer limpeza, levantar contagens, colunas, FKs e
origem dos registros em leitura. Remover somente após comprovar que são legado e
criar procedimento transacional específico; não executar `DROP` genérico.

### Médio — estratégia de recuperação de produção não foi comprovada ponta a ponta

**Evidência:** `backups_banco` possui zero backups concluídos e zero falhos. A
restauração foi comprovada somente no PostgreSQL local.

O PostgreSQL gerenciado da DigitalOcean oferece backups diários e recuperação
para um ponto no tempo, mas a disponibilidade concreta da ação **Restore from
backup** deste cluster não foi verificada nesta auditoria. A documentação atual
informa retenção de sete dias e restauração em novo cluster:
[DigitalOcean — Restore from backups](https://docs.digitalocean.com/products/databases/postgresql/how-to/restore-from-backups/).

**Impacto:** sem conferir o mecanismo gerenciado ou guardar um backup externo,
uma exclusão acidental pode ter recuperação operacional incerta. Se o componente
for uma **Dev Database**, a gravidade sobe para **alta**, pois esse produto não
possui backup integrado e não é recomendado para produção:
[DigitalOcean — backup de Dev Database](https://docs.digitalocean.com/support/how-do-i-back-up-my-dev-database-on-app-platform/).

**Recomendação:** antes do primeiro lote real, confirmar no painel que o banco é
Managed Database e que **Restore from backup** está disponível. Baixar também um
backup pelo painel do ACORDA RJ, verificar o SHA-256 e armazená-lo fora da App
Platform.

### Baixo — orquestrador E2E possui expectativa antiga de migrations

**Evidência:** todas as 16 jornadas do `testarJornadasE2E.js` foram aprovadas,
mas a verificação final ainda exige exatamente 17 migrations. O schema vigente
possui 19, então o comando termina com erro depois dos testes funcionais.

**Impacto:** não afeta a execução do produto, porém impede que o comando E2E
único seja usado como sinal verde automatizado da versão atual.

**Arquivo envolvido:** `backend/scripts/testarJornadasE2E.js`.

**Recomendação:** em uma tarefa futura autorizada, substituir a contagem fixa por
uma verificação coerente com o ledger atual. Nenhuma alteração foi feita nesta
auditoria.

### Baixo — mudança futura da semântica SSL do driver PostgreSQL

O driver atual emitiu aviso de que `sslmode=require`, `prefer` e `verify-ca`
mudarão de semântica em uma versão principal futura. A versão atual continua
funcionando e `npm audit` não encontrou vulnerabilidade.

**Recomendação:** antes de atualizar para `pg` 9, adotar explicitamente
`sslmode=verify-full` e validar a cadeia do certificado. A DigitalOcean passou a
suportar `verify-full` em 2026.

## 5. Testes executados

```text
Correções finais isoladas
11 grupos aprovados.

Administração
44 verificações aprovadas.

Cadastro público
43 verificações aprovadas.

Cadastro manual
30 verificações aprovadas.

Eventos, permissões e exclusões
59 verificações aprovadas.

Campanhas, lotes e mensageria
31 verificações aprovadas.

Segurança e usuários
Perfis, senhas, último administrador, permissões, auditoria e bloqueio aprovados.

Fluxo campanhas → Meta fake
15 grupos aprovados; envio simplificado com 2.421 verificações.

Escala
10.000 contatos artificiais e lotes de 2.000 aprovados.

Webhook
16 verificações aprovadas.

Cenário integrado de dois contatos
22 verificações aprovadas.

Frontend
Prévia: 60 verificações aprovadas.
Prévia renderizada desktop/mobile aprovada.

Banco local
25 verificações de estrutura, catálogo e integridade aprovadas.

Backup/restauração local
Backup criado, SHA-256 calculado e restauração temporária validada.

Dependências
Backend: 0 vulnerabilidades conhecidas.
Frontend: 0 vulnerabilidades conhecidas.

Build frontend
72 módulos transformados; aprovado.

node --check
119 arquivos JavaScript backend aprovados.

git diff --check
Aprovado; somente avisos de conversão LF/CRLF em relatórios preexistentes.
```

Os bancos e arquivos temporários da auditoria foram removidos. Permaneceram no
worktree somente as duas modificações de relatórios que já existiam antes desta
auditoria e este novo relatório.

## 6. Conclusão

Não foram encontrados defeitos críticos na lógica de envio, elegibilidade,
isolamento, idempotência, webhook ou integridade das migrations. A API publicada
está viva, pronta e protegida contra acesso sem token; a capacidade efetiva de
2.000 foi confirmada no banco publicado.

Entretanto, a conta administrativa de teste ativa e o modelo de exemplo
`APPROVED` impedem a liberação responsável do lote real. Também deve ser
confirmado o mecanismo de recuperação do banco e inventariado o conteúdo das
cinco tabelas legadas.

**RESULTADO: APROVAÇÃO CONDICIONAL. NÃO INICIAR OS 2.000 ENVIOS ATÉ REMOVER OU
JUSTIFICAR A CONTA `test1`, INDISPONIBILIZAR OS MODELOS DE TESTE E CONFIRMAR O
BACKUP RECUPERÁVEL DE PRODUÇÃO.**

Nenhuma chamada real à Meta foi feita. Nenhuma mensagem foi enviada. Nenhum
dado, usuário, template ou schema de produção foi alterado. Não houve deploy,
commit ou push.
