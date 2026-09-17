# Escalabilidade e UX — backup/restauração

> **Documento histórico de implementação.** As descrições abaixo de múltiplas
> etapas ou dois arquivos registram a fase em que foram testadas. O fluxo final
> usa um único `.acorda` e três momentos de UX. Consulte
> [../STATUS_FINAL_DO_PROJETO.md](../STATUS_FINAL_DO_PROJETO.md) e
> [RELATORIO_BACKUP_ARQUIVO_UNICO.md](RELATORIO_BACKUP_ARQUIVO_UNICO.md).

Projeto: ACORDA RJ

Data: 17/09/2026

Escopo: upload, controles de capacidade da restauração e seção Restaurações da aba Backup existente. Implementação e validação exclusivamente locais/isoladas.

## 1. Resultado

UPLOAD/RESTAURAÇÃO PREPARADOS PARA CRESCIMENTO DENTRO DA CAPACIDADE DA INFRAESTRUTURA, SEM ALTERAÇÃO FUNCIONAL DA MENSAGERIA.

Essa declaração se limita ao escopo e às evidências abaixo. Não constitui certificação de capacidade de produção, garantia absoluta contra OOM ou promessa de restauração de tamanho ilimitado. Não foi acessada produção nem reproduzido um contêiner limitado a 512 MiB.

O upload admite crescimento por configuração interna, grava em disco com backpressure e trata tamanho excedido, interrupção, timeout e recursos insuficientes. A tela agora separa seleção, validação, revisão, confirmação e acompanhamento. As proteções da Fase 2 permanecem exigidas no backend.

## 2. Antes e problema identificado

O upload já gravava o multipart em arquivo temporário: não usava memoryStorage nem acumulava o dump completo em um Buffer do backend. Portanto, não havia buffering integral do dump a remover nesse caminho.

Os problemas eram o limite fixo de 256 MiB apresentado como regra de produto, tratamento insuficientemente explícito de interrupções/recursos, timeout HTTP que precisava acompanhar uploads longos e interface concentrando ações críticas. Na comparação de integridade, a agregação de hashes por tabela e a leitura integral de large objects também cresciam com o volume no PostgreSQL.

## 3. Estratégia implementada

- Middleware multipart com storage próprio: diretório técnico exclusivo, nome interno UUID e abertura exclusiva do arquivo.
- Diretório com modo 0700 e arquivo 0600 em sistemas POSIX; no Windows, a proteção também depende das ACLs da conta/diretório temporário. Nenhuma rota pública serve esses arquivos.
- Pipeline incremental com buffers de 64 KiB e backpressure. Nome recebido do cliente não determina o caminho.
- Contador real do stream: não depende de Content-Length. Tamanho exatamente igual ao limite é aceito; um byte acima é recusado.
- Um upload por processo de cada vez. O lock já existente da Fase 2 continua protegendo inspeção/restauração.
- Verificação de memória disponível na admissão e no planejamento da restauração; reserva de disco conferida no início e a cada aproximadamente 4 MiB recebidos.
- Timeout total de recebimento, encerramento da conexão e limpeza do parcial. Novo upload é permitido depois de aborto, timeout ou multipart truncado.
- Erros de espaço/quota/tamanho são normalizados; rejeições posteriores ao upload também removem o artefato recebido.
- Antes da inspeção, manutenção e etapa destrutiva: autenticação do candidato e planejamento de capacidade. A expansão SQL é contada no stdout do pg_restore, sem executar esse SQL e sem guardá-lo integralmente em RAM/disco.
- Expansão total e tamanho de uma linha/registro possuem guardas técnicas, inclusive para arquivos comprimidos pequenos que se expandiriam muito.
- Hash de tabelas calculado por cursor de até 1.000 hashes, com work_mem de 4 MB; large objects lidos em blocos de 1 MiB. O resultado mantém o contrato de integridade anterior.
- O timeout HTTP do servidor acompanha o prazo interno de upload. Os limites de headers/conexão e as demais validações existentes foram preservados.

