<?php
declare(strict_types=1);

/**
 * Sessão compartilhada pelos endpoints da API.
 */
if (session_status() === PHP_SESSION_NONE) {
    // Hardening básico de sessão (hospedagem compartilhada).
    @ini_set('session.use_strict_mode', '1');
    @ini_set('session.use_only_cookies', '1');
    @ini_set('session.cookie_httponly', '1');
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

/**
 * Conexão MySQL — HostGator/cPanel ou variáveis de ambiente.
 * Preferência: api/credentials.php (copie de credentials.example.php).
 */
function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $host = getenv('DB_HOST') ?: 'localhost';
    $name = getenv('DB_NAME') ?: '';
    $user = getenv('DB_USER') ?: '';
    $pass = getenv('DB_PASS') ?: '';
    $port = getenv('DB_PORT') ?: '3306';

    $credFile = __DIR__ . '/credentials.php';
    if (is_readable($credFile)) {
        $c = require $credFile;
        if (is_array($c)) {
            $host = (string) ($c['host'] ?? $host);
            $name = (string) ($c['database'] ?? $c['name'] ?? $name);
            $user = (string) ($c['user'] ?? $c['username'] ?? $user);
            $pass = (string) ($c['password'] ?? $c['pass'] ?? $pass);
            $port = (string) ($c['port'] ?? $port);
        }
    }

    if ($name === '' || $user === '') {
        throw new RuntimeException(
            'Configure MySQL: crie api/credentials.php a partir de credentials.example.php ' .
            'ou defina DB_NAME e DB_USER no servidor.'
        );
    }

    $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";
    try {
        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci",
        ]);
    } catch (PDOException $e) {
        // Mensagem completa vai para o log do servidor; response fica genérica.
        error_log('[db.php] PDO connect failed: ' . $e->getMessage());
        throw new RuntimeException('Falha ao conectar no banco de dados.');
    }

    return $pdo;
}

function readJsonBody(): array
{
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function jsonResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Vary: Accept-Encoding');
    // HostGator/cPanel pode ter cache/proxy agressivo: nunca cachear respostas JSON da API.
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Expires: 0');
    // FIX: CORS conservador (sessão). Permitimos apenas a mesma origem do host atual.
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
    $sameOrigin = ($host !== '') ? ($scheme . '://' . $host) : '';
    if ($sameOrigin !== '') {
        header('Access-Control-Allow-Origin: ' . $sameOrigin);
        header('Vary: Origin');
    }
    header('Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    $body = json_encode($payload, JSON_UNESCAPED_UNICODE);
    if ($body === false) {
        $body = '{"ok":false,"error":"json_encode_failed"}';
    }

    $accept = (string) ($_SERVER['HTTP_ACCEPT_ENCODING'] ?? '');
    $canGzip = (stripos($accept, 'gzip') !== false) && function_exists('gzencode') && !headers_sent();
    // Evita gzip em respostas muito pequenas (overhead pode piorar).
    if ($canGzip && strlen($body) > 1024) {
        header('Content-Encoding: gzip');
        echo gzencode($body, 6);
    } else {
        echo $body;
    }
    exit;
}

function requireAuth(): void
{
    if (empty($_SESSION['planner_user'])) {
        jsonResponse(['ok' => false, 'error' => 'unauthorized'], 401);
    }
}

function requireSameOriginForMutation(): void
{
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (!in_array($method, ['POST', 'DELETE', 'PUT', 'PATCH'], true)) {
        return;
    }
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
    if ($host === '') {
        return;
    }
    $expected = $scheme . '://' . $host;
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    $referer = (string) ($_SERVER['HTTP_REFERER'] ?? '');
    if ($origin !== '' && stripos($origin, $expected) === 0) {
        return;
    }
    if ($origin === '' && $referer !== '' && stripos($referer, $expected) === 0) {
        return;
    }
    // FIX: CSRF básica via Origin/Referer (sessão).
    jsonResponse(['ok' => false, 'error' => 'forbidden'], 403);
}

