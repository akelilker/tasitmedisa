/**
 * Driver cold-path vs lazy-feature dependency gate.
 * Lazy feature declaration set ∩ dashboard-core bare refs → allowlist dışı FAIL.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const core = read('driver/driver-dashboard-core.js');
const bootstrap = read('driver/driver-script.js');
const featureFiles = {
  history: read('driver/driver-feature-history.js'),
  documents: read('driver/driver-feature-documents.js'),
  feedback: read('driver/driver-feature-feedback.js'),
  password: read('driver/driver-feature-password.js'),
  actions: read('driver/driver-feature-actions.js')
};

function decls(src) {
  const names = new Set();
  const re = /(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let m;
  while ((m = re.exec(src))) names.add(m[1]);
  return names;
}

function proxyAllowlist(src) {
  const names = new Set();
  for (const m of src.matchAll(/install(?:Proxy|CoreProxy)\(\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g)) {
    names.add(m[1]);
  }
  return names;
}

function hasBareCall(src, name) {
  const re = new RegExp('\\b' + name + '\\s*\\(', 'g');
  let m;
  while ((m = re.exec(src))) {
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    const lineEnd = src.indexOf('\n', m.index);
    const line = src.slice(lineStart, lineEnd === -1 ? src.length : lineEnd);
    if (/onclick\s*=/.test(line)) continue;
    if (/onchange\s*=/.test(line)) continue;
    if (/\bh\./.test(line) || /helpers\./.test(line) || /runtime\.helpers\./.test(line)) continue;
    if (/typeof\s+window\./.test(line) || /window\./.test(line)) continue;
    if (/function\s+/.test(line) && line.indexOf('function') < line.indexOf(name)) continue;
    return true;
  }
  return false;
}

const coreDecls = decls(core);
const bootDecls = decls(bootstrap);
const proxies = proxyAllowlist(bootstrap);
const helpersPublish = /bindDriverDashboardTitleCase\s*:\s*bindDriverDashboardTitleCase/.test(bootstrap)
  && /function\s+bindDriverDashboardTitleCase\s*\(/.test(bootstrap);

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('PASS ' + name);
  } catch (error) {
    failed += 1;
    console.error('FAIL ' + name + ': ' + error.message);
  }
}

test('bindDriverDashboardTitleCase bootstrap helper olarak tanımlı ve publish', () => {
  assert.equal((bootstrap.match(/function\s+bindDriverDashboardTitleCase\s*\(/g) || []).length, 1);
  assert.ok(helpersPublish);
  assert.match(bootstrap, /data-driver-titlecase-bound/);
});

test('History feature bindDriverDashboardTitleCase declaration içermez', () => {
  assert.doesNotMatch(featureFiles.history, /function\s+bindDriverDashboardTitleCase\s*\(/);
});

test('Dashboard core helperı runtime.helpers üzerinden çözer', () => {
  assert.match(core, /var bindDriverDashboardTitleCase = h && h\.bindDriverDashboardTitleCase/);
  assert.match(core, /MedisaDriverRuntime dashboard titlecase helper eksik/);
  assert.doesNotMatch(core, /function\s+bindDriverDashboardTitleCase\s*\(/);
});

const unresolved = [];
for (const [feat, src] of Object.entries(featureFiles)) {
  for (const name of decls(src)) {
    if (coreDecls.has(name) || bootDecls.has(name)) continue;
    if (proxies.has(name)) continue;
    if (!hasBareCall(core, name)) continue;
    unresolved.push({ name, feat });
  }
}

test('Lazy feature cold bare-call unresolved = 0', () => {
  assert.equal(
    unresolved.length,
    0,
    'unresolved=' + unresolved.map((x) => x.name + '@' + x.feat).join(', ')
  );
});

test('Eski titlecase cold bağımlılığı yakalanır (kontrakt)', () => {
  // Regression probe: if declaration moved back to history-only and core bare-calls remain, fail.
  const historyHas = /function\s+bindDriverDashboardTitleCase\s*\(/.test(featureFiles.history);
  const bootHas = /function\s+bindDriverDashboardTitleCase\s*\(/.test(bootstrap);
  const coreBare = hasBareCall(core, 'bindDriverDashboardTitleCase');
  assert.equal(historyHas, false);
  assert.equal(bootHas, true);
  assert.equal(coreBare, true); // core still calls helper local binding from h.*
});

console.log('\nDriver cold dependencies: ' + passed + ' passed, ' + failed + ' failed');
if (unresolved.length) {
  console.log('UNRESOLVED ' + unresolved.map((x) => x.name + '@' + x.feat).join(', '));
}
process.exit(failed ? 1 : 0);
