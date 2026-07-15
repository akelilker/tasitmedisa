<?php
/**
 * Toplu portal hesap apply aracı — sentetik fixture testleri.
 * Çalıştır: php scripts/verify-medisa-portal-accounts-apply.php
 */
require_once __DIR__ . '/../core.php';
require_once __DIR__ . '/lib/medisa-portal-accounts-runner.php';

$passed = 0;
$failed = 0;

function paAssert($label, $condition) {
    global $passed, $failed;
    if ($condition) {
        $passed++;
        echo "[PASS] {$label}\n";
        return;
    }
    $failed++;
    echo "[FAIL] {$label}\n";
}

function paAssertSame($label, $expected, $actual) {
    paAssert($label, $expected === $actual);
}

function paMakeTempOutsideRepo() {
    $base = rtrim(sys_get_temp_dir(), '\\/') . DIRECTORY_SEPARATOR . 'medisa-portal-apply-' . bin2hex(random_bytes(4));
    if (!is_dir($base) && !mkdir($base, 0700, true)) {
        throw new RuntimeException('Temp klasör oluşturulamadı.');
    }
    $repo = medisaPortalAccountsRepoRoot();
    $real = realpath($base);
    if ($real === false || str_starts_with(strtolower($real), strtolower($repo . DIRECTORY_SEPARATOR))) {
        throw new RuntimeException('Temp klasör repo içinde.');
    }
    return $real;
}

function paWriteJson($path, array $data) {
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if ($json === false || file_put_contents($path, $json) === false) {
        throw new RuntimeException('Fixture yazılamadı.');
    }
}

function paRunCli(array $args) {
    $script = escapeshellarg(__DIR__ . '/apply-medisa-portal-accounts.php');
    $parts = ['php', $script];
    foreach ($args as $arg) {
        $parts[] = escapeshellarg($arg);
    }
    $command = implode(' ', $parts);
    $output = [];
    $exitCode = 1;
    exec($command . ' 2>&1', $output, $exitCode);
    return [
        'exit' => $exitCode,
        'output' => implode("\n", $output),
    ];
}

$fixtureDir = paMakeTempOutsideRepo();
$inputFile = $fixtureDir . DIRECTORY_SEPARATOR . 'fixture-input.json';
$outputDir = $fixtureDir . DIRECTORY_SEPARATOR . 'out';
mkdir($outputDir, 0700, true);

$legacyPassword = medisaGenerateInitialPortalPassword();
$existingPassword = medisaGenerateInitialPortalPassword();
$fixture = [
    'users' => [
        [
            'id' => 'u-existing',
            'isim' => 'Ali Veli',
            'kullanici_adi' => 'aliV',
            'sifre' => $existingPassword,
            'aktif' => true,
            'rol' => 'kullanici',
            'sube' => 'Merkez',
            'zimmetli_araclar' => ['v1'],
        ],
        [
            'id' => 'u-new',
            'isim' => 'Serhan Köse',
            'aktif' => true,
            'rol' => 'kullanici',
            'sube' => 'Merkez',
        ],
        [
            'id' => 'u-collision',
            'isim' => 'Serhan Kaya',
            'aktif' => true,
            'rol' => 'kullanici',
        ],
        [
            'id' => 'u-passive',
            'isim' => 'Pasif Kullanici',
            'aktif' => false,
            'rol' => 'kullanici',
            'sifre' => $legacyPassword,
        ],
        [
            'id' => 'u-hash-only',
            'isim' => 'Hash Sahibi',
            'kullanici_adi' => 'hashS',
            'sifre_hash' => password_hash($legacyPassword, PASSWORD_DEFAULT),
            'aktif' => true,
            'rol' => 'genel_yonetici',
            'ilk_giris_parola_onerisi_gosterildi_tarihi' => '2026-01-01T00:00:00+00:00',
            'ilk_giris_parola_onerisi_bekliyor' => false,
        ],
    ],
    'tasitlar' => [
        ['id' => 'v1', 'plaka' => '34AAA01'],
    ],
];
paWriteJson($inputFile, $fixture);
$inputIntegrity = medisaPortalAccountsCaptureInputIntegrity($inputFile);

