/**
 * P1-C — Kullanıcı Raporları WhatsApp audit invariants.
 * Çalıştır: node scripts/verify-medisa-monthly-todo-whatsapp-audit-invariants.js
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
let passed = 0;
let failed = 0;

function ok(name) { passed += 1; console.log('PASS ' + name); }
function fail(name, err) {
  failed += 1;
  console.error('FAIL ' + name + ': ' + (err && err.message ? err.message : err));
}
async function run(name, fn) {
  try { await fn(); ok(name); } catch (err) { fail(name, err); }
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

function extractNamedFunction(src, name) {
  const startToken = 'function ' + name + '(';
  const start = src.indexOf(startToken);
  assert.ok(start !== -1, name + ' bulunmalı');
  let i = src.indexOf('{', start);
  assert.ok(i !== -1, name + ' gövde başlangıcı yok');
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  assert.fail(name + ' kapanış bulunamadı');
}

function loadAuditHelpers() {
  const src = read('admin/admin-report.js');
  const ctx = {
    console,
    Object,
    Array,
    JSON,
    Date,
    Math,
    Number,
    String,
    isNaN,
    formatUserWhatsAppAuditDate: function(v) { return String(v || ''); },
    userWhatsAppAuditState: { search: '', branchId: 'all', typeCode: 'all', timeFilter: 'all' }
  };
  const code = [
    extractNamedFunction(src, 'getMonthlyTodoWaTypeLabel'),
    extractNamedFunction(src, 'parseMonthlyTodoWaTimeMs'),
    extractNamedFunction(src, 'normalizeMonthlyTodoWhatsAppAuditEntries'),
    extractNamedFunction(src, 'filterMonthlyTodoWhatsAppAuditEntries'),
    extractNamedFunction(src, 'summarizeMonthlyTodoWhatsAppAuditEntries')
  ].join('\n');
  vm.createContext(ctx);
  vm.runInContext(
    code + '\nthis.api = {' +
      'normalize: normalizeMonthlyTodoWhatsAppAuditEntries,' +
      'filter: filterMonthlyTodoWhatsAppAuditEntries,' +
      'summarize: summarizeMonthlyTodoWhatsAppAuditEntries,' +
      'typeLabel: getMonthlyTodoWaTypeLabel' +
    '};',
    ctx
  );
  return ctx.api;
}

function createRecordHarness(opts) {
  opts = opts || {};
  const alerts = [];
  const events = [];
  const logs = Object.create(null);
  if (opts.seed) Object.assign(logs, opts.seed);
  let saveCalls = 0;
  const windowRef = {
    appData: { monthlyTodoWhatsAppLogs: logs },
    __medisaLogError: function() {},
    getElementById: function() { return null; }
  };
  if (opts.saveMode === 'missing') {
    // no save
  } else if (opts.saveMode === 'false') {
    windowRef.saveDataToServer = function() { saveCalls += 1; return Promise.resolve(false); };
  } else if (opts.saveMode === 'reject') {
    windowRef.saveDataToServer = function() { saveCalls += 1; return Promise.reject(new Error('boom')); };
  } else if (opts.saveMode === 'slow') {
    let resolveSave;
    const p = new Promise(function(resolve) { resolveSave = resolve; });
    windowRef.saveDataToServer = function() { saveCalls += 1; return p; };
    windowRef.__resolveSave = function(v) { resolveSave(v); };
  } else {
    windowRef.saveDataToServer = function() { saveCalls += 1; return Promise.resolve(true); };
  }

  const src = read('notifications.js');
  // Extract record function + helpers by evaluating a minimal sandbox with required deps.
  const sandbox = {
    window: windowRef,
    document: {
      getElementById: function() { return null; }
    },
    console,
    Object,
    Array,
    JSON,
    Date,
    Number,
    String,
    Math,
    Promise,
    setTimeout,
    clearTimeout,
    alert: function(m) { alerts.push(String(m)); },
    monthlyTodoWaSaveInflight: Object.create(null),
    ensureMonthlyTodoWhatsAppLogs: function() { return logs; },
    getNotificationRecorderDisplayName: function() { return opts.openedBy || 'Test User'; },
    deepCloneMonthlyTodoWaLogEntry: function(entry) {
      if (!entry || typeof entry !== 'object') return null;
      return JSON.parse(JSON.stringify(entry));
    },
    applyMonthlyTodoWhatsAppOpenedUiState: function(anchorEl) {
      if (!anchorEl) return;
      anchorEl.classList.add('monthly-todo-whatsapp-btn', 'is-reminder-opened');
    }
  };

  // Pull the exact recordMonthlyTodoWhatsAppOpened function body from source.
  const fnSrc = extractNamedFunction(src, 'recordMonthlyTodoWhatsAppOpened');
  assert.ok(fnSrc, 'recordMonthlyTodoWhatsAppOpened bulunmalı');
  vm.createContext(sandbox);
  vm.runInContext(fnSrc + '\nthis.record = recordMonthlyTodoWhatsAppOpened;', sandbox);

  function makeAnchor(attrs) {
    const map = Object.assign({
      'data-mtw-vid': 'v1',
      'data-mtw-plate': '34ABC123',
      'data-mtw-type': 's',
      'data-mtw-field': 'sigortaDate',
      'data-mtw-date': '2026-08-10'
    }, attrs || {});
    return {
      classList: { add: function() { this._classes = (this._classes || []).concat([].slice.call(arguments)); }.bind({}), _classes: [] },
      _classes: [],
      getAttribute: function(k) { return map[k] || ''; },
      setAttribute: function() {},
      get classList() {
        const self = this;
        return {
          add: function() { self._classes = (self._classes || []).concat([].slice.call(arguments)); self._openedUi = arguments[1] === 'is-reminder-opened' || self._classes.indexOf('is-reminder-opened') !== -1; }
        };
      }
    };
  }

  // Fix classList on anchors properly
  function makeAnchor2(attrs) {
    const map = Object.assign({
      'data-mtw-vid': 'v1',
      'data-mtw-plate': '34ABC123',
      'data-mtw-type': 's',
      'data-mtw-field': 'sigortaDate',
      'data-mtw-date': '2026-08-10'
    }, attrs || {});
    const classes = [];
    return {
      _classes: classes,
      _openedUi: false,
      getAttribute: function(k) { return map[k] || ''; },
      setAttribute: function() {},
      classList: {
        add: function() {
          for (var i = 0; i < arguments.length; i++) {
            classes.push(arguments[i]);
            if (arguments[i] === 'is-reminder-opened') this._openedUi = true;
          }
        }.bind(null)
      }
    };
  }

  // Re-bind classList.add to set _openedUi on anchor
  function makeAnchor3(attrs) {
    const map = Object.assign({
      'data-mtw-vid': 'v1',
      'data-mtw-plate': '34ABC123',
      'data-mtw-type': 's',
      'data-mtw-field': 'sigortaDate',
      'data-mtw-date': '2026-08-10'
    }, attrs || {});
    const anchor = {
      _classes: [],
      _openedUi: false,
      getAttribute: function(k) { return map[k] || ''; },
      setAttribute: function() {}
    };
    anchor.classList = {
      add: function() {
        for (var i = 0; i < arguments.length; i++) {
          anchor._classes.push(arguments[i]);
          if (arguments[i] === 'is-reminder-opened') anchor._openedUi = true;
        }
      }
    };
    return anchor;
  }

  return {
    record: sandbox.record,
    logs,
    alerts,
    events,
    saveCalls: function() { return saveCalls; },
    resolveSave: windowRef.__resolveSave,
    makeAnchor: makeAnchor3,
    inflight: sandbox.monthlyTodoWaSaveInflight
  };
}

(async function main() {
  const notif = read('notifications.js');
  const notifCss = read('notifications.css');
  const adminJs = read('admin/admin-report.js');
  const adminCss = read('admin/admin-report.css');
  const adminHtml = read('admin/driver-report.html');
  const adminPhp = read('admin/admin_report.php');
  const core = read('script-core.js');
  const index = read('index.html');

  await run('source: audit UI yalnız Kullanıcı Raporları sekmesinde', function() {
    assert.doesNotMatch(notif, /WhatsApp Geçmişi|monthly-todo-whatsapp-audit-modal|openMonthlyTodoWhatsAppAudit/);
    assert.doesNotMatch(notifCss, /monthly-todo-wa-audit|monthly-todo-whatsapp-audit-modal/);
    assert.match(adminHtml, /id="tab-kullanici"[\s\S]*id="user-whatsapp-audit-btn"[\s\S]*id="user-whatsapp-audit-modal"/);
    assert.match(adminJs, /function openUserWhatsAppAudit\(\)/);
    assert.match(adminJs, /Bu kayıtlar WhatsApp bağlantısının uygulama üzerinden başlatıldığını gösterir/);
    assert.match(adminCss, /#user-whatsapp-audit-modal/);
    assert.doesNotMatch(adminJs, /exportWhatsApp|deleteWhatsAppAudit|clearWhatsAppLogs/);
  });

  await run('source: strict save true + rollback', function() {
    assert.match(notif, /ok !== true/);
    assert.match(notif, /WhatsApp bağlantısı açıldı ancak bildirim geçmişi sunucuya kaydedilemedi/);
    assert.match(notif, /monthlyTodoWaSaveInflight/);
    const thenSliceMatch = notif.match(/window\.saveDataToServer\(\)\.then\(function\(ok\) \{[\s\S]*?\}\)\.catch/);
    assert.ok(thenSliceMatch, 'save then/catch zinciri bulunmalı');
    const thenSlice = thenSliceMatch[0];
    assert.match(thenSlice, /if \(ok !== true\)/);
    assert.match(thenSlice, /applyMonthlyTodoWhatsAppOpenedUiState\(anchorEl\)/);
    assert.ok(
      thenSlice.indexOf('if (ok !== true)') < thenSlice.indexOf('applyMonthlyTodoWhatsAppOpenedUiState(anchorEl)'),
      'UI state yalnız başarılı save sonrası'
    );
  });

  await run('source: notifications ve Kullanıcı Raporları asset pinleri', function() {
    const ver = (core.match(/notifications:\s*'([^']+)'/) || [])[1];
    const scriptPin = (index.match(/script-core\.js\?v=([0-9.]+)/) || [])[1];
    const adminScriptPin = (adminHtml.match(/script-core\.js\?v=([0-9.]+)/) || [])[1];
    assert.ok(ver, 'notifications version bulunmalı');
    assert.ok(scriptPin, 'script-core pin bulunmalı');
    assert.equal(scriptPin, adminScriptPin, 'ana uygulama ve Kullanıcı Raporları script-core pin parity');
    assert.match(core, /notifications\.js\?v=' \+ V\.notifications/);
    assert.match(core, /notifications\.css\?v=' \+ V\.notifications/);
    assert.match(index, new RegExp('script-core\\.js\\?v=' + scriptPin.replace(/\./g, '\\.')));
    assert.match(index, /data-manager\.js\?v=20260804\.8/);
    assert.match(adminHtml, /admin-report\.css\?v=20260807\.5/);
    assert.match(adminHtml, /admin-report\.js\?v=20260804\.1/);
  });

  await run('role: sunucu ve UI genel yönetici audit kapısı', function() {
    assert.match(adminPhp, /\$canViewWhatsAppAudit = \(\$context\['role'\] \?\? ''\) === 'genel_yonetici'/);
    assert.match(adminPhp, /'whatsapp_logs' => \$canViewWhatsAppAudit/);
    assert.match(adminJs, /userWhatsAppAuditAllowed = data\.can_view_whatsapp_audit === true/);
    assert.match(adminJs, /if \(!userWhatsAppAuditAllowed\) return;/);
    assert.match(adminHtml, /id="user-whatsapp-audit-btn"[^>]*hidden/);
  });

  const api = loadAuditHelpers();

  await run('viewmodel: empty / single / corrupt / sort / search / filters', function() {
    assert.equal(api.normalize(null, {}, {}).length, 0);
    const rows = api.normalize({
      'k2': null,
      'k1': {
        vehicleId: '1', plate: '34AAA111', type: 's', field: 'sigortaDate', date: '2026-01-01',
        firstOpenedAt: '2026-07-01T10:00:00.000Z', lastOpenedAt: '2026-07-10T10:00:00.000Z',
        openedCount: 2, openedBy: 'Ali'
      },
      'k3': {
        vehicleId: '2', plate: '06BBB222', type: 'm', field: 'muayeneDate', date: '2026-02-01',
        firstOpenedAt: '2026-07-02T10:00:00.000Z', lastOpenedAt: '2026-07-20T10:00:00.000Z',
        openedCount: -3, openedBy: 'Veli'
      }
    }, {
      '1': { id: '1', plate: '34AAA111', branchId: 'b1', brandModel: 'Fiat' }
    }, { b1: 'Medisa' });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].plate, '06BBB222');
    assert.equal(rows[0].openedCount, 0);
    assert.equal(rows[1].branchName, 'Medisa');
    assert.equal(api.typeLabel('s'), 'Sigorta');
    const filtered = api.filter(rows, { search: 'ali', branchId: 'all', typeCode: 'all', timeFilter: 'all' });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].openedBy, 'Ali');
    const byBranch = api.filter(rows, { search: '', branchId: 'b1', typeCode: 'all', timeFilter: 'all' });
    assert.equal(byBranch.length, 1);
    const byType = api.filter(rows, { search: '', branchId: 'all', typeCode: 'm', timeFilter: 'all' });
    assert.equal(byType.length, 1);
    const sum = api.summarize(rows);
    assert.equal(sum.uniqueCount, 2);
    assert.equal(sum.totalStarts, 2);
  });

  await run('viewmodel: missing vehicle fallback + html-safe labels', function() {
    const rows = api.normalize({
      x: { vehicleId: 'gone', plate: '35OLD', type: 'k', openedCount: 1, lastOpenedAt: '2026-07-01T00:00:00.000Z', openedBy: '<b>Hack</b>' }
    }, {}, {});
    assert.equal(rows[0].branchName, 'Bilinmiyor');
    assert.equal(rows[0].plate, '35OLD');
    assert.equal(rows[0].openedBy, '<b>Hack</b>');
  });

  await run('transaction: save true creates entry + UI', async function() {
    const h = createRecordHarness({ saveMode: 'true' });
    const a = h.makeAnchor();
    h.record('rk1', a);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(function(r) { setTimeout(r, 10); });
    assert.equal(h.logs.rk1.openedCount, 1);
    assert.equal(a._openedUi, true);
    assert.equal(h.events.length, 0);
    assert.equal(h.alerts.length, 0);
  });

  await run('transaction: save false deletes new key + no UI/event', async function() {
    const h = createRecordHarness({ saveMode: 'false' });
    const a = h.makeAnchor();
    h.record('rk1', a);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(function(r) { setTimeout(r, 10); });
    assert.equal(Object.prototype.hasOwnProperty.call(h.logs, 'rk1'), false);
    assert.equal(a._openedUi, false);
    assert.equal(h.events.length, 0);
    assert.ok(h.alerts[0].indexOf('kaydedilemedi') !== -1);
  });

  await run('transaction: reject rollback', async function() {
    const h = createRecordHarness({ saveMode: 'reject' });
    const a = h.makeAnchor();
    h.record('rk1', a);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(function(r) { setTimeout(r, 10); });
    assert.equal(Object.prototype.hasOwnProperty.call(h.logs, 'rk1'), false);
    assert.equal(a._openedUi, false);
    assert.equal(h.events.length, 0);
  });

  await run('transaction: existing + true keeps firstOpenedAt', async function() {
    const h = createRecordHarness({
      saveMode: 'true',
      seed: {
        rk1: {
          vehicleId: 'v1', plate: '34ABC123', type: 's', field: 'sigortaDate', date: '2026-08-10',
          firstOpenedAt: '2026-01-01T00:00:00.000Z', lastOpenedAt: '2026-01-01T00:00:00.000Z',
          openedCount: 1, openedBy: 'Eski'
        }
      }
    });
    const a = h.makeAnchor();
    h.record('rk1', a);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(function(r) { setTimeout(r, 10); });
    assert.equal(h.logs.rk1.firstOpenedAt, '2026-01-01T00:00:00.000Z');
    assert.equal(h.logs.rk1.openedCount, 2);
    assert.equal(h.logs.rk1.openedBy, 'Test User');
  });

  await run('transaction: existing + false restores previous', async function() {
    const prev = {
      vehicleId: 'v1', plate: '34ABC123', type: 's', field: 'sigortaDate', date: '2026-08-10',
      firstOpenedAt: '2026-01-01T00:00:00.000Z', lastOpenedAt: '2026-01-01T00:00:00.000Z',
      openedCount: 1, openedBy: 'Eski'
    };
    const h = createRecordHarness({ saveMode: 'false', seed: { rk1: JSON.parse(JSON.stringify(prev)) } });
    const a = h.makeAnchor();
    h.record('rk1', a);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(function(r) { setTimeout(r, 10); });
    assert.deepEqual(h.logs.rk1, prev);
    assert.equal(a._openedUi, false);
  });

  await run('transaction: save missing rollback', async function() {
    const h = createRecordHarness({ saveMode: 'missing' });
    const a = h.makeAnchor();
    h.record('rk1', a);
    assert.equal(Object.prototype.hasOwnProperty.call(h.logs, 'rk1'), false);
    assert.equal(a._openedUi, false);
    assert.ok(h.alerts[0].indexOf('kaydedilemedi') !== -1);
  });

  await run('transaction: concurrent same key blocked', async function() {
    const h = createRecordHarness({ saveMode: 'slow' });
    const a1 = h.makeAnchor();
    const a2 = h.makeAnchor();
    h.record('rk1', a1);
    h.record('rk1', a2);
    assert.equal(h.saveCalls(), 1);
    assert.ok(h.alerts.some(function(x) { return x.indexOf('devam ediyor') !== -1; }));
    h.resolveSave(true);
    await new Promise(function(r) { setTimeout(r, 0); });
    assert.equal(h.logs.rk1.openedCount, 1);
  });

  console.log('\nWhatsApp audit invariants: ' + passed + ' passed, ' + failed + ' failed');
  if (failed) process.exitCode = 1;
})();
