/**
 * PERF-P0-1-R2 — firstSeenDates retention / legacy / parser / abort.
 * Çalıştır: node scripts/verify-notification-first-seen-retention.js
 *
 * Davranış testleri notifications.js içindeki gerçek pure helper kaynaklarını
 * kontrollü biçimde çıkarıp vm içinde çalıştırır (kopya implementasyon yok).
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execSync } = require('node:child_process');

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

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function run(name, fn) {
  try {
    fn();
    ok(name);
  } catch (err) {
    fail(name, err);
  }
}

function extractFunctionSource(src, fnName) {
  const startRe = new RegExp('function\\s+' + fnName + '\\s*\\(');
  const startMatch = startRe.exec(src);
  if (!startMatch) {
    throw new Error('function not found: ' + fnName);
  }
  let i = startMatch.index;
  const braceStart = src.indexOf('{', i);
  if (braceStart < 0) throw new Error('brace start missing for ' + fnName);
  let depth = 0;
  let inStr = null;
  let escape = false;
  for (let p = braceStart; p < src.length; p++) {
    const ch = src[p];
    if (inStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return src.slice(i, p + 1);
      }
    }
  }
  throw new Error('function body not closed: ' + fnName);
}

function loadProductionFirstSeenHelpers() {
  const src = read('notifications.js');
  const constMatch = src.match(/const\s+NOTIF_STATE_MAX_KEYS\s*=\s*(\d+)\s*;/);
  const ageMatch = src.match(/const\s+NOTIF_STATE_MAX_AGE_MS\s*=\s*([^;]+);/);
  if (!constMatch || !ageMatch) {
    throw new Error('NOTIF_STATE constants not found in notifications.js');
  }
  const helpers = [
    extractFunctionSource(src, 'parseNotificationFirstSeenMs'),
    extractFunctionSource(src, 'areFirstSeenDatesMapsEqual'),
    extractFunctionSource(src, 'normalizeFirstSeenDatesMap')
  ].join('\n');
  const code = [
    'var NOTIF_STATE_MAX_KEYS = ' + constMatch[1] + ';',
    'var NOTIF_STATE_MAX_AGE_MS = ' + ageMatch[1] + ';',
    helpers,
    'result = {',
    '  parseNotificationFirstSeenMs: parseNotificationFirstSeenMs,',
    '  areFirstSeenDatesMapsEqual: areFirstSeenDatesMapsEqual,',
    '  normalizeFirstSeenDatesMap: normalizeFirstSeenDatesMap,',
    '  NOTIF_STATE_MAX_KEYS: NOTIF_STATE_MAX_KEYS,',
    '  NOTIF_STATE_MAX_AGE_MS: NOTIF_STATE_MAX_AGE_MS',
    '};'
  ].join('\n');
  const sandbox = { result: null };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'notifications-firstseen-helpers.js' });
  if (!sandbox.result || typeof sandbox.result.parseNotificationFirstSeenMs !== 'function') {
    throw new Error('failed to load production helpers into vm');
  }
  return sandbox.result;
}

const helpers = loadProductionFirstSeenHelpers();
const parseNotificationFirstSeenMs = helpers.parseNotificationFirstSeenMs;
const areFirstSeenDatesMapsEqual = helpers.areFirstSeenDatesMapsEqual;
const normalizeFirstSeenDatesMap = helpers.normalizeFirstSeenDatesMap;
const NOTIF_STATE_MAX_KEYS = helpers.NOTIF_STATE_MAX_KEYS;
const NOTIF_STATE_MAX_AGE_MS = helpers.NOTIF_STATE_MAX_AGE_MS;

run('production helpers extracted from notifications.js', function() {
  assert.equal(typeof parseNotificationFirstSeenMs, 'function');
  assert.equal(typeof normalizeFirstSeenDatesMap, 'function');
  assert.equal(NOTIF_STATE_MAX_KEYS, 500);
  assert.ok(NOTIF_STATE_MAX_AGE_MS > 0);
  const src = read('scripts/verify-notification-first-seen-retention.js');
  assert.doesNotMatch(src, /function parseNotificationFirstSeenMs\(value\) \{/);
  assert.doesNotMatch(src, /function normalizeFirstSeenDatesMap\(rawMap, activeKeys\) \{/);
  assert.doesNotMatch(src, /git diff -- script-core\.js/);
});

run('source wiring R2', function() {
  const notif = read('notifications.js');
  const core = read('core.php');
  const save = read('save.php');
  assert.match(notif, /completed:\s*false/);
  assert.match(notif, /function abortNotificationFirstSeenBatch\(/);
  assert.match(notif, /flushNotificationFirstSeenBatch\(firstSeenBatchSucceeded\)/);
  assert.match(notif, /getFullYear\(\) !== year/);
  assert.match(core, /function medisaNotificationProjectFirstSeenDates\(/);
  assert.match(core, /DateTimeImmutable::getLastErrors\(/);
  assert.doesNotMatch(core, /strtotime\(\$raw\)/);
  assert.match(save, /medisaNotificationProjectFirstSeenDates\(/);
  assert.match(save, /legacyNeedsFirstSeenClear/);
  assert.match(save, /'firstSeenDates' => \[\]/);
});

run('8.1 versions still aligned (no dirty-tree git diff test)', function() {
  assert.match(read('script-core.js'), /notifications:\s*'20260716\.1'/);
  assert.match(read('scripts/verify-medisa-vehicle-save-invariants.js'), /EXPECTED_NOTIFICATIONS = '20260716\.1'/);
});

run('8.7/9.1 client: 600 active + 300 passive', function() {
  const now = Date.now();
  const input = {};
  const active = {};
  for (let i = 0; i < 600; i++) {
    const key = 'active|' + String(i).padStart(4, '0');
    input[key] = String(now - (120 * 24 * 60 * 60 * 1000) - i);
    active[key] = true;
  }
  for (let j = 0; j < 300; j++) {
    input['passive|' + String(j).padStart(4, '0')] = String(now - j * 1000);
  }
  const out = normalizeFirstSeenDatesMap(input, active);
  assert.equal(Object.keys(out).length, 600);
  assert.equal(out['passive|0000'], undefined);
  assert.equal(out['active|0000'], input['active|0000']);
});

run('8.2-8.3-8.7 PHP legacy/resolve harness', function() {
  const out = execSync('php scripts/verify-notification-first-seen-retention-php.php', {
    cwd: ROOT,
    encoding: 'utf8'
  });
  assert.match(out, /PASS 8\.7 normalize keeps 600/);
  assert.match(out, /PASS 8\.2 pruned legacy-old removed/);
  assert.match(out, /PASS 8\.3 legacy timestamp ownership preserved/);
  assert.match(out, /PASS 8\.2 reload projection does not resurrect/);
  assert.match(out, /PHP_RETENTION_OK/);
});

run('8.4 failed-render abort wiring', function() {
  const src = read('notifications.js');
  assert.match(src, /let firstSeenBatchSucceeded = false/);
  assert.match(src, /notifFirstSeenBatchContext\.completed = true/);
  assert.match(src, /firstSeenBatchSucceeded = true/);
  assert.match(src, /flushNotificationFirstSeenBatch\(firstSeenBatchSucceeded\)/);
  assert.match(src, /function abortNotificationFirstSeenBatch\(/);
  assert.match(src, /state\[batch\.scopeKey\] = cloneNotificationScopeState\(batch\.previousScoped\)/);
});

run('8.4 abort behavior with production normalize', function() {
  // Simulate: only 3 of 10 active collected → if prune ran, old actives past retention would drop.
  // Abort path must leave map untouched (tested via source + normalize contract).
  const now = Date.now();
  const old = String(now - (120 * 24 * 60 * 60 * 1000));
  const input = {};
  const allActive = {};
  for (let i = 0; i < 10; i++) {
    const k = 'a|' + i;
    input[k] = old;
    allActive[k] = true;
  }
  const partialActive = { 'a|0': true, 'a|1': true, 'a|2': true };
  const prunedPartial = normalizeFirstSeenDatesMap(input, partialActive);
  assert.equal(Object.keys(prunedPartial).length, 3, 'partial active would prune others');
  const prunedFull = normalizeFirstSeenDatesMap(input, allActive);
  assert.equal(Object.keys(prunedFull).length, 10, 'full active keeps all');
  assert.ok(areFirstSeenDatesMapsEqual(prunedFull, input));
});

run('8.5 badge finally isolation wiring', function() {
  const src = read('notifications.js');
  assert.match(
    src,
    /try \{\s*updateMonthlyTodoHeaderBadge\(\);\s*\} catch \(badgeErr\)/
  );
  assert.match(
    src,
    /try \{\s*flushNotificationFirstSeenBatch\(firstSeenBatchSucceeded\);\s*\} catch \(flushErr\)/
  );
  assert.match(src, /notifFirstSeenBatchContext = null/);
});

run('8.6 JS/PHP parser parity', function() {
  const phpOut = execSync('php scripts/verify-notification-first-seen-retention-php.php', {
    cwd: ROOT,
    encoding: 'utf8'
  });
  const begin = phpOut.search(/PARITY_BEGIN\r?\n/);
  const end = phpOut.search(/PARITY_END\r?\n/);
  assert.ok(begin >= 0 && end > begin);
  const beginLineEnd = phpOut.indexOf('\n', begin) + 1;
  const rows = phpOut.slice(beginLineEnd, end).split(/\r?\n/).filter(function(row) {
    return row.length > 0;
  });
  assert.ok(rows.length >= 10);
  rows.forEach(function(row) {
    const tab = row.indexOf('\t');
    assert.ok(tab > 0, 'parity row format: ' + JSON.stringify(row));
    const phpOk = row.slice(0, tab) === '1';
    const value = row.slice(tab + 1);
    const jsOk = parseNotificationFirstSeenMs(value) > 0;
    assert.equal(jsOk, phpOk, 'parity mismatch for ' + JSON.stringify(value) + ' js=' + jsOk + ' php=' + phpOk);
  });
});

run('8.8 scope isolation source contract', function() {
  const save = read('save.php');
  assert.match(save, /\$userLegacyKey = \$scopeDescriptor\['userLegacyKey'\]/);
  assert.match(save, /\$data\['notificationReadState'\]\[\$userLegacyKey\]/);
  assert.doesNotMatch(save, /foreach \(\$data\['notificationReadState'\] as/);
});

run('idempotent production normalize', function() {
  const now = Date.now();
  const input = { a: String(now), b: String(now - 1000) };
  const active = { a: true };
  const once = normalizeFirstSeenDatesMap(input, active);
  const twice = normalizeFirstSeenDatesMap(once, active);
  assert.ok(areFirstSeenDatesMapsEqual(once, twice));
});

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
