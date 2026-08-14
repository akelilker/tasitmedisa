<?php
/**
 * MEDISA full-backup (ZIP) owner library.
 * Canonical source-of-truth: data/data.json + JSON'da referans verilen fiziksel belgeler.
 * Direct HTTP hit: sızıntısız 404.
 */

if (PHP_SAPI !== 'cli'
    && isset($_SERVER['SCRIPT_FILENAME'])
    && @realpath((string)$_SERVER['SCRIPT_FILENAME']) === @realpath(__FILE__)
) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    echo 'Not Found';
    exit;
}

if (!defined('MEDISA_FULL_BACKUP_LIB')) {
    define('MEDISA_FULL_BACKUP_LIB', true);
}

define('MEDISA_FULL_BACKUP_FORMAT', 'medisa-full-backup');
define('MEDISA_FULL_BACKUP_FORMAT_VERSION', '1.0');
define('MEDISA_FULL_BACKUP_MAX_ZIP_BYTES', 268435456); // 256 MiB compressed
define('MEDISA_FULL_BACKUP_MAX_ENTRY_COUNT', 2048);
define('MEDISA_FULL_BACKUP_MAX_TOTAL_UNCOMPRESSED_BYTES', 536870912); // 512 MiB
define('MEDISA_FULL_BACKUP_MAX_ENTRY_UNCOMPRESSED_BYTES', 67108864); // 64 MiB

function medisaFullBackupEnv() {
    if (defined('MEDISA_FULL_BACKUP_TEST_MODE') && MEDISA_FULL_BACKUP_TEST_MODE === true
        && isset($GLOBALS['MEDISA_FULL_BACKUP_ENV_OVERRIDE'])
        && is_array($GLOBALS['MEDISA_FULL_BACKUP_ENV_OVERRIDE'])
    ) {
        return $GLOBALS['MEDISA_FULL_BACKUP_ENV_OVERRIDE'];
    }
    $dataDir = getDataDirPath();
    return [
        'data_dir' => $dataDir,
        'data_file' => getDataFilePath(),
        'kasko_file' => getKaskoListesiFilePath(),
        'last_meta_file' => $dataDir . DIRECTORY_SEPARATOR . '.medisa_full_backup_last.json',
        'runtime_dir' => $dataDir . DIRECTORY_SEPARATOR . '.medisa_full_backup',
    ];
}

function medisaFullBackupLimits(array $env = null) {
    $env = $env ?: medisaFullBackupEnv();
    return [
        'max_zip_bytes' => (int)($env['max_zip_bytes'] ?? MEDISA_FULL_BACKUP_MAX_ZIP_BYTES),
        'max_entry_count' => (int)($env['max_entry_count'] ?? MEDISA_FULL_BACKUP_MAX_ENTRY_COUNT),
        'max_total_uncompressed_bytes' => (int)($env['max_total_uncompressed_bytes'] ?? MEDISA_FULL_BACKUP_MAX_TOTAL_UNCOMPRESSED_BYTES),
        'max_entry_uncompressed_bytes' => (int)($env['max_entry_uncompressed_bytes'] ?? MEDISA_FULL_BACKUP_MAX_ENTRY_UNCOMPRESSED_BYTES),
    ];
}

function medisaFullBackupRegisterCleanup($path) {
    if (!is_string($path) || $path === '') {
        return;
    }
    if (!isset($GLOBALS['__medisa_fb_cleanup']) || !is_array($GLOBALS['__medisa_fb_cleanup'])) {
        $GLOBALS['__medisa_fb_cleanup'] = [];
        register_shutdown_function(static function () {
            if (empty($GLOBALS['__medisa_fb_cleanup']) || !is_array($GLOBALS['__medisa_fb_cleanup'])) {
                return;
            }
            medisaFullBackupCleanupPaths(array_keys($GLOBALS['__medisa_fb_cleanup']));
            $GLOBALS['__medisa_fb_cleanup'] = [];
        });
    }
    $GLOBALS['__medisa_fb_cleanup'][$path] = true;
}

function medisaFullBackupForgetCleanup($path) {
    if (!is_string($path) || $path === '') {
        return;
    }
    if (isset($GLOBALS['__medisa_fb_cleanup'][$path])) {
        unset($GLOBALS['__medisa_fb_cleanup'][$path]);
    }
}

function medisaFullBackupCleanupAndForget(array $paths) {
    medisaFullBackupCleanupPaths($paths);
    foreach ($paths as $path) {
        medisaFullBackupForgetCleanup($path);
    }
}

function medisaFullBackupError($code, $message, $status = 400, array $extra = []) {
    return array_merge([
        'success' => false,
        'error_code' => (string)$code,
        'message' => (string)$message,
        'status' => (int)$status,
    ], $extra);
}

function medisaFullBackupRequireZipArchive() {
    if (!class_exists('ZipArchive')) {
        return medisaFullBackupError('ZIP_UNAVAILABLE', 'Sunucuda ZIP desteği yok. Yedek alınamadı.', 500);
    }
    return null;
}

function medisaFullBackupDocumentTypes() {
    return ['ruhsat', 'sigorta', 'kasko', 'k2', 'tasit_karti', 'takograf', 'satis_sozlesmesi'];
}

function medisaFullBackupIsExcludedArchivePath($archivePath) {
    $p = strtolower(str_replace('\\', '/', (string)$archivePath));
    if ($p === '' || $p[0] === '/' || preg_match('#^[a-z]:/#', $p)) {
        return true;
    }
    if (strpos($p, '..') !== false) {
        return true;
    }
    $denied = [
        'data/backups/',
        'data/data.json.backup',
        '/.medisa_restore/',
        '/.medisa_full_backup/',
        '_preview/',
        '.backup',
        '/tmp/',
        '/temp/',
    ];
    foreach ($denied as $needle) {
        if (strpos($p, $needle) !== false) {
            return true;
        }
    }
    if (preg_match('#(^|/)\.[^/]+#', $p) && $p !== 'manifest.json') {
        // data/.medisa_* ve gizli dosyalar ZIP'e girmez; manifest kökte serbest
        if (strpos($p, 'data/.') !== false || strpos($p, '/.') !== false) {
            return true;
        }
    }
    return false;
}

function medisaFullBackupValidateArchivePath($archivePath) {
    $raw = str_replace('\\', '/', trim((string)$archivePath));
    if ($raw === '' || $raw[0] === '/' || preg_match('#^[a-zA-Z]:/#', $raw)) {
        return null;
    }
    if (strpos($raw, "\0") !== false) {
        return null;
    }
    $segments = explode('/', $raw);
    foreach ($segments as $segment) {
        if ($segment === '' || $segment === '.' || $segment === '..') {
            return null;
        }
    }
    if (medisaFullBackupIsExcludedArchivePath($raw)) {
        return null;
    }
    return $raw;
}

