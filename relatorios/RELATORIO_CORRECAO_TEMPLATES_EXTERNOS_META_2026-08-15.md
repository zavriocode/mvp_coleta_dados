# Relatório — Templates externos sincronizados da Meta

**Projeto:** ACORDA RJ  
**Data:** 15 de agosto de 2026  
**Validação:** PostgreSQL temporário isolado e Meta fake  
**Produção, deploy, commit e push:** não realizados

## 1. Causa e correção

O template externo `APPROVED` era aceito na reserva, mas
`metaCloudApiProvider.validarConfiguracaoParaEnvio` classificava a ausência da
imagem de envio como `TEMPLATE_META_INVALIDO`. Em seguida,
`mensageriaService.prepararErroProvider` intitulava qualquer falha dessa etapa
como **Falha no envio pela Meta**, embora o `fetch` da Meta ainda não tivesse
sido executado.

A correção separa definitivamente:

- **validade oficial:** `meta_status_oficial = APPROVED`;
- **origem:** `meta_origem = meta` para sincronizado externamente e `interno`
  para criado no ACORDA RJ;
- **configuração operacional:** mídia e parâmetros necessários no envio.

O modelo externo é importado pelo sincronizador como `meta`, permanece
`APPROVED`, não recebe `meta_submetido_em` inventado e não depende de
`header_handle`, imagem de exemplo, submissão interna ou nova aprovação.

Nenhuma migration foi necessária: `meta_origem`, `meta_componentes` e
`meta_configuracao_envio` já representam corretamente esses estados.

## 2. HEADER IMAGE e mídia

A mídia continua obrigatória no envio de um modelo com `HEADER IMAGE`. O payload
oficial exige um componente `header` contendo `image.id` ou `image.link`.
O `header_handle` usado na aprovação não é reutilizado como mídia de envio.

Referências oficiais da Meta:

- https://www.postman.com/meta/whatsapp-business-platform/request/2qbotrb/send-message-template-media
- https://www.postman.com/meta/whatsapp-business-platform/request/iyy9vwt/upload-media

Quando faltar mídia, o sistema agora bloqueia antes do provider com:

```text
MIDIA_TEMPLATE_NAO_CONFIGURADA
Configuração necessária para o envio
Este modelo está aprovado, mas falta configurar a imagem que será usada no envio.
```

A falha recebe categoria `configuracao_template`, fica reprocessável e não é
apresentada como falha da Meta. A imagem pode ser configurada pela função já
existente, usando upload para obter `image.id` ou URL HTTPS para `image.link`.

## 3. Interface

Na lista de modelos, um template externo aparece como:

```text
Aprovado pela Meta
Sincronizado diretamente da conta oficial da Meta
Imagem para envio — Não configurada
[Configurar imagem]
```

O status oficial não é alterado. A ação abre somente a configuração de envio;
não recria nem submete novamente o template.

## 4. Reprocessamento

Depois de configurar a imagem, **Tentar enviar novamente** preserva a tentativa
antiga com `MIDIA_TEMPLATE_NAO_CONFIGURADA`, cria a tentativa seguinte e usa o
payload correto. Campanha, lote, participação e contato não são duplicados.

## 5. Arquivos alterados

- `backend/src/modules/mensageria/metaCloudApiProvider.js`;
- `backend/src/modules/mensageria/mensageriaService.js`;
- `backend/src/modules/mensageria/mensageriaModel.js`;
- `backend/scripts/testarTemplatesExternosMeta.js`;
- `backend/scripts/testarTemplatesMeta.js`;
- `backend/scripts/testarFluxoCampanhasMetaIsolado.js`;
- `backend/package.json`;
- `frontend/src/pages/CampanhasAdministrativas.jsx`;
- `frontend/src/styles/administrativo.css`;
- `frontend/scripts/testarPreviaModeloMensagem.js`.

## 6. Testes e resultados

```text
npm run testar:fluxo-campanhas-meta
8 grupos aprovados.

Templates externos da Meta: 20 verificações aprovadas.
Campanhas, lotes e mensageria: 27 verificações aprovadas.
Templates oficiais da Meta: 38 verificações aprovadas.
Integração Meta com mocks: 16 verificações aprovadas.
Envio simplificado de campanhas: 2.421 verificações aprovadas.

npm run testar:previa-modelo
22 verificações aprovadas.

npm run build
72 módulos transformados; build aprovado.
```

O teste específico percorreu o fluxo real interno:

```text
Meta fake → sincronização → template externo APPROVED → campanha
→ bloqueio local sem mídia → configuração por link → reprocessamento
→ provider fake com image.link
```

Também foram aprovados:

- sintaxe dos seis arquivos backend relevantes;
- persistência da categoria do erro local;
- ausência de duplicidade no reprocessamento;
- `git diff --check`.

## 7. Conclusão

- nenhuma chamada real à Meta;
- nenhum envio real de WhatsApp;
- nenhum custo real;
- nenhum deploy, commit ou push.

**PRONTO PARA REPETIR O TESTE REAL CONTROLADO**, depois de publicar esta correção
e aplicar normalmente qualquer migration pendente já existente no deploy.

