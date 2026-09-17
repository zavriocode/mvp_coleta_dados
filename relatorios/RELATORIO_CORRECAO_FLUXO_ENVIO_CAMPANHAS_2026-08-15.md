# Relatório — Correção e simplificação do envio de campanhas

**Projeto:** ACORDA RJ  
**Data:** 15 de agosto de 2026  
**Validação:** PostgreSQL temporário isolado, API local e provider Meta fake  
**Produção:** não acessada  
**Deploy, commit e push:** não realizados

## 1. Causa do erro de servidor

O erro observado nos logs era:

```text
column "atualizado_por_usuario_id" of relation "campanhas" does not exist
```

O `INSERT` da função `criar` em
`backend/src/modules/campanhas/campanhaModel.js` gravava corretamente o usuário
responsável pela última atualização, mas o banco publicado ainda não possuía a
coluna. Era uma divergência entre código e schema, não uma regra legítima de
capacidade nem um erro que deveria ser escondido no frontend.

A correção estrutural já existente no repositório é a migration
`014_garantir_auditoria_campanhas.sql`. Ela cria a coluna, preenche campanhas
anteriores, exige valor, adiciona chave estrangeira e índice. Nenhuma migration
nova foi criada ou alterada nesta tarefa.

O cenário equivalente foi repetido no schema atual pela API real local. A rota
preparou 500 tentativas e concluiu a transação sem erro 500. O teste também
confirmou a coluna e a versão `014` no ledger.

## 2. Novo fluxo do operador

O fluxo principal passou a ser:

```text
Campanha → conferir quanto pode enviar → Enviar agora → continuar depois
```

A tela mostra como indicadores principais:

- Aptos;
- Enviados;
- Restantes;
- Pode enviar agora.

O campo de quantidade recebe automaticamente o maior valor seguro informado
pelo backend. O operador pode escolher um valor menor, mas zero, negativo,
texto inválido ou quantidade acima do máximo são bloqueados no frontend e
revalidados pelo backend.

Antes de disparar mensagens, a interface confirma quantos contatos receberão o
envio. Durante o processamento, exibe progresso, enviados e falhas.

## 3. Conceitos retirados da interface principal

Foram retirados do fluxo principal os textos:

- Liberar criação de lotes;
- Próximo lote;
- Quantidade de contatos no próximo lote;
- Conferir esta quantidade;
- Criar lote para envio;
- Separados em lotes;
- Confirmar lote.

Os rótulos principais agora usam `Disponibilizar para envio`, `Próximo envio`,
`Enviar agora`, `Continuar envio` e `Histórico de envios`.

## 4. Cálculo de “Pode enviar agora”

O backend continua sendo a fonte de verdade. O cálculo considera:

- novos contatos restantes e ainda elegíveis;
- tentativas pendentes que podem ser retomadas;
- limite oficial Meta simulado no teste;
- proteção interna;
- consumo da janela móvel de 24 horas;
- capacidade operacional efetiva;
- reservas já existentes.

Para novas reservas, o valor é o menor entre contatos elegíveis restantes e
capacidade disponível. Tentativas pendentes dentro da janela podem ser retomadas
sem consumir uma segunda reserva. Tentativas antigas só podem ser retomadas até
o espaço disponível na nova janela.

## 5. Persistência e lotes internos

Depois de um envio parcial, os contatos ainda não reservados permanecem na mesma
campanha. Quando a capacidade retorna, o botão muda para `Continuar envio` e o
backend cria outra reserva interna de forma transparente.

A arquitetura permanece:

```text
campanha → lote/reserva → participação → tentativa → mensageria
```

Os lotes não foram removidos do banco nem do backend. Eles aparecem somente na
seção secundária `Histórico de envios`, com nomes operacionais como `Envio 1`.

## 6. Concorrência, idempotência e elegibilidade

Foram preservados:

- transações;
- advisory lock global e por campanha;
- `FOR UPDATE SKIP LOCKED`;
- chave de idempotência;
- constraints de participação única;
- trava imediatamente anterior ao provider;
- auditoria e histórico.

O frontend mantém a chave da preparação durante uma tentativa interrompida e
processa as chamadas de envio com concorrência controlada. Duplo clique e duas
preparações simultâneas retornaram as mesmas tentativas, sem segunda reserva.

A elegibilidade é consultada novamente em cada rodada e novamente antes do
provider. Um contato bloqueado entre duas rodadas não entrou em nova reserva nem
no payload fake.

## 7. Capacidade zero, finalização e falhas

Com capacidade zero, o backend retorna conflito controlado, não cria reserva e
não produz erro 500. A interface desabilita o envio e informa que os contatos
restantes continuam salvos na campanha.

Quando não restam contatos, a interface informa que todos os aptos já foram
processados, sem confundir esse estado com falta de capacidade.

