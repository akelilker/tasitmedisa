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

            // Çakışma (Conflict) kontrolü – gelen version sunucudakinden küçükse kaydetme
            foreach ($data['tasitlar'] as $v) {
                $id = $v['id'] ?? null;
                if ($id === null) continue;
                if (!isset($v['version'])) continue;
                $cur = $currentById[(string)$id] ?? null;
                if ($cur === null) continue;
                $curVer = isset($cur['version']) ? (int)$cur['version'] : 0;
                $inVer = (int)$v['version'];
                if ($inVer < $curVer) {
                    http_response_code(409);
                    echo json_encode(['conflict' => true], JSON_UNESCAPED_UNICODE);
                    exit;
                }
            }

            // Kaydetmeden önce version değerini 1 artır (yazılacak veriye uygula)
            foreach ($data['tasitlar'] as $i => $v) {
                $id = $v['id'] ?? null;
                if ($id === null) {
                    $data['tasitlar'][$i]['version'] = 1;
                    continue;
                }
                $cur = $currentById[(string)$id] ?? null;
                $data['tasitlar'][$i]['version'] = $cur !== null ? ((int)($cur['version'] ?? 0)) + 1 : 1;
            }
        }
    }
}

// Henüz version atanmamış taşıt kayıtlarına 1 ver (yeni dosya veya yeni kayıt)
if (!empty($data['tasitlar'])) {
    foreach ($data['tasitlar'] as $i => $v) {
        if (!array_key_exists('version', $data['tasitlar'][$i])) {
            $data['tasitlar'][$i]['version'] = 1;
        }
    }
}

// Çoklu kullanıcı çakışması önleme: Yazmadan hemen önce dosyayı tekrar oku.
// driver_save veya başka bir işlem arada yazmış olabilir; güncel driver/admin verilerini koru.
if (file_exists($dataFile)) {
    $latest = loadData();
    if ($latest && is_array($latest)) {
        if (isset($latest['arac_aylik_hareketler'])) {
            $data['arac_aylik_hareketler'] = $latest['arac_aylik_hareketler'];
        }
        if (isset($latest['duzeltme_talepleri'])) {
            $data['duzeltme_talepleri'] = $latest['duzeltme_talepleri'];
        }
        if (!empty($latest['tasitlar']) && !empty($data['tasitlar'])) {
            $latestById = [];
            foreach ($latest['tasitlar'] as $t) {
                $id = $t['id'] ?? null;
                if ($id !== null) {
                    $latestById[(string)$id] = $t;
                }
            }
            foreach ($data['tasitlar'] as $i => $v) {
                $id = $v['id'] ?? null;
                if ($id === null) continue;
                $cur = $latestById[(string)$id] ?? null;
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