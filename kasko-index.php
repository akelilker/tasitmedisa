<?php
/**
 * Kasko kompakt lookup indeks owner'ı.
 * Yalnız include edilmek içindir; doğrudan HTTP çağrısında veri döndürmez.
 */

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    http_response_code(404);
    exit;
}

if (!function_exists('getKaskoListesiFilePath')) {
    require_once __DIR__ . '/core.php';
}

const MEDISA_KASKO_LOOKUP_SCHEMA_VERSION = 1;
const MEDISA_KASKO_LOOKUP_PACKED_FORMAT = 'packed-v1';

function medisaGetKaskoLookupIndexPath() {
    return getDataDirPath() . DIRECTORY_SEPARATOR . '.medisa_kasko_lookup_index.json';
}

function medisaNormalizeKaskoCodePart($value) {
    $digits = preg_replace('/[^0-9]/', '', (string)$value);
    if ($digits === null) {
        $digits = '';
    }
    $digits = ltrim($digits, '0');
    return $digits;
}

function medisaNormalizeKaskoQueryCode($kaskoKodu) {
    $digits = preg_replace('/[^0-9]/', '', (string)$kaskoKodu);
    if ($digits === null) {
        $digits = '';
    }
    return ltrim($digits, '0');
}

function medisaParseKaskoCellValue($rawVal) {
    $cleanVal = preg_replace('/[^0-9,.]/', '', (string)$rawVal);
    if ($cleanVal === null) {
        $cleanVal = '';
    }
    if ($cleanVal === '') {
        return 0.0;
    }
    if (strpos($cleanVal, ',') !== false && strpos($cleanVal, '.') !== false) {
        $cleanVal = str_replace('.', '', $cleanVal);
        $cleanVal = str_replace(',', '.', $cleanVal);
    } elseif (strpos($cleanVal, ',') !== false) {
        $cleanVal = str_replace(',', '.', $cleanVal);
    } elseif (strpos($cleanVal, '.') !== false) {
        $cleanVal = str_replace('.', '', $cleanVal);
    }
    if ($cleanVal === '' || $cleanVal === '.' || $cleanVal === '+' || $cleanVal === '-') {
        return 0.0;
    }
    if (is_numeric($cleanVal)) {
        $num = (float)$cleanVal;
    } else {
        $digits = preg_replace('/\D/', '', $cleanVal);
        $num = ($digits === null || $digits === '') ? 0.0 : (float)$digits;
    }
    return $num;
}

function medisaFindKaskoHeaderRow(array $rows) {
    $limit = min(10, count($rows));
    for ($i = 0; $i < $limit; $i++) {
        $row = $rows[$i] ?? null;
        if (!is_array($row)) {
            continue;
        }
        $rowStr = mb_strtolower(json_encode(array_values($row), JSON_UNESCAPED_UNICODE));
        if ($rowStr !== false && strpos($rowStr, 'marka') !== false && strpos($rowStr, 'kod') !== false) {
            return $i;
        }
    }
    return -1;
}

function medisaEmptyKaskoLookupIndex(array $meta = []) {
    return [
        'schemaVersion' => MEDISA_KASKO_LOOKUP_SCHEMA_VERSION,
        'sourceSize' => (int)($meta['sourceSize'] ?? 0),
        'sourceMtime' => (int)($meta['sourceMtime'] ?? 0),
        'updatedAt' => (string)($meta['updatedAt'] ?? ''),
        'period' => (string)($meta['period'] ?? ''),
        'sourceFileName' => (string)($meta['sourceFileName'] ?? ''),
        'rowCount' => 0,
        'years' => [],
        'duplicateCount' => 0,
        'lookup' => [
            'format' => MEDISA_KASKO_LOOKUP_PACKED_FORMAT,
            'codes' => '',
            'packs' => '',
        ],
    ];
}

function medisaKaskoBase36EncodeUnsigned($n) {
    if (!is_int($n) && !is_float($n)) {
        $n = 0;
    }
    if ($n < 0) {
        $n = 0;
    }
    $asInt = (int)$n;
    if ((float)$asInt === (float)$n) {
        return base_convert((string)$asInt, 10, 36);
    }
    return '~' . rtrim(rtrim(sprintf('%.12F', $n), '0'), '.');
}

