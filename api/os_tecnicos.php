<?php
declare(strict_types=1);
require __DIR__ . '/db.php';
require __DIR__ . '/os_tecnicos.inc.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    jsonResponse(['ok' => true]);
}

try {
    requireAuth();

    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $pdo = db();

    if ($method === 'GET') {
        if (!osTecnicosTableExists($pdo)) {
            jsonResponse(['ok' => true, 'rows' => [], 'source' => 'none']);
        }
        jsonResponse(['ok' => true, 'rows' => osTecFetchAllRows($pdo), 'source' => 'os_tecnicos']);
    }

    if ($method !== 'POST') {
        jsonResponse(['ok' => false, 'error' => 'Method not allowed'], 405);
    }

    requireSameOriginForMutation();
    $data = readJsonBody();
    $action = (string) ($data['action'] ?? '');

    if ($action === 'rebuild') {
        $n = osTecRebuildAll($pdo);
        jsonResponse(['ok' => true, 'rebuilt' => $n]);
    }

    if ($action === 'salvar') {
        $taskId = (int) ($data['task_id'] ?? $data['taskId'] ?? 0);
        if ($taskId <= 0) {
            jsonResponse(['ok' => false, 'error' => 'task_id_invalido'], 422);
        }

        if (!empty($data['task']) && is_array($data['task'])) {
            osTecSyncFromOpTask($pdo, $taskId, $data['task']);
        } else {
            $tecnicos = (array) ($data['tecnicos'] ?? []);
            $names = [];
            foreach ($tecnicos as $nome) {
                $n = trim((string) $nome);
                if ($n !== '') {
                    $names[] = $n;
                }
            }
            osTecSyncFromOpTask($pdo, $taskId, [
                'responsavel' => implode(' · ', $names),
                'parentTaskId' => $data['parentTaskId'] ?? $data['parent_task_id'] ?? null,
                'ordemServico' => (string) ($data['ordemServico'] ?? $data['ordem_servico'] ?? ''),
                'titulo' => (string) ($data['titulo'] ?? ''),
                'taskCode' => (string) ($data['taskCode'] ?? $data['task_code'] ?? ''),
                'categoria' => (string) ($data['categoria'] ?? ''),
                'regiao' => (string) ($data['regiao'] ?? ''),
                'status' => (string) ($data['status'] ?? ''),
                'protocolo' => (string) ($data['protocolo'] ?? ''),
                'prioridade' => (string) ($data['prioridade'] ?? ''),
                'criadaEm' => (string) ($data['criadaEm'] ?? $data['criada_em'] ?? date('c')),
                'historico' => is_array($data['historico'] ?? null) ? $data['historico'] : [],
                'isParentTask' => false,
            ]);
        }

        jsonResponse(['ok' => true]);
    }

    jsonResponse(['ok' => false, 'error' => 'action_invalida'], 400);
} catch (Throwable $e) {
    error_log('[os_tecnicos.php] failed: ' . $e->getMessage());
    jsonResponse(['ok' => false, 'error' => 'server_error'], 500);
}
