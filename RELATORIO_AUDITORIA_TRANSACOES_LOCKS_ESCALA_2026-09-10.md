# Relatório — Auditoria de transações, locks e consistência em escala

**Projeto:** ACORDA RJ  
**Data:** 10 de setembro de 2026  
**Escopo:** análise estática de Models, Services, schema e testes existentes  
**Alterações em código ou banco:** nenhuma

## 1. Conclusão executiva

O núcleo de reserva de público está bem protegido para campanhas com cerca de
2.000 contatos. A criação do lote, das participações, das tentativas e do
histórico ocorre em uma única transação; locks globais e por campanha
serializam as reservas; os contatos candidatos são bloqueados com
`FOR UPDATE ... SKIP LOCKED`; e constraints únicas impedem a repetição do mesmo
contato na mesma campanha e a repetição da mesma chave de idempotência.

O sistema, contudo, **não recebe aprovação irrestrita para o fluxo completo de
2.000 envios**. Há uma janela distribuída inevitável no desenho atual entre a
resposta do provider e a confirmação local do envio. Se o processo cair ou a
conexão ficar ambígua depois que a Meta aceitar a mensagem, mas antes de o
identificador externo ser persistido, a tentativa pode permanecer em
`enviando` ou ser registrada como falha sem que o sistema saiba com certeza se
a mensagem foi aceita. Uma nova tentativa nessa condição pode gerar duplicidade
real de mensagem.

Também existe uma corrida no webhook: o evento é marcado como processado antes
de a tentativa ser localizada. Se o status chegar antes da persistência do
identificador externo, ele é registrado como consumido, não encontra a tentativa
e uma repetição posterior é descartada pela idempotência.

Assim, a conclusão é:

- **reserva, deduplicação por campanha, capacidade e consistência relacional:**
  aprovadas para 2.000 contatos;
- **opt-out:** aprovado e atômico;
- **importação de 2.000 linhas:** aprovada com cautela operacional;
- **entrega ponta a ponta sob falha de processo/rede:** aprovada somente com
  ressalvas, sem garantia completa de recuperação automática.

## 2. Campanhas e envio

### 2.1 Criação e alteração de campanha

| Avaliação | Resultado |
|---|---|
| Aprovado? | **Aprovado com ressalva de concorrência de status** |
| Usa transação? | Sim na criação; atualização simples e mudança de status usam uma instrução atômica cada |
| Usa lock? | Não na criação nem na mudança comum de status |
| Risco | O Service consulta o status, valida a transição e depois o Model executa um `UPDATE` sem conferir o status anterior na cláusula `WHERE`. Duas mudanças simultâneas podem validar a partir do mesmo estado e a última gravação prevalecer. |
| Impacto | Uma campanha pode terminar em um estado que uma das requisições não poderia alcançar a partir do estado já gravado pela concorrente. Não duplica contatos, mas reduz a confiabilidade do controle administrativo. |
| Recomendação | Em trabalho futuro, condicionar o `UPDATE` ao status esperado ou bloquear a campanha e validar a transição dentro da mesma transação. |

A criação valida a existência e atividade do modelo e do usuário em uma
transação e possui FKs como última barreira. Não há lock nessas referências;
uma desativação concorrente pode ocorrer entre a leitura e o `INSERT`, pois a FK
garante existência, não atividade. O envio volta a validar o modelo aprovado e
ativo antes do provider, reduzindo o impacto operacional.

### 2.2 Cálculo e prévia do público

| Avaliação | Resultado |
|---|---|
| Aprovado? | **Aprovado para prévia informativa** |
| Usa transação? | Não |
| Usa lock? | Não |
| Risco | As contagens são consultas independentes e paralelas. Cadastro, opt-out, exclusão ou outra reserva podem alterar o público entre as consultas e antes do clique de envio. |
| Impacto | A prévia pode variar momentaneamente em relação ao lote efetivamente reservado. |
| Recomendação | Manter a prévia como estimativa e tratar a reserva transacional como resultado definitivo, como o sistema já faz. |

