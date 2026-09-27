# Importação com consentimento migrado e campanha de 2.000

Data: 27/09/2026. Projeto: ACORDA RJ.

## Parecer

**APROVADO COM RESSALVA para a referência de 512 MiB, 1 CPU compartilhada e 1 instância.**

O fluxo de 2.000 envios passou: uma campanha, um lote preparado uma única vez,
2.000 contatos distintos e 2.000 confirmações do provider falso, sem duplicidade.
A interrupção após 1.000 confirmações preservou essas confirmações; outro processo
enviou somente os 1.000 pendentes. Não foi encontrada regressão de campanhas ou
mensageria causada pela alteração de importação.

A ressalva é de representatividade: teste em Windows/PostgreSQL local, sem impor
cgroup Linux de 512 MiB ou reproduzir o compartilhamento de CPU da DigitalOcean.
As medidas abaixo são do processo Node, não do host inteiro nem do PostgreSQL.
Não representam garantia absoluta de comportamento ou cobrança de produção.
Não há evidência neste teste que justifique recomendar upgrade para 2.000 envios.

## Nova funcionalidade

- Implementada: **SIM**. Checkbox disponível somente para ADMIN em CSV/XLSX.
- Backend verifica ADMIN na pré-visualização e novamente na confirmação, usando
  o perfil autenticado atual. Um OPERADOR não pode confirmar uma prévia marcada.
- Desmarcada/ausente: mantém o tratamento anterior dos contatos e consentimentos.
- Marcada: autoriza somente contatos **novos efetivamente criados** pela importação.
  Duplicados existentes continuam sendo ignorados/complementados conforme a regra
  anterior, sem modificar suas autorizações ou restrições.
- Bloqueios, recusas e revogações preservados: **SIM**, incluindo registro de
  revogação inativo. Comparados dados completos antes/depois nos testes.
- Consentimento registrado como `migracao_legado`, canal `importacao`, tipo
  `mensagens`, estado `autorizado`, origem descritiva **sistema/base anterior**.
  Não atribui a coleta ao ACORDA RJ nem inventa a data da autorização original.
- Auditoria: administrador, data do registro, importação, arquivo, total criado e
  total de consentimentos migrados. Histórico individual vinculado à importação.
- A planilha original continua sendo evidência externa, sob guarda do administrador.
- Campos extras são ignorados no mapeamento; não criam colunas nem permissões.
- Selecionar outro arquivo ou concluir a importação desmarca a opção. Alterar os
  dados do formulário invalida a prévia, evitando confirmar uma escolha anterior.
- Migration necessária: **NÃO**. Reutilizados `importacoes.relatorio`,
  `consentimentos`, `historico_contatos` e os indicadores existentes de contatos.
- Contatos, consentimentos e auditoria são confirmados na mesma transação. Falha
  na gravação de consentimento reverte integralmente a confirmação.

### Defeito XLSX encontrado e corrigido

O leitor streaming do ExcelJS, recebendo diretamente o Buffer do upload, falhou
na fixture de XLSX válido com strings compartilhadas: primeiro houve acesso a
metadados ainda indisponíveis; uma tentativa de inicialização desses metadados
não resolveu a leitura dos telefones e foi descartada.

A correção final usa o leitor de arquivo `Workbook.xlsx.load`, que resolve as
strings antes de mapear células. Mantidos a primeira aba, os campos reconhecidos
e as validações. O upload continua limitado pela configuração existente.
Como a leitura carrega o workbook em memória, o tamanho compactado do XLSX não
equivale ao consumo descompactado; a medida abaixo cobre a fixture de 2.000 linhas,
não todos os arquivos possíveis no limite de upload.

## Testes executados

- Nova importação: **26 verificações** por HTTP/serviço e PostgreSQL isolado.
  Incluem ADMIN/OPERADOR, flag inválida, opção ausente, CSV, XLSX, campos extras,
  duplicados, linha inválida, restrições, confirmação repetida, auditoria, rollback
  e isolamento da opção por importação. VCF mantém o fluxo normal; a opção migrada
  é rejeitada nesse formato.
- XLSX adicional: **2.000 linhas válidas, 2.000 contatos criados e 2.000
  consentimentos migrados**, com bairro/idade preservados. Arquivo de 59.480 bytes;
  RSS máximo observado **115,01 MiB**, incluindo a criação da fixture no processo.
- Interface real em Edge headless, API simulada: **15 verificações**, incluindo
  visibilidade por perfil, envio da flag, invalidação da prévia, contagem e reset.
- Regressão existente de importações: **aprovada**, incluindo CSV/XLSX/VCF e
  exclusão administrativa limitada aos contatos criados pela importação.
- Resiliência de mensageria: **16 verificações em 8 cenários**.
- Webhook de mensageria: **16 verificações**.
- Campanhas, lotes e mensageria: **31 verificações**.
- Queda após aceite externo fictício e retomada: **24 verificações**.
- Build frontend: **74 módulos**, aprovado. Sintaxe dos arquivos JS e
  `git diff --check`: aprovados.

## Campanha integrada

