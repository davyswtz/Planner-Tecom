<?php
declare(strict_types=1);
require __DIR__ . '/db.php';
require __DIR__ . '/op_desc_images.inc.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    jsonResponse(['ok' => true]);
}

try {
    if (empty($_SESSION['planner_user'])) {
        jsonResponse(['ok' => false, 'error' => 'unauthorized'], 401);
    }

    // Cache curto por usuário: reduz TTFB em hospedagem compartilhada (HostGator).
    // TTL baixo para não “atrasar” atualizações; changes.php continua sendo o caminho recomendado.
    $cacheTtl = 5;
    $cacheUser = (string) ($_SESSION['planner_user'] ?? 'anon');
    $cacheKey = 'planner_bootstrap_' . hash('sha256', $cacheUser . '|' . ($_SERVER['HTTP_HOST'] ?? '') . '|v1');
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
    $opSql = 'SELECT id, taskCode, titulo, setor, regiao, responsavel, clientesAfetados,
      coordenadas, localizacao_texto AS localizacaoTexto, descricao, categoria, prazo, prioridade, status,
      is_parent_task, parent_task_id, criadaEm, historico, chat_thread_key AS chatThreadKey,
      nome_cliente AS nomeCliente, protocolo, data_entrada AS dataEntrada,
      data_instalacao AS dataInstalacao,
      assinada_por AS assinadaPor, assinada_em AS assinadaEm
      FROM op_tasks ORDER BY id ASC';
    $opTasks = $tableExists('op_tasks') ? $safeFetchAll($opSql, 'op_tasks') : [];
    $cfgRows = $tableExists('app_config')
        ? $safeFetchAll('SELECT cfg_key, cfg_value FROM app_config', 'app_config')
        : [];
    $notifs = $tableExists('app_notification')
        ? $safeFetchAll('SELECT id, kind, title, message, ref_type, ref_id, op_category AS opCategory, created_by AS createdBy, created_at AS createdAt
                 FROM app_notification ORDER BY id DESC LIMIT 50', 'app_notification')
        : [];
    // Feed global (todos os usuários)
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
        // A descrição já é sanitizada no momento do save (op_tasks.php). Evita custo alto aqui no bootstrap.
        $item['descricao'] = (string) ($item['descricao'] ?? '');
        $item['historico'] = json_decode((string) ($item['historico'] ?? '[]'), true) ?: [];
        $item['isParentTask'] = ((int) ($item['is_parent_task'] ?? 0)) === 1;
        $item['parentTaskId'] = isset($item['parent_task_id']) ? (int) $item['parent_task_id'] : null;
        unset($item['is_parent_task'], $item['parent_task_id']);
    }

    $payload = [
        'ok' => true,
        'tasks' => $tasks,
        'opTasks' => $opTasks,
        'escalas' => $escalas,
        'notifications' => array_reverse($notifs ?: []),
        'activity' => array_reverse($activity ?: []),
        'webhookConfig' => $cfgMap['webhookConfig'] ?? ['url' => '', 'events' => ['andamento' => true, 'concluida' => true, 'finalizada' => true]],
        'plannerConfig' => $cfgMap['plannerConfig'] ?? ['note' => ''],
    ];

    // Best-effort: grava cache (não deve quebrar o endpoint se falhar).
    @file_put_contents($cacheFile, json_encode(['ts' => time(), 'payload' => $payload], JSON_UNESCAPED_UNICODE), LOCK_EX);

    jsonResponse($payload);
} catch (Throwable $e) {
    // FIX: não vazar detalhes internos; logar com contexto.
    error_log('[bootstrap.php] failed: ' . $e->getMessage());
    jsonResponse(['ok' => false, 'error' => 'server_error'], 500);
}

