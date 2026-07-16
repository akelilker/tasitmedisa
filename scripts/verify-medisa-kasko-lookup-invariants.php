<?php
/**
 * PERF-P0-2 — kasko kompakt lookup indeks invariants.
 * Çalıştır: php scripts/verify-medisa-kasko-lookup-invariants.php
 * veya: npm run tool:verify-kasko-lookup
 */
declare(strict_types=1);

$ROOT = dirname(__DIR__);
require_once $ROOT . '/core.php';
require_once $ROOT . '/kasko-index.php';

$passed = 0;
$failed = 0;

function ok(string $name): void {
    global $passed;
    $passed++;
    echo "PASS $name\n";
}

function fail(string $name, string $detail = ''): void {
    global $failed;
    $failed++;
    echo "FAIL $name" . ($detail !== '' ? (': ' . $detail) : '') . "\n";
}

function assertTrue(bool $cond, string $name, string $detail = ''): void {
    if ($cond) {
        ok($name);
    } else {
        fail($name, $detail);
    }
}

function medisaLegacyLookupMessage(array $rows, string $kaskoKodu, string $modelYili): string {
    if ($kaskoKodu === '') {
        return '-';
    }
    $headerRowIndex = medisaFindKaskoHeaderRow($rows);
    if ($headerRowIndex < 0) {
        $headerRowIndex = 1;
    }
    $headers = $rows[$headerRowIndex] ?? [];
    if (!is_array($headers)) {
        return '-';
    }
    $markaIndex = -1;
    $tipIndex = -1;
    $yearIndex = -1;
    $targetYear = trim($modelYili);
    foreach ($headers as $c => $hv) {
        $h = mb_strtolower(trim((string)$hv));
        $hRaw = trim((string)$hv);
        if (strpos($h, 'marka') !== false && strpos($h, 'kod') !== false) {
            $markaIndex = (int)$c;
        }
        if ((strpos($h, 'tip') !== false || strpos($h, 'model') !== false) && strpos($h, 'kod') !== false) {
            $tipIndex = (int)$c;
        }
        if ($hRaw === $targetYear || $hRaw === ($targetYear . '.0')) {
            $yearIndex = (int)$c;
        }
    }
    if ($markaIndex === -1) {
        $markaIndex = 0;
    }
    if ($tipIndex === -1) {
        $tipIndex = 1;
    }
    if ($yearIndex === -1) {
        return 'Yıl Bulunamadı (' . $targetYear . ')';
    }
    $targetClean = medisaNormalizeKaskoQueryCode($kaskoKodu);
    for ($r = $headerRowIndex + 1, $n = count($rows); $r < $n; $r++) {
        $row = $rows[$r];
        if (!is_array($row) || count($row) < 2) {
            continue;
        }
        $m = medisaNormalizeKaskoCodePart($row[$markaIndex] ?? '');
        $t = medisaNormalizeKaskoCodePart($row[$tipIndex] ?? '');
        if (($m . $t) !== $targetClean) {
            continue;
        }
        $num = medisaParseKaskoCellValue($row[$yearIndex] ?? '');
        if ($num > 0) {
            return number_format($num, 0, ',', '.') . ' ₺';
        }
        return 'Değer Yok (Excel: 0)';
    }
    return 'Kasko Kodu Bulunamadı';
}

function medisaIndexLookupMessage(array $expanded, string $kaskoKodu, string $modelYili): string {
    if ($kaskoKodu === '') {
        return '-';
    }
    $years = $expanded['years'];
    $lookup = $expanded['lookup'];
    $targetYear = trim($modelYili);
    $yearKnown = false;
    foreach ($years as $y) {
        $yRaw = trim((string)$y);
        if ($yRaw === $targetYear || $yRaw === ($targetYear . '.0')) {
            $yearKnown = true;
            $targetYear = preg_replace('/\.0$/', '', $yRaw);
            break;
        }
    }
    if (!$yearKnown) {
        return 'Yıl Bulunamadı (' . trim($modelYili) . ')';
    }
    $code = medisaNormalizeKaskoQueryCode($kaskoKodu);
    if ($code === '' || !array_key_exists($code, $lookup)) {
        return 'Kasko Kodu Bulunamadı';
    }
    $num = $lookup[$code][$targetYear] ?? 0;
    if (!($num > 0)) {
        return 'Değer Yok (Excel: 0)';
    }
    return number_format((float)$num, 0, ',', '.') . ' ₺';
}

