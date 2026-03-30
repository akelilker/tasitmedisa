<?php
/**
 * Geçici: tarayıcıdan NDJSON debug satırı alır (Chrome LNA; 127.0.0.1:7885 yerine same-origin).
 * Sadece sessionId=8624d8 ve küçük gövde kabul edilir.
 */
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false], JSON_UNESCAPED_UNICODE);
    exit;
}

$raw = file_get_contents('php://input');
if ($raw === false || strlen($raw) > 16384) {
    http_response_code(400);
    echo json_encode(['ok' => false], JSON_UNESCAPED_UNICODE);
    exit;
}

$decoded = json_decode($raw, true);
if (!is_array($decoded) || ($decoded['sessionId'] ?? '') !== '8624d8') {
    http_response_code(400);
    echo json_encode(['ok' => false], JSON_UNESCAPED_UNICODE);
    exit;
}

$path = __DIR__ . '/../debug-8624d8.log';
$line = json_encode($decoded, JSON_UNESCAPED_UNICODE);
if ($line === false) {
    http_response_code(500);
    echo json_encode(['ok' => false], JSON_UNESCAPED_UNICODE);
    exit;
}

@file_put_contents($path, $line . "\n", FILE_APPEND | LOCK_EX);
echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
