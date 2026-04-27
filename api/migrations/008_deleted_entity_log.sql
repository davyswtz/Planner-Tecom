-- Log de exclusões para sincronização entre usuários.
-- Seguro para banco em produção: cria apenas tabela nova, sem apagar ou alterar dados existentes.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS deleted_entity_log (
  id BIGINT NOT NULL AUTO_INCREMENT,
  entity_type VARCHAR(32) NOT NULL,
  entity_id INT NOT NULL,
  parent_entity_id INT NULL,
  deleted_by VARCHAR(120) NOT NULL DEFAULT '',
  deleted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_deleted_entity_updated (updated_at),
  KEY idx_deleted_entity_lookup (entity_type, entity_id),
  KEY idx_deleted_entity_parent (parent_entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schema_migrations (
  migration VARCHAR(120) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (migration)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (migration) VALUES
  ('008_deleted_entity_log.sql');
