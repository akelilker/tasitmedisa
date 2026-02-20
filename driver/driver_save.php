<?php
require_once __DIR__ . '/../core.php';
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// OPTIONS isteği
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Token doğrula
$tokenData = validateToken();
if (!$tokenData) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Oturumunuz sona erdi!'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Input al
$input = json_decode(file_get_contents('php://input'), true);
$aracId = intval($input['arac_id'] ?? 0);
$guncelKm = intval($input['guncel_km'] ?? 0);
$bakimDurumu = intval($input['bakim_durumu'] ?? 0);
$bakimAciklama = trim($input['bakim_aciklama'] ?? '');
$bakimTarih = trim($input['bakim_tarih'] ?? '');
$kazaDurumu = intval($input['kaza_durumu'] ?? 0);
$kazaAciklama = trim($input['kaza_aciklama'] ?? '');
$kazaTarih = trim($input['kaza_tarih'] ?? '');
$kazaHasarTutari = trim($input['kaza_hasar_tutari'] ?? '');
$bakimServis = trim($input['bakim_servis'] ?? '');
$bakimKisi = trim($input['bakim_kisi'] ?? '');
$bakimKm = trim($input['bakim_km'] ?? '');
$bakimTutar = trim($input['bakim_tutar'] ?? '');
$ekstraNot = trim($input['ekstra_not'] ?? '');

// Kaporta: boya_parcalar (partId => boyali|degisen)
$boyaParcalar = [];
$boyaParcalarRaw = $input['boya_parcalar'] ?? '';
if ($boyaParcalarRaw !== '') {
    $decoded = json_decode($boyaParcalarRaw, true);
    if (is_array($decoded)) {
        foreach ($decoded as $partId => $state) {
            if (is_string($partId) && $partId !== '' && in_array($state, ['boyali', 'degisen'], true)) {
                $boyaParcalar[$partId] = $state;
            }
        }
    }
}

