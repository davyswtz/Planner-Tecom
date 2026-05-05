-- Migração: promover IDs e FKs relacionadas para BIGINT.
-- IMPORTANTE:
-- - Em MySQL/MariaDB, ALTER TABLE pode demorar. Rode em horário de baixa.
-- - Faça backup antes.
-- - Isto mantém compatibilidade com o app (PHP 64-bit). Em JS, IDs > 2^53 podem perder precisão.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- tasks
ALTER TABLE tasks
  MODIFY COLUMN id BIGINT NOT NULL;

-- op_task_image (FK -> op_tasks.id)
-- Precisa remover FK antes de alterar o tipo da coluna referenciada (MySQL bloqueia).
ALTER TABLE op_task_image
  DROP FOREIGN KEY fk_op_task_image_op_task;

ALTER TABLE op_task_image
  MODIFY COLUMN op_task_id BIGINT NOT NULL;

-- op_tasks (agora pode alterar o PK)
ALTER TABLE op_tasks
  MODIFY COLUMN id BIGINT NOT NULL,
  MODIFY COLUMN parent_task_id BIGINT NULL;

-- Recria FK após conversão
ALTER TABLE op_task_image
  ADD CONSTRAINT fk_op_task_image_op_task
  FOREIGN KEY (op_task_id) REFERENCES op_tasks (id)
  ON DELETE CASCADE;

-- referências em notificações/atividade (apontam para tasks/op_tasks)
ALTER TABLE app_notification
  MODIFY COLUMN ref_id BIGINT NULL;

ALTER TABLE app_activity_event
  MODIFY COLUMN ref_id BIGINT NULL;

-- log de exclusões (migração 008)
ALTER TABLE deleted_entity_log
  MODIFY COLUMN entity_id BIGINT NOT NULL,
  MODIFY COLUMN parent_entity_id BIGINT NULL;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE IF NOT EXISTS schema_migrations (
  migration VARCHAR(120) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (migration)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (migration) VALUES
  ('010_bigint_ids.sql');

