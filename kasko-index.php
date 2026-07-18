<?php
/**
 * Kasko packed-v1 index builder / loader.
 * Canonical full-row source: data/kasko-deger-listesi.json (unchanged).
 * Index file is not served as a static public URL.
 */
if (!defined('MEDISA_KASKO_INDEX_LOADED')) {
    define('MEDISA_KASKO_INDEX_LOADED', true);
}

if (!function_exists('getKaskoIndexFilePath')) {
    function getKaskoIndexFilePath() {
        return getDataDirPath() . DIRECTORY_SEPARATOR . 'kasko-deger-listesi.index.json';
    }
}

if (!function_exists('getKaskoIndexLockPath')) {
    function getKaskoIndexLockPath() {
        return getDataDirPath() . DIRECTORY_SEPARATOR . 'kasko-deger-listesi.index.lock';
    }
}

if (!function_exists('medisaNormalizeKaskoDigits')) {
    function medisaNormalizeKaskoDigits($value) {
        $digits = preg_replace('/[^0-9]/', '', (string)$value);
        if ($digits === null) {
            return '';
        }
        $digits = ltrim($digits, '0');
        return $digits;
    }
}

if (!function_exists('medisaFindKaskoHeaderRow')) {
    function medisaFindKaskoHeaderRow(array $rows) {
        $limit = min(10, count($rows));
        for ($i = 0; $i < $limit; $i++) {
            $row = $rows[$i] ?? null;
            if (!is_array($row)) {
                continue;
            }
            $joined = function_exists('mb_strtolower')
                ? mb_strtolower(json_encode($row, JSON_UNESCAPED_UNICODE), 'UTF-8')
                : strtolower(json_encode($row, JSON_UNESCAPED_UNICODE));
            if ($joined !== false && strpos($joined, 'marka') !== false && strpos($joined, 'kod') !== false) {
                return $i;
            }
        }
        return 1;
    }
}

if (!function_exists('medisaComputeKaskoSourceFingerprint')) {
    function medisaComputeKaskoSourceFingerprint($rawBytes) {
        return hash('sha256', (string)$rawBytes);
    }
}

if (!function_exists('medisaValidateKaskoPackedIndex')) {
    function medisaValidateKaskoPackedIndex($packed, $expectedFingerprint = null) {
        if (!is_array($packed)) {
            return false;
        }
        if ((int)($packed['schemaVersion'] ?? 0) !== 1) {
            return false;
        }
        if (($packed['format'] ?? '') !== 'packed-v1') {
            return false;
        }
        if (!is_string($packed['sourceFingerprint'] ?? null) || $packed['sourceFingerprint'] === '') {
            return false;
        }
        if ($expectedFingerprint !== null && !hash_equals((string)$expectedFingerprint, (string)$packed['sourceFingerprint'])) {
            return false;
        }
        if (!isset($packed['rowCount']) || !is_numeric($packed['rowCount'])) {
            return false;
        }
        if (!is_array($packed['years'] ?? null) || !is_array($packed['dictionary'] ?? null)) {
            return false;
        }
        if (!is_array($packed['keys'] ?? null) || !is_array($packed['values'] ?? null)) {
            return false;
        }
        if (count($packed['keys']) !== count($packed['values'])) {
            return false;
        }
        if ((int)$packed['rowCount'] !== count($packed['keys'])) {
            return false;
        }
        if (array_key_exists('rows', $packed) && is_array($packed['rows']) && count($packed['rows']) > 0) {
            return false;
        }
        return true;
    }
}

