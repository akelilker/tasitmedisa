<?php
/**
 * Taşıt Yönetim Sistemi - PHP Core
 * Veri yolu, yükleme/kaydetme, yedekleme ve token doğrulama
 */

// Staging/local overlay: yalnız dosya varsa yükle. Production'da bu dosya yoktur.
if (is_readable(__DIR__ . '/config.local.php')) {
    require_once __DIR__ . '/config.local.php';
}

/** data/ altında tutulacak zaman damgalı anlık görüntü sayısı üst sınırı */
define('MEDISA_SNAPSHOT_MAX_FILES', 25);

/** Veri dosyasının tam yolu */
function getDataFilePath() {
    if (defined('MEDISA_RESTORE_TEST_MODE') && MEDISA_RESTORE_TEST_MODE === true
        && isset($GLOBALS['MEDISA_RESTORE_ENV_OVERRIDE'])
        && is_array($GLOBALS['MEDISA_RESTORE_ENV_OVERRIDE'])
        && !empty($GLOBALS['MEDISA_RESTORE_ENV_OVERRIDE']['data_file'])) {
        return (string)$GLOBALS['MEDISA_RESTORE_ENV_OVERRIDE']['data_file'];
    }
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

    $writtenJson = @file_get_contents($path);
    if ($writtenJson === false) {
        error_log('[Medisa] saveData: yazım sonrası doğrulama okunamadı');
        return false;
    }
    json_decode($writtenJson, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        error_log('[Medisa] saveData: yazım sonrası JSON doğrulama başarısız: ' . json_last_error_msg());
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
    if (function_exists('medisaRestoreIsWriteFrozen') && medisaRestoreIsWriteFrozen()
        && !(function_exists('medisaRestoreCommitBypassActive') && medisaRestoreCommitBypassActive())) {
        return medisaBuildErrorResult('Sunucu bakım/write-freeze aktif. Kayıtlar geçici olarak durduruldu.', 423, [
            'error_code' => 'MAINTENANCE_REQUIRED',
            'maintenance_mode' => true,
        ]);
    }

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

    // Staging Directory Privacy Basic Auth Authorization başlığını doldurur.
    // Uygulama Bearer token'ı X-Medisa-Authorization ile taşınabilir (Basic ile çakışmaz).
    foreach ($headers as $key => $value) {
        if (strcasecmp((string)$key, 'X-Medisa-Authorization') === 0) {
            $v = trim((string)$value);
            if ($v !== '') {
                return $v;
            }
        }
    }
    if (!empty($_SERVER['HTTP_X_MEDISA_AUTHORIZATION'])) {
        $v = trim((string)$_SERVER['HTTP_X_MEDISA_AUTHORIZATION']);
        if ($v !== '') {
            return $v;
        }
    }

    foreach ($headers as $key => $value) {
        if (strcasecmp((string)$key, 'Authorization') === 0) {
            $v = trim((string)$value);
            // Apache Basic Auth varken Bearer uygulama token'ı olmayabilir.
            if ($v !== '' && !preg_match('/^Basic\s+/i', $v)) {
                return $v;
            }
        }
    }

    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        $v = trim((string)$_SERVER['HTTP_AUTHORIZATION']);
        if ($v !== '' && !preg_match('/^Basic\s+/i', $v)) {
            return $v;
        }
    }

    if (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $v = trim((string)$_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
        if ($v !== '' && !preg_match('/^Basic\s+/i', $v)) {
            return $v;
        }
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

function medisaReadAccessToken() {
    $token = medisaExtractBearerTokenValue(medisaReadAuthorizationHeader());
    if ($token !== '') {
        return $token;
    }

    return '';
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

function medisaFindUserIndex($data, $userId) {
    foreach (($data['users'] ?? []) as $index => $user) {
        if ((string)($user['id'] ?? '') === (string)$userId) {
            return $index;
        }
    }
    return -1;
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

function medisaNormalizeFirstLoginPasswordChangeRequired($value) {
    if ($value === true || $value === 1 || $value === '1') {
        return true;
    }
    if ($value === false || $value === 0 || $value === '0' || $value === null) {
        return false;
    }
    return true;
}

function medisaUserRequiresFirstLoginPasswordChange($user) {
    if (!is_array($user)) {
        return true;
    }

    $rawValue = array_key_exists('ilk_giris_parola_onerisi_bekliyor', $user)
        ? $user['ilk_giris_parola_onerisi_bekliyor']
        : null;
    return medisaNormalizeFirstLoginPasswordChangeRequired($rawValue);
}

function medisaBuildUserPasswordVersion($user) {
    if (!is_array($user)) {
        return '';
    }

    $passwordHash = trim((string)($user['sifre_hash'] ?? ''));
    if ($passwordHash === '') {
        return '';
    }

    return hash_hmac('sha256', $passwordHash, medisaGetTokenSecret());
}

function medisaTokenMatchesUserPasswordVersion($tokenData, $user) {
    if (!is_array($tokenData) || !is_array($user)) {
        return false;
    }

    $tokenVersion = trim((string)($tokenData['pwdv'] ?? ''));
    $currentVersion = medisaBuildUserPasswordVersion($user);
    return $tokenVersion !== ''
        && $currentVersion !== ''
        && hash_equals($currentVersion, $tokenVersion);
}

function medisaNormalizePasswordPolicyValue($value) {
    $normalized = trim((string)$value);
    if (function_exists('mb_strtolower')) {
        return mb_strtolower($normalized, 'UTF-8');
    }
    return strtolower($normalized);
}

function medisaUserPasswordPolicyDeniedValues($user) {
    $values = [
        'password',
        'password123',
        'parola',
        'parola123',
        'medisa',
        'medisa123',
        '1234567890',
        'qwerty1234',
    ];

    if (!is_array($user)) {
        return $values;
    }

    foreach (['kullanici_adi', 'username', 'login', 'userName', 'user_name', 'soyisim', 'soyad', 'surname', 'last_name'] as $key) {
        if (isset($user[$key]) && trim((string)$user[$key]) !== '') {
            $values[] = $user[$key];
        }
    }

    foreach (['isim', 'name', 'ad_soyad'] as $key) {
        $fullName = trim((string)($user[$key] ?? ''));
        if ($fullName === '') {
            continue;
        }
        $parts = preg_split('/\s+/u', $fullName);
        if (is_array($parts) && count($parts) > 1) {
            $values[] = $parts[count($parts) - 1];
        }
    }

    return array_values(array_unique(array_filter(array_map(
        'medisaNormalizePasswordPolicyValue',
        $values
    ), static function ($value) {
        return $value !== '';
    })));
}

function medisaValidateNewUserPassword($user, $currentPassword, $newPassword) {
    $currentPassword = trim((string)$currentPassword);
    $newPassword = trim((string)$newPassword);

    if ($currentPassword === '' || $newPassword === '') {
        return medisaBuildErrorResult('Mevcut şifre ve yeni şifre gerekli.', 400);
    }
    if (hash_equals($currentPassword, $newPassword)) {
        return medisaBuildErrorResult('Yeni parola mevcut paroladan farklı olmalıdır.', 400);
    }

    $meetsComplexity = mb_strlen($newPassword, 'UTF-8') >= 6
        && preg_match('/[A-ZÇĞİÖŞÜ]/u', $newPassword) === 1
        && preg_match('/[a-zçğıöşü]/u', $newPassword) === 1
        && preg_match('/[0-9]/', $newPassword) === 1;
    $normalizedPassword = medisaNormalizePasswordPolicyValue($newPassword);
    $deniedValues = medisaUserPasswordPolicyDeniedValues($user);
    if (!$meetsComplexity || in_array($normalizedPassword, $deniedValues, true)) {
        return medisaBuildErrorResult('Yeni parola güvenlik koşullarını karşılamıyor.', 400);
    }

    return medisaBuildMutationResult(true, ['save' => false]);
}

function medisaApplyUserPasswordChange(&$user, $newPassword) {
    medisaSetUserPasswordHash($user, $newPassword);
    $user['ilk_giris_parola_onerisi_bekliyor'] = false;
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
        'manage_backups' => $role === 'genel_yonetici',
        'execute_server_restore' => $role === 'genel_yonetici',
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
        'ilk_giris_parola_degistirme_zorunlu' => $context['ilk_giris_parola_degistirme_zorunlu'] ?? true,
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
        'ilk_giris_parola_degistirme_zorunlu' => medisaUserRequiresFirstLoginPasswordChange($user),
    ];
    $context['permissions'] = medisaBuildPermissions($context);

    return $context;
}

function medisaBuildAuthenticatedAccessContext($data, $tokenData) {
    $context = medisaBuildAccessContext($data, $tokenData);
    if (!$context || !medisaTokenMatchesUserPasswordVersion($tokenData, $context['user'] ?? null)) {
        return null;
    }
    return $context;
}

function medisaContextRequiresFirstLoginPasswordChange($context) {
    return !is_array($context)
        || ($context['ilk_giris_parola_degistirme_zorunlu'] ?? true) === true;
}

function medisaResolveSessionContext($data, $tokenData, $allowPasswordChangeRequired = false) {
    $context = medisaBuildAuthenticatedAccessContext($data, $tokenData);
    if (!$context) {
        return [
            'success' => false,
            'status' => 401,
            'message' => 'Oturumunuz sona erdi.',
            'auth_required' => true,
        ];
    }

    if (!$allowPasswordChangeRequired && medisaContextRequiresFirstLoginPasswordChange($context)) {
        return [
            'success' => false,
            'status' => 403,
            'code' => 'PASSWORD_CHANGE_REQUIRED',
            'password_change_required' => true,
            'message' => 'Uygulamayı kullanmadan önce parolanızı değiştirmeniz gerekiyor.',
        ];
    }

    return [
        'success' => true,
        'context' => $context,
        'token' => $tokenData,
    ];
}

function medisaBuildSessionTokenClaims($context) {
    $user = $context['user'] ?? null;
    $rawRole = medisaResolveRawUserRoleValue($user);

    return [
        'user_id' => (string)($context['user_id'] ?? ''),
        'rol' => $context['role'] ?? 'kullanici',
        'raw_rol' => $rawRole,
        'yonetici_only' => $context['yonetici_only'] ?? false,
        'sube_ids' => array_values(array_map('strval', $context['branch_ids'] ?? [])),
        'kullanici_paneli' => $context['kullanici_paneli'] ?? false,
        'driver_dashboard' => $context['driver_dashboard'] ?? false,
        'ilk_giris_parola_degistirme_zorunlu' => $context['ilk_giris_parola_degistirme_zorunlu'] ?? true,
        'pwdv' => medisaBuildUserPasswordVersion($user),
    ];
}

function medisaResolveAuthorizedContext($data, $requiredPermission = '') {
    $tokenData = validateToken();
    if (!$tokenData) {
        return [
            'success' => false,
            'status' => 401,
            'message' => 'Oturum gerekli.',
        ];
    }

    $sessionResolution = medisaResolveSessionContext($data, $tokenData);
    if (($sessionResolution['success'] ?? false) !== true) {
        return $sessionResolution;
    }
    $context = $sessionResolution['context'];

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

function medisaIsNormalUserRole($role) {
    return $role === 'kullanici';
}

function medisaIsKnownUserRole($role) {
    return $role === 'genel_yonetici'
        || medisaIsBranchManagerRole($role)
        || medisaIsNormalUserRole($role);
}

function medisaIsGeneralManagerRole($role) {
    return $role === 'genel_yonetici';
}

/**
 * Kullanıcı aktiflik canonical helper.
 * Eksik aktif alanı → aktif (mevcut projection ile uyumlu).
 * Malformed değer → fail-closed aktif (son GM korumasını zayıflatmaz).
 */
function medisaIsUserActive($user) {
    if (!is_array($user)) {
        return false;
    }

    if (array_key_exists('aktif', $user)) {
        $aktif = $user['aktif'];
        if ($aktif === false || $aktif === 0 || $aktif === '0') {
            return false;
        }
        if ($aktif === true || $aktif === 1 || $aktif === '1') {
            return true;
        }
        if (is_string($aktif)) {
            $normalized = strtolower(trim($aktif));
            if ($normalized === 'false' || $normalized === 'pasif' || $normalized === 'inactive' || $normalized === 'no') {
                return false;
            }
            if ($normalized === 'true' || $normalized === 'aktif' || $normalized === 'active' || $normalized === 'yes') {
                return true;
            }
        }
        return true;
    }

    if (array_key_exists('isActive', $user)) {
        $isActive = $user['isActive'];
        if ($isActive === false || $isActive === 0 || $isActive === '0') {
            return false;
        }
        if ($isActive === true || $isActive === 1 || $isActive === '1') {
            return true;
        }
        return true;
    }

    if (array_key_exists('durum', $user) || array_key_exists('status', $user)) {
        $status = strtolower(trim((string)($user['durum'] ?? $user['status'] ?? '')));
        if ($status === 'pasif' || $status === 'inactive' || $status === 'disabled' || $status === 'false') {
            return false;
        }
    }

    return true;
}

function medisaIsActiveGeneralManager($user) {
    return is_array($user)
        && medisaIsGeneralManagerRole(medisaResolveUserRole($user))
        && medisaIsUserActive($user);
}

function medisaCountActiveGeneralManagers($users) {
    $count = 0;
    foreach ((array)$users as $user) {
        if (medisaIsActiveGeneralManager($user)) {
            $count++;
        }
    }
    return $count;
}

function medisaSaveHasDuplicateUserIds($users) {
    $seen = [];
    foreach ((array)$users as $user) {
        if (!is_array($user)) {
            continue;
        }
        $id = isset($user['id']) ? trim((string)$user['id']) : '';
        if ($id === '') {
            continue;
        }
        if (isset($seen[$id])) {
            return true;
        }
        $seen[$id] = true;
    }
    return false;
}

/**
 * Mutation sonrası oluşacak kullanıcı koleksiyonu (GM full-replace / BM scoped-merge).
 */
function medisaSaveProjectFinalUserCollection($currentUsers, $incomingUsers, $context) {
    $actorRole = $context['role'] ?? 'kullanici';
    if (medisaIsGeneralManagerRole($actorRole)) {
        return medisaSaveNormalizeCollection($incomingUsers);
    }

    return medisaSaveMergeScopedCollection(
        medisaSaveNormalizeCollection($currentUsers),
        medisaSaveNormalizeCollection($incomingUsers),
        function ($user) use ($context) { return medisaCanManageUserRecord($user, $context); },
        function ($user) use ($context) { return medisaCanManageUserRecord($user, $context); }
    );
}

/**
 * P0-C: self GM + son aktif GM + final aktif GM sayısı invariantları.
 * @return true|array error result
 */
function medisaValidateGeneralManagerInvariants($currentUsers, $incomingUsers, $context) {
    if (!is_array($context)) {
        return medisaBuildErrorResult('Oturum bağlamı geçersiz.', 403);
    }

    if (medisaSaveHasDuplicateUserIds($incomingUsers)) {
        return medisaBuildErrorResult('Kullanıcı kaydı yinelenen kimlik içeriyor.', 403);
    }

    $currentById = medisaSaveIndexUsersById($currentUsers);
    $incomingById = medisaSaveIndexUsersById($incomingUsers);
    $finalUsers = medisaSaveProjectFinalUserCollection($currentUsers, $incomingUsers, $context);
    $finalById = medisaSaveIndexUsersById($finalUsers);
    $finalActiveGmCount = medisaCountActiveGeneralManagers($finalUsers);

    $actorId = trim((string)($context['user_id'] ?? ''));
    $actorRole = $context['role'] ?? 'kullanici';
    $actorIsGm = medisaIsGeneralManagerRole($actorRole);

    if ($actorIsGm && $actorId !== '') {
        $currentActor = $currentById[$actorId] ?? ($context['user'] ?? null);
        $incomingActor = $incomingById[$actorId] ?? null;
        $finalActor = $finalById[$actorId] ?? null;

        if ($incomingActor === null || $finalActor === null) {
            return medisaBuildErrorResult('Kendi hesabınızı silemezsiniz.', 403);
        }

        $incomingActorRole = medisaResolveUserRole($incomingActor);
        $rawIncomingRole = medisaResolveRawUserRoleValue($incomingActor);
        if ($rawIncomingRole === '' || !medisaIsKnownUserRole($incomingActorRole) || !medisaIsGeneralManagerRole($incomingActorRole)) {
            return medisaBuildErrorResult('Kendi genel yönetici rolünüzü düşüremezsiniz.', 403);
        }

        if (!medisaIsUserActive($incomingActor) || !medisaIsUserActive($finalActor)) {
            return medisaBuildErrorResult('Kendi hesabınızı pasif hale getiremezsiniz.', 403);
        }

        if (is_array($currentActor) && medisaIsActiveGeneralManager($currentActor) && !medisaIsActiveGeneralManager($finalActor)) {
            return medisaBuildErrorResult('Kendi genel yönetici yetkinizi kaldıramazsınız.', 403);
        }
    }

    $currentActiveGmIds = [];
    foreach ($currentById as $id => $user) {
        if (medisaIsActiveGeneralManager($user)) {
            $currentActiveGmIds[] = (string)$id;
        }
    }
    $currentActiveGmCount = count($currentActiveGmIds);

    if ($currentActiveGmCount === 1) {
        $soleId = $currentActiveGmIds[0];
        $finalSole = $finalById[$soleId] ?? null;
        if ($finalSole === null || !medisaIsActiveGeneralManager($finalSole)) {
            return medisaBuildErrorResult('Sistemde en az bir aktif genel yönetici bulunmalıdır.', 403);
        }
    }

    if ($finalActiveGmCount < 1) {
        return medisaBuildErrorResult('Sistemde en az bir aktif genel yönetici bulunmalıdır.', 403);
    }

    return true;
}

/**
 * Tek kayıt manage helper — yalnız gelen/mevcut kaydın o anki haline bakar.
 * BM için create/update/delete current+incoming birlikte medisaSaveValidateUserCollectionMutations ile doğrulanır.
 */
function medisaCanManageUserRecord($user, $context) {
    $role = $context['role'] ?? 'kullanici';
    if ($role === 'genel_yonetici') {
        return true;
    }

    if (!medisaIsBranchManagerRole($role)) {
        return false;
    }

    if (!is_array($user)) {
        return false;
    }

    if ((string)($user['id'] ?? '') === (string)($context['user_id'] ?? '')) {
        return false;
    }

    $targetRole = medisaResolveUserRole($user);
    if (!medisaIsKnownUserRole($targetRole) || !medisaIsNormalUserRole($targetRole)) {
        return false;
    }

    return medisaUserBranchesWithinScope($user, $context['branch_ids'] ?? []);
}

/**
 * View policy manage'den ayrıdır; BM yalnız scope içi normal kullanıcıları görür (self hariç).
 */
function medisaCanViewUserRecord($user, $context) {
    $role = $context['role'] ?? 'kullanici';
    if ($role === 'genel_yonetici') {
        return true;
    }

    if (medisaIsBranchManagerRole($role)) {
        if (!is_array($user)) {
            return false;
        }
        if ((string)($user['id'] ?? '') === (string)($context['user_id'] ?? '')) {
            return false;
        }
        $targetRole = medisaResolveUserRole($user);
        if (!medisaIsKnownUserRole($targetRole) || !medisaIsNormalUserRole($targetRole)) {
            return false;
        }
        return medisaUserBranchesWithinScope($user, $context['branch_ids'] ?? []);
    }

    return (string)($user['id'] ?? '') === (string)($context['user_id'] ?? '');
}

/**
 * Rapor kullanıcı projeksiyonu — BM için ana view ile aynı fail-closed politika:
 * yalnız scope içi normal kullanıcı; self / yönetici / unknown / partial scope gizli.
 */
function medisaCanViewReportUserRecord($user, $context) {
    $role = $context['role'] ?? 'kullanici';
    if ($role === 'genel_yonetici') {
        return true;
    }

    if (medisaIsBranchManagerRole($role)) {
        if (!is_array($user)) {
            return false;
        }
        if ((string)($user['id'] ?? '') === (string)($context['user_id'] ?? '')) {
            return false;
        }
        $targetRole = medisaResolveUserRole($user);
        if (!medisaIsKnownUserRole($targetRole) || !medisaIsNormalUserRole($targetRole)) {
            return false;
        }
        return medisaUserBranchesWithinScope($user, $context['branch_ids'] ?? []);
    }

    return (string)($user['id'] ?? '') === (string)($context['user_id'] ?? '');
}

/**
 * Bildirim scope anahtarı üretimi — load projection ve save merge için tek owner.
 * saveAllowedKeys: yalnızca kanonik + kullanıcı legacy; scope:* artık yazılamaz.
 * loadMergeKeys: yalnızca user:<id> + kanonik; scope:* load projection kaynağı olamaz.
 */
function medisaBuildNotificationScopeDescriptor(array $context): array {
    $role = strtolower(trim((string)($context['role'] ?? '')));
    $userId = trim((string)($context['user_id'] ?? ''));
    $branchIds = array_values(array_filter(array_map(function ($id) {
        return trim((string)$id);
    }, is_array($context['branch_ids'] ?? null) ? $context['branch_ids'] : []), function ($id) {
        return $id !== '';
    }));
    sort($branchIds, SORT_STRING);
    $branchIds = array_values(array_unique($branchIds));
    $branchScope = empty($branchIds)
        ? ($role === 'genel_yonetici' ? 'all' : 'none')
        : implode(',', $branchIds);
    $canonicalKey = 'user:'
        . ($userId !== '' ? $userId : 'anonymous')
        . '|role:'
        . ($role !== '' ? $role : 'unknown')
        . '|branches:'
        . $branchScope;
    $userLegacyKey = $userId !== '' ? 'user:' . $userId : '';
    $loadMergeKeys = [];
    if ($userLegacyKey !== '') {
        $loadMergeKeys[] = $userLegacyKey;
    }
    $loadMergeKeys[] = $canonicalKey;
    $legacyScopeKeys = [];
    if ($userLegacyKey !== '') {
        $legacyScopeKeys[] = $userLegacyKey;
    }
    $saveAllowedKeys = array_values(array_unique(array_merge([$canonicalKey], $legacyScopeKeys)));

    return [
        'canonicalKey' => $canonicalKey,
        'userLegacyKey' => $userLegacyKey,
        'sharedLegacyKeys' => [],
        'loadMergeKeys' => $loadMergeKeys,
        'saveAllowedKeys' => $saveAllowedKeys,
        'scopeKey' => $canonicalKey,
        'legacyScopeKeys' => $legacyScopeKeys,
    ];
}

function medisaNotificationScopeIsListArray($value): bool {
    if (!is_array($value)) {
        return false;
    }
    if (function_exists('array_is_list')) {
        return array_is_list($value);
    }
    $expectedIndex = 0;
    foreach ($value as $key => $_) {
        if ($key !== $expectedIndex) {
            return false;
        }
        $expectedIndex++;
    }
    return true;
}

function medisaNotificationNormalizeKeys(array $keys): array {
    $clean = [];
    foreach ($keys as $key) {
        $normalized = trim((string)$key);
        if ($normalized === '') {
            continue;
        }
        if (!in_array($normalized, $clean, true)) {
            $clean[] = $normalized;
        }
    }
    return array_slice($clean, -500);
}

function medisaNotificationNormalizeFirstSeenDates($map): array {
    $clean = [];
    if (!is_array($map)) {
        return $clean;
    }
    foreach ($map as $key => $date) {
        $normalizedKey = trim((string)$key);
        if (!is_scalar($date)) {
            continue;
        }
        $normalizedDate = trim((string)$date);
        if ($normalizedKey === '' || $normalizedDate === '') {
            continue;
        }
        $clean[$normalizedKey] = $normalizedDate;
    }
    return $clean;
}

function medisaNotificationNormalizeScopeState($scopeState): array {
    if (medisaNotificationScopeIsListArray($scopeState)) {
        return [
            'readKeys' => medisaNotificationNormalizeKeys($scopeState),
            'dismissedKeys' => [],
            'firstSeenDates' => [],
            'migratedFromLocalStorage' => false,
            'updatedAt' => '',
        ];
    }
    $scopeState = is_array($scopeState) ? $scopeState : [];
    $dismissedKeys = medisaNotificationNormalizeKeys(
        is_array($scopeState['dismissedKeys'] ?? null) ? $scopeState['dismissedKeys'] : []
    );
    $readKeysRaw = is_array($scopeState['readKeys'] ?? null) ? $scopeState['readKeys'] : [];
    $readKeys = medisaNotificationNormalizeKeys(array_merge($readKeysRaw, $dismissedKeys));
    return [
        'readKeys' => $readKeys,
        'dismissedKeys' => $dismissedKeys,
        'firstSeenDates' => medisaNotificationNormalizeFirstSeenDates($scopeState['firstSeenDates'] ?? []),
        'migratedFromLocalStorage' => ($scopeState['migratedFromLocalStorage'] ?? false) === true,
        'updatedAt' => trim((string)($scopeState['updatedAt'] ?? '')),
    ];
}

/**
 * Load response için salt-okunur projection: user legacy + kanonik → tek kanonik bucket.
 * scope:* anahtarları okunmaz, merge edilmez, response'a konmaz.
 */
function medisaProjectNotificationReadStateForContext(array $notificationReadState, array $context): array {
    $descriptor = medisaBuildNotificationScopeDescriptor($context);
    $canonicalKey = $descriptor['canonicalKey'];
    $userLegacyKey = $descriptor['userLegacyKey'];

    $legacyScope = medisaNotificationNormalizeScopeState([]);
    if ($userLegacyKey !== ''
        && array_key_exists($userLegacyKey, $notificationReadState)
        && is_array($notificationReadState[$userLegacyKey])) {
        $legacyScope = medisaNotificationNormalizeScopeState($notificationReadState[$userLegacyKey]);
    }

    $canonicalScope = medisaNotificationNormalizeScopeState([]);
    if (array_key_exists($canonicalKey, $notificationReadState)
        && is_array($notificationReadState[$canonicalKey])) {
        $canonicalScope = medisaNotificationNormalizeScopeState($notificationReadState[$canonicalKey]);
    }

    $dismissedKeys = medisaNotificationNormalizeKeys(array_merge(
        $legacyScope['dismissedKeys'],
        $canonicalScope['dismissedKeys']
    ));
    $readKeys = medisaNotificationNormalizeKeys(array_merge(
        $legacyScope['readKeys'],
        $canonicalScope['readKeys'],
        $dismissedKeys
    ));

    $firstSeenDates = $legacyScope['firstSeenDates'];
    foreach ($canonicalScope['firstSeenDates'] as $notifKey => $firstSeenDate) {
        $firstSeenDates[$notifKey] = $firstSeenDate;
    }

    $canonicalUpdatedAt = trim((string)($canonicalScope['updatedAt'] ?? ''));
    $legacyUpdatedAt = trim((string)($legacyScope['updatedAt'] ?? ''));
    $updatedAt = $canonicalUpdatedAt !== '' ? $canonicalUpdatedAt : $legacyUpdatedAt;

    return [
        $canonicalKey => [
            'readKeys' => $readKeys,
            'dismissedKeys' => $dismissedKeys,
            'firstSeenDates' => $firstSeenDates,
            'migratedFromLocalStorage' => $legacyScope['migratedFromLocalStorage'] || $canonicalScope['migratedFromLocalStorage'],
            'updatedAt' => $updatedAt,
        ],
    ];
}

function medisaProjectUserForClient($user) {
    if (!is_array($user)) {
        return [];
    }

    $branchIds = medisaExtractUserBranchIds($user);
    $primaryBranchId = $branchIds[0] ?? '';
    $role = medisaResolveUserRole($user);
    $name = trim((string)($user['isim'] ?? $user['name'] ?? ''));
    $phone = trim((string)($user['telefon'] ?? $user['phone'] ?? ''));
    $createdAt = $user['kayit_tarihi'] ?? $user['createdAt'] ?? '';
    $tip = $role === 'genel_yonetici'
        ? 'admin'
        : ($role === 'sube_yonetici' ? 'yonetici' : 'kullanici');
    $driverPanel = !empty($user['kullanici_paneli']) || !empty($user['surucu_paneli']);

    return [
        'id' => isset($user['id']) ? (string)$user['id'] : '',
        'isim' => $name,
        'name' => $name,
        'kullanici_adi' => trim((string)($user['kullanici_adi'] ?? '')),
        'telefon' => $phone,
        'phone' => $phone,
        'email' => trim((string)($user['email'] ?? '')),
        'sube_id' => $primaryBranchId,
        'sube_ids' => $branchIds,
        'branchId' => $primaryBranchId,
        'branchIds' => $branchIds,
        'rol' => $role,
        'role' => $role,
        'tip' => $tip,
        'kullanici_paneli' => $driverPanel,
        'surucu_paneli' => $driverPanel,
        'zimmetli_araclar' => is_array($user['zimmetli_araclar'] ?? null)
            ? array_values($user['zimmetli_araclar'])
            : [],
        'aktif' => !array_key_exists('aktif', $user) || $user['aktif'] !== false,
        'kayit_tarihi' => $createdAt,
        'createdAt' => $createdAt,
        'son_giris' => $user['son_giris'] ?? null,
        'portal_sifresi_var' => medisaUserHasPortalPassword($user),
    ];
}

function medisaFilterDataForContextWithUserPredicate($data, $context, $userPredicate) {
    $visibleVehicles = array_values(array_filter($data['tasitlar'] ?? [], function ($vehicle) use ($context) {
        return medisaCanViewVehicleRecord($vehicle, $context);
    }));

    $visibleUsers = array_values(array_filter($data['users'] ?? [], function ($user) use ($context, $userPredicate) {
        return is_callable($userPredicate) ? (bool)call_user_func($userPredicate, $user, $context) : false;
    }));
    $visibleUsers = array_values(array_map('medisaProjectUserForClient', $visibleUsers));

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
        'notificationReadState' => medisaProjectNotificationReadStateForContext(
            is_array($data['notificationReadState'] ?? null) ? $data['notificationReadState'] : [],
            $context
        ),
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

function medisaSaveIndexUsersById($users) {
    $indexed = [];
    foreach ((array)$users as $user) {
        if (!is_array($user)) {
            continue;
        }
        $id = isset($user['id']) ? (string)$user['id'] : '';
        if ($id !== '') {
            $indexed[$id] = $user;
        }
    }
    return $indexed;
}

/**
 * Kullanıcı create/update/delete için current+incoming birlikte fail-closed doğrulama.
 * P0-C: genel yönetici self + son aktif GM invariantları her user mutation'da çalışır.
 *
 * BM istemci projeksiyonu yönetilemeyen kayıtları taşımaz; bunların incoming'de
 * olmaması silme sayılmaz (merge korur). Silme yalnız yönetilebilir kaydın
 * bilinçli olarak düşürülmesidir. Güncellemede hem current hem incoming manageable olmalı
 * (rol downgrade / promote saldırısını keser).
 */
function medisaSaveValidateUserCollectionMutations($currentUsers, $incomingUsers, $context) {
    $gmInvariant = medisaValidateGeneralManagerInvariants($currentUsers, $incomingUsers, $context);
    if ($gmInvariant !== true) {
        return $gmInvariant;
    }

    $actorRole = $context['role'] ?? 'kullanici';
    if (medisaIsGeneralManagerRole($actorRole)) {
        return true;
    }

    if (!medisaIsBranchManagerRole($actorRole)) {
        return medisaBuildErrorResult('Kapsam dışı veri kaydı engellendi.', 403);
    }

    $currentById = medisaSaveIndexUsersById($currentUsers);
    $incomingById = medisaSaveIndexUsersById($incomingUsers);

    foreach ($incomingById as $id => $incomingUser) {
        $currentUser = $currentById[$id] ?? null;
        if ($currentUser === null) {
            if (!medisaCanManageUserRecord($incomingUser, $context)) {
                return medisaBuildErrorResult('Kapsam dışı veri kaydı engellendi.', 403);
            }
            continue;
        }

        if (!medisaCanManageUserRecord($currentUser, $context) || !medisaCanManageUserRecord($incomingUser, $context)) {
            return medisaBuildErrorResult('Kapsam dışı veri kaydı engellendi.', 403);
        }
    }

    return true;
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

function medisaSaveValidateIncomingVehicleVersions($incomingVehicles, $currentVehiclesById, $context, $changedVehicleIds = null) {
    $changedLookup = is_array($changedVehicleIds)
        ? array_fill_keys(array_map('strval', $changedVehicleIds), true)
        : null;
    foreach ((array)$incomingVehicles as $vehicle) {
        $id = isset($vehicle['id']) ? (string)$vehicle['id'] : '';
        if ($changedLookup !== null && !isset($changedLookup[$id])) {
            continue;
        }
        if ($id === '') {
            continue;
        }

        $currentVehicle = $currentVehiclesById[$id] ?? null;
        if ($currentVehicle === null) {
            continue;
        }
        if (!isset($vehicle['version'])) {
            return medisaBuildConflictResult(
                'vehicle',
                $id,
                'Bu taşıtın sürüm bilgisi eksik. Güncel veriler yüklendi.'
            );
        }

        if (($context['role'] ?? '') !== 'genel_yonetici' && !medisaCanManageVehicleRecord($currentVehicle, $context)) {
            continue;
        }

        $currentVersion = isset($currentVehicle['version']) ? (int)$currentVehicle['version'] : 0;
        $incomingVersion = (int)$vehicle['version'];
        if ($incomingVersion !== $currentVersion) {
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

function medisaSaveVehicleTypeKey($vehicle) {
    if (!is_array($vehicle)) {
        return '';
    }
    return strtolower(trim((string)($vehicle['vehicleType'] ?? $vehicle['tip'] ?? '')));
}

function medisaSaveVehicleNeedsK2($vehicle) {
    return in_array(medisaSaveVehicleTypeKey($vehicle), ['minivan', 'kamyon', 'romork'], true);
}

function medisaSaveVehicleNeedsTakograf($vehicle) {
    return medisaSaveVehicleTypeKey($vehicle) === 'kamyon';
}

function medisaGetLatestSatisEvent($vehicle) {
    if (!is_array($vehicle) || !isset($vehicle['events']) || !is_array($vehicle['events'])) {
        return null;
    }
    foreach ($vehicle['events'] as $event) {
        if (!is_array($event)) {
            continue;
        }
        if (strtolower(trim((string)($event['type'] ?? ''))) === 'satis') {
            return $event;
        }
    }
    return null;
}

/**
 * Arşiv nedeni: "satis" | "pert" | null
 * Öncelik: araç arsivNedeni → event arsivNedeni → legacy pertIsaret → legacy satis.
 * Legacy fallback'ler yalnız kanonik neden alanları boşsa kullanılır; geçersiz açık değerler fail-closed kalır.
 */
function medisaGetVehicleArchiveReason($vehicle) {
    if (!is_array($vehicle) || ($vehicle['satildiMi'] ?? false) !== true) {
        return null;
    }
    $rawNeden = trim((string)($vehicle['arsivNedeni'] ?? ''));
    $neden = strtolower($rawNeden);
    if ($neden === 'pert') {
        return 'pert';
    }
    if ($neden === 'satis') {
        return 'satis';
    }
    $event = medisaGetLatestSatisEvent($vehicle);
    $data = is_array($event['data'] ?? null) ? $event['data'] : [];
    $rawEventNeden = trim((string)($data['arsivNedeni'] ?? ''));
    $eventNeden = strtolower($rawEventNeden);
    if ($eventNeden === 'pert') {
        return 'pert';
    }
    if ($eventNeden === 'satis') {
        return 'satis';
    }
    if ($rawNeden !== '' || $rawEventNeden !== '') {
        return null;
    }
    if (($data['pertIsaret'] ?? false) === true) {
        return 'pert';
    }
    return 'satis';
}

function medisaIsVehicleSold($vehicle) {
    return medisaGetVehicleArchiveReason($vehicle) === 'satis';
}

function medisaIsVehiclePert($vehicle) {
    return medisaGetVehicleArchiveReason($vehicle) === 'pert';
}

/** Satış sözleşmesi: stoktan düşen (satis|pert); aktif stok reddedilir. */
function medisaVehicleAllowsSatisSozlesmesi($vehicle) {
    return medisaGetVehicleArchiveReason($vehicle) !== null;
}

function medisaSavePreserveVehicleDocumentReferences($currentVehicle, $updatedVehicle) {
    if (!is_array($currentVehicle) || !is_array($updatedVehicle)) {
        return $updatedVehicle;
    }

    $alwaysPreserveFields = ['ruhsatPath', 'sigortaPolicePath', 'kaskoPolicePath', 'satisSozlesmesiPath'];
    foreach ($alwaysPreserveFields as $field) {
        $currentValue = trim((string)($currentVehicle[$field] ?? ''));
        $updatedValue = trim((string)($updatedVehicle[$field] ?? ''));
        if ($currentValue !== '' && $updatedValue === '') {
            $updatedVehicle[$field] = $currentValue;
        }
    }

    if (medisaSaveVehicleNeedsK2($updatedVehicle)) {
        $currentTasitKartiPath = trim((string)($currentVehicle['tasitKartiPath'] ?? ''));
        $updatedTasitKartiPath = trim((string)($updatedVehicle['tasitKartiPath'] ?? ''));
        if ($currentTasitKartiPath !== '' && $updatedTasitKartiPath === '') {
            $updatedVehicle['tasitKartiPath'] = $currentTasitKartiPath;
        }
    }

    if (medisaSaveVehicleNeedsTakograf($updatedVehicle)) {
        $currentTakografPath = trim((string)($currentVehicle['takografBelgesiPath'] ?? ''));
        $updatedTakografPath = trim((string)($updatedVehicle['takografBelgesiPath'] ?? ''));
        if ($currentTakografPath !== '' && $updatedTakografPath === '') {
            $updatedVehicle['takografBelgesiPath'] = $currentTakografPath;
        }
    }

    return $updatedVehicle;
}

function medisaSaveApplyVehicleMutation($currentVehicles, $incomingVehicles, $changedVehicleIds, $deletedVehicleIds) {
    $changedLookup = array_fill_keys(array_map('strval', (array)$changedVehicleIds), true);
    $deletedLookup = array_fill_keys(array_map('strval', (array)$deletedVehicleIds), true);
    $incomingById = medisaSaveIndexVehiclesById($incomingVehicles);
    $result = [];

    foreach ((array)$currentVehicles as $vehicle) {
        $id = isset($vehicle['id']) ? (string)$vehicle['id'] : '';
        if ($id !== '' && isset($deletedLookup[$id])) {
            continue;
        }
        if ($id !== '' && isset($changedLookup[$id]) && isset($incomingById[$id])) {
            $updated = $incomingById[$id];
            $updated = medisaSavePreserveVehicleDocumentReferences($vehicle, $updated);
            $updated['version'] = medisaGetVehicleVersion($vehicle) + 1;
            $result[] = $updated;
            unset($incomingById[$id]);
            continue;
        }
        $result[] = $vehicle;
    }

    foreach ($incomingById as $id => $vehicle) {
        if (isset($changedLookup[(string)$id])) {
            $vehicle['version'] = 1;
            $result[] = $vehicle;
        }
    }
    return array_values($result);
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


function medisaSavePersistCollectionAllowlist() {
    return [
        'tasitlar',
        'kayitlar',
        'branches',
        'users',
        'ayarlar',
        'sifreler',
        'notificationReadState',
        'monthlyTodoWhatsAppLogs',
    ];
}

function medisaSaveWireMetadataKeys() {
    return ['_medisaWire', '_medisaMutation', '_medisaUserPasswordChanges'];
}

/**
 * Wire modunu çözer.
 * @return array{ok:bool,mode?:string,isDelta?:bool,error?:array}
 */
function medisaSaveResolveWireMode(array $incomingData) {
    $wire = is_array($incomingData['_medisaWire'] ?? null) ? $incomingData['_medisaWire'] : null;
    if ($wire === null) {
        return ['ok' => true, 'mode' => 'legacy-full', 'isDelta' => false];
    }
    if (!is_array($wire)) {
        return ['ok' => false, 'error' => medisaBuildErrorResult('Geçersiz wire protokolü.', 400)];
    }
    $schemaVersion = $wire['schemaVersion'] ?? null;
    $mode = isset($wire['mode']) ? (string)$wire['mode'] : '';
    if ((int)$schemaVersion === 1 && $mode === 'delta-v1') {
        return ['ok' => true, 'mode' => 'delta-v1', 'isDelta' => true];
    }
    return ['ok' => false, 'error' => medisaBuildErrorResult('Geçersiz wire protokolü.', 400)];
}

/**
 * Delta-v1 katı kontrat doğrulaması.
 * @return true|array
 */
function medisaSaveValidateDeltaWireContract(array $incomingData, $mutationCollections, $changedVehicleIds, $deletedVehicleIds, $deletedVehicleVersions) {
    if (!is_array($incomingData['_medisaMutation'] ?? null)) {
        return medisaBuildErrorResult('Delta mutation zorunludur.', 400);
    }
    if (!is_array($mutationCollections)) {
        return medisaBuildErrorResult('Delta collections zorunludur.', 400);
    }

    $rawCollections = $incomingData['_medisaMutation']['collections'] ?? null;
    if (!is_array($rawCollections)) {
        return medisaBuildErrorResult('Delta collections zorunludur.', 400);
    }
    if (count($rawCollections) !== count($mutationCollections)) {
        return medisaBuildErrorResult('Delta collections yinelenemez.', 400);
    }

    $allowlist = medisaSavePersistCollectionAllowlist();
    $allowLookup = array_fill_keys($allowlist, true);
    foreach ($mutationCollections as $collectionName) {
        if (!isset($allowLookup[$collectionName])) {
            return medisaBuildErrorResult('Bilinmeyen koleksiyon.', 400);
        }
    }

    $metadataLookup = array_fill_keys(medisaSaveWireMetadataKeys(), true);
    $declaredLookup = array_fill_keys($mutationCollections, true);
    foreach (array_keys($incomingData) as $topKey) {
        $topKey = (string)$topKey;
        if (isset($metadataLookup[$topKey])) {
            continue;
        }
        if (!isset($allowLookup[$topKey])) {
            return medisaBuildErrorResult('Bilinmeyen alan.', 400);
        }
        if (!isset($declaredLookup[$topKey])) {
            return medisaBuildErrorResult('Koleksiyon listesi eşleşmiyor.', 400);
        }
    }
    foreach ($mutationCollections as $collectionName) {
        if (!array_key_exists($collectionName, $incomingData)) {
            return medisaBuildErrorResult('Koleksiyon listesi eşleşmiyor.', 400);
        }
    }

    $changedVehicleIds = is_array($changedVehicleIds) ? array_values($changedVehicleIds) : [];
    $deletedVehicleIds = is_array($deletedVehicleIds) ? array_values($deletedVehicleIds) : [];
    $deletedVehicleVersions = is_array($deletedVehicleVersions) ? $deletedVehicleVersions : [];
    $changedLookup = array_fill_keys($changedVehicleIds, true);
    foreach ($deletedVehicleIds as $deletedId) {
        if (isset($changedLookup[$deletedId])) {
            return medisaBuildErrorResult('Taşıt değişim/silme çakışması.', 400);
        }
        if (!array_key_exists($deletedId, $deletedVehicleVersions) || $deletedVehicleVersions[$deletedId] === null || $deletedVehicleVersions[$deletedId] === '') {
            return medisaBuildErrorResult('Silinen taşıt sürümü zorunlu.', 400);
        }
    }

    if (in_array('tasitlar', $mutationCollections, true)) {
        if (!is_array($incomingData['tasitlar'] ?? null)) {
            return medisaBuildErrorResult('Taşıt delta dizisi zorunlu.', 400);
        }
        $payloadVehicles = $incomingData['tasitlar'];
        $payloadIds = [];
        $payloadLookup = [];
        foreach ($payloadVehicles as $vehicle) {
            if (!is_array($vehicle)) {
                return medisaBuildErrorResult('Geçersiz taşıt kaydı.', 400);
            }
            $id = isset($vehicle['id']) ? trim((string)$vehicle['id']) : '';
            if ($id === '') {
                return medisaBuildErrorResult('Taşıt kimliği zorunlu.', 400);
            }
            if (isset($payloadLookup[$id])) {
                return medisaBuildErrorResult('Yinelenen taşıt kimliği.', 400);
            }
            $payloadLookup[$id] = true;
            $payloadIds[] = $id;
            if (!isset($changedLookup[$id])) {
                return medisaBuildErrorResult('Bildirilmeyen taşıt.', 400);
            }
            if (!array_key_exists('version', $vehicle)) {
                return medisaBuildErrorResult('Taşıt sürümü zorunlu.', 400);
            }
        }
        sort($payloadIds);
        $expectedChanged = $changedVehicleIds;
        sort($expectedChanged);
        if ($payloadIds !== $expectedChanged) {
            return medisaBuildErrorResult('Taşıt delta kimlikleri eşleşmiyor.', 400);
        }
    }

    return true;
}

/**
 * Kullanıcı kimlik bilgilerini sunucu sahibiyle uzlaştırır.
 * İstemci kullanıcı nesnesindeki kimlik doğrulama alanları güvenilmez.
 * Yeni parola yalnız _medisaUserPasswordChanges üzerinden geçici olarak kabul edilir.
 * @return array{success:bool,users?:array,message?:string,status?:int}
 */
function medisaReconcileUserCredentials($currentUsers, $incomingUsers, $passwordChanges = null, $context = null) {
    $requestedPasswords = [];
    if ($passwordChanges !== null && !is_array($passwordChanges)) {
        return medisaBuildErrorResult('Parola değişikliği formatı geçersiz.', 400);
    }
    foreach (($passwordChanges ?? []) as $requestedUserId => $requestedPassword) {
        $userId = trim((string)$requestedUserId);
        if ($userId === '' || !is_string($requestedPassword) || trim($requestedPassword) === '') {
            return medisaBuildErrorResult('Parola değişikliği formatı geçersiz.', 400);
        }
        if (mb_strlen($requestedPassword, 'UTF-8') < 6) {
            return medisaBuildErrorResult('Yeni şifre en az 6 karakter olmalı.', 400);
        }
        $requestedPasswords[$userId] = $requestedPassword;
    }

    $currentById = [];
    foreach (medisaSaveNormalizeCollection($currentUsers) as $currentUser) {
        if (!is_array($currentUser)) continue;
        $currentId = isset($currentUser['id']) ? (string)$currentUser['id'] : '';
        if ($currentId !== '') $currentById[$currentId] = $currentUser;
    }

    $reconciled = [];
    foreach (medisaSaveNormalizeCollection($incomingUsers) as $incomingUser) {
        if (!is_array($incomingUser)) continue;
        $user = $incomingUser;
        $userId = isset($user['id']) ? (string)$user['id'] : '';
        $currentUser = ($userId !== '' && isset($currentById[$userId])) ? $currentById[$userId] : null;
        $currentPasswordChangeRequired = is_array($currentUser)
            ? medisaUserRequiresFirstLoginPasswordChange($currentUser)
            : false;
        $unexpectedPlainPassword = trim((string)(
            $user['sifre']
            ?? $user['yeni_sifre']
            ?? $user['portal_sifresi']
            ?? $user['password']
            ?? ''
        ));
        if ($unexpectedPlainPassword !== '' && !array_key_exists($userId, $requestedPasswords)) {
            return medisaBuildErrorResult('Eski parola gönderim biçimi kabul edilmiyor. Sayfayı yenileyip tekrar deneyin.', 400);
        }

        unset(
            $user['sifre'],
            $user['sifre_hash'],
            $user['sifre_guncellendi_at'],
            $user['yeni_sifre'],
            $user['portal_sifresi'],
            $user['password'],
            $user['password_hash'],
            $user['portal_sifresi_var'],
            $user['ilk_giris_parola_onerisi_bekliyor']
        );

        if ($userId !== '' && array_key_exists($userId, $requestedPasswords)) {
            $canManagePassword = is_array($context) && medisaCanManageUserRecord($incomingUser, $context);
            if (($context['role'] ?? '') === 'sube_yonetici') {
                $canManagePassword = $canManagePassword
                    && medisaResolveUserRole($incomingUser) === 'kullanici'
                    && (
                        !is_array($currentUser)
                        || (
                            medisaResolveUserRole($currentUser) === 'kullanici'
                            && medisaCanManageUserRecord($currentUser, $context)
                        )
                    );
            }
            if (!$canManagePassword) {
                return medisaBuildErrorResult('Bu kullanıcının parolasını değiştirme yetkiniz yok.', 403);
            }
            medisaSetUserPasswordHash($user, $requestedPasswords[$userId]);
            $user['ilk_giris_parola_onerisi_bekliyor'] = true;
            unset($requestedPasswords[$userId]);
        } elseif (is_array($currentUser)) {
            $currentHash = isset($currentUser['sifre_hash']) ? trim((string)$currentUser['sifre_hash']) : '';
            $currentPlain = isset($currentUser['sifre']) ? trim((string)$currentUser['sifre']) : '';
            if ($currentHash !== '') {
                $user['sifre_hash'] = $currentUser['sifre_hash'];
                if (isset($currentUser['sifre_guncellendi_at'])) {
                    $user['sifre_guncellendi_at'] = $currentUser['sifre_guncellendi_at'];
                }
            } elseif ($currentPlain !== '') {
                medisaSetUserPasswordHash($user, $currentPlain);
            }
            $user['ilk_giris_parola_onerisi_bekliyor'] = $currentPasswordChangeRequired;
        } else {
            $user['ilk_giris_parola_onerisi_bekliyor'] = false;
        }

        $reconciled[] = $user;
    }

    if (count($requestedPasswords) > 0) {
        return medisaBuildErrorResult('Parola değişikliği hedef kullanıcısı bulunamadı.', 400);
    }

    return [
        'success' => true,
        'users' => array_values($reconciled),
    ];
}

function medisaSaveApplyIncomingData(array $incomingData, array &$data, array $context) {
    $wireResolved = medisaSaveResolveWireMode($incomingData);
    if (($wireResolved['ok'] ?? false) !== true) {
        return $wireResolved['error'];
    }
    $wireMode = (string)($wireResolved['mode'] ?? 'legacy-full');
    $isDelta = ($wireResolved['isDelta'] ?? false) === true;

    $incomingVehicles = medisaSaveNormalizeCollection($incomingData['tasitlar'] ?? []);
    $incomingUsers = medisaSaveNormalizeCollection($incomingData['users'] ?? []);
    $currentVehicles = medisaSaveNormalizeCollection($data['tasitlar'] ?? []);
    $currentUsers = medisaSaveNormalizeCollection($data['users'] ?? []);
    $currentVehiclesById = medisaSaveIndexVehiclesById($currentVehicles);
    if (
        array_key_exists('_medisaUserPasswordChanges', $incomingData)
        && !is_array($incomingData['_medisaUserPasswordChanges'])
    ) {
        return medisaBuildErrorResult('Parola değişikliği formatı geçersiz.', 400);
    }
    $passwordChanges = is_array($incomingData['_medisaUserPasswordChanges'] ?? null)
        ? $incomingData['_medisaUserPasswordChanges']
        : null;
    $mutation = is_array($incomingData['_medisaMutation'] ?? null) ? $incomingData['_medisaMutation'] : null;
    $mutationCollections = $mutation !== null && is_array($mutation['collections'] ?? null)
        ? array_values(array_unique(array_map('strval', $mutation['collections'])))
        : null;
    $changedVehicleIds = $mutation !== null && is_array($mutation['changedVehicleIds'] ?? null)
        ? array_values(array_unique(array_filter(array_map('strval', $mutation['changedVehicleIds']), 'strlen')))
        : null;
    $deletedVehicleIds = $mutation !== null && is_array($mutation['deletedVehicleIds'] ?? null)
        ? array_values(array_unique(array_filter(array_map('strval', $mutation['deletedVehicleIds']), 'strlen')))
        : [];
    $deletedVehicleVersions = $mutation !== null && is_array($mutation['deletedVehicleVersions'] ?? null)
        ? $mutation['deletedVehicleVersions']
        : [];

    if ($isDelta) {
        $deltaValidation = medisaSaveValidateDeltaWireContract(
            $incomingData,
            $mutationCollections,
            $changedVehicleIds,
            $deletedVehicleIds,
            $deletedVehicleVersions
        );
        if ($deltaValidation !== true) {
            return $deltaValidation;
        }
    }

    if ($mutationCollections !== null && (!empty($changedVehicleIds) || !empty($deletedVehicleIds)) && !in_array('tasitlar', $mutationCollections, true)) {
        $mutationCollections[] = 'tasitlar';
    }
    $collectionChanged = function ($name) use ($mutationCollections) {
        return $mutationCollections === null || in_array($name, $mutationCollections, true);
    };
    $usersCollectionChanged = $collectionChanged('users');
    if (is_array($passwordChanges) && count($passwordChanges) > 0 && !$usersCollectionChanged) {
        return medisaBuildErrorResult('Parola değişikliği için kullanıcı koleksiyonu zorunludur.', 400);
    }

    $versionCheck = medisaSaveValidateIncomingVehicleVersions($incomingVehicles, $currentVehiclesById, $context, $changedVehicleIds);
    if ($versionCheck !== true) {
        return $versionCheck;
    }
    $savedVehicleIds = $changedVehicleIds;
    if ($changedVehicleIds === null) {
        $incomingVehicles = medisaSaveApplyVehicleVersions($incomingVehicles, $currentVehiclesById);
    } else {
        foreach ($deletedVehicleIds as $deletedVehicleId) {
            $currentVehicle = $currentVehiclesById[$deletedVehicleId] ?? null;
            if ($currentVehicle !== null && !medisaCanManageVehicleRecord($currentVehicle, $context)) {
                return medisaBuildErrorResult('Bu taşıtı silme yetkiniz yok.', 403);
            }
            if ($currentVehicle !== null && (int)($deletedVehicleVersions[$deletedVehicleId] ?? 0) !== medisaGetVehicleVersion($currentVehicle)) {
                return medisaBuildConflictResult('vehicle', $deletedVehicleId, 'Bu taşıt başka biri tarafından güncellendi. Güncel veriler yüklendi.');
            }
        }
        $incomingVehicles = medisaSaveApplyVehicleMutation($currentVehicles, $incomingVehicles, $changedVehicleIds, $deletedVehicleIds);
    }

    if (($context['role'] ?? '') === 'genel_yonetici') {
        if ($collectionChanged('tasitlar')) $data['tasitlar'] = $incomingVehicles;
        if ($collectionChanged('kayitlar')) $data['kayitlar'] = is_array($incomingData['kayitlar'] ?? null) ? $incomingData['kayitlar'] : ($data['kayitlar'] ?? []);
        if ($collectionChanged('branches')) $data['branches'] = medisaSaveNormalizeCollection($incomingData['branches'] ?? []);
        if ($usersCollectionChanged) {
            $userMutationCheck = medisaSaveValidateUserCollectionMutations($currentUsers, $incomingUsers, $context);
            if ($userMutationCheck !== true) {
                return $userMutationCheck;
            }
            $reconciledUsers = medisaReconcileUserCredentials($currentUsers, $incomingUsers, $passwordChanges, $context);
            if (($reconciledUsers['success'] ?? false) !== true) {
                return $reconciledUsers;
            }
            $data['users'] = $reconciledUsers['users'];
        }
        if ($collectionChanged('ayarlar')) $data['ayarlar'] = is_array($incomingData['ayarlar'] ?? null) ? $incomingData['ayarlar'] : ($data['ayarlar'] ?? []);
        if ($collectionChanged('sifreler')) $data['sifreler'] = medisaSaveNormalizeCollection($incomingData['sifreler'] ?? []);
    } else {
        $changedVehicleLookup = $changedVehicleIds === null ? null : array_fill_keys($changedVehicleIds, true);
        $vehiclesToAuthorize = $changedVehicleLookup === null
            ? $incomingVehicles
            : array_values(array_filter($incomingVehicles, function ($vehicle) use ($changedVehicleLookup) {
                return isset($changedVehicleLookup[(string)($vehicle['id'] ?? '')]);
            }));
        if ($collectionChanged('tasitlar') && !medisaSaveEnsureScopedVehiclesAreAllowed($vehiclesToAuthorize, $context)) {
            return medisaBuildErrorResult('Kapsam dışı veri kaydı engellendi.', 403);
        }
        if ($usersCollectionChanged) {
            $userMutationCheck = medisaSaveValidateUserCollectionMutations($currentUsers, $incomingUsers, $context);
            if ($userMutationCheck !== true) {
                return $userMutationCheck;
            }
        }

        if ($collectionChanged('tasitlar')) {
            $data['tasitlar'] = $changedVehicleIds === null
                ? medisaSaveMergeScopedCollection(
                    $currentVehicles,
                    $incomingVehicles,
                    function ($vehicle) use ($context) { return medisaCanManageVehicleRecord($vehicle, $context); },
                    function ($vehicle) use ($context) { return medisaCanManageVehicleRecord($vehicle, $context); }
                )
                : $incomingVehicles;
        }

        if ($usersCollectionChanged) {
            $reconciledUsers = medisaReconcileUserCredentials($currentUsers, $incomingUsers, $passwordChanges, $context);
            if (($reconciledUsers['success'] ?? false) !== true) {
                return $reconciledUsers;
            }
            $data['users'] = medisaSaveMergeScopedCollection(
                $currentUsers,
                $reconciledUsers['users'],
                function ($user) use ($context) { return medisaCanManageUserRecord($user, $context); },
                function ($user) use ($context) { return medisaCanManageUserRecord($user, $context); }
            );
        }
    }

    // Ham kasko listesi save_kasko.php üzerinden; eski istemci payload yoksayıldı (ana data.json şişmez).

    if (!is_array($data['notificationReadState'] ?? null)) {
        $data['notificationReadState'] = [];
    }
    $incomingReadState = $incomingData['notificationReadState'] ?? null;
    if ($collectionChanged('notificationReadState') && is_array($incomingReadState)) {
        $isListArray = function ($value) {
            if (!is_array($value)) return false;
            if (function_exists('array_is_list')) return array_is_list($value);
            $expectedIndex = 0;
            foreach ($value as $key => $_) {
                if ($key !== $expectedIndex) return false;
                $expectedIndex++;
            }
            return true;
        };
        $normalizeKeys = function ($keys) {
            $clean = [];
            if (!is_array($keys)) return $clean;
            foreach ($keys as $key) {
                $normalized = trim((string)$key);
                if ($normalized === '') continue;
                if (!in_array($normalized, $clean, true)) $clean[] = $normalized;
            }
            return array_slice($clean, -500);
        };
        $normalizeScopeState = function ($scopeState) use ($normalizeKeys, $isListArray) {
            $normalizeFirstSeenDates = function ($map) {
                $clean = [];
                if (!is_array($map)) return $clean;
                foreach ($map as $key => $date) {
                    $normalizedKey = trim((string)$key);
                    if (!is_scalar($date)) continue;
                    $normalizedDate = trim((string)$date);
                    if ($normalizedKey === '' || $normalizedDate === '') continue;
                    $clean[$normalizedKey] = $normalizedDate;
                }
                return $clean;
            };
            if ($isListArray($scopeState)) {
                $readKeys = $normalizeKeys($scopeState);
                return [
                    'readKeys' => $readKeys,
                    'dismissedKeys' => [],
                    'firstSeenDates' => [],
                    'migratedFromLocalStorage' => false,
                    'updatedAt' => '',
                ];
            }
            $scopeState = is_array($scopeState) ? $scopeState : [];
            $dismissedKeys = $normalizeKeys($scopeState['dismissedKeys'] ?? []);
            $readKeysRaw = is_array($scopeState['readKeys'] ?? null) ? $scopeState['readKeys'] : [];
            $readKeys = $normalizeKeys(array_merge($readKeysRaw, $dismissedKeys));
            return [
                'readKeys' => $readKeys,
                'dismissedKeys' => $dismissedKeys,
                'firstSeenDates' => $normalizeFirstSeenDates($scopeState['firstSeenDates'] ?? []),
                'migratedFromLocalStorage' => ($scopeState['migratedFromLocalStorage'] ?? false) === true,
                'updatedAt' => trim((string)($scopeState['updatedAt'] ?? '')),
            ];
        };
        $mergeUnique = function ($a, $b) use ($normalizeKeys) {
            return $normalizeKeys(array_merge(is_array($a) ? $a : [], is_array($b) ? $b : []));
        };
        $scopeDescriptor = medisaBuildNotificationScopeDescriptor($context);
        $allowedScopeKeys = $scopeDescriptor['saveAllowedKeys'];

        foreach ($allowedScopeKeys as $allowedScopeKey) {
            if (!array_key_exists($allowedScopeKey, $incomingReadState) || !is_array($incomingReadState[$allowedScopeKey])) continue;
            $serverScope = $normalizeScopeState($data['notificationReadState'][$allowedScopeKey] ?? []);
            $clientScope = $normalizeScopeState($incomingReadState[$allowedScopeKey]);
            $dismissedKeys = $mergeUnique($serverScope['dismissedKeys'], $clientScope['dismissedKeys']);
            $readKeys = $mergeUnique(array_merge($serverScope['readKeys'], $clientScope['readKeys']), $dismissedKeys);
            $firstSeenDates = is_array($serverScope['firstSeenDates'] ?? null) ? $serverScope['firstSeenDates'] : [];
            $clientFirstSeenDates = is_array($clientScope['firstSeenDates'] ?? null) ? $clientScope['firstSeenDates'] : [];
            foreach ($clientFirstSeenDates as $notifKey => $firstSeenDate) {
                if (!array_key_exists($notifKey, $firstSeenDates)) {
                    $firstSeenDates[$notifKey] = $firstSeenDate;
                }
            }
            $data['notificationReadState'][$allowedScopeKey] = [
                'readKeys' => $readKeys,
                'dismissedKeys' => $dismissedKeys,
                'firstSeenDates' => $firstSeenDates,
                'migratedFromLocalStorage' => $serverScope['migratedFromLocalStorage'] || $clientScope['migratedFromLocalStorage'],
                'updatedAt' => date('c'),
            ];
        }
    }

    if (!is_array($data['monthlyTodoWhatsAppLogs'] ?? null)) {
        $data['monthlyTodoWhatsAppLogs'] = [];
    }
    $incomingMonthlyWaLogs = $incomingData['monthlyTodoWhatsAppLogs'] ?? null;
    if ($collectionChanged('monthlyTodoWhatsAppLogs') && is_array($incomingMonthlyWaLogs)) {
        $validShortCodes = ['s', 'k', 'sk', 'm', 'e', 'me', 'km'];
        $mergeMonthlyWaEntry = function ($serverEntry, $clientEntry) {
            $serverEntry = is_array($serverEntry) ? $serverEntry : [];
            $clientEntry = is_array($clientEntry) ? $clientEntry : [];
            $sCount = (int)($serverEntry['openedCount'] ?? 0);
            $cCount = (int)($clientEntry['openedCount'] ?? 0);
            $openedCount = max($sCount, $cCount, 1);
            $sFirst = trim((string)($serverEntry['firstOpenedAt'] ?? ''));
            $cFirst = trim((string)($clientEntry['firstOpenedAt'] ?? ''));
            $firstOpenedAt = ($sFirst !== '' && $cFirst !== '')
                ? (strcmp($sFirst, $cFirst) <= 0 ? $sFirst : $cFirst)
                : ($sFirst !== '' ? $sFirst : $cFirst);
            $sLast = trim((string)($serverEntry['lastOpenedAt'] ?? ''));
            $cLast = trim((string)($clientEntry['lastOpenedAt'] ?? ''));
            $lastOpenedAt = ($sLast !== '' && $cLast !== '')
                ? (strcmp($sLast, $cLast) >= 0 ? $sLast : $cLast)
                : ($sLast !== '' ? $sLast : $cLast);
            if ($lastOpenedAt === '') {
                $lastOpenedAt = date('c');
            }
            return [
                'vehicleId' => trim((string)($clientEntry['vehicleId'] ?? $serverEntry['vehicleId'] ?? '')),
                'plate' => trim((string)($clientEntry['plate'] ?? $serverEntry['plate'] ?? '')),
                'type' => trim((string)($clientEntry['type'] ?? $serverEntry['type'] ?? '')),
                'field' => trim((string)($clientEntry['field'] ?? $serverEntry['field'] ?? '')),
                'date' => trim((string)($clientEntry['date'] ?? $serverEntry['date'] ?? '')),
                'firstOpenedAt' => $firstOpenedAt !== '' ? $firstOpenedAt : date('c'),
                'lastOpenedAt' => $lastOpenedAt,
                'openedCount' => $openedCount,
                'openedBy' => mb_substr(trim((string)($clientEntry['openedBy'] ?? $serverEntry['openedBy'] ?? '')), 0, 200, 'UTF-8'),
            ];
        };
        foreach ($incomingMonthlyWaLogs as $rawKey => $entry) {
            $key = trim((string)$rawKey);
            if ($key === '' || !is_array($entry) || strlen($key) > 320) {
                continue;
            }
            if (!preg_match('/^monthlyTodo:/', $key)) {
                continue;
            }
            $typeCode = strtolower(trim((string)($entry['type'] ?? '')));
            if ($typeCode !== '' && !in_array($typeCode, $validShortCodes, true) && !preg_match('/^[a-z0-9_+]{1,40}$/', $typeCode)) {
                continue;
            }
            $entry['type'] = $typeCode;
            $serverEntry = is_array($data['monthlyTodoWhatsAppLogs'][$key] ?? null) ? $data['monthlyTodoWhatsAppLogs'][$key] : [];
            $data['monthlyTodoWhatsAppLogs'][$key] = $mergeMonthlyWaEntry($serverEntry, $entry);
        }
        if (count($data['monthlyTodoWhatsAppLogs']) > 4000) {
            uasort($data['monthlyTodoWhatsAppLogs'], function ($a, $b) {
                $la = is_array($a) ? trim((string)($a['lastOpenedAt'] ?? '')) : '';
                $lb = is_array($b) ? trim((string)($b['lastOpenedAt'] ?? '')) : '';
                return strcmp($lb, $la);
            });
            $data['monthlyTodoWhatsAppLogs'] = array_slice($data['monthlyTodoWhatsAppLogs'], 0, 3000, true);
        }
    }

    $appliedCollections = $mutationCollections !== null
        ? $mutationCollections
        : medisaSavePersistCollectionAllowlist();

    return [
        'success' => true,
        'wireMode' => $wireMode,
        'appliedCollections' => $appliedCollections,
        'vehicleVersions' => medisaSaveBuildVehicleVersions(array_values(array_filter($incomingVehicles, function ($vehicle) use ($savedVehicleIds) {
            return $savedVehicleIds === null || in_array((string)($vehicle['id'] ?? ''), $savedVehicleIds, true);
        }))),
    ];
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
        'satis_sozlesmesi' => [
            'pathField' => 'satisSozlesmesiPath',
            'dir' => 'satis_sozlesmesi',
            'fallbackName' => 'satis-sozlesmesi',
            'notFound' => 'Satış sözleşmesi bulunamadı',
        ],
    ];

    return $configs[$type] ?? null;
}

function medisaResolveVehicleDocumentCandidatePath($rawPath, array $config) {
    $raw = trim((string)$rawPath);
    if ($raw === '') {
        return null;
    }

    $expectedDir = trim((string)($config['dir'] ?? ''), '/');
    if ($expectedDir === '') {
        return null;
    }

    $relative = ltrim(str_replace('\\', '/', $raw), '/');
    if (strpos($relative, 'data/') === 0) {
        $relative = substr($relative, 5);
    }

    $segments = explode('/', $relative);
    foreach ($segments as $segment) {
        if ($segment === '' || $segment === '.' || $segment === '..') {
            return null;
        }
    }

    if (strpos($relative, $expectedDir . '/') !== 0) {
        return null;
    }

    $baseDir = realpath(getDataDirPath() . DIRECTORY_SEPARATOR . $expectedDir);
    if ($baseDir === false) {
        return null;
    }

    $candidatePath = getDataDirPath() . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
    $realCandidate = realpath($candidatePath);
    if ($realCandidate === false || !is_file($realCandidate)) {
        return null;
    }

    $basePrefix = rtrim($baseDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
    if (strpos($realCandidate, $basePrefix) !== 0) {
        return null;
    }

    return $realCandidate;
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
                $settingsCandidate = medisaResolveVehicleDocumentCandidatePath($rawSettingsPath, $config);
                if ($settingsCandidate !== null) {
                    $candidates[] = $settingsCandidate;
                }
            }
        }
    }
    $rawPath = trim((string)($vehicle[$config['pathField']] ?? ''));
    if ($rawPath !== '') {
        $documentCandidate = medisaResolveVehicleDocumentCandidatePath($rawPath, $config);
        if ($documentCandidate !== null) {
            $candidates[] = $documentCandidate;
        }
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

/** Kısa ömürlü belge görüntüleme token süresi (saniye). */
define('MEDISA_DOCUMENT_TOKEN_TTL_SECONDS', 300);

function medisaDocumentTokenHeader(): array {
    return ['alg' => 'HS256', 'typ' => 'DOC'];
}

function medisaEncodeSignedDocToken(array $payload): string {
    $header = medisaDocumentTokenHeader();
    $encodedHeader = medisaBase64UrlEncode(json_encode($header, JSON_UNESCAPED_UNICODE));
    $encodedPayload = medisaBase64UrlEncode(json_encode($payload, JSON_UNESCAPED_UNICODE));
    $signature = hash_hmac('sha256', $encodedHeader . '.' . $encodedPayload, medisaGetTokenSecret(), true);
    $encodedSignature = medisaBase64UrlEncode($signature);

    return $encodedHeader . '.' . $encodedPayload . '.' . $encodedSignature;
}

function medisaCreateDocumentToken(array $claims, int $ttlSeconds = MEDISA_DOCUMENT_TOKEN_TTL_SECONDS): string {
    $now = time();
    $ttlSeconds = max(1, (int)$ttlSeconds);
    $payload = array_merge($claims, [
        'typ' => 'DOC',
        'purpose' => 'document_view',
        'iat' => $now,
        'exp' => $now + $ttlSeconds,
    ]);
    $payload['typ'] = 'DOC';
    $payload['purpose'] = 'document_view';

    return medisaEncodeSignedDocToken($payload);
}

function medisaValidateDocumentToken(string $token): ?array {
    $token = trim($token);
    if ($token === '' || strpos($token, '.') === false) {
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

    $header = json_decode((string)medisaBase64UrlDecode($encodedHeader), true);
    if (!is_array($header) || ($header['typ'] ?? '') !== 'DOC') {
        return null;
    }

    $decoded = json_decode((string)medisaBase64UrlDecode($encodedPayload), true);
    if (!is_array($decoded)) {
        return null;
    }
    if (($decoded['typ'] ?? '') !== 'DOC' || ($decoded['purpose'] ?? '') !== 'document_view') {
        return null;
    }
    if (!isset($decoded['exp']) || (int)$decoded['exp'] < time()) {
        return null;
    }

    return $decoded;
}

function medisaMintDocumentAccessToken(array $data, array $context, string $vehicleId, string $documentType): array {
    $documentType = strtolower(trim($documentType));
    if ($documentType === '') {
        $documentType = 'ruhsat';
    }

    $config = medisaGetVehicleDocumentConfig($documentType);
    if (!$config) {
        return [
            'success' => false,
            'status' => 400,
            'message' => 'Geçersiz belge tipi',
        ];
    }

    $role = medisaNormalizeRoleValue($context['role'] ?? 'kullanici');
    $userId = trim((string)($context['user_id'] ?? ''));
    if ($userId === '') {
        return [
            'success' => false,
            'status' => 403,
            'message' => 'Bu belge için yetkiniz yok.',
        ];
    }

    $isSettingsDocument = !empty($config['settingsKey']);
    if ($isSettingsDocument) {
        if (!medisaHasMainAppAccessRole($role)) {
            return [
                'success' => false,
                'status' => 403,
                'message' => 'Bu belge için yetkiniz yok.',
            ];
        }

        $claims = [
            'sub' => $userId,
            'role' => $role,
            'vid' => 'settings',
            'dtype' => $documentType,
            'scope' => 'settings',
        ];
    } else {
        $vehicleId = trim($vehicleId);
        if ($vehicleId === '') {
            return [
                'success' => false,
                'status' => 400,
                'message' => 'id parametresi gerekli',
            ];
        }

        $vehicleIndex = medisaFindVehicleIndex($data, $vehicleId);
        if ($vehicleIndex < 0) {
            return [
                'success' => false,
                'status' => 403,
                'message' => 'Bu belge için yetkiniz yok.',
            ];
        }

        $vehicle = $data['tasitlar'][$vehicleIndex];
        if (!medisaCanViewVehicleRecord($vehicle, $context)) {
            return [
                'success' => false,
                'status' => 403,
                'message' => 'Bu belge için yetkiniz yok.',
            ];
        }

        $claims = [
            'sub' => $userId,
            'role' => $role,
            'vid' => $vehicleId,
            'dtype' => $documentType,
            'scope' => 'vehicle',
        ];
    }

    $ttl = MEDISA_DOCUMENT_TOKEN_TTL_SECONDS;
    $now = time();
    $exp = $now + $ttl;

    return [
        'success' => true,
        'token' => medisaCreateDocumentToken($claims, $ttl),
        'expiresAt' => $exp,
    ];
}

function medisaResolveDocumentAccessContext(array $data, string $vehicleId, string $documentType): array {
    $documentType = strtolower(trim($documentType));
    if ($documentType === '') {
        $documentType = 'ruhsat';
    }

    $config = medisaGetVehicleDocumentConfig($documentType);
    if (!$config) {
        return [
            'success' => false,
            'status' => 400,
            'message' => 'Geçersiz belge tipi',
        ];
    }

    $isSettingsDocument = !empty($config['settingsKey']);

    $bearerToken = medisaExtractBearerTokenValue(medisaReadAuthorizationHeader());
    if ($bearerToken !== '') {
        $sessionData = validateToken();
        if (!$sessionData) {
            return [
                'success' => false,
                'status' => 401,
                'message' => 'Oturum gerekli.',
            ];
        }

        $sessionResolution = medisaResolveSessionContext($data, $sessionData);
        if (($sessionResolution['success'] ?? false) !== true) {
            return $sessionResolution;
        }
        $context = $sessionResolution['context'];

        return [
            'success' => true,
            'context' => $context,
            'auth_method' => 'bearer',
        ];
    }

    $legacyQueryToken = trim((string)($_GET['token'] ?? ''));
    if ($legacyQueryToken !== '') {
        return [
            'success' => false,
            'status' => 401,
            'message' => 'Geçersiz oturum. Belge erişim anahtarı gerekli.',
        ];
    }

    $docTokenRaw = trim((string)($_GET['doc'] ?? ''));
    if ($docTokenRaw === '') {
        return [
            'success' => false,
            'status' => 401,
            'message' => 'Oturum gerekli.',
        ];
    }

    $docClaims = medisaValidateDocumentToken($docTokenRaw);
    if (!$docClaims) {
        return [
            'success' => false,
            'status' => 401,
            'message' => 'Geçersiz veya süresi dolmuş belge erişim anahtarı.',
        ];
    }

    $tokenDtype = strtolower(trim((string)($docClaims['dtype'] ?? '')));
    if ($tokenDtype !== $documentType) {
        return [
            'success' => false,
            'status' => 403,
            'message' => 'Belge erişim anahtarı uyuşmuyor.',
        ];
    }

    $scope = strtolower(trim((string)($docClaims['scope'] ?? 'vehicle')));
    if ($isSettingsDocument) {
        if ($scope !== 'settings') {
            return [
                'success' => false,
                'status' => 403,
                'message' => 'Belge erişim anahtarı uyuşmuyor.',
            ];
        }
    } else {
        if ($scope !== 'vehicle') {
            return [
                'success' => false,
                'status' => 403,
                'message' => 'Belge erişim anahtarı uyuşmuyor.',
            ];
        }

        $requestVehicleId = trim($vehicleId);
        $tokenVehicleId = trim((string)($docClaims['vid'] ?? ''));
        if ($requestVehicleId === '' || $tokenVehicleId === '' || !hash_equals($tokenVehicleId, $requestVehicleId)) {
            return [
                'success' => false,
                'status' => 403,
                'message' => 'Belge erişim anahtarı uyuşmuyor.',
            ];
        }
    }

    $userId = trim((string)($docClaims['sub'] ?? ''));
    if ($userId === '') {
        return [
            'success' => false,
            'status' => 401,
            'message' => 'Geçersiz belge erişim anahtarı.',
        ];
    }

    $context = medisaBuildAccessContext($data, ['user_id' => $userId]);
    if (!$context) {
        return [
            'success' => false,
            'status' => 403,
            'message' => 'Bu işlem için yetkiniz yok.',
        ];
    }
    if (medisaContextRequiresFirstLoginPasswordChange($context)) {
        return [
            'success' => false,
            'status' => 403,
            'code' => 'PASSWORD_CHANGE_REQUIRED',
            'password_change_required' => true,
            'message' => 'Uygulamayı kullanmadan önce parolanızı değiştirmeniz gerekiyor.',
        ];
    }

    if ($isSettingsDocument) {
        if (!medisaHasMainAppAccessRole($context['role'] ?? 'kullanici')) {
            return [
                'success' => false,
                'status' => 403,
                'message' => 'Bu belge için yetkiniz yok.',
            ];
        }
    } else {
        $vehicleIndex = medisaFindVehicleIndex($data, $vehicleId);
        if ($vehicleIndex < 0) {
            return [
                'success' => false,
                'status' => 404,
                'message' => 'Taşıt bulunamadı',
            ];
        }

        $vehicle = $data['tasitlar'][$vehicleIndex];
        if (!medisaCanViewVehicleRecord($vehicle, $context)) {
            return [
                'success' => false,
                'status' => 403,
                'message' => 'Bu belge için yetkiniz yok.',
            ];
        }
    }

    return [
        'success' => true,
        'context' => $context,
        'auth_method' => 'doc_token',
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
    $token = medisaReadAccessToken();
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

    $header = json_decode((string)medisaBase64UrlDecode($encodedHeader), true);
    if (is_array($header) && ($header['typ'] ?? '') === 'DOC') {
        return null;
    }

    $decoded = json_decode((string)medisaBase64UrlDecode($encodedPayload), true);
    if (!$decoded || !isset($decoded['exp']) || (int)$decoded['exp'] < time()) {
        return null;
    }
    if (($decoded['typ'] ?? '') === 'DOC' || ($decoded['purpose'] ?? '') === 'document_view') {
        return null;
    }

    return $decoded;
}

// Restore write-freeze / registry helpers (default disabled; safe to load always).
require_once __DIR__ . '/server_restore.php';
