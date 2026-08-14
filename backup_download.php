<?php
/**
 * Full-system ZIP backup download.
 * Canonical data/data.json + referenced documents + optional kasko list.
 * Browser state yok. JSON fallback yok.
 */
require_once __DIR__ . '/core.php';
require_once __DIR__ . '/full_backup.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    header('Allow: GET, OPTIONS');
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'message' => 'Bu endpoint yalnız GET ile tam yedek indirir.',
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

$snapshot = medisaFullBackupCreateSnapshotUnderLock();
if (($snapshot['success'] ?? false) !== true) {
    http_response_code((int)($snapshot['status'] ?? 500));
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'error_code' => $snapshot['error_code'] ?? 'BACKUP_FAILED',
        'message' => $snapshot['message'] ?? 'Yedek alınamadı. Sunucu verisi indirilemedi.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

medisaFullBackupRegisterCleanup($snapshot['snapshot_dir'] ?? '');
$built = medisaFullBackupBuildZipFromSnapshot($snapshot);
medisaFullBackupCleanupAndForget([$snapshot['snapshot_dir'] ?? '']);

if (($built['success'] ?? false) !== true) {
    medisaFullBackupCleanupAndForget([$built['zip_path'] ?? '']);
    http_response_code((int)($built['status'] ?? 500));
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'error_code' => $built['error_code'] ?? 'ZIP_FAILED',
        'message' => $built['message'] ?? 'ZIP yedek oluşturulamadı.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$zipPath = (string)$built['zip_path'];
medisaFullBackupRegisterCleanup($zipPath);
$manifest = $built['manifest'];
$filename = 'medisa_yedek_' . date('Y-m-d_H-i-s') . '.zip';
@medisaFullBackupWriteLastMeta($manifest, $filename);

header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Content-Length: ' . (string)filesize($zipPath));
header('X-Content-Type-Options: nosniff');

$fp = fopen($zipPath, 'rb');
if ($fp === false) {
    medisaFullBackupCleanupAndForget([$zipPath]);
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'message' => 'ZIP okunamadı.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

while (!feof($fp)) {
    $chunk = fread($fp, 8192);
    if ($chunk === false) {
        break;
    }
    echo $chunk;
}
fclose($fp);
medisaFullBackupCleanupAndForget([$zipPath]);
exit;
