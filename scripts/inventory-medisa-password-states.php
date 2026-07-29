<?php
/**
 * Safe password-state inventory for P0-D.
 * Never prints password/hash values — metadata only.
 *
 * Usage: php scripts/inventory-medisa-password-states.php [path-to-data.json]
 */

declare(strict_types=1);

$path = $argv[1] ?? (dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'data.json');
if (!is_file($path)) {
    fwrite(STDERR, "MISSING_FILE: {$path}\n");
    exit(1);
}

$raw = file_get_contents($path);
$data = json_decode((string)$raw, true);
if (!is_array($data)) {
    fwrite(STDERR, "INVALID_JSON: {$path}\n");
    exit(1);
}

function medisaInventoryNormalizeRole($user): string
{
    if (!is_array($user)) {
        return 'unknown';
    }
    $role = '';
    foreach (['role', 'rol', 'tip'] as $key) {
        if (isset($user[$key]) && trim((string)$user[$key]) !== '') {
            $role = trim((string)$user[$key]);
            break;
        }
    }
    $map = [
        'admin' => 'genel_yonetici',
        'yonetici' => 'sube_yonetici',
        'yonetici_kullanici' => 'sube_yonetici',
        'surucu' => 'kullanici',
        'driver' => 'kullanici',
        'sales' => 'kullanici',
        '' => 'kullanici',
    ];
    if (isset($map[$role])) {
        return $map[$role];
    }
    if (in_array($role, ['genel_yonetici', 'sube_yonetici', 'kullanici'], true)) {
        return $role;
    }
    return 'unknown:' . $role;
}

function medisaInventoryClassifyUser(array $user): array
{
    $plain = isset($user['sifre']) ? trim((string)$user['sifre']) : '';
    $hash = isset($user['sifre_hash']) ? trim((string)$user['sifre_hash']) : '';
    $hasPlain = $plain !== '';
    $hasHash = $hash !== '';
    $malformed = false;
    if ($hasHash) {
        $info = password_get_info($hash);
        if (!is_array($info) || empty($info['algo'])) {
            $malformed = true;
        }
    }

    if ($hasPlain && $hasHash) {
        $state = $malformed ? 'plaintext_and_malformed_hash' : 'plaintext_and_hash';
        $action = $malformed ? 'FAIL_CLOSED_REVIEW' : 'KEEP_HASH_DROP_PLAIN';
    } elseif ($hasPlain) {
        $state = 'plaintext_only';
        $action = 'HASH_AND_DROP_PLAIN';
    } elseif ($hasHash && $malformed) {
        $state = 'malformed_hash';
        $action = 'FAIL_CLOSED_REVIEW';
    } elseif ($hasHash) {
        $state = 'hash_only';
        $action = 'KEEP';
    } else {
        $state = 'no_password';
        $action = 'NO_OP';
    }

    $loginRisk = in_array($action, ['FAIL_CLOSED_REVIEW', 'NO_OP'], true)
        || $state === 'no_password'
        || $malformed;

    return [
        'user_id' => (string)($user['id'] ?? ''),
        'role' => medisaInventoryNormalizeRole($user),
        'password_state' => $state,
        'migration_action' => $action,
        'login_risk' => $loginRisk,
    ];
}

function medisaInventoryScanBackup(string $file): array
{
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
        $plain = isset($user['sifre']) ? trim((string)$user['sifre']) : '';
        $hash = isset($user['sifre_hash']) ? trim((string)$user['sifre_hash']) : '';
        if ($plain !== '') {
            $hasPlain = true;
        }
        if ($hash !== '') {
            $hasHash = true;
        }
    }
    return [
        'file' => str_replace('\\', '/', $file),
        'has_plaintext' => $hasPlain,
        'has_hash' => $hasHash,
        'has_password_or_hash' => $hasPlain || $hasHash,
    ];
}

$users = isset($data['users']) && is_array($data['users'])
    ? $data['users']
    : (isset($data['kullanicilar']) && is_array($data['kullanicilar']) ? $data['kullanicilar'] : []);
$stats = [
    'total' => 0,
    'plaintext_only' => 0,
    'hash_only' => 0,
    'both_plain_and_hash' => 0,
    'no_password' => 0,
    'malformed_hash' => 0,
    'login_risk' => 0,
    'roles' => [],
    'actions' => [],
];
$rows = [];

foreach ($users as $user) {
    if (!is_array($user)) {
        continue;
    }
    $row = medisaInventoryClassifyUser($user);
    $stats['total']++;
    $role = $row['role'];
    if (!isset($stats['roles'][$role])) {
        $stats['roles'][$role] = 0;
    }
    $stats['roles'][$role]++;

    $state = $row['password_state'];
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
    if (!empty($row['login_risk'])) {
        $stats['login_risk']++;
    }
    $action = $row['migration_action'];
    if (!isset($stats['actions'][$action])) {
        $stats['actions'][$action] = 0;
    }
    $stats['actions'][$action]++;
    unset($row['login_risk']);
    $rows[] = $row;
}

$backupDir = dirname($path);
$candidates = array_merge(
    glob($backupDir . DIRECTORY_SEPARATOR . '*.backup') ?: [],
    glob($backupDir . DIRECTORY_SEPARATOR . '*.bak') ?: [],
    glob($backupDir . DIRECTORY_SEPARATOR . 'backups' . DIRECTORY_SEPARATOR . '*.json') ?: []
);
$backupStats = [
    'total' => 0,
    'with_password_or_hash' => 0,
    'with_plaintext' => 0,
    'with_hash' => 0,
];
$backupFiles = [];
foreach ($candidates as $file) {
    $info = medisaInventoryScanBackup($file);
    $backupStats['total']++;
    if ($info['has_password_or_hash']) {
        $backupStats['with_password_or_hash']++;
    }
    if ($info['has_plaintext']) {
        $backupStats['with_plaintext']++;
    }
    if ($info['has_hash']) {
        $backupStats['with_hash']++;
    }
    $backupFiles[] = $info;
}

$out = [
    'source_path' => str_replace('\\', '/', $path),
    'source_note' => 'LOCAL/OFFLINE COPY — production write requires explicit approval',
    'users' => $stats,
    'user_rows' => $rows,
    'backups' => $backupStats,
    'backup_files' => $backupFiles,
];

echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
