# Relatório — QA final E2E de jornadas reais multifluxo

**Projeto:** ACORDA RJ  
**Data:** 13 de agosto de 2026  
**Resultado:** **GO E2E PARA DEPLOY**  
**Ambiente:** banco PostgreSQL temporário e isolado, APIs locais e Meta mock  
**Produção:** não acessada  
**WhatsApp real:** nenhum envio realizado

## 1. Resultado

As jornadas foram executadas em sequência sobre um banco criado exclusivamente
para o QA. O schema final foi aplicado, um administrador QA fictício foi criado
e cada grupo de testes utilizou pessoas, telefones e e-mails fictícios
identificáveis.

Depois de cada jornada, os testes conferiram respostas HTTP, banco, histórico,
consentimentos, bloqueios, filtros, eventos, campanhas, lotes, participações,
tentativas e auditoria conforme o fluxo envolvido.

No encerramento foram confirmados:

- 30 tabelas;
- 166 bairros ativos;
- 12 migrations no ledger;
- nenhum contato, usuário, evento ou campanha QA residual;
- remoção do banco temporário completo.

## 2. Jornadas

| Jornada | Resultado | Estado final esperado | Problema encontrado | Correção |
|---|---|---|---|---|
| A — cadastro manual | Aprovada | Contato único, normalizado, editável, com histórico e sem consentimento inventado | Nenhum | Não necessária |
| B — formulário público | Aprovada | Contato único, aceite e respostas exatas, origem e dados coerentes | Nenhum | Não necessária |
| C — contato existente retorna | Aprovada | Sem duplicação; somente atualização permitida; histórico e eventos preservados | Nenhum | Não necessária |
| D — CSV | Aprovada | Novos, existentes, repetidos e inválidos classificados sem duplicação | Nenhum | Não necessária |
| E — XLSX | Aprovada | Parser, normalização, complementação permitida e relatório coerentes | Nenhum | Não necessária |
| F — reimportação | Aprovada | Bloqueio, consentimento, histórico e relacionamentos preservados | Nenhum | Não necessária |
| G — múltiplos eventos | Aprovada | Um contato, vínculos distintos e filtros por evento corretos | Nenhum | Não necessária |
| H — consentimentos | Aprovada | Não informado elegível; autorizado reconhecido; recusado, revogado e bloqueado impedidos | Nenhum nesta rodada | Correção já realizada na auditoria anterior confirmada |
| I — exclusão | Aprovada | Pendente bloqueia; rejeição restaura estado exato; aprovação remove o contato | Nenhum nesta rodada | Correção já realizada na auditoria anterior confirmada |
| J — campanha completa | Aprovada | Encontrado/apto/não apto coerentes; lote e participação únicos | Nenhum | Não necessária |
| K — mensageria Meta mock | Aprovada | Tentativa correta, external ID, sequência de status, falha e reprocessamento preservados | Nenhum | Não necessária |
| L — opt-out | Aprovada | Contato bloqueado, fora de novas reservas/envios e webhook repetido idempotente | Nenhum | Não necessária |
| M — limite Meta | Aprovada | Menor valor entre Meta e proteção interna, com atualização manual/automática | Nenhum | Não necessária |
| N — concorrência | Aprovada | Sem dupla reserva, lote, participação ou consumo acima da capacidade | Nenhum | Não necessária |
| O — permissões | Aprovada | Administrador autorizado; operador recusado pelo backend sem persistência indevida | Nenhum | Não necessária |

## 3. Bugs encontrados

Nenhum bug novo foi encontrado durante esta rodada E2E.

As correções da auditoria imediatamente anterior foram retestadas dentro das
jornadas reais:

- consentimento não informado permanece elegível;
- recusa ou revogação expressa impede reserva e envio;
- a barreira imediatamente anterior ao provider Meta impede bypass;
- rejeitar exclusão não transforma ausência de resposta em recusa;
- JWT com algoritmo diferente de HS256 é rejeitado.

## 4. Integração entre camadas

### Frontend

