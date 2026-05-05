-- ─── Escalas: adicionar campo de data para filtro por período ──────────────
-- (sem data, o filtro por intervalo não é possível)

ALTER TABLE escalas
  ADD COLUMN data DATE NULL AFTER client_uid;

CREATE INDEX idx_escalas_data ON escalas (data);
CREATE INDEX idx_escalas_nome_data ON escalas (nome, data);

