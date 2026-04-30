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

function addYears($dateStr, $years) {
    if (!$dateStr) return '';
    $dt = new DateTime($dateStr);
    if (!$dt) return $dateStr;
    $dt->modify("+{$years} years");
    return $dt->format('Y-m-d');
}

function calculateNextMuayene($vehicle, $muayeneDateStr) {
    // Muayene ve egzos yaptırılan tarihlerinden bitiş hesaplamasında aynı periyot kuralları kullanılır (driver_event.php ↔ tasitlar.js senkron).
    if (!$muayeneDateStr) return '';

    $currentYear = (int)date('Y');
    $productionYear = (int)($vehicle['year'] ?? 0);
    if ($productionYear <= 0) $productionYear = $currentYear;

    $events = $vehicle['events'] ?? [];
    $hasMuayeneEvent = false;
    foreach ($events as $event) {
        if (($event['type'] ?? '') === 'muayene-guncelle') {
            $hasMuayeneEvent = true;
            break;
        }
    }
    $hasExistingMuayeneDate = trim((string)($vehicle['muayeneDate'] ?? '')) !== '';
    $isFirstMuayene = !$hasMuayeneEvent && !$hasExistingMuayeneDate;

    $vehicleType = strtolower((string)($vehicle['vehicleType'] ?? $vehicle['tip'] ?? 'otomobil'));
    $isCommercial = $vehicleType !== 'otomobil';
    $firstPeriod = $isFirstMuayene && ($productionYear === $currentYear);
    $yearsToAdd = $isCommercial ? ($firstPeriod ? 2 : 1) : ($firstPeriod ? 3 : 2);

    return addYears($muayeneDateStr, $yearsToAdd);
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

$aracId = isset($input['arac_id']) ? (string)$input['arac_id'] : '';
$vehicleVersion = isset($input['vehicle_version']) ? (int)$input['vehicle_version'] : null;
$eventType = trim((string)($input['event_type'] ?? ''));
$payload = is_array($input['data'] ?? null) ? $input['data'] : [];

$allowedTypes = ['anahtar', 'lastik', 'utts', 'muayene', 'sigorta', 'kasko'];
if (!in_array($eventType, $allowedTypes, true)) {
    echo json_encode(['success' => false, 'message' => 'Geçersiz olay tipi!'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($aracId === '') {
    echo json_encode(['success' => false, 'message' => 'Geçersiz taşıt!'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($vehicleVersion === null || $vehicleVersion <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Araç sürümü eksik!'], JSON_UNESCAPED_UNICODE);
    exit;
}

$result = medisaMutateData(function (&$data) use ($tokenData, $aracId, $vehicleVersion, $eventType, $payload) {
    $user = medisaFindUserById($data, $tokenData['user_id'] ?? '');
    if (!$user) {
        return medisaBuildErrorResult('Kullanıcı bulunamadı!', 403);
    }

    $vehicleIndex = medisaFindVehicleIndex($data, $aracId);
    if ($vehicleIndex < 0) {
        return medisaBuildErrorResult('Bu taşıta erişim yetkiniz yok!', 403);
    }

    $vehicle = &$data['tasitlar'][$vehicleIndex];
    $hasAccess = ((string)($vehicle['assignedUserId'] ?? '') === (string)($user['id'] ?? ''));
    if (!$hasAccess) {
        $zimmetliAraclar = $user['zimmetli_araclar'] ?? [];
        $hasAccess = is_array($zimmetliAraclar) && in_array($aracId, $zimmetliAraclar);
    }
    if (!$hasAccess) {
        return medisaBuildErrorResult('Bu taşıta erişim yetkiniz yok!', 403);
    }

    $versionCheck = medisaEnsureVehicleVersion($vehicle, $vehicleVersion, 'Bu araç başka biri tarafından güncellendi. Güncel veriler yüklendi.');
    if ($versionCheck !== true) {
        return $versionCheck;
    }

    if (!isset($vehicle['events']) || !is_array($vehicle['events'])) {
        $vehicle['events'] = [];
    }

    $kullaniciAdi = trim((string)($user['isim'] ?? $user['name'] ?? $user['ad_soyad'] ?? ''));
    $eventBase = [
        'id' => (string)(time() . $vehicleIndex . $eventType),
        'timestamp' => date('c'),
    ];

    switch ($eventType) {
        case 'anahtar':
            $durum = isset($payload['durum']) ? (string)$payload['durum'] : 'yok';
            $detay = $durum === 'var' ? mb_substr(strip_tags(trim($payload['detay'] ?? '')), 0, 500) : '';
            $vehicle['anahtar'] = $durum;
            $vehicle['anahtarNerede'] = $detay;
            $eventBase['type'] = 'anahtar-guncelle';
            $eventBase['date'] = date('d.m.Y');
            $eventBase['data'] = ['durum' => $durum, 'detay' => $detay, 'surucu' => $kullaniciAdi];
            break;

        case 'lastik':
            $durum = isset($payload['durum']) ? (string)$payload['durum'] : 'yok';
            $adres = $durum === 'var' ? mb_substr(strip_tags(trim($payload['adres'] ?? '')), 0, 500) : '';
            $vehicle['lastikDurumu'] = $durum;
            $vehicle['lastikAdres'] = $adres;
            $eventBase['type'] = 'lastik-guncelle';
            $eventBase['date'] = date('d.m.Y');
            $eventBase['data'] = ['durum' => $durum, 'adres' => $adres, 'surucu' => $kullaniciAdi];
            break;

        case 'utts':
            $durum = isset($payload['durum']) && $payload['durum'] === true;
            $vehicle['uttsTanimlandi'] = $durum;
            $eventBase['type'] = 'utts-guncelle';
            $eventBase['date'] = date('d.m.Y');
            $eventBase['data'] = ['durum' => $durum, 'surucu' => $kullaniciAdi];
            break;

        case 'muayene':
            $tarih = trim((string)($payload['tarih'] ?? ''));
            if ($tarih === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $tarih)) {
                return medisaBuildErrorResult('Muayene tarihi zorunludur! (YYYY-MM-DD)', 400);
            }
            $egzozYapilma = trim((string)($payload['egzozMuayeneYapilmaDate'] ?? ''));
            $egzozMuayeneDateLegacy = trim((string)($payload['egzozMuayeneDate'] ?? ''));
            if ($egzozYapilma !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $egzozYapilma)) {
                return medisaBuildErrorResult('Egzos muayenesi yaptırılan tarih geçersiz! (YYYY-MM-DD)', 400);
            }
            if ($egzozMuayeneDateLegacy !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $egzozMuayeneDateLegacy)) {
                return medisaBuildErrorResult('Egzos muayenesi bitiş tarihi geçersiz! (YYYY-MM-DD)', 400);
            }
            $bitisTarihi = calculateNextMuayene($vehicle, $tarih);
            if ($egzozYapilma !== '') {
                $egzozMuayeneDate = calculateNextMuayene($vehicle, $egzozYapilma);
            } elseif ($egzozMuayeneDateLegacy !== '') {
                $egzozMuayeneDate = $egzozMuayeneDateLegacy;
            } else {
                $egzozMuayeneDate = $bitisTarihi;
            }
            $vehicle['muayeneDate'] = $bitisTarihi;
            $vehicle['egzozMuayeneDate'] = $egzozMuayeneDate;
            $eventBase['type'] = 'muayene-guncelle';
            $eventBase['date'] = $tarih;
            $eventBase['data'] = [
                'bitisTarihi' => $bitisTarihi,
                'egzozMuayeneDate' => ($egzozYapilma !== '' || $egzozMuayeneDateLegacy !== '') ? $egzozMuayeneDate : '',
                'egzozMuayeneYapilmaDate' => $egzozYapilma,
                'surucu' => $kullaniciAdi,
            ];
            break;

        case 'sigorta':
            $tarih = trim((string)($payload['tarih'] ?? ''));
            if ($tarih === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $tarih)) {
                return medisaBuildErrorResult('Sigorta tarihi zorunludur! (YYYY-MM-DD)', 400);
            }
            $bitisTarihi = addYears($tarih, 1);
            $vehicle['sigortaDate'] = $bitisTarihi;
            $eventBase['type'] = 'sigorta-guncelle';
            $eventBase['date'] = $tarih;
            $eventBase['data'] = [
                'bitisTarihi' => $bitisTarihi,
                'firma' => mb_substr(strip_tags(trim($payload['firma'] ?? '')), 0, 300),
                'acente' => mb_substr(strip_tags(trim($payload['acente'] ?? '')), 0, 300),
                'iletisim' => mb_substr(strip_tags(trim($payload['iletisim'] ?? '')), 0, 300),
                'surucu' => $kullaniciAdi,
            ];
            break;

        case 'kasko':
            $tarih = trim((string)($payload['tarih'] ?? ''));
            if ($tarih === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $tarih)) {
                return medisaBuildErrorResult('Kasko tarihi zorunludur! (YYYY-MM-DD)', 400);
            }
            $bitisTarihi = addYears($tarih, 1);
            $vehicle['kaskoDate'] = $bitisTarihi;
            $eventBase['type'] = 'kasko-guncelle';
            $eventBase['date'] = $tarih;
            $eventBase['data'] = [
                'bitisTarihi' => $bitisTarihi,
                'firma' => mb_substr(strip_tags(trim($payload['firma'] ?? '')), 0, 300),
                'acente' => mb_substr(strip_tags(trim($payload['acente'] ?? '')), 0, 300),
                'iletisim' => mb_substr(strip_tags(trim($payload['iletisim'] ?? '')), 0, 300),
                'surucu' => $kullaniciAdi,
            ];
            break;

        default:
            return medisaBuildErrorResult('Bilinmeyen olay tipi!', 400);
    }

    array_unshift($vehicle['events'], $eventBase);
    $newVehicleVersion = medisaBumpVehicleVersion($vehicle);

    return [
        'success' => true,
        'message' => 'Kaydedildi!',
        'vehicleId' => (string)$aracId,
        'vehicleVersion' => $newVehicleVersion,
        'vehicleVersions' => [[
            'id' => (string)$aracId,
            'version' => $newVehicleVersion,
        ]],
    ];
});

$status = (int)($result['status'] ?? ($result['conflict'] ?? false ? 409 : 200));
if ($status !== 200) {
    http_response_code($status);
}
unset($result['status']);

echo json_encode($result, JSON_UNESCAPED_UNICODE);
