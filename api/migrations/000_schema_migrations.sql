-- Controle simples de migrations aplicadas.
-- Seguro para banco em produção: cria apenas uma tabela auxiliar, sem alterar dados existentes.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS schema_migrations (
  migration VARCHAR(120) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (migration)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (migration) VALUES
  ('000_schema_migrations.sql');
