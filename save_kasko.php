<?php
require_once __DIR__ . '/core.php';
require_once __DIR__ . '/kasko-index.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method Not Allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$input = file_get_contents('php://input');
if (empty($input)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Boş veri'], JSON_UNESCAPED_UNICODE);
    exit;
}

$incoming = json_decode($input, true);
if (json_last_error() !== JSON_ERROR_NONE || !is_array($incoming)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Geçersiz JSON'], JSON_UNESCAPED_UNICODE);
    exit;
}

$data = loadData();
if (!$data) {
    $data = medisaDefaultData();
}

$auth = medisaResolveAuthorizedContext($data, 'manage_data');
if (($auth['success'] ?? false) !== true) {
    $status = (int)($auth['status'] ?? 403);
    http_response_code($status);
    echo json_encode([
        'success' => false,
        'message' => $auth['message'] ?? 'Bu işlem için yetkiniz yok.',
        'auth_required' => $status === 401,
        'permission_denied' => !empty($auth['permission_denied']),
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!isset($incoming['rows']) || !is_array($incoming['rows'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'rows alanı dizi olmalıdır.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$updatedAt = trim((string)($incoming['updatedAt'] ?? ''));
if ($updatedAt === '') {
    $updatedAt = gmdate('c');
}

$payload = [
    'updatedAt' => $updatedAt,
    'period' => (string)($incoming['period'] ?? ''),
    'sourceFileName' => (string)($incoming['sourceFileName'] ?? ''),
    'rows' => array_values($incoming['rows']),
];

try {
    $indexPreview = medisaBuildKaskoLookupIndex($payload, [
        'sourceSize' => 0,
        'sourceMtime' => 0,
    ]);
} catch (Throwable $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Kasko satırları indekslenemedi.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
if ($json === false) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Liste kodlanamadı.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$path = getKaskoListesiFilePath();
if (file_exists($path)) {
    $bak = $path . '.backup';
    @copy($path, $bak);
}

if (!medisaAtomicWriteFile($path, $json)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Dosya yazılamadı.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$sourceSize = @filesize($path);
$sourceMtime = @filemtime($path);
$indexReady = false;
$rowCount = (int)($indexPreview['rowCount'] ?? 0);

try {
    $index = medisaBuildKaskoLookupIndex($payload, [
        'sourceSize' => (int)($sourceSize !== false ? $sourceSize : 0),
        'sourceMtime' => (int)($sourceMtime !== false ? $sourceMtime : 0),
    ]);
    $rowCount = (int)($index['rowCount'] ?? 0);
    $indexReady = medisaWriteKaskoLookupIndex($index) === true;
} catch (Throwable $e) {
    $indexReady = false;
    error_log('[Medisa] save_kasko index yazimi basarisiz');
}

echo json_encode([
    'success' => true,
    'updatedAt' => $payload['updatedAt'],
    'period' => $payload['period'],
    'indexReady' => $indexReady,
    'rowCount' => $rowCount,
    'schemaVersion' => MEDISA_KASKO_LOOKUP_SCHEMA_VERSION,
], JSON_UNESCAPED_UNICODE);
