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
    echo json_encode(['error' => 'Geçersiz belge tipi'], JSON_UNESCAPED_UNICODE);
    exit;
}
$isSettingsDocument = !empty($config['settingsKey']);

function medisaNormalizeUploadDocumentDateToIso($rawDate) {
    $value = trim((string)$rawDate);
    if ($value === '') {
        return '';
    }
    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $value, $m)) {
        return checkdate((int)$m[2], (int)$m[3], (int)$m[1]) ? sprintf('%04d-%02d-%02d', (int)$m[1], (int)$m[2], (int)$m[3]) : '';
    }
    if (preg_match('/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/', $value, $m)) {
        return checkdate((int)$m[2], (int)$m[1], (int)$m[3]) ? sprintf('%04d-%02d-%02d', (int)$m[3], (int)$m[2], (int)$m[1]) : '';
    }
    if (preg_match('/^(\d{2})(\d{2})(\d{4})$/', $value, $m)) {
        return checkdate((int)$m[2], (int)$m[1], (int)$m[3]) ? sprintf('%04d-%02d-%02d', (int)$m[3], (int)$m[2], (int)$m[1]) : '';
    }
    return '';
}

function medisaUploadAddYears($dateStr, $years) {
    $value = trim((string)$dateStr);
    if ($value === '') {
        return '';
    }
    try {
        $dt = new DateTime($value);
        $dt->modify('+' . (int)$years . ' years');
        return $dt->format('Y-m-d');
    } catch (Exception $e) {
        return '';
    }
}

function medisaNormalizeUploadDocumentPath($path) {
    $normalized = ltrim(str_replace('\\', '/', trim((string)$path)), '/');
    if (strpos($normalized, 'data/') === 0) {
        $normalized = substr($normalized, 5);
    }
    return $normalized;
}

function medisaUploadVehicleNeedsK2($vehicle) {
    if (!is_array($vehicle)) {
        return false;
    }
    $typeKey = strtolower(trim((string)($vehicle['vehicleType'] ?? $vehicle['tip'] ?? '')));
    return in_array($typeKey, ['minivan', 'kamyon', 'romork'], true);
}

function medisaUploadVehicleNeedsTakograf($vehicle) {
    if (!is_array($vehicle)) {
        return false;
    }
    $typeKey = strtolower(trim((string)($vehicle['vehicleType'] ?? $vehicle['tip'] ?? '')));
    return $typeKey === 'kamyon';
}

function medisaUploadDocumentHistoryMeta($documentType) {
    $type = strtolower(trim((string)$documentType));
    $map = [
        'ruhsat' => ['eventType' => 'ruhsat-yukle', 'label' => 'Ruhsat Belgesi'],
        'sigorta' => ['eventType' => 'sigorta-policesi-yukle', 'label' => 'Sigorta Poliçesi'],
        'kasko' => ['eventType' => 'kasko-policesi-yukle', 'label' => 'Kasko Poliçesi'],
        'tasit_karti' => ['eventType' => 'tasit-karti-yukle', 'label' => 'Taşıt Kartı'],
        'takograf' => ['eventType' => 'takograf-belgesi-yukle', 'label' => 'Takograf Belgesi'],
    ];
    return $map[$type] ?? null;
}

function medisaUploadDocumentRecorderName($context) {
    $user = is_array($context['user'] ?? null) ? $context['user'] : [];
    $name = trim((string)($user['isim'] ?? $user['name'] ?? ''));
    if ($name !== '') {
        return $name;
    }
    return 'Yönetim';
}