Os filtros salvos são reutilizados. A seleção de aptos exclui bloqueio para
mensagens, consentimento ativo recusado/revogado, pedido de exclusão pendente e,
na mesma campanha, qualquer contato que já possua participação. Contatos usados
em outra campanha continuam elegíveis quando atendem às regras, o que é o
comportamento atual intencional.

### 2.3 Reserva, lote, tentativas e histórico

| Avaliação | Resultado |
|---|---|
| Aprovado? | **Aprovado** |
| Usa transação? | Sim, uma única transação engloba lote, participações, tentativas, históricos e ativação da campanha |
| Usa lock? | Sim: advisory lock global de capacidade, advisory lock da campanha, campanha `FOR UPDATE`, configuração `FOR UPDATE` e contatos `FOR UPDATE ... SKIP LOCKED` |
| Risco | O lock global serializa reservas de todas as campanhas e pode causar espera sob concorrência elevada. O `lock_timeout` padrão é 5 segundos. |
| Impacto | Possível resposta de conflito/timeout em picos simultâneos; não há evidência de corrupção ou reserva duplicada. |
| Recomendação | Para a operação atual, enviar por uma campanha de cada vez e monitorar timeouts. Só rever a granularidade do lock após medição real. |

Dois processos não conseguem reservar o mesmo contato duas vezes na mesma
campanha. Além dos locks, existem as seguintes barreiras no banco:

- `UNIQUE (campanha_id, contato_id)` nas participações;
- `UNIQUE (campanha_id, chave_idempotencia)` nos lotes;
- `UNIQUE (participacao_id, numero_tentativa)` nas tentativas;
- `UNIQUE (identificador_externo)` para o identificador do provider.

Uma falha durante a montagem do lote executa `ROLLBACK`, portanto não deixa
lote, participação, tentativa ou histórico parciais.

O teste existente de envio simplificado cria 2.000 contatos, prepara lotes de
500, continua a mesma campanha, testa capacidade, duplo clique concorrente com
a mesma chave e confirma ausência de participação duplicada. Isso é boa
cobertura funcional, mas não equivale a benchmark de latência ou teste de caos.

### 2.4 Chamada ao provider e confirmação local

| Avaliação | Resultado |
|---|---|
| Aprovado? | **Aprovado com ressalva crítica de recuperação** |
| Usa transação? | Sim para iniciar; sim, separadamente, para confirmar sucesso ou registrar falha |
| Usa lock? | Sim na iniciação: lock por tentativa, lock global de capacidade e locks de campanha, contato, modelo e participação |
| Risco | A chamada HTTP ao provider ocorre entre duas transações. Uma queda após aceitação externa e antes da confirmação local deixa resultado ambíguo. Não foi identificado outbox, lease/timeout de `enviando` ou reconciliação automática dessas tentativas. |
| Impacto | Tentativa presa em `enviando`, status posterior não correlacionado ou mensagem duplicada após repetição manual. Em 2.000 chamadas, a exposição temporal a falha aumenta. |
| Recomendação | Antes de considerar o envio plenamente tolerante a falhas, implementar em tarefa própria uma estratégia de recuperação de `enviando` e reconciliação de respostas ambíguas, respeitando o contrato oficial da Meta. |

A barreira imediatamente anterior ao provider revalida bloqueio, consentimento,
pedido de exclusão, campanha ativa, template aprovado/configurado e capacidade.
O lock do contato serializa essa barreira com o opt-out. Duas chamadas para a
mesma tentativa não chegam juntas ao provider: apenas a que transforma
`pendente` em `enviando` prossegue.

No frontend, os envios são disparados em grupos concorrentes pequenos. Isso
evita sobrecarregar o pool, mas torna uma operação de 2.000 mensagens longa e
dependente da sessão do navegador. Tentativas ainda `pendente` podem ser
retomadas; tentativas presas em `enviando` não entram nessa retomada.

## 3. Webhook Meta

### 3.1 `sent`, `delivered`, `read` e `failed`

