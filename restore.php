<?php
require_once __DIR__ . '/core.php';
header('Content-Type: application/json; charset=utf-8');
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
    echo json_encode([
        'success' => false,
        'message' => 'Bu endpoint yalnız yedek bilgisini görüntüler.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$currentData = loadData();
if (!is_array($currentData)) {
    $currentData = medisaDefaultData();
}

$auth = medisaResolveAuthorizedContext($currentData, 'manage_backups');
if (($auth['success'] ?? false) !== true) {
    http_response_code((int)($auth['status'] ?? 403));
    echo json_encode([
        'success' => false,
        'auth_required' => (int)($auth['status'] ?? 403) === 401,
        'message' => $auth['message'] ?? 'Bu işlem için yetkiniz yok.',
        'error' => $auth['message'] ?? 'Bu işlem için yetkiniz yok.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$backupFile = getMainBackupFilePath();
$sourceTag = 'main_backup';

if (!file_exists($backupFile)) {
    $fallback = findLatestSnapshotPath();
    if ($fallback !== null && is_readable($fallback)) {
        $backupFile = $fallback;
        $sourceTag = 'latest_snapshot';
    }
}

if (!file_exists($backupFile)) {
    http_response_code(404);
    echo json_encode([
        'success' => false,
        'available' => false,
        'restore_enabled' => false,
        'message' => 'Son yedek bulunamadı.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$modifiedAt = filemtime($backupFile);
$sizeBytes = filesize($backupFile);
echo json_encode([
    'success' => true,
    'available' => true,
    'restore_enabled' => false,
    'source' => $sourceTag,
    'modified_at' => $modifiedAt !== false ? date('c', $modifiedAt) : null,
    'size_bytes' => $sizeBytes !== false ? (int)$sizeBytes : null,
    'message' => 'Güvenli geri yükleme özelliği henüz aktif değil.',
], JSON_UNESCAPED_UNICODE);
