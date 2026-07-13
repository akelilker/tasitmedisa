<?php
require_once __DIR__ . '/driver_common.php';
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

$context = medisaDriverResolveContext($data, $tokenData);
if (!$context) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Kullanıcı paneli erişiminiz yok!'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Taşıt objesini kullanıcı paneli response formatına dönüştür (sol panel + uyarılar için)
function buildVehicleForDriver($tasit, $branches = [], $k2Belgesi = []) {
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
    $vehicleType = strtolower(trim((string)($tasit['vehicleType'] ?? $tasit['tip'] ?? 'otomobil')));
    $k2Required = medisaSaveVehicleNeedsK2($tasit);
    $takografRequired = medisaSaveVehicleNeedsTakograf($tasit);
    return [
        'id' => $tasit['id'],
        'version' => medisaGetVehicleVersion($tasit),
        'plaka' => $tasit['plaka'] ?? $tasit['plate'] ?? '',
        'marka' => $marka,
        'model' => $model,
        'brandModel' => $brandModel,
        'tip' => $vehicleType ?: 'otomobil',
        'vehicleType' => $vehicleType ?: 'otomobil',
        'year' => $tasit['year'] ?? $tasit['yil'] ?? '',
        'branchId' => $branchId,
        'branchName' => $branchName,
        'guncelKm' => $guncelKm,
        'ruhsatPath' => $tasit['ruhsatPath'] ?? '',
        'sigortaPolicePath' => $tasit['sigortaPolicePath'] ?? '',
        'kaskoPolicePath' => $tasit['kaskoPolicePath'] ?? '',
        'k2BelgesiPath' => $k2Required && is_array($k2Belgesi) ? ($k2Belgesi['documentPath'] ?? '') : '',
        'k2BelgesiExpiryDate' => $k2Required && is_array($k2Belgesi) ? ($k2Belgesi['expiryDate'] ?? '') : '',
        'tasitKartiPath' => $k2Required ? ($tasit['tasitKartiPath'] ?? '') : '',
        'tasitKartiExpiryDate' => $k2Required ? ($tasit['tasitKartiExpiryDate'] ?? '') : '',
        'takografBelgesiPath' => $takografRequired ? ($tasit['takografBelgesiPath'] ?? '') : '',
        'takografKalibrasyonDate' => $takografRequired ? ($tasit['takografKalibrasyonDate'] ?? '') : '',
        'takografExpiryDate' => $takografRequired ? ($tasit['takografExpiryDate'] ?? '') : '',
        'sigortaDate' => $tasit['sigortaDate'] ?? '',
        'kaskoDate' => $tasit['kaskoDate'] ?? '',
        'boya' => $tasit['boya'] ?? '',
        'boyaliParcalar' => $tasit['boyaliParcalar'] ?? [],
        'anahtar' => $tasit['anahtar'] ?? '',
        'anahtarNerede' => $tasit['anahtarNerede'] ?? '',
        'lastikDurumu' => $tasit['lastikDurumu'] ?? '',
        'lastikAdres' => $tasit['lastikAdres'] ?? '',
        'uttsTanimlandi' => $tasit['uttsTanimlandi'] ?? false,
        'muayeneDate' => $tasit['muayeneDate'] ?? '',
        'events' => [],
        'createdAt' => $tasit['createdAt'] ?? null
    ];
}

$user = $context['user'];

// Atanmış taşıtları bul (tek kaynak: tasit.assignedUserId)
$branches = $data['branches'] ?? [];
$vehicles = [];
$tasitlar = $data['tasitlar'] ?? [];
$k2Belgesi = is_array($data['ayarlar']['k2Belgesi'] ?? null) ? $data['ayarlar']['k2Belgesi'] : [];
foreach ($tasitlar as $tasit) {
    $assignedUserId = $tasit['assignedUserId'] ?? null;
    if ($assignedUserId !== null && (string)$assignedUserId === (string)$user['id']) {
        $vehicles[] = buildVehicleForDriver($tasit, $branches, $k2Belgesi);
    }
}
// Eski format yedek: zimmetli_araclar varsa ve assignedUserId ile taşıt bulunamadıysa kullanılabilir
if (count($vehicles) === 0 && !empty($user['zimmetli_araclar'])) {
    $zimmetliAraclar = $user['zimmetli_araclar'];
    foreach ($zimmetliAraclar as $aracId) {
        foreach ($tasitlar as $tasit) {
            if (isset($tasit['id']) && (string)$tasit['id'] === (string)$aracId) {
                $vehicles[] = buildVehicleForDriver($tasit, $branches, $k2Belgesi);
                break;
            }
        }
    }
}

// Dashboard için yalnızca bu ayın kayıtlarını gönder; tam geçmiş driver_history.php ile açılır.
$currentPeriod = date('Y-m');
$assignedVehicleIdSet = medisaDriverBuildAssignedVehicleIdSet($vehicles);
$stateRecords = medisaDriverFilterRecordsForVehicles(
    $data['arac_aylik_hareketler'] ?? [],
    $user['id'] ?? '',
    $assignedVehicleIdSet
);
$records = medisaDriverFilterRecordsForVehicles(
    $data['arac_aylik_hareketler'] ?? [],
    $user['id'] ?? '',
    $assignedVehicleIdSet,
    $currentPeriod
);
$currentDay = (int)date('j');
$recordsByVehicle = [];
foreach ($stateRecords as $record) {
    $vehicleId = (string)($record['arac_id'] ?? '');
    if ($vehicleId === '') continue;
    if (!isset($recordsByVehicle[$vehicleId])) $recordsByVehicle[$vehicleId] = [];
    $recordsByVehicle[$vehicleId][] = $record;
}

foreach ($vehicles as &$vehicle) {
    $vehicleId = (string)($vehicle['id'] ?? '');
    $vehicleRecords = $recordsByVehicle[$vehicleId] ?? [];
    $kmPeriods = [];
    foreach ($vehicleRecords as $record) {
        if (!medisaHasKmValue($record)) continue;
        $donem = (string)($record['donem'] ?? '');
        if ($donem === '') continue;
        $kmPeriods[$donem] = true;
    }
    $kmPeriodKeys = array_keys($kmPeriods);
    $hasReliableHistory = count($kmPeriodKeys) > 0;
    $hasKmForPeriod = isset($kmPeriods[$currentPeriod]);
    $hasFutureKmRecord = medisaHasFutureKmPeriod($kmPeriodKeys, $currentPeriod);
    $baseKmValue = $vehicle['guncelKm'] ?? null;
    $hasBaseKm = $baseKmValue !== null && trim((string)$baseKmValue) !== '';

    $kmStateResult = medisaComputeKmState(
        $currentPeriod,
        $currentPeriod,
        $currentDay,
        $hasKmForPeriod,
        $hasFutureKmRecord,
        $hasReliableHistory,
        $hasBaseKm
    );
    $vehicle['km_state'] = (string)($kmStateResult['state'] ?? 'OK');
    $vehicle['km_state_reason'] = (string)($kmStateResult['reason'] ?? '');
}
unset($vehicle);

// Başarılı yanıt
echo json_encode([
    'success' => true,
    'user' => [
        'id' => $user['id'],
        'isim' => $user['isim'] ?? $user['name'] ?? ''
    ],
    'session' => medisaBuildSessionPayload($context),
    'vehicles' => $vehicles,
    'records' => $records,
    'current_period' => $currentPeriod
], JSON_UNESCAPED_UNICODE);
?>
