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

$contentLength = isset($_SERVER['CONTENT_LENGTH']) ? (int)$_SERVER['CONTENT_LENGTH'] : 0;
$uploadLimitCheck = medisaValidateVehicleDocumentHttpUploadLimits($contentLength, $_POST, $_FILES, ['document', 'ruhsat']);
if (($uploadLimitCheck['ok'] ?? false) !== true) {
    http_response_code((int)($uploadLimitCheck['status'] ?? 400));
    echo json_encode(['error' => $uploadLimitCheck['error'] ?? 'Yükleme başarısız'], JSON_UNESCAPED_UNICODE);
    exit;
}

function medisaUploadRequestValue($key, $default = '', $fallbackWhenPostEmpty = false) {
    if (array_key_exists($key, $_POST)) {
        $value = $_POST[$key];
        if (!$fallbackWhenPostEmpty || trim((string)$value) !== '') {
            return $value;
        }
    }
    if (array_key_exists($key, $_GET)) {
        return $_GET[$key];
    }
    return $default;
}

function medisaUploadRequestHas($key) {
    return array_key_exists($key, $_POST) || array_key_exists($key, $_GET);
}

$documentType = strtolower(trim((string)medisaUploadRequestValue('documentType', 'ruhsat', true)));
$config = medisaGetVehicleDocumentConfig($documentType);
if (!$config) {
    http_response_code(400);
    echo json_encode(['error' => 'Geçersiz belge tipi'], JSON_UNESCAPED_UNICODE);
    exit;
}
$isSettingsDocument = !empty($config['settingsKey']);
$requestedBranchId = trim((string)medisaUploadRequestValue('branchId', '', true));

