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

$tokenData = validateToken();
if (!$tokenData) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Oturumunuz sona erdi!'], JSON_UNESCAPED_UNICODE);
    exit;
}

$result = medisaMutateData(function (&$data) use ($tokenData) {
    $context = medisaBuildAccessContext($data, $tokenData);
    $userId = (string)($context['user_id'] ?? '');
    if (!$context || $userId === '') {
        return medisaBuildErrorResult('Oturum bilgisi geçersiz.', 401);
    }

    foreach (($data['users'] ?? []) as $idx => $candidate) {
        if ((string)($candidate['id'] ?? '') !== $userId) {
            continue;
        }
        if (($candidate['ilk_giris_parola_onerisi_bekliyor'] ?? false) === true) {
            medisaDismissInitialPasswordSuggestion($data['users'][$idx]);
        }
        return ['success' => true, 'message' => 'Tercihiniz kaydedildi.'];
    }
    return medisaBuildErrorResult('Kullanıcı bulunamadı.', 404);
});

$status = (int)($result['status'] ?? 200);
if ($status !== 200) {
    http_response_code($status);
}
unset($result['status']);
echo json_encode($result, JSON_UNESCAPED_UNICODE);
?>
