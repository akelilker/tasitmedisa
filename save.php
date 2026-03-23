<?php
require_once __DIR__ . '/core.php';
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$tokenData = validateToken();
if (!$tokenData) {
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'auth_required' => true,
        'message' => 'Oturum gerekli.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function medisaSaveDefaultData() {
    return [
        'tasitlar' => [],
        'kayitlar' => [],
        'branches' => [],
        'users' => [],
        'ayarlar' => [
            'sirketAdi' => 'Medisa',
            'yetkiliKisi' => '',
            'telefon' => '',
            'eposta' => '',
        ],
        'sifreler' => [],
        'arac_aylik_hareketler' => [],
        'duzeltme_talepleri' => [],
    ];
}

function medisaSaveNormalizeCollection($value) {
    return is_array($value) ? array_values($value) : [];
}

function medisaSaveMergeScopedCollection($currentItems, $incomingItems, $canManageCurrent, $canManageIncoming) {
    $merged = [];
    foreach ($currentItems as $item) {
        if (!$canManageCurrent($item)) {
            $merged[] = $item;
        }
    }
    foreach ($incomingItems as $item) {
        if ($canManageIncoming($item)) {
            $merged[] = $item;
        }
    }
    return array_values($merged);
}

function medisaSaveEnsureScopedVehiclesAreAllowed($incomingVehicles, $context) {
    foreach ($incomingVehicles as $vehicle) {
        if (!medisaCanManageVehicleRecord($vehicle, $context)) {
            return false;
        }
    }
    return true;
}

function medisaSaveEnsureScopedUsersAreAllowed($incomingUsers, $context) {
    foreach ($incomingUsers as $user) {
        if (!medisaCanManageUserRecord($user, $context)) {
            return false;
        }
    }
    return true;
}

function medisaSaveApplyVehicleVersions($incomingVehicles, $currentById) {
    $updated = [];
    foreach ($incomingVehicles as $vehicle) {
        $id = isset($vehicle['id']) ? (string)$vehicle['id'] : '';
        $current = $id !== '' ? ($currentById[$id] ?? null) : null;
        if ($current && isset($current['version'])) {
            $vehicle['version'] = (int)$current['version'] + 1;
        } else {
            $vehicle['version'] = 1;
        }
        $updated[] = $vehicle;
    }
    return $updated;
}

$input = file_get_contents('php://input');
if (empty($input)) {
    http_response_code(400);
    echo json_encode(['error' => 'Boş veri'], JSON_UNESCAPED_UNICODE);
    exit;
}

$incomingData = json_decode($input, true);
if (json_last_error() !== JSON_ERROR_NONE || !is_array($incomingData)) {
    http_response_code(400);
    echo json_encode(['error' => 'Geçersiz JSON'], JSON_UNESCAPED_UNICODE);
    exit;
}

$currentData = loadData();
if (!$currentData || !is_array($currentData)) {
    $currentData = medisaSaveDefaultData();
}

$context = medisaBuildAccessContext($currentData, $tokenData);
if (!$context) {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'message' => 'Kullanıcı bulunamadı veya yetki çözümlenemedi.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if (($context['role'] ?? 'kullanici') === 'kullanici') {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'message' => 'Bu ekran için yetkiniz yok.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$incomingVehicles = medisaSaveNormalizeCollection($incomingData['tasitlar'] ?? []);
$incomingUsers = medisaSaveNormalizeCollection($incomingData['users'] ?? []);
$currentVehicles = medisaSaveNormalizeCollection($currentData['tasitlar'] ?? []);
$currentUsers = medisaSaveNormalizeCollection($currentData['users'] ?? []);

$currentVehiclesById = [];
foreach ($currentVehicles as $vehicle) {
    $id = isset($vehicle['id']) ? (string)$vehicle['id'] : '';
    if ($id !== '') {
        $currentVehiclesById[$id] = $vehicle;
    }
}

foreach ($incomingVehicles as $vehicle) {
    $id = isset($vehicle['id']) ? (string)$vehicle['id'] : '';
    if ($id === '' || !isset($vehicle['version'])) {
        continue;
    }

    $currentVehicle = $currentVehiclesById[$id] ?? null;
    if ($currentVehicle === null) {
        continue;
    }

    if (($context['role'] ?? '') !== 'genel_yonetici' && !medisaCanManageVehicleRecord($currentVehicle, $context)) {
        continue;
    }

    $currentVersion = isset($currentVehicle['version']) ? (int)$currentVehicle['version'] : 0;
    $incomingVersion = (int)$vehicle['version'];
    if ($incomingVersion < $currentVersion) {
        http_response_code(409);
        echo json_encode(['conflict' => true], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

$incomingVehicles = medisaSaveApplyVehicleVersions($incomingVehicles, $currentVehiclesById);

$merged = $currentData;
if (($context['role'] ?? '') === 'genel_yonetici') {
    $merged['tasitlar'] = $incomingVehicles;
    $merged['kayitlar'] = is_array($incomingData['kayitlar'] ?? null) ? $incomingData['kayitlar'] : ($currentData['kayitlar'] ?? []);
    $merged['branches'] = medisaSaveNormalizeCollection($incomingData['branches'] ?? []);
    $merged['users'] = $incomingUsers;
    $merged['ayarlar'] = is_array($incomingData['ayarlar'] ?? null) ? $incomingData['ayarlar'] : ($currentData['ayarlar'] ?? []);
    $merged['sifreler'] = medisaSaveNormalizeCollection($incomingData['sifreler'] ?? []);
} else {
    if (!medisaSaveEnsureScopedVehiclesAreAllowed($incomingVehicles, $context) || !medisaSaveEnsureScopedUsersAreAllowed($incomingUsers, $context)) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'message' => 'Kapsam dışı veri kaydı engellendi.',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $merged['tasitlar'] = medisaSaveMergeScopedCollection(
        $currentVehicles,
        $incomingVehicles,
        function ($vehicle) use ($context) {
            return medisaCanManageVehicleRecord($vehicle, $context);
        },
        function ($vehicle) use ($context) {
            return medisaCanManageVehicleRecord($vehicle, $context);
        }
    );

    $merged['users'] = medisaSaveMergeScopedCollection(
        $currentUsers,
        $incomingUsers,
        function ($user) use ($context) {
            return medisaCanManageUserRecord($user, $context);
        },
        function ($user) use ($context) {
            return medisaCanManageUserRecord($user, $context);
        }
    );

    $merged['kayitlar'] = $currentData['kayitlar'] ?? [];
    $merged['branches'] = $currentData['branches'] ?? [];
    $merged['ayarlar'] = $currentData['ayarlar'] ?? [];
    $merged['sifreler'] = $currentData['sifreler'] ?? [];
}

// Ana uygulama kaydında kullanıcı paneli/admin verilerini koru.
$merged['arac_aylik_hareketler'] = $currentData['arac_aylik_hareketler'] ?? [];
$merged['duzeltme_talepleri'] = $currentData['duzeltme_talepleri'] ?? [];

if (!saveData($merged)) {
    http_response_code(500);
    echo json_encode(['error' => 'Dosya yazma hatası'], JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
?>
