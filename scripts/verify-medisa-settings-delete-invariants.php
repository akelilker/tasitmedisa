<?php
/**
 * Ayarlar → Şube / Kullanıcı silme fail-closed invariantları.
 * Gerçek runtime verisine dokunmaz; yalnız bellek içi fixture kullanır.
 */
require_once __DIR__ . '/../core.php';

$failures = 0;
$passed = 0;

function settingsDeleteAssert($condition, $message) {
    global $failures, $passed;
    if ($condition) {
        $passed++;
        return;
    }
    $failures++;
    fwrite(STDERR, "FAIL: {$message}\n");
}

function settingsDeleteBaseData() {
    $data = medisaDefaultData();
    $data['branches'] = [
        ['id' => 'b_vehicle', 'name' => 'Taşıtlı Şube'],
        ['id' => 'b_user_canonical', 'name' => 'Canonical Kullanıcılı Şube'],
        ['id' => 'b_user_legacy', 'name' => 'Legacy Kullanıcılı Şube'],
        ['id' => 'b_k2', 'name' => 'K2 Grubu Şubesi'],
        ['id' => 'b_empty', 'name' => 'Boş Şube'],
    ];
    $data['ayarlar']['k2BelgeGruplari'] = [
        ['id' => 'k2g_one', 'branchIds' => ['b_k2'], 'expiryDate' => '2030-01-01', 'documentPath' => '', 'updatedAt' => ''],
    ];
    $data['users'] = [
        ['id' => 'gm', 'name' => 'Genel Yönetici', 'rol' => 'genel_yonetici', 'aktif' => true],
        ['id' => 'gm2', 'name' => 'İkinci GM', 'rol' => 'genel_yonetici', 'aktif' => true],
        ['id' => 'u_canonical', 'name' => 'Canonical', 'rol' => 'kullanici', 'aktif' => true, 'branchIds' => ['b_user_canonical']],
        ['id' => 'u_legacy', 'name' => 'Legacy', 'rol' => 'kullanici', 'aktif' => true, 'sube_id' => 'b_user_legacy'],
        ['id' => 'u_assigned', 'name' => 'Tahsisli', 'rol' => 'kullanici', 'aktif' => true],
        ['id' => 'u_zimmet', 'name' => 'Zimmetli', 'rol' => 'kullanici', 'aktif' => true, 'zimmetli_araclar' => ['v_zimmet']],
        ['id' => 'u_monthly', 'name' => 'Aylık Hareketli', 'rol' => 'kullanici', 'aktif' => true],
        ['id' => 'u_correction', 'name' => 'Düzeltme Talepli', 'rol' => 'kullanici', 'aktif' => true],
        ['id' => 'u_free', 'name' => 'İlişkisiz', 'rol' => 'kullanici', 'aktif' => true],
    ];
    $data['tasitlar'] = [
        ['id' => 'v1', 'plaka' => '01AAA01', 'branchId' => 'b_vehicle'],
        ['id' => 'v_assigned', 'plaka' => '01AAA02', 'branchId' => 'b_empty2', 'assignedUserId' => 'u_assigned'],
        ['id' => 'v_zimmet', 'plaka' => '01AAA03', 'branchId' => 'b_empty2'],
    ];
    $data['arac_aylik_hareketler'] = [
        ['id' => 'm1', 'surucu_id' => 'u_monthly'],
    ];
    $data['duzeltme_talepleri'] = [
        ['id' => 'd1', 'surucu_id' => 'u_correction'],
    ];
    return $data;
}

function settingsDeleteGmContext() {
    return [
        'role' => 'genel_yonetici',
        'user_id' => 'gm',
        'branch_ids' => [],
        'user' => ['id' => 'gm', 'rol' => 'genel_yonetici', 'aktif' => true],
    ];
}

function settingsDeleteBranchPayload(array $data, $removeBranchId) {
    $branches = [];
    foreach ($data['branches'] as $branch) {
        if ((string)$branch['id'] !== (string)$removeBranchId) {
            $branches[] = $branch;
        }
    }
    return ['branches' => $branches, '_medisaMutation' => ['collections' => ['branches']]];
}

function settingsDeleteUserPayload(array $data, $removeUserId) {
    $users = [];
    foreach ($data['users'] as $user) {
        if ((string)$user['id'] !== (string)$removeUserId) {
            $users[] = $user;
        }
    }
    return ['users' => $users, '_medisaMutation' => ['collections' => ['users']]];
}

