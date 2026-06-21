<?php
require_once __DIR__ . '/driver_common.php';
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$tokenData = validateToken();
if (!$tokenData) {
    medisaDriverJsonResponse(['success' => false, 'message' => 'Oturumunuz sona erdi!'], 401);
}

$data = loadData();
if (!$data) {
    medisaDriverJsonResponse(['success' => false, 'message' => 'Veri okunamadı!'], 500);
}

$context = medisaDriverResolveContext($data, $tokenData);
if (!$context) {
    medisaDriverJsonResponse(['success' => false, 'message' => 'Kullanıcı paneli erişiminiz yok!'], 403);
}

$user = $context['user'];
$assignedVehicleIdSet = [];
foreach (($data['tasitlar'] ?? []) as $vehicle) {
    if ((string)($vehicle['assignedUserId'] ?? '') === (string)($user['id'] ?? '')) {
        $vehicleId = trim((string)($vehicle['id'] ?? ''));
        if ($vehicleId !== '') {
            $assignedVehicleIdSet[$vehicleId] = true;
        }
    }
}

if (empty($assignedVehicleIdSet) && !empty($user['zimmetli_araclar']) && is_array($user['zimmetli_araclar'])) {
    foreach ($user['zimmetli_araclar'] as $vehicleId) {
        $vehicleId = trim((string)$vehicleId);
        if ($vehicleId !== '') {
            $assignedVehicleIdSet[$vehicleId] = true;
        }
    }
}

$records = medisaDriverFilterRecordsForVehicles(
    $data['arac_aylik_hareketler'] ?? [],
    $user['id'] ?? '',
    $assignedVehicleIdSet
);
$eventsByVehicle = medisaDriverBuildVehicleEventsById($data['tasitlar'] ?? [], $assignedVehicleIdSet);

echo json_encode([
    'success' => true,
    'records' => $records,
    'eventsByVehicle' => $eventsByVehicle,
], JSON_UNESCAPED_UNICODE);
?>
