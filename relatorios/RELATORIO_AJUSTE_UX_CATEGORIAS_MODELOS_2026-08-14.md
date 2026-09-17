# Relatório — Ajuste de categorias dos modelos de mensagem

**Projeto:** ACORDA RJ  
**Data:** 14 de agosto de 2026  
**Escopo:** frontend; sem deploy, banco ou chamada à Meta

## Verificação do “Grupo para organização”

O campo interno `categoria` é armazenado em `modelos_mensagem` e continua sendo
exigido pelo contrato atual, mas não possui uso em filtros, campanhas, lotes,
relatórios, permissões, envio ou integração Meta. Na interface ele servia apenas
para digitar uma classificação interna sem efeito operacional.

O campo foi removido da tela. Novos modelos continuam enviando internamente o
valor compatível `Geral`, e modelos existentes preservam o valor já salvo durante
a edição. Nenhuma migration, tabela, API ou validação backend foi alterada.

## Categorias oficiais

A interface atual suporta exatamente as duas categorias aceitas pelo fluxo
backend existente:

- **Marketing** — mensagens de divulgação, convites, campanhas e comunicação
  promocional;
- **Utilidade** — mensagens relacionadas a uma ação, serviço ou informação
  esperada pelo usuário.

Os valores enviados continuam sendo os oficiais `MARKETING` e `UTILITY`. A lista
de modelos também passou a mostrar “Marketing” ou “Utilidade”, sem expor a antiga
classificação interna como alternativa.

## Arquivos alterados

- `frontend/src/pages/CampanhasAdministrativas.jsx`;
- `frontend/public/guia/modelos.png`;
- `RELATORIO_AJUSTE_UX_CATEGORIAS_MODELOS_2026-08-14.md`.

## Testes

- build Vite aprovado com 71 módulos;
- interface real renderizada com respostas locais controladas;
- ausência do campo “Grupo para organização” confirmada;
- opções “Marketing” e “Utilidade” confirmadas;
- explicação contextual de Marketing confirmada;
- console do navegador sem erros;
- `git diff --check` aprovado.

Nenhuma regra de campanha, lote, template Meta, banco ou envio foi alterada.
Nenhuma chamada à Meta foi realizada.