/** Reddedilen mutation sonrası bütün input snapshot'ı değişmemiş olmalı. */
function settingsDeleteExpectRejected($label, array $payload, array $context = null) {
    $data = settingsDeleteBaseData();
    $snapshot = $data;
    $result = medisaSaveApplyIncomingData($payload, $data, $context ?: settingsDeleteGmContext());
    settingsDeleteAssert(is_array($result) && ($result['success'] ?? null) !== true, $label . ' — reddedilmeli');
    settingsDeleteAssert($data === $snapshot, $label . ' — hiçbir koleksiyon değişmemeli (atomic fail-closed)');
    return is_array($result) ? $result : [];
}

function settingsDeleteExpectAccepted($label, array $payload, callable $check, array $context = null) {
    $data = settingsDeleteBaseData();
    $result = medisaSaveApplyIncomingData($payload, $data, $context ?: settingsDeleteGmContext());
    settingsDeleteAssert($result === true || ($result['success'] ?? false) === true, $label . ' — kabul edilmeli');
    settingsDeleteAssert($check($data), $label . ' — hedef kayıt silinmiş olmalı');
}

$base = settingsDeleteBaseData();

// --- ŞUBE ---
$vehicleReject = settingsDeleteExpectRejected('Taşıt bağlı şube', settingsDeleteBranchPayload($base, 'b_vehicle'));
settingsDeleteAssert(
    strpos((string)($vehicleReject['message'] ?? ''), 'şube silinemez') !== false
        && strpos((string)($vehicleReject['message'] ?? ''), 'taşıt') !== false,
    'Taşıt bağlı şube — mesaj ilişki adedini açıklamalı'
);
settingsDeleteExpectRejected('Canonical kullanıcı bağlı şube', settingsDeleteBranchPayload($base, 'b_user_canonical'));
settingsDeleteExpectRejected('Legacy kullanıcı bağlı şube', settingsDeleteBranchPayload($base, 'b_user_legacy'));
settingsDeleteExpectRejected('K2 grubuna bağlı şube', settingsDeleteBranchPayload($base, 'b_k2'));
settingsDeleteExpectAccepted('Tamamen boş şube', settingsDeleteBranchPayload($base, 'b_empty'), function ($data) {
    foreach ($data['branches'] as $branch) {
        if ((string)$branch['id'] === 'b_empty') return false;
    }
    return true;
});

// String/number şube kimliği farkı korumayı atlatmamalı.
$numericData = settingsDeleteBaseData();
$numericData['branches'][] = ['id' => 7, 'name' => 'Sayısal Şube'];
$numericData['tasitlar'][] = ['id' => 'v_num', 'plaka' => '01AAA07', 'branchId' => '7'];
$numericSnapshot = $numericData;
$numericPayload = ['branches' => array_values(array_filter($numericData['branches'], function ($branch) {
    return (string)$branch['id'] !== '7';
})), '_medisaMutation' => ['collections' => ['branches']]];
$numericResult = medisaSaveApplyIncomingData($numericPayload, $numericData, settingsDeleteGmContext());
settingsDeleteAssert(is_array($numericResult) && ($numericResult['success'] ?? null) !== true, 'String/number şube kimliği farkı korumayı atlatmamalı');
settingsDeleteAssert($numericData === $numericSnapshot, 'String/number vakasında snapshot değişmemeli');

// --- KULLANICI ---
$assignedReject = settingsDeleteExpectRejected('assignedUserId bağlı kullanıcı', settingsDeleteUserPayload($base, 'u_assigned'));
settingsDeleteAssert(
    strpos((string)($assignedReject['message'] ?? ''), 'kullanıcı silinemez') !== false,
    'assignedUserId bağlı kullanıcı — mesaj kontratı'
);
settingsDeleteExpectRejected('zimmetli_araclar bağlı kullanıcı', settingsDeleteUserPayload($base, 'u_zimmet'));
settingsDeleteExpectRejected('Aylık hareketi bulunan kullanıcı', settingsDeleteUserPayload($base, 'u_monthly'));
settingsDeleteExpectRejected('Düzeltme talebi bulunan kullanıcı', settingsDeleteUserPayload($base, 'u_correction'));
settingsDeleteExpectAccepted('İlişkisiz normal kullanıcı', settingsDeleteUserPayload($base, 'u_free'), function ($data) {
    foreach ($data['users'] as $user) {
        if ((string)$user['id'] === 'u_free') return false;
    }
    return true;
});

