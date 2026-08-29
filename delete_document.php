<?php
/**
 * Belge silme endpoint'i (yalnız POST).
 * Yetki kapsamı upload_ruhsat.php ile aynıdır: araç belgelerinde manage yetkisi,
 * K2 belgesinde şube/grup yetkisi zorunludur. Canonical metadata içindeki yalnız
 * ilgili belge path alanı temizlenir; tarih ve diğer iş verileri korunur.
 */
require_once __DIR__ . '/core.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

function medisaDocumentDeleteFail($status, $message, $extra = []) {
    http_response_code((int)$status);
    echo json_encode(array_merge([
        'success' => false,
        'conflict' => (int)$status === 409,
        'auth_required' => (int)$status === 401,
        'error' => $message,
        'message' => $message,
    ], is_array($extra) ? $extra : []), JSON_UNESCAPED_UNICODE);
    exit;
}

function medisaDocumentDeleteNormalizePath($path) {
    $normalized = ltrim(str_replace('\\', '/', trim((string)$path)), '/');
    if (strpos($normalized, 'data/') === 0) {
        $normalized = substr($normalized, 5);
    }
    return $normalized;
}

$raw = json_decode((string)file_get_contents('php://input'), true);
$input = is_array($raw) ? $raw : $_POST;

$documentType = strtolower(trim((string)($input['documentType'] ?? '')));
$config = medisaGetVehicleDocumentConfig($documentType);
if (!$config) {
    medisaDocumentDeleteFail(400, 'Geçersiz belge tipi');
}
$isSettingsDocument = !empty($config['settingsKey']);

$vehicleId = trim((string)($input['vehicleId'] ?? ''));
$vehicleVersionRaw = $input['vehicleVersion'] ?? null;
$vehicleVersion = ($vehicleVersionRaw !== null && $vehicleVersionRaw !== '') ? (int)$vehicleVersionRaw : null;
$branchId = trim((string)($input['branchId'] ?? ''));
$groupId = trim((string)($input['groupId'] ?? ''));
$groupUpdatedAtBefore = trim((string)($input['groupUpdatedAtBefore'] ?? ''));
$documentPathBefore = medisaDocumentDeleteNormalizePath($input['documentPathBefore'] ?? '');

if ($documentPathBefore === '') {
    medisaDocumentDeleteFail(400, 'documentPathBefore gerekli');
}

if ($documentType === 'k2') {
    if ($branchId === '') {
        medisaDocumentDeleteFail(400, 'branchId gerekli');
    }
    if ($groupId === '') {
        medisaDocumentDeleteFail(400, 'groupId gerekli');
    }
} elseif ($isSettingsDocument) {
    medisaDocumentDeleteFail(400, 'Bu belge tipi için silme desteklenmiyor');
} else {
    if ($vehicleId === '') {
        medisaDocumentDeleteFail(400, 'vehicleId gerekli');
    }
    if ($vehicleVersion === null || $vehicleVersion <= 0) {
        medisaDocumentDeleteFail(400, 'vehicleVersion gerekli');
    }
}

$preloadData = loadData();
if (!is_array($preloadData)) {
    $preloadData = medisaDefaultData();
}

$auth = medisaResolveAuthorizedContext($preloadData, 'view_main_app');
if (($auth['success'] ?? false) !== true) {
    medisaDocumentDeleteFail((int)($auth['status'] ?? 403), $auth['message'] ?? 'Bu işlem için yetkiniz yok.');
}
$context = $auth['context'];

if ($documentType === 'k2') {
    if (!medisaCanAccessK2BelgeBranch($branchId, $context)) {
        medisaDocumentDeleteFail(403, 'Bu şube için K2 belgesi silme yetkiniz yok.');
    }
    $preGroup = medisaFindK2BelgeGroupById($preloadData, $groupId);
    if (!$preGroup) {
        medisaDocumentDeleteFail(404, 'K2 grubu bulunamadı.');
    }
    if (!medisaArrayHasId($preGroup['branchIds'] ?? [], $branchId)) {
        medisaDocumentDeleteFail(409, 'Şube bu K2 grubuna ait değil. Güncel veriler yüklendi.');
    }
    if (!medisaCanAccessK2BelgeGroup($preGroup, $context)) {
        medisaDocumentDeleteFail(403, 'Bu K2 grubu için yetkiniz yok.');
    }
} else {
    $preVehicleIndex = medisaFindVehicleIndex($preloadData, $vehicleId);
    if ($preVehicleIndex < 0) {
        medisaDocumentDeleteFail(404, 'Taşıt bulunamadı');
    }
    if (!medisaCanManageVehicleRecord($preloadData['tasitlar'][$preVehicleIndex], $context)) {
        medisaDocumentDeleteFail(403, 'Bu taşıtın belgelerini silme yetkiniz yok.');
    }
}

