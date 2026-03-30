<?php
declare(strict_types=1);
require __DIR__ . '/db.php';

try {
    $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    if ($id <= 0) {
        http_response_code(404);
        exit;
    }
    $pdo = db();
    $stmt = $pdo->prepare('SELECT image_mime, image_data FROM chat_message WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();
    if (!$row) {
        http_response_code(404);
        exit;
    }
    $mime = (string) ($row['image_mime'] ?? '');
    $data = $row['image_data'] ?? null;
    if (!$mime || !is_string($data) || $data === '') {
        http_response_code(404);
        exit;
    }
    if (stripos($mime, 'image/') !== 0) {
        http_response_code(415);
        exit;
    }

    header('Content-Type: ' . $mime);
    header('Cache-Control: private, max-age=86400');
    echo $data;
    exit;
} catch (Throwable $e) {
    http_response_code(500);
    exit;
}