// Validasyon
if ($aracId <= 0) {
    echo json_encode(['success' => false, 'message' => 'Geçersiz Taşıt ID!'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($guncelKm <= 0) {
    echo json_encode(['success' => false, 'message' => 'Geçerli bir KM değeri girin!'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($bakimDurumu && empty($bakimAciklama)) {
    echo json_encode(['success' => false, 'message' => 'Bakım detayı girmelisiniz!'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($kazaDurumu && empty($kazaAciklama)) {
    echo json_encode(['success' => false, 'message' => 'Kaza açıklaması girmelisiniz!'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Max karakter kontrolü
if (strlen($bakimAciklama) > 500) {
    echo json_encode(['success' => false, 'message' => 'Bakım detayı çok uzun! (Max 500 karakter)'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (strlen($kazaAciklama) > 500) {
    echo json_encode(['success' => false, 'message' => 'Kaza açıklaması çok uzun! (Max 500 karakter)'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Veriyi yükle
$data = loadData();
if (!$data) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Veri okunamadı!'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Kullanıcı yetkisi kontrolü
$user = null;
foreach ($data['users'] as $u) {
    if ($u['id'] === $tokenData['user_id']) {
        $user = $u;
        break;
    }
}

if (!$user) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Kullanıcı bulunamadı!'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Taşıt zimmet kontrolü (assignedUserId veya zimmetli_araclar)
$tasitlarCheck = $data['tasitlar'] ?? [];
$hasAccess = false;
foreach ($tasitlarCheck as $t) {
    if (isset($t['id']) && (string)$t['id'] === (string)$aracId) {
        $assignedUserId = $t['assignedUserId'] ?? null;
        if ($assignedUserId !== null && (string)$assignedUserId === (string)$user['id']) {
            $hasAccess = true;
            break;
        }
    }
}
// Yedek: eski zimmetli_araclar sistemi
if (!$hasAccess) {
    $zimmetliAraclar = $user['zimmetli_araclar'] ?? [];
    if (in_array($aracId, $zimmetliAraclar)) {
        $hasAccess = true;
    }
}
if (!$hasAccess) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Bu Taşıta Erişim Yetkiniz Yok!'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Dönem (bu ay)
$donem = date('Y-m');

// Aynı ay için kayıt var mı kontrol et
$existingIndex = -1;
foreach ($data['arac_aylik_hareketler'] as $idx => $kayit) {
    if ($kayit['arac_id'] === $aracId && $kayit['donem'] === $donem && $kayit['surucu_id'] === $user['id']) {
        $existingIndex = $idx;
        break;
    }
}

// KM uyarı kontrolü
$warning = null;
$lastKm = null;

// Geçen ay kaydını bul
$lastMonth = date('Y-m', strtotime('-1 month'));
foreach ($data['arac_aylik_hareketler'] as $kayit) {
    if ($kayit['arac_id'] === $aracId && $kayit['donem'] === $lastMonth) {
        $lastKm = $kayit['guncel_km'];
        break;
    }
}

// Önceki KM: taşıt guncelKm, bu dönem kaydı veya geçen ay kaydı (en büyüğü)
$oncekiKm = 0;
$tasitlarList = $data['tasitlar'] ?? [];
foreach ($tasitlarList as $t) {
    if (isset($t['id']) && (string)$t['id'] === (string)$aracId) {
        $v = (int) preg_replace('/\D/', '', (string)($t['guncelKm'] ?? $t['km'] ?? '0'));
        if ($v > $oncekiKm) $oncekiKm = $v;
        break;
    }
}
if ($existingIndex >= 0 && isset($data['arac_aylik_hareketler'][$existingIndex]['guncel_km'])) {
    $v = (int) $data['arac_aylik_hareketler'][$existingIndex]['guncel_km'];
    if ($v > $oncekiKm) $oncekiKm = $v;
}
if ($lastKm !== null && $lastKm > $oncekiKm) $oncekiKm = (int) $lastKm;

// Düşük KM kayda izin verme
if ($oncekiKm > 0 && $guncelKm < $oncekiKm) {
    echo json_encode(['success' => false, 'message' => 'Bildirilmek İstenen Km, Önceki Kayıtlarla Uyuşmamaktadır. Şirket Yetkilisi İle Görüşün'], JSON_UNESCAPED_UNICODE);
    exit;
}

// KM uyarı kontrolü (sadece çok fazla artış – düşük km yukarıda reddedildi)
$warning = null;
if ($lastKm !== null && ($guncelKm - $lastKm) > 10000) {
    $diff = $guncelKm - $lastKm;
    $warning = "⚠️ Uyarı: KM çok fazla artmış ($diff km). Lütfen kontrol edin.";
}

// Yeni ID oluştur (mevcut kayıtlar arasında en büyük ID + 1)
$newId = 1;
foreach ($data['arac_aylik_hareketler'] as $kayit) {
    if ($kayit['id'] >= $newId) {
        $newId = $kayit['id'] + 1;
    }
}

// km_only: Sadece KM güncellenirken mevcut bakım/kaza/not değerleri korunsun
$kmOnly = !empty($input['km_only']);
$existingRec = ($existingIndex >= 0) ? $data['arac_aylik_hareketler'][$existingIndex] : null;

// km_only: mevcut kayıttan bakım/kaza/not değerlerini al
if ($kmOnly && $existingRec) {
    $bakimDurumu = isset($existingRec['bakim_durumu']) ? (int)$existingRec['bakim_durumu'] : 0;
    $bakimAciklama = isset($existingRec['bakim_aciklama']) ? trim((string)$existingRec['bakim_aciklama']) : '';
    $bakimTarih = isset($existingRec['bakim_tarih']) ? trim((string)$existingRec['bakim_tarih']) : '';
    $bakimServis = isset($existingRec['bakim_servis']) ? trim((string)$existingRec['bakim_servis']) : '';
    $bakimKisi = isset($existingRec['bakim_kisi']) ? trim((string)$existingRec['bakim_kisi']) : '';
    $bakimKm = isset($existingRec['bakim_km']) ? trim((string)$existingRec['bakim_km']) : '';
    $bakimTutar = isset($existingRec['bakim_tutar']) ? trim((string)$existingRec['bakim_tutar']) : '';
    $kazaDurumu = isset($existingRec['kaza_durumu']) ? (int)$existingRec['kaza_durumu'] : 0;
    $kazaAciklama = isset($existingRec['kaza_aciklama']) ? trim((string)$existingRec['kaza_aciklama']) : '';
    $kazaTarih = isset($existingRec['kaza_tarih']) ? trim((string)$existingRec['kaza_tarih']) : '';
    $kazaHasarTutari = isset($existingRec['kaza_hasar_tutari']) ? trim((string)$existingRec['kaza_hasar_tutari']) : '';
    $ekstraNot = isset($existingRec['ekstra_not']) ? trim((string)$existingRec['ekstra_not']) : '';
    $boyaParcalarRaw = isset($existingRec['boya_parcalar']) ? $existingRec['boya_parcalar'] : '';
    $boyaParcalar = [];
    if ($boyaParcalarRaw !== '') {
        $decoded = is_string($boyaParcalarRaw) ? json_decode($boyaParcalarRaw, true) : $boyaParcalarRaw;
        if (is_array($decoded)) {
            foreach ($decoded as $partId => $state) {
                if (is_string($partId) && $partId !== '' && in_array($state, ['boyali', 'degisen'], true)) {
                    $boyaParcalar[$partId] = $state;
                }
            }
        }
    }
}

// Kayıt verisi (aylık özet + taşıt detay senkronu için ek alanlar)
$kayitData = [
    'id' => $existingIndex >= 0 ? $data['arac_aylik_hareketler'][$existingIndex]['id'] : $newId,
    'arac_id' => $aracId,
    'surucu_id' => $user['id'],
    'donem' => $donem,
    'guncel_km' => $guncelKm,
    'bakim_durumu' => $bakimDurumu,
    'bakim_aciklama' => $bakimAciklama,
    'bakim_tarih' => $bakimTarih,
    'bakim_servis' => $bakimServis,
    'bakim_kisi' => $bakimKisi,
    'bakim_km' => $bakimKm,
    'bakim_tutar' => $bakimTutar,
    'kaza_durumu' => $kazaDurumu,
    'kaza_aciklama' => $kazaAciklama,
    'kaza_tarih' => $kazaTarih,
    'kaza_hasar_tutari' => $kazaHasarTutari,
    'boya_parcalar' => !empty($boyaParcalar) ? json_encode($boyaParcalar) : '',
    'ekstra_not' => $ekstraNot,
    'kayit_tarihi' => $existingIndex >= 0 ? $data['arac_aylik_hareketler'][$existingIndex]['kayit_tarihi'] : date('c'),
    'guncelleme_tarihi' => date('c'),
    'durum' => 'onaylandi'
];

// Kaydet veya güncelle
if ($existingIndex >= 0) {
    // Güncelle
    $data['arac_aylik_hareketler'][$existingIndex] = $kayitData;
} else {
    // Yeni kayıt ekle
    $data['arac_aylik_hareketler'][] = $kayitData;
}

// Taşıtlar detay ekranı senkronizasyonu: tasitlar içindeki araç guncelKm ve events güncelle
$tasitlar = &$data['tasitlar'];
$kullaniciAdi = $user['isim'] ?? $user['name'] ?? '';
if (is_array($tasitlar)) {
    foreach ($tasitlar as $idx => $vehicle) {
        $vid = isset($vehicle['id']) ? (is_numeric($vehicle['id']) ? intval($vehicle['id']) : $vehicle['id']) : null;
        if ($vid === null || (string)$vid !== (string)$aracId) {
            continue;
        }
        $eskiKm = $tasitlar[$idx]['guncelKm'] ?? $tasitlar[$idx]['km'] ?? null;
        if ($eskiKm !== null) {
            $eskiKm = (string) $eskiKm;
        }
        // guncelKm güncelle
        $tasitlar[$idx]['guncelKm'] = $guncelKm;
        // boya_parcalar: taşıt boyaliParcalar merge, boya=var
        if (!empty($boyaParcalar)) {
            $mevcut = isset($tasitlar[$idx]['boyaliParcalar']) && is_array($tasitlar[$idx]['boyaliParcalar'])
                ? $tasitlar[$idx]['boyaliParcalar'] : [];
            $tasitlar[$idx]['boyaliParcalar'] = array_merge($mevcut, $boyaParcalar);
            $tasitlar[$idx]['boya'] = 'var';
        }
        // events dizisi yoksa oluştur
        if (!isset($tasitlar[$idx]['events']) || !is_array($tasitlar[$idx]['events'])) {
            $tasitlar[$idx]['events'] = [];
        }
        // Km revize event (kullanıcı panelinden kayıt – tarihçede görünsün)
        array_unshift($tasitlar[$idx]['events'], [
            'id' => (string)(time() . $idx . 'km'),
            'type' => 'km-revize',
            'date' => date('Y-m-d'),
            'timestamp' => date('c'),
            'data' => [
                'eskiKm' => $eskiKm !== null ? $eskiKm : '',
                'yeniKm' => (string) $guncelKm,
                'surucu' => $kullaniciAdi
            ]
        ]);
        // Bakım bildirimi varsa işlem geçmişine ekle
        if ($bakimDurumu && !empty($bakimAciklama)) {
            $eventDate = !empty($bakimTarih) ? $bakimTarih : date('Y-m-d');
            array_unshift($tasitlar[$idx]['events'], [
                'id' => (string)(time() . $idx . 'b'),
                'type' => 'bakim',
                'date' => $eventDate,
                'timestamp' => date('c'),
                'data' => [
                    'islemler' => $bakimAciklama,
                    'servis' => $bakimServis,
                    'kisi' => $bakimKisi,
                    'km' => $bakimKm,
                    'tutar' => $bakimTutar
                ]
            ]);
        }
        // Kaza bildirimi varsa işlem geçmişine ekle
        if ($kazaDurumu && !empty($kazaAciklama)) {
            $eventDate = !empty($kazaTarih) ? $kazaTarih : date('Y-m-d');
            $kazaData = [
                'aciklama' => $kazaAciklama,
                'surucu' => $kullaniciAdi,
                'hasarTutari' => $kazaHasarTutari
            ];
            if (!empty($boyaParcalar)) {
                $kazaData['hasarParcalari'] = $boyaParcalar;
            }
            array_unshift($tasitlar[$idx]['events'], [
                'id' => (string)(time() . $idx . 'k'),
                'type' => 'kaza',
                'date' => $eventDate,
                'timestamp' => date('c'),
                'data' => $kazaData
            ]);
        }
        // Son not: taşıt detayda görünsün (günlük defter)
        $tasitlar[$idx]['sonEkstraNot'] = $ekstraNot;
        $tasitlar[$idx]['sonEkstraNotDonem'] = $donem;
        if ($ekstraNot !== '') {
            array_unshift($tasitlar[$idx]['events'], [
                'id' => (string)(time() . $idx . 'n'),
                'type' => 'not-guncelle',
                'date' => date('Y-m-d'),
                'timestamp' => date('c'),
                'data' => [
                    'not' => $ekstraNot,
                    'donem' => $donem,
                    'surucu' => $kullaniciAdi
                ]
            ]);
        }
        break;
    }
}

// Veriyi kaydet
if (!saveData($data)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Dosya yazma hatası!'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Başarılı yanıt
$response = [
    'success' => true,
    'message' => 'Veri kaydedildi!'
];

if ($warning) {
    $response['warning'] = $warning;
}

echo json_encode($response, JSON_UNESCAPED_UNICODE);
?>
