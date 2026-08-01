/**
 * P1-B — Import source-of-truth invariants.
 * Çalıştır: node scripts/verify-medisa-import-source-of-truth-invariants.js
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

function createHarness(opts) {
  opts = opts || {};
  const localStorage = createStorage();
  const alerts = [];
  const reloads = [];
  const infoBoxes = [];
  const commits = [];

  const originalApp = {
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
    showCenteredInfoBox(msg) { infoBoxes.push({ type: 'show', msg: String(msg) }); },
    closeCenteredInfoBox() { infoBoxes.push({ type: 'close' }); },
    commitMedisaAppDataSnapshot(next, options) {
      commits.push({ reason: options && options.reason, tasitlar: (next && next.tasitlar) || [] });
      windowRef.appData = next;
      return next;
    },
    __medisaLogError() {}
  };

  if (opts.saveMode === 'missing') {
    // leave saveDataToServer undefined
  } else if (opts.saveMode === 'false') {
    windowRef.saveDataToServer = async function() { return false; };
  } else if (opts.saveMode === 'reject') {
    windowRef.saveDataToServer = async function() { throw new Error('conflict-or-network'); };
  } else {
    windowRef.saveDataToServer = async function() { return true; };
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
    setTimeout: function(fn) { fn(); return 0; },
    alert: function(msg) { alerts.push(String(msg)); },
    getDefaultAyarlarBackup: function() {
      return { sirketAdi: 'Medisa', k2Belgesi: { expiryDate: '', documentPath: '', updatedAt: '' } };
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
      'captureImportRollbackSnapshot: captureImportRollbackSnapshot,' +
      'restoreImportRollbackSnapshot: restoreImportRollbackSnapshot,' +
      'applyRestoredBackup: applyRestoredBackup,' +
      'finishImportedBackupSync: finishImportedBackupSync,' +
      'writeImportSuccessMetadataBestEffort: writeImportSuccessMetadataBestEffort' +
    '};',
    ctx
  );

  return {
    helpers: ctx.__helpers,
    window: windowRef,
    localStorage,
    alerts,
    reloads,
    infoBoxes,
    commits,
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

async function runImportScenario(opts) {
  const h = createHarness(opts);
  const pre = h.helpers.captureImportRollbackSnapshot();
  const backup = sampleBackup();
  const restored = h.helpers.applyRestoredBackup(backup);
  assert.equal(h.window.appData.tasitlar[0].id, 99, 'apply runtime restore etmeli');
  assert.equal(h.localStorage.getItem('medisa_data_v1').includes('OLD'), true, 'apply pre-save local yazmamalı');
  assert.equal(h.localStorage.getItem('medisa_server_backup').includes('pre-import'), true, 'apply pre-save backup yazmamalı');

  if (opts.rollbackThrow) {
    // Force restore path to hit storage exceptions while still rolling runtime back.
    h.localStorage._throwOnSet = function(k) {
      return k === 'medisa_data_v1' || k === 'medisa_server_backup';
    };
  }

  const result = await h.helpers.finishImportedBackupSync(pre, backup, restored);
  return { h, result, pre, restored };
}

(async function main() {
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
  });

  await run('source: data-manager normal server bootstrap', function() {
    const src = read('data-manager.js');
    assert.match(src, /await loadDataFromServer\(true\)/);
    assert.doesNotMatch(src, /medisa_just_restored/);
  });

  await run('behavior: save true → success + metadata + reload', async function() {
    const { h, result } = await runImportScenario({ saveMode: 'true' });
    assert.equal(result, true);
    assert.ok(h.alerts.some(function(a) { return a.indexOf('Sunucuya Kaydedildi') !== -1; }));
    assert.equal(h.alerts.some(function(a) { return a.indexOf('korundu') !== -1; }), false);
    assert.equal(h.reloads.length, 1);
    assert.ok(h.localStorage.getItem('medisa_data_v1').includes('NEW'));
    assert.ok(h.localStorage.getItem('medisa_server_backup').includes('NEW') ||
      h.localStorage.getItem('medisa_server_backup').includes('"id":99') ||
      h.localStorage.getItem('medisa_server_backup').includes('99'));
    assert.equal(h.window.appData.tasitlar[0].id, 99);
  });

  await run('behavior: save false → rollback + fail msg + reload', async function() {
    const { h, result } = await runImportScenario({ saveMode: 'false' });
    assert.equal(result, false);
    assert.ok(h.alerts.some(function(a) { return a.indexOf('Mevcut verileriniz korundu') !== -1; }));
    assert.equal(h.alerts.some(function(a) { return a.indexOf('Sunucuya Kaydedildi') !== -1; }), false);
    assert.equal(h.reloads.length, 1);
    assert.equal(h.window.appData.tasitlar[0].id, 1);
    assert.ok(h.localStorage.getItem('medisa_data_v1').includes('OLD'));
    assert.ok(h.commits.some(function(c) { return c.reason === 'import-rollback'; }));
  });

  await run('behavior: reject → rollback + fail msg + reload', async function() {
    const { h, result } = await runImportScenario({ saveMode: 'reject' });
    assert.equal(result, false);
    assert.ok(h.alerts.some(function(a) { return a.indexOf('Mevcut verileriniz korundu') !== -1; }));
    assert.equal(h.alerts.some(function(a) { return a.indexOf('Sunucuya Kaydedildi') !== -1; }), false);
    assert.equal(h.reloads.length, 1);
    assert.equal(h.window.appData.tasitlar[0].id, 1);
  });

  await run('behavior: save missing → rollback + fail msg + reload', async function() {
    const { h, result } = await runImportScenario({ saveMode: 'missing' });
    assert.equal(result, false);
    assert.ok(h.alerts.some(function(a) { return a.indexOf('Mevcut verileriniz korundu') !== -1; }));
    assert.equal(h.alerts.some(function(a) { return a.indexOf('Sunucuya Kaydedildi') !== -1; }), false);
    assert.equal(h.reloads.length, 1);
    assert.equal(h.window.appData.tasitlar[0].id, 1);
  });

  await run('behavior: metadata storage exception after true → success korunur', async function() {
    const { h, result } = await runImportScenario({ saveMode: 'true', metaThrowAfterTrue: true });
    assert.equal(result, true);
    assert.ok(h.alerts.some(function(a) { return a.indexOf('Sunucuya Kaydedildi') !== -1; }));
    assert.equal(h.alerts.some(function(a) { return a.indexOf('korundu') !== -1; }), false);
    assert.equal(h.reloads.length, 1);
    assert.equal(h.window.appData.tasitlar[0].id, 99);
  });

  await run('behavior: rollback storage exception → runtime rollback + fail + reload', async function() {
    const { h, result } = await runImportScenario({ saveMode: 'false', rollbackThrow: true });
    assert.equal(result, false);
    assert.ok(h.alerts.some(function(a) { return a.indexOf('Mevcut verileriniz korundu') !== -1; }));
    assert.equal(h.alerts.some(function(a) { return a.indexOf('Sunucuya Kaydedildi') !== -1; }), false);
    assert.equal(h.reloads.length, 1);
    assert.equal(h.window.appData.tasitlar[0].id, 1);
  });

  console.log('\nImport SoT invariants: ' + passed + ' passed, ' + failed + ' failed');
  if (failed) process.exitCode = 1;
})();
