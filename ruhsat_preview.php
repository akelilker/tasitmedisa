<?php
require_once __DIR__ . '/core.php';
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

function respondJsonError(int $statusCode, string $message): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

$vehicleId = trim((string)($_GET['id'] ?? ''));
if ($vehicleId === '') {
    respondJsonError(400, 'id parametresi gerekli');
}

$documentType = strtolower(trim((string)($_GET['documentType'] ?? 'ruhsat')));
$config = medisaGetVehicleDocumentConfig($documentType);
if (!$config) {
    respondJsonError(400, 'Geçersiz belge tipi');
}

$data = loadData();
if (!is_array($data)) {
    respondJsonError(500, 'Veri okunamadı');
}

$auth = medisaResolveAuthorizedContext($data, '', true);
if (($auth['success'] ?? false) !== true) {
    respondJsonError((int)($auth['status'] ?? 403), $auth['message'] ?? 'Bu işlem için yetkiniz yok.');
}

$vehicleIndex = medisaFindVehicleIndex($data, $vehicleId);
if ($vehicleIndex < 0) {
    respondJsonError(404, 'Taşıt bulunamadı');
}

$vehicle = $data['tasitlar'][$vehicleIndex];
if (!medisaCanViewVehicleRecord($vehicle, $auth['context'])) {
    respondJsonError(403, 'Bu ruhsatı görüntüleme yetkiniz yok.');
}

$sourcePath = medisaResolveVehicleDocumentFilePath($vehicle, $documentType, $data);
if (!$sourcePath || !is_file($sourcePath)) {
    respondJsonError(404, $config['notFound']);
}

$sourceExtension = strtolower((string)pathinfo($sourcePath, PATHINFO_EXTENSION));
$previewMetaRequested = isset($_GET['meta']) && (string)$_GET['meta'] === '1';
$previewPageIndex = isset($_GET['page']) ? max(0, (int)$_GET['page']) : 0;
if (in_array($sourceExtension, ['jpg', 'jpeg', 'png', 'gif', 'webp'], true)) {
    if ($previewMetaRequested) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['pageCount' => 1], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($previewPageIndex > 0) {
        respondJsonError(404, 'Belge sayfası bulunamadı');
    }
    $mimeMap = [
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'gif' => 'image/gif',
        'webp' => 'image/webp',
    ];
    header('Content-Type: ' . ($mimeMap[$sourceExtension] ?? 'application/octet-stream'));
    header('Content-Length: ' . filesize($sourcePath));
    readfile($sourcePath);
    exit;
}

if ($previewMetaRequested) {
    if (!class_exists('Imagick')) {
        respondJsonError(501, 'Sunucuda Imagick desteği yok');
    }

    try {
        $probe = new Imagick();
        $probe->pingImage($sourcePath);
        $pageCount = max(1, (int)$probe->getNumberImages());
        $probe->clear();
        $probe->destroy();

        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['pageCount' => $pageCount], JSON_UNESCAPED_UNICODE);
        exit;
    } catch (Throwable $e) {
        respondJsonError(500, 'PDF sayfa bilgisi alınamadı');
    }
}

$safeId = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($vehicle['id'] ?? $vehicleId));
if ($safeId === '') {
    $digitsOnly = preg_replace('/\D/', '', $vehicleId);
    $safeId = $digitsOnly !== '' ? 'vehicle_' . $digitsOnly : 'unknown';
}

$previewDir = __DIR__ . '/data/' . $config['dir'] . '_preview';
if (!is_dir($previewDir) && !mkdir($previewDir, 0755, true) && !is_dir($previewDir)) {
    respondJsonError(500, 'Preview klasörü oluşturulamadı');
}

$previewSuffix = $previewPageIndex > 0 ? ('_p' . $previewPageIndex) : '';
$previewPath = $previewDir . '/' . $safeId . $previewSuffix . '.jpg';
$mustGenerate = !is_file($previewPath) || filesize($previewPath) <= 0 || filemtime($previewPath) < filemtime($sourcePath);

if ($mustGenerate) {
    if (!class_exists('Imagick')) {
        respondJsonError(501, 'Sunucuda Imagick desteği yok');
    }

    try {
        $imagick = new Imagick();
        $imagick->setResolution(240, 240);
        $imagick->readImage($sourcePath . '[' . $previewPageIndex . ']');
        $imagick->setImageBackgroundColor('white');

        if (defined('Imagick::LAYERMETHOD_FLATTEN')) {
            $flattened = $imagick->mergeImageLayers(Imagick::LAYERMETHOD_FLATTEN);
            if ($flattened instanceof Imagick) {
                $imagick->clear();
                $imagick->destroy();
                $imagick = $flattened;
            }
        }

        if (defined('Imagick::ALPHACHANNEL_REMOVE')) {
            $imagick->setImageAlphaChannel(Imagick::ALPHACHANNEL_REMOVE);
        }

        if (defined('Imagick::COLORSPACE_SRGB')) {
            $imagick->setImageColorspace(Imagick::COLORSPACE_SRGB);
        }
        $imagick->setImageFormat('jpeg');
        $imagick->setImageCompressionQuality(88);
        $imagick->stripImage();

        if (!$imagick->writeImage($previewPath)) {
            $imagick->clear();
            $imagick->destroy();
            respondJsonError(500, 'Preview dosyası kaydedilemedi');
        }

        $imagick->clear();
        $imagick->destroy();
    } catch (Throwable $e) {
        $message = strtolower($e->getMessage());
        $isPreviewCapabilityError =
            strpos($message, 'delegate') !== false ||
            strpos($message, 'ghostscript') !== false ||
            strpos($message, 'no decode delegate') !== false ||
            strpos($message, 'not allowed by the security policy') !== false;

        respondJsonError($isPreviewCapabilityError ? 501 : 500, 'PDF preview üretilemedi');
    }
}

clearstatcache(true, $previewPath);
if (!is_file($previewPath) || filesize($previewPath) <= 0) {
    respondJsonError(500, 'Preview dosyası hazır değil');
}

header('Content-Type: image/jpeg');
header('Content-Length: ' . filesize($previewPath));
readfile($previewPath);
exit;
