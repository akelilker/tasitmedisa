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
    echo json_encode(['success' => false, 'message' => 'Mevcut şifre ve yeni şifre gerekli.'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (mb_strlen($newPassword, 'UTF-8') < 6) {
    echo json_encode(['success' => false, 'message' => 'Yeni şifre en az 6 karakter olmalı.'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (hash_equals($currentPassword, $newPassword)) {
    echo json_encode(['success' => false, 'message' => 'Yeni şifre mevcut şifreyle aynı olamaz.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$result = medisaMutateData(function (&$data) use ($tokenData, $currentPassword, $newPassword) {
    $userId = (string)($tokenData['user_id'] ?? '');
    if ($userId === '') {
        return medisaBuildErrorResult('Oturum bilgisi geçersiz.', 401);
    }

    $userIndex = -1;
    foreach (($data['users'] ?? []) as $idx => $candidate) {
        if ((string)($candidate['id'] ?? '') === $userId) {
            $userIndex = $idx;
            break;
        }
    }

    if ($userIndex < 0) {
        return medisaBuildErrorResult('Kullanıcı bulunamadı!', 404);
    }

    if (!medisaVerifyUserPassword($data['users'][$userIndex], $currentPassword)) {
        return medisaBuildErrorResult('Mevcut şifre hatalı.', 200);
    }

    medisaSetUserPasswordHash($data['users'][$userIndex], $newPassword);
    $data['users'][$userIndex]['updatedAt'] = date('c');

    return [
        'success' => true,
        'message' => 'Şifre başarıyla değiştirildi.',
    ];
});

$status = (int)($result['status'] ?? 200);
if ($status !== 200) {
    http_response_code($status);
}
unset($result['status']);

echo json_encode($result, JSON_UNESCAPED_UNICODE);
?>
