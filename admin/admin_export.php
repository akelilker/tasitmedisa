<?php
/**
 * Aylık kullanıcı raporu CSV (Excel uyumlu) export.
 * GET period (varsayılan: bu ay). UTF-8 BOM, başlık: Kullanıcı, Taşıt, Plaka, KM, Kayıt Tarihi.
 */
require_once __DIR__ . '/../core.php';
header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="kullanici_raporu_' . date('Y-m-d') . '.csv"');
header('Access-Control-Allow-Origin: *');

function titleCaseTr($str) {
    if ($str === null || $str === '') return $str;
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
$data = loadData();
if (!$data) {
    http_response_code(500);
    echo "\xEF\xBB\xBF";
    echo "Hata;Veri okunamadı\n";
    exit;
}

$users = $data['users'] ?? [];
$tasitlar = $data['tasitlar'] ?? [];
$hareketler = $data['arac_aylik_hareketler'] ?? [];

$userById = [];
foreach ($users as $u) {
    $userById[$u['id']] = $u;
}
$tasitById = [];
foreach ($tasitlar as $t) {
    $tasitById[$t['id']] = $t;
}

// BOM (Türkçe karakter için)
echo "\xEF\xBB\xBF";

$out = fopen('php://output', 'w');
fputcsv($out, ['Kullanıcı', 'Taşıt', 'Plaka', 'KM', 'Kayıt Tarihi'], ';');

foreach ($hareketler as $k) {
    if (($k['donem'] ?? '') !== $period) {
        continue;
    }
    $surucu = $userById[$k['surucu_id']] ?? null;
    $arac = $tasitById[$k['arac_id']] ?? null;
    $surucuAdi = $surucu ? ($surucu['isim'] ?? $surucu['name'] ?? 'Bilinmiyor') : 'Bilinmiyor';
    $aracText = $arac ? trim(($arac['marka'] ?? $arac['brand'] ?? '') . ' ' . ($arac['model'] ?? '')) : 'Bilinmiyor';
    $plaka = $arac ? ($arac['plaka'] ?? $arac['plate'] ?? 'Bilinmiyor') : 'Bilinmiyor';
    $km = $k['guncel_km'] ?? '';
    $kayitTarihi = isset($k['kayit_tarihi']) ? date('Y-m-d H:i', strtotime($k['kayit_tarihi'])) : '';

    $surucuAdi = titleCaseTr($surucuAdi);
    $aracText = titleCaseTr($aracText);
    $plaka = mb_strtoupper($plaka, 'UTF-8');

    fputcsv($out, [$surucuAdi, $aracText, $plaka, $km, $kayitTarihi], ';');
}

fclose($out);
?>
