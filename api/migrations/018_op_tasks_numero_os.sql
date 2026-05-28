-- Número da OS HubSpot — campo independente de ordem_servico.
-- Seguro para banco em produção: ALTER condicional via PREPARE.
-- Se ordem_servico não existir (014 não rodou), usa sub_processo ou protocolo como âncora.

SET NAMES utf8mb4;
SET @db    := DATABASE();
SET @empty := CONCAT(CHAR(39), CHAR(39));

-- ─── op_tasks: numero_os ────────────────────────────────────────────────────
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'op_tasks' AND COLUMN_NAME = 'numero_os');

SET @hasOrdem := (SELECT COUNT(*) FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'op_tasks' AND COLUMN_NAME = 'ordem_servico');
SET @hasSub := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'op_tasks' AND COLUMN_NAME = 'sub_processo');
SET @afterCol := IF(@hasOrdem > 0, 'ordem_servico',
                IF(@hasSub > 0, 'sub_processo', 'protocolo'));

SET @sql := IF(@c = 0,
    CONCAT('ALTER TABLE op_tasks ADD COLUMN numero_os VARCHAR(180) NOT NULL DEFAULT ', @empty, ' AFTER ', @afterCol),
    'SELECT 1');
PREPARE _m FROM @sql; EXECUTE _m; DEALLOCATE PREPARE _m;

INSERT IGNORE INTO schema_migrations (migration) VALUES ('018_op_tasks_numero_os.sql');
