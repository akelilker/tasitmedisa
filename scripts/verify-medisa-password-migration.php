<?php
/**
 * P0-D password migration behavior tests (synthetic fixtures only).
 * Never touches live data/data.json.
 *
 * Run: php scripts/verify-medisa-password-migration.php
 */

declare(strict_types=1);

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'core.php';
require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'scripts' . DIRECTORY_SEPARATOR . 'migrate-medisa-passwords.php';

$passed = 0;
$failed = 0;
$tempDirs = [];

function pmAssert($label, $condition): void
{
    global $passed, $failed;
    if ($condition) {
        $passed++;
        echo "[PASS] {$label}\n";
        return;
    }
    $failed++;
    echo "[FAIL] {$label}\n";
}

function pmTempDir(): string
{
    global $tempDirs;
    $dir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'medisa-pwdmig-' . bin2hex(random_bytes(6));
    if (!mkdir($dir, 0700, true)) {
        throw new RuntimeException('TEMP_DIR_FAILED');
    }
    $tempDirs[] = $dir;
    return $dir;
}

function pmCleanup(): void
{
    global $tempDirs;
    foreach ($tempDirs as $dir) {
        if (!is_dir($dir)) {
            continue;
        }
        $it = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($it as $file) {
            if ($file->isDir()) {
                @rmdir($file->getPathname());
            } else {
                @unlink($file->getPathname());
            }
        }
        @rmdir($dir);
    }
}

function pmWriteFixture(string $path, array $data): void
{
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false || !medisaAtomicWriteFile($path, $json)) {
        throw new RuntimeException('FIXTURE_WRITE_FAILED');
    }
}

function pmFixtureBase(): array
{
    return [
        'tasitlar' => [],
        'kayitlar' => [],
        'branches' => [['id' => 'b1', 'name' => 'B1']],
        'users' => [],
        'ayarlar' => [],
        'sifreler' => [],
    ];
}

register_shutdown_function('pmCleanup');

$plainPw = 'PlainMigrate!1';
$keepPw = 'KeepHash!2';
$malformed = 'not-a-valid-password-hash';

// --- Transform unit cases ---
$plainUser = ['id' => 'u-plain', 'role' => 'kullanici', 'sifre' => $plainPw];
$t1 = medisaPwdMigTransformUser($plainUser);
pmAssert('plaintext → hash oluşur', !empty($t1['user']['sifre_hash']) && medisaPwdMigIsValidHash($t1['user']['sifre_hash']));
pmAssert('plaintext alanı silinir', !array_key_exists('sifre', $t1['user']) || trim((string)($t1['user']['sifre'] ?? '')) === '');
pmAssert('plaintext login verify', medisaVerifyUserPassword($t1['user'], $plainPw));
pmAssert('plaintext wrong password reject', !medisaVerifyUserPassword($t1['user'], 'wrong'));

$validHash = password_hash($keepPw, PASSWORD_DEFAULT);
$hashUser = ['id' => 'u-hash', 'role' => 'kullanici', 'sifre_hash' => $validHash];
$t2 = medisaPwdMigTransformUser($hashUser);
pmAssert('geçerli hash korunur', ($t2['user']['sifre_hash'] ?? null) === $validHash);
pmAssert('geçerli hash changed=false', $t2['changed'] === false);

$bothUser = ['id' => 'u-both', 'role' => 'kullanici', 'sifre' => $plainPw, 'sifre_hash' => $validHash];
$t3 = medisaPwdMigTransformUser($bothUser);
pmAssert('both: hash korunur', ($t3['user']['sifre_hash'] ?? null) === $validHash);
pmAssert('both: plaintext düşer', !isset($t3['user']['sifre']) || trim((string)$t3['user']['sifre']) === '');
pmAssert('both: changed=true', $t3['changed'] === true);

$malUser = ['id' => 'u-mal', 'role' => 'kullanici', 'sifre_hash' => $malformed];
$t4 = medisaPwdMigTransformUser($malUser);
pmAssert('malformed fail-closed action', $t4['action'] === 'FAIL_CLOSED_REVIEW');
pmAssert('malformed unchanged', $t4['changed'] === false && ($t4['user']['sifre_hash'] ?? '') === $malformed);

// --- Dry-run / apply fixture ---
$dir = pmTempDir();
$dataPath = $dir . DIRECTORY_SEPARATOR . 'data.json';
$backupDir = $dir . DIRECTORY_SEPARATOR . 'backups';
mkdir($backupDir, 0700, true);

$fixture = pmFixtureBase();
$fixture['users'] = [
    ['id' => 'u-plain', 'role' => 'kullanici', 'isim' => 'Plain', 'sifre' => $plainPw],
    ['id' => 'u-hash', 'role' => 'sube_yonetici', 'isim' => 'Hash', 'sifre_hash' => $validHash, 'branchIds' => ['b1']],
    ['id' => 'gm-1', 'role' => 'genel_yonetici', 'isim' => 'GM', 'sifre' => $plainPw],
];
pmWriteFixture($dataPath, $fixture);

$backupPayload = $fixture;
$backupPayload['note'] = 'snapshot-with-plaintext';
pmWriteFixture($backupDir . DIRECTORY_SEPARATOR . 'snapshot-test.json', $backupPayload);

$beforeSha = hash('sha256', (string)file_get_contents($dataPath));
$dry = medisaPwdMigRun([
    'mode' => 'dry-run',
    'data' => $dataPath,
    'confirm' => '',
]);
$afterDrySha = hash('sha256', (string)file_get_contents($dataPath));
pmAssert('dry-run data unchanged', $beforeSha === $afterDrySha && !empty($dry['dry_run_data_unchanged']));
pmAssert('dry-run will_change count', (int)$dry['users_changed'] === 2);
pmAssert('dry-run backup plaintext inventory', (int)$dry['backups']['with_plaintext'] >= 1);