| Avaliação | Resultado |
|---|---|
| Aprovado? | **Aprovado com ressalvas** |
| Usa transação? | Sim; evento, tentativa, participação e histórico são tratados juntos |
| Usa lock? | Sim, `FOR UPDATE` na tentativa e participação localizadas pelo identificador externo |
| Risco | O evento único é inserido antes da tentativa ser localizada. Se o identificador ainda não estiver persistido, o evento é confirmado como consumido e a repetição será ignorada. Além disso, `failed` pode substituir `enviada` ou `entregue`, enquanto apenas `lida` e `falhou` são terminais no código. |
| Impacto | Perda de status legítimo em corrida com a confirmação do envio; possível estado final incoerente se um `failed` tardio chegar depois de `delivered`. |
| Recomendação | Em tarefa futura, manter eventos não correlacionados como pendentes para reprocessamento e revisar explicitamente a matriz de transições contra a semântica oficial da Meta. |

Eventos repetidos são impedidos pelo identificador único em
`eventos_webhook_mensageria`. Eventos `sent`, `delivered` e `read` regressivos
são ignorados pela ordem interna; eventos concorrentes para a mesma tentativa
são serializados pelo row lock. As atualizações de tentativa, participação e
histórico fazem commit ou rollback juntas.

O processamento é síncrono por item. Se um payload possuir vários eventos e um
item posterior falhar, itens anteriores podem já ter sido confirmados; no retry,
a idempotência impede duplicação dos anteriores. Esse comportamento favorece
consistência eventual.

### 3.2 Webhook repetido e segurança de entrada

| Avaliação | Resultado |
|---|---|
| Aprovado? | **Aprovado** |
| Usa transação? | Sim para cada alteração de estado/opt-out |
| Usa lock? | Sim nos registros de negócio; a unicidade do evento resolve duplicidade |
| Risco | Um identificador de evento consumido sem associação local não é reprocessado, conforme ressalva anterior. |
| Impacto | Não duplica histórico, mas pode perder associação em uma corrida específica. |
| Recomendação | Separar futuramente “recebido” de “processado com sucesso”. |

O endpoint valida a assinatura HMAC do corpo bruto antes de processar. O mapeamento
mantém os estados oficiais separados do evento de opt-out.

## 4. Opt-out

| Avaliação | Resultado |
|---|---|
| Aprovado? | **Aprovado** |
| Usa transação? | Sim, uma única transação |
| Usa lock? | Sim: contato e consentimentos ativos são bloqueados com `FOR UPDATE` |
| Risco | Se o telefone do evento não localizar contato, o identificador fica consumido e uma repetição não tenta novamente. Com a normalização e unicidade atuais, é um caso de borda. |
| Impacto | Um evento válido sem contato correlacionável naquele instante não seria reaplicado automaticamente. |
| Recomendação | Monitorar ocorrências de `contato_nao_encontrado`; se aparecerem em produção, criar tratamento específico em tarefa posterior. |

Quando o evento oficial de opt-out é reconhecido, a mesma transação:

- registra o evento externo de forma idempotente;
- bloqueia o contato;
- bloqueia os consentimentos ativos;
- inativa consentimentos anteriores e grava as novas revogações de mensagens e
  ligações;
- ativa os dois bloqueios do contato;
- registra o histórico com o vínculo disponível de campanha/tentativa.

Qualquer erro provoca rollback de todas essas alterações. A elegibilidade não é
um campo derivado persistido: consultas futuras e a barreira pré-provider leem
os bloqueios e consentimentos atuais. Portanto, ela muda atomicamente junto com
o opt-out.

## 5. Importações