paAssertSame('Serhan Köse username', 'serhanK', medisaBuildPortalUsernameBase('Serhan Köse'));
paAssertSame('Collision username', 'serhanK2', medisaCreateUniquePortalUsername('Serhan Kaya', [
    ['id' => 'x', 'kullanici_adi' => 'serhanK'],
], 'u-collision'));

$dryRun = paRunCli([
    '--input=' . $inputFile,
    '--output-dir=' . $outputDir,
    '--mode=dry-run',
]);
paAssert('Dry-run exit 0', $dryRun['exit'] === 0);
paAssert('Dry-run input degismedi', medisaPortalAccountsVerifyInputIntegrity($inputFile, $inputIntegrity));
paAssert('Dry-run json output yok', count(glob($outputDir . DIRECTORY_SEPARATOR . 'tasitmedisa-data-hazir-*.json')) === 0);
paAssert('Dry-run csv output yok', count(glob($outputDir . DIRECTORY_SEPARATOR . 'tasitmedisa-baslangic-hesaplari-*.csv')) === 0);

$applyNoConfirm = paRunCli([
    '--input=' . $inputFile,
    '--output-dir=' . $outputDir,
    '--mode=apply',
]);
paAssert('Apply confirmation olmadan reddedilir', $applyNoConfirm['exit'] !== 0);

$applyWrongConfirm = paRunCli([
    '--input=' . $inputFile,
    '--output-dir=' . $outputDir,
    '--mode=apply',
    '--confirm=YANLIS',
]);
paAssert('Yanlis confirmation reddedilir', $applyWrongConfirm['exit'] !== 0);

$repoInput = medisaPortalAccountsRepoRoot() . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'data.json';
if (is_file($repoInput)) {
    $repoReject = paRunCli([
        '--input=' . $repoInput,
        '--output-dir=' . $outputDir,
        '--mode=dry-run',
    ]);
    paAssert('Repo icindeki input reddedilir', $repoReject['exit'] !== 0);
} else {
    $fakeRepoInput = medisaPortalAccountsRepoRoot() . DIRECTORY_SEPARATOR . 'core.php';
    $repoReject = paRunCli([
        '--input=' . $fakeRepoInput,
        '--output-dir=' . $outputDir,
        '--mode=dry-run',
    ]);
    paAssert('Repo icindeki input reddedilir', $repoReject['exit'] !== 0);
}

$repoOutReject = paRunCli([
    '--input=' . $inputFile,
    '--output-dir=' . medisaPortalAccountsRepoRoot(),
    '--mode=dry-run',
]);
paAssert('Repo icindeki output reddedilir', $repoOutReject['exit'] !== 0);

paAssert('CLI guard mevcut', str_contains(file_get_contents(__DIR__ . '/apply-medisa-portal-accounts.php'), "PHP_SAPI !== 'cli'"));

$data = json_decode(file_get_contents($inputFile), true);
$beforeUsers = array_values($data['users']);
$transformed = medisaPortalAccountsTransformData($data, true);
medisaPortalAccountsValidateTransformedData($transformed['data'], $beforeUsers);

$usersById = [];
foreach ($transformed['data']['users'] as $user) {
    $usersById[(string)$user['id']] = $user;
}

paAssertSame('Mevcut username korunur', 'aliV', $usersById['u-existing']['kullanici_adi'] ?? '');
paAssert('Legacy parola hashlenir', medisaVerifyUserPassword($usersById['u-existing'], $existingPassword));
paAssert('Legacy duz metin kaldirildi', !array_key_exists('sifre', $usersById['u-existing']));
paAssertSame('Yeni kullanici username', 'serhanK', $usersById['u-new']['kullanici_adi'] ?? '');
paAssertSame('Collision username sonuc', 'serhanK2', $usersById['u-collision']['kullanici_adi'] ?? '');
paAssert('Yeni kullanici hash var', trim((string)($usersById['u-new']['sifre_hash'] ?? '')) !== '');
paAssert('Pasif kullaniciya yeni credential verilmez', trim((string)($usersById['u-passive']['kullanici_adi'] ?? '')) === '');
paAssert('Kullanici sayisi korunur', count($transformed['data']['users']) === count($beforeUsers));
paAssert('Rol alani korunur', ($usersById['u-hash-only']['rol'] ?? '') === 'genel_yonetici');
paAssert('Arac atamasi korunur', ($usersById['u-existing']['zimmetli_araclar'][0] ?? '') === 'v1');
paAssert('Credential disi sube korunur', ($usersById['u-existing']['sube'] ?? '') === 'Merkez');
paAssert('Hash-only mevcut hash korunur', medisaVerifyUserPassword($usersById['u-hash-only'], $legacyPassword));
paAssert('Yeni hesapta ilk giris onerisi', ($usersById['u-new']['ilk_giris_parola_onerisi_bekliyor'] ?? null) === true);
paAssert('Tamamlanmis oneri yeniden acilmaz', ($usersById['u-hash-only']['ilk_giris_parola_onerisi_bekliyor'] ?? null) === false);

