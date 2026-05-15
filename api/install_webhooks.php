<?php
declare(strict_types=1);
require __DIR__ . '/db.php';
require __DIR__ . '/planner_helpers.inc.php';
require __DIR__ . '/webhooks_config.inc.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    jsonResponse(['ok' => true]);
}

try {
    requireAuth();
    plannerRequirePrivilegedUser();
    requireSameOriginForMutation();

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
        $pdo = db();
        $cfg = plannerLoadWebhookConfigMerged($pdo);
        $regions = [];
        foreach (plannerWebhookRegionKeys() as $key) {
            $u = trim((string) ($cfg['urlsByRegion'][$key] ?? ''));
            $regions[$key] = ($u !== '' && $u !== 'configured') ? 'configured' : '';
        }
        jsonResponse([
            'ok' => true,
            'hasRealUrls' => plannerWebhookConfigHasRealUrls($cfg),
            'regions' => $regions,
            'localFile' => is_readable(__DIR__ . '/webhooks.local.php'),
        ]);
    }

    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        jsonResponse(['ok' => false, 'error' => 'Method not allowed'], 405);
    }

    $local = plannerReadLocalWebhookConfig();
    if (!$local) {
        jsonResponse(['ok' => false, 'error' => 'webhooks_local_missing'], 422);
    }

    $pdo = db();
    plannerSaveWebhookConfigToDb($pdo, $local);

    jsonResponse([
        'ok' => true,
        'saved' => count($local['urlsByRegion']),
        'regions' => array_keys($local['urlsByRegion']),
    ]);
} catch (Throwable $e) {
    error_log('[install_webhooks.php] ' . $e->getMessage());
    jsonResponse(['ok' => false, 'error' => 'server_error'], 500);
}
