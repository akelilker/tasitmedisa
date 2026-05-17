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

/** Kasko ham Excel tablosu — ana data.json dışında tutulur */
function getKaskoListesiFilePath() {
    return getDataDirPath() . DIRECTORY_SEPARATOR . 'kasko-deger-listesi.json';
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

function medisaDefaultData() {
    return [
        'tasitlar' => [],
        'kayitlar' => [],
        'branches' => [],
        'users' => [],
        'ayarlar' => [
            'sirketAdi' => 'Medisa',
            'yetkiliKisi' => '',
            'telefon' => '',
            'eposta' => '',
            'k2Belgesi' => [
                'expiryDate' => '',
                'documentPath' => '',
                'updatedAt' => '',
            ],
        ],
        'sifreler' => [],
        'arac_aylik_hareketler' => [],
        'duzeltme_talepleri' => [],
        'notificationReadState' => [],
        'monthlyTodoWhatsAppLogs' => [],
    ];
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

    /** Ham kasko listesi ayrı dosyada; eski anahtar varsa ana dosyaya yazılmasın */
    unset($data['kaskoDegerListesi']);

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

function medisaGetDataLockFilePath() {
    return getDataDirPath() . '/.medisa_data.lock';
}

function medisaAcquireDataLock() {
    $dir = getDataDirPath();
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
        return false;
    }

    $lockPath = medisaGetDataLockFilePath();
    $handle = @fopen($lockPath, 'c+');
    if (!$handle) {
        return false;
    }

    if (!@flock($handle, LOCK_EX)) {
        @fclose($handle);
        return false;
    }

    return $handle;
}

function medisaReleaseDataLock($handle) {
    if (!is_resource($handle)) {
        return;
    }
    @flock($handle, LOCK_UN);
    @fclose($handle);
}

function medisaBuildMutationResult($success, $extra = []) {
    return array_merge(['success' => (bool)$success], is_array($extra) ? $extra : []);
}

function medisaBuildConflictResult($entity, $id, $message) {
    return [
        'success' => false,
        'conflict' => true,
        'entity' => (string)$entity,
        'id' => $id !== null ? (string)$id : '',
        'message' => $message ?: 'Veri başka biri tarafından güncellendi.',
        'status' => 409,
    ];
}

function medisaBuildErrorResult($message, $status = 400, $extra = []) {
    return array_merge([
        'success' => false,
        'message' => $message,
        'status' => (int)$status,
    ], is_array($extra) ? $extra : []);
}

function medisaMutateData(callable $mutator) {
    $lockHandle = medisaAcquireDataLock();
    if (!$lockHandle) {
        return medisaBuildErrorResult('Veri kilidi alınamadı.', 500);
    }

    try {
        $data = loadData();
        if (!is_array($data)) {
            $data = medisaDefaultData();
        }

        $result = call_user_func_array($mutator, [&$data]);
        if (!is_array($result)) {
            $result = medisaBuildMutationResult((bool)$result);
        }

        if (!empty($result['conflict'])) {
            if (empty($result['status'])) {
                $result['status'] = 409;
            }
            return $result;
        }

        if (($result['success'] ?? true) !== true) {
            return $result;
        }

        $shouldSave = !array_key_exists('save', $result) || $result['save'] !== false;
        if ($shouldSave && !saveData($data)) {
            return medisaBuildErrorResult('Kayıt sırasında hata oluştu!', 500);
        }

        return $result;
    } finally {
        medisaReleaseDataLock($lockHandle);
    }
}

function medisaFindVehicleIndex($data, $vehicleId) {
    foreach (($data['tasitlar'] ?? []) as $idx => $vehicle) {
        if ((string)($vehicle['id'] ?? '') === (string)$vehicleId) {
            return $idx;
        }
    }
    return -1;
}

function medisaFindMonthlyRecordIndex($data, $recordId) {
    foreach (($data['arac_aylik_hareketler'] ?? []) as $idx => $record) {
        if ((string)($record['id'] ?? '') === (string)$recordId) {
            return $idx;
        }
    }
    return -1;
}

function medisaFindCorrectionRequestIndex($data, $requestId) {
    foreach (($data['duzeltme_talepleri'] ?? []) as $idx => $request) {
        if ((string)($request['id'] ?? '') === (string)$requestId) {
            return $idx;
        }
    }
    return -1;
}

function medisaGetNextNumericId($items) {
    $nextId = 1;
    foreach ((array)$items as $item) {
        $candidate = isset($item['id']) ? (int)$item['id'] : 0;
        if ($candidate >= $nextId) {
            $nextId = $candidate + 1;
        }
    }
    return $nextId;
}

function medisaGetVehicleVersion($vehicle) {
    $version = isset($vehicle['version']) ? (int)$vehicle['version'] : 0;
    return $version > 0 ? $version : 1;
}

function medisaEnsureVehicleVersion($vehicle, $expectedVersion, $message = '') {
    if ($expectedVersion === null || $expectedVersion === '') {
        return medisaBuildErrorResult('Taşıt sürümü eksik.', 400, [
            'entity' => 'vehicle',
            'id' => (string)($vehicle['id'] ?? ''),
        ]);
    }

    $currentVersion = medisaGetVehicleVersion($vehicle);
    if ((int)$expectedVersion !== $currentVersion) {
        return medisaBuildConflictResult(
            'vehicle',
            $vehicle['id'] ?? '',
            $message ?: 'Bu taşıt başka biri tarafından güncellendi. Güncel veriler yüklendi.'
        );
    }

    return true;
}

function medisaBumpVehicleVersion(&$vehicle) {
    $vehicle['version'] = medisaGetVehicleVersion($vehicle) + 1;
    return (int)$vehicle['version'];
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
    if ($role === 'yonetici_kullanici') {
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

function medisaExtractBearerTokenValue($authHeader) {
    $value = trim((string)$authHeader);
    if ($value === '') {
        return '';
    }

    $token = preg_replace('/^Bearer\s+/i', '', $value);
    $token = trim((string)$token);
    if ($token === '' || strpos($token, '.') === false) {
        return '';
    }

    return $token;
}

function medisaReadAccessToken($allowQueryToken = false) {
    $token = medisaExtractBearerTokenValue(medisaReadAuthorizationHeader());
    if ($token !== '') {
        return $token;
    }

    if (!$allowQueryToken) {
        return '';
    }

    $queryToken = trim((string)($_GET['token'] ?? $_POST['token'] ?? ''));
    if ($queryToken === '' || strpos($queryToken, '.') === false) {
        return '';
    }

    return $queryToken;
}

function medisaIsYoneticiOnlyUser($user) {
    return medisaResolveRawUserRoleValue($user) === 'yonetici';
}

function medisaIsBranchManagerRole($role) {
    return $role === 'sube_yonetici';
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

function medisaUserHasPortalPassword($user) {
    if (!is_array($user)) {
        return false;
    }

    $plainPassword = isset($user['sifre']) ? trim((string)$user['sifre']) : '';
    $passwordHash = isset($user['sifre_hash']) ? trim((string)$user['sifre_hash']) : '';

    return $plainPassword !== '' || $passwordHash !== '';
}

function medisaVerifyUserPassword($user, $password) {
    if (!is_array($user)) {
        return false;
    }

    $inputPassword = trim((string)$password);
    if ($inputPassword === '') {
        return false;
    }

    $passwordHash = isset($user['sifre_hash']) ? trim((string)$user['sifre_hash']) : '';
    if ($passwordHash !== '') {
        return password_verify($inputPassword, $passwordHash);
    }

    $plainPassword = isset($user['sifre']) ? trim((string)$user['sifre']) : '';
    return $plainPassword !== '' && hash_equals($plainPassword, $inputPassword);
}

function medisaSetUserPasswordHash(&$user, $password) {
    if (!is_array($user)) {
        $user = [];
    }

    $user['sifre_hash'] = password_hash(trim((string)$password), PASSWORD_DEFAULT);
    $user['sifre_guncellendi_at'] = date('c');
    unset($user['sifre']);
}

function medisaComputeDriverDashboard($user, $data) {
    if (medisaIsYoneticiOnlyUser($user)) {
        return false;
    }

    $role = medisaResolveUserRole($user);
    $userId = (string)($user['id'] ?? '');
    if ($userId === '' || !is_array($data)) {
        return false;
    }

    if (!in_array($role, ['kullanici', 'sube_yonetici', 'genel_yonetici'], true)) {
        return false;
    }

    if (in_array($role, ['sube_yonetici', 'genel_yonetici'], true)) {
        return true;
    }

    return medisaUserHasAssignedVehicle($data, $userId);
}

function medisaBuildPermissions($context) {
    $role = $context['role'] ?? 'kullanici';
    $hasMainAppAccess = medisaHasMainAppAccessRole($role);
    $canManageGlobalData = in_array($role, ['genel_yonetici', 'sube_yonetici'], true);
    return [
        'view_main_app' => $hasMainAppAccess,
        'view_reports' => $hasMainAppAccess,
        'manage_users' => $hasMainAppAccess,
        'manage_branches' => $role === 'genel_yonetici',
        'manage_data' => $canManageGlobalData,
        'manage_settings' => $canManageGlobalData,
    ];
}

function medisaContextHasPermission($context, $permission) {
    return is_array($context)
        && is_array($context['permissions'] ?? null)
        && !empty($context['permissions'][$permission]);
}

function medisaContextCanAccessMainApp($context) {
    return medisaContextHasPermission($context, 'view_main_app');
}

function medisaContextCanViewReports($context) {
    return medisaContextHasPermission($context, 'view_reports');
}

function medisaContextCanManageGlobalData($context) {
    return medisaContextHasPermission($context, 'manage_data');
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

    $driverDashboard = medisaComputeDriverDashboard($user, $data);
    $context = [
        'user' => $user,
        'user_id' => (string)($user['id'] ?? ''),
        'role' => medisaResolveUserRole($user),
        'branch_ids' => medisaExtractUserBranchIds($user),
        'kullanici_paneli' => $driverDashboard,
        'yonetici_only' => medisaIsYoneticiOnlyUser($user),
        'driver_dashboard' => $driverDashboard,
    ];
    $context['permissions'] = medisaBuildPermissions($context);

    return $context;
}

function medisaResolveAuthorizedContext($data, $requiredPermission = '', $allowQueryToken = false) {
    $tokenData = validateToken($allowQueryToken);
    if (!$tokenData) {
        return [
            'success' => false,
            'status' => 401,
            'message' => 'Oturum gerekli.',
        ];
    }

    $context = medisaBuildAccessContext($data, $tokenData);
    if (!$context) {
        return [
            'success' => false,
            'status' => 403,
            'message' => 'Bu işlem için yetkiniz yok.',
        ];
    }

    if ($requiredPermission !== '' && !medisaContextHasPermission($context, $requiredPermission)) {
        return [
            'success' => false,
            'status' => 403,
            'message' => 'Bu işlem için yetkiniz yok.',
            'permission_denied' => true,
        ];
    }

    return [
        'success' => true,
        'context' => $context,
        'token' => $tokenData,
    ];
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

    if ((string)($user['id'] ?? '') === (string)($context['user_id'] ?? '')) {
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

function medisaCanViewReportUserRecord($user, $context) {
    $role = $context['role'] ?? 'kullanici';
    if ($role === 'genel_yonetici') {
        return true;
    }

    if (medisaIsBranchManagerRole($role)) {
        $targetRole = medisaResolveUserRole($user);
        if ($targetRole === 'genel_yonetici') {
            return false;
        }

        return medisaUserBranchesWithinScope($user, $context['branch_ids'] ?? []);
    }

    return (string)($user['id'] ?? '') === (string)($context['user_id'] ?? '');
}

function medisaFilterDataForContextWithUserPredicate($data, $context, $userPredicate) {
    $visibleVehicles = array_values(array_filter($data['tasitlar'] ?? [], function ($vehicle) use ($context) {
        return medisaCanViewVehicleRecord($vehicle, $context);
    }));

    $visibleUsers = array_values(array_filter($data['users'] ?? [], function ($user) use ($context, $userPredicate) {
        return is_callable($userPredicate) ? (bool)call_user_func($userPredicate, $user, $context) : false;
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

    /* Aylık hareket: görünür taşıta ait tüm kayıtlar (sürücü KM/talep eşlemesi için surucu_id ile daraltma yok). */
    $visibleAylikKayitlar = array_values(array_filter($data['arac_aylik_hareketler'] ?? [], function ($record) use ($visibleVehicleIds) {
        $vehicleId = (string)($record['arac_id'] ?? '');
        return isset($visibleVehicleIds[$vehicleId]);
    }));

    $visibleAylikKayitIds = [];
    foreach ($visibleAylikKayitlar as $record) {
        $recordId = trim((string)($record['id'] ?? ''));
        if ($recordId !== '') {
            $visibleAylikKayitIds[$recordId] = true;
        }
    }

    $visibleTalepler = array_values(array_filter($data['duzeltme_talepleri'] ?? [], function ($request) use ($visibleAylikKayitIds, $visibleVehicleIds) {
        $requestVehicleId = (string)($request['arac_id'] ?? '');
        if ($requestVehicleId !== '' && isset($visibleVehicleIds[$requestVehicleId])) {
            return true;
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
            'k2Belgesi' => [
                'expiryDate' => '',
                'documentPath' => '',
                'updatedAt' => '',
            ],
        ],
        'sifreler' => ($context['role'] ?? 'kullanici') === 'genel_yonetici' ? ($data['sifreler'] ?? []) : [],
        'arac_aylik_hareketler' => $visibleAylikKayitlar,
        'duzeltme_talepleri' => $visibleTalepler,
        /** Tam rows load_kasko.php ile; ana yanıt şişmesin */
        'kaskoDegerListesi' => [
            'updatedAt' => '',
            'period' => '',
            'sourceFileName' => '',
            'rows' => [],
        ],
        'notificationReadState' => is_array($data['notificationReadState'] ?? null) ? $data['notificationReadState'] : [],
        'monthlyTodoWhatsAppLogs' => is_array($data['monthlyTodoWhatsAppLogs'] ?? null) ? $data['monthlyTodoWhatsAppLogs'] : [],
        'session' => medisaBuildSessionPayload($context),
    ];
}

function medisaFilterDataForContext($data, $context) {
    return medisaFilterDataForContextWithUserPredicate($data, $context, 'medisaCanViewUserRecord');
}

function medisaFilterReportDataForContext($data, $context) {
    return medisaFilterDataForContextWithUserPredicate($data, $context, 'medisaCanViewReportUserRecord');
}

function medisaSaveNormalizeCollection($value) {
    return is_array($value) ? array_values($value) : [];
}

function medisaSaveMergeScopedCollection($currentItems, $incomingItems, $canManageCurrent, $canManageIncoming) {
    $merged = [];
    foreach ($currentItems as $item) {
        if (!$canManageCurrent($item)) {
            $merged[] = $item;
        }
    }
    foreach ($incomingItems as $item) {
        if ($canManageIncoming($item)) {
            $merged[] = $item;
        }
    }
    return array_values($merged);
}

function medisaSaveEnsureScopedRecordsAreAllowed($incomingItems, $context, $canManageRecord) {
    foreach ((array)$incomingItems as $item) {
        if (!$canManageRecord($item, $context)) {
            return false;
        }
    }
    return true;
}

function medisaSaveEnsureScopedVehiclesAreAllowed($incomingVehicles, $context) {
    return medisaSaveEnsureScopedRecordsAreAllowed($incomingVehicles, $context, 'medisaCanManageVehicleRecord');
}

function medisaSaveEnsureScopedUsersAreAllowed($incomingUsers, $context) {
    return medisaSaveEnsureScopedRecordsAreAllowed($incomingUsers, $context, 'medisaCanManageUserRecord');
}

function medisaSaveIndexVehiclesById($vehicles) {
    $indexed = [];
    foreach ((array)$vehicles as $vehicle) {
        $id = isset($vehicle['id']) ? (string)$vehicle['id'] : '';
        if ($id !== '') {
            $indexed[$id] = $vehicle;
        }
    }
    return $indexed;
}

function medisaSaveValidateIncomingVehicleVersions($incomingVehicles, $currentVehiclesById, $context) {
    foreach ((array)$incomingVehicles as $vehicle) {
        $id = isset($vehicle['id']) ? (string)$vehicle['id'] : '';
        if ($id === '' || !isset($vehicle['version'])) {
            continue;
        }

        $currentVehicle = $currentVehiclesById[$id] ?? null;
        if ($currentVehicle === null) {
            continue;
        }

        if (($context['role'] ?? '') !== 'genel_yonetici' && !medisaCanManageVehicleRecord($currentVehicle, $context)) {
            continue;
        }

        $currentVersion = isset($currentVehicle['version']) ? (int)$currentVehicle['version'] : 0;
        $incomingVersion = (int)$vehicle['version'];
        if ($incomingVersion < $currentVersion) {
            return medisaBuildConflictResult(
                'vehicle',
                $id,
                'Bu taşıt başka biri tarafından güncellendi. Güncel veriler yüklendi.'
            );
        }
    }

    return true;
}

function medisaSaveApplyVehicleVersions($incomingVehicles, $currentById) {
    $updated = [];
    foreach ((array)$incomingVehicles as $vehicle) {
        $id = isset($vehicle['id']) ? (string)$vehicle['id'] : '';
        $current = $id !== '' ? ($currentById[$id] ?? null) : null;
        if ($current && isset($current['version'])) {
            $vehicle['version'] = (int)$current['version'] + 1;
        } else {
            $vehicle['version'] = 1;
        }
        $updated[] = $vehicle;
    }
    return $updated;
}

function medisaSaveBuildVehicleVersions($vehicles) {
    $vehicleVersions = [];
    foreach ((array)$vehicles as $vehicle) {
        $id = isset($vehicle['id']) ? (string)$vehicle['id'] : '';
        if ($id === '') {
            continue;
        }
        $vehicleVersions[] = [
            'id' => $id,
            'version' => isset($vehicle['version']) ? (int)$vehicle['version'] : 1,
        ];
    }
    return $vehicleVersions;
}

function medisaGetVehicleDocumentConfig(string $documentType): ?array {
    $type = strtolower(trim($documentType));
    $configs = [
        'ruhsat' => [
            'pathField' => 'ruhsatPath',
            'dir' => 'ruhsat',
            'fallbackName' => 'ruhsat',
            'notFound' => 'Ruhsat bulunamadı',
        ],
        'sigorta' => [
            'pathField' => 'sigortaPolicePath',
            'dir' => 'sigorta_police',
            'fallbackName' => 'sigorta-policesi',
            'notFound' => 'Sigorta poliçesi bulunamadı',
        ],
        'kasko' => [
            'pathField' => 'kaskoPolicePath',
            'dir' => 'kasko_police',
            'fallbackName' => 'kasko-policesi',
            'notFound' => 'Kasko poliçesi bulunamadı',
        ],
        'k2' => [
            'pathField' => 'k2BelgesiPath',
            'settingsKey' => 'k2Belgesi',
            'settingsPathField' => 'documentPath',
            'dir' => 'k2_belgesi',
            'fallbackName' => 'k2-belgesi',
            'notFound' => 'K2 belgesi bulunamadı',
        ],
        'tasit_karti' => [
            'pathField' => 'tasitKartiPath',
            'dir' => 'tasit_karti',
            'fallbackName' => 'tasit-karti',
            'notFound' => 'Taşıt kartı bulunamadı',
        ],
        'takograf' => [
            'pathField' => 'takografBelgesiPath',
            'dir' => 'takograf',
            'fallbackName' => 'takograf-belgesi',
            'notFound' => 'Takograf belgesi bulunamadı',
        ],
    ];

    return $configs[$type] ?? null;
}

function medisaResolveVehicleDocumentFilePath($vehicle, string $documentType, $data = null) {
    if (!is_array($vehicle)) {
        return null;
    }

    $config = medisaGetVehicleDocumentConfig($documentType);
    if (!$config) {
        return null;
    }

    $candidates = [];
    $settingsKey = (string)($config['settingsKey'] ?? '');
    if ($settingsKey !== '' && is_array($data)) {
        $settingsDoc = $data['ayarlar'][$settingsKey] ?? null;
        if (is_array($settingsDoc)) {
            $settingsPathField = (string)($config['settingsPathField'] ?? 'documentPath');
            $rawSettingsPath = trim((string)($settingsDoc[$settingsPathField] ?? ''));
            if ($rawSettingsPath !== '') {
                $normalizedSettings = ltrim(str_replace('\\', '/', $rawSettingsPath), '/');
                if (strpos($normalizedSettings, 'data/') !== 0) {
                    $normalizedSettings = 'data/' . $normalizedSettings;
                }
                $candidates[] = __DIR__ . '/' . $normalizedSettings;
            }
        }
    }
    $rawPath = trim((string)($vehicle[$config['pathField']] ?? ''));
    if ($rawPath !== '') {
        $normalized = ltrim(str_replace('\\', '/', $rawPath), '/');
        if (strpos($normalized, 'data/') !== 0) {
            $normalized = 'data/' . $normalized;
        }
        $candidates[] = __DIR__ . '/' . $normalized;
    }

    $safeId = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($vehicle['id'] ?? ''));
    if ($safeId !== '') {
        $candidates[] = __DIR__ . '/data/' . $config['dir'] . '/' . $safeId . '.pdf';
    }

    foreach (array_values(array_unique($candidates)) as $candidatePath) {
        if (is_file($candidatePath)) {
            return $candidatePath;
        }
    }

    return null;
}

function medisaResolveVehicleRuhsatFilePath($vehicle) {
    return medisaResolveVehicleDocumentFilePath($vehicle, 'ruhsat');
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
function validateToken($allowQueryToken = false) {
    $token = medisaReadAccessToken($allowQueryToken);
    if ($token === '') {
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
