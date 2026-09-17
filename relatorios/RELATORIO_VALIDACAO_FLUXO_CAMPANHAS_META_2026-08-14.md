# Relatório — Validação focada do fluxo Campanhas → Meta

**Projeto:** ACORDA RJ  
**Data:** 14 de agosto de 2026  
**Ambiente:** PostgreSQL temporário e isolado, dados artificiais e provider Meta fake  
**Produção:** não acessada  
**Envio real/custo:** nenhuma chamada real, nenhuma mensagem e custo real zero

## 1. Campanhas e filtros testados

Foram validados criação de campanha com template e filtros por bairro, problema,
origem, idade mínima/máxima, consentimento, evento, ausência de evento e cadastro
incompleto, além das combinações previstas no fluxo atual. A tela de criação foi
completada com os filtros de origem e faixa etária que já eram aceitos pelo
backend, sem modificar a semântica dos filtros.

## 2. Eventos e combinações

Foram testados contato em um evento, contato em vários eventos, evento A, evento
B, sem evento e combinações de evento com bairro, problema, idade e
consentimento. O vínculo com vários eventos não duplicou o contato dentro da
mesma campanha.

## 3. Encontrados, aptos e não aptos

As contagens foram comparadas com o estado persistido. No cenário de escala,
foram encontrados 10.005 contatos: 10.000 aptos e 5 não aptos por recusa,
revogação, bloqueio, exclusão pendente ou opt-out. A prévia visual foi limitada
a 1.000 registros, enquanto os totais e a reserva continuaram considerando os
10.005 registros reais.

## 4. Lotes e capacidade

O backend recalculou a capacidade dentro da transação e reservou somente
contatos aptos. Pedido acima da capacidade foi bloqueado integralmente, sem lote,
participação ou reserva parcial. Também foram testados público restante menor que
o pedido e capacidade menor que o pedido.

## 5. Cenário 10.000 / 2.000

Com 10.000 contatos elegíveis e capacidade operacional efetiva de 2.000, foram
criados cinco lotes sucessivos de 2.000 contatos na mesma campanha. O relógio de
teste avançou a janela móvel de 24 horas entre os lotes. O resultado final foi
10.000 participações para 10.000 contatos distintos.

## 6. Duplicidade

Nenhum contato entrou duas vezes na mesma campanha. Os lotes seguintes avançaram
sobre o público restante. Os mesmos contatos puderam participar de outra
campanha, quando ainda elegíveis, conforme a regra do sistema.

## 7. Concorrência, clique duplo e idempotência

Foram exercitados clique duplo com a mesma chave, reservas simultâneas e criação
concorrente de lotes. Advisory lock, transação, `FOR UPDATE SKIP LOCKED`, chave
de idempotência e constraints impediram lote duplicado, participação duplicada e
consumo acima da capacidade.

## 8. Tentativas e reprocessamento

Foram conferidos campanha, lote, participação, tentativa, número da tentativa,
external message ID fake, estados e histórico. Na falha simulada, o
reprocessamento preservou lote, participação, tentativa e erro anteriores e
criou somente uma nova tentativa, sem segunda participação.

## 9. Template aprovado e não aprovado

Template não aprovado foi bloqueado antes do provider. Template `APPROVED` vindo
do mock oficial percorreu o pipeline completo. Nenhuma aprovação local foi
inventada; a Meta permanece a autoridade do status oficial.

## 10. Suporte encontrado para HEADER IMAGE

O projeto já modelava `HEADER` no formato `IMAGE` e o provider já montava o
parâmetro de imagem no envio. A lacuna estava na preparação oficial da imagem de
exemplo exigida para submissão do template: a interface expunha um handle técnico
para digitação manual e não realizava o upload resumível oficial.

## 11. Implementação necessária para HEADER IMAGE

Foi implementado upload administrativo de JPG/PNG de até 5 MB. O backend valida
MIME e assinatura real do arquivo, cria a sessão de upload no Graph e envia os
bytes para obter o `header_handle`. O handle é usado internamente na submissão e
não é solicitado ao administrador. Não foi adicionado storage, S3, Cloudinary ou
outro serviço.

## 12. Contrato oficial Meta utilizado

Foram usados os contratos da coleção oficial da Meta:

- sessão de upload: `POST /{APP_ID}/uploads?file_length=...&file_type=...`;
- envio dos bytes: `POST /{SESSION_ID}` com `file_offset: 0`;
- criação de template no WABA com `HEADER`, `format: IMAGE` e
  `example.header_handle`;
- envio do template em `POST /{PHONE_NUMBER_ID}/messages`.

Referências oficiais:

- https://www.postman.com/meta/whatsapp-business-platform/request/qqtpgcu/upload-media-step-1-of-2-create-session
- https://www.postman.com/meta/whatsapp-business-platform/request/fw6itvt/upload-media-step-2-of-2-initiate-upload
- https://www.postman.com/meta/whatsapp-business-platform/request/n3jhmr4/create-template-w-image-header-text-body-text-footer-and-2-call-to-action-buttons
- https://www.postman.com/meta/whatsapp-business-platform/request/2qbotrb/send-message-template-media

