#!/usr/bin/env php
<?php
declare(strict_types=1);

require __DIR__ . '/../db.php';

/**
 * Cria/atualiza usuário do painel na tabela `usuario` (PBKDF2 sha256).
 *
 * Uso:
 *   php api/tools/create_usuario.php <username> "<senha>"
 *
 * Exemplo:
 *   php api/tools/create_usuario.php jobertibipar "ibi2026"
 *
 * Observação: execute apenas via CLI (não abra via navegador).
 */
if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "Este script só pode ser executado pela linha de comando (CLI).\n");
    exit(1);
}

$user = strtolower(trim((string) ($argv[1] ?? '')));
$plain = (string) ($argv[2] ?? '');

if ($user === '' || $plain === '') {
    fwrite(STDERR, "Uso:\n  php api/tools/create_usuario.php <username> \"<senha>\"\n");
    exit(1);
}

if (!preg_match('/^[a-z0-9._-]+$/', $user)) {
    fwrite(STDERR, "Username inválido: use apenas letras minúsculas, números, . _ -\n");
    exit(1);
}

$saltBin = random_bytes(16);
$iterations = 60000;
$hashBin = hash_pbkdf2('sha256', $plain, $saltBin, $iterations, 32, true);

$saltHex = bin2hex($saltBin);
$hashHex = bin2hex($hashBin);

try {
    $pdo = db();
    $stmt = $pdo->prepare(
        'INSERT INTO usuario (username, pass_salt, pass_hash, pass_iterations)
         VALUES (:u, :s, :h, :i)
         ON DUPLICATE KEY UPDATE
           pass_salt = VALUES(pass_salt),
           pass_hash = VALUES(pass_hash),
           pass_iterations = VALUES(pass_iterations)'
    );
    $stmt->execute([
        ':u' => $user,
        ':s' => $saltHex,
        ':h' => $hashHex,
        ':i' => $iterations,
    ]);

    echo "OK: usuário '{$user}' criado/atualizado com PBKDF2 ({$iterations} iterações).\n";
} catch (Throwable $e) {
    fwrite(STDERR, "Falha ao criar usuário: " . $e->getMessage() . "\n");
    exit(1);
}

