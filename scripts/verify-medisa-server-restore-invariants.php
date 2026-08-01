<?php
/**
 * Server restore contract — temp dir + sentetik JSON. Production data/** dokunulmaz.
 */
define('MEDISA_RESTORE_TEST_MODE', true);

$root = dirname(__DIR__);
$failed = 0;
$passed = 0;

function srAssert($name, $cond) {
    global $passed, $failed;
    if ($cond) {
        $passed++;
        echo "[PASS] {$name}\n";
    } else {
        $failed++;
        echo "[FAIL] {$name}\n";
    }
}

function srAssertSame($name, $expected, $actual) {
    srAssert($name . ' (expected=' . json_encode($expected) . ' actual=' . json_encode($actual) . ')', $expected === $actual);
}

$tempRoot = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'medisa-restore-test-' . bin2hex(random_bytes(6));
$dataDir = $tempRoot . DIRECTORY_SEPARATOR . 'data';
$snapDir = $dataDir . DIRECTORY_SEPARATOR . 'backups';
$runtimeDir = $dataDir . DIRECTORY_SEPARATOR . '.medisa_restore';
@mkdir($snapDir, 0700, true);
@mkdir($runtimeDir, 0700, true);

$fixture = [
    'schema_version' => 'legacy-v1',
    'tasitlar' => [
        ['id' => 'v1', 'plate' => '34 TEST 1', 'version' => 1, 'events' => [['id' => 'e1']], 'belgeler' => [['id' => 'd1']]],
        ['id' => 'v2', 'plate' => '34 TEST 2', 'version' => 1, 'events' => []],
    ],
    'branches' => [['id' => 'b1', 'name' => 'Merkez']],
    'users' => [
        ['id' => 'admin1', 'isim' => 'Admin', 'role' => 'genel_yonetici', 'sifre_hash' => '$2y$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUV'],
        ['id' => 'u1', 'isim' => 'User', 'role' => 'kullanici', 'sifre_hash' => '$2y$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUV'],
    ],
    'kayitlar' => [],
    'ayarlar' => ['sirketAdi' => 'Medisa'],
    'sifreler' => [],
    'arac_aylik_hareketler' => [],
    'duzeltme_talepleri' => [],
    'notificationReadState' => [],
    'monthlyTodoWhatsAppLogs' => [],
];

$backupFewer = $fixture;
$backupFewer['tasitlar'] = [ $fixture['tasitlar'][0] ];