function medisaBuildVehicleDocumentUploadEvent($documentType, $documentPath, $previousDocumentPath, $context, $extraData = []) {
    $meta = medisaUploadDocumentHistoryMeta($documentType);
    if (!$meta) {
        return null;
    }
    $now = date('c');
    $recorder = medisaUploadDocumentRecorderName($context);
    $eventData = [
        'belgeTipi' => $meta['label'],
        'documentType' => strtolower(trim((string)$documentType)),
        'documentPath' => (string)$documentPath,
        'fileName' => basename((string)$documentPath),
        'isReplacement' => trim((string)$previousDocumentPath) !== '',
        'previousDocumentPath' => (string)$previousDocumentPath,
        'surucu' => $recorder,
        'kaydeden' => $recorder,
    ];
    foreach ($extraData as $key => $value) {
        if ($value !== null && $value !== '') {
            $eventData[$key] = $value;
        }
    }
    return [
        'id' => 'doc_' . str_replace('.', '', sprintf('%.6F', microtime(true))) . '_' . substr(sha1($documentType . '|' . $documentPath . '|' . $now), 0, 8),
        'type' => $meta['eventType'],
        'date' => date('Y-m-d'),
        'timestamp' => $now,
        'data' => $eventData,
    ];
}

function medisaCanMergeVehicleDocumentUpload($vehicle, $config, $documentType, $clientDocumentPath, $clientTasitKartiSyncDate, $hasClientDocumentPath, $hasClientTasitKartiSyncDate, $k2ExpiryDate = '') {
    if (!$hasClientDocumentPath || !is_array($vehicle) || !is_array($config)) {
        return false;
    }

    $pathField = (string)($config['pathField'] ?? '');
    if ($pathField === '') {
        return false;
    }

    $serverDocumentPath = medisaNormalizeUploadDocumentPath($vehicle[$pathField] ?? '');
    if ($serverDocumentPath !== medisaNormalizeUploadDocumentPath($clientDocumentPath)) {
        return false;
    }

    if ($documentType === 'tasit_karti') {
        if (!$hasClientTasitKartiSyncDate) {
            return false;
        }
        $k2SourceExpiryDate = medisaNormalizeUploadDocumentDateToIso($k2ExpiryDate);
        if ($k2SourceExpiryDate !== '') {
            if ($k2SourceExpiryDate === $clientTasitKartiSyncDate) {
                return true;
            }
        }
        $serverExpiryDate = medisaNormalizeUploadDocumentDateToIso($vehicle['tasitKartiExpiryDate'] ?? '');
        if ($serverExpiryDate !== $clientTasitKartiSyncDate) {
            return false;
        }
    }

    return true;
}

$vehicleId = trim((string)($_POST['vehicleId'] ?? ''));
$vehicleVersion = isset($_POST['vehicleVersion']) ? (int)$_POST['vehicleVersion'] : null;
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

$hasClientDocumentPath = array_key_exists('documentPathBefore', $_POST);
$clientDocumentPath = $hasClientDocumentPath ? (string)$_POST['documentPathBefore'] : '';
$hasClientTasitKartiSyncDate = array_key_exists('tasitKartiExpiryDateBefore', $_POST);
$clientTasitKartiSyncDate = $hasClientTasitKartiSyncDate
    ? medisaNormalizeUploadDocumentDateToIso($_POST['tasitKartiExpiryDateBefore'])
    : '';

$documentOperationDateRaw = trim((string)($_POST['documentOperationDate'] ?? ''));
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
        $tasitKartiK2ExpiryDate = medisaNormalizeUploadDocumentDateToIso($preloadData['ayarlar']['k2Belgesi']['expiryDate'] ?? '');
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
} elseif (($context['role'] ?? '') !== 'genel_yonetici') {
    http_response_code(403);
    echo json_encode(['error' => 'Bu belgeyi güncelleme yetkiniz yok.'], JSON_UNESCAPED_UNICODE);
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
    echo json_encode(['error' => 'Geçersiz PDF dosyası'], JSON_UNESCAPED_UNICODE);
    exit;
}

$safeId = $isSettingsDocument ? (string)($config['settingsKey'] ?? $documentType) : preg_replace('/[^a-zA-Z0-9_-]/', '', $vehicleId);
if ($safeId === '') {
    $safeId = 'vehicle_' . (preg_replace('/\D/', '', $vehicleId) ?: 'unknown');
}

