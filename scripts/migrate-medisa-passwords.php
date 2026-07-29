<?php
/**
 * P0-D — plaintext parola → sifre_hash migrasyonu (dry-run / apply).
 *
 * Güvenlik:
 * - Parola/hash değerlerini stdout/stderr'e yazmaz.
 * - Apply olmadan data.json değiştirmez.
 * - Apply öncesi web-deny altındaki güvenli geri dönüş yedeği oluşturur.
 * - Malformed hash kayıtlarını fail-closed bırakır (otomatik değiştirmez).
 *
 * Kullanım:
 *   php scripts/migrate-medisa-passwords.php --mode=dry-run [--data=path]
 *   php scripts/migrate-medisa-passwords.php --mode=apply --confirm=MIGRATE_PASSWORDS [--data=path]
 */

declare(strict_types=1);

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'core.php';

function medisaPwdMigUsage(): void
{
    $msg = <<<TXT
Usage:
  php scripts/migrate-medisa-passwords.php --mode=dry-run [--data=path/to/data.json]
  php scripts/migrate-medisa-passwords.php --mode=apply --confirm=MIGRATE_PASSWORDS [--data=path/to/data.json]

TXT;
    fwrite(STDERR, $msg);
}

function medisaPwdMigParseArgs(array $argv): array
{
    $opts = [
        'mode' => 'dry-run',
        'data' => getDataFilePath(),
        'confirm' => '',
    ];
    foreach (array_slice($argv, 1) as $arg) {
        if (strpos($arg, '--mode=') === 0) {
            $opts['mode'] = trim(substr($arg, 7));
        } elseif (strpos($arg, '--data=') === 0) {
            $opts['data'] = trim(substr($arg, 7));
        } elseif (strpos($arg, '--confirm=') === 0) {
            $opts['confirm'] = trim(substr($arg, 10));
        } elseif ($arg === '--help' || $arg === '-h') {
            medisaPwdMigUsage();
            exit(0);
        } else {
            fwrite(STDERR, "Unknown argument: {$arg}\n");
            medisaPwdMigUsage();
            exit(2);
        }
    }
    return $opts;
}

function medisaPwdMigIsValidHash(string $hash): bool
{
    if ($hash === '') {
        return false;
    }
    $info = password_get_info($hash);
    return is_array($info) && !empty($info['algo']);
}

function medisaPwdMigClassifyUser(array $user): array
{
    $userId = isset($user['id']) ? (string)$user['id'] : '';
    $role = medisaResolveUserRole($user);
    $plain = isset($user['sifre']) ? trim((string)$user['sifre']) : '';
    $hash = isset($user['sifre_hash']) ? trim((string)$user['sifre_hash']) : '';
    $hasPlain = $plain !== '';
    $hasHash = $hash !== '';
    $hashValid = $hasHash && medisaPwdMigIsValidHash($hash);
    $malformed = $hasHash && !$hashValid;

    if ($malformed) {
        $state = $hasPlain ? 'plaintext_and_malformed_hash' : 'malformed_hash';
        $action = 'FAIL_CLOSED_REVIEW';
        $willChange = false;
    } elseif ($hasPlain && $hasHash) {
        $state = 'plaintext_and_hash';
        $action = 'KEEP_HASH_DROP_PLAIN';
        $willChange = true;
    } elseif ($hasPlain) {
        $state = 'plaintext_only';
        $action = 'HASH_AND_DROP_PLAIN';
        $willChange = true;
    } elseif ($hasHash) {
        $state = 'hash_only';
        $action = 'KEEP';
        $willChange = false;
    } else {
        $state = 'no_password';
        $action = 'NO_OP';
        $willChange = false;
    }

    return [
        'user_id' => $userId,
        'role' => $role,
        'password_state' => $state,
        'migration_action' => $action,
        'will_change' => $willChange,
        'login_risk' => in_array($action, ['FAIL_CLOSED_REVIEW', 'NO_OP'], true),
    ];
}

/**
 * @return array{user:array,changed:bool,action:string,state:string}
 */
function medisaPwdMigTransformUser(array $user): array
{
    $meta = medisaPwdMigClassifyUser($user);
    $action = $meta['migration_action'];
    $changed = false;
    $out = $user;

    if ($action === 'HASH_AND_DROP_PLAIN') {
        $plain = trim((string)($user['sifre'] ?? ''));
        medisaSetUserPasswordHash($out, $plain);
        $changed = true;
    } elseif ($action === 'KEEP_HASH_DROP_PLAIN') {
        unset($out['sifre']);
        $changed = true;
    }

    return [
        'user' => $out,
        'changed' => $changed,
        'action' => $action,
        'state' => $meta['password_state'],
        'meta' => $meta,
    ];
}

