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
    $to = strtolower(trim((string) ($data['to'] ?? '')));
    if ($to === '' || strlen($to) > 120) {
        jsonResponse(['ok' => false, 'error' => 'to invalido'], 422);
    }

    $who = (string) ($_SESSION['planner_user'] ?? '');
    $title = trim((string) ($data['title'] ?? ''));
    $message = trim((string) ($data['message'] ?? ''));
    if ($title === '') $title = 'Notificação';
    if ($message === '') $message = 'Você recebeu uma notificação.';

    // Convenção simples: prefixo "@user" para permitir filtro no front sem mudar schema.
    $message = '@' . $to . ' ' . $message;

    $pdo = db();
    $n = $pdo->prepare('INSERT INTO app_notification (kind, title, message, ref_type, ref_id, op_category, created_by)
                        VALUES (:kind, :title, :message, :ref_type, :ref_id, :op_category, :created_by)');
    $n->execute([
        ':kind' => 'user_ping',
        ':title' => $title,
        ':message' => $message,
        ':ref_type' => '',
        ':ref_id' => null,
        ':op_category' => '',
        ':created_by' => $who,
    ]);

    jsonResponse(['ok' => true]);
} catch (Throwable $e) {
    error_log('[notify.php] failed: ' . $e->getMessage());
    jsonResponse(['ok' => false, 'error' => 'server_error'], 500);
}

