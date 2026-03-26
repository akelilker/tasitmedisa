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

$kayitId = (int)($input['kayit_id'] ?? 0);
$yeniKm = array_key_exists('yeni_km', $input) ? (int)$input['yeni_km'] : null;
$yeniBakimDurumu = array_key_exists('yeni_bakim_durumu', $input) ? (int)$input['yeni_bakim_durumu'] : null;
$yeniBakimAciklama = array_key_exists('yeni_bakim_aciklama', $input) ? trim((string)$input['yeni_bakim_aciklama']) : null;
$yeniKazaDurumu = array_key_exists('yeni_kaza_durumu', $input) ? (int)$input['yeni_kaza_durumu'] : null;
$yeniKazaAciklama = array_key_exists('yeni_kaza_aciklama', $input) ? trim((string)$input['yeni_kaza_aciklama']) : null;
$sebep = strip_tags(trim((string)($input['sebep'] ?? '')));

if ($kayitId <= 0) {
    echo json_encode(['success' => false, 'message' => 'Geçersiz kayıt ID!'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($sebep === '') {
    echo json_encode(['success' => false, 'message' => 'Düzeltme sebebini yazmalısınız!'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (strlen($sebep) > 500) {
    echo json_encode(['success' => false, 'message' => 'Sebep açıklaması çok uzun! (Max 500 karakter)'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($yeniKm !== null && $yeniKm <= 0) {
    echo json_encode(['success' => false, 'message' => 'Geçerli bir KM değeri girin!'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($yeniBakimAciklama !== null && strlen($yeniBakimAciklama) > 500) {
    echo json_encode(['success' => false, 'message' => 'Bakım açıklaması çok uzun! (Max 500 karakter)'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($yeniKazaAciklama !== null && strlen($yeniKazaAciklama) > 500) {
    echo json_encode(['success' => false, 'message' => 'Kaza açıklaması çok uzun! (Max 500 karakter)'], JSON_UNESCAPED_UNICODE);
    exit;
}

$result = medisaMutateData(function (&$data) use (
    $tokenData,
    $kayitId,
    $yeniKm,
    $yeniBakimDurumu,
    $yeniBakimAciklama,
    $yeniKazaDurumu,
    $yeniKazaAciklama,
    $sebep
) {
    $recordIndex = medisaFindMonthlyRecordIndex($data, $kayitId);
    if ($recordIndex < 0) {
        return medisaBuildErrorResult('Kayıt bulunamadı!', 404);
    }

    $kayit = $data['arac_aylik_hareketler'][$recordIndex];
    if ((string)($kayit['surucu_id'] ?? '') !== (string)($tokenData['user_id'] ?? '')) {
        return medisaBuildErrorResult('Bu kayda erişim yetkiniz yok!', 403);
    }

    $kmChanged = $yeniKm !== null && $yeniKm !== (int)($kayit['guncel_km'] ?? 0);
    $bakimChanged = $yeniBakimAciklama !== null;
    $kazaChanged = $yeniKazaAciklama !== null;
    if (!$kmChanged && !$bakimChanged && !$kazaChanged) {
        return medisaBuildErrorResult('En az bir alanda değişiklik yapmalısınız!', 400);
    }

    if (!isset($data['duzeltme_talepleri']) || !is_array($data['duzeltme_talepleri'])) {
        $data['duzeltme_talepleri'] = [];
    }

    $newTalepId = medisaGetNextNumericId($data['duzeltme_talepleri']);
    $talepData = [
        'id' => $newTalepId,
        'kayit_id' => $kayitId,
        'surucu_id' => $tokenData['user_id'],
        'talep_tarihi' => date('c'),
        'sebep' => $sebep,
        'eski_km' => $kayit['guncel_km'] ?? null,
        'yeni_km' => $kmChanged ? $yeniKm : null,
        'eski_bakim_durumu' => $kayit['bakim_durumu'] ?? 0,
        'eski_bakim_aciklama' => $kayit['bakim_aciklama'] ?? '',
        'yeni_bakim_durumu' => $bakimChanged ? ($yeniBakimDurumu !== null ? $yeniBakimDurumu : ($yeniBakimAciklama ? 1 : 0)) : null,
        'yeni_bakim_aciklama' => $bakimChanged ? ($yeniBakimAciklama ?? '') : null,
        'eski_kaza_durumu' => $kayit['kaza_durumu'] ?? 0,
        'eski_kaza_aciklama' => $kayit['kaza_aciklama'] ?? '',
        'yeni_kaza_durumu' => $kazaChanged ? ($yeniKazaDurumu !== null ? $yeniKazaDurumu : ($yeniKazaAciklama ? 1 : 0)) : null,
        'yeni_kaza_aciklama' => $kazaChanged ? ($yeniKazaAciklama ?? '') : null,
        'durum' => 'beklemede',
        'admin_yanit_tarihi' => null,
        'admin_notu' => null,
        'admin_id' => null,
    ];

    $data['duzeltme_talepleri'][] = $talepData;

    return [
        'success' => true,
        'message' => 'Düzeltme talebiniz gönderildi! Admin onayı bekleniyor.',
        'talep_id' => $newTalepId,
    ];
});

$status = (int)($result['status'] ?? ($result['conflict'] ?? false ? 409 : 200));
if ($status !== 200) {
    http_response_code($status);
}
unset($result['status']);

echo json_encode($result, JSON_UNESCAPED_UNICODE);
