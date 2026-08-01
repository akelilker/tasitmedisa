<?php
/**
 * Güvenli sunucu restore altyapısı (R1/R2).
 * Varsayılan: DISABLED. Production data path'e yazım yalnız commit + flag + maintenance ile.
 * Test: MEDISA_RESTORE_TEST_MODE + $MEDISA_RESTORE_ENV_OVERRIDE (path injection).
 */

if (!defined('MEDISA_SERVER_RESTORE_LIB')) {
    define('MEDISA_SERVER_RESTORE_LIB', true);
}

define('MEDISA_RESTORE_CONFIRMATION_TEXT', 'SUNUCU YEDEĞİNİ GERİ YÜKLE');
define('MEDISA_RESTORE_INTENT_TTL_SECONDS', 480);
define('MEDISA_RESTORE_MAX_BYTES', 33554432); // 32 MiB
define('MEDISA_RESTORE_SCHEMA_SUPPORTED', 'legacy-v1');

function medisaEnvFlagTrue($name) {
    $raw = getenv($name);
    if ($raw === false || $raw === null) {
        return false;
    }
    $v = strtolower(trim((string)$raw));
    return $v === '1' || $v === 'true' || $v === 'yes' || $v === 'on';
}

function medisaRestoreEnv() {
    static $cached = null;
    if (defined('MEDISA_RESTORE_TEST_MODE') && MEDISA_RESTORE_TEST_MODE === true
        && isset($GLOBALS['MEDISA_RESTORE_ENV_OVERRIDE'])
        && is_array($GLOBALS['MEDISA_RESTORE_ENV_OVERRIDE'])) {
        return $GLOBALS['MEDISA_RESTORE_ENV_OVERRIDE'];
    }
    if ($cached !== null) {
        return $cached;
    }
    $dataDir = getDataDirPath();
    $cached = [
        'data_dir' => $dataDir,
        'data_file' => getDataFilePath(),
        'main_backup' => getMainBackupFilePath(),
        'snapshots_dir' => getSnapshotsDirPath(),
        'runtime_dir' => $dataDir . DIRECTORY_SEPARATOR . '.medisa_restore',
        'max_bytes' => MEDISA_RESTORE_MAX_BYTES,
        'enabled' => medisaEnvFlagTrue('MEDISA_SERVER_RESTORE_ENABLED'),
        'maintenance' => medisaEnvFlagTrue('MEDISA_RESTORE_MAINTENANCE_MODE'),
        'secret' => (string)(getenv('MEDISA_RESTORE_HMAC_SECRET') ?: ''),
    ];
    return $cached;
}

function medisaRestoreIsEnabled() {
    return !empty(medisaRestoreEnv()['enabled']);
}

function medisaRestoreIsMaintenanceMode() {
    return !empty(medisaRestoreEnv()['maintenance']);
}

function medisaRestoreHasSecret() {
    return strlen((string)(medisaRestoreEnv()['secret'] ?? '')) >= 16;
}

function medisaRestoreIsWriteFrozen() {
    return medisaRestoreIsMaintenanceMode();
}

function medisaRestoreSetCommitBypass($on) {
    $GLOBALS['MEDISA_RESTORE_COMMIT_BYPASS'] = $on ? true : false;
}

function medisaRestoreCommitBypassActive() {
    return !empty($GLOBALS['MEDISA_RESTORE_COMMIT_BYPASS']);
}

function medisaRestoreError($code, $message, $status = 400, array $extra = []) {
    return array_merge([
        'success' => false,
        'error_code' => $code,
        'message' => $message,
        'status' => $status,
    ], $extra);
}

function medisaRestoreJsonInput() {
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [null, medisaRestoreError('INVALID_JSON', 'Boş istek gövdesi.', 400)];
    }
    $data = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($data)) {
        return [null, medisaRestoreError('INVALID_JSON', 'Geçersiz JSON.', 400)];
    }
    return [$data, null];
}

function medisaRestoreEnsureRuntimeDir($env = null) {
    $env = $env ?: medisaRestoreEnv();
    $dir = $env['runtime_dir'];
    if (!is_dir($dir) && !@mkdir($dir, 0700, true)) {
        return false;
    }
    return is_dir($dir) && is_writable($dir);
}

function medisaRestoreAllowedRoots($env = null) {
    $env = $env ?: medisaRestoreEnv();
    $roots = [];
    $dataDir = realpath($env['data_dir']);
    if ($dataDir !== false) {
        $roots[] = $dataDir;
    }
    $snap = $env['snapshots_dir'];
    if (is_dir($snap)) {
        $snapReal = realpath($snap);
        if ($snapReal !== false) {
            $roots[] = $snapReal;
        }
    }
    return array_values(array_unique($roots));
}

function medisaRestoreIsPathInsideRoot($realPath, $rootReal) {
    $realPath = str_replace('\\', '/', $realPath);
    $rootReal = rtrim(str_replace('\\', '/', $rootReal), '/');
    return $realPath === $rootReal || strpos($realPath, $rootReal . '/') === 0;
}

function medisaRestoreResolveSafeFile($candidatePath, $env = null) {
    $env = $env ?: medisaRestoreEnv();
    if (!is_string($candidatePath) || $candidatePath === '') {
        return medisaRestoreError('BACKUP_PATH_INVALID', 'Geçersiz yedek yolu.', 400);
    }
    if (strpos($candidatePath, "\0") !== false) {
        return medisaRestoreError('BACKUP_PATH_INVALID', 'Geçersiz yedek yolu.', 400);
    }
    if (is_link($candidatePath)) {
        return medisaRestoreError('BACKUP_SYMLINK_REJECTED', 'Sembolik bağlantı reddedildi.', 400);
    }
    if (!is_file($candidatePath)) {
        return medisaRestoreError('BACKUP_NOT_FOUND', 'Yedek dosyası bulunamadı.', 404);
    }
    $real = realpath($candidatePath);
    if ($real === false) {
        return medisaRestoreError('BACKUP_PATH_INVALID', 'Yedek yolu çözülemedi.', 400);
    }
    if (is_link($real)) {
        return medisaRestoreError('BACKUP_SYMLINK_REJECTED', 'Sembolik bağlantı reddedildi.', 400);
    }
    $okRoot = false;
    foreach (medisaRestoreAllowedRoots($env) as $root) {
        if (medisaRestoreIsPathInsideRoot($real, $root)) {
            $okRoot = true;
            break;
        }
    }
    if (!$okRoot) {
        return medisaRestoreError('BACKUP_PATH_INVALID', 'Yedek izin verilen kök dışında.', 400);
    }
    $base = basename($real);
    if (!preg_match('/\.(json)$/i', $base)) {
        return medisaRestoreError('BACKUP_PATH_INVALID', 'Yedek uzantısı geçersiz.', 400);
    }
    $size = filesize($real);
    if ($size === false) {
        return medisaRestoreError('BACKUP_NOT_FOUND', 'Yedek boyutu okunamadı.', 404);
    }
    if ($size > (int)$env['max_bytes']) {
        return medisaRestoreError('BACKUP_TOO_LARGE', 'Yedek boyutu limiti aşıyor.', 413);
    }
    return [
        'success' => true,
        'path' => $real,
        'basename' => $base,
        'size_bytes' => (int)$size,
    ];
}

