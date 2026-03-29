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

$kayitByAracDonem = [];
foreach ($hareketler as $k) {
    $aid = (string)($k['arac_id'] ?? '');
    $don = (string)($k['donem'] ?? '');
    if ($aid === '' || $don === '') {
        continue;
    }

    $key = $aid . "\0" . $don;
    $tarih = $k['guncelleme_tarihi'] ?? $k['kayit_tarihi'] ?? '';
    $currentRecord = $kayitByAracDonem[$key] ?? null;
    $currentDate = $currentRecord['guncelleme_tarihi'] ?? $currentRecord['kayit_tarihi'] ?? '';
    if ($currentRecord === null || strcmp((string)$tarih, (string)$currentDate) > 0) {
        $kayitByAracDonem[$key] = $k;
    }
}

$aracIdToLatestDonem = [];
foreach ($hareketler as $k) {
    $aid = (string)($k['arac_id'] ?? '');
    $d = (string)($k['donem'] ?? '');
    if ($aid === '' || $d === '') {
        continue;
    }
    $currentLatestDonem = (string)($aracIdToLatestDonem[$aid] ?? '');
    if ($currentLatestDonem === '' || strcmp($d, $currentLatestDonem) > 0) {
        $aracIdToLatestDonem[$aid] = $d;
    }
}

$aracIdToLatestKm = [];
foreach ($hareketler as $k) {
    if (!isset($k['guncel_km'])) {
        continue;
    }
    $aid = (string)($k['arac_id'] ?? '');
    $d = (string)($k['donem'] ?? '');
    $current = $aracIdToLatestKm[$aid] ?? null;
    if ($current === null || strcmp($d, (string)($current['donem'] ?? '')) > 0) {
        $aracIdToLatestKm[$aid] = ['donem' => $d, 'km' => $k['guncel_km']];
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
    $key = $aracId . "\0" . (string)$period;
    $currentPeriodRecord = $kayitByAracDonem[$key] ?? null;
    $latestRecordDonem = (string)($aracIdToLatestDonem[$aracId] ?? '');
    $hasFutureRecord = $latestRecordDonem !== '' && strcmp($latestRecordDonem, (string)$period) > 0;

    if ($currentPeriodRecord !== null) {
        $girdi = true;
        $telafi = false;
    } elseif ($hasFutureRecord) {
        $girdi = true;
        $telafi = true;
    } else {
        $girdi = false;
        $telafi = false;
    }

    $bakimVar = $currentPeriodRecord ? !empty($currentPeriodRecord['bakim_durumu']) : false;
    $kazaVar = $currentPeriodRecord ? !empty($currentPeriodRecord['kaza_durumu']) : false;

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

    $km = $currentPeriodRecord ? ($currentPeriodRecord['guncel_km'] ?? null) : null;
    if ($km === null) {
        $km = $aracIdToLatestKm[$aracId]['km'] ?? null;
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
        'kayit_id' => $currentPeriodRecord['id'] ?? null,
        'donem' => $period,
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
