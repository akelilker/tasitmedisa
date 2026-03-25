<?php
/**
 * Taşıt Yönetim Sistemi - PHP Core
 * Veri yolu, yükleme/kaydetme, yedekleme ve token doğrulama
 */

/** data/ altında tutulacak zaman damgalı anlık görüntü sayısı üst sınırı */
define('MEDISA_SNAPSHOT_MAX_FILES', 25);

/** Veri dosyasının tam yolu */
function getDataFilePath() {
    return __DIR__ . '/data/data.json';
}

/** data/ dizini */
function getDataDirPath() {
    return dirname(getDataFilePath());
}

/** Bir önceki sürümün kopyası (restore.php ile uyumlu) */
function getMainBackupFilePath() {
    return getDataDirPath() . '/data.json.backup';
}

/** Zaman damgalı yedekler */
function getSnapshotsDirPath() {
    return getDataDirPath() . '/backups';
}

/** Veri dosyasını oku ve decode et. Hata durumunda null döner. */
function loadData() {
    $path = getDataFilePath();
    if (!file_exists($path)) {
        return null;
    }
    $content = file_get_contents($path);
    if ($content === false) {
        return null;
    }
    $data = json_decode($content, true);
    return (json_last_error() === JSON_ERROR_NONE) ? $data : null;
}

/**
 * Mevcut data.json dosyasını yedekler (data.json.backup + data/backups/snapshot-*.json).
 * Tüm sunucu yazımları saveData() üzerinden geçtiği için tek merkezden çalışır.
 *
 * @return array{backup_main: bool, snapshot: bool, snapshot_path: string|null, error: string|null}
 */
function backupDataFileBeforeWrite() {
    $path = getDataFilePath();
    $result = [
        'backup_main' => true,
        'snapshot' => true,
        'snapshot_path' => null,
        'error' => null,
    ];
    if (!file_exists($path)) {
        return $result;
    }
    $dir = getDataDirPath();
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
        $result['backup_main'] = false;
        $result['snapshot'] = false;
        $result['error'] = 'data dizini oluşturulamadı';
        return $result;
    }

    $mainBackup = getMainBackupFilePath();
    if (!@copy($path, $mainBackup)) {
        $result['backup_main'] = false;
        error_log('[Medisa] data.json -> data.json.backup kopyalanamadı');
    }

    $snapDir = getSnapshotsDirPath();
    if (!is_dir($snapDir) && !@mkdir($snapDir, 0755, true)) {
        $result['snapshot'] = false;
        error_log('[Medisa] snapshots dizini oluşturulamadı: ' . $snapDir);
        return $result;
    }

    $snapPath = $snapDir . DIRECTORY_SEPARATOR . 'snapshot-' . date('Y-m-d-His') . '-' . bin2hex(random_bytes(4)) . '.json';
    if (!@copy($path, $snapPath)) {
        $result['snapshot'] = false;
        error_log('[Medisa] anlık yedek kopyalanamadı');
    } else {
        $result['snapshot_path'] = $snapPath;
    }

    medisaPruneSnapshotFiles($snapDir, medisaGetSnapshotMaxFiles());
    return $result;
}

function medisaGetSnapshotMaxFiles() {
    $env = getenv('MEDISA_SNAPSHOT_MAX');
    if ($env !== false && $env !== '') {
        $n = (int)$env;
        if ($n >= 3 && $n <= 200) {
            return $n;
        }
    }
    return MEDISA_SNAPSHOT_MAX_FILES;
}

/**
 * En eski snapshot-*.json dosyalarını siler (üst sınır aşıldığında).
 */
