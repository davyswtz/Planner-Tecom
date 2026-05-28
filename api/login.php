<?php
declare(strict_types=1);
require __DIR__ . '/db.php';

function loginRateKey(string $username): string
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    return sys_get_temp_dir() . '/planner_login_' . hash('sha256', $ip . '|' . $username) . '.json';
}

function enforceLoginRateLimit(string $username): void
{
    $file = loginRateKey($username);
    $now = time();
    $data = [];
    if (is_readable($file)) {
        $data = json_decode((string) file_get_contents($file), true) ?: [];
    }
    $first = (int) ($data['first'] ?? $now);
    $fails = (int) ($data['fails'] ?? 0);
    if (($now - $first) > 600) {
        $first = $now;
        $fails = 0;
    }
    if ($fails >= 8) {
        jsonResponse(['ok' => false, 'error' => 'too_many_attempts'], 429);
    }
}

function recordLoginFailure(string $username): void
{
    $file = loginRateKey($username);
    $now = time();
    $data = [];
    if (is_readable($file)) {
        $data = json_decode((string) file_get_contents($file), true) ?: [];
    }
    $first = (int) ($data['first'] ?? $now);
    $fails = (int) ($data['fails'] ?? 0);
    if (($now - $first) > 600) {
        $first = $now;
        $fails = 0;
    }
    @file_put_contents($file, json_encode(['first' => $first, 'fails' => $fails + 1]), LOCK_EX);
}

function clearLoginFailures(string $username): void
{
    $file = loginRateKey($username);
    if (is_file($file)) {
        @unlink($file);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    jsonResponse(['ok' => true]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['ok' => false, 'error' => 'Method not allowed'], 405);
}

try {
    // Limpa apenas chaves de auth (evita quebrar o handler de sessão em alguns hosts).
    unset($_SESSION['planner_user'], $_SESSION['csrf_token'], $_SESSION['last_activity']);

    requireSameOriginForLogin();

    $data = readJsonBody();
    $username = strtolower(trim((string) ($data['username'] ?? '')));
    $password = (string) ($data['password'] ?? '');

    if ($username === '' || $password === '') {
        jsonResponse(['ok' => false]);
    }
    enforceLoginRateLimit($username);

    $pdo = db();
    $row = null;
    try {
        $stmt = $pdo->prepare('SELECT pass_salt, pass_hash, pass_iterations FROM usuario WHERE username = :u LIMIT 1');
        $stmt->execute([':u' => $username]);
        $row = $stmt->fetch();
    } catch (PDOException $pdoErr) {
        // Banco antigo sem pass_iterations ou restrição em information_schema no host.
        error_log('[login.php] usuario select (full) failed: ' . $pdoErr->getMessage());
        $stmt = $pdo->prepare('SELECT pass_salt, pass_hash FROM usuario WHERE username = :u LIMIT 1');
        $stmt->execute([':u' => $username]);
        $row = $stmt->fetch();
    }

    if (!$row) {
        recordLoginFailure($username);
        jsonResponse(['ok' => false]);
    }

    $salt = hex2bin((string) $row['pass_salt']);
    $expected = hex2bin((string) $row['pass_hash']);
    // Limite defensivo (evita corpos POST com iterations absurdas se o esquema for alterado).
    $iterations = (int) ($row['pass_iterations'] ?? 60000);
    if ($iterations < 10000 || $iterations > 600000) {
        $iterations = 60000;
    }

    if ($salt === false || $expected === false || $iterations <= 0) {
        recordLoginFailure($username);
        jsonResponse(['ok' => false]);
    }

    $computed = hash_pbkdf2('sha256', $password, $salt, $iterations, 32, true);
    $valid = hash_equals($expected, $computed);

    if ($valid) {
        // sessão autenticada 
        session_regenerate_id(true);
        $_SESSION['planner_user'] = $username;
        // Garante token CSRF inicial logo no login (o client deve reenviar em mutações).
        $csrf = csrfToken();
        clearLoginFailures($username);
    } else {
        recordLoginFailure($username);
    }

    jsonResponse($valid ? ['ok' => true, 'csrfToken' => $csrf ?? ''] : ['ok' => false]);
} catch (Throwable $e) {
    // nao vazar detalhes de erro para o front.
    $errorId = bin2hex(random_bytes(6));
    error_log('[login.php][' . $errorId . '] failed: ' . $e->getMessage());
    jsonResponse(['ok' => false, 'error' => 'internal_error', 'error_id' => $errorId], 500);
}

