<?php
require_once __DIR__ . '/inspect-medisa-runtime-data-health.php';

$passed = 0;
$failed = 0;
function rdhAssert(string $name, bool $ok): void {
    global $passed, $failed;
    if ($ok) { $passed++; echo "[PASS] $name\n"; }
    else { $failed++; echo "[FAIL] $name\n"; }
}

$dir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'medisa-rdh-' . bin2hex(random_bytes(6));
mkdir($dir, 0700, true);
$path = $dir . DIRECTORY_SEPARATOR . 'data.json';
$fixture = [
    'tasitlar' => [['id' => 'v1', 'plate' => 'PII-MARKER', 'events' => [['id' => 'e1']]]],
    'users' => [['id' => 'u1', 'isim' => 'SECRET-NAME']],
    'branches' => [['id' => 'b1']],
    'kayitlar' => [],
    'ayarlar' => [],
    'notificationReadState' => ['scope:legacy' => true, 'user:u1' => true],
    'monthlyTodoWhatsAppLogs' => [],
];
file_put_contents($path, json_encode($fixture, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

$ok = rdhInspect($path, 1024 * 1024, 2 * 1024 * 1024);
rdhAssert('valid fixture OK', ($ok['status'] ?? '') === 'OK');
rdhAssert('counts only', ($ok['record_counts']['vehicles'] ?? 0) === 1 && ($ok['record_counts']['events'] ?? 0) === 1);
$encoded = json_encode($ok, JSON_UNESCAPED_UNICODE);
rdhAssert('report PII-free', strpos($encoded, 'PII-MARKER') === false && strpos($encoded, 'SECRET-NAME') === false);
rdhAssert('sha256 present', preg_match('/^[a-f0-9]{64}$/', (string)($ok['sha256'] ?? '')) === 1);

$warn = rdhInspect($path, 1, 1024 * 1024);
rdhAssert('warning threshold', ($warn['status'] ?? '') === 'WARN');
$critical = rdhInspect($path, 1, 2);
rdhAssert('critical threshold', ($critical['status'] ?? '') === 'CRITICAL');

file_put_contents($path, '{bad-json');
$invalid = rdhInspect($path, 100, 200);
rdhAssert('invalid JSON fail closed', ($invalid['error_code'] ?? '') === 'INVALID_JSON');
rdhAssert('missing file fail closed', (rdhInspect($dir . DIRECTORY_SEPARATOR . 'missing.json', 100, 200)['error_code'] ?? '') === 'DATA_FILE_UNAVAILABLE');

@unlink($path);
@rmdir($dir);
echo "RUNTIME_DATA_HEALTH_PASSED=$passed\n";
echo "RUNTIME_DATA_HEALTH_FAILED=$failed\n";
exit($failed > 0 ? 1 : 0);
