<?php
require_once __DIR__ . '/core.php';
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

// Sadece POST kabul et
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    exit;
}

$dataDir = dirname(getDataFilePath());
$dataFile = getDataFilePath();

// data klasörü yoksa oluştur
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
}

// POST verisini al
$input = file_get_contents('php://input');
if (empty($input)) {
    http_response_code(400);
    echo json_encode(['error' => 'Boş veri']);
    exit;
}

// JSON geçerliliğini kontrol et
$data = json_decode($input, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['error' => 'Geçersiz JSON']);
    exit;
}

// Mevcut dosyadaki driver/admin verilerini koru (ana uygulama kaydı bunları silmesin)
if (file_exists($dataFile)) {
    $current = loadData();
    if ($current && is_array($current)) {
        if (isset($current['arac_aylik_hareketler'])) {
            $data['arac_aylik_hareketler'] = $current['arac_aylik_hareketler'];
        }
        if (isset($current['duzeltme_talepleri'])) {
            $data['duzeltme_talepleri'] = $current['duzeltme_talepleri'];
        }
        // tasitlar içindeki guncelKm güncellemelerini koru (driver_save senkronize ediyor)
        if (!empty($current['tasitlar']) && !empty($data['tasitlar'])) {
            $currentById = [];
            foreach ($current['tasitlar'] as $t) {
                $id = $t['id'] ?? null;
                if ($id !== null) {
                    $currentById[(string)$id] = $t;
                }
            }
            foreach ($data['tasitlar'] as $i => $v) {
                $id = $v['id'] ?? null;
                if ($id === null) {
                    continue;
                }
                $cur = $currentById[(string)$id] ?? null;
                if ($cur && isset($cur['guncelKm'])) {
                    $data['tasitlar'][$i]['guncelKm'] = $cur['guncelKm'];
                }
            }
        }
    }
}

// Yedek oluştur (önceki veriyi .backup olarak kaydet)
if (file_exists($dataFile)) {
    $backupFile = $dataDir . '/data.json.backup';
    copy($dataFile, $backupFile);
}

// Merge edilmiş veriyi kaydet
$output = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
$result = file_put_contents($dataFile, $output, LOCK_EX);
if ($result === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Veri kaydedilemedi']);
    exit;
}

echo json_encode(['success' => true, 'message' => 'Veri kaydedildi']);
?>