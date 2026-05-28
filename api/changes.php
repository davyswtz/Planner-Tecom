<?php
declare(strict_types=1);
require __DIR__ . '/db.php';
require __DIR__ . '/planner_helpers.inc.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    jsonResponse(['ok' => true]);
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    jsonResponse(['ok' => false, 'error' => 'Method not allowed'], 405);
}

try {
    requireAuth();
    // Libera o lock de sessão imediatamente — changes.php não escreve mais nada na sessão.
    // Isso evita bloquear o POST de op_tasks.php enquanto o poll está rodando.
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }

    $pdo = db();
    $since = isset($_GET['since']) ? (int) $_GET['since'] : 0;

    $getMaxTs = function (string $table) use ($pdo): int {
        // Hardening: evita SQL dinâmico com identificadores (mesmo com whitelist).
        // Retorna epoch seconds (UTC) para comparar rápido no front.
        $sqlMap = [
            'tasks' => "SELECT UNIX_TIMESTAMP(COALESCE(MAX(updated_at), '1970-01-01 00:00:00')) AS ts FROM tasks",
            'op_tasks' => "SELECT UNIX_TIMESTAMP(COALESCE(MAX(updated_at), '1970-01-01 00:00:00')) AS ts FROM op_tasks",
            'escalas' => "SELECT UNIX_TIMESTAMP(COALESCE(MAX(updated_at), '1970-01-01 00:00:00')) AS ts FROM escalas",
            'app_config' => "SELECT UNIX_TIMESTAMP(COALESCE(MAX(updated_at), '1970-01-01 00:00:00')) AS ts FROM app_config",
            'app_notification' => "SELECT UNIX_TIMESTAMP(COALESCE(MAX(updated_at), '1970-01-01 00:00:00')) AS ts FROM app_notification",
            'app_activity_event' => "SELECT UNIX_TIMESTAMP(COALESCE(MAX(updated_at), '1970-01-01 00:00:00')) AS ts FROM app_activity_event",
            'deleted_entity_log' => "SELECT UNIX_TIMESTAMP(COALESCE(MAX(updated_at), '1970-01-01 00:00:00')) AS ts FROM deleted_entity_log",
        ];
        if (!isset($sqlMap[$table])) {
            return 0;
        }
        $row = $pdo->query($sqlMap[$table])->fetch();
        return (int) ($row['ts'] ?? 0);
    };
    $tableExists = function (string $table) use ($pdo): bool {
        $stmt = $pdo->prepare(
            'SELECT 1
               FROM information_schema.TABLES
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = :table
              LIMIT 1'
        );
        $stmt->execute([':table' => $table]);
        return (bool) $stmt->fetchColumn();
    };

    // Verifica existência de todas as tabelas antes de qualquer query.
    $hasTasks      = $tableExists('tasks');
    $hasOpTasks    = $tableExists('op_tasks');
    $hasEscalas    = $tableExists('escalas');
    $hasCfg        = $tableExists('app_config');
    $hasNotifs     = $tableExists('app_notification');
    $hasActivity   = $tableExists('app_activity_event');
    $hasDeletedLog = $tableExists('deleted_entity_log');

    $tasksTs    = $hasTasks      ? $getMaxTs('tasks')              : 0;
    $opTasksTs  = $hasOpTasks    ? $getMaxTs('op_tasks')           : 0;
    $escalasTs  = $hasEscalas    ? $getMaxTs('escalas')            : 0;
    $cfgTs      = $hasCfg        ? $getMaxTs('app_config')         : 0;
    $notifsTs   = $hasNotifs     ? $getMaxTs('app_notification')   : 0;
    $actTs      = $hasActivity   ? $getMaxTs('app_activity_event') : 0;
    $deletedTs  = $hasDeletedLog ? $getMaxTs('deleted_entity_log') : 0;

    $maxTs = max($tasksTs, $opTasksTs, $escalasTs, $cfgTs, $notifsTs, $actTs, $deletedTs);

    $changedTasks     = [];
    $changedOpTasks   = [];
    $changedEscalas   = [];
    $changedNotifs    = [];
    $changedActivity  = [];
    $changedDeleted   = [];

    if ($since > 0) {
        // Retorna apenas alterações desde o último poll (bem mais rápido que bootstrap completo).
        // Importante: updated_at geralmente tem precisão de 1 segundo. Usar >= evita "perder" updates no mesmo segundo.
        if ($hasTasks) {
            $stmtT = $pdo->prepare('SELECT id, titulo, responsavel, prazo, status, prioridade, updated_at FROM tasks WHERE updated_at >= FROM_UNIXTIME(:since) ORDER BY updated_at ASC');
            $stmtT->execute([':since' => $since]);
            $changedTasks = $stmtT->fetchAll() ?: [];
        }

        if ($hasOpTasks) {
            $opListSql = plannerOpTaskListSelectSqlFor($pdo)
                . ' WHERE updated_at >= FROM_UNIXTIME(:since) ORDER BY updated_at ASC';
            $stmtO = $pdo->prepare($opListSql);
            $stmtO->execute([':since' => $since]);
            $changedOpTasks = $stmtO->fetchAll() ?: [];
            foreach ($changedOpTasks as &$item) {
                $item = plannerFormatOpTaskRow($item, false);
            }
            unset($item);
        }

        if ($hasNotifs) {
            $stmtN = $pdo->prepare('SELECT id, kind, title, message, ref_type, ref_id, op_category AS opCategory,
              created_by AS createdBy, created_at AS createdAt, updated_at
              FROM app_notification WHERE updated_at >= FROM_UNIXTIME(:since) ORDER BY updated_at ASC');
            $stmtN->execute([':since' => $since]);
            $changedNotifs = $stmtN->fetchAll() ?: [];
        }

        if ($hasEscalas) {
            $stmtE = $pdo->prepare('SELECT id, client_uid AS clientUid, data, mes, dia_semana AS diaSemana,
              TIME_FORMAT(horario, "%H:%i") AS horario,
              TIME_FORMAT(COALESCE(horario_inicio, horario), "%H:%i") AS horarioInicio,
              TIME_FORMAT(COALESCE(horario_fim, horario), "%H:%i") AS horarioFim,
              horas, nome,
              created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
              FROM escalas WHERE updated_at >= FROM_UNIXTIME(:since) ORDER BY updated_at ASC');
            $stmtE->execute([':since' => $since]);
            $changedEscalas = $stmtE->fetchAll() ?: [];
        }

        if ($hasActivity) {
            // Feed global (todos os usuários)
            $stmtA = $pdo->prepare('SELECT id, username, event_type AS eventType, severity, message, ref_type AS refType, ref_id AS refId,
              op_category AS opCategory, created_at AS createdAt, updated_at
              FROM app_activity_event WHERE updated_at >= FROM_UNIXTIME(:since) ORDER BY updated_at ASC');
            $stmtA->execute([':since' => $since]);
            $changedActivity = $stmtA->fetchAll() ?: [];
        }

        if ($hasDeletedLog) {
            $stmtD = $pdo->prepare('SELECT id, entity_type AS entityType, entity_id AS entityId,
              parent_entity_id AS parentEntityId, deleted_by AS deletedBy, deleted_at AS deletedAt, updated_at
              FROM deleted_entity_log WHERE updated_at >= FROM_UNIXTIME(:since) ORDER BY updated_at ASC');
            $stmtD->execute([':since' => $since]);
            $changedDeleted = $stmtD->fetchAll() ?: [];
        }
    }

    jsonResponse([
        'ok' => true,
        'tasks' => $tasksTs,
        'opTasks' => $opTasksTs,
        'escalas' => $escalasTs,
        'config' => $cfgTs,
        'notifications' => $notifsTs,
        'activity' => $actTs,
        'deleted' => $deletedTs,
        'serverTime' => time(),
        'nextSince' => $maxTs,
        'since' => $since,
        'changedTasks' => $changedTasks,
        'changedOpTasks' => $changedOpTasks,
        'changedEscalas' => $changedEscalas,
        'changedNotifications' => $changedNotifs,
        'changedActivity' => $changedActivity,
        'changedDeletedEntities' => $changedDeleted,
    ]);
} catch (Throwable $e) {
    error_log('[changes.php] failed: ' . $e->getMessage());
    jsonResponse(['ok' => false, 'error' => 'server_error'], 500);
}
