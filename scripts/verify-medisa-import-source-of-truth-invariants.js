/**
 * P1-B — Import source-of-truth + same-page transaction lock invariants.
 * Çalıştır: node scripts/verify-medisa-import-source-of-truth-invariants.js
 * npm run tool:verify-import-source-of-truth
 */
'use strict';

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
    setItem(k, v) {
      if (typeof this._throwOnSet === 'function' && this._throwOnSet(k)) {
        throw new Error('storage set blocked: ' + k);
      }
      map.set(String(k), String(v));
    },
    removeItem(k) {
      if (typeof this._throwOnRemove === 'function' && this._throwOnRemove(k)) {
        throw new Error('storage remove blocked: ' + k);
      }
      map.delete(k);
    },
    clear() { map.clear(); },
    _map: map
  };
}

function extractImportSotBlock(ayarlarSrc) {
  const begin = ayarlarSrc.indexOf('/* medisa-import-sot:begin */');
  const end = ayarlarSrc.indexOf('/* medisa-import-sot:end */');
  assert.ok(begin !== -1 && end !== -1 && end > begin, 'medisa-import-sot marker bloğu bulunmalı');
  return ayarlarSrc.slice(begin, end + '/* medisa-import-sot:end */'.length);
}

function stubNormalizeUsers(arr) {
  return (Array.isArray(arr) ? arr : []).map(function(user) {
    if (!user || typeof user !== 'object') {
      return { id: '', isim: '', name: '', role: 'kullanici', rol: 'kullanici' };
    }
    var id = user.id != null ? String(user.id) : '';
    var name = user.name || user.isim || '';
    return {
      id: id,
      isim: name,
      name: name,
      kullanici_adi: user.kullanici_adi != null ? String(user.kullanici_adi) : '',
      telefon: user.telefon != null ? String(user.telefon) : (user.phone != null ? String(user.phone) : ''),
      phone: user.phone != null ? String(user.phone) : (user.telefon != null ? String(user.telefon) : ''),
      email: user.email != null ? String(user.email) : '',
      sube_id: user.sube_id || user.branchId || '',
      sube_ids: Array.isArray(user.sube_ids) ? user.sube_ids.map(String) : (Array.isArray(user.branchIds) ? user.branchIds.map(String) : []),
      branchId: user.branchId || user.sube_id || '',
      branchIds: Array.isArray(user.branchIds) ? user.branchIds.map(String) : (Array.isArray(user.sube_ids) ? user.sube_ids.map(String) : []),
      rol: user.rol || user.role || 'kullanici',
      role: user.role || user.rol || 'kullanici',
      tip: user.tip || 'kullanici',
      kullanici_paneli: !!user.kullanici_paneli,
      surucu_paneli: !!user.surucu_paneli,
      zimmetli_araclar: Array.isArray(user.zimmetli_araclar) ? user.zimmetli_araclar.slice() : [],
      aktif: user.aktif !== false,
      kayit_tarihi: user.kayit_tarihi != null ? String(user.kayit_tarihi) : (user.createdAt != null ? String(user.createdAt) : ''),
      createdAt: user.createdAt != null ? String(user.createdAt) : (user.kayit_tarihi != null ? String(user.kayit_tarihi) : ''),
      son_giris: user.son_giris != null ? user.son_giris : null,
      portal_sifresi_var: user.portal_sifresi_var === true
    };
  });
}

