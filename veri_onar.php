<?php
/**
 * Veri onarım: silinen şubeleri ve kullanıcıları geri yükler.
 * Kullanımdan sonra bu dosyayı sunucudan silin.
 */
require_once __DIR__ . '/core.php';
header('Content-Type: text/html; charset=utf-8');

function onarHtml($title, $body) {
    echo '<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . $title . '</title>';
    echo '<style>body{font-family:system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem;background:#0f1418;color:#e8e8e8}pre{background:#1a2229;padding:1rem;border-radius:8px;overflow-x:auto;font-size:.82rem;color:#ccc;white-space:pre-wrap}.r{color:#f66}.g{color:#8f8}.y{color:#ff0}a{color:#7ec8ff}button{padding:.7rem 2rem;background:#1a4d2e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;font-size:1rem}button:hover{background:#256b3a}</style></head><body>';
    echo $body;
    echo '</body></html>';
    exit;
}

$defaultBranches = [
    ["id" => "1769175216952", "name" => "Karyapı",        "city" => "Konya",    "createdAt" => "2026-01-23T13:33:36.952Z"],
    ["id" => "1769175230543", "name" => "Karmotors",      "city" => "Silivri",  "createdAt" => "2026-01-23T13:33:50.543Z"],
    ["id" => "1769175251066", "name" => "Medisa",         "city" => "Karabük",  "createdAt" => "2026-01-23T13:34:11.066Z"],
    ["id" => "1769175273226", "name" => "Şenay Mobilya",  "city" => "Karabük",  "createdAt" => "2026-01-23T13:34:33.226Z"],
];

$defaultUsers = [
    [
        "id" => "u1769823278672", "isim" => "İlker AKEL",
        "kullanici_adi" => "ilkerA", "sifre" => "Akel6674",
        "telefon" => "05335413410", "email" => "ilkerakel@hotmail.com",
        "sube_id" => "1769175251066", "sube_ids" => ["1769175251066"],
        "rol" => "genel_yonetici", "tip" => "admin",
        "surucu_paneli" => true, "kullanici_paneli" => true,
        "zimmetli_araclar" => [1770080529726, 1737657600019, 1737657600049],
        "aktif" => true, "kayit_tarihi" => "2026-02-08T04:41:49.439Z", "son_giris" => null,
    ],
    [
        "id" => "u1769900543196", "isim" => "Serhan KÖSE",
        "kullanici_adi" => "SerhanK", "sifre" => "Serhan123",
        "telefon" => "05067025500", "email" => "",
        "sube_id" => "1769175251066", "sube_ids" => ["1769175251066"],
        "rol" => "genel_yonetici", "tip" => "admin",
        "surucu_paneli" => true, "kullanici_paneli" => true,
        "zimmetli_araclar" => [1737657600009],
        "aktif" => true, "kayit_tarihi" => "2026-02-08T04:41:49.439Z", "son_giris" => null,
    ],
    [
        "id" => "u1770525709433", "isim" => "Savaş ŞENAY",
        "kullanici_adi" => "", "sifre" => "",
        "telefon" => "05334422720", "email" => "",
        "sube_id" => "1769175251066", "sube_ids" => ["1769175251066"],
        "rol" => "genel_yonetici", "tip" => "admin",
        "surucu_paneli" => true, "kullanici_paneli" => true,
        "zimmetli_araclar" => [],
        "aktif" => true, "kayit_tarihi" => "2026-02-08T04:41:49.433Z", "son_giris" => null,
    ],
];

$data = loadData();
if (!is_array($data)) {
    $data = medisaDefaultData();
}

$branchCount   = count($data['branches'] ?? []);
$userCount     = count($data['users'] ?? []);
$vehicleCount  = count($data['tasitlar'] ?? []);
$recordCount   = count($data['arac_aylik_hareketler'] ?? []);

$info  = "<h1>Veri Onarım Aracı</h1>";
$info .= "<h3>Sunucudaki mevcut durum:</h3><pre>";
$info .= "Şubeler:       $branchCount\n";
$info .= "Kullanıcılar:  $userCount\n";
$info .= "Araçlar:       $vehicleCount\n";
$info .= "Aylık kayıt:   $recordCount\n";
$info .= "</pre>";

