<?php
/**
 * FINAL-PROD-ACCEPTANCE — sentetik üç rol / scope davranış matrisi.
 * Canlı data/data.json dokunulmaz. Çalıştır: php scripts/verify-medisa-role-matrix.php
 */
require_once __DIR__ . '/../core.php';

$passed = 0;
$failed = 0;
$tempDirs = [];

function rmAssert($label, $condition) {
    global $passed, $failed;
    if ($condition) {
        $passed++;
        echo "[PASS] {$label}\n";
        return;
    }
    $failed++;
    echo "[FAIL] {$label}\n";
}

function rmAssertSame($label, $expected, $actual) {
    rmAssert(
        $label . ' (expected=' . json_encode($expected, JSON_UNESCAPED_UNICODE) . ' actual=' . json_encode($actual, JSON_UNESCAPED_UNICODE) . ')',
        $expected === $actual
    );
}

function rmIds(array $items) {
    $ids = [];
    foreach ($items as $item) {
        $id = (string)($item['id'] ?? '');
        if ($id !== '') {
            $ids[] = $id;
        }
    }
    sort($ids);
    return $ids;
}

function rmHasId(array $items, $id) {
    foreach ($items as $item) {
        if ((string)($item['id'] ?? '') === (string)$id) {
            return true;
        }
    }
    return false;
}

function rmFixture() {
    // Synthetic passwords stay in process memory only; never echo.
    $pw = 'FixtureRoleMatrix!1';
    return [
        'tasitlar' => [
            ['id' => 'veh-a1', 'plate' => 'SYN A1', 'version' => 2, 'branchId' => 'branch-a', 'assignedUserId' => 'user-a'],
            ['id' => 'veh-a2', 'plate' => 'SYN A2', 'version' => 1, 'branchId' => 'branch-a', 'assignedUserId' => ''],
            ['id' => 'veh-b1', 'plate' => 'SYN B1', 'version' => 3, 'branchId' => 'branch-b', 'assignedUserId' => 'user-b'],
            ['id' => 'veh-c1', 'plate' => 'SYN C1', 'version' => 1, 'branchId' => 'branch-c', 'assignedUserId' => 'user-c'],
            ['id' => 'veh-zimmet', 'plate' => 'SYN Z1', 'version' => 1, 'branchId' => 'branch-a', 'assignedUserId' => ''],
            ['id' => 'veh-orphan', 'plate' => 'SYN O1', 'version' => 1, 'branchId' => 'branch-empty', 'assignedUserId' => ''],
        ],
        'kayitlar' => [['id' => 'kayit-1', 'note' => 'keep']],
        'branches' => [
            ['id' => 'branch-a', 'name' => 'Branch A'],
            ['id' => 'branch-b', 'name' => 'Branch B'],
            ['id' => 'branch-c', 'name' => 'Branch C'],
            ['id' => 'branch-empty', 'name' => 'Empty Branch'],
        ],
        'users' => [
            [
                'id' => 'gm-1',
                'isim' => 'Synthetic GM',
                'role' => 'genel_yonetici',
                'sifre_hash' => password_hash($pw, PASSWORD_DEFAULT),
            ],
            [
                'id' => 'gm-2',
                'isim' => 'Synthetic GM2',
                'role' => 'genel_yonetici',
                'sifre_hash' => password_hash($pw, PASSWORD_DEFAULT),
            ],
            [
                'id' => 'bm-a',
                'isim' => 'Synthetic BM A',
                'role' => 'sube_yonetici',
                'branchIds' => ['branch-a'],
                'sifre_hash' => password_hash($pw, PASSWORD_DEFAULT),
            ],
            [
                'id' => 'bm-a2',
                'isim' => 'Synthetic BM A Peer',
                'role' => 'sube_yonetici',
                'branchIds' => ['branch-a'],
                'sifre_hash' => password_hash($pw, PASSWORD_DEFAULT),
            ],
            [
                'id' => 'bm-ab',
                'isim' => 'Synthetic BM AB',
                'role' => 'sube_yonetici',
                'branchIds' => ['branch-a', 'branch-b', 'branch-a'],
                'sifre_hash' => password_hash($pw, PASSWORD_DEFAULT),
            ],
            [
                'id' => 'legacy-yonetici',
                'isim' => 'Synthetic Legacy Yonetici',
                'rol' => 'yonetici',
                'branchIds' => ['branch-b'],
                'sifre_hash' => password_hash($pw, PASSWORD_DEFAULT),
            ],
            [
                'id' => 'yonetici-kullanici-1',
                'isim' => 'Synthetic Yonetici Kullanici',
                'role' => 'yonetici_kullanici',
                'branchIds' => ['branch-c'],
                'sifre_hash' => password_hash($pw, PASSWORD_DEFAULT),
            ],
            [
                'id' => 'user-a',
                'isim' => 'Synthetic User A',
                'role' => 'kullanici',
                'branchIds' => ['branch-a'],
                'sifre_hash' => password_hash($pw, PASSWORD_DEFAULT),
            ],
            [
                'id' => 'user-b',
                'isim' => 'Synthetic User B',
                'role' => 'kullanici',
                'branchIds' => ['branch-b'],
                'sifre_hash' => password_hash($pw, PASSWORD_DEFAULT),
            ],
            [
                'id' => 'user-c',
                'isim' => 'Synthetic User C',
                'role' => 'kullanici',
                'branchIds' => ['branch-c'],
                'zimmetli_araclar' => ['veh-zimmet'],
                'sifre_hash' => password_hash($pw, PASSWORD_DEFAULT),
            ],
            [
                'id' => 'user-none',
                'isim' => 'Synthetic User None',
                'role' => 'kullanici',
                'branchIds' => ['branch-a'],
                'sifre_hash' => password_hash($pw, PASSWORD_DEFAULT),
            ],
            [
                'id' => 'user-inactive',
                'isim' => 'Synthetic Inactive',
                'role' => 'kullanici',
                'branchIds' => ['branch-a'],
                'aktif' => false,
                'sifre_hash' => password_hash($pw, PASSWORD_DEFAULT),
            ],
            [
                'id' => 'user-alias-driver',
                'isim' => 'Synthetic Driver Alias',
                'role' => 'driver',
                'branchIds' => ['branch-a'],
                'sifre_hash' => password_hash($pw, PASSWORD_DEFAULT),
            ],
        ],
        'ayarlar' => [
            'sirketAdi' => 'Synthetic Medisa',
            'yetkiliKisi' => 'X',
            'telefon' => '',
            'eposta' => '',
            'k2Belgesi' => ['expiryDate' => '2099-01-01', 'documentPath' => '/x', 'updatedAt' => '2026-01-01T00:00:00+03:00'],
        ],
        'sifreler' => [['id' => 'pwd-1', 'label' => 'x']],
        'arac_aylik_hareketler' => [
            ['id' => 'h-a1', 'arac_id' => 'veh-a1'],
            ['id' => 'h-c1', 'arac_id' => 'veh-c1'],
        ],
        'duzeltme_talepleri' => [
            ['id' => 't-a1', 'kayit_id' => 'h-a1', 'arac_id' => 'veh-a1'],
        ],
        'kaskoDegerListesi' => [
            'updatedAt' => '2026-01-01',
            'period' => '2026-01',
            'sourceFileName' => 'syn.xlsx',
            'rows' => [['marka' => 'X', 'model' => 'Y', 'bedel' => 1]],
        ],
        'notificationReadState' => [
            'user:gm-1' => [
                'readKeys' => ['n-gm'],
                'dismissedKeys' => [],
                'firstSeenDates' => ['n-gm' => '2026-01-01T10:00:00+03:00'],
                'migratedFromLocalStorage' => false,
                'updatedAt' => '2026-01-01T10:00:00+03:00',
            ],
            'user:bm-a|role:sube_yonetici|branches:branch-a' => [
                'readKeys' => ['n-bm'],
                'dismissedKeys' => [],
                'firstSeenDates' => [],
                'migratedFromLocalStorage' => false,
                'updatedAt' => '2026-01-02T10:00:00+03:00',
            ],
        ],
        'monthlyTodoWhatsAppLogs' => [],
    ];
}

