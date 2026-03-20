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

/** Bearer token doğrula. Geçerliyse decode edilmiş token, değilse null döner. */
function validateToken() {
    $headers = getallheaders();
    if (!is_array($headers)) {
        $headers = [];
    }
    $authHeader = $headers['Authorization'] ?? '';
    if (empty($authHeader)) {
        return null;
    }
    $token = str_replace('Bearer ', '', $authHeader);
    $decoded = json_decode(base64_decode($token), true);
    if (!$decoded || !isset($decoded['exp']) || $decoded['exp'] < time()) {
        return null;
    }
    return $decoded;
}
