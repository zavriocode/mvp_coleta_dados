# Relatórios do projeto

Os arquivos desta pasta registram auditorias, decisões e entregas por data. Eles
não devem ser lidos isoladamente como descrição do estado atual.

## Referências atuais

1. [Status final do projeto](../STATUS_FINAL_DO_PROJETO.md)
2. [Documentação Técnica Oficial](../DOCUMENTACAO_TECNICA_OFICIAL.md)
3. [Prompt Mestre de reconstrução](../PROMPT_MESTRE.md)
4. [Homologação pré-deploy](RELATORIO_HOMOLOGACAO_PRE_DEPLOY_2026-09-17.md)
5. [Auditoria final de entrega](RELATORIO_AUDITORIA_FINAL_ENTREGA_2026-09-17.md)
6. [Backup em arquivo único](RELATORIO_BACKUP_ARQUIVO_UNICO.md)
7. [Restauração administrativa — Fase 2](RELATORIO_RESTAURACAO_ADMINISTRATIVA_FASE_2.md)

## Como interpretar os demais arquivos

- Relatórios com datas anteriores preservam o estado existente naquele momento.
- Contagens antigas de migrations, módulos ou testes não substituem as atuais.
- Menções a backup SQL `data-only`, arquivo `.dump`, dois arquivos de validação,
  ausência de restore ou Fase 2 não implementada são históricas.
- O formato atual é um único `.acorda` autenticado.
- O schema atual possui 31 tabelas operacionais e migrations 001 a 023.
- O restore administrativo está implementado e exige manutenção, pré-backup,
  validação, reconciliação, revisão e liberação manual.

Os documentos históricos não foram apagados porque sustentam rastreabilidade de
decisões, defeitos e validações anteriores.