Falhas de provider permanecem separadas de contatos ainda não enviados. A
tentativa anterior e o histórico são preservados; o reprocessamento cria uma
nova tentativa.

Encerrar e cancelar campanha agora apresentam confirmação explícita de que
novos envios não poderão ser iniciados.

## 8. Mobile e acessibilidade

Em até 760 px:

- os quatro indicadores usam grade de duas colunas;
- quantidade e botão principal ficam empilhados e ocupam toda a largura;
- não foi adicionada rolagem horizontal;
- o botão principal mantém prioridade visual;
- progresso usa `role="status"`, `aria-live="polite"` e elemento `progress`;
- controles preservam rótulos e estados `disabled`.

O build responsivo foi aprovado. O frontend local respondeu HTTP 200. O controle
automatizado do navegador não ficou disponível nesta sessão; portanto, não foi
registrado screenshot automatizado nem declarado teste visual por pixel.

## 9. Arquivos alterados

### Backend

- `backend/src/modules/campanhas/campanhaController.js`;
- `backend/src/modules/campanhas/campanhaModel.js`;
- `backend/src/modules/campanhas/campanhaRoutes.js`;
- `backend/src/modules/campanhas/campanhaService.js`;
- `backend/scripts/testarEnvioCampanhaSimplificado.js`;
- `backend/scripts/testarFluxoCampanhasMetaIsolado.js`.

### Frontend

- `frontend/src/pages/CampanhasAdministrativas.jsx`;
- `frontend/src/pages/AjudaAdministrativa.jsx`;
- `frontend/src/services/campanhaService.js`;
- `frontend/src/styles/administrativo.css`.

### Relatório

- `RELATORIO_CORRECAO_FLUXO_ENVIO_CAMPANHAS_2026-08-15.md`.

Nenhuma migration, tabela, template Meta, webhook, consentimento, importação,
evento, relatório, autenticação ou permissão foi alterado.

## 10. Testes locais

### Fluxo isolado Campanhas → Meta fake

```text
npm run testar:fluxo-campanhas-meta
```

Resultado:

```text
Escala, filtros e lotes: 26 verificações aprovadas.
Campanhas, lotes e mensageria: 27 verificações aprovadas.
Templates oficiais da Meta: 38 verificações aprovadas.
Integração Meta com mocks: 16 verificações aprovadas.
Webhook de mensageria: 16 verificações aprovadas.
Cenário E2E final de 2 contatos: 16 verificações aprovadas.
Envio simplificado de campanhas: 2.421 verificações aprovadas.
Fluxo isolado: 7 grupos aprovados.
```

O grupo novo cobriu os dez cenários obrigatórios:

1. 2.000 aptos, capacidade 500, 500 processados e 1.500 restantes;
2. continuidade da mesma campanha, total 1.000 e 1.000 restantes;
3. 200 restantes com capacidade 500, máximo seguro 200;
4. capacidade zero sem nova reserva e sem 500;
5. escolha parcial de 200;
6. tentativa de 501 rejeitada pelo backend;
7. duplo clique/concorrência sem duplicidade;
8. contato inelegível entre rodadas excluído da nova reserva;
9. falha fake, histórico preservado e reprocessamento;
10. fluxo HTTP real local atravessando rota, controller, service, model,
    transação e schema atual, com a migration 014 conferida.

O banco temporário foi removido pelo orquestrador ao final.

### Schema

```text
npm run testar:schema-vazio
Schema final validado em banco vazio: 31 tabelas e 166 bairros.
```

### Build

```text
npm run build
71 módulos transformados; build concluído com sucesso.
```

### Outras verificações

- sintaxe dos arquivos backend alterados e do teste novo: aprovada;
- frontend local: HTTP 200;
- backend local de saúde: HTTP 200;
- busca dos termos antigos no fluxo principal: nenhum resultado;
- `git diff --check`: aprovado;
- nenhuma migration criada ou modificada.

## 11. Pendente de validação em ambiente real Meta

Permanece obrigatoriamente pendente:

- envio real;
- recebimento real no WhatsApp;
- external message ID real;
- `sent` real;
- `delivered` real;
- `read` real;
- webhook real;
- botão SAIR real;
- opt-out real;
- bloqueio posterior após opt-out real;
- comportamento da capacidade oficial Meta no fluxo real.

## 12. Segurança do teste

- nenhuma chamada real à Meta;
- nenhum envio real de WhatsApp;
- nenhum acesso ao banco de produção;
- nenhum deploy;
- nenhum commit;
- nenhum push;
- custo real zero.

## Conclusão

**CORREÇÃO LOCAL APROVADA PARA SEGUIR AO TESTE REAL CONTROLADO COM A META.**
