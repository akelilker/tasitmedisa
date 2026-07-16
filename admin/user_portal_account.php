<?php
require_once __DIR__ . '/../core.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Sadece POST istekleri kabul edilir.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$rawData = loadData();
if (!is_array($rawData)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Veri okunamadı.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$auth = medisaResolveAuthorizedContext($rawData, 'manage_users');
if (($auth['success'] ?? false) !== true) {
    http_response_code((int)($auth['status'] ?? 403));
    echo json_encode(['success' => false, 'message' => $auth['message'] ?? 'Bu işlem için yetkiniz yok.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$context = $auth['context'];
if (($context['role'] ?? '') !== 'genel_yonetici') {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Bu işlem için yetkiniz bulunmamaktadır.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$targetUserId = is_array($input) ? trim((string)($input['userId'] ?? '')) : '';
$action = is_array($input) ? trim((string)($input['action'] ?? '')) : '';
if ($targetUserId === '' || $action === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Kullanıcı ve işlem seçimi gerekli.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$result = medisaMutateData(function (&$data) use ($targetUserId, $action) {
    $auth = medisaResolveAuthorizedContext($data, 'manage_users');
    if (($auth['success'] ?? false) !== true) {
        return medisaBuildErrorResult($auth['message'] ?? 'Bu işlem için yetkiniz yok.', (int)($auth['status'] ?? 403));
    }
    $context = $auth['context'];
    if (($context['role'] ?? '') !== 'genel_yonetici') {
        return medisaBuildErrorResult('Bu işlem için yetkiniz bulunmamaktadır.', 403);
    }

    $userIndex = -1;
    foreach (($data['users'] ?? []) as $idx => $candidate) {
        if ((string)($candidate['id'] ?? '') === $targetUserId) {
            $userIndex = $idx;
            break;
        }
    }
    if ($userIndex < 0) {
        return medisaBuildErrorResult('Kullanıcı bulunamadı.', 404);
    }

    $targetUser = $data['users'][$userIndex];
    if (!medisaCanResetPortalInitialPassword($targetUser, $context)) {
        return medisaBuildErrorResult('Bu kullanıcı için işlem yetkiniz bulunmamaktadır.', 403);
    }

    if (!medisaUserHasPortalPassword($targetUser)) {
        return medisaBuildErrorResult('Portal hesabı bulunamadı.', 400);
    }

    if ($action === 'toggle_portal_status') {
        $currentStatus = trim((string)($targetUser['portal_credential_durumu'] ?? 'aktif'));
        $data['users'][$userIndex]['portal_credential_durumu'] = ($currentStatus === 'pasif') ? 'aktif' : 'pasif';
        $data['users'][$userIndex]['updatedAt'] = date('c');
        return [
            'success' => true,
            'user' => medisaProjectUserForClient($data['users'][$userIndex]),
        ];
    }

    if ($action === 'reopen_password_suggestion') {
        $data['users'][$userIndex]['ilk_giris_parola_onerisi_bekliyor'] = true;
        $data['users'][$userIndex]['ilk_giris_parola_onerisi_gosterildi_tarihi'] = null;
        $data['users'][$userIndex]['updatedAt'] = date('c');
        return [
            'success' => true,
            'user' => medisaProjectUserForClient($data['users'][$userIndex]),
        ];
    }

    return medisaBuildErrorResult('Geçersiz işlem.', 400);
});

$status = (int)($result['status'] ?? 200);
if ($status !== 200) {
    http_response_code($status);
}
unset($result['status']);
echo json_encode($result, JSON_UNESCAPED_UNICODE);
?>