function medisaFullBackupRelativeArchivePathFromRaw($rawPath, array $config) {
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
    return medisaFullBackupValidateArchivePath('data/' . $relative);
}

function medisaFullBackupAssertRegularFile($absolutePath) {
    if (!is_string($absolutePath) || $absolutePath === '') {
        return medisaFullBackupError('MISSING_REFERENCED_FILE', 'Referans verilen belge bulunamadı.', 422);
    }
    if (@is_link($absolutePath)) {
        return medisaFullBackupError('SYMLINK_FORBIDDEN', 'Sembolik bağlantı yedeğe dahil edilemez.', 422);
    }
    if (!is_file($absolutePath) || !is_readable($absolutePath)) {
        return medisaFullBackupError('MISSING_REFERENCED_FILE', 'Referans verilen belge okunamadı.', 422, [
            'path' => basename($absolutePath),
        ]);
    }
    return null;
}

function medisaFullBackupLogicalAbsoluteFromArchivePath($archivePath, array $env = null) {
    $env = $env ?: medisaFullBackupEnv();
    $safeArchive = medisaFullBackupValidateArchivePath($archivePath);
    if ($safeArchive === null || strpos($safeArchive, 'data/') !== 0) {
        return null;
    }
    $relative = substr($safeArchive, 5);
    $dataDir = (string)($env['data_dir'] ?? getDataDirPath());
    if ($dataDir === '' || $relative === '') {
        return null;
    }
    return rtrim($dataDir, DIRECTORY_SEPARATOR)
        . DIRECTORY_SEPARATOR
        . str_replace('/', DIRECTORY_SEPARATOR, $relative);
}

function medisaFullBackupAddReferencedEntry(array &$filesByArchive, $archivePath, $absolutePath, $source) {
    $safeArchive = medisaFullBackupValidateArchivePath($archivePath);
    if ($safeArchive === null) {
        return medisaFullBackupError('UNSAFE_PATH', 'Güvensiz belge yolu.', 422, ['source' => $source]);
    }
    // realpath symlink takip eder; önce logical (pre-realpath) path üzerinde fail-closed kontrol.
    $logical = medisaFullBackupLogicalAbsoluteFromArchivePath($safeArchive);
    if ($logical !== null) {
        $logicalErr = medisaFullBackupAssertRegularFile($logical);
        if ($logicalErr !== null) {
            $logicalErr['source'] = $source;
            $logicalErr['archive_path'] = $safeArchive;
            return $logicalErr;
        }
    }
    $fileErr = medisaFullBackupAssertRegularFile($absolutePath);
    if ($fileErr !== null) {
        $fileErr['source'] = $source;
        $fileErr['archive_path'] = $safeArchive;
        return $fileErr;
    }
    $real = realpath($absolutePath);
    if ($real === false) {
        return medisaFullBackupError('MISSING_REFERENCED_FILE', 'Referans verilen belge çözümlenemedi.', 422, [
            'source' => $source,
            'archive_path' => $safeArchive,
        ]);
    }
    if (isset($filesByArchive[$safeArchive])) {
        if ($filesByArchive[$safeArchive]['absolute'] !== $real) {
            return medisaFullBackupError('PATH_CONFLICT', 'Aynı arşiv yolu çakışıyor.', 422, [
                'archive_path' => $safeArchive,
            ]);
        }
        return null;
    }
    $filesByArchive[$safeArchive] = [
        'archive_path' => $safeArchive,
        'absolute' => $real,
        'source' => $source,
    ];
    return null;
}

/**
 * JSON'da referans verilen path alanlarını toplar. Boş alan atlanır; dolu ama okunamazsa FAIL.
 * Fallback {id}.pdf keşfi YOK — yalnız explicit referanslar.
 *
 * @return array{success:bool,files?:array,error_code?:string,message?:string,status?:int}
 */
function medisaFullBackupCollectReferencedFiles(array $data, array $env = null) {
    $env = $env ?: medisaFullBackupEnv();
    $filesByArchive = [];

    foreach (medisaFullBackupDocumentTypes() as $documentType) {
        $config = medisaGetVehicleDocumentConfig($documentType);
        if (!$config) {
            continue;
        }
        $settingsKey = (string)($config['settingsKey'] ?? '');
        if ($settingsKey !== '') {
            $settingsDoc = $data['ayarlar'][$settingsKey] ?? null;
            if (is_array($settingsDoc)) {
                $settingsPathField = (string)($config['settingsPathField'] ?? 'documentPath');
                $rawSettingsPath = trim((string)($settingsDoc[$settingsPathField] ?? ''));
                if ($rawSettingsPath !== '') {
                    $archivePath = medisaFullBackupRelativeArchivePathFromRaw($rawSettingsPath, $config);
                    $absolute = medisaResolveVehicleDocumentCandidatePath($rawSettingsPath, $config);
                    if ($archivePath === null || $absolute === null) {
                        return medisaFullBackupError(
                            'MISSING_REFERENCED_FILE',
                            'Ayarlar belgesi bulunamadı: ' . $settingsKey,
                            422,
                            ['source' => 'settings:' . $settingsKey]
                        );
                    }
                    $addErr = medisaFullBackupAddReferencedEntry(
                        $filesByArchive,
                        $archivePath,
                        $absolute,
                        'settings:' . $settingsKey
                    );
                    if ($addErr !== null) {
                        return $addErr;
                    }
                }
            }
        }
    }

    $vehicles = $data['tasitlar'] ?? ($data['vehicles'] ?? []);
    if (!is_array($vehicles)) {
        $vehicles = [];
    }
    foreach ($vehicles as $idx => $vehicle) {
        if (!is_array($vehicle)) {
            continue;
        }
        $vehicleId = (string)($vehicle['id'] ?? ('idx-' . $idx));
        foreach (medisaFullBackupDocumentTypes() as $documentType) {
            $config = medisaGetVehicleDocumentConfig($documentType);
            if (!$config) {
                continue;
            }
            $pathField = (string)($config['pathField'] ?? '');
            if ($pathField === '') {
                continue;
            }
            // Settings-owned K2: vehicle k2BelgesiPath yalnız doluysa ayrıca alınır.
            $rawPath = trim((string)($vehicle[$pathField] ?? ''));
            if ($rawPath === '') {
                continue;
            }
            $archivePath = medisaFullBackupRelativeArchivePathFromRaw($rawPath, $config);
            $absolute = medisaResolveVehicleDocumentCandidatePath($rawPath, $config);
            if ($archivePath === null || $absolute === null) {
                return medisaFullBackupError(
                    'MISSING_REFERENCED_FILE',
                    'Referans verilen belge bulunamadı: ' . $pathField,
                    422,
                    [
                        'source' => 'vehicle:' . $vehicleId . ':' . $pathField,
                        'vehicle_id' => $vehicleId,
                        'path_field' => $pathField,
                    ]
                );
            }
            $addErr = medisaFullBackupAddReferencedEntry(
                $filesByArchive,
                $archivePath,
                $absolute,
                'vehicle:' . $vehicleId . ':' . $pathField
            );
            if ($addErr !== null) {
                return $addErr;
            }
        }
    }

    $kaskoPath = (string)($env['kasko_file'] ?? getKaskoListesiFilePath());
    if (is_string($kaskoPath) && $kaskoPath !== '' && file_exists($kaskoPath)) {
        $addErr = medisaFullBackupAddReferencedEntry(
            $filesByArchive,
            'data/kasko-deger-listesi.json',
            $kaskoPath,
            'kasko_list'
        );
        if ($addErr !== null) {
            return $addErr;
        }
    }

    return [
        'success' => true,
        'files' => array_values($filesByArchive),
    ];
}

