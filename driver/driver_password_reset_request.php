<?php
require_once __DIR__ . '/../core.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

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
if (!is_array($input)) {
    $input = [];
}

$username = mb_substr(medisaNormalizePortalUsername($input['username'] ?? ''), 0, 255);
if ($username === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Kullanıcı adınızı girin.'], JSON_UNESCAPED_UNICODE);
    exit;
}

/* Hesap varlığını asla açığa çıkarmayan ortak yanıt. */
$acceptedMessage = 'Talebiniz alındı. Yöneticiniz kimliğinizi doğruladıktan sonra yeni şifre belirleyecektir.';

$result = medisaMutateData(function (&$data) use ($username, $acceptedMessage) {
    $targetUser = null;
    foreach (($data['users'] ?? []) as $user) {
        if (!is_array($user) || !medisaIsUserActive($user)) {
            continue;
        }
        if (!medisaUserHasPortalPassword($user)) {
            continue;
        }
        if (medisaPortalUsernamesEqual(medisaExtractPortalUsername($user), $username)) {
            $targetUser = $user;
            break;
        }
    }

    if (!is_array($targetUser)) {
        return ['success' => true, 'message' => $acceptedMessage, 'save' => false];
    }

    if (!isset($data['duzeltme_talepleri']) || !is_array($data['duzeltme_talepleri'])) {
        $data['duzeltme_talepleri'] = [];
    }

    $userId = (string)($targetUser['id'] ?? '');
    $now = time();
    foreach ($data['duzeltme_talepleri'] as $request) {
        if (!is_array($request) || ($request['talep_tipi'] ?? '') !== 'sifre_sifirlama') {
            continue;
        }
        if ((string)($request['surucu_id'] ?? '') !== $userId) {
            continue;
        }
        $requestAt = strtotime((string)($request['talep_tarihi'] ?? ''));
        if (($request['durum'] ?? '') === 'beklemede' || ($requestAt !== false && $requestAt >= ($now - 900))) {
            return ['success' => true, 'message' => $acceptedMessage, 'save' => false];
        }
    }

    $name = trim((string)($targetUser['isim'] ?? $targetUser['name'] ?? ''));
    $data['duzeltme_talepleri'][] = [
        'id' => medisaGetNextNumericId($data['duzeltme_talepleri']),
        'talep_tipi' => 'sifre_sifirlama',
        'surucu_id' => $userId,
        'surucu_adi' => $name,
        'kullanici_adi' => medisaExtractPortalUsername($targetUser),
        'arac_id' => '',
        'kayit_id' => null,
        'talep_tarihi' => date('c'),
        'durum' => 'beklemede',
        'admin_yanit_tarihi' => null,
        'admin_notu' => null,
        'admin_id' => null,
    ];

    return ['success' => true, 'message' => $acceptedMessage];
});

$status = (int)($result['status'] ?? 200);
if ($status !== 200) {
    http_response_code($status);
}
unset($result['status'], $result['save']);
echo json_encode($result, JSON_UNESCAPED_UNICODE);