function medisaPruneSnapshotFiles($snapDir, $maxKeep) {
    if (!is_dir($snapDir)) {
        return;
    }
    $pattern = rtrim($snapDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'snapshot-*.json';
    $files = glob($pattern);
    if ($files === false || count($files) <= $maxKeep) {
        return;
    }
    usort($files, function ($a, $b) {
        return filemtime($a) <=> filemtime($b);
    });
    $excess = count($files) - $maxKeep;
    for ($i = 0; $i < $excess; $i++) {
        if (!@unlink($files[$i])) {
            error_log('[Medisa] eski snapshot silinemedi: ' . $files[$i]);
        }
    }
}

/**
 * En yeni snapshot dosyasının tam yolu veya yoksa null (restore yedekleri için).
 */
function findLatestSnapshotPath() {
    $snapDir = getSnapshotsDirPath();
    if (!is_dir($snapDir)) {
        return null;
    }
    $pattern = rtrim($snapDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'snapshot-*.json';
    $files = glob($pattern);
    if ($files === false || $files === []) {
        return null;
    }
    usort($files, function ($a, $b) {
        return filemtime($b) <=> filemtime($a);
    });
    return $files[0];
}

/**
 * Geçici dosyaya yazar, sonra hedefe taşır (yarım kalmış yazım riskini azaltır).
 */
function medisaAtomicWriteFile($path, $content) {
    $dir = dirname($path);
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
        return false;
    }
    $tmp = $dir . DIRECTORY_SEPARATOR . '.write.' . bin2hex(random_bytes(8)) . '.tmp';
    $written = file_put_contents($tmp, $content, LOCK_EX);
    if ($written === false) {
        @unlink($tmp);
        return false;
    }
    $len = strlen($content);
    if ($written !== $len) {
        @unlink($tmp);
        return false;
    }

    clearstatcache(true, $path);
    if (file_exists($path) && PHP_OS_FAMILY === 'Windows') {
        if (!@unlink($path)) {
            @unlink($tmp);
            return false;
        }
    }

    if (@rename($tmp, $path)) {
        return true;
    }
    if (@copy($tmp, $path)) {
        @unlink($tmp);
        return true;
    }
    @unlink($tmp);
    return false;
}

/**
 * Veriyi dosyaya kaydet. Mevcut dosya varsa önce yedeklenir; yazım atomiktir.
 * Başarılı ise true, hata durumunda false döner.
 */
function saveData($data) {
    $path = getDataFilePath();
    $dir = dirname($path);
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
        error_log('[Medisa] saveData: data dizini oluşturulamadı');
        return false;
    }

    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if ($json === false) {
        error_log('[Medisa] saveData: json_encode başarısız');
        return false;
    }

    if (file_exists($path)) {
        $br = backupDataFileBeforeWrite();
        if ($br['error'] !== null) {
            return false;
        }
        if (!$br['backup_main'] && !$br['snapshot']) {
            error_log('[Medisa] saveData: yazımdan önce yedek alınamadı (backup + snapshot başarısız)');
            return false;
        }
    }

    if (!medisaAtomicWriteFile($path, $json)) {
        error_log('[Medisa] saveData: atomik yazım başarısız');
        return false;
    }
    return true;
}

function medisaBase64UrlEncode($input) {
    return rtrim(strtr(base64_encode($input), '+/', '-_'), '=');
}

function medisaBase64UrlDecode($input) {
    $padding = strlen($input) % 4;
    if ($padding > 0) {
        $input .= str_repeat('=', 4 - $padding);
    }
    return base64_decode(strtr($input, '-_', '+/'));
}

function medisaGetTokenSecretFilePath() {
    return getDataDirPath() . '/.medisa_token_secret';
}

function medisaGetTokenSecret() {
    $envSecret = getenv('MEDISA_TOKEN_SECRET');
    if ($envSecret !== false && trim((string)$envSecret) !== '') {
        return trim((string)$envSecret);
    }

    $secretPath = medisaGetTokenSecretFilePath();
    if (file_exists($secretPath)) {
        $secret = trim((string)file_get_contents($secretPath));
        if ($secret !== '') {
            return $secret;
        }
    }

    $dir = getDataDirPath();
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }

    $secret = bin2hex(random_bytes(32));
    @file_put_contents($secretPath, $secret, LOCK_EX);
    @chmod($secretPath, 0600);
    return $secret;
}

