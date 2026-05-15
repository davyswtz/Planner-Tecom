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
    $hasOrdem = dbColumnExists($pdo, 'op_tasks', 'ordem_servico');
    $detailSql = $hasOrdem
        ? 'SELECT id, taskCode, titulo, setor, regiao, responsavel, clientesAfetados,
          coordenadas, localizacao_texto AS localizacaoTexto, descricao, categoria, prazo, prioridade, status,
          is_parent_task, parent_task_id, criadaEm, historico, chat_thread_key AS chatThreadKey,
          nome_cliente AS nomeCliente, protocolo, ordem_servico AS ordemServico, sub_processo AS subProcesso,
          data_entrada AS dataEntrada, data_instalacao AS dataInstalacao,
          assinada_por AS assinadaPor, assinada_em AS assinadaEm
          FROM op_tasks WHERE id = :id LIMIT 1'
        : 'SELECT id, taskCode, titulo, setor, regiao, responsavel, clientesAfetados,
          coordenadas, localizacao_texto AS localizacaoTexto, descricao, categoria, prazo, prioridade, status,
          is_parent_task, parent_task_id, criadaEm, historico, chat_thread_key AS chatThreadKey,
          nome_cliente AS nomeCliente, protocolo, data_entrada AS dataEntrada, data_instalacao AS dataInstalacao,
          assinada_por AS assinadaPor, assinada_em AS assinadaEm
          FROM op_tasks WHERE id = :id LIMIT 1';

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
