<?php
require_once __DIR__ . '/driver_common.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method Not Allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$tokenData = validateToken();
if (!$tokenData) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Oturumunuz sona erdi!'], JSON_UNESCAPED_UNICODE);
    exit;
}
medisaDriverRequireUsableSession($tokenData);

$contentLength = isset($_SERVER['CONTENT_LENGTH']) ? (int)$_SERVER['CONTENT_LENGTH'] : 0;
$uploadLimitCheck = medisaValidateVehicleDocumentHttpUploadLimits($contentLength, $_POST, $_FILES, ['document']);
if (($uploadLimitCheck['ok'] ?? false) !== true) {
    http_response_code((int)($uploadLimitCheck['status'] ?? 400));
    echo json_encode(['success' => false, 'error' => $uploadLimitCheck['error'] ?? 'Yükleme başarısız'], JSON_UNESCAPED_UNICODE);
    exit;
}

$documentType = strtolower(trim((string)($_POST['documentType'] ?? $_GET['documentType'] ?? '')));
if (!in_array($documentType, ['sigorta', 'kasko'], true)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Geçersiz belge tipi'], JSON_UNESCAPED_UNICODE);
    exit;
}

$config = medisaGetVehicleDocumentConfig($documentType);
if (!$config) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Geçersiz belge tipi'], JSON_UNESCAPED_UNICODE);
    exit;
}

$vehicleId = trim((string)($_POST['vehicleId'] ?? $_GET['vehicleId'] ?? ''));
$vehicleVersionRaw = $_POST['vehicleVersion'] ?? $_GET['vehicleVersion'] ?? null;
$vehicleVersion = $vehicleVersionRaw !== null && $vehicleVersionRaw !== '' ? (int)$vehicleVersionRaw : null;
if ($vehicleId === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'vehicleId gerekli'], JSON_UNESCAPED_UNICODE);
    exit;
}
if ($vehicleVersion === null || $vehicleVersion <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'vehicleVersion gerekli'], JSON_UNESCAPED_UNICODE);
    exit;
}

$preloadData = loadData();
if (!is_array($preloadData)) {
    $preloadData = medisaDefaultData();
}

$preVehicleIndex = medisaFindVehicleIndex($preloadData, $vehicleId);
if ($preVehicleIndex < 0) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Taşıt bulunamadı'], JSON_UNESCAPED_UNICODE);
    exit;
}
$preVehicle = $preloadData['tasitlar'][$preVehicleIndex];
$preloadUser = medisaFindUserById($preloadData, $tokenData['user_id'] ?? '');
if (!$preloadUser || !medisaDriverUserHasVehicleAccess($preVehicle, $preloadUser, $vehicleId)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Bu taşıta erişim yetkiniz yok!'], JSON_UNESCAPED_UNICODE);
    exit;
}

$fileResolution = medisaResolveVehicleDocumentUploadedFile($_FILES, ['document'], $contentLength);
if (($fileResolution['ok'] ?? false) !== true) {
    http_response_code((int)($fileResolution['status'] ?? 400));
    echo json_encode(['success' => false, 'error' => $fileResolution['error'] ?? 'Dosya yüklenemedi'], JSON_UNESCAPED_UNICODE);
    exit;
}
$file = $fileResolution['file'];

$plate = strtoupper(preg_replace('/[^A-Z0-9]/', '', (string)($preVehicle['plate'] ?? $preVehicle['plaka'] ?? '')));
$persistResult = medisaPersistVehicleDocumentPdfFile($file, $documentType, $config, [
    'vehicleId' => $vehicleId,
    'plate' => $plate,
    'vehiclePlate' => (string)($preVehicle['plate'] ?? $preVehicle['plaka'] ?? ''),
]);
if (($persistResult['ok'] ?? false) !== true) {
    http_response_code((int)($persistResult['status'] ?? 500));
    echo json_encode(['success' => false, 'error' => $persistResult['error'] ?? 'Dosya kaydedilemedi'], JSON_UNESCAPED_UNICODE);
    exit;
}

$documentPath = (string)$persistResult['documentPath'];
$targetPath = (string)$persistResult['targetPath'];
$mutationParams = [
    'documentType' => $documentType,
    'documentPath' => $documentPath,
    'vehicleId' => $vehicleId,
    'vehicleVersion' => $vehicleVersion,
    'config' => $config,
    'isSettingsDocument' => false,
    'skipManageVehicleCheck' => true,
    'requireDriverVehicleAccess' => true,
    'clientDocumentPath' => (string)($preVehicle[$config['pathField']] ?? ''),
    'hasClientDocumentPath' => true,
];
$result = medisaMutateData(function (&$data) use ($mutationParams, $tokenData) {
    return medisaApplyVehicleDocumentUploadMutation($data, $mutationParams, function (array &$data) use ($tokenData) {
        $sessionGuard = medisaDriverResolveContextResult($data, $tokenData);
        if (($sessionGuard['success'] ?? false) !== true) {
            return $sessionGuard;
        }
        $user = medisaFindUserById($data, $tokenData['user_id'] ?? '');
        if (!$user) {
            return medisaBuildErrorResult('Kullanıcı bulunamadı!', 403);
        }
        return [
            'success' => true,
            'context' => $sessionGuard['context'],
            'user' => $user,
        ];
    });
});

if (($result['success'] ?? false) === true) {
    medisaFinalizeVehicleDocumentUploadFilesystem($documentType, $persistResult);
    $pathField = (string)($config['pathField'] ?? '');
    $result['documentType'] = $documentType;
    $result['documentPath'] = $documentPath;
    if ($pathField !== '') {
        $result[$pathField] = $documentPath;
    }
}

if (($result['success'] ?? false) !== true) {
    @unlink($targetPath);
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
