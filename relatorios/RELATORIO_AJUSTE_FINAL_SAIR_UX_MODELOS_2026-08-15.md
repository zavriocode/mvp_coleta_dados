# Relatório — Ajuste final do SAIR e UX dos modelos

**Projeto:** ACORDA RJ  
**Data:** 15 de agosto de 2026  
**Validação:** PostgreSQL temporário isolado, provider Meta fake e frontend em Edge real  
**Produção, deploy, commit e push:** não realizados

## 1. Causa do SAIR não funcionar

A edição de um modelo sincronizado lia e configurava somente o primeiro botão
oficial (`buttons[0]`). No modelo real, esse botão é a URL. O QUICK_REPLY SAIR
está no segundo botão e nunca era salvo em `meta_configuracao_envio`; por isso o
provider enviava apenas HEADER e BODY e a Meta não tinha um clique de resposta
rápida para entregar ao webhook.

## 2. Botões oficiais

Os componentes equivalentes ao modelo real foram validados sem assumir índice:

- índice `0`, tipo `URL`, texto **Quero Participar!**;
- índice `1`, tipo `QUICK_REPLY`, texto **SAIR**.

A interface agora percorre todos os botões oficiais e permite associar
explicitamente somente um QUICK_REPLY à ação SAIR. Outros QUICK_REPLY não são
convertidos automaticamente em opt-out.

## 3. Payload do QUICK_REPLY

Com o botão do índice 1 associado a SAIR, o provider fake recebeu:

```text
type: button
sub_type: quick_reply
index: "1"
parameters[0].type: payload
parameters[0].payload: valor de WHATSAPP_OPTOUT_BUTTON_ID
```

O teste conferiu a estrutura `header=1`, `body=1` com `parameter_name=nome` e
`button quick_reply=1`. O identificador não foi hardcodado no provider.

## 4. Comportamento do webhook

O webhook continua reconhecendo o payload configurado e processando tudo em uma
transação. O clique em SAIR agora:

- revoga mensagens e ligações;
- ativa os bloqueios de mensagens e ligações;
- registra canal WhatsApp, origem Meta, data/hora e motivo;
- preserva o contato e seus históricos.

O motivo registrado é:

```text
Consentimentos revogados pela própria pessoa através do botão SAIR no WhatsApp.
```

## 5. Revogação e inelegibilidade

São criados estados ativos `revogado` para os consentimentos de `mensagens` e
`ligacoes`, usando as estruturas já existentes. Os campos
`bloqueado_para_mensagens` e `bloqueado_para_ligacoes` passam a `TRUE`.

As barreiras existentes de campanhas e imediatamente anterior ao provider usam
o bloqueio/recusa de mensagens. O teste confirmou que o contato não entra em
nova reserva e que uma tentativa já reservada antes do clique é recusada antes
do provider.

## 6. Idempotência

O identificador externo do webhook continua protegido pela constraint e pelo
`ON CONFLICT DO NOTHING`. O segundo callback idêntico retornou
`evento_repetido`, manteve os dois bloqueios e não criou outro histórico de
opt-out.

## 7. Tela do contato

O endpoint de detalhes passou a derivar os resumos de autorização a partir dos
consentimentos ativos já retornados pela consulta. Após nova leitura, a tela
mostra para os dois canais:

```text
Não autorizado / bloqueado
```

Os registros de consentimento mostram mensagens e ligações como `revogado`, com
motivo e data/hora.

## 8. Simplificação da configuração do modelo

Para modelo externo aprovado, a tela agora mostra somente o fluxo operacional:

- Modelo oficial — Aprovado pela Meta;
- Imagem da mensagem;
- Personalização, como `{{nome}} → Nome da pessoa`;
- botões com seus textos oficiais e explicações;
- prévia da mensagem;
- Salvar informações de envio.

QUICK_REPLY, payload, `parameter_name`, Media ID, `header_handle`, Graph API e
dados de submissão não aparecem para o operador. A criação de rascunhos internos
permaneceu no fluxo anterior.

## 9. Imagem já configurada

Media ID persistido aparece como **Configurada ✓**, sem tentar inventar uma URL
temporária. A interface oferece **Trocar** pelo dispositivo ou por URL HTTPS e
**Remover imagem**. A prévia mantém o estado amigável **Imagem configurada para
envio** quando não existe uma URL pública visualizável.

## 10. Arquivos alterados

### Backend

- `backend/src/modules/mensageria/mensageriaModel.js`;
- `backend/src/modules/contatos/contatoService.js`;
- `backend/scripts/testarCenarioFinalCampanhaMeta.js`.

### Frontend

- `frontend/src/pages/CampanhasAdministrativas.jsx`;
- `frontend/src/pages/DetalhesContato.jsx`;
- `frontend/src/styles/administrativo.css`;
- `frontend/scripts/testarPreviaImagemRenderizada.js`.

### Relatório

- `RELATORIO_AJUSTE_FINAL_SAIR_UX_MODELOS_2026-08-15.md`.

Nenhuma migration, tabela ou constraint foi alterada.

## 11. Testes executados

```text
npm run testar:fluxo-campanhas-meta
14 grupos aprovados.

Cenário E2E final de 2 contatos: 18 verificações aprovadas.
Requisitos centralizados: 26 verificações aprovadas.
Parâmetros nomeados: 21 verificações aprovadas.
Retry HTTP BODY: 12 verificações aprovadas.
Templates oficiais: 38 verificações aprovadas.
Templates externos: 22 verificações aprovadas.
Integração Meta: 16 verificações aprovadas.
Webhook: 16 verificações aprovadas.
Envio simplificado: 2.421 verificações aprovadas.

npm run testar:previa-modelo
39 verificações aprovadas.

npm run testar:previa-imagem-renderizada
Imagem, URL/Media ID, SAIR no índice 1, reabertura, remoção, desktop e celular aprovados.
```

O teste visual inicialmente encontrou HTTP 503 no serviço artificial
`httpbin.org`; a fixture foi trocada por outra imagem HTTPS que respondia 200 e
o teste completo passou. O código de produção não foi alterado por essa
indisponibilidade externa.

## 12. Build e integridade

```text
npm run build
72 módulos transformados; build aprovado.

node --check
Arquivos backend alterados: aprovados.

git diff --check
Aprovado.
```

O PostgreSQL temporário foi encerrado e removido ao final.

## 13. Segurança e custo

- nenhuma chamada real à Meta;
- nenhuma mensagem real enviada;
- nenhum acesso ou escrita no banco de produção;
- nenhum token ou dado pessoal novo em logs;
- nenhum deploy, commit ou push;
- custo real zero.

## 14. Conclusão

**PRONTO PARA O TESTE REAL FINAL DO BOTÃO SAIR**, depois de publicar as alterações,
confirmar que o QUICK_REPLY oficial está associado à ação SAIR na tela e salvar
as informações de envio.
