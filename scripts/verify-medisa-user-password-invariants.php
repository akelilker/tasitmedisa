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
$fixturePassword = medisaGenerateInitialPortalPassword();
$replacementPassword = medisaGenerateInitialPortalPassword();
$legacyPassword = medisaGenerateInitialPortalPassword();

// 1) Client projection
$userWithHash = [
    'id' => 'u1',
    'isim' => 'Test Kullanici',
    'sifre' => 'should-not-leak',
    'sifre_hash' => password_hash($fixturePassword, PASSWORD_DEFAULT),
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
], ['u-new' => $fixturePassword], $contextAdmin);
pwAssert('Yeni kullanici reconcile basarili', ($createResult['success'] ?? false) === true);
$created = $createResult['users'][0] ?? [];
pwAssert('Yeni kullanici duz metin yok', !isset($created['sifre']) || $created['sifre'] === '');
pwAssert('Yeni kullanici hash var', isset($created['sifre_hash']) && trim((string)$created['sifre_hash']) !== '');
pwAssert('Yeni kullanici password_verify', medisaVerifyUserPassword($created, $fixturePassword));
pwAssert('Yeni kullanici portal_sifresi_var persist edilmez', !array_key_exists('portal_sifresi_var', $created));

// 3) Mevcut kullanici + yeni parola
$oldHashUser = ['id' => 'u3', 'isim' => 'Eski'];
medisaSetUserPasswordHash($oldHashUser, $fixturePassword);
$oldStamp = $oldHashUser['sifre_guncellendi_at'] ?? '';
$updateResult = medisaReconcileUserCredentials([$oldHashUser], [
    ['id' => 'u3', 'isim' => 'Eski', 'sifre_hash' => 'client-fake-hash'],
], ['u3' => $replacementPassword], $contextAdmin);
pwAssert('Guncelleme reconcile basarili', ($updateResult['success'] ?? false) === true);
$updated = $updateResult['users'][0] ?? [];
pwAssert('Eski parola dogrulanmaz', !medisaVerifyUserPassword($updated, $fixturePassword));
pwAssert('Yeni parola dogrulanir', medisaVerifyUserPassword($updated, $replacementPassword));
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
pwAssert('Sahte hash sonrasi eski parola dogrulanir', medisaVerifyUserPassword($fakeHandled, $fixturePassword));

$metadataUser = $oldHashUser;
$metadataUser['ilk_giris_parola_onerisi_bekliyor'] = true;
$metadataResult = medisaReconcileUserCredentials([$metadataUser], [
    ['id' => 'u3', 'isim' => 'Eski', 'ilk_giris_parola_onerisi_bekliyor' => false],
], null, $contextAdmin);
pwAssertSame(
    'Credential metadata istemciden degistirilemez',
    true,
    $metadataResult['users'][0]['ilk_giris_parola_onerisi_bekliyor'] ?? null
);

// 6) Legacy duz metin goc
$legacyUser = ['id' => 'u4', 'isim' => 'Legacy', 'sifre' => $legacyPassword];
$legacyResult = medisaReconcileUserCredentials([$legacyUser], [
    ['id' => 'u4', 'isim' => 'Legacy', 'sifre' => 'should-ignore'],
], null, $contextAdmin);
pwAssert('Legacy reconcile basarili', ($legacyResult['success'] ?? false) === true);
$migrated = $legacyResult['users'][0] ?? [];
pwAssert('Legacy duz metin kaldirildi', !isset($migrated['sifre']) || $migrated['sifre'] === '');
pwAssert('Legacy hash var', isset($migrated['sifre_hash']) && trim((string)$migrated['sifre_hash']) !== '');
pwAssert('Legacy password_verify', medisaVerifyUserPassword($migrated, $legacyPassword));

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
], ['u-unknown' => $fixturePassword], $contextAdmin);
pwAssert('Bilinmeyen ID reddedilir', ($unknownResult['success'] ?? false) !== true);
pwAssertSame('Bilinmeyen ID status 400', 400, (int)($unknownResult['status'] ?? 0));