- o formulário envia separadamente aceite de privacidade, mensagens e ligações;
- caixas opcionais permanecem desmarcadas por padrão;
- listagem e detalhes distinguem autorizado, recusado, revogado e não informado;
- eventos, QR Code, participantes, filtros e campanhas consomem as rotas reais;
- o painel apresenta público encontrado, apto e não apto e telefones mascarados;
- o build confirmou que os contratos atuais continuam compilando juntos.

### Backend e banco

- API e banco permaneceram coerentes em cadastro, edição, reentrada,
  importação, eventos, exclusão e campanhas;
- os filtros utilizados na prévia também governaram a reserva;
- constraints e locks impediram duplicidade e excesso de capacidade;
- históricos corresponderam aos estados finais persistidos;
- reimportações não criaram consentimento nem removeram opt-out.

### Meta mock

- nenhuma chamada real foi executada;
- provider fake recebeu somente tentativas elegíveis;
- external message ID foi associado à tentativa correta;
- `sent`, `delivered`, `read` e `failed` atualizaram tentativa e histórico;
- reprocessamento criou nova tentativa sem destruir a anterior;
- `business_capability_update` atualizou somente o limite oficial.

## 5. Personas fictícias

| Persona QA | Entrada | Estado final validado |
|---|---|---|
| A | Cadastro manual | Contato único, normalizado, editado com histórico |
| B | Formulário público | Aceite registrado e autorizações conforme seleção |
| C | CSV | Criado ou complementado conforme os campos permitidos |
| D | XLSX | Criado sem duplicar telefone em formato equivalente |
| E | Retorno pelo formulário | Mesmo contato, novo evento e alterações auditadas |
| F | Recusa | Inelegível para reserva e bloqueado antes do provider |
| G | Dois eventos | Um contato com dois vínculos independentes |
| H | Exclusão | Bloqueado enquanto pendente; restauração/retenção coerente após decisão |
| I | Opt-out mock | Revogado/bloqueado, fora de campanha e preservado na reimportação |

Os registros foram removidos pelos próprios testes. A matriz final não encontrou
contradição entre origem, contato, eventos, consentimento, bloqueio, campanha,
participação e tentativa.

## 6. Testes executados

### Orquestrador E2E isolado

```text
npm run testar:e2e
```

Resultado:

```text
15 grupos de jornadas aprovados.
Coerência final: 30 tabelas, 166 bairros, 12 migrations e zero dados QA residuais.
```

O comando executou, no banco temporário:

- `testarCadastroManual.js`;
- `testarCadastroPublico.js`;
- `testarImportacoes.js`;
- `testarImportacaoCarga.js` — 15.000 contatos;
- `testarEventosExclusoes.js`;
- `testarPrivacidadeAdministrativa.js`;
- `testarCampanhas.js`;
- `testarIntegracaoMeta.js`;
- `testarWebhookMensageria.js`;
- `testarSincronizacaoLimiteMeta.js`;
- `testarSegurancaUsuarios.js`;
- `testarAdministracao.js`;
- `testarRelatorios.js`;
- `testarBackups.js`;
- `testarResiliencia.js`.

### Frontend

```text
npm run build
```

Resultado:

```text
70 módulos transformados; build concluído com sucesso.
```

### Sintaxe

```text
node --check scripts/testarJornadasE2E.js
```

Resultado: aprovado.

## 7. Arquivos criados ou alterados nesta etapa

- `backend/scripts/testarJornadasE2E.js`;
- `backend/package.json`;
- `RELATORIO_QA_E2E_JORNADAS_2026-08-13.md`.

Nenhuma regra de negócio, migration, tabela ou arquivo frontend foi alterado
nesta etapa.

## 8. Pendências externas

Não puderam ser declarados como validados nesta rodada:

- deploy e smoke test nos domínios publicados;
- credenciais e permissões efetivas da conta Meta de produção;
- aprovação e comportamento do template real no WhatsApp;
- entrega real a um aparelho;
- webhook recebido diretamente da infraestrutura da Meta;
- backup e restauração do banco de produção.

Esses itens dependem de produção ou da Meta e não foram simulados como se fossem
validação real.

## 9. Decisão

**GO E2E PARA DEPLOY**

O sistema apresentou coerência entre frontend, backend, banco, módulos e Meta
mock nas jornadas executadas. Não houve acesso à produção, deploy ou envio real.
