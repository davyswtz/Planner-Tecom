-- ─── Escalas (mês/dia/horário/horas/nome) ──────────────────────────────────
-- Persistência compartilhada (API PHP) + sincronização via bootstrap/changes.

CREATE TABLE IF NOT EXISTS escalas (
  id BIGINT NOT NULL AUTO_INCREMENT,
  client_uid VARCHAR(48) NOT NULL,
  mes TINYINT UNSIGNED NOT NULL,          -- 1..12
  dia_semana TINYINT UNSIGNED NOT NULL,   -- 1..7 (Segunda..Domingo)
  horario TIME NOT NULL,
  horas DECIMAL(5,2) NOT NULL DEFAULT 1.00,
  nome VARCHAR(120) NOT NULL,
  created_by VARCHAR(120) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_escalas_client_uid (client_uid),
  KEY idx_escalas_nome (nome),
  KEY idx_escalas_mes (mes),
  KEY idx_escalas_updated_at (updated_at),
  KEY idx_escalas_mes_dia_hora (mes, dia_semana, horario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

