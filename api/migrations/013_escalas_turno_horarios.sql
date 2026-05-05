-- ─── Escalas: separar horário de entrada e saída (turno) ──────────────────

ALTER TABLE escalas
  ADD COLUMN horario_inicio TIME NULL AFTER dia_semana,
  ADD COLUMN horario_fim TIME NULL AFTER horario_inicio;

CREATE INDEX idx_escalas_horarios ON escalas (horario_inicio, horario_fim);