function medisaReadAuthorizationHeader() {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    if (!is_array($headers)) {
        $headers = [];
    }

    foreach ($headers as $key => $value) {
        if (strcasecmp((string)$key, 'Authorization') === 0) {
            return trim((string)$value);
        }
    }

    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        return trim((string)$_SERVER['HTTP_AUTHORIZATION']);
    }

    if (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        return trim((string)$_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
    }

    return '';
}

function medisaNormalizeRoleValue($value) {
    $role = trim((string)$value);
    if ($role === '' || $role === 'surucu' || $role === 'driver' || $role === 'sales') {
        return 'kullanici';
    }
    if ($role === 'admin') {
        return 'genel_yonetici';
    }
    if ($role === 'yonetici') {
        return 'sube_yonetici';
    }
    return $role;
}

function medisaResolveUserRole($user) {
    if (!is_array($user)) {
        return 'kullanici';
    }

    $role = medisaNormalizeRoleValue($user['rol'] ?? $user['role'] ?? '');
    if ($role !== 'kullanici' || !empty($user['rol']) || !empty($user['role'])) {
        return $role;
    }

    if (isset($user['tip'])) {
        return medisaNormalizeRoleValue($user['tip']);
    }

    return 'kullanici';
}

function medisaResolveRawUserRoleValue($user) {
    if (!is_array($user)) {
        return '';
    }

    if (isset($user['rol']) && trim((string)$user['rol']) !== '') {
        return trim((string)$user['rol']);
    }
    if (isset($user['role']) && trim((string)$user['role']) !== '') {
        return trim((string)$user['role']);
    }
    if (isset($user['tip']) && trim((string)$user['tip']) !== '') {
        return trim((string)$user['tip']);
    }

    return '';
}

function medisaIsYoneticiOnlyUser($user) {
    return medisaResolveRawUserRoleValue($user) === 'yonetici';
}

function medisaIsBranchManagerRole($role) {
    return $role === 'sube_yonetici' || $role === 'yonetici_kullanici';
}

function medisaHasMainAppAccessRole($role) {
    return $role === 'genel_yonetici' || medisaIsBranchManagerRole($role);
}

function medisaExtractUserBranchIds($user) {
    if (!is_array($user)) {
        return [];
    }

    $branchIds = [];
    if (!empty($user['branchIds']) && is_array($user['branchIds'])) {
        $branchIds = $user['branchIds'];
    } elseif (!empty($user['sube_ids']) && is_array($user['sube_ids'])) {
        $branchIds = $user['sube_ids'];
    } elseif (array_key_exists('branchId', $user) && $user['branchId'] !== '' && $user['branchId'] !== null) {
        $branchIds = [$user['branchId']];
    } elseif (array_key_exists('sube_id', $user) && $user['sube_id'] !== '' && $user['sube_id'] !== null) {
        $branchIds = [$user['sube_id']];
    }

    $normalized = [];
    foreach ($branchIds as $branchId) {
        $value = trim((string)$branchId);
        if ($value !== '') {
            $normalized[$value] = $value;
        }
    }

    return array_values($normalized);
}

function medisaResolvePanelFlag($user) {
    $role = medisaResolveUserRole($user);
    if (is_array($user) && array_key_exists('kullanici_paneli', $user)) {
        return (bool)$user['kullanici_paneli'];
    }
    if (is_array($user) && array_key_exists('surucu_paneli', $user)) {
        return (bool)$user['surucu_paneli'];
    }
    return $role === 'kullanici';
}

function medisaFindUserById($data, $userId) {
    foreach (($data['users'] ?? []) as $user) {
        if ((string)($user['id'] ?? '') === (string)$userId) {
            return $user;
        }
    }
    return null;
}

