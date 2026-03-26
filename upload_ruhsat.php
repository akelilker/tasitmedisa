<?php
require_once __DIR__ . '/core.php';
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    exit;
}

$vehicleId = trim((string)($_POST['vehicleId'] ?? ''));
$vehicleVersion = isset($_POST['vehicleVersion']) ? (int)$_POST['vehicleVersion'] : null;
if ($vehicleId === '') {
    http_response_code(400);
    echo json_encode(['error' => 'vehicleId gerekli']);
    exit;
}

if ($vehicleVersion === null || $vehicleVersion <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'vehicleVersion gerekli']);
    exit;
}

if (!isset($_FILES['ruhsat']) || $_FILES['ruhsat']['error'] !== UPLOAD_ERR_OK) {
    $err = $_FILES['ruhsat']['error'] ?? -1;
    $msg = $err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE ? 'Dosya çok büyük (max 5MB)' : 'Dosya yüklenemedi';
    http_response_code(400);
    echo json_encode(['error' => $msg]);
    exit;
}

$file = $_FILES['ruhsat'];
$maxSize = 5 * 1024 * 1024;
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

$handle = fopen($file['tmp_name'], 'rb');
$header = $handle ? fread($handle, 1024) : '';
if ($handle) {
    fclose($handle);
}

if (strpos($header, '%PDF') === false) {
    http_response_code(400);
    echo json_encode(['error' => 'Geçersiz PDF dosyası']);
    exit;
}

$safeId = preg_replace('/[^a-zA-Z0-9_-]/', '', $vehicleId);
if ($safeId === '') {
    $safeId = 'vehicle_' . (preg_replace('/\D/', '', $vehicleId) ?: 'unknown');
}

$plate = strtoupper(preg_replace('/[^A-Z0-9]/', '', (string)($_POST['plaka'] ?? '')));
if ($plate === '') {
    $tmpData = loadData();
    if (is_array($tmpData) && isset($tmpData['tasitlar']) && is_array($tmpData['tasitlar'])) {
        foreach ($tmpData['tasitlar'] as $vehicle) {
            if ((string)($vehicle['id'] ?? '') === (string)$vehicleId) {
                $plate = strtoupper(preg_replace('/[^A-Z0-9]/', '', (string)($vehicle['plate'] ?? '')));
                break;
            }
        }
    }
}
if ($plate === '') {
    $plate = strtoupper($safeId);
}

$filename = $plate . '_' . time() . '.pdf';
$ruhsatDir = __DIR__ . '/data/ruhsat';
if (!is_dir($ruhsatDir)) {
    @mkdir($ruhsatDir, 0755, true);
}

$targetPath = $ruhsatDir . '/' . $filename;
if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
    http_response_code(500);
    echo json_encode(['error' => 'Dosya kaydedilemedi']);
    exit;
}

$legacyTargetPath = $ruhsatDir . '/' . $safeId . '.pdf';
if ($legacyTargetPath !== $targetPath) {
    @copy($targetPath, $legacyTargetPath);
}

$previewPath = __DIR__ . '/data/ruhsat_preview/' . $safeId . '.jpg';
if (is_file($previewPath)) {
    @unlink($previewPath);
}

$ruhsatPath = 'ruhsat/' . $filename;
$result = medisaMutateData(function (&$data) use ($vehicleId, $vehicleVersion, $ruhsatPath) {
    $vehicleIndex = medisaFindVehicleIndex($data, $vehicleId);
    if ($vehicleIndex < 0) {
        return medisaBuildErrorResult('Taşıt bulunamadı!', 404);
    }

    $vehicle = &$data['tasitlar'][$vehicleIndex];
    $versionCheck = medisaEnsureVehicleVersion($vehicle, $vehicleVersion, 'Bu araç başka biri tarafından güncellendi. Güncel veriler yüklendi.');
    if ($versionCheck !== true) {
        return $versionCheck;
    }

    $vehicle['ruhsatPath'] = $ruhsatPath;
    $newVehicleVersion = medisaBumpVehicleVersion($vehicle);

    return [
        'success' => true,
        'ruhsatPath' => $ruhsatPath,
        'vehicleId' => (string)$vehicleId,
        'vehicleVersion' => $newVehicleVersion,
        'vehicleVersions' => [[
            'id' => (string)$vehicleId,
            'version' => $newVehicleVersion,
        ]],
    ];
});

if (($result['success'] ?? false) !== true) {
    @unlink($targetPath);
    if ($legacyTargetPath !== $targetPath && is_file($legacyTargetPath)) {
        @unlink($legacyTargetPath);
    }
}

$status = (int)($result['status'] ?? ($result['conflict'] ?? false ? 409 : 200));
if ($status !== 200) {
    http_response_code($status);
}
unset($result['status']);

if (($result['success'] ?? false) !== true) {
    $message = $result['message'] ?? $result['error'] ?? 'Veri kaydedilemedi';
    echo json_encode([
        'success' => false,
        'conflict' => !empty($result['conflict']),
        'error' => $message,
        'message' => $message,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode($result, JSON_UNESCAPED_UNICODE);
