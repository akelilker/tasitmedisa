<?php
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo "CLI only\n";
    exit(1);
}

require_once __DIR__ . '/../core.php';
require_once __DIR__ . '/lib/medisa-portal-accounts-runner.php';

function medisaPortalAccountsCliUsage() {
    fwrite(STDERR, "Kullanım:\n");
    fwrite(STDERR, "  php scripts/apply-medisa-portal-accounts.php --input=<repo-dışı-data.json> --output-dir=<repo-dışı-klasör> [--mode=dry-run|apply] [--password-policy=preserve-legacy|rotate-all-active] [--confirm=KULLANICI_HESAPLARINI_OLUSTUR]\n");
}

$options = getopt('', ['input:', 'output-dir:', 'mode::', 'confirm::', 'password-policy::']);
$inputPath = isset($options['input']) ? trim((string)$options['input']) : '';
$outputDir = isset($options['output-dir']) ? trim((string)$options['output-dir']) : '';
$mode = isset($options['mode']) ? strtolower(trim((string)$options['mode'])) : 'dry-run';
$confirm = isset($options['confirm']) ? trim((string)$options['confirm']) : '';
$passwordPolicy = medisaPortalAccountsNormalizePasswordPolicy($options['password-policy'] ?? 'preserve-legacy');

if ($inputPath === '' || $outputDir === '') {
    medisaPortalAccountsCliUsage();
    exit(1);
}
if ($mode !== 'dry-run' && $mode !== 'apply') {
    fwrite(STDERR, "Geçersiz mode: {$mode}\n");
    exit(1);
}
if ($passwordPolicy !== 'preserve-legacy' && $passwordPolicy !== 'rotate-all-active') {
    fwrite(STDERR, "Geçersiz password-policy: {$passwordPolicy}\n");
    exit(1);
}
if ($mode === 'apply' && $confirm !== 'KULLANICI_HESAPLARINI_OLUSTUR') {
    fwrite(STDERR, "Apply modu için --confirm=KULLANICI_HESAPLARINI_OLUSTUR zorunludur.\n");
    exit(1);
}

$inputReal = medisaPortalAccountsResolvePathOutsideRepo($inputPath, true);
$outputReal = medisaPortalAccountsResolveOutputDirOutsideRepo($outputDir);
if ($inputReal === null) {
    fwrite(STDERR, "Input dosyası repo dışında geçerli bir JSON dosyası olmalıdır.\n");
    exit(1);
}
if ($outputReal === null) {
    fwrite(STDERR, "Output klasörü repo dışında olmalıdır.\n");
    exit(1);
}

$integrityBefore = medisaPortalAccountsCaptureInputIntegrity($inputReal);
$raw = file_get_contents($inputReal);
$data = $raw === false ? null : json_decode($raw, true);
if (!is_array($data) || json_last_error() !== JSON_ERROR_NONE) {
    fwrite(STDERR, "Input JSON geçersiz.\n");
    exit(1);
}

$beforeUsers = array_values($data['users'] ?? []);
$dryRun = $passwordPolicy === 'rotate-all-active'
    ? medisaPortalAccountsComputeRotateAllDryRunReport($data)
    : medisaPortalAccountsComputeDryRunReport($data);
$exampleUsername = medisaBuildPortalUsernameBase('Serhan Köse');
$transformOptions = ['password_policy' => $passwordPolicy];

if ($mode === 'dry-run') {
    if (!medisaPortalAccountsVerifyInputIntegrity($inputReal, $integrityBefore)) {
        fwrite(STDERR, "Input bütünlük kontrolü başarısız.\n");
        exit(1);
    }
    echo json_encode([
        'mode' => 'dry-run',
        'password_policy' => $passwordPolicy,
        'input' => [
            'masked_file' => medisaPortalAccountsMaskBackupName(basename($inputReal)),
            'outside_repo' => true,
            'size_bytes' => $integrityBefore['size'],
            'sha256' => $integrityBefore['sha256'],
            'json_valid' => true,
            'read_only' => true,
            'modified' => false,
        ],
        'dry_run' => $dryRun,
        'examples' => [
            'serhan_kose_username' => $exampleUsername,
        ],
        'outputs' => [
            'json_created' => false,
            'csv_created' => false,
            'passwords_generated' => false,
        ],
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . PHP_EOL;
    exit(0);
}

try {
    $transformed = medisaPortalAccountsTransformData($data, true, $transformOptions);
    if ($passwordPolicy === 'rotate-all-active') {
        medisaPortalAccountsValidateRotateAllTransformedData(
            $transformed['data'],
            $beforeUsers,
            $transformed['transform_meta'] ?? []
        );
    } else {
        medisaPortalAccountsValidateTransformedData($transformed['data'], $beforeUsers);
    }
} catch (Throwable $e) {
    fwrite(STDERR, 'Apply dönüşümü başarısız: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}

if (!medisaPortalAccountsVerifyInputIntegrity($inputReal, $integrityBefore)) {
    fwrite(STDERR, "Input dosyası apply sırasında değişti.\n");
    exit(1);
}

$outputNames = medisaPortalAccountsBuildOutputBasenames();
$jsonPath = $outputReal . DIRECTORY_SEPARATOR . $outputNames['json'];
$csvPath = $outputReal . DIRECTORY_SEPARATOR . $outputNames['csv'];
$jsonContent = json_encode($transformed['data'], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
if ($jsonContent === false) {
    fwrite(STDERR, "Output JSON encode başarısız.\n");
    exit(1);
}
$csvContent = medisaPortalAccountsBuildCsvContent($transformed['csv_rows']);

if (!medisaPortalAccountsWriteAtomic($jsonPath, $jsonContent)) {
    fwrite(STDERR, "Output JSON yazılamadı.\n");
    exit(1);
}
if (!medisaPortalAccountsWriteAtomic($csvPath, $csvContent)) {
    @unlink($jsonPath);
    fwrite(STDERR, "Output CSV yazılamadı.\n");
    exit(1);
}
$jsonSha = hash_file('sha256', $jsonPath);
$csvSha = hash_file('sha256', $csvPath);
if (!medisaPortalAccountsHardenOutputAcl($jsonPath) || !medisaPortalAccountsHardenOutputAcl($csvPath)) {
    @unlink($jsonPath);
    @unlink($csvPath);
    fwrite(STDERR, "Output ACL sıkılaştırması başarısız.\n");
    exit(1);
}

if (!medisaPortalAccountsVerifyInputIntegrity($inputReal, $integrityBefore)) {
    @unlink($jsonPath);
    @unlink($csvPath);
    fwrite(STDERR, "Input dosyası apply sonrası değişti.\n");
    exit(1);
}

echo json_encode([
    'mode' => 'apply',
    'password_policy' => $passwordPolicy,
    'input' => [
        'masked_file' => medisaPortalAccountsMaskBackupName(basename($inputReal)),
        'sha256_before' => $integrityBefore['sha256'],
        'sha256_after' => hash_file('sha256', $inputReal),
        'modified' => false,
    ],
    'outputs' => [
        'json_file' => basename($jsonPath),
        'csv_file' => basename($csvPath),
        'json_sha256' => $jsonSha,
        'csv_sha256' => $csvSha,
        'csv_row_count' => count($transformed['csv_rows']),
        'outside_repo' => true,
    ],
    'stats' => $transformed['stats'],
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . PHP_EOL;