O arquivo técnico aprovado continua disponível durante a recuperação na instância que o recebeu. A limpeza não remove histórico, auditoria, registros operacionais nem arquivos baixados no computador do administrador. A cópia pré-restore é preservada enquanto manutenção/recuperação exigir sua custódia; não é descartada automaticamente numa falha crítica.

## 4. Configuração interna e capacidade

Nenhuma configuração de tamanho é exibida ou editável pelo administrador na interface. O suporte ajusta a infraestrutura e as variáveis internas, documentadas em backend/.env.example. O .env real não foi editado.

| Configuração | Padrão | Finalidade |
|---|---:|---|
| RESTORE_UPLOAD_MAX_BYTES | 268435456 | Limite técnico inicial, não regra fixa do produto |
| RESTORE_UPLOAD_TIMEOUT_MS | 900000 | 15 minutos para receber o upload |
| RESTORE_PROCESSAMENTO_TIMEOUT_MS | 1800000 | 30 minutos por execução do pg_restore |
| RESTORE_DISCO_RESERVA_BYTES | 268435456 | Espaço livre reservado além da estimativa |
| RESTORE_MEMORIA_LIVRE_MIN_BYTES | 134217728 | Margem de memória disponível |
| RESTORE_EXPANSAO_MAX_BYTES | 2147483648 | Guarda para SQL descomprimido |
| RESTORE_REGISTRO_MAX_BYTES | 8388608 | Guarda de linha/registro na expansão |
| RESTORE_BANCO_DISPONIVEL_BYTES | sem valor | Orçamento de espaço verificado pelo suporte para banco remoto |

O limite foi aumentado para 335544320 somente no processo de teste, sem reescrever a lógica. Foram aceitos arquivos acima do antigo limite de 256 MiB.

O planejamento estima espaço para inspeção, índices/WAL e backup de segurança: usa o maior valor entre quatro vezes a expansão do candidato e duas vezes o tamanho do banco atual, além de conferir espaço temporário para a cópia de segurança. É uma estimativa conservadora, não uma reserva física contra outros consumidores.

Para PostgreSQL local, sem orçamento explícito, mede-se o filesystem do data_directory após confirmar endereço loopback. Para PostgreSQL remoto, não é correto medir o disco do backend como se fosse o disco do banco: exige-se RESTORE_BANCO_DISPONIVEL_BYTES informado pelo suporte a partir da capacidade disponível verificada. Sem essa informação, a inspeção/restauração é recusada, não iniciada às cegas. Essa configuração precisa ser preparada antes de habilitar o fluxo em um ambiente remoto; nada foi configurado em produção nesta tarefa.

Quando a capacidade é excedida, o usuário recebe:

> Este backup excede a capacidade atual do servidor para restauração. Entre em contato com o suporte.

Para crescer: rever disco temporário, memória do runtime, espaço do PostgreSQL, limites do proxy/plataforma e prazos; ajustar as variáveis internas, inclusive os limites já existentes de geração do backup pré-restore. Não basta aumentar apenas o limite de upload.

## 5. UX implementada

1. Seleção inicial dos dois arquivos, com nome, tamanho legível e indicação de seleção. Sem senha nem frase destrutiva nessa abertura.
2. Validação em etapa própria, com loading e bloqueio de duplo clique. A credencial de um administrador existente no candidato continua obrigatória para provar acesso após a recuperação; foi separada da confirmação destrutiva e explicada ao usuário.
3. Card de backup válido: data, tamanho, compatibilidade, tabelas e registros. Aviso sobre substituição de dados posteriores e revisão explícita antes de continuar.
4. Somente depois da revisão: senha administrativa atual, frase RESTAURAR SISTEMA e aviso destrutivo. Primeiro prepara manutenção e cópia de segurança; não pula para a substituição dos dados.
5. Acompanhamento das nove etapas, com leitura periódica de status, sem iniciar/repetir operações automaticamente. Ações manuais pendentes são identificadas como “Aguardando sua ação”. Erros são destacados sem inventar conclusão de subetapas não confirmadas.
6. Novo login, download/custódia externa, confirmação final de execução, consulta administrativa, reconciliação, checklist e liberação manual permanecem separados e obrigatórios.
7. Detalhes técnicos e dados detalhados de revisão recolhidos por padrão. Nenhuma senha/hash de senha foi acrescentada ao resumo.
8. Layout restrito à seção Restaurações: cards, contraste, campos com largura adequada, botões, estados disabled, foco visível, feedback acessível, responsividade e redução de animação conforme preferência do navegador.
9. Histórico preservado e consultável. Após liberação explícita, o progresso permanece mostrando as nove etapas concluídas.