function createHarness(opts) {
  opts = opts || {};
  const localStorage = createStorage();
  const alerts = [];
  const reloads = [];
  const infoBoxes = [];
  const commits = [];
  const confirms = [];
  let saveCalls = 0;
  let pendingSaveResolve = null;
  let pendingSaveReject = null;

  const originalApp = opts.initialApp
    ? JSON.parse(JSON.stringify(opts.initialApp))
    : {
    tasitlar: [{ id: 1, plate: 'OLD' }],
    kayitlar: [],
    branches: [{ id: 'b1', name: 'Eski' }],
    users: [{ id: 'u1', isim: 'Eski' }],
    ayarlar: { sirketAdi: 'Medisa' },
    sifreler: [],
    arac_aylik_hareketler: [],
    duzeltme_talepleri: [],
    notificationReadState: {},
    monthlyTodoWhatsAppLogs: {}
    };

  localStorage.setItem('medisa_data_v1', JSON.stringify(originalApp));
  localStorage.setItem('medisa_server_backup', JSON.stringify({ source: 'pre-import', vehicles: originalApp.tasitlar }));

  const windowRef = {
    appData: JSON.parse(JSON.stringify(originalApp)),
    localStorage,
    location: {
      reload() { reloads.push(1); }
    },
    showCenteredInfoBox(msg, options) { infoBoxes.push({ type: 'show', msg: String(msg), options: options || null }); },
    closeCenteredInfoBox() { infoBoxes.push({ type: 'close' }); },
    commitMedisaAppDataSnapshot(next, options) {
      if (opts.commitThrow) throw new Error('commit-throw');
      commits.push({ reason: options && options.reason, tasitlar: (next && next.tasitlar) || [] });
      windowRef.appData = next;
      return next;
    },
    normalizeUsers: stubNormalizeUsers,
    __medisaLogError() {}
  };

  if (opts.reloadMissing) {
    windowRef.location = {};
  } else if (opts.reloadThrow) {
    windowRef.location = {
      reload() { throw new Error('reload-throw'); }
    };
  }

  if (typeof opts.saveDataToServer === 'function') {
    windowRef.saveDataToServer = async function() {
      saveCalls += 1;
      return opts.saveDataToServer(windowRef.appData);
    };
  } else if (opts.saveMode === 'missing') {
    // leave saveDataToServer undefined
  } else if (opts.saveMode === 'false') {
    windowRef.saveDataToServer = async function() { saveCalls += 1; return false; };
  } else if (opts.saveMode === 'reject') {
    windowRef.saveDataToServer = async function() { saveCalls += 1; throw new Error('conflict-or-network'); };
  } else if (opts.saveMode === 'pending') {
    windowRef.saveDataToServer = function() {
      saveCalls += 1;
      return new Promise(function(resolve, reject) {
        pendingSaveResolve = resolve;
        pendingSaveReject = reject;
      });
    };
  } else {
    windowRef.saveDataToServer = async function() { saveCalls += 1; return true; };
  }

  if (opts.metaThrowAfterTrue) {
    localStorage._throwOnSet = function(k) {
      return k === 'medisa_data_v1' || k === 'medisa_server_backup';
    };
  }
  if (opts.rollbackThrow) {
    localStorage._throwOnSet = function(k) {
      return k === 'medisa_data_v1' || k === 'medisa_server_backup';
    };
    localStorage._throwOnRemove = localStorage._throwOnSet;
  }

  const ctx = {
    window: windowRef,
    localStorage,
    console,
    Object,
    Array,
    JSON,
    Error,
    Date,
    String,
    setTimeout: function(fn) { fn(); return 0; },
    alert: function(msg) { alerts.push(String(msg)); },
    getDefaultAyarlarBackup: function() {
      return { sirketAdi: 'Medisa', k2Belgesi: { expiryDate: '', documentPath: '', updatedAt: '' } };
    },
    normalizeBackupUsers: function(users) {
      return stubNormalizeUsers(users);
    },
    writeBranches: function() {},
    writeUsers: function() {}
  };
  ctx.global = ctx;
  ctx.globalThis = ctx;

  const block = extractImportSotBlock(read('ayarlar.js'));
  vm.createContext(ctx);
  vm.runInContext(
    block + '\nthis.__helpers = {' +
      'isImportTransactionInFlight: isImportTransactionInFlight,' +
      'tryBeginImportTransaction: tryBeginImportTransaction,' +
      'notifyImportInFlightBlocked: notifyImportInFlightBlocked,' +
      'scheduleImportTerminalReload: scheduleImportTerminalReload,' +
      'normalizeBackupPayload: normalizeBackupPayload,' +
      'captureImportRollbackSnapshot: captureImportRollbackSnapshot,' +
      'restoreImportRollbackSnapshot: restoreImportRollbackSnapshot,' +
      'applyRestoredBackup: applyRestoredBackup,' +
      'finishImportedBackupSync: finishImportedBackupSync,' +
      'writeImportSuccessMetadataBestEffort: writeImportSuccessMetadataBestEffort,' +
      'runConfirmedImportTransaction: runConfirmedImportTransaction,' +
      'processImportedBackupText: processImportedBackupText,' +
      'getImportInFlight: function(){ return importInFlight; }' +
    '};',
    ctx
  );

  if (opts.snapshotThrow) {
    vm.runInContext(
      'captureImportRollbackSnapshot = function(){ throw new Error("snapshot-throw"); };',
      ctx
    );
    ctx.__helpers.captureImportRollbackSnapshot = function() {
      throw new Error('snapshot-throw');
    };
  }
  if (opts.applyThrow) {
    vm.runInContext(
      'applyRestoredBackup = function(){ throw new Error("apply-throw"); };',
      ctx
    );
    ctx.__helpers.applyRestoredBackup = function() {
      throw new Error('apply-throw');
    };
  }

  return {
    helpers: ctx.__helpers,
    window: windowRef,
    localStorage,
    alerts,
    reloads,
    infoBoxes,
    commits,
    confirms,
    getSaveCalls() { return saveCalls; },
    resolvePendingSave(value) {
      if (typeof pendingSaveResolve === 'function') pendingSaveResolve(value);
    },
    rejectPendingSave(err) {
      if (typeof pendingSaveReject === 'function') pendingSaveReject(err || new Error('pending-reject'));
    },
    originalApp
  };
}

