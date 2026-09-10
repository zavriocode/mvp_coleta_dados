ALTER TABLE public.campanha_tentativas
  ADD COLUMN IF NOT EXISTS resultado_indeterminado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resultado_indeterminado_codigo VARCHAR(80),
  ADD COLUMN IF NOT EXISTS status_externo_em TIMESTAMPTZ;

ALTER TABLE public.campanha_tentativas
  DROP CONSTRAINT IF EXISTS campanha_tentativas_resultado_indeterminado_coerente;

ALTER TABLE public.campanha_tentativas
  ADD CONSTRAINT campanha_tentativas_resultado_indeterminado_coerente CHECK (
    resultado_indeterminado_em IS NULL
    OR (status = 'enviando' AND identificador_externo IS NULL)
  );

ALTER TABLE public.eventos_webhook_mensageria
  ADD COLUMN IF NOT EXISTS identificador_mensagem VARCHAR(255),
  ADD COLUMN IF NOT EXISTS status_mensageria VARCHAR(20),
  ADD COLUMN IF NOT EXISTS status_externo_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dados_evento JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS estado_processamento VARCHAR(20) NOT NULL DEFAULT 'processado',
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE public.eventos_webhook_mensageria
  DROP CONSTRAINT IF EXISTS eventos_webhook_estado_processamento_valido,
  DROP CONSTRAINT IF EXISTS eventos_webhook_status_mensageria_valido,
  DROP CONSTRAINT IF EXISTS eventos_webhook_dados_evento_validos;

ALTER TABLE public.eventos_webhook_mensageria
  ADD CONSTRAINT eventos_webhook_estado_processamento_valido CHECK (
    estado_processamento IN ('pendente', 'processado')
  ),
  ADD CONSTRAINT eventos_webhook_status_mensageria_valido CHECK (
    status_mensageria IS NULL OR status_mensageria IN ('enviada', 'entregue', 'lida', 'falhou')
  ),
  ADD CONSTRAINT eventos_webhook_dados_evento_validos CHECK (
    jsonb_typeof(dados_evento) = 'object'
  );

CREATE INDEX IF NOT EXISTS campanha_tentativas_resultado_indeterminado_indice
  ON public.campanha_tentativas (resultado_indeterminado_em)
  WHERE resultado_indeterminado_em IS NOT NULL;

CREATE INDEX IF NOT EXISTS eventos_webhook_mensageria_pendentes_indice
  ON public.eventos_webhook_mensageria (identificador_mensagem, id)
  WHERE estado_processamento = 'pendente';