Não foram redesenhadas outras áreas do painel nem alteradas regras de negócio para facilitar a interface.

## 6. Medições do upload

Método: middleware real em servidor HTTP loopback, um processo filho independente por cenário; cliente envia blocos incrementais, sem construir arquivo grande em RAM. Heap V8 do servidor de teste limitado a 128 MiB. Amostragem de memória/disco a cada 20 ms e ao concluir recebimento. Hash SHA-256 e tamanho final comparados nos casos aceitos. Dados inteiramente sintéticos.

Valores arredondados em MB decimais, não MiB. Duração é a da transferência/resposta local, não de restauração. A tabela registra a rodada final de 14 cenários de upload.

| Cenário | Arquivo MB | Resultado | Tempo s | RSS inicial / máximo / final MB | Crescimento RSS MB | Heap inicial / máximo / final MB | Disco máximo observado MB |
|---|---:|---|---:|---|---:|---|---:|
| Pequeno | 1,049 | 200 | 0,034 | 50,0 / 58,0 / 58,0 | 8,0 | 10,7 / 11,2 / 9,4 | 1,049 |
| Médio | 33,554 | 200 | 0,190 | 50,4 / 69,7 / 58,6 | 19,3 | 10,7 / 11,8 / 8,3 | 33,554 |
| Grande, acima do limite antigo | 293,601 | 200 | 1,152 | 50,4 / 109,8 / 73,5 | 59,5 | 11,0 / 12,1 / 9,1 | 293,601 |
| Próximo ao limite, menos 1 byte | 335,544 | 200 | 1,457 | 50,8 / 120,2 / 83,9 | 69,4 | 11,1 / 11,8 / 9,6 | 335,544 |
| Exatamente no limite | 335,544 | 200 | 1,258 | 51,2 / 124,4 / 74,2 | 73,2 | 10,6 / 11,8 / 9,2 | 335,544 |
| Acima, sem Content-Length | 335,544 + 1 byte | 413 | 2,084 | 50,8 / 88,7 / 60,4 | 37,9 | 10,7 / 11,9 / 8,4 | 335,498 |
| Acima, tamanho declarado | 337,641 | 413 | 0,008 | 50,9 / 54,4 / 54,4 | 3,5 | 10,7 / 11,3 / 11,3 | 0 |
| Interrompido pelo cliente | alvo 16,777 | Interrompido | 0,017 | 51,5 / 58,1 / 58,1 | 6,6 | 11,1 / 11,8 / 9,9 | 0,066 |
| Conexão lenta simulada | 4,194 | 200 | 1,034 | 51,1 / 64,0 / 64,0 | 12,9 | 10,7 / 12,3 / 10,3 | 4,194 |
| Timeout de 200 ms no teste | alvo 4,194 | 408 | 0,213 | 51,5 / 58,6 / 58,6 | 7,1 | 11,0 / 13,7 / 9,4 | 0,262 |
| Multipart truncado | 1,049 | 400 | 0,028 | 50,9 / 58,4 / 58,0 | 7,5 | 11,0 / 11,8 / 9,9 | 0,066 |
| Reserva de disco indisponível | 1,049 | 413 | 0,018 | 51,6 / 57,2 / 57,2 | 5,6 | 10,7 / 12,3 / 12,1 | 0 |
| Reserva de memória indisponível | 1,049 | 413 | 0,027 | 51,5 / 55,8 / 55,8 | 4,4 | 10,7 / 12,0 / 12,0 | 0 |
| Concorrência | 4,194 | Primeiro 200; segundo 409 | 1,027 | 50,9 / 64,7 / 64,7 | 13,8 | 11,0 / 12,5 / 10,3 | 4,194 |

