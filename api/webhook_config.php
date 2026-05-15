<?php
declare(strict_types=1);
require __DIR__ . '/db.php';
require __DIR__ . '/planner_helpers.inc.php';
require __DIR__ . '/webhooks_config.inc.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    jsonResponse(['ok' => true]);
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    jsonResponse(['ok' => false, 'error' => 'Method not allowed'], 405);
}

try {
    requireAuth();
    plannerRequirePrivilegedUser();

    $pdo = db();
    $cfg = plannerLoadWebhookConfigMerged($pdo);

    jsonResponse(['ok' => true, 'webhookConfig' => $cfg]);
} catch (Throwable $e) {
    error_log('[webhook_config.php] failed: ' . $e->getMessage());
    jsonResponse(['ok' => false, 'error' => 'server_error'], 500);
}
