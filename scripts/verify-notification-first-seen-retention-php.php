<?php
/**
 * PERF-P0-1-R4 — PHP parser parity + save firstSeen owner.
 * Çalıştır: php scripts/verify-notification-first-seen-retention-php.php
 */
date_default_timezone_set('Europe/Istanbul');
require __DIR__ . '/../core.php';

function medisaAssert($cond, $msg) {
    if (!$cond) {
        fwrite(STDERR, "FAIL $msg\n");
        exit(1);
    }
    echo "PASS $msg\n";
}

$OFFSETLESS = [
    '2026-01-15',
    '2026-07-16',
    '2026-01-15T10:30',
    '2026-07-16T10:30',
    '2026-01-15 10:30:45',
    '2026-07-16 10:30:45',
    '16.01.2026 10:30',
    '16.07.2026 10:30',
    '2015-01-15T10:30',
    '2015-07-15T10:30',
];

$SEPARATOR_INVALID = [
    "2026-07-16\t10:30",
    "2026-07-16\n10:30",
];

$VALID = [
    '1721123456789',
    '1721123456',
    '16.07.2026',
    '16/07/2026',
    '16-07-2026',
    '16.07.2026 23:59',
    '16/07/2026 23:59',
    '16-07-2026 23:59',
    '2026-07-16',
    '2026-07-16T10:30',
    '2026-07-16T10:30:00',
    '2026-07-16T10:30:00.1',
    '2026-07-16T10:30:00.12',
    '2026-07-16T10:30:00.123',
    '2026-07-16T10:30Z',
    '2026-07-16T10:30:00Z',
    '2026-07-16T10:30:00.123Z',
    '2026-07-16T10:30+03:00',
    '2026-07-16T10:30:00+03:00',
    '2026-07-16T10:30:00.123+03:00',
    '2026-07-16T10:30+0300',
    '2026-07-16T10:30:00+0300',
    '2026-07-16 10:30',
    '2026-07-16 10:30:00',
    '2015-01-15T10:30',
    '2015-07-15T10:30',
];

$INVALID = [
    '31.02.2026',
    '29.02.2025',
    '2026-02-31',
    '2026-00-16',
    '2026-13-16',
    '2026-07-00',
    '2026-07-32',
    '16.07.2026 24:00',
    '16.07.2026 23:60',
    '2026-07-16T24:00',
    '2026-07-16T23:60',
    '2026-07-16T23:59:60',
    '2026-07-16T10:30+25:00',
    '2026-07-16T10:30+03:60',
    'tomorrow',
    'yesterday',
    'today',
    'now',
    '+1 day',
    '-1 day',
    'next monday',
    '0',
    '-5',
    'NaN',
    'Infinity',
    '',
    "2026-07-16\t10:30",
    "2026-07-16\n10:30",
];

foreach ($VALID as $v) {
    medisaAssert(medisaNotificationParseFirstSeenMs($v) > 0, 'valid ' . $v);
}
foreach ($INVALID as $v) {
    medisaAssert(medisaNotificationParseFirstSeenMs($v) === 0, 'invalid ' . json_encode($v));
}

// Epoch parity samples for offset forms
$a = medisaNotificationParseFirstSeenMs('2026-07-16T10:30:00+03:00');
$b = medisaNotificationParseFirstSeenMs('2026-07-16T10:30:00+0300');
medisaAssert($a > 0 && $a === $b, 'offset +03:00 vs +0300 same epoch');

$base = (string)((int)round(microtime(true) * 1000));
$old = (string)((int)$base - 90000);
$keep = (string)((int)$base - 80000);
$canon = (string)((int)$base - 70000);

$serverLegacy = [
    'readKeys' => ['legacy-read'],
    'dismissedKeys' => ['legacy-dismiss'],
    'firstSeenDates' => [
        'legacy-old' => $old,
        'legacy-keep' => $keep,
    ],
    'migratedFromLocalStorage' => false,
    'updatedAt' => '2026-01-01T00:00:00+03:00',
];
$serverCanonical = [
    'readKeys' => ['canonical-read'],
    'dismissedKeys' => [],
    'firstSeenDates' => [
        'canonical-keep' => $canon,
    ],
    'migratedFromLocalStorage' => false,
    'updatedAt' => '2026-01-02T00:00:00+03:00',
];
$incomingCanonical = [
    'readKeys' => ['canonical-read'],
    'dismissedKeys' => [],
    'firstSeenDates' => [
        'legacy-keep' => (string)((int)$base),
        'canonical-keep' => (string)((int)$base),
    ],
    'migratedFromLocalStorage' => false,
    'updatedAt' => '',
];
$incomingLegacy = [
    'readKeys' => ['legacy-read'],
    'dismissedKeys' => ['legacy-dismiss'],
    'firstSeenDates' => [
        'legacy-old' => (string)((int)$base),
        'legacy-extra' => (string)((int)$base),
    ],
    'migratedFromLocalStorage' => false,
    'updatedAt' => '',
];

