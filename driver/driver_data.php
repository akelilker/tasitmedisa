<?php
require_once __DIR__ . '/../core.php';
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// OPTIONS isteği
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Token doğrula
$tokenData = validateToken();
if (!$tokenData) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Oturumunuz sona erdi!'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Veriyi yükle
$data = loadData();
if (!$data) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Veri okunamadı!'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Taşıt objesini sürücü response formatına dönüştür (sol panel + uyarılar için)
function buildVehicleForDriver($tasit, $branches = []) {
    $branchId = $tasit['branchId'] ?? null;
    $branchName = '';
    if ($branchId && is_array($branches)) {
        foreach ($branches as $b) {
            if (isset($b['id']) && (string)$b['id'] === (string)$branchId) {
                $branchName = $b['name'] ?? '';
                break;
            }
        }
    }
    $guncelKm = $tasit['guncelKm'] ?? $tasit['km'] ?? null;
    $marka = $tasit['marka'] ?? $tasit['brand'] ?? '';
    $model = $tasit['model'] ?? '';
    $brandModel = $tasit['brandModel'] ?? trim($marka . ' ' . $model);
    return [
        'id' => $tasit['id'],
        'plaka' => $tasit['plaka'] ?? $tasit['plate'] ?? '',
        'marka' => $marka,
        'model' => $model,
        'brandModel' => $brandModel,
        'tip' => $tasit['tip'] ?? $tasit['vehicleType'] ?? 'otomobil',
        'year' => $tasit['year'] ?? $tasit['yil'] ?? '',
        'branchId' => $branchId,
        'branchName' => $branchName,
        'guncelKm' => $guncelKm,
        'sigortaDate' => $tasit['sigortaDate'] ?? '',
        'kaskoDate' => $tasit['kaskoDate'] ?? '',
        'boya' => $tasit['boya'] ?? '',
        'boyaliParcalar' => $tasit['boyaliParcalar'] ?? [],
        'anahtar' => $tasit['anahtar'] ?? '',
        'anahtarNerede' => $tasit['anahtarNerede'] ?? '',
        'lastikDurumu' => $tasit['lastikDurumu'] ?? '',
        'lastikAdres' => $tasit['lastikAdres'] ?? '',
        'uttsTanimlandi' => $tasit['uttsTanimlandi'] ?? false,
        'muayeneDate' => $tasit['muayeneDate'] ?? ''
    ];
}

// Kullanıcıyı bul
$user = null;
foreach ($data['users'] as $u) {
    if ($u['id'] === $tokenData['user_id']) {
        $user = $u;
        break;
    }
}

if (!$user) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'Kullanıcı bulunamadı!'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Atanmış araçları bul (tek kaynak: tasit.assignedUserId)
$branches = $data['branches'] ?? [];
$vehicles = [];
$tasitlar = $data['tasitlar'] ?? [];
foreach ($tasitlar as $tasit) {
    $assignedUserId = $tasit['assignedUserId'] ?? null;
    if ($assignedUserId !== null && (string)$assignedUserId === (string)$user['id']) {
        $vehicles[] = buildVehicleForDriver($tasit, $branches);
    }
}
// Eski format yedek: zimmetli_araclar varsa ve assignedUserId ile araç bulunamadıysa kullanılabilir
if (count($vehicles) === 0 && !empty($user['zimmetli_araclar'])) {
    $zimmetliAraclar = $user['zimmetli_araclar'];
    foreach ($zimmetliAraclar as $aracId) {
        foreach ($tasitlar as $tasit) {
            if (isset($tasit['id']) && (string)$tasit['id'] === (string)$aracId) {
                $vehicles[] = buildVehicleForDriver($tasit, $branches);
                break;
            }
        }
    }
}

// Bu ay için mevcut kayıtları bul
$currentPeriod = date('Y-m');
$records = [];
$assignedVehicleIds = array_map(function ($v) { return $v['id']; }, $vehicles);
foreach ($data['arac_aylik_hareketler'] ?? [] as $kayit) {
    if (isset($kayit['surucu_id']) && (string)$kayit['surucu_id'] === (string)$user['id'] && in_array($kayit['arac_id'], $assignedVehicleIds)) {
        $records[] = $kayit;
    }
}

// Başarılı yanıt
echo json_encode([
    'success' => true,
    'user' => [
        'id' => $user['id'],
        'isim' => $user['isim']
    ],
    'vehicles' => $vehicles,
    'records' => $records,
    'current_period' => $currentPeriod
], JSON_UNESCAPED_UNICODE);
?>
