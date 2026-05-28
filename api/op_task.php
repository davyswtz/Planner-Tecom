<?php
declare(strict_types=1);
require __DIR__ . '/db.php';
require __DIR__ . '/planner_helpers.inc.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    jsonResponse(['ok' => true]);
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    jsonResponse(['ok' => false, 'error' => 'Method not allowed'], 405);
}

try {
    requireAuth();

    $id = (int) ($_GET['id'] ?? 0);
    if ($id <= 0) {
        jsonResponse(['ok' => false, 'error' => 'id invalido'], 422);
    }

    $pdo = db();
    $detailSql = plannerOpTaskDetailSelectSqlFor($pdo);

    $stmt = $pdo->prepare($detailSql);
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();
    if (!$row) {
        jsonResponse(['ok' => false, 'error' => 'not_found'], 404);
    }

    jsonResponse(['ok' => true, 'task' => plannerFormatOpTaskRow($row, true)]);
} catch (Throwable $e) {
    error_log('[op_task.php] failed: ' . $e->getMessage());
    jsonResponse(['ok' => false, 'error' => 'server_error'], 500);
}
