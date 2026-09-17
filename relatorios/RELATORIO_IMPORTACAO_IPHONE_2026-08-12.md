# Relatório — Importação de contatos do iPhone

Data: **12 de agosto de 2026**.

## Objetivo

Permitir que um usuário leigo selecione diretamente o arquivo de contatos exportado pelo iPhone, sem precisar descobrir o formato nem convertê-lo manualmente para planilha.

## Implementação

- mantido um único fluxo de importação e um único seletor de arquivo;
- suporte adicionado ao formato VCF, preservando CSV e XLSX;
- identificação automática do formato pelo conteúdo e pela extensão;
- leitura de vários contatos no mesmo arquivo;
- leitura do nome completo (`FN`) e do nome estruturado (`N`);
- suporte a nomes UTF-8 e quoted-printable;
- leitura de um ou vários telefones por contato;
- contatos sem telefone aparecem como inválidos na pré-visualização;
- números brasileiros formatados, com ou sem `+55`, usam a mesma normalização e não geram duplicidade;
- nenhuma autorização ou consentimento é criado automaticamente pela importação;
- os demais campos ausentes continuam como `NULL` no banco e “Não informado” na interface.

## Banco de dados

Criada a migration incremental `010_permitir_importacao_vcf.sql`, que apenas amplia a constraint de formato da tabela `importacoes` para aceitar `vcf`. Nenhuma tabela ou dado existente foi removido.

O schema de banco vazio foi atualizado com a mesma regra e com o registro da migration no ledger.

## Testes executados

- verificação de sintaxe dos arquivos relacionados;
- migration aplicada no banco local `criar_banco`;
- segunda execução do runner sem reaplicação;
- fluxo integrado de pré-visualização e confirmação de CSV, XLSX e VCF;
- nome acentuado em quoted-printable;
- fallback de nome estruturado;
- vários telefones no mesmo contato;
- telefone com `+55` e telefone local tratados como duplicados;
- contato sem telefone tratado como inválido;
- persistência do formato `vcf`;
- exclusão administrativa e preservação de contatos preexistentes;
- build do frontend;
- criação e validação do schema em banco vazio.

## Resultado

O cliente pode selecionar diretamente o arquivo recebido do iPhone. O sistema reconhece o formato e utiliza o mesmo fluxo seguro de pré-visualização e confirmação já existente.

Não houve deploy nem alteração automática no banco de produção.