Disco final: zero bytes e zero diretórios de upload em todos os cenários. Aborto, timeout e multipart truncado também receberam um novo upload de 64 KiB no mesmo processo para verificar recuperação do middleware; essa tentativa entra nas medições de memória/disco. A amostragem pode não capturar picos de disco de operações muito curtas. O máximo de RSS observado foi aproximadamente 124,4 MB, sem crescimento equivalente ao arquivo de 335,5 MB.

Esses arquivos grandes testam o transporte e o armazenamento, não são dumps PostgreSQL restauráveis. Autenticidade, inspeção e restauração de dumps reais foram testadas separadamente em PostgreSQL temporário, inclusive com mais de 2.100 contatos e large object com mais de 2 MiB. Não foi realizado benchmark de restauração de banco real de 335 MB.

## 7. Testes e regressões

| Execução | Resultado |
|---|---|
| node scripts/testarUploadRestoreIsolado.js | 14 cenários aprovados; integridade e cleanup |
| node scripts/testarRestoreFase2Isolado.js | 86 verificações da Fase 2 aprovadas |
| Resiliência, executada pelo runner isolado | 16 verificações em 8 cenários |
| Backups administrativos, pelo runner isolado | 40 verificações |
| Webhooks, pelo runner isolado | 16 verificações |
| Envio simplificado / aproximadamente 2.000 contatos | 2.421 verificações |
| node scripts/testarBackupCompletoIsolado.js | 20 verificações de geração, 46 de restauração, 7 da aplicação restaurada; backup administrativo 40 |
| Schema vazio, pelo runner da Fase 1 | 31 tabelas operacionais, controle preservado, 23 migrations |
| Integridade da fixture Fase 1 | 241 registros, 29 sequences, 404 constraints, 113 índices, 1 função, 12 triggers, 1 large object |
| npm run testar:backups no frontend | 12 verificações |
| node scripts/testarRestauracaoRenderizada.js | 36 verificações no Edge headless |
| npm run build no frontend | Aprovado, 74 módulos |
| node --check | 22 arquivos JavaScript modificados/novos aprovados |
| git diff --check | Aprovado; somente avisos habituais LF/CRLF |
| Whitespace de arquivos novos | 14 JS/JSX/CSS verificados separadamente |

O backend não possui etapa de compilação/build separada; recebeu verificação de sintaxe e testes funcionais. Não foi usado npm test genérico, que executaria pretest/migrations sobre o ambiente padrão. Os runners montam conexões loopback com nomes aleatórios, ignoram DATABASE_URL externa de entrada e removem apenas seus bancos descartáveis.

Foram novamente verificados ADMIN-only, rejeição de credenciais/candidato inválido, HMAC/hash/arquivo truncado, versões/migrations, manutenção e drenagem, backup pré-restore, novo login/auth_epoch, download/custódia, falha de restore/conexão/validação, manutenção preservada, reconciliação e liberação manual. As novas guardas de expansão, linha, memória e espaço do banco recusaram o candidato antes da manutenção. O hash por cursor foi comparado ao algoritmo anterior com mais de dois lotes de 1.000 linhas; o hash incremental de large object também foi conferido.

O teste visual usa o bundle real com API mock, nunca o backend local/produção. Desktop 1440×1100 e mobile 390×844 sem overflow horizontal; seleção, loading, erro, sucesso, revisão, confirmação, custódia, checklist, pendências e nove etapas finais foram exercitados. As capturas foram inspecionadas visualmente. Capturas da rodada final: diretório temporário `acorda-restore-ux-DrCztL` no TEMP local. Contêm somente dados QA.

Logs de erros Meta/backup/manutenção nas suítes são falhas simuladas e esperadas, não chamadas externas nem falhas de produção.

## 8. Arquivos desta tarefa