function medisaUserHasAssignedVehicle($data, $userId) {
    foreach (($data['tasitlar'] ?? []) as $vehicle) {
        if ((string)($vehicle['assignedUserId'] ?? '') === (string)$userId) {
            return true;
        }
    }

    $user = medisaFindUserById($data, $userId);
    if ($user && !empty($user['zimmetli_araclar']) && is_array($user['zimmetli_araclar'])) {
        return count($user['zimmetli_araclar']) > 0;
    }

    return false;
}

function medisaComputeDriverDashboard($user, $data) {
    $role = medisaResolveUserRole($user);
    if (medisaIsYoneticiOnlyUser($user)) {
        return false;
    }

    if ($role === 'kullanici') {
        return true;
    }

    if ($role === 'yonetici_kullanici') {
        return true;
    }

    if ($role === 'sube_yonetici') {
        return medisaResolvePanelFlag($user);
    }

    return $role === 'genel_yonetici';
}

function medisaBuildPermissions($context) {
    $role = $context['role'] ?? 'kullanici';
    $hasMainAppAccess = medisaHasMainAppAccessRole($role);
    return [
        'view_main_app' => $hasMainAppAccess,
        'view_reports' => $hasMainAppAccess,
        'manage_users' => $hasMainAppAccess,
        'manage_branches' => $role === 'genel_yonetici',
        'manage_data' => $role === 'genel_yonetici',
        'manage_settings' => $role === 'genel_yonetici',
    ];
}

function medisaBuildSessionPayload($context) {
    $user = $context['user'] ?? null;
    return [
        'authenticated' => true,
        'user' => [
            'id' => $user['id'] ?? '',
            'isim' => $user['isim'] ?? $user['name'] ?? '',
            'role' => $context['role'] ?? 'kullanici',
            'branch_ids' => $context['branch_ids'] ?? [],
            'kullanici_paneli' => $context['kullanici_paneli'] ?? false,
        ],
        'role' => $context['role'] ?? 'kullanici',
        'branch_ids' => $context['branch_ids'] ?? [],
        'kullanici_paneli' => $context['kullanici_paneli'] ?? false,
        'yonetici_only' => $context['yonetici_only'] ?? false,
        'driver_dashboard' => $context['driver_dashboard'] ?? false,
        'permissions' => medisaBuildPermissions($context),
    ];
}

function medisaBuildAccessContext($data, $tokenData) {
    if (!$tokenData || !isset($tokenData['user_id'])) {
        return null;
    }

    $user = medisaFindUserById($data, $tokenData['user_id']);
    if (!$user) {
        return null;
    }

    $context = [
        'user' => $user,
        'user_id' => (string)($user['id'] ?? ''),
        'role' => medisaResolveUserRole($user),
        'branch_ids' => medisaExtractUserBranchIds($user),
        'kullanici_paneli' => medisaResolvePanelFlag($user),
        'yonetici_only' => medisaIsYoneticiOnlyUser($user),
    ];
    $context['driver_dashboard'] = medisaComputeDriverDashboard($user, $data);
    $context['permissions'] = medisaBuildPermissions($context);

    return $context;
}

function medisaArrayHasId($ids, $needle) {
    foreach ($ids as $id) {
        if ((string)$id === (string)$needle) {
            return true;
        }
    }
    return false;
}

function medisaUserBranchesWithinScope($user, $allowedBranchIds) {
    $targetBranchIds = medisaExtractUserBranchIds($user);
    if (count($targetBranchIds) === 0) {
        return false;
    }

    foreach ($targetBranchIds as $branchId) {
        if (!medisaArrayHasId($allowedBranchIds, $branchId)) {
            return false;
        }
    }

    return true;
}

function medisaCanViewBranchRecord($branch, $context) {
    $role = $context['role'] ?? 'kullanici';
    if ($role === 'genel_yonetici') {
        return true;
    }

    if (!is_array($branch) || !isset($branch['id'])) {
        return false;
    }

    return medisaArrayHasId($context['branch_ids'] ?? [], $branch['id']);
}