A versão continua vindo de `META_GRAPH_API_VERSION`; nenhum endpoint ou campo
foi inventado.

## 13. Configuração da imagem

O administrador escolhe um JPG/PNG como exemplo para análise da Meta e informa,
separadamente, a URL HTTPS pública da imagem usada nos envios. A interface deixa
claro que a mídia de exemplo não é automaticamente a mídia dinâmica do envio.
Foi adicionada a variável backend `META_APP_ID`, necessária somente para preparar
o exemplo oficial.

## 14. Payload de envio simulado

O provider fake recebeu o componente oficial equivalente a:

```json
{
  "type": "header",
  "parameters": [
    { "type": "image", "image": { "link": "https://exemplo.invalid/imagem.jpg" } }
  ]
}
```

O teste conferiu também corpo, botão de opt-out, destinatário, nome e idioma do
template. Nenhum payload foi enviado à Graph API real.

## 15. Componentes oficiais suportados após a revisão

Permanecem suportados, sem expansão desnecessária: `HEADER` de texto ou imagem,
`BODY`, `FOOTER`, `BUTTONS`, `QUICK_REPLY`, URL e telefone/CTA. Não foram
implementados componentes sem uso no ACORDA RJ.

## 16. Botão SAIR / opt-out

O webhook fake identificou o botão configurado e o contato pelo contexto da
mensagem. A primeira ocorrência revogou mensagens e bloqueou o contato; a
repetição foi idempotente. O contato e todo o histórico anterior permaneceram.

## 17. Estado e histórico mostrados ao operador

Após o opt-out, a API de detalhes retornou mensagens bloqueadas, consentimento
revogado, canal WhatsApp e data/hora do evento. O histórico registrou origem e
motivo, permitindo ao operador entender que a pessoa não quer novas mensagens.

## 18. Bloqueio posterior ao opt-out

Depois do opt-out, nova campanha encontrou os dois contatos artificiais, mas
considerou somente um apto e reservou apenas esse contato. O contato bloqueado
não voltou por novo lote, nova reserva ou nova tentativa. Os testes existentes
também confirmaram que reimportação, novo evento e edição de outros dados não
restauram silenciosamente a autorização.

## 19. Cenário final com exatamente 2 contatos

Foi criado evento, campanha filtrada, template fake aprovado com HEADER IMAGE,
prévia 2 encontrados/2 aptos/0 não aptos e lote com exatamente 2 contatos. As
duas tentativas foram processadas concorrentemente, geraram external IDs fake
distintos e históricos corretos. Após o opt-out de um contato, só o segundo
permaneceu elegível.

## 20. Bugs e lacunas corrigidos

1. Completado o upload oficial da imagem de exemplo para template com HEADER
   IMAGE, removendo a digitação manual de identificador técnico.
2. Eliminado o N+1 na criação de lotes: participações, tentativas e históricos
   agora são inseridos em operação SQL set-based dentro da mesma transação. Isso
   reduz milhares de idas ao banco sem alterar as regras ou constraints.
3. Expostos na tela de campanha os filtros de origem e faixa etária já
   suportados pelo backend.
4. O orquestrador isolado passou a controlar explicitamente sua conexão, sem
   depender de propriedade privada do driver PostgreSQL.

Nenhuma migration, tabela, constraint ou dado de produção foi alterado.

## 21. Testes e resultados

Comando focado:

```text
npm run testar:fluxo-campanhas-meta
```

Resultado:

```text
Escala, filtros e lotes: 26 verificações aprovadas.
Campanhas, lotes e mensageria: 27 verificações aprovadas.
Templates oficiais da Meta: 30 verificações aprovadas.
Integração Meta com mocks: 16 verificações aprovadas.
Webhook de mensageria: 16 verificações aprovadas.
Cenário E2E final de 2 contatos: 16 verificações aprovadas.
Fluxo isolado: 6 grupos aprovados.
```

Também foram aprovados:

- sintaxe dos 12 arquivos JavaScript alterados/criados;
- build Vite: 70 módulos transformados;
- `git diff --check` sem erro de whitespace.

O banco temporário `acorda_rj_campanhas_qa_*` foi criado, usado e removido pelo
orquestrador. Nenhum dado artificial permaneceu.

## 22. Confirmação de ausência de chamada real

Todos os fluxos de envio, upload, submissão, sincronização e webhook utilizaram
`fetch` fake/mocks. Não houve chamada à Meta real, envio de WhatsApp, consumo de
capacidade real, alteração de conta, deploy ou acesso ao banco de produção.

## 23. Confirmação de custo real

O teste utilizou somente recursos locais e artificiais. **Custo real: zero.**

## Pendência externa antes do teste real

No ambiente em que novos templates com imagem forem submetidos, `META_APP_ID`
deve conter o ID numérico do mesmo aplicativo Meta das demais credenciais. A
aprovação do template e as credenciais/permissões reais continuam dependentes da
Meta e não foram declaradas como validadas neste teste local.

## Conclusão

**PRONTO PARA TESTE REAL CONTROLADO COM 2 CONTATOS**
