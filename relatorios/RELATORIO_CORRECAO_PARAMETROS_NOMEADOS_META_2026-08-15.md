# Relatório — Correção definitiva dos parâmetros nomeados da Meta

**Projeto:** ACORDA RJ  
**Data:** 15 de agosto de 2026  
**Evidência externa:** consulta real somente leitura à Meta e ao PostgreSQL publicado  
**Validação da correção:** PostgreSQL temporário isolado e provider Meta fake  
**Deploy, commit e push:** não realizados

## 1. Evidência real da Meta

Foi executado somente um `GET` na Graph API para o modelo
`convite_pesquisa_acorda_rj`, idioma `pt_BR`. A resposta oficial informou:

```text
status: APPROVED
category: MARKETING
parameter_format: NAMED
HEADER: IMAGE
BODY: 1 marcador, {{nome}}
BUTTONS: URL e QUICK_REPLY
```

Nenhum template foi criado, alterado ou novamente submetido. Nenhuma mensagem
real foi enviada.

## 2. Evidência real do banco publicado

A consulta foi executada no Console do próprio App Platform, dentro de uma
transação `BEGIN READ ONLY`, encerrada com `ROLLBACK`.

O registro persistido continha corretamente o texto com `{{nome}}`, mas o
componente BODY apresentava:

```text
parameter_format: ausente
configuração operacional do BODY: vazia
```

Portanto, a sincronização preservava o texto, mas descartava o metadado oficial
que determina como o parâmetro deve ser enviado.

## 3. Causa raiz

O provider consultava somente:

```text
id,name,language,status,category,components
```

O campo oficial `parameter_format` não era solicitado. O service também não o
normalizava nem o incorporava aos componentes persistidos. Depois da releitura,
o analisador procurava exclusivamente marcadores posicionais `{{1}}`, `{{2}}`
e seguintes.

Como o modelo real utiliza `{{nome}}`, o sistema concluía incorretamente que o
BODY esperava zero parâmetros. A Meta, que conhece a estrutura oficial,
rejeitava o payload com erro `132000`, informando zero enviado e um esperado.

## 4. Correção aplicada

- as três consultas oficiais de templates passaram a solicitar
  `parameter_format`;
- o service valida `NAMED` e `POSITIONAL` e preserva o formato dentro dos
  componentes BODY/HEADER já armazenados em `meta_componentes`;
- o analisador reconhece descritores posicionais e nomeados sem hardcode de
  `nome` ou de qualquer modelo específico;
- a configuração operacional continua sendo um array ordenado, mas agora cada
  posição corresponde ao marcador oficial identificado;
- parâmetros nomeados são enviados com `type: text`, `parameter_name` oficial e
  o valor obtido do mapeamento escolhido pelo administrador;
- ausência de mapeamento ou de dado do contato bloqueia localmente o envio com
  `CONFIGURACAO_ENVIO_INCOMPLETA`;
- a invariância pré-Meta compara esperado, configurado, resolvido, enviado e os
  nomes oficiais dos parâmetros;
- o log estrutural registra formato e nomes técnicos dos parâmetros, sem valor
  preenchido, telefone, imagem, token ou cabeçalho de autorização.

Não houve conversão artificial de `{{nome}}` para `{{1}}`.

## 5. Interface administrativa

Ao editar um modelo oficial `NAMED`, a interface agora mostra o marcador real,
por exemplo:

```text
{{nome}}
```

Se não houver configuração persistida, a opção começa em **Escolha uma
informação**. O administrador deve escolher explicitamente Nome da pessoa,
Bairro, Principal necessidade ou Texto igual para todos. O sistema não deduz o
significado apenas pelo nome técnico do marcador.

A prévia visual também resolve marcadores nomeados na ordem oficial depois da
configuração.

## 6. Persistência e sincronizações futuras

Na próxima sincronização oficial após a publicação, o modelo já existente será
atualizado porque seus componentes ainda não possuem `parameter_format`. O
status `APPROVED`, a origem `meta`, a imagem de envio local e demais
configurações existentes permanecem preservados.

O webhook também consulta o mesmo contrato completo, portanto atualizações
futuras não voltam a perder o formato.

Nenhuma migration foi necessária: `meta_componentes` já é JSONB e comporta o
metadado oficial sem mudança estrutural.

## 7. Teste integrado

Foi criado o teste:

```text
backend/scripts/testarParametrosNomeadosMeta.js
```

O cenário percorreu:

```text
Meta fake com parameter_format=NAMED e {{nome}}
→ sincronização real do service/model
→ persistência no PostgreSQL temporário
→ releitura pela query do sistema
→ bloqueio sem mapeamento
→ configuração explícita de nome_contato
→ nova sincronização preservando configuração local
→ análise de requisitos
→ provider fake com parameter_name=nome
```

Também confirmou que HEADER IMAGE e botões oficiais permaneceram inalterados e
que dado ausente bloqueia antes do provider.

## 8. Resultados

```text
npm run testar:fluxo-campanhas-meta
14 grupos aprovados.

Parâmetros nomeados da Meta: 21 verificações aprovadas.
Requisitos centralizados: 26 verificações aprovadas.
Regressão Meta 132000 posicional: 13 verificações aprovadas.
Retry HTTP: 12 verificações aprovadas.
Templates oficiais: 38 verificações aprovadas.
Templates externos: 22 verificações aprovadas.
Envio simplificado: 2.421 verificações aprovadas.

npm run testar:previa-modelo
39 verificações aprovadas.

npm run build
72 módulos transformados; build aprovado.
```

Também passaram:

- sintaxe dos arquivos JavaScript backend alterados;
- `git diff --check`;
- remoção completa do PostgreSQL temporário ao final.

## 9. Segurança e escopo preservado

- nenhum envio real;
- nenhuma escrita na Meta;
- nenhuma escrita no banco publicado;
- nenhum dado pessoal registrado nos novos logs;
- nenhuma migration ou alteração de tabela;
- nenhuma mudança em campanhas, lotes, capacidade, imagem, SAIR, webhook,
  opt-out, concorrência ou idempotência;
- nenhum deploy, commit ou push.

## 10. Ação após publicar

1. confirmar que a sincronização automática ou **Atualizar modelos da Meta**
   registrou `NAMED`;
2. abrir **Definir informações de envio**;
3. em `{{nome}}`, escolher **Nome da pessoa**;
4. salvar;
5. repetir o teste real controlado com dois contatos.

## 11. Pendência de segurança externa

A string completa do banco apareceu em uma captura durante o diagnóstico. Essa
credencial deve ser tratada como exposta. Não desconectar, recriar ou apagar o
banco. A rotação deve ser feita de forma coordenada com a configuração do App
Platform e validada pelo health check do backend.

## Conclusão

**CAUSA REAL COMPROVADA E SUPORTE A PARÂMETROS NOMEADOS CORRIGIDO NO FLUXO
COMPLETO, SEM HARDCODE E SEM ALTERAÇÃO ESTRUTURAL DO BANCO.**
