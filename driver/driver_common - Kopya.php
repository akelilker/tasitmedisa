<?php
require_once __DIR__ . '/../core.php';

function medisaDriverJsonResponse($payload, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function medisaDriverResolveContext($data, $tokenData) {
    $context = medisaBuildAccessContext($data, $tokenData);
    if (!$context) {
        return null;
    }

    if (empty($context['driver_dashboard']) || !empty($context['yonetici_only'])) {
        return null;
    }

    return $context;
}

function medisaDriverBuildAssignedVehicleIdSet($vehicles) {
    $set = [];
    foreach ((array)$vehicles as $vehicle) {
        $vehicleId = trim((string)($vehicle['id'] ?? ''));
        if ($vehicleId !== '') {
            $set[$vehicleId] = true;
        }
    }
    return $set;
}

function medisaDriverFilterRecordsForVehicles($records, $userId, $assignedVehicleIdSet, $period = '') {
    $filtered = [];
    $period = trim((string)$period);
    foreach ((array)$records as $record) {
        $vehicleId = (string)($record['arac_id'] ?? '');
        if (!isset($assignedVehicleIdSet[$vehicleId])) continue;
        if (isset($record['surucu_id']) && (string)$record['surucu_id'] !== (string)$userId) continue;
        if ($period !== '' && trim((string)($record['donem'] ?? '')) !== $period) continue;
        $filtered[] = $record;
    }
    return $filtered;
}

function medisaDriverBuildVehicleEventsById($vehicles, $assignedVehicleIdSet) {
    $eventsByVehicle = [];
    foreach ((array)$vehicles as $vehicle) {
        $vehicleId = trim((string)($vehicle['id'] ?? ''));
        if ($vehicleId === '' || !isset($assignedVehicleIdSet[$vehicleId])) continue;
        $eventsByVehicle[$vehicleId] = is_array($vehicle['events'] ?? null) ? array_values($vehicle['events']) : [];
    }
    return $eventsByVehicle;
}
?>
