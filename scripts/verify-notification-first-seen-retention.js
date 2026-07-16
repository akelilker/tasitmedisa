/**
 * PERF-P0-1-R4 — host-TZ bağımsız parser + production rollback owner testleri.
 * Çalıştır: node scripts/verify-notification-first-seen-retention.js
 *
 * Alt proses modu:
 *   MEDISA_TZ_PROBE=1 node scripts/verify-notification-first-seen-retention.js
 *   → yalnız parser fixture JSON basar (TZ ortam değişkenine göre).
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const IS_TZ_PROBE = process.env.MEDISA_TZ_PROBE === '1';

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

function extractFunctionSource(src, fnName) {
  const startRe = new RegExp('function\\s+' + fnName + '\\s*\\(');
  const startMatch = startRe.exec(src);
  if (!startMatch) throw new Error('function not found: ' + fnName);
  const braceStart = src.indexOf('{', startMatch.index);
  let depth = 0;
  let inStr = null;
  let escape = false;
  for (let p = braceStart; p < src.length; p++) {
    const ch = src[p];
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(startMatch.index, p + 1);
    }
  }
  throw new Error('unclosed function: ' + fnName);
}

function loadParserHelpers() {
  const src = read('notifications.js');
  const code = [
    extractFunctionSource(src, 'notificationIstanbulWallClockToEpochMs'),
    extractFunctionSource(src, 'parseNotificationFirstSeenMs'),
    'result = {',
    '  parseNotificationFirstSeenMs: parseNotificationFirstSeenMs,',
    '  notificationIstanbulWallClockToEpochMs: notificationIstanbulWallClockToEpochMs',
    '};'
  ].join('\n');
  const sandbox = {
    result: null,
    Date: Date,
    Math: Math,
    isFinite: isFinite,
    Number: Number,
    String: String,
    Object: Object,
    Array: Array,
    Intl: Intl
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'notif-parser.js' });
  return sandbox.result;
}

const OFFSETLESS_FIXTURES = [
  '2026-01-15',
  '2026-07-16',
  '2026-01-15T10:30',
  '2026-07-16T10:30',
  '2026-01-15 10:30:45',
  '2026-07-16 10:30:45',
  '16.01.2026 10:30',
  '16.07.2026 10:30',
  '2015-01-15T10:30',
  '2015-07-15T10:30'
];

const SEPARATOR_INVALID = [
  '2026-07-16\t10:30',
  '2026-07-16\n10:30'
];

if (IS_TZ_PROBE) {
  const helpers = loadParserHelpers();
  const out = {
    tz: process.env.TZ || '',
    values: {}
  };
  OFFSETLESS_FIXTURES.concat(SEPARATOR_INVALID).forEach(function(v) {
    out.values[v] = helpers.parseNotificationFirstSeenMs(v);
  });
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

function loadFirstSeenHelpers() {
  const src = read('notifications.js');
  const maxKeys = src.match(/const\s+NOTIF_STATE_MAX_KEYS\s*=\s*(\d+)\s*;/);
  const maxAge = src.match(/const\s+NOTIF_STATE_MAX_AGE_MS\s*=\s*([^;]+);/);
  if (!maxKeys || !maxAge) throw new Error('constants missing');
  const code = [
    'var NOTIF_STATE_MAX_KEYS = ' + maxKeys[1] + ';',
    'var NOTIF_STATE_MAX_AGE_MS = ' + maxAge[1] + ';',
    extractFunctionSource(src, 'uniqNotificationKeys'),
    extractFunctionSource(src, 'parseNotificationKeyMs'),
    extractFunctionSource(src, 'pruneNotificationKeys'),
    extractFunctionSource(src, 'notificationIstanbulWallClockToEpochMs'),
    extractFunctionSource(src, 'parseNotificationFirstSeenMs'),
    extractFunctionSource(src, 'areFirstSeenDatesMapsEqual'),
    extractFunctionSource(src, 'normalizeFirstSeenDatesMap'),
    extractFunctionSource(src, 'normalizeNotificationScopeState'),
    extractFunctionSource(src, 'cloneNotificationScopeState'),
    'result = {',
    '  parseNotificationFirstSeenMs: parseNotificationFirstSeenMs,',
    '  areFirstSeenDatesMapsEqual: areFirstSeenDatesMapsEqual,',
    '  normalizeFirstSeenDatesMap: normalizeFirstSeenDatesMap,',
    '  normalizeNotificationScopeState: normalizeNotificationScopeState,',
    '  cloneNotificationScopeState: cloneNotificationScopeState,',
    '  NOTIF_STATE_MAX_KEYS: NOTIF_STATE_MAX_KEYS,',
    '  NOTIF_STATE_MAX_AGE_MS: NOTIF_STATE_MAX_AGE_MS',
    '};'
  ].join('\n');
  const sandbox = {
    result: null,
    Date: Date,
    Math: Math,
    isFinite: isFinite,
    Number: Number,
    String: String,
    Object: Object,
    Array: Array,
    Intl: Intl
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'notif-helpers.js' });
  return sandbox.result;
}

function loadBatchRuntime(helpers) {
  const src = read('notifications.js');
  const metrics = {
    updateCalls: 0,
    saveCalls: 0,
    pending: []
  };
  const state = {
    appData: { notificationReadState: {} },
    scopeKey: 'user:7|role:admin|branches:all',
    nowMs: Date.now(),
    saveImpl: function() { return Promise.resolve(true); }
  };

  const windowObj = {
    get appData() { return state.appData; },
    set appData(v) { state.appData = v; },
    updateNotifications: function() {
      metrics.updateCalls += 1;
      // Production save owner bunu çağırır; recursion üretme.
    },
    saveDataToServer: function() {
      metrics.saveCalls += 1;
      const impl = state.saveImpl;
      const p = Promise.resolve().then(function() { return impl(); });
      metrics.pending.push(p);
      return p;
    }
  };

  const prelude = [
    'var notifFirstSeenBatchContext = null;',
    'var notificationScopeRollbackQuiet = false;',
    'var NOTIF_STATE_MAX_KEYS = ' + helpers.NOTIF_STATE_MAX_KEYS + ';',
    'var NOTIF_STATE_MAX_AGE_MS = ' + helpers.NOTIF_STATE_MAX_AGE_MS + ';',
    'function ensureNotificationReadStateObject() {',
    '  if (!window.appData.notificationReadState || typeof window.appData.notificationReadState !== "object") window.appData.notificationReadState = {};',
    '  return window.appData.notificationReadState;',
    '}',
    'function getCurrentNotifScopeKey() { return state.scopeKey; }',
    'function getCurrentNotificationFirstSeenValue() { return String(state.nowMs || Date.now()); }',
    'function getNotificationScopeState(scopeKey) {',
    '  var st = ensureNotificationReadStateObject();',
    '  var normalized = normalizeNotificationScopeState(st[scopeKey]);',
    '  st[scopeKey] = normalized;',
    '  return normalized;',
    '}'
  ].join('\n');

  const fns = [
    'uniqNotificationKeys',
    'parseNotificationKeyMs',
    'pruneNotificationKeys',
    'notificationIstanbulWallClockToEpochMs',
    'parseNotificationFirstSeenMs',
    'areFirstSeenDatesMapsEqual',
    'normalizeFirstSeenDatesMap',
    'normalizeNotificationScopeState',
    'cloneNotificationScopeState',
    'beginNotificationFirstSeenBatch',
    'applyNotificationFirstSeenPruneInBatch',
    'abortNotificationFirstSeenBatch',
    'flushNotificationFirstSeenBatch',
    'getOrCreateNotificationFirstSeenValue',
    'saveNotificationScopeStateWithRollback'
  ].map(function(n) { return extractFunctionSource(src, n); }).join('\n');

  // Guard: test file must not reimplement save owner
  assert.match(fns, /function saveNotificationScopeStateWithRollback/);
  assert.match(fns, /window\.saveDataToServer/);
  assert.match(fns, /notificationScopeRollbackQuiet/);

  const code = [
    prelude,
    fns,
    'api = {',
    '  begin: beginNotificationFirstSeenBatch,',
    '  flush: flushNotificationFirstSeenBatch,',
    '  abort: abortNotificationFirstSeenBatch,',
    '  getOrCreate: getOrCreateNotificationFirstSeenValue,',
    '  getScope: getNotificationScopeState,',
    '  getBatch: function() { return notifFirstSeenBatchContext; },',
    '  getQuiet: function() { return notificationScopeRollbackQuiet; },',
    '  markCompleted: function() { if (notifFirstSeenBatchContext) notifFirstSeenBatchContext.completed = true; },',
    '  saveDirect: saveNotificationScopeStateWithRollback',
    '};'
  ].join('\n');

  const sandbox = {
    api: null,
    state: state,
    window: windowObj,
    Date: Date,
    Math: Math,
    isFinite: isFinite,
    Number: Number,
    String: String,
    Object: Object,
    Array: Array,
    Promise: Promise,
    Intl: Intl,
    console: console,
    assert: assert
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'notif-batch.js' });

  return {
    api: sandbox.api,
    state: state,
    metrics: metrics,
    resetMetrics: function() {
      metrics.updateCalls = 0;
      metrics.saveCalls = 0;
      metrics.pending = [];
    },
    awaitPending: async function() {
      const list = metrics.pending.slice();
      metrics.pending = [];
      await Promise.all(list.map(function(p) {
        return Promise.resolve(p).then(function() {}, function() {});
      }));
    }
  };
}

const helpers = loadFirstSeenHelpers();
const parseNotificationFirstSeenMs = helpers.parseNotificationFirstSeenMs;
const normalizeFirstSeenDatesMap = helpers.normalizeFirstSeenDatesMap;
const areFirstSeenDatesMapsEqual = helpers.areFirstSeenDatesMapsEqual;

const VALID = [
  '1721123456789', '1721123456',
  '16.07.2026', '16/07/2026', '16-07-2026',
  '16.07.2026 23:59', '16/07/2026 23:59', '16-07-2026 23:59',
  '2026-07-16',
  '2026-07-16T10:30', '2026-07-16T10:30:00',
  '2026-07-16T10:30:00.1', '2026-07-16T10:30:00.12', '2026-07-16T10:30:00.123',
  '2026-07-16T10:30Z', '2026-07-16T10:30:00Z', '2026-07-16T10:30:00.123Z',
  '2026-07-16T10:30+03:00', '2026-07-16T10:30:00+03:00', '2026-07-16T10:30:00.123+03:00',
  '2026-07-16T10:30+0300', '2026-07-16T10:30:00+0300',
  '2026-07-16 10:30', '2026-07-16 10:30:00',
  '2015-01-15T10:30', '2015-07-15T10:30'
];
const INVALID = [
  '31.02.2026', '29.02.2025', '2026-02-31', '2026-00-16', '2026-13-16', '2026-07-00', '2026-07-32',
  '16.07.2026 24:00', '16.07.2026 23:60',
  '2026-07-16T24:00', '2026-07-16T23:60', '2026-07-16T23:59:60',
  '2026-07-16T10:30+25:00', '2026-07-16T10:30+03:60',
  'tomorrow', 'yesterday', 'today', 'now', '+1 day', '-1 day', 'next monday',
  '0', '-5', 'NaN', 'Infinity', '',
  '2026-07-16\t10:30', '2026-07-16\n10:30'
];

async function main() {
  await run('production helpers extracted', async function() {
    assert.equal(typeof parseNotificationFirstSeenMs, 'function');
    assert.equal(typeof normalizeFirstSeenDatesMap, 'function');
    const src = read('notifications.js');
    assert.match(src, /function notificationIstanbulWallClockToEpochMs\(/);
    assert.match(src, /timeZone:\s*'Europe\/Istanbul'/);
    assert.doesNotMatch(src, /new Date\(year,\s*month\s*-\s*1,\s*day,\s*hour/);
  });

  await run('JS validity matrix', async function() {
    VALID.forEach(function(v) {
      assert.ok(parseNotificationFirstSeenMs(v) > 0, 'expected valid: ' + v);
    });
    INVALID.forEach(function(v) {
      assert.equal(parseNotificationFirstSeenMs(v), 0, 'expected invalid: ' + JSON.stringify(v));
    });
  });

  await run('multi-host-TZ offsetless epoch parity + PHP', async function() {
    const zones = ['Europe/Istanbul', 'UTC', 'America/New_York', 'Asia/Tokyo'];
    const byTz = {};
    zones.forEach(function(tz) {
      const raw = execFileSync(process.execPath, [path.join(ROOT, 'scripts/verify-notification-first-seen-retention.js')], {
        cwd: ROOT,
        encoding: 'utf8',
        env: Object.assign({}, process.env, { TZ: tz, MEDISA_TZ_PROBE: '1' })
      });
      byTz[tz] = JSON.parse(raw);
      assert.equal(byTz[tz].tz, tz);
    });

    const phpOut = execFileSync('php', ['scripts/verify-notification-first-seen-retention-php.php'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: Object.assign({}, process.env, { TZ: 'Europe/Istanbul' })
    });
    assert.match(phpOut, /PHP_RETENTION_OK/);

    const phpEpoch = {};
    const ob = phpOut.search(/OFFSETLESS_BEGIN\r?\n/);
    const oe = phpOut.search(/OFFSETLESS_END\r?\n/);
    assert.ok(ob >= 0 && oe > ob);
    phpOut.slice(phpOut.indexOf('\n', ob) + 1, oe).split(/\r?\n/).filter(Boolean).forEach(function(row) {
      const tab = row.indexOf('\t');
      const value = JSON.parse(row.slice(0, tab));
      phpEpoch[value] = Number(row.slice(tab + 1));
    });

    OFFSETLESS_FIXTURES.forEach(function(fixture) {
      const base = byTz['Europe/Istanbul'].values[fixture];
      assert.ok(base > 0, 'istanbul valid ' + fixture);
      zones.forEach(function(tz) {
        assert.equal(byTz[tz].values[fixture], base, fixture + ' mismatch under TZ=' + tz);
      });
      assert.equal(phpEpoch[fixture], base, 'PHP parity ' + fixture);
    });

    SEPARATOR_INVALID.forEach(function(fixture) {
      zones.forEach(function(tz) {
        assert.equal(byTz[tz].values[fixture], 0, 'invalid separator under ' + tz);
      });
      assert.equal(phpEpoch[fixture], 0, 'PHP invalid separator');
    });
  });

  await run('JS/PHP full validity+epoch parity', async function() {
    const phpOut = execFileSync('php', ['scripts/verify-notification-first-seen-retention-php.php'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: Object.assign({}, process.env, { TZ: 'Europe/Istanbul' })
    });
    const begin = phpOut.search(/PARITY_BEGIN\r?\n/);
    const end = phpOut.search(/PARITY_END\r?\n/);
    const rows = phpOut.slice(phpOut.indexOf('\n', begin) + 1, end).split(/\r?\n/).filter(Boolean);
    rows.forEach(function(row) {
      const parts = row.split('\t');
      const phpValid = parts[0] === '1';
      const phpMs = Number(parts[1]);
      const value = JSON.parse(parts.slice(2).join('\t'));
      const jsMs = parseNotificationFirstSeenMs(value);
      assert.equal(jsMs > 0, phpValid, 'validity ' + JSON.stringify(value));
      if (phpValid) assert.equal(jsMs, phpMs, 'epoch ' + JSON.stringify(value));
    });
  });

  await run('8.7 client 600 active keep', async function() {
    const now = Date.now();
    const input = {};
    const active = {};
    for (let i = 0; i < 600; i++) {
      input['a|' + i] = String(now - (120 * 86400000) - i);
      active['a|' + i] = true;
    }
    assert.equal(Object.keys(normalizeFirstSeenDatesMap(input, active)).length, 600);
  });

  await run('production saveNotificationScopeStateWithRollback owner', async function() {
    const selfSrc = read('scripts/verify-notification-first-seen-retention.js');
    assert.doesNotMatch(
      selfSrc,
      /function saveNotificationScopeStateWithRollback\(scopeKey, previousScoped\) \{\s*\n\s*if \(notificationScopeRollbackQuiet\) return;\s*\n\s*saveCalls\.push/
    );

    const rt = loadBatchRuntime(helpers);
    const api = rt.api;
    const scope = rt.state.scopeKey;
    const old = String(Date.now() - (120 * 86400000));

    rt.state.appData.notificationReadState[scope] = {
      readKeys: [],
      dismissedKeys: [],
      firstSeenDates: {},
      migratedFromLocalStorage: false,
      updatedAt: 'seed'
    };
    for (let i = 0; i < 10; i++) {
      rt.state.appData.notificationReadState[scope].firstSeenDates['active|' + i] = old;
    }
    rt.state.appData.notificationReadState[scope].firstSeenDates['passive|old'] = String(Date.now() - (200 * 86400000));

    // partial abort
    rt.resetMetrics();
    api.begin(scope);
    api.getOrCreate('active|0');
    api.getOrCreate('active|1');
    api.getOrCreate('active|2');
    rt.state.nowMs = Date.now();
    api.getOrCreate('new|partial');
    api.flush(false);
    await rt.awaitPending();
    assert.equal(api.getBatch(), null);
    assert.equal(rt.metrics.saveCalls, 0, 'abort no save');
    assert.equal(api.getScope(scope).firstSeenDates['new|partial'], undefined);
    assert.equal(
      Object.keys(api.getScope(scope).firstSeenDates).filter(function(k) { return k.indexOf('active|') === 0; }).length,
      10
    );

    // success prune
    rt.resetMetrics();
    api.begin(scope);
    for (let i = 0; i < 10; i++) api.getOrCreate('active|' + i);
    api.markCompleted();
    api.flush(true);
    await rt.awaitPending();
    assert.equal(rt.metrics.saveCalls, 1, 'success save once');
    assert.equal(rt.metrics.updateCalls, 1, 'success updateNotifications once');
    assert.equal(api.getQuiet(), false);
    assert.equal(api.getScope(scope).firstSeenDates['passive|old'], undefined);

    // no-op
    rt.resetMetrics();
    const beforeAt = api.getScope(scope).updatedAt;
    api.begin(scope);
    for (let i = 0; i < 10; i++) api.getOrCreate('active|' + i);
    api.markCompleted();
    api.flush(true);
    await rt.awaitPending();
    assert.equal(rt.metrics.saveCalls, 0, 'noop no save');
    assert.equal(api.getScope(scope).updatedAt, beforeAt);

    // save false rollback
    rt.resetMetrics();
    const beforeReject = helpers.cloneNotificationScopeState(api.getScope(scope));
    rt.state.saveImpl = function() { return Promise.resolve(false); };
    rt.state.nowMs = Date.now() + 5;
    api.begin(scope);
    for (let i = 0; i < 10; i++) api.getOrCreate('active|' + i);
    api.getOrCreate('temp|false');
    api.markCompleted();
    api.flush(true);
    await rt.awaitPending();
    assert.equal(rt.metrics.saveCalls, 1);
    assert.ok(rt.metrics.updateCalls >= 2, 'initial update + rollback update');
    assert.equal(api.getQuiet(), false);
    assert.equal(api.getScope(scope).firstSeenDates['temp|false'], undefined);
    assert.ok(areFirstSeenDatesMapsEqual(api.getScope(scope).firstSeenDates, beforeReject.firstSeenDates));

    // save reject rollback
    rt.resetMetrics();
    const beforeThrow = helpers.cloneNotificationScopeState(api.getScope(scope));
    rt.state.saveImpl = function() { return Promise.reject(new Error('test')); };
    rt.state.nowMs = Date.now() + 8;
    api.begin(scope);
    for (let i = 0; i < 10; i++) api.getOrCreate('active|' + i);
    api.getOrCreate('temp|reject');
    api.markCompleted();
    api.flush(true);
    await rt.awaitPending();
    assert.equal(rt.metrics.saveCalls, 1);
    assert.equal(api.getQuiet(), false);
    assert.equal(api.getScope(scope).firstSeenDates['temp|reject'], undefined);
    assert.ok(areFirstSeenDatesMapsEqual(api.getScope(scope).firstSeenDates, beforeThrow.firstSeenDates));

    // follow-up success not blocked
    rt.resetMetrics();
    rt.state.saveImpl = function() { return Promise.resolve(true); };
    rt.state.nowMs = Date.now() + 12;
    api.begin(scope);
    for (let i = 0; i < 10; i++) api.getOrCreate('active|' + i);
    api.getOrCreate('after|ok');
    api.markCompleted();
    api.flush(true);
    await rt.awaitPending();
    assert.equal(rt.metrics.saveCalls, 1);
    assert.ok(api.getScope(scope).firstSeenDates['after|ok']);
    assert.equal(api.getQuiet(), false);
  });

  await run('save.php untouched in R4 source contract', async function() {
    // behavioral: helper still present from R3
    assert.match(read('core.php'), /function medisaNotificationResolveScopeFirstSeenSave\(/);
    assert.match(read('core.php'), /\[T \]/);
    assert.match(read('notifications.js'), /\[T \]/);
  });

  console.log('');
  console.log('passed=' + passed + ' failed=' + failed);
  process.exit(failed ? 1 : 0);
}

main().catch(function(err) {
  console.error(err);
  process.exit(1);
});
