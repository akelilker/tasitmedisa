<?php
/**
 * Full-backup ZIP contract fixtures. Production data/** dokunulmaz.
 */
define('MEDISA_FULL_BACKUP_TEST_MODE', true);

$root = dirname(__DIR__);
$failed = 0;
$passed = 0;

function fbAssert($name, $cond) {
    global $passed, $failed;
    if ($cond) {
        $passed++;
        echo "[PASS] {$name}\n";
    } else {
        $failed++;
        echo "[FAIL] {$name}\n";
    }
}

function fbRmTree($dir) {
    if (!is_dir($dir)) return true;
    $ok = true;
    $items = scandir($dir);
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        $path = $dir . DIRECTORY_SEPARATOR . $item;
        if (is_dir($path) && !is_link($path)) {
            $ok = fbRmTree($path) && $ok;
        } else {
            $ok = @unlink($path) && $ok;
        }
    }
    return @rmdir($dir) && $ok;
}

$tempRoot = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'medisa-full-backup-test-' . bin2hex(random_bytes(6));
$dataDir = $tempRoot . DIRECTORY_SEPARATOR . 'data';
$runtimeDir = $dataDir . DIRECTORY_SEPARATOR . '.medisa_full_backup';
$ruhsatDir = $dataDir . DIRECTORY_SEPARATOR . 'ruhsat';
$k2Dir = $dataDir . DIRECTORY_SEPARATOR . 'k2_belgesi';
@mkdir($ruhsatDir, 0700, true);
@mkdir($k2Dir, 0700, true);
@mkdir($runtimeDir, 0700, true);

$pdfBytes = "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n";
$ruhsatRel = 'ruhsat/v1-doc.pdf';
$k2Rel = 'k2_belgesi/settings-k2.pdf';
file_put_contents($ruhsatDir . DIRECTORY_SEPARATOR . 'v1-doc.pdf', $pdfBytes);
file_put_contents($k2Dir . DIRECTORY_SEPARATOR . 'settings-k2.pdf', $pdfBytes);
file_put_contents($dataDir . DIRECTORY_SEPARATOR . 'kasko-deger-listesi.json', json_encode([
    'rows' => [['marka' => 'TEST', 'model' => 'X', 'bedel' => 1]],
], JSON_UNESCAPED_UNICODE));

$fixture = [
    'schema_version' => 'legacy-v1',
    'tasitlar' => [
        [
            'id' => 'v1',
            'plate' => '34 TEST 1',
            'version' => 1,
            'ruhsatPath' => $ruhsatRel,
            'events' => [],
            'belgeler' => [],
        ],
    ],
    'branches' => [['id' => 'b1', 'name' => 'Merkez']],
    'users' => [['id' => 'admin1', 'isim' => 'Admin', 'role' => 'genel_yonetici', 'aktif' => true]],
    'kayitlar' => [],
    'ayarlar' => [
        'sirketAdi' => 'Medisa',
        'k2Belgesi' => [
            'expiryDate' => '2030-01-01',
            'documentPath' => $k2Rel,
            'updatedAt' => '2026-01-01T00:00:00+03:00',
        ],
    ],
    'sifreler' => [],
    'arac_aylik_hareketler' => [],
    'duzeltme_talepleri' => [],
    'notificationReadState' => [],
    'monthlyTodoWhatsAppLogs' => [],
];