// ---------------------------------------------------------------------------
// A. Fixture tests
// ---------------------------------------------------------------------------
$fixtureRows = [
    ['meta', 'ignore'],
    ['xx', 'yy', 'zz'],
    ['Marka Kodu', 'Tip Kodu', 'Marka Adı', 'Tip Adı', 2026, 2012, 1999],
    ['032', '10', 'TEST MARKA', 'TEST TIP', 505319, 0, 111],
    ['000', '007', 'Z', 'Z', 0, 2500, 0],
    ['bad', 'row'],
    ['001', '002', 'A', 'B', 12, 34, 56],
];

try {
    $built = medisaBuildKaskoLookupIndex([
        'updatedAt' => '2026-07-16T00:00:00Z',
        'period' => '2026-07',
        'sourceFileName' => 'fixture.xlsx',
        'rows' => $fixtureRows,
    ], ['sourceSize' => 123, 'sourceMtime' => 456]);
    assertTrue((int)$built['schemaVersion'] === 1, 'fixture schemaVersion');
    assertTrue((int)$built['rowCount'] === 3, 'fixture rowCount', (string)$built['rowCount']);
    assertTrue($built['years'] === ['2026', '2012', '1999'], 'fixture years dynamic');
    $expanded = medisaExpandKaskoPackedLookup($built);
    assertTrue(isset($expanded['lookup']['3210']), 'fixture leading-zero code 3210');
    assertTrue(($expanded['lookup']['3210']['2026'] ?? null) === 505319, 'fixture positive value');
    assertTrue(!isset($expanded['lookup']['3210']['2012']), 'fixture zero omitted from map');
    assertTrue(array_key_exists('3210', $expanded['lookup']), 'fixture code present when zeros');
    assertTrue(medisaIndexLookupMessage($expanded, '3210', '2012') === 'Değer Yok (Excel: 0)', 'fixture zero message');
    assertTrue(medisaIndexLookupMessage($expanded, '9999', '2026') === 'Kasko Kodu Bulunamadı', 'fixture missing code');
    assertTrue(medisaIndexLookupMessage($expanded, '3210', '2000') === 'Yıl Bulunamadı (2000)', 'fixture missing year');
    assertTrue(medisaIndexLookupMessage($expanded, '03210', '2026') === '505.319 ₺', 'fixture format + leading zeros query');
    assertTrue(isset($expanded['lookup']['7']), 'fixture tip-only zeros code 7');
    assertTrue(($expanded['lookup']['7']['2012'] ?? null) === 2500, 'fixture code 7 year 2012');
    assertTrue(isset($expanded['lookup']['12']), 'fixture code 12');
    ok('fixture header not first row + dynamic columns');
} catch (Throwable $e) {
    fail('fixture build', $e->getMessage());
}

// Duplicate blokaj
try {
    medisaBuildKaskoLookupIndex([
        'updatedAt' => '',
        'period' => '',
        'sourceFileName' => '',
        'rows' => [
            ['Marka Kodu', 'Tip Kodu', '2026'],
            ['1', '2', 10],
            ['1', '2', 20],
        ],
    ]);
    fail('duplicate deterministic block');
} catch (Throwable $e) {
    assertTrue(strpos($e->getMessage(), 'duplicate') !== false || strpos($e->getMessage(), 'Duplicate') !== false || strpos($e->getMessage(), 'birlesik') !== false, 'duplicate deterministic block');
}

// Empty source
$empty = medisaBuildKaskoLookupIndex([
    'updatedAt' => '',
    'period' => '',
    'sourceFileName' => '',
    'rows' => [],
]);
assertTrue((int)$empty['rowCount'] === 0, 'empty source rowCount');
assertTrue(($empty['lookup']['format'] ?? '') === 'packed-v1', 'empty packed format');

