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

// 12) Genel yönetici başlangıç parola reset yetki matrisi (sentetik fixture)
$ctxGenel = ['role' => 'genel_yonetici', 'user_id' => 'gm-self', 'branch_ids' => []];
$ctxSube = ['role' => 'sube_yonetici', 'user_id' => 'bm1', 'branch_ids' => ['b1']];
$ctxKullanici = ['role' => 'kullanici', 'user_id' => 'u-actor', 'branch_ids' => ['b1']];
$targetKullanici = ['id' => 'u-target', 'rol' => 'kullanici', 'isim' => 'Hedef Kullanici'];
$targetSube = ['id' => 'bm-target', 'rol' => 'sube_yonetici', 'isim' => 'Hedef Sube'];
$targetGenelPeer = ['id' => 'gm-peer', 'rol' => 'genel_yonetici', 'isim' => 'Peer Genel'];
$targetGenelSelf = ['id' => 'gm-self', 'rol' => 'genel_yonetici', 'isim' => 'Self Genel'];

pwAssert('1 Genel->kullanici reset izinli', medisaCanResetPortalInitialPassword($targetKullanici, $ctxGenel) === true);
pwAssert('2 Genel->sube_yonetici reset izinli', medisaCanResetPortalInitialPassword($targetSube, $ctxGenel) === true);
pwAssert('3 Genel->baska genel reset reddi', medisaCanResetPortalInitialPassword($targetGenelPeer, $ctxGenel) === false);
pwAssert('4 Genel->kendi hesabi admin reset reddi', medisaCanResetPortalInitialPassword($targetGenelSelf, $ctxGenel) === false);
pwAssert('5 Sube->kullanici reset reddi', medisaCanResetPortalInitialPassword($targetKullanici, $ctxSube) === false);
pwAssert('6 Sube->genel reset reddi', medisaCanResetPortalInitialPassword($targetGenelPeer, $ctxSube) === false);
pwAssert('7 Kullanici->herhangi reset reddi', medisaCanResetPortalInitialPassword($targetKullanici, $ctxKullanici) === false);
pwAssert('8 Body ID geneline cevrilince reset reddi', medisaCanResetPortalInitialPassword($targetGenelPeer, $ctxGenel) === false);

$denyMessage = 'Bu kullanıcının başlangıç parolasını sıfırlama yetkiniz bulunmamaktadır.';
$adminCredentialPhp = file_get_contents(__DIR__ . '/../admin/user_portal_credentials.php');
pwAssert('Admin endpoint helper kullanir', strpos($adminCredentialPhp, 'medisaCanResetPortalInitialPassword') !== false);
pwAssert('Admin endpoint guvenli mesaj', strpos($adminCredentialPhp, $denyMessage) !== false);
$helperPos = strpos($adminCredentialPhp, 'medisaCanResetPortalInitialPassword');
$assignPos = strpos($adminCredentialPhp, 'medisaAssignInitialPortalPassword');
pwAssert('Yetki kontrolu parola uretiminden once', $helperPos !== false && $assignPos !== false && $helperPos < $assignPos);
pwAssert('Admin response hash dondurmez', !preg_match("/['\"]sifre_hash['\"]\\s*=>/", $adminCredentialPhp));

// 9-10) Yetki reddinde mutation / parola uretimi yok
$peerBefore = $targetGenelPeer;
medisaSetUserPasswordHash($peerBefore, $fixturePassword, true);
$peerHashBefore = $peerBefore['sifre_hash'] ?? '';
$peerMetaBefore = $peerBefore['ilk_giris_parola_onerisi_bekliyor'] ?? null;
$auditBefore = [];
$deniedMutated = false;
$passwordGeneratedOnDeny = false;
if (medisaCanResetPortalInitialPassword($peerBefore, $ctxGenel)) {
    $passwordGeneratedOnDeny = true;
    medisaAssignInitialPortalPassword($peerBefore, [$peerBefore]);
    $deniedMutated = true;
    $auditBefore[] = ['event' => 'portal_initial_password_reset'];
}
pwAssert('9 Yetki reddinde data mutation yok', $deniedMutated === false && $auditBefore === []);
pwAssert('10 Yetki reddinde parola uretimi yok', $passwordGeneratedOnDeny === false);
pwAssertSame('9 Peer hash korunur', $peerHashBefore, $peerBefore['sifre_hash'] ?? null);
pwAssertSame('9 Peer metadata korunur', $peerMetaBefore, $peerBefore['ilk_giris_parola_onerisi_bekliyor'] ?? null);

