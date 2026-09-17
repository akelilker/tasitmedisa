<?php
require_once __DIR__ . '/../core.php';

/** Görünmez Unicode + trim; NFC birleşik form (kopyala-yapıştır uyumu). */
function medisaLoginNormalizeUsernameInput($s) {
    return medisaNormalizePortalUsername($s);
}

/** Kayıttaki giriş adı: önce Türkçe anahtar, sonra yaygın İngilizce yedekler. */
function medisaLoginExtractStoredUsername($candidate) {
    if (!is_array($candidate)) {
        return '';
    }
    return medisaExtractPortalUsername($candidate);
}

function medisaLoginUsernamesEqual($stored, $input) {
    return medisaPortalUsernamesEqual($stored, $input);
}

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Sadece POST istekleri kabul edilir'], JSON_UNESCAPED_UNICODE);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = [];
}

$username = medisaLoginNormalizeUsernameInput($input['username'] ?? '');
$username = mb_substr($username, 0, 255);
$password = trim((string)($input['password'] ?? ''));

if ($username === '' || $password === '') {
    echo json_encode(['success' => false, 'message' => 'Kullanıcı adı ve şifre gerekli!'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Login yalnız son_giris touch eder; restore write-freeze auth'u kilitlememeli.
$restoreBypassSet = false;
if (function_exists('medisaRestoreSetCommitBypass')) {
    medisaRestoreSetCommitBypass(true);
    $restoreBypassSet = true;
}
try {
    $result = medisaMutateData(function (&$data) use ($username, $password) {

    if (!is_array($data) || !isset($data['users']) || !is_array($data['users'])) {
        return medisaBuildErrorResult('Veri okunamadı!', 500);
    }

    $user = null;
    $userIndex = -1;
    $usernameExists = false;
    $usernameActive = false;
    foreach ($data['users'] as $idx => $candidate) {
        $storedLogin = medisaLoginExtractStoredUsername($candidate);
        $kullaniciEslesiyor = $storedLogin !== '' && medisaLoginUsernamesEqual($storedLogin, $username);
        if (!$kullaniciEslesiyor) {
            continue;
        }

        $usernameExists = true;
        $sifreVar = medisaUserHasPortalPassword($candidate);
        $aktif = !isset($candidate['aktif']) || $candidate['aktif'] === true;
        if (!$aktif) {
            continue;
        }

        $usernameActive = true;
        if ($sifreVar) {
            $user = $candidate;
            $userIndex = $idx;
            break;
        }
    }

    if (!$user || $userIndex < 0) {
        if (!$usernameExists) {
            return medisaBuildErrorResult('Kullanıcı adı hatalı!', 200);
        }
        if (!$usernameActive) {
            return medisaBuildErrorResult('Kullanıcı hesabı pasif!', 200);
        }
        return medisaBuildErrorResult('Şifre tanımlı değil. Yöneticiye başvurun.', 200);
    }

    if (!medisaVerifyUserPassword($user, $password)) {
        return medisaBuildErrorResult('Şifre hatalı!', 401);
    }

    $rolPrecheck = medisaResolveUserRole($user);
    if ($rolPrecheck === 'kullanici' && !medisaUserHasAssignedVehicle($data, (string)($user['id'] ?? ''))) {
        return medisaBuildErrorResult('Size atanmış taşıt bulunmuyor. Giriş yapılamıyor.', 200);
    }

    $rawRol = '';
    if (isset($user['rol'])) {
        $rawRol = trim((string)$user['rol']);
    } elseif (isset($user['role'])) {
        $rawRol = trim((string)$user['role']);
    }
    if ($rawRol === '' && isset($user['tip'])) {
        $rawRol = trim((string)$user['tip']);
    }

    $rol = medisaResolveUserRole($user);
    $subeIds = medisaExtractUserBranchIds($user);
    $driverDashboard = medisaComputeDriverDashboard($user, $data);
    $isYoneticiOnly = ($rawRol === 'yonetici');
    if ($isYoneticiOnly) {
        $driverDashboard = false;
    }
    $kullaniciPaneli = $driverDashboard;

    $data['users'][$userIndex]['son_giris'] = date('c');
    $context = medisaBuildAccessContext($data, ['user_id' => $user['id']]);
    if (!$context) {
        return medisaBuildErrorResult('Oturum başlatılamadı.', 500);
    }

    return [
        'success' => true,
        'user_id' => $user['id'],
        'user_isim' => $user['isim'] ?? $user['name'] ?? '',
        'rol' => $rol,
        'raw_rol' => $rawRol,
        'yonetici_only' => $isYoneticiOnly,
        'sube_ids' => $subeIds,
        'kullanici_paneli' => $kullaniciPaneli,
        'driver_dashboard' => $driverDashboard,
        'ilk_giris_parola_degistirme_zorunlu' => $context['ilk_giris_parola_degistirme_zorunlu'],
        'token_claims' => medisaBuildSessionTokenClaims($context),
    ];
    });
} finally {
    if ($restoreBypassSet && function_exists('medisaRestoreSetCommitBypass')) {
        medisaRestoreSetCommitBypass(false);
    }
}

$status = (int)($result['status'] ?? 200);
if ($status !== 200) {
    http_response_code($status);
}
unset($result['status']);

if (($result['success'] ?? false) !== true) {
    echo json_encode([
        'success' => false,
        'message' => $result['message'] ?? 'Giriş başarısız!',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$tokenClaims = is_array($result['token_claims'] ?? null) ? $result['token_claims'] : [];
unset($result['token_claims']);
$token = medisaCreateSignedToken($tokenClaims, 30 * 24 * 60 * 60);

echo json_encode([
    'success' => true,
    'token' => $token,
    'driverDashboard' => $result['driver_dashboard'],
    'rol' => $result['rol'],
    'raw_rol' => $result['raw_rol'],
    'yonetici_only' => $result['yonetici_only'],
    'sube_ids' => $result['sube_ids'],
    'kullanici_paneli' => $result['kullanici_paneli'],
    'surucu_paneli' => $result['kullanici_paneli'],
    'ilk_giris_parola_degistirme_zorunlu' => $result['ilk_giris_parola_degistirme_zorunlu'],
    'user' => [
        'id' => $result['user_id'],
        'isim' => $result['user_isim'],
    ],
], JSON_UNESCAPED_UNICODE);
?>