function medisaKaskoBase36DecodeUnsigned($token) {
    $token = trim((string)$token);
    if ($token === '') {
        return null;
    }
    if ($token[0] === '~') {
        $raw = substr($token, 1);
        return is_numeric($raw) ? (float)$raw : null;
    }
    if (!preg_match('/^[0-9a-z]+$/i', $token)) {
        return null;
    }
    $dec = base_convert(strtolower($token), 36, 10);
    if ($dec === false || $dec === '') {
        return null;
    }
    return (float)$dec;
}

/**
 * Kaynak payload veya satır matrisinden kompakt packed-v1 indeks üretir.
 *
 * @param array $sourcePayload {updatedAt,period,sourceFileName,rows}
 * @param array $sourceMeta {sourceSize,sourceMtime}
 * @return array
 */
function medisaBuildKaskoLookupIndex(array $sourcePayload, array $sourceMeta = []) {
    $rows = is_array($sourcePayload['rows'] ?? null) ? array_values($sourcePayload['rows']) : [];
    $meta = [
        'sourceSize' => (int)($sourceMeta['sourceSize'] ?? 0),
        'sourceMtime' => (int)($sourceMeta['sourceMtime'] ?? 0),
        'updatedAt' => (string)($sourcePayload['updatedAt'] ?? ''),
        'period' => (string)($sourcePayload['period'] ?? ''),
        'sourceFileName' => (string)($sourcePayload['sourceFileName'] ?? ''),
    ];

    if (count($rows) === 0) {
        return medisaEmptyKaskoLookupIndex($meta);
    }

    $headerRowIndex = medisaFindKaskoHeaderRow($rows);
    if ($headerRowIndex < 0) {
        throw new RuntimeException('Kasko header satiri bulunamadi.');
    }

    $headers = $rows[$headerRowIndex];
    if (!is_array($headers)) {
        throw new RuntimeException('Kasko header satiri gecersiz.');
    }

    $markaIndex = -1;
    $tipIndex = -1;
    $yearsByCol = [];
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
            $yearsByCol[(int)$c] = $ym[1];
        }
    }
    if ($markaIndex === -1) {
        $markaIndex = 0;
    }
    if ($tipIndex === -1) {
        $tipIndex = 1;
    }

    $yearCols = array_keys($yearsByCol);
    sort($yearCols, SORT_NUMERIC);
    $years = [];
    foreach ($yearCols as $col) {
        $years[] = $yearsByCol[$col];
    }

    $entries = [];
    $duplicateCount = 0;
    for ($r = $headerRowIndex + 1, $n = count($rows); $r < $n; $r++) {
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
        if (isset($entries[$code])) {
            $duplicateCount++;
            continue;
        }
        $vals = [];
        foreach ($yearCols as $pos => $col) {
            $num = medisaParseKaskoCellValue($row[$col] ?? '');
            if ($num > 0) {
                $vals[$pos] = $num;
            }
        }
        $entries[$code] = $vals;
    }

    if ($duplicateCount > 0) {
        throw new RuntimeException('Kasko duplicate birlesik kod tespit edildi: ' . $duplicateCount);
    }

    $codeInts = [];
    foreach (array_keys($entries) as $code) {
        if (!ctype_digit((string)$code)) {
            throw new RuntimeException('Kasko birlesik kod numeric degil.');
        }
        $codeInts[] = (int)$code;
    }
    sort($codeInts, SORT_NUMERIC);

    $codesTokens = [];
    $prev = 0;
    foreach ($codeInts as $i => $ci) {
        $delta = ($i === 0) ? $ci : ($ci - $prev);
        $codesTokens[] = medisaKaskoBase36EncodeUnsigned($delta);
        $prev = $ci;
    }

    $packs = [];
    foreach ($codeInts as $ci) {
        $code = (string)$ci;
        $vals = $entries[$code];
        if (!$vals) {
            $packs[] = '';
            continue;
        }
        $positions = array_keys($vals);
        $minP = min($positions);
        $maxP = max($positions);
        $tokens = [];
        for ($p = $minP; $p <= $maxP; $p++) {
            if (!isset($vals[$p])) {
                $tokens[] = '';
                continue;
            }
            $tokens[] = medisaKaskoBase36EncodeUnsigned($vals[$p]);
        }
        $packs[] = medisaKaskoBase36EncodeUnsigned($minP) . '|' . implode(',', $tokens);
    }

    return [
        'schemaVersion' => MEDISA_KASKO_LOOKUP_SCHEMA_VERSION,
        'sourceSize' => $meta['sourceSize'],
        'sourceMtime' => $meta['sourceMtime'],
        'updatedAt' => $meta['updatedAt'],
        'period' => $meta['period'],
        'sourceFileName' => $meta['sourceFileName'],
        'rowCount' => count($codeInts),
        'years' => $years,
        'duplicateCount' => 0,
        'lookup' => [
            'format' => MEDISA_KASKO_LOOKUP_PACKED_FORMAT,
            'codes' => implode(',', $codesTokens),
            'packs' => implode(';', $packs),
        ],
    ];
}

