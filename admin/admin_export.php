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

$period = $_GET['period'] ?? date('Y-m');
if (!preg_match('/^\d{4}-\d{2}$/', $period)) {
    $period = date('Y-m');
}

$rawData = loadData();
if (!is_array($rawData)) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Veri okunamadi";
    exit;
}

$auth = medisaResolveAuthorizedContext($rawData, 'view_reports');
if (($auth['success'] ?? false) !== true) {
    http_response_code((int)($auth['status'] ?? 403));
    header('Content-Type: text/plain; charset=utf-8');
    echo $auth['message'] ?? 'Bu islem icin yetkiniz yok.';
    exit;
}

$data = medisaFilterReportDataForContext($rawData, $auth['context']);
$users = $data['users'] ?? [];
$tasitlar = $data['tasitlar'] ?? [];
$hareketler = $data['arac_aylik_hareketler'] ?? [];

$userById = [];
foreach ($users as $u) {
    $userById[(string)($u['id'] ?? '')] = $u;
}

$tasitById = [];
foreach ($tasitlar as $t) {
    if (!empty($t['satildiMi'])) {
        continue;
    }
    $tasitById[(string)($t['id'] ?? '')] = $t;
}

header('Content-Disposition: attachment; filename="kullanici_raporu_' . date('Y-m-d') . '.csv"');
echo "\xEF\xBB\xBF";

$out = fopen('php://output', 'w');
fputcsv($out, ['Kullanici', 'Tasit', 'Plaka', 'KM', 'Kayit Tarihi'], ';');

foreach ($hareketler as $k) {
    if (($k['donem'] ?? '') !== $period) {
        continue;
    }

    $surucu = $userById[(string)($k['surucu_id'] ?? '')] ?? null;
    $arac = $tasitById[(string)($k['arac_id'] ?? '')] ?? null;
    if (!$arac) {
        continue;
    }
    $surucuAdi = $surucu ? ($surucu['isim'] ?? $surucu['name'] ?? 'Bilinmiyor') : 'Bilinmiyor';
    $aracText = $arac ? trim((string)($arac['marka'] ?? $arac['brand'] ?? '') . ' ' . (string)($arac['model'] ?? '')) : 'Bilinmiyor';
    $plaka = $arac ? ($arac['plaka'] ?? $arac['plate'] ?? 'Bilinmiyor') : 'Bilinmiyor';
    $km = $k['guncel_km'] ?? '';
    $kayitTarihi = isset($k['kayit_tarihi']) ? date('Y-m-d H:i', strtotime((string)$k['kayit_tarihi'])) : '';

    $surucuAdi = titleCaseTr($surucuAdi);
    $aracText = titleCaseTr($aracText);
    $plaka = mb_strtoupper((string)$plaka, 'UTF-8');

    fputcsv($out, [$surucuAdi, $aracText, $plaka, $km, $kayitTarihi], ';');
}

fclose($out);
