<?php
declare(strict_types=1);
require __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    jsonResponse(['ok' => true]);
}

try {
    $pdo = db();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'GET') {
        $sinceId = isset($_GET['since_id']) ? (int) $_GET['since_id'] : 0;
        $limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 60;
        if ($limit <= 0) $limit = 60;
        if ($limit > 200) $limit = 200;

        if ($sinceId > 0) {
            $stmt = $pdo->prepare('
              SELECT id, username, display_name AS displayName, message, created_at AS createdAt,
                     (image_data IS NOT NULL AND OCTET_LENGTH(image_data) > 0) AS hasImage
              FROM chat_message
              WHERE id > :sinceId
              ORDER BY id ASC
              LIMIT ' . $limit
            );
            $stmt->execute([':sinceId' => $sinceId]);
            $rows = $stmt->fetchAll();
        } else {
            // Primeira carga: traz as últimas N e devolve em ordem crescente.
            $stmt = $pdo->query('
              SELECT id, username, display_name AS displayName, message, created_at AS createdAt,
                     (image_data IS NOT NULL AND OCTET_LENGTH(image_data) > 0) AS hasImage
              FROM chat_message
              ORDER BY id DESC
              LIMIT ' . $limit
            );
            $rows = array_reverse($stmt->fetchAll() ?: []);
        }

        jsonResponse(['ok' => true, 'messages' => $rows]);
    }

    if ($method === 'POST') {
        $data = readJsonBody();
        $username = strtolower(trim((string) ($data['username'] ?? '')));
        $displayName = trim((string) ($data['displayName'] ?? $username));
        $message = trim((string) ($data['message'] ?? ''));
        $imageDataUrl = trim((string) ($data['imageDataUrl'] ?? ''));

        if ($username === '' || ($message === '' && $imageDataUrl === '')) {
            jsonResponse(['ok' => false, 'error' => 'payload_invalido'], 422);
        }
        // Limites defensivos
        if (mb_strlen($username) > 120) $username = mb_substr($username, 0, 120);
        if (mb_strlen($displayName) > 120) $displayName = mb_substr($displayName, 0, 120);
        if (mb_strlen($message) > 2500) $message = mb_substr($message, 0, 2500);

        $imageMime = '';
        $imageBin = null;
        if ($imageDataUrl !== '') {
            if (!preg_match('#^data:(image/[a-z0-9+.-]+);base64,(.+)$#i', $imageDataUrl, $m)) {
                jsonResponse(['ok' => false, 'error' => 'imagem_invalida'], 422);
            }
            $imageMime = strtolower($m[1]);
            $b64 = $m[2];
            // Limite defensivo: ~1.4MB base64 (≈1MB binário)
            if (strlen($b64) > 1_400_000) {
                jsonResponse(['ok' => false, 'error' => 'imagem_grande'], 413);
            }
            $bin = base64_decode($b64, true);
            if ($bin === false || $bin === '') {
                jsonResponse(['ok' => false, 'error' => 'imagem_invalida'], 422);
            }
            if (strlen($bin) > 1_000_000) {
                jsonResponse(['ok' => false, 'error' => 'imagem_grande'], 413);
            }
            $imageBin = $bin;
        }

        $stmt = $pdo->prepare('
          INSERT INTO chat_message (username, display_name, message, image_mime, image_data)
          VALUES (:u, :d, :m, :im, :id)
        ');
        $stmt->bindValue(':u', $username);
        $stmt->bindValue(':d', $displayName ?: $username);
        $stmt->bindValue(':m', $message);
        $stmt->bindValue(':im', $imageMime);
        $stmt->bindValue(':id', $imageBin, $imageBin === null ? PDO::PARAM_NULL : PDO::PARAM_LOB);
        $stmt->execute();

        $id = (int) $pdo->lastInsertId();
        $row = $pdo->prepare('
          SELECT id, username, display_name AS displayName, message, created_at AS createdAt,
                 (image_data IS NOT NULL AND OCTET_LENGTH(image_data) > 0) AS hasImage
          FROM chat_message
          WHERE id = :id
          LIMIT 1
        ');
        $row->execute([':id' => $id]);
        $msg = $row->fetch();

        jsonResponse(['ok' => true, 'message' => $msg]);
    }

    jsonResponse(['ok' => false, 'error' => 'Method not allowed'], 405);
} catch (Throwable $e) {
    jsonResponse(['ok' => false, 'error' => $e->getMessage()], 500);
}