// Canonical + legacy aynı taşıtı iki kez saymamalı.
$dedupeData = settingsDeleteBaseData();
foreach ($dedupeData['tasitlar'] as $idx => $vehicle) {
    if ($vehicle['id'] === 'v_zimmet') {
        $dedupeData['tasitlar'][$idx]['assignedUserId'] = 'u_zimmet';
    }
}
$dedupeSummary = medisaSaveSummarizeUserDeleteRelations('u_zimmet', $dedupeData);
settingsDeleteAssert($dedupeSummary['tasit'] === 1, 'Canonical + legacy aynı taşıt tek sayılmalı');

// --- MEVCUT KORUMALAR ---
$selfReject = settingsDeleteExpectRejected('Self genel yönetici silme', settingsDeleteUserPayload($base, 'gm'));
settingsDeleteAssert(
    strpos((string)($selfReject['message'] ?? ''), 'Kendi hesabınızı silemezsiniz') !== false,
    'Self GM koruması mevcut mesajını korumalı'
);

$soleGmData = settingsDeleteBaseData();
$soleGmData['users'] = array_values(array_filter($soleGmData['users'], function ($user) {
    return $user['id'] !== 'gm';
}));
$soleGmSnapshot = $soleGmData;
$soleGmPayload = ['users' => array_values(array_filter($soleGmData['users'], function ($user) {
    return $user['id'] !== 'gm2';
})), '_medisaMutation' => ['collections' => ['users']]];
$soleGmContext = ['role' => 'genel_yonetici', 'user_id' => 'gm2', 'branch_ids' => [], 'user' => ['id' => 'gm2', 'rol' => 'genel_yonetici', 'aktif' => true]];
$soleGmResult = medisaSaveApplyIncomingData($soleGmPayload, $soleGmData, $soleGmContext);
settingsDeleteAssert(is_array($soleGmResult) && ($soleGmResult['success'] ?? null) !== true, 'Son aktif genel yönetici silinememeli');
settingsDeleteAssert($soleGmData === $soleGmSnapshot, 'Son aktif GM reddinde snapshot değişmemeli');

// --- BRANCH MANAGER PROJECTION ---
$bmData = settingsDeleteBaseData();
$bmData['users'][] = ['id' => 'bm', 'name' => 'Şube Yöneticisi', 'rol' => 'sube_yonetici', 'aktif' => true, 'branchIds' => ['b_empty']];
$bmData['users'][] = ['id' => 'u_bm_scope', 'name' => 'Şube Kullanıcısı', 'rol' => 'kullanici', 'aktif' => true, 'branchIds' => ['b_empty']];
$bmContext = [
    'role' => 'sube_yonetici',
    'user_id' => 'bm',
    'branch_ids' => ['b_empty'],
    'user' => ['id' => 'bm', 'rol' => 'sube_yonetici', 'aktif' => true, 'branchIds' => ['b_empty']],
];
// BM projeksiyonu yalnız kendi kapsamındaki kullanıcıyı taşır; diğerleri "silinmiş" sayılmaz.
$bmPayload = ['users' => [
    ['id' => 'u_bm_scope', 'name' => 'Şube Kullanıcısı (güncel)', 'rol' => 'kullanici', 'aktif' => true, 'branchIds' => ['b_empty']],
], '_medisaMutation' => ['collections' => ['users']]];
$bmResult = medisaSaveApplyIncomingData($bmPayload, $bmData, $bmContext);
settingsDeleteAssert($bmResult === true || ($bmResult['success'] ?? false) === true, 'BM projeksiyon eksikliği gerçek silme sayılmamalı');
$bmRemainingIds = array_map(function ($user) { return (string)$user['id']; }, $bmData['users']);
settingsDeleteAssert(in_array('u_monthly', $bmRemainingIds, true) && in_array('gm', $bmRemainingIds, true), 'BM kapsamı dışındaki kullanıcılar korunmalı');

if ($failures > 0) {
    fwrite(STDERR, "\nSETTINGS_DELETE_INVARIANTS: FAIL ({$failures} hata, {$passed} geçti)\n");
    exit(1);
}
fwrite(STDOUT, "SETTINGS_DELETE_INVARIANTS: PASS ({$passed} kontrol)\n");
