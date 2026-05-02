<?php
require_once __DIR__ . '/core.php';
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$documentType = strtolower(trim((string)($_POST['documentType'] ?? 'ruhsat')));
$config = medisaGetVehicleDocumentConfig($documentType);
if (!$config) {
    http_response_code(400);
    echo json_encode(['error' => 'Gecersiz belge tipi'], JSON_UNESCAPED_UNICODE);
    exit;
}

$vehicleId = trim((string)($_POST['vehicleId'] ?? ''));
$vehicleVersion = isset($_POST['vehicleVersion']) ? (int)$_POST['vehicleVersion'] : null;
if ($vehicleId === '') {
    http_response_code(400);
    echo json_encode(['error' => 'vehicleId gerekli'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($vehicleVersion === null || $vehicleVersion <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'vehicleVersion gerekli'], JSON_UNESCAPED_UNICODE);
    exit;
}

$preloadData = loadData();
if (!is_array($preloadData)) {
    $preloadData = medisaDefaultData();
}

$auth = medisaResolveAuthorizedContext($preloadData, 'view_main_app');
if (($auth['success'] ?? false) !== true) {
    http_response_code((int)($auth['status'] ?? 403));
    echo json_encode([
        'success' => false,
        'auth_required' => (int)($auth['status'] ?? 403) === 401,
        'message' => $auth['message'] ?? 'Bu islem icin yetkiniz yok.',
        'error' => $auth['message'] ?? 'Bu islem icin yetkiniz yok.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
$context = $auth['context'];

$preVehicleIndex = medisaFindVehicleIndex($preloadData, $vehicleId);
if ($preVehicleIndex < 0) {
    http_response_code(404);
    echo json_encode(['error' => 'Tasit bulunamadi'], JSON_UNESCAPED_UNICODE);
    exit;
}

$preVehicle = $preloadData['tasitlar'][$preVehicleIndex];
if (!medisaCanManageVehicleRecord($preVehicle, $context)) {
    http_response_code(403);
    echo json_encode(['error' => 'Bu tasiti guncelleme yetkiniz yok.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$fileKey = isset($_FILES['document']) ? 'document' : 'ruhsat';

if (!isset($_FILES[$fileKey]) || $_FILES[$fileKey]['error'] !== UPLOAD_ERR_OK) {
    $err = $_FILES[$fileKey]['error'] ?? -1;
    $msg = ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE)
        ? 'Dosya boyutu tarayıcı veya sunucu limitini aşıyor. Mobilde limit genelde daha düşüktür; daha küçük bir PDF deneyin veya masaüstünden yükleyin.'
        : 'Dosya yüklenemedi';
    http_response_code(400);
    echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

$file = $_FILES[$fileKey];

$handle = fopen($file['tmp_name'], 'rb');
$header = $handle ? fread($handle, 1024) : '';
if ($handle) {
    fclose($handle);
}

if (strpos((string)$header, '%PDF') === false) {
    http_response_code(400);
    echo json_encode(['error' => 'Gecersiz PDF dosyasi'], JSON_UNESCAPED_UNICODE);
    exit;
}

$safeId = preg_replace('/[^a-zA-Z0-9_-]/', '', $vehicleId);
if ($safeId === '') {
    $safeId = 'vehicle_' . (preg_replace('/\D/', '', $vehicleId) ?: 'unknown');
}

$plate = strtoupper(preg_replace('/[^A-Z0-9]/', '', (string)($_POST['plaka'] ?? '')));
if ($plate === '') {
    $plate = strtoupper(preg_replace('/[^A-Z0-9]/', '', (string)($preVehicle['plate'] ?? $preVehicle['plaka'] ?? '')));
}
if ($plate === '') {
    $plate = strtoupper($safeId);
}

$filename = $plate . '_' . $documentType . '_' . time() . '.pdf';
$dataDir = __DIR__ . '/data/' . $config['dir'];
if (!is_dir($dataDir)) {
    @mkdir($dataDir, 0755, true);
}

$targetPath = $dataDir . '/' . $filename;
if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
    http_response_code(500);
    echo json_encode(['error' => 'Dosya kaydedilemedi'], JSON_UNESCAPED_UNICODE);
    exit;
}

$legacyTargetPath = $dataDir . '/' . $safeId . '.pdf';
if ($legacyTargetPath !== $targetPath) {
    @copy($targetPath, $legacyTargetPath);
}

$previewDir = __DIR__ . '/data/' . $config['dir'] . '_preview';
$previewPath = $previewDir . '/' . $safeId . '.jpg';
if (is_file($previewPath)) {
    @unlink($previewPath);
}

$documentPath = $config['dir'] . '/' . $filename;
$result = medisaMutateData(function (&$data) use ($vehicleId, $vehicleVersion, $documentPath, $config) {
    $auth = medisaResolveAuthorizedContext($data, 'view_main_app');
    if (($auth['success'] ?? false) !== true) {
        return medisaBuildErrorResult($auth['message'] ?? 'Bu islem icin yetkiniz yok.', (int)($auth['status'] ?? 403));
    }
    $context = $auth['context'];

    $vehicleIndex = medisaFindVehicleIndex($data, $vehicleId);
    if ($vehicleIndex < 0) {
        return medisaBuildErrorResult('Tasit bulunamadi!', 404);
    }

    $vehicle = &$data['tasitlar'][$vehicleIndex];
    if (!medisaCanManageVehicleRecord($vehicle, $context)) {
        return medisaBuildErrorResult('Bu tasiti guncelleme yetkiniz yok.', 403);
    }

    $versionCheck = medisaEnsureVehicleVersion($vehicle, $vehicleVersion, 'Bu arac baska biri tarafindan guncellendi. Guncel veriler yuklendi.');
    if ($versionCheck !== true) {
        return $versionCheck;
    }

    $vehicle[$config['pathField']] = $documentPath;
    $newVehicleVersion = medisaBumpVehicleVersion($vehicle);

    $payload = [
        'success' => true,
        'vehicleId' => (string)$vehicleId,
        'vehicleVersion' => $newVehicleVersion,
        'vehicleVersions' => [[
            'id' => (string)$vehicleId,
            'version' => $newVehicleVersion,
        ]],
    ];
    if ($config['pathField'] === 'ruhsatPath') {
        $payload['ruhsatPath'] = $documentPath;
    }
    return $payload;
});

if (($result['success'] ?? false) === true) {
    $result['documentType'] = $documentType;
    $result['documentPath'] = $documentPath;
    $result['ruhsatPath'] = $documentType === 'ruhsat' ? $documentPath : null;
}

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
        'auth_required' => $status === 401,
        'error' => $message,
        'message' => $message,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode($result, JSON_UNESCAPED_UNICODE);
