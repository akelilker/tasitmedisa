<?php
require_once __DIR__ . '/../core.php';

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
    echo json_encode(['success' => false, 'message' => 'Sadece POST istekleri kabul edilir.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$tokenData = validateToken();
if (!$tokenData) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Oturumunuz sona erdi!'], JSON_UNESCAPED_UNICODE);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Geçersiz istek verisi!'], JSON_UNESCAPED_UNICODE);
    exit;
}

$currentPassword = trim((string)($input['currentPassword'] ?? ''));
$newPassword = trim((string)($input['newPassword'] ?? ''));

if ($currentPassword === '' || $newPassword === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Mevcut şifre ve yeni şifre gerekli.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$result = medisaMutateData(function (&$data) use ($tokenData, $currentPassword, $newPassword) {
    $sessionResolution = medisaResolveSessionContext($data, $tokenData, true);
    if (($sessionResolution['success'] ?? false) !== true) {
        return $sessionResolution;
    }
    $context = $sessionResolution['context'];
    $userId = (string)($context['user_id'] ?? '');
    $userIndex = medisaFindUserIndex($data, $userId);
    if ($userIndex < 0) {
        return medisaBuildErrorResult('Kullanıcı bulunamadı.', 404);
    }

    if (!medisaVerifyUserPassword($data['users'][$userIndex], $currentPassword)) {
        return medisaBuildErrorResult('Mevcut parola hatalı.', 401);
    }

    $policyResult = medisaValidateNewUserPassword($data['users'][$userIndex], $currentPassword, $newPassword);
    if (($policyResult['success'] ?? false) !== true) {
        return $policyResult;
    }

    medisaApplyUserPasswordChange($data['users'][$userIndex], $newPassword);
    $updatedContext = medisaBuildAccessContext($data, ['user_id' => $userId]);
    if (!$updatedContext) {
        return medisaBuildErrorResult('Parola değiştirilemedi. Tekrar deneyin.', 500);
    }

    return [
        'success' => true,
        'message' => 'Parola başarıyla değiştirildi.',
        'token_claims' => medisaBuildSessionTokenClaims($updatedContext),
        'session' => medisaBuildSessionPayload($updatedContext),
    ];
});

$status = (int)($result['status'] ?? 200);
if ($status !== 200) {
    http_response_code($status);
}
unset($result['status']);

if (($result['success'] ?? false) === true) {
    $tokenClaims = is_array($result['token_claims'] ?? null) ? $result['token_claims'] : [];
    unset($result['token_claims']);
    $result['token'] = medisaCreateSignedToken($tokenClaims, 30 * 24 * 60 * 60);
}

echo json_encode($result, JSON_UNESCAPED_UNICODE);
?>