| Avaliação | Resultado |
|---|---|
| Aprovado? | **Aprovado para 2.000 linhas, com cautela operacional** |
| Usa transação? | Sim; confirmação completa ocorre em uma transação |
| Usa lock? | Sim: advisory lock global de importação, importação `FOR UPDATE` e contatos existentes `FOR UPDATE` |
| Risco | A transação permanece aberta durante todo o processamento. Com pool padrão de cinco conexões e timeout de lock de cinco segundos, uma importação concorrente com envios, opt-out ou edição de contatos pode aumentar contenção. |
| Impacto | Timeout e rollback da importação ou espera de outras operações; a proteção evita duplicidade/corrupção. |
| Recomendação | Executar importações grandes fora da janela de disparo e monitorar duração, pool e locks. |

A mesma normalização canônica de telefone é usada antes da gravação. Há
deduplicação dentro do arquivo e `INSERT ... ON CONFLICT
(telefone_normalizado) DO NOTHING`, respaldado por índice único. Assim, cadastro
manual, formulário e importação convergem para a mesma chave no banco, inclusive
sob concorrência.

As linhas válidas são processadas em lotes de 500 com savepoints. Se um lote
falha, ele é revertido e as linhas são tentadas individualmente com novos
savepoints, permitindo registrar erros específicos. Se ocorrer falha geral, o
status da importação, contatos, complementações e relatório são revertidos
juntos. Não fica importação parcialmente marcada como concluída.

## 6. Banco, constraints, índices e capacidade

| Avaliação | Resultado |
|---|---|
| Aprovado? | **Aprovado com as ressalvas distribuídas descritas** |
| Usa transação? | Sim nos fluxos que escrevem várias tabelas |
| Usa lock? | Advisory locks e row locks são usados nos pontos de maior concorrência |
| Risco | Locks globais reduzem throughput; pool padrão é pequeno; não há índice específico em `historico_status_mensageria(tentativa_id)`; não foi executado `EXPLAIN ANALYZE` com volume real nesta auditoria. |
| Impacto | Possível contenção e degradação conforme o histórico crescer. Para 2.000 registros, não há evidência estática de inviabilidade, mas não existe comprovação de tempo de resposta por benchmark. |
| Recomendação | Medir em staging com volume e concorrência equivalentes antes de uma janela crítica; observar pool, lock wait, duração das queries e tentativas `enviando` antigas. |

Foram confirmadas constraints e índices para telefone canônico, consentimento
ativo único por tipo, pedido de exclusão pendente único, lote e participação,
tentativa e identificador externo, eventos de webhook, status, reserva temporal
e principais FKs relacionais.

Configuração padrão relevante:

- pool máximo: 5 conexões;
- timeout de conexão: 5 segundos;
- timeout de instrução: 15 segundos;
- timeout de consulta: 20 segundos;
- timeout de lock: 5 segundos;
- timeout ocioso em transação: 15 segundos.

Esses limites evitam espera indefinida, mas podem transformar contenção em erro
operacional. Com os grupos pequenos de envio atuais, o pool e a concorrência
estão alinhados de forma conservadora.

## 7. Parecer final para 2.000 envios

**Parecer: PRONTO COM RESSALVAS PARA OPERAÇÃO CONTROLADA; NÃO APROVADO COMO
TOLERANTE A FALHAS DE PONTA A PONTA.**

O banco protege corretamente contra dupla reserva na mesma campanha, excesso de
capacidade concorrente, duplicidade de telefone, repetição de webhook e falhas
parciais nas principais escritas relacionais. O cenário existente de 2.000
contatos oferece evidência funcional de seleção e loteamento.

Para uma operação supervisionada, sem reinício da aplicação durante o disparo e
com acompanhamento das tentativas, o desenho é compatível com aproximadamente
2.000 contatos. Entretanto, uma queda de processo ou resposta de rede ambígua
entre o provider e a confirmação local ainda pode deixar tentativas sem
reconciliação segura. Esse risco impede afirmar que o sistema é plenamente
resiliente em escala.

## 8. Método e integridade da auditoria

Foram examinados Models, Services, schema, configuração do pool e testes
existentes. Não foram executados disparos, chamadas à Meta, migrations, comandos
de escrita ou testes contra banco. Nenhum arquivo de código, configuração,
frontend ou banco foi alterado; este relatório é o único artefato criado.

