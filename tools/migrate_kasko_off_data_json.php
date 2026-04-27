<?php
/**
 * Tek seferlik: data.json içindeki kök kaskoDegerListesi → data/kasko-deger-listesi.json,
 * sonra kök anahtarı kaldırır (saveData ham kasko yazmaz).
 *
 * Çalıştır: php -d memory_limit=512M tools/migrate_kasko_off_data_json.php
 */
require_once dirname(__DIR__) . '/core.php';

$mainPath = getDataFilePath();
if (!file_exists($mainPath)) {
    fwrite(STDERR, "data.json bulunamadı.\n");
    exit(1);
}

$raw = file_get_contents($mainPath);
if ($raw === false) {
    fwrite(STDERR, "data.json okunamadı.\n");
    exit(1);
}

$data = json_decode($raw, true);
if (!is_array($data)) {
    fwrite(STDERR, "data.json geçersiz JSON.\n");
    exit(1);
}

$kasko = $data['kaskoDegerListesi'] ?? null;
if (!$kasko || !is_array($kasko)) {
    echo "kaskoDegerListesi yok veya boş — atlandı.\n";
    exit(0);
}

$payload = [
    'updatedAt' => (string)($kasko['updatedAt'] ?? ''),
    'period' => (string)($kasko['period'] ?? ''),
    'sourceFileName' => (string)($kasko['sourceFileName'] ?? ''),
    'rows' => is_array($kasko['rows'] ?? null) ? array_values($kasko['rows']) : [],
];

$json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
if ($json === false) {
    fwrite(STDERR, "kasko JSON kodlanamadı.\n");
    exit(1);
}

$kPath = getKaskoListesiFilePath();
if (!medisaAtomicWriteFile($kPath, $json)) {
    fwrite(STDERR, "kasko-deger-listesi.json yazılamadı.\n");
    exit(1);
}

unset($data['kaskoDegerListesi']);

if (!saveData($data)) {
    fwrite(STDERR, "data.json kaydedilemedi.\n");
    exit(1);
}

echo "Tamam: kasko listesi ayrı dosyaya taşındı, data.json güncellendi.\n";
exit(0);
