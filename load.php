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
    $data = [
        'tasitlar' => [],
        'kayitlar' => [],
        'branches' => [],
        'users' => [],
        'ayarlar' => [
            'sirketAdi' => 'Medisa',
            'yetkiliKisi' => '',
            'telefon' => '',
            'eposta' => '',
        ],
        'sifreler' => [],
        'arac_aylik_hareketler' => [],
        'duzeltme_talepleri' => [],
    ];
}

$context = medisaBuildAccessContext($data, $tokenData);
if (!$context) {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'message' => 'Kullanıcı bulunamadı veya yetki çözümlenemedi.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$filtered = medisaFilterDataForContext($data, $context);
echo json_encode($filtered, JSON_UNESCAPED_UNICODE);
?>
