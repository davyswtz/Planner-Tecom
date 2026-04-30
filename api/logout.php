<?php
declare(strict_types=1);
require __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    jsonResponse(['ok' => true]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['ok' => false, 'error' => 'Method not allowed'], 405);
}

requireSameOriginForMutation();

// Destrói a sessão no servidor e invalida o cookie.
if (session_status() === PHP_SESSION_ACTIVE) {
    $_SESSION = [];
    $params = session_get_cookie_params();
    setcookie(
        session_name(),
        '',
        [
            'expires'  => time() - 3600,
            'path'     => $params['path'],
            'domain'   => $params['domain'],
            'secure'   => $params['secure'],
            'httponly' => true,
            'samesite' => 'Lax',
        ]
    );
    session_destroy();
}

jsonResponse(['ok' => true]);