if ($branchCount > 0 && $userCount > 0) {
    $loginCount = 0;
    foreach ($data['users'] as $u) {
        if (is_array($u) && trim((string)($u['kullanici_adi'] ?? '')) !== '') $loginCount++;
    }
    $info .= "<p class='g'>Şube ve kullanıcı verileri mevcut ($loginCount tanesi giriş adına sahip). Geri yüklemeye gerek olmayabilir.</p>";
    $info .= "<p>Yine de geri yüklemek istersen aşağıdaki butona bas.</p>";
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'restore') {
    $changes = [];

    if (!isset($data['branches']) || !is_array($data['branches']) || count($data['branches']) === 0) {
        $data['branches'] = $defaultBranches;
        $changes[] = count($defaultBranches) . " şube geri yüklendi";
    } else {
        $existingIds = array_map(function($b) { return (string)($b['id'] ?? ''); }, $data['branches']);
        $added = 0;
        foreach ($defaultBranches as $db) {
            if (!in_array((string)$db['id'], $existingIds, true)) {
                $data['branches'][] = $db;
                $added++;
            }
        }
        if ($added > 0) $changes[] = "$added eksik şube eklendi";
        else $changes[] = "Tüm şubeler zaten mevcut";
    }

    if (!isset($data['users']) || !is_array($data['users']) || count($data['users']) === 0) {
        $data['users'] = $defaultUsers;
        $changes[] = count($defaultUsers) . " kullanıcı geri yüklendi";
    } else {
        $existingIds = array_map(function($u) { return (string)($u['id'] ?? ''); }, $data['users']);
        $added = 0;
        foreach ($defaultUsers as $du) {
            if (!in_array((string)$du['id'], $existingIds, true)) {
                $data['users'][] = $du;
                $added++;
            } else {
                foreach ($data['users'] as $idx => $eu) {
                    if ((string)($eu['id'] ?? '') === (string)$du['id']) {
                        $data['users'][$idx]['sifre'] = $du['sifre'];
                        $data['users'][$idx]['kullanici_adi'] = $du['kullanici_adi'];
                        $data['users'][$idx]['aktif'] = true;
                        unset($data['users'][$idx]['sifre_hash']);
                        break;
                    }
                }
            }
        }
        if ($added > 0) $changes[] = "$added eksik kullanıcı eklendi";
        $changes[] = "Mevcut kullanıcıların parolaları ve giriş adları sıfırlandı";
    }

    if (!isset($data['ayarlar']) || !is_array($data['ayarlar']) || empty($data['ayarlar']['sirketAdi'])) {
        $data['ayarlar'] = [
            'sirketAdi'   => 'Medisa',
            'yetkiliKisi' => 'İlker',
            'telefon'     => '905559876543',
            'eposta'      => 'info@medisa.com',
        ];
        $changes[] = "Ayarlar geri yüklendi";
    }

    if (saveData($data)) {
        $summary = implode("\n", array_map(function($c) { return "• $c"; }, $changes));
        onarHtml('Tamam', "<h1 class='g'>Geri yükleme tamamlandı!</h1><pre>$summary</pre>"
            . "<p>Giriş bilgileri:</p><pre>ilkerA  /  Akel6674\nSerhanK /  Serhan123</pre>"
            . "<p><a href='driver/'>Sürücü paneline git</a></p>"
            . "<p class='y'>Bu dosyayı (veri_onar.php) sunucudan silin!</p>");
    } else {
        onarHtml('Hata', "<h1 class='r'>data.json yazılamadı!</h1><p>cPanel'den <code>data/data.json</code> dosya izinlerini kontrol edin (644 veya 666).</p>");
    }
}

$info .= '<form method="post">';
$info .= '<input type="hidden" name="action" value="restore">';
$info .= '<br><p>Bu buton şubeleri (4 adet) ve kullanıcıları (3 adet) orijinal halleriyle geri yükler. Mevcut araç ve aylık kayıt verileri <b>korunur</b>.</p>';
$info .= '<button type="submit">Şubeleri ve Kullanıcıları Geri Yükle</button>';
$info .= '</form>';

onarHtml('Veri Onarım', $info);