function medisaPwdMigSecureBackupDir(string $dataPath): string
{
    return dirname($dataPath) . DIRECTORY_SEPARATOR . '.migration-secure';
}

function medisaPwdMigEnsureSecureDir(string $dir): bool
{
    if (is_dir($dir)) {
        return true;
    }
    return mkdir($dir, 0750, true);
}

function medisaPwdMigScanBackups(string $dataPath): array
{
    $dir = dirname($dataPath);
    $candidates = array_merge(
        glob($dir . DIRECTORY_SEPARATOR . '*.backup') ?: [],
        glob($dir . DIRECTORY_SEPARATOR . '*.bak') ?: [],
        glob($dir . DIRECTORY_SEPARATOR . 'backups' . DIRECTORY_SEPARATOR . '*.json') ?: []
    );
    $files = [];
    $stats = [
        'total' => 0,
        'with_plaintext' => 0,
        'with_hash' => 0,
        'with_password_or_hash' => 0,
    ];
    foreach ($candidates as $file) {
        $raw = @file_get_contents($file);
        $data = json_decode((string)$raw, true);
        $users = [];
        if (is_array($data)) {
            if (isset($data['users']) && is_array($data['users'])) {
                $users = $data['users'];
            } elseif (isset($data['kullanicilar']) && is_array($data['kullanicilar'])) {
                $users = $data['kullanicilar'];
            }
        }
        $hasPlain = false;
        $hasHash = false;
        foreach ($users as $user) {
            if (!is_array($user)) {
                continue;
            }
            if (trim((string)($user['sifre'] ?? '')) !== '') {
                $hasPlain = true;
            }
            if (trim((string)($user['sifre_hash'] ?? '')) !== '') {
                $hasHash = true;
            }
        }
        $stats['total']++;
        if ($hasPlain) {
            $stats['with_plaintext']++;
        }
        if ($hasHash) {
            $stats['with_hash']++;
        }
        if ($hasPlain || $hasHash) {
            $stats['with_password_or_hash']++;
        }
        $files[] = [
            'file' => str_replace('\\', '/', $file),
            'has_plaintext' => $hasPlain,
            'has_hash' => $hasHash,
            'quarantine_action' => $hasPlain ? 'QUARANTINE_CANDIDATE' : 'KEEP',
        ];
    }
    return ['stats' => $stats, 'files' => $files];
}

function medisaPwdMigLoadData(string $path): array
{
    if (!is_file($path)) {
        throw new RuntimeException("DATA_MISSING: {$path}");
    }
    $raw = file_get_contents($path);
    $data = json_decode((string)$raw, true);
    if (!is_array($data)) {
        throw new RuntimeException("DATA_INVALID_JSON: {$path}");
    }
    if (!isset($data['users']) || !is_array($data['users'])) {
        throw new RuntimeException('DATA_USERS_MISSING');
    }
    return $data;
}

function medisaPwdMigFindDuplicateIds(array $users): array
{
    $seen = [];
    $dupes = [];
    foreach ($users as $user) {
        if (!is_array($user)) {
            continue;
        }
        $id = isset($user['id']) ? (string)$user['id'] : '';
        if ($id === '') {
            continue;
        }
        if (isset($seen[$id])) {
            $dupes[$id] = true;
        }
        $seen[$id] = true;
    }
    return array_keys($dupes);
}

function medisaPwdMigAssertDiskSpace(string $dataPath, int $rawBytes): void
{
    $dir = dirname($dataPath);
    $free = @disk_free_space($dir);
    if ($free === false) {
        throw new RuntimeException('DISK_SPACE_UNKNOWN');
    }
    // atomic temp + secure rollback backup + small margin
    $needed = ($rawBytes * 3) + (5 * 1024 * 1024);
    if ($free < $needed) {
        throw new RuntimeException('DISK_SPACE_INSUFFICIENT');
    }
}

