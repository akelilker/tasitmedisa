<?php
require_once __DIR__ . '/core.php';
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

$context = medisaBuildAccessContext($data, $tokenData);
if (!$context) {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'message' => 'Kullanıcı bulunamadı veya yetki çözümlenemedi.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$path = getKaskoListesiFilePath();
$empty = [
    'updatedAt' => '',
    'period' => '',
    'sourceFileName' => '',
    'rows' => [],
];

if (!file_exists($path)) {
    echo json_encode($empty, JSON_UNESCAPED_UNICODE);
    exit;
}

$content = file_get_contents($path);
if ($content === false || trim($content) === '') {
    echo json_encode($empty, JSON_UNESCAPED_UNICODE);
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