function medisaCanViewVehicleRecord($vehicle, $context) {
    $role = $context['role'] ?? 'kullanici';
    if ($role === 'genel_yonetici') {
        return true;
    }

    if (!is_array($vehicle)) {
        return false;
    }

    if (medisaIsBranchManagerRole($role)) {
        return medisaArrayHasId($context['branch_ids'] ?? [], $vehicle['branchId'] ?? '');
    }

    if ($role === 'kullanici') {
        $userId = (string)($context['user_id'] ?? '');
        if ($userId === '') {
            return false;
        }
        if ((string)($vehicle['assignedUserId'] ?? '') === $userId) {
            return true;
        }

        $zimmetliAraclar = $context['user']['zimmetli_araclar'] ?? [];
        return is_array($zimmetliAraclar) && medisaArrayHasId($zimmetliAraclar, $vehicle['id'] ?? '');
    }

    return false;
}

function medisaCanManageVehicleRecord($vehicle, $context) {
    $role = $context['role'] ?? 'kullanici';
    if ($role === 'genel_yonetici') {
        return true;
    }

    if (medisaIsBranchManagerRole($role)) {
        return medisaArrayHasId($context['branch_ids'] ?? [], $vehicle['branchId'] ?? '');
    }

    return false;
}

function medisaCanManageUserRecord($user, $context) {
    $role = $context['role'] ?? 'kullanici';
    if ($role === 'genel_yonetici') {
        return true;
    }

    if (!medisaIsBranchManagerRole($role)) {
        return false;
    }

    $targetRole = medisaResolveUserRole($user);
    if ($targetRole === 'genel_yonetici') {
        return false;
    }

    return medisaUserBranchesWithinScope($user, $context['branch_ids'] ?? []);
}

function medisaCanViewUserRecord($user, $context) {
    $role = $context['role'] ?? 'kullanici';
    if ($role === 'genel_yonetici') {
        return true;
    }

    if (medisaIsBranchManagerRole($role)) {
        return medisaCanManageUserRecord($user, $context);
    }

    return (string)($user['id'] ?? '') === (string)($context['user_id'] ?? '');
}

