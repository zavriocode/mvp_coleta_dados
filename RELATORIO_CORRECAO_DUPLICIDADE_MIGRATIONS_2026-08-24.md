# Relatório — Duplicidade que bloqueava as migrations 018 e 019

**Projeto:** ACORDA RJ  
**Data:** 24 de agosto de 2026  
**Validação em produção:** 26 de agosto de 2026
**Banco corrigido:** PostgreSQL local  
**Produção:** diagnosticada e validada pelo Console da DigitalOcean após deploy realizado pelo usuário
**Meta real e mensagens:** não acessadas ou enviadas

## 1. Causa da duplicidade

O banco local possuía um contato manual completo com o telefone brasileiro
normalizado e um segundo registro importado com o mesmo telefone ainda contendo
o prefixo internacional `55`. Antes da normalização canônica atual, os dois
formatos eram aceitos como valores diferentes.

A migration 018 converte ambos para a mesma chave canônica e, corretamente,
interrompeu a execução antes de criar o índice único.

## 2. Grupos encontrados e resolução

Foi encontrado exatamente **um grupo duplicado**, contendo dois registros.

- foi preservado o cadastro manual completo, com idade, bairro, necessidade,
  dois consentimentos ativos, inscrição em evento e aceite de privacidade;
- foi removido somente o registro importado incompleto, identificado como uma
  entrada da lista da própria pessoa;
- o registro removido não possuía consentimentos, bloqueios, eventos, campanha,
  participação, tentativa, comunicação, aceite de privacidade, importação
  vinculada, pedido de exclusão ou histórico;
- a exclusão foi individual, dentro de transação, com locks, revalidação dos
  dois IDs e verificação de todas as FKs imediatamente antes do `DELETE`.

Nenhum contato fora desse grupo foi alterado. Os dados e relacionamentos do
cadastro preservado foram recontados depois da operação e permaneceram íntegros.

## 3. Migrations

Depois da correção, o migrador normal foi executado sem marcação manual e
aplicou, nesta ordem:

```text
Migration aplicada: 018_garantir_telefone_canonico_unico.sql
Migration aplicada: 019_remover_limite_etario_cadastros.sql
```

Foi confirmado que:

- não restou nenhum grupo de telefone canônico duplicado;
- `contatos_telefone_normalizado_unico` está único e válido;
- as versões `018` e `019` constam no ledger normal;
- idade 13 é aceita;
- idade negativa é rejeitada com PostgreSQL `23514`;
- o teste de idade foi executado em transação e desfeito com `ROLLBACK`.

No PostgreSQL de produção, a consulta inicial confirmou que a migration 018 já
estava aplicada, o índice de telefone estava único e válido e não existia grupo
de telefone canônico duplicado. Portanto, nenhuma exclusão ou consolidação foi
necessária em produção.

Depois do deploy realizado pelo usuário, uma nova consulta pelo Console da
DigitalOcean confirmou que as migrations 018 e 019 constam no ledger, a
constraint final aceita `idade IS NULL OR idade >= 0` e o aviso ativo é
`aviso_privacidade_v4`.

## 4. Testes

```text
Correções finais em PostgreSQL temporário
11 grupos aprovados.

Telefone canônico
Colisão, cadastro manual, formulário, importação e concorrência aprovados.

Cadastro público
43 verificações aprovadas.

Administração
44 verificações aprovadas.

Cadastro manual
30 verificações aprovadas.

Relatórios
25 verificações aprovadas; faixa inicial “Até 24” preservada.

Estrutura do banco local
25 verificações aprovadas.

Migration de idade em banco temporário
Idade 13 aceita, idade negativa rejeitada e histórico de avisos preservado.

Validação controlada em produção
Idade 13 aceita, idade negativa rejeitada e zero registros de teste persistidos.

Build frontend
72 módulos transformados; aprovado.

node --check
Arquivos backend alterados aprovados.

git diff --check
Aprovado.
```

Os filtros de idade mínima e máxima continuam removidos do frontend e do
contrato processado pelo backend.

## 5. Arquivos alterados nesta correção

- `backend/scripts/testarEstruturaBanco.js`, para substituir a antiga idade 15
  pela idade negativa no teste da constraint vigente;
- `RELATORIO_CORRECAO_DUPLICIDADE_MIGRATIONS_2026-08-24.md`.

Os utilitários pontuais usados no diagnóstico e na transação foram removidos
depois da execução; nenhum script destrutivo ficou disponível no projeto.

## 6. Validação de produção

Como o acesso externo direto continuou bloqueado por timeout, as consultas foram
executadas pelo usuário no Console do backend, que já é uma fonte confiável da
DigitalOcean. Os resultados apresentados pelo PostgreSQL de produção foram:

```text
migrations: 018 e 019
índice de telefone: único e válido
grupos canônicos duplicados: 0
constraint de idade: idade nula ou maior/igual a zero
aviso ativo: aviso_privacidade_v4
idade 13: aceita
idade negativa: rejeitada
registros de teste persistidos: 0
```

O teste de idade foi executado dentro de transação e finalizado com `ROLLBACK`.
Nenhuma credencial, URL de conexão ou telefone completo foi registrada neste
relatório.