$d1 = medisaNotificationResolveScopeFirstSeenSave(
    $serverLegacy,
    $serverCanonical,
    $incomingLegacy,
    $incomingCanonical,
    true
);
medisaAssert($d1['clearLegacyFirstSeen'] === true, '6.1 clear legacy');
medisaAssert($d1['legacyFirstSeen'] === [], '6.1 legacy firstSeen empty');
medisaAssert(!isset($d1['canonicalFirstSeen']['legacy-old']), '6.1 legacy-old gone');
medisaAssert(!isset($d1['canonicalFirstSeen']['legacy-extra']), '6.1 legacy-extra ignored');
medisaAssert($d1['canonicalFirstSeen']['legacy-keep'] === $keep, '6.1 legacy-keep server ownership');
medisaAssert($d1['canonicalFirstSeen']['canonical-keep'] === $canon, '6.1 canonical-keep server ownership');

// 6.3 legacy-only old client
$dLegacyOnly = medisaNotificationResolveScopeFirstSeenSave(
    $serverLegacy,
    $serverCanonical,
    [
        'readKeys' => ['legacy-read'],
        'dismissedKeys' => ['legacy-dismiss'],
        'firstSeenDates' => [
            'legacy-keep' => $keep,
            'legacy-new' => $base,
        ],
        'migratedFromLocalStorage' => false,
        'updatedAt' => '',
    ],
    [],
    false
);
medisaAssert($dLegacyOnly['writeCanonicalFirstSeen'] === false, '6.3 no canonical write');
medisaAssert(isset($dLegacyOnly['legacyFirstSeen']['legacy-new']), '6.3 legacy-only accepts new key');
medisaAssert($dLegacyOnly['legacyFirstSeen']['legacy-keep'] === $keep, '6.3 legacy-only ownership');
medisaAssert(!isset($dLegacyOnly['legacyFirstSeen']['legacy-old']), '6.3 legacy-only prune');

// 6.4 idempotency
$d2 = medisaNotificationResolveScopeFirstSeenSave(
    array_merge($serverLegacy, ['firstSeenDates' => []]),
    array_merge($serverCanonical, ['firstSeenDates' => $d1['canonicalFirstSeen']]),
    $incomingLegacy,
    [
        'readKeys' => ['canonical-read'],
        'dismissedKeys' => [],
        'firstSeenDates' => $d1['canonicalFirstSeen'],
        'migratedFromLocalStorage' => false,
        'updatedAt' => '',
    ],
    true
);
medisaAssert(medisaNotificationFirstSeenMapsEqual($d1['canonicalFirstSeen'], $d2['canonicalFirstSeen']), '6.4 idempotent canonical');
medisaAssert($d2['legacyFirstSeen'] === [], '6.4 legacy stays empty');

// 8.7 600 active
$map600 = [];
for ($i = 0; $i < 600; $i++) {
    $map600['a' . $i] = (string)((int)$base - $i);
}
medisaAssert(count(medisaNotificationNormalizeFirstSeenDates($map600)) === 600, '8.7 keeps 600');

echo "OFFSETLESS_BEGIN\n";
foreach (array_merge($OFFSETLESS, $SEPARATOR_INVALID) as $v) {
    $ms = medisaNotificationParseFirstSeenMs($v);
    echo json_encode($v, JSON_UNESCAPED_UNICODE), "\t", $ms, "\n";
}
echo "OFFSETLESS_END\n";

echo "PARITY_BEGIN\n";
foreach (array_merge($VALID, $INVALID) as $v) {
    $ms = medisaNotificationParseFirstSeenMs($v);
    echo ($ms > 0 ? '1' : '0'), "\t", $ms, "\t", json_encode($v, JSON_UNESCAPED_UNICODE), "\n";
}
echo "PARITY_END\n";
echo "PHP_RETENTION_OK\n";
