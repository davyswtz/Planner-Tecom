<?php
declare(strict_types=1);
require __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    jsonResponse(['ok' => true]);
}

$data   = readJsonBody();
$action = (string) ($data['action'] ?? '');

if ($action === 'salvar') {

    $task_id  = (int) ($data['task_id'] ?? 0);
    $tecnicos = (array) ($data['tecnicos'] ?? []);

    if ($task_id === 0) {
        jsonResponse(['ok' => false, 'error' => 'task_id_invalido'], 400);
    }

    $pdo = db();

    $stmt = $pdo->prepare('DELETE FROM os_tecnicos WHERE task_id = ?');
    $stmt->execute([$task_id]);

    $insert = $pdo->prepare('INSERT INTO os_tecnicos (task_id, tecnico_nome) VALUES (?, ?)');

    foreach ($tecnicos as $nome) {
        $nome = trim((string) $nome);
        if ($nome === '') {
            continue;
        }
        $insert->execute([$task_id, $nome]);
    }

    jsonResponse(['ok' => true]);

} elseif ($action === 'finalizar_com_notificacao') {

} else {
    jsonResponse(['ok' => false, 'error' => 'action_invalida'], 400);
}