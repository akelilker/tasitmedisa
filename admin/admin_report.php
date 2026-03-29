<?php
require_once __DIR__ . '/../core.php';
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$period = $_GET['period'] ?? date('Y-m');
if (!preg_match('/^\d{4}-\d{2}$/', $period)) {
    $period = date('Y-m');
}
$branch = isset($_GET['branch']) ? trim((string)$_GET['branch']) : '';
$status = isset($_GET['status']) ? trim((string)$_GET['status']) : '';
$allowedStatus = ['', 'girdi', 'girmedi', 'kaza', 'bakim'];
if (!in_array($status, $allowedStatus, true)) {
    $status = '';
}
$action = $_GET['action'] ?? 'report';
if (!in_array($action, ['report', 'branches', 'user_analytics', 'pending_requests'], true)) {
    $action = 'report';
}

$rawData = loadData();
if (!is_array($rawData)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Veri okunamadi!'], JSON_UNESCAPED_UNICODE);
    exit;
}

$auth = medisaResolveAuthorizedContext($rawData, 'view_reports');
if (($auth['success'] ?? false) !== true) {
    http_response_code((int)($auth['status'] ?? 403));
    echo json_encode([
        'success' => false,
        'auth_required' => (int)($auth['status'] ?? 403) === 401,
        'permission_denied' => !empty($auth['permission_denied']),
        'message' => $auth['message'] ?? 'Bu islem icin yetkiniz yok.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$context = $auth['context'];
$data = medisaFilterReportDataForContext($rawData, $context);

if ($action === 'branches') {
    echo json_encode(['success' => true, 'branches' => $data['branches'] ?? []], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'user_analytics') {
    echo json_encode([
        'success' => true,
        'users' => $data['users'] ?? [],
        'tasitlar' => $data['tasitlar'] ?? [],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'pending_requests') {
    $pendingRequests = [];
    $usersById = [];
    foreach (($data['users'] ?? []) as $u) {
        $usersById[(string)($u['id'] ?? '')] = $u;
    }
    $kayitById = [];
    foreach (($data['arac_aylik_hareketler'] ?? []) as $k) {
        $kayitById[(string)($k['id'] ?? '')] = $k;
    }
    $tasitById = [];
    foreach (($data['tasitlar'] ?? []) as $t) {
        $tasitById[(string)($t['id'] ?? '')] = $t;
    }

    foreach (($data['duzeltme_talepleri'] ?? []) as $talep) {
        if (($talep['durum'] ?? '') !== 'beklemede') {
            continue;
        }

        $surucu = $usersById[(string)($talep['surucu_id'] ?? '')] ?? null;
        $kayit = $kayitById[(string)($talep['kayit_id'] ?? '')] ?? null;
        $arac = $kayit ? ($tasitById[(string)($kayit['arac_id'] ?? '')] ?? null) : null;

        $pendingRequests[] = [
            'id' => $talep['id'] ?? '',
            'kayit_id' => $talep['kayit_id'] ?? '',
            'surucu_id' => $talep['surucu_id'] ?? '',
            'surucu_adi' => $surucu ? ($surucu['isim'] ?? $surucu['name'] ?? 'Bilinmiyor') : 'Bilinmiyor',
            'plaka' => $arac ? ($arac['plaka'] ?? $arac['plate'] ?? 'Bilinmiyor') : 'Bilinmiyor',
            'donem' => $kayit['donem'] ?? '',
            'eski_km' => $talep['eski_km'] ?? null,
            'yeni_km' => $talep['yeni_km'] ?? null,
            'eski_bakim' => $talep['eski_bakim_aciklama'] ?? null,
            'yeni_bakim' => $talep['yeni_bakim_aciklama'] ?? null,
            'eski_kaza' => $talep['eski_kaza_aciklama'] ?? null,
            'yeni_kaza' => $talep['yeni_kaza_aciklama'] ?? null,
            'sebep' => $talep['sebep'] ?? '',
            'talep_tarihi' => $talep['talep_tarihi'] ?? '',
        ];
    }

    echo json_encode([
        'success' => true,
        'requests' => $pendingRequests,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!function_exists('medisaComparePeriod')) {
    function medisaComparePeriod($left, $right) {
        return strcmp((string)$left, (string)$right);
    }
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
        $isFuturePeriod = medisaComparePeriod($selectedPeriod, $currentPeriod) > 0;
        $isPastPeriod = medisaComparePeriod($selectedPeriod, $currentPeriod) < 0;
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

$records = [];
$stats = [
    'total' => 0,
    'entered' => 0,
    'pending' => 0,
    'percentage' => 0,
];

$tasitlar = $data['tasitlar'] ?? [];
$hareketler = $data['arac_aylik_hareketler'] ?? [];
$users = $data['users'] ?? [];

$usersById = [];
foreach ($users as $u) {
    $usersById[(string)($u['id'] ?? '')] = $u;
}

$recordAnyByVehicleUserPeriod = [];
$recordKmByVehicleUserPeriod = [];
$kmPeriodsByVehicleUser = [];
$latestKmByVehicleUser = [];
foreach ($hareketler as $k) {
    $aid = (string)($k['arac_id'] ?? '');
    $uid = (string)($k['surucu_id'] ?? '');
    $don = (string)($k['donem'] ?? '');
    if ($aid === '' || $uid === '' || $don === '') {
        continue;
    }

    $vehicleUserKey = $aid . "\0" . $uid;
    $periodKey = $vehicleUserKey . "\0" . $don;
    $tarih = $k['guncelleme_tarihi'] ?? $k['kayit_tarihi'] ?? '';

    $currentAny = $recordAnyByVehicleUserPeriod[$periodKey] ?? null;
    $currentAnyDate = $currentAny['guncelleme_tarihi'] ?? $currentAny['kayit_tarihi'] ?? '';
    if ($currentAny === null || strcmp((string)$tarih, (string)$currentAnyDate) > 0) {
        $recordAnyByVehicleUserPeriod[$periodKey] = $k;
    }

    if (medisaHasKmValue($k)) {
        $currentKm = $recordKmByVehicleUserPeriod[$periodKey] ?? null;
        $currentKmDate = $currentKm['guncelleme_tarihi'] ?? $currentKm['kayit_tarihi'] ?? '';
        if ($currentKm === null || strcmp((string)$tarih, (string)$currentKmDate) > 0) {
            $recordKmByVehicleUserPeriod[$periodKey] = $k;
        }

        if (!isset($kmPeriodsByVehicleUser[$vehicleUserKey])) {
            $kmPeriodsByVehicleUser[$vehicleUserKey] = [];
        }
        $kmPeriodsByVehicleUser[$vehicleUserKey][$don] = true;

        $currentLatestKm = $latestKmByVehicleUser[$vehicleUserKey] ?? null;
        if ($currentLatestKm === null || strcmp($don, (string)($currentLatestKm['donem'] ?? '')) > 0) {
            $latestKmByVehicleUser[$vehicleUserKey] = ['donem' => $don, 'km' => $k['guncel_km']];
        }
    }
}

$atanmisTasitlar = [];
foreach ($tasitlar as $t) {
    $assignedUserId = (string)($t['assignedUserId'] ?? '');
    if ($assignedUserId === '') {
        continue;
    }

    $surucu = $usersById[$assignedUserId] ?? null;
    if (!is_array($surucu)) {
        continue;
    }

    $aktif = !isset($surucu['aktif']) || $surucu['aktif'] === true;
    if (!$aktif) {
        continue;
    }

    if ($branch !== '') {
        $subeId = $surucu['sube_id'] ?? $surucu['branchId'] ?? null;
        if ($subeId !== null && (string)$subeId !== (string)$branch) {
            continue;
        }
    }

    $atanmisTasitlar[] = [
        'tasit' => $t,
        'surucu' => $surucu,
    ];
}

$stats['total'] = count($atanmisTasitlar);

foreach ($atanmisTasitlar as $item) {
    $t = $item['tasit'];
    $surucu = $item['surucu'];

    $aracId = (string)($t['id'] ?? '');
    $surucuId = (string)($surucu['id'] ?? '');
    $vehicleUserKey = $aracId . "\0" . $surucuId;
    $periodKey = $vehicleUserKey . "\0" . (string)$period;

    $currentPeriodRecordAny = $recordAnyByVehicleUserPeriod[$periodKey] ?? null;
    $currentPeriodRecordKm = $recordKmByVehicleUserPeriod[$periodKey] ?? null;
    $hasKmForPeriod = $currentPeriodRecordKm !== null;
    $kmPeriods = array_keys($kmPeriodsByVehicleUser[$vehicleUserKey] ?? []);
    $hasFutureKmRecord = medisaHasFutureKmPeriod($kmPeriods, (string)$period);

    $baseKmValue = $t['guncelKm'] ?? ($t['km'] ?? null);
    $hasBaseKm = $baseKmValue !== null && trim((string)$baseKmValue) !== '';
    $hasReliableHistory = count($kmPeriods) > 0;

    $kmStateResult = medisaComputeKmState(
        (string)$period,
        date('Y-m'),
        (int)date('j'),
        $hasKmForPeriod,
        $hasFutureKmRecord,
        $hasReliableHistory,
        $hasBaseKm
    );
    $kmState = (string)($kmStateResult['state'] ?? 'OK');
    $girdi = in_array($kmState, ['OK', 'TELAFI_CLOSED'], true);
    $telafi = $kmState === 'TELAFI_CLOSED';

    $bakimVar = $currentPeriodRecordAny ? !empty($currentPeriodRecordAny['bakim_durumu']) : false;
    $kazaVar = $currentPeriodRecordAny ? !empty($currentPeriodRecordAny['kaza_durumu']) : false;

    if ($girdi) {
        $stats['entered']++;
    } else {
        $stats['pending']++;
    }

    if ($status === 'girdi' && !$girdi) {
        continue;
    }
    if ($status === 'girmedi' && $girdi) {
        continue;
    }
    if ($status === 'kaza' && !$kazaVar) {
        continue;
    }
    if ($status === 'bakim' && !$bakimVar) {
        continue;
    }

    $aracMarka = $t['marka'] ?? $t['brand'] ?? '';
    $aracModel = $t['model'] ?? '';
    if ($aracMarka === '' && $aracModel === '' && !empty($t['brandModel'])) {
        $aracMarka = trim((string)$t['brandModel']);
    }

    $km = $currentPeriodRecordKm ? ($currentPeriodRecordKm['guncel_km'] ?? null) : null;
    if ($km === null) {
        $km = $latestKmByVehicleUser[$vehicleUserKey]['km'] ?? null;
    }

    $records[] = [
        'surucu_id' => $surucu['id'] ?? '',
        'surucu_adi' => $surucu['isim'] ?? $surucu['name'] ?? '',
        'telefon' => $surucu['telefon'] ?? $surucu['phone'] ?? '',
        'plaka' => $t['plaka'] ?? $t['plate'] ?? '',
        'arac_marka' => $aracMarka,
        'arac_model' => $aracModel,
        'km' => $km,
        'bakim_var' => $bakimVar,
        'kaza_var' => $kazaVar,
        'girdi' => $girdi,
        'telafi' => $telafi,
        'kayit_id' => $currentPeriodRecordAny['id'] ?? null,
        'donem' => $period,
        'km_state' => $kmState,
        'km_state_reason' => (string)($kmStateResult['reason'] ?? ''),
        'is_current_period' => (bool)($kmStateResult['is_current_period'] ?? false),
        'is_past_period' => (bool)($kmStateResult['is_past_period'] ?? false),
        'is_future_period' => (bool)($kmStateResult['is_future_period'] ?? false),
    ];
}

$toplamBeklenenIs = (int)($stats['total'] ?? 0);
if ($toplamBeklenenIs > 0) {
    $stats['percentage'] = round(($stats['entered'] / $toplamBeklenenIs) * 100);
}

echo json_encode([
    'success' => true,
    'stats' => $stats,
    'records' => $records,
], JSON_UNESCAPED_UNICODE);
