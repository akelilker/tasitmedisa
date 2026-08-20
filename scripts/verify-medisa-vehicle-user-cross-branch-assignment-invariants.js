'use strict';

/**
 * VEHICLE_USER_ASSIGNMENT_CROSS_BRANCH_CANONICAL_FLOW — focused invariants
 * Çalıştır: node scripts/verify-medisa-vehicle-user-cross-branch-assignment-invariants.js
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
  await run('source_exports_cross_branch_helpers', async function() {
    const dm = read('data-manager.js');
    assert.match(dm, /function isAssignableNormalUserCandidate/);
    assert.match(dm, /function getUserCanonicalBranchId/);
    assert.match(dm, /function needsVehicleBranchTransferForAssignment/);
    assert.match(dm, /function applyVehicleBranchTransferForUserAssignment/);
    assert.match(dm, /function buildVehicleUserAssignmentFormPlan/);
    assert.match(dm, /function applyVehicleUserAssignmentFormPlan/);
    assert.match(dm, /function askVehicleUserCrossBranchAssignmentConfirm/);
    assert.match(dm, /setTimeout\(function\(\) \{\s*resolve\(result\);/);
    assert.match(dm, /Önceki Evet\/Hayır pointer/);
    assert.match(dm, /MEDISA_VEHICLE_USER_CROSS_BRANCH_CONFIRM_MESSAGE/);
    assert.match(
      dm,
      /Atamak İstenilen Kullanıcı, Farklı Şubeye Kayıtlıdır\. Taşıtın Tahsisli Olduğu Şubeyi Güncellemeniz Gerekli\. Onaylıyor Musunuz\?/
    );
    const start = dm.indexOf('function isAssignableNormalUserCandidate');
    const end = dm.indexOf('function getUserCanonicalBranchId');
    assert.ok(start >= 0 && end > start);
    assert.doesNotMatch(dm.slice(start, end), /arrayHasId\(getUserBranchIds/);
  });

  await run('index_has_cross_branch_confirm_modal', async function() {
    const html = read('index.html');
    assert.match(html, /id="vehicle-user-cross-branch-confirm-modal"/);
    assert.match(html, /id="vehicle-user-cross-branch-confirm-yes"/);
    assert.match(html, /id="vehicle-user-cross-branch-confirm-no"/);
    assert.match(html, /compact-confirm-modal/);
  });

  await run('tasitlar_assignment_uses_confirm_and_no_search_branch_filter', async function() {
    const tasitlar = read('tasitlar.js');
    assert.match(tasitlar, /needsVehicleBranchTransferForAssignment/);
    assert.match(tasitlar, /askVehicleUserCrossBranchAssignmentConfirm/);
    assert.match(tasitlar, /applyVehicleBranchTransferForUserAssignment/);
    assert.match(tasitlar, /restoreKullaniciSelectToPrevious/);
    const start = tasitlar.indexOf('function getAssignableUsersForVehicle');
    const end = tasitlar.indexOf('function dismissVehicleAssignUserSavedListener');
    assert.ok(start >= 0 && end > start);
    const block = tasitlar.slice(start, end);
    assert.doesNotMatch(block, /vehicleBranchId/);
    assert.match(block, /candidateFn\(user\)/);
  });

  await run('ayarlar_user_management_uses_same_invariant', async function() {
    const ayarlar = read('ayarlar.js');
    assert.match(ayarlar, /buildVehicleUserAssignmentFormPlan/);
    assert.match(ayarlar, /applyVehicleUserAssignmentFormPlan/);
    assert.match(ayarlar, /askVehicleUserCrossBranchAssignmentConfirm/);
    assert.match(ayarlar, /assignmentPlan\.crossBranchAssigned/);
    assert.match(ayarlar, /persistUserManagementState\(users, vehiclesDesired/);
  });

  await run('form_level_atomic_source_sequencing', async function() {
    const ayarlar = read('ayarlar.js');
    const start = ayarlar.indexOf('window.saveUser = async function saveUser');
    const end = ayarlar.indexOf('window.editUser = function editUser');
    assert.ok(start >= 0 && end > start);
    const block = ayarlar.slice(start, end);
    const planIdx = block.indexOf('buildPlanFn(');
    const confirmLoopIdx = block.indexOf('for (let i = 0; i < assignmentPlan.crossBranchAssigned.length; i++)');
    const applyIdx = block.indexOf('applyPlanFn(vehiclesDesired, assignmentPlan');
    const persistIdx = block.indexOf('persistUserManagementState(users, vehiclesDesired');
    const successAlertIdx = block.indexOf("alert(id ? 'Kullanıcı güncellendi.'");
    assert.ok(planIdx >= 0 && confirmLoopIdx > planIdx, 'plan before confirmations');
    assert.ok(applyIdx > confirmLoopIdx, 'apply after all confirmations');
    assert.ok(persistIdx > applyIdx, 'single persist after apply');
    assert.ok(successAlertIdx > persistIdx, 'success UI after persist');
    assert.match(block, /if \(crossBranchOk !== true\) \{\s*\/\/ ENTIRE_FORM_SAVE = ABORTED/);
    assert.match(block, /if \(persisted !== true\) \{\s*setUserManagementLocalState\(previousUsers, previousVehicles\)/);
    assert.equal((block.match(/persistUserManagementState\(/g) || []).length, 1);
  });

  await run('A_user_mgmt_multi_vehicle_confirm_before_any_mutation', async function() {
    const ayarlar = read('ayarlar.js');
    const block = ayarlar.slice(
      ayarlar.indexOf('window.saveUser = async function saveUser'),
      ayarlar.indexOf('window.editUser = function editUser')
    );
    assert.match(block, /PHASE 2 — DESIRED PLAN/);
    assert.match(block, /PHASE 3 — CONFIRMATIONS/);
    assert.match(block, /PHASE 4 — COMMIT PLAN/);
    const askPos = block.indexOf('await askCrossBranch(crossBranchMessage)');
    const applyPos = block.indexOf('applyPlanFn(vehiclesDesired');
    assert.ok(askPos >= 0 && applyPos > askPos);
  });

  await run('B_user_mgmt_cancel_leaves_clones_unpersisted', async function() {
    const ayarlar = read('ayarlar.js');
    const block = ayarlar.slice(
      ayarlar.indexOf('window.saveUser = async function saveUser'),
      ayarlar.indexOf('window.editUser = function editUser')
    );
    assert.match(block, /previousVehicles = cloneStorageState\(readAllVehicles\(\)\)/);
    assert.match(block, /vehiclesDesired = cloneStorageState\(previousVehicles\)/);
    assert.match(block, /if \(crossBranchOk !== true\) \{\s*\/\/ ENTIRE_FORM_SAVE = ABORTED[\s\S]*?return;/);
    const askPos = block.indexOf('await askCrossBranch');
    const persistPos = block.indexOf('persistUserManagementState');
    const applyPos = block.indexOf('applyPlanFn');
    assert.ok(askPos >= 0 && applyPos > askPos && persistPos > applyPos);
  });

  await run('MANDATORY_1_cross_branch_rejection_aborts_entire_form', async function() {
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
      targetUserId: 'u-medisa',
      assignUser: user
    });
    assert.equal(plan.sameBranchAssigned.length, 1);
    assert.equal(plan.crossBranchAssigned.length, 2);
    assert.equal(plan.crossBranchAssigned[0].vehicleId, 'B');
    assert.equal(plan.crossBranchAssigned[1].vehicleId, 'C');

    // B=YES, C=NO → entire form aborted: apply/persist never run
    const answers = [true, false];
    let aborted = false;
    for (let i = 0; i < plan.crossBranchAssigned.length; i++) {
      if (answers[i] !== true) {
        aborted = true;
        break;
      }
    }
    assert.equal(aborted, true);
    assert.deepEqual(beforeSnap, before);
    assert.equal(beforeSnap[0].assignedUserId, '');
    assert.equal(beforeSnap[1].branchId, 'karyapi');
    assert.equal(beforeSnap[2].branchId, 'other');
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
      targetUserId: 'u-medisa',
      assignUser: user
    });
    const desired = JSON.parse(JSON.stringify(beforeSnap));
    assert.equal(w.applyVehicleUserAssignmentFormPlan(desired, plan, 'u-medisa', user), true);
    assert.equal(desired[0].assignedUserId, 'u-medisa');
    assert.equal(desired[0].branchId, 'medisa');
    assert.equal(desired[1].branchId, 'medisa');
    assert.equal(desired[1].assignedUserId, 'u-medisa');
    assert.equal(desired[2].branchId, 'medisa');
    assert.equal(desired[2].assignedUserId, 'u-medisa');
    // persist failure → restore exact BEFORE
    const restored = JSON.parse(JSON.stringify(beforeSnap));
    assert.deepEqual(restored, before);
    assert.equal(restored[1].branchId, 'karyapi');
    assert.equal(restored[1].assignedUserId, 'oldB');
    assert.equal(restored[2].branchId, 'other');
    assert.notEqual(beforeSnap[1].branchId, desired[1].branchId);
  });

  await run('MANDATORY_3_all_yes_success_plan', async function() {
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
      targetUserId: 'u-medisa',
      assignUser: user
    });
    const desired = JSON.parse(JSON.stringify(beforeSnap));
    assert.equal(w.applyVehicleUserAssignmentFormPlan(desired, plan, 'u-medisa', user), true);
    assert.equal(desired[0].assignedUserId, 'u-medisa');
    assert.equal(desired[0].branchId, 'medisa');
    assert.equal(desired[1].assignedUserId, 'u-medisa');
    assert.equal(desired[1].branchId, 'medisa');
    assert.equal(desired[2].assignedUserId, 'u-medisa');
    assert.equal(desired[2].branchId, 'medisa');
    assert.equal(beforeSnap[1].branchId, 'karyapi');
    assert.equal(beforeSnap[2].branchId, 'other');
  });

  await run('MANDATORY_4_snapshot_immutability', async function() {
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
      targetUserId: 'u1',
      assignUser: user
    });
    const desired = JSON.parse(JSON.stringify(beforeSnap));
    w.applyVehicleUserAssignmentFormPlan(desired, plan, 'u1', user);
    assert.equal(beforeSnap[0].assignedUserId, 'x');
    assert.equal(beforeSnap[1].branchId, 'karyapi');
    assert.equal(beforeSnap[1].assignedUserId, 'y');
    assert.notEqual(desired[1].branchId, beforeSnap[1].branchId);
    assert.ok(beforeSnap[0] !== desired[0]);
  });

  await run('C_persist_failure_rollback_owner_in_assignment', async function() {
    const tasitlar = read('tasitlar.js');
    const start = tasitlar.indexOf('function commitKullaniciAtama');
    const end = tasitlar.indexOf('if (needsTransfer)', start);
    assert.ok(start >= 0 && end > start);
    const block = tasitlar.slice(start, end);
    assert.match(block, /preCommitSnapshot/);
    assert.match(block, /restoreVehicleAfterFailedPersist/);
    assert.match(block, /vehicle\.branchId = preCommitSnapshot\.branchId/);
    assert.match(block, /vehicle\.assignedUserId = preCommitSnapshot\.assignedUserId/);
    assert.match(block, /\.catch\(function\(err\) \{\s*restoreVehicleAfterFailedPersist\(\);/);
  });

  await run('C_behavioral_pair_rollback_retains_original', async function() {
    const ctx = createCtx();
    const w = ctx.window;
    const vehicle = {
      id: 'v1',
      branchId: 'karyapi',
      assignedUserId: 'old',
      tahsisKisi: 'Eski',
      tasitKartiExpiryDate: '2026-01-01',
      events: [{ id: 'e0', type: 'km' }]
    };
    const user = { id: 'u-new', role: 'kullanici', branchId: 'medisa', branchIds: ['medisa'], aktif: true, name: 'Yeni' };
    const snap = {
      branchId: vehicle.branchId,
      assignedUserId: vehicle.assignedUserId,
      tahsisKisi: vehicle.tahsisKisi,
      tasitKartiExpiryDate: vehicle.tasitKartiExpiryDate,
      events: vehicle.events.slice()
    };
    assert.equal(w.applyVehicleBranchTransferForUserAssignment(vehicle, user), true);
    vehicle.assignedUserId = user.id;
    vehicle.tahsisKisi = user.name;
    vehicle.events.unshift({ type: 'sube-degisiklik' });
    vehicle.events.unshift({ type: 'kullanici-atama' });
    assert.equal(vehicle.branchId, 'medisa');
    assert.equal(vehicle.assignedUserId, 'u-new');
    vehicle.branchId = snap.branchId;
    vehicle.assignedUserId = snap.assignedUserId;
    vehicle.tahsisKisi = snap.tahsisKisi;
    vehicle.tasitKartiExpiryDate = snap.tasitKartiExpiryDate;
    vehicle.events = snap.events.slice();
    assert.equal(vehicle.branchId, 'karyapi');
    assert.equal(vehicle.assignedUserId, 'old');
    assert.equal(vehicle.tahsisKisi, 'Eski');
    assert.equal(vehicle.events.length, 1);
    assert.equal(vehicle.events[0].type, 'km');
  });

  await run('D_existing_assignment_untouched_until_yes_and_helpers', async function() {
    const ctx = createCtx();
    const w = ctx.window;
    const vehicle = { id: 'v1', branchId: 'karyapi', assignedUserId: 'current-user', events: [] };
    const user = { id: 'u-new', role: 'kullanici', branchId: 'medisa', branchIds: ['medisa'], aktif: true, name: 'Yeni' };
    assert.equal(w.needsVehicleBranchTransferForAssignment(vehicle, user), true);
    assert.equal(vehicle.assignedUserId, 'current-user');
    assert.equal(vehicle.branchId, 'karyapi');
    assert.equal(w.applyVehicleBranchTransferForUserAssignment(vehicle, user), true);
    assert.equal(vehicle.branchId, 'medisa');
    assert.equal(vehicle.assignedUserId, 'current-user');
    vehicle.assignedUserId = user.id;
    assert.equal(vehicle.assignedUserId, 'u-new');
    assert.equal(vehicle.branchId, 'medisa');
  });

  await run('E_events_snapshot_semantics_source', async function() {
    const tasitlar = read('tasitlar.js');
    const start = tasitlar.indexOf('function commitKullaniciAtama');
    const end = tasitlar.indexOf('return commitKullaniciAtama(false);', start);
    assert.ok(start >= 0 && end > start);
    const block = tasitlar.slice(start, end);
    assert.match(block, /const eskiSubeId = vehicle\.branchId \|\| '';/);
    const eskiPos = block.indexOf('const eskiSubeId = vehicle.branchId');
    const applyPos = block.indexOf('applyTransfer(vehicle, freshUser)');
    assert.ok(eskiPos >= 0 && applyPos > eskiPos, 'old branch snapshot before mutation');
    assert.match(block, /type: 'sube-degisiklik'/);
    assert.match(block, /type: 'kullanici-atama'/);
    assert.match(block, /eskiKullaniciAdi: eskiUser/);
    assert.match(block, /if \(ok !== true\) \{\s*restoreKullaniciSelectToPrevious\(eskiKullaniciId\);\s*return;/);
    const sameBranchElse = block.indexOf('} else {');
    const sameBranchBlock = block.slice(sameBranchElse, sameBranchElse + 350);
    assert.doesNotMatch(sameBranchBlock, /sube-degisiklik/);
  });

  await run('F_search_separation_assignment_vs_ceza', async function() {
    const tasitlar = read('tasitlar.js');
    const assignStart = tasitlar.indexOf('function getAssignableUsersForVehicle');
    const assignEnd = tasitlar.indexOf('function dismissVehicleAssignUserSavedListener');
    assert.ok(assignStart >= 0 && assignEnd > assignStart);
    const assignBlock = tasitlar.slice(assignStart, assignEnd);
    assert.doesNotMatch(assignBlock, /vehicleBranchId/);
    assert.match(assignBlock, /candidateFn\(user\)/);

    const eventStart = tasitlar.indexOf('function getSelectableUsersForVehicleEvent');
    const eventEnd = tasitlar.indexOf('function getAssignableUserDisplayNamesForVehicle');
    assert.ok(eventStart >= 0 && eventEnd > eventStart);
    const eventBlock = tasitlar.slice(eventStart, eventEnd);
    assert.match(eventBlock, /vehicleBranchId/);
    assert.match(eventBlock, /getUserBranchIds/);
    assert.match(eventBlock, /ids\.indexOf\(vehicleBranchId\) !== -1/);

    const namesFn = tasitlar.slice(
      tasitlar.indexOf('function getAssignableUserDisplayNamesForVehicle'),
      tasitlar.indexOf('function bindCezaUserDropdown')
    );
    assert.match(namesFn, /getSelectableUsersForVehicleEvent\(vehicle\)/);
    assert.doesNotMatch(namesFn, /getAssignableUsersForVehicle\(vehicle\)/);
  });

  await run('CASE1_same_branch_visible_no_confirm', async function() {
    const ctx = createCtx();
    const w = ctx.window;
    const vehicle = { id: 'v1', branchId: 'medisa', assignedUserId: '' };
    const user = { id: 'u1', role: 'kullanici', branchId: 'medisa', branchIds: ['medisa'], aktif: true };
    assert.equal(w.isAssignableNormalUserCandidate(user), true);
    assert.equal(w.needsVehicleBranchTransferForAssignment(vehicle, user), false);
  });

  await run('CASE2_cross_branch_visible_needs_confirm_no_mutation_yet', async function() {
    const ctx = createCtx();
    const w = ctx.window;
    const vehicle = { id: 'v1', branchId: 'karyapi', assignedUserId: 'old' };
    const user = { id: 'u1', role: 'kullanici', branchId: 'medisa', branchIds: ['medisa'], aktif: true };
    assert.equal(w.isAssignableNormalUserCandidate(user, 'karyapi'), true);
    assert.equal(w.needsVehicleBranchTransferForAssignment(vehicle, user), true);
    assert.equal(vehicle.branchId, 'karyapi');
    assert.equal(vehicle.assignedUserId, 'old');
  });

  await run('CASE3_cross_branch_yes_updates_vehicle_branch_not_user', async function() {
    const ctx = createCtx();
    const w = ctx.window;
    const vehicle = { id: 'v1', branchId: 'karyapi', assignedUserId: 'old' };
    const user = { id: 'u1', role: 'kullanici', branchId: 'medisa', branchIds: ['medisa'], aktif: true };
    assert.equal(w.applyVehicleBranchTransferForUserAssignment(vehicle, user), true);
    assert.equal(vehicle.branchId, 'medisa');
    assert.equal(user.branchId, 'medisa');
    assert.equal(vehicle.assignedUserId, 'old');
    vehicle.assignedUserId = user.id;
    assert.equal(vehicle.assignedUserId, 'u1');
    assert.equal(vehicle.branchId, 'medisa');
  });

  await run('CASE4_cross_branch_no_keeps_state', async function() {
    const ctx = createCtx();
    const w = ctx.window;
    const vehicle = { id: 'v1', branchId: 'karyapi', assignedUserId: 'old' };
    const user = { id: 'u1', role: 'kullanici', branchId: 'medisa', branchIds: ['medisa'], aktif: true };
    assert.equal(w.needsVehicleBranchTransferForAssignment(vehicle, user), true);
    assert.equal(vehicle.branchId, 'karyapi');
    assert.equal(vehicle.assignedUserId, 'old');
  });

  await run('CASE5_inactive_user_not_assignable', async function() {
    const ctx = createCtx();
    assert.equal(ctx.window.isAssignableNormalUserCandidate({
      id: 'u1', role: 'kullanici', branchIds: ['medisa'], aktif: false
    }), false);
  });

  await run('CASE6_non_normal_role_not_assignable', async function() {
    const ctx = createCtx();
    const w = ctx.window;
    assert.equal(w.isAssignableNormalUserCandidate({ id: 'bm', role: 'sube_yonetici', aktif: true }), false);
    assert.equal(w.isAssignableNormalUserCandidate({ id: 'gm', role: 'genel_yonetici', aktif: true }), false);
  });

  await run('CASE7_getMedisaUsers_still_scoped_helper_present', async function() {
    const dm = read('data-manager.js');
    assert.match(dm, /function getVisibleUsers/);
    assert.match(dm, /function getMedisaUsers/);
    assert.match(dm, /isUserWithinManagedBranches/);
  });

  await run('CASE8_legacy_sube_id_normalization', async function() {
    const ctx = createCtx();
    const w = ctx.window;
    const user = { id: 'u1', role: 'kullanici', sube_id: 'medisa', aktif: true };
    assert.equal(w.getUserCanonicalBranchId(user), 'medisa');
    assert.equal(w.needsVehicleBranchTransferForAssignment({ id: 'v1', branchId: 'karyapi' }, user), true);
    assert.equal(w.needsVehicleBranchTransferForAssignment({ id: 'v2', branchId: 'medisa' }, user), false);
  });

  await run('CASE9_existing_assignment_untouched_before_confirm', async function() {
    const ctx = createCtx();
    const w = ctx.window;
    const vehicle = { id: 'v1', branchId: 'karyapi', assignedUserId: 'current-user' };
    const user = { id: 'u-new', role: 'kullanici', branchId: 'medisa', branchIds: ['medisa'], aktif: true };
    assert.equal(w.needsVehicleBranchTransferForAssignment(vehicle, user), true);
    assert.equal(vehicle.assignedUserId, 'current-user');
    assert.equal(vehicle.branchId, 'karyapi');
  });

  await run('CASE10_confirm_message_exact_constant', async function() {
    const ctx = createCtx();
    assert.equal(
      ctx.window.MEDISA_VEHICLE_USER_CROSS_BRANCH_CONFIRM_MESSAGE,
      'Atamak İstenilen Kullanıcı, Farklı Şubeye Kayıtlıdır. Taşıtın Tahsisli Olduğu Şubeyi Güncellemeniz Gerekli. Onaylıyor Musunuz?'
    );
  });

  await run('multi_branch_membership_no_mismatch', async function() {
    const ctx = createCtx();
    const user = {
      id: 'u1',
      role: 'kullanici',
      branchId: 'medisa',
      branchIds: ['medisa', 'karyapi'],
      aktif: true
    };
    assert.equal(ctx.window.needsVehicleBranchTransferForAssignment({ id: 'v1', branchId: 'karyapi' }, user), false);
  });

  console.log('\nCross-branch assignment invariants: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})();
