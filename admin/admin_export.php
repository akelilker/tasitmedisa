<?php
require_once __DIR__ . '/../core.php';
header('Content-Type: text/csv; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Authorization');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

function titleCaseTr($str) {
    if ($str === null || $str === '') {
        return $str;
    }
    $words = preg_split('/\s+/u', trim($str), -1, PREG_SPLIT_NO_EMPTY);
    $result = [];
    foreach ($words as $w) {
        $first = mb_substr($w, 0, 1, 'UTF-8');
        $rest = mb_substr($w, 1, null, 'UTF-8');
        $result[] = mb_strtoupper($first, 'UTF-8') . mb_strtolower($rest, 'UTF-8');
    }
    return implode(' ', $result);
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
            return ['state' => 'OK'];
        }
        if (!$hasReliableHistory && !$hasBaseKm) {
            return ['state' => 'FIRST_ENTRY_REQUIRED'];
        }
        if ($hasKmForPeriod) {
            return ['state' => 'OK'];
        }
        if ($isPastPeriod) {
            if ($hasFutureKmRecord) {
                return ['state' => 'TELAFI_CLOSED'];
            }
            return ['state' => 'MONTHLY_UPDATE_DUE_HARD'];
        }
        if ($isCurrentPeriod) {
            if ((int)$dayOfMonth <= 2) {
                return ['state' => 'MONTHLY_UPDATE_DUE_SOFT'];
            }
            return ['state' => 'MONTHLY_UPDATE_DUE_HARD'];
        }

        return ['state' => 'OK'];
    }
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

$rawData = loadData();
if (!is_array($rawData)) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Veri okunamadı";
    exit;
}

$auth = medisaResolveAuthorizedContext($rawData, 'view_reports');
if (($auth['success'] ?? false) !== true) {
    http_response_code((int)($auth['status'] ?? 403));
    header('Content-Type: text/plain; charset=utf-8');
    echo $auth['message'] ?? 'Bu işlem için yetkiniz yok.';
    exit;
}

$data = medisaFilterReportDataForContext($rawData, $auth['context']);
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

header('Content-Disposition: attachment; filename="kullanici_raporu_' . date('Y-m-d') . '.csv"');
echo "\xEF\xBB\xBF";

$out = fopen('php://output', 'w');
fputcsv($out, ['Kullanıcı', 'Taşıt', 'Plaka', 'KM', 'Kayıt Tarihi'], ';');

foreach ($tasitlar as $t) {
    if (!empty($t['satildiMi'])) {
        continue;
    }

    $vehicleBranchId = trim((string)($t['branchId'] ?? ''));
    if ($branch !== '') {
        if ($branch === '__no_branch__') {
            if ($vehicleBranchId !== '') {
                continue;
            }
        } elseif ($vehicleBranchId !== $branch) {
            continue;
        }
    }

    $assignedUserId = trim((string)($t['assignedUserId'] ?? ''));
    $surucu = $assignedUserId !== '' ? ($usersById[$assignedUserId] ?? null) : null;
    $surucuAktif = is_array($surucu) && (!isset($surucu['aktif']) || $surucu['aktif'] === true);
    $isAssigned = $assignedUserId !== '' && $surucuAktif;

    $baseKmValue = $t['guncelKm'] ?? ($t['km'] ?? null);
    $km = $baseKmValue;
    $girdi = false;
    $bakimVar = false;
    $kazaVar = false;
    $currentPeriodRecordAny = null;

    if ($isAssigned) {
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
        $bakimVar = $currentPeriodRecordAny ? !empty($currentPeriodRecordAny['bakim_durumu']) : false;
        $kazaVar = $currentPeriodRecordAny ? !empty($currentPeriodRecordAny['kaza_durumu']) : false;

        $km = $currentPeriodRecordKm ? ($currentPeriodRecordKm['guncel_km'] ?? null) : null;
        if ($km === null) {
            $km = $latestKmByVehicleUser[$vehicleUserKey]['km'] ?? null;
        }
        if ($km === null) {
            $km = $baseKmValue;
        }
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

    $surucuAdi = $surucu ? ($surucu['isim'] ?? $surucu['name'] ?? 'Bilinmiyor') : 'Bilinmiyor';
    $aracText = trim((string)($t['marka'] ?? $t['brand'] ?? '') . ' ' . (string)($t['model'] ?? ''));
    if ($aracText === '') {
        $aracText = trim((string)($t['brandModel'] ?? ''));
    }
    $plaka = $t['plaka'] ?? $t['plate'] ?? 'Bilinmiyor';
    $kayitTarihiRaw = $currentPeriodRecordAny['kayit_tarihi'] ?? ($currentPeriodRecordAny['guncelleme_tarihi'] ?? '');
    $kayitTarihi = $kayitTarihiRaw ? date('Y-m-d H:i', strtotime((string)$kayitTarihiRaw)) : '';

    $surucuAdi = titleCaseTr($surucuAdi);
    $aracText = titleCaseTr($aracText !== '' ? $aracText : 'Bilinmiyor');
    $plaka = mb_strtoupper((string)$plaka, 'UTF-8');

    fputcsv($out, [$surucuAdi, $aracText, $plaka, $km, $kayitTarihi], ';');
}

fclose($out);