$plate = strtoupper(preg_replace('/[^A-Z0-9]/', '', (string)($_POST['plaka'] ?? '')));
if ($plate === '') {
    $plate = $isSettingsDocument
        ? strtoupper((string)($config['fallbackName'] ?? $documentType))
        : strtoupper(preg_replace('/[^A-Z0-9]/', '', (string)($preVehicle['plate'] ?? $preVehicle['plaka'] ?? '')));
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
$result = medisaMutateData(function (&$data) use ($vehicleId, $vehicleVersion, $documentPath, $config, $isSettingsDocument, $documentType, $tasitKartiK2ExpiryDate, $clientDocumentPath, $clientTasitKartiSyncDate, $hasClientDocumentPath, $hasClientTasitKartiSyncDate, $documentOperationDate) {
    $auth = medisaResolveAuthorizedContext($data, 'view_main_app');
    if (($auth['success'] ?? false) !== true) {
        return medisaBuildErrorResult($auth['message'] ?? 'Bu işlem için yetkiniz yok.', (int)($auth['status'] ?? 403));
    }
    $context = $auth['context'];

    if ($isSettingsDocument) {
        if (($context['role'] ?? '') !== 'genel_yonetici') {
            return medisaBuildErrorResult('Bu belgeyi güncelleme yetkiniz yok.', 403);
        }
        if (!isset($data['ayarlar']) || !is_array($data['ayarlar'])) {
            $data['ayarlar'] = [];
        }
        $settingsKey = (string)($config['settingsKey'] ?? '');
        if ($settingsKey === '') {
            return medisaBuildErrorResult('Belge ayar anahtarı bulunamadı.', 500);
        }
        if (!isset($data['ayarlar'][$settingsKey]) || !is_array($data['ayarlar'][$settingsKey])) {
            $data['ayarlar'][$settingsKey] = [];
        }
        $settingsPathField = (string)($config['settingsPathField'] ?? 'documentPath');
        $data['ayarlar'][$settingsKey][$settingsPathField] = $documentPath;
        $data['ayarlar'][$settingsKey]['updatedAt'] = date('c');

        return [
            'success' => true,
            'settingsKey' => $settingsKey,
            'settingsDocument' => $data['ayarlar'][$settingsKey],
        ];
    }

    $vehicleIndex = medisaFindVehicleIndex($data, $vehicleId);
    if ($vehicleIndex < 0) {
        return medisaBuildErrorResult('Taşıt bulunamadı!', 404);
    }

    $vehicle = &$data['tasitlar'][$vehicleIndex];
    if (!medisaCanManageVehicleRecord($vehicle, $context)) {
        return medisaBuildErrorResult('Bu taşıtı güncelleme yetkiniz yok.', 403);
    }
    if ($documentType === 'tasit_karti' && !medisaUploadVehicleNeedsK2($vehicle)) {
        return medisaBuildErrorResult('Bu taşıt tipi için Taşıt Kartı yüklenemez.', 400);
    }
    if ($documentType === 'takograf' && !medisaUploadVehicleNeedsTakograf($vehicle)) {
        return medisaBuildErrorResult('Bu taşıt tipi için Takograf Belgesi yüklenemez.', 400);
    }

    $versionCheck = medisaEnsureVehicleVersion($vehicle, $vehicleVersion, 'Bu taşıt başka biri tarafından güncellendi. Güncel veriler yüklendi.');
    if ($versionCheck !== true) {
        if ($documentOperationDate !== '') {
            return $versionCheck;
        }
        $k2ExpiryDateForMerge = $documentType === 'tasit_karti'
            ? medisaNormalizeUploadDocumentDateToIso($data['ayarlar']['k2Belgesi']['expiryDate'] ?? '')
            : '';
        $canMergeDocumentUpload = medisaCanMergeVehicleDocumentUpload(
            $vehicle,
            $config,
            $documentType,
            $clientDocumentPath,
            $clientTasitKartiSyncDate,
            $hasClientDocumentPath,
            $hasClientTasitKartiSyncDate,
            $k2ExpiryDateForMerge
        );
        if (!$canMergeDocumentUpload) {
            return $versionCheck;
        }
    }

    $pathField = (string)($config['pathField'] ?? '');
    $previousDocumentPath = medisaNormalizeUploadDocumentPath($vehicle[$pathField] ?? '');
    $vehicle[$pathField] = $documentPath;
    $documentEventExtra = [];
    if ($documentType === 'tasit_karti') {
        $k2ExpiryDate = medisaNormalizeUploadDocumentDateToIso($data['ayarlar']['k2Belgesi']['expiryDate'] ?? '');
        if ($k2ExpiryDate === '') {
            return medisaBuildErrorResult('Taşıt Kartı yüklemek için önce K2 Belgesi Geçerlilik Süresi kaydedilmelidir.', 400);
        }
        $vehicle['tasitKartiExpiryDate'] = $k2ExpiryDate;
        $documentEventExtra['expiryDate'] = $k2ExpiryDate;
    } elseif ($documentOperationDate !== '') {
        if ($documentType === 'takograf') {
            $expiryDate = medisaUploadAddYears($documentOperationDate, 2);
            if ($expiryDate === '') {
                return medisaBuildErrorResult('Geçersiz işlem tarihi.', 400);
            }
            $vehicle['takografKalibrasyonDate'] = $documentOperationDate;
            $vehicle['takografExpiryDate'] = $expiryDate;
        } else {
            $expiryDate = medisaUploadAddYears($documentOperationDate, 1);
            if ($expiryDate === '') {
                return medisaBuildErrorResult('Geçersiz işlem tarihi.', 400);
            }
            if ($documentType === 'sigorta') {
                $vehicle['sigortaDate'] = $expiryDate;
            } elseif ($documentType === 'kasko') {
                $vehicle['kaskoDate'] = $expiryDate;
            }
        }
        $documentEventExtra['operationDate'] = $documentOperationDate;
        $documentEventExtra['expiryDate'] = $expiryDate;
    }
    $documentEvent = medisaBuildVehicleDocumentUploadEvent($documentType, $documentPath, $previousDocumentPath, $context, $documentEventExtra);
    if ($documentEvent) {
        if (!isset($vehicle['events']) || !is_array($vehicle['events'])) {
            $vehicle['events'] = [];
        }
        array_unshift($vehicle['events'], $documentEvent);
    }
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
    if ($documentType === 'tasit_karti') {
        $payload['tasitKartiExpiryDate'] = $vehicle['tasitKartiExpiryDate'];
    }
    if ($documentType === 'sigorta' && $documentOperationDate !== '') {
        $payload['sigortaDate'] = $vehicle['sigortaDate'] ?? '';
    }
    if ($documentType === 'kasko' && $documentOperationDate !== '') {
        $payload['kaskoDate'] = $vehicle['kaskoDate'] ?? '';
    }
    if ($documentType === 'takograf' && $documentOperationDate !== '') {
        $payload['takografKalibrasyonDate'] = $vehicle['takografKalibrasyonDate'] ?? '';
        $payload['takografExpiryDate'] = $vehicle['takografExpiryDate'] ?? '';
    }
    if ($documentEvent) {
        $payload['documentEvent'] = $documentEvent;
    }
    return $payload;
});

if (($result['success'] ?? false) === true) {
    $result['documentType'] = $documentType;
    $result['documentPath'] = $documentPath;
    $result['ruhsatPath'] = $documentType === 'ruhsat' ? $documentPath : null;
    if ($documentType === 'tasit_karti') {
        $result['tasitKartiExpiryDate'] = $result['tasitKartiExpiryDate'] ?? $tasitKartiK2ExpiryDate;
    }
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
