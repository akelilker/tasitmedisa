<?php
require_once __DIR__ . '/core.php';
require_once __DIR__ . '/kasko-index.php';
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

$tokenData = validateToken();
if (!$tokenData) {
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'auth_required' => true,
        'message' => 'Oturum gerekli.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$data = loadData();
if (!$data) {
    $data = medisaDefaultData();
}

$sessionResolution = medisaResolveSessionContext($data, $tokenData);
if (($sessionResolution['success'] ?? false) !== true) {
    $status = (int)($sessionResolution['status'] ?? 403);
    unset($sessionResolution['status']);
    http_response_code($status);
    echo json_encode($sessionResolution, JSON_UNESCAPED_UNICODE);
    exit;
}
$context = $sessionResolution['context'];

$mode = isset($_GET['mode']) ? trim((string)$_GET['mode']) : 'legacy';
if ($mode === '') {
    $mode = 'legacy';
}

$emptyLegacy = [
    'updatedAt' => '',
    'period' => '',
    'sourceFileName' => '',
    'rows' => [],
];

if ($mode === 'legacy') {
    $path = getKaskoListesiFilePath();
    if (!file_exists($path)) {
        echo json_encode($emptyLegacy, JSON_UNESCAPED_UNICODE);
        exit;
    }

    $content = file_get_contents($path);
    if ($content === false || trim($content) === '') {
        echo json_encode($emptyLegacy, JSON_UNESCAPED_UNICODE);
        exit;
    }

    $decoded = json_decode($content, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Kasko listesi dosyası geçersiz JSON.',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $out = [
        'updatedAt' => (string)($decoded['updatedAt'] ?? ''),
        'period' => (string)($decoded['period'] ?? ''),
        'sourceFileName' => (string)($decoded['sourceFileName'] ?? ''),
        'rows' => is_array($decoded['rows'] ?? null) ? array_values($decoded['rows']) : [],
    ];

    echo json_encode($out, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($mode === 'meta' || $mode === 'index') {
    $packed = medisaBuildOrLoadKaskoPackedIndex(false);
    if ($packed === false || !medisaValidateKaskoPackedIndex($packed)) {
        http_response_code(503);
        echo json_encode([
            'success' => false,
            'message' => 'Kasko compact index üretilemedi.',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($mode === 'meta') {
        echo json_encode(medisaKaskoPackedMetaFromIndex($packed), JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode($packed, JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(400);
echo json_encode([
    'success' => false,
    'message' => 'Geçersiz mode. Desteklenen: legacy, index, meta.',
], JSON_UNESCAPED_UNICODE);
