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

// Manuel ZIP metadata'sı ile otomatik veri yedeklerini aynı zaman ekseninde değerlendir.
$candidates = [];
$manualMeta = medisaFullBackupReadLastMeta();
if (($manualCandidate = medisaBuildManualBackupMetadataCandidate($manualMeta)) !== null) {
    $candidates[] = $manualCandidate;
}

$mainBackup = getMainBackupFilePath();
if (($mainCandidate = medisaBuildAutomaticBackupMetadataCandidate($mainBackup, 'main_backup')) !== null) {
    $candidates[] = $mainCandidate;
}

$latestSnapshot = findLatestSnapshotPath();
if (($snapshotCandidate = medisaBuildAutomaticBackupMetadataCandidate($latestSnapshot, 'latest_snapshot')) !== null) {
    $candidates[] = $snapshotCandidate;
}

$selected = medisaSelectLatestBackupMetadataCandidate($candidates);

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

echo json_encode([
    'success' => true,
    'available' => true,
    'restore_enabled' => false,
    'source' => $selected['source'],
    'source_label' => $selected['source_label'],
    'modified_at' => $selected['modified_at'],
    'size_bytes' => $selected['size_bytes'],
    'file_count' => $selected['file_count'],
    'message' => $selected['message'],
], JSON_UNESCAPED_UNICODE);
