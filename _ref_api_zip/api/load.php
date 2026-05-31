<?php
/**
 * load.php - Verileri yükle
 * MOBİL FIX - CORS Headers + Fallback Default Data + Error Handling
 * Sunucuya direkt yükle (Eski load.php yerine)
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

header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
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
// DEFAULT DATA (Eğer db.json yoksa bu döner)
// ============================================================================

$defaultData = [
    'data' => [
        'transactions' => [],
        'schedules' => [],
        'persons' => [],
        'vehicles' => [],
        'revisions' => [],
        'userCategories' => [
            'gelir' => [],
            'gider' => []
        ]
    ],
    'nextIds' => [
        'tx' => 1001,
        'schedule' => 101,
        'person' => 101,
        'vehicle' => 101,
        'revision' => 1001
    ]
];

// ============================================================================
// MAIN LOAD LOGIC
// ============================================================================

try {
    $dbFile = __DIR__ . '/db.json';
    
    // 1. DOSYA KONTROL ET
    if (!file_exists($dbFile)) {
        // Dosya yoksa default veri dön
        http_response_code(200);
        echo json_encode($defaultData, JSON_UNESCAPED_UNICODE);
        exit();
    }

    // 2. DOSYA OKU
    $fileContent = file_get_contents($dbFile);
    
    if ($fileContent === false) {
        http_response_code(200);
        echo json_encode($defaultData, JSON_UNESCAPED_UNICODE);
        exit();
    }

    // 3. JSON PARSE
    $data = json_decode($fileContent, true);
    
    if ($data === null) {
        // JSON hatası varsa default veri dön
        http_response_code(200);
        echo json_encode($defaultData, JSON_UNESCAPED_UNICODE);
        exit();
    }

    // 4. DATA YAPISI KONTROL VE FIX
    // (Eğer bazı alanlar eksikse, bunları ekle)
    if (!isset($data['data'])) {
        $data['data'] = $defaultData['data'];
    }
    if (!isset($data['nextIds'])) {
        $data['nextIds'] = $defaultData['nextIds'];
    }

    // Gerekli arrays var mı kontrol et
    $requiredKeys = ['transactions', 'schedules', 'persons', 'vehicles', 'revisions', 'userCategories'];
    foreach ($requiredKeys as $key) {
        if (!isset($data['data'][$key])) {
            $data['data'][$key] = $defaultData['data'][$key];
        }
    }

    // 5. BAŞARILI RESPONSE
    http_response_code(200);
    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    // Hata varsa default veri dön (böylece app çökmez)
    http_response_code(200);
    echo json_encode($defaultData, JSON_UNESCAPED_UNICODE);
}

?>