<?php
/**
 * Runtime data.json için salt-okunur, PII-free sağlık raporu.
 *
 * Kullanım:
 *   php scripts/inspect-medisa-runtime-data-health.php [--data=/path/data.json]
 *     [--warn-bytes=16777216] [--critical-bytes=33554432]
 *
 * Exit: OK=0, WARN=1, CRITICAL/invalid=2.
 */

function rdhArgs(array $argv): array {
    $out = [];
    foreach (array_slice($argv, 1) as $arg) {
        if (strpos($arg, '--') !== 0) continue;
        $parts = explode('=', substr($arg, 2), 2);
        $out[$parts[0]] = $parts[1] ?? '1';
    }
    return $out;
}

function rdhKnownCollections(): array {
    return [
        'tasitlar', 'vehicles', 'users', 'branches', 'kayitlar', 'ayarlar', 'sifreler',
        'arac_aylik_hareketler', 'duzeltme_talepleri', 'notificationReadState',
        'monthlyTodoWhatsAppLogs', 'stagingSynthetic'
    ];
}

function rdhCount(array $data, string $key): int {
    return isset($data[$key]) && is_array($data[$key]) ? count($data[$key]) : 0;
}

function rdhInspect(string $path, int $warnBytes, int $criticalBytes): array {
    if ($warnBytes < 1 || $criticalBytes < $warnBytes) {
        return ['status' => 'CRITICAL', 'error_code' => 'INVALID_THRESHOLDS'];
    }
    if ($path === '' || strpos($path, "\0") !== false || is_link($path) || !is_file($path)) {
        return ['status' => 'CRITICAL', 'error_code' => 'DATA_FILE_UNAVAILABLE'];
    }
    $size = @filesize($path);
    $raw = @file_get_contents($path);
    if (!is_int($size) || $size < 0 || $raw === false) {
        return ['status' => 'CRITICAL', 'error_code' => 'DATA_FILE_READ_FAILED'];
    }
    $data = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($data)) {
        return [
            'status' => 'CRITICAL',
            'error_code' => 'INVALID_JSON',
            'size_bytes' => $size,
            'sha256' => hash('sha256', $raw),
        ];
    }

    $events = 0;
    $vehicles = isset($data['tasitlar']) && is_array($data['tasitlar'])
        ? $data['tasitlar']
        : ((isset($data['vehicles']) && is_array($data['vehicles'])) ? $data['vehicles'] : []);
    foreach ($vehicles as $vehicle) {
        if (is_array($vehicle) && isset($vehicle['events']) && is_array($vehicle['events'])) {
            $events += count($vehicle['events']);
        }
    }

    $known = array_fill_keys(rdhKnownCollections(), true);
    $unknownCount = 0;
    foreach (array_keys($data) as $key) {
        if (!isset($known[(string)$key])) $unknownCount++;
    }

    $status = $size >= $criticalBytes ? 'CRITICAL' : ($size >= $warnBytes ? 'WARN' : 'OK');
    return [
        'status' => $status,
        'size_bytes' => $size,
        'warn_bytes' => $warnBytes,
        'critical_bytes' => $criticalBytes,
        'capacity_percent_of_critical' => round(($size / $criticalBytes) * 100, 2),
        'sha256' => hash('sha256', $raw),
        'modified_at' => date('c', (int)@filemtime($path)),
        'record_counts' => [
            'vehicles' => count($vehicles),
            'users' => rdhCount($data, 'users'),
            'branches' => rdhCount($data, 'branches'),
            'records' => rdhCount($data, 'kayitlar'),
            'events' => $events,
            'monthly_vehicle_rows' => rdhCount($data, 'arac_aylik_hareketler'),
            'correction_requests' => rdhCount($data, 'duzeltme_talepleri'),
            'notification_keys' => rdhCount($data, 'notificationReadState'),
            'whatsapp_log_keys' => rdhCount($data, 'monthlyTodoWhatsAppLogs'),
        ],
        'unknown_top_level_count' => $unknownCount,
    ];
}

function rdhMain(array $argv): int {
    $args = rdhArgs($argv);
    $path = (string)($args['data'] ?? (dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'data.json'));
    $warn = (int)($args['warn-bytes'] ?? 16777216);
    $critical = (int)($args['critical-bytes'] ?? 33554432);
    $report = rdhInspect($path, $warn, $critical);
    echo json_encode($report, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . PHP_EOL;
    return ($report['status'] ?? 'CRITICAL') === 'OK' ? 0 : (($report['status'] ?? '') === 'WARN' ? 1 : 2);
}

if (PHP_SAPI === 'cli' && isset($_SERVER['SCRIPT_FILENAME'])
    && realpath((string)$_SERVER['SCRIPT_FILENAME']) === realpath(__FILE__)) {
    exit(rdhMain($argv));
}