$plainCount = 0;
foreach ($transformed['data']['users'] as $user) {
    if (is_array($user) && array_key_exists('sifre', $user) && trim((string)$user['sifre']) !== '') {
        $plainCount++;
    }
    $projected = medisaProjectUserForClient($user);
    paAssert('Projection hash yok', !array_key_exists('sifre_hash', $projected));
}
paAssertSame('Duz metin alan sifir', 0, $plainCount);

$csvCell = medisaPortalAccountsBuildCsvCell('=1+1');
paAssert('CSV formula injection korumasi', str_starts_with($csvCell, "'"));

$csvContent = medisaPortalAccountsBuildCsvContent($transformed['csv_rows']);
paAssert('CSV UTF-8 BOM', str_starts_with($csvContent, "\xEF\xBB\xBF"));
paAssert('CSV yeni parola satiri var', str_contains($csvContent, 'serhanK'));
paAssert('CSV hash-only durum metni', str_contains($csvContent, 'MEVCUT_HASH_KORUNDU'));

$aclFile = $outputDir . DIRECTORY_SEPARATOR . 'acl-test.txt';
file_put_contents($aclFile, 'acl');
paAssert('ACL kod yolu Windows', PHP_OS_FAMILY !== 'Windows' || medisaPortalAccountsHardenOutputAcl($aclFile));
@unlink($aclFile);

paAssert('Input hash apply oncesi/sonrasi', medisaPortalAccountsVerifyInputIntegrity($inputFile, $inputIntegrity));

$jsonPath = $outputDir . DIRECTORY_SEPARATOR . 'manual-apply.json';
$manualCsvPath = $outputDir . DIRECTORY_SEPARATOR . 'manual-apply.csv';
paAssert('Output JSON syntax', medisaPortalAccountsWriteAtomic($jsonPath, json_encode($transformed['data'], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)));
$decoded = json_decode(file_get_contents($jsonPath), true);
paAssert('Output JSON gecerli', is_array($decoded) && json_last_error() === JSON_ERROR_NONE);
@unlink($jsonPath);
@unlink($manualCsvPath);

$lookup = [];
foreach ($transformed['data']['users'] as $user) {
    if (!medisaPortalAccountsUserIsActive($user)) {
        continue;
    }
    $key = medisaPortalUsernameKey($user['kullanici_adi'] ?? '');
    if ($key === '') {
        continue;
    }
    paAssert('Username unique ' . $key, !isset($lookup[$key]));
    $lookup[$key] = true;
}

$dismissUser = [
    'id' => 'u-dismiss',
    'sifre_hash' => password_hash(medisaGenerateInitialPortalPassword(), PASSWORD_DEFAULT),
    'ilk_giris_parola_onerisi_bekliyor' => true,
];
$hashBeforeDismiss = $dismissUser['sifre_hash'];
medisaDismissInitialPasswordSuggestion($dismissUser);
paAssert('Devam seciminde hash degismez', $hashBeforeDismiss === $dismissUser['sifre_hash']);
paAssert('Devam sonrasi oneri kapali', ($dismissUser['ilk_giris_parola_onerisi_bekliyor'] ?? null) === false);

echo 'Summary: PASS=' . $passed . ' FAIL=' . $failed . PHP_EOL;
if ($failed > 0) {
    exit(1);
}
echo "verify-medisa-portal-accounts-apply: OK\n";
