# Backup administrativo em arquivo único

Data: 17/09/2026. Ajuste aprovado após a entrega de escalabilidade/UX.

## Resultado

O administrador baixa e seleciona somente um arquivo `.acorda`. A assinatura e os metadados de verificação estão dentro dele. O campo separado de verificação e o segundo download JSON foram removidos da interface, inclusive na cópia de segurança pré-restauração.

Este relatório substitui apenas as orientações anteriores sobre selecionar/guardar dois arquivos. As demais proteções da restauração permanecem.

## Formato e segurança

- Envelope versionado com cabeçalho, comprimento limitado dos metadados, manifesto HMAC e dump custom PostgreSQL original.
- Download por streaming. Não cria um ZIP nem carrega o dump inteiro em RAM.
- Upload extrai o conteúdo no próprio arquivo técnico privado, com blocos de 64 KiB e deslocamento controlado. Não usa nomes/caminhos fornecidos dentro do arquivo e não exige uma segunda cópia integral no disco.
- Assinatura, comprimento, SHA-256, compatibilidade de PostgreSQL/migrations, inspeção isolada e credenciais do administrador continuam obrigatórios.
- Corrupção, truncamento, bytes adicionais, tamanho de metadados hostil e chave incorreta são recusados.
- O cabeçalho HTTP X-Backup-SHA256 corresponde ao arquivo completo baixado. X-Backup-Conteudo-SHA256 e o histórico existente continuam identificando o dump interno; tamanho/formato históricos referem-se a esse conteúdo operacional. O pacote acrescenta somente o pequeno cabeçalho/metadados.
- A cópia pré-restauração é baixada no mesmo formato único. A confirmação de download/custódia continua exigida antes da etapa destrutiva.
- O limite técnico de upload conta o pacote inteiro, incluindo os metadados.

Nenhuma migration foi necessária. Não foi removida autenticação, autorização, auditoria, manutenção, drenagem, confirmação forte, invalidação de sessão ou liberação manual.

## Compatibilidade

Backups novos usam `.acorda`. Um `.dump` antigo sozinho não contém prova de autenticidade suficiente e não é aceito no novo seletor. O suporte pode continuar usando o par antigo autenticado pela compatibilidade técnica da API; não foi criado um caminho que aceite dump sem assinatura. A solução mais simples para o administrador é gerar um novo backup.

O pacote `.acorda` não deve ser passado diretamente ao pg_restore externo: o conteúdo precisa primeiro ser extraído e autenticado. O próprio fluxo administrativo faz isso automaticamente.

A chave de assinatura precisa permanecer estável e guardada com segurança no ambiente definitivo. No servidor de desenvolvimento iniciado para esta sessão, a chave é temporária; gerar um novo backup após reiniciar continua sendo necessário para testes locais. Nenhuma configuração de produção foi alterada.

## Validação

- Pacote único: 14 verificações, incluindo transferência incremental de 32 MiB, assinatura, hash, extração e recusas de adulteração.
- Restauração Fase 2: 100 verificações após a correção estrutural descrita abaixo; upload HTTP sem campo manifesto e download pré-restore único autenticado.
- Backup administrativo: 41 verificações.
- Resiliência: 16 verificações/8 cenários; webhook: 16; campanha de aproximadamente 2.000 contatos: 2.421.
- Fase 1: geração 20, restauração 46, aplicação restaurada 7; schema/estrutura preservados.
- Navegador: 37 verificações desktop/mobile, incluindo exatamente um seletor de arquivo.
- Build frontend aprovado: 74 módulos. Sintaxe JavaScript e git diff --check verificados.

Os testes usaram arquivos sintéticos, API mock no navegador e PostgreSQL local descartável. Sem restore de produção, Meta real, mensagens, commit, push ou deploy.

## Arquivos deste ajuste

- backend/src/modules/backups/pacoteBackup.js
- backend/src/modules/backups/backupService.js
- backend/src/modules/backups/backupController.js
- backend/src/modules/backups/restauracaoRoutes.js
- backend/scripts/testarPacoteBackupIsolado.js
- backend/scripts/testarBackups.js
- backend/scripts/testarRestoreFase2Isolado.js
- backend/package.json
- frontend/src/components/RestauracoesAdministrativas.jsx
- frontend/src/pages/BackupsAdministrativos.jsx
- frontend/src/services/backupService.js
- frontend/src/styles/restauracoes.css
- frontend/scripts/testarRestauracaoRenderizada.js
- Este relatório.

