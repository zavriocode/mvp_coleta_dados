LOCK TABLE public.contatos IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.textos_formulario IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.contatos
  DROP CONSTRAINT IF EXISTS contatos_idade_valida;

ALTER TABLE public.contatos
  ADD CONSTRAINT contatos_idade_valida CHECK (
    idade IS NULL OR idade >= 0
  );

UPDATE public.textos_formulario
SET ativo = FALSE
WHERE tipo = 'aviso_privacidade'
  AND ativo = TRUE;

INSERT INTO public.textos_formulario (tipo, versao, texto, ativo)
VALUES (
  'aviso_privacidade',
  'aviso_privacidade_v4',
  'Li o Aviso de Privacidade e consinto com o tratamento dos dados necessários para minha participação voluntária no projeto Acorda RJ.',
  TRUE
)
ON CONFLICT (tipo, versao)
DO UPDATE SET
  texto = EXCLUDED.texto,
  ativo = TRUE;
