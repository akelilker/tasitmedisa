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

/** Yıl ekle (tasitlar.js addYears ile aynı iş kuralı; tarih formatı PHP tarafında Y-m-d). */
function addYears($dateStr, $years) {
    if (!$dateStr) return '';
    $dt = new DateTime($dateStr);
    if (!$dt) return $dateStr;
    $dt->modify("+{$years} years");
    return $dt->format('Y-m-d');
}

/** Muayene sonraki bitiş tarihi (tasitlar.js calculateNextMuayene ile aynı otomobil/ticari + yıl kuralları). */
function calculateNextMuayene($vehicle, $muayeneDateStr) {
    if (!$muayeneDateStr) return '';
    $events = $vehicle['events'] ?? [];
    $isFirstMuayene = true;
    foreach ($events as $e) {
        if (isset($e['type']) && $e['type'] === 'muayene-guncelle') {
            $isFirstMuayene = false;
            break;
        }
    }
    $vehicleType = $vehicle['vehicleType'] ?? $vehicle['tip'] ?? 'otomobil';
    if ($isFirstMuayene) {
        if ($vehicleType === 'otomobil') return addYears($muayeneDateStr, 3);
        return addYears($muayeneDateStr, 2);
    }
    if ($vehicleType === 'otomobil') return addYears($muayeneDateStr, 2);
    return addYears($muayeneDateStr, 1);
}

$tokenData = validateToken();
if (!$tokenData) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Oturumunuz sona erdi!'], JSON_UNESCAPED_UNICODE);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$aracId = isset($input['arac_id']) ? (is_numeric($input['arac_id']) ? intval($input['arac_id']) : $input['arac_id']) : 0;
$eventType = trim($input['event_type'] ?? '');
$data = $input['data'] ?? [];

$allowedTypes = ['anahtar', 'lastik', 'utts', 'muayene', 'sigorta', 'kasko'];
if (!in_array($eventType, $allowedTypes, true)) {
    echo json_encode(['success' => false, 'message' => 'Geçersiz olay tipi!'], JSON_UNESCAPED_UNICODE);
    exit;
}

$mainData = loadData();
if (!$mainData) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Veri okunamadı!'], JSON_UNESCAPED_UNICODE);
    exit;
}

$user = null;
foreach ($mainData['users'] ?? [] as $u) {
    if ((string)($u['id'] ?? '') === (string)$tokenData['user_id']) {
        $user = $u;
        break;
    }
}
if (!$user) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Kullanıcı bulunamadı!'], JSON_UNESCAPED_UNICODE);
    exit;
}

$hasAccess = false;
foreach ($mainData['tasitlar'] ?? [] as $t) {
    $tid = $t['id'] ?? null;
    if ($tid !== null && (string)$tid === (string)$aracId) {
        $assigned = $t['assignedUserId'] ?? null;
        if ($assigned !== null && (string)$assigned === (string)$user['id']) {
            $hasAccess = true;
            break;
        }
    }
}
if (!$hasAccess && !empty($user['zimmetli_araclar'])) {
    if (in_array($aracId, $user['zimmetli_araclar'])) $hasAccess = true;
}
if (!$hasAccess) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Bu taşıta erişim yetkiniz yok!'], JSON_UNESCAPED_UNICODE);
    exit;
}

$tasitlar = &$mainData['tasitlar'];
$vehicleIdx = null;
foreach ($tasitlar as $idx => $v) {
    $vid = $v['id'] ?? null;
    if ($vid !== null && (string)$vid === (string)$aracId) {
        $vehicleIdx = $idx;
        break;
    }
}
if ($vehicleIdx === null) {
    echo json_encode(['success' => false, 'message' => 'Taşıt bulunamadı!'], JSON_UNESCAPED_UNICODE);
    exit;
}

$vehicle = &$tasitlar[$vehicleIdx];
if (!isset($vehicle['events']) || !is_array($vehicle['events'])) {
    $vehicle['events'] = [];
}

$eventId = (string)(time() . $vehicleIdx . $eventType);
$eventBase = [
    'id' => $eventId,
    'timestamp' => date('c')
];