$vehicleId = trim((string)medisaUploadRequestValue('vehicleId', '', true));
$vehicleVersionRaw = medisaUploadRequestValue('vehicleVersion', null, true);
$vehicleVersion = $vehicleVersionRaw !== null && $vehicleVersionRaw !== '' ? (int)$vehicleVersionRaw : null;
if (!$isSettingsDocument && $vehicleId === '') {
    http_response_code(400);
    echo json_encode(['error' => 'vehicleId gerekli'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!$isSettingsDocument && ($vehicleVersion === null || $vehicleVersion <= 0)) {
    http_response_code(400);
    echo json_encode(['error' => 'vehicleVersion gerekli'], JSON_UNESCAPED_UNICODE);
    exit;
}

$tasitKartiK2ExpiryDate = '';

$hasClientDocumentPath = medisaUploadRequestHas('documentPathBefore');
$clientDocumentPath = $hasClientDocumentPath ? (string)medisaUploadRequestValue('documentPathBefore', '') : '';
$hasClientTasitKartiSyncDate = medisaUploadRequestHas('tasitKartiExpiryDateBefore');
$clientTasitKartiSyncDate = $hasClientTasitKartiSyncDate
    ? medisaNormalizeUploadDocumentDateToIso(medisaUploadRequestValue('tasitKartiExpiryDateBefore', '', true))
    : '';

$documentOperationDateRaw = trim((string)medisaUploadRequestValue('documentOperationDate', '', true));
$documentOperationDate = $documentOperationDateRaw !== ''
    ? medisaNormalizeUploadDocumentDateToIso($documentOperationDateRaw)
    : '';

if ($documentOperationDateRaw !== '' && $documentOperationDate === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Geçersiz işlem tarihi'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($documentOperationDate !== '' && !in_array($documentType, ['sigorta', 'kasko', 'takograf'], true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Bu belge tipi için işlem tarihi gönderilemez'], JSON_UNESCAPED_UNICODE);
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
        'message' => $auth['message'] ?? 'Bu işlem için yetkiniz yok.',
        'error' => $auth['message'] ?? 'Bu işlem için yetkiniz yok.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
$context = $auth['context'];

$preVehicle = null;
if (!$isSettingsDocument) {
    $preVehicleIndex = medisaFindVehicleIndex($preloadData, $vehicleId);
    if ($preVehicleIndex < 0) {
        http_response_code(404);
        echo json_encode(['error' => 'Taşıt bulunamadı'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $preVehicle = $preloadData['tasitlar'][$preVehicleIndex];
    if (!medisaCanManageVehicleRecord($preVehicle, $context)) {
        http_response_code(403);
        echo json_encode(['error' => 'Bu taşıtı güncelleme yetkiniz yok.'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($documentType === 'tasit_karti') {
        if (!medisaUploadVehicleNeedsK2($preVehicle)) {
            http_response_code(400);
            echo json_encode(['error' => 'Bu taşıt tipi için Taşıt Kartı yüklenemez.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $tasitKartiK2ExpiryDate = medisaNormalizeUploadDocumentDateToIso(
            medisaResolveK2BelgeGroupForVehicle($preloadData, $preVehicle)['expiryDate'] ?? ''
        );
        if ($tasitKartiK2ExpiryDate === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Taşıt Kartı yüklemek için önce K2 Belgesi Geçerlilik Süresi kaydedilmelidir.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }
    if ($documentType === 'takograf' && !medisaUploadVehicleNeedsTakograf($preVehicle)) {
        http_response_code(400);
        echo json_encode(['error' => 'Bu taşıt tipi için Takograf Belgesi yüklenemez.'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($documentType === 'satis_sozlesmesi') {
        if (!medisaVehicleAllowsSatisSozlesmesi($preVehicle)) {
            http_response_code(403);
            echo json_encode(['error' => 'Satış Sözleşmesi yalnızca stoktan düşen (satış veya pert) taşıtlara yüklenebilir.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }
} elseif ($documentType === 'k2') {
    $k2Group = medisaFindK2BelgeGroupByBranchId($preloadData, $requestedBranchId);
    if ($requestedBranchId === '' || !medisaCanAccessK2BelgeBranch($requestedBranchId, $context)) {
        http_response_code(403);
        echo json_encode(['error' => 'Bu şube için K2 yükleme yetkiniz yok.'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($k2Group && !medisaCanAccessK2BelgeGroup($k2Group, $context)) {
        http_response_code(403);
        echo json_encode(['error' => 'Bu K2 grubu için yetkiniz yok.'], JSON_UNESCAPED_UNICODE);
        exit;
    }
} elseif (($context['role'] ?? '') !== 'genel_yonetici') {
    http_response_code(403);
    echo json_encode(['error' => 'Bu belgeyi güncelleme yetkiniz yok.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$fileResolution = medisaResolveVehicleDocumentUploadedFile($_FILES, ['document', 'ruhsat'], $contentLength);
if (($fileResolution['ok'] ?? false) !== true) {
    http_response_code((int)($fileResolution['status'] ?? 400));
    echo json_encode(['error' => $fileResolution['error'] ?? 'Dosya yüklenemedi'], JSON_UNESCAPED_UNICODE);
    exit;
}
$file = $fileResolution['file'];

$k2GroupForUpload = $documentType === 'k2' ? medisaFindK2BelgeGroupByBranchId($preloadData, $requestedBranchId) : null;
$plate = strtoupper(preg_replace('/[^A-Z0-9]/', '', (string)medisaUploadRequestValue('plaka', '')));
if ($plate === '') {
    $plate = $isSettingsDocument
        ? strtoupper((string)($config['fallbackName'] ?? $documentType))
        : strtoupper(preg_replace('/[^A-Z0-9]/', '', (string)($preVehicle['plate'] ?? $preVehicle['plaka'] ?? '')));
}

$persistResult = medisaPersistVehicleDocumentPdfFile($file, $documentType, $config, [
    'vehicleId' => $vehicleId,
    'branchId' => $requestedBranchId,
    'k2Group' => $k2GroupForUpload,
    'plate' => $plate,
    'vehiclePlate' => is_array($preVehicle) ? (string)($preVehicle['plate'] ?? $preVehicle['plaka'] ?? '') : '',
]);
if (($persistResult['ok'] ?? false) !== true) {
    http_response_code((int)($persistResult['status'] ?? 500));
    echo json_encode(['error' => $persistResult['error'] ?? 'Dosya kaydedilemedi'], JSON_UNESCAPED_UNICODE);
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
    'isSettingsDocument' => $isSettingsDocument,
    'branchId' => $requestedBranchId,
    'tasitKartiK2ExpiryDate' => $tasitKartiK2ExpiryDate,
    'clientDocumentPath' => $clientDocumentPath,
    'hasClientDocumentPath' => $hasClientDocumentPath,
    'clientTasitKartiSyncDate' => $clientTasitKartiSyncDate,
    'hasClientTasitKartiSyncDate' => $hasClientTasitKartiSyncDate,
    'documentOperationDate' => $documentOperationDate,
];
$result = medisaMutateData(function (&$data) use ($mutationParams) {
    return medisaApplyVehicleDocumentUploadMutation($data, $mutationParams, function (array &$data) {
        $auth = medisaResolveAuthorizedContext($data, 'view_main_app');
        if (($auth['success'] ?? false) !== true) {
            return medisaBuildErrorResult($auth['message'] ?? 'Bu işlem için yetkiniz yok.', (int)($auth['status'] ?? 403));
        }
        return ['success' => true, 'context' => $auth['context']];
    });
});

if (($result['success'] ?? false) === true) {
    medisaFinalizeVehicleDocumentUploadFilesystem($documentType, $persistResult);
    $result['documentType'] = $documentType;
    $result['documentPath'] = $documentPath;
    $result['ruhsatPath'] = $documentType === 'ruhsat' ? $documentPath : null;
    if ($documentType === 'tasit_karti') {
        $result['tasitKartiExpiryDate'] = $result['tasitKartiExpiryDate'] ?? $tasitKartiK2ExpiryDate;
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
