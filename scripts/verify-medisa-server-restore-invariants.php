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

$VALID_HASH = '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';

$tempRoot = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'medisa-restore-test-' . bin2hex(random_bytes(6));
$dataDir = $tempRoot . DIRECTORY_SEPARATOR . 'data';
$snapDir = $dataDir . DIRECTORY_SEPARATOR . 'backups';
$runtimeDir = $dataDir . DIRECTORY_SEPARATOR . '.medisa_restore';
@mkdir($snapDir, 0700, true);
@mkdir($runtimeDir, 0700, true);

$fixture = [
    'schema_version' => 'legacy-v1',
    'tasitlar' => [
        ['id' => 'v1', 'plate' => '34 TEST 1', 'version' => 1, 'km' => 10000, 'events' => [['id' => 'e1', 'detail' => 'A']], 'belgeler' => [['id' => 'd1']]],
        ['id' => 'v2', 'plate' => '34 TEST 2', 'version' => 1, 'events' => []],
    ],
    'branches' => [['id' => 'b1', 'name' => 'Merkez']],
    'users' => [
        ['id' => 'admin1', 'isim' => 'Admin', 'role' => 'genel_yonetici', 'aktif' => true, 'sifre_hash' => $VALID_HASH],
        ['id' => 'u1', 'isim' => 'User', 'role' => 'kullanici', 'aktif' => true, 'sifre_hash' => $VALID_HASH],
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
$backupFewer['tasitlar'] = [$fixture['tasitlar'][0]];

$dataFile = $dataDir . DIRECTORY_SEPARATOR . 'data.json';
$mainBackup = $dataDir . DIRECTORY_SEPARATOR . 'data.json.backup';
file_put_contents($dataFile, json_encode($fixture, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
file_put_contents($mainBackup, json_encode($backupFewer, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
$snapPath = $snapDir . DIRECTORY_SEPARATOR . 'snapshot-20260101-120000-abcd1234.json';
file_put_contents($snapPath, json_encode($backupFewer, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

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
    'environment' => 'production',
    'enabled' => false,
    'maintenance' => false,
    'production_approval' => false,
    'secret' => $secret,
];
$GLOBALS['MEDISA_RESTORE_FAIL_INJECT'] = null;

require_once $root . '/core.php';

function srAuthAdmin() {
    global $VALID_HASH;
    $token = medisaCreateSignedToken([
        'user_id' => 'admin1',
        'role' => 'genel_yonetici',
        'pwdv' => medisaBuildUserPasswordVersion([
            'id' => 'admin1',
            'sifre_hash' => $VALID_HASH,
        ]),
    ], 3600);
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $token;
}

function srAuthRole($userId, $role) {
    global $VALID_HASH;
    $token = medisaCreateSignedToken([
        'user_id' => $userId,
        'role' => $role,
        'pwdv' => medisaBuildUserPasswordVersion([
            'id' => $userId,
            'sifre_hash' => $VALID_HASH,
        ]),
    ], 3600);
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $token;
}

function srClearAuth() {
    unset($_SERVER['HTTP_AUTHORIZATION'], $_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
}

function srWriteData(array $data) {
    global $dataFile;
    file_put_contents($dataFile, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
}

function srDataSha() {
    global $dataFile;
    return hash_file('sha256', $dataFile);
}

// --- A. Content hash owner ---
$baseA = $fixture;
$baseB = $fixture;
$baseB['tasitlar'][0]['km'] = 11000;
$hA = medisaRestoreCanonicalContentHash($baseA);
$hB = medisaRestoreCanonicalContentHash($baseB);
srAssert('content hash KM change differs', ($hA['hash'] ?? '') !== ($hB['hash'] ?? ''));
srAssert('legacy structural hash KM change same (repro)', medisaRestoreStructuralHash($baseA) === medisaRestoreStructuralHash($baseB));

$reordered = [
    'users' => $fixture['users'],
    'monthlyTodoWhatsAppLogs' => [],
    'ayarlar' => $fixture['ayarlar'],
    'schema_version' => 'legacy-v1',
    'duzeltme_talepleri' => [],
    'notificationReadState' => [],
    'sifreler' => [],
    'arac_aylik_hareketler' => [],
    'kayitlar' => [],
    'branches' => $fixture['branches'],
    'tasitlar' => $fixture['tasitlar'],
];
$hOrd = medisaRestoreCanonicalContentHash($reordered);
srAssert('same content different key order same hash', ($hA['hash'] ?? '') === ($hOrd['hash'] ?? ''));

$listA = ['items' => [['id' => 1], ['id' => 2]]];
$listB = ['items' => [['id' => 2], ['id' => 1]]];
srAssert('list order changes hash', (medisaRestoreCanonicalContentHash($listA)['hash'] ?? '') !== (medisaRestoreCanonicalContentHash($listB)['hash'] ?? ''));

$roleB = $fixture;
$roleB['users'][0]['role'] = 'kullanici';
srAssert('user role changes hash', (medisaRestoreCanonicalContentHash($fixture)['hash'] ?? '') !== (medisaRestoreCanonicalContentHash($roleB)['hash'] ?? ''));

$actB = $fixture;
$actB['users'][0]['aktif'] = false;
srAssert('user active changes hash', (medisaRestoreCanonicalContentHash($fixture)['hash'] ?? '') !== (medisaRestoreCanonicalContentHash($actB)['hash'] ?? ''));

$setB = $fixture;
$setB['ayarlar']['sirketAdi'] = 'Other';
srAssert('settings change hash', (medisaRestoreCanonicalContentHash($fixture)['hash'] ?? '') !== (medisaRestoreCanonicalContentHash($setB)['hash'] ?? ''));

$evB = $fixture;
$evB['tasitlar'][0]['events'][0]['detail'] = 'B';
srAssert('event detail changes hash', (medisaRestoreCanonicalContentHash($fixture)['hash'] ?? '') !== (medisaRestoreCanonicalContentHash($evB)['hash'] ?? ''));
srAssert('same counts different content differs', (medisaRestoreCanonicalContentHash($fixture)['hash'] ?? '') !== (medisaRestoreCanonicalContentHash($evB)['hash'] ?? ''));

$s1 = medisaRestoreCanonicalContentHash(['v' => '1']);
$s2 = medisaRestoreCanonicalContentHash(['v' => 1]);
srAssert('string 1 vs int 1 different hash', ($s1['hash'] ?? '') !== ($s2['hash'] ?? ''));

$GLOBALS['MEDISA_RESTORE_FAIL_INJECT'] = 'content_hash_encode';
$encFail = medisaRestoreCanonicalContentHash($fixture);
$GLOBALS['MEDISA_RESTORE_FAIL_INJECT'] = null;
srAssert('encode failure fail-closed', ($encFail['success'] ?? true) === false && ($encFail['error_code'] ?? '') === 'RESTORE_CONTENT_HASH_FAILED');

// --- B. User security invariants ---
$zeroGm = [['id' => 'u1', 'role' => 'kullanici', 'aktif' => true, 'sifre_hash' => $VALID_HASH]];
$inv = medisaRestoreValidateUserSecurityInvariants($zeroGm, null);
srAssert('zero active GM rejected', ($inv['error_code'] ?? '') === 'RESTORE_NO_ACTIVE_GENERAL_MANAGER');

$dup = [
    ['id' => 'admin1', 'role' => 'genel_yonetici', 'aktif' => true, 'sifre_hash' => $VALID_HASH],
    ['id' => 'admin1', 'role' => 'kullanici', 'aktif' => true, 'sifre_hash' => $VALID_HASH],
];
$inv = medisaRestoreValidateUserSecurityInvariants($dup, null);
srAssert('duplicate user ID rejected', ($inv['error_code'] ?? '') === 'RESTORE_DUPLICATE_USER_ID');

$okUsers = $fixture['users'];
$inv = medisaRestoreValidateUserSecurityInvariants($okUsers, 'missing-actor');
srAssert('actor missing rejected', ($inv['error_code'] ?? '') === 'RESTORE_ACTOR_ACCOUNT_MISSING');

$inv = medisaRestoreValidateUserSecurityInvariants([
    ['id' => 'admin1', 'role' => 'genel_yonetici', 'aktif' => false, 'sifre_hash' => $VALID_HASH],
    ['id' => 'admin2', 'role' => 'genel_yonetici', 'aktif' => true, 'sifre_hash' => $VALID_HASH],
], 'admin1');
srAssert('actor inactive rejected', ($inv['error_code'] ?? '') === 'RESTORE_ACTOR_ACCOUNT_INACTIVE');

$inv = medisaRestoreValidateUserSecurityInvariants([
    ['id' => 'admin1', 'role' => 'kullanici', 'aktif' => true, 'sifre_hash' => $VALID_HASH],
    ['id' => 'admin2', 'role' => 'genel_yonetici', 'aktif' => true, 'sifre_hash' => $VALID_HASH],
], 'admin1');
srAssert('actor role downgrade rejected', ($inv['error_code'] ?? '') === 'RESTORE_ACTOR_ROLE_INVALID');

foreach (['sifre' => 'secret', 'password' => 'secret', 'portal_sifresi' => 'secret'] as $pk => $pv) {
    $u = $okUsers;
    $u[0][$pk] = $pv;
    $inv = medisaRestoreValidateUserSecurityInvariants($u, null);
    srAssert('plaintext ' . $pk . ' rejected', ($inv['error_code'] ?? '') === 'RESTORE_PLAINTEXT_CREDENTIAL_REJECTED');
    $msg = json_encode($inv, JSON_UNESCAPED_UNICODE);
    srAssert('plaintext ' . $pk . ' no PII', strpos($msg, 'secret') === false);
}

$u = $okUsers;
$u[0]['sifre_hash'] = 'not-a-hash';
$inv = medisaRestoreValidateUserSecurityInvariants($u, null);
srAssert('invalid password hash rejected', ($inv['error_code'] ?? '') === 'RESTORE_PASSWORD_HASH_INVALID');

$u = $okUsers;
$u[0]['role'] = 'superadmin';
$inv = medisaRestoreValidateUserSecurityInvariants($u, null);
srAssert('unknown role rejected', ($inv['error_code'] ?? '') === 'RESTORE_UNKNOWN_ROLE');

$inv = medisaRestoreValidateUserSecurityInvariants($okUsers, 'admin1');
srAssert('valid active GM candidate accepted', $inv === true);

// --- C. Unknown collections / eligibility ---
$unk = $fixture;
$unk['mystery_collection'] = [['x' => 1]];
$norm = medisaRestoreCanonicalNormalize($unk);
srAssert('unknown collection listed', in_array('mystery_collection', $norm['unknown_collections'] ?? [], true));
$parseLike = [
    'success' => true,
    'normalized' => $norm['data'],
    'unknown_collections' => $norm['unknown_collections'],
    'normalization_data_loss' => !empty($norm['normalization_data_loss']),
    'lost_collections' => $norm['lost_collections'] ?? [],
    'warnings' => $norm['warnings'] ?? [],
];
$elig = medisaRestoreEvaluateEligibility($parseLike, 'admin1');
srAssert('unknown collection not eligible', empty($elig['eligible']) && ($elig['error_code'] ?? '') === 'RESTORE_UNKNOWN_COLLECTIONS');

// --- D. restore.php / defaults ---
$restoreSrc = file_get_contents($root . '/restore.php');
srAssert('restore.php GET-only gate', strpos($restoreSrc, "REQUEST_METHOD'] !== 'GET'") !== false);
srAssert('restore.php restore_enabled false', strpos($restoreSrc, "'restore_enabled' => false") !== false);
srAssert('restore.php no backup body read', !preg_match('/file_get_contents\s*\(/', $restoreSrc));
srAssert('default restore disabled', medisaRestoreIsEnabled() === false);
srAssert('default maintenance false', medisaRestoreIsMaintenanceMode() === false);
srAssert('rollback owner exists', function_exists('medisaRestoreRollbackFromEmergencyBackup'));
srAssert('content hash owner exists', function_exists('medisaRestoreCanonicalContentHash'));

// --- E. registry ---
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

$bad = medisaRestoreFindById('../etc/passwd');
srAssert('invalid backup id rejected', ($bad['error_code'] ?? '') === 'INVALID_BACKUP_ID');

if ($symlinkCreated) {
    $symSafe = medisaRestoreResolveSafeFile($symlinkPath);
    srAssert('symlink rejected', ($symSafe['error_code'] ?? '') === 'BACKUP_SYMLINK_REJECTED');
} else {
    srAssert('symlink test skipped (no privilege)', true);
}

// --- F. dry-run exact SHA ---
$backupId = $first['backup_id'];
$beforeExact = srDataSha();
$mtimeBefore = @filemtime($dataFile);
$sizeBefore = @filesize($dataFile);
$runtimeBefore = glob($runtimeDir . DIRECTORY_SEPARATOR . '*') ?: [];

$dry = medisaRestoreHandleDryRun(['backup_id' => $backupId]);
srAssert('dry-run success', ($dry['body']['success'] ?? false) === true);
srAssert('dry-run preserves exact data file sha256', srDataSha() === $beforeExact);
srAssert('dry-run mtime stable or acceptable', @filemtime($dataFile) === $mtimeBefore || @filesize($dataFile) === $sizeBefore);
$runtimeAfter = glob($runtimeDir . DIRECTORY_SEPARATOR . '*') ?: [];
srAssert('dry-run no runtime ledger files', count($runtimeAfter) === count($runtimeBefore));
srAssert('dry-run intent present', is_string($dry['body']['intent_token'] ?? null) && strlen($dry['body']['intent_token']) > 20);
srAssert('dry-run content hashes present', isset($dry['body']['current_content_sha256'], $dry['body']['candidate_content_sha256']));
srAssert('dry-run PII-free plate', strpos(json_encode($dry['body']), '34 TEST') === false);
$intent = $dry['body']['intent_token'];
$beforeHash = $dry['body']['current_content_sha256'];

// Mutation false-positive: exact SHA test must catch non-empty rewrite
$mutProbe = $dataFile . '.probe';
$orig = file_get_contents($dataFile);
file_put_contents($dataFile, json_encode(['mutated' => true, 'x' => 999], JSON_UNESCAPED_UNICODE));
$mutSha = srDataSha();
srAssert('mutation false-positive test detects change', $mutSha !== $beforeExact);
file_put_contents($dataFile, $orig);
srAssert('mutation probe restored', srDataSha() === $beforeExact);

// --- G. commit disabled ---
$commit = medisaRestoreHandleCommit([
    'backup_id' => $backupId,
    'intent_token' => $intent,
    'idempotency_key' => 'idem-1',
    'confirmation' => MEDISA_RESTORE_CONFIRMATION_TEXT,
]);
srAssert('commit disabled default', ($commit['body']['error_code'] ?? '') === 'RESTORE_DISABLED');
srAssertSame('data unchanged after disabled commit', $beforeExact, srDataSha());

$GLOBALS['MEDISA_RESTORE_ENV_OVERRIDE']['enabled'] = true;
putenv('MEDISA_SERVER_RESTORE_ENABLED=true');
$commit = medisaRestoreHandleCommit([
    'backup_id' => $backupId,
    'intent_token' => $intent,
    'idempotency_key' => 'idem-2',
    'confirmation' => MEDISA_RESTORE_CONFIRMATION_TEXT,
]);
srAssert('commit requires maintenance', ($commit['body']['error_code'] ?? '') === 'MAINTENANCE_REQUIRED');

$GLOBALS['MEDISA_RESTORE_ENV_OVERRIDE']['maintenance'] = true;
putenv('MEDISA_RESTORE_MAINTENANCE_MODE=true');
$commit = medisaRestoreHandleCommit([
    'backup_id' => $backupId,
    'intent_token' => $intent,
    'idempotency_key' => 'idem-production-gate',
    'confirmation' => MEDISA_RESTORE_CONFIRMATION_TEXT,
]);
srAssert(
    'production commit requires second activation approval',
    ($commit['body']['error_code'] ?? '') === 'PRODUCTION_RESTORE_APPROVAL_REQUIRED'
);

$GLOBALS['MEDISA_RESTORE_ENV_OVERRIDE']['environment'] = 'staging';
$reg = medisaRestoreHandleRegistry();
srAssert('staging capability bypasses production approval only', ($reg['body']['production_activation_approved'] ?? false) === true);

$fixture['users'][] = ['id' => 'bm1', 'isim' => 'BM', 'role' => 'sube_yonetici', 'branchIds' => ['b1'], 'aktif' => true, 'sifre_hash' => $VALID_HASH];
srWriteData($fixture);
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

// --- H. BEFORE_HASH_CHANGED via content ---
srAuthAdmin();
$dry = medisaRestoreHandleDryRun(['backup_id' => $backupId]);
srAssert('dry-run refresh success', ($dry['body']['success'] ?? false) === true);
$intent = $dry['body']['intent_token'];
$fixture['ayarlar']['sirketAdi'] = 'ChangedAfterDryRun';
srWriteData($fixture);
$commit = medisaRestoreHandleCommit([
    'backup_id' => $backupId,
    'intent_token' => $intent,
    'idempotency_key' => 'idem-hash-change',
    'confirmation' => MEDISA_RESTORE_CONFIRMATION_TEXT,
]);
srAssert('content update after dry-run BEFORE_HASH_CHANGED', ($commit['body']['error_code'] ?? '') === 'BEFORE_HASH_CHANGED');

// restore data for success path
$fixture['ayarlar']['sirketAdi'] = 'Medisa';
srWriteData($fixture);
$dry = medisaRestoreHandleDryRun(['backup_id' => $backupId]);
$intent = $dry['body']['intent_token'];
$shaBeforeCommit = srDataSha();

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
srAssert('commit content hashes in response', isset($commit['body']['before_content_sha256'], $commit['body']['after_content_sha256']));
$afterData = json_decode(file_get_contents($dataFile), true);
srAssert('commit wrote fewer vehicles', is_array($afterData) && count($afterData['tasitlar'] ?? []) === 1);
srAssert('commit changed data sha', srDataSha() !== $shaBeforeCommit);

$commit2 = medisaRestoreHandleCommit([
    'backup_id' => $backupId,
    'intent_token' => $intent,
    'idempotency_key' => 'idem-success-1',
    'confirmation' => MEDISA_RESTORE_CONFIRMATION_TEXT,
]);
srAssert('idempotent replay success', ($commit2['body']['success'] ?? false) === true);
srAssertSame('idempotent same txn', $commit['body']['transaction_id'] ?? null, $commit2['body']['transaction_id'] ?? null);

// conflict different payload same key — need new intent with different before after rewrite
$dryConflict = medisaRestoreHandleDryRun(['backup_id' => $backupId]);
$intentConflict = $dryConflict['body']['intent_token'] ?? '';
$commitConflict = medisaRestoreHandleCommit([
    'backup_id' => $backupId,
    'intent_token' => $intentConflict,
    'idempotency_key' => 'idem-success-1',
    'confirmation' => MEDISA_RESTORE_CONFIRMATION_TEXT,
]);
srAssert('idempotency payload conflict 409', (int)($commitConflict['status'] ?? 0) === 409 || ($commitConflict['body']['error_code'] ?? '') === 'IDEMPOTENCY_CONFLICT');

// --- I. Failure injection (temp only) ---
function srResetEligibleState() {
    global $fixture, $VALID_HASH, $dataFile, $mainBackup, $snapPath, $backupFewer;
    $fixture['ayarlar']['sirketAdi'] = 'Medisa';
    // ensure BM user present for data consistency
    $hasBm = false;
    foreach ($fixture['users'] as $u) {
        if (($u['id'] ?? '') === 'bm1') $hasBm = true;
    }
    if (!$hasBm) {
        $fixture['users'][] = ['id' => 'bm1', 'isim' => 'BM', 'role' => 'sube_yonetici', 'branchIds' => ['b1'], 'aktif' => true, 'sifre_hash' => $VALID_HASH];
    }
    file_put_contents($dataFile, json_encode($fixture, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    file_put_contents($mainBackup, json_encode($backupFewer, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    file_put_contents($snapPath, json_encode($backupFewer, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
}

function srFreshDryIntent() {
    global $backupId;
    srAuthAdmin();
    $dry = medisaRestoreHandleDryRun(['backup_id' => $backupId]);
    return $dry['body']['intent_token'] ?? '';
}

$injectCases = [
    'transaction_pending_write' => 'TRANSACTION_LEDGER_WRITE_FAILED',
    'idempotency_pending_write' => 'IDEMPOTENCY_LEDGER_WRITE_FAILED',
    'emergency_backup_write' => 'EMERGENCY_BACKUP_FAILED',
    'canonical_atomic_write' => 'ATOMIC_WRITE_FAILED',
];
foreach ($injectCases as $stage => $code) {
    srResetEligibleState();
    $sha0 = srDataSha();
    $intentI = srFreshDryIntent();
    $GLOBALS['MEDISA_RESTORE_FAIL_INJECT'] = $stage;
    $c = medisaRestoreHandleCommit([
        'backup_id' => $backupId,
        'intent_token' => $intentI,
        'idempotency_key' => 'idem-inj-' . $stage,
        'confirmation' => MEDISA_RESTORE_CONFIRMATION_TEXT,
    ]);
    $GLOBALS['MEDISA_RESTORE_FAIL_INJECT'] = null;
    srAssert('inject ' . $stage . ' error', ($c['body']['error_code'] ?? '') === $code);
    srAssert('inject ' . $stage . ' no data mutation', srDataSha() === $sha0);
    srAssert('inject ' . $stage . ' not success', ($c['body']['success'] ?? false) !== true);
}

$postWriteInject = [
    'after_read' => 'AFTER_HASH_MISMATCH',
    'after_decode' => 'AFTER_HASH_MISMATCH',
    'after_hash_mismatch' => 'AFTER_HASH_MISMATCH',
    'transaction_finalize' => 'TRANSACTION_FINALIZE_FAILED',
    'idempotency_finalize' => 'IDEMPOTENCY_FINALIZE_FAILED',
];
foreach ($postWriteInject as $stage => $code) {
    srResetEligibleState();
    $sha0 = srDataSha();
    $content0 = medisaRestoreRequireContentHash(json_decode(file_get_contents($dataFile), true));
    $intentI = srFreshDryIntent();
    $GLOBALS['MEDISA_RESTORE_FAIL_INJECT'] = $stage;
    $c = medisaRestoreHandleCommit([
        'backup_id' => $backupId,
        'intent_token' => $intentI,
        'idempotency_key' => 'idem-inj-pw-' . $stage,
        'confirmation' => MEDISA_RESTORE_CONFIRMATION_TEXT,
    ]);
    $GLOBALS['MEDISA_RESTORE_FAIL_INJECT'] = null;
    srAssert('post-write inject ' . $stage . ' error', ($c['body']['error_code'] ?? '') === $code);
    srAssert('post-write inject ' . $stage . ' rolled back exact sha', srDataSha() === $sha0);
    $content1 = medisaRestoreRequireContentHash(json_decode(file_get_contents($dataFile), true));
    srAssert('post-write inject ' . $stage . ' content hash restored', $content0 === $content1);
}

// audit-only failure
srResetEligibleState();
$intentI = srFreshDryIntent();
$GLOBALS['MEDISA_RESTORE_FAIL_INJECT'] = 'audit_fail';
$c = medisaRestoreHandleCommit([
    'backup_id' => $backupId,
    'intent_token' => $intentI,
    'idempotency_key' => 'idem-audit-fail',
    'confirmation' => MEDISA_RESTORE_CONFIRMATION_TEXT,
]);
$GLOBALS['MEDISA_RESTORE_FAIL_INJECT'] = null;
srAssert('audit fail after commit success+warning', ($c['body']['success'] ?? false) === true && !empty($c['body']['audit_warning']));
srAssert('audit fail error code AUDIT_WRITE_FAILED', ($c['body']['error_code'] ?? '') === 'AUDIT_WRITE_FAILED');
$afterAudit = json_decode(file_get_contents($dataFile), true);
srAssert('audit fail still committed state', is_array($afterAudit) && count($afterAudit['tasitlar'] ?? []) === 1);

// maintenance mutate gate
$mut = medisaMutateData(function (&$data) {
    $data['ayarlar']['sirketAdi'] = 'HACK';
    return medisaBuildMutationResult(true);
});
srAssert('mutate blocked in maintenance', (int)($mut['status'] ?? 0) === 423);
srAssertSame('mutate error code', 'MAINTENANCE_REQUIRED', $mut['error_code'] ?? null);

$GLOBALS['MEDISA_RESTORE_ENV_OVERRIDE']['maintenance'] = false;
putenv('MEDISA_RESTORE_MAINTENANCE_MODE=false');
$mut = medisaMutateData(function (&$data) {
    $data['ayarlar']['sirketAdi'] = 'MedisaTemp';
    return medisaBuildMutationResult(true);
});
srAssert('mutate allowed when maintenance false', ($mut['success'] ?? false) === true);

$perms = medisaBuildPermissions(['role' => 'genel_yonetici']);
srAssert('execute_server_restore for GY', !empty($perms['execute_server_restore']));
$permsBm = medisaBuildPermissions(['role' => 'sube_yonetici']);
srAssert('no execute_server_restore for BM', empty($permsBm['execute_server_restore']));

// uncertain-state path with FAIL_INJECT_ROLLBACK
$GLOBALS['MEDISA_RESTORE_ENV_OVERRIDE']['maintenance'] = true;
putenv('MEDISA_RESTORE_MAINTENANCE_MODE=true');
srResetEligibleState();
$intentI = srFreshDryIntent();
$GLOBALS['MEDISA_RESTORE_FAIL_INJECT'] = 'after_hash_mismatch';
$GLOBALS['MEDISA_RESTORE_FAIL_INJECT_ROLLBACK'] = '1';
$c = medisaRestoreHandleCommit([
    'backup_id' => $backupId,
    'intent_token' => $intentI,
    'idempotency_key' => 'idem-uncertain-2',
    'confirmation' => MEDISA_RESTORE_CONFIRMATION_TEXT,
]);
$GLOBALS['MEDISA_RESTORE_FAIL_INJECT'] = null;
unset($GLOBALS['MEDISA_RESTORE_FAIL_INJECT_ROLLBACK']);
srAssert('rollback failure RESTORE_STATE_UNCERTAIN', ($c['body']['error_code'] ?? '') === 'RESTORE_STATE_UNCERTAIN');
srAssert('uncertain maintenance_required', !empty($c['body']['maintenance_required']));
srAssert('uncertain manual_recovery_required', !empty($c['body']['manual_recovery_required']));
srAssert('uncertain not normal success', ($c['body']['success'] ?? true) === false);

$cleanupOk = srRmTree($tempRoot);
srAssert('temp cleanup', $cleanupOk === true);

echo "Server restore PHP invariants: {$passed} passed, {$failed} failed\n";
if (!$cleanupOk) {
    echo "WARN: temp cleanup failed: {$tempRoot}\n";
}
exit($failed > 0 ? 1 : 0);
