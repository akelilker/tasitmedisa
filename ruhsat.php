<?php
/**
 * Ruhsat PDF servisi – Tarayıcıda görüntüleme ve yazdırma
 * GET ?id={vehicleId} → data/ruhsat/{vehicleId}.pdf
 */
$id = trim($_GET['id'] ?? '');
if (empty($id)) {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'id parametresi gerekli';
    exit;
}

$safeId = preg_replace('/[^a-zA-Z0-9_-]/', '', $id);
if (empty($safeId)) {
    $safeId = 'vehicle_' . preg_replace('/\D/', '', $id) ?: 'unknown';
}

$filePath = __DIR__ . '/data/ruhsat/' . $safeId . '.pdf';
if (!is_file($filePath)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Ruhsat bulunamadı';
    exit;
}

header('Content-Type: application/pdf');
header('Content-Disposition: inline; filename="ruhsat-' . $safeId . '.pdf"');
readfile($filePath);
exit;
