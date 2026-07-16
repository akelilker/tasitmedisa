<?php
/**
 * PERF-P0-1-R2 — PHP firstSeenDates resolve / legacy / parser parity.
 * Çalıştır: php scripts/verify-notification-first-seen-retention-php.php
 */
require __DIR__ . '/../core.php';

function medisaAssert($cond, $msg) {
    if (!$cond) {
        fwrite(STDERR, "FAIL $msg\n");
        exit(1);
    }
    echo "PASS $msg\n";
}

$base = (int)round(microtime(true) * 1000);

// 8.7 — 600 aktif key
$map600 = [];
for ($i = 0; $i < 600; $i++) {
    $map600['active|' . str_pad((string)$i, 4, '0', STR_PAD_LEFT)] = (string)($base - $i);
}
$clean600 = medisaNotificationNormalizeFirstSeenDates($map600);
medisaAssert(count($clean600) === 600, '8.7 normalize keeps 600 keys');

$server600 = [];
$client600 = [];
for ($i = 0; $i < 600; $i++) {
    $k = 'active|' . str_pad((string)$i, 4, '0', STR_PAD_LEFT);
    $server600[$k] = (string)($base - 100000 - $i);
    $client600[$k] = (string)($base - $i);
}
$resolved600 = medisaNotificationResolveFirstSeenDates($server600, $client600);
medisaAssert(count($resolved600) === 600, '8.7 resolve keeps 600 keys');
medisaAssert($resolved600['active|0000'] === $server600['active|0000'], '8.7/9.3 server timestamp ownership');

// 8.2 / 8.3 — legacy projection + resolve + ownership
$legacyMap = [
    'legacy-old' => (string)($base - 90000),
    'legacy-keep' => (string)($base - 80000),
];
$canonicalMap = [
    'canonical-keep' => (string)($base - 70000),
];
$projected = medisaNotificationProjectFirstSeenDates($legacyMap, $canonicalMap);
medisaAssert(isset($projected['legacy-old'], $projected['legacy-keep'], $projected['canonical-keep']), '8.2 projection merges legacy+canonical');

$clientPruned = [
    'legacy-keep' => (string)($base), // newer manipulated
    'canonical-keep' => (string)($base - 70000),
];
$resolved = medisaNotificationResolveFirstSeenDates($projected, $clientPruned);
medisaAssert(!isset($resolved['legacy-old']), '8.2 pruned legacy-old removed');
medisaAssert($resolved['legacy-keep'] === $legacyMap['legacy-keep'], '8.3 legacy timestamp ownership preserved');
medisaAssert($resolved['canonical-keep'] === $canonicalMap['canonical-keep'], '8.3 canonical timestamp preserved');

// Reload projection after migration (canonical has resolved, legacy empty)
$after = medisaNotificationProjectFirstSeenDates([], $resolved);
medisaAssert(!isset($after['legacy-old']), '8.2 reload projection does not resurrect legacy-old');
medisaAssert(isset($after['legacy-keep'], $after['canonical-keep']), '8.2 reload keeps pruned set');

// 8.6 parser fixtures
$valid = [
    '1721123456789',
    '1721123456',
    '16.07.2026',
    '16/07/2026 23:59',
    '2026-07-16',
    '2026-07-16T10:30:00+03:00',
];
$invalid = [
    '31.02.2026',
    '29.02.2025',
    '2026-02-31',
    '16.07.2026 24:01',
    '16.07.2026 23:60',
    'tomorrow',
    '+1 day',
    'next monday',
    '0',
    '-5',
    'NaN',
    'Infinity',
    '',
];
foreach ($valid as $v) {
    medisaAssert(medisaNotificationParseFirstSeenMs($v) > 0, '8.6 PHP valid ' . $v);
}
foreach ($invalid as $v) {
    medisaAssert(medisaNotificationParseFirstSeenMs($v) === 0, '8.6 PHP invalid ' . $v);
}

// malformed non-scalars via normalize
$invalidMap = medisaNotificationNormalizeFirstSeenDates([
    '' => '1',
    'x' => '',
    'y' => ['no'],
    'z' => 'NaN',
    'n' => '-5',
    'zero' => '0',
    'inf' => 'Infinity',
    'ok' => (string)$base,
]);
medisaAssert(count($invalidMap) === 1 && isset($invalidMap['ok']), '9.8 malformed dropped');

medisaAssert(medisaNotificationFirstSeenEmergencyMaxKeys() >= 20000, 'emergency max >= 20000');

// Emit machine-readable parity rows for Node to compare
echo "PARITY_BEGIN\n";
foreach (array_merge($valid, $invalid) as $v) {
    $ok = medisaNotificationParseFirstSeenMs($v) > 0 ? '1' : '0';
    echo $ok, "\t", str_replace(["\t", "\n"], [' ', ' '], $v), "\n";
}
echo "PARITY_END\n";
echo "PHP_RETENTION_OK\n";