- backend/src/modules/backups/capacidadeRestore.js — guardas/configuração interna de capacidade.
- backend/src/modules/backups/uploadRestore.js — streaming privado, timeout, concorrência e cleanup.
- backend/src/modules/backups/restauracaoRoutes.js — integração do middleware e limpeza em falhas.
- backend/src/modules/backups/restauracaoService.js — descriptor do artefato, conferências prévias e limpeza correspondente.
- backend/src/modules/backups/ferramentasRestore.js — contagem de expansão, timeout e integridade incremental.
- backend/src/server.js — prazo de recebimento HTTP compatível com upload.
- backend/.env.example — documentação das variáveis internas, sem alterar .env.
- backend/package.json — comando do teste de upload isolado.
- backend/scripts/testarUploadRestoreIsolado.js — transporte e medições.
- backend/scripts/testarRestoreFase2Isolado.js — casos adicionais de capacidade/integridade/cleanup.
- frontend/src/components/RestauracoesAdministrativas.jsx — fluxo progressivo na seção existente.
- frontend/src/styles/restauracoes.css — estilos escopados e responsividade.
- frontend/scripts/testarRestauracaoRenderizada.js — validação real no navegador com API fake.
- frontend/package.json — comando do teste visual.
- Este relatório.

O working tree já continha alterações da Fase 2, inclusive migration 023, controle de manutenção/auth e integração do webhook. Elas foram preservadas. Esta tarefa não criou migration, não alterou schema operacional e não editou provider, regras de envio, opt-out, campanhas, reservas, lotes ou idempotência. A lista completa do git status inclui esse trabalho anterior e não deve ser confundida com mudanças novas desta tarefa.

## 9. Limites residuais e evolução

- Memória medida é do servidor isolado de upload, não soma backend completo, navegador, pg_restore e PostgreSQL. Heap limitado a 128 MiB não equivale a impor limite total de RAM de 512 MiB. Antes de liberar grandes volumes em produção, medir o conjunto na infraestrutura contratada, em staging equivalente e sem mensagens reais.
- Espaço/memória disponíveis podem mudar entre a conferência e a execução. Guardas, timeout, transação de restore e manutenção fechada reduzem risco, mas não fornecem garantia absoluta contra OOM, falha de disco, pressão externa ou indisponibilidade do banco. Validação pós-restore que falhe continua mantendo recuperação necessária, nunca liberação automática.
- O orçamento de disco de um PostgreSQL remoto deve permanecer atualizado pelo suporte. Não foi consultada a capacidade da DigitalOcean nesta tarefa.
- Proxy/plataforma podem impor prazo ou tamanho menor que o backend. Esses limites não foram alterados ou validados em produção.
- Upload e artefatos continuam locais à instância. Uma queda dura não permite executar finally/cleanup; cópias órfãs privadas podem exigir limpeza técnica segura. Não foi criado purge por idade em tabelas, nem varredura destrutiva de diretórios arbitrários. Em recuperação crítica, preservar a cópia pré-restore tem prioridade sobre liberar espaço automaticamente.
- O download já existente no navegador usa Blob; estas medições tratam do recebimento no backend, não do uso de memória do navegador durante download. Para cópias muito maiores, avaliar download autenticado direto/streaming sem enfraquecer a custódia.
- A separação storage/descriptor e ferramentas de validação permite futura evolução para armazenamento privado temporário. Um adaptador ainda precisará materializar o artefato para o pg_restore e preservar integridade, permissões e custódia. Não foi implementado object storage, nem prometido suporte multi-instância sem esse trabalho futuro.
- Os limites técnicos são configuráveis, mas devem acompanhar infraestrutura, expansão e tamanho de registros. Aumentá-los indiscriminadamente não cria recursos.

## 10. Integridade da execução

Nenhuma consulta, backup ou restauração em produção. Nenhuma chamada à Meta real, mensagem real, consumo de limite, deploy, commit ou push. Nenhum dado/histórico operacional foi apagado automaticamente. Os bancos e arquivos removidos pelos testes eram exclusivamente fixtures temporárias criadas pelos próprios runners, sem dados reais.

As medições e capturas não alteram o estado dos servidores locais já abertos pelo usuário. O backend em execução não foi reiniciado nesta tarefa; para exercitar manualmente o código novo, será necessário reiniciá-lo usando a configuração local segura, não a DATABASE_URL externa do .env.

Trabalho encerrado após implementação, testes e relatório.