$dataFile = $dataDir . DIRECTORY_SEPARATOR . 'data.json';
$dataJson = json_encode($fixture, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
file_put_contents($dataFile, $dataJson);

$GLOBALS['MEDISA_FULL_BACKUP_ENV_OVERRIDE'] = [
    'data_dir' => $dataDir,
    'data_file' => $dataFile,
    'kasko_file' => $dataDir . DIRECTORY_SEPARATOR . 'kasko-deger-listesi.json',
    'last_meta_file' => $dataDir . DIRECTORY_SEPARATOR . '.medisa_full_backup_last.json',
    'runtime_dir' => $runtimeDir,
];
// core getDataFilePath override via restore-style env is separate; full_backup uses env override.
// medisaResolveVehicleDocumentCandidatePath uses getDataDirPath() from core — inject via MEDISA_RESTORE override too.
define('MEDISA_RESTORE_TEST_MODE', true);
$GLOBALS['MEDISA_RESTORE_ENV_OVERRIDE'] = [
    'data_dir' => $dataDir,
    'data_file' => $dataFile,
    'main_backup' => $dataDir . DIRECTORY_SEPARATOR . 'data.json.backup',
    'snapshots_dir' => $dataDir . DIRECTORY_SEPARATOR . 'backups',
    'runtime_dir' => $dataDir . DIRECTORY_SEPARATOR . '.medisa_restore',
    'max_bytes' => 33554432,
    'environment' => 'staging',
    'enabled' => false,
    'maintenance' => false,
    'production_approval' => false,
    'secret' => 'test-full-backup-hmac-secret!!',
];

require_once $root . '/core.php';
require_once $root . '/full_backup.php';

fbAssert('ZipArchive available', class_exists('ZipArchive'));

// --- Complete ZIP PASS ---
$snap = medisaFullBackupCreateSnapshotUnderLock($GLOBALS['MEDISA_FULL_BACKUP_ENV_OVERRIDE']);
fbAssert('complete snapshot success', ($snap['success'] ?? false) === true);
$built = ($snap['success'] ?? false) === true ? medisaFullBackupBuildZipFromSnapshot($snap) : ['success' => false];
fbAssert('complete zip build success', ($built['success'] ?? false) === true);
fbAssert('manifest present', isset($built['manifest']['format']) && $built['manifest']['format'] === 'medisa-full-backup');
fbAssert('manifest has data sha', isset($built['manifest']['data_sha256']) && strlen($built['manifest']['data_sha256']) === 64);
fbAssert('kasko included', in_array('data/kasko-deger-listesi.json', array_column($built['manifest']['files'] ?? [], 'archive_path'), true));
fbAssert('ruhsat included', in_array('data/ruhsat/v1-doc.pdf', array_column($built['manifest']['files'] ?? [], 'archive_path'), true));
fbAssert('k2 included', in_array('data/k2_belgesi/settings-k2.pdf', array_column($built['manifest']['files'] ?? [], 'archive_path'), true));
fbAssert('data.json included', in_array('data/data.json', array_column($built['manifest']['files'] ?? [], 'archive_path'), true));
fbAssert('previews not included', !in_array(true, array_map(function ($p) {
    return strpos($p, '_preview/') !== false;
}, array_column($built['manifest']['files'] ?? [], 'archive_path')), true));

$completeZip = $built['zip_path'] ?? null;
$stagedOk = $completeZip ? medisaFullBackupStageAndValidateZip($completeZip, $GLOBALS['MEDISA_FULL_BACKUP_ENV_OVERRIDE']) : ['success' => false];
fbAssert('complete zip stage+validate PASS', ($stagedOk['success'] ?? false) === true);
if (!empty($stagedOk['stage_dir'])) {
    medisaFullBackupCleanupPaths([$stagedOk['stage_dir']]);
}
medisaFullBackupCleanupPaths([$snap['snapshot_dir'] ?? '', $completeZip]);

// --- Missing referenced PDF FAIL ---
$broken = $fixture;
$broken['tasitlar'][0]['ruhsatPath'] = 'ruhsat/missing.pdf';
file_put_contents($dataFile, json_encode($broken, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
$missingSnap = medisaFullBackupCreateSnapshotUnderLock($GLOBALS['MEDISA_FULL_BACKUP_ENV_OVERRIDE']);
fbAssert('missing referenced PDF FAIL', ($missingSnap['success'] ?? true) === false);
fbAssert('missing referenced error code', ($missingSnap['error_code'] ?? '') === 'MISSING_REFERENCED_FILE');
file_put_contents($dataFile, $dataJson); // restore fixture

// Rebuild a known-good zip for mutation tests
$snap2 = medisaFullBackupCreateSnapshotUnderLock($GLOBALS['MEDISA_FULL_BACKUP_ENV_OVERRIDE']);
$built2 = medisaFullBackupBuildZipFromSnapshot($snap2);
$goodZip = $built2['zip_path'] ?? null;
medisaFullBackupCleanupPaths([$snap2['snapshot_dir'] ?? '']);
fbAssert('good zip for mutation tests', is_string($goodZip) && is_file($goodZip));

function fbMutateZip($srcZip, $mutator) {
    $dir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'medisa-fb-mut-' . bin2hex(random_bytes(4));
    @mkdir($dir, 0700, true);
    $zip = new ZipArchive();
    $zip->open($srcZip);
    $zip->extractTo($dir);
    $zip->close();
    $mutator($dir);
    $out = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'medisa-fb-out-' . bin2hex(random_bytes(4)) . '.zip';
    $outZip = new ZipArchive();
    $outZip->open($out, ZipArchive::CREATE | ZipArchive::OVERWRITE);
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
    foreach ($iterator as $file) {
        if (!$file->isFile()) continue;
        $abs = $file->getPathname();
        $rel = str_replace('\\', '/', substr($abs, strlen($dir) + 1));
        $outZip->addFile($abs, $rel);
    }
    $outZip->close();
    return [$out, $dir];
}

// --- Hash bozuk FAIL ---
list($hashBadZip, $hashBadDir) = fbMutateZip($goodZip, function ($dir) {
    $manifestPath = $dir . DIRECTORY_SEPARATOR . 'manifest.json';
    $m = json_decode(file_get_contents($manifestPath), true);
    $m['files'][0]['sha256'] = str_repeat('a', 64);
    file_put_contents($manifestPath, json_encode($m, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
});
$hashBad = medisaFullBackupStageAndValidateZip($hashBadZip, $GLOBALS['MEDISA_FULL_BACKUP_ENV_OVERRIDE']);
fbAssert('hash bozuk FAIL', ($hashBad['success'] ?? true) === false);
fbAssert('hash bozuk code', in_array(($hashBad['error_code'] ?? ''), ['HASH_MISMATCH', 'DATA_HASH_MISMATCH'], true));
medisaFullBackupCleanupPaths([$hashBadZip, $hashBadDir, $hashBad['stage_dir'] ?? '']);

// --- ../ ZIP path FAIL ---
list($slipZip, $slipDir) = fbMutateZip($goodZip, function ($dir) {
    // rebuild zip with traversal name via direct ZipArchive
});
$slipOut = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'medisa-fb-slip-' . bin2hex(random_bytes(4)) . '.zip';
$slipZ = new ZipArchive();
$slipZ->open($slipOut, ZipArchive::CREATE | ZipArchive::OVERWRITE);
$slipZ->addFromString('manifest.json', file_get_contents($goodZip) ? (function () use ($goodZip) {
    $z = new ZipArchive();
    $z->open($goodZip);
    $m = $z->getFromName('manifest.json');
    $z->close();
    return $m;
})() : '{}');
// open good zip to copy safe entries then add evil
$gz = new ZipArchive();
$gz->open($goodZip);
for ($i = 0; $i < $gz->numFiles; $i++) {
    $name = $gz->getNameIndex($i);
    if ($name === 'manifest.json') {
        $slipZ->addFromString('manifest.json', $gz->getFromIndex($i));
        continue;
    }
    $slipZ->addFromString($name, $gz->getFromIndex($i));
}
$slipZ->addFromString('../evil.txt', 'pwn');
$gz->close();
$slipZ->close();
$slip = medisaFullBackupStageAndValidateZip($slipOut, $GLOBALS['MEDISA_FULL_BACKUP_ENV_OVERRIDE']);
fbAssert('../ ZIP path FAIL', ($slip['success'] ?? true) === false);
fbAssert('zip slip code', ($slip['error_code'] ?? '') === 'ZIP_SLIP');
medisaFullBackupCleanupPaths([$slipOut, $slipDir, $slip['stage_dir'] ?? '']);

// --- malformed manifest FAIL ---
list($malZip, $malDir) = fbMutateZip($goodZip, function ($dir) {
    file_put_contents($dir . DIRECTORY_SEPARATOR . 'manifest.json', '{"format":"nope"}');
});
$mal = medisaFullBackupStageAndValidateZip($malZip, $GLOBALS['MEDISA_FULL_BACKUP_ENV_OVERRIDE']);
fbAssert('malformed manifest FAIL', ($mal['success'] ?? true) === false);
fbAssert('malformed code', ($mal['error_code'] ?? '') === 'MANIFEST_MALFORMED');
medisaFullBackupCleanupPaths([$malZip, $malDir, $mal['stage_dir'] ?? '']);

// --- corrupted JSON FAIL ---
list($badJsonZip, $badJsonDir) = fbMutateZip($goodZip, function ($dir) {
    $dataPath = $dir . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'data.json';
    file_put_contents($dataPath, '{not-json');
    $manifestPath = $dir . DIRECTORY_SEPARATOR . 'manifest.json';
    $m = json_decode(file_get_contents($manifestPath), true);
    foreach ($m['files'] as &$f) {
        if ($f['archive_path'] === 'data/data.json') {
            $raw = file_get_contents($dataPath);
            $f['sha256'] = hash('sha256', $raw);
            $f['size'] = strlen($raw);
        }
    }
    unset($f);
    $m['data_sha256'] = hash('sha256', file_get_contents($dataPath));
    $m['total_bytes'] = array_sum(array_map(function ($x) { return (int)$x['size']; }, $m['files']));
    file_put_contents($manifestPath, json_encode($m, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
});
$badJson = medisaFullBackupStageAndValidateZip($badJsonZip, $GLOBALS['MEDISA_FULL_BACKUP_ENV_OVERRIDE']);
fbAssert('corrupted JSON FAIL', ($badJson['success'] ?? true) === false);
fbAssert('corrupted JSON code', ($badJson['error_code'] ?? '') === 'INVALID_JSON');
medisaFullBackupCleanupPaths([$badJsonZip, $badJsonDir, $badJson['stage_dir'] ?? '']);

// --- unexpected entry FAIL ---
list($unexpZip, $unexpDir) = fbMutateZip($goodZip, function ($dir) {
    $extra = $dir . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'ruhsat' . DIRECTORY_SEPARATOR . 'extra.pdf';
    file_put_contents($extra, "%PDF-1.4\nextra\n%%EOF\n");
});
$unexp = medisaFullBackupStageAndValidateZip($unexpZip, $GLOBALS['MEDISA_FULL_BACKUP_ENV_OVERRIDE']);
fbAssert('unexpected entry FAIL', ($unexp['success'] ?? true) === false);
fbAssert('unexpected entry code', ($unexp['error_code'] ?? '') === 'UNEXPECTED_ENTRY');
medisaFullBackupCleanupPaths([$unexpZip, $unexpDir, $unexp['stage_dir'] ?? '']);

// --- duplicate manifest path FAIL ---
list($dupManZip, $dupManDir) = fbMutateZip($goodZip, function ($dir) {
    $manifestPath = $dir . DIRECTORY_SEPARATOR . 'manifest.json';
    $m = json_decode(file_get_contents($manifestPath), true);
    $m['files'][] = $m['files'][0];
    $m['file_count'] = count($m['files']);
    $m['total_bytes'] = array_sum(array_map(function ($x) { return (int)$x['size']; }, $m['files']));
    file_put_contents($manifestPath, json_encode($m, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
});
$dupMan = medisaFullBackupStageAndValidateZip($dupManZip, $GLOBALS['MEDISA_FULL_BACKUP_ENV_OVERRIDE']);
fbAssert('duplicate manifest path FAIL', ($dupMan['success'] ?? true) === false);
fbAssert('duplicate manifest code', ($dupMan['error_code'] ?? '') === 'DUPLICATE_MANIFEST_PATH');
medisaFullBackupCleanupPaths([$dupManZip, $dupManDir, $dupMan['stage_dir'] ?? '']);

// --- duplicate ZIP path FAIL (raw ZIP with duplicate names) ---
function fbRawStoreZip(array $entries) {
    $local = '';
    $central = '';
    $offset = 0;
    foreach ($entries as $entry) {
        $name = $entry['name'];
        $data = $entry['data'];
        $crc = crc32($data);
        if ($crc < 0) {
            $crc = $crc & 0xFFFFFFFF;
        }
        $size = strlen($data);
        $nameLen = strlen($name);
        $localHeader = pack('VvvvvvVVVvv', 0x04034b50, 20, 0, 0, 0, 0, $crc, $size, $size, $nameLen, 0)
            . $name . $data;
        $central .= pack('VvvvvvvVVVvvvvvVV', 0x02014b50, 20, 20, 0, 0, 0, 0, $crc, $size, $size, $nameLen, 0, 0, 0, 0, 0, $offset)
            . $name;
        $offset += strlen($localHeader);
        $local .= $localHeader;
    }
    $count = count($entries);
    $end = pack('VvvvvVVv', 0x06054b50, 0, 0, $count, $count, strlen($central), strlen($local), 0);
    return $local . $central . $end;
}
$dupZipPath = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'medisa-fb-dup-' . bin2hex(random_bytes(4)) . '.zip';
file_put_contents($dupZipPath, fbRawStoreZip([
    ['name' => 'manifest.json', 'data' => '{"format":"medisa-full-backup","format_version":"1.0","created_at":"2026-01-01T00:00:00+00:00","data_sha256":"' . str_repeat('b', 64) . '","file_count":1,"total_bytes":2,"files":[{"archive_path":"data/data.json","sha256":"' . str_repeat('c', 64) . '","size":2}]}'],
    ['name' => 'data/data.json', 'data' => '{}'],
    ['name' => 'data/data.json', 'data' => '{ }'],
]));
$dupZip = medisaFullBackupStageAndValidateZip($dupZipPath, $GLOBALS['MEDISA_FULL_BACKUP_ENV_OVERRIDE']);
fbAssert('duplicate ZIP path FAIL', ($dupZip['success'] ?? true) === false);
fbAssert('duplicate ZIP code', ($dupZip['error_code'] ?? '') === 'DUPLICATE_ZIP_PATH');
medisaFullBackupCleanupPaths([$dupZipPath, $dupZip['stage_dir'] ?? '']);

// --- ZIP bomb / total uncompressed limit FAIL ---
$limitEnv = $GLOBALS['MEDISA_FULL_BACKUP_ENV_OVERRIDE'];
$limitEnv['max_total_uncompressed_bytes'] = 64;
$bomb = medisaFullBackupStageAndValidateZip($goodZip, $limitEnv);
fbAssert('ZIP bomb / total uncompressed limit FAIL', ($bomb['success'] ?? true) === false);
fbAssert('total uncompressed code', ($bomb['error_code'] ?? '') === 'TOTAL_UNCOMPRESSED_LIMIT');
medisaFullBackupCleanupPaths([$bomb['stage_dir'] ?? '']);

// --- too many entries FAIL ---
$entryEnv = $GLOBALS['MEDISA_FULL_BACKUP_ENV_OVERRIDE'];
$entryEnv['max_entry_count'] = 2;
$tooMany = medisaFullBackupStageAndValidateZip($goodZip, $entryEnv);
fbAssert('too many entries FAIL', ($tooMany['success'] ?? true) === false);
fbAssert('too many entries code', ($tooMany['error_code'] ?? '') === 'TOO_MANY_ENTRIES');
medisaFullBackupCleanupPaths([$tooMany['stage_dir'] ?? '']);

// --- temp cleanup PASS ---
$snapClean = medisaFullBackupCreateSnapshotUnderLock($GLOBALS['MEDISA_FULL_BACKUP_ENV_OVERRIDE']);
$builtClean = medisaFullBackupBuildZipFromSnapshot($snapClean);
$stageClean = medisaFullBackupStageAndValidateZip($builtClean['zip_path'], $GLOBALS['MEDISA_FULL_BACKUP_ENV_OVERRIDE']);
$stagePath = $stageClean['stage_dir'] ?? null;
medisaFullBackupRegisterCleanup($stagePath);
medisaFullBackupRegisterCleanup($builtClean['zip_path'] ?? '');
medisaFullBackupRegisterCleanup($snapClean['snapshot_dir'] ?? '');
medisaFullBackupCleanupAndForget([
    $stagePath,
    $builtClean['zip_path'] ?? '',
    $snapClean['snapshot_dir'] ?? '',
]);
fbAssert('temp cleanup PASS', (!is_string($stagePath) || !is_dir($stagePath))
    && (!isset($builtClean['zip_path']) || !is_file($builtClean['zip_path']))
    && (!isset($snapClean['snapshot_dir']) || !is_dir($snapClean['snapshot_dir'])));

// --- temp not publicly accessible (data/ blocked) ---
$htaccess = file_get_contents($root . '/.htaccess');
fbAssert('temp not publicly accessible via data/ deny', (bool)preg_match('/RewriteRule\s+\^data\(\/\|\$\)\s+-\s+\[F,L,NC\]/', $htaccess));

// --- symlink FAIL (POSIX; Windows may skip) ---
$symlinkSupported = true;
$linkPath = $dataDir . DIRECTORY_SEPARATOR . 'ruhsat' . DIRECTORY_SEPARATOR . 'link.pdf';
@unlink($linkPath);
if (!@symlink($ruhsatDir . DIRECTORY_SEPARATOR . 'v1-doc.pdf', $linkPath)) {
    $symlinkSupported = false;
}
if ($symlinkSupported) {
    $symFix = $fixture;
    $symFix['tasitlar'][0]['ruhsatPath'] = 'ruhsat/link.pdf';
    file_put_contents($dataFile, json_encode($symFix, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    $symSnap = medisaFullBackupCreateSnapshotUnderLock($GLOBALS['MEDISA_FULL_BACKUP_ENV_OVERRIDE']);
    fbAssert('symlink FAIL', ($symSnap['success'] ?? true) === false);
    fbAssert('symlink code', in_array(($symSnap['error_code'] ?? ''), ['SYMLINK_FORBIDDEN', 'MISSING_REFERENCED_FILE'], true));
    file_put_contents($dataFile, $dataJson);
    @unlink($linkPath);
} else {
    fbAssert('symlink FAIL (skipped unsupported platform)', true);
    fbAssert('symlink code (skipped unsupported platform)', true);
}

// --- valid full ZIP PASS (reaffirm) ---
$snap3 = medisaFullBackupCreateSnapshotUnderLock($GLOBALS['MEDISA_FULL_BACKUP_ENV_OVERRIDE']);
$built3 = medisaFullBackupBuildZipFromSnapshot($snap3);
$valid = medisaFullBackupStageAndValidateZip($built3['zip_path'], $GLOBALS['MEDISA_FULL_BACKUP_ENV_OVERRIDE']);
fbAssert('valid full ZIP PASS', ($valid['success'] ?? false) === true);
medisaFullBackupCleanupPaths([$snap3['snapshot_dir'] ?? '', $built3['zip_path'] ?? '', $valid['stage_dir'] ?? '']);

// --- legacy JSON restore still PASS ---
$ayarlar = file_get_contents($root . '/ayarlar.js');
fbAssert('legacy JSON PASS', strpos($ayarlar, 'function processImportedBackupText') !== false
    && strpos($ayarlar, 'processImportedBackupText(event.target.result)') !== false
    && strpos($ayarlar, 'processImportedFullBackupZip') !== false
    && !preg_match('/function processImportedBackupText[\s\S]{0,400}full_backup_restore/', $ayarlar));

fbAssert('validate rejects ..', medisaFullBackupValidateArchivePath('data/../evil.pdf') === null);
fbAssert('validate accepts ruhsat', medisaFullBackupValidateArchivePath('data/ruhsat/v1-doc.pdf') === 'data/ruhsat/v1-doc.pdf');
fbAssert('validate rejects preview', medisaFullBackupValidateArchivePath('data/ruhsat_preview/x.jpg') === null);
fbAssert('validate rejects backup dir', medisaFullBackupValidateArchivePath('data/backups/snapshot-1.json') === null);

@unlink($goodZip);
fbRmTree($tempRoot);

echo "Full backup fixtures: {$passed} passed, {$failed} failed\n";
exit($failed > 0 ? 1 : 0);
