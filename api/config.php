<?php
declare(strict_types=1);
require __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    jsonResponse(['ok' => true]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['ok' => false, 'error' => 'Method not allowed'], 405);
}

try {
    requireAuth();
    requireSameOriginForMutation();

    $data = readJsonBody();
    $pdo = db();

    $stmt = $pdo->prepare('INSERT INTO app_config (cfg_key, cfg_value) VALUES (:k, :v) ON DUPLICATE KEY UPDATE cfg_value = VALUES(cfg_value)');
    if (isset($data['webhookConfig']) && is_array($data['webhookConfig'])) {
        $incoming = $data['webhookConfig'];
        $existing = [];
        $sel = $pdo->prepare('SELECT cfg_value FROM app_config WHERE cfg_key = :k LIMIT 1');
        $sel->execute([':k' => 'webhookConfig']);
        $row = $sel->fetchColumn();
        if (is_string($row) && $row !== '') {
            $decoded = json_decode($row, true);
            if (is_array($decoded)) {
                $existing = $decoded;
            }
        }
        if (!empty($incoming['url']) && is_string($incoming['url'])) {
            $existing['url'] = trim($incoming['url']);
        }
        if (isset($incoming['events']) && is_array($incoming['events'])) {
            $existing['events'] = array_merge(
                is_array($existing['events'] ?? null) ? $existing['events'] : [],
                $incoming['events']
            );
        }
        $incRegions = (isset($incoming['urlsByRegion']) && is_array($incoming['urlsByRegion']))
            ? $incoming['urlsByRegion']
            : [];
        if (!isset($existing['urlsByRegion']) || !is_array($existing['urlsByRegion'])) {
            $existing['urlsByRegion'] = [];
        }
        foreach ($incRegions as $rk => $rv) {
            if (is_string($rv) && trim($rv) !== '') {
                $existing['urlsByRegion'][$rk] = trim($rv);
            }
        }
        $stmt->execute([
            ':k' => 'webhookConfig',
            ':v' => json_encode($existing, JSON_UNESCAPED_UNICODE),
        ]);
    }
    if (isset($data['plannerConfig'])) {
        $stmt->execute([
            ':k' => 'plannerConfig',
            ':v' => json_encode($data['plannerConfig'], JSON_UNESCAPED_UNICODE),
        ]);
    }

    jsonResponse(['ok' => true]);
} catch (Throwable $e) {
    error_log('[config.php] save failed: ' . $e->getMessage());
    jsonResponse(['ok' => false, 'error' => 'server_error'], 500);
}

