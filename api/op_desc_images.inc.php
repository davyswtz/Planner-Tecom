<?php
declare(strict_types=1);

/**
 * Extrai imagens em data URL de tags <img> na descrição, grava em op_task_image e substitui o src.
 * Retorna HTML final referenciando op_task_image.php?id=...
 */
function processOpTaskDescricaoImages(string $html, int $opTaskId, PDO $pdo): string
{
    if ($html === '' || $opTaskId <= 0) {
        return $html;
    }

    $maxBytes = 8 * 1024 * 1024; // 8 MB por imagem (após decode)

    return (string) preg_replace_callback(
        '/<img\b[^>]*\bsrc\s*=\s*["\'](data:image\/(png|jpeg|jpg|gif|webp);base64,([^"\']+))["\'][^>]*>/i',
        function (array $m) use ($opTaskId, $pdo, $maxBytes): string {
            $rawB64 = $m[3];
            $binary = base64_decode((string) preg_replace('/\s+/', '', $rawB64), true);
            if ($binary === false || $binary === '') {
                return $m[0];
            }
            if (strlen($binary) > $maxBytes) {
                return $m[0];
            }

            $ext = strtolower($m[2]);
            if ($ext === 'jpg') {
                $ext = 'jpeg';
            }
            $mime = 'image/' . $ext;

            $stmt = $pdo->prepare(
                'INSERT INTO op_task_image (op_task_id, mime_type, image_data) VALUES (:task, :mime, :data)'
            );
            $stmt->execute([
                ':task' => $opTaskId,
                ':mime' => $mime,
                ':data' => $binary,
            ]);
            $newId = (int) $pdo->lastInsertId();
            $src = 'api/op_task_image.php?id=' . $newId;

            return '<img src="' . htmlspecialchars($src, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '" alt="" data-op-img-id="' . $newId . '" />';
        },
        $html
    );
}

/**
 * Remove registros de imagem que não aparecem mais no HTML da descrição.
 */
function pruneOpTaskImagesNotInHtml(PDO $pdo, int $opTaskId, string $html): void
{
    if ($opTaskId <= 0) {
        return;
    }

    preg_match_all('/(?:op_task_image\.php\?id=|data-op-img-id=")(\d+)/', $html, $matches);
    $keep = [];
    foreach ($matches[1] ?? [] as $v) {
        $n = (int) $v;
        if ($n > 0) {
            $keep[$n] = true;
        }
    }

    if (empty($keep)) {
        $stmt = $pdo->prepare('DELETE FROM op_task_image WHERE op_task_id = :tid');
        $stmt->execute([':tid' => $opTaskId]);

        return;
    }

    $ids = array_keys($keep);
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $sql = "DELETE FROM op_task_image WHERE op_task_id = ? AND id NOT IN ($placeholders)";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(array_merge([$opTaskId], $ids));
}