switch ($eventType) {
    case 'anahtar':
        $durum = isset($data['durum']) ? (string)$data['durum'] : 'yok';
        $detay = ($durum === 'var') ? mb_substr(strip_tags(trim($data['detay'] ?? '')), 0, 500) : '';
        $vehicle['anahtar'] = $durum;
        $vehicle['anahtarNerede'] = $detay;
        $eventBase['type'] = 'anahtar-guncelle';
        $eventBase['date'] = date('d.m.Y');
        $eventBase['data'] = ['durum' => $durum, 'detay' => $detay];
        break;

    case 'lastik':
        $durum = isset($data['durum']) ? (string)$data['durum'] : 'yok';
        $adres = ($durum === 'var') ? mb_substr(strip_tags(trim($data['adres'] ?? '')), 0, 500) : '';
        $vehicle['lastikDurumu'] = $durum;
        $vehicle['lastikAdres'] = $adres;
        $eventBase['type'] = 'lastik-guncelle';
        $eventBase['date'] = date('d.m.Y');
        $eventBase['data'] = ['durum' => $durum, 'adres' => $adres];
        break;

    case 'utts':
        $durum = isset($data['durum']) && $data['durum'] === true;
        $vehicle['uttsTanimlandi'] = $durum;
        $eventBase['type'] = 'utts-guncelle';
        $eventBase['date'] = date('d.m.Y');
        $eventBase['data'] = ['durum' => $durum];
        break;

    case 'muayene':
        $tarih = trim($data['tarih'] ?? '');
        if ($tarih === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $tarih)) {
            echo json_encode(['success' => false, 'message' => 'Muayene tarihi zorunludur! (YYYY-MM-DD)'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $bitisTarihi = calculateNextMuayene($vehicle, $tarih);
        $vehicle['muayeneDate'] = $bitisTarihi;
        $eventBase['type'] = 'muayene-guncelle';
        $eventBase['date'] = $tarih;
        $eventBase['data'] = ['bitisTarihi' => $bitisTarihi];
        break;

    case 'sigorta':
        $tarih = trim($data['tarih'] ?? '');
        if ($tarih === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $tarih)) {
            echo json_encode(['success' => false, 'message' => 'Sigorta tarihi zorunludur! (YYYY-MM-DD)'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $bitisTarihi = addYears($tarih, 1);
        $vehicle['sigortaDate'] = $bitisTarihi;
        $eventBase['type'] = 'sigorta-guncelle';
        $eventBase['date'] = $tarih;
        $eventBase['data'] = [
            'bitisTarihi' => $bitisTarihi,
            'firma' => mb_substr(strip_tags(trim($data['firma'] ?? '')), 0, 300),
            'acente' => mb_substr(strip_tags(trim($data['acente'] ?? '')), 0, 300),
            'iletisim' => mb_substr(strip_tags(trim($data['iletisim'] ?? '')), 0, 300)
        ];
        break;

    case 'kasko':
        $tarih = trim($data['tarih'] ?? '');
        if ($tarih === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $tarih)) {
            echo json_encode(['success' => false, 'message' => 'Kasko tarihi zorunludur! (YYYY-MM-DD)'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $bitisTarihi = addYears($tarih, 1);
        $vehicle['kaskoDate'] = $bitisTarihi;
        $eventBase['type'] = 'kasko-guncelle';
        $eventBase['date'] = $tarih;
        $eventBase['data'] = [
            'bitisTarihi' => $bitisTarihi,
            'firma' => mb_substr(strip_tags(trim($data['firma'] ?? '')), 0, 300),
            'acente' => mb_substr(strip_tags(trim($data['acente'] ?? '')), 0, 300),
            'iletisim' => mb_substr(strip_tags(trim($data['iletisim'] ?? '')), 0, 300)
        ];
        break;

    default:
        echo json_encode(['success' => false, 'message' => 'Bilinmeyen olay tipi!'], JSON_UNESCAPED_UNICODE);
        exit;
}

array_unshift($vehicle['events'], $eventBase);

if (!saveData($mainData)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Kayıt yazılamadı!'], JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode(['success' => true, 'message' => 'Kaydedildi!'], JSON_UNESCAPED_UNICODE);
