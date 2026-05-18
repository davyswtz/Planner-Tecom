<?php
declare(strict_types=1);

/** Usuários com permissão de integrações / rebuild / pings administrativos. */
function plannerPrivilegedUsernames(): array
{
    return ['joaoibipar', 'jobertibipar', 'davyibipar'];
}

function plannerIsPrivilegedUser(?string $username = null): bool
{
    $u = strtolower(trim($username ?? (string) ($_SESSION['planner_user'] ?? '')));
    if ($u === '') {
        return false;
    }
    return in_array($u, plannerPrivilegedUsernames(), true);
}

function plannerRequirePrivilegedUser(): void
{
    if (!plannerIsPrivilegedUser()) {
        jsonResponse(['ok' => false, 'error' => 'forbidden'], 403);
    }
}

function plannerMaskWebhookUrl(string $url): string
{
    $u = trim($url);
    if ($u === '') {
        return '';
    }
    return 'configured';
}

/** Remove tokens de webhook do payload enviado ao navegador (bootstrap). */
function plannerMaskWebhookConfigForClient(array $cfg): array
{
    $events = (isset($cfg['events']) && is_array($cfg['events'])) ? $cfg['events'] : [
        'andamento' => true,
        'concluida' => true,
        'finalizada' => true,
    ];
    $byRegion = (isset($cfg['urlsByRegion']) && is_array($cfg['urlsByRegion'])) ? $cfg['urlsByRegion'] : [];
    $maskedRegions = [];
    foreach ($byRegion as $k => $v) {
        if (is_string($v) && trim($v) !== '') {
            $maskedRegions[(string) $k] = 'configured';
        }
    }
    $main = trim((string) ($cfg['url'] ?? ''));
    return [
        'url' => $main !== '' ? 'configured' : '',
        'urlsByRegion' => $maskedRegions,
        'events' => $events,
        'masked' => true,
    ];
}