Os demais arquivos já modificados no working tree pertencem às etapas anteriores e foram preservados.

## Correção posterior — falsa incompatibilidade estrutural (17/09/2026)

O teste manual revelou “Estrutura incompatível com o ambiente atual”. A assinatura e a leitura do pacote não eram a causa: a comparação usava posições físicas de colunas nas constraints (`conkey`/`confkey`) e ordenações não determinísticas de índices e funções sobrecarregadas.

No banco local, a tabela contatos possui posições de colunas removidas (23, 25 e 26). O pg_dump/pg_restore recompõe as colunas existentes sem essas lacunas, mudando identificadores físicos mesmo quando nomes e relações são iguais. Os testes anteriores partiam predominantemente de schema novo, sem reproduzir esse histórico de remoções.

Correções em `backend/src/modules/backups/ferramentasRestore.js`:

- Constraints comparadas por nomes de colunas locais/referenciadas, preservando a ordem das chaves compostas; referências identificadas por schema e tabela.
- Tipo, validação, adiamento e ações de update/delete das constraints continuam sendo comparados. Nenhuma constraint foi removida ou desabilitada no banco.
- Índices ordenados deterministicamente pela tabela e definição, sem depender da ordem física do catálogo.
- Funções ordenadas pelo nome e assinatura de argumentos, não pelo OID atribuído na criação.
- Comparação de colunas reforçada com tamanho, precisão/escala, tipo subjacente, collation, identidade e expressão de geração.

A correção não tenta normalizar SQL arbitrário com substituições de texto, não ignora todas as diferenças estruturais e não altera as regras de negócio. A cobertura das expressões CHECK permanece a do desenho anterior; este ajuste não é uma prova geral de equivalência semântica de expressões SQL.

Validação adicional em `backend/scripts/testarRestoreFase2Isolado.js`:

1. Fixture com colunas removidas, PK/UNIQUE/FK, múltiplos índices e funções sobrecarregadas.
2. Reprodução antes da correção: upload de backup válido recusado com HTTP 409 e a mesma mensagem da tela.
3. Após a correção: equivalência das sete categorias estruturais após dump/restore isolado e fluxo completo aprovado.
4. Seis controles negativos: tamanho de varchar, escala numérica, coluna referenciada, ação ON DELETE, definição de índice e corpo de função. Todas as mudanças reais foram detectadas.
5. Fase 2: **100 verificações aprovadas**. Regressões: backup administrativo 41; webhook 16; resiliência 16/8 cenários; campanha com aproximadamente 2.000 contatos 2.421.
6. Conferência específica da estrutura do banco local: dump somente de schema, restauração em banco aleatório descartável, ledger técnico e administrador sintético exclusivamente no alvo. As sete categorias comparadas ficaram equivalentes. Não houve restauração no banco de origem nem cópia de seus dados de negócio. O alvo e seu arquivo técnico foram removidos ao terminar.

As falhas anteriores permanecem no histórico; não foram apagadas ou convertidas em sucesso. Não foi criada migration. Sem produção, Meta real, mensagens, commit, push ou deploy.

O backend local foi reiniciado com a correção depois de confirmar manutenção inativa. Backend (`/api/saude/pronto`) e frontend (`/login`) responderam HTTP 200. Como as chaves de desenvolvimento são temporárias, é necessário entrar novamente e gerar um novo arquivo `.acorda` para o próximo teste local. Nenhum restore foi executado no banco de uso local do administrador.

## Correção posterior — admissão interrompida e sessão na preparação (17/09/2026)

### Evidência e causa

A operação local `31c13582-3042-4d5d-9d52-98dcfd4f03ef` entrou em manutenção às 05:06:30 UTC e foi abortada às 05:07:00 UTC, antes do backup pré-restore e antes de restaurar. A drenagem encontrou a admissão HTTP `10cf695e-16a6-4efc-83c0-a9ddb7b8317e`, iniciada às 04:49:58 UTC e sem conclusão. O processo do backend então em execução havia iniciado às 05:02:45 UTC: a pendência pertencia a uma execução anterior. O registro antigo não permite determinar qual URL o originou; não se atribui sua origem a uma rota específica.

