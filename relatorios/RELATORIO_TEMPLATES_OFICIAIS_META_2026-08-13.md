# Relatório — Gerenciamento de templates oficiais da Meta

**Projeto:** ACORDA RJ  
**Data:** 13 de agosto de 2026  
**Validação:** local, com mocks e sem envio real  
**Deploy:** não realizado

## 1. Arquitetura implementada

O módulo de campanhas passou a gerenciar templates oficiais da WABA nos dois
sentidos:

```text
ACORDA RJ -> validação backend -> Graph API -> persistência e auditoria
Meta -> consulta paginada -> normalização -> vínculo pelo ID oficial -> ACORDA RJ
```

A Meta permanece como fonte oficial para ID, nome, idioma, categoria, status e
componentes. O frontend não pode aprovar templates nem alterar status oficial.

## 2. Endpoints da Meta utilizados

Com a versão definida em `META_GRAPH_API_VERSION`:

```text
POST /{WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates
GET  /{WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates
POST /{WHATSAPP_PHONE_NUMBER_ID}/messages
```

O token permanece exclusivamente no backend.

## 3. Fluxo ACORDA RJ para Meta

1. O administrador cria e edita um rascunho interno.
2. O backend valida nome oficial, idioma, categoria, componentes, parâmetros e
   exemplos.
3. Ao submeter, uma trava transacional impede submissões concorrentes.
4. O backend confere antes se já existe um template oficial com o mesmo nome e
   idioma, evitando duplicidade após resposta incerta.
5. O payload oficial é enviado à Meta.
6. ID e status retornados são validados e persistidos com auditoria.
7. Um retorno `PENDING` aparece como enviado para análise, sem inferir aprovação.
8. Depois da submissão, a estrutura oficial não pode ser livremente editada no
   ACORDA RJ; apenas a configuração operacional de envio pode ser atualizada.

## 4. Fluxo Meta para ACORDA RJ

1. O administrador solicita a sincronização.
2. O backend consulta todas as páginas da API e valida cada registro.
3. O ID oficial é a identidade principal.
4. Um registro criado diretamente no WhatsApp Manager é importado com origem
   Meta e aparece no painel.
5. Registro legado sem ID só pode receber vínculo inicial quando nome oficial e
   idioma produzem uma correspondência única e não ambígua.
6. Sincronizações repetidas não criam duplicados nem histórico artificial.
7. Falha ou resposta inválida não apaga templates nem substitui o último estado
   oficial válido.

## 5. Estados

| Estado interno | Estado oficial | Uso em novos envios |
|---|---|---|
| Rascunho | ausente | bloqueado |
| Enviado para análise | `PENDING` | bloqueado |
| Aprovado pela Meta | `APPROVED` | permitido se as demais regras também forem atendidas |
| Rejeitado pela Meta | `REJECTED` | bloqueado |
| Indisponível | `DISABLED` ou estado não elegível | bloqueado |

A autorização definitiva continua no backend imediatamente antes do provider.
Se um template aprovado mudar para um estado não elegível, o histórico é
preservado e novas mensagens são bloqueadas.

## 6. Banco de dados

Migration incremental criada:

```text
013_gerenciar_templates_oficiais_meta.sql
```

Ela adiciona a `modelos_mensagem` os campos necessários para ID oficial,
componentes, status oficial, origem, submissão, sincronização e configuração de
envio. Também cria `historico_modelos_mensagem_meta` e índices/constraints de
integridade.

Nenhuma migration anterior foi alterada. O schema de banco vazio foi atualizado
para 31 tabelas. Após a correção incremental de compatibilidade das campanhas,
o ledger atual passou a possuir 15 migrations. A migration `015` permite que
templates e mudanças de status recebidos automaticamente pelo webhook oficial
sejam auditados sem atribuir a operação a um usuário humano inexistente.

As migrations `013`, `014` e `015` foram aplicadas somente no banco local. Uma
segunda execução do runner confirmou que não havia migration pendente.

O webhook oficial `message_template_status_update` atualiza os estados sem
depender do botão manual. Estados finais como `DELETED`, `DISABLED`, `FLAGGED`
e `PENDING_DELETION` são aplicados diretamente a templates já conhecidos a
partir do webhook assinado, pois o recurso removido pode não estar mais
consultável na Graph API. Eventos repetidos permanecem idempotentes e todas as
mudanças efetivas geram histórico com origem `webhook_meta`.

Como o webhook não reproduz alterações ocorridas antes da assinatura, o backend
também executa uma reconciliação oficial ao iniciar em produção e periodicamente.
O intervalo padrão é de 15 minutos. Registros ausentes da WABA atual são
preservados como `NOT_FOUND` para auditoria e deixam de aparecer na lista
operacional.

## 7. Componentes suportados

