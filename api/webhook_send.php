<?php
declare(strict_types=1);
require __DIR__ . '/db.php';
require __DIR__ . '/planner_helpers.inc.php';

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
    $pdo = db();
    $regionKey = trim((string) ($data['regionKey'] ?? ''));
    $url = plannerResolveWebhookUrl($pdo, $regionKey, (string) ($data['url'] ?? ''));
    $payload = $data['payload'] ?? null;

    if ($url === '' || !filter_var($url, FILTER_VALIDATE_URL)) {
        jsonResponse(['ok' => false, 'error' => 'url_invalida'], 422);
    }

    $host = strtolower((string) (parse_url($url, PHP_URL_HOST) ?? ''));
    if ($host !== 'chat.googleapis.com') {
        jsonResponse(['ok' => false, 'error' => 'host_nao_permitido'], 422);
    }

    if (!is_array($payload) && !is_object($payload)) {
        jsonResponse(['ok' => false, 'error' => 'payload_invalido'], 422);
    }

    $payloadArr = is_array($payload) ? $payload : (array) $payload;
    $threadKey = '';
    if (isset($payloadArr['thread']) && is_array($payloadArr['thread'])) {
        $threadKey = trim((string) ($payloadArr['thread']['threadKey'] ?? ''));
    }
    if ($threadKey !== '' && strpos($url, 'threadKey=') === false) {
        $sep = (strpos($url, '?') !== false) ? '&' : '?';
        $url .= $sep
            . 'threadKey=' . rawurlencode($threadKey)
            . '&messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD';
    }

    $body = json_encode($payloadArr, JSON_UNESCAPED_UNICODE);
    if ($body === false) {
        jsonResponse(['ok' => false, 'error' => 'payload_encode_failed'], 422);
    }

    if (!function_exists('curl_init')) {
        jsonResponse(['ok' => false, 'error' => 'curl_indisponivel'], 503);
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json; charset=UTF-8'],
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_CONNECTTIMEOUT => 8,
    ]);
    $responseBody = curl_exec($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($responseBody === false) {
        error_log('[webhook_send.php] curl failed: ' . $curlErr);
        jsonResponse(['ok' => false, 'error' => 'envio_falhou', 'detail' => 'network'], 502);
    }

    if ($httpCode < 200 || $httpCode >= 300) {
        error_log('[webhook_send.php] HTTP ' . $httpCode . ' body=' . substr((string) $responseBody, 0, 400));
        jsonResponse(['ok' => false, 'error' => 'envio_falhou', 'status' => $httpCode], 502);
    }

    jsonResponse(['ok' => true, 'status' => $httpCode]);
} catch (Throwable $e) {
    error_log('[webhook_send.php] failed: ' . $e->getMessage());
    jsonResponse(['ok' => false, 'error' => 'server_error'], 500);
}