| Medida | Resultado |
|---|---:|
| Contatos fictícios importados pelo fluxo novo | 2.000 |
| Consentimentos migrados | 2.000 |
| Público elegível e capacidade inicial | 2.000 |
| Campanhas / lotes internos | 1 / 1 |
| Preparações de envio | 1 |
| Processados / confirmados pelo fake | 2.000 / 2.000 |
| Contatos distintos | 2.000 |
| Envios duplicados / aceites fictícios duplicados | 0 / 0 |
| Concorrência máxima de envio | 4 |

O teste utiliza os serviços reais de importação, campanha e mensageria e extrai
a concorrência do código do frontend. Não abre 2.000 requisições simultâneas.
O provider falso simula latência variável de 50–150 ms e mantém um registro de
aceites no banco descartável, preservado entre os processos de teste.
“Confirmado” significa aceito pelo fake com identificador; não significa entrega
real no WhatsApp. O tempo medido não é previsão para a campanha de produção.

## Recursos observados

| Medida | Resultado |
|---|---:|
| RSS inicial / máximo / final | 65,50 / 93,62 / 89,93 MiB |
| heapUsed inicial / máximo / final | 13,17 / 32,14 / 31,41 MiB |
| heapTotal máximo | 84,94 MiB |
| External memory máxima | 3,82 MiB |
| CPU média Node, antes / após restart (% de um núcleo) | 3,41% / 3,78% |
| Event-loop p99 máximo entre processos | 33,82 ms |
| Event-loop máximo | 36,57 ms |
| Tempo somado das duas etapas | 81,78 s |
| Conexões máximas no pool da aplicação | 5 |
| Fila máxima do pool | 0 |
| Deadlocks / locks pendentes ao final | 0 / 0 |
| Erros/timeouts no envio normal | 0 |
| Pool final limpo | SIM |

Inicial é o início do primeiro processo; final é o término do segundo. Máximos
consideram ambos. O processo foi realmente encerrado e substituído na metade.
Não foi observado crescimento contínuo: nas amostras de cada processo houve
queda de RSS/heap seguida de novas alocações. Isso não é um teste prolongado de
vazamento nem uma análise de heap por referência de objeto. Nenhum OOM ocorreu.
Os grupos de promessas são limitados a quatro envios; não há `Promise.all` de
2.000 envios nesta execução. Não se observou saturação relevante do Node/event loop.

## Resiliência

- Restart seguro: **SIM**.
- Confirmadas reenviadas: **NÃO**.
- Resultado indeterminado reenviado: **NÃO**.
- Somente pendentes válidas continuaram: **SIM**.
- Cobrança fictícia duplicada: **NÃO**.
- Timeout/transporte, erro explícito, resposta sem identificador e falha de
  persistência após aceite foram exercitados pelas suítes indicadas.

O cenário extra de queda após aceite reutiliza a auditoria existente de oito
contatos e seu registro fictício de aceites. Ele é separado da campanha integrada
de 2.000; nenhum preenchimento auxiliar entra nas contagens da campanha principal.

## Arquivos alterados/criados

- `backend/src/modules/importacoes/importacaoService.js`
- `backend/src/modules/importacoes/importacaoModel.js`
- `backend/src/modules/importacoes/importacaoController.js`
- `frontend/src/pages/ImportacaoContatos.jsx`
- `frontend/src/services/contatoService.js`
- `backend/scripts/testarConsentimentoMigradoIsolado.js`
- `frontend/scripts/testarImportacaoRenderizada.js`
- `backend/package.json` e `frontend/package.json` (comandos de teste)
- Este relatório.

Reprodução: fornecer `QA_PG_HOST=127.0.0.1`, `QA_PG_PORT`, `QA_PG_USER` e, se
necessário, `QA_PG_PASSWORD` de um PostgreSQL local de testes e executar
`npm run testar:consentimento-migrado-isolado` no backend. O runner não carrega
`.env`, cria um banco aleatório e o remove no final. Regressões filhas recebem URL
isolada e credenciais Meta falsas. Preload bloqueia HTTP externo. Para a interface,
executar o build e `npm run testar:importacao-renderizada` no frontend (Windows/Edge).

## Isolamento

PostgreSQL 18 temporário em `127.0.0.1:55439`, separado do serviço local e de
produção. Os bancos aleatórios de teste foram removidos ao concluir.
Nenhuma mensagem real, chamada Meta real, alteração de produção, deploy, commit
ou push. As mudanças estão somente no working tree local.

O cluster temporário foi encerrado com sucesso, após confirmar zero bancos QA
restantes. A exclusão recursiva das pastas temporárias foi rejeitada pela política
da ferramenta, inclusive numa tentativa com caminho literal. Permanecem, para
limpeza manual, somente os artefatos técnicos desta execução:

- `C:\Users\gabriellindo\AppData\Local\Temp\acorda-importacao-214c23f65b6d4ddfafe4a2d5af367fb5`
- `C:\Users\gabriellindo\AppData\Local\Temp\acorda-ui-importacao-e6Dk59`
- `C:\Users\gabriellindo\AppData\Local\Temp\acorda-ui-importacao-L6z6J3`

As duas primeiras tentativas do teste visual precisaram de ajuste no harness
(habilitar Page no protocolo de depuração). O teste final da interface passou;
as pastas acima de navegador são dessas tentativas anteriores, com dados QA.
