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

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Geçersiz istek verisi!'], JSON_UNESCAPED_UNICODE);
    exit;
}

$requestId = (int)($input['request_id'] ?? 0);
$action = (string)($input['action'] ?? '');
$adminNote = mb_substr(strip_tags(trim((string)($input['admin_note'] ?? ''))), 0, 1000);

if ($requestId <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Geçersiz talep ID!'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action !== 'approve' && $action !== 'reject') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Geçersiz işlem!'], JSON_UNESCAPED_UNICODE);
    exit;
}

$result = medisaMutateData(function (&$data) use ($requestId, $action, $adminNote) {
    $auth = medisaResolveAuthorizedContext($data, 'view_reports');
    if (($auth['success'] ?? false) !== true) {
        return medisaBuildErrorResult($auth['message'] ?? 'Bu işlem için yetkiniz yok.', (int)($auth['status'] ?? 403));
    }
    $context = $auth['context'];

    $visibleData = medisaFilterReportDataForContext($data, $context);
    if (medisaFindCorrectionRequestIndex($visibleData, $requestId) < 0) {
        return medisaBuildErrorResult('Bu talebi yönetme yetkiniz yok.', 403);
    }

    $talepIndex = medisaFindCorrectionRequestIndex($data, $requestId);
    if ($talepIndex < 0) {
        return medisaBuildErrorResult('Talep bulunamadı!', 404);
    }

    $talep = $data['duzeltme_talepleri'][$talepIndex];
    if (($talep['durum'] ?? '') !== 'beklemede') {
        return medisaBuildConflictResult('request', $requestId, 'Bu talep zaten işlendi. Güncel veriler yüklendi.');
    }

    $data['duzeltme_talepleri'][$talepIndex]['durum'] = $action === 'approve' ? 'onaylandi' : 'reddedildi';
    $data['duzeltme_talepleri'][$talepIndex]['admin_yanit_tarihi'] = date('c');
    $data['duzeltme_talepleri'][$talepIndex]['admin_notu'] = $adminNote;
    $data['duzeltme_talepleri'][$talepIndex]['admin_id'] = (string)($context['user_id'] ?? '');

    $isGeneralRequest = ($talep['talep_tipi'] ?? '') === 'genel';

    if ($action === 'approve' && !$isGeneralRequest) {
        $kayitIndex = medisaFindMonthlyRecordIndex($data, $talep['kayit_id'] ?? '');
        if ($kayitIndex >= 0) {
            $kayit = &$data['arac_aylik_hareketler'][$kayitIndex];
            if (isset($talep['yeni_km']) && $talep['yeni_km'] !== null) {
                $kayit['guncel_km'] = $talep['yeni_km'];
            }
            if (isset($talep['yeni_bakim_durumu']) && $talep['yeni_bakim_durumu'] !== null) {
                $kayit['bakim_durumu'] = $talep['yeni_bakim_durumu'];
                $kayit['bakim_aciklama'] = $talep['yeni_bakim_aciklama'] ?? '';
            }
            if (isset($talep['yeni_kaza_durumu']) && $talep['yeni_kaza_durumu'] !== null) {
                $kayit['kaza_durumu'] = $talep['yeni_kaza_durumu'];
                $kayit['kaza_aciklama'] = $talep['yeni_kaza_aciklama'] ?? '';
            }
            $kayit['guncelleme_tarihi'] = date('c');

            if (isset($talep['yeni_km']) && $talep['yeni_km'] !== null) {
                $vehicleIndex = medisaFindVehicleIndex($data, $kayit['arac_id'] ?? '');
                if ($vehicleIndex >= 0) {
                    $vehicle = &$data['tasitlar'][$vehicleIndex];
                    $eskiKm = $vehicle['guncelKm'] ?? $vehicle['km'] ?? null;
                    $vehicle['guncelKm'] = $talep['yeni_km'];
                    if (!isset($vehicle['events']) || !is_array($vehicle['events'])) {
                        $vehicle['events'] = [];
                    }
                    $talepTarihiRaw = isset($talep['talep_tarihi']) ? (string)$talep['talep_tarihi'] : '';
                    $talepTarihYmd = $talepTarihiRaw !== '' ? substr($talepTarihiRaw, 0, 10) : date('Y-m-d');
                    array_unshift($vehicle['events'], [
                        'id' => (string)(time() . $vehicleIndex . 'kmreq' . $requestId),
                        'type' => 'km-revize',
                        'date' => $talepTarihYmd,
                        'timestamp' => date('c'),
                        'data' => [
                            'eskiKm' => $eskiKm !== null ? (string)$eskiKm : '',
                            'yeniKm' => (string)$talep['yeni_km'],
                            'duzeltmeTalebi' => true,
                            'duzeltmeTalepTarihi' => $talepTarihiRaw,
                        ],
                    ]);
                    medisaBumpVehicleVersion($vehicle);
                }
            }
        }
    }

    return [
        'success' => true,
        'message' => $action === 'approve'
            ? ($isGeneralRequest ? 'Talep kapatıldı!' : 'Talep onaylandı, veri güncellendi!')
            : 'Talep reddedildi!',
    ];
});

$status = (int)($result['status'] ?? ($result['conflict'] ?? false ? 409 : 200));
if ($status !== 200) {
    http_response_code($status);
}
unset($result['status']);

echo json_encode($result, JSON_UNESCAPED_UNICODE);