if (!function_exists('medisaBuildKaskoPackedV1FromCanonical')) {
    function medisaBuildKaskoPackedV1FromCanonical(array $decoded, $fingerprint) {
        $rows = isset($decoded['rows']) && is_array($decoded['rows']) ? array_values($decoded['rows']) : [];
        $headerRowIndex = medisaFindKaskoHeaderRow($rows);
        $headers = isset($rows[$headerRowIndex]) && is_array($rows[$headerRowIndex]) ? $rows[$headerRowIndex] : [];

        $markaIndex = -1;
        $tipIndex = -1;
        $years = [];
        $yearCols = [];
        foreach ($headers as $c => $headerCell) {
            $h = function_exists('mb_strtolower')
                ? mb_strtolower(trim((string)$headerCell), 'UTF-8')
                : strtolower(trim((string)$headerCell));
            $hRaw = preg_replace('/\.0$/', '', trim((string)$headerCell));
            if (strpos($h, 'marka') !== false && strpos($h, 'kod') !== false) {
                $markaIndex = (int)$c;
            }
            if ((strpos($h, 'tip') !== false || strpos($h, 'model') !== false) && strpos($h, 'kod') !== false) {
                $tipIndex = (int)$c;
            }
            if (preg_match('/^\d{4}$/', (string)$hRaw)) {
                $years[] = (string)$hRaw;
                $yearCols[] = (int)$c;
            }
        }
        if ($markaIndex < 0) {
            $markaIndex = 0;
        }
        if ($tipIndex < 0) {
            $tipIndex = 1;
        }

        $dictionary = [0];
        $dictMap = ['0' => 0];
        $dictId = function ($num) use (&$dictionary, &$dictMap) {
            $key = (string)$num;
            if (isset($dictMap[$key])) {
                return $dictMap[$key];
            }
            $id = count($dictionary);
            $dictionary[] = $num + 0;
            $dictMap[$key] = $id;
            return $id;
        };

        $keys = [];
        $values = [];
        $keySeen = [];

        $rowCount = count($rows);
        for ($r = $headerRowIndex + 1; $r < $rowCount; $r++) {
            $row = $rows[$r] ?? null;
            if (!is_array($row) || count($row) < 2) {
                continue;
            }
            $key = medisaNormalizeKaskoDigits($row[$markaIndex] ?? '') . medisaNormalizeKaskoDigits($row[$tipIndex] ?? '');
            if ($key === '') {
                continue;
            }
            $cellIds = [];
            foreach ($yearCols as $c) {
                $raw = $row[$c] ?? 0;
                if (is_numeric($raw)) {
                    $n = $raw + 0;
                } else {
                    $cv = preg_replace('/[^0-9,.]/', '', (string)$raw);
                    if (strpos($cv, ',') !== false && strpos($cv, '.') !== false) {
                        $cv = str_replace('.', '', $cv);
                        $cv = str_replace(',', '.', $cv);
                    } elseif (strpos($cv, ',') !== false) {
                        $cv = str_replace(',', '.', $cv);
                    } elseif (strpos($cv, '.') !== false) {
                        $cv = str_replace('.', '', $cv);
                    }
                    $n = is_numeric($cv) ? ($cv + 0) : 0;
                }
                if (!is_finite($n) || $n < 0) {
                    $n = 0;
                }
                $cellIds[] = $dictId($n);
            }

            if (isset($keySeen[$key])) {
                $values[$keySeen[$key]] = $cellIds;
            } else {
                $keySeen[$key] = count($keys);
                $keys[] = $key;
                $values[] = $cellIds;
            }
        }

        return [
            'schemaVersion' => 1,
            'format' => 'packed-v1',
            'sourceFingerprint' => (string)$fingerprint,
            'updatedAt' => (string)($decoded['updatedAt'] ?? ''),
            'period' => (string)($decoded['period'] ?? ''),
            'sourceFileName' => (string)($decoded['sourceFileName'] ?? ''),
            'rowCount' => count($keys),
            'years' => $years,
            'dictionary' => $dictionary,
            'keys' => $keys,
            'values' => $values,
        ];
    }
}

if (!function_exists('medisaReadCanonicalKaskoRaw')) {
    function medisaReadCanonicalKaskoRaw() {
        $path = getKaskoListesiFilePath();
        if (!file_exists($path)) {
            return '';
        }
        $raw = file_get_contents($path);
        return ($raw === false) ? '' : $raw;
    }
}

