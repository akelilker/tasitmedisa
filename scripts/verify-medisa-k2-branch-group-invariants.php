<?php
require_once __DIR__ . '/../core.php';
require_once __DIR__ . '/../full_backup.php';

function k2Assert($condition, $message) {
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
}

$data = medisaDefaultData();
$data['branches'] = [
    ['id' => 'a', 'name' => 'Branch A'],
    ['id' => 'b', 'name' => 'Branch B'],
    ['id' => 'c', 'name' => 'Branch C'],
];
$data['ayarlar']['k2BelgeGruplari'] = [
    ['id' => 'k2g_one', 'branchIds' => ['a', 'b'], 'expiryDate' => '2027-05-17', 'documentPath' => 'k2_belgesi/k2_k2g_one.pdf', 'updatedAt' => 'x'],
    ['id' => 'k2g_two', 'branchIds' => ['c'], 'expiryDate' => '2028-05-17', 'documentPath' => 'k2_belgesi/k2_k2g_two.pdf', 'updatedAt' => 'x'],
];
$data['tasitlar'] = [
    ['id' => 'va', 'branchId' => 'a', 'vehicleType' => 'minivan', 'aktif' => true],
    ['id' => 'vb', 'branchId' => 'b', 'vehicleType' => 'kamyon', 'aktif' => true],
    ['id' => 'vc', 'branchId' => 'c', 'vehicleType' => 'romork', 'aktif' => true],
    ['id' => 'inactive', 'branchId' => 'a', 'vehicleType' => 'minivan', 'aktif' => false, 'tasitKartiExpiryDate' => 'old'],
    ['id' => 'car', 'branchId' => 'a', 'vehicleType' => 'otomobil', 'aktif' => true, 'tasitKartiExpiryDate' => 'old'],
];
$gm = ['role' => 'genel_yonetici', 'branch_ids' => [], 'user_id' => 'gm'];
$bmA = ['role' => 'sube_yonetici', 'branch_ids' => ['a']];

k2Assert(medisaFindK2BelgeGroupByBranchId($data, 'a')['id'] === 'k2g_one', 'A resolves Group 1');
k2Assert(medisaFindK2BelgeGroupByBranchId($data, 'b')['id'] === 'k2g_one', 'B resolves Group 1');
k2Assert(medisaFindK2BelgeGroupByBranchId($data, 'c')['id'] === 'k2g_two', 'C resolves Group 2');
k2Assert(medisaCanAccessK2BelgeGroup(medisaFindK2BelgeGroupByBranchId($data, 'a'), $bmA), 'BM-A reads Group 1');
k2Assert(!medisaCanAccessK2BelgeGroup(medisaFindK2BelgeGroupByBranchId($data, 'c'), $bmA), 'BM-A cannot read Group 2');

medisaSyncTasitKartiExpiryForK2Branches($data, ['a', 'b'], '2027-05-17');
k2Assert($data['tasitlar'][0]['tasitKartiExpiryDate'] === '2027-05-17', 'A expiry sync');
k2Assert($data['tasitlar'][1]['tasitKartiExpiryDate'] === '2027-05-17', 'B expiry sync');
k2Assert(($data['tasitlar'][2]['tasitKartiExpiryDate'] ?? '') === '', 'C remains independent');
k2Assert(($data['tasitlar'][3]['tasitKartiExpiryDate'] ?? '') === 'old', 'inactive excluded');
k2Assert(($data['tasitlar'][4]['tasitKartiExpiryDate'] ?? '') === 'old', 'automobile excluded');

$mutation = medisaApplyK2BelgeGroupMutation($data, $gm, 'a', '2029-01-01', ['a']);
k2Assert(($mutation['success'] ?? false) === true, 'GM membership mutation');
k2Assert(($data['tasitlar'][1]['tasitKartiExpiryDate'] ?? '') === '', 'removed B expiry cleared');
k2Assert(medisaFindK2BelgeGroupByBranchId($data, 'b') === null, 'B removed from group');
$forbidden = medisaApplyK2BelgeGroupMutation($data, $bmA, 'a', '2030-01-01', ['a', 'c']);
k2Assert(($forbidden['status'] ?? 0) === 403, 'BM membership mutation denied');
$deleteData = $data;
$deleteData['branches'] = [['id' => 'a', 'name' => 'Branch A']];
$deleteData['ayarlar']['k2BelgeGruplari'] = medisaNormalizeK2BelgeGruplari(
    $deleteData['ayarlar']['k2BelgeGruplari'],
    $deleteData['branches']
);
k2Assert(count($deleteData['ayarlar']['k2BelgeGruplari']) === 1, 'deleted branch leaves no empty group');
k2Assert(!in_array('b', $deleteData['ayarlar']['k2BelgeGruplari'][0]['branchIds'], true), 'deleted branch removed from group');

$token = medisaMintDocumentAccessToken($data, $gm, 'settings', 'k2', 'a');
k2Assert(($token['success'] ?? false) === true, 'group token minted');
$claims = medisaValidateDocumentToken($token['token']);
k2Assert(($claims['scope'] ?? '') === 'settings-k2', 'group token scope');
k2Assert(($claims['gid'] ?? '') === 'k2g_one', 'group token identity');

/* Synthetic multi-group backup fixture; data/data.json is never touched. */
$k2Dir = getDataDirPath() . DIRECTORY_SEPARATOR . 'k2_belgesi';
if (!is_dir($k2Dir)) mkdir($k2Dir, 0755, true);
$backupFileA = $k2Dir . DIRECTORY_SEPARATOR . 'k2_k2g_backup_a.pdf';
$backupFileB = $k2Dir . DIRECTORY_SEPARATOR . 'k2_k2g_backup_b.pdf';
file_put_contents($backupFileA, "%PDF synthetic A");
file_put_contents($backupFileB, "%PDF synthetic B");
$backupData = ['branches' => [['id' => 'a'], ['id' => 'b']], 'tasitlar' => [], 'ayarlar' => [
    'k2BelgeGruplari' => [
        ['id' => 'k2g_backup_a', 'branchIds' => ['a'], 'expiryDate' => '2027-01-01', 'documentPath' => 'k2_belgesi/k2_k2g_backup_a.pdf', 'updatedAt' => 'x'],
        ['id' => 'k2g_backup_b', 'branchIds' => ['b'], 'expiryDate' => '2028-01-01', 'documentPath' => 'k2_belgesi/k2_k2g_backup_b.pdf', 'updatedAt' => 'x'],
    ],
]];
$backupResult = medisaFullBackupCollectReferencedFiles($backupData);
$backupArchives = array_map(function ($entry) {
    return $entry['archive_path'] ?? '';
}, $backupResult['files'] ?? []);
k2Assert(in_array('data/k2_belgesi/k2_k2g_backup_a.pdf', $backupArchives, true), 'backup includes Group A PDF');
k2Assert(in_array('data/k2_belgesi/k2_k2g_backup_b.pdf', $backupArchives, true), 'backup includes Group B PDF');
$backupData['ayarlar']['k2BelgeGruplari'][1]['documentPath'] = 'k2_belgesi/missing-group-b.pdf';
$missingBackup = medisaFullBackupCollectReferencedFiles($backupData);
k2Assert(($missingBackup['error_code'] ?? '') === 'MISSING_REFERENCED_FILE', 'missing group PDF fails backup validation');
@unlink($backupFileA);
@unlink($backupFileB);

echo "PASS: K2 branch-group canonical, role, token and expiry invariants\n";
