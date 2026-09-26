<?php
declare(strict_types=1);

$root = dirname(__DIR__);
$dataDir = $root . '/data';
$dataPath = $dataDir . '/data.json';
$examplePath = $dataDir . '/data.example.json';

if (!is_dir($dataDir)) {
    mkdir($dataDir, 0775, true);
}

$base = json_decode((string)file_get_contents($examplePath), true);
if (!is_array($base)) {
    fwrite(STDERR, "data.example.json okunamadi\n");
    exit(1);
}

$password = 'TestPass123!';
$hash = password_hash($password, PASSWORD_DEFAULT);

$base['users'] = [
    [
        'id' => 'user-doc-hover-gm',
        'isim' => 'Doc Hover GM',
        'kullanici_adi' => 'doc_hover_gm',
        'role' => 'genel_yonetici',
        'aktif' => true,
        'sifre_hash' => $hash,
    ],
];

$base['tasitlar'] = [
    [
        'id' => 'veh-doc-hover-1',
        'plate' => '34 HOVER 1',
        'branchId' => 'branch-example-1',
        'marka' => 'TEST',
        'model' => 'HOVER',
        'yil' => 2022,
        'aktif' => true,
        'ruhsatPath' => 'ruhsat/fixture_hover_ruhsat.pdf',
        'sigortaPolicePath' => 'sigorta/fixture_hover_sigorta.pdf',
        'sigortaDate' => '2026-01-15',
        'kaskoPolicePath' => '',
        'events' => [],
    ],
];

$encoded = json_encode($base, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
if ($encoded === false || file_put_contents($dataPath, $encoded) === false) {
    fwrite(STDERR, "data.json yazilamadi\n");
    exit(1);
}

echo "OK data.json\n";
echo "LOGIN doc_hover_gm / {$password}\n";
echo "VEHICLE veh-doc-hover-1\n";
