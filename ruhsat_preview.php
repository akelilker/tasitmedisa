<?php
/**
 * Ruhsat PDF'nin ilk sayfasını mobil yazdırma için JPEG preview olarak sunar.
 * GET ?id={vehicleId} → data/ruhsat/{vehicleId}.pdf → data/ruhsat_preview/{vehicleId}.jpg
 */

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

$id = trim($_GET['id'] ?? '');
if ($id === '') {
    respondJsonError(400, 'id parametresi gerekli');
}

$safeId = preg_replace('/[^a-zA-Z0-9_-]/', '', $id);
if ($safeId === '') {
    $digitsOnly = preg_replace('/\D/', '', $id);
    $safeId = $digitsOnly !== '' ? 'vehicle_' . $digitsOnly : 'unknown';
}

$sourcePath = __DIR__ . '/data/ruhsat/' . $safeId . '.pdf';
if (!is_file($sourcePath)) {
    respondJsonError(404, 'Ruhsat bulunamadı');
}

$previewDir = __DIR__ . '/data/ruhsat_preview';
if (!is_dir($previewDir) && !mkdir($previewDir, 0755, true) && !is_dir($previewDir)) {
    respondJsonError(500, 'Preview klasörü oluşturulamadı');
}

$previewPath = $previewDir . '/' . $safeId . '.jpg';
$mustGenerate = !is_file($previewPath) || filesize($previewPath) <= 0 || filemtime($previewPath) < filemtime($sourcePath);

if ($mustGenerate) {
    if (!class_exists('Imagick')) {
        respondJsonError(501, 'Sunucuda Imagick desteği yok');
    }

    try {
        $imagick = new Imagick();
        $imagick->setResolution(240, 240);
        $imagick->readImage($sourcePath . '[0]');
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