// 9) Parola politikası
$shortResult = medisaReconcileUserCredentials([], [
    ['id' => 'u7', 'isim' => 'Kisa'],
], ['u7' => '12345'], $contextAdmin);
pwAssert('Kisa parola reddedilir', ($shortResult['success'] ?? false) !== true);
pwAssertSame('Kisa parola status 400', 400, (int)($shortResult['status'] ?? 0));
pwAssertSame('6 karakter parola kabul edilir', null, medisaValidatePortalPassword('abcdef'));
pwAssertSame('6 rakam parola kabul edilir', null, medisaValidatePortalPassword('123456'));
pwAssertSame('Ozel karakter zorunlu degil', null, medisaValidatePortalPassword('zzzzzz'));
pwAssert('Bosluk parola reddedilir', medisaValidatePortalPassword('      ') !== null);
pwAssertSame('Uzun parola politikasi gecerli', null, medisaValidatePortalPassword($fixturePassword));

// 10) Kullanıcı adı normalizasyonu ve case-insensitive unique
pwAssertSame('Turkce kullanici adi', 'sukruO', medisaBuildPortalUsernameBase('Şükrü Öztürk'));
pwAssertSame('Cok adli kullanici adi', 'mehmetY', medisaBuildPortalUsernameBase('Mehmet Ali Yılmaz'));
$usernameUsers = [
    ['id' => 'u8', 'isim' => 'Serhan Köse', 'kullanici_adi' => 'serhanK'],
    ['id' => 'u9', 'isim' => 'Serhan Köse', 'kullanici_adi' => 'SERHANK2'],
];
pwAssertSame('Duplicate sira numarasi', 'serhanK3', medisaCreateUniquePortalUsername('Serhan Köse', $usernameUsers));
$duplicateResult = medisaReconcileUserCredentials([], [
    ['id' => 'u8', 'isim' => 'Bir', 'kullanici_adi' => 'portalK'],
    ['id' => 'u9', 'isim' => 'Iki', 'kullanici_adi' => 'PORTALK'],
], null, $contextAdmin);
pwAssert('Case-insensitive duplicate reddedilir', ($duplicateResult['success'] ?? false) !== true);

// 11) Başlangıç parolası metadata ve projection
$initialUser = ['id' => 'u10', 'isim' => 'Başlangıç'];
$initialPassword = medisaGenerateInitialPortalPassword();
medisaSetUserPasswordHash($initialUser, $initialPassword, true);
pwAssert('Baslangic parola hash dogrulanir', medisaVerifyUserPassword($initialUser, $initialPassword));
pwAssertSame('Ilk giris onerisi bekliyor', true, $initialUser['ilk_giris_parola_onerisi_bekliyor'] ?? null);
$initialHash = $initialUser['sifre_hash'] ?? '';
medisaDismissInitialPasswordSuggestion($initialUser);
pwAssertSame('Ilk giris onerisi kapandi', false, $initialUser['ilk_giris_parola_onerisi_bekliyor'] ?? null);
pwAssertSame('Devam seciminde hash degismez', $initialHash, $initialUser['sifre_hash'] ?? '');
pwAssert('Devam seciminde ayni parola calisir', medisaVerifyUserPassword($initialUser, $initialPassword));
$resetPassword = medisaAssignInitialPortalPassword($initialUser, [$initialUser]);
pwAssert('Yonetici reset yeni hash olusturur', $initialHash !== ($initialUser['sifre_hash'] ?? ''));
pwAssert('Yonetici reset eski parolayi gecersiz kilar', !medisaVerifyUserPassword($initialUser, $initialPassword));
pwAssert('Yonetici reset yeni parolayi dogrular', medisaVerifyUserPassword($initialUser, $resetPassword));
$initialProjection = medisaProjectUserForClient($initialUser);
pwAssert('Baslangic parola hash projection yok', !array_key_exists('sifre_hash', $initialProjection));
pwAssert('Baslangic parola duz metin projection yok', !array_key_exists('sifre', $initialProjection));
$inactiveContext = medisaBuildAccessContext([
    'users' => [['id' => 'inactive', 'aktif' => false, 'rol' => 'genel_yonetici']],
    'tasitlar' => [],
], ['user_id' => 'inactive']);
pwAssertSame('Pasif kullanici authenticated context alamaz', null, $inactiveContext);

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
