-- OS por técnico (dashboard) + campos ordem_servico / sub_processo em op_tasks
-- Seguro para banco em produção: CREATE IF NOT EXISTS + ALTER condicional.

SET NAMES utf8mb4;

SET @db := DATABASE();
SET @empty := CONCAT(CHAR(39), CHAR(39));

-- ─── op_tasks: ordem_servico, sub_processo ─────────────────────────────────
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'op_tasks' AND COLUMN_NAME = 'ordem_servico');
SET @sql := IF(@c = 0, CONCAT('ALTER TABLE op_tasks ADD COLUMN ordem_servico VARCHAR(180) NOT NULL DEFAULT ', @empty, ' AFTER protocolo'), 'SELECT 1');
PREPARE _m FROM @sql;
EXECUTE _m;
DEALLOCATE PREPARE _m;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'op_tasks' AND COLUMN_NAME = 'sub_processo');
SET @sql := IF(@c = 0, CONCAT('ALTER TABLE op_tasks ADD COLUMN sub_processo VARCHAR(120) NOT NULL DEFAULT ', @empty, ' AFTER ordem_servico'), 'SELECT 1');
PREPARE _m FROM @sql;
EXECUTE _m;
DEALLOCATE PREPARE _m;

-- ─── os_tecnicos (tabela criada pelo usuário ou nova instalação) ───────────
CREATE TABLE IF NOT EXISTS os_tecnicos (
  id BIGINT NOT NULL AUTO_INCREMENT,
  task_id BIGINT NOT NULL,
  parent_task_id BIGINT NULL,
  tecnico_nome VARCHAR(120) NOT NULL,
  ordem_servico VARCHAR(180) NOT NULL DEFAULT '',
  titulo VARCHAR(500) NOT NULL DEFAULT '',
  task_code VARCHAR(32) NOT NULL DEFAULT '',
  categoria VARCHAR(48) NOT NULL DEFAULT '',
  regiao VARCHAR(64) NOT NULL DEFAULT '',
  status VARCHAR(48) NOT NULL DEFAULT '',
  protocolo VARCHAR(180) NOT NULL DEFAULT '',
  prioridade VARCHAR(24) NOT NULL DEFAULT '',
  data_criacao DATE NULL,
  data_conclusao VARCHAR(64) NOT NULL DEFAULT '',
  criada_em VARCHAR(64) NOT NULL DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_os_tec_task_tecnico (task_id, tecnico_nome),
  KEY idx_os_tec_tecnico (tecnico_nome),
  KEY idx_os_tec_parent (parent_task_id),
  KEY idx_os_tec_categoria (categoria),
  KEY idx_os_tec_regiao (regiao),
  KEY idx_os_tec_status (status),
  KEY idx_os_tec_data_criacao (data_criacao),
  KEY idx_os_tec_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Colunas extras se a tabela já existia só com task_id + tecnico_nome
SET @t := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'os_tecnicos');

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'os_tecnicos' AND COLUMN_NAME = 'parent_task_id');
SET @sql := IF(@t > 0 AND @c = 0, 'ALTER TABLE os_tecnicos ADD COLUMN parent_task_id BIGINT NULL AFTER task_id', 'SELECT 1');
PREPARE _m FROM @sql; EXECUTE _m; DEALLOCATE PREPARE _m;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'os_tecnicos' AND COLUMN_NAME = 'ordem_servico');
SET @sql := IF(@t > 0 AND @c = 0, CONCAT('ALTER TABLE os_tecnicos ADD COLUMN ordem_servico VARCHAR(180) NOT NULL DEFAULT ', @empty, ' AFTER tecnico_nome'), 'SELECT 1');
PREPARE _m FROM @sql; EXECUTE _m; DEALLOCATE PREPARE _m;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'os_tecnicos' AND COLUMN_NAME = 'titulo');
SET @sql := IF(@t > 0 AND @c = 0, CONCAT('ALTER TABLE os_tecnicos ADD COLUMN titulo VARCHAR(500) NOT NULL DEFAULT ', @empty, ' AFTER ordem_servico'), 'SELECT 1');
PREPARE _m FROM @sql; EXECUTE _m; DEALLOCATE PREPARE _m;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'os_tecnicos' AND COLUMN_NAME = 'task_code');
SET @sql := IF(@t > 0 AND @c = 0, CONCAT('ALTER TABLE os_tecnicos ADD COLUMN task_code VARCHAR(32) NOT NULL DEFAULT ', @empty, ' AFTER titulo'), 'SELECT 1');
PREPARE _m FROM @sql; EXECUTE _m; DEALLOCATE PREPARE _m;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'os_tecnicos' AND COLUMN_NAME = 'categoria');
SET @sql := IF(@t > 0 AND @c = 0, CONCAT('ALTER TABLE os_tecnicos ADD COLUMN categoria VARCHAR(48) NOT NULL DEFAULT ', @empty, ' AFTER task_code'), 'SELECT 1');
PREPARE _m FROM @sql; EXECUTE _m; DEALLOCATE PREPARE _m;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'os_tecnicos' AND COLUMN_NAME = 'regiao');
SET @sql := IF(@t > 0 AND @c = 0, CONCAT('ALTER TABLE os_tecnicos ADD COLUMN regiao VARCHAR(64) NOT NULL DEFAULT ', @empty, ' AFTER categoria'), 'SELECT 1');
PREPARE _m FROM @sql; EXECUTE _m; DEALLOCATE PREPARE _m;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'os_tecnicos' AND COLUMN_NAME = 'status');
SET @sql := IF(@t > 0 AND @c = 0, CONCAT('ALTER TABLE os_tecnicos ADD COLUMN status VARCHAR(48) NOT NULL DEFAULT ', @empty, ' AFTER regiao'), 'SELECT 1');
PREPARE _m FROM @sql; EXECUTE _m; DEALLOCATE PREPARE _m;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'os_tecnicos' AND COLUMN_NAME = 'protocolo');
SET @sql := IF(@t > 0 AND @c = 0, CONCAT('ALTER TABLE os_tecnicos ADD COLUMN protocolo VARCHAR(180) NOT NULL DEFAULT ', @empty, ' AFTER status'), 'SELECT 1');
PREPARE _m FROM @sql; EXECUTE _m; DEALLOCATE PREPARE _m;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'os_tecnicos' AND COLUMN_NAME = 'prioridade');
SET @sql := IF(@t > 0 AND @c = 0, CONCAT('ALTER TABLE os_tecnicos ADD COLUMN prioridade VARCHAR(24) NOT NULL DEFAULT ', @empty, ' AFTER protocolo'), 'SELECT 1');
PREPARE _m FROM @sql; EXECUTE _m; DEALLOCATE PREPARE _m;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'os_tecnicos' AND COLUMN_NAME = 'data_criacao');
SET @sql := IF(@t > 0 AND @c = 0, 'ALTER TABLE os_tecnicos ADD COLUMN data_criacao DATE NULL AFTER prioridade', 'SELECT 1');
PREPARE _m FROM @sql; EXECUTE _m; DEALLOCATE PREPARE _m;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'os_tecnicos' AND COLUMN_NAME = 'data_conclusao');
SET @sql := IF(@t > 0 AND @c = 0, CONCAT('ALTER TABLE os_tecnicos ADD COLUMN data_conclusao VARCHAR(64) NOT NULL DEFAULT ', @empty, ' AFTER data_criacao'), 'SELECT 1');
PREPARE _m FROM @sql; EXECUTE _m; DEALLOCATE PREPARE _m;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'os_tecnicos' AND COLUMN_NAME = 'criada_em');
SET @sql := IF(@t > 0 AND @c = 0, CONCAT('ALTER TABLE os_tecnicos ADD COLUMN criada_em VARCHAR(64) NOT NULL DEFAULT ', @empty, ' AFTER data_conclusao'), 'SELECT 1');
PREPARE _m FROM @sql; EXECUTE _m; DEALLOCATE PREPARE _m;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'os_tecnicos' AND COLUMN_NAME = 'updated_at');
SET @sql := IF(@t > 0 AND @c = 0, 'ALTER TABLE os_tecnicos ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE _m FROM @sql; EXECUTE _m; DEALLOCATE PREPARE _m;

CREATE TABLE IF NOT EXISTS schema_migrations (
  migration VARCHAR(120) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (migration)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (migration) VALUES
  ('014_os_tecnicos_and_op_os_fields.sql');
