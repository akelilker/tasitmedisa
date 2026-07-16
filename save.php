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

$input = file_get_contents('php://input');
if (empty($input)) {
    http_response_code(400);
    echo json_encode(['error' => 'Boş veri'], JSON_UNESCAPED_UNICODE);
    exit;
}

$incomingData = json_decode($input, true);
if (json_last_error() !== JSON_ERROR_NONE || !is_array($incomingData)) {
    http_response_code(400);
    echo json_encode(['error' => 'Geçersiz JSON'], JSON_UNESCAPED_UNICODE);
    exit;
}

$result = medisaMutateData(function (&$data) use ($incomingData) {
    if (!is_array($data)) {
        $data = medisaDefaultData();
    }

    $auth = medisaResolveAuthorizedContext($data);
    if (($auth['success'] ?? false) !== true) {
        $status = (int)($auth['status'] ?? 403);
        return medisaBuildErrorResult($auth['message'] ?? 'Bu işlem için yetkiniz yok.', $status, [
            'auth_required' => $status === 401,
            'permission_denied' => !empty($auth['permission_denied']),
        ]);
    }
    $context = $auth['context'];
    if (!$context) {
        return medisaBuildErrorResult('Kullanıcı bulunamadı veya yetki çözümlenemedi.', 403);
    }

    if (($context['role'] ?? 'kullanici') === 'kullanici') {
        return medisaBuildErrorResult('Bu ekran için yetkiniz yok.', 403);
    }

    $incomingVehicles = medisaSaveNormalizeCollection($incomingData['tasitlar'] ?? []);
    $incomingUsers = medisaSaveNormalizeCollection($incomingData['users'] ?? []);
    $currentVehicles = medisaSaveNormalizeCollection($data['tasitlar'] ?? []);
    $currentUsers = medisaSaveNormalizeCollection($data['users'] ?? []);
    $currentVehiclesById = medisaSaveIndexVehiclesById($currentVehicles);
    $passwordChanges = is_array($incomingData['_medisaUserPasswordChanges'] ?? null)
        ? $incomingData['_medisaUserPasswordChanges']
        : null;
    if (is_array($passwordChanges) && count($passwordChanges) > 0) {
        return medisaBuildErrorResult('Parola yönetimi yalnız güvenli başlangıç parolası yenileme işlemiyle yapılabilir.', 400);
    }
    $mutation = is_array($incomingData['_medisaMutation'] ?? null) ? $incomingData['_medisaMutation'] : null;
    $mutationCollections = $mutation !== null && is_array($mutation['collections'] ?? null)
        ? array_values(array_unique(array_map('strval', $mutation['collections'])))
        : null;
    $changedVehicleIds = $mutation !== null && is_array($mutation['changedVehicleIds'] ?? null)
        ? array_values(array_unique(array_filter(array_map('strval', $mutation['changedVehicleIds']), 'strlen')))
        : null;
    $deletedVehicleIds = $mutation !== null && is_array($mutation['deletedVehicleIds'] ?? null)
        ? array_values(array_unique(array_filter(array_map('strval', $mutation['deletedVehicleIds']), 'strlen')))
        : [];
    $deletedVehicleVersions = $mutation !== null && is_array($mutation['deletedVehicleVersions'] ?? null)
        ? $mutation['deletedVehicleVersions']
        : [];
    if ($mutationCollections !== null && (!empty($changedVehicleIds) || !empty($deletedVehicleIds)) && !in_array('tasitlar', $mutationCollections, true)) {
        $mutationCollections[] = 'tasitlar';
    }
    $collectionChanged = function ($name) use ($mutationCollections) {
        return $mutationCollections === null || in_array($name, $mutationCollections, true);
    };
    $usersCollectionChanged = $collectionChanged('users') || (is_array($passwordChanges) && count($passwordChanges) > 0);

    $versionCheck = medisaSaveValidateIncomingVehicleVersions($incomingVehicles, $currentVehiclesById, $context, $changedVehicleIds);
    if ($versionCheck !== true) {
        return $versionCheck;
    }
    $savedVehicleIds = $changedVehicleIds;
    if ($changedVehicleIds === null) {
        $incomingVehicles = medisaSaveApplyVehicleVersions($incomingVehicles, $currentVehiclesById);
    } else {
        foreach ($deletedVehicleIds as $deletedVehicleId) {
            $currentVehicle = $currentVehiclesById[$deletedVehicleId] ?? null;
            if ($currentVehicle !== null && !medisaCanManageVehicleRecord($currentVehicle, $context)) {
                return medisaBuildErrorResult('Bu taşıtı silme yetkiniz yok.', 403);
            }
            if ($currentVehicle !== null && (int)($deletedVehicleVersions[$deletedVehicleId] ?? 0) !== medisaGetVehicleVersion($currentVehicle)) {
                return medisaBuildConflictResult('vehicle', $deletedVehicleId, 'Bu taşıt başka biri tarafından güncellendi. Güncel veriler yüklendi.');
            }
        }
        $incomingVehicles = medisaSaveApplyVehicleMutation($currentVehicles, $incomingVehicles, $changedVehicleIds, $deletedVehicleIds);
    }

    if (($context['role'] ?? '') === 'genel_yonetici') {
        if ($collectionChanged('tasitlar')) $data['tasitlar'] = $incomingVehicles;
        if ($collectionChanged('kayitlar')) $data['kayitlar'] = is_array($incomingData['kayitlar'] ?? null) ? $incomingData['kayitlar'] : ($data['kayitlar'] ?? []);
        if ($collectionChanged('branches')) $data['branches'] = medisaSaveNormalizeCollection($incomingData['branches'] ?? []);
        if ($usersCollectionChanged) {
            $reconciledUsers = medisaReconcileUserCredentials($currentUsers, $incomingUsers, $passwordChanges, $context);
            if (($reconciledUsers['success'] ?? false) !== true) {
                return $reconciledUsers;
            }
            $data['users'] = $reconciledUsers['users'];
        }
        if ($collectionChanged('ayarlar')) $data['ayarlar'] = is_array($incomingData['ayarlar'] ?? null) ? $incomingData['ayarlar'] : ($data['ayarlar'] ?? []);
        if ($collectionChanged('sifreler')) $data['sifreler'] = medisaSaveNormalizeCollection($incomingData['sifreler'] ?? []);
    } else {
        $changedVehicleLookup = $changedVehicleIds === null ? null : array_fill_keys($changedVehicleIds, true);
        $vehiclesToAuthorize = $changedVehicleLookup === null
            ? $incomingVehicles
            : array_values(array_filter($incomingVehicles, function ($vehicle) use ($changedVehicleLookup) {
                return isset($changedVehicleLookup[(string)($vehicle['id'] ?? '')]);
            }));
        if (($collectionChanged('tasitlar') && !medisaSaveEnsureScopedVehiclesAreAllowed($vehiclesToAuthorize, $context)) || ($usersCollectionChanged && !medisaSaveEnsureScopedUsersAreAllowed($incomingUsers, $context))) {
            return medisaBuildErrorResult('Kapsam dışı veri kaydı engellendi.', 403);
        }

        if ($collectionChanged('tasitlar')) {
            $data['tasitlar'] = $changedVehicleIds === null
                ? medisaSaveMergeScopedCollection(
                    $currentVehicles,
                    $incomingVehicles,
                    function ($vehicle) use ($context) { return medisaCanManageVehicleRecord($vehicle, $context); },
                    function ($vehicle) use ($context) { return medisaCanManageVehicleRecord($vehicle, $context); }
                )
                : $incomingVehicles;
        }

        if ($usersCollectionChanged) {
            $reconciledUsers = medisaReconcileUserCredentials($currentUsers, $incomingUsers, $passwordChanges, $context);
            if (($reconciledUsers['success'] ?? false) !== true) {
                return $reconciledUsers;
            }
            $data['users'] = medisaSaveMergeScopedCollection(
                $currentUsers,
                $reconciledUsers['users'],
                function ($user) use ($context) { return medisaCanManageUserRecord($user, $context); },
                function ($user) use ($context) { return medisaCanManageUserRecord($user, $context); }
            );
        }
    }

    // Ham kasko listesi save_kasko.php üzerinden; eski istemci payload yoksayıldı (ana data.json şişmez).

    if (!is_array($data['notificationReadState'] ?? null)) {
        $data['notificationReadState'] = [];
    }
    $incomingReadState = $incomingData['notificationReadState'] ?? null;
    if ($collectionChanged('notificationReadState') && is_array($incomingReadState)) {
        $isListArray = function ($value) {
            if (!is_array($value)) return false;
            if (function_exists('array_is_list')) return array_is_list($value);
            $expectedIndex = 0;
            foreach ($value as $key => $_) {
                if ($key !== $expectedIndex) return false;
                $expectedIndex++;
            }
            return true;
        };
        $normalizeKeys = function ($keys) {
            $clean = [];
            if (!is_array($keys)) return $clean;
            foreach ($keys as $key) {
                $normalized = trim((string)$key);
                if ($normalized === '') continue;
                if (!in_array($normalized, $clean, true)) $clean[] = $normalized;
            }
            return array_slice($clean, -500);
        };
        $normalizeScopeState = function ($scopeState) use ($normalizeKeys, $isListArray) {
            if ($isListArray($scopeState)) {
                $readKeys = $normalizeKeys($scopeState);
                return [
                    'readKeys' => $readKeys,
                    'dismissedKeys' => [],
                    'firstSeenDates' => [],
                    'migratedFromLocalStorage' => false,
                    'updatedAt' => '',
                ];
            }
            $scopeState = is_array($scopeState) ? $scopeState : [];
            $dismissedKeys = $normalizeKeys($scopeState['dismissedKeys'] ?? []);
            $readKeysRaw = is_array($scopeState['readKeys'] ?? null) ? $scopeState['readKeys'] : [];
            $readKeys = $normalizeKeys(array_merge($readKeysRaw, $dismissedKeys));
            return [
                'readKeys' => $readKeys,
                'dismissedKeys' => $dismissedKeys,
                // İstemci prune key set authoritative; değer resolve save tarafında.
                'firstSeenDates' => medisaNotificationNormalizeFirstSeenDates($scopeState['firstSeenDates'] ?? []),
                'migratedFromLocalStorage' => ($scopeState['migratedFromLocalStorage'] ?? false) === true,
                'updatedAt' => trim((string)($scopeState['updatedAt'] ?? '')),
            ];
        };
        $mergeUnique = function ($a, $b) use ($normalizeKeys) {
            return $normalizeKeys(array_merge(is_array($a) ? $a : [], is_array($b) ? $b : []));
        };
        $scopeDescriptor = medisaBuildNotificationScopeDescriptor($context);
        $allowedScopeKeys = $scopeDescriptor['saveAllowedKeys'];

        foreach ($allowedScopeKeys as $allowedScopeKey) {
            if (!array_key_exists($allowedScopeKey, $incomingReadState) || !is_array($incomingReadState[$allowedScopeKey])) continue;
            $serverScope = $normalizeScopeState($data['notificationReadState'][$allowedScopeKey] ?? []);
            $clientScope = $normalizeScopeState($incomingReadState[$allowedScopeKey]);
            $dismissedKeys = $mergeUnique($serverScope['dismissedKeys'], $clientScope['dismissedKeys']);
            $readKeys = $mergeUnique(array_merge($serverScope['readKeys'], $clientScope['readKeys']), $dismissedKeys);
            // Key set = client prune; ortak key değeri = server firstSeen (reset yok).
            $firstSeenDates = medisaNotificationResolveFirstSeenDates(
                $serverScope['firstSeenDates'],
                $clientScope['firstSeenDates']
            );
            $migrated = $serverScope['migratedFromLocalStorage'] || $clientScope['migratedFromLocalStorage'];
            $sameRead = medisaNotificationKeyListsEqual($readKeys, $serverScope['readKeys']);
            $sameDismissed = medisaNotificationKeyListsEqual($dismissedKeys, $serverScope['dismissedKeys']);
            $sameFirstSeen = medisaNotificationFirstSeenMapsEqual($firstSeenDates, $serverScope['firstSeenDates']);
            $sameMigrated = $migrated === $serverScope['migratedFromLocalStorage'];
            if ($sameRead && $sameDismissed && $sameFirstSeen && $sameMigrated) {
                // Semantik no-op: scope rewrite / updatedAt dokunma.
                continue;
            }
            $data['notificationReadState'][$allowedScopeKey] = [
                'readKeys' => $readKeys,
                'dismissedKeys' => $dismissedKeys,
                'firstSeenDates' => $firstSeenDates,
                'migratedFromLocalStorage' => $migrated,
                'updatedAt' => date('c'),
            ];
        }
    }

    if (!is_array($data['monthlyTodoWhatsAppLogs'] ?? null)) {
        $data['monthlyTodoWhatsAppLogs'] = [];
    }
    $incomingMonthlyWaLogs = $incomingData['monthlyTodoWhatsAppLogs'] ?? null;
    if ($collectionChanged('monthlyTodoWhatsAppLogs') && is_array($incomingMonthlyWaLogs)) {
        $validShortCodes = ['s', 'k', 'sk', 'm', 'e', 'me', 'km'];
        $mergeMonthlyWaEntry = function ($serverEntry, $clientEntry) {
            $serverEntry = is_array($serverEntry) ? $serverEntry : [];
            $clientEntry = is_array($clientEntry) ? $clientEntry : [];
            $sCount = (int)($serverEntry['openedCount'] ?? 0);
            $cCount = (int)($clientEntry['openedCount'] ?? 0);
            $openedCount = max($sCount, $cCount, 1);
            $sFirst = trim((string)($serverEntry['firstOpenedAt'] ?? ''));
            $cFirst = trim((string)($clientEntry['firstOpenedAt'] ?? ''));
            $firstOpenedAt = ($sFirst !== '' && $cFirst !== '')
                ? (strcmp($sFirst, $cFirst) <= 0 ? $sFirst : $cFirst)
                : ($sFirst !== '' ? $sFirst : $cFirst);
            $sLast = trim((string)($serverEntry['lastOpenedAt'] ?? ''));
            $cLast = trim((string)($clientEntry['lastOpenedAt'] ?? ''));
            $lastOpenedAt = ($sLast !== '' && $cLast !== '')
                ? (strcmp($sLast, $cLast) >= 0 ? $sLast : $cLast)
                : ($sLast !== '' ? $sLast : $cLast);
            if ($lastOpenedAt === '') {
                $lastOpenedAt = date('c');
            }
            return [
                'vehicleId' => trim((string)($clientEntry['vehicleId'] ?? $serverEntry['vehicleId'] ?? '')),
                'plate' => trim((string)($clientEntry['plate'] ?? $serverEntry['plate'] ?? '')),
                'type' => trim((string)($clientEntry['type'] ?? $serverEntry['type'] ?? '')),
                'field' => trim((string)($clientEntry['field'] ?? $serverEntry['field'] ?? '')),
                'date' => trim((string)($clientEntry['date'] ?? $serverEntry['date'] ?? '')),
                'firstOpenedAt' => $firstOpenedAt !== '' ? $firstOpenedAt : date('c'),
                'lastOpenedAt' => $lastOpenedAt,
                'openedCount' => $openedCount,
                'openedBy' => mb_substr(trim((string)($clientEntry['openedBy'] ?? $serverEntry['openedBy'] ?? '')), 0, 200, 'UTF-8'),
            ];
        };
        foreach ($incomingMonthlyWaLogs as $rawKey => $entry) {
            $key = trim((string)$rawKey);
            if ($key === '' || !is_array($entry) || strlen($key) > 320) {
                continue;
            }
            if (!preg_match('/^monthlyTodo:/', $key)) {
                continue;
            }
            $typeCode = strtolower(trim((string)($entry['type'] ?? '')));
            if ($typeCode !== '' && !in_array($typeCode, $validShortCodes, true) && !preg_match('/^[a-z0-9_+]{1,40}$/', $typeCode)) {
                continue;
            }
            $entry['type'] = $typeCode;
            $serverEntry = is_array($data['monthlyTodoWhatsAppLogs'][$key] ?? null) ? $data['monthlyTodoWhatsAppLogs'][$key] : [];
            $data['monthlyTodoWhatsAppLogs'][$key] = $mergeMonthlyWaEntry($serverEntry, $entry);
        }
        if (count($data['monthlyTodoWhatsAppLogs']) > 4000) {
            uasort($data['monthlyTodoWhatsAppLogs'], function ($a, $b) {
                $la = is_array($a) ? trim((string)($a['lastOpenedAt'] ?? '')) : '';
                $lb = is_array($b) ? trim((string)($b['lastOpenedAt'] ?? '')) : '';
                return strcmp($lb, $la);
            });
            $data['monthlyTodoWhatsAppLogs'] = array_slice($data['monthlyTodoWhatsAppLogs'], 0, 3000, true);
        }
    }

    return [
        'success' => true,
        'vehicleVersions' => medisaSaveBuildVehicleVersions(array_values(array_filter($incomingVehicles, function ($vehicle) use ($savedVehicleIds) {
            return $savedVehicleIds === null || in_array((string)($vehicle['id'] ?? ''), $savedVehicleIds, true);
        }))),
    ];
});

$status = (int)($result['status'] ?? (($result['conflict'] ?? false) ? 409 : ((($result['success'] ?? false) === true) ? 200 : 400)));
if ($status !== 200) {
    http_response_code($status);
}
unset($result['status']);

echo json_encode($result, JSON_UNESCAPED_UNICODE);
?>
