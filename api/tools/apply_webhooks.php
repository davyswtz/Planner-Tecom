#!/usr/bin/env php
<?php
declare(strict_types=1);

require __DIR__ . '/../db.php';
require __DIR__ . '/../webhooks_config.inc.php';

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "Execute apenas via CLI: php api/tools/apply_webhooks.php\n");
    exit(1);
}

try {
    $local = plannerReadLocalWebhookConfig();
    if (!$local) {
        fwrite(STDERR, "Arquivo api/webhooks.local.php ausente ou inválido.\n");
        exit(1);
    }

    $pdo = db();
    plannerSaveWebhookConfigToDb($pdo, $local);

    echo "OK: webhookConfig gravado no banco com " . count($local['urlsByRegion']) . " regiões.\n";
    foreach (plannerWebhookRegionKeys() as $key) {
        $ok = isset($local['urlsByRegion'][$key]) ? 'sim' : 'não';
        echo "  - {$key}: {$ok}\n";
    }
} catch (Throwable $e) {
    fwrite(STDERR, 'Falha: ' . $e->getMessage() . "\n");
    exit(1);
}
