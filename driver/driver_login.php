<?php
require_once __DIR__ . '/../core.php';

// #region agent log
function medisaAgentDebugLoginLog($hypothesisId, $location, $message, $data = []) {
    $path = __DIR__ . '/../debug-8624d8.log';
    $row = [
        'sessionId' => '8624d8',
        'hypothesisId' => $hypothesisId,
        'location' => $location,
        'message' => $message,
        'data' => $data,
        'timestamp' => (int) round(microtime(true) * 1000),
    ];
    @file_put_contents($path, json_encode($row, JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
}
// #endregion

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

$username = trim((string)($input['username'] ?? ''));
$username = mb_substr($username, 0, 255);
$password = trim((string)($input['password'] ?? ''));

if ($username === '' || $password === '') {
    echo json_encode(['success' => false, 'message' => 'Kullanıcı adı ve şifre gerekli!'], JSON_UNESCAPED_UNICODE);
    exit;
}

$result = medisaMutateData(function (&$data) use ($username, $password) {
    // #region agent log
    medisaAgentDebugLoginLog('H2', 'driver_login.php:mutator_enter', 'credentials_shape', [
        'usernameLen' => strlen($username),
        'passwordLen' => strlen($password),
        'usersCount' => is_array($data['users'] ?? null) ? count($data['users']) : -1,
    ]);
    // #endregion

    if (!is_array($data) || !isset($data['users']) || !is_array($data['users'])) {
        return medisaBuildErrorResult('Veri okunamadı!', 500);
    }

    $user = null;
    $userIndex = -1;
    $usernameExists = false;
    $usernameActive = false;
    foreach ($data['users'] as $idx => $candidate) {
        $kullaniciEslesiyor = isset($candidate['kullanici_adi'])
            && trim((string)$candidate['kullanici_adi']) !== ''
            && strcasecmp(trim((string)$candidate['kullanici_adi']), $username) === 0;
        if (!$kullaniciEslesiyor) {
            continue;
        }

        $usernameExists = true;
        $sifreVar = (isset($candidate['sifre']) && trim((string)$candidate['sifre']) !== '')
            || (isset($candidate['sifre_hash']) && trim((string)$candidate['sifre_hash']) !== '');
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

    // #region agent log
    medisaAgentDebugLoginLog('H2', 'driver_login.php:after_loop', 'user_scan', [
        'usernameExists' => $usernameExists,
        'usernameActive' => $usernameActive,
        'userFound' => $user !== null && $userIndex >= 0,
    ]);
    // #endregion

    if (!$user || $userIndex < 0) {
        // #region agent log
        $failReason = !$usernameExists ? 'username_not_found' : (!$usernameActive ? 'inactive' : 'no_password');
        medisaAgentDebugLoginLog('H4', 'driver_login.php:fail_precheck', 'login_fail', ['reason' => $failReason]);
        // #endregion
        if (!$usernameExists) {
            return medisaBuildErrorResult('Kullanıcı adı hatalı!', 200);
        }
        if (!$usernameActive) {
            return medisaBuildErrorResult('Kullanıcı hesabı pasif!', 200);
        }
        return medisaBuildErrorResult('Şifre tanımlı değil. Yöneticiye başvurun.', 200);
    }

    $girilenSifre = trim((string)$password);
    $kayitliSifre = isset($user['sifre']) ? trim((string)$user['sifre']) : '';
    $kayitliHash = isset($user['sifre_hash']) ? trim((string)$user['sifre_hash']) : '';
    $passwordMatch = false;

    if ($kayitliHash !== '') {
        $passwordMatch = password_verify($girilenSifre, $kayitliHash);
    } elseif ($kayitliSifre !== '') {
        $passwordMatch = ($girilenSifre === $kayitliSifre);
    }

    if (!$passwordMatch) {
        // #region agent log
        medisaAgentDebugLoginLog('H3', 'driver_login.php:fail_password', 'login_fail', [
            'reason' => 'password_mismatch',
            'storedUsesHash' => $kayitliHash !== '',
        ]);
        // #endregion
        return medisaBuildErrorResult('Şifre hatalı!', 200);
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
    $kullaniciPaneli = medisaResolvePanelFlag($user);
    $driverDashboard = medisaComputeDriverDashboard($user, $data);
    $isYoneticiOnly = ($rawRol === 'yonetici');
    if ($isYoneticiOnly) {
        $driverDashboard = false;
    }

    $data['users'][$userIndex]['son_giris'] = date('c');

    // #region agent log
    medisaAgentDebugLoginLog('H3', 'driver_login.php:mutator_success', 'password_ok', []);
    // #endregion

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
    ];
});

// #region agent log
medisaAgentDebugLoginLog('H1', 'driver_login.php:after_mutate', 'login_result', [
    'success' => ($result['success'] ?? false) === true,
    'httpStatus' => (int) ($result['status'] ?? 200),
    'messageKey' => isset($result['message']) ? substr((string) $result['message'], 0, 120) : '',
]);
// #endregion

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

$token = medisaCreateSignedToken([
    'user_id' => $result['user_id'],
    'rol' => $result['rol'],
    'raw_rol' => $result['raw_rol'],
    'yonetici_only' => $result['yonetici_only'],
    'sube_ids' => array_values(array_map('strval', $result['sube_ids'] ?? [])),
    'kullanici_paneli' => $result['kullanici_paneli'],
    'driver_dashboard' => $result['driver_dashboard'],
], 30 * 24 * 60 * 60);

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
    'user' => [
        'id' => $result['user_id'],
        'isim' => $result['user_isim'],
    ],
], JSON_UNESCAPED_UNICODE);
?>
