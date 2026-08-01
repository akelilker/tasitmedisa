<?php
require_once __DIR__ . '/core.php';
require_once __DIR__ . '/server_restore.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Cache-Control: no-cache, no-store, must-revalidate');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST, OPTIONS');
    echo json_encode([
        'success' => false,
        'error_code' => 'RESTORE_DISABLED',
        'message' => 'Restore commit yalnız POST kabul eder.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

[$input, $err] = medisaRestoreJsonInput();
if ($err !== null) {
    medisaRestoreEmit(['status' => (int)($err['status'] ?? 400), 'body' => $err]);
    exit;
}

medisaRestoreEmit(medisaRestoreHandleCommit($input));