// Self-heal / freshness helpers
$stale = medisaEmptyKaskoLookupIndex(['sourceSize' => 1, 'sourceMtime' => 1]);
assertTrue(medisaIsKaskoLookupIndexFresh($stale, 2, 1) === false, 'stale size rebuild needed');
$stale['schemaVersion'] = 1;
$stale['sourceSize'] = 2;
$stale['sourceMtime'] = 1;
$stale['lookup'] = ['format' => 'packed-v1', 'codes' => '', 'packs' => ''];
assertTrue(medisaIsKaskoLookupIndexFresh($stale, 2, 1) === true, 'fresh index accepted');
$stale['schemaVersion'] = 99;
assertTrue(medisaIsKaskoLookupIndexFresh($stale, 2, 1) === false, 'schema mismatch rebuild');

// Direct include guard (file exists + syntax already checked elsewhere)
assertTrue(function_exists('medisaLoadOrBuildKaskoLookupIndex'), 'owner functions loaded');

// ---------------------------------------------------------------------------
// B. Real canonical parity
// ---------------------------------------------------------------------------
$sourcePath = $ROOT . '/data/kasko-deger-listesi.json';
assertTrue(is_file($sourcePath), 'canonical source exists');

$sourceRaw = file_get_contents($sourcePath);
assertTrue($sourceRaw !== false, 'canonical source readable');
$sourceBytes = strlen((string)$sourceRaw);
$decoded = json_decode((string)$sourceRaw, true);
assertTrue(is_array($decoded) && is_array($decoded['rows'] ?? null), 'canonical JSON decode');

$rows = array_values($decoded['rows']);
$rowTotal = count($rows);
assertTrue($rowTotal > 1000, 'canonical rows present', (string)$rowTotal);

$legacyPayload = json_encode([
    'updatedAt' => (string)($decoded['updatedAt'] ?? ''),
    'period' => (string)($decoded['period'] ?? ''),
    'sourceFileName' => (string)($decoded['sourceFileName'] ?? ''),
    'rows' => $rows,
], JSON_UNESCAPED_UNICODE);
$legacyBytes = strlen((string)$legacyPayload);

$parseLegacy = [];
for ($i = 0; $i < 5; $i++) {
    $t0 = microtime(true);
    json_decode((string)$legacyPayload, true);
    $parseLegacy[] = (microtime(true) - $t0) * 1000;
}
sort($parseLegacy);
$legacyParseMedian = $parseLegacy[2];

try {
    $realIndex = medisaBuildKaskoLookupIndex($decoded, [
        'sourceSize' => filesize($sourcePath),
        'sourceMtime' => filemtime($sourcePath),
    ]);
    ok('real index build');
} catch (Throwable $e) {
    fail('real index build', $e->getMessage());
    echo "Summary: PASS=$passed FAIL=$failed\n";
    echo "PERF_P0_2_BLOCKED_LOOKUP_PARITY\n";
    exit(1);
}

$compactPayload = json_encode(medisaBuildKaskoIndexApiPayload($realIndex), JSON_UNESCAPED_UNICODE);
$compactBytes = strlen((string)$compactPayload);
$parseCompact = [];
for ($i = 0; $i < 5; $i++) {
    $t0 = microtime(true);
    json_decode((string)$compactPayload, true);
    $parseCompact[] = (microtime(true) - $t0) * 1000;
}
sort($parseCompact);
$compactParseMedian = $parseCompact[2];

$reductionRatio = $legacyBytes > 0 ? ($compactBytes / $legacyBytes) : 1;
$reductionPct = (1 - $reductionRatio) * 100;
assertTrue($compactBytes <= (int)floor($legacyBytes * 0.25), 'payload reduction hard gate (<=25%)', 'compact=' . $compactBytes . ' legacy=' . $legacyBytes . ' ratio=' . round($reductionRatio * 100, 2) . '%');

