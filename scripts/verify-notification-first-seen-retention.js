/**
 * PERF-P0-1-R3 — production parser/batch/save owner davranış testleri.
 * Çalıştır: node scripts/verify-notification-first-seen-retention.js
 * Offset'siz tarih paritesi için TZ=Europe/Istanbul önerilir.
 */
'use strict';

process.env.TZ = process.env.TZ || 'Europe/Istanbul';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execSync, execFileSync } = require('node:child_process');

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

function loadFirstSeenHelpers() {
  const src = read('notifications.js');
  const maxKeys = src.match(/const\s+NOTIF_STATE_MAX_KEYS\s*=\s*(\d+)\s*;/);
  const maxAge = src.match(/const\s+NOTIF_STATE_MAX_AGE_MS\s*=\s*([^;]+);/);
  if (!maxKeys || !maxAge) throw new Error('constants missing');
  const names = [
    'parseNotificationFirstSeenMs',
    'areFirstSeenDatesMapsEqual',
    'normalizeFirstSeenDatesMap',
    'normalizeNotificationScopeState',
    'cloneNotificationScopeState',
    'pruneNotificationKeys',
    'uniqNotificationKeys',
    'parseNotificationKeyMs'
  ];
  // pruneNotificationKeys needs uniq + parseNotificationKeyMs
  const code = [
    'var NOTIF_STATE_MAX_KEYS = ' + maxKeys[1] + ';',
    'var NOTIF_STATE_MAX_AGE_MS = ' + maxAge[1] + ';',
    extractFunctionSource(src, 'uniqNotificationKeys'),
    extractFunctionSource(src, 'parseNotificationKeyMs'),
    extractFunctionSource(src, 'pruneNotificationKeys'),
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
  const sandbox = { result: null, Date: Date, Math: Math, isFinite: isFinite, Number: Number, String: String, Object: Object, Array: Array };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'notif-helpers.js' });
  return sandbox.result;
}

