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
$allowedStatus = ['', 'girdi', 'girmedi', 'kaza', 'bakim', 'atamasiz'];
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
    echo json_encode(['success' => false, 'message' => 'Veri okunamadı!'], JSON_UNESCAPED_UNICODE);
    exit;
}

$auth = medisaResolveAuthorizedContext($rawData, 'view_reports');
if (($auth['success'] ?? false) !== true) {
    http_response_code((int)($auth['status'] ?? 403));
    echo json_encode([
        'success' => false,
        'auth_required' => (int)($auth['status'] ?? 403) === 401,
        'permission_denied' => !empty($auth['permission_denied']),
        'message' => $auth['message'] ?? 'Bu işlem için yetkiniz yok.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$context = $auth['context'];
$data = medisaFilterReportDataForContext($rawData, $context);
$currentUser = $context['user'] ?? [];
$currentUserPayload = [
    'id' => $currentUser['id'] ?? '',
    'isim' => $currentUser['isim'] ?? $currentUser['name'] ?? '',
];

if ($action === 'branches') {
    echo json_encode([
        'success' => true,
        'branches' => $data['branches'] ?? [],
        'current_user' => $currentUserPayload,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'user_analytics') {
    echo json_encode([
        'success' => true,
        'users' => $data['users'] ?? [],
        'tasitlar' => $data['tasitlar'] ?? [],
        'monthly_records' => $data['arac_aylik_hareketler'] ?? [],
        'current_user' => $currentUserPayload,
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
        $aracId = $kayit ? (string)($kayit['arac_id'] ?? '') : (string)($talep['arac_id'] ?? '');
        $arac = $aracId !== '' ? ($tasitById[$aracId] ?? null) : null;

        $pendingRequests[] = [
            'id' => $talep['id'] ?? '',
            'talep_tipi' => $talep['talep_tipi'] ?? 'duzeltme',
            'kayit_id' => $talep['kayit_id'] ?? '',
            'arac_id' => $aracId,
            'surucu_id' => $talep['surucu_id'] ?? '',
            'surucu_adi' => $surucu ? ($surucu['isim'] ?? $surucu['name'] ?? 'Bilinmiyor') : 'Bilinmiyor',
            'plaka' => $arac ? ($arac['plaka'] ?? $arac['plate'] ?? 'Bilinmiyor') : 'Bilinmiyor',
            'donem' => $kayit['donem'] ?? '',
            'konu_turu' => $talep['konu_turu'] ?? '',
            'mesaj' => $talep['mesaj'] ?? '',
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
        'current_user' => $currentUserPayload,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$records = [];
$stats = [
    'total' => 0,
    'tracked_total' => 0,
    'entered' => 0,
    'pending' => 0,
    'unassigned' => 0,
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

$branchNamesById = [];
foreach (($data['branches'] ?? []) as $branchItem) {
    $branchId = trim((string)($branchItem['id'] ?? ''));
    if ($branchId === '') {
        continue;
    }
    $branchNamesById[$branchId] = $branchItem['name'] ?? $branchItem['code'] ?? $branchId;
}

$visibleVehicles = [];
$branchCardCounts = [];
$noBranchVehicleCount = 0;
foreach ($tasitlar as $t) {
    if (!empty($t['satildiMi'])) {
        continue;
    }

    $visibleVehicles[] = $t;
    $vehicleBranchId = trim((string)($t['branchId'] ?? ''));
    if ($vehicleBranchId === '') {
        $noBranchVehicleCount++;
        continue;
    }

    if (!isset($branchCardCounts[$vehicleBranchId])) {
        $branchCardCounts[$vehicleBranchId] = 0;
    }
    $branchCardCounts[$vehicleBranchId]++;
}

$branchCards = [[
    'id' => 'all',
    'name' => 'Tümü',
    'count' => count($visibleVehicles),
]];

foreach (($data['branches'] ?? []) as $branchItem) {
    $branchId = trim((string)($branchItem['id'] ?? ''));
    if ($branchId === '') {
        continue;
    }
    $branchCards[] = [
        'id' => $branchId,
        'name' => $branchItem['name'] ?? $branchItem['code'] ?? $branchId,
        'count' => (int)($branchCardCounts[$branchId] ?? 0),
    ];
}

if ($noBranchVehicleCount > 0) {
    $branchCards[] = [
        'id' => '__no_branch__',
        'name' => 'Şubesiz',
        'count' => $noBranchVehicleCount,
    ];
}

foreach ($visibleVehicles as $t) {
    $vehicleBranchId = trim((string)($t['branchId'] ?? ''));
    if ($branch !== '') {
        if ($branch === '__no_branch__') {
            if ($vehicleBranchId !== '') {
                continue;
            }
        } elseif ($vehicleBranchId !== (string)$branch) {
            continue;
        }
    }

    $stats['total']++;

    $assignedUserId = trim((string)($t['assignedUserId'] ?? ''));
    $surucu = $assignedUserId !== '' ? ($usersById[$assignedUserId] ?? null) : null;
    $surucuAktif = is_array($surucu) && (!isset($surucu['aktif']) || $surucu['aktif'] === true);
    $isAssigned = $assignedUserId !== '' && $surucuAktif;

    $baseKmValue = $t['guncelKm'] ?? ($t['km'] ?? null);
    $km = $baseKmValue;
    $girdi = false;
    $telafi = false;
    $bakimVar = false;
    $kazaVar = false;
    $currentPeriodRecordAny = null;
    $kmState = 'UNASSIGNED';
    $kmStateResult = [
        'reason' => 'vehicle_has_no_active_assignee',
        'is_current_period' => false,
        'is_past_period' => false,
        'is_future_period' => false,
    ];

    if ($isAssigned) {
        $stats['tracked_total']++;

        $aracId = (string)($t['id'] ?? '');
        $surucuId = (string)($surucu['id'] ?? '');
        $vehicleUserKey = $aracId . "\0" . $surucuId;
        $periodKey = $vehicleUserKey . "\0" . (string)$period;

        $currentPeriodRecordAny = $recordAnyByVehicleUserPeriod[$periodKey] ?? null;
        $currentPeriodRecordKm = $recordKmByVehicleUserPeriod[$periodKey] ?? null;
        $hasKmForPeriod = $currentPeriodRecordKm !== null;
        $kmPeriods = array_keys($kmPeriodsByVehicleUser[$vehicleUserKey] ?? []);
        $hasFutureKmRecord = medisaHasFutureKmPeriod($kmPeriods, (string)$period);
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

        $km = $currentPeriodRecordKm ? ($currentPeriodRecordKm['guncel_km'] ?? null) : null;
        if ($km === null) {
            $km = $latestKmByVehicleUser[$vehicleUserKey]['km'] ?? null;
        }
        if ($km === null) {
            $km = $baseKmValue;
        }
    } else {
        $stats['unassigned']++;
    }

    if ($status === 'girdi' && (!$isAssigned || !$girdi)) {
        continue;
    }
    if ($status === 'girmedi' && (!$isAssigned || $girdi)) {
        continue;
    }
    if ($status === 'kaza' && (!$isAssigned || !$kazaVar)) {
        continue;
    }
    if ($status === 'bakim' && (!$isAssigned || !$bakimVar)) {
        continue;
    }
    if ($status === 'atamasiz' && $isAssigned) {
        continue;
    }

    $brandModel = trim((string)($t['brandModel'] ?? ''));
    $aracMarka = $t['marka'] ?? $t['brand'] ?? '';
    $aracModel = $t['model'] ?? '';
    if (($aracMarka === '' && $aracModel === '') && $brandModel !== '') {
        $aracMarka = $brandModel;
    }

    $records[] = [
        'vehicle_id' => $t['id'] ?? '',
        'branch_id' => $vehicleBranchId,
        'branch_name' => $vehicleBranchId !== '' ? ($branchNamesById[$vehicleBranchId] ?? $vehicleBranchId) : 'Şubesiz',
        'surucu_id' => $surucu['id'] ?? '',
        'surucu_adi' => $surucu['isim'] ?? $surucu['name'] ?? '',
        'telefon' => $surucu['telefon'] ?? $surucu['phone'] ?? '',
        'email' => $surucu['eposta'] ?? $surucu['email'] ?? '',
        'plaka' => $t['plaka'] ?? $t['plate'] ?? '',
        'arac_marka' => $aracMarka,
        'arac_model' => $aracModel,
        'brand_model' => $brandModel,
        'km' => $km,
        'bakim_var' => $bakimVar,
        'kaza_var' => $kazaVar,
        'girdi' => $girdi,
        'telafi' => $telafi,
        'atama_var' => $isAssigned,
        'kayit_id' => $currentPeriodRecordAny['id'] ?? null,
        'donem' => $period,
        'km_state' => $kmState,
        'km_state_reason' => (string)($kmStateResult['reason'] ?? ''),
        'is_current_period' => (bool)($kmStateResult['is_current_period'] ?? false),
        'is_past_period' => (bool)($kmStateResult['is_past_period'] ?? false),
        'is_future_period' => (bool)($kmStateResult['is_future_period'] ?? false),
    ];
}

$trackedTotal = (int)($stats['tracked_total'] ?? 0);
if ($trackedTotal > 0) {
    $stats['percentage'] = round(($stats['entered'] / $trackedTotal) * 100);
}

echo json_encode([
    'success' => true,
    'stats' => $stats,
    'branch_cards' => $branchCards,
    'selected_branch' => $branch !== '' ? $branch : 'all',
    'selected_branch_label' => $branch === ''
        ? 'Tümü'
        : (($branch === '__no_branch__') ? 'Şubesiz' : ($branchNamesById[(string)$branch] ?? (string)$branch)),
    'records' => $records,
    'current_user' => $currentUserPayload,
], JSON_UNESCAPED_UNICODE);
