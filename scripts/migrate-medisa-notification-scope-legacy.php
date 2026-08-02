<?php
/**
 * notificationReadState içindeki etkisiz legacy scope:* key'lerini temizler.
 * Dry-run varsayılandır; apply iki exact beklenti ve açık onay olmadan çalışmaz.
 *
 * Dry-run:
 *   php scripts/migrate-medisa-notification-scope-legacy.php --mode=dry-run --data=/path/data.json
 * Apply:
 *   php scripts/migrate-medisa-notification-scope-legacy.php --mode=apply --data=/path/data.json \
 *     --expect-remove=N --expect-sha256=<dry-run sha> \
 *     --confirm=REMOVE_LEGACY_NOTIFICATION_SCOPES
 */

require_once dirname(__DIR__) . '/core.php';

define('MEDISA_NOTIFICATION_SCOPE_CLEANUP_CONFIRM', 'REMOVE_LEGACY_NOTIFICATION_SCOPES');

function nslArgs(array $argv): array {
    $out = [];
    foreach (array_slice($argv, 1) as $arg) {
        if (strpos($arg, '--') !== 0) continue;
        $parts = explode('=', substr($arg, 2), 2);
        $out[$parts[0]] = $parts[1] ?? '1';
    }
    return $out;
}

function nslIsLegacyKey($key): bool {
    return is_string($key) && strpos($key, 'scope:') === 0;
}

function nslRead(string $path): array {
    if ($path === '' || strpos($path, "\0") !== false || is_link($path) || !is_file($path)) {
        return ['ok' => false, 'error_code' => 'DATA_FILE_UNAVAILABLE'];
    }
    $raw = @file_get_contents($path);
    if ($raw === false) return ['ok' => false, 'error_code' => 'DATA_FILE_READ_FAILED'];
    $data = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($data)) {
        return ['ok' => false, 'error_code' => 'INVALID_JSON'];
    }
    return ['ok' => true, 'raw' => $raw, 'data' => $data, 'sha256' => hash('sha256', $raw)];
}

function nslAnalyze(array $data): array {
    $state = isset($data['notificationReadState']) && is_array($data['notificationReadState'])
        ? $data['notificationReadState']
        : [];
    $legacy = 0;
    foreach (array_keys($state) as $key) {
        if (nslIsLegacyKey($key)) $legacy++;
    }
    return [
        'legacy_scope_key_count' => $legacy,
        'preserved_notification_key_count' => count($state) - $legacy,
        'notification_state_present' => array_key_exists('notificationReadState', $data),
    ];
}

function nslRemoveLegacy(array $data): array {
    if (!isset($data['notificationReadState']) || !is_array($data['notificationReadState'])) return $data;
    foreach (array_keys($data['notificationReadState']) as $key) {
        if (nslIsLegacyKey($key)) unset($data['notificationReadState'][$key]);
    }
    return $data;
}