function medisaFilterDataForContext($data, $context) {
    $visibleVehicles = array_values(array_filter($data['tasitlar'] ?? [], function ($vehicle) use ($context) {
        return medisaCanViewVehicleRecord($vehicle, $context);
    }));

    $visibleUsers = array_values(array_filter($data['users'] ?? [], function ($user) use ($context) {
        return medisaCanViewUserRecord($user, $context);
    }));

    $visibleBranchIds = [];
    foreach (($context['branch_ids'] ?? []) as $branchId) {
        $visibleBranchIds[(string)$branchId] = (string)$branchId;
    }
    foreach ($visibleVehicles as $vehicle) {
        $branchId = trim((string)($vehicle['branchId'] ?? ''));
        if ($branchId !== '') {
            $visibleBranchIds[$branchId] = $branchId;
        }
    }
    foreach ($visibleUsers as $user) {
        foreach (medisaExtractUserBranchIds($user) as $branchId) {
            $visibleBranchIds[(string)$branchId] = (string)$branchId;
        }
    }

    $visibleBranches = array_values(array_filter($data['branches'] ?? [], function ($branch) use ($visibleBranchIds, $context) {
        if (($context['role'] ?? 'kullanici') === 'genel_yonetici') {
            return true;
        }
        return medisaArrayHasId(array_values($visibleBranchIds), $branch['id'] ?? '');
    }));

    $visibleVehicleIds = [];
    foreach ($visibleVehicles as $vehicle) {
        $visibleVehicleIds[(string)($vehicle['id'] ?? '')] = true;
    }

    $visibleAylikKayitlar = array_values(array_filter($data['arac_aylik_hareketler'] ?? [], function ($record) use ($context, $visibleVehicleIds) {
        $vehicleId = (string)($record['arac_id'] ?? '');
        if (($context['role'] ?? 'kullanici') === 'kullanici') {
            return (string)($record['surucu_id'] ?? '') === (string)($context['user_id'] ?? '') && isset($visibleVehicleIds[$vehicleId]);
        }
        return isset($visibleVehicleIds[$vehicleId]);
    }));

    $visibleAylikKayitIds = [];
    foreach ($visibleAylikKayitlar as $record) {
        $recordId = trim((string)($record['id'] ?? ''));
        if ($recordId !== '') {
            $visibleAylikKayitIds[$recordId] = true;
        }
    }

    $visibleTalepler = array_values(array_filter($data['duzeltme_talepleri'] ?? [], function ($request) use ($context, $visibleAylikKayitIds) {
        if (($context['role'] ?? 'kullanici') === 'kullanici') {
            return (string)($request['surucu_id'] ?? '') === (string)($context['user_id'] ?? '');
        }
        return isset($visibleAylikKayitIds[(string)($request['kayit_id'] ?? '')]);
    }));

    return [
        'tasitlar' => $visibleVehicles,
        'kayitlar' => ($context['role'] ?? 'kullanici') === 'genel_yonetici' ? ($data['kayitlar'] ?? []) : [],
        'branches' => $visibleBranches,
        'users' => $visibleUsers,
        'ayarlar' => $data['ayarlar'] ?? [
            'sirketAdi' => 'Medisa',
            'yetkiliKisi' => '',
            'telefon' => '',
            'eposta' => '',
        ],
        'sifreler' => ($context['role'] ?? 'kullanici') === 'genel_yonetici' ? ($data['sifreler'] ?? []) : [],
        'arac_aylik_hareketler' => $visibleAylikKayitlar,
        'duzeltme_talepleri' => $visibleTalepler,
        'session' => medisaBuildSessionPayload($context),
    ];
}

function medisaCreateSignedToken($payload, $ttlSeconds = 2592000) {
    $now = time();
    if (!isset($payload['iat'])) {
        $payload['iat'] = $now;
    }
    if (!isset($payload['exp'])) {
        $payload['exp'] = $now + $ttlSeconds;
    }

    $header = ['alg' => 'HS256', 'typ' => 'JWT'];
    $encodedHeader = medisaBase64UrlEncode(json_encode($header, JSON_UNESCAPED_UNICODE));
    $encodedPayload = medisaBase64UrlEncode(json_encode($payload, JSON_UNESCAPED_UNICODE));
    $signature = hash_hmac('sha256', $encodedHeader . '.' . $encodedPayload, medisaGetTokenSecret(), true);
    $encodedSignature = medisaBase64UrlEncode($signature);

    return $encodedHeader . '.' . $encodedPayload . '.' . $encodedSignature;
}

/** Bearer token doğrula. Geçerliyse decode edilmiş token, değilse null döner. */
function validateToken() {
    $authHeader = medisaReadAuthorizationHeader();
    if (empty($authHeader)) {
        return null;
    }

    $token = preg_replace('/^Bearer\s+/i', '', $authHeader);
    if (!$token || strpos($token, '.') === false) {
        return null;
    }

    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return null;
    }

    [$encodedHeader, $encodedPayload, $encodedSignature] = $parts;
    $expectedSignature = medisaBase64UrlEncode(hash_hmac('sha256', $encodedHeader . '.' . $encodedPayload, medisaGetTokenSecret(), true));
    if (!hash_equals($expectedSignature, $encodedSignature)) {
        return null;
    }

    $decoded = json_decode((string)medisaBase64UrlDecode($encodedPayload), true);
    if (!$decoded || !isset($decoded['exp']) || (int)$decoded['exp'] < time()) {
        return null;
    }

    return $decoded;
}
