<?php
/**
 * Veri onarım aracı: data.json içindeki kullanıcıları kontrol eder,
 * yoksa veya bozuksa varsayılan yönetici ekler.
 * Kullanımdan sonra bu dosyayı sunucudan silin.
 */
require_once __DIR__ . '/core.php';
header('Content-Type: text/html; charset=utf-8');

$html = function($title, $body) {
    echo '<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . $title . '</title>';
    echo '<style>body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;background:#0f1418;color:#e8e8e8}pre{background:#1a2229;padding:1rem;border-radius:8px;overflow-x:auto;font-size:.85rem;color:#8f8}.r{color:#f66}.g{color:#8f8}.y{color:#ff0}a{color:#7ec8ff}</style></head><body>';
    echo $body;
    echo '</body></html>';
    exit;
};

$data = loadData();
if (!is_array($data)) {
    $data = medisaDefaultData();
}
if (!isset($data['users']) || !is_array($data['users'])) {
    $data['users'] = [];
}

$userCount = count($data['users']);
$withLogin = 0;
foreach ($data['users'] as $u) {
    if (!is_array($u)) continue;
    $kad = trim((string)($u['kullanici_adi'] ?? $u['username'] ?? ''));
    if ($kad !== '') $withLogin++;
}

$diag  = "<h1>Veri Onarım</h1>";
$diag .= "<p>Toplam kullanıcı: <b>{$userCount}</b> | Giriş adı tanımlı: <b>{$withLogin}</b></p>";

if ($userCount > 0) {
    $diag .= "<h3>Mevcut kullanıcılar:</h3><pre>";
    foreach ($data['users'] as $i => $u) {
        if (!is_array($u)) continue;
        $id   = $u['id'] ?? '?';
        $isim = $u['isim'] ?? $u['name'] ?? '?';
        $kad  = $u['kullanici_adi'] ?? $u['username'] ?? '';
        $sif  = isset($u['sifre']) && trim((string)$u['sifre']) !== '' ? 'VAR' : '-';
        $hash = isset($u['sifre_hash']) && trim((string)$u['sifre_hash']) !== '' ? 'VAR' : '-';
        $aktif = (!isset($u['aktif']) || $u['aktif'] === true) ? 'Evet' : 'Hayır';
        $rol   = $u['rol'] ?? $u['role'] ?? $u['tip'] ?? '?';
        $diag .= "[$i] $isim | kullanici_adi: " . ($kad ?: '(boş)') . " | sifre: $sif | hash: $hash | aktif: $aktif | rol: $rol\n";
    }
    $diag .= "</pre>";
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'repair') {
    $isim = trim((string)($_POST['isim'] ?? ''));
    $kad  = trim((string)($_POST['kad'] ?? ''));
    $sifre = (string)($_POST['sifre'] ?? '');

    if ($isim === '' || $kad === '' || strlen($sifre) < 4) {
        $html('Hata', $diag . '<p class="r">Tüm alanları doldurun, parola en az 4 karakter.</p><p><a href="">Geri</a></p>');
    }

    $found = false;
    foreach ($data['users'] as $idx => $u) {
        if (!is_array($u)) continue;
        $existing = trim((string)($u['kullanici_adi'] ?? $u['username'] ?? ''));
        if ($existing !== '' && strcasecmp($existing, $kad) === 0) {
            $data['users'][$idx]['sifre'] = $sifre;
            $data['users'][$idx]['aktif'] = true;
            unset($data['users'][$idx]['sifre_hash']);
            $found = true;
            break;
        }
    }

    if (!$found) {
        $branchId = null;
        if (!empty($data['branches'][0]) && is_array($data['branches'][0])) {
            $branchId = $data['branches'][0]['id'] ?? null;
        }
        $data['users'][] = [
            'id'               => 'u' . (string)(int)round(microtime(true) * 1000),
            'isim'             => $isim,
            'kullanici_adi'    => $kad,
            'sifre'            => $sifre,
            'telefon'          => '',
            'email'            => '',
            'sube_id'          => $branchId,
            'sube_ids'         => $branchId !== null ? [$branchId] : [],
            'rol'              => 'genel_yonetici',
            'tip'              => 'admin',
            'surucu_paneli'    => true,
            'kullanici_paneli' => true,
            'zimmetli_araclar' => [],
            'aktif'            => true,
            'kayit_tarihi'     => gmdate('c'),
            'son_giris'        => null,
        ];
    }

    if (saveData($data)) {
        $verb = $found ? 'güncellendi (parola sıfırlandı)' : 'yeni oluşturuldu';
        $html('Tamam', "<h1 class='g'>Hesap $verb!</h1><p>Kullanıcı adı: <b>$kad</b></p><p>Şimdi <a href='driver/'>sürücü panelinden giriş yapabilirsiniz</a>.</p><p class='y'>Bu dosyayı (<code>veri_onar.php</code>) sunucudan silin!</p>");
    } else {
        $html('Hata', "<h1 class='r'>Kayıt başarısız!</h1><p>data/data.json yazılamadı. cPanel'den dosya izinlerini kontrol edin (chmod 664 veya 666).</p>");
    }
}

$form  = '<h3>Yönetici hesabı oluştur / parolasını sıfırla:</h3>';
$form .= '<form method="post"><input type="hidden" name="action" value="repair">';
$form .= '<p><label>Ad soyad<br><input name="isim" value="İlker AKEL" style="width:100%;padding:.4rem;background:#1a2229;color:#fff;border:1px solid #444;border-radius:4px"></label></p>';
$form .= '<p><label>Kullanıcı adı<br><input name="kad" value="ilkerA" style="width:100%;padding:.4rem;background:#1a2229;color:#fff;border:1px solid #444;border-radius:4px"></label></p>';
$form .= '<p><label>Yeni parola<br><input name="sifre" type="text" value="Akel6674" style="width:100%;padding:.4rem;background:#1a2229;color:#fff;border:1px solid #444;border-radius:4px"></label></p>';
$form .= '<p><button type="submit" style="padding:.6rem 1.5rem;background:#1a4d2e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600">Kaydet</button></p>';
$form .= '</form>';

$html('Veri Onarım', $diag . $form);
