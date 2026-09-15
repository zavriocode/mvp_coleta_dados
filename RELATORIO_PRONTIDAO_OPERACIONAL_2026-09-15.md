# Prontidão operacional — ACORDA RJ

**Data:** 15/09/2026. **Parecer: B — APROVADO COM RESSALVA OPERACIONAL.**

O fluxo local passou nos cenários críticos. Não foi encontrado bloqueador concreto
de duplicação ou perda de estado nos testes executados. A aprovação de produção
depende da conferência do código publicado, migration 021, capacidade oficial
disponível e tier no painel. Produção não foi consultada.

## Resultado objetivo

| Item | Evidência desta execução |
|---|---|
| Infraestrutura | **APROVADA COM RESSALVA**: teto de 512 MiB adotado; tier real não confirmado no repositório |
| Campanha principal | 2.000 contatos fictícios, 4 lotes de 500, 2.000 aceites fake e 2.000 tentativas confirmadas; zero restantes |
| Duplicidades | **NÃO**: 2.000 participações únicas; duplo preparo e duplo envio não repetiram aceites |
| Concorrência | 4 operações por grupo, conforme frontend; máximo observado de 3 chamadas sobrepostas ao provider fake |
| Pool PostgreSQL | Máximo de 5 conexões, até 5 ocupadas; todas liberadas ao terminar; fila final zero |
| Restart real do processo de teste | 4 confirmadas + queda após o quinto aceite; processo novo executou recovery e enviou só as 3 pendentes |
| Resultado indeterminado reenviado | **NÃO**, tanto envio quanto reprocessamento foram rejeitados; recovery fez zero chamadas ao provider |
| Webhook antecipado recuperado | **SIM**, pendente até associação por ID oficial, preservando timestamp e idempotência |
| Opt-out bloqueou novos envios | **SIM**, bloqueios/revogação, pré-provider e futuras reservas; ação separada do status |
| Banco consistente | **SIM**, rollback antes/depois do provider; falha de conexão simulada e posterior retomada |
| Backup smoke | **OK**: geração local, download autenticado, conteúdo SQL/SHA-256, indisponibilidade após download e falha 503 auditada |
| Schema/migrations | **OK local**: 31 tabelas, 21 migrations/checksums; SQL incremental 021 reaplicado sobre estrutura anterior simulada, constraints/índices válidos |

## Recursos da campanha de 2.000

| Métrica | Valor |
|---|---:|
| RSS inicial / máximo / final | 53,91 / 117,27 / 114,38 MiB |
| heapUsed inicial / máximo / final | 6,83 / 34,67 / 12,54 MiB |
| heapTotal máximo | 77,72 MiB |
| Memória external máxima | 5,22 MiB |
| Event-loop delay máximo / p99 | 34,28 / 32,59 ms |
| Tempo total | 11,454 s |
| Erros/timeouts no fluxo normal | 0 / 0 |

Medição amostrada a cada 20 ms no processo Node local que executou os Services,
Models e provider fake. Inclui o ledger de aceites exclusivo de teste. O heap
subiu e caiu entre lotes, sem crescimento contínuo nesta execução. O pico de RSS
ficou em cerca de 23% de 512 MiB. **Não há evidência para exigir upgrade para
1 GiB.** Isso não mede o container Linux, latência Meta, memória de pg_dump,
HTTP em escala ou consumo do PostgreSQL gerenciado. O tempo fake não estima o
tempo de um disparo real.

Pool padrão: 5 conexões; conexão/lock 5 s; statement 15 s; query 20 s;
transação ociosa 15 s. O frontend limita os grupos a quatro; não há 2.000
requisições simultâneas nesse caminho. Reserva usa transação, advisory locks,
row locks e unicidade; envio e confirmação são transações separadas.

## Testes executados

- Novo cenário completo e restart/falhas/correlação: **535 verificações**.
- Resiliência existente: **16**, em oito cenários, incluindo rede e rejeição explícita fake.
- Webhook: **16**, incluindo proteção de entrada e repetição.
- E2E/opt-out: **22**.
- Backup: **35**.
- Campanhas/lotes/mensageria: **31**, incluindo capacidade, transações e controles existentes.
- Frontend: **64 + 12**. Total: **731 verificações**, além das checagens de schema/incremental.
- Build: **72 módulos, aprovado**. `node --check`: **10 arquivos aprovados**.
- `git diff --check`: **aprovado**.

Falhas injetadas: resposta aceita sem ID, encerramento do processo após aceite,
erro SQL dentro da confirmação (rollback), indisponibilidade simulada de conexão
antes do envio, rede e erro explícito fake. A indisponibilidade de conexão foi
injetada no pool; não foi derrubado o serviço PostgreSQL. Os bancos descartáveis
foram removidos ao final.

## Riscos residuais reais

- Aceite externo sem ID persistido pode ficar indeterminado sem correlação
  automática possível. A proteção evita reenvio, mas não promete resolver todos
  os resultados desconhecidos. O operador deve preservar essas tentativas.
- O navegador coordena os grupos: fechar a página interrompe a sequência;
  reabrir e consultar o público permite continuar pelas pendentes.
- Tier, capacidade Meta disponível, migrations e código de produção não foram
  comprovados nesta auditoria. A capacidade usada no teste era fictícia.
- Backup depende de `pg_dump` compatível **no runtime do servidor**. `backend/Aptfile`
  e `heroku-postbuild` documentam/verificam a dependência; o runtime publicado
  não foi acessado. A disponibilidade do arquivo temporário depende do processo
  que o gerou; faça geração/download antes da campanha.

## Checklist para a operação (8 itens)

1. Conferir versão publicada e migration 021 aplicada no ambiente de produção.
2. Conferir tier real e métricas de memória/restarts no painel.
3. Conferir capacidade oficial disponível e limite interno para a janela de envio.
4. Conferir modelo aprovado, configuração e público atual da campanha.
5. Gerar/baixar backup antes do disparo e verificar pg_dump no runtime.
6. Manter uma campanha por vez e evitar importação/backup durante o disparo.
7. Manter a aba aberta e acompanhar progresso, falhas e confirmações pendentes.
8. Após interrupção, reabrir a mesma campanha e continuar apenas pelas pendentes;
   não reenviar resultados indeterminados.

## Arquivos desta auditoria

- `backend/scripts/auditarProntidaoOperacional.js` (cenário isolado reproduzível).
- Este relatório.

Nenhuma correção no código operacional ou migration foi necessária. Alterações
de frontend/backup já presentes foram preservadas. Nenhuma chamada real à Meta,
mensagem real, alteração em produção, deploy, commit ou push foi realizada.
