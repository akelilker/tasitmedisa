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

$input = json_decode(file_get_contents('php://input'), true);
$targetUserId = is_array($input) ? trim((string)($input['userId'] ?? '')) : '';
if ($targetUserId === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Kullanıcı seçimi gerekli.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$result = medisaMutateData(function (&$data) use ($targetUserId) {
    $auth = medisaResolveAuthorizedContext($data, 'manage_users');
    if (($auth['success'] ?? false) !== true) {
        return medisaBuildErrorResult($auth['message'] ?? 'Bu işlem için yetkiniz yok.', (int)($auth['status'] ?? 403));
    }
    $context = $auth['context'];
    if (($context['role'] ?? '') !== 'genel_yonetici') {
        return medisaBuildErrorResult('Başlangıç parolasını yalnız Genel Yönetici yenileyebilir.', 403);
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

    // Yetki: parola üretimi ve data mutationından önce.
    if (!medisaCanResetPortalInitialPassword($data['users'][$userIndex], $context)) {
        return medisaBuildErrorResult(
            'Bu kullanıcının başlangıç parolasını sıfırlama yetkiniz bulunmamaktadır.',
            403
        );
    }

    $username = trim((string)($data['users'][$userIndex]['kullanici_adi'] ?? ''));
    $usernameValid = $username !== '' && preg_match('/^[A-Za-z][A-Za-z0-9]*$/', $username) === 1;
    if (!$usernameValid) {
        $fullName = $data['users'][$userIndex]['isim'] ?? $data['users'][$userIndex]['name'] ?? '';
        $username = medisaCreateUniquePortalUsername($fullName, $data['users'], $targetUserId);
        if ($username === '') {
            return medisaBuildErrorResult('Kullanıcı adı ad soyad bilgisinden oluşturulamadı.', 400);
        }
        $data['users'][$userIndex]['kullanici_adi'] = $username;
    } else {
        $lookup = medisaPortalUsernameLookup($data['users'], $targetUserId);
        if (isset($lookup[medisaPortalUsernameKey($username)])) {
            return medisaBuildErrorResult('Portal kullanıcı adı başka bir kullanıcı tarafından kullanılıyor.', 409);
        }
    }

    $initialPassword = medisaAssignInitialPortalPassword($data['users'][$userIndex], $data['users']);
    $data['users'][$userIndex]['updatedAt'] = date('c');
    if (!isset($data['audit_events']) || !is_array($data['audit_events'])) {
        $data['audit_events'] = [];
    }
    $data['audit_events'][] = [
        'event' => 'portal_initial_password_reset',
        'actor_role' => (string)($context['role'] ?? ''),
        'target_role' => medisaResolveUserRole($data['users'][$userIndex]),
        'created_at' => date('c'),
    ];
    $data['audit_events'] = array_slice($data['audit_events'], -500);

    return [
        'success' => true,
        'username' => $username,
        'initialPassword' => $initialPassword,
        'user' => medisaProjectUserForClient($data['users'][$userIndex]),
    ];
});

$status = (int)($result['status'] ?? 200);
if ($status !== 200) {
    http_response_code($status);
}
unset($result['status']);
echo json_encode($result, JSON_UNESCAPED_UNICODE);
?>
