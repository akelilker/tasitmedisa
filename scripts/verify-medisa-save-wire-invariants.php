<?php
/**
 * RECOVERY-R2 — save wire delta-v1 / legacy-full invariantleri.
 * Canlı data/data.json dokunulmaz; yalnız temp fixture.
 * Çalıştır: php scripts/verify-medisa-save-wire-invariants.php
 */
require_once __DIR__ . '/../core.php';

$passed = 0;
$failed = 0;

function swAssert($label, $condition) {
    global $passed, $failed;
    if ($condition) {
        $passed++;
        echo "[PASS] {$label}\n";
        return;
    }
    $failed++;
    echo "[FAIL] {$label}\n";
}

function swAssertSame($label, $expected, $actual) {
    swAssert($label . ' (expected=' . json_encode($expected) . ' actual=' . json_encode($actual) . ')', $expected === $actual);
}

function swFixtureBase() {
    return [
        'tasitlar' => [
            ['id' => 'v1', 'plate' => '34 AAA 1', 'version' => 3, 'branchId' => 'b1', 'km' => '100'],
            ['id' => 'v2', 'plate' => '34 BBB 2', 'version' => 5, 'branchId' => 'b1', 'km' => '200'],
            ['id' => 'v3', 'plate' => '06 CCC 3', 'version' => 2, 'branchId' => 'b2', 'km' => '300'],
        ],
        'kayitlar' => [['id' => 'k1', 'note' => 'keep']],
        'branches' => [
            ['id' => 'b1', 'name' => 'Merkez'],
            ['id' => 'b2', 'name' => 'Ankara'],
        ],
        'users' => [
            [
                'id' => 'admin1',
                'isim' => 'Admin',
                'role' => 'genel_yonetici',
                'sifre_hash' => password_hash('FixturePass1!', PASSWORD_DEFAULT),
            ],
            [
                'id' => 'u-branch',
                'isim' => 'Sube Yonetici',
                'role' => 'sube_yonetici',
                'branchIds' => ['b1'],
                'sifre_hash' => password_hash('FixturePass2!', PASSWORD_DEFAULT),
            ],
            [
                'id' => 'u-user',
                'isim' => 'Kullanici',
                'role' => 'kullanici',
                'branchIds' => ['b1'],
            ],
        ],
        'ayarlar' => [
            'sirketAdi' => 'Medisa',
            'yetkiliKisi' => 'A',
            'telefon' => '',
            'eposta' => '',
            'k2Belgesi' => ['expiryDate' => '', 'documentPath' => '', 'updatedAt' => ''],
        ],
        'sifreler' => [],
        'arac_aylik_hareketler' => [['id' => 'h1', 'vehicleId' => 'v1']],
        'duzeltme_talepleri' => [['id' => 't1', 'kayit_id' => 'h1']],
        'notificationReadState' => [
            'user:admin1' => [
                'readKeys' => ['n1'],
                'dismissedKeys' => [],
                'firstSeenDates' => ['n1' => '2026-01-01T10:00:00+03:00'],
                'migratedFromLocalStorage' => false,
                'updatedAt' => '2026-01-01T10:00:00+03:00',
            ],
        ],
        'monthlyTodoWhatsAppLogs' => [
            'monthlyTodo:v1:s:2026-01' => [
                'vehicleId' => 'v1',
                'plate' => '34 AAA 1',
                'type' => 's',
                'field' => 'sigorta',
                'date' => '2026-01',
                'firstOpenedAt' => '2026-01-02T10:00:00+03:00',
                'lastOpenedAt' => '2026-01-02T10:00:00+03:00',
                'openedCount' => 1,
                'openedBy' => 'Admin',
            ],
        ],
        'audit_events' => [],
        'kaskoDegerListesi' => ['rows' => [['x' => 1]]],
    ];
}

function swAdminContext() {
    return [
        'role' => 'genel_yonetici',
        'user_id' => 'admin1',
        'branch_ids' => [],
        'user' => ['id' => 'admin1', 'role' => 'genel_yonetici'],
    ];
}

function swBranchContext() {
    return [
        'role' => 'sube_yonetici',
        'user_id' => 'u-branch',
        'branch_ids' => ['b1'],
        'user' => ['id' => 'u-branch', 'role' => 'sube_yonetici', 'branchIds' => ['b1']],
    ];
}

