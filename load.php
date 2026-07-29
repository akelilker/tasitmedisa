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

$sessionOnly = isset($_GET['session']) && (string)$_GET['session'] === '1';
$sessionResolution = medisaResolveSessionContext($data, $tokenData, $sessionOnly);
if (($sessionResolution['success'] ?? false) !== true) {
    $status = (int)($sessionResolution['status'] ?? 403);
    unset($sessionResolution['status']);
    http_response_code($status);
    echo json_encode($sessionResolution, JSON_UNESCAPED_UNICODE);
    exit;
}
$context = $sessionResolution['context'];

if ($sessionOnly) {
    echo json_encode([
        'success' => true,
        'session' => medisaBuildSessionPayload($context),
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$filtered = medisaFilterDataForContext($data, $context);
echo json_encode($filtered, JSON_UNESCAPED_UNICODE);
?>
