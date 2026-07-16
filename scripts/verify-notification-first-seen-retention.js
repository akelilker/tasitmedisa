/**
 * PERF-P0-1-R1 — firstSeenDates retention / cross-layer / rollback sözleşmesi.
 * Çalıştır: node scripts/verify-notification-first-seen-retention.js
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const NOTIF_STATE_MAX_KEYS = 500;
const NOTIF_STATE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

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

function parseNotificationFirstSeenMs(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '-') return 0;
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (isFinite(n) && n > 0) return n < 1000000000000 ? n * 1000 : n;
  }
  const trMatch = raw.match(/^(\d{2})[./-](\d{2})[./-](\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (trMatch) {
    const day = Number(trMatch[1]);
    const month = Number(trMatch[2]);
    const year = Number(trMatch[3]);
    const hour = trMatch[4] != null ? Number(trMatch[4]) : 0;
    const minute = trMatch[5] != null ? Number(trMatch[5]) : 0;
    const dt = new Date(year, month - 1, day, hour, minute, 0, 0);
    if (!isNaN(dt.getTime())) return dt.getTime();
  }
  const parsed = Date.parse(raw);
  return isNaN(parsed) ? 0 : parsed;
}

function areFirstSeenDatesMapsEqual(a, b) {
  const left = (a && typeof a === 'object' && !Array.isArray(a)) ? a : {};
  const right = (b && typeof b === 'object' && !Array.isArray(b)) ? b : {};
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (let i = 0; i < leftKeys.length; i++) {
    const key = leftKeys[i];
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
    if (String(left[key]) !== String(right[key])) return false;
  }
  return true;
}

function normalizeFirstSeenDatesMap(rawMap, activeKeys) {
  const out = {};
  if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return out;
  const active = (activeKeys && typeof activeKeys === 'object' && !Array.isArray(activeKeys))
    ? activeKeys
    : null;
  const now = Date.now();
  const entries = [];
  const rawKeys = Object.keys(rawMap);
  for (let i = 0; i < rawKeys.length; i++) {
    const rawKey = rawKeys[i];
    const normalizedKey = String(rawKey || '').trim();
    if (!normalizedKey) continue;
    const rawVal = rawMap[rawKey];
    if (rawVal == null || typeof rawVal === 'object') continue;
    const normalizedDate = String(rawVal).trim();
    if (!normalizedDate) continue;
    const ms = parseNotificationFirstSeenMs(normalizedDate);
    if (!(ms > 0) || !isFinite(ms)) continue;
    entries.push({
      key: normalizedKey,
      value: normalizedDate,
      ms: ms,
      index: i,
      isActive: !!(active && active[normalizedKey])
    });
  }
  if (!active) {
    for (let j = 0; j < entries.length; j++) out[entries[j].key] = entries[j].value;
    return out;
  }
  const activeEntries = [];
  const inactiveEntries = [];
  for (let k = 0; k < entries.length; k++) {
    const entry = entries[k];
    if (entry.isActive) {
      activeEntries.push(entry);
      continue;
    }
    if ((now - entry.ms) <= NOTIF_STATE_MAX_AGE_MS) inactiveEntries.push(entry);
  }
  activeEntries.sort(function(a, b) {
    if (a.key < b.key) return -1;
    if (a.key > b.key) return 1;
    return a.index - b.index;
  });
  inactiveEntries.sort(function(a, b) {
    if (a.ms !== b.ms) return b.ms - a.ms;
    if (a.key < b.key) return -1;
    if (a.key > b.key) return 1;
    return a.index - b.index;
  });
  for (let aIdx = 0; aIdx < activeEntries.length; aIdx++) {
    out[activeEntries[aIdx].key] = activeEntries[aIdx].value;
  }
  const remaining = Math.max(0, NOTIF_STATE_MAX_KEYS - activeEntries.length);
  for (let iIdx = 0; iIdx < inactiveEntries.length && iIdx < remaining; iIdx++) {
    out[inactiveEntries[iIdx].key] = inactiveEntries[iIdx].value;
  }
  return out;
}

function run(name, fn) {
  try {
    fn();
    ok(name);
  } catch (err) {
    fail(name, err);
  }
}

run('source wiring', function() {
  const notif = read('notifications.js');
  const core = read('core.php');
  const save = read('save.php');
  assert.match(notif, /function normalizeFirstSeenDatesMap\(rawMap,\s*activeKeys\)/);
  assert.match(notif, /function applyNotificationFirstSeenPruneInBatch\(/);
  assert.match(notif, /notificationScopeRollbackQuiet/);
  assert.match(notif, /try \{[\s\S]*updateNotifications[\s\S]*\} finally \{[\s\S]*notificationScopeRollbackQuiet = false/);
  assert.match(core, /function medisaNotificationResolveFirstSeenDates\(/);
  assert.match(core, /function medisaNotificationFirstSeenEmergencyMaxKeys\(/);
  assert.match(core, /return 20000/);
  assert.doesNotMatch(core, /count\(\$entries\) > 500/);
  assert.match(save, /medisaNotificationResolveFirstSeenDates\(/);
  assert.match(save, /medisaNotificationFirstSeenMapsEqual\(/);
  assert.match(save, /Semantik no-op/);
  assert.doesNotMatch(save, /if \(!array_key_exists\(\$notifKey, \$firstSeenDates\)\)/);
});

run('9.1 client: 600 active + 300 passive', function() {
  const now = Date.now();
  const input = {};
  const active = {};
  for (let i = 0; i < 600; i++) {
    const key = 'active|' + String(i).padStart(4, '0');
    const val = String(now - (120 * 24 * 60 * 60 * 1000) - i);
    input[key] = val;
    active[key] = true;
  }
  for (let j = 0; j < 300; j++) {
    input['passive|' + String(j).padStart(4, '0')] = String(now - j * 1000);
  }
  const out = normalizeFirstSeenDatesMap(input, active);
  assert.equal(Object.keys(out).length, 600);
  assert.equal(out['passive|0000'], undefined);
  assert.equal(out['active|0000'], input['active|0000']);
  assert.equal(out['active|0599'], input['active|0599']);
});

run('9.2 cross-layer: PHP keeps 600 after resolve', function() {
  const out = execSync('php scripts/verify-notification-first-seen-retention-php.php', {
    cwd: ROOT,
    encoding: 'utf8'
  });
  assert.match(out, /PASS 9\.2 normalize keeps 600/);
  assert.match(out, /PASS 9\.2 resolve keeps 600/);
  assert.match(out, /PHP_RETENTION_OK/);
});

run('9.3-9.5-9.8-9.9 covered by PHP harness', function() {
  const out = execSync('php scripts/verify-notification-first-seen-retention-php.php', {
    cwd: ROOT,
    encoding: 'utf8'
  });
  assert.match(out, /PASS 9\.2\/9\.3 server timestamp ownership/);
  assert.match(out, /PASS 9\.4 new client key accepted/);
  assert.match(out, /PASS 9\.5 pruned key stays deleted/);
  assert.match(out, /PASS 9\.8 malformed dropped/);
  assert.match(out, /PASS 9\.9 resolve idempotent/);
});

run('9.6 scope isolation source contract', function() {
  const save = read('save.php');
  assert.match(save, /\$allowedScopeKeys = \$scopeDescriptor\['saveAllowedKeys'\]/);
  assert.match(
    save,
    /if \(!array_key_exists\(\$allowedScopeKey, \$incomingReadState\) \|\| !is_array\(\$incomingReadState\[\$allowedScopeKey\]\)\) continue;/
  );
});

run('9.7 missing scope not wiped — continue guard present', function() {
  const save = read('save.php');
  const block = save.slice(save.indexOf('foreach ($allowedScopeKeys'), save.indexOf('monthlyTodoWhatsAppLogs'));
  assert.match(block, /continue;/);
  assert.doesNotMatch(block, /unset\(\$data\['notificationReadState'\]/);
});

run('scenario4 inactive within retention', function() {
  const ms = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const key = 'passive|keep';
  const out = normalizeFirstSeenDatesMap({ [key]: String(ms) }, {});
  assert.equal(out[key], String(ms));
});

run('scenario5 capacity newest inactive', function() {
  const now = Date.now();
  const input = {};
  for (let i = 0; i < 600; i++) {
    input['cap|' + String(i).padStart(4, '0')] = String(now - i * 1000);
  }
  const out = normalizeFirstSeenDatesMap(input, {});
  assert.equal(Object.keys(out).length, NOTIF_STATE_MAX_KEYS);
  assert.ok(out['cap|0000']);
  assert.equal(out['cap|0599'], undefined);
});

run('scenario7 invalid dropped', function() {
  const out = normalizeFirstSeenDatesMap({
    '': '1',
    ok: String(Date.now()),
    empty: '',
    obj: { a: 1 },
    arr: [1],
    bad: 'not-a-date',
    neg: '-5',
    nan: 'NaN',
    inf: 'Infinity'
  }, {});
  assert.equal(Object.keys(out).length, 1);
  assert.ok(out.ok);
});

run('9.10 rollback quiet try\/finally + non-sticky', function() {
  const src = read('notifications.js');
  assert.match(src, /notificationScopeRollbackQuiet = true/);
  assert.match(src, /finally \{\s*notificationScopeRollbackQuiet = false;\s*\}/);
  assert.match(src, /if \(notificationScopeRollbackQuiet\) return;/);
  // Quiet only gates save path; flag reset in finally so later real saves work.
  const quietReturns = (src.match(/if \(notificationScopeRollbackQuiet\) return;/g) || []).length;
  assert.ok(quietReturns >= 1);
});

run('idempotent client normalize', function() {
  const now = Date.now();
  const input = {};
  const active = {};
  for (let i = 0; i < 10; i++) {
    const k = 'id|' + i;
    input[k] = String(now - i * 1000);
    if (i < 3) active[k] = true;
  }
  const a = normalizeFirstSeenDatesMap(input, active);
  const b = normalizeFirstSeenDatesMap(a, active);
  assert.ok(areFirstSeenDatesMapsEqual(a, b));
});

run('version 20260716.1', function() {
  assert.match(read('script-core.js'), /notifications:\s*'20260716\.1'/);
  assert.match(read('scripts/verify-medisa-vehicle-save-invariants.js'), /EXPECTED_NOTIFICATIONS = '20260716\.1'/);
});

run('script-core functional diff is version-only', function() {
  const diff = execSync('git diff -- script-core.js', { cwd: ROOT, encoding: 'utf8' });
  assert.match(diff, /notifications: '20260712\.3'/);
  assert.match(diff, /notifications: '20260716\.1'/);
  const contentLines = diff.split(/\r?\n/).filter(function(l) {
    return /^[+-]/.test(l) && !/^[+-]{3}/.test(l);
  });
  assert.equal(contentLines.length, 2, 'expected exactly 2 content diff lines, got ' + contentLines.length);
});

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
