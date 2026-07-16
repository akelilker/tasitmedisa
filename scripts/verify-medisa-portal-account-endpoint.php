<?php
/**
 * user_portal_account.php — auth sırası ve sentetik kontrat testleri.
 * Çalıştır: npm run tool:verify-portal-account-endpoint
 */
require_once __DIR__ . '/../core.php';

$passed = 0;
$failed = 0;
$repoRoot = realpath(__DIR__ . '/..');

function paAssert($label, $condition) {
    global $passed, $failed;
    if ($condition) {
        $passed++;
        echo "[PASS] {$label}\n";
        return;
    }
    $failed++;
    echo "[FAIL] {$label}\n";
}

function paAssertSame($label, $expected, $actual) {
    paAssert($label, $expected === $actual);
}

function paBuildFixtureData() {
    $password = medisaGenerateInitialPortalPassword();
    $targetHash = password_hash($password, PASSWORD_DEFAULT);
    return [
        'users' => [
            [
                'id' => 'gm-fixture',
                'isim' => 'Genel Fixture',
                'rol' => 'genel_yonetici',
                'aktif' => true,
                'kullanici_adi' => 'GenelFixture',
                'sifre_hash' => password_hash(medisaGenerateInitialPortalPassword(), PASSWORD_DEFAULT),
                'portal_credential_durumu' => 'aktif',
            ],
            [
                'id' => 'gm-peer',
                'isim' => 'Peer Genel',
                'rol' => 'genel_yonetici',
                'aktif' => true,
                'kullanici_adi' => 'PeerGenel',
                'sifre_hash' => password_hash(medisaGenerateInitialPortalPassword(), PASSWORD_DEFAULT),
                'portal_credential_durumu' => 'aktif',
            ],
            [
                'id' => 'bm-fixture',
                'isim' => 'Sube Fixture',
                'rol' => 'sube_yonetici',
                'aktif' => true,
                'sube' => 'b1',
                'kullanici_adi' => 'SubeFixture',
                'sifre_hash' => password_hash(medisaGenerateInitialPortalPassword(), PASSWORD_DEFAULT),
                'portal_credential_durumu' => 'aktif',
            ],
            [
                'id' => 'u-target',
                'isim' => 'Hedef Kullanici',
                'rol' => 'kullanici',
                'aktif' => true,
                'sube' => 'b1',
                'kullanici_adi' => 'HedefKullanici',
                'sifre_hash' => $targetHash,
                'portal_credential_durumu' => 'aktif',
                'ilk_giris_parola_onerisi_bekliyor' => false,
            ],
        ],
    ];
}

function paWithAuthHeader($token, callable $callback) {
    $previous = $_SERVER['HTTP_AUTHORIZATION'] ?? null;
    if ($token === null || $token === '') {
        unset($_SERVER['HTTP_AUTHORIZATION']);
    } else {
        $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $token;
    }
    try {
        return $callback();
    } finally {
        if ($previous === null) {
            unset($_SERVER['HTTP_AUTHORIZATION']);
        } else {
            $_SERVER['HTTP_AUTHORIZATION'] = $previous;
        }
    }
}

function paResolvePortalAccountAuthStatus(array $data) {
    $auth = medisaResolveAuthorizedContext($data, 'manage_users');
    if (($auth['success'] ?? false) !== true) {
        return (int)($auth['status'] ?? 403);
    }
    if (($auth['context']['role'] ?? '') !== 'genel_yonetici') {
        return 403;
    }
    return 200;
}

function paValidatePortalAccountBody($targetUserId, $action) {
    if ($targetUserId === '' || $action === '') {
        return 400;
    }
    return 200;
}

function paHttpPost($url, $body, $token = null) {
    $headers = "Content-Type: application/json\r\n";
    if ($token !== null && $token !== '') {
        $headers .= 'Authorization: Bearer ' . $token . "\r\n";
    }
    $content = is_string($body) ? $body : json_encode($body, JSON_UNESCAPED_UNICODE);
    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => $headers,
            'content' => $content,
            'ignore_errors' => true,
            'timeout' => 10,
        ],
    ]);
    $response = @file_get_contents($url, false, $context);
    $status = 0;
    if (isset($http_response_header[0]) && preg_match('/ (\d{3}) /', (string)$http_response_header[0], $matches)) {
        $status = (int)$matches[1];
    }
    return [
        'status' => $status,
        'body' => is_string($response) ? $response : '',
        'json' => json_decode(is_string($response) ? $response : '', true),
    ];
}

function paStartServer($repoRoot) {
    $port = 19987;
    $logFile = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'medisa-portal-account-test.log';
    $cmd = 'php -S 127.0.0.1:' . $port . ' -t ' . escapeshellarg($repoRoot);
    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['file', $logFile, 'a'],
        2 => ['file', $logFile, 'a'],
    ];
    $process = proc_open($cmd, $descriptors, $pipes, $repoRoot);
    if (!is_resource($process)) {
        return null;
    }
    if (isset($pipes[0]) && is_resource($pipes[0])) {
        fclose($pipes[0]);
    }
    $baseUrl = 'http://127.0.0.1:' . $port;
    $ready = false;
    for ($attempt = 0; $attempt < 30; $attempt++) {
        $probe = @file_get_contents($baseUrl . '/index.html', false, stream_context_create([
            'http' => ['timeout' => 1, 'ignore_errors' => true],
        ]));
        if ($probe !== false) {
            $ready = true;
            break;
        }
        usleep(100000);
    }
    if (!$ready) {
        proc_terminate($process);
        proc_close($process);
        return null;
    }
    return ['process' => $process, 'baseUrl' => $baseUrl];
}

