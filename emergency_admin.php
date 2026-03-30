<?php
/**
 * Acil yönetici oluşturma (tek seferlik "giriş kapısı").
 *
 * Kullanım:
 * 1) cPanel → data/ içinde boş dosya oluşturun: .medisa_emergency_bootstrap
 * 2) Tarayıcıda açın: .../medisa/emergency_admin.php (kurulum yolunuza göre)
 * 3) Formu doldurup gönderin; kullanıcı data.json'a yazılır, işaret dosyası silinir.
 * 4) Bu sayfayı sunucudan silin veya yeniden kullanmayın.
 *
 * Güvenlik: İşaret dosyası yoksa veya zaten giriş adı tanımlı kullanıcı varsa çalışmaz.
 */
require_once __DIR__ . '/core.php';

$flagPath = getDataDirPath() . DIRECTORY_SEPARATOR . '.medisa_emergency_bootstrap';
$flagPathAlt = getDataDirPath() . DIRECTORY_SEPARATOR . 'medisa_emergency_bootstrap.txt';

// #region agent log
function medisaEmergencyDebugLog($hypothesisId, $location, $message, $data = []) {
    $path = __DIR__ . '/debug-8624d8.log';
    $row = [
        'sessionId' => '8624d8',
        'runId' => 'emergency-entry',
        'hypothesisId' => $hypothesisId,
        'location' => $location,
        'message' => $message,
        'data' => $data,
        'timestamp' => (int) round(microtime(true) * 1000),
    ];
    @file_put_contents($path, json_encode($row, JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
}
// #endregion

function medisaEmergencyCountLoginUsers(array $data) {
    $n = 0;
    foreach ($data['users'] ?? [] as $u) {
        if (!is_array($u)) {
            continue;
        }
        foreach (['kullanici_adi', 'username', 'login'] as $k) {
            if (isset($u[$k]) && trim((string) $u[$k]) !== '') {
                $n++;
                break;
            }
        }
    }
    return $n;
}

function medisaEmergencyRespondHtml($code, $title, $bodyHtml) {
    http_response_code($code);
    header('Content-Type: text/html; charset=utf-8');
    header('X-Robots-Tag: noindex, nofollow');
    echo '<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'
        . htmlspecialchars($title, ENT_QUOTES, 'UTF-8')
        . '</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1rem;background:#0f1418;color:#e8e8e8}a{color:#7ec8ff}input,button{width:100%;box-sizing:border-box;margin:.35rem 0;padding:.55rem;border-radius:6px;border:1px solid #333;background:#1a2229;color:#fff}button{background:#1a4d2e;cursor:pointer;font-weight:600}.err{color:#f66}.ok{color:#8f8}</style></head><body>';
    echo $bodyHtml;
    echo '</body></html>';
    exit;
}

if (!file_exists($flagPath) && !file_exists($flagPathAlt)) {
    // #region agent log
    medisaEmergencyDebugLog('H1', 'emergency_admin.php:flag_check', 'forbidden_missing_flag', [
        'flagDotExists' => file_exists($flagPath),
        'flagAltExists' => file_exists($flagPathAlt),
        'dataDirReadable' => is_readable(getDataDirPath()),
        'method' => (string)($_SERVER['REQUEST_METHOD'] ?? ''),
    ]);
    // #endregion
    medisaEmergencyRespondHtml(
        403,
        'Kullanılamıyor',
        '<h1>Acil kurulum kapalı</h1><p class="err">Sunucuda <code>data/.medisa_emergency_bootstrap</code> veya <code>data/medisa_emergency_bootstrap.txt</code> dosyası yok. cPanel ile birini oluşturup sayfayı yenileyin.</p>'
    );
}

$dataProbe = loadData();
if (!is_array($dataProbe)) {
    $dataProbe = medisaDefaultData();
}
if (medisaEmergencyCountLoginUsers($dataProbe) > 0) {
    // #region agent log
    medisaEmergencyDebugLog('H2', 'emergency_admin.php:precheck_users', 'forbidden_users_exist', [
        'loginUsers' => medisaEmergencyCountLoginUsers($dataProbe),
    ]);
    // #endregion
    @unlink($flagPath);
    @unlink($flagPathAlt);
    medisaEmergencyRespondHtml(
        403,
        'Gerek yok',
        '<h1>İşlem yapılmadı</h1><p>Zaten giriş adı tanımlı kullanıcılar var. İşaret dosyası silindi. Normal giriş veya ana uygulama → Ayarlar üzerinden devam edin.</p>'
    );
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // #region agent log
    medisaEmergencyDebugLog('H1', 'emergency_admin.php:get_form', 'form_rendered', [
        'flagDotExists' => file_exists($flagPath),
        'flagAltExists' => file_exists($flagPathAlt),
    ]);
    // #endregion
    medisaEmergencyRespondHtml(
        200,
        'Acil yönetici',
        '<h1>Acil yönetici hesabı</h1><p>Veriler silinmiş veya hiç kullanıcı yoksa buradan <strong>bir</strong> yönetici ekleyebilirsiniz. İşlem bitince işaret dosyası kaldırılır.</p>'
        . '<form method="post" action="">'
        . '<label>Ad soyad<br><input name="isim" required maxlength="120" autocomplete="name"></label>'
        . '<label>Kullanıcı adı (sürücü paneli)<br><input name="kullanici_adi" required maxlength="64" autocomplete="username"></label>'
        . '<label>Şifre<br><input name="sifre" type="password" required minlength="6" maxlength="128" autocomplete="new-password"></label>'
        . '<button type="submit">Hesabı oluştur</button></form>'
        . '<p style="font-size:.85rem;opacity:.85">Sonra bu dosyayı (<code>emergency_admin.php</code>) sunucudan silmeniz önerilir.</p>'
    );
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    medisaEmergencyRespondHtml(405, 'Yöntem', '<p class="err">Yalnızca POST.</p>');
}

$isim = trim((string) ($_POST['isim'] ?? ''));
$kad = trim((string) ($_POST['kullanici_adi'] ?? ''));
$sifre = (string) ($_POST['sifre'] ?? '');

if ($isim === '' || $kad === '' || strlen($sifre) < 6) {
    medisaEmergencyRespondHtml(400, 'Eksik', '<p class="err">Tüm alanları doldurun; şifre en az 6 karakter.</p><p><a href="">Geri</a></p>');
}

$result = medisaMutateData(function (&$data) use ($isim, $kad, $sifre) {
    if (!is_array($data)) {
        $data = medisaDefaultData();
    }
    if (!isset($data['users']) || !is_array($data['users'])) {
        $data['users'] = [];
    }

    if (medisaEmergencyCountLoginUsers($data) > 0) {
        return medisaBuildErrorResult('Zaten tanımlı kullanıcı var.', 403);
    }

    $dup = false;
    foreach ($data['users'] as $u) {
        if (!is_array($u)) {
            continue;
        }
        $existing = trim((string) ($u['kullanici_adi'] ?? $u['username'] ?? ''));
        if ($existing !== '' && strcasecmp($existing, $kad) === 0) {
            $dup = true;
            break;
        }
    }
    if ($dup) {
        return medisaBuildErrorResult('Bu kullanıcı adı zaten kayıtlı.', 400);
    }

    $branchId = null;
    if (!empty($data['branches'][0]) && is_array($data['branches'][0])) {
        $branchId = $data['branches'][0]['id'] ?? null;
    }

    $newUser = [
        'id' => 'u' . (string) (int) round(microtime(true) * 1000),
        'isim' => $isim,
        'kullanici_adi' => $kad,
        'sifre' => $sifre,
        'telefon' => '',
        'email' => '',
        'sube_id' => $branchId,
        'sube_ids' => $branchId !== null && $branchId !== '' ? [$branchId] : [],
        'rol' => 'genel_yonetici',
        'tip' => 'admin',
        'surucu_paneli' => true,
        'kullanici_paneli' => true,
        'zimmetli_araclar' => [],
        'aktif' => true,
        'kayit_tarihi' => gmdate('c'),
        'son_giris' => null,
    ];

    $data['users'][] = $newUser;

    return array_merge(medisaBuildMutationResult(true), ['save' => true, 'user_id' => $newUser['id']]);
});

if (($result['success'] ?? false) !== true) {
    // #region agent log
    medisaEmergencyDebugLog('H3', 'emergency_admin.php:mutate_fail', 'create_user_failed', [
        'status' => (int) ($result['status'] ?? 500),
        'message' => (string) ($result['message'] ?? ''),
    ]);
    // #endregion
    $msg = htmlspecialchars($result['message'] ?? 'Hata', ENT_QUOTES, 'UTF-8');
    medisaEmergencyRespondHtml((int) ($result['status'] ?? 500), 'Hata', '<p class="err">' . $msg . '</p><p><a href="">Geri</a></p>');
}

@unlink($flagPath);
@unlink($flagPathAlt);

// #region agent log
medisaEmergencyDebugLog('H3', 'emergency_admin.php:mutate_success', 'create_user_ok', []);
// #endregion

medisaEmergencyRespondHtml(
    200,
    'Tamam',
    '<h1 class="ok">Hesap oluşturuldu</h1><p>Artık sürücü panelinden bu kullanıcı adı ve şifre ile giriş yapabilirsiniz.</p>'
    . '<p><strong>Önemli:</strong> <code>emergency_admin.php</code> dosyasını sunucudan silin.</p>'
);
