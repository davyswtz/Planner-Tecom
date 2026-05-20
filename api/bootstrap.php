<?php
declare(strict_types=1);
require __DIR__ . '/db.php';
require __DIR__ . '/planner_helpers.inc.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    jsonResponse(['ok' => true]);
}

try {
    if (empty($_SESSION['planner_user'])) {
        jsonResponse(['ok' => false, 'error' => 'unauthorized'], 401);
    }

    $cacheTtl = 1;
    $cacheUser = (string) ($_SESSION['planner_user'] ?? 'anon');

    // Gera/confirma CSRF token (única escrita na sessão neste endpoint).
    $csrfTokenValue = csrfToken();

    // Libera lock de sessão — todas as operações abaixo são somente leitura do DB.
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }

    $cacheKey = 'planner_bootstrap_' . hash('sha256', $cacheUser . '|' . ($_SERVER['HTTP_HOST'] ?? '') . '|v2_light');
    $cacheFile = sys_get_temp_dir() . DIRECTORY_SEPARATOR . $cacheKey . '.json';
    if (is_readable($cacheFile)) {
        $raw = (string) @file_get_contents($cacheFile);
        $cached = json_decode($raw, true);
        if (is_array($cached) && isset($cached['ts']) && (time() - (int) $cached['ts']) <= $cacheTtl && isset($cached['payload']) && is_array($cached['payload'])) {
            jsonResponse($cached['payload']);
        }
    }

    $pdo = db();
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
    $safeFetchAll = function (string $sql, string $label) use ($pdo): array {
        try {
            return $pdo->query($sql)->fetchAll() ?: [];
        } catch (Throwable $e) {
            error_log('[bootstrap.php] ' . $label . ' failed: ' . $e->getMessage());
            return [];
        }
    };

    $tasks = $tableExists('tasks')
        ? $safeFetchAll('SELECT id, titulo, responsavel, prazo, status, prioridade FROM tasks ORDER BY id ASC', 'tasks')
        : [];
    $opSqlBase = plannerOpTaskListSelectSqlFallback() . ' ORDER BY id ASC';
    $opSqlExt = plannerOpTaskListSelectSql() . ' ORDER BY id ASC';
    $opTasks = [];
    if ($tableExists('op_tasks')) {
        $hasOrdem = dbColumnExists($pdo, 'op_tasks', 'ordem_servico');
        $hasSub = dbColumnExists($pdo, 'op_tasks', 'sub_processo');
        if ($hasOrdem && $hasSub) {
            $opTasks = $safeFetchAll($opSqlExt, 'op_tasks');
        } elseif ($hasOrdem) {
            $opSqlOrdemOnly = 'SELECT id, taskCode, titulo, setor, regiao, responsavel, clientesAfetados,
              coordenadas, localizacao_texto AS localizacaoTexto, categoria, prazo, prioridade, status,
              is_parent_task, parent_task_id, criadaEm, historico, chat_thread_key AS chatThreadKey,
              nome_cliente AS nomeCliente, protocolo, ordem_servico AS ordemServico,
              data_entrada AS dataEntrada, data_instalacao AS dataInstalacao,
              assinada_por AS assinadaPor, assinada_em AS assinadaEm,
              CHAR_LENGTH(COALESCE(descricao, \'\')) AS descricaoLen,
              UNIX_TIMESTAMP(updated_at) AS updatedAt
              FROM op_tasks ORDER BY id ASC';
            $opTasks = $safeFetchAll($opSqlOrdemOnly, 'op_tasks_ordem');
        } else {
            $opTasks = $safeFetchAll($opSqlBase, 'op_tasks_base');
        }
    }
    $cfgRows = $tableExists('app_config')
        ? $safeFetchAll('SELECT cfg_key, cfg_value FROM app_config', 'app_config')
        : [];
    $notifs = $tableExists('app_notification')
        ? $safeFetchAll('SELECT id, kind, title, message, ref_type, ref_id, op_category AS opCategory, created_by AS createdBy, created_at AS createdAt
                 FROM app_notification ORDER BY id DESC LIMIT 50', 'app_notification')
        : [];
    $activity = $tableExists('app_activity_event')
        ? $safeFetchAll('SELECT id, username, event_type AS eventType, severity, message, ref_type AS refType, ref_id AS refId,
          op_category AS opCategory, created_at AS createdAt
          FROM app_activity_event ORDER BY id DESC LIMIT 30', 'app_activity_event')
        : [];
    $escalas = $tableExists('escalas')
        ? $safeFetchAll('SELECT id, client_uid AS clientUid, data, mes, dia_semana AS diaSemana,
            TIME_FORMAT(horario, "%H:%i") AS horario,
            TIME_FORMAT(COALESCE(horario_inicio, horario), "%H:%i") AS horarioInicio,
            TIME_FORMAT(COALESCE(horario_fim, horario), "%H:%i") AS horarioFim,
            horas, nome,
            created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
            FROM escalas ORDER BY data ASC, mes ASC, dia_semana ASC, COALESCE(horario_inicio, horario) ASC, nome ASC, id ASC', 'escalas')
        : [];

    $cfgMap = [];
    foreach ($cfgRows as $row) {
        $cfgMap[$row['cfg_key']] = json_decode((string) $row['cfg_value'], true);
    }

    foreach ($opTasks as &$item) {
        $item = plannerFormatOpTaskRow($item, false);
    }
    unset($item);

    $rawWebhook = $cfgMap['webhookConfig'] ?? ['url' => '', 'events' => ['andamento' => true, 'concluida' => true, 'finalizada' => true]];
    $maskedWebhook = plannerMaskWebhookConfigForClient(is_array($rawWebhook) ? $rawWebhook : []);
    $techDirectory = (isset($cfgMap['techDirectory']) && is_array($cfgMap['techDirectory']))
        ? $cfgMap['techDirectory']
        : null;

    $payload = [
        'ok' => true,
        'csrfToken' => $csrfTokenValue,
        'tasks' => $tasks,
        'opTasks' => $opTasks,
        'escalas' => $escalas,
        'notifications' => array_reverse($notifs ?: []),
        'activity' => array_reverse($activity ?: []),
        'webhookConfig' => $maskedWebhook,
        'plannerConfig' => $cfgMap['plannerConfig'] ?? ['note' => ''],
    ];
    if ($techDirectory !== null) {
        $payload['techDirectory'] = $techDirectory;
    }

    @file_put_contents($cacheFile, json_encode(['ts' => time(), 'payload' => $payload], JSON_UNESCAPED_UNICODE), LOCK_EX);

    jsonResponse($payload);
} catch (Throwable $e) {
    error_log('[bootstrap.php] failed: ' . $e->getMessage());
    jsonResponse(['ok' => false, 'error' => 'server_error'], 500);
}
