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
$vehicleVersion = isset($input['vehicle_version']) ? (int)$input['vehicle_version'] : null;
$guncelKm = (int)($input['guncel_km'] ?? 0);
$bakimDurumu = (int)($input['bakim_durumu'] ?? 0);
$bakimAciklama = strip_tags(trim($input['bakim_aciklama'] ?? ''));
$bakimTarih = strip_tags(trim($input['bakim_tarih'] ?? ''));
$kazaDurumu = (int)($input['kaza_durumu'] ?? 0);
$kazaAciklama = strip_tags(trim($input['kaza_aciklama'] ?? ''));
$kazaTarih = strip_tags(trim($input['kaza_tarih'] ?? ''));
$kazaHasarTutari = strip_tags(trim($input['kaza_hasar_tutari'] ?? ''));
$bakimServis = strip_tags(trim($input['bakim_servis'] ?? ''));
$bakimKisi = strip_tags(trim($input['bakim_kisi'] ?? ''));
$bakimKm = strip_tags(trim($input['bakim_km'] ?? ''));
$bakimTutar = strip_tags(trim($input['bakim_tutar'] ?? ''));
$hasEkstraNot = array_key_exists('ekstra_not', $input);
$ekstraNot = $hasEkstraNot ? strip_tags(trim($input['ekstra_not'] ?? '')) : null;

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

