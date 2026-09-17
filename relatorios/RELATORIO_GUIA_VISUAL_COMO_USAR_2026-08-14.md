# Relatório — Guia visual “Como usar”

**Projeto:** ACORDA RJ  
**Data:** 14 de agosto de 2026  
**Validação:** interface local, com conta administrativa de teste  
**Produção, deploy, commit e push:** não realizados

## 1. Módulos que receberam guia visual

Início, Contatos, Eventos, Importações, Campanhas, Modelos de mensagem,
Relatórios, Consentimentos e SAIR, Solicitações de exclusão, Usuários e Backups.

## 2. Estratégia usada para imagens

Foram versionadas capturas reais da interface em `frontend/public/guia/`. Cada
módulo carrega apenas a sua imagem selecionada. Essa solução preserva fidelidade
e permite substituir uma captura isoladamente quando a tela mudar.

## 3. Como os marcadores foram feitos

Os círculos numerados são sobrepostos por CSS em posições percentuais. Eles não
alteram os arquivos PNG e permanecem alinhados quando a imagem muda de tamanho.

## 4. Textos reduzidos

Os antigos blocos longos foram trocados por um resumo, uma imagem e frases curtas
para cada número. Campanhas, valores personalizados, imagens e SAIR receberam
fluxos visuais adicionais.

## 5. Organização final do “Como usar”

O usuário escolhe um módulo em cartões e vê somente o assunto selecionado. A URL
mantém o tópico no hash, por exemplo `/admin/ajuda#templates`, e cada guia possui
atalho para a tela correspondente.

## 6. Uso da conta administrativa de teste

A conta foi usada somente para navegar, conferir textos e posições e capturar as
telas locais. Nenhuma ação de cadastro, envio, exclusão ou configuração foi
executada.

## 7. Cuidados para não expor dados

Nome da conta foi substituído nas capturas. Tabelas, contatos, usuários,
históricos e demais áreas dinâmicas foram desfocados. Nenhuma credencial, token,
telefone ou dado pessoal foi escrito no código ou no relatório.

## 8. Comportamento mobile

Os módulos se tornam uma faixa horizontal. Explicações e fluxos passam para uma
coluna. A captura real permanece legível por rolagem horizontal e pode ser
ampliada com o zoom do navegador; marcadores continuam presos à imagem.

## 9. Arquivos alterados

- `frontend/src/pages/AjudaAdministrativa.jsx`;
- `frontend/src/styles/administrativo.css`;
- `frontend/public/guia/inicio.png`;
- `frontend/public/guia/contatos.png`;
- `frontend/public/guia/eventos.png`;
- `frontend/public/guia/importacoes.png`;
- `frontend/public/guia/campanhas.png`;
- `frontend/public/guia/modelos.png`;
- `frontend/public/guia/relatorios.png`;
- `frontend/public/guia/privacidade-optout.png`;
- `frontend/public/guia/exclusoes.png`;
- `frontend/public/guia/usuarios.png`;
- `frontend/public/guia/backups.png`;
- `RELATORIO_GUIA_VISUAL_COMO_USAR_2026-08-14.md`.

## 10. Testes executados

- `/admin/ajuda` e navegação por hash;
- seleção dos 11 módulos;
- carregamento das 11 imagens, todas com 1440 × 900 e sem falha;
- marcadores e conteúdos especiais de Campanhas, Modelos e SAIR;
- comportamento de administrador;
- simulação local do perfil operador, sem link para área exclusiva;
- desktop 1440 × 900;
- tablet 1024 × 768;
- celular 390 × 844;
- console do navegador sem erros;
- `git diff --check`.

## 11. Build

`npm run build` no frontend: aprovado, com 71 módulos transformados.

## 12. Eventuais limitações

As capturas precisam ser atualizadas quando a interface mudar de forma relevante.
Em celular, a imagem completa usa rolagem horizontal para preservar a leitura dos
textos, em vez de ficar pequena e ilegível.

## 13. Regras de negócio

Nenhuma regra de negócio, permissão, autenticação, campanha, filtro, lote,
capacidade, consentimento, opt-out, webhook, banco ou migration foi alterado.

## 14. Meta

Nenhuma chamada à Meta foi realizada.

## 15. Custo real

Os testes usaram somente a aplicação local. **Custo real: zero.**