function medisaFullBackupRmTree($dir) {
    if (!is_string($dir) || $dir === '' || !is_dir($dir)) {
        return true;
    }
    $items = @scandir($dir);
    if (!is_array($items)) {
        return @rmdir($dir);
    }
    $ok = true;
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        $path = $dir . DIRECTORY_SEPARATOR . $item;
        if (is_dir($path) && !is_link($path)) {
            $ok = medisaFullBackupRmTree($path) && $ok;
        } else {
            $ok = @unlink($path) && $ok;
        }
    }
    return @rmdir($dir) && $ok;
}

function medisaFullBackupEnsureDir($dir) {
    if (is_dir($dir)) {
        return true;
    }
    return @mkdir($dir, 0700, true) && is_dir($dir);
}

function medisaFullBackupCopyExactFile($source, $dest) {
    $fileErr = medisaFullBackupAssertRegularFile($source);
    if ($fileErr !== null) {
        return $fileErr;
    }
    $dir = dirname($dest);
    if (!medisaFullBackupEnsureDir($dir)) {
        return medisaFullBackupError('SNAPSHOT_COPY_FAILED', 'Snapshot dizini oluşturulamadı.', 500);
    }
    if (!@copy($source, $dest)) {
        return medisaFullBackupError('SNAPSHOT_COPY_FAILED', 'Dosya snapshot alanına kopyalanamadı.', 500);
    }
    if (@is_link($dest) || !is_file($dest)) {
        @unlink($dest);
        return medisaFullBackupError('SNAPSHOT_COPY_FAILED', 'Snapshot kopyası geçersiz.', 500);
    }
    $srcSize = filesize($source);
    $dstSize = filesize($dest);
    if ($srcSize === false || $dstSize === false || (int)$srcSize !== (int)$dstSize) {
        @unlink($dest);
        return medisaFullBackupError('SNAPSHOT_COPY_FAILED', 'Snapshot boyut doğrulaması başarısız.', 500);
    }
    return null;
}

function medisaFullBackupHashFile($path) {
    $hash = @hash_file('sha256', $path);
    return is_string($hash) && $hash !== '' ? $hash : null;
}

/**
 * Lock altında exact data.json + referans belgeleri geçici snapshot'a kopyalar.
 * Compression bu fonksiyon dışında (lock bırakıldıktan sonra) yapılır.
 */
function medisaFullBackupCreateSnapshotUnderLock(array $env = null) {
    $env = $env ?: medisaFullBackupEnv();
    $zipErr = medisaFullBackupRequireZipArchive();
    if ($zipErr !== null) {
        return $zipErr;
    }

    $runtimeDir = (string)($env['runtime_dir'] ?? '');
    if ($runtimeDir === '' || !medisaFullBackupEnsureDir($runtimeDir)) {
        return medisaFullBackupError('SNAPSHOT_DIR_FAILED', 'Yedek çalışma dizini oluşturulamadı.', 500);
    }

    $lockHandle = medisaAcquireDataLock();
    if (!$lockHandle) {
        return medisaFullBackupError('LOCK_FAILED', 'Veri kilidi alınamadı.', 500);
    }

    $snapshotRoot = null;
    try {
        $dataFile = (string)($env['data_file'] ?? getDataFilePath());
        $fileErr = medisaFullBackupAssertRegularFile($dataFile);
        if ($fileErr !== null) {
            $fileErr['error_code'] = 'DATA_UNREADABLE';
            $fileErr['message'] = 'Canonical veri dosyası okunamadı.';
            $fileErr['status'] = 404;
            return $fileErr;
        }

        $rawBytes = file_get_contents($dataFile);
        if ($rawBytes === false || $rawBytes === '') {
            return medisaFullBackupError('DATA_UNREADABLE', 'Canonical veri dosyası okunamadı.', 500);
        }
        $decoded = json_decode($rawBytes, true);
        if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
            return medisaFullBackupError('INVALID_JSON', 'Sunucu verisi geçerli JSON değil.', 500);
        }

        $collected = medisaFullBackupCollectReferencedFiles($decoded, $env);
        if (($collected['success'] ?? false) !== true) {
            return $collected;
        }

        $snapshotRoot = rtrim($runtimeDir, DIRECTORY_SEPARATOR)
            . DIRECTORY_SEPARATOR
            . 'snap-' . date('YmdHis') . '-' . bin2hex(random_bytes(6));
        if (!medisaFullBackupEnsureDir($snapshotRoot)) {
            return medisaFullBackupError('SNAPSHOT_DIR_FAILED', 'Snapshot alanı oluşturulamadı.', 500);
        }
        medisaFullBackupRegisterCleanup($snapshotRoot);

        $stagedFiles = [];
        $dataArchive = 'data/data.json';
        $dataDest = $snapshotRoot . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'data.json';
        if (!medisaFullBackupEnsureDir(dirname($dataDest))) {
            medisaFullBackupCleanupAndForget([$snapshotRoot]);
            return medisaFullBackupError('SNAPSHOT_COPY_FAILED', 'data.json snapshot dizini oluşturulamadı.', 500);
        }
        if (@file_put_contents($dataDest, $rawBytes) !== strlen($rawBytes)) {
            medisaFullBackupCleanupAndForget([$snapshotRoot]);
            return medisaFullBackupError('SNAPSHOT_COPY_FAILED', 'data.json snapshot yazılamadı.', 500);
        }
        $dataSha = hash('sha256', $rawBytes);
        $stagedFiles[] = [
            'archive_path' => $dataArchive,
            'absolute' => $dataDest,
            'sha256' => $dataSha,
            'size' => strlen($rawBytes),
            'source' => 'canonical_data',
        ];

        foreach ($collected['files'] as $entry) {
            $archivePath = $entry['archive_path'];
            $dest = $snapshotRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $archivePath);
            $copyErr = medisaFullBackupCopyExactFile($entry['absolute'], $dest);
            if ($copyErr !== null) {
                medisaFullBackupCleanupAndForget([$snapshotRoot]);
                return $copyErr;
            }
            $sha = medisaFullBackupHashFile($dest);
            $size = filesize($dest);
            if ($sha === null || $size === false) {
                medisaFullBackupCleanupAndForget([$snapshotRoot]);
                return medisaFullBackupError('SNAPSHOT_COPY_FAILED', 'Snapshot hash alınamadı.', 500);
            }
            $stagedFiles[] = [
                'archive_path' => $archivePath,
                'absolute' => $dest,
                'sha256' => $sha,
                'size' => (int)$size,
                'source' => $entry['source'],
            ];
        }

        medisaFullBackupForgetCleanup($snapshotRoot);
        return [
            'success' => true,
            'snapshot_dir' => $snapshotRoot,
            'files' => $stagedFiles,
            'data_sha256' => $dataSha,
            'created_at' => date('c'),
            'raw_data_bytes' => strlen($rawBytes),
        ];
    } finally {
        if (is_string($snapshotRoot) && $snapshotRoot !== '') {
            // Hata dönüşlerinde register listesinde kaldıysa shutdown temizler.
        }
        medisaReleaseDataLock($lockHandle);
    }
}

