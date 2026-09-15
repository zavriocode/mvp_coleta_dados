# Relatório — Melhoria da aba existente de Backup

**Projeto:** ACORDA RJ

**Data:** 10 de setembro de 2026

**Validação:** PostgreSQL temporário isolado e frontend compilado

**Produção, deploy, commit e push:** não realizados

## 1. Arquivos alterados

### Backend

- `backend/src/modules/backups/backupModel.js`;
- `backend/src/modules/backups/backupService.js`;
- `backend/src/modules/backups/backupController.js`;
- `backend/src/modules/backups/backupRoutes.js`;
- `backend/scripts/testarBackups.js`;
- `backend/.env.example`;
- `backend/README.md`.

### Frontend

- `frontend/src/pages/BackupsAdministrativos.jsx`;
- `frontend/src/services/backupService.js`;
- `frontend/src/styles/administrativo.css`;
- `frontend/scripts/testarBackupsAdministrativos.js`;
- `frontend/package.json`.

## 2. Novo fluxo

A aba administrativa de Backup existente passou a separar geração e download:

```text
Gerar novo backup
→ servidor executa o pg_dump
→ auditoria registra resultado, arquivo, responsável, data, tamanho e SHA-256
→ histórico apresenta o backup concluído
→ administrador clica em Baixar
→ navegador baixa o arquivo
→ arquivo temporário é removido do servidor
```

O computador do administrador não precisa ter `pg_dump`. Essa dependência fica
somente no servidor. O histórico mantém a auditoria, mas não mantém o conteúdo
do backup permanentemente.

O arquivo fica disponível uma única vez e, se não for baixado, expira por
padrão após 15 minutos. O prazo pode ser ajustado por
`BACKUP_RETENCAO_TEMPORARIA_MS`. Falhas removem imediatamente qualquer arquivo
parcial.

## 3. Segurança

- geração e download permanecem protegidos por autenticação e autorização de
  administrador no backend;
- usuário sem sessão recebe `401` e operador recebe `403`;
- o arquivo é criado em diretório temporário privado e não é publicado como
  arquivo estático;
- o download usa rota autenticada, `Cache-Control: private, no-store` e é de
  uso único;
- o arquivo é removido após download, falha ou expiração;
- `pg_dump` continua sendo executado sem shell e a senha do banco é enviada
  somente pelo ambiente privado do processo;
- execuções simultâneas continuam bloqueadas pelo advisory lock existente;
- nenhuma credencial é exibida na interface ou armazenada no histórico.

## 4. Testes

O teste backend foi executado em PostgreSQL temporário isolado, forçando no
processo de teste a conexão local. A `DATABASE_URL` externa presente no ambiente
não foi utilizada.

```text
Backups administrativos: 35 verificações aprovadas.
```

Foram validados:

- geração por administrador;
- bloqueio de histórico, geração e download para usuário sem permissão;
- arquivo SQL produzido pelo `pg_dump`, com cabeçalho e dados esperados;
- nome, tipo, tamanho e SHA-256 do arquivo;
- download autenticado;
- remoção após o primeiro download e bloqueio da repetição com `410`;
- auditoria de responsável, data, status, tamanho, nome e falha;
- tratamento de indisponibilidade do `pg_dump` com `503`;
- ausência de comandos de criação de banco, tabela, schema, índice, trigger ou
  função no backup de dados.

O frontend recebeu teste próprio:

```text
Backups administrativos no frontend: 12 verificações aprovadas.
```

Foram confirmados o botão **Gerar novo backup**, os estados em linguagem
administrativa, o histórico, a disponibilidade temporária, a ação **Baixar** e
o uso da rota autenticada.

## 5. Migration

Nenhuma migration foi necessária. A tabela `backups_banco` existente já possui
os campos necessários para status, responsável, datas, tamanho, nome, SHA-256 e
erro. O arquivo temporário não tem caminho nem conteúdo persistido no banco.

## 6. Build e integridade

```text
npm run build
72 módulos transformados; aprovado.

node --check
Cinco arquivos backend alterados aprovados.

git diff --check
Aprovado.
```

Nenhum backup de produção foi executado e nenhum dado existente, campanha,
mensageria, template, integração Meta ou histórico operacional foi alterado.

**MELHORIA DA ABA DE BACKUP APROVADA EM AMBIENTE ISOLADO.**