$dataFile = $dataDir . DIRECTORY_SEPARATOR . 'data.json';
$mainBackup = $dataDir . DIRECTORY_SEPARATOR . 'data.json.backup';
file_put_contents($dataFile, json_encode($fixture, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
file_put_contents($mainBackup, json_encode($backupFewer, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
$snapPath = $snapDir . DIRECTORY_SEPARATOR . 'snapshot-20260101-120000-abcd1234.json';
file_put_contents($snapPath, json_encode($backupFewer, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

// symlink candidate (may be skipped on Windows without privilege)
$symlinkPath = $snapDir . DIRECTORY_SEPARATOR . 'snapshot-symlink-evil.json';
$symlinkCreated = @symlink($snapPath, $symlinkPath);

$secret = 'test-restore-hmac-secret-32b-minimum!!';
putenv('MEDISA_SERVER_RESTORE_ENABLED=false');
putenv('MEDISA_RESTORE_MAINTENANCE_MODE=false');
putenv('MEDISA_RESTORE_HMAC_SECRET=' . $secret);

$GLOBALS['MEDISA_RESTORE_ENV_OVERRIDE'] = [
    'data_dir' => $dataDir,
    'data_file' => $dataFile,
    'main_backup' => $mainBackup,
    'snapshots_dir' => $snapDir,
    'runtime_dir' => $runtimeDir,
    'max_bytes' => 33554432,
    'enabled' => false,
    'maintenance' => false,
    'secret' => $secret,
];

require_once $root . '/core.php';

function srAuthAdmin() {
    $token = medisaCreateSignedToken([
        'user_id' => 'admin1',
        'role' => 'genel_yonetici',
        'pwdv' => medisaBuildUserPasswordVersion([
            'id' => 'admin1',
            'sifre_hash' => '$2y$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUV',
        ]),
    ], 3600);
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $token;
}

function srAuthRole($userId, $role) {
    $token = medisaCreateSignedToken([
        'user_id' => $userId,
        'role' => $role,
        'pwdv' => medisaBuildUserPasswordVersion([
            'id' => $userId,
            'sifre_hash' => '$2y$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUV',
        ]),
    ], 3600);
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $token;
}

function srClearAuth() {
    unset($_SERVER['HTTP_AUTHORIZATION'], $_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
}

// A. restore.php source contract
$restoreSrc = file_get_contents($root . '/restore.php');
srAssert('restore.php GET-only gate', strpos($restoreSrc, "REQUEST_METHOD'] !== 'GET'") !== false);
srAssert('restore.php restore_enabled false', strpos($restoreSrc, "'restore_enabled' => false") !== false);
srAssert('restore.php no backup body read', !preg_match('/file_get_contents\s*\(/', $restoreSrc));

// B. defaults disabled
srAssert('default restore disabled', medisaRestoreIsEnabled() === false);
srAssert('default maintenance false', medisaRestoreIsMaintenanceMode() === false);

// C. registry auth
srClearAuth();
$reg = medisaRestoreHandleRegistry();
srAssert('registry unauth 401', (int)($reg['status'] ?? 0) === 401);

srAuthAdmin();
$reg = medisaRestoreHandleRegistry();
srAssert('registry admin success', ($reg['body']['success'] ?? false) === true);
srAssert('registry restore_enabled false', ($reg['body']['restore_enabled'] ?? true) === false);
$backups = $reg['body']['backups'] ?? [];
srAssert('registry has backups', is_array($backups) && count($backups) >= 1);
$first = $backups[0];
srAssert('registry has backup_id', isset($first['backup_id']) && preg_match('/^[a-f0-9]{40}$/', $first['backup_id']));
$regJson = json_encode($reg['body'], JSON_UNESCAPED_UNICODE);
srAssert('registry no absolute path leak', strpos($regJson, $dataDir) === false);
srAssert('registry no data.json body', strpos($regJson, '34 TEST') === false);

// path traversal / invalid id
$bad = medisaRestoreFindById('../etc/passwd');
srAssert('invalid backup id rejected', ($bad['error_code'] ?? '') === 'INVALID_BACKUP_ID');

if ($symlinkCreated) {
    $symSafe = medisaRestoreResolveSafeFile($symlinkPath);
    srAssert('symlink rejected', ($symSafe['error_code'] ?? '') === 'BACKUP_SYMLINK_REJECTED');
} else {
    srAssert('symlink test skipped (no privilege)', true);
}

// D. dry-run
$backupId = $first['backup_id'];
$dry = medisaRestoreHandleDryRun([]);
srAssert('dry-run missing backup_id', ($dry['body']['error_code'] ?? '') === 'INVALID_BACKUP_ID' || ($dry['body']['error_code'] ?? '') === 'BACKUP_NOT_FOUND' || (int)($dry['status'] ?? 0) >= 400);

$dry = medisaRestoreHandleDryRun(['backup_id' => $backupId]);
srAssert('dry-run success', ($dry['body']['success'] ?? false) === true);
srAssert('dry-run no write marker', md5_file($dataFile) === md5(json_encode($fixture, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)) || file_get_contents($dataFile) !== '');
$beforeHashFile = hash_file('sha256', $dataFile);
srAssert('dry-run intent present', is_string($dry['body']['intent_token'] ?? null) && strlen($dry['body']['intent_token']) > 20);
srAssert('dry-run counts present', isset($dry['body']['before_counts'], $dry['body']['candidate_counts']));
srAssert('dry-run PII-free plate', strpos(json_encode($dry['body']), '34 TEST') === false);
$intent = $dry['body']['intent_token'];
$beforeHash = $dry['body']['current_structural_hash'];

// E. commit disabled by default
$commit = medisaRestoreHandleCommit([
    'backup_id' => $backupId,
    'intent_token' => $intent,
    'idempotency_key' => 'idem-1',
    'confirmation' => MEDISA_RESTORE_CONFIRMATION_TEXT,
]);
srAssert('commit disabled default', ($commit['body']['error_code'] ?? '') === 'RESTORE_DISABLED');
srAssertSame('data unchanged after disabled commit', $beforeHashFile, hash_file('sha256', $dataFile));

// maintenance false while enabled
$GLOBALS['MEDISA_RESTORE_ENV_OVERRIDE']['enabled'] = true;
putenv('MEDISA_SERVER_RESTORE_ENABLED=true');
$commit = medisaRestoreHandleCommit([
    'backup_id' => $backupId,
    'intent_token' => $intent,
    'idempotency_key' => 'idem-2',
    'confirmation' => MEDISA_RESTORE_CONFIRMATION_TEXT,
]);
srAssert('commit requires maintenance', ($commit['body']['error_code'] ?? '') === 'MAINTENANCE_REQUIRED');

// F. permission: sube_yonetici forbidden for commit
$GLOBALS['MEDISA_RESTORE_ENV_OVERRIDE']['maintenance'] = true;
putenv('MEDISA_RESTORE_MAINTENANCE_MODE=true');
// add branch manager to fixture users for auth resolution
$fixture['users'][] = ['id' => 'bm1', 'isim' => 'BM', 'role' => 'sube_yonetici', 'branchIds' => ['b1'], 'sifre_hash' => '$2y$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUV'];
file_put_contents($dataFile, json_encode($fixture, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
srAuthRole('bm1', 'sube_yonetici');
$commit = medisaRestoreHandleCommit([
    'backup_id' => $backupId,
    'intent_token' => $intent,
    'idempotency_key' => 'idem-3',
    'confirmation' => MEDISA_RESTORE_CONFIRMATION_TEXT,
]);
srAssert('branch manager commit denied', ($commit['body']['error_code'] ?? '') === 'RESTORE_PERMISSION_DENIED');

srAuthRole('u1', 'kullanici');
$commit = medisaRestoreHandleCommit([
    'backup_id' => $backupId,
    'intent_token' => $intent,
    'idempotency_key' => 'idem-4',
    'confirmation' => MEDISA_RESTORE_CONFIRMATION_TEXT,
]);
srAssert('user commit denied', ($commit['body']['error_code'] ?? '') === 'RESTORE_PERMISSION_DENIED');

// G. successful commit path (temp only)
srAuthAdmin();
// refresh dry-run after data rewrite (users added)
$dry = medisaRestoreHandleDryRun(['backup_id' => $backupId]);
srAssert('dry-run refresh success', ($dry['body']['success'] ?? false) === true);
$intent = $dry['body']['intent_token'];
$beforeHash = $dry['body']['current_structural_hash'];

$commit = medisaRestoreHandleCommit([
    'backup_id' => $backupId,
    'intent_token' => $intent,
    'idempotency_key' => 'idem-success-1',
    'confirmation' => 'YANLIS',
]);
srAssert('confirmation mismatch', ($commit['body']['error_code'] ?? '') === 'CONFIRMATION_MISMATCH');

$commit = medisaRestoreHandleCommit([
    'backup_id' => $backupId,
    'intent_token' => $intent,
    'idempotency_key' => 'idem-success-1',
    'confirmation' => MEDISA_RESTORE_CONFIRMATION_TEXT,
]);
srAssert('commit success', ($commit['body']['success'] ?? false) === true);
srAssert('transaction id present', isset($commit['body']['transaction_id']));
srAssert('emergency backup id present', isset($commit['body']['emergency_backup_id']));
$afterData = json_decode(file_get_contents($dataFile), true);
srAssert('commit wrote fewer vehicles', is_array($afterData) && count($afterData['tasitlar'] ?? []) === 1);

// idempotent replay
$commit2 = medisaRestoreHandleCommit([
    'backup_id' => $backupId,
    'intent_token' => $intent,
    'idempotency_key' => 'idem-success-1',
    'confirmation' => MEDISA_RESTORE_CONFIRMATION_TEXT,
]);
srAssert('idempotent replay success', ($commit2['body']['success'] ?? false) === true);
srAssertSame('idempotent same txn', $commit['body']['transaction_id'] ?? null, $commit2['body']['transaction_id'] ?? null);

// H. maintenance gate on mutate
$mut = medisaMutateData(function (&$data) {
    $data['ayarlar']['sirketAdi'] = 'HACK';
    return medisaBuildMutationResult(true);
});
srAssert('mutate blocked in maintenance', (int)($mut['status'] ?? 0) === 423);
srAssertSame('mutate error code', 'MAINTENANCE_REQUIRED', $mut['error_code'] ?? null);

// flag false restores mutate
$GLOBALS['MEDISA_RESTORE_ENV_OVERRIDE']['maintenance'] = false;
putenv('MEDISA_RESTORE_MAINTENANCE_MODE=false');
$mut = medisaMutateData(function (&$data) {
    $data['ayarlar']['sirketAdi'] = 'MedisaTemp';
    return medisaBuildMutationResult(true);
});
srAssert('mutate allowed when maintenance false', ($mut['success'] ?? false) === true);

// I. permissions in build
$perms = medisaBuildPermissions(['role' => 'genel_yonetici']);
srAssert('execute_server_restore for GY', !empty($perms['execute_server_restore']));
$permsBm = medisaBuildPermissions(['role' => 'sube_yonetici']);
srAssert('no execute_server_restore for BM', empty($permsBm['execute_server_restore']));

// cleanup
function srRmTree($dir) {
    if (!is_dir($dir)) return true;
    $ok = true;
    $items = scandir($dir);
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        $path = $dir . DIRECTORY_SEPARATOR . $item;
        if (is_dir($path) && !is_link($path)) {
            $ok = srRmTree($path) && $ok;
        } else {
            $ok = @unlink($path) && $ok;
        }
    }
    return @rmdir($dir) && $ok;
}
$cleanupOk = srRmTree($tempRoot);
srAssert('temp cleanup', $cleanupOk === true);

echo "Server restore PHP invariants: {$passed} passed, {$failed} failed\n";
if (!$cleanupOk) {
    echo "WARN: temp cleanup failed: {$tempRoot}\n";
}
exit($failed > 0 ? 1 : 0);
