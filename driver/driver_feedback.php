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

$aracId = trim((string)($input['arac_id'] ?? ''));
$konuTuru = trim((string)($input['konu_turu'] ?? ''));
$mesaj = strip_tags(trim((string)($input['mesaj'] ?? '')));
$allowedTypes = ['talep', 'sikayet', 'oneri', 'diger'];

if ($aracId === '') {
    echo json_encode(['success' => false, 'message' => 'Geçersiz taşıt bilgisi!'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!in_array($konuTuru, $allowedTypes, true)) {
    echo json_encode(['success' => false, 'message' => 'Geçersiz konu türü!'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($mesaj === '') {
    echo json_encode(['success' => false, 'message' => 'Mesaj alanını doldurmalısınız!'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (mb_strlen($mesaj, 'UTF-8') > 500) {
    echo json_encode(['success' => false, 'message' => 'Mesaj çok uzun! (Max 500 karakter)'], JSON_UNESCAPED_UNICODE);
    exit;
}

$result = medisaMutateData(function (&$data) use ($tokenData, $aracId, $konuTuru, $mesaj) {
    $vehicle = null;
    $vehicleIndex = null;
    foreach (($data['tasitlar'] ?? []) as $idx => $tasit) {
        if ((string)($tasit['id'] ?? '') === $aracId) {
            $vehicle = $tasit;
            $vehicleIndex = $idx;
            break;
        }
    }

    if (!$vehicle) {
        return medisaBuildErrorResult('Taşıt bulunamadı!', 404);
    }

    $userId = (string)($tokenData['user_id'] ?? '');
    $assignedUserId = (string)($vehicle['assignedUserId'] ?? '');
    $legacyAssigned = false;
    if ($assignedUserId === '') {
        foreach (($data['users'] ?? []) as $user) {
            if ((string)($user['id'] ?? '') !== $userId) {
                continue;
            }
            foreach (($user['zimmetli_araclar'] ?? []) as $legacyVehicleId) {
                if ((string)$legacyVehicleId === $aracId) {
                    $legacyAssigned = true;
                    break 2;
                }
            }
        }
    }

    if ($assignedUserId !== $userId && !$legacyAssigned) {
        return medisaBuildErrorResult('Bu taşıta talep gönderme yetkiniz yok!', 403);
    }

    if (!isset($data['duzeltme_talepleri']) || !is_array($data['duzeltme_talepleri'])) {
        $data['duzeltme_talepleri'] = [];
    }

    $newTalepId = medisaGetNextNumericId($data['duzeltme_talepleri']);
    $talepTarihi = date('c');
    $data['duzeltme_talepleri'][] = [
        'id' => $newTalepId,
        'talep_tipi' => 'genel',
        'arac_id' => $aracId,
        'kayit_id' => null,
        'surucu_id' => $userId,
        'konu_turu' => $konuTuru,
        'mesaj' => $mesaj,
        'sebep' => $mesaj,
        'talep_tarihi' => $talepTarihi,
        'durum' => 'beklemede',
        'admin_yanit_tarihi' => null,
        'admin_notu' => null,
        'admin_id' => null,
    ];
    $eventId = 'feedback-' . $newTalepId;
    if ($vehicleIndex !== null) {
        if (!isset($data['tasitlar'][$vehicleIndex]['events']) || !is_array($data['tasitlar'][$vehicleIndex]['events'])) {
            $data['tasitlar'][$vehicleIndex]['events'] = [];
        }
        array_unshift($data['tasitlar'][$vehicleIndex]['events'], [
            'id' => $eventId,
            'type' => 'driver-feedback',
            'date' => date('Y-m-d'),
            'timestamp' => $talepTarihi,
            'data' => [
                'konuTuru' => $konuTuru,
                'mesaj' => $mesaj,
                'talepId' => $newTalepId,
            ],
        ]);
    }

    return [
        'success' => true,
        'message' => 'Talebiniz yöneticiye gönderildi.',
        'talep_id' => $newTalepId,
        'event_id' => $eventId,
        'talep_tarihi' => $talepTarihi,
    ];
});

$status = (int)($result['status'] ?? ($result['conflict'] ?? false ? 409 : 200));
if ($status !== 200) {
    http_response_code($status);
}
unset($result['status']);

echo json_encode($result, JSON_UNESCAPED_UNICODE);