function rmContextFromUser(array $data, array $user) {
    return medisaBuildAccessContext($data, ['user_id' => (string)($user['id'] ?? '')]);
}

function rmUserById(array $data, $id) {
    return medisaFindUserById($data, $id);
}

function rmVehicleById(array $data, $id) {
    foreach (($data['tasitlar'] ?? []) as $vehicle) {
        if ((string)($vehicle['id'] ?? '') === (string)$id) {
            return $vehicle;
        }
    }
    return null;
}

function rmBranchById(array $data, $id) {
    foreach (($data['branches'] ?? []) as $branch) {
        if ((string)($branch['id'] ?? '') === (string)$id) {
            return $branch;
        }
    }
    return null;
}

function rmWithAuthHeader($token, callable $fn) {
    $prev = $_SERVER['HTTP_AUTHORIZATION'] ?? null;
    $prevRedirect = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null;
    if ($token === null) {
        unset($_SERVER['HTTP_AUTHORIZATION'], $_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
    } else {
        $_SERVER['HTTP_AUTHORIZATION'] = $token;
        unset($_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
    }
    try {
        return $fn();
    } finally {
        if ($prev === null) {
            unset($_SERVER['HTTP_AUTHORIZATION']);
        } else {
            $_SERVER['HTTP_AUTHORIZATION'] = $prev;
        }
        if ($prevRedirect === null) {
            unset($_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
        } else {
            $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] = $prevRedirect;
        }
    }
}

$data = rmFixture();
$gm = rmUserById($data, 'gm-1');
$gm2 = rmUserById($data, 'gm-2');
$bmA = rmUserById($data, 'bm-a');
$bmA2 = rmUserById($data, 'bm-a2');
$bmAb = rmUserById($data, 'bm-ab');
$legacyY = rmUserById($data, 'legacy-yonetici');
$yk = rmUserById($data, 'yonetici-kullanici-1');
$userA = rmUserById($data, 'user-a');
$userB = rmUserById($data, 'user-b');
$userC = rmUserById($data, 'user-c');
$userNone = rmUserById($data, 'user-none');
$userAlias = rmUserById($data, 'user-alias-driver');

$ctxGm = rmContextFromUser($data, $gm);
$ctxBmA = rmContextFromUser($data, $bmA);
$ctxBmAb = rmContextFromUser($data, $bmAb);
$ctxLegacy = rmContextFromUser($data, $legacyY);
$ctxYk = rmContextFromUser($data, $yk);
$ctxUserA = rmContextFromUser($data, $userA);
$ctxUserC = rmContextFromUser($data, $userC);
$ctxUserNone = rmContextFromUser($data, $userNone);

// --- Normalization / aliases ---
rmAssertSame('normalize admin', 'genel_yonetici', medisaNormalizeRoleValue('admin'));
rmAssertSame('normalize yonetici', 'sube_yonetici', medisaNormalizeRoleValue('yonetici'));
rmAssertSame('normalize yonetici_kullanici', 'sube_yonetici', medisaNormalizeRoleValue('yonetici_kullanici'));
rmAssertSame('normalize surucu', 'kullanici', medisaNormalizeRoleValue('surucu'));
rmAssertSame('normalize driver', 'kullanici', medisaNormalizeRoleValue('driver'));
rmAssertSame('normalize sales', 'kullanici', medisaNormalizeRoleValue('sales'));
rmAssertSame('normalize empty', 'kullanici', medisaNormalizeRoleValue(''));
rmAssertSame('resolve gm role', 'genel_yonetici', medisaResolveUserRole($gm));
rmAssertSame('resolve bm role', 'sube_yonetici', medisaResolveUserRole($bmA));
rmAssertSame('resolve legacy raw', 'sube_yonetici', medisaResolveUserRole($legacyY));
rmAssertSame('resolve yonetici_kullanici', 'sube_yonetici', medisaResolveUserRole($yk));
rmAssertSame('resolve driver alias', 'kullanici', medisaResolveUserRole($userAlias));
rmAssert('legacy yonetici_only true', medisaIsYoneticiOnlyUser($legacyY) === true);
rmAssert('canonical bm yonetici_only false', medisaIsYoneticiOnlyUser($bmA) === false);
rmAssert('yonetici_kullanici yonetici_only false', medisaIsYoneticiOnlyUser($yk) === false);
rmAssert('branch manager role true', medisaIsBranchManagerRole('sube_yonetici') === true);
rmAssert('branch manager role gm false', medisaIsBranchManagerRole('genel_yonetici') === false);
rmAssert('main access gm', medisaHasMainAppAccessRole('genel_yonetici') === true);
rmAssert('main access bm', medisaHasMainAppAccessRole('sube_yonetici') === true);
rmAssert('main access user false', medisaHasMainAppAccessRole('kullanici') === false);

// Branch extraction
rmAssertSame('bm-a branches', ['branch-a'], medisaExtractUserBranchIds($bmA));
rmAssertSame('bm-ab dedupe branches', ['branch-a', 'branch-b'], medisaExtractUserBranchIds($bmAb));
rmAssertSame('empty user branches', [], medisaExtractUserBranchIds(null));

// Assigned vehicles / driver dashboard
rmAssert('user-a has assigned vehicle', medisaUserHasAssignedVehicle($data, 'user-a') === true);
rmAssert('user-c zimmetli has vehicle', medisaUserHasAssignedVehicle($data, 'user-c') === true);
rmAssert('user-none no vehicle', medisaUserHasAssignedVehicle($data, 'user-none') === false);
rmAssert('gm driver dashboard true', medisaComputeDriverDashboard($gm, $data) === true);
rmAssert('bm driver dashboard true', medisaComputeDriverDashboard($bmA, $data) === true);
rmAssert('legacy yonetici driver false', medisaComputeDriverDashboard($legacyY, $data) === false);
rmAssert('yonetici_kullanici driver true', medisaComputeDriverDashboard($yk, $data) === true);
rmAssert('user with vehicle driver true', medisaComputeDriverDashboard($userA, $data) === true);
rmAssert('user without vehicle driver false', medisaComputeDriverDashboard($userNone, $data) === false);
rmAssert('empty id driver false', medisaComputeDriverDashboard(['id' => '', 'role' => 'kullanici'], $data) === false);
rmAssert('invalid role driver false', medisaComputeDriverDashboard(['id' => 'x', 'role' => 'unknown_role'], $data) === false);

// Permissions — genel
$permGm = medisaBuildPermissions($ctxGm);
rmAssert('gm view_main_app', !empty($permGm['view_main_app']));
rmAssert('gm view_reports', !empty($permGm['view_reports']));
rmAssert('gm manage_users', !empty($permGm['manage_users']));
rmAssert('gm manage_branches', !empty($permGm['manage_branches']));
rmAssert('gm manage_data', !empty($permGm['manage_data']));
rmAssert('gm manage_settings', !empty($permGm['manage_settings']));
rmAssert('gm manage_backups', !empty($permGm['manage_backups']));

// Permissions — şube
$permBm = medisaBuildPermissions($ctxBmA);
rmAssert('bm view_main_app', !empty($permBm['view_main_app']));
rmAssert('bm view_reports', !empty($permBm['view_reports']));
rmAssert('bm manage_users true', !empty($permBm['manage_users']));
rmAssert('bm manage_branches false', empty($permBm['manage_branches']));
rmAssert('bm manage_data true', !empty($permBm['manage_data']));
rmAssert('bm manage_settings true', !empty($permBm['manage_settings']));
rmAssert('bm manage_backups false', empty($permBm['manage_backups']));

// Permissions — kullanıcı
$permUser = medisaBuildPermissions($ctxUserA);
rmAssert('user view_main_app false', empty($permUser['view_main_app']));
rmAssert('user view_reports false', empty($permUser['view_reports']));
rmAssert('user manage_users false', empty($permUser['manage_users']));
rmAssert('user manage_branches false', empty($permUser['manage_branches']));
rmAssert('user manage_data false', empty($permUser['manage_data']));
rmAssert('user manage_settings false', empty($permUser['manage_settings']));
rmAssert('user manage_backups false', empty($permUser['manage_backups']));

// Access context
rmAssert('ctx gm role', ($ctxGm['role'] ?? '') === 'genel_yonetici');
rmAssert('ctx gm driver_dashboard', ($ctxGm['driver_dashboard'] ?? false) === true);
rmAssert('ctx bm role', ($ctxBmA['role'] ?? '') === 'sube_yonetici');
rmAssert('ctx legacy yonetici_only', ($ctxLegacy['yonetici_only'] ?? false) === true);
rmAssert('ctx legacy driver false', ($ctxLegacy['driver_dashboard'] ?? true) === false);
rmAssert('ctx yk driver true', ($ctxYk['driver_dashboard'] ?? false) === true);
rmAssert('ctx malformed null', medisaBuildAccessContext($data, []) === null);
rmAssert('ctx unknown user null', medisaBuildAccessContext($data, ['user_id' => 'missing-user']) === null);

// Token role not authoritative — data user role wins
$spoofToken = ['user_id' => 'user-a', 'role' => 'genel_yonetici'];
$spoofCtx = medisaBuildAccessContext($data, $spoofToken);
rmAssert('token role ignored for role', ($spoofCtx['role'] ?? '') === 'kullanici');
rmAssert('token role ignored for main', empty(($spoofCtx['permissions']['view_main_app'] ?? false)));

// Role downgrade: old token still resolves via current data role
$downgradeData = $data;
foreach ($downgradeData['users'] as &$u) {
    if ((string)($u['id'] ?? '') === 'gm-1') {
        $u['role'] = 'kullanici';
        $u['branchIds'] = ['branch-a'];
    }
}
unset($u);
$downgradedCtx = medisaBuildAccessContext($downgradeData, ['user_id' => 'gm-1', 'role' => 'genel_yonetici']);
rmAssert('role downgrade uses data role', ($downgradedCtx['role'] ?? '') === 'kullanici');
rmAssert('role downgrade main denied', empty(($downgradedCtx['permissions']['view_main_app'] ?? false)));

// Branch removal after token: old branch_ids in token ignored
$branchRemoved = $data;
foreach ($branchRemoved['users'] as &$u) {
    if ((string)($u['id'] ?? '') === 'bm-a') {
        $u['branchIds'] = ['branch-c'];
    }
}
unset($u);
$branchRemovedCtx = medisaBuildAccessContext($branchRemoved, ['user_id' => 'bm-a', 'branch_ids' => ['branch-a']]);
rmAssertSame('branch removal uses data branches', ['branch-c'], $branchRemovedCtx['branch_ids'] ?? null);
rmAssert('branch removal hides old branch vehicle', medisaCanViewVehicleRecord(rmVehicleById($data, 'veh-a1'), $branchRemovedCtx) === false);

// Branch / vehicle / user visibility — genel
rmAssert('gm views all branches a', medisaCanViewBranchRecord(rmBranchById($data, 'branch-a'), $ctxGm) === true);
rmAssert('gm views all branches empty', medisaCanViewBranchRecord(rmBranchById($data, 'branch-empty'), $ctxGm) === true);
rmAssert('gm views all vehicles', medisaCanViewVehicleRecord(rmVehicleById($data, 'veh-c1'), $ctxGm) === true);
rmAssert('gm manages all vehicles', medisaCanManageVehicleRecord(rmVehicleById($data, 'veh-c1'), $ctxGm) === true);
rmAssert('gm views all users', medisaCanViewUserRecord($gm2, $ctxGm) === true);
rmAssert('gm manages other gm', medisaCanManageUserRecord($gm2, $ctxGm) === true);
rmAssert('gm views report users', medisaCanViewReportUserRecord($userB, $ctxGm) === true);

// Branch manager scope
rmAssert('bm views own branch', medisaCanViewBranchRecord(rmBranchById($data, 'branch-a'), $ctxBmA) === true);
rmAssert('bm hides other branch', medisaCanViewBranchRecord(rmBranchById($data, 'branch-b'), $ctxBmA) === false);
rmAssert('bm-ab views a', medisaCanViewBranchRecord(rmBranchById($data, 'branch-a'), $ctxBmAb) === true);
rmAssert('bm-ab views b', medisaCanViewBranchRecord(rmBranchById($data, 'branch-b'), $ctxBmAb) === true);
rmAssert('bm-ab hides c', medisaCanViewBranchRecord(rmBranchById($data, 'branch-c'), $ctxBmAb) === false);
rmAssert('bm views own vehicle', medisaCanViewVehicleRecord(rmVehicleById($data, 'veh-a1'), $ctxBmA) === true);
rmAssert('bm manages own vehicle', medisaCanManageVehicleRecord(rmVehicleById($data, 'veh-a1'), $ctxBmA) === true);
rmAssert('bm denies other vehicle view', medisaCanViewVehicleRecord(rmVehicleById($data, 'veh-b1'), $ctxBmA) === false);
rmAssert('bm denies other vehicle manage', medisaCanManageVehicleRecord(rmVehicleById($data, 'veh-b1'), $ctxBmA) === false);
rmAssert('bm views own-branch user', medisaCanViewUserRecord($userA, $ctxBmA) === true);
rmAssert('bm manages own-branch user', medisaCanManageUserRecord($userA, $ctxBmA) === true);
rmAssert('bm denies other-branch user', medisaCanViewUserRecord($userB, $ctxBmA) === false);
rmAssert('bm denies manage other-branch user', medisaCanManageUserRecord($userB, $ctxBmA) === false);
rmAssert('bm denies view gm', medisaCanViewUserRecord($gm, $ctxBmA) === false);
rmAssert('bm denies manage gm', medisaCanManageUserRecord($gm, $ctxBmA) === false);
rmAssert('bm denies self manage', medisaCanManageUserRecord($bmA, $ctxBmA) === false);
rmAssert('bm denies self view', medisaCanViewUserRecord($bmA, $ctxBmA) === false);
rmAssert('bm denies peer bm view', medisaCanViewUserRecord($bmA2, $ctxBmA) === false);
rmAssert('bm denies peer bm manage', medisaCanManageUserRecord($bmA2, $ctxBmA) === false);
rmAssert('bm denies other-branch bm view', medisaCanViewUserRecord($legacyY, $ctxBmA) === false);
rmAssert('bm denies other-branch bm manage', medisaCanManageUserRecord($legacyY, $ctxBmA) === false);
rmAssert('bm denies unknown target role manage', medisaCanManageUserRecord(['id' => 'unk-1', 'role' => 'hacker', 'branchIds' => ['branch-a']], $ctxBmA) === false);
rmAssert('bm denies unknown target role view', medisaCanViewUserRecord(['id' => 'unk-1', 'role' => 'hacker', 'branchIds' => ['branch-a']], $ctxBmA) === false);
rmAssert('bm denies legacy yonetici_kullanici manage', medisaCanManageUserRecord($yk, $ctxBmA) === false);
rmAssert('bm report own user', medisaCanViewReportUserRecord($userA, $ctxBmA) === true);
rmAssert('bm report other user hidden', medisaCanViewReportUserRecord($userB, $ctxBmA) === false);
rmAssert('bm report gm hidden', medisaCanViewReportUserRecord($gm, $ctxBmA) === false);
rmAssert('bm report peer bm hidden', medisaCanViewReportUserRecord($bmA2, $ctxBmA) === false);
rmAssert('bm report other-branch bm hidden', medisaCanViewReportUserRecord($legacyY, $ctxBmA) === false);
rmAssert('bm report self hidden', medisaCanViewReportUserRecord($bmA, $ctxBmA) === false);
rmAssert('bm report unknown role hidden', medisaCanViewReportUserRecord(['id' => 'unk-r1', 'role' => 'hacker', 'branchIds' => ['branch-a']], $ctxBmA) === false);
rmAssert('bm report partial multi-branch hidden', medisaCanViewReportUserRecord(['id' => 'partial-1', 'role' => 'kullanici', 'branchIds' => ['branch-a', 'branch-c']], $ctxBmA) === false);
rmAssert('gm report views bm', medisaCanViewReportUserRecord($bmA, $ctxGm) === true);
rmAssert('gm report views peer bm', medisaCanViewReportUserRecord($bmA2, $ctxGm) === true);
rmAssert('gm report views gm2', medisaCanViewReportUserRecord($gm2, $ctxGm) === true);
rmAssert('gm report views normal user', medisaCanViewReportUserRecord($userA, $ctxGm) === true);

// Empty / partial branch scope deny
rmAssert('empty target branch deny manage', medisaCanManageUserRecord(['id' => 'x', 'role' => 'kullanici', 'branchIds' => []], $ctxBmA) === false);
$partialOutside = ['id' => 'partial-1', 'role' => 'kullanici', 'branchIds' => ['branch-a', 'branch-c']];
rmAssert('partial outside scope deny', medisaCanManageUserRecord($partialOutside, $ctxBmA) === false);
rmAssert('no branch scope on bm context deny foreign', medisaCanViewVehicleRecord(rmVehicleById($data, 'veh-c1'), $ctxBmA) === false);

// Kullanıcı visibility
rmAssert('user sees self', medisaCanViewUserRecord($userA, $ctxUserA) === true);
rmAssert('user hides other', medisaCanViewUserRecord($userB, $ctxUserA) === false);
rmAssert('user sees assigned vehicle', medisaCanViewVehicleRecord(rmVehicleById($data, 'veh-a1'), $ctxUserA) === true);
rmAssert('user sees zimmet vehicle', medisaCanViewVehicleRecord(rmVehicleById($data, 'veh-zimmet'), $ctxUserC) === true);
rmAssert('user hides unrelated vehicle', medisaCanViewVehicleRecord(rmVehicleById($data, 'veh-b1'), $ctxUserA) === false);
rmAssert('user manage vehicle false', medisaCanManageVehicleRecord(rmVehicleById($data, 'veh-a1'), $ctxUserA) === false);
rmAssert('user manage user false', medisaCanManageUserRecord($userB, $ctxUserA) === false);
rmAssert('unknown role vehicle deny', medisaCanViewVehicleRecord(rmVehicleById($data, 'veh-a1'), ['role' => 'unknown', 'user_id' => 'user-a', 'branch_ids' => ['branch-a'], 'user' => $userA]) === false);

// Filter projections
$filtGm = medisaFilterDataForContext($data, $ctxGm);
$filtBm = medisaFilterDataForContext($data, $ctxBmA);
$filtUser = medisaFilterDataForContext($data, $ctxUserA);
$filtReportBm = medisaFilterReportDataForContext($data, $ctxBmA);
$filtReportUser = medisaFilterReportDataForContext($data, $ctxUserA);

rmAssert('gm filter all vehicles', count($filtGm['tasitlar'] ?? []) === count($data['tasitlar']));
rmAssert('gm filter all users', count($filtGm['users'] ?? []) === count($data['users']));
rmAssert('gm filter all branches', count($filtGm['branches'] ?? []) === count($data['branches']));
rmAssert('gm kasko rows emptied', (($filtGm['kaskoDegerListesi']['rows'] ?? null) === []));
rmAssert('bm vehicle scope only a', rmIds($filtBm['tasitlar'] ?? []) === ['veh-a1', 'veh-a2', 'veh-zimmet']);
rmAssert('bm no gm user', rmHasId($filtBm['users'] ?? [], 'gm-1') === false);
rmAssert('bm has user-a', rmHasId($filtBm['users'] ?? [], 'user-a') === true);
rmAssert('bm no user-b', rmHasId($filtBm['users'] ?? [], 'user-b') === false);
rmAssert('bm self hidden from user list', rmHasId($filtBm['users'] ?? [], 'bm-a') === false);
rmAssert('bm peer hidden from user list', rmHasId($filtBm['users'] ?? [], 'bm-a2') === false);
rmAssert('bm no branch-c', rmHasId($filtBm['branches'] ?? [], 'branch-c') === false);
rmAssert('user only own user row', rmIds($filtUser['users'] ?? []) === ['user-a']);
rmAssert('user only assigned vehicle', rmIds($filtUser['tasitlar'] ?? []) === ['veh-a1']);
rmAssert('user full data not leaked vehicle count', count($filtUser['tasitlar'] ?? []) < count($data['tasitlar']));
rmAssert('user kayitlar empty', ($filtUser['kayitlar'] ?? null) === []);
rmAssert('user sifreler empty', ($filtUser['sifreler'] ?? null) === []);
rmAssert('user kasko rows empty', (($filtUser['kaskoDegerListesi']['rows'] ?? null) === []));
rmAssert('report bm hides gm', rmHasId($filtReportBm['users'] ?? [], 'gm-1') === false);
rmAssert('report bm shows user-a', rmHasId($filtReportBm['users'] ?? [], 'user-a') === true);
rmAssert('report bm hides peer bm', rmHasId($filtReportBm['users'] ?? [], 'bm-a2') === false);
rmAssert('report bm hides self', rmHasId($filtReportBm['users'] ?? [], 'bm-a') === false);
rmAssert('report user only self', rmIds($filtReportUser['users'] ?? []) === ['user-a']);

// Session payload must not carry password fields
$sessionGm = medisaBuildSessionPayload($ctxGm);
rmAssert('session no sifre', !array_key_exists('sifre', $sessionGm['user'] ?? []) && !isset($sessionGm['sifre']));
rmAssert('session no sifre_hash', !array_key_exists('sifre_hash', $sessionGm['user'] ?? []) && !isset($sessionGm['sifre_hash']));

// Filtered user rows: every role and report projection uses the same safe allowlist.
$sensitiveUserFields = [
    'sifre',
    'sifre_hash',
    'sifre_guncellendi_at',
    'password',
    'password_hash',
    'reset_token',
    'auth_metadata',
];
$projectionSets = [
    'gm' => $filtGm['users'] ?? [],
    'bm' => $filtBm['users'] ?? [],
    'user' => $filtUser['users'] ?? [],
    'report_bm' => $filtReportBm['users'] ?? [],
    'report_user' => $filtReportUser['users'] ?? [],
];
foreach ($projectionSets as $projectionName => $rows) {
    $hasSensitiveField = false;
    foreach ($rows as $row) {
        foreach ($sensitiveUserFields as $field) {
            if (array_key_exists($field, $row)) {
                $hasSensitiveField = true;
                break 2;
            }
        }
    }
    rmAssert($projectionName . ' user projection secretsiz', $hasSensitiveField === false);
}
$projectedUserA = null;
foreach (($filtUser['users'] ?? []) as $row) {
    if ((string)($row['id'] ?? '') === 'user-a') {
        $projectedUserA = $row;
        break;
    }
}
rmAssert('user projection portal_sifresi_var true', ($projectedUserA['portal_sifresi_var'] ?? false) === true);

// Save scoped ensure
rmAssert('save own vehicle allowed', medisaSaveEnsureScopedVehiclesAreAllowed([rmVehicleById($data, 'veh-a1')], $ctxBmA) === true);
rmAssert('save other vehicle rejected', medisaSaveEnsureScopedVehiclesAreAllowed([rmVehicleById($data, 'veh-b1')], $ctxBmA) === false);
rmAssert('save own user allowed', medisaSaveEnsureScopedUsersAreAllowed([$userA], $ctxBmA) === true);
rmAssert('save other user rejected', medisaSaveEnsureScopedUsersAreAllowed([$userB], $ctxBmA) === false);
rmAssert('save gm user rejected for bm', medisaSaveEnsureScopedUsersAreAllowed([$gm], $ctxBmA) === false);
rmAssert('save self user rejected for bm', medisaSaveEnsureScopedUsersAreAllowed([$bmA], $ctxBmA) === false);
rmAssert('save peer bm rejected for bm', medisaSaveEnsureScopedUsersAreAllowed([$bmA2], $ctxBmA) === false);
rmAssert('user cannot save vehicle', medisaSaveEnsureScopedVehiclesAreAllowed([rmVehicleById($data, 'veh-a1')], $ctxUserA) === false);

// P0-B: current+incoming mutation validation
$mutationOk = medisaSaveValidateUserCollectionMutations($data['users'], [$userA], $ctxBmA);
rmAssert('mutation update own-scope user ok', $mutationOk === true);

$downgradePeer = $bmA2;
$downgradePeer['role'] = 'kullanici';
$mutationDowngrade = medisaSaveValidateUserCollectionMutations($data['users'], [$downgradePeer], $ctxBmA);
rmAssert('mutation role-downgrade peer denied', is_array($mutationDowngrade) && (int)($mutationDowngrade['status'] ?? 0) === 403);

$promoteUser = $userA;
$promoteUser['role'] = 'sube_yonetici';
$mutationPromote = medisaSaveValidateUserCollectionMutations($data['users'], [$promoteUser], $ctxBmA);
rmAssert('mutation promote to bm denied', is_array($mutationPromote) && (int)($mutationPromote['status'] ?? 0) === 403);

$promoteGm = $userA;
$promoteGm['role'] = 'genel_yonetici';
$mutationPromoteGm = medisaSaveValidateUserCollectionMutations($data['users'], [$promoteGm], $ctxBmA);
rmAssert('mutation promote to gm denied', is_array($mutationPromoteGm) && (int)($mutationPromoteGm['status'] ?? 0) === 403);

$createBm = ['id' => 'new-bm', 'role' => 'sube_yonetici', 'branchIds' => ['branch-a'], 'isim' => 'New BM'];
$mutationCreateBm = medisaSaveValidateUserCollectionMutations($data['users'], [$userA, $createBm], $ctxBmA);
rmAssert('mutation create bm denied', is_array($mutationCreateBm) && (int)($mutationCreateBm['status'] ?? 0) === 403);

$createUser = ['id' => 'new-user', 'role' => 'kullanici', 'branchIds' => ['branch-a'], 'isim' => 'New User'];
$mutationCreateUser = medisaSaveValidateUserCollectionMutations($data['users'], [$userA, $createUser], $ctxBmA);
rmAssert('mutation create normal user ok', $mutationCreateUser === true);

$stealUser = $userB;
$stealUser['branchIds'] = ['branch-a'];
$mutationSteal = medisaSaveValidateUserCollectionMutations($data['users'], [$stealUser], $ctxBmA);
rmAssert('mutation steal other-branch user denied', is_array($mutationSteal) && (int)($mutationSteal['status'] ?? 0) === 403);

$moveOut = $userA;
$moveOut['branchIds'] = ['branch-c'];
$mutationMoveOut = medisaSaveValidateUserCollectionMutations($data['users'], [$moveOut], $ctxBmA);
rmAssert('mutation move user out of scope denied', is_array($mutationMoveOut) && (int)($mutationMoveOut['status'] ?? 0) === 403);

$partialUser = ['id' => 'partial-mut', 'role' => 'kullanici', 'branchIds' => ['branch-a', 'branch-c']];
$mutationPartial = medisaSaveValidateUserCollectionMutations($data['users'], [$partialUser], $ctxBmA);
rmAssert('mutation partial multi-branch create denied', is_array($mutationPartial) && (int)($mutationPartial['status'] ?? 0) === 403);

// Save apply: role downgrade peer must 403 and preserve peer role
$saveDowngradeData = rmFixture();
$downgradePayload = [
    '_medisaWire' => ['schemaVersion' => 1, 'mode' => 'delta-v1'],
    '_medisaMutation' => [
        'collections' => ['users'],
        'changedVehicleIds' => [],
        'deletedVehicleIds' => [],
        'deletedVehicleVersions' => [],
    ],
    'users' => [
        ['id' => 'bm-a2', 'isim' => 'Synthetic BM A Peer', 'role' => 'kullanici', 'branchIds' => ['branch-a']],
        ['id' => 'user-a', 'isim' => 'Synthetic User A', 'role' => 'kullanici', 'branchIds' => ['branch-a']],
    ],
];
$downgradeRes = medisaSaveApplyIncomingData($downgradePayload, $saveDowngradeData, $ctxBmA);
rmAssert('save apply downgrade peer 403', ($downgradeRes['success'] ?? true) === false && (int)($downgradeRes['status'] ?? 0) === 403);
$peerAfter = rmUserById($saveDowngradeData, 'bm-a2');
rmAssert('save apply downgrade peer role preserved', medisaResolveUserRole($peerAfter) === 'sube_yonetici');

$savePromoteData = rmFixture();
$promotePayload = [
    '_medisaWire' => ['schemaVersion' => 1, 'mode' => 'delta-v1'],
    '_medisaMutation' => [
        'collections' => ['users'],
        'changedVehicleIds' => [],
        'deletedVehicleIds' => [],
        'deletedVehicleVersions' => [],
    ],
    'users' => [
        ['id' => 'user-a', 'isim' => 'Synthetic User A', 'role' => 'sube_yonetici', 'branchIds' => ['branch-a']],
    ],
];
$promoteRes = medisaSaveApplyIncomingData($promotePayload, $savePromoteData, $ctxBmA);
rmAssert('save apply promote user 403', ($promoteRes['success'] ?? true) === false && (int)($promoteRes['status'] ?? 0) === 403);
rmAssert('save apply promote user role preserved', medisaResolveUserRole(rmUserById($savePromoteData, 'user-a')) === 'kullanici');

$saveOmitPeerData = rmFixture();
$peerBeforeOmit = rmUserById($saveOmitPeerData, 'bm-a2');
$omitPeerPayload = [
    '_medisaWire' => ['schemaVersion' => 1, 'mode' => 'delta-v1'],
    '_medisaMutation' => [
        'collections' => ['users'],
        'changedVehicleIds' => [],
        'deletedVehicleIds' => [],
        'deletedVehicleVersions' => [],
    ],
    'users' => [
        ['id' => 'user-a', 'isim' => 'Synthetic User A', 'role' => 'kullanici', 'branchIds' => ['branch-a']],
    ],
];
$omitPeerRes = medisaSaveApplyIncomingData($omitPeerPayload, $saveOmitPeerData, $ctxBmA);
rmAssert('save apply omit peer keeps peer', ($omitPeerRes['success'] ?? false) === true);
$peerAfterOmit = rmUserById($saveOmitPeerData, 'bm-a2');
rmAssert('save apply omit peer still present', $peerAfterOmit !== null);
rmAssert('save apply omit peer role intact', medisaResolveUserRole($peerAfterOmit) === 'sube_yonetici');
rmAssert('save apply omit peer keeps gm', rmUserById($saveOmitPeerData, 'gm-1') !== null);
rmAssert(
    'save apply omit peer fields unchanged',
    json_encode($peerBeforeOmit, JSON_UNESCAPED_UNICODE) === json_encode($peerAfterOmit, JSON_UNESCAPED_UNICODE)
);

// İkinci normal save de peer'ı kaybetmemeli
$secondOmitPayload = $omitPeerPayload;
$secondOmitPayload['users'] = [
    ['id' => 'user-a', 'isim' => 'Synthetic User A Updated', 'role' => 'kullanici', 'branchIds' => ['branch-a']],
];
$secondOmitRes = medisaSaveApplyIncomingData($secondOmitPayload, $saveOmitPeerData, $ctxBmA);
rmAssert('second omit save succeeds', ($secondOmitRes['success'] ?? false) === true);
$peerAfterSecond = rmUserById($saveOmitPeerData, 'bm-a2');
rmAssert('second omit peer still present', $peerAfterSecond !== null);
rmAssert(
    'second omit peer fields still unchanged',
    json_encode($peerBeforeOmit, JSON_UNESCAPED_UNICODE) === json_encode($peerAfterSecond, JSON_UNESCAPED_UNICODE)
);
rmAssert('second omit user-a updated', (rmUserById($saveOmitPeerData, 'user-a')['isim'] ?? '') === 'Synthetic User A Updated');

// Notification scope
$nGm = medisaBuildNotificationScopeDescriptor($ctxGm);
$nBm = medisaBuildNotificationScopeDescriptor($ctxBmA);
$nUser = medisaBuildNotificationScopeDescriptor($ctxUserA);
rmAssert('notif gm branch scope all', str_contains((string)($nGm['canonicalKey'] ?? ''), '|branches:all'));
rmAssert('notif bm includes branch-a', str_contains((string)($nBm['canonicalKey'] ?? ''), 'branches:branch-a'));
rmAssert('notif scopes differ gm vs bm', ($nGm['canonicalKey'] ?? '') !== ($nBm['canonicalKey'] ?? ''));
rmAssert('notif scopes differ bm vs user', ($nBm['canonicalKey'] ?? '') !== ($nUser['canonicalKey'] ?? ''));
rmAssert('notif user key has user id', str_contains((string)($nUser['canonicalKey'] ?? ''), 'user:user-a'));

// --- Server-side authorization hard gate (synthetic) ---
$auth401 = rmWithAuthHeader(null, function () use ($data) {
    return medisaResolveAuthorizedContext($data, 'view_main_app');
});
rmAssert('auth no token 401', (int)($auth401['status'] ?? 0) === 401);

$authMalformed = rmWithAuthHeader('Bearer not-a-jwt', function () use ($data) {
    return medisaResolveAuthorizedContext($data, 'view_main_app');
});
rmAssert('auth malformed token 401', (int)($authMalformed['status'] ?? 0) === 401);

$tokenUser = medisaCreateSignedToken(medisaBuildSessionTokenClaims($ctxUserA));
$authUserMain = rmWithAuthHeader('Bearer ' . $tokenUser, function () use ($data) {
    return medisaResolveAuthorizedContext($data, 'view_main_app');
});
rmAssert('user main app 403', (int)($authUserMain['status'] ?? 0) === 403);

$tokenBm = medisaCreateSignedToken(medisaBuildSessionTokenClaims($ctxBmA));
$authBmBranch = rmWithAuthHeader('Bearer ' . $tokenBm, function () use ($data) {
    return medisaResolveAuthorizedContext($data, 'manage_branches');
});
rmAssert('bm manage_branches 403', (int)($authBmBranch['status'] ?? 0) === 403);

$authBmOk = rmWithAuthHeader('Bearer ' . $tokenBm, function () use ($data) {
    return medisaResolveAuthorizedContext($data, 'view_main_app');
});
rmAssert('bm main app allowed', ($authBmOk['success'] ?? false) === true);

// 403 helpers for scope / self / gm management (already covered by canManage*; lock status codes via error result)
rmAssert('403 permission helper', (int)(medisaBuildErrorResult('Bu işlem için yetkiniz yok.', 403)['status'] ?? 0) === 403);
rmAssert('400 invalid payload helper', (int)(medisaBuildErrorResult('Geçersiz istek.', 400)['status'] ?? 0) === 400);

// Stale version / delete via save apply (temp in-memory fixture only)
$saveData = rmFixture();
$staleUpdate = [
    '_medisaWire' => ['schemaVersion' => 1, 'mode' => 'delta-v1'],
    '_medisaMutation' => [
        'collections' => ['tasitlar'],
        'changedVehicleIds' => ['veh-a1'],
        'deletedVehicleIds' => [],
        'deletedVehicleVersions' => [],
    ],
    'tasitlar' => [['id' => 'veh-a1', 'plate' => 'SYN A1', 'version' => 1, 'branchId' => 'branch-a', 'assignedUserId' => 'user-a']],
];
$staleRes = medisaSaveApplyIncomingData($staleUpdate, $saveData, $ctxBmA);
rmAssert('stale vehicle version 409', !empty($staleRes['conflict']) && (int)($staleRes['status'] ?? 0) === 409);

$saveData2 = rmFixture();
$staleDelete = [
    '_medisaWire' => ['schemaVersion' => 1, 'mode' => 'delta-v1'],
    '_medisaMutation' => [
        'collections' => ['tasitlar'],
        'changedVehicleIds' => [],
        'deletedVehicleIds' => ['veh-a1'],
        'deletedVehicleVersions' => ['veh-a1' => 1],
    ],
    'tasitlar' => [],
];
$staleDelRes = medisaSaveApplyIncomingData($staleDelete, $saveData2, $ctxBmA);
rmAssert('stale delete version 409', !empty($staleDelRes['conflict']) && (int)($staleDelRes['status'] ?? 0) === 409);

$saveData3 = rmFixture();
$outScopeSave = [
    '_medisaWire' => ['schemaVersion' => 1, 'mode' => 'delta-v1'],
    '_medisaMutation' => [
        'collections' => ['tasitlar'],
        'changedVehicleIds' => ['veh-b1'],
        'deletedVehicleIds' => [],
        'deletedVehicleVersions' => [],
    ],
    'tasitlar' => [['id' => 'veh-b1', 'plate' => 'SYN B1', 'version' => 3, 'branchId' => 'branch-b', 'assignedUserId' => 'user-b']],
];
$outScopeRes = medisaSaveApplyIncomingData($outScopeSave, $saveData3, $ctxBmA);
rmAssert('scope dışı vehicle save 403', ($outScopeRes['success'] ?? true) === false && (int)($outScopeRes['status'] ?? 0) === 403);

$invalidPayload = [
    '_medisaWire' => ['schemaVersion' => 1, 'mode' => 'delta-v1'],
    'tasitlar' => [['id' => 'veh-a1', 'version' => 2]],
];
$invalidFixture = rmFixture();
$invalidRes = medisaSaveApplyIncomingData($invalidPayload, $invalidFixture, $ctxBmA);
rmAssert('invalid delta payload 400', ($invalidRes['success'] ?? true) === false && (int)($invalidRes['status'] ?? 0) === 400);

// Driver-style bypass: user context cannot view/manage foreign vehicle id
rmAssert('driver bypass foreign vehicle deny', medisaCanViewVehicleRecord(rmVehicleById($data, 'veh-b1'), $ctxUserA) === false);
rmAssert('driver bypass foreign vehicle manage deny', medisaCanManageVehicleRecord(rmVehicleById($data, 'veh-b1'), $ctxUserA) === false);

// Runtime lookup must not enter save payload path as kasko full rows on filter
rmAssert('filter never copies full kasko rows', count($filtGm['kaskoDegerListesi']['rows'] ?? ['x']) === 0);

// Legacy main access + branch scope
rmAssert('legacy main access true', medisaHasMainAppAccessRole($ctxLegacy['role'] ?? '') === true);
rmAssert('legacy branch scope kept', medisaCanViewVehicleRecord(rmVehicleById($data, 'veh-b1'), $ctxLegacy) === true);
rmAssert('legacy other branch denied', medisaCanViewVehicleRecord(rmVehicleById($data, 'veh-a1'), $ctxLegacy) === false);
rmAssert('yk main access true', medisaHasMainAppAccessRole($ctxYk['role'] ?? '') === true);

// Malformed context deny for branch view
rmAssert('malformed branch deny', medisaCanViewBranchRecord(['id' => 'branch-a'], ['role' => 'sube_yonetici', 'branch_ids' => []]) === false);
rmAssert('unknown role deny manage user', medisaCanManageUserRecord($userA, ['role' => 'hacker', 'user_id' => 'bm-a', 'branch_ids' => ['branch-a']]) === false);

// --- P0-C: self + last active GM invariants ---
rmAssert('active helper missing aktif true', medisaIsUserActive(['id' => 'x']) === true);
rmAssert('active helper aktif false', medisaIsUserActive(['id' => 'x', 'aktif' => false]) === false);
rmAssert('active helper malformed fail-closed true', medisaIsUserActive(['id' => 'x', 'aktif' => 'weird']) === true);
rmAssert('active gm true', medisaIsActiveGeneralManager($gm) === true);
rmAssert('count active gm fixture', medisaCountActiveGeneralManagers($data['users']) === 2);

$gmSelfDeleteIncoming = array_values(array_filter($data['users'], function ($u) {
    return (string)($u['id'] ?? '') !== 'gm-1';
}));
$gmSelfDelete = medisaSaveValidateUserCollectionMutations($data['users'], $gmSelfDeleteIncoming, $ctxGm);
rmAssert('p0c self delete deny', is_array($gmSelfDelete) && (int)($gmSelfDelete['status'] ?? 0) === 403);

$gmSelfDowngradeIncoming = [];
foreach ($data['users'] as $u) {
    $copy = $u;
    if ((string)($u['id'] ?? '') === 'gm-1') {
        $copy['role'] = 'kullanici';
        $copy['branchIds'] = ['branch-a'];
    }
    $gmSelfDowngradeIncoming[] = $copy;
}
$gmSelfDowngrade = medisaSaveValidateUserCollectionMutations($data['users'], $gmSelfDowngradeIncoming, $ctxGm);
rmAssert('p0c self downgrade deny', is_array($gmSelfDowngrade) && (int)($gmSelfDowngrade['status'] ?? 0) === 403);

$gmSelfBmDowngradeIncoming = [];
foreach ($data['users'] as $u) {
    $copy = $u;
    if ((string)($u['id'] ?? '') === 'gm-1') {
        $copy['role'] = 'sube_yonetici';
        $copy['branchIds'] = ['branch-a'];
    }
    $gmSelfBmDowngradeIncoming[] = $copy;
}
$gmSelfBm = medisaSaveValidateUserCollectionMutations($data['users'], $gmSelfBmDowngradeIncoming, $ctxGm);
rmAssert('p0c self bm downgrade deny', is_array($gmSelfBm) && (int)($gmSelfBm['status'] ?? 0) === 403);

$gmSelfUnknownIncoming = [];
foreach ($data['users'] as $u) {
    $copy = $u;
    if ((string)($u['id'] ?? '') === 'gm-1') {
        $copy['role'] = 'unknown_role';
    }
    $gmSelfUnknownIncoming[] = $copy;
}
$gmSelfUnknown = medisaSaveValidateUserCollectionMutations($data['users'], $gmSelfUnknownIncoming, $ctxGm);
rmAssert('p0c self unknown role deny', is_array($gmSelfUnknown) && (int)($gmSelfUnknown['status'] ?? 0) === 403);

$gmSelfDeactivateIncoming = [];
foreach ($data['users'] as $u) {
    $copy = $u;
    if ((string)($u['id'] ?? '') === 'gm-1') {
        $copy['aktif'] = false;
    }
    $gmSelfDeactivateIncoming[] = $copy;
}
$gmSelfDeact = medisaSaveValidateUserCollectionMutations($data['users'], $gmSelfDeactivateIncoming, $ctxGm);
rmAssert('p0c self deactivate deny', is_array($gmSelfDeact) && (int)($gmSelfDeact['status'] ?? 0) === 403);

$gmSelfNameIncoming = [];
foreach ($data['users'] as $u) {
    $copy = $u;
    if ((string)($u['id'] ?? '') === 'gm-1') {
        $copy['isim'] = 'Synthetic GM Renamed';
        $copy['telefon'] = '05551112233';
    }
    $gmSelfNameIncoming[] = $copy;
}
$gmSelfName = medisaSaveValidateUserCollectionMutations($data['users'], $gmSelfNameIncoming, $ctxGm);
rmAssert('p0c self name/phone allow', $gmSelfName === true);

$soloUsers = array_values(array_filter($data['users'], function ($u) {
    return (string)($u['id'] ?? '') !== 'gm-2';
}));
$soloCtx = rmContextFromUser(['users' => $soloUsers] + $data, $gm);
$soloDeleteIncoming = array_values(array_filter($soloUsers, function ($u) {
    return (string)($u['id'] ?? '') !== 'gm-1';
}));
$soloDelete = medisaSaveValidateUserCollectionMutations($soloUsers, $soloDeleteIncoming, $soloCtx);
rmAssert('p0c last gm delete deny', is_array($soloDelete) && (int)($soloDelete['status'] ?? 0) === 403);

$soloDowngradeIncoming = [];
foreach ($soloUsers as $u) {
    $copy = $u;
    if ((string)($u['id'] ?? '') === 'gm-1') {
        $copy['role'] = 'kullanici';
        $copy['branchIds'] = ['branch-a'];
    }
    $soloDowngradeIncoming[] = $copy;
}
$soloDowngrade = medisaSaveValidateUserCollectionMutations($soloUsers, $soloDowngradeIncoming, $soloCtx);
rmAssert('p0c last gm downgrade deny', is_array($soloDowngrade) && (int)($soloDowngrade['status'] ?? 0) === 403);

$soloDeactIncoming = [];
foreach ($soloUsers as $u) {
    $copy = $u;
    if ((string)($u['id'] ?? '') === 'gm-1') {
        $copy['aktif'] = false;
    }
    $soloDeactIncoming[] = $copy;
}
$soloDeact = medisaSaveValidateUserCollectionMutations($soloUsers, $soloDeactIncoming, $soloCtx);
rmAssert('p0c last gm deactivate deny', is_array($soloDeact) && (int)($soloDeact['status'] ?? 0) === 403);

$soloReplaceIncoming = $soloDeleteIncoming;
$soloReplaceIncoming[] = [
    'id' => 'gm-replaced',
    'isim' => 'Replacement GM',
    'role' => 'genel_yonetici',
    'sifre_hash' => 'fixture-hash-replaced',
];
$soloReplace = medisaSaveValidateUserCollectionMutations($soloUsers, $soloReplaceIncoming, $soloCtx);
rmAssert('p0c last gm id replacement deny', is_array($soloReplace) && (int)($soloReplace['status'] ?? 0) === 403);

$passiveGmUsers = $soloUsers;
$passiveGmUsers[] = [
    'id' => 'gm-passive',
    'isim' => 'Passive GM',
    'role' => 'genel_yonetici',
    'aktif' => false,
    'sifre_hash' => 'fixture-hash-passive',
];
$passiveCtx = rmContextFromUser(['users' => $passiveGmUsers] + $data, $gm);
$passiveDeleteActive = array_values(array_filter($passiveGmUsers, function ($u) {
    return (string)($u['id'] ?? '') !== 'gm-1';
}));
$passiveDel = medisaSaveValidateUserCollectionMutations($passiveGmUsers, $passiveDeleteActive, $passiveCtx);
rmAssert('p0c last active gm with passive peer delete deny', is_array($passiveDel) && (int)($passiveDel['status'] ?? 0) === 403);

$peerDeleteIncoming = array_values(array_filter($data['users'], function ($u) {
    return (string)($u['id'] ?? '') !== 'gm-2';
}));
$peerDelete = medisaSaveValidateUserCollectionMutations($data['users'], $peerDeleteIncoming, $ctxGm);
rmAssert('p0c peer gm delete allow when 2+', $peerDelete === true);

$peerDowngradeIncoming = [];
foreach ($data['users'] as $u) {
    $copy = $u;
    if ((string)($u['id'] ?? '') === 'gm-2') {
        $copy['role'] = 'kullanici';
        $copy['branchIds'] = ['branch-a'];
    }
    $peerDowngradeIncoming[] = $copy;
}
$peerDowngrade = medisaSaveValidateUserCollectionMutations($data['users'], $peerDowngradeIncoming, $ctxGm);
rmAssert('p0c peer gm downgrade allow when 2+', $peerDowngrade === true);

$peerDeactIncoming = [];
foreach ($data['users'] as $u) {
    $copy = $u;
    if ((string)($u['id'] ?? '') === 'gm-2') {
        $copy['aktif'] = false;
    }
    $peerDeactIncoming[] = $copy;
}
$peerDeact = medisaSaveValidateUserCollectionMutations($data['users'], $peerDeactIncoming, $ctxGm);
rmAssert('p0c peer gm deactivate allow when 2+', $peerDeact === true);

$bothGoneIncoming = array_values(array_filter($data['users'], function ($u) {
    $id = (string)($u['id'] ?? '');
    return $id !== 'gm-1' && $id !== 'gm-2';
}));
$bothGone = medisaSaveValidateUserCollectionMutations($data['users'], $bothGoneIncoming, $ctxGm);
rmAssert('p0c both gm removed deny', is_array($bothGone) && (int)($bothGone['status'] ?? 0) === 403);

$dupIncoming = $data['users'];
$dupIncoming[] = $gm;
$dupCheck = medisaSaveValidateUserCollectionMutations($data['users'], $dupIncoming, $ctxGm);
rmAssert('p0c duplicate id deny', is_array($dupCheck) && (int)($dupCheck['status'] ?? 0) === 403);

$saveDataGm = rmFixture();
$gmApplyDeny = [
    '_medisaWire' => ['schemaVersion' => 1, 'mode' => 'delta-v1'],
    '_medisaMutation' => [
        'collections' => ['users'],
        'changedVehicleIds' => [],
        'deletedVehicleIds' => [],
        'deletedVehicleVersions' => [],
    ],
    'users' => $gmSelfDeleteIncoming,
];
$gmApplyRes = medisaSaveApplyIncomingData($gmApplyDeny, $saveDataGm, $ctxGm);
rmAssert('p0c apply self delete 403', ($gmApplyRes['success'] ?? true) === false && (int)($gmApplyRes['status'] ?? 0) === 403);
rmAssert('p0c apply self delete no persist', medisaCountActiveGeneralManagers($saveDataGm['users'] ?? []) === 2);

$saveDataGmAllow = rmFixture();
$gmApplyPeer = [
    '_medisaWire' => ['schemaVersion' => 1, 'mode' => 'delta-v1'],
    '_medisaMutation' => [
        'collections' => ['users'],
        'changedVehicleIds' => [],
        'deletedVehicleIds' => [],
        'deletedVehicleVersions' => [],
    ],
    'users' => $peerDeleteIncoming,
];
$gmApplyPeerRes = medisaSaveApplyIncomingData($gmApplyPeer, $saveDataGmAllow, $ctxGm);
rmAssert('p0c apply peer delete allow', ($gmApplyPeerRes['success'] ?? false) === true);
rmAssert('p0c apply peer delete leaves one gm', medisaCountActiveGeneralManagers($saveDataGmAllow['users'] ?? []) === 1);

echo "\nROLE_MATRIX_PASSED={$passed}\n";
echo "ROLE_MATRIX_FAILED={$failed}\n";

if ($failed > 0 || $passed < 80) {
    fwrite(STDERR, "Role matrix failed (passed={$passed} failed={$failed} min=80).\n");
    exit(1);
}

echo "verify-medisa-role-matrix: OK\n";
exit(0);
