<?php
declare(strict_types=1);

/**
 * Sincroniza registros da tabela os_tecnicos a partir de op_tasks (OS filhas / com técnico).
 */

if (!function_exists('dbColumnExists')) {
    // Definido em db.php; fallback legado se o include vier sem db.php.
    function dbColumnExists(PDO $pdo, string $table, string $column): bool
    {
        static $cache = [];
        $key = $table . '.' . $column;
        if (array_key_exists($key, $cache)) {
            return $cache[$key];
        }
        $stmt = $pdo->prepare(
            'SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c'
        );
        $stmt->execute([':t' => $table, ':c' => $column]);
        $cache[$key] = ((int) $stmt->fetchColumn()) > 0;
        return $cache[$key];
    }
}

function osTecnicosTableExists(PDO $pdo): bool
{
    static $exists = null;
    if ($exists !== null) {
        return $exists;
    }
    $stmt = $pdo->prepare(
        'SELECT 1 FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t LIMIT 1'
    );
    $stmt->execute([':t' => 'os_tecnicos']);
    $exists = (bool) $stmt->fetchColumn();
    return $exists;
}

/** @return list<string> */
function osTecParseResponsaveis(string $raw): array
{
    $s = trim($raw);
    if ($s === '') {
        return [];
    }
    $parts = preg_split('/\s*[·|,;]\s*/u', $s) ?: [];
    $out = [];
    foreach ($parts as $p) {
        $n = trim((string) $p);
        if ($n === '') {
            continue;
        }
        if (preg_match('/^inativo\b/i', $n)) {
            continue;
        }
        $out[] = $n;
    }
    return array_values(array_unique($out));
}

function osTecCompletionDayFromHistorico($historico): string
{
    $done = ['concluída', 'concluida', 'finalizada', 'finalizado'];
    if (!is_array($historico)) {
        return '';
    }
    for ($i = count($historico) - 1; $i >= 0; $i--) {
        $entry = $historico[$i];
        if (!is_array($entry)) {
            continue;
        }
        $st = mb_strtolower(trim((string) ($entry['status'] ?? '')));
        if (in_array($st, $done, true)) {
            return substr((string) ($entry['timestamp'] ?? ''), 0, 10);
        }
    }
    return '';
}

function osTecCriacaoDay(string $criadaEm): ?string
{
    $s = trim($criadaEm);
    if ($s === '') {
        return null;
    }
    if (preg_match('/^(\d{4}-\d{2}-\d{2})/', $s, $m)) {
        return $m[1];
    }
    $ts = strtotime($s);
    if ($ts === false) {
        return null;
    }
    return date('Y-m-d', $ts);
}

function osTecShouldSyncTask(array $data): bool
{
    if (!empty($data['isParentTask'])) {
        return false;
    }
    $parentId = isset($data['parentTaskId']) && $data['parentTaskId'] !== '' && $data['parentTaskId'] !== null
        ? (int) $data['parentTaskId']
        : 0;
    if ($parentId > 0) {
        return true;
    }
    $os = trim((string) ($data['ordemServico'] ?? ''));
    return $os !== '';
}

function osTecDeleteForTask(PDO $pdo, int $taskId): void
{
    if ($taskId <= 0 || !osTecnicosTableExists($pdo)) {
        return;
    }
    $pdo->prepare('DELETE FROM os_tecnicos WHERE task_id = :id')->execute([':id' => $taskId]);
}

/**
 * @param array<string,mixed> $data Payload do front (camelCase)
 */
