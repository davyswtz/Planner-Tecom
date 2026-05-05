<?php
declare(strict_types=1);
require __DIR__ . '/db.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    jsonResponse(['ok' => true]);
}

try {
    requireAuth();
    requireSameOriginForMutation();

    $isLocalRequest = function (): bool {
        $addr = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
        if ($addr === '127.0.0.1' || $addr === '::1') return true;
        $host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
        if ($host === 'localhost' || str_starts_with($host, 'localhost:')) return true;
        if ($host === '127.0.0.1' || str_starts_with($host, '127.0.0.1:')) return true;
        return false;
    };

    $canMutate = function (): bool {
        $u = strtolower(trim((string) ($_SESSION['planner_user'] ?? '')));
        if (in_array($u, ['davyibipar', 'joaoibipar', 'localhost'], true)) return true;
        // Ambiente local: libera mutações para facilitar testes.
        if ($isLocalRequest()) return true;
        return false;
    };

    $pdo = db();
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

    if ($method === 'GET') {
        $rows = $pdo->query(
            'SELECT id, client_uid AS clientUid, data, mes, dia_semana AS diaSemana,
                    TIME_FORMAT(horario, "%H:%i") AS horario,
                    TIME_FORMAT(COALESCE(horario_inicio, horario), "%H:%i") AS horarioInicio,
                    TIME_FORMAT(COALESCE(horario_fim, horario), "%H:%i") AS horarioFim,
                    horas, nome,
                    created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
               FROM escalas
              ORDER BY data ASC, mes ASC, dia_semana ASC, COALESCE(horario_inicio, horario) ASC, nome ASC, id ASC'
        )->fetchAll() ?: [];
        jsonResponse(['ok' => true, 'escalas' => $rows]);
    }

    if ($method === 'DELETE') {
        if (!$canMutate()) {
            jsonResponse(['ok' => false, 'error' => 'forbidden'], 403);
        }
        $data = readJsonBody();
        $id = (int) ($data['id'] ?? 0);
        if ($id <= 0) {
            jsonResponse(['ok' => false, 'error' => 'id invalido'], 422);
        }
        $deletedBy = (string) ($_SESSION['planner_user'] ?? '');

        $pdo->prepare('DELETE FROM escalas WHERE id = :id')->execute([':id' => $id]);
        try {
            $pdo->prepare(
                'INSERT INTO deleted_entity_log (entity_type, entity_id, parent_entity_id, deleted_by)
                 VALUES (:type, :entity_id, :parent_entity_id, :deleted_by)'
            )->execute([
                ':type' => 'escala',
                ':entity_id' => $id,
                ':parent_entity_id' => null,
                ':deleted_by' => $deletedBy,
            ]);
        } catch (Throwable $e) {
            // Migration 008 é opcional/gradual; não falhar se o log ainda não existir.
            error_log('[escalas.php] delete log skipped: ' . $e->getMessage());
        }
        jsonResponse(['ok' => true]);
    }

    if ($method !== 'POST') {
        jsonResponse(['ok' => false, 'error' => 'Method not allowed'], 405);
    }

    if (!$canMutate()) {
        jsonResponse(['ok' => false, 'error' => 'forbidden'], 403);
    }

    $data = readJsonBody();
    $clientUid = trim((string) ($data['clientUid'] ?? ''));
    if ($clientUid === '' || strlen($clientUid) > 48) {
        jsonResponse(['ok' => false, 'error' => 'clientUid invalido'], 422);
    }
    $mes = (int) ($data['mes'] ?? 0);
    $diaSemana = (int) ($data['diaSemana'] ?? 0);
    $dataYmd = trim((string) ($data['data'] ?? ''));
    $horario = trim((string) ($data['horario'] ?? '')); // compat
    $horarioIni = trim((string) ($data['horarioInicio'] ?? $horario ?? ''));
    $horarioFim = trim((string) ($data['horarioFim'] ?? $horario ?? ''));
    $horas = (float) ($data['horas'] ?? 0);
    $nome = trim((string) ($data['nome'] ?? ''));

    if ($mes < 1 || $mes > 12) jsonResponse(['ok' => false, 'error' => 'mes invalido'], 422);
    if ($diaSemana < 1 || $diaSemana > 7) jsonResponse(['ok' => false, 'error' => 'diaSemana invalido'], 422);
    if ($dataYmd !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dataYmd)) jsonResponse(['ok' => false, 'error' => 'data invalida'], 422);
    if (!preg_match('/^\d{2}:\d{2}$/', $horarioIni)) jsonResponse(['ok' => false, 'error' => 'horarioInicio invalido'], 422);
    if (!preg_match('/^\d{2}:\d{2}$/', $horarioFim)) jsonResponse(['ok' => false, 'error' => 'horarioFim invalido'], 422);
    if ($horas <= 0 || $horas > 24) jsonResponse(['ok' => false, 'error' => 'horas invalida'], 422);
    if ($nome === '' || mb_strlen($nome) > 120) jsonResponse(['ok' => false, 'error' => 'nome invalido'], 422);

    $who = (string) ($_SESSION['planner_user'] ?? '');
    $sql = 'INSERT INTO escalas (client_uid, data, mes, dia_semana, horario, horario_inicio, horario_fim, horas, nome, created_by)
            VALUES (:client_uid, :data, :mes, :dia_semana, :horario, :horario_inicio, :horario_fim, :horas, :nome, :created_by)
            ON DUPLICATE KEY UPDATE
              data = VALUES(data),
              mes = VALUES(mes),
              dia_semana = VALUES(dia_semana),
              horario = VALUES(horario),
              horario_inicio = VALUES(horario_inicio),
              horario_fim = VALUES(horario_fim),
              horas = VALUES(horas),
              nome = VALUES(nome),
              updated_at = NOW()';
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':client_uid' => $clientUid,
        ':data' => ($dataYmd === '' ? null : $dataYmd),
        ':mes' => $mes,
        ':dia_semana' => $diaSemana,
        ':horario' => $horarioIni . ':00',
        ':horario_inicio' => $horarioIni . ':00',
        ':horario_fim' => $horarioFim . ':00',
        ':horas' => $horas,
        ':nome' => $nome,
        ':created_by' => $who,
    ]);

    $id = (int) ($pdo->lastInsertId() ?: 0);
    if ($id <= 0) {
        $q = $pdo->prepare('SELECT id FROM escalas WHERE client_uid = :client_uid LIMIT 1');
        $q->execute([':client_uid' => $clientUid]);
        $id = (int) ($q->fetchColumn() ?: 0);
    }

    jsonResponse(['ok' => true, 'id' => $id, 'clientUid' => $clientUid]);
} catch (Throwable $e) {
    error_log('[escalas.php] failed: ' . $e->getMessage());
    jsonResponse(['ok' => false, 'error' => 'server_error'], 500);
}