function nslRun(string $path, string $mode, string $confirm = '', ?int $expectRemove = null, string $expectSha = ''): array {
    $mode = strtolower(trim($mode));
    if ($mode !== 'dry-run' && $mode !== 'apply') {
        return ['success' => false, 'error_code' => 'INVALID_MODE'];
    }
    $initial = nslRead($path);
    if (($initial['ok'] ?? false) !== true) {
        return ['success' => false, 'error_code' => $initial['error_code'] ?? 'DATA_FILE_READ_FAILED'];
    }
    $analysis = nslAnalyze($initial['data']);
    $base = array_merge([
        'success' => true,
        'mode' => $mode,
        'before_sha256' => $initial['sha256'],
        'would_change' => $analysis['legacy_scope_key_count'] > 0,
    ], $analysis);
    if ($mode === 'dry-run' || $analysis['legacy_scope_key_count'] === 0) return $base;

    if ($confirm !== MEDISA_NOTIFICATION_SCOPE_CLEANUP_CONFIRM) {
        return ['success' => false, 'error_code' => 'CONFIRMATION_REQUIRED'];
    }
    if ($expectRemove === null || $expectRemove !== $analysis['legacy_scope_key_count']) {
        return ['success' => false, 'error_code' => 'EXPECTED_REMOVE_COUNT_MISMATCH'];
    }
    if (!preg_match('/^[a-f0-9]{64}$/', $expectSha) || !hash_equals($initial['sha256'], $expectSha)) {
        return ['success' => false, 'error_code' => 'EXPECTED_SHA256_MISMATCH'];
    }

    $lockPath = $path . '.notification-scope.lock';
    $lock = @fopen($lockPath, 'c+');
    if (!$lock || !@flock($lock, LOCK_EX)) {
        if (is_resource($lock)) @fclose($lock);
        return ['success' => false, 'error_code' => 'LOCK_FAILED'];
    }

    try {
        $locked = nslRead($path);
        if (($locked['ok'] ?? false) !== true || !hash_equals($expectSha, (string)($locked['sha256'] ?? ''))) {
            return ['success' => false, 'error_code' => 'DATA_CHANGED_AFTER_DRY_RUN'];
        }
        $lockedAnalysis = nslAnalyze($locked['data']);
        if (($lockedAnalysis['legacy_scope_key_count'] ?? -1) !== $expectRemove) {
            return ['success' => false, 'error_code' => 'DATA_CHANGED_AFTER_DRY_RUN'];
        }

        $next = nslRemoveLegacy($locked['data']);
        $otherBefore = $locked['data'];
        $otherAfter = $next;
        unset($otherBefore['notificationReadState'], $otherAfter['notificationReadState']);
        if ($otherBefore !== $otherAfter) {
            return ['success' => false, 'error_code' => 'NON_TARGET_COLLECTION_CHANGED'];
        }

        $backupDir = dirname($path) . DIRECTORY_SEPARATOR . 'backups';
        if (!is_dir($backupDir) && !@mkdir($backupDir, 0750, true)) {
            return ['success' => false, 'error_code' => 'BACKUP_DIR_FAILED'];
        }
        $backupName = 'notification-scope-precleanup-' . date('Ymd-His') . '-' . bin2hex(random_bytes(4)) . '.json';
        $backupPath = $backupDir . DIRECTORY_SEPARATOR . $backupName;
        if (!medisaAtomicWriteFile($backupPath, $locked['raw'])
            || !hash_equals($locked['sha256'], (string)@hash_file('sha256', $backupPath))) {
            return ['success' => false, 'error_code' => 'BACKUP_VERIFY_FAILED'];
        }

        $json = json_encode($next, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        if ($json === false || !medisaAtomicWriteFile($path, $json)) {
            return ['success' => false, 'error_code' => 'ATOMIC_WRITE_FAILED'];
        }
        $verify = nslRead($path);
        $verifyAnalysis = ($verify['ok'] ?? false) === true ? nslAnalyze($verify['data']) : [];
        $verified = ($verify['ok'] ?? false) === true
            && ($verifyAnalysis['legacy_scope_key_count'] ?? -1) === 0
            && ($verifyAnalysis['preserved_notification_key_count'] ?? -1) === $analysis['preserved_notification_key_count'];
        if (!$verified) {
            $rolledBack = medisaAtomicWriteFile($path, $locked['raw'])
                && hash_equals($locked['sha256'], (string)@hash_file('sha256', $path));
            if (!$rolledBack) {
                return ['success' => false, 'error_code' => 'ROLLBACK_VERIFY_FAILED'];
            }
            return ['success' => false, 'error_code' => 'POST_WRITE_VERIFY_FAILED'];
        }

        return array_merge($base, [
            'applied' => true,
            'removed_count' => $expectRemove,
            'after_sha256' => $verify['sha256'],
            'rollback_backup_file' => $backupName,
        ]);
    } finally {
        @flock($lock, LOCK_UN);
        @fclose($lock);
        @unlink($lockPath);
    }
}

function nslMain(array $argv): int {
    $args = nslArgs($argv);
    $path = (string)($args['data'] ?? getDataFilePath());
    $expectRemove = array_key_exists('expect-remove', $args) ? (int)$args['expect-remove'] : null;
    $result = nslRun(
        $path,
        (string)($args['mode'] ?? 'dry-run'),
        (string)($args['confirm'] ?? ''),
        $expectRemove,
        strtolower(trim((string)($args['expect-sha256'] ?? '')))
    );
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . PHP_EOL;
    return ($result['success'] ?? false) === true ? 0 : 2;
}

if (PHP_SAPI === 'cli' && isset($_SERVER['SCRIPT_FILENAME'])
    && realpath((string)$_SERVER['SCRIPT_FILENAME']) === realpath(__FILE__)) {
    exit(nslMain($argv));
}