/** Colunas leves para bootstrap / changes (sem descricao completa; inclui descricaoLen). */
function plannerOpTaskListSelectSql(): string
{
    return 'SELECT id, taskCode, titulo, setor, regiao, responsavel, clientesAfetados,
      coordenadas, localizacao_texto AS localizacaoTexto, categoria, prazo, prioridade, status,
      is_parent_task, parent_task_id, criadaEm, historico, chat_thread_key AS chatThreadKey,
      nome_cliente AS nomeCliente, protocolo, ordem_servico AS ordemServico, sub_processo AS subProcesso,
      data_entrada AS dataEntrada, data_instalacao AS dataInstalacao,
      assinada_por AS assinadaPor, assinada_em AS assinadaEm,
      CHAR_LENGTH(COALESCE(descricao, \'\')) AS descricaoLen
      FROM op_tasks';
}

function plannerOpTaskListSelectSqlFallback(): string
{
    return 'SELECT id, taskCode, titulo, setor, regiao, responsavel, clientesAfetados,
      coordenadas, localizacao_texto AS localizacaoTexto, categoria, prazo, prioridade, status,
      is_parent_task, parent_task_id, criadaEm, historico, chat_thread_key AS chatThreadKey,
      nome_cliente AS nomeCliente, protocolo, data_entrada AS dataEntrada, data_instalacao AS dataInstalacao,
      assinada_por AS assinadaPor, assinada_em AS assinadaEm,
      CHAR_LENGTH(COALESCE(descricao, \'\')) AS descricaoLen
      FROM op_tasks';
}

/** Detalhe completo (modal de edição). */
function plannerOpTaskDetailSelectSql(): string
{
    return plannerOpTaskListSelectSql() . ' WHERE id = :id LIMIT 1';
}

function plannerOpTaskDetailSelectSqlFallback(): string
{
    return plannerOpTaskListSelectSqlFallback() . ' WHERE id = :id LIMIT 1';
}

function plannerFormatOpTaskRow(array $item, bool $includeDescricao = false): array
{
    if ($includeDescricao) {
        $item['descricao'] = (string) ($item['descricao'] ?? '');
    } else {
        unset($item['descricao']);
    }
    if (array_key_exists('descricaoLen', $item)) {
        $item['descricaoLen'] = (int) ($item['descricaoLen'] ?? 0);
    }
    $item['historico'] = json_decode((string) ($item['historico'] ?? '[]'), true) ?: [];
    $item['isParentTask'] = ((int) ($item['is_parent_task'] ?? 0)) === 1;
    $item['parentTaskId'] = isset($item['parent_task_id']) ? (int) $item['parent_task_id'] : null;
    unset($item['is_parent_task'], $item['parent_task_id']);
    return $item;
}

/** Histórico de descrições salvas (auditoria / recuperação). */
function plannerLogOpTaskDescricao(PDO $pdo, int $opTaskId, string $descricao): void
{
    if ($opTaskId <= 0) {
        return;
    }
    try {
        $chk = $pdo->query(
            "SELECT 1 FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'op_task_descricao_log' LIMIT 1"
        );
        if (!$chk || !$chk->fetchColumn()) {
            return;
        }
        $who = (string) ($_SESSION['planner_user'] ?? '');
        $stmt = $pdo->prepare(
            'INSERT INTO op_task_descricao_log (op_task_id, descricao, saved_by) VALUES (:id, :d, :u)'
        );
        $stmt->execute([
            ':id' => $opTaskId,
            ':d' => $descricao,
            ':u' => $who,
        ]);
    } catch (Throwable $e) {
        error_log('[plannerLogOpTaskDescricao] skipped: ' . $e->getMessage());
    }
}

function plannerUsernameExists(PDO $pdo, string $username): bool
{
    $u = strtolower(trim($username));
    if ($u === '') {
        return false;
    }
    $stmt = $pdo->prepare('SELECT 1 FROM usuario WHERE username = :u LIMIT 1');
    $stmt->execute([':u' => $u]);
    return (bool) $stmt->fetchColumn();
}

function plannerNotifyRateKey(string $from, string $to): string
{
    return sys_get_temp_dir() . '/planner_notify_' . hash('sha256', $from . '|' . $to) . '.json';
}

function plannerEnforceNotifyRateLimit(string $from, string $to, int $maxPerWindow = 12, int $windowSec = 600): void
{
    $file = plannerNotifyRateKey($from, $to);
    $now = time();
    $data = ['first' => $now, 'count' => 0];
    if (is_readable($file)) {
        $decoded = json_decode((string) file_get_contents($file), true);
        if (is_array($decoded)) {
            $data = $decoded;
        }
    }
    $first = (int) ($data['first'] ?? $now);
    $count = (int) ($data['count'] ?? 0);
    if (($now - $first) > $windowSec) {
        $first = $now;
        $count = 0;
    }
    if ($count >= $maxPerWindow) {
        jsonResponse(['ok' => false, 'error' => 'rate_limited'], 429);
    }
    @file_put_contents($file, json_encode(['first' => $first, 'count' => $count + 1]), LOCK_EX);
}

function plannerOsTecRebuildRateKey(string $username): string
{
    return sys_get_temp_dir() . '/planner_os_tec_rebuild_' . hash('sha256', $username) . '.json';
}

function plannerLoadWebhookConfig(PDO $pdo): array
{
    static $cached = null;
    if (is_array($cached)) {
        return $cached;
    }
    require_once __DIR__ . '/webhooks_config.inc.php';
    $cached = plannerLoadWebhookConfigMerged($pdo);
    return $cached;
}

/** Resolve URL real do Google Chat (servidor) — usado pelo proxy webhook_send. */
function plannerResolveWebhookUrl(PDO $pdo, string $regionKey = '', string $explicitUrl = ''): string
{
    $explicit = trim($explicitUrl);
    if ($explicit !== '' && $explicit !== 'configured' && filter_var($explicit, FILTER_VALIDATE_URL)) {
        return $explicit;
    }
    $cfg = plannerLoadWebhookConfig($pdo);
    $by = (isset($cfg['urlsByRegion']) && is_array($cfg['urlsByRegion'])) ? $cfg['urlsByRegion'] : [];
    $rk = strtoupper(trim($regionKey));
    if ($rk !== '' && isset($by[$rk]) && is_string($by[$rk])) {
        $u = trim($by[$rk]);
        if ($u !== '' && $u !== 'configured') {
            return $u;
        }
    }
    if (isset($by['BACKUP']) && is_string($by['BACKUP'])) {
        $u = trim($by['BACKUP']);
        if ($u !== '' && $u !== 'configured') {
            return $u;
        }
    }
    $main = trim((string) ($cfg['url'] ?? ''));
    if ($main !== '' && $main !== 'configured') {
        return $main;
    }
    return '';
}

function plannerEnforceOsTecRebuildRateLimit(string $username, int $minIntervalSec = 120): void
{
    $file = plannerOsTecRebuildRateKey($username);
    $now = time();
    if (is_readable($file)) {
        $last = (int) trim((string) file_get_contents($file));
        if ($last > 0 && ($now - $last) < $minIntervalSec) {
            jsonResponse(['ok' => false, 'error' => 'rate_limited', 'retry_after' => $minIntervalSec - ($now - $last)], 429);
        }
    }
    @file_put_contents($file, (string) $now, LOCK_EX);
}
