# Frontend — ACORDA RJ

Interface React 19, React Router 7 e Vite 8 para formulário público e painel
administrativo. O frontend apresenta permissões e estados; o backend continua
sendo a autoridade de autenticação, autorização e regras.

## Instalação

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Variáveis públicas:

```env
VITE_API_URL=http://localhost:3000
VITE_WHATSAPP_NUMERO=5521999999999
VITE_PRIVACIDADE_EMAIL=privacidade@exemplo.com
```

Não colocar JWT, banco ou credenciais Meta no frontend.

## Rotas

| Rota | Acesso | Função |
|---|---|---|
| `/participar` | público | Cadastro geral ou por evento. |
| `/privacidade`, `/termos`, `/excluir-dados` | público | Transparência e direitos. |
| `/login` | público | Acesso interno. |
| `/admin` | operador/admin | Visão geral. |
| `/admin/contatos` | operador/admin | Contatos, filtros e detalhes. |
| `/admin/importacoes` | operador/admin | VCF/CSV/XLSX. |
| `/admin/relatorios` | operador/admin | Indicadores e exportações autorizadas. |
| `/admin/eventos` | operador/admin | Consulta; gestão somente admin. |
| `/admin/campanhas` | operador/admin | Campanhas, lotes, templates e mensagens. |
| `/admin/backups` | admin | Backup, restore, revisão e histórico. |
| `/admin/usuarios` | admin | Usuários e credenciais autorizadas. |

## Comportamento de segurança

- serviço HTTP central injeta Bearer Token;
- resposta 401 encerra a sessão local e leva ao login;
- GET pode repetir falha transitória com espera progressiva;
- mutações não são repetidas automaticamente;
- loading e `disabled` impedem duplo clique nas ações críticas;
- mensagens mostram orientação sem stack trace ou segredo;
- controles ocultos são apenas UX: a API sempre revalida permissão.

## Campanhas e mensageria

A tela permite criar/consultar campanhas, público, lotes, tentativas, falhas e
templates conforme o perfil. Exibe capacidade interna/oficial, estados técnicos,
opt-out e resultados indeterminados sem oferecer reenvio automático inseguro.

## Backup e restauração

O backup atual é um arquivo único `.acorda`, baixado pelo administrador. O painel
exibe histórico, status, tamanho, integridade e disponibilidade temporária.

Restauração administrativa usa três momentos de UX:

1. enviar e validar um único `.acorda`;
2. revisar e preparar manutenção/pré-backup;
3. restaurar, acompanhar, revisar e liberar manualmente.

O backend mantém todas as barreiras, mesmo que a página seja recarregada. A tela
exige novo login quando `auth_epoch` muda, disponibiliza custódia do pré-backup,
mostra recuperação necessária em falha e nunca declara sucesso apenas porque o
upload foi aceito. Após validação, o comprovante apresenta backup, data,
integridade e contagens registradas; dados podem ser conferidos em modo somente
leitura antes da liberação.

## Build e publicação

```powershell
npm run build
```

Na Vercel:

1. publicar a pasta `frontend`;
2. configurar as três variáveis públicas;
3. apontar `VITE_API_URL` para a API HTTPS;
4. configurar `FRONTEND_URL` no backend com a origem exata;
5. conferir CSP, HSTS, CORS, login, formulário e rotas administrativas.

## Testes

```powershell
npm run testar:backups
npm run testar:restauracao-renderizada
npm run testar:previa-modelo
npm run testar:previa-imagem-renderizada
npm run build
```

Documentação canônica: [../STATUS_FINAL_DO_PROJETO.md](../STATUS_FINAL_DO_PROJETO.md).