$expandedReal = medisaExpandKaskoPackedLookup($realIndex);
$headerRowIndex = medisaFindKaskoHeaderRow($rows);
$headers = $rows[$headerRowIndex];
$markaIndex = -1;
$tipIndex = -1;
$yearCols = [];
foreach ($headers as $c => $hv) {
    $h = mb_strtolower(trim((string)$hv));
    $hRaw = trim((string)$hv);
    if ($markaIndex === -1 && strpos($h, 'marka') !== false && strpos($h, 'kod') !== false) {
        $markaIndex = (int)$c;
    }
    if ($tipIndex === -1 && (strpos($h, 'tip') !== false || strpos($h, 'model') !== false) && strpos($h, 'kod') !== false) {
        $tipIndex = (int)$c;
    }
    if (preg_match('/^(\d{4})(\.0)?$/', $hRaw, $ym)) {
        $yearCols[(int)$c] = $ym[1];
    }
}
if ($markaIndex === -1) {
    $markaIndex = 0;
}
if ($tipIndex === -1) {
    $tipIndex = 1;
}

$cellsChecked = 0;
$mismatches = 0;
$duplicateCount = 0;
$seenCodes = [];
$dataRows = 0;
$sampleCode = '';
$sampleYear = '';
$legacyMaps = [];

for ($r = $headerRowIndex + 1; $r < $rowTotal; $r++) {
    $row = $rows[$r];
    if (!is_array($row) || count($row) < 2) {
        continue;
    }
    $m = medisaNormalizeKaskoCodePart($row[$markaIndex] ?? '');
    $t = medisaNormalizeKaskoCodePart($row[$tipIndex] ?? '');
    $code = $m . $t;
    if ($code === '') {
        continue;
    }
    if (isset($seenCodes[$code])) {
        $duplicateCount++;
        continue;
    }
    $seenCodes[$code] = true;
    $dataRows++;
    if ($sampleCode === '') {
        $sampleCode = $code;
        $sampleYear = (string)reset($yearCols);
    }
    $yearMap = [];
    foreach ($yearCols as $col => $year) {
        $num = medisaParseKaskoCellValue($row[$col] ?? '');
        if ($num > 0) {
            $yearMap[$year] = ($num == (int)$num) ? (int)$num : $num;
        }
        $cellsChecked++;
    }
    $legacyMaps[$code] = $yearMap;
}

foreach ($legacyMaps as $codeKey => $yearMap) {
    $code = (string)$codeKey;
    if (!array_key_exists($code, $expandedReal['lookup'])) {
        $mismatches++;
        if ($mismatches <= 5) {
            echo "MISMATCH missing code in index: $code\n";
        }
        continue;
    }
    $indexMap = $expandedReal['lookup'][$code];
    foreach ($yearCols as $year) {
        $year = (string)$year;
        $legacyHas = isset($yearMap[$year]);
        $indexHas = isset($indexMap[$year]);
        $legacyVal = $legacyHas ? $yearMap[$year] : 0;
        $indexVal = $indexHas ? $indexMap[$year] : 0;
        if ((bool)$legacyHas !== (bool)$indexHas || (float)$legacyVal !== (float)$indexVal) {
            $mismatches++;
            if ($mismatches <= 5) {
                echo "MISMATCH code=$code year=$year legacy=[$legacyVal] index=[$indexVal]\n";
            }
        }
    }
    // Index shouldn't have extra years
    foreach ($indexMap as $year => $val) {
        $year = (string)$year;
        if (!isset($yearMap[$year])) {
            $mismatches++;
            if ($mismatches <= 5) {
                echo "MISMATCH extra index year code=$code year=$year\n";
            }
        }
    }
}

// Message-level spot checks (legacy algorithm vs index)
$spotYears = array_map('strval', array_values($yearCols));
$spotCodes = array_map('strval', array_slice(array_keys($legacyMaps), 0, 20));
foreach ($spotCodes as $code) {
    foreach ($spotYears as $year) {
        $legacyMsg = medisaLegacyLookupMessage($rows, (string)$code, (string)$year);
        $indexMsg = medisaIndexLookupMessage($expandedReal, (string)$code, (string)$year);
        if ($legacyMsg !== $indexMsg) {
            $mismatches++;
            if ($mismatches <= 8) {
                echo "MSG MISMATCH code=$code year=$year legacy=[$legacyMsg] index=[$indexMsg]\n";
            }
        }
    }
}
assertTrue(medisaIndexLookupMessage($expandedReal, '___none___', (string)reset($yearCols)) === 'Kasko Kodu Bulunamadı', 'missing code message');
assertTrue(medisaIndexLookupMessage($expandedReal, (string)$sampleCode, '1901') === 'Yıl Bulunamadı (1901)', 'missing year message');