/**
 * Packed indeks wire formunu düz yıl map'ine açar.
 * @return array{years:string[],lookup:array<string,array<string,float|int>>,rowCount:int}
 */
function medisaExpandKaskoPackedLookup(array $index) {
    $years = is_array($index['years'] ?? null) ? array_values($index['years']) : [];
    $years = array_map('strval', $years);
    $packed = $index['lookup'] ?? null;
    $out = [];

    if (!is_array($packed)) {
        return ['years' => $years, 'lookup' => [], 'rowCount' => 0];
    }

    if (($packed['format'] ?? '') !== MEDISA_KASKO_LOOKUP_PACKED_FORMAT) {
        // Düz map (fixture / eski deneme) kabulü
        foreach ($packed as $code => $yearMap) {
            if (!is_array($yearMap)) {
                continue;
            }
            $norm = medisaNormalizeKaskoQueryCode($code);
            if ($norm === '') {
                continue;
            }
            $clean = [];
            foreach ($yearMap as $year => $val) {
                $y = trim((string)$year);
                $n = is_numeric($val) ? (float)$val : 0.0;
                if ($y !== '' && $n > 0) {
                    $clean[$y] = ($n == (int)$n) ? (int)$n : $n;
                }
            }
            $out[$norm] = $clean;
        }
        return ['years' => $years, 'lookup' => $out, 'rowCount' => count($out)];
    }

    $codesRaw = (string)($packed['codes'] ?? '');
    $packsRaw = (string)($packed['packs'] ?? '');
    $codeTokens = ($codesRaw === '') ? [] : explode(',', $codesRaw);
    $packTokens = ($packsRaw === '') ? [] : explode(';', $packsRaw);
    if (count($codeTokens) !== count($packTokens)) {
        throw new RuntimeException('Kasko packed lookup codes/packs uzunlugu uyusmuyor.');
    }

    $prev = 0;
    foreach ($codeTokens as $i => $token) {
        $delta = medisaKaskoBase36DecodeUnsigned($token);
        if ($delta === null) {
            throw new RuntimeException('Kasko packed code token gecersiz.');
        }
        $codeInt = ($i === 0) ? (int)$delta : ($prev + (int)$delta);
        $prev = $codeInt;
        $code = (string)$codeInt;
        $pack = $packTokens[$i];
        $yearMap = [];
        if ($pack !== '') {
            $parts = explode('|', $pack, 2);
            if (count($parts) !== 2) {
                throw new RuntimeException('Kasko packed pack gecersiz.');
            }
            $minP = medisaKaskoBase36DecodeUnsigned($parts[0]);
            if ($minP === null) {
                throw new RuntimeException('Kasko packed minPos gecersiz.');
            }
            $minPos = (int)$minP;
            $valueTokens = ($parts[1] === '') ? [] : explode(',', $parts[1]);
            foreach ($valueTokens as $offset => $vt) {
                if ($vt === '') {
                    continue;
                }
                $num = medisaKaskoBase36DecodeUnsigned($vt);
                if ($num === null || !($num > 0)) {
                    continue;
                }
                $pos = $minPos + $offset;
                if (!isset($years[$pos])) {
                    continue;
                }
                $yearMap[$years[$pos]] = ($num == (int)$num) ? (int)$num : $num;
            }
        }
        $out[$code] = $yearMap;
    }

    return [
        'years' => $years,
        'lookup' => $out,
        'rowCount' => count($out),
    ];
}

function medisaWriteKaskoLookupIndex(array $index) {
    $path = medisaGetKaskoLookupIndexPath();
    $json = json_encode($index, JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        return false;
    }
    return medisaAtomicWriteFile($path, $json);
}

function medisaIsKaskoLookupIndexFresh(array $index, $sourceSize, $sourceMtime) {
    if ((int)($index['schemaVersion'] ?? 0) !== MEDISA_KASKO_LOOKUP_SCHEMA_VERSION) {
        return false;
    }
    if ((int)($index['sourceSize'] ?? -1) !== (int)$sourceSize) {
        return false;
    }
    if ((int)($index['sourceMtime'] ?? -1) !== (int)$sourceMtime) {
        return false;
    }
    $lookup = $index['lookup'] ?? null;
    if (!is_array($lookup)) {
        return false;
    }
    if (($lookup['format'] ?? '') !== MEDISA_KASKO_LOOKUP_PACKED_FORMAT) {
        return false;
    }
    if (!array_key_exists('codes', $lookup) || !array_key_exists('packs', $lookup)) {
        return false;
    }
    return true;
}

