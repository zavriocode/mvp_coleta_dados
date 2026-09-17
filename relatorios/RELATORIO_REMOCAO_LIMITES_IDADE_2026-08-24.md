# Relatório — Remoção dos limites de idade

**Projeto:** ACORDA RJ  
**Data:** 24 de agosto de 2026  
**Validação em produção:** 26 de agosto de 2026
**Validação:** PostgreSQL temporário isolado, backend local, frontend compilado e Console da DigitalOcean
**Produção:** migration 019 aplicada após deploy realizado pelo usuário
**Meta real e mensagens:** não acessadas ou enviadas

## 1. Regra final

A idade continua sendo uma informação obrigatória nos cadastros público e
manual. Foi removida a regra de negócio que restringia o cadastro a pessoas de
16 a 120 anos. O sistema agora aceita uma idade inteira não negativa, incluindo
13 anos.

Também foram retirados os campos **Idade mínima** e **Idade máxima** das telas de
contatos, campanhas e relatórios. Parâmetros antigos com esses nomes são
ignorados pelo backend e não voltam a restringir o público de campanhas já
salvas.

O relatório de distribuição por idade foi preservado, pois a idade continua
sendo coletada. A primeira faixa passou de **16 a 24** para **Até 24**.

## 2. Banco e aviso de privacidade

Foi criada a migration incremental:

```text
019_remover_limite_etario_cadastros.sql
```

Ela substitui a constraint histórica de 16 a 120 anos por uma validação que
rejeita somente idade negativa. Idades existentes e registros legados sem idade
são preservados.

O aviso ativo passou para `aviso_privacidade_v4`, sem a declaração de 16 anos ou
mais. A versão anterior permanece armazenada e inativa para preservar os aceites
históricos. As páginas de privacidade e termos passaram a informar que dados de
crianças e adolescentes devem observar o melhor interesse e a legislação
aplicável.

A migration 019 foi validada em PostgreSQL temporário. No banco local, a
migration anterior 018 encontrou um grupo de telefones canônicos duplicados e
bloqueou corretamente a sequência. Após a revisão individual, somente a
duplicata importada incompleta e sem vínculos foi removida em transação; o
cadastro completo e seus relacionamentos foram preservados. O migrador normal
aplicou então as migrations 018 e 019.

Em produção, a consulta inicial confirmou que a migration 018 já estava
aplicada, o índice único estava válido e não havia telefones canônicos
duplicados. Depois do deploy realizado pelo usuário, o Console da DigitalOcean
confirmou a aplicação normal da migration 019, a ativação do aviso
`aviso_privacidade_v4` e a nova constraint de idade.

## 3. Arquivos alterados

### Backend e banco

- `backend/database/migrations/019_remover_limite_etario_cadastros.sql`;
- `backend/database/criar_banco.sql`;
- `backend/src/modules/contatos/contatoService.js`;
- `backend/src/modules/contatos/contatoModel.js`;
- `backend/src/modules/importacoes/importacaoService.js`;
- `backend/src/modules/relatorios/relatorioService.js`;
- `backend/scripts/atualizarIdentidadePublica.js`;
- testes backend relacionados e `backend/package.json`;
- `backend/README.md`.

### Frontend

- `frontend/src/pages/FormularioPublico.jsx`;
- `frontend/src/pages/CadastroManual.jsx`;
- `frontend/src/pages/ContatosAdministrativos.jsx`;
- `frontend/src/pages/CampanhasAdministrativas.jsx`;
- `frontend/src/pages/Relatorios.jsx`;
- `frontend/src/pages/AjudaAdministrativa.jsx`;
- `frontend/src/pages/Privacidade.jsx`;
- `frontend/src/pages/Termos.jsx`;
- `frontend/src/data/textosConsentimento.js`;
- `frontend/src/services/contatoService.js`;
- `frontend/README.md`.

## 4. Testes

```text
Limite etário removido
Idade 13 aceita, idade negativa rejeitada, dados anteriores e textos históricos preservados.

Schema vazio
31 tabelas, 166 bairros e 19 migrations validadas.

Correções finais em banco temporário
11 grupos aprovados: cadastro público, administração, cadastro manual,
importações, relatórios, segurança, campanhas e schema.

Fluxo campanhas e Meta fake
15 grupos aprovados; envio simplificado com 2.421 verificações aprovado.

Prévia frontend
60 verificações aprovadas.

Build frontend
72 módulos transformados; aprovado.

Validação controlada em produção
Migrations 018/019 presentes, idade 13 aceita, idade negativa rejeitada e
zero registros de teste persistidos.

node --check
Arquivos backend alterados aprovados.

git diff --check
Aprovado.
```

Nenhuma chamada real à Meta foi executada e nenhuma mensagem foi enviada. As
consultas e o teste transacional de produção foram executados pelo usuário no
Console da DigitalOcean, sem exibir credenciais e com `ROLLBACK` integral.

## 5. Conclusão

**O SISTEMA CONTINUA COLETANDO A IDADE, ACEITA 13 ANOS E NÃO POSSUI MAIS FILTROS
OU REGRA DE NEGÓCIO DE IDADE MÍNIMA/MÁXIMA.**
