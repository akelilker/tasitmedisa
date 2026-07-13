<?php
/**
 * Kullanıcı portal parolası — client projection + server credential reconciliation invariantleri.
 * Çalıştır: npm run tool:verify-user-password
 */
require_once __DIR__ . '/../core.php';

$passed = 0;
$failed = 0;

function pwAssert($label, $condition) {
    global $passed, $failed;
    if ($condition) {
        $passed++;
        echo "[PASS] {$label}\n";
        return;
    }
    $failed++;
    echo "[FAIL] {$label}\n";
}

function pwAssertSame($label, $expected, $actual) {
    pwAssert($label, $expected === $actual);
}

$contextAdmin = [
    'role' => 'genel_yonetici',
    'user_id' => 'admin1',
    'branch_ids' => [],
];

// 1) Client projection
$userWithHash = [
    'id' => 'u1',
    'isim' => 'Test Kullanici',
    'sifre' => 'should-not-leak',
    'sifre_hash' => password_hash('secret123', PASSWORD_DEFAULT),
    'sifre_guncellendi_at' => '2026-01-01T00:00:00+00:00',
    'password' => 'also-leak',
];
$projected = medisaProjectUserForClient($userWithHash);
pwAssert('Projection sifre yok', !array_key_exists('sifre', $projected));
pwAssert('Projection sifre_hash yok', !array_key_exists('sifre_hash', $projected));
pwAssert('Projection sifre_guncellendi_at yok', !array_key_exists('sifre_guncellendi_at', $projected));
pwAssert('Projection password yok', !array_key_exists('password', $projected));
pwAssertSame('Projection portal_sifresi_var true', true, $projected['portal_sifresi_var'] ?? null);
pwAssert('Projection orijinal mutate etmez', isset($userWithHash['sifre_hash']));

$userNoPassword = ['id' => 'u2', 'isim' => 'Sifresiz'];
$projectedEmpty = medisaProjectUserForClient($userNoPassword);
pwAssertSame('Projection portal_sifresi_var false', false, $projectedEmpty['portal_sifresi_var'] ?? null);

// 2) Yeni kullanici + yeni parola
$createResult = medisaReconcileUserCredentials([], [
    ['id' => 'u-new', 'isim' => 'Yeni'],
], ['u-new' => 'parola123'], $contextAdmin);
pwAssert('Yeni kullanici reconcile basarili', ($createResult['success'] ?? false) === true);
$created = $createResult['users'][0] ?? [];
pwAssert('Yeni kullanici duz metin yok', !isset($created['sifre']) || $created['sifre'] === '');
pwAssert('Yeni kullanici hash var', isset($created['sifre_hash']) && trim((string)$created['sifre_hash']) !== '');
pwAssert('Yeni kullanici password_verify', medisaVerifyUserPassword($created, 'parola123'));
pwAssert('Yeni kullanici portal_sifresi_var persist edilmez', !array_key_exists('portal_sifresi_var', $created));

// 3) Mevcut kullanici + yeni parola
$oldHashUser = ['id' => 'u3', 'isim' => 'Eski'];
medisaSetUserPasswordHash($oldHashUser, 'eskiParola1');
$oldStamp = $oldHashUser['sifre_guncellendi_at'] ?? '';
$updateResult = medisaReconcileUserCredentials([$oldHashUser], [
    ['id' => 'u3', 'isim' => 'Eski', 'sifre_hash' => 'client-fake-hash'],
], ['u3' => 'yeniParola9'], $contextAdmin);
pwAssert('Guncelleme reconcile basarili', ($updateResult['success'] ?? false) === true);
$updated = $updateResult['users'][0] ?? [];
pwAssert('Eski parola dogrulanmaz', !medisaVerifyUserPassword($updated, 'eskiParola1'));
pwAssert('Yeni parola dogrulanir', medisaVerifyUserPassword($updated, 'yeniParola9'));
pwAssert('Guncellemede duz metin yok', !isset($updated['sifre']) || $updated['sifre'] === '');

// 4) Mevcut kullanici + bos parola -> hash korunur
$preserveResult = medisaReconcileUserCredentials([$oldHashUser], [
    ['id' => 'u3', 'isim' => 'Eski', 'sifre' => 'client-plain', 'sifre_hash' => 'client-fake'],
], ['u3' => ''], $contextAdmin);
pwAssert('Bos parola reconcile basarili', ($preserveResult['success'] ?? false) === true);
$preserved = $preserveResult['users'][0] ?? [];
pwAssertSame('Bos parola hash korunur', $oldHashUser['sifre_hash'], $preserved['sifre_hash'] ?? null);
pwAssertSame('Bos parola tarih korunur', $oldStamp, $preserved['sifre_guncellendi_at'] ?? null);
pwAssert('Bos parola client sifre yok', !isset($preserved['sifre']) || $preserved['sifre'] === '');