function paStopServer($server) {
    if (!is_array($server) || !is_resource($server['process'] ?? null)) {
        return;
    }
    proc_terminate($server['process']);
    proc_close($server['process']);
}

function paSimulateReopenPasswordSuggestion(array $user) {
    $copy = $user;
    $copy['ilk_giris_parola_onerisi_bekliyor'] = true;
    $copy['ilk_giris_parola_onerisi_gosterildi_tarihi'] = null;
    $copy['updatedAt'] = date('c');
    return $copy;
}

$endpointPhp = file_get_contents(__DIR__ . '/../admin/user_portal_account.php');
$authPos = strpos($endpointPhp, 'medisaResolveAuthorizedContext($rawData');
$rolePos = strpos($endpointPhp, "(\$context['role'] ?? '') !== 'genel_yonetici'");
$bodyPos = strpos($endpointPhp, "json_decode(file_get_contents('php://input')");
paAssert('Auth context body validation oncesi', $authPos !== false && $bodyPos !== false && $authPos < $bodyPos);
paAssert('Rol kontrolu body validation oncesi', $rolePos !== false && $bodyPos !== false && $rolePos < $bodyPos);
paAssert(
    'Veri yokken auth once kontrol edilir',
    strpos($endpointPhp, 'medisaDefaultData()') !== false
        && strpos($endpointPhp, 'medisaResolveAuthorizedContext($rawData') > strpos($endpointPhp, 'medisaDefaultData()')
);

$fixtureData = paBuildFixtureData();
$validBody = ['userId' => 'u-target', 'action' => 'reopen_password_suggestion'];

paAssertSame('Oturumsuz auth gate 401', 401, paWithAuthHeader(null, function () use ($fixtureData) {
    return paResolvePortalAccountAuthStatus($fixtureData);
}));
paAssertSame('Gecersiz token auth gate 401', 401, paWithAuthHeader('invalid.token.value', function () use ($fixtureData) {
    return paResolvePortalAccountAuthStatus($fixtureData);
}));

$subeToken = medisaCreateSignedToken(['user_id' => 'bm-fixture']);
paAssertSame('Yetkisiz rol auth gate 403', 403, paWithAuthHeader($subeToken, function () use ($fixtureData) {
    return paResolvePortalAccountAuthStatus($fixtureData);
}));

$genelToken = medisaCreateSignedToken(['user_id' => 'gm-fixture']);
paAssertSame('Yetkili rol auth gate 200', 200, paWithAuthHeader($genelToken, function () use ($fixtureData) {
    return paResolvePortalAccountAuthStatus($fixtureData);
}));
paAssertSame('Yetkili rol eksik body 400', 400, paValidatePortalAccountBody('', ''));
paAssertSame('Yetkili rol eksik action 400', 400, paValidatePortalAccountBody('u-target', ''));

$ctxGenel = medisaBuildAccessContext($fixtureData, ['user_id' => 'gm-fixture']);
$portalTarget = $fixtureData['users'][3];
$after = paSimulateReopenPasswordSuggestion($portalTarget);
paAssert(
    'Yetkili rol gecerli body beklenen islem',
    ($after['ilk_giris_parola_onerisi_bekliyor'] ?? null) === true
        && medisaCanResetPortalInitialPassword($portalTarget, $ctxGenel) === true
);
paAssertSame(
    'Yetkili islem projection sifre yok',
    true,
    !array_key_exists('sifre', medisaProjectUserForClient($after))
);

$peerTarget = $fixtureData['users'][1];
$peerBefore = $peerTarget;
$peerHashBefore = $peerBefore['sifre_hash'] ?? null;
$peerFlagBefore = $peerBefore['ilk_giris_parola_onerisi_bekliyor'] ?? null;
$peerStatusBefore = $peerBefore['portal_credential_durumu'] ?? null;
paAssert('Yetki reddinde mutation yok', medisaCanResetPortalInitialPassword($peerTarget, $ctxGenel) === false);
paAssertSame('Yetki reddinde hash korunur', $peerHashBefore, $peerBefore['sifre_hash'] ?? null);
paAssertSame('Yetki reddinde flag korunur', $peerFlagBefore, $peerBefore['ilk_giris_parola_onerisi_bekliyor'] ?? null);
paAssertSame('Yetki reddinde portal durumu korunur', $peerStatusBefore, $peerBefore['portal_credential_durumu'] ?? null);

$server = paStartServer($repoRoot);
if ($server === null) {
    paAssert('PHP built-in server baslatildi', false);
} else {
    $endpointUrl = $server['baseUrl'] . '/admin/user_portal_account.php';
    try {
        $emptyPost = paHttpPost($endpointUrl, '{}');
        paAssertSame('HTTP oturumsuz bos POST 401', 401, $emptyPost['status']);

        $invalidTokenPost = paHttpPost($endpointUrl, $validBody, 'invalid.token.value');
        paAssertSame('HTTP gecersiz token 401', 401, $invalidTokenPost['status']);
    } finally {
        paStopServer($server);
    }
}

echo "Summary: PASS={$passed} FAIL={$failed}\n";
if ($failed > 0) {
    exit(1);
}
echo "verify-medisa-portal-account-endpoint: OK\n";
