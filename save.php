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
        return medisaBuildErrorResult($auth['message'] ?? 'Bu islem icin yetkiniz yok.', $status, [
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
    $versionCheck = medisaSaveValidateIncomingVehicleVersions($incomingVehicles, $currentVehiclesById, $context);
    if ($versionCheck !== true) {
        return $versionCheck;
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

    // Ham kasko listesi save_kasko.php üzerinden; eski istemci payload yoksayıldı (ana data.json şişmez).

    if (!is_array($data['notificationReadState'] ?? null)) {
        $data['notificationReadState'] = [];
    }
    $incomingReadState = $incomingData['notificationReadState'] ?? null;
    if (is_array($incomingReadState)) {
        $userId = (string)($context['user_id'] ?? '');
        $allowedScopeKeys = [];
        if ($userId !== '') {
            $allowedScopeKeys[] = 'user:' . $userId;
        } else {
            $role = strtolower(trim((string)($context['role'] ?? '')));
            $branchIds = array_values(array_filter(array_map(function ($id) {
                return trim((string)$id);
            }, is_array($context['branch_ids'] ?? null) ? $context['branch_ids'] : []), function ($id) {
                return $id !== '';
            }));
            sort($branchIds);
            if ($role !== '' && !empty($branchIds)) {
                $allowedScopeKeys[] = 'scope:' . $role . ':' . implode(',', $branchIds);
            } elseif ($role !== '') {
                $allowedScopeKeys[] = 'scope:' . $role;
            }
        }
        foreach ($allowedScopeKeys as $scopeKey) {
            if (!array_key_exists($scopeKey, $incomingReadState) || !is_array($incomingReadState[$scopeKey])) continue;
            $clean = [];
            foreach ($incomingReadState[$scopeKey] as $key) {
                $normalized = trim((string)$key);
                if ($normalized === '') continue;
                if (!in_array($normalized, $clean, true)) $clean[] = $normalized;
            }
            $data['notificationReadState'][$scopeKey] = $clean;
        }
    }

    return [
        'success' => true,
        'vehicleVersions' => medisaSaveBuildVehicleVersions($incomingVehicles),
    ];
});

$status = (int)($result['status'] ?? (($result['conflict'] ?? false) ? 409 : ((($result['success'] ?? false) === true) ? 200 : 400)));
if ($status !== 200) {
    http_response_code($status);
}
unset($result['status']);

echo json_encode($result, JSON_UNESCAPED_UNICODE);
?>
