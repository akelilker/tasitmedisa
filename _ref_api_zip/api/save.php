<?php
/**
 * save.php - Verileri kaydet
 * MOBİL FIX - Retry Friendly + CORS Headers + Error Logging
 * Sunucuya direkt yükle (Eski save.php yerine)
 */

// ============================================================================
// CORS HEADERS - BAŞA YAPIŞMIŞ
// ============================================================================

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed_origins = [
    'https://karmotors.com.tr',
    'https://www.karmotors.com.tr',
    'http://localhost',
    'http://127.0.0.1',
    'http://localhost:3000',
    'http://localhost:8000',
    'http://localhost:8080'
];

if (in_array($origin, $allowed_origins)) {
    header("Access-Control-Allow-Origin: $origin");
} else {
    header("Access-Control-Allow-Origin: https://karmotors.com.tr");
}

header("Access-Control-Allow-Methods: POST, OPTIONS, GET");
header("Access-Control-Allow-Headers: Content-Type, X-Save-Attempt");
header("Content-Type: application/json; charset=utf-8");

// ============================================================================
// OPTIONS REQUEST (PREFLIGHT) HANDLE
// ============================================================================

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// ============================================================================
// DEBUGGING (OPSIYONEL - Sorun varsa dosya oluşturur)
// ============================================================================

$debugMode = false; // true yapınca /api/save_debug.log dosyasına yazıyor
$logFile = __DIR__ . '/save_debug.log';

function debug_log($message) {
    global $debugMode, $logFile;
    if ($debugMode) {
        $timestamp = date('Y-m-d H:i:s');
        file_put_contents($logFile, "[$timestamp] $message\n", FILE_APPEND);
    }
}

// ============================================================================
// MAIN SAVE LOGIC
// ============================================================================

try {
    debug_log("=== SAVE REQUEST BAŞLADI ===");
    debug_log("Method: " . $_SERVER['REQUEST_METHOD']);
    debug_log("Origin: " . ($_SERVER['HTTP_ORIGIN'] ?? 'N/A'));
    debug_log("Attempt: " . ($_SERVER['HTTP_X_SAVE_ATTEMPT'] ?? 'N/A'));

    // 1. REQUEST BODY OKU
    $input = file_get_contents('php://input');
    $inputSize = strlen($input);
    
    if (empty($input)) {
        http_response_code(400);
        echo json_encode(['error' => 'Boş istek']);
        debug_log("HATA: Boş istek");
        exit();
    }

    debug_log("Input boyutu: " . number_format($inputSize) . " bytes");

    // 2. JSON PARSE
    $data = json_decode($input, true);
    
    if ($data === null) {
        http_response_code(400);
        $errorMsg = 'JSON parse hatası: ' . json_last_error_msg();
        echo json_encode(['error' => $errorMsg]);
        debug_log("HATA: " . $errorMsg);
        exit();
    }

    debug_log("JSON parse OK");

    // 3. DATA STRUCTURE CHECK
    if (!isset($data['data']) || !isset($data['nextIds'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Geçersiz veri yapısı: data veya nextIds eksik']);
        debug_log("HATA: Veri yapısı eksik");
        exit();
    }

    debug_log("Veri yapısı OK");
    debug_log("Transactions: " . count($data['data']['transactions'] ?? []));
    debug_log("Vehicles: " . count($data['data']['vehicles'] ?? []));
    debug_log("Persons: " . count($data['data']['persons'] ?? []));

    // 4. DB DOSYASI PATH
    $dbFile = __DIR__ . '/db.json';
    $dir = dirname($dbFile);
    
    debug_log("DB dosyası: $dbFile");

    // 5. KLASÖRü VE İZİNLERİ KONTROL ET
    if (!is_dir($dir)) {
        if (!mkdir($dir, 0755, true)) {
            http_response_code(500);
            echo json_encode(['error' => 'Klasör oluşturulamadı']);
            debug_log("HATA: Klasör oluşturulamadı");
            exit();
        }
        debug_log("Klasör oluşturuldu");
    }
    
    if (!is_writable($dir)) {
        http_response_code(500);
        echo json_encode(['error' => 'Klasöre yazma izni yok']);
        debug_log("HATA: Yazma izni yok ($dir)");
        exit();
    }

    debug_log("Klasör yazılabilir");

    // 6. DOSYAYA YAZMA
    $jsonString = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    $result = file_put_contents($dbFile, $jsonString);
    
    if ($result === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Dosya yazma başarısız']);
        debug_log("HATA: file_put_contents başarısız");
        exit();
    }

    debug_log("Dosya yazıldı: " . number_format($result) . " bytes");

    // 7. BAŞARILI RESPONSE
    http_response_code(200);
    echo json_encode([
        'success' => true,
        'message' => 'Veriler kaydedildi',
        'bytes' => $result,
        'timestamp' => date('Y-m-d H:i:s')
    ]);

    debug_log("✓ Başarılı - Response 200");
    debug_log("=== SAVE REQUEST TAMAMLANDI ===\n");

} catch (Exception $e) {
    http_response_code(500);
    $errorMsg = $e->getMessage();
    echo json_encode(['error' => $errorMsg]);
    debug_log("EXCEPTION: " . $errorMsg);
    debug_log("=== SAVE REQUEST HATA İLE TAMAMLANDI ===\n");
}

?>