function osTecSyncFromOpTask(PDO $pdo, int $taskId, array $data): void
{
    if ($taskId <= 0 || !osTecnicosTableExists($pdo)) {
        return;
    }

    if (!osTecShouldSyncTask($data)) {
        osTecDeleteForTask($pdo, $taskId);
        return;
    }

    $historico = $data['historico'] ?? [];
    if (!is_array($historico)) {
        $historico = [];
    }

    $parentId = isset($data['parentTaskId']) && $data['parentTaskId'] !== '' && $data['parentTaskId'] !== null
        ? (int) $data['parentTaskId']
        : null;
    $criadaEm = (string) ($data['criadaEm'] ?? '');
    $dataCriacao = osTecCriacaoDay($criadaEm);
    $dataConclusao = osTecCompletionDayFromHistorico($historico);

    $base = [
        'parent_task_id' => $parentId,
        'ordem_servico' => (string) ($data['ordemServico'] ?? ''),
        'titulo' => (string) ($data['titulo'] ?? ''),
        'task_code' => (string) ($data['taskCode'] ?? ''),
        'categoria' => (string) ($data['categoria'] ?? ''),
        'regiao' => (string) ($data['regiao'] ?? ''),
        'status' => (string) ($data['status'] ?? ''),
        'protocolo' => (string) ($data['protocolo'] ?? ''),
        'prioridade' => (string) ($data['prioridade'] ?? ''),
        'data_criacao' => $dataCriacao,
        'data_conclusao' => $dataConclusao,
        'criada_em' => $criadaEm,
    ];

    $tecnicos = osTecParseResponsaveis((string) ($data['responsavel'] ?? ''));
    if (!$tecnicos) {
        $tecnicos = ['—'];
    }

    $pdo->prepare('DELETE FROM os_tecnicos WHERE task_id = :id')->execute([':id' => $taskId]);

    $sql = 'INSERT INTO os_tecnicos (
              task_id, parent_task_id, tecnico_nome, ordem_servico, titulo, task_code,
              categoria, regiao, status, protocolo, prioridade,
              data_criacao, data_conclusao, criada_em
            ) VALUES (
              :task_id, :parent_task_id, :tecnico_nome, :ordem_servico, :titulo, :task_code,
              :categoria, :regiao, :status, :protocolo, :prioridade,
              :data_criacao, :data_conclusao, :criada_em
            )';
    $insert = $pdo->prepare($sql);

    foreach ($tecnicos as $nome) {
        $insert->execute([
            ':task_id' => $taskId,
            ':parent_task_id' => $base['parent_task_id'],
            ':tecnico_nome' => $nome,
            ':ordem_servico' => $base['ordem_servico'],
            ':titulo' => $base['titulo'],
            ':task_code' => $base['task_code'],
            ':categoria' => $base['categoria'],
            ':regiao' => $base['regiao'],
            ':status' => $base['status'],
            ':protocolo' => $base['protocolo'],
            ':prioridade' => $base['prioridade'],
            ':data_criacao' => $base['data_criacao'],
            ':data_conclusao' => $base['data_conclusao'],
            ':criada_em' => $base['criada_em'],
        ]);
    }
}

/** Reconstrói os_tecnicos a partir de todas as OS filhas em op_tasks. */
function osTecRebuildAll(PDO $pdo): int
{
    if (!osTecnicosTableExists($pdo)) {
        return 0;
    }
    $hasOrdem = false;
    $chk = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c'
    );
    $chk->execute([':t' => 'op_tasks', ':c' => 'ordem_servico']);
    $hasOrdem = ((int) $chk->fetchColumn()) > 0;

    $cols = 'id, taskCode, titulo, regiao, responsavel, categoria, prazo, prioridade, status,
      is_parent_task, parent_task_id, criadaEm, historico, protocolo';
    if ($hasOrdem) {
        $cols .= ', ordem_servico';
    }

    $rows = $pdo->query(
        "SELECT {$cols} FROM op_tasks
          WHERE (parent_task_id IS NOT NULL AND parent_task_id > 0)"
        . ($hasOrdem ? " OR (TRIM(ordem_servico) <> '' AND is_parent_task = 0)" : '')
    )->fetchAll() ?: [];

    $count = 0;
    foreach ($rows as $row) {
        $historico = json_decode((string) ($row['historico'] ?? '[]'), true) ?: [];
        $payload = [
            'taskCode' => (string) ($row['taskCode'] ?? ''),
            'titulo' => (string) ($row['titulo'] ?? ''),
            'regiao' => (string) ($row['regiao'] ?? ''),
            'responsavel' => (string) ($row['responsavel'] ?? ''),
            'categoria' => (string) ($row['categoria'] ?? ''),
            'prioridade' => (string) ($row['prioridade'] ?? ''),
            'status' => (string) ($row['status'] ?? ''),
            'protocolo' => (string) ($row['protocolo'] ?? ''),
            'isParentTask' => ((int) ($row['is_parent_task'] ?? 0)) === 1,
            'parentTaskId' => isset($row['parent_task_id']) ? (int) $row['parent_task_id'] : null,
            'criadaEm' => (string) ($row['criadaEm'] ?? ''),
            'historico' => $historico,
            'ordemServico' => $hasOrdem ? (string) ($row['ordem_servico'] ?? '') : '',
        ];
        osTecSyncFromOpTask($pdo, (int) ($row['id'] ?? 0), $payload);
        $count++;
    }
    return $count;
}

/** @return list<array<string,mixed>> */
function osTecFetchAllRows(PDO $pdo): array
{
    if (!osTecnicosTableExists($pdo)) {
        return [];
    }
    $sql = 'SELECT id, task_id AS taskId, parent_task_id AS parentTaskId, tecnico_nome AS tecnicoNome,
      ordem_servico AS ordemServico, titulo, task_code AS taskCode, categoria, regiao, status,
      protocolo, prioridade, data_criacao AS dataCriacao, data_conclusao AS dataConclusao,
      criada_em AS criadaEm, updated_at AS updatedAt
      FROM os_tecnicos ORDER BY COALESCE(data_criacao, LEFT(criada_em, 10)) DESC, id DESC';
    return $pdo->query($sql)->fetchAll() ?: [];
}