function sampleBackup() {
  return {
    vehicles: [{ id: 99, plate: 'NEW' }],
    branches: [{ id: 'b2', name: 'Yeni' }],
    users: [{ id: 'u2', isim: 'Yeni' }],
    kayitlar: [],
    ayarlar: { sirketAdi: 'Imported' },
    upload_date: '2026-08-01T00:00:00.000Z'
  };
}

function syntheticExportFixture() {
  return {
    branches: [{ id: 'branch-test-1', name: 'TEST_BRANCH' }],
    users: [{
      id: 'user-test-1',
      isim: 'TEST_USER',
      name: 'TEST_USER',
      kullanici_adi: 'test_user_1',
      telefon: '0000000000',
      phone: '0000000000',
      email: 'test@example.invalid',
      sube_id: 'branch-test-1',
      sube_ids: ['branch-test-1'],
      branchId: 'branch-test-1',
      branchIds: ['branch-test-1'],
      rol: 'kullanici',
      role: 'kullanici',
      tip: 'kullanici',
      kullanici_paneli: false,
      surucu_paneli: false,
      zimmetli_araclar: [],
      aktif: true,
      kayit_tarihi: '2026-01-15T10:00:00.000Z',
      createdAt: '2026-01-15T10:00:00.000Z',
      son_giris: null,
      portal_sifresi_var: false,
      experimental_user_field: 'DROP_ME'
    }],
    vehicles: [{
      id: 'vehicle-test-1',
      plate: 'TEST01',
      brandModel: 'TEST_MODEL',
      documentPath: 'test/reference.pdf',
      events: [
        { id: 'event-test-1', type: 'bakim', date: '2026-02-01T00:00:00.000Z', note: 'TEST_VALUE' },
        { id: 'event-test-2', type: 'km', date: '2026-02-02T00:00:00.000Z', note: 'TEST_VALUE' }
      ],
      version: 3
    }],
    kayitlar: [{ id: 'kayit-test-1', note: 'TEST_VALUE' }],
    ayarlar: {
      sirketAdi: 'TEST_CO',
      k2Belgesi: { expiryDate: '2026-12-31', documentPath: 'test/k2.pdf', updatedAt: '2026-01-01T00:00:00.000Z' }
    },
    sifreler: [],
    arac_aylik_hareketler: [],
    duzeltme_talepleri: [],
    notificationReadState: { 'notif-test-1': true },
    monthlyTodoWhatsAppLogs: { '2026-01': { sent: 1 } },
    backup_date: '2026-08-01T12:00:00.000Z',
    version: '2.0',
    unknown_top_level: { keep: false }
  };
}

