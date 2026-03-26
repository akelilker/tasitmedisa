<?php
require_once __DIR__ . '/../core.php';
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
    if (!is_array($data) || !isset($data['users']) || !is_array($data['users'])) {
        return medisaBuildErrorResult('Veri okunamadı!', 500);
    }

    $user = null;
    $userIndex = -1;
    foreach ($data['users'] as $idx => $candidate) {
        $kullaniciEslesiyor = isset($candidate['kullanici_adi'])
            && trim((string)$candidate['kullanici_adi']) !== ''
            && trim((string)$candidate['kullanici_adi']) === $username;
        $sifreVar = isset($candidate['sifre']) && trim((string)$candidate['sifre']) !== '';
        $aktif = !isset($candidate['aktif']) || $candidate['aktif'] === true;
        if ($kullaniciEslesiyor && $sifreVar && $aktif) {
            $user = $candidate;
            $userIndex = $idx;
            break;
        }
    }

    if (!$user || $userIndex < 0) {
        return medisaBuildErrorResult('Kullanıcı bulunamadı veya aktif değil!', 200);
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