function medisaPwdMigEvaluateGates(array $stats, array $duplicateIds, bool $dataUnchanged): array
{
    $reasons = [];
    if ($stats['total'] < 1 || $stats['total'] > 5000) {
        $reasons[] = 'USER_COUNT_UNREASONABLE';
    }
    if (count($duplicateIds) > 0) {
        $reasons[] = 'DUPLICATE_USER_IDS';
    }
    if ($stats['malformed_hash'] > 0) {
        $reasons[] = 'MALFORMED_HASH';
    }
    if ($stats['no_password'] > 0) {
        $reasons[] = 'NO_PASSWORD_USERS';
    }
    if (!$dataUnchanged) {
        $reasons[] = 'DRY_RUN_MUTATED_DATA';
    }
    return [
        'ok' => $reasons === [],
        'block_reasons' => $reasons,
    ];
}

function medisaPwdMigRun(array $opts): array
{
    $mode = $opts['mode'];
    if (!in_array($mode, ['dry-run', 'apply'], true)) {
        throw new RuntimeException('INVALID_MODE');
    }
    if ($mode === 'apply' && $opts['confirm'] !== 'MIGRATE_PASSWORDS') {
        throw new RuntimeException('APPLY_CONFIRM_REQUIRED');
    }

    $dataPath = $opts['data'];
    $beforeRaw = (string)file_get_contents($dataPath);
    $beforeSha256 = hash('sha256', $beforeRaw);
    $data = medisaPwdMigLoadData($dataPath);
    $usersBefore = $data['users'];
    $rows = [];
    $usersAfter = [];
    $changedCount = 0;
    $stats = [
        'total' => 0,
        'will_change' => 0,
        'plaintext_only' => 0,
        'hash_only' => 0,
        'both_plain_and_hash' => 0,
        'no_password' => 0,
        'malformed_hash' => 0,
        'login_risk' => 0,
        'actions' => [],
        'roles' => [],
    ];

    foreach ($usersBefore as $user) {
        if (!is_array($user)) {
            continue;
        }
        $result = medisaPwdMigTransformUser($user);
        $meta = $result['meta'];
        $stats['total']++;
        if ($result['changed']) {
            $changedCount++;
            $stats['will_change']++;
        }
        $state = $meta['password_state'];
        if ($state === 'plaintext_only') {
            $stats['plaintext_only']++;
        } elseif ($state === 'hash_only') {
            $stats['hash_only']++;
        } elseif ($state === 'plaintext_and_hash' || $state === 'plaintext_and_malformed_hash') {
            $stats['both_plain_and_hash']++;
        } elseif ($state === 'no_password') {
            $stats['no_password']++;
        }
        if (strpos($state, 'malformed') !== false) {
            $stats['malformed_hash']++;
        }
        if (!empty($meta['login_risk'])) {
            $stats['login_risk']++;
        }
        $action = $meta['migration_action'];
        if (!isset($stats['actions'][$action])) {
            $stats['actions'][$action] = 0;
        }
        $stats['actions'][$action]++;
        $role = $meta['role'];
        if (!isset($stats['roles'][$role])) {
            $stats['roles'][$role] = 0;
        }
        $stats['roles'][$role]++;
        $rows[] = [
            'user_id' => $meta['user_id'],
            'role' => $meta['role'],
            'password_state' => $meta['password_state'],
            'migration_action' => $meta['migration_action'],
        ];
        $usersAfter[] = $result['user'];
    }

    $backupScan = medisaPwdMigScanBackups($dataPath);
    $duplicateIds = medisaPwdMigFindDuplicateIds($usersBefore);
    $report = [
        'mode' => $mode,
        'data_path' => str_replace('\\', '/', $dataPath),
        'before_sha256' => $beforeSha256,
        'before_bytes' => strlen($beforeRaw),
        'user_count_before' => count($usersBefore),
        'user_count_after' => count($usersAfter),
        'users_changed' => $changedCount,
        'duplicate_user_ids' => $duplicateIds,
        'stats' => $stats,
        'user_rows' => $rows,
        'backups' => $backupScan['stats'],
        'backup_files' => $backupScan['files'],
        'hash_algorithm' => 'PASSWORD_DEFAULT (bcrypt via password_hash)',
        'password_verify_compatible' => true,
        'applied' => false,
        'rollback_backup' => null,
        'rollback_backup_sha256' => null,
        'rollback_backup_bytes' => null,
        'notes' => [
            'Projection continues to strip sifre/sifre_hash; portal_sifresi_var remains boolean.',
            'P0-A1 transient password_changes channel is preserved (save reconcile path).',
            'Backup quarantine/delete is NOT applied by this command; inventory only.',
            'Production write requires explicit operator approval before --mode=apply.',
            'Secrets (plaintext/hash) are never printed by this tool.',
        ],
    ];

    // Ensure dry-run does not mutate data.json (also verified before apply).
    clearstatcache(true, $dataPath);
    $afterProbeRaw = (string)file_get_contents($dataPath);
    $dataUnchanged = hash('sha256', $afterProbeRaw) === $beforeSha256;
    $gates = medisaPwdMigEvaluateGates($stats, $duplicateIds, $dataUnchanged);
    $report['gates'] = $gates;
    $report['dry_run_data_unchanged'] = $dataUnchanged;

    if ($mode === 'dry-run') {
        if (!$dataUnchanged) {
            throw new RuntimeException('DRY_RUN_MUTATED_DATA');
        }
        return $report;
    }

    // APPLY
    if (!$gates['ok']) {
        throw new RuntimeException('APPLY_BLOCKED_' . ($gates['block_reasons'][0] ?? 'GATE'));
    }

    medisaPwdMigAssertDiskSpace($dataPath, strlen($beforeRaw));

    $secureDir = medisaPwdMigSecureBackupDir($dataPath);
    if (!medisaPwdMigEnsureSecureDir($secureDir)) {
        throw new RuntimeException('SECURE_BACKUP_DIR_FAILED');
    }
    $stamp = gmdate('Ymd\THis\Z');
    $rollbackPath = $secureDir . DIRECTORY_SEPARATOR . "pre-password-migration-{$stamp}.json";
    if (!medisaAtomicWriteFile($rollbackPath, $beforeRaw)) {
        throw new RuntimeException('ROLLBACK_BACKUP_WRITE_FAILED');
    }
    $report['rollback_backup'] = str_replace('\\', '/', $rollbackPath);
    $report['rollback_backup_sha256'] = hash_file('sha256', $rollbackPath);
    $report['rollback_backup_bytes'] = filesize($rollbackPath);

    // Idempotent no-op: do not rewrite production JSON when nothing changes.
    if ($changedCount === 0) {
        $report['applied'] = true;
        $report['noop'] = true;
        $report['after_sha256'] = $beforeSha256;
        $report['post_checks'] = [
            'plaintext_remaining' => 0,
            'valid_hash_count' => $stats['hash_only'],
            'user_count_match' => true,
        ];
        return $report;
    }

    $data['users'] = $usersAfter;
    $jsonFlags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;
    if (defined('JSON_INVALID_UTF8_SUBSTITUTE')) {
        $jsonFlags |= JSON_INVALID_UTF8_SUBSTITUTE;
    }
    $encoded = json_encode($data, $jsonFlags);
    if ($encoded === false) {
        throw new RuntimeException('ENCODE_FAILED');
    }
    if (!medisaAtomicWriteFile($dataPath, $encoded)) {
        throw new RuntimeException('ATOMIC_WRITE_FAILED');
    }

    $afterData = medisaPwdMigLoadData($dataPath);
    $report['user_count_after'] = count($afterData['users']);
    $report['after_sha256'] = hash('sha256', (string)file_get_contents($dataPath));
    $report['applied'] = true;

    $plainLeft = 0;
    $hashCount = 0;
    foreach ($afterData['users'] as $user) {
        if (!is_array($user)) {
            continue;
        }
        if (trim((string)($user['sifre'] ?? '')) !== '') {
            $plainLeft++;
        }
        $h = trim((string)($user['sifre_hash'] ?? ''));
        if ($h !== '' && medisaPwdMigIsValidHash($h)) {
            $hashCount++;
        }
    }
    $report['post_checks'] = [
        'plaintext_remaining' => $plainLeft,
        'valid_hash_count' => $hashCount,
        'user_count_match' => count($afterData['users']) === count($usersBefore),
    ];
    if ($plainLeft !== 0 || !$report['post_checks']['user_count_match']) {
        throw new RuntimeException('POST_CHECK_FAILED');
    }

    return $report;
}

if (PHP_SAPI === 'cli'
    && isset($_SERVER['SCRIPT_FILENAME'])
    && realpath((string)$_SERVER['SCRIPT_FILENAME']) === realpath(__FILE__)
) {
    try {
        $opts = medisaPwdMigParseArgs($argv);
        $report = medisaPwdMigRun($opts);
        echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
        exit(0);
    } catch (Throwable $e) {
        fwrite(STDERR, 'ERROR: ' . $e->getMessage() . PHP_EOL);
        exit(1);
    }
}