function loadBatchRuntime(helpers) {
  const src = read('notifications.js');
  const saveCalls = [];
  const state = {
    appData: { notificationReadState: {} },
    scopeKey: 'user:7|role:admin|branches:all',
    rollbackQuiet: false,
    saveImpl: function() {
      return Promise.resolve(true);
    }
  };

  const prelude = [
    'var notifFirstSeenBatchContext = null;',
    'var notificationScopeRollbackQuiet = false;',
    'var NOTIF_STATE_MAX_KEYS = ' + helpers.NOTIF_STATE_MAX_KEYS + ';',
    'var NOTIF_STATE_MAX_AGE_MS = ' + helpers.NOTIF_STATE_MAX_AGE_MS + ';',
    'function ensureNotificationReadStateObject() {',
    '  if (!state.appData.notificationReadState || typeof state.appData.notificationReadState !== "object") state.appData.notificationReadState = {};',
    '  return state.appData.notificationReadState;',
    '}',
    'function getCurrentNotifScopeKey() { return state.scopeKey; }',
    'function getCurrentNotificationFirstSeenValue() { return String(state.nowMs || Date.now()); }',
    'function getNotificationScopeState(scopeKey) {',
    '  var st = ensureNotificationReadStateObject();',
    '  var normalized = normalizeNotificationScopeState(st[scopeKey]);',
    '  st[scopeKey] = normalized;',
    '  return normalized;',
    '}',
    'function saveNotificationScopeStateWithRollback(scopeKey, previousScoped) {',
    '  if (notificationScopeRollbackQuiet) return;',
    '  saveCalls.push({ scopeKey: scopeKey, previousScoped: previousScoped });',
    '  var impl = state.saveImpl;',
    '  var p = Promise.resolve().then(function() { return impl(); });',
    '  return p.then(function(ok) {',
    '    if (ok === false) throw new Error("save failed");',
    '  }).catch(function() {',
    '    var st = ensureNotificationReadStateObject();',
    '    st[scopeKey] = cloneNotificationScopeState(previousScoped);',
    '    notificationScopeRollbackQuiet = true;',
    '    try { if (typeof state.onRollbackUi === "function") state.onRollbackUi(); }',
    '    finally { notificationScopeRollbackQuiet = false; }',
    '  });',
    '}'
  ].join('\n');

  const fns = [
    'uniqNotificationKeys',
    'parseNotificationKeyMs',
    'pruneNotificationKeys',
    'parseNotificationFirstSeenMs',
    'areFirstSeenDatesMapsEqual',
    'normalizeFirstSeenDatesMap',
    'normalizeNotificationScopeState',
    'cloneNotificationScopeState',
    'beginNotificationFirstSeenBatch',
    'applyNotificationFirstSeenPruneInBatch',
    'abortNotificationFirstSeenBatch',
    'flushNotificationFirstSeenBatch',
    'getOrCreateNotificationFirstSeenValue'
  ].map(function(n) { return extractFunctionSource(src, n); }).join('\n');

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
    '  setQuiet: function(v) { notificationScopeRollbackQuiet = !!v; },',
    '  getQuiet: function() { return notificationScopeRollbackQuiet; },',
    '  markCompleted: function() { if (notifFirstSeenBatchContext) notifFirstSeenBatchContext.completed = true; }',
    '};'
  ].join('\n');

  const sandbox = {
    api: null,
    state: state,
    saveCalls: saveCalls,
    Date: Date,
    Math: Math,
    isFinite: isFinite,
    Number: Number,
    String: String,
    Object: Object,
    Array: Array,
    Promise: Promise,
    console: console
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'notif-batch.js' });
  return {
    api: sandbox.api,
    state: state,
    saveCalls: saveCalls,
    resetSaves: function() { saveCalls.length = 0; }
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
  '2026-07-16 10:30', '2026-07-16 10:30:00'
];
const INVALID = [
  '31.02.2026', '29.02.2025', '2026-02-31', '2026-00-16', '2026-13-16', '2026-07-00', '2026-07-32',
  '16.07.2026 24:00', '16.07.2026 23:60',
  '2026-07-16T24:00', '2026-07-16T23:60', '2026-07-16T23:59:60',
  '2026-07-16T10:30+25:00', '2026-07-16T10:30+03:60',
  'tomorrow', 'yesterday', 'today', 'now', '+1 day', '-1 day', 'next monday',
  '0', '-5', 'NaN', 'Infinity', ''
];

