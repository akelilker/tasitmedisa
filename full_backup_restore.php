<?php
/**
 * Full-backup ZIP restore endpoint.
 * Önce staging + doğrulama; hiçbir doğrulama bitmeden canlı data/ değişmez.
 * server_restore.php production flag'lerini bypass etmez / gevşetmez.
 */
require_once __DIR__ . '/core.php';
require_once __DIR__ . '/full_backup.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST, OPTIONS');
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'message' => 'Bu endpoint yalnız POST ile tam yedek geri yükler.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$zipGate = medisaFullBackupRequireZipArchive();
if ($zipGate !== null) {
    http_response_code((int)($zipGate['status'] ?? 500));
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($zipGate, JSON_UNESCAPED_UNICODE);
    exit;
}

$currentData = loadData();
if (!is_array($currentData)) {
    $currentData = medisaDefaultData();
}

$auth = medisaResolveAuthorizedContext($currentData, 'manage_backups');
if (($auth['success'] ?? false) !== true) {
    http_response_code((int)($auth['status'] ?? 403));
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'auth_required' => (int)($auth['status'] ?? 403) === 401,
        'message' => $auth['message'] ?? 'Bu işlem için yetkiniz yok.',
        'error' => $auth['message'] ?? 'Bu işlem için yetkiniz yok.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!isset($_FILES['backup']) || !is_array($_FILES['backup'])) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'error_code' => 'MISSING_FILE',
        'message' => 'Yedek ZIP dosyası gerekli.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$upload = $_FILES['backup'];
if (($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'error_code' => 'UPLOAD_FAILED',
        'message' => 'ZIP yüklemesi başarısız.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$env = medisaFullBackupEnv();
$limits = medisaFullBackupLimits($env);
$uploadSize = isset($upload['size']) ? (int)$upload['size'] : 0;
if ($uploadSize <= 0 || $uploadSize > (int)$limits['max_zip_bytes']) {
    http_response_code(422);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'error_code' => 'ZIP_SIZE_INVALID',
        'message' => 'ZIP boyutu geçersiz veya limiti aşıyor.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$tmpName = (string)($upload['tmp_name'] ?? '');
$origName = (string)($upload['name'] ?? '');
if ($tmpName === '' || !is_uploaded_file($tmpName)) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'error_code' => 'UPLOAD_INVALID',
        'message' => 'Geçersiz yükleme.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!preg_match('/\.zip$/i', $origName)) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'error_code' => 'INVALID_EXTENSION',
        'message' => 'Yalnız .zip tam yedek kabul edilir.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$runtimeDir = (string)($env['runtime_dir'] ?? '');
if ($runtimeDir === '' || !medisaFullBackupEnsureDir($runtimeDir)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'error_code' => 'STAGE_DIR_FAILED',
        'message' => 'Staging dizini oluşturulamadı.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$storedZip = rtrim($runtimeDir, DIRECTORY_SEPARATOR)
    . DIRECTORY_SEPARATOR
    . 'upload-' . date('YmdHis') . '-' . bin2hex(random_bytes(6)) . '.zip';

$stageDir = null;
try {
    if (!@move_uploaded_file($tmpName, $storedZip)) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'success' => false,
            'error_code' => 'UPLOAD_STORE_FAILED',
            'message' => 'Yüklenen ZIP saklanamadı.',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
    medisaFullBackupRegisterCleanup($storedZip);

    $staged = medisaFullBackupStageAndValidateZip($storedZip, $env);
    medisaFullBackupCleanupAndForget([$storedZip]);
    $storedZip = null;

    if (($staged['success'] ?? false) !== true) {
        if (!empty($staged['stage_dir'])) {
            medisaFullBackupCleanupAndForget([$staged['stage_dir']]);
        }
        http_response_code((int)($staged['status'] ?? 422));
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'success' => false,
            'error_code' => $staged['error_code'] ?? 'VALIDATION_FAILED',
            'message' => $staged['message'] ?? 'ZIP doğrulaması başarısız.',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $stageDir = $staged['stage_dir'] ?? null;
    if (is_string($stageDir) && $stageDir !== '') {
        medisaFullBackupRegisterCleanup($stageDir);
    }

    // Doğrulama tamam — canlıya commit
    $commit = medisaFullBackupCommitStagedRestoreSafe($staged, $env);
    if (is_string($stageDir) && $stageDir !== '') {
        medisaFullBackupCleanupAndForget([$stageDir]);
        $stageDir = null;
    }

    header('Content-Type: application/json; charset=utf-8');
    if (($commit['success'] ?? false) !== true) {
        http_response_code((int)($commit['status'] ?? 500));
        echo json_encode([
            'success' => false,
            'error_code' => $commit['error_code'] ?? 'RESTORE_FAILED',
            'message' => $commit['message'] ?? 'Geri yükleme başarısız; mevcut sistem korundu.',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode([
        'success' => true,
        'message' => $commit['message'] ?? 'Tam yedek geri yükleme tamamlandı.',
        'file_count' => $commit['file_count'] ?? null,
        'data_sha256' => $commit['data_sha256'] ?? null,
    ], JSON_UNESCAPED_UNICODE);
    exit;
} finally {
    if (is_string($storedZip) && $storedZip !== '') {
        medisaFullBackupCleanupAndForget([$storedZip]);
    }
    if (is_string($stageDir) && $stageDir !== '') {
        medisaFullBackupCleanupAndForget([$stageDir]);
    }
}