if ($aracId === '' || !is_numeric($aracId)) {
    echo json_encode(['success' => false, 'message' => 'Geçersiz Taşıt ID!'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($vehicleVersion === null || $vehicleVersion <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Araç sürümü eksik!'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($guncelKm <= 0) {
    echo json_encode(['success' => false, 'message' => 'Geçerli bir KM değeri girin!'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($bakimDurumu && $bakimAciklama === '') {
    echo json_encode(['success' => false, 'message' => 'Bakım detayı girmelisiniz!'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($kazaDurumu && $kazaAciklama === '') {
    echo json_encode(['success' => false, 'message' => 'Kaza açıklaması girmelisiniz!'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (strlen($bakimAciklama) > 500) {
    echo json_encode(['success' => false, 'message' => 'Bakım detayı çok uzun! (Max 500 karakter)'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (strlen($kazaAciklama) > 500) {
    echo json_encode(['success' => false, 'message' => 'Kaza açıklaması çok uzun! (Max 500 karakter)'], JSON_UNESCAPED_UNICODE);
    exit;
}

$result = medisaMutateData(function (&$data) use (
    $tokenData,
    $aracId,
    $vehicleVersion,
    $guncelKm,
    $bakimDurumu,
    $bakimAciklama,
    $bakimTarih,
    $kazaDurumu,
    $kazaAciklama,
    $kazaTarih,
    $kazaHasarTutari,
    $bakimServis,
    $bakimKisi,
    $bakimKm,
    $bakimTutar,
    $hasEkstraNot,
    $ekstraNot,
    $boyaParcalar
) {
    $user = medisaFindUserById($data, $tokenData['user_id'] ?? '');
    if (!$user) {
        return medisaBuildErrorResult('Kullanıcı bulunamadı!', 403);
    }

    $vehicleIndex = medisaFindVehicleIndex($data, $aracId);
    if ($vehicleIndex < 0) {
        return medisaBuildErrorResult('Bu Taşıta Erişim Yetkiniz Yok!', 403);
    }

    $vehicle = &$data['tasitlar'][$vehicleIndex];
    $hasAccess = ((string)($vehicle['assignedUserId'] ?? '') === (string)($user['id'] ?? ''));
    if (!$hasAccess) {
        $zimmetliAraclar = $user['zimmetli_araclar'] ?? [];
        $hasAccess = is_array($zimmetliAraclar) && in_array($aracId, $zimmetliAraclar);
    }
    if (!$hasAccess) {
        return medisaBuildErrorResult('Bu Taşıta Erişim Yetkiniz Yok!', 403);
    }

    $versionCheck = medisaEnsureVehicleVersion($vehicle, $vehicleVersion, 'Bu araç başka biri tarafından güncellendi. Güncel veriler yüklendi.');
    if ($versionCheck !== true) {
        return $versionCheck;
    }

    $oncekiKm = 0;
    $vehicleKm = (int)preg_replace('/\D/', '', (string)($vehicle['guncelKm'] ?? $vehicle['km'] ?? '0'));
    if ($vehicleKm > $oncekiKm) {
        $oncekiKm = $vehicleKm;
    }
    foreach (($data['arac_aylik_hareketler'] ?? []) as $kayit) {
        if ((string)($kayit['arac_id'] ?? '') === (string)$aracId && isset($kayit['guncel_km'])) {
            $value = (int)preg_replace('/\D/', '', (string)$kayit['guncel_km']);
            if ($value > $oncekiKm) {
                $oncekiKm = $value;
            }
        }
    }

    if ($oncekiKm > 0 && $guncelKm < $oncekiKm) {
        return medisaBuildErrorResult('Bildirilmek İstenen Km, Önceki Kayıtlarla Uyuşmamaktadır. Şirket Yetkilisi İle Görüşün', 400);
    }

    $warning = null;
    $lastKm = null;
    $lastMonth = date('Y-m', strtotime('-1 month'));
    foreach (($data['arac_aylik_hareketler'] ?? []) as $kayit) {
        if ((string)($kayit['arac_id'] ?? '') === (string)$aracId && (string)($kayit['donem'] ?? '') === $lastMonth) {
            $value = (int)preg_replace('/\D/', '', (string)($kayit['guncel_km'] ?? '0'));
            if ($lastKm === null || $value > $lastKm) {
                $lastKm = $value;
            }
        }
    }
    if ($lastKm !== null && ($guncelKm - $lastKm) > 10000) {
        $warning = '⚠️ Uyarı: KM çok fazla artmış (' . ($guncelKm - $lastKm) . ' km). Lütfen kontrol edin.';
    }

    if (!isset($data['arac_aylik_hareketler']) || !is_array($data['arac_aylik_hareketler'])) {
        $data['arac_aylik_hareketler'] = [];
    }
    $newId = medisaGetNextNumericId($data['arac_aylik_hareketler']);
    $donem = date('Y-m');
    $kayitData = [
        'id' => $newId,
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
        'ekstra_not' => $hasEkstraNot ? $ekstraNot : '',
        'kayit_tarihi' => date('c'),
        'guncelleme_tarihi' => date('c'),
        'durum' => 'onaylandi',
    ];
    $data['arac_aylik_hareketler'][] = $kayitData;

    $kullaniciAdi = $user['isim'] ?? $user['name'] ?? '';
    $eskiKm = $vehicle['guncelKm'] ?? $vehicle['km'] ?? null;
    if ($eskiKm !== null) {
        $eskiKm = (string)$eskiKm;
    }

    $vehicle['guncelKm'] = $guncelKm;
    if (!empty($boyaParcalar)) {
        $mevcut = isset($vehicle['boyaliParcalar']) && is_array($vehicle['boyaliParcalar']) ? $vehicle['boyaliParcalar'] : [];
        $vehicle['boyaliParcalar'] = array_merge($mevcut, $boyaParcalar);
        $vehicle['boya'] = 'var';
    }
    if (!isset($vehicle['events']) || !is_array($vehicle['events'])) {
        $vehicle['events'] = [];
    }

    array_unshift($vehicle['events'], [
        'id' => (string)(time() . $vehicleIndex . 'km'),
        'type' => 'km-revize',
        'date' => date('Y-m-d'),
        'timestamp' => date('c'),
        'data' => [
            'eskiKm' => $eskiKm !== null ? $eskiKm : '',
            'yeniKm' => (string)$guncelKm,
            'surucu' => $kullaniciAdi,
        ],
    ]);

    if ($bakimDurumu && $bakimAciklama !== '') {
        $eventDate = $bakimTarih !== '' ? $bakimTarih : date('Y-m-d');
        array_unshift($vehicle['events'], [
            'id' => (string)(time() . $vehicleIndex . 'b'),
            'type' => 'bakim',
            'date' => $eventDate,
            'timestamp' => date('c'),
            'data' => [
                'islemler' => $bakimAciklama,
                'servis' => $bakimServis,
                'kisi' => $bakimKisi,
                'km' => $bakimKm,
                'tutar' => $bakimTutar,
            ],
        ]);
    }

    if ($kazaDurumu && $kazaAciklama !== '') {
        $eventDate = $kazaTarih !== '' ? $kazaTarih : date('Y-m-d');
        $kazaData = [
            'aciklama' => $kazaAciklama,
            'surucu' => $kullaniciAdi,
            'hasarTutari' => $kazaHasarTutari,
        ];
        if (!empty($boyaParcalar)) {
            $kazaData['hasarParcalari'] = $boyaParcalar;
        }
        array_unshift($vehicle['events'], [
            'id' => (string)(time() . $vehicleIndex . 'k'),
            'type' => 'kaza',
            'date' => $eventDate,
            'timestamp' => date('c'),
            'data' => $kazaData,
        ]);
    }

    if ($hasEkstraNot) {
        $vehicle['sonEkstraNot'] = $ekstraNot;
        $vehicle['sonEkstraNotDonem'] = $donem;
        if ($ekstraNot !== '') {
            array_unshift($vehicle['events'], [
                'id' => (string)(time() . $vehicleIndex . 'n'),
                'type' => 'not-guncelle',
                'date' => date('Y-m-d'),
                'timestamp' => date('c'),
                'data' => [
                    'not' => $ekstraNot,
                    'donem' => $donem,
                    'surucu' => $kullaniciAdi,
                ],
            ]);
        }
    }

    $newVehicleVersion = medisaBumpVehicleVersion($vehicle);

    return [
        'success' => true,
        'warning' => $warning,
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