$mutation = medisaMutateData(function (&$data) use (
    $documentType,
    $config,
    $vehicleId,
    $vehicleVersion,
    $branchId,
    $groupId,
    $groupUpdatedAtBefore,
    $documentPathBefore
) {
    $auth = medisaResolveAuthorizedContext($data, 'view_main_app');
    if (($auth['success'] ?? false) !== true) {
        return medisaBuildErrorResult($auth['message'] ?? 'Bu işlem için yetkiniz yok.', (int)($auth['status'] ?? 403));
    }
    $context = $auth['context'];

    if ($documentType === 'k2') {
        if (!medisaCanAccessK2BelgeBranch($branchId, $context)) {
            return medisaBuildErrorResult('Bu şube için K2 belgesi silme yetkiniz yok.', 403);
        }
        $group = medisaFindK2BelgeGroupById($data, $groupId);
        if (!$group) {
            return medisaBuildErrorResult('K2 grubu bulunamadı.', 404);
        }
        if (!medisaArrayHasId($group['branchIds'] ?? [], $branchId)) {
            return medisaBuildConflictResult('k2Group', $groupId, 'Şube bu K2 grubuna ait değil. Güncel veriler yüklendi.');
        }
        if (!medisaCanAccessK2BelgeGroup($group, $context)) {
            return medisaBuildErrorResult('Bu K2 grubu için yetkiniz yok.', 403);
        }
        if (trim((string)($group['updatedAt'] ?? '')) !== $groupUpdatedAtBefore) {
            return medisaBuildConflictResult('k2Group', $groupId, 'K2 grubu başka biri tarafından güncellendi. Güncel veriler yüklendi.');
        }
        $currentPath = medisaDocumentDeleteNormalizePath($group['documentPath'] ?? '');
        if ($currentPath === '') {
            return medisaBuildErrorResult('Silinecek K2 belgesi bulunamadı.', 404);
        }
        if ($currentPath !== $documentPathBefore) {
            return medisaBuildConflictResult('k2Group', $groupId, 'K2 belgesi başka biri tarafından güncellendi. Güncel veriler yüklendi.');
        }

        foreach ($data['ayarlar']['k2BelgeGruplari'] as &$candidate) {
            if ((string)($candidate['id'] ?? '') === (string)$group['id']) {
                $candidate['documentPath'] = '';
                $candidate['updatedAt'] = date('c');
            }
        }
        unset($candidate);

        return [
            'success' => true,
            'documentType' => $documentType,
            'deletedDocumentPath' => $currentPath,
            'safeId' => medisaResolveVehicleDocumentSafeFileId($documentType, $config, '', (string)$group['id'], $branchId),
            'group' => medisaFindK2BelgeGroupById($data, $group['id']),
            'actorName' => medisaVehicleDocumentHistoryActorName($context),
        ];
    }

    $vehicleIndex = medisaFindVehicleIndex($data, $vehicleId);
    if ($vehicleIndex < 0) {
        return medisaBuildErrorResult('Taşıt bulunamadı!', 404);
    }

    $vehicle = &$data['tasitlar'][$vehicleIndex];
    if (!medisaCanManageVehicleRecord($vehicle, $context)) {
        return medisaBuildErrorResult('Bu taşıtın belgelerini silme yetkiniz yok.', 403);
    }

    $versionCheck = medisaEnsureVehicleVersion($vehicle, $vehicleVersion, 'Bu taşıt başka biri tarafından güncellendi. Güncel veriler yüklendi.');
    if ($versionCheck !== true) {
        return $versionCheck;
    }

    $pathField = (string)($config['pathField'] ?? '');
    if ($pathField === '') {
        return medisaBuildErrorResult('Belge alanı çözümlenemedi.', 500);
    }
    $currentPath = medisaDocumentDeleteNormalizePath($vehicle[$pathField] ?? '');
    if ($currentPath === '') {
        return medisaBuildErrorResult('Silinecek belge bulunamadı.', 404);
    }
    if ($currentPath !== $documentPathBefore) {
        return medisaBuildConflictResult('vehicle', $vehicleId, 'Belge başka biri tarafından güncellendi. Güncel veriler yüklendi.');
    }

    $vehicle[$pathField] = '';

    $documentEvent = medisaBuildVehicleDocumentHistoryEvent('sil', $documentType, '', $currentPath, $context, [
        'vehicleId' => (string)$vehicleId,
        'plakaSnapshot' => trim((string)($vehicle['plate'] ?? $vehicle['plaka'] ?? '')),
    ]);
    if ($documentEvent) {
        if (!isset($vehicle['events']) || !is_array($vehicle['events'])) {
            $vehicle['events'] = [];
        }
        array_unshift($vehicle['events'], $documentEvent);
    }

    $newVehicleVersion = medisaBumpVehicleVersion($vehicle);

    return [
        'success' => true,
        'documentType' => $documentType,
        'deletedDocumentPath' => $currentPath,
        'safeId' => medisaResolveVehicleDocumentSafeFileId($documentType, $config, $vehicleId),
        'vehicleId' => (string)$vehicleId,
        'vehicleVersion' => $newVehicleVersion,
        'vehicleVersions' => [[
            'id' => (string)$vehicleId,
            'version' => $newVehicleVersion,
        ]],
        'documentPath' => '',
        'pathField' => $pathField,
        'documentEvent' => $documentEvent,
    ];
});

