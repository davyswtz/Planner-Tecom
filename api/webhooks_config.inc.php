<?php
declare(strict_types=1);

/** Chaves canônicas usadas pelo front (WebhookService._normalizeRegionKey). */
function plannerWebhookRegionKeys(): array
{
    return ['GOVAL', 'VALE_DO_ACO', 'CARATINGA', 'BACKUP'];
}

function plannerValidateWebhookUrl(string $url): bool
{
    $u = trim($url);
    if ($u === '' || !filter_var($u, FILTER_VALIDATE_URL)) {
        return false;
    }
    $host = strtolower((string) (parse_url($u, PHP_URL_HOST) ?? ''));
    return $host === 'chat.googleapis.com';
}

/** Normaliza array vindo de webhooks.local.php ou POST do painel. */
function plannerNormalizeWebhookConfig(array $data): array
{
    $events = (isset($data['events']) && is_array($data['events']))
        ? $data['events']
        : ['andamento' => true, 'concluida' => true, 'finalizada' => true];

    $aliasMap = [
        'GOVAL' => ['GOVAL', 'goval', 'Goval'],
        'VALE_DO_ACO' => ['VALE_DO_ACO', 'vale_do_aco', 'vale do aco', 'vale do aço', 'Vale do Aço'],
        'CARATINGA' => ['CARATINGA', 'caratinga', 'Caratinga'],
        'BACKUP' => ['BACKUP', 'backup', 'Backup'],
    ];

    $source = (isset($data['urlsByRegion']) && is_array($data['urlsByRegion']))
        ? $data['urlsByRegion']
        : $data;

    $urlsByRegion = [];
    foreach ($aliasMap as $canonical => $aliases) {
        foreach ($aliases as $alias) {
            if (!array_key_exists($alias, $source)) {
                continue;
            }
            $raw = $source[$alias];
            if (!is_string($raw)) {
                continue;
            }
            $u = trim($raw);
            if ($u !== '' && $u !== 'configured' && plannerValidateWebhookUrl($u)) {
                $urlsByRegion[$canonical] = $u;
            }
            break;
        }
    }

    $url = trim((string) ($data['url'] ?? ''));
    if ($url === 'configured') {
        $url = '';
    }
    if ($url !== '' && !plannerValidateWebhookUrl($url)) {
        $url = '';
    }
    if ($url === '' && isset($urlsByRegion['GOVAL'])) {
        $url = $urlsByRegion['GOVAL'];
    } elseif ($url === '' && $urlsByRegion) {
        $url = (string) reset($urlsByRegion);
    }

    return [
        'url' => $url,
        'urlsByRegion' => $urlsByRegion,
        'events' => $events,
    ];
}

/** Lê api/webhooks.local.php (não versionado). */
function plannerReadLocalWebhookConfig(): ?array
{
    $file = __DIR__ . '/webhooks.local.php';
    if (!is_readable($file)) {
        return null;
    }
    $data = require $file;
    if (!is_array($data)) {
        return null;
    }
    $normalized = plannerNormalizeWebhookConfig($data);
    if (empty($normalized['urlsByRegion'])) {
        return null;
    }
    return $normalized;
}

function plannerWebhookConfigHasRealUrls(array $cfg): bool
{
    $by = (isset($cfg['urlsByRegion']) && is_array($cfg['urlsByRegion'])) ? $cfg['urlsByRegion'] : [];
    foreach (plannerWebhookRegionKeys() as $key) {
        $u = trim((string) ($by[$key] ?? ''));
        if ($u !== '' && $u !== 'configured' && plannerValidateWebhookUrl($u)) {
            return true;
        }
    }
    $main = trim((string) ($cfg['url'] ?? ''));
    return $main !== '' && $main !== 'configured' && plannerValidateWebhookUrl($main);
}

/** Persiste webhookConfig completo em app_config. */
function plannerSaveWebhookConfigToDb(PDO $pdo, array $config): void
{
    $normalized = plannerNormalizeWebhookConfig($config);
    if (empty($normalized['urlsByRegion'])) {
        throw new InvalidArgumentException('Nenhuma URL de webhook válida para salvar.');
    }
    $stmt = $pdo->prepare(
        'INSERT INTO app_config (cfg_key, cfg_value) VALUES (:k, :v)
         ON DUPLICATE KEY UPDATE cfg_value = VALUES(cfg_value)'
    );
    $stmt->execute([
        ':k' => 'webhookConfig',
        ':v' => json_encode($normalized, JSON_UNESCAPED_UNICODE),
    ]);
}

/** Mescla DB + fallback local (arquivo no servidor, fora do Git). */
function plannerLoadWebhookConfigMerged(PDO $pdo): array
{
    $cfg = [
        'url' => '',
        'urlsByRegion' => [],
        'events' => ['andamento' => true, 'concluida' => true, 'finalizada' => true],
    ];
    try {
        $stmt = $pdo->prepare('SELECT cfg_value FROM app_config WHERE cfg_key = :k LIMIT 1');
        $stmt->execute([':k' => 'webhookConfig']);
        $row = $stmt->fetchColumn();
        if (is_string($row) && $row !== '') {
            $decoded = json_decode($row, true);
            if (is_array($decoded)) {
                $cfg = array_merge($cfg, $decoded);
            }
        }
    } catch (Throwable $e) {
        error_log('[webhooks_config] load db: ' . $e->getMessage());
    }

    if (!plannerWebhookConfigHasRealUrls($cfg)) {
        $local = plannerReadLocalWebhookConfig();
        if (is_array($local)) {
            $cfg = array_merge($cfg, $local);
            if (isset($local['urlsByRegion']) && is_array($local['urlsByRegion'])) {
                $cfg['urlsByRegion'] = array_merge(
                    is_array($cfg['urlsByRegion'] ?? null) ? $cfg['urlsByRegion'] : [],
                    $local['urlsByRegion']
                );
            }
        }
    }

    return plannerNormalizeWebhookConfig($cfg);
}