$apply = medisaPwdMigRun([
    'mode' => 'apply',
    'data' => $dataPath,
    'confirm' => 'MIGRATE_PASSWORDS',
]);
pmAssert('apply succeeded', !empty($apply['applied']));
pmAssert('apply user count stable', (int)$apply['user_count_before'] === (int)$apply['user_count_after']);
pmAssert('apply plaintext remaining 0', (int)$apply['post_checks']['plaintext_remaining'] === 0);
pmAssert('apply rollback backup exists', is_file(str_replace('/', DIRECTORY_SEPARATOR, (string)$apply['rollback_backup'])));

$after = json_decode((string)file_get_contents($dataPath), true);
$byId = [];
foreach ($after['users'] as $u) {
    $byId[$u['id']] = $u;
}
pmAssert('applied plain user has hash', medisaPwdMigIsValidHash((string)($byId['u-plain']['sifre_hash'] ?? '')));
pmAssert('applied plain user no sifre', !isset($byId['u-plain']['sifre']) || trim((string)$byId['u-plain']['sifre']) === '');
pmAssert('applied hash user preserved', ($byId['u-hash']['sifre_hash'] ?? null) === $validHash);
pmAssert('login plain migrated ok', medisaVerifyUserPassword($byId['u-plain'], $plainPw));
pmAssert('login hash kept ok', medisaVerifyUserPassword($byId['u-hash'], $keepPw));
pmAssert('login wrong reject', !medisaVerifyUserPassword($byId['u-plain'], 'nope'));

// Idempotent second apply
$apply2 = medisaPwdMigRun([
    'mode' => 'apply',
    'data' => $dataPath,
    'confirm' => 'MIGRATE_PASSWORDS',
]);
pmAssert('second apply no changes', (int)$apply2['users_changed'] === 0);

// Projection secrets
$ctx = [
    'user_id' => 'gm-1',
    'role' => 'genel_yonetici',
    'branch_ids' => [],
];
$ctx['permissions'] = medisaBuildPermissions($ctx);
$projected = medisaProjectUserForClient($byId['u-plain']);
pmAssert('projection no sifre', !array_key_exists('sifre', $projected));
pmAssert('projection no sifre_hash', !array_key_exists('sifre_hash', $projected));
pmAssert('portal_sifresi_var boolean', array_key_exists('portal_sifresi_var', $projected) && is_bool($projected['portal_sifresi_var']));
pmAssert('portal_sifresi_var true', $projected['portal_sifresi_var'] === true);

// P0-A1 transient password change still works on migrated user
$incomingPlainUser = $byId['u-plain'];
// Client must not send secrets; only transient password_changes map is accepted.
unset($incomingPlainUser['sifre'], $incomingPlainUser['sifre_hash'], $incomingPlainUser['sifre_guncellendi_at']);
$reconcile = medisaReconcileUserCredentials(
    [$byId['u-plain']],
    [$incomingPlainUser],
    ['u-plain' => 'TransientNew!9'],
    $ctx
);
pmAssert('p0a1 transient change success', !empty($reconcile['success']));
$changedUser = $reconcile['users'][0];
pmAssert('p0a1 new hash login', medisaVerifyUserPassword($changedUser, 'TransientNew!9'));
pmAssert('p0a1 old password reject', !medisaVerifyUserPassword($changedUser, $plainPw));

// Malformed apply blocked
$dir2 = pmTempDir();
$dataPath2 = $dir2 . DIRECTORY_SEPARATOR . 'data.json';
$bad = pmFixtureBase();
$bad['users'] = [
    ['id' => 'u-bad', 'role' => 'kullanici', 'sifre_hash' => $malformed],
];
pmWriteFixture($dataPath2, $bad);
$blocked = false;
try {
    medisaPwdMigRun(['mode' => 'apply', 'data' => $dataPath2, 'confirm' => 'MIGRATE_PASSWORDS']);
} catch (Throwable $e) {
    $blocked = $e->getMessage() === 'APPLY_BLOCKED_MALFORMED_HASH';
}
pmAssert('malformed apply blocked', $blocked);

// no-password apply blocked
$dir3 = pmTempDir();
$dataPath3 = $dir3 . DIRECTORY_SEPARATOR . 'data.json';
$emptyPw = pmFixtureBase();
$emptyPw['users'] = [
    ['id' => 'u-empty', 'role' => 'kullanici', 'isim' => 'Empty'],
];
pmWriteFixture($dataPath3, $emptyPw);
$blockedEmpty = false;
try {
    medisaPwdMigRun(['mode' => 'apply', 'data' => $dataPath3, 'confirm' => 'MIGRATE_PASSWORDS']);
} catch (Throwable $e) {
    $blockedEmpty = $e->getMessage() === 'APPLY_BLOCKED_NO_PASSWORD_USERS';
}
pmAssert('no-password apply blocked', $blockedEmpty);

// Backup URL deny contract (repo .htaccess)
$htaccess = (string)file_get_contents(dirname(__DIR__) . DIRECTORY_SEPARATOR . '.htaccess');
pmAssert('backup/data URL deny rule present', strpos($htaccess, 'RewriteRule ^data(/|$) - [F,L,NC]') !== false);

echo "\nPASSWORD_MIGRATION_PASSED={$passed}\n";
echo "PASSWORD_MIGRATION_FAILED={$failed}\n";
exit($failed === 0 ? 0 : 1);