async function main() {
  await run('production helpers extracted', async function() {
    assert.equal(typeof parseNotificationFirstSeenMs, 'function');
    assert.equal(typeof normalizeFirstSeenDatesMap, 'function');
    assert.equal(typeof helpers.cloneNotificationScopeState, 'function');
  });

  await run('source save owner wiring', async function() {
    assert.match(read('core.php'), /function medisaNotificationResolveScopeFirstSeenSave\(/);
    assert.match(read('save.php'), /medisaNotificationResolveScopeFirstSeenSave\(/);
    assert.match(read('save.php'), /\$canonicalIncomingPresent/);
    assert.doesNotMatch(read('core.php'), /\bstrtotime\s*\(/);
  });

  await run('JS validity matrix', async function() {
    VALID.forEach(function(v) {
      assert.ok(parseNotificationFirstSeenMs(v) > 0, 'expected valid: ' + v);
    });
    INVALID.forEach(function(v) {
      assert.equal(parseNotificationFirstSeenMs(v), 0, 'expected invalid: ' + JSON.stringify(v));
    });
  });

  await run('JS/PHP validity+epoch parity', async function() {
    const phpOut = execFileSync('php', ['scripts/verify-notification-first-seen-retention-php.php'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: Object.assign({}, process.env, { TZ: 'Europe/Istanbul' })
    });
    assert.match(phpOut, /PHP_RETENTION_OK/);
    assert.match(phpOut, /PASS 6\.1 legacy firstSeen empty/);
    assert.match(phpOut, /PASS 6\.3 legacy-only accepts new key/);
    assert.match(phpOut, /PASS 6\.4 idempotent canonical/);
    const begin = phpOut.search(/PARITY_BEGIN\r?\n/);
    const end = phpOut.search(/PARITY_END\r?\n/);
    assert.ok(begin >= 0 && end > begin);
    const rows = phpOut.slice(phpOut.indexOf('\n', begin) + 1, end).split(/\r?\n/).filter(Boolean);
    assert.ok(rows.length >= VALID.length);
    rows.forEach(function(row) {
      const parts = row.split('\t');
      assert.equal(parts.length, 3, 'row=' + row);
      const phpValid = parts[0] === '1';
      const phpMs = Number(parts[1]);
      const value = parts[2];
      const jsMs = parseNotificationFirstSeenMs(value);
      const jsValid = jsMs > 0;
      assert.equal(jsValid, phpValid, 'validity parity ' + JSON.stringify(value));
      if (jsValid && phpValid) {
        assert.equal(jsMs, phpMs, 'epoch parity ' + JSON.stringify(value) + ' js=' + jsMs + ' php=' + phpMs);
      }
    });
  });

  await run('8.7 client 600 active keep', async function() {
    const now = Date.now();
    const input = {};
    const active = {};
    for (let i = 0; i < 600; i++) {
      const k = 'a|' + i;
      input[k] = String(now - (120 * 86400000) - i);
      active[k] = true;
    }
    for (let j = 0; j < 300; j++) input['p|' + j] = String(now - j * 1000);
    const out = normalizeFirstSeenDatesMap(input, active);
    assert.equal(Object.keys(out).length, 600);
  });

  await run('7.x batch behavior runtime', async function() {
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

    // 7.3 partial abort
    rt.resetSaves();
    api.begin(scope);
    api.getOrCreate('active|0');
    api.getOrCreate('active|1');
    api.getOrCreate('active|2');
    rt.state.nowMs = Date.now();
    api.getOrCreate('new|partial');
    api.flush(false);
    assert.equal(api.getBatch(), null, 'abort clears batch');
    assert.equal(rt.saveCalls.length, 0, 'abort save count');
    const afterAbort = api.getScope(scope);
    assert.equal(
      Object.keys(afterAbort.firstSeenDates).filter(function(k) { return k.indexOf('active|') === 0; }).length,
      10,
      'abort keeps 10 actives'
    );
    assert.equal(afterAbort.firstSeenDates['new|partial'], undefined, 'abort drops partial new');
    assert.equal(afterAbort.updatedAt, 'seed', 'abort restores updatedAt');

    // 7.4 after abort success with all 10
    rt.resetSaves();
    api.begin(scope);
    for (let i = 0; i < 10; i++) api.getOrCreate('active|' + i);
    api.markCompleted();
    api.flush(true);
    await new Promise(function(r) { setTimeout(r, 20); });
    assert.equal(api.getBatch(), null, 'success clears batch');
    assert.equal(api.getQuiet(), false, 'quiet false after success');
    const afterSuccess = api.getScope(scope);
    assert.equal(
      Object.keys(afterSuccess.firstSeenDates).filter(function(k) { return k.indexOf('active|') === 0; }).length,
      10,
      'success keeps 10 actives'
    );
    assert.equal(afterSuccess.firstSeenDates['passive|old'], undefined, 'success prunes passive');
    assert.equal(rt.saveCalls.length, 1, 'success save once');

    // 7.2 no-op
    rt.resetSaves();
    const beforeNoopAt = api.getScope(scope).updatedAt;
    const beforeNoopMap = Object.assign({}, api.getScope(scope).firstSeenDates);
    api.begin(scope);
    for (let i = 0; i < 10; i++) api.getOrCreate('active|' + i);
    api.markCompleted();
    api.flush(true);
    await new Promise(function(r) { setTimeout(r, 20); });
    assert.equal(rt.saveCalls.length, 0, 'noop save count');
    assert.equal(api.getScope(scope).updatedAt, beforeNoopAt, 'noop updatedAt');
    assert.ok(areFirstSeenDatesMapsEqual(api.getScope(scope).firstSeenDates, beforeNoopMap), 'noop map');

    // 7.1 success with new keys
    rt.resetSaves();
    rt.state.nowMs = Date.now();
    api.begin(scope);
    for (let i = 0; i < 10; i++) api.getOrCreate('active|' + i);
    api.getOrCreate('new|a');
    api.getOrCreate('new|b');
    api.markCompleted();
    api.flush(true);
    await new Promise(function(r) { setTimeout(r, 20); });
    assert.equal(rt.saveCalls.length, 1, 'new keys save once');
    assert.ok(api.getScope(scope).firstSeenDates['new|a']);
    assert.ok(api.getScope(scope).firstSeenDates['new|b']);

    // 7.5 save rejection rollback
    rt.resetSaves();
    const beforeReject = helpers.cloneNotificationScopeState(api.getScope(scope));
    const rejectImpl = function() { return Promise.resolve(false); };
    rt.state.saveImpl = rejectImpl;
    let rollbackUi = 0;
    rt.state.onRollbackUi = function() { rollbackUi += 1; };
    rt.state.nowMs = Date.now() + 5;
    api.begin(scope);
    for (let i = 0; i < 10; i++) api.getOrCreate('active|' + i);
    api.getOrCreate('temp|reject');
    api.markCompleted();
    api.flush(true);
    assert.equal(rt.saveCalls.length, 1, 'reject path attempted one save');
    await new Promise(function(r) { setTimeout(r, 40); });
    assert.equal(api.getQuiet(), false, 'quiet reset after reject');
    assert.equal(rollbackUi, 1, 'rollback ui once');
    assert.equal(api.getScope(scope).firstSeenDates['temp|reject'], undefined, 'reject rolled back new key');
    assert.ok(
      areFirstSeenDatesMapsEqual(api.getScope(scope).firstSeenDates, beforeReject.firstSeenDates),
      'reject restored map'
    );

    // subsequent real save not blocked
    rt.resetSaves();
    rt.state.saveImpl = function() { return Promise.resolve(true); };
    rt.state.nowMs = Date.now() + 10;
    api.begin(scope);
    for (let i = 0; i < 10; i++) api.getOrCreate('active|' + i);
    api.getOrCreate('after|ok');
    api.markCompleted();
    api.flush(true);
    await new Promise(function(r) { setTimeout(r, 40); });
    assert.equal(rt.saveCalls.length, 1, 'follow-up save once');
    assert.ok(api.getScope(scope).firstSeenDates['after|ok'], 'follow-up key kept');
    assert.equal(api.getQuiet(), false, 'quiet still false');
  });

  await run('7.6 badge finally contract in production source', async function() {
    const src = read('notifications.js');
    assert.match(src, /try \{\s*updateMonthlyTodoHeaderBadge\(\);\s*\} catch \(badgeErr\)/);
    assert.match(src, /flushNotificationFirstSeenBatch\(firstSeenBatchSucceeded\)/);
  });

  await run('version unchanged in R3', async function() {
    assert.match(read('script-core.js'), /notifications:\s*'20260716\.1'/);
    assert.match(read('scripts/verify-medisa-vehicle-save-invariants.js'), /EXPECTED_NOTIFICATIONS = '20260716\.1'/);
  });

  console.log('');
  console.log('passed=' + passed + ' failed=' + failed);
  process.exit(failed ? 1 : 0);
}

main().catch(function(err) {
  console.error(err);
  process.exit(1);
});
