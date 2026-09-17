# Relatório — Evolução de UX para o usuário final

**Projeto:** ACORDA RJ  
**Data:** 14 de agosto de 2026  
**Validação:** ambiente local, banco de desenvolvimento e Meta fake  
**Produção:** não acessada  
**Deploy, commit e push:** não realizados

## 1. Telas revisadas

Foram revisadas as áreas administrativas de visão geral, contatos, detalhes do
contato, cadastro manual, eventos, importações, relatórios, campanhas, modelos
de mensagem, grupos de envio, tentativas, exclusões, usuários e backups.

As mudanças foram concentradas em **Campanhas**, **Modelos de mensagem**, menu
administrativo e na nova tela **Como usar**. As telas que já estavam claras
foram preservadas.

## 2. Termos técnicos removidos ou traduzidos

Na interface de modelos, foram substituídos termos técnicos por linguagem
operacional, entre eles:

- template → modelo de mensagem;
- categoria interna → grupo para organização;
- categoria oficial → tipo de mensagem na Meta;
- configurar envio → definir informações de envio;
- parâmetro → valor personalizado;
- template ativo → disponível para uso no ACORDA RJ.

Identificadores técnicos de mídia, `PHONE_NUMBER_ID`, Graph API, payload,
`header_handle` e token não precisam ser informados pelo usuário.

## 3. Campos com ajuda contextual

Receberam explicação próxima ao campo:

- nome usado na Meta;
- imagem de exemplo para aprovação;
- imagem usada nas mensagens;
- imagem do dispositivo ou da internet;
- texto principal;
- exemplos apresentados à Meta;
- significado de cada valor personalizado;
- estados dos modelos;
- ação de enviar para análise;
- criação de grupos e envio real das mensagens.

Também foi adicionado o link **Precisa de ajuda? Veja o passo a passo** na área
de modelos.

## 4. Funcionamento de `{{1}}`, `{{2}}` e seguintes

O sistema detecta automaticamente a sequência usada no texto principal e cria
um campo de configuração para cada posição. A interface explica que esses
valores mudam automaticamente em cada mensagem e apresenta um exemplo prático.

A validação existente continua exigindo sequência contínua, exemplos para a
análise da Meta e uma configuração válida para cada posição.

## 5. Definição do significado de cada valor

O administrador escolhe, para cada posição:

- nome da pessoa;
- bairro;
- principal necessidade;
- texto igual para todos.

O mesmo mapeamento explícito passou a ser apresentado para `{{1}}` no cabeçalho
de texto. Nenhum campo inexistente foi inventado.

## 6. Comportamento quando o valor está ausente

O backend não inventa nem envia texto vazio. A tentativa é interrompida antes
da chamada ao provider e informa ao operador, por exemplo:

```text
Este contato não possui a informação necessária para preencher {{2}}.
```

## 7. Imagem escolhida no dispositivo

O administrador escolhe um JPG ou PNG de até 5 MB no computador ou celular. O
backend valida MIME e assinatura real do arquivo, envia a mídia pelo contrato
oficial da Meta e guarda a referência retornada na configuração de envio. O
identificador não é digitado nem exibido ao usuário.

## 8. Imagem informada por URL

O administrador pode escolher **Usar imagem da internet** e informar uma URL
pública HTTPS. O provider preserva o uso oficial de `image.link`.

A troca entre dispositivo e internet limpa o valor incompatível da opção
anterior, evitando confundir uma URL com uma referência de mídia.

## 9. Contrato oficial da Meta utilizado

Para imagem selecionada no dispositivo, foi usado:

```text
POST /{PHONE_NUMBER_ID}/media
```

com `multipart/form-data`, `messaging_product=whatsapp` e o arquivo. No envio do
modelo, o cabeçalho utiliza `image.id` ou `image.link`, conforme a opção.

Referências oficiais:

- https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media/
- https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates/
- https://www.postman.com/meta/whatsapp-business-platform/request/iyy9vwt/upload-media
- https://www.postman.com/meta/whatsapp-business-platform/request/2qbotrb/send-message-template-media

## 10. Tratamento interno da referência de mídia

A referência oficial retornada pela Meta é recebida e usada pelo backend como
`image.id`. Ela não aparece como campo técnico na interface e não depende de
digitação manual. Tokens e identificadores de configuração permanecem apenas no
backend.

## 11. Área Como usar

