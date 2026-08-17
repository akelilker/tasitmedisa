<?php
require_once __DIR__ . '/core.php';
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'message' => 'Method Not Allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$sessionData = validateToken();
if (!$sessionData) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'message' => 'Oturum gerekli.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$data = loadData();
if (!is_array($data)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'message' => 'Veri okunamadı'], JSON_UNESCAPED_UNICODE);
    exit;
}

$sessionResolution = medisaResolveSessionContext($data, $sessionData);
if (($sessionResolution['success'] ?? false) !== true) {
    $status = (int)($sessionResolution['status'] ?? 403);
    http_response_code($status);
    echo json_encode([
        'ok' => false,
        'code' => $sessionResolution['code'] ?? null,
        'password_change_required' => $sessionResolution['password_change_required'] ?? false,
        'message' => $sessionResolution['message'] ?? 'Bu belge için yetkiniz yok.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
$context = $sessionResolution['context'];

$input = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = $_POST;
}
if (!is_array($input)) {
    $input = [];
}

$vehicleId = trim((string)($input['vehicleId'] ?? $input['id'] ?? ''));
$branchId = trim((string)($input['branchId'] ?? ''));
$documentType = strtolower(trim((string)($input['documentType'] ?? 'ruhsat')));
if ($documentType === '') {
    $documentType = 'ruhsat';
}

$result = medisaMintDocumentAccessToken($data, $context, $vehicleId, $documentType, $branchId);
if (($result['success'] ?? false) !== true) {
    $status = (int)($result['status'] ?? 400);
    http_response_code($status);
    echo json_encode([
        'ok' => false,
        'message' => $result['message'] ?? 'Belge erişim anahtarı oluşturulamadı.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode([
    'ok' => true,
    'token' => $result['token'],
    'expiresAt' => (int)$result['expiresAt'],
], JSON_UNESCAPED_UNICODE);
