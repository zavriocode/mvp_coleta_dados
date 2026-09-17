# Fase 2 — decisão de consistência antes da implementação

Data: 16/09/2026.
Estado: auditoria estática concluída; implementação operacional suspensa pela
regra final do pedido: parar e documentar decisão arquitetural que aumente risco.

## Problema concreto na ordem solicitada

O fluxo pedido coloca o backup pré-restauração antes do modo de manutenção.
No código atual, o advisory lock `82174999` serializa somente backups. Ele não
impede cadastro, importação, envio, processamento de webhooks ou tarefas periódicas.
O snapshot exportado pela fase 1 garante consistência interna do dump, mas não
inclui transações confirmadas depois da criação daquele snapshot.

Exemplo:

1. O backup de segurança inicia seu snapshot.
2. Um webhook oficial de opt-out chega e confirma revogação/bloqueio.
3. O administrador termina o download e ativa a manutenção.
4. A restauração substitui o estado operacional por um snapshot antigo.

A revogação do passo 2 não está no snapshot antigo nem no backup de segurança.
O mesmo intervalo existe para contatos, alterações de usuários, importações e
confirmações locais de envio. A revisão administrativa não recupera dados que
não foram preservados. Não ocorreu esse cenário em produção nesta tarefa;
trata-se da análise do fluxo e dos pontos de escrita existentes.

## Ajuste proposto para aprovação

1. Receber e autenticar dump/manifesto; inspecionar em banco isolado.
2. Mostrar resumo, exigir reautenticação e frase RESTAURAR SISTEMA.
3. Registrar manutenção persistente; impedir novas operações de negócio.
4. Aguardar encerramento das requisições e jobs admitidos antes do bloqueio;
   se não for possível confirmar a drenagem, abortar a etapa destrutiva.
5. Gerar e validar o backup pré-restauração com o estado operacional estabilizado.
6. Disponibilizar download e exigir confirmação de custódia fora do container.
7. Restaurar e validar mantendo manutenção.
8. Exigir novo login, revisão administrativa e liberação manual auditada.

A mudança observável é que o sistema ficará em manutenção também enquanto o
responsável baixa e confirma a cópia pré-restauração. Não haverá liberação por
timeout ou reinício. Cancelamento antes da substituição precisará de uma ação
administrativa explícita e auditada.

## Preservação que acompanha essa ordem

- Estado de manutenção, versão de sessões, operações de restauração e sua
  auditoria precisam ficar fora do conjunto substituído. Proposta: schema de
  controle dedicado no mesmo banco, sem FKs para registros operacionais que
  possam deixar de existir. Não requer serviço externo novo.
- Webhooks recebidos durante manutenção precisam de caixa de entrada durável,
  após validação HMAC, preservada fora do conjunto substituído. Só responder
  sucesso após persistência. Falha na persistência deve produzir erro HTTP,
  sem afirmar que o evento foi processado.
- Essa caixa de entrada deverá ser reconciliada pelo processamento existente
  antes de liberar envios, mantendo idempotência e registro dos eventos oficiais.
- Registro de backup pré-restore deve ser preservado na auditoria de controle,
  mesmo quando a restauração recuar o conteúdo de `backups_banco`.
- Nenhuma limpeza por idade de dados operacionais/históricos será adicionada.
  Limpeza de arquivos temporários não removerá seus registros de auditoria.

Esses itens são desenho proposto, ainda não implementado nem validado.

## Estrutura atual verificada

- `backupService.js`: custom completo, snapshot exportado, senha via ambiente,
  SHA-256, arquivo privado temporário, download único, expiração e advisory lock.
- Migration 022: `versao_postgresql` e `migrations` em `backups_banco`.
- `backupRoutes.js`: controle administrativo; autenticação montada em `app.js`.
- `autenticacaoService.js` / `autenticarUsuario.js`: JWT identifica usuário e
  consulta o registro atual; não há versão global de sessões externa ao snapshot.
- `server.js`: recuperação de mensageria na inicialização e a cada 60 segundos.
- `sincronizacaoAutomaticaTemplates.js`: sincronização com temporizador próprio
  e lock separado; precisa respeitar manutenção e drenagem em todas as instâncias.
- `webhookController.js`: valida HMAC e processa imediatamente no banco
  operacional; não há caixa de entrada independente para uma restauração.
- `app.js`: não há barreira persistente de manutenção.

Um middleware que bloqueie somente POST não basta: há jobs e requisições já
em execução, além de possíveis escritas associadas a consultas administrativas.

## Resultado desta etapa

Nenhuma funcionalidade de restore foi publicada ou habilitada. Nenhuma migration
foi criada/aplicada nesta fase. Código funcional e configurações foram preservados.
Somente este relatório foi adicionado. Não houve acesso a banco, testes destrutivos,
Meta, envio, deploy, commit ou push. Não declarar a fase 2 validada.

Após a decisão sobre a ordem do fluxo, ainda será necessário implementar todos
os itens da fase 2 e executar seus testes obrigatórios em bancos descartáveis.

Referência técnica consultada:
https://www.postgresql.org/docs/18/app-pgrestore.html
(`--single-transaction` protege a execução do restore; não recupera eventos
ocorridos fora do snapshot e não substitui a barreira de manutenção).
