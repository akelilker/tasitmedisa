<?php
/**
 * Zorunlu ilk giriş parola değişikliği güvenlik invariantleri.
 * Canlı data/data.json okunmaz veya değiştirilmez; yalnız bellek içi fixture kullanılır.
 */
require_once __DIR__ . '/../core.php';
require_once __DIR__ . '/../driver/driver_common.php';

$passed = 0;
$failed = 0;

function mandatoryAssert($label, $condition) {
    global $passed, $failed;
    if ($condition) {
        $passed++;
        echo "[PASS] {$label}\n";
        return;
    }
    $failed++;
    echo "[FAIL] {$label}\n";
}

function mandatoryFixture() {
    return [
        'users' => [
            [
                'id' => 'gm-1',
                'isim' => 'Güvenlik Yöneticisi',
                'soyad' => 'SoyadA1234',
                'kullanici_adi' => 'TempUserA1',
                'role' => 'genel_yonetici',
                'branchIds' => ['merkez'],
                'aktif' => true,
                'sifre_hash' => password_hash('GeciciParola7X', PASSWORD_DEFAULT),
                'ilk_giris_parola_onerisi_bekliyor' => true,
            ],
            [
                'id' => 'user-1',
                'isim' => 'Normal Kullanıcı',
                'role' => 'kullanici',
                'branchIds' => ['merkez'],
                'aktif' => true,
                'sifre_hash' => password_hash('KaliciParola8Y', PASSWORD_DEFAULT),
                'ilk_giris_parola_onerisi_bekliyor' => false,
            ],
        ],
        'tasitlar' => [
            [
                'id' => 'vehicle-1',
                'assignedUserId' => 'user-1',
                'branchId' => 'merkez',
            ],
        ],
        'branches' => [
            ['id' => 'merkez', 'name' => 'Merkez'],
        ],
    ];
}

mandatoryAssert('normalize true', medisaNormalizeFirstLoginPasswordChangeRequired(true) === true);
mandatoryAssert('normalize integer one', medisaNormalizeFirstLoginPasswordChangeRequired(1) === true);
mandatoryAssert('normalize string one', medisaNormalizeFirstLoginPasswordChangeRequired('1') === true);
mandatoryAssert('normalize false', medisaNormalizeFirstLoginPasswordChangeRequired(false) === false);
mandatoryAssert('normalize integer zero', medisaNormalizeFirstLoginPasswordChangeRequired(0) === false);
mandatoryAssert('normalize string zero', medisaNormalizeFirstLoginPasswordChangeRequired('0') === false);
mandatoryAssert('normalize null', medisaNormalizeFirstLoginPasswordChangeRequired(null) === false);
mandatoryAssert('normalize malformed fail closed', medisaNormalizeFirstLoginPasswordChangeRequired('unknown') === true);
mandatoryAssert('normalize array fail closed', medisaNormalizeFirstLoginPasswordChangeRequired([]) === true);
mandatoryAssert('missing flag is not pending', medisaUserRequiresFirstLoginPasswordChange(['id' => 'missing']) === false);

$data = mandatoryFixture();
$gmBefore = $data['users'][0];
$gmContext = medisaBuildAccessContext($data, ['user_id' => 'gm-1']);
$gmClaims = medisaBuildSessionTokenClaims($gmContext);
$gmTokenData = $gmClaims;
$normalContext = medisaBuildAccessContext($data, ['user_id' => 'user-1']);
$normalClaims = medisaBuildSessionTokenClaims($normalContext);

mandatoryAssert('required context canonical boolean', ($gmContext['ilk_giris_parola_degistirme_zorunlu'] ?? false) === true);
mandatoryAssert('normal context canonical boolean', ($normalContext['ilk_giris_parola_degistirme_zorunlu'] ?? true) === false);
mandatoryAssert('token claims password version exists', trim((string)($gmClaims['pwdv'] ?? '')) !== '');
mandatoryAssert('token claims contain no password hash', !array_key_exists('sifre_hash', $gmClaims));
mandatoryAssert('token claims contain no plaintext password', !array_key_exists('sifre', $gmClaims));
mandatoryAssert('authenticated context accepts matching version', medisaBuildAuthenticatedAccessContext($data, $gmTokenData) !== null);
mandatoryAssert('authenticated context rejects missing version', medisaBuildAuthenticatedAccessContext($data, ['user_id' => 'gm-1']) === null);

$requiredGate = medisaResolveSessionContext($data, $gmTokenData);
$requiredSession = medisaResolveSessionContext($data, $gmTokenData, true);
$normalGate = medisaResolveSessionContext($data, $normalClaims);
mandatoryAssert('required data gate is 403', (int)($requiredGate['status'] ?? 0) === 403);
mandatoryAssert('required data gate code', ($requiredGate['code'] ?? '') === 'PASSWORD_CHANGE_REQUIRED');
mandatoryAssert('required session endpoint is allowed', ($requiredSession['success'] ?? false) === true);
mandatoryAssert('normal session endpoint is allowed', ($normalGate['success'] ?? false) === true);