/**
 * Canonical kaynaktan index yükler veya yeniden üretir.
 * @return array
 */
function medisaLoadOrBuildKaskoLookupIndex($forceRebuild = false) {
    $sourcePath = getKaskoListesiFilePath();
    $indexPath = medisaGetKaskoLookupIndexPath();

    if (!file_exists($sourcePath)) {
        $empty = medisaEmptyKaskoLookupIndex();
        if ($forceRebuild || !file_exists($indexPath)) {
            @medisaWriteKaskoLookupIndex($empty);
        }
        return $empty;
    }

    $sourceSize = @filesize($sourcePath);
    $sourceMtime = @filemtime($sourcePath);
    if ($sourceSize === false || $sourceMtime === false) {
        throw new RuntimeException('Kasko kaynak dosya metadata okunamadi.');
    }

    if ($forceRebuild !== true && file_exists($indexPath)) {
        $raw = @file_get_contents($indexPath);
        if ($raw !== false && trim($raw) !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded) && medisaIsKaskoLookupIndexFresh($decoded, $sourceSize, $sourceMtime)) {
                return $decoded;
            }
        }
    }

    $content = file_get_contents($sourcePath);
    if ($content === false || trim($content) === '') {
        $empty = medisaEmptyKaskoLookupIndex([
            'sourceSize' => (int)$sourceSize,
            'sourceMtime' => (int)$sourceMtime,
        ]);
        medisaWriteKaskoLookupIndex($empty);
        return $empty;
    }

    $decoded = json_decode($content, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
        throw new RuntimeException('Kasko listesi dosyasi gecersiz JSON.');
    }

    $index = medisaBuildKaskoLookupIndex($decoded, [
        'sourceSize' => (int)$sourceSize,
        'sourceMtime' => (int)$sourceMtime,
    ]);
    if (!medisaWriteKaskoLookupIndex($index)) {
        // Self-heal: caller yine de in-memory index kullanabilir.
        error_log('[Medisa] kasko lookup index yazilamadi');
    }
    return $index;
}

function medisaBuildKaskoIndexApiPayload(array $index) {
    return [
        'success' => true,
        'schemaVersion' => (int)($index['schemaVersion'] ?? MEDISA_KASKO_LOOKUP_SCHEMA_VERSION),
        'updatedAt' => (string)($index['updatedAt'] ?? ''),
        'period' => (string)($index['period'] ?? ''),
        'sourceFileName' => (string)($index['sourceFileName'] ?? ''),
        'rowCount' => (int)($index['rowCount'] ?? 0),
        'years' => is_array($index['years'] ?? null) ? array_values($index['years']) : [],
        'lookup' => is_array($index['lookup'] ?? null) ? $index['lookup'] : [
            'format' => MEDISA_KASKO_LOOKUP_PACKED_FORMAT,
            'codes' => '',
            'packs' => '',
        ],
        'revision' => medisaKaskoIndexRevision($index),
    ];
}

function medisaBuildKaskoMetaApiPayload(array $index) {
    $rowCount = (int)($index['rowCount'] ?? 0);
    return [
        'success' => true,
        'available' => $rowCount > 0,
        'schemaVersion' => (int)($index['schemaVersion'] ?? MEDISA_KASKO_LOOKUP_SCHEMA_VERSION),
        'updatedAt' => (string)($index['updatedAt'] ?? ''),
        'period' => (string)($index['period'] ?? ''),
        'sourceFileName' => (string)($index['sourceFileName'] ?? ''),
        'rowCount' => $rowCount,
        'years' => is_array($index['years'] ?? null) ? array_values($index['years']) : [],
        'revision' => medisaKaskoIndexRevision($index),
    ];
}

function medisaKaskoIndexRevision(array $index) {
    return implode('|', [
        (string)($index['schemaVersion'] ?? ''),
        (string)($index['sourceSize'] ?? ''),
        (string)($index['sourceMtime'] ?? ''),
        (string)($index['updatedAt'] ?? ''),
        (string)($index['rowCount'] ?? ''),
    ]);
}
