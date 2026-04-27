<?php
require_once __DIR__ . '/core.php';
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

echo json_encode([
    'success' => true,
    'updatedAt' => $payload['updatedAt'],
    'period' => $payload['period'],
], JSON_UNESCAPED_UNICODE);
