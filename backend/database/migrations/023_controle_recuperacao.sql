-- Controle de recuperação: nunca incluir no dump operacional ou no pg_restore.
CREATE SCHEMA IF NOT EXISTS recuperacao;
REVOKE ALL ON SCHEMA recuperacao FROM PUBLIC;
CREATE TABLE recuperacao.estado (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  manutencao BOOLEAN NOT NULL DEFAULT false,
  auth_epoch BIGINT NOT NULL DEFAULT 0,
  operacao_id UUID,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO recuperacao.estado(id) VALUES (true);
CREATE TABLE recuperacao.operacoes (
  id UUID PRIMARY KEY,
  usuario_id BIGINT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  fase TEXT NOT NULL,
  dados JSONB NOT NULL DEFAULT '{}',
  erro TEXT
);
CREATE TABLE recuperacao.auditoria (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operacao_id UUID,
  usuario_id BIGINT,
  evento TEXT NOT NULL,
  dados JSONB NOT NULL DEFAULT '{}',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Comprovantes de admissão. Uma execução sem término nunca expira por idade.
CREATE TABLE recuperacao.admissoes (
  id UUID PRIMARY KEY,
  tipo TEXT NOT NULL,
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em TIMESTAMPTZ
);
CREATE INDEX admissoes_abertas ON recuperacao.admissoes(iniciado_em) WHERE concluido_em IS NULL;
CREATE TABLE recuperacao.webhooks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chave CHAR(64) NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  tipo TEXT NOT NULL,
  requer_meta BOOLEAN NOT NULL,
  aplicado_em TIMESTAMPTZ,
  erro TEXT,
  recebido_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX webhooks_pendentes ON recuperacao.webhooks(id) WHERE aplicado_em IS NULL;
-- Sem FK, trigger ou view apontando para o conjunto operacional.
ALTER TABLE public.backups_banco ADD COLUMN manifesto JSONB;