if (!function_exists('medisaReadCanonicalKaskoDecoded')) {
    function medisaReadCanonicalKaskoDecoded() {
        $raw = medisaReadCanonicalKaskoRaw();
        if ($raw === '') {
            return [
                'updatedAt' => '',
                'period' => '',
                'sourceFileName' => '',
                'rows' => [],
            ];
        }
        $decoded = json_decode($raw, true);
        if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
            return null;
        }
        return [
            'updatedAt' => (string)($decoded['updatedAt'] ?? ''),
            'period' => (string)($decoded['period'] ?? ''),
            'sourceFileName' => (string)($decoded['sourceFileName'] ?? ''),
            'rows' => isset($decoded['rows']) && is_array($decoded['rows']) ? array_values($decoded['rows']) : [],
            '_raw' => $raw,
            '_fingerprint' => medisaComputeKaskoSourceFingerprint($raw),
        ];
    }
}

if (!function_exists('medisaWriteKaskoPackedIndexAtomic')) {
    function medisaWriteKaskoPackedIndexAtomic(array $packed) {
        if (!medisaValidateKaskoPackedIndex($packed)) {
            return false;
        }
        $json = json_encode($packed, JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            return false;
        }
        $path = getKaskoIndexFilePath();
        return medisaAtomicWriteFile($path, $json);
    }
}

if (!function_exists('medisaBuildOrLoadKaskoPackedIndex')) {
    /**
     * @return array|false packed index or false on hard failure
     */
    function medisaBuildOrLoadKaskoPackedIndex($forceRebuild = false) {
        $lockPath = getKaskoIndexLockPath();
        $lockFp = @fopen($lockPath, 'c+');
        if ($lockFp === false) {
            return false;
        }
        if (!flock($lockFp, LOCK_EX)) {
            fclose($lockFp);
            return false;
        }

        try {
            $canonical = medisaReadCanonicalKaskoDecoded();
            if ($canonical === null) {
                return false;
            }
            $fingerprint = (string)($canonical['_fingerprint'] ?? '');
            $indexPath = getKaskoIndexFilePath();

            if (!$forceRebuild && file_exists($indexPath)) {
                $existingRaw = file_get_contents($indexPath);
                if ($existingRaw !== false && trim($existingRaw) !== '') {
                    $existing = json_decode($existingRaw, true);
                    if (medisaValidateKaskoPackedIndex($existing, $fingerprint)) {
                        return $existing;
                    }
                }
            }

            unset($canonical['_raw']);
            $packed = medisaBuildKaskoPackedV1FromCanonical($canonical, $fingerprint);
            if (!medisaWriteKaskoPackedIndexAtomic($packed)) {
                return false;
            }
            return $packed;
        } finally {
            flock($lockFp, LOCK_UN);
            fclose($lockFp);
        }
    }
}

if (!function_exists('medisaKaskoPackedMetaFromIndex')) {
    function medisaKaskoPackedMetaFromIndex(array $packed) {
        return [
            'success' => true,
            'format' => (string)($packed['format'] ?? 'packed-v1'),
            'schemaVersion' => (int)($packed['schemaVersion'] ?? 1),
            'sourceFingerprint' => (string)($packed['sourceFingerprint'] ?? ''),
            'updatedAt' => (string)($packed['updatedAt'] ?? ''),
            'period' => (string)($packed['period'] ?? ''),
            'sourceFileName' => (string)($packed['sourceFileName'] ?? ''),
            'rowCount' => (int)($packed['rowCount'] ?? 0),
            'dictionaryCount' => is_array($packed['dictionary'] ?? null) ? count($packed['dictionary']) : 0,
            'yearCount' => is_array($packed['years'] ?? null) ? count($packed['years']) : 0,
        ];
    }
}