- `BODY`, com parâmetros sequenciais e exemplos;
- `HEADER` de texto;
- `HEADER` com imagem;
- `FOOTER`;
- `BUTTONS`;
- `QUICK_REPLY` com declaração explícita de opt-out;
- CTA de URL estática ou dinâmica;
- CTA de telefone;
- valores fixos ou nome do contato para parâmetros compatíveis.

Combinações não suportadas são recusadas antes da chamada externa. Uma resposta
rápida sincronizada não é tratada silenciosamente como opt-out: o administrador
precisa declarar essa finalidade. O identificador configurado em
`WHATSAPP_OPTOUT_BUTTON_ID` foi preservado.

## 8. Provider e segurança

- timeout e erro sanitizado;
- resposta estruturalmente validada;
- paginação com limite seguro e detecção de cursor repetido;
- nenhum token ou payload bruto persistido;
- travas e unicidade contra duplicidade;
- somente administradores criam, alteram, submetem e sincronizam;
- templates com imagem, parâmetros ou botões precisam ter configuração completa
  antes de qualquer chamada de envio;
- somente `APPROVED` alcança o provider;
- nenhum envio real foi executado nesta implementação.

## 9. Frontend

A área de templates em Campanhas agora permite:

- visualizar origem, idioma, categoria, estado e última sincronização;
- criar e editar rascunho;
- montar cabeçalho, corpo, rodapé e botão;
- informar exemplos obrigatórios;
- configurar imagem e parâmetros usados no envio;
- enviar para análise da Meta;
- sincronizar templates oficiais;
- entender que submissão não envia mensagens e que aprovação depende da Meta.

IDs técnicos, JSON bruto e credenciais não são mostrados.

## 10. Templates legados

Nenhum registro foi excluído ou inativado automaticamente. No banco local
inspecionado não existe atualmente um template chamado `Saudação`. Os dois
templates legados existentes foram preservados; um deles possui referência de
campanha. Uma sincronização só poderá vinculá-los por correspondência inicial
única e controlada.

## 11. Arquivos relevantes

- `backend/database/migrations/013_gerenciar_templates_oficiais_meta.sql`;
- `backend/database/criar_banco.sql`;
- `backend/src/modules/campanhas/templateMetaService.js`;
- `backend/src/modules/campanhas/campanhaModel.js`;
- `backend/src/modules/campanhas/campanhaService.js`;
- `backend/src/modules/campanhas/campanhaController.js`;
- `backend/src/modules/campanhas/campanhaRoutes.js`;
- `backend/src/modules/mensageria/metaCloudApiProvider.js`;
- `backend/src/modules/mensageria/mensageriaModel.js`;
- `backend/src/modules/mensageria/mensageriaService.js`;
- `backend/scripts/testarTemplatesMeta.js`;
- `frontend/src/pages/CampanhasAdministrativas.jsx`;
- `frontend/src/services/campanhaService.js`;
- `frontend/src/styles/administrativo.css`;
- READMEs e `PROMPT_MESTRE.md`.

## 12. Testes

```text
Templates oficiais da Meta: 33 verificações aprovadas.
Integração Meta com mocks: 16 verificações aprovadas.
Campanhas, lotes e mensageria: 27 verificações aprovadas.
Webhook de mensageria: 16 verificações aprovadas.
Schema vazio: 31 tabelas e 166 bairros.
Frontend: 70 módulos, build aprovado.
Migration runner: nenhuma migration pendente na segunda execução.
git diff --check: aprovado.
```

Os cenários cobriram submissão válida, ID, `PENDING`, `APPROVED`, `REJECTED`,
`DISABLED`, imagem, botões, quick reply, CTA, parâmetros, template externo,
paginação, sincronização repetida, concorrência, timeout, token inválido,
resposta malformada e bloqueio de envio incompleto/não aprovado.
Também foram validados atualização automática, importação automática de
template novo, exclusão sem consulta complementar e repetição idempotente do
evento oficial.

## 13. Resultado e pendências

### VALIDADO LOCALMENTE/MOCK

- fluxos de criação, submissão, sincronização e envio preparado;
- persistência, estados, auditoria, concorrência e idempotência;
- integração com campanhas/mensageria;
- migration, schema vazio e frontend.

### AINDA EXIGE VALIDAÇÃO REAL/PRODUÇÃO

- aplicar as migrations pendentes, inclusive a `015`, no banco de produção pelo
  runner normal;
- confirmar no painel da Meta que o webhook está inscrito no campo
  `message_template_status_update`;
- confirmar permissões reais do token sobre a WABA;
- sincronizar a lista real de templates;
- submeter um template de homologação e observar a análise da Meta;
- validar mídia real e callbacks oficiais após o deploy.

Não foi feito deploy, não houve acesso à produção e nenhuma mensagem foi enviada.