function medisaFullBackupBuildManifest(array $snapshot) {
    $files = [];
    $totalBytes = 0;
    foreach ($snapshot['files'] as $entry) {
        $size = (int)$entry['size'];
        $totalBytes += $size;
        $files[] = [
            'archive_path' => $entry['archive_path'],
            'sha256' => $entry['sha256'],
            'size' => $size,
        ];
    }
    return [
        'format' => MEDISA_FULL_BACKUP_FORMAT,
        'format_version' => MEDISA_FULL_BACKUP_FORMAT_VERSION,
        'created_at' => $snapshot['created_at'] ?? date('c'),
        'data_sha256' => $snapshot['data_sha256'],
        'file_count' => count($files),
        'total_bytes' => $totalBytes,
        'files' => $files,
    ];
}

function medisaFullBackupBuildZipFromSnapshot(array $snapshot) {
    $zipErr = medisaFullBackupRequireZipArchive();
    if ($zipErr !== null) {
        return $zipErr;
    }
    if (($snapshot['success'] ?? false) !== true || empty($snapshot['snapshot_dir'])) {
        return medisaFullBackupError('SNAPSHOT_MISSING', 'Snapshot bulunamadı.', 500);
    }

    $manifest = medisaFullBackupBuildManifest($snapshot);
    $manifestJson = json_encode($manifest, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if ($manifestJson === false) {
        return medisaFullBackupError('MANIFEST_ENCODE_FAILED', 'Manifest oluşturulamadı.', 500);
    }
    $manifestPath = rtrim($snapshot['snapshot_dir'], DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'manifest.json';
    if (@file_put_contents($manifestPath, $manifestJson) === false) {
        return medisaFullBackupError('MANIFEST_WRITE_FAILED', 'Manifest yazılamadı.', 500);
    }

    $zipPath = rtrim(dirname($snapshot['snapshot_dir']), DIRECTORY_SEPARATOR)
        . DIRECTORY_SEPARATOR
        . 'out-' . bin2hex(random_bytes(8)) . '.zip';

    $zip = new ZipArchive();
    $opened = $zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE);
    if ($opened !== true) {
        return medisaFullBackupError('ZIP_CREATE_FAILED', 'ZIP oluşturulamadı.', 500);
    }

    if (!$zip->addFile($manifestPath, 'manifest.json')) {
        $zip->close();
        @unlink($zipPath);
        return medisaFullBackupError('ZIP_ADD_FAILED', 'Manifest ZIP\'e eklenemedi.', 500);
    }
    foreach ($snapshot['files'] as $entry) {
        $archivePath = medisaFullBackupValidateArchivePath($entry['archive_path']);
        if ($archivePath === null) {
            $zip->close();
            @unlink($zipPath);
            return medisaFullBackupError('UNSAFE_PATH', 'ZIP yolu geçersiz.', 500);
        }
        if (!$zip->addFile($entry['absolute'], $archivePath)) {
            $zip->close();
            @unlink($zipPath);
            return medisaFullBackupError('ZIP_ADD_FAILED', 'Dosya ZIP\'e eklenemedi.', 500, [
                'archive_path' => $archivePath,
            ]);
        }
    }
    if (!$zip->close()) {
        @unlink($zipPath);
        return medisaFullBackupError('ZIP_CLOSE_FAILED', 'ZIP kapatılamadı.', 500);
    }

    $zipSize = filesize($zipPath);
    if ($zipSize === false || $zipSize <= 0) {
        @unlink($zipPath);
        return medisaFullBackupError('ZIP_EMPTY', 'ZIP boş üretildi.', 500);
    }
    $limits = medisaFullBackupLimits();
    if ($zipSize > (int)$limits['max_zip_bytes']) {
        @unlink($zipPath);
        return medisaFullBackupError('ZIP_TOO_LARGE', 'ZIP boyutu limiti aşıyor.', 500);
    }

    return [
        'success' => true,
        'zip_path' => $zipPath,
        'zip_size' => (int)$zipSize,
        'manifest' => $manifest,
        'snapshot_dir' => $snapshot['snapshot_dir'],
    ];
}

function medisaFullBackupWriteLastMeta(array $manifest, $zipFilename, array $env = null) {
    $env = $env ?: medisaFullBackupEnv();
    $metaPath = (string)($env['last_meta_file'] ?? '');
    if ($metaPath === '') {
        return false;
    }
    $payload = [
        'source' => 'manual_full_backup',
        'source_label' => 'Manuel tam yedek',
        'format' => MEDISA_FULL_BACKUP_FORMAT,
        'format_version' => MEDISA_FULL_BACKUP_FORMAT_VERSION,
        'created_at' => $manifest['created_at'] ?? date('c'),
        'data_sha256' => $manifest['data_sha256'] ?? null,
        'file_count' => $manifest['file_count'] ?? null,
        'total_bytes' => $manifest['total_bytes'] ?? null,
        'zip_filename' => (string)$zipFilename,
    ];
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if ($json === false) {
        return false;
    }
    return medisaAtomicWriteFile($metaPath, $json);
}

function medisaFullBackupReadLastMeta(array $env = null) {
    $env = $env ?: medisaFullBackupEnv();
    $metaPath = (string)($env['last_meta_file'] ?? '');
    if ($metaPath === '' || !is_file($metaPath) || !is_readable($metaPath)) {
        return null;
    }
    if (@is_link($metaPath)) {
        return null;
    }
    $raw = @file_get_contents($metaPath);
    if ($raw === false || $raw === '') {
        return null;
    }
    $data = json_decode($raw, true);
    if (!is_array($data) || ($data['source'] ?? '') !== 'manual_full_backup') {
        return null;
    }
    if (empty($data['created_at'])) {
        return null;
    }
    return $data;
}

function medisaFullBackupCleanupPaths(array $paths) {
    foreach ($paths as $path) {
        if (!is_string($path) || $path === '') {
            continue;
        }
        if (is_dir($path)) {
            medisaFullBackupRmTree($path);
        } elseif (is_file($path)) {
            @unlink($path);
        }
    }
}


/**
 * ZIP'i güvenli temp alana açar (zip-slip/symlink/bomb fail-closed) ve doğrular.
 * Canlı data/ dokunulmaz.
 */
function medisaFullBackupStageAndValidateZip($zipPath, array $env = null) {
    $env = $env ?: medisaFullBackupEnv();
    $limits = medisaFullBackupLimits($env);
    $zipErr = medisaFullBackupRequireZipArchive();
    if ($zipErr !== null) {
        return $zipErr;
    }
    $fileErr = medisaFullBackupAssertRegularFile($zipPath);
    if ($fileErr !== null) {
        $fileErr['error_code'] = 'ZIP_UNREADABLE';
        $fileErr['message'] = 'ZIP dosyası okunamadı.';
        return $fileErr;
    }
    $zipSize = filesize($zipPath);
    if ($zipSize === false || $zipSize <= 0 || $zipSize > (int)$limits['max_zip_bytes']) {
        return medisaFullBackupError('ZIP_SIZE_INVALID', 'ZIP boyutu geçersiz veya limiti aşıyor.', 422);
    }

    $runtimeDir = (string)($env['runtime_dir'] ?? '');
    if ($runtimeDir === '' || !medisaFullBackupEnsureDir($runtimeDir)) {
        return medisaFullBackupError('STAGE_DIR_FAILED', 'Staging dizini oluşturulamadı.', 500);
    }
    $stageDir = rtrim($runtimeDir, DIRECTORY_SEPARATOR)
        . DIRECTORY_SEPARATOR
        . 'stage-' . date('YmdHis') . '-' . bin2hex(random_bytes(6));
    if (!medisaFullBackupEnsureDir($stageDir)) {
        return medisaFullBackupError('STAGE_DIR_FAILED', 'Staging alanı oluşturulamadı.', 500);
    }
    medisaFullBackupRegisterCleanup($stageDir);
    $stageReal = realpath($stageDir);
    if ($stageReal === false) {
        medisaFullBackupCleanupAndForget([$stageDir]);
        return medisaFullBackupError('STAGE_DIR_FAILED', 'Staging realpath başarısız.', 500);
    }

    $zip = new ZipArchive();
    if ($zip->open($zipPath) !== true) {
        medisaFullBackupCleanupAndForget([$stageDir]);
        return medisaFullBackupError('ZIP_OPEN_FAILED', 'ZIP açılamadı.', 422);
    }

    $zipEntryPaths = [];
    $totalUncompressed = 0;
    $extractError = null;
    $extractedCount = 0;

    try {
        if ((int)$zip->numFiles > (int)$limits['max_entry_count']) {
            $extractError = medisaFullBackupError('TOO_MANY_ENTRIES', 'ZIP giriş sayısı limiti aşıyor.', 422, [
                'entry_count' => (int)$zip->numFiles,
                'max_entry_count' => (int)$limits['max_entry_count'],
            ]);
        } else {
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $stat = $zip->statIndex($i);
                $name = is_array($stat) ? ($stat['name'] ?? $zip->getNameIndex($i)) : $zip->getNameIndex($i);
                if (!is_string($name) || $name === '' || strpos($name, "\0") !== false) {
                    $extractError = medisaFullBackupError('ZIP_SLIP', 'ZIP içinde geçersiz giriş adı.', 422);
                    break;
                }
                if (substr($name, -1) === '/') {
                    continue;
                }
                $archivePath = ($name === 'manifest.json')
                    ? 'manifest.json'
                    : medisaFullBackupValidateArchivePath($name);
                if ($archivePath === null) {
                    $extractError = medisaFullBackupError('ZIP_SLIP', 'ZIP yolu reddedildi.', 422, [
                        'entry' => $name,
                    ]);
                    break;
                }
                if (isset($zipEntryPaths[$archivePath])) {
                    $extractError = medisaFullBackupError('DUPLICATE_ZIP_PATH', 'ZIP içinde tekrarlayan yol var.', 422, [
                        'archive_path' => $archivePath,
                    ]);
                    break;
                }
                $uncompressed = is_array($stat) && isset($stat['size']) ? (int)$stat['size'] : -1;
                if ($uncompressed < 0) {
                    $extractError = medisaFullBackupError('ZIP_STAT_FAILED', 'ZIP giriş boyutu okunamadı.', 422);
                    break;
                }
                if ($uncompressed > (int)$limits['max_entry_uncompressed_bytes']) {
                    $extractError = medisaFullBackupError('ENTRY_TOO_LARGE', 'Tek ZIP girişi boyutu limiti aşıyor.', 422, [
                        'archive_path' => $archivePath,
                    ]);
                    break;
                }
                $totalUncompressed += $uncompressed;
                if ($totalUncompressed > (int)$limits['max_total_uncompressed_bytes']) {
                    $extractError = medisaFullBackupError('TOTAL_UNCOMPRESSED_LIMIT', 'ZIP toplam açılmış boyutu limiti aşıyor.', 422);
                    break;
                }
                if (method_exists($zip, 'getExternalAttributesIndex')) {
                    $opsys = 0;
                    $attr = 0;
                    if ($zip->getExternalAttributesIndex($i, $opsys, $attr)) {
                        if ((int)$opsys === ZipArchive::OPSYS_UNIX) {
                            $mode = ((int)$attr >> 16) & 0xFFFF;
                            if (($mode & 0170000) === 0120000) {
                                $extractError = medisaFullBackupError('SYMLINK_FORBIDDEN', 'ZIP içinde sembolik bağlantı yasak.', 422);
                                break;
                            }
                        }
                    }
                }
                $zipEntryPaths[$archivePath] = $uncompressed;
            }
        }

        if ($extractError === null) {
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $stat = $zip->statIndex($i);
                $name = is_array($stat) ? ($stat['name'] ?? $zip->getNameIndex($i)) : $zip->getNameIndex($i);
                if (!is_string($name) || $name === '' || substr($name, -1) === '/') {
                    continue;
                }
                $archivePath = ($name === 'manifest.json')
                    ? 'manifest.json'
                    : medisaFullBackupValidateArchivePath($name);
                if ($archivePath === null || !isset($zipEntryPaths[$archivePath])) {
                    $extractError = medisaFullBackupError('ZIP_SLIP', 'ZIP yolu reddedildi.', 422);
                    break;
                }
                $contents = $zip->getFromIndex($i);
                if ($contents === false) {
                    $extractError = medisaFullBackupError('ZIP_READ_FAILED', 'ZIP girişi okunamadı.', 422);
                    break;
                }
                if (strlen($contents) > (int)$limits['max_entry_uncompressed_bytes']) {
                    $extractError = medisaFullBackupError('ENTRY_TOO_LARGE', 'Tek ZIP girişi boyutu limiti aşıyor.', 422);
                    break;
                }
                $dest = $stageReal . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $archivePath);
                $destDir = dirname($dest);
                if (!medisaFullBackupEnsureDir($destDir)) {
                    $extractError = medisaFullBackupError('STAGE_WRITE_FAILED', 'Staging yazılamadı.', 500);
                    break;
                }
                $destDirReal = realpath($destDir);
                if ($destDirReal === false || strpos($destDirReal, $stageReal) !== 0) {
                    $extractError = medisaFullBackupError('ZIP_SLIP', 'Staging path traversal engellendi.', 422);
                    break;
                }
                if (@file_put_contents($dest, $contents) !== strlen($contents)) {
                    $extractError = medisaFullBackupError('STAGE_WRITE_FAILED', 'Staging dosya yazımı başarısız.', 500);
                    break;
                }
                if (@is_link($dest)) {
                    $extractError = medisaFullBackupError('SYMLINK_FORBIDDEN', 'Staging sembolik bağlantı üretti.', 422);
                    break;
                }
                $extractedCount++;
            }
        }
    } finally {
        @$zip->close();
    }

    if ($extractError !== null) {
        medisaFullBackupCleanupAndForget([$stageDir]);
        return $extractError;
    }

    $manifestPath = $stageReal . DIRECTORY_SEPARATOR . 'manifest.json';
    if (!is_file($manifestPath)) {
        medisaFullBackupCleanupAndForget([$stageDir]);
        return medisaFullBackupError('MANIFEST_MISSING', 'manifest.json eksik.', 422);
    }
    $manifestRaw = file_get_contents($manifestPath);
    if ($manifestRaw === false) {
        medisaFullBackupCleanupAndForget([$stageDir]);
        return medisaFullBackupError('MANIFEST_UNREADABLE', 'manifest.json okunamadı.', 422);
    }
    $manifest = json_decode($manifestRaw, true);
    if (
        json_last_error() !== JSON_ERROR_NONE
        || !is_array($manifest)
        || ($manifest['format'] ?? '') !== MEDISA_FULL_BACKUP_FORMAT
        || ($manifest['format_version'] ?? '') !== MEDISA_FULL_BACKUP_FORMAT_VERSION
        || !isset($manifest['files'])
        || !is_array($manifest['files'])
        || !isset($manifest['data_sha256'])
        || !isset($manifest['file_count'])
        || !isset($manifest['total_bytes'])
    ) {
        medisaFullBackupCleanupAndForget([$stageDir]);
        return medisaFullBackupError('MANIFEST_MALFORMED', 'manifest.json geçersiz.', 422);
    }

    if ((int)$manifest['file_count'] !== count($manifest['files'])) {
        medisaFullBackupCleanupAndForget([$stageDir]);
        return medisaFullBackupError('MANIFEST_COUNT_MISMATCH', 'Manifest dosya sayısı uyuşmuyor.', 422);
    }

    $totalBytes = 0;
    $seen = [];
    foreach ($manifest['files'] as $entry) {
        if (!is_array($entry)) {
            medisaFullBackupCleanupAndForget([$stageDir]);
            return medisaFullBackupError('MANIFEST_MALFORMED', 'Manifest dosya girişi geçersiz.', 422);
        }
        $archivePath = medisaFullBackupValidateArchivePath($entry['archive_path'] ?? '');
        $expectedSha = strtolower((string)($entry['sha256'] ?? ''));
        $expectedSize = (int)($entry['size'] ?? -1);
        if ($archivePath === null || !preg_match('/^[a-f0-9]{64}$/', $expectedSha) || $expectedSize < 0) {
            medisaFullBackupCleanupAndForget([$stageDir]);
            return medisaFullBackupError('MANIFEST_MALFORMED', 'Manifest dosya meta geçersiz.', 422);
        }
        if (isset($seen[$archivePath])) {
            medisaFullBackupCleanupAndForget([$stageDir]);
            return medisaFullBackupError('DUPLICATE_MANIFEST_PATH', 'Manifest tekrarlayan yol içeriyor.', 422, [
                'archive_path' => $archivePath,
            ]);
        }
        $seen[$archivePath] = true;

        if (!isset($zipEntryPaths[$archivePath])) {
            medisaFullBackupCleanupAndForget([$stageDir]);
            return medisaFullBackupError('MANIFEST_FILE_MISSING', 'Manifestteki dosya ZIP içinde yok.', 422, [
                'archive_path' => $archivePath,
            ]);
        }

        $abs = $stageReal . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $archivePath);
        if (@is_link($abs) || !is_file($abs)) {
            medisaFullBackupCleanupAndForget([$stageDir]);
            return medisaFullBackupError('MANIFEST_FILE_MISSING', 'Manifestteki dosya stagingde yok.', 422, [
                'archive_path' => $archivePath,
            ]);
        }
        $size = filesize($abs);
        $sha = medisaFullBackupHashFile($abs);
        if ($size === false || $sha === null || (int)$size !== $expectedSize || !hash_equals($expectedSha, $sha)) {
            medisaFullBackupCleanupAndForget([$stageDir]);
            return medisaFullBackupError('HASH_MISMATCH', 'Dosya hash/boyut doğrulaması başarısız.', 422, [
                'archive_path' => $archivePath,
            ]);
        }
        $totalBytes += (int)$size;
    }

    if ((int)$manifest['total_bytes'] !== $totalBytes) {
        medisaFullBackupCleanupAndForget([$stageDir]);
        return medisaFullBackupError('MANIFEST_SIZE_MISMATCH', 'Manifest toplam boyutu uyuşmuyor.', 422);
    }

    foreach ($zipEntryPaths as $archivePath => $_size) {
        if ($archivePath === 'manifest.json') {
            continue;
        }
        if (!isset($seen[$archivePath])) {
            medisaFullBackupCleanupAndForget([$stageDir]);
            return medisaFullBackupError('UNEXPECTED_ENTRY', 'ZIP içinde manifest dışı dosya var.', 422, [
                'archive_path' => $archivePath,
            ]);
        }
    }

    if ($extractedCount !== (count($seen) + 1)) {
        medisaFullBackupCleanupAndForget([$stageDir]);
        return medisaFullBackupError('ZIP_FILE_COUNT_MISMATCH', 'ZIP dosya sayısı uyuşmuyor.', 422);
    }

    $dataPath = $stageReal . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'data.json';
    if (!is_file($dataPath) || @is_link($dataPath)) {
        medisaFullBackupCleanupAndForget([$stageDir]);
        return medisaFullBackupError('DATA_MISSING', 'ZIP içinde data/data.json yok.', 422);
    }
    $dataRaw = file_get_contents($dataPath);
    if ($dataRaw === false || $dataRaw === '') {
        medisaFullBackupCleanupAndForget([$stageDir]);
        return medisaFullBackupError('DATA_UNREADABLE', 'Staging data.json okunamadı.', 422);
    }
    $dataSha = hash('sha256', $dataRaw);
    if (!hash_equals((string)$manifest['data_sha256'], $dataSha)) {
        medisaFullBackupCleanupAndForget([$stageDir]);
        return medisaFullBackupError('DATA_HASH_MISMATCH', 'data.json hash uyuşmuyor.', 422);
    }
    $decoded = json_decode($dataRaw, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
        medisaFullBackupCleanupAndForget([$stageDir]);
        return medisaFullBackupError('INVALID_JSON', 'data.json geçerli JSON değil.', 422);
    }

    foreach (medisaFullBackupDocumentTypes() as $documentType) {
        $config = medisaGetVehicleDocumentConfig($documentType);
        if (!$config) {
            continue;
        }
        $settingsKey = (string)($config['settingsKey'] ?? '');
        if ($settingsKey !== '') {
            $settingsDoc = $decoded['ayarlar'][$settingsKey] ?? null;
            if (is_array($settingsDoc)) {
                $settingsPathField = (string)($config['settingsPathField'] ?? 'documentPath');
                $rawSettingsPath = trim((string)($settingsDoc[$settingsPathField] ?? ''));
                if ($rawSettingsPath !== '') {
                    $archivePath = medisaFullBackupRelativeArchivePathFromRaw($rawSettingsPath, $config);
                    if ($archivePath === null || !isset($seen[$archivePath])) {
                        medisaFullBackupCleanupAndForget([$stageDir]);
                        return medisaFullBackupError(
                            'MISSING_REFERENCED_FILE',
                            'ZIP içinde ayarlar belgesi eksik.',
                            422,
                            ['source' => 'settings:' . $settingsKey]
                        );
                    }
                }
            }
        }
    }
    $vehicles = $decoded['tasitlar'] ?? ($decoded['vehicles'] ?? []);
    if (!is_array($vehicles)) {
        $vehicles = [];
    }
    foreach ($vehicles as $vehicle) {
        if (!is_array($vehicle)) {
            continue;
        }
        foreach (medisaFullBackupDocumentTypes() as $documentType) {
            $config = medisaGetVehicleDocumentConfig($documentType);
            if (!$config) {
                continue;
            }
            $pathField = (string)($config['pathField'] ?? '');
            $rawPath = trim((string)($vehicle[$pathField] ?? ''));
            if ($rawPath === '') {
                continue;
            }
            $archivePath = medisaFullBackupRelativeArchivePathFromRaw($rawPath, $config);
            if ($archivePath === null || !isset($seen[$archivePath])) {
                medisaFullBackupCleanupAndForget([$stageDir]);
                return medisaFullBackupError(
                    'MISSING_REFERENCED_FILE',
                    'ZIP içinde referans belge eksik.',
                    422,
                    ['path_field' => $pathField]
                );
            }
        }
    }

    medisaFullBackupForgetCleanup($stageDir);

    return [
        'success' => true,
        'stage_dir' => $stageReal,
        'manifest' => $manifest,
        'data_raw' => $dataRaw,
        'data' => $decoded,
        'created_at' => $manifest['created_at'] ?? null,
        'file_count' => (int)$manifest['file_count'],
        'total_bytes' => (int)$manifest['total_bytes'],
    ];
}

