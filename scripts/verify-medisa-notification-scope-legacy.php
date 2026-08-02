<?php
require_once __DIR__ . '/migrate-medisa-notification-scope-legacy.php';

$passed = 0;
$failed = 0;
function nslAssert(string $name, bool $ok): void {
    global $passed, $failed;
    if ($ok) { $passed++; echo "[PASS] $name\n"; }
    else { $failed++; echo "[FAIL] $name\n"; }
}

$dir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'medisa-nsl-' . bin2hex(random_bytes(6));
mkdir($dir, 0700, true);
$path = $dir . DIRECTORY_SEPARATOR . 'data.json';
$fixture = [
    'tasitlar' => [['id' => 'v1', 'plate' => 'KEEP-ME']],
    'users' => [['id' => 'u1', 'isim' => 'KEEP-USER']],
    'notificationReadState' => [
        'scope:legacy-all' => true,
        'scope:legacy-branch' => '2026-01-01T00:00:00Z',
        'user:u1' => true,
        'user:u1|role:kullanici|branches:b1' => '2026-01-02T00:00:00Z',
    ],
];
$raw = json_encode($fixture, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
file_put_contents($path, $raw);
$beforeSha = hash_file('sha256', $path);

$dry = nslRun($path, 'dry-run');
nslAssert('dry-run success', ($dry['success'] ?? false) === true);
nslAssert('dry-run legacy count', ($dry['legacy_scope_key_count'] ?? -1) === 2);
nslAssert('dry-run preserved count', ($dry['preserved_notification_key_count'] ?? -1) === 2);
nslAssert('dry-run exact no-write', hash_file('sha256', $path) === $beforeSha);
$dryJson = json_encode($dry, JSON_UNESCAPED_UNICODE);
nslAssert('dry-run PII-free', strpos($dryJson, 'KEEP-ME') === false && strpos($dryJson, 'KEEP-USER') === false);

$blocked = nslRun($path, 'apply', '', 2, $beforeSha);
nslAssert('apply confirmation required', ($blocked['error_code'] ?? '') === 'CONFIRMATION_REQUIRED');
$countMismatch = nslRun($path, 'apply', MEDISA_NOTIFICATION_SCOPE_CLEANUP_CONFIRM, 1, $beforeSha);
nslAssert('apply count gate', ($countMismatch['error_code'] ?? '') === 'EXPECTED_REMOVE_COUNT_MISMATCH');
$shaMismatch = nslRun($path, 'apply', MEDISA_NOTIFICATION_SCOPE_CLEANUP_CONFIRM, 2, str_repeat('0', 64));
nslAssert('apply sha gate', ($shaMismatch['error_code'] ?? '') === 'EXPECTED_SHA256_MISMATCH');

$apply = nslRun($path, 'apply', MEDISA_NOTIFICATION_SCOPE_CLEANUP_CONFIRM, 2, $beforeSha);
nslAssert('apply success', ($apply['success'] ?? false) === true && ($apply['applied'] ?? false) === true);
$after = json_decode((string)file_get_contents($path), true);
nslAssert('legacy keys removed only', !isset($after['notificationReadState']['scope:legacy-all']) && !isset($after['notificationReadState']['scope:legacy-branch']));
nslAssert('canonical keys preserved', isset($after['notificationReadState']['user:u1']) && isset($after['notificationReadState']['user:u1|role:kullanici|branches:b1']));
nslAssert('other collections preserved', ($after['tasitlar'] ?? null) === $fixture['tasitlar'] && ($after['users'] ?? null) === $fixture['users']);
$backupName = (string)($apply['rollback_backup_file'] ?? '');
$backupPath = $dir . DIRECTORY_SEPARATOR . 'backups' . DIRECTORY_SEPARATOR . $backupName;
nslAssert('verified rollback backup', $backupName !== '' && is_file($backupPath) && hash_file('sha256', $backupPath) === $beforeSha);
$again = nslRun($path, 'dry-run');
nslAssert('second dry-run no changes', ($again['would_change'] ?? true) === false && ($again['legacy_scope_key_count'] ?? -1) === 0);

@unlink($backupPath);
@rmdir(dirname($backupPath));
@unlink($path);
@rmdir($dir);
echo "NOTIFICATION_SCOPE_LEGACY_PASSED=$passed\n";
echo "NOTIFICATION_SCOPE_LEGACY_FAILED=$failed\n";
exit($failed > 0 ? 1 : 0);