async function runImportScenario(opts) {
  const h = createHarness(opts);
  if (opts.rollbackThrow) {
    h.localStorage._throwOnSet = function(k) {
      return k === 'medisa_data_v1' || k === 'medisa_server_backup';
    };
  }
  const result = await h.helpers.runConfirmedImportTransaction(sampleBackup());
  return { h, result };
}

async function main() {
  await run('source: package tool:verify-import-source-of-truth tanımlı', function() {
    const pkg = JSON.parse(read('package.json'));
    assert.equal(
      pkg.scripts['tool:verify-import-source-of-truth'],
      'node scripts/verify-medisa-import-source-of-truth-invariants.js'
    );
  });

  await run('source: quality gate import SoT verifier tek kez çalıştırır', function() {
    const qg = read('.github/scripts/quality-gate.sh');
    const matches = qg.match(/tool:verify-import-source-of-truth/g) || [];
    assert.equal(matches.length, 1, 'quality-gate import SoT tek kez olmalı');
    assert.match(qg, /Import source-of-truth invariants/);
  });

  await run('source: runtime dosyalarda medisa_just_restored yok', function() {
    const files = [
      'ayarlar.js',
      'data-manager.js',
      'script-core.js',
      'data-service.js',
      'index.html',
      'tasitlar.js',
      'notifications.js',
      'kayit.js'
    ];
    files.forEach(function(rel) {
      const src = read(rel);
      assert.equal(src.includes('medisa_just_restored'), false, rel + ' just_restored taşımamalı');
    });
  });

  await run('source: applyRestoredBackup pre-save storage yazmaz', function() {
    const src = read('ayarlar.js');
    const begin = src.indexOf('/* medisa-import-sot:begin */');
    const end = src.indexOf('/* medisa-import-sot:end */');
    const block = src.slice(begin, end);
    const applyStart = block.indexOf('function applyRestoredBackup');
    const applyEnd = block.indexOf('async function finishImportedBackupSync');
    const applyBody = block.slice(applyStart, applyEnd);
    assert.doesNotMatch(applyBody, /localStorage\.setItem/);
    assert.doesNotMatch(applyBody, /sessionStorage/);
    assert.match(applyBody, /return restoredBlob/);
  });

  await run('source: finishImportedBackupSync exact true kontratı', function() {
    const src = read('ayarlar.js');
    assert.match(src, /ok = await window\.saveDataToServer\(\)/);
    assert.match(src, /if \(ok !== true\)/);
    assert.match(src, /Mevcut verileriniz korundu/);
    assert.doesNotMatch(src, /Yedek cihazınıza yüklendi ancak sunucuya/);
    assert.match(src, /scheduleImportTerminalReload/);
    assert.match(src, /importInFlight/);
    assert.match(src, /tryBeginImportTransaction/);
    assert.match(src, /runConfirmedImportTransaction/);
  });

  await run('source: lock acquire snapshot/apply öncesi', function() {
    const src = read('ayarlar.js');
    const begin = src.indexOf('async function runConfirmedImportTransaction');
    const end = src.indexOf('function processImportedBackupText');
    const body = src.slice(begin, end);
    const lockIdx = body.indexOf('tryBeginImportTransaction');
    const snapIdx = body.indexOf('captureImportRollbackSnapshot');
    const applyIdx = body.indexOf('applyRestoredBackup');
    assert.ok(lockIdx !== -1 && snapIdx !== -1 && applyIdx !== -1);
    assert.ok(lockIdx < snapIdx && snapIdx < applyIdx);
  });

  await run('source: data-manager normal server bootstrap + saveMutex korunur', function() {
    const src = read('data-manager.js');
    assert.match(src, /await loadDataFromServer\(true\)/);
    assert.doesNotMatch(src, /medisa_just_restored/);
    assert.match(src, /saveMutex/);
  });

  await run('behavior: save true → success + metadata + reload + lock açık kalır', async function() {
    const { h, result } = await runImportScenario({ saveMode: 'true' });
    assert.equal(result.ok, true);
    assert.equal(result.started, true);
    assert.ok(h.alerts.some(function(a) { return a.indexOf('Sunucuya Kaydedildi') !== -1; }));
    assert.equal(h.alerts.some(function(a) { return a.indexOf('korundu') !== -1; }), false);
    assert.equal(h.reloads.length, 1);
    assert.ok(h.localStorage.getItem('medisa_data_v1').includes('NEW'));
    assert.equal(h.window.appData.tasitlar[0].id, 99);
    assert.equal(h.helpers.isImportTransactionInFlight(), true);
    assert.equal(h.getSaveCalls(), 1);
  });

  await run('behavior: save false → rollback + fail msg + reload + lock açık', async function() {
    const { h, result } = await runImportScenario({ saveMode: 'false' });
    assert.equal(result.ok, false);
    assert.ok(h.alerts.some(function(a) { return a.indexOf('Mevcut verileriniz korundu') !== -1; }));
    assert.equal(h.alerts.some(function(a) { return a.indexOf('Sunucuya Kaydedildi') !== -1; }), false);
    assert.equal(h.reloads.length, 1);
    assert.equal(h.window.appData.tasitlar[0].id, 1);
    assert.ok(h.localStorage.getItem('medisa_data_v1').includes('OLD'));
    assert.ok(h.commits.some(function(c) { return c.reason === 'import-rollback'; }));
    assert.equal(h.helpers.isImportTransactionInFlight(), true);
    assert.equal(h.getSaveCalls(), 1);
  });

  await run('behavior: reject → rollback + fail msg + reload + lock açık', async function() {
    const { h, result } = await runImportScenario({ saveMode: 'reject' });
    assert.equal(result.ok, false);
    assert.ok(h.alerts.some(function(a) { return a.indexOf('Mevcut verileriniz korundu') !== -1; }));
    assert.equal(h.alerts.some(function(a) { return a.indexOf('Sunucuya Kaydedildi') !== -1; }), false);
    assert.equal(h.reloads.length, 1);
    assert.equal(h.window.appData.tasitlar[0].id, 1);
    assert.equal(h.helpers.isImportTransactionInFlight(), true);
  });

  await run('behavior: save missing → rollback + fail msg + reload + lock açık', async function() {
    const { h, result } = await runImportScenario({ saveMode: 'missing' });
    assert.equal(result.ok, false);
    assert.ok(h.alerts.some(function(a) { return a.indexOf('Mevcut verileriniz korundu') !== -1; }));
    assert.equal(h.alerts.some(function(a) { return a.indexOf('Sunucuya Kaydedildi') !== -1; }), false);
    assert.equal(h.reloads.length, 1);
    assert.equal(h.window.appData.tasitlar[0].id, 1);
    assert.equal(h.helpers.isImportTransactionInFlight(), true);
    assert.equal(h.getSaveCalls(), 0);
  });

  await run('behavior: metadata storage exception after true → success korunur', async function() {
    const { h, result } = await runImportScenario({ saveMode: 'true', metaThrowAfterTrue: true });
    assert.equal(result.ok, true);
    assert.ok(h.alerts.some(function(a) { return a.indexOf('Sunucuya Kaydedildi') !== -1; }));
    assert.equal(h.alerts.some(function(a) { return a.indexOf('korundu') !== -1; }), false);
    assert.equal(h.reloads.length, 1);
    assert.equal(h.window.appData.tasitlar[0].id, 99);
  });

  await run('behavior: rollback storage exception → runtime rollback + fail + reload', async function() {
    const { h, result } = await runImportScenario({ saveMode: 'false', rollbackThrow: true });
    assert.equal(result.ok, false);
    assert.ok(h.alerts.some(function(a) { return a.indexOf('Mevcut verileriniz korundu') !== -1; }));
    assert.equal(h.alerts.some(function(a) { return a.indexOf('Sunucuya Kaydedildi') !== -1; }), false);
    assert.equal(h.reloads.length, 1);
    assert.equal(h.window.appData.tasitlar[0].id, 1);
  });

  await run('lock: ilk import save pending iken lock aktif; ikinci confirmed import reddedilir', async function() {
    const h = createHarness({ saveMode: 'pending' });
    const firstPromise = h.helpers.runConfirmedImportTransaction(sampleBackup());
    await Promise.resolve();
    assert.equal(h.helpers.isImportTransactionInFlight(), true);
    assert.equal(h.getSaveCalls(), 1);

    const commitsBefore = h.commits.length;
    const metaBefore = h.localStorage.getItem('medisa_data_v1');
    const reloadsBefore = h.reloads.length;
    const second = await h.helpers.runConfirmedImportTransaction({
      vehicles: [{ id: 777, plate: 'SECOND' }],
      branches: [{ id: 'bx', name: 'X' }],
      users: [{ id: 'ux', isim: 'X' }]
    });

    assert.equal(second.blocked, true);
    assert.equal(second.started, false);
    assert.equal(h.getSaveCalls(), 1);
    assert.equal(h.commits.length, commitsBefore);
    assert.equal(h.localStorage.getItem('medisa_data_v1'), metaBefore);
    assert.equal(h.reloads.length, reloadsBefore);
    assert.ok(
      h.alerts.some(function(a) { return a.indexOf('Başka bir geri yükleme işlemi devam ediyor') !== -1; }) ||
      h.infoBoxes.some(function(b) { return String(b.msg || '').indexOf('Başka bir geri yükleme işlemi devam ediyor') !== -1; })
    );

    h.resolvePendingSave(true);
    const first = await firstPromise;
    assert.equal(first.ok, true);
    assert.equal(h.getSaveCalls(), 1);
    assert.equal(h.reloads.length, 1);
    assert.equal(h.window.appData.tasitlar[0].id, 99);
    assert.equal(h.helpers.isImportTransactionInFlight(), true);
  });

  await run('lock: pending false → tek save, tek rollback, tek reload; ikinci bloke', async function() {
    const h = createHarness({ saveMode: 'pending' });
    const firstPromise = h.helpers.runConfirmedImportTransaction(sampleBackup());
    await Promise.resolve();
    const second = await h.helpers.runConfirmedImportTransaction(sampleBackup());
    assert.equal(second.blocked, true);
    h.resolvePendingSave(false);
    const first = await firstPromise;
    assert.equal(first.ok, false);
    assert.equal(h.getSaveCalls(), 1);
    assert.equal(h.reloads.length, 1);
    assert.equal(h.window.appData.tasitlar[0].id, 1);
    assert.ok(h.commits.some(function(c) { return c.reason === 'import-rollback'; }));
  });

  await run('lock: pending reject → tek save, tek rollback, tek reload', async function() {
    const h = createHarness({ saveMode: 'pending' });
    const firstPromise = h.helpers.runConfirmedImportTransaction(sampleBackup());
    await Promise.resolve();
    h.rejectPendingSave(new Error('boom'));
    const first = await firstPromise;
    assert.equal(first.ok, false);
    assert.equal(h.getSaveCalls(), 1);
    assert.equal(h.reloads.length, 1);
    assert.equal(h.window.appData.tasitlar[0].id, 1);
  });

  await run('early: JSON parse error → snapshot/apply/save/metadata/reload 0; lock false', async function() {
    const h = createHarness({ saveMode: 'true' });
    const out = await h.helpers.processImportedBackupText('{not-json', { confirm: function() { return true; } });
    assert.equal(out.outcome, 'parse_error');
    assert.equal(h.helpers.isImportTransactionInFlight(), false);
    assert.equal(h.getSaveCalls(), 0);
    assert.equal(h.reloads.length, 0);
    assert.equal(h.commits.length, 0);
    assert.ok(h.localStorage.getItem('medisa_data_v1').includes('OLD'));
    assert.ok(h.alerts.some(function(a) { return a.indexOf('Yedek Dosyası Okunamadı') !== -1; }));
  });

  await run('early: validation error → snapshot/apply/save/metadata/reload 0; lock false', async function() {
    const h = createHarness({ saveMode: 'true' });
    const out = await h.helpers.processImportedBackupText(JSON.stringify({ foo: 1 }), { confirm: function() { return true; } });
    assert.equal(out.outcome, 'validation_error');
    assert.equal(h.helpers.isImportTransactionInFlight(), false);
    assert.equal(h.getSaveCalls(), 0);
    assert.equal(h.reloads.length, 0);
    assert.equal(h.commits.length, 0);
    assert.ok(h.alerts.some(function(a) { return a.indexOf('Geçersiz Yedek Dosyası') !== -1; }));
  });

  await run('early: confirm cancel → snapshot/apply/save/metadata/reload 0; lock false', async function() {
    const h = createHarness({ saveMode: 'true' });
    const payload = JSON.stringify(sampleBackup());
    const out = await h.helpers.processImportedBackupText(payload, { confirm: function() { return false; } });
    assert.equal(out.outcome, 'cancelled');
    assert.equal(h.helpers.isImportTransactionInFlight(), false);
    assert.equal(h.getSaveCalls(), 0);
    assert.equal(h.reloads.length, 0);
    assert.equal(h.commits.length, 0);
  });

  await run('source: file input her importData çağrısında yeniden oluşturulur', function() {
    const src = read('ayarlar.js');
    const start = src.indexOf('window.importData = function importData');
    const end = src.indexOf('async function uploadToServer');
    const body = src.slice(start, end);
    assert.match(body, /document\.createElement\('input'\)/);
    assert.match(body, /input\.accept = '\.json,\.zip,application\/json,application\/zip'/);
    assert.match(body, /processImportedBackupText/);
  });

  await run('terminal: location.reload mevcut → tam bir çağrı; duplicate yok', async function() {
    const { h } = await runImportScenario({ saveMode: 'true' });
    assert.equal(h.reloads.length, 1);
  });

  await run('terminal: location.reload missing → ikinci save yok; lock bloke; manual refresh', async function() {
    const h = createHarness({ saveMode: 'true', reloadMissing: true });
    const first = await h.helpers.runConfirmedImportTransaction(sampleBackup());
    assert.equal(first.ok, true);
    assert.equal(h.getSaveCalls(), 1);
    assert.equal(h.reloads.length, 0);
    assert.ok(h.alerts.some(function(a) { return a.indexOf('manuel yenileyin') !== -1; }));
    assert.equal(h.helpers.isImportTransactionInFlight(), true);
    const second = await h.helpers.runConfirmedImportTransaction(sampleBackup());
    assert.equal(second.blocked, true);
    assert.equal(h.getSaveCalls(), 1);
  });

  await run('terminal: location.reload throw → ikinci save yok; lock bloke; manual refresh', async function() {
    const h = createHarness({ saveMode: 'true', reloadThrow: true });
    const first = await h.helpers.runConfirmedImportTransaction(sampleBackup());
    assert.equal(first.ok, true);
    assert.equal(h.getSaveCalls(), 1);
    assert.ok(h.alerts.some(function(a) { return a.indexOf('manuel yenileyin') !== -1; }));
    assert.equal(h.helpers.isImportTransactionInFlight(), true);
    const second = await h.helpers.runConfirmedImportTransaction(sampleBackup());
    assert.equal(second.blocked, true);
    assert.equal(h.getSaveCalls(), 1);
  });

  await run('apply/snapshot: snapshot throw → apply 0, save 0, success yok, lock açık', async function() {
    const h = createHarness({ saveMode: 'true', snapshotThrow: true });
    const result = await h.helpers.runConfirmedImportTransaction(sampleBackup());
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'snapshot');
    assert.equal(h.getSaveCalls(), 0);
    assert.equal(h.commits.length, 0);
    assert.equal(h.reloads.length, 0);
    assert.equal(h.alerts.some(function(a) { return a.indexOf('Sunucuya Kaydedildi') !== -1; }), false);
    assert.equal(h.helpers.isImportTransactionInFlight(), true);
  });

  await run('apply/snapshot: apply throw → save 0, rollback, success yok, lock açık', async function() {
    const h = createHarness({ saveMode: 'true', applyThrow: true });
    const result = await h.helpers.runConfirmedImportTransaction(sampleBackup());
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'apply');
    assert.equal(h.getSaveCalls(), 0);
    assert.equal(h.alerts.some(function(a) { return a.indexOf('Sunucuya Kaydedildi') !== -1; }), false);
    assert.ok(h.commits.some(function(c) { return c.reason === 'import-rollback'; }));
    assert.equal(h.window.appData.tasitlar[0].id, 1);
    assert.equal(h.helpers.isImportTransactionInFlight(), true);
    assert.equal(h.reloads.length, 1);
  });

  await run('round-trip: sentetik export→import canonical identity / metadata drift', async function() {
    const h = createHarness({ saveMode: 'true' });
    const exported = syntheticExportFixture();
    const normalized = h.helpers.normalizeBackupPayload(exported, 'file');
    assert.ok(normalized, 'normalize geçerli olmalı');
    assert.equal(normalized.vehicles[0].id, 'vehicle-test-1');
    assert.equal(String(normalized.users[0].id), 'user-test-1');
    assert.equal(normalized.branches[0].id, 'branch-test-1');
    assert.equal(normalized.vehicles[0].documentPath, 'test/reference.pdf');
    assert.equal(normalized.vehicles[0].events.length, 2);
    assert.equal(normalized.kayitlar.length, 1);
    assert.equal(normalized.vehicles[0].events[0].date, '2026-02-01T00:00:00.000Z');
    assert.equal(normalized.users[0].kayit_tarihi || normalized.users[0].createdAt, '2026-01-15T10:00:00.000Z');

    // Export version / unknown top-level düşer (metadata drift — canonical field loss değil)
    assert.equal(Object.prototype.hasOwnProperty.call(normalized, 'version'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(normalized, 'unknown_top_level'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(normalized.users[0], 'experimental_user_field'), false);

    const restored = h.helpers.applyRestoredBackup(normalized);
    assert.equal(restored.tasitlar[0].id, 'vehicle-test-1');
    assert.equal(restored.users[0].id, 'user-test-1');
    assert.equal(restored.branches[0].id, 'branch-test-1');
    assert.equal(restored.tasitlar[0].documentPath, 'test/reference.pdf');
    assert.equal(restored.tasitlar[0].events.length, 2);
    assert.equal(restored.kayitlar.length, 1);
    assert.equal(restored.notificationReadState['notif-test-1'], true);
    assert.equal(restored.ayarlar.k2Belgesi.documentPath, 'test/k2.pdf');

    const canonicalOk =
      restored.tasitlar.length === exported.vehicles.length &&
      restored.users.length === exported.users.length &&
      restored.branches.length === exported.branches.length &&
      restored.kayitlar.length === exported.kayitlar.length &&
      restored.tasitlar[0].id === 'vehicle-test-1' &&
      restored.users[0].id === 'user-test-1' &&
      restored.branches[0].id === 'branch-test-1' &&
      restored.tasitlar[0].events.length === 2 &&
      restored.tasitlar[0].documentPath === 'test/reference.pdf';

    assert.equal(canonicalOk, true, 'canonical collections/IDs/docs/events korunmalı');
    // Classification signal for report
    h._roundTripResult = 'CONDITIONAL_METADATA_DRIFT';
    assert.equal(h._roundTripResult, 'CONDITIONAL_METADATA_DRIFT');
  });

  console.log('\nImport SoT invariants: ' + passed + ' passed, ' + failed + ' failed');
  if (failed) process.exitCode = 1;
}

module.exports = {
  createHarness,
  sampleBackup,
  syntheticExportFixture
};

if (require.main === module) {
  main();
}
