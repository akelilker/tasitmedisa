<?php
declare(strict_types=1);

$scriptName = isset($_SERVER['SCRIPT_NAME']) ? (string) $_SERVER['SCRIPT_NAME'] : '';
$basePrefix = '';
if (preg_match('#^(.*)/t/index\.php$#', $scriptName, $m)) {
    $rawBase = $m[1];
    if ($rawBase !== '' && $rawBase !== '/') {
        $basePrefix = rtrim($rawBase, '/');
    }
}

$driverIndexPath = $basePrefix === '' ? '/driver/index.html' : $basePrefix . '/driver/index.html';

$code = '';
if (isset($_GET['c']) && is_string($_GET['c'])) {
    $code = (string) preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['c']);
} else {
    $uriPath = parse_url(isset($_SERVER['REQUEST_URI']) ? (string) $_SERVER['REQUEST_URI'] : '', PHP_URL_PATH);
    $uriPath = is_string($uriPath) ? $uriPath : '';
    if ($uriPath !== '' && preg_match('#/([a-zA-Z0-9_-]+)$#', $uriPath, $mm)) {
        $last = $mm[1];
        if ($last !== 'index.php') {
            $code = $last;
        }
    }
}

$code = strtolower($code);

header('Cache-Control: no-store, no-cache, must-revalidate');

if ($code === 'km') {
    $dashboardPath = $basePrefix === ''
        ? '/driver/dashboard.html?action=km'
        : $basePrefix . '/driver/dashboard.html?action=km';
    $target = $driverIndexPath . '?next=' . rawurlencode($dashboardPath);
    header('Location: ' . $target, true, 302);
    exit;
}

header('Location: ' . $driverIndexPath, true, 302);
exit;
