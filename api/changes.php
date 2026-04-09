<?php
declare(strict_types=1);
require __DIR__ . '/db.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    jsonResponse(['ok' => true]);
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    jsonResponse(['ok' => false, 'error' => 'Method not allowed'], 405);
}

try {
    if (empty($_SESSION['planner_user'])) {
        jsonResponse(['ok' => false, 'error' => 'unauthorized'], 401);
    }

    $pdo = db();

    $getMaxTs = function (string $table) use ($pdo): int {
        // Retorna epoch seconds (UTC) para comparar rápido no front.
        $stmt = $pdo->query("SELECT UNIX_TIMESTAMP(COALESCE(MAX(updated_at), '1970-01-01 00:00:00')) AS ts FROM {$table}");
        $row = $stmt->fetch();
        return (int) ($row['ts'] ?? 0);
    };

    // Tabelas com updated_at no schema.sql
    $tasksTs = $getMaxTs('tasks');
    $opTasksTs = $getMaxTs('op_tasks');
    $calTs = $getMaxTs('calendar_notes');
    $cfgTs = $getMaxTs('app_config');

    jsonResponse([
        'ok' => true,
        'tasks' => $tasksTs,
        'opTasks' => $opTasksTs,
        'calendarNotes' => $calTs,
        'config' => $cfgTs,
        'serverTime' => time(),
    ]);
} catch (Throwable $e) {
    jsonResponse(['ok' => false, 'error' => $e->getMessage()], 500);
}