// İzinli hedeflerde helper true iken üretim yolu açılır (sentetik; canlıya yazılmaz)
$allowedUser = $targetKullanici;
medisaSetUserPasswordHash($allowedUser, $fixturePassword, true);
$allowedHashBefore = $allowedUser['sifre_hash'] ?? '';
if (medisaCanResetPortalInitialPassword($allowedUser, $ctxGenel)) {
    $allowedResetPassword = medisaAssignInitialPortalPassword($allowedUser, [$allowedUser]);
    pwAssert('Izinli reset yeni hash uretir', $allowedHashBefore !== ($allowedUser['sifre_hash'] ?? ''));
    pwAssert('Izinli reset yeni parola dogrular', medisaVerifyUserPassword($allowedUser, $allowedResetPassword));
} else {
    pwAssert('Izinli reset yolu acilmali', false);
}

// 11) Self-service parola değişimi tüm roller için kendi hesabında
foreach (['kullanici', 'sube_yonetici', 'genel_yonetici'] as $selfRole) {
    $selfUser = ['id' => 'self-' . $selfRole, 'rol' => $selfRole, 'isim' => 'Self ' . $selfRole];
    $oldSelfPassword = medisaGenerateInitialPortalPassword();
    $newSelfPassword = medisaGenerateInitialPortalPassword();
    medisaSetUserPasswordHash($selfUser, $oldSelfPassword);
    pwAssert("11 Self-service mevcut parola {$selfRole}", medisaVerifyUserPassword($selfUser, $oldSelfPassword));
    pwAssert("11 Self-service mevcut zorunlu {$selfRole}", !medisaVerifyUserPassword($selfUser, $newSelfPassword));
    medisaSetUserPasswordHash($selfUser, $newSelfPassword);
    pwAssert("11 Self-service yeni parola {$selfRole}", medisaVerifyUserPassword($selfUser, $newSelfPassword));
    pwAssert("11 Self-service eski gecersiz {$selfRole}", !medisaVerifyUserPassword($selfUser, $oldSelfPassword));
}

// 12) Self-service endpoint başka kullanıcı ID seçemez
$changePasswordPhp = file_get_contents(__DIR__ . '/../driver/driver_change_password.php');
pwAssert('12 Self-service token user_id kullanir', strpos($changePasswordPhp, "\$tokenData['user_id']") !== false);
pwAssert('12 Self-service input userId yok', !preg_match('/\$input\[[\'"]userId[\'"]\]/', $changePasswordPhp));
pwAssert('12 Self-service mevcut parola dogrular', strpos($changePasswordPhp, 'medisaVerifyUserPassword') !== false);

// 14) Admin reset response: yalnız başarıda initialPassword
pwAssert(
    '14 Basarili response initialPassword anahtari',
    preg_match("/'initialPassword'\\s*=>\\s*\\\$initialPassword/", $adminCredentialPhp) === 1
);
pwAssert(
    '14 Hata response initialPassword dondurmez',
    preg_match('/medisaBuildErrorResult\([^)]*initialPassword/', $adminCredentialPhp) !== 1
);

// 15) save wire _medisaUserPasswordChanges reddi korunur (400 kontrat ihlali)
$savePhp = file_get_contents(__DIR__ . '/../save.php');
$corePhp = file_get_contents(__DIR__ . '/../core.php');
pwAssert(
    '15 save passwordChanges reddi var',
    strpos($savePhp, 'medisaSaveApplyIncomingData') !== false
        && strpos($corePhp, '_medisaUserPasswordChanges') !== false
);
pwAssert(
    '15 save passwordChanges HTTP 400 kontrat',
    preg_match('/_medisaUserPasswordChanges[\s\S]{0,240}medisaBuildErrorResult\([^,]+,\s*400\)/', $corePhp) === 1
);

echo "Summary: PASS={$passed} FAIL={$failed}\n";
if ($failed > 0) {
    exit(1);
}
echo "verify-medisa-user-password-invariants: OK\n";