function medisaRestoreFileSha256($path) {
    $hash = @hash_file('sha256', $path);
    return is_string($hash) ? $hash : null;
}

function medisaRestoreCandidateSources($env = null) {
    $env = $env ?: medisaRestoreEnv();
    $out = [];
    $main = $env['main_backup'];
    if (is_file($main) && !is_link($main)) {
        $out[] = ['path' => $main, 'source' => 'main_backup'];
    }
    $snapDir = $env['snapshots_dir'];
    if (is_dir($snapDir)) {
        $files = glob(rtrim($snapDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'snapshot-*.json') ?: [];
        foreach ($files as $f) {
            $out[] = ['path' => $f, 'source' => 'snapshot'];
        }
    }
    $emerg = glob(rtrim($snapDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'emergency-prerestore-*.json') ?: [];
    foreach ($emerg as $f) {
        $out[] = ['path' => $f, 'source' => 'pre_restore_emergency'];
    }
    return $out;
}

function medisaRestoreDetectSchemaVersion(array $data) {
    foreach (['schema_version', '_schema_version', 'app_schema_version'] as $k) {
        if (isset($data[$k]) && is_scalar($data[$k]) && (string)$data[$k] !== '') {
            return (string)$data[$k];
        }
    }
    return MEDISA_RESTORE_SCHEMA_SUPPORTED;
}

function medisaRestoreRecordCounts(array $data) {
    $vehicles = null;
    if (isset($data['vehicles']) && is_array($data['vehicles'])) {
        $vehicles = count($data['vehicles']);
    } elseif (isset($data['tasitlar']) && is_array($data['tasitlar'])) {
        $vehicles = count($data['tasitlar']);
    }
    $events = 0;
    $docRefs = 0;
    $vehicleList = [];
    if (isset($data['vehicles']) && is_array($data['vehicles'])) {
        $vehicleList = $data['vehicles'];
    } elseif (isset($data['tasitlar']) && is_array($data['tasitlar'])) {
        $vehicleList = $data['tasitlar'];
    }
    foreach ($vehicleList as $v) {
        if (!is_array($v)) {
            continue;
        }
        if (isset($v['events']) && is_array($v['events'])) {
            $events += count($v['events']);
        }
        if (isset($v['belgeler']) && is_array($v['belgeler'])) {
            $docRefs += count($v['belgeler']);
        }
        if (isset($v['documents']) && is_array($v['documents'])) {
            $docRefs += count($v['documents']);
        }
        if (!empty($v['ruhsat']) || !empty($v['ruhsatPath']) || !empty($v['ruhsat_url'])) {
            $docRefs += 1;
        }
    }
    return [
        'vehicles' => $vehicles,
        'branches' => isset($data['branches']) && is_array($data['branches']) ? count($data['branches']) : null,
        'users' => isset($data['users']) && is_array($data['users']) ? count($data['users']) : null,
        'kayitlar' => isset($data['kayitlar']) && is_array($data['kayitlar']) ? count($data['kayitlar']) : null,
        'events' => $events,
        'document_refs' => $docRefs,
        'roles_genel_yonetici' => medisaRestoreCountRole($data, 'genel_yonetici'),
        'roles_sube_yonetici' => medisaRestoreCountRole($data, 'sube_yonetici'),
        'roles_kullanici' => medisaRestoreCountRole($data, 'kullanici'),
    ];
}

function medisaRestoreCountRole(array $data, $role) {
    if (!isset($data['users']) || !is_array($data['users'])) {
        return 0;
    }
    $n = 0;
    foreach ($data['users'] as $u) {
        if (!is_array($u)) {
            continue;
        }
        $r = strtolower((string)($u['rol'] ?? $u['role'] ?? ''));
        if ($r === $role) {
            $n++;
        }
    }
    return $n;
}

function medisaRestoreStructuralHash(array $data) {
    $payload = [
        'schema_version' => medisaRestoreDetectSchemaVersion($data),
        'counts' => medisaRestoreRecordCounts($data),
        'top_keys' => array_values(array_filter(array_map('strval', array_keys($data)))),
    ];
    sort($payload['top_keys']);
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return hash('sha256', $json === false ? '' : $json);
}

function medisaRestoreCanonicalNormalize(array $raw) {
    $warnings = [];
    $vehicles = null;
    if (isset($raw['vehicles']) && is_array($raw['vehicles'])) {
        $vehicles = $raw['vehicles'];
    } elseif (isset($raw['tasitlar']) && is_array($raw['tasitlar'])) {
        $vehicles = $raw['tasitlar'];
        $warnings[] = 'normalized_tasitlar_to_vehicles_alias';
    }
    $branches = isset($raw['branches']) && is_array($raw['branches']) ? $raw['branches'] : null;
    $users = isset($raw['users']) && is_array($raw['users']) ? $raw['users'] : null;
    $missing = [];
    if ($vehicles === null) {
        $missing[] = 'vehicles';
    }
    if ($branches === null) {
        $missing[] = 'branches';
    }
    if ($users === null) {
        $missing[] = 'users';
    }
    if ($missing) {
        return [
            'success' => false,
            'error_code' => 'NORMALIZATION_FAILED',
            'missing_required_collections' => $missing,
            'warnings' => $warnings,
        ];
    }

    $known = [
        'vehicles', 'tasitlar', 'branches', 'users', 'kayitlar', 'ayarlar', 'sifreler',
        'arac_aylik_hareketler', 'duzeltme_talepleri', 'notificationReadState',
        'monthlyTodoWhatsAppLogs', 'schema_version', '_schema_version', 'app_schema_version',
        'upload_date', 'backup_date', 'source',
    ];
    $unknown = [];
    foreach (array_keys($raw) as $k) {
        if (!in_array($k, $known, true)) {
            $unknown[] = (string)$k;
        }
    }

    $out = medisaDefaultData();
    $out['tasitlar'] = $vehicles;
    $out['branches'] = $branches;
    $out['users'] = $users;
    $out['kayitlar'] = isset($raw['kayitlar']) && is_array($raw['kayitlar']) ? $raw['kayitlar'] : [];
    if (isset($raw['ayarlar']) && is_array($raw['ayarlar'])) {
        $out['ayarlar'] = $raw['ayarlar'];
    }
    if (isset($raw['sifreler']) && is_array($raw['sifreler'])) {
        $out['sifreler'] = $raw['sifreler'];
    }
    if (isset($raw['arac_aylik_hareketler']) && is_array($raw['arac_aylik_hareketler'])) {
        $out['arac_aylik_hareketler'] = $raw['arac_aylik_hareketler'];
    }
    if (isset($raw['duzeltme_talepleri']) && is_array($raw['duzeltme_talepleri'])) {
        $out['duzeltme_talepleri'] = $raw['duzeltme_talepleri'];
    }
    if (isset($raw['notificationReadState']) && is_array($raw['notificationReadState'])) {
        $out['notificationReadState'] = $raw['notificationReadState'];
    }
    if (isset($raw['monthlyTodoWhatsAppLogs']) && is_array($raw['monthlyTodoWhatsAppLogs'])) {
        $out['monthlyTodoWhatsAppLogs'] = $raw['monthlyTodoWhatsAppLogs'];
    }
    unset($out['kaskoDegerListesi']);

    $schema = medisaRestoreDetectSchemaVersion($raw);
    if ($schema !== MEDISA_RESTORE_SCHEMA_SUPPORTED && $schema !== 'legacy-v1') {
        // Accept unknown only if required collections normalize; mark unsupported for safety.
        if (!in_array($schema, [MEDISA_RESTORE_SCHEMA_SUPPORTED, 'legacy-v1', '1', 'v1'], true)) {
            return [
                'success' => false,
                'error_code' => 'SCHEMA_UNSUPPORTED',
                'schema_version' => $schema,
                'warnings' => $warnings,
            ];
        }
    }

    return [
        'success' => true,
        'data' => $out,
        'schema_version' => $schema,
        'missing_required_collections' => [],
        'unknown_collections' => $unknown,
        'warnings' => $warnings,
    ];
}

function medisaRestoreParseBackupFile($path, $env = null) {
    $safe = medisaRestoreResolveSafeFile($path, $env);
    if (($safe['success'] ?? false) !== true) {
        return $safe;
    }
    $sha = medisaRestoreFileSha256($safe['path']);
    if ($sha === null) {
        return medisaRestoreError('BACKUP_HASH_MISMATCH', 'Yedek hash hesaplanamadı.', 400);
    }
    $raw = @file_get_contents($safe['path']);
    if ($raw === false || $raw === '') {
        return medisaRestoreError('INVALID_JSON', 'Yedek içeriği okunamadı.', 400);
    }
    $decoded = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
        return medisaRestoreError('INVALID_JSON', 'Yedek geçersiz JSON.', 400);
    }
    $norm = medisaRestoreCanonicalNormalize($decoded);
    if (($norm['success'] ?? false) !== true) {
        return medisaRestoreError(
            $norm['error_code'] ?? 'NORMALIZATION_FAILED',
            'Yedek normalize edilemedi.',
            422,
            [
                'missing_required_collections' => $norm['missing_required_collections'] ?? [],
                'schema_version' => $norm['schema_version'] ?? null,
                'warnings' => $norm['warnings'] ?? [],
            ]
        );
    }
    return [
        'success' => true,
        'path' => $safe['path'],
        'basename' => $safe['basename'],
        'size_bytes' => $safe['size_bytes'],
        'sha256' => $sha,
        'raw' => $decoded,
        'normalized' => $norm['data'],
        'schema_version' => $norm['schema_version'],
        'missing_required_collections' => [],
        'unknown_collections' => $norm['unknown_collections'],
        'warnings' => $norm['warnings'],
        'record_counts' => medisaRestoreRecordCounts($norm['data']),
        'structural_hash' => medisaRestoreStructuralHash($norm['data']),
    ];
}

function medisaRestoreMakeBackupId($source, $basename, $sha256) {
    return substr(hash('sha256', 'medisa-backup-v1|' . $source . '|' . $basename . '|' . $sha256), 0, 40);
}

function medisaRestoreBuildRegistryEntry(array $candidate, $env = null) {
    $env = $env ?: medisaRestoreEnv();
    $safe = medisaRestoreResolveSafeFile($candidate['path'], $env);
    if (($safe['success'] ?? false) !== true) {
        return null;
    }
    $sha = medisaRestoreFileSha256($safe['path']);
    if ($sha === null) {
        return null;
    }
    $mtime = @filemtime($safe['path']);
    $createdAt = $mtime ? date('c', $mtime) : null;
    $validation = 'unvalidated';
    $eligible = false;
    $schema = null;
    $counts = null;
    $parse = medisaRestoreParseBackupFile($safe['path'], $env);
    if (($parse['success'] ?? false) === true) {
        $validation = 'valid';
        $eligible = true;
        $schema = $parse['schema_version'];
        $counts = $parse['record_counts'];
        $sha = $parse['sha256'];
    } else {
        $validation = 'invalid';
        $eligible = false;
    }
    $backupId = medisaRestoreMakeBackupId($candidate['source'], $safe['basename'], $sha);
    return [
        'backup_id' => $backupId,
        'server_generated_filename' => $safe['basename'],
        'created_at' => $createdAt,
        'modified_at' => $createdAt,
        'source' => $candidate['source'],
        'size_bytes' => $safe['size_bytes'],
        'sha256' => $sha,
        'schema_version' => $schema,
        'app_version' => null,
        'record_counts' => $counts,
        'immutable' => true,
        'validation_status' => $validation,
        'restore_eligible' => $eligible,
        'retention' => $candidate['source'] === 'pre_restore_emergency' ? 'protected_emergency' : 'snapshot_policy',
        '_internal_path' => $safe['path'],
    ];
}

function medisaRestoreListRegistry($env = null) {
    $env = $env ?: medisaRestoreEnv();
    $entries = [];
    $byId = [];
    foreach (medisaRestoreCandidateSources($env) as $cand) {
        $entry = medisaRestoreBuildRegistryEntry($cand, $env);
        if ($entry === null) {
            continue;
        }
        $id = $entry['backup_id'];
        if (isset($byId[$id])) {
            continue;
        }
        $byId[$id] = true;
        $entries[] = $entry;
    }
    usort($entries, function ($a, $b) {
        return strcmp((string)($b['created_at'] ?? ''), (string)($a['created_at'] ?? ''));
    });
    return $entries;
}

function medisaRestorePublicEntry(array $entry) {
    $pub = $entry;
    unset($pub['_internal_path']);
    return $pub;
}

function medisaRestoreFindById($backupId, $env = null) {
    if (!is_string($backupId) || !preg_match('/^[a-f0-9]{40}$/', $backupId)) {
        return medisaRestoreError('INVALID_BACKUP_ID', 'Geçersiz backup_id.', 400);
    }
    foreach (medisaRestoreListRegistry($env) as $entry) {
        if (($entry['backup_id'] ?? '') === $backupId) {
            return ['success' => true, 'entry' => $entry];
        }
    }
    return medisaRestoreError('BACKUP_NOT_FOUND', 'Kayıtlı yedek bulunamadı.', 404);
}

function medisaRestoreCurrentDataArray($env = null) {
    $env = $env ?: medisaRestoreEnv();
    $path = $env['data_file'];
    if (!is_file($path)) {
        return medisaDefaultData();
    }
    $raw = @file_get_contents($path);
    if ($raw === false) {
        return null;
    }
    $data = json_decode($raw, true);
    return (json_last_error() === JSON_ERROR_NONE && is_array($data)) ? $data : null;
}

function medisaRestoreCountDeltas($before, $after) {
    $keys = array_unique(array_merge(array_keys($before), array_keys($after)));
    $deltas = [];
    foreach ($keys as $k) {
        $a = $before[$k];
        $b = $after[$k];
        if ($a === null && $b === null) {
            continue;
        }
        $deltas[$k] = [
            'before' => $a,
            'candidate' => $b,
            'delta' => (is_int($a) && is_int($b)) ? ($b - $a) : null,
        ];
    }
    return $deltas;
}

function medisaRestoreSignIntent(array $claims, $env = null) {
    $env = $env ?: medisaRestoreEnv();
    if (!medisaRestoreHasSecret()) {
        return null;
    }
    $body = [
        'v' => 1,
        'op' => 'server_restore_commit',
        'actor_id' => (string)($claims['actor_id'] ?? ''),
        'backup_id' => (string)($claims['backup_id'] ?? ''),
        'backup_sha256' => (string)($claims['backup_sha256'] ?? ''),
        'before_hash' => (string)($claims['before_hash'] ?? ''),
        'schema_version' => (string)($claims['schema_version'] ?? ''),
        'exp' => (int)($claims['exp'] ?? 0),
        'nonce' => (string)($claims['nonce'] ?? ''),
    ];
    $payload = rtrim(strtr(base64_encode(json_encode($body, JSON_UNESCAPED_UNICODE)), '+/', '-_'), '=');
    $sig = hash_hmac('sha256', $payload, $env['secret']);
    return $payload . '.' . $sig;
}

function medisaRestoreDecodeIntent($token, $env = null) {
    $env = $env ?: medisaRestoreEnv();
    if (!medisaRestoreHasSecret()) {
        return medisaRestoreError('RESTORE_SECRET_MISSING', 'Restore imza anahtarı yapılandırılmamış.', 503);
    }
    if (!is_string($token) || strpos($token, '.') === false) {
        return medisaRestoreError('INTENT_INVALID', 'Geçersiz intent token.', 400);
    }
    [$payload, $sig] = explode('.', $token, 2);
    $calc = hash_hmac('sha256', $payload, $env['secret']);
    if (!hash_equals($calc, $sig)) {
        return medisaRestoreError('INTENT_INVALID', 'Intent imzası geçersiz.', 400);
    }
    $pad = strlen($payload) % 4;
    if ($pad) {
        $payload .= str_repeat('=', 4 - $pad);
    }
    $json = base64_decode(strtr($payload, '-_', '+/'), true);
    $claims = json_decode((string)$json, true);
    if (!is_array($claims)) {
        return medisaRestoreError('INTENT_INVALID', 'Intent çözülemedi.', 400);
    }
    if (($claims['op'] ?? '') !== 'server_restore_commit') {
        return medisaRestoreError('INTENT_INVALID', 'Intent işlemi geçersiz.', 400);
    }
    return ['success' => true, 'claims' => $claims];
}

function medisaRestoreVerifyIntent($token, array $expected, $env = null) {
    $decoded = medisaRestoreDecodeIntent($token, $env);
    if (($decoded['success'] ?? false) !== true) {
        return $decoded;
    }
    $claims = $decoded['claims'];
    if ((int)($claims['exp'] ?? 0) < time()) {
        return medisaRestoreError('INTENT_EXPIRED', 'Intent süresi dolmuş.', 400);
    }
    if ((string)($claims['actor_id'] ?? '') !== (string)($expected['actor_id'] ?? '')) {
        return medisaRestoreError('INTENT_ACTOR_MISMATCH', 'Intent kullanıcı eşleşmesi başarısız.', 403);
    }
    if ((string)($claims['backup_id'] ?? '') !== (string)($expected['backup_id'] ?? '')) {
        return medisaRestoreError('INTENT_INVALID', 'Intent yedek eşleşmesi başarısız.', 400);
    }
    if ((string)($claims['backup_sha256'] ?? '') !== (string)($expected['backup_sha256'] ?? '')) {
        return medisaRestoreError('BACKUP_HASH_MISMATCH', 'Intent yedek hash eşleşmesi başarısız.', 409);
    }
    if ((string)($claims['before_hash'] ?? '') !== (string)($expected['before_hash'] ?? '')) {
        return medisaRestoreError('BEFORE_HASH_CHANGED', 'Veri dry-run sonrası değişti. Yeni dry-run gerekli.', 409);
    }
    return ['success' => true, 'claims' => $claims];
}

function medisaRestoreCapabilityPayload() {
    return [
        'restore_enabled' => medisaRestoreIsEnabled(),
        'maintenance_mode' => medisaRestoreIsMaintenanceMode(),
        'secret_configured' => medisaRestoreHasSecret(),
        'confirmation_text' => MEDISA_RESTORE_CONFIRMATION_TEXT,
        'intent_ttl_seconds' => MEDISA_RESTORE_INTENT_TTL_SECONDS,
        'max_bytes' => MEDISA_RESTORE_MAX_BYTES,
    ];
}

function medisaRestoreHandleRegistry() {
    $currentData = loadData();
    if (!is_array($currentData)) {
        $currentData = medisaDefaultData();
    }
    $auth = medisaResolveAuthorizedContext($currentData, 'manage_backups');
    if (($auth['success'] ?? false) !== true) {
        $status = (int)($auth['status'] ?? 403);
        return [
            'status' => $status,
            'body' => [
                'success' => false,
                'error_code' => $status === 401 ? 'RESTORE_PERMISSION_DENIED' : 'RESTORE_PERMISSION_DENIED',
                'auth_required' => $status === 401,
                'message' => $auth['message'] ?? 'Bu işlem için yetkiniz yok.',
            ],
        ];
    }
    $list = [];
    foreach (medisaRestoreListRegistry() as $entry) {
        $list[] = medisaRestorePublicEntry($entry);
    }
    return [
        'status' => 200,
        'body' => array_merge([
            'success' => true,
            'backups' => $list,
        ], medisaRestoreCapabilityPayload()),
    ];
}

function medisaRestoreHandleDryRun(array $input) {
    $currentData = loadData();
    if (!is_array($currentData)) {
        $currentData = medisaDefaultData();
    }
    $auth = medisaResolveAuthorizedContext($currentData, 'manage_backups');
    if (($auth['success'] ?? false) !== true) {
        $status = (int)($auth['status'] ?? 403);
        return [
            'status' => $status,
            'body' => medisaRestoreError('RESTORE_PERMISSION_DENIED', $auth['message'] ?? 'Yetki yok.', $status, [
                'auth_required' => $status === 401,
            ]),
        ];
    }
    $context = $auth['context'];
    $backupId = isset($input['backup_id']) ? (string)$input['backup_id'] : '';
    $found = medisaRestoreFindById($backupId);
    if (($found['success'] ?? false) !== true) {
        return ['status' => (int)($found['status'] ?? 400), 'body' => $found];
    }
    $entry = $found['entry'];
    if (empty($entry['restore_eligible'])) {
        return [
            'status' => 422,
            'body' => medisaRestoreError('BACKUP_NOT_ELIGIBLE', 'Yedek geri yüklemeye uygun değil.', 422, [
                'backup_id' => $backupId,
                'validation_status' => $entry['validation_status'] ?? 'invalid',
            ]),
        ];
    }
    $parse = medisaRestoreParseBackupFile($entry['_internal_path']);
    if (($parse['success'] ?? false) !== true) {
        return ['status' => (int)($parse['status'] ?? 422), 'body' => $parse];
    }
    if (($parse['sha256'] ?? '') !== ($entry['sha256'] ?? '')) {
        return [
            'status' => 409,
            'body' => medisaRestoreError('BACKUP_HASH_MISMATCH', 'Yedek hash uyuşmazlığı.', 409),
        ];
    }
    $beforeCounts = medisaRestoreRecordCounts($currentData);
    $beforeHash = medisaRestoreStructuralHash($currentData);
    $candidateCounts = $parse['record_counts'];
    $candidateHash = $parse['structural_hash'];
    $actorId = (string)($context['user_id'] ?? $context['id'] ?? '');
    $exp = time() + MEDISA_RESTORE_INTENT_TTL_SECONDS;
    $intent = medisaRestoreSignIntent([
        'actor_id' => $actorId,
        'backup_id' => $backupId,
        'backup_sha256' => $parse['sha256'],
        'before_hash' => $beforeHash,
        'schema_version' => $parse['schema_version'],
        'exp' => $exp,
        'nonce' => bin2hex(random_bytes(16)),
    ]);

    return [
        'status' => 200,
        'body' => [
            'success' => true,
            'backup_id' => $backupId,
            'eligible' => true,
            'validation_status' => 'valid',
            'schema_version' => $parse['schema_version'],
            'backup_created_at' => $entry['created_at'],
            'current_structural_hash' => $beforeHash,
            'candidate_structural_hash' => $candidateHash,
            'before_counts' => $beforeCounts,
            'candidate_counts' => $candidateCounts,
            'count_deltas' => medisaRestoreCountDeltas($beforeCounts, $candidateCounts),
            'missing_required_collections' => [],
            'unknown_collections' => $parse['unknown_collections'],
            'canonical_normalization_warnings' => $parse['warnings'],
            'role_user_count_delta' => [
                'users' => ($candidateCounts['users'] ?? 0) - ($beforeCounts['users'] ?? 0),
                'genel_yonetici' => ($candidateCounts['roles_genel_yonetici'] ?? 0) - ($beforeCounts['roles_genel_yonetici'] ?? 0),
                'sube_yonetici' => ($candidateCounts['roles_sube_yonetici'] ?? 0) - ($beforeCounts['roles_sube_yonetici'] ?? 0),
                'kullanici' => ($candidateCounts['roles_kullanici'] ?? 0) - ($beforeCounts['roles_kullanici'] ?? 0),
            ],
            'vehicle_count_delta' => ($candidateCounts['vehicles'] ?? 0) - ($beforeCounts['vehicles'] ?? 0),
            'event_count_delta' => ($candidateCounts['events'] ?? 0) - ($beforeCounts['events'] ?? 0),
            'document_reference_count_delta' => ($candidateCounts['document_refs'] ?? 0) - ($beforeCounts['document_refs'] ?? 0),
            'restore_enabled' => medisaRestoreIsEnabled(),
            'maintenance_required' => true,
            'maintenance_mode' => medisaRestoreIsMaintenanceMode(),
            'secret_configured' => medisaRestoreHasSecret(),
            'intent_token' => $intent,
            'intent_expiry' => $intent ? date('c', $exp) : null,
            'confirmation_text' => MEDISA_RESTORE_CONFIRMATION_TEXT,
            'warning_codes' => array_values(array_filter([
                medisaRestoreIsEnabled() ? null : 'RESTORE_DISABLED',
                medisaRestoreIsMaintenanceMode() ? null : 'MAINTENANCE_REQUIRED',
                medisaRestoreHasSecret() ? null : 'RESTORE_SECRET_MISSING',
            ])),
        ],
    ];
}

function medisaRestoreIdempotencyPath($keyHash, $env = null) {
    $env = $env ?: medisaRestoreEnv();
    return rtrim($env['runtime_dir'], DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'idempo-' . $keyHash . '.json';
}

function medisaRestoreTxnPath($txnId, $env = null) {
    $env = $env ?: medisaRestoreEnv();
    return rtrim($env['runtime_dir'], DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'txn-' . $txnId . '.json';
}

function medisaRestoreAuditPath($env = null) {
    $env = $env ?: medisaRestoreEnv();
    return rtrim($env['runtime_dir'], DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'audit.jsonl';
}

function medisaRestoreLoadIdempotency($idempotencyKey, $actorId, $backupId, $beforeHash, $env = null) {
    $env = $env ?: medisaRestoreEnv();
    if (!is_string($idempotencyKey) || strlen($idempotencyKey) < 8 || strlen($idempotencyKey) > 128) {
        return medisaRestoreError('IDEMPOTENCY_CONFLICT', 'Geçersiz idempotency_key.', 400);
    }
    if (!preg_match('/^[A-Za-z0-9._:-]+$/', $idempotencyKey)) {
        return medisaRestoreError('IDEMPOTENCY_CONFLICT', 'Geçersiz idempotency_key.', 400);
    }
    $keyHash = hash('sha256', $idempotencyKey);
    $path = medisaRestoreIdempotencyPath($keyHash, $env);
    if (!is_file($path)) {
        return ['success' => true, 'exists' => false, 'key_hash' => $keyHash, 'path' => $path];
    }
    $raw = @file_get_contents($path);
    $rec = json_decode((string)$raw, true);
    if (!is_array($rec)) {
        return medisaRestoreError('IDEMPOTENCY_CONFLICT', 'Idempotency kaydı bozuk.', 409);
    }
    if (($rec['actor_id'] ?? '') !== $actorId
        || ($rec['backup_id'] ?? '') !== $backupId
        || ($rec['before_hash'] ?? '') !== $beforeHash) {
        return medisaRestoreError('IDEMPOTENCY_CONFLICT', 'Idempotency anahtarı farklı istek ile çakışıyor.', 409);
    }
    return [
        'success' => true,
        'exists' => true,
        'key_hash' => $keyHash,
        'path' => $path,
        'record' => $rec,
    ];
}

function medisaRestoreWriteJsonFile($path, array $data) {
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        return false;
    }
    return medisaAtomicWriteFile($path, $json . "\n");
}

function medisaRestoreAppendAudit(array $row, $env = null) {
    $env = $env ?: medisaRestoreEnv();
    if (!medisaRestoreEnsureRuntimeDir($env)) {
        return false;
    }
    $path = medisaRestoreAuditPath($env);
    $line = json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($line === false) {
        return false;
    }
    $ok = @file_put_contents($path, $line . "\n", FILE_APPEND | LOCK_EX);
    return $ok !== false;
}

function medisaRestoreHandleCommit(array $input) {
    $startedAt = microtime(true);
    $startedIso = date('c');
    $env = medisaRestoreEnv();

    if (!medisaRestoreIsEnabled()) {
        return ['status' => 403, 'body' => medisaRestoreError('RESTORE_DISABLED', 'Sunucu geri yükleme kapalı.', 403)];
    }
    if (!medisaRestoreIsMaintenanceMode()) {
        return ['status' => 403, 'body' => medisaRestoreError('MAINTENANCE_REQUIRED', 'Bakım/write-freeze gerekli.', 403)];
    }
    if (!medisaRestoreHasSecret()) {
        return ['status' => 503, 'body' => medisaRestoreError('RESTORE_SECRET_MISSING', 'Restore imza anahtarı yok.', 503)];
    }

    $currentData = loadData();
    if (!is_array($currentData)) {
        $currentData = medisaDefaultData();
    }
    $auth = medisaResolveAuthorizedContext($currentData, 'execute_server_restore');
    if (($auth['success'] ?? false) !== true) {
        $status = (int)($auth['status'] ?? 403);
        return [
            'status' => $status,
            'body' => medisaRestoreError('RESTORE_PERMISSION_DENIED', $auth['message'] ?? 'Yetki yok.', $status, [
                'auth_required' => $status === 401,
            ]),
        ];
    }
    $context = $auth['context'];
    $actorId = (string)($context['user_id'] ?? $context['id'] ?? '');
    $actorRole = (string)($context['role'] ?? '');

    $backupId = isset($input['backup_id']) ? (string)$input['backup_id'] : '';
    $intentToken = isset($input['intent_token']) ? (string)$input['intent_token'] : '';
    $idempotencyKey = isset($input['idempotency_key']) ? (string)$input['idempotency_key'] : '';
    $confirmation = isset($input['confirmation']) ? (string)$input['confirmation'] : '';

    if ($confirmation !== MEDISA_RESTORE_CONFIRMATION_TEXT) {
        return ['status' => 400, 'body' => medisaRestoreError('CONFIRMATION_MISMATCH', 'Onay metni eşleşmiyor.', 400)];
    }

    $found = medisaRestoreFindById($backupId, $env);
    if (($found['success'] ?? false) !== true) {
        return ['status' => (int)($found['status'] ?? 400), 'body' => $found];
    }
    $entry = $found['entry'];
    if (empty($entry['restore_eligible'])) {
        return ['status' => 422, 'body' => medisaRestoreError('BACKUP_NOT_ELIGIBLE', 'Yedek uygun değil.', 422)];
    }

    // Idempotent replay: key + actor + backup + intent before_hash (current data değişmiş olabilir).
    $decodedIntent = medisaRestoreDecodeIntent($intentToken, $env);
    if (($decodedIntent['success'] ?? false) !== true) {
        return ['status' => (int)($decodedIntent['status'] ?? 400), 'body' => $decodedIntent];
    }
    $intentBefore = (string)($decodedIntent['claims']['before_hash'] ?? '');
    $idempo = medisaRestoreLoadIdempotency($idempotencyKey, $actorId, $backupId, $intentBefore, $env);
    if (($idempo['success'] ?? false) !== true) {
        return ['status' => (int)($idempo['status'] ?? 409), 'body' => $idempo];
    }
    if (!empty($idempo['exists'])) {
        $prev = $idempo['record']['result'] ?? null;
        $replay = is_array($prev) ? $prev : [
            'success' => true,
            'transaction_id' => $idempo['record']['transaction_id'] ?? null,
        ];
        $replay['idempotent_replay'] = true;
        return ['status' => 200, 'body' => $replay];
    }

    $beforeHash = medisaRestoreStructuralHash($currentData);
    $intent = medisaRestoreVerifyIntent($intentToken, [
        'actor_id' => $actorId,
        'backup_id' => $backupId,
        'backup_sha256' => $entry['sha256'],
        'before_hash' => $beforeHash,
    ], $env);
    if (($intent['success'] ?? false) !== true) {
        return ['status' => (int)($intent['status'] ?? 400), 'body' => $intent];
    }

    if (!medisaRestoreEnsureRuntimeDir($env)) {
        return ['status' => 500, 'body' => medisaRestoreError('ATOMIC_WRITE_FAILED', 'Restore runtime dizini oluşturulamadı.', 500)];
    }

    $lockHandle = medisaAcquireDataLock();
    if (!$lockHandle) {
        return ['status' => 423, 'body' => medisaRestoreError('RESTORE_LOCKED', 'Veri kilidi alınamadı.', 423)];
    }

    $txnId = bin2hex(random_bytes(16));
    $failureStage = null;
    $emergencyId = null;
    $afterHash = null;
    $auditWarning = false;

    try {
        medisaRestoreSetCommitBypass(true);

        $lockedCurrent = medisaRestoreCurrentDataArray($env);
        if (!is_array($lockedCurrent)) {
            $failureStage = 'current_read';
            return ['status' => 500, 'body' => medisaRestoreError('INVALID_JSON', 'Mevcut veri okunamadı.', 500)];
        }
        $lockedBefore = medisaRestoreStructuralHash($lockedCurrent);
        if ($lockedBefore !== $beforeHash) {
            $failureStage = 'before_hash_recheck';
            return ['status' => 409, 'body' => medisaRestoreError('BEFORE_HASH_CHANGED', 'Veri dry-run sonrası değişti.', 409)];
        }

        $parse = medisaRestoreParseBackupFile($entry['_internal_path'], $env);
        if (($parse['success'] ?? false) !== true) {
            $failureStage = 'candidate_parse';
            return ['status' => (int)($parse['status'] ?? 422), 'body' => $parse];
        }
        if (($parse['sha256'] ?? '') !== ($entry['sha256'] ?? '')) {
            $failureStage = 'backup_hash';
            return ['status' => 409, 'body' => medisaRestoreError('BACKUP_HASH_MISMATCH', 'Yedek hash uyuşmazlığı.', 409)];
        }

        $snapDir = $env['snapshots_dir'];
        if (!is_dir($snapDir) && !@mkdir($snapDir, 0755, true)) {
            $failureStage = 'emergency_dir';
            return ['status' => 500, 'body' => medisaRestoreError('EMERGENCY_BACKUP_FAILED', 'Emergency dizin oluşturulamadı.', 500)];
        }
        $emergencyName = 'emergency-prerestore-' . $txnId . '-' . date('YmdHis') . '-' . bin2hex(random_bytes(3)) . '.json';
        $emergencyPath = rtrim($snapDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $emergencyName;
        $currentJson = @file_get_contents($env['data_file']);
        if ($currentJson === false || $currentJson === '') {
            $currentJson = json_encode($lockedCurrent, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        }
        if ($currentJson === false || !medisaAtomicWriteFile($emergencyPath, $currentJson)) {
            $failureStage = 'emergency_write';
            return ['status' => 500, 'body' => medisaRestoreError('EMERGENCY_BACKUP_FAILED', 'Emergency yedek yazılamadı.', 500)];
        }
        $emergencySha = medisaRestoreFileSha256($emergencyPath);
        if ($emergencySha === null) {
            @unlink($emergencyPath);
            $failureStage = 'emergency_hash';
            return ['status' => 500, 'body' => medisaRestoreError('EMERGENCY_BACKUP_FAILED', 'Emergency hash doğrulanamadı.', 500)];
        }
        $emergencyId = medisaRestoreMakeBackupId('pre_restore_emergency', $emergencyName, $emergencySha);

        $normalized = $parse['normalized'];
        $outJson = json_encode($normalized, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        if ($outJson === false) {
            $failureStage = 'encode';
            return ['status' => 500, 'body' => medisaRestoreError('ATOMIC_WRITE_FAILED', 'Normalize JSON encode başarısız.', 500)];
        }
        json_decode($outJson, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            $failureStage = 'encode_verify';
            return ['status' => 500, 'body' => medisaRestoreError('ATOMIC_WRITE_FAILED', 'Yazılacak JSON doğrulanamadı.', 500)];
        }

        if (!medisaAtomicWriteFile($env['data_file'], $outJson)) {
            $failureStage = 'atomic_write';
            return ['status' => 500, 'body' => medisaRestoreError('ATOMIC_WRITE_FAILED', 'Atomik yazım başarısız; orijinal korundu.', 500)];
        }

        $written = @file_get_contents($env['data_file']);
        $writtenData = json_decode((string)$written, true);
        if (!is_array($writtenData)) {
            $failureStage = 'after_decode';
            return ['status' => 500, 'body' => medisaRestoreError('AFTER_HASH_MISMATCH', 'Yazım sonrası JSON okunamadı.', 500)];
        }
        $afterHash = medisaRestoreStructuralHash($writtenData);
        $expectedAfter = medisaRestoreStructuralHash($normalized);
        if ($afterHash !== $expectedAfter) {
            $failureStage = 'after_hash';
            return ['status' => 500, 'body' => medisaRestoreError('AFTER_HASH_MISMATCH', 'Yazım sonrası hash uyuşmazlığı.', 500)];
        }

        $committedAt = date('c');
        $durationMs = (int)round((microtime(true) - $startedAt) * 1000);
        $resultBody = [
            'success' => true,
            'transaction_id' => $txnId,
            'backup_id' => $backupId,
            'emergency_backup_id' => $emergencyId,
            'before_sha256' => $beforeHash,
            'after_sha256' => $afterHash,
            'backup_sha256' => $parse['sha256'],
            'started_at' => $startedIso,
            'committed_at' => $committedAt,
            'duration_ms' => $durationMs,
            'idempotent_replay' => false,
            'reload_required' => true,
        ];

        $txnRec = [
            'transaction_id' => $txnId,
            'idempotency_key_hash' => $idempo['key_hash'],
            'actor_id' => $actorId,
            'actor_role' => $actorRole,
            'backup_id' => $backupId,
            'backup_sha256' => $parse['sha256'],
            'before_sha256' => $beforeHash,
            'after_sha256' => $afterHash,
            'emergency_backup_id' => $emergencyId,
            'started_at' => $startedIso,
            'committed_at' => $committedAt,
            'duration_ms' => $durationMs,
            'result' => 'success',
            'maintenance_state' => true,
            'schema_version' => $parse['schema_version'],
        ];
        medisaRestoreWriteJsonFile(medisaRestoreTxnPath($txnId, $env), $txnRec);
        medisaRestoreWriteJsonFile($idempo['path'], [
            'actor_id' => $actorId,
            'backup_id' => $backupId,
            'before_hash' => $beforeHash,
            'transaction_id' => $txnId,
            'result' => $resultBody,
            'committed_at' => $committedAt,
        ]);

        $auditOk = medisaRestoreAppendAudit([
            'transaction_id' => $txnId,
            'idempotency_key_hash' => $idempo['key_hash'],
            'actor_id' => $actorId,
            'actor_role' => $actorRole,
            'backup_id' => $backupId,
            'backup_sha256' => $parse['sha256'],
            'before_sha256' => $beforeHash,
            'after_sha256' => $afterHash,
            'emergency_backup_id' => $emergencyId,
            'started_at' => $startedIso,
            'committed_at' => $committedAt,
            'duration_ms' => $durationMs,
            'result' => 'success',
            'failure_stage' => null,
            'error_code' => null,
            'maintenance_state' => true,
            'schema_version' => $parse['schema_version'],
        ], $env);
        if (!$auditOk) {
            $auditWarning = true;
            $resultBody['success'] = true;
            $resultBody['audit_warning'] = true;
            $resultBody['error_code'] = 'AUDIT_WRITE_FAILED';
            $resultBody['message'] = 'Restore commit edildi; audit yazımı başarısız. Operatör kontrolü gerekli.';
        }

        return ['status' => 200, 'body' => $resultBody];
    } finally {
        medisaRestoreSetCommitBypass(false);
        medisaReleaseDataLock($lockHandle);
        if ($failureStage !== null) {
            medisaRestoreAppendAudit([
                'transaction_id' => $txnId,
                'idempotency_key_hash' => isset($idempo['key_hash']) ? $idempo['key_hash'] : null,
                'actor_id' => $actorId,
                'actor_role' => $actorRole,
                'backup_id' => $backupId,
                'backup_sha256' => $entry['sha256'] ?? null,
                'before_sha256' => $beforeHash ?? null,
                'after_sha256' => $afterHash,
                'emergency_backup_id' => $emergencyId,
                'started_at' => $startedIso,
                'committed_at' => null,
                'duration_ms' => (int)round((microtime(true) - $startedAt) * 1000),
                'result' => 'failure',
                'failure_stage' => $failureStage,
                'error_code' => 'RESTORE_FAILED',
                'maintenance_state' => medisaRestoreIsMaintenanceMode(),
                'schema_version' => null,
            ], $env);
        }
    }
}

function medisaRestoreHandleStatus($transactionId) {
    $currentData = loadData();
    if (!is_array($currentData)) {
        $currentData = medisaDefaultData();
    }
    $auth = medisaResolveAuthorizedContext($currentData, 'manage_backups');
    if (($auth['success'] ?? false) !== true) {
        $status = (int)($auth['status'] ?? 403);
        return [
            'status' => $status,
            'body' => medisaRestoreError('RESTORE_PERMISSION_DENIED', $auth['message'] ?? 'Yetki yok.', $status),
        ];
    }
    if (!is_string($transactionId) || !preg_match('/^[a-f0-9]{32}$/', $transactionId)) {
        return ['status' => 400, 'body' => medisaRestoreError('INVALID_BACKUP_ID', 'Geçersiz transaction_id.', 400)];
    }
    $path = medisaRestoreTxnPath($transactionId);
    if (!is_file($path)) {
        return ['status' => 404, 'body' => medisaRestoreError('BACKUP_NOT_FOUND', 'İşlem kaydı bulunamadı.', 404)];
    }
    $rec = json_decode((string)@file_get_contents($path), true);
    if (!is_array($rec)) {
        return ['status' => 500, 'body' => medisaRestoreError('INVALID_JSON', 'İşlem kaydı okunamadı.', 500)];
    }
    // PII-free public projection
    return [
        'status' => 200,
        'body' => [
            'success' => true,
            'transaction_id' => $rec['transaction_id'] ?? $transactionId,
            'result' => $rec['result'] ?? null,
            'backup_id' => $rec['backup_id'] ?? null,
            'before_sha256' => $rec['before_sha256'] ?? null,
            'after_sha256' => $rec['after_sha256'] ?? null,
            'emergency_backup_id' => $rec['emergency_backup_id'] ?? null,
            'started_at' => $rec['started_at'] ?? null,
            'committed_at' => $rec['committed_at'] ?? null,
            'duration_ms' => $rec['duration_ms'] ?? null,
        ],
    ];
}

function medisaRestoreEmit(array $result) {
    $status = (int)($result['status'] ?? 500);
    $body = $result['body'] ?? ['success' => false, 'message' => 'Bilinmeyen hata'];
    if (isset($body['status'])) {
        unset($body['status']);
    }
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
}
