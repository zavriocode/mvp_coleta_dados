ALTER TABLE public.modelos_mensagem
  ADD COLUMN IF NOT EXISTS excluido_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS excluido_por_usuario_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'modelos_mensagem_excluidor_fkey'
      AND conrelid = 'public.modelos_mensagem'::regclass
  ) THEN
    ALTER TABLE public.modelos_mensagem
      ADD CONSTRAINT modelos_mensagem_excluidor_fkey
      FOREIGN KEY (excluido_por_usuario_id)
      REFERENCES public.usuarios(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

ALTER TABLE public.historico_modelos_mensagem_meta
  DROP CONSTRAINT IF EXISTS historico_modelos_mensagem_meta_acao_valida;

ALTER TABLE public.historico_modelos_mensagem_meta
  ADD CONSTRAINT historico_modelos_mensagem_meta_acao_valida CHECK (
    acao IN ('rascunho_criado', 'rascunho_atualizado', 'configuracao_envio',
      'submissao', 'sincronizacao', 'vinculo_inicial', 'webhook_status',
      'exclusao_logica')
  );

CREATE INDEX IF NOT EXISTS modelos_mensagem_exclusao_indice
  ON public.modelos_mensagem (excluido_em)
  WHERE excluido_em IS NULL;
