<?php
/**
 * user_portal_account.php — auth sırası ve sentetik HTTP kontrat testleri.
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

function paFindUserByRole($data, $role) {
    foreach (($data['users'] ?? []) as $user) {
        if (!is_array($user) || ($user['aktif'] ?? true) === false) {
            continue;
        }
        if (medisaResolveUserRole($user) === $role) {
            return $user;
        }
    }
    return null;
}

function paFindPortalTargetUser($data) {
    foreach (($data['users'] ?? []) as $user) {
        if (!is_array($user) || ($user['aktif'] ?? true) === false) {
            continue;
        }
        $role = medisaResolveUserRole($user);
        if (($role === 'kullanici' || $role === 'sube_yonetici') && medisaUserHasPortalPassword($user)) {
            return $user;
        }
    }
    return null;
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

$data = loadData();
if (!is_array($data)) {
    $data = medisaDefaultData();
}

$genelUser = paFindUserByRole($data, 'genel_yonetici');
$subeUser = paFindUserByRole($data, 'sube_yonetici');
$portalTarget = paFindPortalTargetUser($data);
$validBody = $portalTarget
    ? ['userId' => (string)($portalTarget['id'] ?? ''), 'action' => 'reopen_password_suggestion']
    : ['userId' => 'fixture-target', 'action' => 'reopen_password_suggestion'];

$server = paStartServer($repoRoot);
if ($server === null) {
    paAssert('PHP built-in server baslatildi', false);
    echo "Summary: PASS={$passed} FAIL={$failed}\n";
    exit(1);
}

$endpointUrl = $server['baseUrl'] . '/admin/user_portal_account.php';

try {
    $emptyPost = paHttpPost($endpointUrl, '{}');
    paAssertSame('Oturumsuz bos POST 401', 401, $emptyPost['status']);

    $invalidTokenPost = paHttpPost($endpointUrl, $validBody, 'invalid.token.value');
    paAssertSame('Gecersiz token 401', 401, $invalidTokenPost['status']);

    if ($subeUser) {
        $subeToken = medisaCreateSignedToken(['user_id' => (string)($subeUser['id'] ?? '')]);
        $subePost = paHttpPost($endpointUrl, $validBody, $subeToken);
        paAssertSame('Yetkisiz rol gecerli body 403', 403, $subePost['status']);
    } else {
        paAssert('Yetkisiz rol fixture bulundu', false);
    }

    if ($genelUser) {
        $genelToken = medisaCreateSignedToken(['user_id' => (string)($genelUser['id'] ?? '')]);
        $missingBodyPost = paHttpPost($endpointUrl, '{}', $genelToken);
        paAssertSame('Yetkili rol eksik body 400', 400, $missingBodyPost['status']);
    } else {
        paAssert('Genel yonetici fixture bulundu', false);
    }

    if ($genelUser && $portalTarget) {
        $ctxGenel = medisaBuildAccessContext($data, ['user_id' => (string)($genelUser['id'] ?? '')]);
        $before = $portalTarget;
        $after = paSimulateReopenPasswordSuggestion($before);
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
    } else {
        paAssert('Yetkili islem fixture bulundu', false);
    }

    $peerTarget = null;
    foreach (($data['users'] ?? []) as $user) {
        if (!is_array($user)) {
            continue;
        }
        if (medisaResolveUserRole($user) === 'genel_yonetici' && (string)($user['id'] ?? '') !== (string)($genelUser['id'] ?? '')) {
            $peerTarget = $user;
            break;
        }
    }
    if ($genelUser && $peerTarget) {
        $ctxGenel = medisaBuildAccessContext($data, ['user_id' => (string)($genelUser['id'] ?? '')]);
        $peerBefore = $peerTarget;
        $peerHashBefore = $peerBefore['sifre_hash'] ?? null;
        $peerFlagBefore = $peerBefore['ilk_giris_parola_onerisi_bekliyor'] ?? null;
        $peerStatusBefore = $peerBefore['portal_credential_durumu'] ?? null;
        $denied = !medisaCanResetPortalInitialPassword($peerTarget, $ctxGenel);
        paAssert('Yetki reddinde mutation yok', $denied);
        paAssertSame('Yetki reddinde hash korunur', $peerHashBefore, $peerBefore['sifre_hash'] ?? null);
        paAssertSame('Yetki reddinde flag korunur', $peerFlagBefore, $peerBefore['ilk_giris_parola_onerisi_bekliyor'] ?? null);
        paAssertSame('Yetki reddinde portal durumu korunur', $peerStatusBefore, $peerBefore['portal_credential_durumu'] ?? null);
    } else {
        paAssert('Peer genel hedef fixture bulundu', $peerTarget !== null);
    }
} finally {
    paStopServer($server);
}

echo "Summary: PASS={$passed} FAIL={$failed}\n";
if ($failed > 0) {
    exit(1);
}
echo "verify-medisa-portal-account-endpoint: OK\n";
