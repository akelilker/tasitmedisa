<?php
/**
 * Taşıt Yönetim Sistemi - PHP Core
 * Veri yolu, yükleme/kaydetme ve token doğrulama
 */

/** Veri dosyasının tam yolu */
function getDataFilePath() {
    return __DIR__ . '/data/data.json';
}

/** Veri dosyasını oku ve decode et. Hata durumunda null döner. */
function loadData() {
    $path = getDataFilePath();
    if (!file_exists($path)) {
        return null;
    }
    $content = file_get_contents($path);
    if ($content === false) {
        return null;
    }
    $data = json_decode($content, true);
    return (json_last_error() === JSON_ERROR_NONE) ? $data : null;
}

/** Veriyi dosyaya kaydet. Başarılı ise true, hata durumunda false döner. */
function saveData($data) {
    $path = getDataFilePath();
    $dir = dirname($path);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    return file_put_contents($path, $json, LOCK_EX) !== false;
}

/** Bearer token doğrula. Geçerliyse decode edilmiş token, değilse null döner. */
function validateToken() {
    $headers = getallheaders();
    $authHeader = $headers['Authorization'] ?? '';
    if (empty($authHeader)) {
        return null;
    }
    $token = str_replace('Bearer ', '', $authHeader);
    $decoded = json_decode(base64_decode($token), true);
    if (!$decoded || !isset($decoded['exp']) || $decoded['exp'] < time()) {
        return null;
    }
    return $decoded;
}
