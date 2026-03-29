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

// Taşıt objesini kullanıcı paneli response formatına dönüştür (sol panel + uyarılar için)
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
        'version' => medisaGetVehicleVersion($tasit),
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
        'muayeneDate' => $tasit['muayeneDate'] ?? '',
        'events' => $tasit['events'] ?? [],
        'createdAt' => $tasit['createdAt'] ?? null
    ];
}

if (!function_exists('medisaHasKmValue')) {
    function medisaHasKmValue($record) {
        if (!is_array($record)) return false;
        if (!array_key_exists('guncel_km', $record)) return false;
        $value = $record['guncel_km'];
        if ($value === null) return false;
        return trim((string)$value) !== '';
    }
}

if (!function_exists('medisaHasFutureKmPeriod')) {
    function medisaHasFutureKmPeriod($kmPeriods, $period) {
        if (!is_array($kmPeriods) || empty($kmPeriods)) return false;
        foreach ($kmPeriods as $p) {
            if (strcmp((string)$p, (string)$period) > 0) {
                return true;
            }
        }
        return false;
    }
}

if (!function_exists('medisaComputeKmState')) {
    function medisaComputeKmState($selectedPeriod, $currentPeriod, $dayOfMonth, $hasKmForPeriod, $hasFutureKmRecord, $hasReliableHistory, $hasBaseKm) {
        $selectedPeriod = (string)$selectedPeriod;
        $currentPeriod = (string)$currentPeriod;
        $isFuturePeriod = strcmp($selectedPeriod, $currentPeriod) > 0;
        $isPastPeriod = strcmp($selectedPeriod, $currentPeriod) < 0;
        $isCurrentPeriod = !$isFuturePeriod && !$isPastPeriod;

        if ($isFuturePeriod) {
            return ['state' => 'OK', 'reason' => 'future_period_no_warning', 'is_current_period' => false, 'is_past_period' => false, 'is_future_period' => true];
        }
        if (!$hasReliableHistory && !$hasBaseKm) {
            return ['state' => 'FIRST_ENTRY_REQUIRED', 'reason' => 'no_reliable_history_and_no_base_km', 'is_current_period' => $isCurrentPeriod, 'is_past_period' => $isPastPeriod, 'is_future_period' => false];
        }
        if ($hasKmForPeriod) {
            return ['state' => 'OK', 'reason' => 'period_km_exists', 'is_current_period' => $isCurrentPeriod, 'is_past_period' => $isPastPeriod, 'is_future_period' => false];
        }
        if ($isPastPeriod) {
            if ($hasFutureKmRecord) {
                return ['state' => 'TELAFI_CLOSED', 'reason' => 'past_period_closed_by_future_km', 'is_current_period' => false, 'is_past_period' => true, 'is_future_period' => false];
            }
            return ['state' => 'MONTHLY_UPDATE_DUE_HARD', 'reason' => 'past_period_unclosed_missing_km', 'is_current_period' => false, 'is_past_period' => true, 'is_future_period' => false];
        }
        if ($isCurrentPeriod) {
            if ((int)$dayOfMonth <= 2) {
                return ['state' => 'MONTHLY_UPDATE_DUE_SOFT', 'reason' => 'current_period_day_1_2_missing_km', 'is_current_period' => true, 'is_past_period' => false, 'is_future_period' => false];
            }
            return ['state' => 'MONTHLY_UPDATE_DUE_HARD', 'reason' => 'current_period_day_3_plus_missing_km', 'is_current_period' => true, 'is_past_period' => false, 'is_future_period' => false];
        }

        return ['state' => 'OK', 'reason' => 'default_ok', 'is_current_period' => false, 'is_past_period' => false, 'is_future_period' => false];
    }
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
    if (isset($kayit['surucu_id']) && (string)$kayit['surucu_id'] === (string)$user['id'] && in_array((string)$kayit['arac_id'], array_map('strval', $assignedVehicleIds), true)) {
        $records[] = $kayit;
    }
}

$currentDay = (int)date('j');
$recordsByVehicle = [];
foreach ($records as $record) {
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
    'vehicles' => $vehicles,
    'records' => $records,
    'current_period' => $currentPeriod
], JSON_UNESCAPED_UNICODE);
?>