mandatoryAssert(
    'same password denied',
    (medisaValidateNewUserPassword($gmBefore, 'GeciciParola7X', 'GeciciParola7X')['success'] ?? true) === false
);
mandatoryAssert(
    'weak password denied',
    (medisaValidateNewUserPassword($gmBefore, 'GeciciParola7X', 'zayif123')['success'] ?? true) === false
);
mandatoryAssert(
    'username exact denied',
    (medisaValidateNewUserPassword($gmBefore, 'GeciciParola7X', 'TempUserA1')['success'] ?? true) === false
);
mandatoryAssert(
    'surname exact denied',
    (medisaValidateNewUserPassword($gmBefore, 'GeciciParola7X', 'SoyadA1234')['success'] ?? true) === false
);
mandatoryAssert(
    'easy exact pattern denied',
    (medisaValidateNewUserPassword($gmBefore, 'GeciciParola7X', 'Password123')['success'] ?? true) === false
);
mandatoryAssert(
    'strong password accepted',
    (medisaValidateNewUserPassword($gmBefore, 'GeciciParola7X', 'GuvenliYeni7X')['success'] ?? false) === true
);

$usersBefore = count($data['users']);
$oldHash = $data['users'][0]['sifre_hash'];
medisaApplyUserPasswordChange($data['users'][0], 'GuvenliYeni7X');
$gmAfter = $data['users'][0];
$updatedContext = medisaBuildAccessContext($data, ['user_id' => 'gm-1']);
$updatedClaims = medisaBuildSessionTokenClaims($updatedContext);
$sessionPayload = medisaBuildSessionPayload($updatedContext);

mandatoryAssert('user count unchanged', count($data['users']) === $usersBefore);
mandatoryAssert('password hash changed', !hash_equals($oldHash, $gmAfter['sifre_hash']));
mandatoryAssert('old password denied', medisaVerifyUserPassword($gmAfter, 'GeciciParola7X') === false);
mandatoryAssert('new password accepted', medisaVerifyUserPassword($gmAfter, 'GuvenliYeni7X') === true);
mandatoryAssert('first login flag cleared', ($gmAfter['ilk_giris_parola_onerisi_bekliyor'] ?? true) === false);
mandatoryAssert('plaintext password absent', !array_key_exists('sifre', $gmAfter));
mandatoryAssert('new hash valid', (password_get_info($gmAfter['sifre_hash'])['algoName'] ?? 'unknown') !== 'unknown');
mandatoryAssert('user id unchanged', ($gmAfter['id'] ?? '') === ($gmBefore['id'] ?? ''));
mandatoryAssert('user role unchanged', ($gmAfter['role'] ?? '') === ($gmBefore['role'] ?? ''));
mandatoryAssert('user scope unchanged', ($gmAfter['branchIds'] ?? []) === ($gmBefore['branchIds'] ?? []));
mandatoryAssert('user active state unchanged', ($gmAfter['aktif'] ?? null) === ($gmBefore['aktif'] ?? null));
mandatoryAssert('old token version rejected after change', medisaBuildAuthenticatedAccessContext($data, $gmTokenData) === null);
mandatoryAssert('new token version accepted after change', medisaBuildAuthenticatedAccessContext($data, $updatedClaims) !== null);
mandatoryAssert('session payload flag cleared', ($sessionPayload['ilk_giris_parola_degistirme_zorunlu'] ?? true) === false);
mandatoryAssert('session payload user has no hash', !array_key_exists('sifre_hash', $sessionPayload['user'] ?? []));
mandatoryAssert('session payload user has no plaintext', !array_key_exists('sifre', $sessionPayload['user'] ?? []));

$driverRequiredData = mandatoryFixture();
$driverRequiredData['users'][1]['ilk_giris_parola_onerisi_bekliyor'] = true;
$driverRequiredContext = medisaBuildAccessContext($driverRequiredData, ['user_id' => 'user-1']);
$driverRequiredClaims = medisaBuildSessionTokenClaims($driverRequiredContext);
$driverRequiredGate = medisaDriverResolveContextResult($driverRequiredData, $driverRequiredClaims);
$driverNormalGate = medisaDriverResolveContextResult($data, $normalClaims);
mandatoryAssert('driver required user bypass denied', ($driverRequiredGate['code'] ?? '') === 'PASSWORD_CHANGE_REQUIRED');
mandatoryAssert('driver normal user allowed', ($driverNormalGate['success'] ?? false) === true);

echo "RESULT {$passed}/" . ($passed + $failed) . "\n";
exit($failed > 0 ? 1 : 0);
