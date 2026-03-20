<?php
require_once __DIR__ . '/core.php';
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

$dataFile = getDataFilePath();
$dataDir = dirname($dataFile);
$backupFile = getMainBackupFilePath();
$sourceTag = 'data.json.backup';

if (!file_exists($backupFile)) {
    $fallback = findLatestSnapshotPath();
    if ($fallback !== null && is_readable($fallback)) {
        $backupFile = $fallback;
        $sourceTag = basename($fallback);
    }
}

if (!file_exists($backupFile)) {
    http_response_code(404);
    echo json_encode(['error' => 'Son yedek bulunamadi.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$content = file_get_contents($backupFile);
if ($content === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Yedek dosyasi okunamadi.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$data = json_decode($content, true);
if (!is_array($data)) {
    http_response_code(500);
    echo json_encode(['error' => 'Yedek dosya formati gecersiz.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$data['_backup_source'] = $sourceTag;
$data['_backup_file_mtime'] = date('c', filemtime($backupFile));

echo json_encode($data, JSON_UNESCAPED_UNICODE);
?>