O bloqueio de segurança estava correto, mas faltavam uma verificação prévia dessas pendências e uma resposta útil à interface. Durante a espera, o polling recebia 401 pela mudança obrigatória do auth_epoch. A falha posterior não trazia o estado persistido, deixando a tela na confirmação antiga. Também foi encontrada uma janela independente de desconexão durante a gravação da admissão HTTP.

### Correções

- Controle mantém os IDs admitidos nesta instância. Antes de ativar manutenção, a preparação recusa registros abertos desconhecidos pela instância. Podem pertencer a outro processo ainda ativo: **não são encerrados automaticamente**, nem por idade. Esta verificação é conservadora em múltiplas instâncias e não substitui a drenagem após a ativação.
- Listener de conclusão instalado antes da espera pela admissão. Se o cliente já desconectou antes de chamar o handler, a admissão é concluída sem executar negócio. Após admitir o handler, `close` continua não sendo prova de conclusão e continua bloqueando a drenagem.
- Aborto distingue falha de drenagem de falha no backup de segurança. A resposta da requisição original autenticada inclui fase, manutenção e necessidade de novo login, sem detalhes internos de exceções.
- Frontend incorpora a fase retornada mesmo depois de polling 401. Preparação bem-sucedida não consulta novamente com token invalidado e não aparece como erro. HTTP 409 apresenta a orientação do backend.
- Sem migration, sem expiração de histórico e sem liberação automática.

Arquivos desta correção:

- `backend/src/modules/backups/controleRecuperacao.js`
- `backend/src/modules/backups/restauracaoService.js`
- `backend/src/modules/backups/restauracaoRoutes.js`
- `backend/scripts/testarRestoreFase2Isolado.js`
- `frontend/src/components/RestauracoesAdministrativas.jsx`
- `frontend/scripts/testarRestauracaoRenderizada.js`
- Este relatório.

### Testes executados

- Fase 2 em PostgreSQL temporário: **112 verificações aprovadas**, incluindo preparação pela rota HTTP real, recusa prévia de registro desconhecido, ausência de expiração por idade, desconexão antes/depois da admissão, falhas de drenagem/backup com fase na resposta e invalidade do token antigo.
- Regressões no alvo descartável: backup 41; webhook 16; resiliência 16 verificações/8 cenários; campanha de aproximadamente 2.000 contatos 2.421 verificações. Rede externa bloqueada e provider fake.
- Edge com interface real e API simulada: **38 verificações no fluxo normal e 39 no cenário de falha**, incluindo polling 401 antes do aborto. Captura da mensagem e estado de manutenção inspecionada visualmente.
- Build frontend aprovado (74 módulos), sintaxe backend aprovada e `git diff --check` sem erros. Avisos de conversão LF/CRLF não são falhas de whitespace.

### Recuperação pontual do ambiente local

Com o backend local parado, confirmou-se ausência de outras conexões ao banco. Em transação, foram bloqueados/verificados estado, operação e a única admissão esperada. Somente aquele ID recebeu encerramento técnico, com auditoria `admissao_interrompida_verificada` registrando que o processo anterior foi interrompido; não foi considerado concluído apenas por ser antigo. A transação exigiu exatamente um registro afetado. Nenhum histórico foi apagado.

Únicas tabelas alteradas por essa intervenção: `recuperacao.admissoes` e `recuperacao.auditoria`. Não houve restore no banco local de uso, alteração de dados de negócio, alteração de produção ou chamada à Meta. A operação continua `abortado_antes_restore`, a manutenção continua ativa e auth_epoch continua 1. Verificação após reinício: zero admissões abertas, zero webhooks pendentes, backend e frontend HTTP 200.

Próximo passo administrativo: entrar novamente, abrir Backup, revisar e liberar manualmente a manutenção. Para outro teste, gerar novo `.acorda`: o ambiente local continua usando chave de assinatura temporária por processo e os arquivos da execução anterior não devem ser reutilizados. Não foram alterados `.env`, credenciais persistentes, produção, deploy, commit ou push. Reinícios abruptos futuros ainda exigem comprovação técnica de pendências desconhecidas; não foi criado atalho que ignore a drenagem.