// 5) Sahte sifre_hash istemciden
$fakeHashResult = medisaReconcileUserCredentials([$oldHashUser], [
    ['id' => 'u3', 'isim' => 'Eski', 'sifre_hash' => '$2y$10$invalidclienthashvaluexxxxxxxxxxx'],
], null, $contextAdmin);
pwAssert('Sahte hash reconcile basarili', ($fakeHashResult['success'] ?? false) === true);
$fakeHandled = $fakeHashResult['users'][0] ?? [];
pwAssertSame('Sahte hash kabul edilmez', $oldHashUser['sifre_hash'], $fakeHandled['sifre_hash'] ?? null);
pwAssert('Sahte hash sonrasi eski parola dogrulanir', medisaVerifyUserPassword($fakeHandled, 'eskiParola1'));

// 6) Legacy duz metin goc
$legacyUser = ['id' => 'u4', 'isim' => 'Legacy', 'sifre' => 'legacyPwd1'];
$legacyResult = medisaReconcileUserCredentials([$legacyUser], [
    ['id' => 'u4', 'isim' => 'Legacy', 'sifre' => 'should-ignore'],
], null, $contextAdmin);
pwAssert('Legacy reconcile basarili', ($legacyResult['success'] ?? false) === true);
$migrated = $legacyResult['users'][0] ?? [];
pwAssert('Legacy duz metin kaldirildi', !isset($migrated['sifre']) || $migrated['sifre'] === '');
pwAssert('Legacy hash var', isset($migrated['sifre_hash']) && trim((string)$migrated['sifre_hash']) !== '');
pwAssert('Legacy password_verify', medisaVerifyUserPassword($migrated, 'legacyPwd1'));

// 7) Yeni kullanici + parola yok
$noPassResult = medisaReconcileUserCredentials([], [
    ['id' => 'u5', 'isim' => 'Parolasiz'],
], null, $contextAdmin);
pwAssert('Parolasiz yeni reconcile basarili', ($noPassResult['success'] ?? false) === true);
$noPassUser = $noPassResult['users'][0] ?? [];
pwAssert('Parolasiz hash yok', !isset($noPassUser['sifre_hash']) || trim((string)($noPassUser['sifre_hash'] ?? '')) === '');
pwAssert('Parolasiz duz metin yok', !isset($noPassUser['sifre']) || $noPassUser['sifre'] === '');

// 8) Bilinmeyen user ID password change
$unknownResult = medisaReconcileUserCredentials([], [
    ['id' => 'u6', 'isim' => 'Var'],
], ['u-unknown' => 'parola123'], $contextAdmin);
pwAssert('Bilinmeyen ID reddedilir', ($unknownResult['success'] ?? false) !== true);
pwAssertSame('Bilinmeyen ID status 400', 400, (int)($unknownResult['status'] ?? 0));

// 9) 6 karakter alti
$shortResult = medisaReconcileUserCredentials([], [
    ['id' => 'u7', 'isim' => 'Kisa'],
], ['u7' => '12345'], $contextAdmin);
pwAssert('Kisa parola reddedilir', ($shortResult['success'] ?? false) !== true);
pwAssertSame('Kisa parola status 400', 400, (int)($shortResult['status'] ?? 0));

// Filter projection contract (load response users)
$sampleData = [
    'tasitlar' => [],
    'kayitlar' => [],
    'branches' => [],
    'users' => [$userWithHash, $userNoPassword],
    'ayarlar' => [],
    'sifreler' => [],
    'arac_aylik_hareketler' => [],
    'duzeltme_talepleri' => [],
    'notificationReadState' => [],
    'monthlyTodoWhatsAppLogs' => [],
];
$filtered = medisaFilterDataForContextWithUserPredicate($sampleData, $contextAdmin, function ($user, $context) {
    return true;
});
foreach (($filtered['users'] ?? []) as $filteredUser) {
    pwAssert('Filter users sifre yok', !array_key_exists('sifre', $filteredUser));
    pwAssert('Filter users sifre_hash yok', !array_key_exists('sifre_hash', $filteredUser));
    pwAssert('Filter users portal_sifresi_var boolean', is_bool($filteredUser['portal_sifresi_var'] ?? null));
}

echo "Summary: PASS={$passed} FAIL={$failed}\n";
if ($failed > 0) {
    exit(1);
}
echo "verify-medisa-user-password-invariants: OK\n";
