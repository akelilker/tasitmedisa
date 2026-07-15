<?php
require_once __DIR__ . '/../core.php';
require_once __DIR__ . '/lib/medisa-portal-accounts-runner.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    echo "CLI only\n";
    exit(1);
}

$safeDir = 'C:\\Users\\Akel\\Desktop\\MEDISA-GUVENLI\\canli-yedekler';
$candidates = glob($safeDir . DIRECTORY_SEPARATOR . 'tasitmedisa-data-canli-*.json');
if ($candidates === false || $candidates === []) {
    fwrite(STDERR, "Uygun canlı yedek bulunamadı.\n");
    exit(1);
}
usort($candidates, function ($a, $b) {
    return filemtime($b) <=> filemtime($a);
});

$source = $candidates[0];
$integrityBefore = medisaPortalAccountsCaptureInputIntegrity(realpath($source) ?: $source);
$raw = file_get_contents($source);
$data = $raw === false ? null : json_decode($raw, true);
if (!is_array($data) || json_last_error() !== JSON_ERROR_NONE) {
    fwrite(STDERR, "Yedek JSON geçersiz.\n");
    exit(1);
}

$counts = medisaPortalAccountsComputeDryRunReport($data);
$unchanged = medisaPortalAccountsVerifyInputIntegrity(realpath($source) ?: $source, $integrityBefore);
if (!$unchanged) {
    fwrite(STDERR, "Yedek dosyanın salt okunur bütünlük kontrolü başarısız.\n");
    exit(1);
}

echo json_encode([
    'backup' => [
        'masked_file' => medisaPortalAccountsMaskBackupName(basename($source)),
        'outside_repo' => true,
        'size_bytes' => $integrityBefore['size'],
        'sha256' => $integrityBefore['sha256'],
        'json_valid' => true,
        'read_only' => true,
        'modified' => false,
    ],
    'dry_run' => $counts,
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . PHP_EOL;