## Simplificação da interface e confirmação de sucesso (17/09/2026)

A pedido do administrador, o fluxo visual passou de cinco para três etapas: **Enviar backup → Preparar → Restaurar e concluir**.

- Arquivo e credenciais do administrador do backup agora ficam no mesmo formulário, com uma única ação de validação.
- Resumo e autorização de preparação aparecem juntos. Foram removidos a tela intermediária de revisão, seu checkbox repetido e o botão de avanço até outra confirmação.
- A confirmação forte antes da manutenção e a autorização final de substituição dos dados foram preservadas, assim como custódia externa, novo login, revisão e liberação manual. Não foram preenchidos automaticamente checklists nem removidas proteções do backend.
- Aviso destacado **“Restauração concluída com sucesso”** imediatamente após resposta bem-sucedida da execução. Continua aparecendo quando o estado persistido é `aguardando_revisao`; explica que a integridade foi validada e a manutenção ainda está ativa.
- Após liberação, o aviso só afirma que houve restauração se a operação possuir o metadado persistido `restauradoEm`. Liberação após aborto/cancelamento não é apresentada como restauração bem-sucedida.

Arquivos alterados nesta revisão: `frontend/src/components/RestauracoesAdministrativas.jsx`, `frontend/scripts/testarRestauracaoRenderizada.js` e este relatório.

Validação: build frontend aprovado, 40 verificações renderizadas no fluxo normal, 42 no cenário de aborto com polling 401 e 12 verificações de backup administrativo. Testes exclusivamente com API simulada, incluindo sucesso imediatamente após execução, persistência após novo login, ausência de sucesso durante validação/aborto e ausência de falso sucesso após liberação sem restore. Capturas desktop/mobile geradas; resumo inspecionado visualmente. `git diff --check` sem erros.

Nenhum backend foi reiniciado nesta revisão. Nenhum banco, migration, manutenção, produção, Meta, commit, push ou deploy foi alterado. O relatório da Fase 1 continua sendo um registro histórico daquela fase, não a descrição do fluxo atual.

## Comprovante simples para o administrador (17/09/2026)

Adicionado ao aviso de sucesso: nome e data do backup, data de conclusão registrada, integridade aprovada, situação da manutenção e quantidades de contatos, campanhas e registros do histórico de mensagens. As quantidades vêm do snapshot inspecionado e validado; a tela avisa que reconciliação e alterações posteriores podem mudar os dados atuais. Valores ausentes são explicitamente apresentados como não informados, nunca como zero presumido.

O botão **Conferir dados restaurados** consulta os primeiros 100 contatos pela rota administrativa de revisão somente leitura durante manutenção, apresentando nome e telefone sem JSON técnico. Exige novo login quando a sessão foi invalidada. Depois da liberação, abre o cadastro normal de contatos. O comprovante não aparece em validações de upload, falhas, abortos ou liberações sem restauração comprovada.

O backend passa a guardar o nome original (basename limitado a 255 caracteres) nos metadados da operação e a devolver a operação persistida após a execução bem-sucedida, incluindo a data real de conclusão. Não houve migration. Registros antigos não são reescritos para inventar nomes ausentes.

Arquivos: `restauracaoService.js`, `RestauracoesAdministrativas.jsx`, `testarRestauracaoRenderizada.js` e este relatório. Build aprovado; 44 verificações visuais no cenário normal e 46 no cenário de falha; 112 verificações da Fase 2 em banco temporário; regressões backup 41, webhook 16, resiliência 16/8 cenários, campanhas 2.421. Sintaxe e `git diff --check` aprovados. Nenhum restore no banco de uso local, produção ou chamada Meta real.

O processo local em execução não foi reiniciado para preservar chaves/artefatos de testes manuais. A interface é atualizada pelo Vite; as duas adições de metadados do backend entram em vigor no próximo reinício controlado. A interface tolera a resposta anterior e mostra a data persistida após novo login. Sem commit, push ou deploy.
