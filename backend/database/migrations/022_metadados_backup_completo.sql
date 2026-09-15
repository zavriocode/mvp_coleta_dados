ALTER TABLE public.backups_banco
  ADD COLUMN versao_postgresql TEXT,
  ADD COLUMN migrations JSONB;

COMMENT ON COLUMN public.backups_banco.migrations IS
  'Ledger de migrations do snapshot do backup; não contém configuração de ambiente.';
