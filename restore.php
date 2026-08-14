<?php
require_once __DIR__ . '/core.php';
require_once __DIR__ . '/full_backup.php';
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

// Öncelik: son manuel tam (ZIP) yedek meta
$manualMeta = medisaFullBackupReadLastMeta();
if (is_array($manualMeta) && !empty($manualMeta['created_at'])) {
    echo json_encode([
        'success' => true,
        'available' => true,
        'restore_enabled' => false,
        'source' => 'manual_full_backup',
        'source_label' => 'Manuel tam yedek',
        'modified_at' => $manualMeta['created_at'],
        'size_bytes' => isset($manualMeta['total_bytes']) ? (int)$manualMeta['total_bytes'] : null,
        'file_count' => isset($manualMeta['file_count']) ? (int)$manualMeta['file_count'] : null,
        'message' => 'Son oluşturulan manuel tam yedek bilgisi.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$candidates = [];
$mainBackup = getMainBackupFilePath();
if (is_string($mainBackup) && $mainBackup !== '' && file_exists($mainBackup) && is_readable($mainBackup)) {
    $mtime = filemtime($mainBackup);
    if ($mtime !== false) {
        $candidates[] = [
            'path' => $mainBackup,
            'source' => 'main_backup',
            'mtime' => (int)$mtime,
        ];
    }
}

$latestSnapshot = findLatestSnapshotPath();
if (
    is_string($latestSnapshot)
    && $latestSnapshot !== ''
    && file_exists($latestSnapshot)
    && is_readable($latestSnapshot)
) {
    $mtime = filemtime($latestSnapshot);
    if ($mtime !== false) {
        $candidates[] = [
            'path' => $latestSnapshot,
            'source' => 'latest_snapshot',
            'mtime' => (int)$mtime,
        ];
    }
}

$selected = null;
foreach ($candidates as $candidate) {
    if ($selected === null || $candidate['mtime'] > $selected['mtime']) {
        $selected = $candidate;
    }
}

if ($selected === null) {
    http_response_code(404);
    echo json_encode([
        'success' => false,
        'available' => false,
        'restore_enabled' => false,
        'message' => 'Son yedek bulunamadı.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$backupFile = $selected['path'];
$sourceTag = $selected['source'];
$modifiedAt = $selected['mtime'];
$sizeBytes = filesize($backupFile);

echo json_encode([
    'success' => true,
    'available' => true,
    'restore_enabled' => false,
    'source' => $sourceTag,
    'source_label' => 'Otomatik sunucu yedeği',
    'modified_at' => date('c', $modifiedAt),
    'size_bytes' => $sizeBytes !== false ? (int)$sizeBytes : null,
    'message' => 'Bu endpoint yalnız son yedek bilgisini gösterir; veri geri yüklemez. Güvenli sunucu geri yükleme varsayılan olarak kapalıdır.',
], JSON_UNESCAPED_UNICODE);