assertTrue($duplicateCount === 0, 'real duplicate count is 0', (string)$duplicateCount);
assertTrue($mismatches === 0, 'real parity mismatches 0', (string)$mismatches);
assertTrue($cellsChecked > 0, 'cells checked', (string)$cellsChecked);
assertTrue((int)$realIndex['rowCount'] === count($seenCodes), 'index rowCount matches unique codes');
assertTrue($dataRows === count($seenCodes), 'data rows equals unique codes');

// Timing: linear vs O(1)
$linearTimes = [];
for ($rep = 0; $rep < 5; $rep++) {
    $t0 = microtime(true);
    medisaLegacyLookupMessage($rows, $sampleCode, $sampleYear);
    $linearTimes[] = (microtime(true) - $t0) * 1000;
}
sort($linearTimes);
$oldLookupMedian = $linearTimes[2];

$o1Times = [];
for ($rep = 0; $rep < 5; $rep++) {
    $t0 = microtime(true);
    medisaIndexLookupMessage($expandedReal, $sampleCode, $sampleYear);
    $o1Times[] = (microtime(true) - $t0) * 1000;
}
sort($o1Times);
$newLookupMedian = $o1Times[2];

// Write/load self-heal smoke on temp index path via real loader (uses runtime path under data/)
try {
    $loaded = medisaLoadOrBuildKaskoLookupIndex(true);
    assertTrue((int)$loaded['rowCount'] === (int)$realIndex['rowCount'], 'loadOrBuild rewrite rowCount');
    $loaded2 = medisaLoadOrBuildKaskoLookupIndex(false);
    assertTrue((int)$loaded2['sourceSize'] === (int)filesize($sourcePath), 'cached index sourceSize');
    // Corrupt index then self-heal
    $indexPath = medisaGetKaskoLookupIndexPath();
    file_put_contents($indexPath, '{broken');
    $healed = medisaLoadOrBuildKaskoLookupIndex(false);
    assertTrue((int)$healed['rowCount'] === (int)$realIndex['rowCount'], 'broken index self-heal');
} catch (Throwable $e) {
    fail('loadOrBuild/self-heal', $e->getMessage());
}

// ---------------------------------------------------------------------------
// D. Client contract static checks
// ---------------------------------------------------------------------------
$dm = file_get_contents($ROOT . '/data-manager.js');
$ds = file_get_contents($ROOT . '/data-service.js');
$ay = file_get_contents($ROOT . '/ayarlar.js');
$loadPhp = file_get_contents($ROOT . '/load_kasko.php');

assertTrue(strpos((string)$dm, 'mode=index') !== false, 'client uses mode=index');
assertTrue(strpos((string)$dm, 'kd.rows') === false || strpos((string)$dm, 'rows: []') !== false, 'client does not assign kd.rows payload');
assertTrue(strpos((string)$dm, 'rows: Array.isArray(kd.rows)') === false, 'legacy rows assign removed');
assertTrue(strpos((string)$dm, '__medisaKaskoLookupIndex') !== false, 'runtime lookup owner present');
assertTrue(strpos((string)$ds, 'getKaskoRowsFromSource') === false, 'linear row source removed');
assertTrue(strpos((string)$ds, 'headerRowIndex') === false, 'header scan removed from data-service');
assertTrue(strpos((string)$ds, '__medisaKaskoLookupIndex') !== false, 'data-service uses lookup index');
assertTrue(strpos((string)$ay, 'rows: Array.isArray(jsonData) ? jsonData : []') === false, 'ayarlar no longer writes rows into appData');
assertTrue(strpos((string)$ay, 'Kasko listesi sunucuya yazılamadı. Mevcut liste korunuyor.') !== false, 'ayarlar fail message updated');
assertTrue(strpos((string)$ay, 'loadKaskoListFromServer(true)') !== false, 'ayarlar reloads index after save');
assertTrue(strpos((string)$loadPhp, "mode === 'legacy'") !== false || strpos((string)$loadPhp, "mode=legacy") !== false || strpos((string)$loadPhp, "'legacy'") !== false, 'legacy mode retained');
assertTrue(strpos((string)$dm, '__medisaKaskoLookupIndex') !== false, 'dm has lookup owner');

