<?php
require_once __DIR__ . '/core.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$raw = json_decode((string)file_get_contents('php://input'), true);
$input = is_array($raw) ? $raw : $_POST;
$documentType = strtolower(trim((string)($input['documentType'] ?? '')));
if ($documentType !== 'k2') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Geçersiz belge tipi'], JSON_UNESCAPED_UNICODE);
    exit;
}

$branchId = trim((string)($input['branchId'] ?? ''));
$expiryDate = trim((string)($input['expiryDate'] ?? ''));
$branchIds = array_key_exists('branchIds', $input) && is_array($input['branchIds']) ? $input['branchIds'] : null;
$result = medisaMutateData(function (&$data) use ($branchId, $expiryDate, $branchIds) {
    $auth = medisaResolveAuthorizedContext($data, 'view_main_app');
    if (($auth['success'] ?? false) !== true) {
        return medisaBuildErrorResult($auth['message'] ?? 'Bu işlem için yetkiniz yok.', (int)($auth['status'] ?? 403));
    }
    if (($auth['context']['role'] ?? '') !== 'genel_yonetici' && $branchIds !== null) {
        return medisaBuildErrorResult('K2 grup üyeliğini değiştirme yetkiniz yok.', 403);
    }
    if ($expiryDate === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $expiryDate)) {
        return medisaBuildErrorResult('Geçerli bir K2 tarihi gerekli.', 400);
    }
    return medisaApplyK2BelgeGroupMutation($data, $auth['context'], $branchId, $expiryDate, $branchIds);
});

$status = (int)($result['status'] ?? 200);
if (($result['success'] ?? false) !== true) http_response_code($status);
unset($result['status']);
echo json_encode($result, JSON_UNESCAPED_UNICODE);
