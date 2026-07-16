<?php
/**
 * PERF-P0-1-R1 — PHP firstSeenDates resolve / emergency-cap / izolasyon.
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

// 9.2 — 600 aktif key normalize sonrası kesilmez
$map600 = [];
for ($i = 0; $i < 600; $i++) {
    $map600['active|' . str_pad((string)$i, 4, '0', STR_PAD_LEFT)] = (string)($base - $i);
}
$clean600 = medisaNotificationNormalizeFirstSeenDates($map600);
medisaAssert(count($clean600) === 600, '9.2 normalize keeps 600 keys (no soft-500 hard cut)');

// resolve: client 600, server 600 aynı key farklı değer → server değerleri
$server600 = [];
$client600 = [];
for ($i = 0; $i < 600; $i++) {
    $k = 'active|' . str_pad((string)$i, 4, '0', STR_PAD_LEFT);
    $server600[$k] = (string)($base - 100000 - $i);
    $client600[$k] = (string)($base - $i); // newer client values
}
$resolved600 = medisaNotificationResolveFirstSeenDates($server600, $client600);
medisaAssert(count($resolved600) === 600, '9.2 resolve keeps 600 keys');
medisaAssert($resolved600['active|0000'] === $server600['active|0000'], '9.2/9.3 server timestamp ownership');
medisaAssert($resolved600['active|0000'] !== $client600['active|0000'], '9.3 client newer value rejected');

// 9.4 yeni key
$resolvedNew = medisaNotificationResolveFirstSeenDates(
    ['old' => (string)($base - 5000)],
    ['old' => (string)($base - 5000), 'new' => (string)$base]
);
medisaAssert(isset($resolvedNew['new']) && $resolvedNew['new'] === (string)$base, '9.4 new client key accepted');
medisaAssert($resolvedNew['old'] === (string)($base - 5000), '9.4 existing key kept');

// 9.5 silme persistence
$resolvedDel = medisaNotificationResolveFirstSeenDates(
    ['keep' => (string)$base, 'gone' => (string)($base - 1)],
    ['keep' => (string)$base]
);
medisaAssert(isset($resolvedDel['keep']), '9.5 keep remains');
medisaAssert(!isset($resolvedDel['gone']), '9.5 pruned key stays deleted');

// 9.8 malformed
$invalid = medisaNotificationNormalizeFirstSeenDates([
    '' => '1',
    'x' => '',
    'y' => ['no'],
    'z' => 'NaN',
    'n' => '-5',
    'zero' => '0',
    'inf' => 'Infinity',
    'ok' => (string)$base,
]);
medisaAssert(count($invalid) === 1 && isset($invalid['ok']), '9.8 malformed dropped');

// 9.9 idempotent resolve
$r1 = medisaNotificationResolveFirstSeenDates($server600, $client600);
$r2 = medisaNotificationResolveFirstSeenDates($r1, $r1);
medisaAssert(medisaNotificationFirstSeenMapsEqual($r1, $r2), '9.9 resolve idempotent');

// Emergency cap name + value contract
medisaAssert(medisaNotificationFirstSeenEmergencyMaxKeys() >= 20000, 'emergency max >= 20000');
medisaAssert(medisaNotificationFirstSeenEmergencyMaxKeys() > 500, 'emergency max != client soft 500');

echo "PHP_RETENTION_OK\n";