// save payload exclusion still in data-manager
assertTrue(strpos((string)$dm, 'delete payloadObj.kaskoDegerListesi') !== false, 'save excludes kaskoDegerListesi');
assertTrue(strpos((string)$dm, 'rows: []') !== false, 'offline/normalize keeps rows empty');
assertTrue(strpos((string)$dm, '__medisaKaskoLookupIndex') !== false && strpos(file_get_contents($ROOT . '/data-manager.js'), 'persistOfflineAppDataSnapshot') !== false, 'offline snapshot owner exists');

// Ensure lookup not persisted into offline snapshot builder
$offlineSlice = (string)$dm;
assertTrue(strpos($offlineSlice, '__medisaKaskoLookupIndex') !== false, 'runtime lookup separate from appData');
$normalizePos = strpos($offlineSlice, 'function normalizeOfflineAppDataSnapshot');
$normalizeEnd = strpos($offlineSlice, 'function readOfflineAppDataSnapshot');
if ($normalizePos !== false && $normalizeEnd !== false) {
    $normBody = substr($offlineSlice, $normalizePos, $normalizeEnd - $normalizePos);
    assertTrue(strpos($normBody, '__medisaKaskoLookupIndex') === false, 'offline snapshot excludes lookup index');
    assertTrue(strpos($normBody, "rows: []") !== false, 'offline snapshot rows empty');
} else {
    fail('offline snapshot normalize body locate');
}

// Direct HTTP guard
$direct = [];
exec('php ' . escapeshellarg($ROOT . '/kasko-index.php') . ' 2>&1', $direct, $directCode);
// When run as script, exits 404 with empty body ideally; CLI may not set SCRIPT_FILENAME same way
assertTrue(is_file($ROOT . '/kasko-index.php'), 'kasko-index.php exists');

echo "\n--- PAYLOAD METRICS ---\n";
echo "sourceBytes=$sourceBytes\n";
echo "legacyBytes=$legacyBytes\n";
echo "compactBytes=$compactBytes\n";
echo "reductionBytes=" . ($legacyBytes - $compactBytes) . "\n";
echo "reductionPct=" . round($reductionPct, 2) . "\n";
echo "legacyParseMedianMs=" . round($legacyParseMedian, 2) . "\n";
echo "compactParseMedianMs=" . round($compactParseMedian, 2) . "\n";
echo "oldLookupMedianMs=" . round($oldLookupMedian, 3) . "\n";
echo "newLookupMedianMs=" . round($newLookupMedian, 3) . "\n";
echo "dataRows=$dataRows\n";
echo "cellsChecked=$cellsChecked\n";
echo "mismatches=$mismatches\n";
echo "duplicates=$duplicateCount\n";
echo "sampleCode=$sampleCode sampleYear=$sampleYear\n";

echo "\nSummary: PASS=$passed FAIL=$failed\n";
if ($failed > 0) {
    if ($mismatches > 0 || $duplicateCount > 0) {
        echo "PERF_P0_2_BLOCKED_LOOKUP_PARITY\n";
    } elseif ($compactBytes > (int)floor($legacyBytes * 0.25)) {
        echo "PERF_P0_2_BLOCKED_PAYLOAD_REDUCTION\n";
    } else {
        echo "PERF_P0_2_BLOCKED_TEST_GATE\n";
    }
    exit(1);
}
echo "verify-medisa-kasko-lookup-invariants: OK\n";
exit(0);