function swDeltaWire(array $mutation, array $collectionsPayload) {
    return array_merge([
        '_medisaWire' => ['schemaVersion' => 1, 'mode' => 'delta-v1'],
        '_medisaMutation' => $mutation,
    ], $collectionsPayload);
}

function swVehicleById(array $data, $id) {
    foreach (($data['tasitlar'] ?? []) as $vehicle) {
        if ((string)($vehicle['id'] ?? '') === (string)$id) {
            return $vehicle;
        }
    }
    return null;
}

$unauthData = swFixtureBase();
$prevAuth = $_SERVER['HTTP_AUTHORIZATION'] ?? null;
unset($_SERVER['HTTP_AUTHORIZATION']);
unset($_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
$authResult = medisaResolveAuthorizedContext($unauthData);
swAssert('Unauthenticated save context 401', (int)($authResult['status'] ?? 0) === 401);
if ($prevAuth !== null) {
    $_SERVER['HTTP_AUTHORIZATION'] = $prevAuth;
}

$userDenied = medisaBuildErrorResult('Bu ekran için yetkiniz yok.', 403);
swAssert('Kullanici role 403 gate', (int)($userDenied['status'] ?? 0) === 403);

// Legacy full
$data = swFixtureBase();
$legacyIncoming = $data;
$legacyIncoming['tasitlar'][0]['km'] = '150';
$legacyIncoming['_medisaMutation'] = [
    'collections' => ['tasitlar'],
    'changedVehicleIds' => ['v1'],
    'deletedVehicleIds' => [],
    'deletedVehicleVersions' => [],
];
$legacyResult = medisaSaveApplyIncomingData($legacyIncoming, $data, swAdminContext());
swAssert('Legacy full success', ($legacyResult['success'] ?? false) === true);
swAssertSame('Legacy wireMode', 'legacy-full', $legacyResult['wireMode'] ?? null);
swAssertSame('Legacy v1 km', '150', swVehicleById($data, 'v1')['km'] ?? null);
swAssertSame('Legacy v1 version bump', 4, (int)(swVehicleById($data, 'v1')['version'] ?? 0));
swAssertSame('Legacy v2 korunur', '200', swVehicleById($data, 'v2')['km'] ?? null);
swAssertSame('Legacy kayitlar korunur', 'keep', $data['kayitlar'][0]['note'] ?? null);

// Delta single vehicle
$data = swFixtureBase();
$deltaUpdate = swDeltaWire([
    'collections' => ['tasitlar'],
    'changedVehicleIds' => ['v1'],
    'deletedVehicleIds' => [],
    'deletedVehicleVersions' => [],
], [
    'tasitlar' => [['id' => 'v1', 'plate' => '34 AAA 1', 'version' => 3, 'branchId' => 'b1', 'km' => '999']],
]);
$r = medisaSaveApplyIncomingData($deltaUpdate, $data, swAdminContext());
swAssert('Delta single vehicle success', ($r['success'] ?? false) === true);
swAssertSame('Delta wireMode', 'delta-v1', $r['wireMode'] ?? null);
swAssertSame('Delta appliedCollections', ['tasitlar'], $r['appliedCollections'] ?? null);
swAssertSame('Delta target km', '999', swVehicleById($data, 'v1')['km'] ?? null);
swAssertSame('Delta other vehicle preserved', '200', swVehicleById($data, 'v2')['km'] ?? null);
swAssertSame('Delta other collections preserved', 'keep', $data['kayitlar'][0]['note'] ?? null);
swAssertSame('Delta aylik hareket korunur', 'h1', $data['arac_aylik_hareketler'][0]['id'] ?? null);
swAssert('Delta kasko korunur', isset($data['kaskoDegerListesi']['rows'][0]['x']));

// New vehicle
$data = swFixtureBase();
$deltaNew = swDeltaWire([
    'collections' => ['tasitlar'],
    'changedVehicleIds' => ['v9'],
    'deletedVehicleIds' => [],
    'deletedVehicleVersions' => [],
], [
    'tasitlar' => [['id' => 'v9', 'plate' => '34 NEW 9', 'version' => 1, 'branchId' => 'b1', 'km' => '1']],
]);
$r = medisaSaveApplyIncomingData($deltaNew, $data, swAdminContext());
swAssert('Delta new vehicle success', ($r['success'] ?? false) === true);
swAssert('Delta new vehicle present', swVehicleById($data, 'v9') !== null);

// Delete
$data = swFixtureBase();
$deltaDelete = swDeltaWire([
    'collections' => ['tasitlar'],
    'changedVehicleIds' => [],
    'deletedVehicleIds' => ['v2'],
    'deletedVehicleVersions' => ['v2' => 5],
], [
    'tasitlar' => [],
]);
$r = medisaSaveApplyIncomingData($deltaDelete, $data, swAdminContext());
swAssert('Delta delete success', ($r['success'] ?? false) === true);
swAssert('Delta delete removed v2', swVehicleById($data, 'v2') === null);
swAssert('Delta delete kept v1', swVehicleById($data, 'v1') !== null);

$data = swFixtureBase();
$staleDelete = swDeltaWire([
    'collections' => ['tasitlar'],
    'changedVehicleIds' => [],
    'deletedVehicleIds' => ['v2'],
    'deletedVehicleVersions' => ['v2' => 4],
], ['tasitlar' => []]);
$r = medisaSaveApplyIncomingData($staleDelete, $data, swAdminContext());
swAssert('Stale delete 409', !empty($r['conflict']) && (int)($r['status'] ?? 0) === 409);

$data = swFixtureBase();
$staleUpdate = swDeltaWire([
    'collections' => ['tasitlar'],
    'changedVehicleIds' => ['v1'],
    'deletedVehicleIds' => [],
    'deletedVehicleVersions' => [],
], [
    'tasitlar' => [['id' => 'v1', 'plate' => '34 AAA 1', 'version' => 2, 'branchId' => 'b1', 'km' => '1']],
]);
$r = medisaSaveApplyIncomingData($staleUpdate, $data, swAdminContext());
swAssert('Stale update 409', !empty($r['conflict']) && (int)($r['status'] ?? 0) === 409);

// Validation 400s
$data = swFixtureBase();
$missingChanged = swDeltaWire([
    'collections' => ['tasitlar'],
    'changedVehicleIds' => ['v1'],
    'deletedVehicleIds' => [],
    'deletedVehicleVersions' => [],
], ['tasitlar' => []]);
$r = medisaSaveApplyIncomingData($missingChanged, $data, swAdminContext());
swAssert('Missing changed vehicle payload 400', ($r['success'] ?? true) === false && (int)($r['status'] ?? 0) === 400);

$data = swFixtureBase();
$undeclared = swDeltaWire([
    'collections' => ['tasitlar'],
    'changedVehicleIds' => ['v1'],
    'deletedVehicleIds' => [],
    'deletedVehicleVersions' => [],
], [
    'tasitlar' => [
        ['id' => 'v1', 'version' => 3, 'km' => '1'],
        ['id' => 'v2', 'version' => 5, 'km' => '1'],
    ],
]);
$r = medisaSaveApplyIncomingData($undeclared, $data, swAdminContext());
swAssert('Undeclared vehicle payload 400', ($r['success'] ?? true) === false && (int)($r['status'] ?? 0) === 400);

$data = swFixtureBase();
$dupVehicle = swDeltaWire([
    'collections' => ['tasitlar'],
    'changedVehicleIds' => ['v1'],
    'deletedVehicleIds' => [],
    'deletedVehicleVersions' => [],
], [
    'tasitlar' => [
        ['id' => 'v1', 'version' => 3, 'km' => '1'],
        ['id' => 'v1', 'version' => 3, 'km' => '2'],
    ],
]);
$r = medisaSaveApplyIncomingData($dupVehicle, $data, swAdminContext());
swAssert('Duplicate vehicle ID 400', ($r['success'] ?? true) === false && (int)($r['status'] ?? 0) === 400);

$data = swFixtureBase();
$overlap = swDeltaWire([
    'collections' => ['tasitlar'],
    'changedVehicleIds' => ['v1'],
    'deletedVehicleIds' => ['v1'],
    'deletedVehicleVersions' => ['v1' => 3],
], [
    'tasitlar' => [['id' => 'v1', 'version' => 3, 'km' => '1']],
]);
$r = medisaSaveApplyIncomingData($overlap, $data, swAdminContext());
swAssert('Changed/deleted overlap 400', ($r['success'] ?? true) === false && (int)($r['status'] ?? 0) === 400);

$data = swFixtureBase();
$unknownCollection = swDeltaWire([
    'collections' => ['tasitlar', 'ghostCollection'],
    'changedVehicleIds' => ['v1'],
    'deletedVehicleIds' => [],
    'deletedVehicleVersions' => [],
], [
    'tasitlar' => [['id' => 'v1', 'version' => 3, 'km' => '1']],
    'ghostCollection' => [],
]);
$r = medisaSaveApplyIncomingData($unknownCollection, $data, swAdminContext());
swAssert('Unknown collection 400', ($r['success'] ?? true) === false && (int)($r['status'] ?? 0) === 400);

$data = swFixtureBase();
$missingPayloadField = swDeltaWire([
    'collections' => ['tasitlar', 'ayarlar'],
    'changedVehicleIds' => ['v1'],
    'deletedVehicleIds' => [],
    'deletedVehicleVersions' => [],
], [
    'tasitlar' => [['id' => 'v1', 'version' => 3, 'km' => '1']],
]);
$r = medisaSaveApplyIncomingData($missingPayloadField, $data, swAdminContext());
swAssert('Collection without payload field 400', ($r['success'] ?? true) === false && (int)($r['status'] ?? 0) === 400);

$data = swFixtureBase();
$extraPayloadField = swDeltaWire([
    'collections' => ['tasitlar'],
    'changedVehicleIds' => ['v1'],
    'deletedVehicleIds' => [],
    'deletedVehicleVersions' => [],
], [
    'tasitlar' => [['id' => 'v1', 'version' => 3, 'km' => '1']],
    'ayarlar' => ['sirketAdi' => 'X'],
]);
$r = medisaSaveApplyIncomingData($extraPayloadField, $data, swAdminContext());
swAssert('Payload field without collection 400', ($r['success'] ?? true) === false && (int)($r['status'] ?? 0) === 400);

$data = swFixtureBase();
$unknownTop = swDeltaWire([
    'collections' => ['tasitlar'],
    'changedVehicleIds' => ['v1'],
    'deletedVehicleIds' => [],
    'deletedVehicleVersions' => [],
], [
    'tasitlar' => [['id' => 'v1', 'version' => 3, 'km' => '1']],
    'arac_aylik_hareketler' => [],
]);
$r = medisaSaveApplyIncomingData($unknownTop, $data, swAdminContext());
swAssert('Unknown top-level persist key 400', ($r['success'] ?? true) === false && (int)($r['status'] ?? 0) === 400);

$data = swFixtureBase();
$badWire = [
    '_medisaWire' => ['schemaVersion' => 9, 'mode' => 'delta-v1'],
    '_medisaMutation' => [
        'collections' => ['ayarlar'],
        'changedVehicleIds' => [],
        'deletedVehicleIds' => [],
        'deletedVehicleVersions' => [],
    ],
    'ayarlar' => ['sirketAdi' => 'X'],
];
$r = medisaSaveApplyIncomingData($badWire, $data, swAdminContext());
swAssert('Malformed _medisaWire 400', ($r['success'] ?? true) === false && (int)($r['status'] ?? 0) === 400);

$data = swFixtureBase();
$noMutation = [
    '_medisaWire' => ['schemaVersion' => 1, 'mode' => 'delta-v1'],
    'ayarlar' => ['sirketAdi' => 'X'],
];
$r = medisaSaveApplyIncomingData($noMutation, $data, swAdminContext());
swAssert('Delta without _medisaMutation 400', ($r['success'] ?? true) === false && (int)($r['status'] ?? 0) === 400);

$data = swFixtureBase();
$missingVersion = swDeltaWire([
    'collections' => ['tasitlar'],
    'changedVehicleIds' => ['v1'],
    'deletedVehicleIds' => [],
    'deletedVehicleVersions' => [],
], [
    'tasitlar' => [['id' => 'v1', 'km' => '1']],
]);
$r = medisaSaveApplyIncomingData($missingVersion, $data, swAdminContext());
swAssert('Missing vehicle version 400', ($r['success'] ?? true) === false && (int)($r['status'] ?? 0) === 400);

// Scope
$data = swFixtureBase();
$scopedOk = swDeltaWire([
    'collections' => ['tasitlar'],
    'changedVehicleIds' => ['v1'],
    'deletedVehicleIds' => [],
    'deletedVehicleVersions' => [],
], [
    'tasitlar' => [['id' => 'v1', 'plate' => '34 AAA 1', 'version' => 3, 'branchId' => 'b1', 'km' => '777']],
]);
$r = medisaSaveApplyIncomingData($scopedOk, $data, swBranchContext());
swAssert('Branch-scoped vehicle update allowed', ($r['success'] ?? false) === true);
swAssertSame('Branch-scoped km', '777', swVehicleById($data, 'v1')['km'] ?? null);
swAssertSame('Branch-scoped other branch preserved', '300', swVehicleById($data, 'v3')['km'] ?? null);

$data = swFixtureBase();
$scopedDenied = swDeltaWire([
    'collections' => ['tasitlar'],
    'changedVehicleIds' => ['v3'],
    'deletedVehicleIds' => [],
    'deletedVehicleVersions' => [],
], [
    'tasitlar' => [['id' => 'v3', 'plate' => '06 CCC 3', 'version' => 2, 'branchId' => 'b2', 'km' => '1']],
]);
$r = medisaSaveApplyIncomingData($scopedDenied, $data, swBranchContext());
swAssert('Out-of-scope vehicle update denied 403', ($r['success'] ?? true) === false && (int)($r['status'] ?? 0) === 403);

$data = swFixtureBase();
$scopedDeleteDenied = swDeltaWire([
    'collections' => ['tasitlar'],
    'changedVehicleIds' => [],
    'deletedVehicleIds' => ['v3'],
    'deletedVehicleVersions' => ['v3' => 2],
], ['tasitlar' => []]);
$r = medisaSaveApplyIncomingData($scopedDeleteDenied, $data, swBranchContext());
swAssert('Out-of-scope delete denied 403', ($r['success'] ?? true) === false && (int)($r['status'] ?? 0) === 403);

// Notification
$data = swFixtureBase();
$beforeVehicles = json_encode($data['tasitlar']);
$notifOnly = swDeltaWire([
    'collections' => ['notificationReadState'],
    'changedVehicleIds' => [],
    'deletedVehicleIds' => [],
    'deletedVehicleVersions' => [],
], [
    'notificationReadState' => [
        'user:admin1' => [
            'readKeys' => ['n1', 'n2'],
            'dismissedKeys' => [],
            'firstSeenDates' => ['n1' => '2026-01-01T10:00:00+03:00'],
            'migratedFromLocalStorage' => false,
            'updatedAt' => '2026-07-01T10:00:00+03:00',
        ],
    ],
]);
$r = medisaSaveApplyIncomingData($notifOnly, $data, swAdminContext());
swAssert('Notification-only success', ($r['success'] ?? false) === true);
swAssert('Notification-only vehicles untouched', json_encode($data['tasitlar']) === $beforeVehicles);
$firstSeen = $data['notificationReadState']['user:admin1']['firstSeenDates']['n1'] ?? null;
swAssert('Notification firstSeen retention', $firstSeen === '2026-01-01T10:00:00+03:00');

// Users credential preservation
$data = swFixtureBase();
$oldHash = $data['users'][0]['sifre_hash'];
$usersOnly = swDeltaWire([
    'collections' => ['users'],
    'changedVehicleIds' => [],
    'deletedVehicleIds' => [],
    'deletedVehicleVersions' => [],
], [
    'users' => [
        ['id' => 'admin1', 'isim' => 'Admin Updated', 'role' => 'genel_yonetici', 'sifre_hash' => 'client-fake'],
        ['id' => 'u-branch', 'isim' => 'Sube Yonetici', 'role' => 'sube_yonetici', 'branchIds' => ['b1']],
        ['id' => 'u-user', 'isim' => 'Kullanici', 'role' => 'kullanici'],
    ],
]);
$r = medisaSaveApplyIncomingData($usersOnly, $data, swAdminContext());
swAssert('Users collection success', ($r['success'] ?? false) === true);
swAssertSame('Users hash preserved', $oldHash, $data['users'][0]['sifre_hash'] ?? null);
swAssertSame('Users name updated', 'Admin Updated', $data['users'][0]['isim'] ?? null);

// Ayarlar
$data = swFixtureBase();
$beforeKayit = json_encode($data['kayitlar']);
$ayarlarOnly = swDeltaWire([
    'collections' => ['ayarlar'],
    'changedVehicleIds' => [],
    'deletedVehicleIds' => [],
    'deletedVehicleVersions' => [],
], [
    'ayarlar' => [
        'sirketAdi' => 'Medisa Delta',
        'yetkiliKisi' => 'B',
        'telefon' => '',
        'eposta' => '',
        'k2Belgesi' => ['expiryDate' => '', 'documentPath' => '', 'updatedAt' => ''],
    ],
]);
$r = medisaSaveApplyIncomingData($ayarlarOnly, $data, swAdminContext());
swAssert('Ayarlar-only success', ($r['success'] ?? false) === true);
swAssertSame('Ayarlar updated', 'Medisa Delta', $data['ayarlar']['sirketAdi'] ?? null);
swAssert('Ayarlar-only kayitlar untouched', json_encode($data['kayitlar']) === $beforeKayit);

// Monthly log merge
$data = swFixtureBase();
$monthly = swDeltaWire([
    'collections' => ['monthlyTodoWhatsAppLogs'],
    'changedVehicleIds' => [],
    'deletedVehicleIds' => [],
    'deletedVehicleVersions' => [],
], [
    'monthlyTodoWhatsAppLogs' => [
        'monthlyTodo:v1:s:2026-01' => [
            'vehicleId' => 'v1',
            'plate' => '34 AAA 1',
            'type' => 's',
            'field' => 'sigorta',
            'date' => '2026-01',
            'firstOpenedAt' => '2026-01-03T10:00:00+03:00',
            'lastOpenedAt' => '2026-01-04T10:00:00+03:00',
            'openedCount' => 2,
            'openedBy' => 'Admin',
        ],
    ],
]);
$r = medisaSaveApplyIncomingData($monthly, $data, swAdminContext());
swAssert('Monthly log merge success', ($r['success'] ?? false) === true);
$entry = $data['monthlyTodoWhatsAppLogs']['monthlyTodo:v1:s:2026-01'];
swAssertSame('Monthly firstOpened retained earlier', '2026-01-02T10:00:00+03:00', $entry['firstOpenedAt'] ?? null);
swAssertSame('Monthly openedCount max', 2, (int)($entry['openedCount'] ?? 0));

// Password changes use the transient metadata channel; user records never carry client secrets.
$data = swFixtureBase();
$pwChange = swDeltaWire([
    'collections' => ['users'],
    'changedVehicleIds' => [],
    'deletedVehicleIds' => [],
    'deletedVehicleVersions' => [],
], [
    'users' => $data['users'],
]);
$pwChange['_medisaUserPasswordChanges'] = ['admin1' => 'NewPass123!'];
$r = medisaSaveApplyIncomingData($pwChange, $data, swAdminContext());
swAssert('Password change success', ($r['success'] ?? false) === true);
swAssert('Password change hashed server-side', password_verify('NewPass123!', $data['users'][0]['sifre_hash'] ?? ''));
swAssert('Password change plaintext not stored', !array_key_exists('sifre', $data['users'][0]));

$data = swFixtureBase();
$branchPwChange = swDeltaWire([
    'collections' => ['users'],
    'changedVehicleIds' => [],
    'deletedVehicleIds' => [],
    'deletedVehicleVersions' => [],
], [
    'users' => [
        ['id' => 'u-user', 'isim' => 'Kullanici', 'role' => 'kullanici', 'branchIds' => ['b1']],
    ],
]);
$branchPwChange['_medisaUserPasswordChanges'] = ['u-user' => 'BranchUserPass1!'];
$r = medisaSaveApplyIncomingData($branchPwChange, $data, swBranchContext());
swAssert('Branch normal-user password change success', ($r['success'] ?? false) === true);
$changedBranchUser = null;
foreach (($data['users'] ?? []) as $candidate) {
    if (($candidate['id'] ?? '') === 'u-user') $changedBranchUser = $candidate;
}
swAssert('Branch normal-user password hashed', password_verify('BranchUserPass1!', $changedBranchUser['sifre_hash'] ?? ''));

$data = swFixtureBase();
$peerPwChange = swDeltaWire([
    'collections' => ['users'],
    'changedVehicleIds' => [],
    'deletedVehicleIds' => [],
    'deletedVehicleVersions' => [],
], [
    'users' => [
        ['id' => 'u-branch', 'isim' => 'Sube Yonetici', 'role' => 'sube_yonetici', 'branchIds' => ['b1']],
    ],
]);
$peerPwChange['_medisaUserPasswordChanges'] = ['u-branch' => 'PeerManagerPass1!'];
$r = medisaSaveApplyIncomingData($peerPwChange, $data, swBranchContext());
swAssert('Branch manager password target denied 403', ($r['success'] ?? true) === false && (int)($r['status'] ?? 0) === 403);

$data = swFixtureBase();
$spoofedPeerPwChange = swDeltaWire([
    'collections' => ['users'],
    'changedVehicleIds' => [],
    'deletedVehicleIds' => [],
    'deletedVehicleVersions' => [],
], [
    'users' => [
        ['id' => 'u-branch', 'isim' => 'Sube Yonetici', 'role' => 'kullanici', 'branchIds' => ['b1']],
    ],
]);
$spoofedPeerPwChange['_medisaUserPasswordChanges'] = ['u-branch' => 'SpoofedPeerPass1!'];
$r = medisaSaveApplyIncomingData($spoofedPeerPwChange, $data, swBranchContext());
swAssert('Spoofed peer-manager password target denied 403', ($r['success'] ?? true) === false && (int)($r['status'] ?? 0) === 403);

$data = swFixtureBase();
$unknownPwChange = swDeltaWire([
    'collections' => ['users'],
    'changedVehicleIds' => [],
    'deletedVehicleIds' => [],
    'deletedVehicleVersions' => [],
], [
    'users' => $data['users'],
]);
$unknownPwChange['_medisaUserPasswordChanges'] = ['missing-user' => 'UnknownPass1!'];
$r = medisaSaveApplyIncomingData($unknownPwChange, $data, swAdminContext());
swAssert('Unknown password target rejected 400', ($r['success'] ?? true) === false && (int)($r['status'] ?? 0) === 400);

$data = swFixtureBase();
$shortPwChange = swDeltaWire([
    'collections' => ['users'],
    'changedVehicleIds' => [],
    'deletedVehicleIds' => [],
    'deletedVehicleVersions' => [],
], [
    'users' => $data['users'],
]);
$shortPwChange['_medisaUserPasswordChanges'] = ['admin1' => '123'];
$r = medisaSaveApplyIncomingData($shortPwChange, $data, swAdminContext());
swAssert('Short password rejected 400', ($r['success'] ?? true) === false && (int)($r['status'] ?? 0) === 400);

$data = swFixtureBase();
$legacyPlainPw = swDeltaWire([
    'collections' => ['users'],
    'changedVehicleIds' => [],
    'deletedVehicleIds' => [],
    'deletedVehicleVersions' => [],
], [
    'users' => [
        ['id' => 'admin1', 'isim' => 'Admin', 'role' => 'genel_yonetici', 'sifre' => 'LegacyPlainPass1!'],
        ['id' => 'u-branch', 'isim' => 'Sube Yonetici', 'role' => 'sube_yonetici', 'branchIds' => ['b1']],
        ['id' => 'u-user', 'isim' => 'Kullanici', 'role' => 'kullanici', 'branchIds' => ['b1']],
    ],
]);
$r = medisaSaveApplyIncomingData($legacyPlainPw, $data, swAdminContext());
swAssert('Legacy plaintext user field rejected 400', ($r['success'] ?? true) === false && (int)($r['status'] ?? 0) === 400);

// Validation failure does not mutate
$data = swFixtureBase();
$before = json_encode($data);
$bad = swDeltaWire([
    'collections' => ['ghost'],
    'changedVehicleIds' => [],
    'deletedVehicleIds' => [],
    'deletedVehicleVersions' => [],
], ['ghost' => []]);
$r = medisaSaveApplyIncomingData($bad, $data, swAdminContext());
swAssert('Validation failure data unchanged', json_encode($data) === $before && ($r['success'] ?? true) === false);

// Source contracts
$savePhp = file_get_contents(__DIR__ . '/../save.php');
$dm = file_get_contents(__DIR__ . '/../data-manager.js');
swAssert('save.php uses medisaSaveApplyIncomingData', strpos($savePhp, 'medisaSaveApplyIncomingData') !== false);
swAssert('data-manager buildSaveWirePayload', strpos($dm, 'function buildSaveWirePayload') !== false);
swAssert('data-manager delta-v1 mode', strpos($dm, "mode: 'delta-v1'") !== false);
swAssert('data-manager excludes kaskoDegerListesi', strpos($dm, 'delete wirePayload.kaskoDegerListesi') !== false);
swAssert('arac_aylik not in save persist allowlist', !in_array('arac_aylik_hareketler', medisaSavePersistCollectionAllowlist(), true));
swAssert('duzeltme_talepleri not in save persist allowlist', !in_array('duzeltme_talepleri', medisaSavePersistCollectionAllowlist(), true));

echo "\nSave wire invariants: {$passed} passed, {$failed} failed\n";
exit($failed > 0 ? 1 : 0);
