<?php
require_once __DIR__ . '/core.php';
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

$dataFile = getDataFilePath();

// Dosya yoksa boş veri yapısı döndür
if (!file_exists($dataFile)) {
    echo json_encode([
        'tasitlar' => [],
        'kayitlar' => [],
        'branches' => [],
        'users' => [],
        'ayarlar' => [
            'sirketAdi' => 'Medisa',
            'yetkiliKisi' => '',
            'telefon' => '',
            'eposta' => ''
        ],
        'sifreler' => [],
        'arac_aylik_hareketler' => [],
        'duzeltme_talepleri' => []
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// Dosyayı oku
$content = file_get_contents($dataFile);

// Dosya okunamazsa hata döndür
if ($content === false) {
    error_log('[Medisa load.php] Veri dosyası okunamadı: ' . $dataFile);
    http_response_code(500);
    echo json_encode([
        'error' => 'Dosya okuma izni hatası (CHMOD 644 veya 755 yapın).'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// BOM TEMİZLİĞİ: Windows veya bazı editörlerin eklediği görünmez karakterleri sil
$content = preg_replace('/^[\xef\xbb\xbf]+/', '', $content);

// JSON geçerliliğini kontrol et
$data = json_decode($content, true);
if ($data === null && json_last_error() !== JSON_ERROR_NONE) {
    $errMsg = json_last_error_msg();
    error_log('[Medisa load.php] Bozuk JSON: ' . $errMsg);
    http_response_code(500);
    echo json_encode([
        'error' => 'JSON Format Hatası: ' . $errMsg
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// Veriyi döndür
echo $content;
?>
