# Backup completo e restauração — diagnóstico inicial

## Estado desta análise

Inspeção do código; nenhuma implementação, migration, backup ou restauração executada nesta etapa.

## Backup existente

`backend/src/modules/backups/backupService.js` executa `pg_dump` com
`--format=plain --data-only --blobs --no-owner --no-password --encoding=UTF8`.
Não há filtros de tabelas, schemas nem exclusões de dados. Entram dados das
tabelas não sistêmicas acessíveis, large objects e valores de sequences.
Não entram as definições de tabelas, índices, constraints, funções e triggers.
Portanto, o download atual não reconstrói sozinho um banco vazio.

O registro existente contém responsável, datas, tamanho, SHA-256, formato,
status e erro. Faltam metadados de versão PostgreSQL, migrations e restauração.
Arquivos ficam em diretório temporário, com referência em memória, e são
removidos após download ou expiração. Não existe repositório durável de recuperação.

As rotas de geração/download exigem autenticação e perfil administrador.
A execução usa `spawn` sem shell e senha no ambiente do subprocesso.
O advisory lock `82174999` serializa backups; ele não bloqueia campanhas,
webhooks, importações nem tarefas periódicas.

## Pontos que precisam ser resolvidos no desenho

1. Um dump custom contém SQL executável. Cabeçalho, extensão, SHA-256 calculado
   no upload e `pg_restore --list` não comprovam origem confiável. Um banco
   temporário no mesmo servidor, usando a credencial da aplicação, também não
   constitui uma barreira suficiente contra um dump malicioso.
2. A procedência precisa ser autenticada antes do restore: assinatura com chave
   externa preservada pelo responsável, ou comparação com um SHA-256 previamente
   registrado e confiável. A segunda alternativa, isoladamente, não cobre perda
   completa do banco que armazenava o registro.
3. O backup de segurança precisa sobreviver à perda/recriação do container.
   O armazenamento temporário atual não garante isso. Download confirmado pelo
   responsável antes da etapa destrutiva é uma alternativa sem serviço externo.
4. A manutenção precisa atingir requisições em curso e tarefas periódicas em
   todas as instâncias, incluindo recuperação de mensageria e sincronização de
   templates. Uma variável em memória ou um bloqueio somente na aba Backup não
   oferece essa garantia.
5. Restaurar um ponto anterior também recupera usuários, consentimentos e
   tentativas antigos. É necessário impedir retomada de envios e acesso com
   sessões anteriores até a revisão operacional. Eventos ocorridos depois da
   data do backup não podem ser reconstruídos a partir desse arquivo.
6. A validação de integridade deve preceder a promoção do estado restaurado,
   com falha mantendo o sistema em manutenção e a cópia anterior recuperável.

## Proposta para a implementação

- Dump completo custom PostgreSQL 18, acompanhado de manifesto autenticado com
  versão, migrations, contagens e hash do arquivo.
- Chave exclusiva de assinatura, externa ao banco e ao arquivo, com instruções
  para custódia e recuperação; não reutilizar JWT_SECRET nem token Meta.
- Upload privado limitado e temporário; autenticação do manifesto e do dump
  antes de executar `pg_restore`.
- Restauração inicial isolada, validação de estrutura, dados e sequences.
- Confirmação administrativa forte, manutenção persistente, drenagem de tarefas,
  backup pré-restauração e download obrigatório antes da substituição.
- Promoção transacional, auditoria de recuperação preservada separadamente do
  conjunto substituído e manutenção após o restore até revisão administrativa.
- Sem retorno automático de campanhas ou chamadas à Meta.

## Validação ainda pendente

Nenhum teste de backup → restore foi executado nesta etapa. Não há aprovação
de restauração operacional nem alteração de produção.

Referência: https://www.postgresql.org/docs/18/app-pgrestore.html
(aviso sobre execução de código presente no dump e opção `--single-transaction`).
