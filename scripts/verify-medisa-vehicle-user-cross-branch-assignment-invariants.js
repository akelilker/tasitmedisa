'use strict';

/**
 * VEHICLE_BRANCH_ASSIGNED_USER_SYNC_REMINDER — focused invariants
 * Çalıştır: node scripts/verify-medisa-vehicle-user-cross-branch-assignment-invariants.js
 *
 * Kanonik iş kuralı:
 * - Çapraz grup taşıt kullanımı geçerli operasyondur (taşıt şubesi ≠ kullanıcı şubesi yasak değildir).
 * - Kullanıcı atama/değişikliği taşıtın branchId'sini kullanıcının şubesine taşımaz.
 * - Taşıtın şubesi değiştirilirken atanmış kullanıcının şubeleriyle eşleşmiyorsa yalnız hatırlatma gösterilir.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
let passed = 0;
let failed = 0;

function ok(name) {
  passed += 1;
  console.log('PASS ' + name);
}
function fail(name, err) {
  failed += 1;
  console.error('FAIL ' + name + ': ' + (err && err.message ? err.message : err));
}
async function run(name, fn) {
  try {
    await fn();
    ok(name);
  } catch (err) {
    fail(name, err);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function createStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(String(k), String(v)); },
    removeItem(k) { map.delete(k); },
    clear() { map.clear(); },
  };
}

function createFakeJwt() {
  const payload = Buffer.from(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + 3600,
    rol: 'genel_yonetici',
    user_id: 'u1',
    ilk_giris_parola_degistirme_zorunlu: false,
  })).toString('base64');
  return 'hdr.' + payload + '.sig';
}

function createCtx() {
  const localStorage = createStorage();
  const windowRef = {
    appData: null,
    medisaSession: { authenticated: true, user: { id: 'u1', role: 'genel_yonetici' }, role: 'genel_yonetici', branch_ids: [] },
    medisaPortalSession: {
      getStoredToken: function() { return createFakeJwt(); },
      clearStoredTokens: function() {},
    },
    localStorage,
    location: { pathname: '/', href: 'http://localhost/', origin: 'http://localhost' },
    navigator: { onLine: true },
    addEventListener() {},
    dispatchEvent() { return true; },
    CustomEvent: function CustomEvent(type, init) {
      this.type = type;
      this.detail = init && init.detail;
    },
    __medisaRedirecting: false,
    MedisaVehicleNotificationDomain: null,
  };
  const ctx = {
    window: windowRef,
    document: {
      location: windowRef.location,
      addEventListener() {},
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      body: { classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} } },
    },
    localStorage,
    sessionStorage: createStorage(),
    navigator: windowRef.navigator,
    console,
    setTimeout,
    clearTimeout,
    setImmediate,
    queueMicrotask,
    requestAnimationFrame: function(fn) { fn(); },
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Math,
    Date,
    Error,
    Promise,
    Map,
    Set,
    parseInt,
    isNaN,
    encodeURIComponent,
    decodeURIComponent,
    atob: typeof atob === 'function' ? atob : function(s) { return Buffer.from(s, 'base64').toString('binary'); },
    btoa: typeof btoa === 'function' ? btoa : function(s) { return Buffer.from(s, 'binary').toString('base64'); },
    CustomEvent: windowRef.CustomEvent,
  };
  ctx.globalThis = ctx;
  ctx.window.window = windowRef;
  ctx.fetch = async function() {
    return { ok: true, status: 200, json: async () => ({ success: true, vehicleVersions: [] }) };
  };
  windowRef.fetch = ctx.fetch;
  vm.createContext(ctx);
  vm.runInContext(read('data-manager.js'), ctx, { filename: 'data-manager.js' });
  return ctx;
}

(async function main() {
  await run('source_exports_branch_reminder_helpers', async function() {
    const dm = read('data-manager.js');
    assert.match(dm, /function getUserBranchIds/);
    assert.match(dm, /function getUserCanonicalBranchId/);
    assert.match(dm, /function isVehicleBranchOutsideUserBranches/);
    assert.match(dm, /function buildVehicleBranchMismatchReminderMessage/);
    assert.match(dm, /function buildVehicleUserAssignmentFormPlan/);
    assert.match(dm, /function applyVehicleUserAssignmentFormPlan/);
    assert.match(dm, /function askVehicleBranchMismatchReminder/);
    assert.match(dm, /window\.isVehicleBranchOutsideUserBranches = isVehicleBranchOutsideUserBranches;/);
    assert.match(dm, /window\.askVehicleBranchMismatchReminder = askVehicleBranchMismatchReminder;/);
    assert.match(dm, /setTimeout\(function\(\) \{\s*resolve\(result\);/);
    assert.match(dm, /Önceki Evet\/Hayır pointer/);
    // Eski "taşıt şubesini kullanıcıya taşı" iş kuralı tamamen kaldırıldı
    assert.doesNotMatch(dm, /needsVehicleBranchTransferForAssignment/);
    assert.doesNotMatch(dm, /applyVehicleBranchTransferForUserAssignment/);
    assert.doesNotMatch(dm, /MEDISA_VEHICLE_USER_CROSS_BRANCH_CONFIRM_MESSAGE/);
    assert.doesNotMatch(dm, /Atamak İstenilen Kullanıcı, Farklı Şubeye Kayıtlıdır/);
    assert.doesNotMatch(dm, /sameBranchAssigned|crossBranchAssigned|needsBranchTransfer|targetBranchId: needsTransfer/);
  });

  await run('index_has_branch_mismatch_reminder_modal', async function() {
    const html = read('index.html');
    assert.match(html, /id="vehicle-user-cross-branch-confirm-modal"/);
    assert.match(html, /id="vehicle-user-cross-branch-confirm-yes"/);
    assert.match(html, /id="vehicle-user-cross-branch-confirm-no"/);
    assert.match(html, /compact-confirm-modal/);
    assert.match(html, /id="vehicle-user-cross-branch-confirm-title">ŞUBE UYUMSUZLUĞU</);
    assert.doesNotMatch(html, /confirm-title">KULLANICI ATAMA</);
  });

  await run('tasitlar_sube_change_is_reminder_owner', async function() {
    const tasitlar = read('tasitlar.js');
    assert.equal((tasitlar.split('function resolveSubeDegisiklikUserReminder').length - 1), 1, 'yardımcı tek kez tanımlanmalı');
    const start = tasitlar.indexOf('function resolveSubeDegisiklikUserReminder');
    const end = tasitlar.indexOf('window.updateKullaniciAtama = function()');
    assert.ok(start >= 0 && end > start, 'sube reminder owner bulunamadı');
    const block = tasitlar.slice(start, end);
    assert.match(block, /isVehicleBranchOutsideUserBranches/);
    assert.match(block, /askVehicleBranchMismatchReminder/);
    assert.match(block, /buildVehicleBranchMismatchReminderMessage/);
    assert.match(block, /getUserBranchIds/);
    assert.match(block, /readBranches\(\)/);
    assert.match(block, /readUsers\(\)/);
    // Atanmış kullanıcı yoksa hatırlatma yok
    assert.match(block, /if \(!assignedUserId\) return Promise\.resolve\(noReminder\);/);
    assert.match(block, /if \(!assignedUser\) return Promise\.resolve\(noReminder\);/);
    // PERSISTENCE SIRASI: persist → normal UI → EVET ise kullanıcı formu
    const writePos = block.indexOf('writeVehicles(vehicles)');
    const completePos = block.indexOf('completeDynamicEventSave(');
    const openPos = block.indexOf('window.openUserFormModal(reminder.assignedUserId)');
    assert.ok(writePos >= 0 && completePos > writePos, 'persist before UI completion');
    assert.ok(openPos > completePos, 'user form only after persist/UI completion');
    assert.match(block, /if \(reminder\.remind && reminder\.assignedUserId/);
  });

  await run('tasitlar_assignment_never_transfers_vehicle_branch', async function() {
    const tasitlar = read('tasitlar.js');
    assert.doesNotMatch(tasitlar, /needsVehicleBranchTransferForAssignment/);
    assert.doesNotMatch(tasitlar, /applyVehicleBranchTransferForUserAssignment/);
    assert.doesNotMatch(tasitlar, /askVehicleUserCrossBranchAssignmentConfirm/);
    assert.doesNotMatch(tasitlar, /MEDISA_VEHICLE_USER_CROSS_BRANCH_CONFIRM_MESSAGE/);
    assert.match(tasitlar, /restoreKullaniciSelectToPrevious/);

    const start = tasitlar.indexOf('window.updateKullaniciAtama = function()');
    const end = tasitlar.indexOf('function askSatisSozlesmesiConfirm');
    assert.ok(start >= 0 && end > start);
    const block = tasitlar.slice(start, end);
    assert.match(block, /commitKullaniciAtama\(\)/);
    assert.match(block, /return commitKullaniciAtama\(\);/);
    assert.match(block, /if \(!vehicle\.branchId && canonicalBranchId\) vehicle\.branchId = canonicalBranchId;/);
    // Atama akışı artık şube değişikliği event'i üretmez
    assert.doesNotMatch(block, /sube-degisiklik/);
    assert.doesNotMatch(block, /transferConfirmed/);

    const assignStart = tasitlar.indexOf('function getAssignableUsersForVehicle');
    const assignEnd = tasitlar.indexOf('function dismissVehicleAssignUserSavedListener');
    assert.ok(assignStart >= 0 && assignEnd > assignStart);
    const assignBlock = tasitlar.slice(assignStart, assignEnd);
    assert.doesNotMatch(assignBlock, /vehicleBranchId/);
    assert.match(assignBlock, /isAssignableVehicleUserCandidate/);
    assert.match(assignBlock, /candidateFn\(user\)/);
  });

  await run('ayarlar_user_management_never_transfers_vehicle_branch', async function() {
    const ayarlar = read('ayarlar.js');
    assert.match(ayarlar, /buildVehicleUserAssignmentFormPlan/);
    assert.match(ayarlar, /applyVehicleUserAssignmentFormPlan/);
    assert.match(ayarlar, /persistUserManagementState\(users, vehiclesDesired/);
    assert.doesNotMatch(ayarlar, /crossBranchAssigned/);
    assert.doesNotMatch(ayarlar, /askVehicleUserCrossBranchAssignmentConfirm/);
    assert.doesNotMatch(ayarlar, /MEDISA_VEHICLE_USER_CROSS_BRANCH_CONFIRM_MESSAGE/);
    assert.doesNotMatch(ayarlar, /assignUser: pendingAssignUser/);
  });

  await run('form_level_atomic_source_sequencing', async function() {
    const ayarlar = read('ayarlar.js');
    const start = ayarlar.indexOf('window.saveUser = async function saveUser');
    const end = ayarlar.indexOf('window.editUser = function editUser');
    assert.ok(start >= 0 && end > start);
    const block = ayarlar.slice(start, end);
    const planIdx = block.indexOf('buildPlanFn(');
    const reassignConfirmIdx = block.indexOf('if (!window.confirm(confirmMessage))');
    const applyIdx = block.indexOf('applyPlanFn(vehiclesDesired, assignmentPlan');
    const persistIdx = block.indexOf('persistUserManagementState(users, vehiclesDesired');
    const successAlertIdx = block.indexOf("alert(id ? 'Kullanıcı güncellendi.'");
    assert.ok(planIdx >= 0, 'plan üretimi bulunamadı');
    assert.ok(reassignConfirmIdx > planIdx, 'başka kullanıcıya tahsisli confirmation plandan sonra');
    assert.ok(applyIdx > reassignConfirmIdx, 'apply tüm onaylardan sonra');
    assert.ok(persistIdx > applyIdx, 'tek persist apply sonrası');
    assert.ok(successAlertIdx > persistIdx, 'başarı UI persist sonrası');
    assert.match(block, /if \(persisted !== true\) \{\s*setUserManagementLocalState\(previousUsers, previousVehicles\)/);
    assert.equal((block.match(/persistUserManagementState\(/g) || []).length, 1);
    assert.match(block, /PHASE 2 — DESIRED PLAN/);
    assert.match(block, /PHASE 3 — CONFIRMATIONS/);
    assert.match(block, /PHASE 4 — COMMIT PLAN/);
  });

  await run('A_user_mgmt_confirm_before_any_mutation', async function() {
    const ayarlar = read('ayarlar.js');
    const block = ayarlar.slice(
      ayarlar.indexOf('window.saveUser = async function saveUser'),
      ayarlar.indexOf('window.editUser = function editUser')
    );
    const confirmPos = block.indexOf('window.confirm(confirmMessage)');
    const applyPos = block.indexOf('applyPlanFn(vehiclesDesired');
    assert.ok(confirmPos >= 0 && applyPos > confirmPos);
  });

  await run('B_user_mgmt_before_snapshot_clones_are_isolated', async function() {
    const ayarlar = read('ayarlar.js');
    const block = ayarlar.slice(
      ayarlar.indexOf('window.saveUser = async function saveUser'),
      ayarlar.indexOf('window.editUser = function editUser')
    );
    assert.match(block, /previousVehicles = cloneStorageState\(readAllVehicles\(\)\)/);
    assert.match(block, /vehiclesDesired = cloneStorageState\(previousVehicles\)/);
    const applyPos = block.indexOf('applyPlanFn');
    const persistPos = block.indexOf('persistUserManagementState');
    assert.ok(applyPos >= 0 && persistPos > applyPos);
  });

  await run('MANDATORY_1_cross_branch_assignment_preserves_vehicle_branch', async function() {
    const ctx = createCtx();
    const w = ctx.window;
    const before = [
      { id: 'A', branchId: 'medisa', assignedUserId: '', tahsisKisi: '', events: [{ id: 'eA' }] },
      { id: 'B', branchId: 'karyapi', assignedUserId: 'oldB', tahsisKisi: 'EskiB', events: [{ id: 'eB' }] },
      { id: 'C', branchId: 'other', assignedUserId: 'oldC', tahsisKisi: 'EskiC', events: [{ id: 'eC' }] }
    ];
    const beforeSnap = JSON.parse(JSON.stringify(before));
    const user = { id: 'u-medisa', role: 'kullanici', branchId: 'medisa', branchIds: ['medisa'], aktif: true, name: 'MEDISA' };
    const plan = w.buildVehicleUserAssignmentFormPlan({
      vehiclesBefore: beforeSnap,
      selectedVehicleIds: ['A', 'B', 'C'],
      targetUserId: 'u-medisa'
    });
    assert.equal(plan.newlyAssigned.length, 3);
    assert.equal(plan.unassigned.length, 0);
    assert.equal(plan.reassignedFromOther.length, 2);
    assert.equal(plan.reassignedFromOther[0].vehicleId, 'B');
    assert.equal(plan.reassignedFromOther[1].vehicleId, 'C');

    const desired = JSON.parse(JSON.stringify(beforeSnap));
    assert.equal(w.applyVehicleUserAssignmentFormPlan(desired, plan, 'u-medisa', user), true);
    assert.equal(desired[0].assignedUserId, 'u-medisa');
    assert.equal(desired[0].branchId, 'medisa');
    assert.equal(desired[1].assignedUserId, 'u-medisa');
    assert.equal(desired[1].branchId, 'karyapi', 'çapraz şube ataması taşıt şubesini taşımaz');
    assert.equal(desired[2].assignedUserId, 'u-medisa');
    assert.equal(desired[2].branchId, 'other', 'çapraz şube ataması taşıt şubesini taşımaz');
    assert.deepEqual(beforeSnap, before, 'BEFORE snapshot değişmez');
  });

  await run('MANDATORY_2_persist_failure_rolls_back_entire_form', async function() {
    const ctx = createCtx();
    const w = ctx.window;
    const before = [
      { id: 'A', branchId: 'medisa', assignedUserId: '', tahsisKisi: '' },
      { id: 'B', branchId: 'karyapi', assignedUserId: 'oldB', tahsisKisi: 'EskiB' },
      { id: 'C', branchId: 'other', assignedUserId: 'oldC', tahsisKisi: 'EskiC' }
    ];
    const beforeSnap = JSON.parse(JSON.stringify(before));
    const user = { id: 'u-medisa', role: 'kullanici', branchId: 'medisa', branchIds: ['medisa'], aktif: true, name: 'MEDISA' };
    const plan = w.buildVehicleUserAssignmentFormPlan({
      vehiclesBefore: beforeSnap,
      selectedVehicleIds: ['A', 'B', 'C'],
      targetUserId: 'u-medisa'
    });
    const desired = JSON.parse(JSON.stringify(beforeSnap));
    assert.equal(w.applyVehicleUserAssignmentFormPlan(desired, plan, 'u-medisa', user), true);
    assert.equal(desired[1].assignedUserId, 'u-medisa');
    assert.equal(desired[1].branchId, 'karyapi');
    // persist failure → BEFORE snapshot'tan geri yükleme (mevcut rollback owner'ı)
    const restored = JSON.parse(JSON.stringify(beforeSnap));
    assert.deepEqual(restored, before);
    assert.equal(restored[1].assignedUserId, 'oldB');
    assert.equal(restored[1].branchId, 'karyapi');
    assert.equal(restored[2].assignedUserId, 'oldC');
    assert.equal(restored[2].branchId, 'other');
  });

  await run('MANDATORY_3_snapshot_immutability', async function() {
    const ctx = createCtx();
    const w = ctx.window;
    const before = [
      { id: 'A', branchId: 'medisa', assignedUserId: 'x' },
      { id: 'B', branchId: 'karyapi', assignedUserId: 'y' }
    ];
    const beforeSnap = JSON.parse(JSON.stringify(before));
    const user = { id: 'u1', role: 'kullanici', branchId: 'medisa', branchIds: ['medisa'], aktif: true, name: 'U' };
    const plan = w.buildVehicleUserAssignmentFormPlan({
      vehiclesBefore: beforeSnap,
      selectedVehicleIds: ['A', 'B'],
      targetUserId: 'u1'
    });
    const desired = JSON.parse(JSON.stringify(beforeSnap));
    assert.equal(w.applyVehicleUserAssignmentFormPlan(desired, plan, 'u1', user), true);
    assert.equal(beforeSnap[0].assignedUserId, 'x');
    assert.equal(beforeSnap[1].branchId, 'karyapi');
    assert.equal(beforeSnap[1].assignedUserId, 'y');
    assert.equal(desired[1].branchId, beforeSnap[1].branchId, 'taşıt şubesi korunur');
    assert.equal(desired[1].assignedUserId, 'u1');
    assert.ok(beforeSnap[0] !== desired[0]);
  });

  await run('MANDATORY_4_branchless_vehicle_gets_assignee_branch', async function() {
    const ctx = createCtx();
    const w = ctx.window;
    const before = [{ id: 'A', branchId: '', assignedUserId: '' }];
    const user = { id: 'u1', role: 'kullanici', branchId: 'karyapi', branchIds: ['karyapi'], aktif: true, name: 'U' };
    const plan = w.buildVehicleUserAssignmentFormPlan({
      vehiclesBefore: before,
      selectedVehicleIds: ['A'],
      targetUserId: 'u1'
    });
    const desired = JSON.parse(JSON.stringify(before));
    assert.equal(w.applyVehicleUserAssignmentFormPlan(desired, plan, 'u1', user), true);
    assert.equal(desired[0].assignedUserId, 'u1');
    assert.equal(desired[0].branchId, 'karyapi', 'şubesiz taşıt için mevcut varsayılan davranış korunur');
  });

  await run('C_persist_failure_rollback_owner_in_assignment', async function() {
    const tasitlar = read('tasitlar.js');
    const start = tasitlar.indexOf('function commitKullaniciAtama');
    const end = tasitlar.indexOf('return commitKullaniciAtama();', start);
    assert.ok(start >= 0 && end > start);
    const block = tasitlar.slice(start, end);
    assert.match(block, /preCommitSnapshot/);
    assert.match(block, /restoreVehicleAfterFailedPersist/);
    assert.match(block, /vehicle\.branchId = preCommitSnapshot\.branchId/);
    assert.match(block, /vehicle\.assignedUserId = preCommitSnapshot\.assignedUserId/);
    assert.match(block, /\.catch\(function\(err\) \{\s*restoreVehicleAfterFailedPersist\(\);/);
    assert.match(block, /type: 'kullanici-atama'/);
    assert.match(block, /eskiKullaniciAdi: eskiUser/);
    assert.doesNotMatch(block, /sube-degisiklik/);
  });

  await run('D_branch_mismatch_detection_uses_all_branch_memberships', async function() {
    const ctx = createCtx();
    const w = ctx.window;
    const multi = { id: 'u1', role: 'kullanici', branchId: 'medisa', branchIds: ['medisa', 'ankara'], aktif: true };
    assert.equal(w.isVehicleBranchOutsideUserBranches('medisa', multi), false);
    assert.equal(w.isVehicleBranchOutsideUserBranches('ankara', multi), false, 'çoklu üyelikte eşleşme uyarı üretmez');
    assert.equal(w.isVehicleBranchOutsideUserBranches('karyapi', multi), true);
    assert.equal(w.isVehicleBranchOutsideUserBranches('', multi), false, 'şubesiz taşıt uyarı üretmez');
    assert.equal(w.isVehicleBranchOutsideUserBranches('karyapi', null), false);
    assert.equal(w.isVehicleBranchOutsideUserBranches('karyapi', { id: 'x', branchIds: [] }), false);
    // legacy/canonical şube alanları
    assert.equal(w.isVehicleBranchOutsideUserBranches('karyapi', { id: 'y', sube_id: 'medisa' }), true);
    assert.equal(w.isVehicleBranchOutsideUserBranches('medisa', { id: 'y', sube_ids: ['medisa'] }), false);
  });

  await run('E_reminder_message_uses_real_branch_names', async function() {
    const ctx = createCtx();
    const msg = ctx.window.buildVehicleBranchMismatchReminderMessage({
      vehicleBranchName: 'Medisa',
      userBranchNames: ['Karyapı']
    });
    assert.match(msg, /Bu taşıt Medisa şubesine geçiriliyor/);
    assert.match(msg, /atanmış kullanıcı halen Karyapı şubesine kayıtlı/);
    assert.match(msg, /Kullanıcının şube bilgisini kontrol etmek ister misiniz\?/);
    const msg2 = ctx.window.buildVehicleBranchMismatchReminderMessage({
      vehicleBranchName: 'Ankara',
      userBranchNames: ['İzmir', 'Bursa']
    });
    assert.match(msg2, /Ankara/);
    assert.match(msg2, /İzmir, Bursa/);
    assert.doesNotMatch(msg2, /Medisa|Karyapı/);
  });

  await run('F_search_separation_assignment_vs_ceza', async function() {
    const tasitlar = read('tasitlar.js');
    const assignStart = tasitlar.indexOf('function getAssignableUsersForVehicle');
    const assignEnd = tasitlar.indexOf('function dismissVehicleAssignUserSavedListener');
    assert.ok(assignStart >= 0 && assignEnd > assignStart);
    const assignBlock = tasitlar.slice(assignStart, assignEnd);
    assert.doesNotMatch(assignBlock, /vehicleBranchId/);
    assert.match(assignBlock, /isAssignableVehicleUserCandidate/);

    const eventStart = tasitlar.indexOf('function getSelectableUsersForVehicleEvent');
    const eventEnd = tasitlar.indexOf('function getAssignableUserDisplayNamesForVehicle');
    assert.ok(eventStart >= 0 && eventEnd > eventStart);
    const eventBlock = tasitlar.slice(eventStart, eventEnd);
    assert.match(eventBlock, /vehicleBranchId/);
    assert.match(eventBlock, /isAssignableNormalUserCandidate/);
    assert.match(eventBlock, /getUserBranchIds/);
    assert.match(eventBlock, /ids\.indexOf\(vehicleBranchId\) !== -1/);
  });

  await run('CASE1_active_manager_is_vehicle_assignable_but_not_event_driver', async function() {
    const ctx = createCtx();
    const w = ctx.window;
    assert.equal(w.isAssignableVehicleUserCandidate({ id: 'bm', role: 'sube_yonetici', aktif: true }), true);
    assert.equal(w.isAssignableVehicleUserCandidate({ id: 'gm', role: 'genel_yonetici', aktif: true }), true);
    assert.equal(w.isAssignableNormalUserCandidate({ id: 'bm', role: 'sube_yonetici', aktif: true }), false);
    assert.equal(w.isAssignableNormalUserCandidate({ id: 'gm', role: 'genel_yonetici', aktif: true }), false);
  });

  await run('CASE2_inactive_user_not_assignable', async function() {
    const ctx = createCtx();
    assert.equal(ctx.window.isAssignableVehicleUserCandidate({
      id: 'u1', role: 'kullanici', branchIds: ['medisa'], aktif: false
    }), false);
  });

  await run('CASE3_legacy_sube_id_normalization', async function() {
    const ctx = createCtx();
    const w = ctx.window;
    const user = { id: 'u1', role: 'kullanici', sube_id: 'medisa', aktif: true };
    assert.equal(w.getUserCanonicalBranchId(user), 'medisa');
    assert.equal(w.getUserBranchIds(user).join(','), 'medisa');
    assert.equal(w.isVehicleBranchOutsideUserBranches('medisa', user), false);
    assert.equal(w.isVehicleBranchOutsideUserBranches('karyapi', user), true);
  });

  await run('CASE4_user_scope_helper_present', async function() {
    const dm = read('data-manager.js');
    assert.match(dm, /function getVisibleUsers/);
    assert.match(dm, /function getMedisaUsers/);
    assert.match(dm, /isUserWithinManagedBranches/);
  });

  console.log('\nBranch/user sync reminder invariants: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})();
