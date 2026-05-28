<?php
declare(strict_types=1);
/**
 * Teste rápido de conexão MySQL (use após deploy; remova do servidor se preferir).
 * Não expõe host/usuário/senha — só confirma se o PHP alcança o banco.
 */
require __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    jsonResponse(['ok' => true]);
}

try {
    $credFile = __DIR__ . '/credentials.php';
    if (!is_readable($credFile)) {
        jsonResponse(['ok' => false, 'error' => 'credentials_missing'], 503);
    }
    $cfg = require $credFile;
    if (!is_array($cfg)) {
        jsonResponse(['ok' => false, 'error' => 'credentials_invalid'], 503);
    }
    $dbName = trim((string) ($cfg['database'] ?? $cfg['name'] ?? ''));
    $dbUser = trim((string) ($cfg['user'] ?? $cfg['username'] ?? ''));
    if ($dbName === '' || $dbUser === '') {
        jsonResponse(['ok' => false, 'error' => 'credentials_incomplete'], 503);
    }

    $pdo = db();
    $pdo->query('SELECT 1');
    $hasUsuario = false;
    $usuarioRows = 0;
    $canSelectUsuario = false;
    try {
        $chk = $pdo->query("SHOW TABLES LIKE 'usuario'");
        $hasUsuario = (bool) ($chk && $chk->fetch());
        if ($hasUsuario) {
            $usuarioRows = (int) $pdo->query('SELECT COUNT(*) FROM usuario')->fetchColumn();
            $probe = $pdo->query('SELECT pass_salt, pass_hash FROM usuario LIMIT 1');
            $canSelectUsuario = (bool) $probe;
        }
    } catch (Throwable $e) {
        error_log('[ping_db.php] usuario table check: ' . $e->getMessage());
    }
    jsonResponse([
        'ok' => true,
        'usuarioTable' => $hasUsuario,
        'usuarioCount' => $usuarioRows,
        'usuarioReadable' => $canSelectUsuario,
    ]);
} catch (Throwable $e) {
    $msg = $e->getMessage();
    error_log('[ping_db.php] failed: ' . $msg);
    $code = 'db_unavailable';
    if (stripos($msg, 'Access denied') !== false) {
        $code = 'db_access_denied';
    } elseif (stripos($msg, 'Unknown database') !== false) {
        $code = 'db_unknown_database';
    } elseif (stripos($msg, 'Configure MySQL') !== false) {
        $code = 'credentials_incomplete';
    }
    jsonResponse(['ok' => false, 'error' => $code], 503);
}
