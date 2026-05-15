<?php
declare(strict_types=1);

/**
 * Sessão compartilhada pelos endpoints da API.
 */
if (PHP_SAPI !== 'cli' && session_status() === PHP_SESSION_NONE) {
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

function isHttpsRequest(): bool
{
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        return true;
    }
    if (!empty($_SERVER['SERVER_PORT']) && (string) $_SERVER['SERVER_PORT'] === '443') {
        return true;
    }
    $xfp = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
    if ($xfp === 'https') {
        return true;
    }
    $xfs = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_SSL'] ?? ''));
    if ($xfs === 'on' || $xfs === '1') {
        return true;
    }
    $cfv = strtolower((string) ($_SERVER['HTTP_CF_VISITOR'] ?? ''));
    if ($cfv !== '' && strpos($cfv, '"scheme":"https"') !== false) {
        return true;
    }
    return false;
}

function normalizeHost(string $host): string
{
    $h = strtolower(trim($host));
    // remove porta se existir
    $h = preg_replace('/:\d+$/', '', $h) ?: $h;
    return $h;
}

/** Compara hosts ignorando prefixo www (comum em staging/proxy). */
function hostsAreSameSite(string $requestHost, string $otherHost): bool
{
    $a = normalizeHost($requestHost);
    $b = normalizeHost($otherHost);
    if ($a === '' || $b === '') {
        return false;
    }
    if (hash_equals($a, $b)) {
        return true;
    }
    $stripWww = static function (string $h): string {
        return preg_replace('/^www\./', '', $h) ?: $h;
    };
    return hash_equals($stripWww($a), $stripWww($b));
}

function sameSiteOriginFromRequest(): string
{
    $host = normalizeHost((string) ($_SERVER['HTTP_HOST'] ?? ''));
    if ($host === '') {
        return '';
    }

    // Preferir Origin real do browser (evita bugs de HTTPS atrás de proxy/CDN).
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origin !== '') {
        $oHost = normalizeHost((string) (parse_url($origin, PHP_URL_HOST) ?? ''));
        if ($oHost !== '' && hostsAreSameSite($host, $oHost)) {
            return $origin;
        }
    }

    $scheme = isHttpsRequest() ? 'https' : 'http';
    return $scheme . '://' . $host;
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

function dbColumnExists(PDO $pdo, string $table, string $column): bool
{
    static $cache = [];
    $key = $table . '.' . $column;
    if (array_key_exists($key, $cache)) {
        return $cache[$key];
    }
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c'
    );
    $stmt->execute([':t' => $table, ':c' => $column]);
    $cache[$key] = ((int) $stmt->fetchColumn()) > 0;
    return $cache[$key];
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
    $sameOrigin = sameSiteOriginFromRequest();
    if ($sameOrigin !== '') {
        header('Access-Control-Allow-Origin: ' . $sameOrigin);
        // não sobrescrever outros Vary
        header('Vary: Origin', false);
        header('Access-Control-Allow-Credentials: true');
    }
    header('Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS');
    // Preflight: incluir headers usados pelo client (ex.: X-CSRF-Token).
    header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
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
    if (PHP_SAPI === 'cli') {
        return;
    }

    // Expiração por inatividade (defesa em profundidade).
    $now = time();
    $idleSeconds = 30 * 60; // 30 min
    $last = (int) ($_SESSION['last_activity'] ?? 0);
    if ($last > 0 && ($now - $last) > $idleSeconds) {
        $_SESSION = [];
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_destroy();
        }
        jsonResponse(['ok' => false, 'error' => 'session_expired'], 401);
    }
    $_SESSION['last_activity'] = $now;

    if (empty($_SESSION['planner_user'])) {
        jsonResponse(['ok' => false, 'error' => 'unauthorized'], 401);
    }
}

function csrfToken(): string
{
    if (PHP_SAPI === 'cli') {
        return '';
    }
    if (empty($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token']) || strlen((string) $_SESSION['csrf_token']) < 32) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return (string) $_SESSION['csrf_token'];
}

function requireCsrfToken(): void
{
    if (PHP_SAPI === 'cli') {
        return;
    }
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (!in_array($method, ['POST', 'DELETE', 'PUT', 'PATCH'], true)) {
        return;
    }

    // Exige token apenas se existe sessão autenticada (mutações são auth-only no sistema).
    if (empty($_SESSION['planner_user'])) {
        return;
    }

    $expected = (string) ($_SESSION['csrf_token'] ?? '');
    if ($expected === '') {
        // Gera token na primeira mutação após login (o client deve reenviar com X-CSRF-Token).
        csrfToken();
        jsonResponse(['ok' => false, 'error' => 'csrf_required'], 403);
    }
    $got = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if ($got === '' || !hash_equals($expected, $got)) {
        jsonResponse(['ok' => false, 'error' => 'csrf_invalid'], 403);
    }
}

function requestOriginLooksSameSite(string $requestHost): bool
{
    if ($requestHost === '') {
        return true;
    }
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origin !== '') {
        $oHost = normalizeHost((string) (parse_url($origin, PHP_URL_HOST) ?? ''));
        if ($oHost !== '' && hostsAreSameSite($requestHost, $oHost)) {
            return true;
        }
    }
    $referer = (string) ($_SERVER['HTTP_REFERER'] ?? '');
    if ($referer !== '') {
        $rHost = normalizeHost((string) (parse_url($referer, PHP_URL_HOST) ?? ''));
        if ($rHost !== '' && hostsAreSameSite($requestHost, $rHost)) {
            return true;
        }
    }
    // Navegadores modernos em fetch same-origin costumam enviar Sec-Fetch-Site.
    $secFetchSite = strtolower((string) ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? ''));
    if (in_array($secFetchSite, ['same-origin', 'same-site'], true)) {
        return true;
    }
    return false;
}

/**
 * Login: valida origem quando enviada, mas não exige CSRF (sessão ainda não existe ou será renovada).
 */
function requireSameOriginForLogin(): void
{
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (!in_array($method, ['POST', 'DELETE', 'PUT', 'PATCH'], true)) {
        return;
    }
    $host = normalizeHost((string) ($_SERVER['HTTP_HOST'] ?? ''));
    if ($host === '') {
        return;
    }
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    $referer = (string) ($_SERVER['HTTP_REFERER'] ?? '');
    // Sem Origin/Referer: permitir (rate limit + cookie SameSite); comuns em alguns proxies.
    if ($origin === '' && $referer === '') {
        return;
    }
    if (requestOriginLooksSameSite($host)) {
        return;
    }
    jsonResponse(['ok' => false, 'error' => 'forbidden'], 403);
}

function requireSameOriginForMutation(): void
{
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (!in_array($method, ['POST', 'DELETE', 'PUT', 'PATCH'], true)) {
        return;
    }
    $host = normalizeHost((string) ($_SERVER['HTTP_HOST'] ?? ''));
    if ($host === '') {
        return;
    }
    if (requestOriginLooksSameSite($host)) {
        requireCsrfToken();
        return;
    }

    jsonResponse(['ok' => false, 'error' => 'forbidden'], 403);
}

