-- Persistência e auditoria de descrições em op_tasks
-- Rode no phpMyAdmin ou: mysql ... < api/migrations/017_op_task_descricao_log.sql

ALTER TABLE op_tasks MODIFY COLUMN descricao MEDIUMTEXT NULL;

CREATE TABLE IF NOT EXISTS op_task_descricao_log (
  id BIGINT NOT NULL AUTO_INCREMENT,
  op_task_id BIGINT NOT NULL,
  descricao MEDIUMTEXT NOT NULL,
  saved_by VARCHAR(120) NOT NULL DEFAULT '',
  saved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_op_desc_log_task (op_task_id),
  KEY idx_op_desc_log_saved_at (saved_at),
  CONSTRAINT fk_op_desc_log_task FOREIGN KEY (op_task_id) REFERENCES op_tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
