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

$tokenData = validateToken();
if (!$tokenData) {
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'auth_required' => true,
        'message' => 'Oturum gerekli.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function medisaSaveNormalizeCollection($value) {
    return is_array($value) ? array_values($value) : [];
}

function medisaSaveMergeScopedCollection($currentItems, $incomingItems, $canManageCurrent, $canManageIncoming) {
    $merged = [];
    foreach ($currentItems as $item) {
        if (!$canManageCurrent($item)) {
            $merged[] = $item;
        }
    }
    foreach ($incomingItems as $item) {
        if ($canManageIncoming($item)) {
            $merged[] = $item;
        }
    }
    return array_values($merged);
}

function medisaSaveEnsureScopedVehiclesAreAllowed($incomingVehicles, $context) {
    foreach ($incomingVehicles as $vehicle) {
        if (!medisaCanManageVehicleRecord($vehicle, $context)) {
            return false;
        }
    }
    return true;
}

function medisaSaveEnsureScopedUsersAreAllowed($incomingUsers, $context) {
    foreach ($incomingUsers as $user) {
        if (!medisaCanManageUserRecord($user, $context)) {
            return false;
        }
    }
    return true;
}

function medisaSaveApplyVehicleVersions($incomingVehicles, $currentById) {
    $updated = [];
    foreach ($incomingVehicles as $vehicle) {
        $id = isset($vehicle['id']) ? (string)$vehicle['id'] : '';
        $current = $id !== '' ? ($currentById[$id] ?? null) : null;
        if ($current && isset($current['version'])) {
            $vehicle['version'] = (int)$current['version'] + 1;
        } else {
            $vehicle['version'] = 1;
        }
        $updated[] = $vehicle;
    }
    return $updated;
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

$result = medisaMutateData(function (&$data) use ($incomingData, $tokenData) {
    if (!is_array($data)) {
        $data = medisaDefaultData();
    }

    $context = medisaBuildAccessContext($data, $tokenData);
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

    $currentVehiclesById = [];
    foreach ($currentVehicles as $vehicle) {
        $id = isset($vehicle['id']) ? (string)$vehicle['id'] : '';
        if ($id !== '') {
            $currentVehiclesById[$id] = $vehicle;
        }
    }

    foreach ($incomingVehicles as $vehicle) {
        $id = isset($vehicle['id']) ? (string)$vehicle['id'] : '';
        if ($id === '' || !isset($vehicle['version'])) {
            continue;
        }

        $currentVehicle = $currentVehiclesById[$id] ?? null;
        if ($currentVehicle === null) {
            continue;
        }

        if (($context['role'] ?? '') !== 'genel_yonetici' && !medisaCanManageVehicleRecord($currentVehicle, $context)) {
            continue;
        }

        $currentVersion = isset($currentVehicle['version']) ? (int)$currentVehicle['version'] : 0;
        $incomingVersion = (int)$vehicle['version'];
        if ($incomingVersion < $currentVersion) {
            return medisaBuildConflictResult(
                'vehicle',
                $id,
                'Bu araç başka biri tarafından güncellendi. Güncel veriler yüklendi.'
            );
        }
    }

    $incomingVehicles = medisaSaveApplyVehicleVersions($incomingVehicles, $currentVehiclesById);

    if (($context['role'] ?? '') === 'genel_yonetici') {
        $data['tasitlar'] = $incomingVehicles;
        $data['kayitlar'] = is_array($incomingData['kayitlar'] ?? null) ? $incomingData['kayitlar'] : ($data['kayitlar'] ?? []);
        $data['branches'] = medisaSaveNormalizeCollection($incomingData['branches'] ?? []);
        $data['users'] = $incomingUsers;
        $data['ayarlar'] = is_array($incomingData['ayarlar'] ?? null) ? $incomingData['ayarlar'] : ($data['ayarlar'] ?? []);
        $data['sifreler'] = medisaSaveNormalizeCollection($incomingData['sifreler'] ?? []);
    } else {
        if (!medisaSaveEnsureScopedVehiclesAreAllowed($incomingVehicles, $context) || !medisaSaveEnsureScopedUsersAreAllowed($incomingUsers, $context)) {
            return medisaBuildErrorResult('Kapsam dışı veri kaydı engellendi.', 403);
        }

        $data['tasitlar'] = medisaSaveMergeScopedCollection(
            $currentVehicles,
            $incomingVehicles,
            function ($vehicle) use ($context) {
                return medisaCanManageVehicleRecord($vehicle, $context);
            },
            function ($vehicle) use ($context) {
                return medisaCanManageVehicleRecord($vehicle, $context);
            }
        );

        $data['users'] = medisaSaveMergeScopedCollection(
            $currentUsers,
            $incomingUsers,
            function ($user) use ($context) {
                return medisaCanManageUserRecord($user, $context);
            },
            function ($user) use ($context) {
                return medisaCanManageUserRecord($user, $context);
            }
        );
    }

    $vehicleVersions = [];
    foreach ($incomingVehicles as $vehicle) {
        $id = isset($vehicle['id']) ? (string)$vehicle['id'] : '';
        if ($id === '') {
            continue;
        }

        $vehicleVersions[] = [
            'id' => $id,
            'version' => isset($vehicle['version']) ? (int)$vehicle['version'] : 1,
        ];
    }

    return [
        'success' => true,
        'vehicleVersions' => $vehicleVersions,
    ];
});

$status = (int)($result['status'] ?? (($result['conflict'] ?? false) ? 409 : ((($result['success'] ?? false) === true) ? 200 : 400)));
if ($status !== 200) {
    http_response_code($status);
}
unset($result['status']);

echo json_encode($result, JSON_UNESCAPED_UNICODE);
?>
