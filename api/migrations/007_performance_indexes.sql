-- Índices de performance para os filtros e polling do painel.
-- Seguro para banco em produção: adiciona índices somente se ainda não existirem.
-- Não executa UPDATE/DELETE/ALTER de coluna e não modifica linhas existentes.

SET NAMES utf8mb4;
SET @db := DATABASE();

CREATE TABLE IF NOT EXISTS schema_migrations (
  migration VARCHAR(120) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (migration)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- tasks: polling incremental e filtros por status/prazo.
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tasks' AND INDEX_NAME = 'idx_tasks_updated_at');
SET @sql := IF(@idx = 0, 'ALTER TABLE tasks ADD INDEX idx_tasks_updated_at (updated_at)', 'SELECT 1');
PREPARE _m FROM @sql;
EXECUTE _m;
DEALLOCATE PREPARE _m;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tasks' AND INDEX_NAME = 'idx_tasks_status_prazo');
SET @sql := IF(@idx = 0, 'ALTER TABLE tasks ADD INDEX idx_tasks_status_prazo (status, prazo)', 'SELECT 1');
PREPARE _m FROM @sql;
EXECUTE _m;
DEALLOCATE PREPARE _m;

-- op_tasks: kanban, categorias operacionais, região, tarefa pai/filha e polling.
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'op_tasks' AND INDEX_NAME = 'idx_op_tasks_updated_at');
SET @sql := IF(@idx = 0, 'ALTER TABLE op_tasks ADD INDEX idx_op_tasks_updated_at (updated_at)', 'SELECT 1');
PREPARE _m FROM @sql;
EXECUTE _m;
DEALLOCATE PREPARE _m;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'op_tasks' AND INDEX_NAME = 'idx_op_tasks_categoria_status');
SET @sql := IF(@idx = 0, 'ALTER TABLE op_tasks ADD INDEX idx_op_tasks_categoria_status (categoria, status)', 'SELECT 1');
PREPARE _m FROM @sql;
EXECUTE _m;
DEALLOCATE PREPARE _m;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'op_tasks' AND INDEX_NAME = 'idx_op_tasks_categoria_regiao');
SET @sql := IF(@idx = 0, 'ALTER TABLE op_tasks ADD INDEX idx_op_tasks_categoria_regiao (categoria, regiao)', 'SELECT 1');
PREPARE _m FROM @sql;
EXECUTE _m;
DEALLOCATE PREPARE _m;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'op_tasks' AND INDEX_NAME = 'idx_op_tasks_status_prazo');
SET @sql := IF(@idx = 0, 'ALTER TABLE op_tasks ADD INDEX idx_op_tasks_status_prazo (status, prazo)', 'SELECT 1');
PREPARE _m FROM @sql;
EXECUTE _m;
DEALLOCATE PREPARE _m;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'op_tasks' AND INDEX_NAME = 'idx_op_tasks_taskCode');
SET @sql := IF(@idx = 0, 'ALTER TABLE op_tasks ADD INDEX idx_op_tasks_taskCode (taskCode)', 'SELECT 1');
PREPARE _m FROM @sql;
EXECUTE _m;
DEALLOCATE PREPARE _m;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'op_tasks' AND INDEX_NAME = 'idx_op_tasks_parent_status');
SET @sql := IF(@idx = 0, 'ALTER TABLE op_tasks ADD INDEX idx_op_tasks_parent_status (parent_task_id, status)', 'SELECT 1');
PREPARE _m FROM @sql;
EXECUTE _m;
DEALLOCATE PREPARE _m;

-- notificações/atividade: leitura por atualização recente.
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'app_activity_event' AND INDEX_NAME = 'idx_activity_created');
SET @sql := IF(@idx = 0, 'ALTER TABLE app_activity_event ADD INDEX idx_activity_created (created_at)', 'SELECT 1');
PREPARE _m FROM @sql;
EXECUTE _m;
DEALLOCATE PREPARE _m;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'team_chat_message' AND INDEX_NAME = 'idx_team_chat_message_id_created');
SET @sql := IF(@idx = 0, 'ALTER TABLE team_chat_message ADD INDEX idx_team_chat_message_id_created (id, created_at)', 'SELECT 1');
PREPARE _m FROM @sql;
EXECUTE _m;
DEALLOCATE PREPARE _m;

INSERT IGNORE INTO schema_migrations (migration) VALUES
  ('007_performance_indexes.sql');
