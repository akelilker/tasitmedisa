<?php
require_once __DIR__ . '/core.php';
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

function ruhsatRespondTextError($statusCode, $message) {
    http_response_code($statusCode);
    header('Content-Type: text/plain; charset=utf-8');
    echo $message;
    exit;
}

function ruhsatDetectMimeType($filePath) {
    if (function_exists('finfo_open')) {
        $finfo = @finfo_open(FILEINFO_MIME_TYPE);
        if ($finfo) {
            $mime = @finfo_file($finfo, $filePath);
            @finfo_close($finfo);
            if (is_string($mime) && $mime !== '') {
                return $mime;
            }
        }
    }

    $extension = strtolower((string)pathinfo($filePath, PATHINFO_EXTENSION));
    $map = [
        'pdf' => 'application/pdf',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'webp' => 'image/webp',
        'gif' => 'image/gif',
    ];

    return $map[$extension] ?? 'application/octet-stream';
}

$vehicleId = trim((string)($_GET['id'] ?? ''));
if ($vehicleId === '') {
    ruhsatRespondTextError(400, 'id parametresi gerekli');
}

$documentType = strtolower(trim((string)($_GET['documentType'] ?? 'ruhsat')));
$config = medisaGetVehicleDocumentConfig($documentType);
if (!$config) {
    ruhsatRespondTextError(400, 'Gecersiz belge tipi');
}

$data = loadData();
if (!is_array($data)) {
    ruhsatRespondTextError(500, 'Veri okunamadi');
}

$auth = medisaResolveAuthorizedContext($data, '', true);
if (($auth['success'] ?? false) !== true) {
    ruhsatRespondTextError((int)($auth['status'] ?? 403), $auth['message'] ?? 'Bu islem icin yetkiniz yok.');
}

$vehicleIndex = medisaFindVehicleIndex($data, $vehicleId);
if ($vehicleIndex < 0) {
    ruhsatRespondTextError(404, 'Tasit bulunamadi');
}

$vehicle = $data['tasitlar'][$vehicleIndex];
if (!medisaCanViewVehicleRecord($vehicle, $auth['context'])) {
    ruhsatRespondTextError(403, 'Bu ruhsati goruntuleme yetkiniz yok.');
}

$filePath = medisaResolveVehicleDocumentFilePath($vehicle, $documentType);
if (!$filePath || !is_file($filePath)) {
    ruhsatRespondTextError(404, $config['notFound']);
}

$mimeType = ruhsatDetectMimeType($filePath);
$plaka = strtoupper((string)($vehicle['plaka'] ?? $vehicle['plate'] ?? $vehicle['id'] ?? $config['fallbackName']));
$extension = strtolower((string)pathinfo($filePath, PATHINFO_EXTENSION));
$downloadBase = preg_replace('/[^A-Z0-9_-]/', '', $plaka);
if ($downloadBase === '') {
    $downloadBase = $config['fallbackName'];
}
$downloadName = $downloadBase . '-' . $config['fallbackName'];
if ($extension !== '') {
    $downloadName .= '.' . $extension;
}

header('Content-Type: ' . $mimeType);
header('Content-Length: ' . filesize($filePath));
header('Content-Disposition: inline; filename="' . $downloadName . '"');
readfile($filePath);
exit;