function medisaFullBackupRollbackEmergency($emergencyDataPath, array $emergencyDocs, array $createdLivePaths, $dataFile, $dataWritten) {
    if ($dataWritten && is_string($emergencyDataPath) && is_file($emergencyDataPath)) {
        $raw = @file_get_contents($emergencyDataPath);
        if ($raw !== false) {
            medisaAtomicWriteFile($dataFile, $raw);
        }
    }
    foreach (array_reverse($emergencyDocs) as $pair) {
        $live = $pair['live'] ?? null;
        $backup = $pair['backup'] ?? null;
        if (is_string($live) && is_string($backup) && is_file($backup)) {
            @copy($backup, $live);
        }
    }
    foreach ($createdLivePaths as $livePath) {
        if (!is_string($livePath) || $livePath === '') {
            continue;
        }
        $hadEmergency = false;
        foreach ($emergencyDocs as $pair) {
            if (($pair['live'] ?? null) === $livePath) {
                $hadEmergency = true;
                break;
            }
        }
        if (!$hadEmergency && is_file($livePath)) {
            @unlink($livePath);
        }
    }
}

function medisaFullBackupCommitStagedRestoreSafe(array $staged, array $env = null) {
    $env = $env ?: medisaFullBackupEnv();
    if (($staged['success'] ?? false) !== true || empty($staged['stage_dir']) || empty($staged['data_raw'])) {
        return medisaFullBackupError('STAGE_INVALID', 'Staging geçersiz.', 400);
    }

    $dataFile = (string)($env['data_file'] ?? getDataFilePath());
    $dataDir = (string)($env['data_dir'] ?? getDataDirPath());
    $stageDir = (string)$staged['stage_dir'];
    $manifest = $staged['manifest'];
    $runtimeDir = (string)($env['runtime_dir'] ?? ($dataDir . DIRECTORY_SEPARATOR . '.medisa_full_backup'));

    $lockHandle = medisaAcquireDataLock();
    if (!$lockHandle) {
        return medisaFullBackupError('LOCK_FAILED', 'Veri kilidi alınamadı.', 500);
    }

    $emergencyDataPath = null;
    $emergencyDocs = [];
    $createdLivePaths = [];
    $dataWritten = false;
    $result = null;

    try {
        if (is_file($dataFile)) {
            $currentRaw = file_get_contents($dataFile);
            if ($currentRaw === false) {
                $result = medisaFullBackupError('EMERGENCY_BACKUP_FAILED', 'Mevcut veri okunamadı.', 500);
                return $result;
            }
            if (!medisaFullBackupEnsureDir($runtimeDir)) {
                $result = medisaFullBackupError('EMERGENCY_BACKUP_FAILED', 'Emergency dizin oluşturulamadı.', 500);
                return $result;
            }
            $emergencyDataPath = rtrim($runtimeDir, DIRECTORY_SEPARATOR)
                . DIRECTORY_SEPARATOR
                . 'emergency-data-' . bin2hex(random_bytes(6)) . '.json';
            medisaFullBackupRegisterCleanup($emergencyDataPath);
            if (@file_put_contents($emergencyDataPath, $currentRaw) !== strlen($currentRaw)) {
                $result = medisaFullBackupError('EMERGENCY_BACKUP_FAILED', 'Emergency data yedeği yazılamadı.', 500);
                return $result;
            }
        }

        foreach ($manifest['files'] as $entry) {
            $archivePath = medisaFullBackupValidateArchivePath($entry['archive_path'] ?? '');
            if ($archivePath === null || $archivePath === 'data/data.json') {
                continue;
            }
            if (strpos($archivePath, 'data/') !== 0) {
                $result = medisaFullBackupError('UNSAFE_PATH', 'Restore yolu geçersiz.', 422);
                return $result;
            }
            $rel = substr($archivePath, 5);
            $livePath = rtrim($dataDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel);
            $stagePath = rtrim($stageDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $archivePath);

            if (!is_file($stagePath) || @is_link($stagePath)) {
                $result = medisaFullBackupError('STAGE_FILE_MISSING', 'Staging dosyası eksik.', 500, [
                    'archive_path' => $archivePath,
                ]);
                return $result;
            }

            $liveParent = dirname($livePath);
            if (!medisaFullBackupEnsureDir($liveParent)) {
                $result = medisaFullBackupError('RESTORE_WRITE_FAILED', 'Hedef dizin oluşturulamadı.', 500);
                return $result;
            }
            $dataDirReal = realpath($dataDir);
            $liveParentReal = realpath($liveParent);
            if ($dataDirReal === false || $liveParentReal === false || strpos($liveParentReal, $dataDirReal) !== 0) {
                $result = medisaFullBackupError('ZIP_SLIP', 'Canlı yol data/ dışında.', 422);
                return $result;
            }

            $existedBefore = is_file($livePath) && !is_link($livePath);
            if ($existedBefore) {
                $side = rtrim($runtimeDir, DIRECTORY_SEPARATOR)
                    . DIRECTORY_SEPARATOR
                    . 'emergency-doc-' . bin2hex(random_bytes(4)) . '-' . basename($livePath);
                medisaFullBackupRegisterCleanup($side);
                if (!@copy($livePath, $side)) {
                    $result = medisaFullBackupError('EMERGENCY_BACKUP_FAILED', 'Belge emergency kopyası başarısız.', 500);
                    return $result;
                }
                $emergencyDocs[] = ['live' => $livePath, 'backup' => $side];
            }

            $tmpLive = $livePath . '.medisa_restore_tmp_' . bin2hex(random_bytes(4));
            medisaFullBackupRegisterCleanup($tmpLive);
            if (!@copy($stagePath, $tmpLive)) {
                @unlink($tmpLive);
                medisaFullBackupForgetCleanup($tmpLive);
                $result = medisaFullBackupError('RESTORE_WRITE_FAILED', 'Belge geçici yazımı başarısız.', 500);
                return $result;
            }
            if (!@rename($tmpLive, $livePath)) {
                if (!@copy($tmpLive, $livePath)) {
                    @unlink($tmpLive);
                    medisaFullBackupForgetCleanup($tmpLive);
                    $result = medisaFullBackupError('RESTORE_WRITE_FAILED', 'Belge canlı alana taşınamadı.', 500);
                    return $result;
                }
                @unlink($tmpLive);
            }
            medisaFullBackupForgetCleanup($tmpLive);
            $createdLivePaths[] = $livePath;

            $liveSha = medisaFullBackupHashFile($livePath);
            if ($liveSha === null || !hash_equals(strtolower((string)$entry['sha256']), $liveSha)) {
                $result = medisaFullBackupError('RESTORE_HASH_MISMATCH', 'Yazılan belge hash doğrulaması başarısız.', 500, [
                    'archive_path' => $archivePath,
                ]);
                return $result;
            }
        }

        if (!medisaAtomicWriteFile($dataFile, $staged['data_raw'])) {
            $result = medisaFullBackupError('ATOMIC_WRITE_FAILED', 'data.json atomik yazımı başarısız.', 500);
            return $result;
        }
        $dataWritten = true;

        $writtenRaw = file_get_contents($dataFile);
        if ($writtenRaw === false || !hash_equals(hash('sha256', $staged['data_raw']), hash('sha256', $writtenRaw))) {
            $result = medisaFullBackupError('AFTER_HASH_MISMATCH', 'Yazım sonrası data.json doğrulaması başarısız.', 500);
            return $result;
        }

        $result = [
            'success' => true,
            'message' => 'Tam yedek geri yükleme tamamlandı.',
            'file_count' => (int)($manifest['file_count'] ?? 0),
            'data_sha256' => (string)($manifest['data_sha256'] ?? ''),
        ];
        return $result;
    } finally {
        if ($result === null || ($result['success'] ?? false) !== true) {
            medisaFullBackupRollbackEmergency(
                $emergencyDataPath,
                $emergencyDocs,
                $createdLivePaths,
                $dataFile,
                $dataWritten || !empty($emergencyDocs) || !empty($createdLivePaths)
            );
        }
        if (is_string($emergencyDataPath) && is_file($emergencyDataPath)) {
            @unlink($emergencyDataPath);
            medisaFullBackupForgetCleanup($emergencyDataPath);
        }
        foreach ($emergencyDocs as $pair) {
            if (!empty($pair['backup']) && is_file($pair['backup'])) {
                @unlink($pair['backup']);
                medisaFullBackupForgetCleanup($pair['backup']);
            }
        }
        medisaReleaseDataLock($lockHandle);
    }
}