Foi criada a rota protegida:

```text
/admin/ajuda
```

Ela aparece no menu como **Como usar**, utiliza tópicos expansíveis e links
internos. Links para Backups e Usuários só são apresentados como ações para
administradores; operadores recebem a indicação clara da restrição.

## 12. Tópicos incluídos

- início e fluxo geral;
- contatos e consentimentos;
- eventos;
- importações CSV, XLSX e VCF;
- campanhas, público, grupos e envios;
- modelos, estados, imagens e valores personalizados;
- opt-out/SAIR;
- relatórios;
- backups;
- usuários e permissões.

## 13. Links contextuais

A Central possui atalhos para as telas reais do sistema. A tela de Modelos de
mensagem abre diretamente o tópico correspondente em `/admin/ajuda#templates`.
O tópico é aberto e levado à área visível automaticamente.

## 14. Melhorias para celular e tablet

Foram adicionadas regras responsivas para:

- escolha da origem da imagem;
- campos de valores personalizados;
- cabeçalho e ações de modelos;
- navegação dos tópicos de ajuda;
- accordions;
- botões e links internos.

O seletor de arquivo aceita a galeria/arquivos do dispositivo sem exigir um
componente externo.

## 15. Mensagens de erro melhoradas

Foram adicionadas mensagens operacionais para:

- dado personalizado ausente;
- arquivo JPG/PNG inválido;
- imagem não selecionada;
- URL não informada;
- falha ao preparar a imagem;
- credencial Meta que precisa ser conferida pelo administrador.

Os detalhes técnicos continuam restritos aos logs e códigos internos.

## 16. Arquivos alterados

### Backend

- `backend/scripts/testarTemplatesMeta.js`;
- `backend/src/modules/campanhas/campanhaController.js`;
- `backend/src/modules/campanhas/campanhaRoutes.js`;
- `backend/src/modules/campanhas/campanhaService.js`;
- `backend/src/modules/campanhas/templateMetaService.js`;
- `backend/src/modules/mensageria/mensageriaModel.js`;
- `backend/src/modules/mensageria/mensageriaService.js`;
- `backend/src/modules/mensageria/metaCloudApiProvider.js`.

### Frontend

- `frontend/src/App.jsx`;
- `frontend/src/components/CabecalhoAdministrativo.jsx`;
- `frontend/src/pages/AjudaAdministrativa.jsx`;
- `frontend/src/pages/CampanhasAdministrativas.jsx`;
- `frontend/src/services/campanhaService.js`;
- `frontend/src/styles/administrativo.css`.

Nenhuma migration, tabela ou regra de elegibilidade/capacidade foi alterada.

## 17. Testes executados

```text
npm run testar:templates-meta
Templates oficiais da Meta: 38 verificações aprovadas.

npm run testar:meta
Integração Meta com mocks: 16 verificações aprovadas.

npm run testar:campanhas
Campanhas, lotes e mensageria: 27 verificações aprovadas.
```

Também passaram a validação de sintaxe dos oito arquivos JavaScript backend
alterados, a busca de segredos no frontend/bundle e `git diff --check`.

Os testes cobriram modelo sem valores personalizados, uma e duas posições,
sequência inválida, configuração ausente, dado ausente, texto fixo, payload,
exemplos, cabeçalho com imagem por URL e por ID, upload do dispositivo, erros,
permissão administrativa já preservada na rota e integração com campanhas.

## 18. Build

```text
npm run build
71 módulos transformados; build concluído com sucesso.
```

## 19. Ausência de chamada real à Meta

Upload, submissão, sincronização e envio utilizaram `fetch` fake/mocks. Nenhuma
requisição real foi feita à Meta e nenhuma mensagem foi enviada.

## 20. Custo real

Os testes utilizaram somente recursos locais e dados artificiais.

```text
Custo real: zero.
```

## 21. Pontos deliberadamente preservados

Não foram alterados:

- regras de campanhas, lotes, capacidade, consentimentos e opt-out;
- locks, idempotência, concorrência e auditoria;
- contratos existentes fora do suporte oficial necessário para a imagem;
- banco, schema e migrations aplicadas;
- autenticação e permissões;
- demais telas que já apresentavam linguagem adequada;
- infraestrutura de armazenamento externa, pois não é necessária neste fluxo.

Não houve deploy, commit, push, uso de produção ou envio real.
