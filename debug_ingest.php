<?php
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo '{"ok":false}';
    exit;
}
$raw = file_get_contents('php://input');
if ($raw === false || $raw === '') {
    echo '{"ok":false}';
    exit;
}
$path = __DIR__ . '/debug-8624d8.log';
@file_put_contents($path, $raw . "\n", FILE_APPEND | LOCK_EX);
echo '{"ok":true}';