$status = (int)($mutation['status'] ?? (!empty($mutation['conflict']) ? 409 : 200));
if (($mutation['success'] ?? false) !== true) {
    medisaDocumentDeleteFail($status, $mutation['message'] ?? $mutation['error'] ?? 'Belge silinemedi.');
}

$deletedPath = (string)($mutation['deletedDocumentPath'] ?? '');
$cleanup = medisaDeleteVehicleDocumentFiles($config, (string)($mutation['safeId'] ?? ''), $deletedPath);

if (!empty($cleanup['failed'])) {
    // Fail-closed: metadata geri alınır, çağıran taraf başarısız cevap alır.
    medisaMutateData(function (&$data) use ($documentType, $config, $vehicleId, $groupId, $deletedPath) {
        if ($documentType === 'k2') {
            foreach ($data['ayarlar']['k2BelgeGruplari'] as &$candidate) {
                if ((string)($candidate['id'] ?? '') === $groupId && trim((string)($candidate['documentPath'] ?? '')) === '') {
                    $candidate['documentPath'] = $deletedPath;
                    $candidate['updatedAt'] = date('c');
                }
            }
            unset($candidate);
            return ['success' => true];
        }
        $vehicleIndex = medisaFindVehicleIndex($data, $vehicleId);
        if ($vehicleIndex < 0) {
            return ['success' => true, 'save' => false];
        }
        $vehicle = &$data['tasitlar'][$vehicleIndex];
        $pathField = (string)($config['pathField'] ?? '');
        if ($pathField !== '' && trim((string)($vehicle[$pathField] ?? '')) === '') {
            $vehicle[$pathField] = $deletedPath;
            medisaBumpVehicleVersion($vehicle);
        }
        return ['success' => true];
    });

    medisaDocumentDeleteFail(500, 'Belge dosyası silinemedi, işlem geri alındı.');
}

if ($documentType === 'k2') {
    error_log(sprintf(
        '[Medisa] K2 belgesi silindi: groupId=%s branchId=%s file=%s actor=%s at=%s',
        $groupId,
        $branchId,
        basename($deletedPath),
        (string)($mutation['actorName'] ?? ''),
        date('c')
    ));
}

unset($mutation['status'], $mutation['safeId'], $mutation['actorName']);
$mutation['deletedFiles'] = $cleanup['deleted'];
echo json_encode($mutation, JSON_UNESCAPED_UNICODE);
