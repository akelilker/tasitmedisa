<?php
/**
 * Ruhsat (araç tescil belgesi) PDF yükleme
 * POST: vehicleId, file (multipart)
 */
require_once __DIR__ . '/core.php';
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    exit;
}

$vehicleId = trim($_POST['vehicleId'] ?? '');
if (empty($vehicleId)) {
    http_response_code(400);
    echo json_encode(['error' => 'vehicleId gerekli']);
    exit;
}

// Dosya kontrolü
if (!isset($_FILES['ruhsat']) || $_FILES['ruhsat']['error'] !== UPLOAD_ERR_OK) {
    $err = $_FILES['ruhsat']['error'] ?? -1;
    $msg = $err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE ? 'Dosya çok büyük (max 5MB)' : 'Dosya yüklenemedi';
    http_response_code(400);
    echo json_encode(['error' => $msg]);
    exit;
}

$file = $_FILES['ruhsat'];
$maxSize = 5 * 1024 * 1024; // 5MB
if ($file['size'] > $maxSize) {
    http_response_code(400);
    echo json_encode(['error' => 'Dosya en fazla 5MB olabilir']);
    exit;
}

$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

$originalName = $file['name'] ?? '';
$extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

$allowedMimes = [
    'application/pdf',
    'application/x-pdf',
    'application/acrobat',
    'applications/vnd.pdf',
    'text/pdf',
    'text/x-pdf',
    'binary/octet-stream',
    'application/octet-stream'
];

$handle = fopen($file['tmp_name'], 'rb');
$fileHeader = $handle ? fread($handle, 5) : '';
if ($handle) {
    fclose($handle);
}

$isPdfHeader = ($fileHeader === '%PDF-');
$isPdfMime = in_array($mime, $allowedMimes, true);
$isPdfExtension = ($extension === 'pdf');

if (!$isPdfExtension || (!$isPdfMime && !$isPdfHeader)) {
    http_response_code(400);
    echo json_encode(['error' => 'Sadece PDF dosyası kabul edilir']);
    exit;
}

// Güvenli dosya adı (sadece vehicleId)
$safeId = preg_replace('/[^a-zA-Z0-9_-]/', '', $vehicleId);
if (empty($safeId)) {
    $safeId = 'vehicle_' . preg_replace('/\D/', '', $vehicleId) ?: 'unknown';
}

$ruhsatDir = __DIR__ . '/data/ruhsat';
if (!is_dir($ruhsatDir)) {
    mkdir($ruhsatDir, 0755, true);
}

$targetPath = $ruhsatDir . '/' . $safeId . '.pdf';
if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
    http_response_code(500);
    echo json_encode(['error' => 'Dosya kaydedilemedi']);
    exit;
}

$ruhsatPath = 'ruhsat/' . $safeId . '.pdf';

// data.json güncelle
$data = loadData();
if (!$data || !isset($data['tasitlar'])) {
    echo json_encode(['success' => true, 'ruhsatPath' => $ruhsatPath]);
    exit;
}

$found = false;
foreach ($data['tasitlar'] as $i => $v) {
    if (isset($v['id']) && (string)$v['id'] === (string)$vehicleId) {
        $data['tasitlar'][$i]['ruhsatPath'] = $ruhsatPath;
        $found = true;
        break;
    }
}

if ($found && !saveData($data)) {
    http_response_code(500);
    echo json_encode(['error' => 'Veri kaydedilemedi']);
    exit;
}

echo json_encode(['success' => true, 'ruhsatPath' => $ruhsatPath], JSON_UNESCAPED_UNICODE);
