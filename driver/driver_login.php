<?php
require_once __DIR__ . '/../core.php';
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// OPTIONS isteği
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Sadece POST kabul et
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Sadece POST istekleri kabul edilir'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Input al
$input = json_decode(file_get_contents('php://input'), true);
$username = trim($input['username'] ?? '');
$username = mb_substr($username, 0, 255);
$password = trim($input['password'] ?? '');

if (empty($username) || empty($password)) {
    echo json_encode(['success' => false, 'message' => 'Kullanıcı adı ve şifre gerekli!'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Veriyi yükle
$data = loadData();
if (!$data) {
    echo json_encode(['success' => false, 'message' => 'Veri okunamadı!'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Kullanıcıyı bul: kullanici_adi + şifre dolu olanlar portal girişi yapabilir (aktif yoksa aktif kabul et)
$user = null;
foreach ($data['users'] as $u) {
    $kullaniciEslesiyor = isset($u['kullanici_adi']) && trim((string)$u['kullanici_adi']) !== '' && trim((string)$u['kullanici_adi']) === trim($username);
    $sifreVar = isset($u['sifre']) && trim((string)$u['sifre']) !== '';
    $aktif = !isset($u['aktif']) || $u['aktif'] === true;
    if ($kullaniciEslesiyor && $sifreVar && $aktif) {
        $user = $u;
        break;
    }
}

if (!$user) {
    echo json_encode(['success' => false, 'message' => 'Kullanıcı bulunamadı veya aktif değil!'], JSON_UNESCAPED_UNICODE);
    exit;
}

// PERFORMANS VE FİX: Şifre kontrolü güçlendirildi (Tip ve boşluk uyuşmazlıkları giderildi)
$passwordMatch = false;

// Şifreleri her ihtimale karşı string'e çevirip boşlukları alıyoruz
$girilenSifre = trim((string)$password);
$kayitliSifre = isset($user['sifre']) ? trim((string)$user['sifre']) : '';
$kayitliHash  = isset($user['sifre_hash']) ? trim((string)$user['sifre_hash']) : '';

if (!empty($kayitliHash)) {
    // Eğer veritabanında DOLU bir hash varsa onu doğrula
    $passwordMatch = password_verify($girilenSifre, $kayitliHash);
} elseif (!empty($kayitliSifre)) {
    // Hash yoksa düz şifreyi (string olarak) doğrula
    $passwordMatch = ($girilenSifre === $kayitliSifre);
}

if (!$passwordMatch) {
    echo json_encode(['success' => false, 'message' => 'Şifre hatalı!'], JSON_UNESCAPED_UNICODE);
    exit;
}

$rol = isset($user['rol']) ? trim((string)$user['rol']) : '';
if ($rol === '' && isset($user['tip'])) {
    $t = trim((string)$user['tip']);
    if ($t === 'admin') {
        $rol = 'genel_yonetici';
    } elseif ($t === 'yonetici' || $t === 'sube_yonetici') {
        $rol = 'sube_yonetici';
    } else {
        $rol = 'kullanici';
    }
}
if ($rol === '') {
    $rol = 'kullanici';
}

$subeIds = [];
if (!empty($user['sube_ids']) && is_array($user['sube_ids'])) {
    $subeIds = array_values($user['sube_ids']);
} elseif (isset($user['sube_id']) && $user['sube_id'] !== '' && $user['sube_id'] !== null) {
    $subeIds = [$user['sube_id']];
}

$hasVehicle = false;
foreach ($data['tasitlar'] ?? [] as $t) {
    if (isset($t['assignedUserId']) && (string)$t['assignedUserId'] === (string)$user['id']) {
        $hasVehicle = true;
        break;
    }
}

$kullaniciPaneli = array_key_exists('kullanici_paneli', $user)
    ? (bool)$user['kullanici_paneli']
    : (
        array_key_exists('surucu_paneli', $user)
            ? (bool)$user['surucu_paneli']
            : ($rol === 'kullanici')
    );

$driverDashboard = ($rol === 'kullanici')
    || (($rol === 'sube_yonetici' || $rol === 'genel_yonetici') && $kullaniciPaneli && $hasVehicle);

// İmzalı oturum token'ı oluştur.
$token = medisaCreateSignedToken([
    'user_id' => $user['id'],
    'rol' => $rol,
    'sube_ids' => array_values(array_map('strval', $subeIds)),
    'kullanici_paneli' => $kullaniciPaneli,
    'driver_dashboard' => $driverDashboard
], 30 * 24 * 60 * 60);

// Son giriş zamanını güncelle
foreach ($data['users'] as &$u) {
    if ($u['id'] === $user['id']) {
        $u['son_giris'] = date('c');
        break;
    }
}
unset($u);

// Veriyi kaydet
saveData($data);

// Başarılı yanıt
echo json_encode([
    'success' => true,
    'token' => $token,
    'driverDashboard' => $driverDashboard,
    'rol' => $rol,
    'sube_ids' => $subeIds,
    'kullanici_paneli' => $kullaniciPaneli,
    'surucu_paneli' => $kullaniciPaneli,
    'user' => [
        'id' => $user['id'],
        'isim' => $user['isim'] ?? $user['name'] ?? ''
    ]
], JSON_UNESCAPED_UNICODE);
?>
