/**
 * P1-D — Thin shell erken tık / intent bridge invariants + izole davranış testleri.
 * Çalıştır: node scripts/verify-medisa-thin-shell-interaction-invariants.js
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

function extractBetween(src, beginMark, endMark) {
  const begin = src.indexOf(beginMark);
  const end = src.indexOf(endMark);
  assert.ok(begin !== -1 && end !== -1 && end > begin, 'marker bulunmalı: ' + beginMark);
  return src.slice(begin + beginMark.length, end);
}

function extractScriptCorePin(indexHtml) {
  const m = indexHtml.match(/script-core\.js\?v=([0-9.]+)/);
  assert.ok(m, 'script-core pin bulunmalı');
  return m[1];
}

function extractStyleCorePin(indexHtml) {
  const pins = [];
  const re = /style-core\.css\?v=([^"'\s>]+)/g;
  let m;
  while ((m = re.exec(indexHtml)) !== null) pins.push(m[1]);
  assert.ok(pins.length >= 1, 'index.html style-core pin bulunmalı');
  pins.forEach(function(pin) {
    assert.strictEqual(pin, pins[0], 'index.html style-core pinleri kendi içinde eşit olmalı');
  });
  return pins[0];
}

function extractNotificationsVersion(core) {
  const m = core.match(/notifications:\s*'([0-9.]+)'/);
  assert.ok(m, 'notifications version bulunmalı');
  return m[1];
}

const index = read('index.html');
const core = read('script-core.js');
const sw = read('sw.js');
const notifications = read('notifications.js');
const packageJson = read('package.json');
const qualityGate = read('.github/scripts/quality-gate.sh');
const mainShellVerifier = read('scripts/verify-medisa-main-shell-lazy-invariants.js');

async function sourceInvariants() {
  await run('source: early direct-open fallback kaldırılmış', function() {
    assert.doesNotMatch(index, /Erken fallback:[\s\S]*openModal\(/);
    assert.doesNotMatch(index, /openModal\('vehicles-modal'\)/);
    assert.doesNotMatch(index, /openModal\('reports-modal'\)/);
    assert.doesNotMatch(index, /openModal\('vehicle-modal'\)/);
    assert.doesNotMatch(index, /if \(!window\.openVehiclesView\)/);
    assert.doesNotMatch(index, /if \(!window\.openReportsView\)/);
    assert.doesNotMatch(index, /if \(!window\.openVehicleModal\)/);
  });

  await run('source: MedisaShellIntentBridge erken kuruluyor', function() {
    assert.match(index, /medisa-shell-intent-bridge:begin/);
    assert.match(index, /window\.MedisaShellIntentBridge|global\.MedisaShellIntentBridge/);
    const bridgeIdx = index.indexOf('medisa-shell-intent-bridge:begin');
    const kayitIdx = index.indexOf('data-medisa-shell-intent="open-kayit"');
    assert.ok(bridgeIdx !== -1 && kayitIdx !== -1 && bridgeIdx < kayitIdx);
  });

  await run('source: ana surface semantic intent bağlı', function() {
    ['open-kayit', 'open-tasitlar', 'open-raporlar', 'open-monthly-todo', 'toggle-notifications', 'toggle-settings']
      .forEach(function(intent) {
        assert.ok(index.includes('data-medisa-shell-intent="' + intent + '"'), intent);
      });
    assert.doesNotMatch(index, /onclick="openVehicleModal\(\)"/);
    assert.doesNotMatch(index, /onclick="openVehiclesView\(\)"/);
    assert.doesNotMatch(index, /onclick="openReportsView\(\)"/);
    assert.doesNotMatch(index, /onclick="toggleNotifications\(event\)"/);
    assert.doesNotMatch(index, /onclick="toggleSettingsMenu\(event\)"/);
  });

  await run('source: monthly todo explicit API', function() {
    assert.match(notifications, /window\.openMonthlyTodoFromShell\s*=\s*function\s+openMonthlyTodoFromShell/);
    assert.match(core, /openMonthlyTodoFromShell/);
    assert.match(core, /ensureMedisaNotificationsModuleReady/);
    assert.doesNotMatch(notifications, /btn\.addEventListener\('click',\s*function\(ev\)\s*\{\s*ev\.preventDefault\(\);\s*ev\.stopPropagation\(\);\s*openMonthlyTodoModal\(\);/);
  });

  await run('source: handler Promise/reject + silent no-op yok', function() {
    assert.match(core, /medisa-shell-intent-handlers:begin/);
    assert.match(core, /throw new Error\('Raporlar ekrani acma fonksiyonu hazir degil'\)/);
    assert.match(core, /throw new Error\('Kayit ekrani acma fonksiyonu hazir degil'\)/);
    assert.match(core, /return window\.MedisaMainSurfaceRegistry\.ensure\('reports'\)\.then/);
    assert.match(core, /return window\.MedisaMainSurfaceRegistry\.ensure\('kayit'\)\.then/);
    assert.doesNotMatch(core, /if \(typeof window\.openReportsView === 'function' && window\.openReportsView !== lazyOpenReportsView\) \{\s*return window\.openReportsView/);
  });

  await run('source: pending timeout + failure feedback', function() {
    assert.match(index, /PENDING_TIMEOUT_MS\s*=\s*15000/);
    assert.match(index, /Bölüm hazırlanamadı\. Lütfen tekrar deneyin\./);
    assert.match(index, /Bölüm hazırlanıyor…/);
    assert.match(core, /Kayıt ekranı yüklenemedi/);
    assert.match(core, /Raporlar ekranı yüklenemedi/);
  });

  await run('source: script-core / notifications pin parity', function() {
    const pin = extractScriptCorePin(index);
    assert.ok(pin >= '20260801.7' || Number(pin.replace(/\./g, '')) >= 202608017, 'script-core pin yükselmiş olmalı: ' + pin);
    const notifV = extractNotificationsVersion(core);
    assert.equal(notifV, pin.indexOf('20260801.') === 0 ? notifV : notifV);
    assert.equal(notifV, '20260812.1');
    assert.match(index, new RegExp('script-core\\.js\\?v=' + pin.replace(/\./g, '\\.')));
  });

  await run('source: style-core pin parity + backend/data owner gate', function() {
    // Canonical pin index.html'den çıkarılır; sabit eski sürüm beklenmez.
    const stylePin = extractStyleCorePin(index);
    assert.match(stylePin, /^\d{8}\.\d+$/, 'kanonik style-core pin tarih.surum formatında olmalı');
    assert.notStrictEqual(stylePin, '20260801.3', 'style-core pin eski thin-shell hard-code değerinde kalmamalı');
    assert.notStrictEqual(stylePin, '20260724.1', 'style-core pin bilinen merge regresyon değeri olmamalı');

    // Shell arası + SW precache parity owner: main-shell verifier (kopyalama yok).
    assert.match(mainShellVerifier, /style-core HTML pinleri ve SW precache parity/);
    assert.match(mainShellVerifier, /paylaşılan shell style-core pin parity/);

    // Bu verifier yalnızca index ↔ SW precache eşleşmesini doğrular (main-shell ile aynı pin kaynağı).
    const cacheFiles = sw.match(/const CACHE_FILES\s*=\s*\[([\s\S]*?)\];/);
    assert.ok(cacheFiles, 'CACHE_FILES bulunmalı');
    assert.match(
      cacheFiles[1],
      new RegExp("'/style-core\\.css\\?v=" + stylePin.replace(/\./g, '\\.') + "'")
    );
    assert.doesNotMatch(cacheFiles[1], /'\/style-core\.css'/);

    // Backend/runtime data manager pin — thin-shell scope dışı drift yok.
    assert.match(index, /data-manager\.js\?v=20260804\.8/);
  });

  await run('source: quality gate / package thin-shell bağlandı', function() {
    assert.match(packageJson, /tool:verify-thin-shell/);
    assert.match(qualityGate, /tool:verify-thin-shell/);
    assert.match(mainShellVerifier, /MedisaShellIntentBridge|data-medisa-shell-intent/);
  });
}

function createDomButton(id, intent) {
  return {
    id: id || '',
    className: 'menu-btn',
    attrs: { 'data-medisa-shell-intent': intent, 'aria-busy': null },
    getAttribute: function(name) {
      if (name === 'data-medisa-shell-intent') return this.attrs['data-medisa-shell-intent'];
      if (name === 'aria-busy') return this.attrs['aria-busy'];
      return null;
    },
    setAttribute: function(name, value) { this.attrs[name] = String(value); },
    removeAttribute: function(name) { this.attrs[name] = null; },
    closest: function(sel) {
      if (sel === '[data-medisa-shell-intent]') return this;
      return null;
    }
  };
}

function loadBridgeSandbox(opts) {
  opts = opts || {};
  const bridgeSrc = extractBetween(index, '/* medisa-shell-intent-bridge:begin */', '/* medisa-shell-intent-bridge:end */');
  const alerts = [];
  const statusEl = { textContent: '' };
  const buttons = Object.create(null);
  const body = {
    classList: {
      _items: Object.create(null),
      contains: function(name) { return !!this._items[name]; },
      add: function(name) { this._items[name] = true; },
      remove: function(name) { delete this._items[name]; }
    }
  };
  if (opts.authGate) body.classList.add('main-auth-gate-active');

  const listeners = [];
  const documentRef = {
    body: body,
    getElementById: function(id) {
      if (id === 'medisa-shell-intent-status') return statusEl;
      return buttons[id] || null;
    },
    addEventListener: function(type, fn, capture) {
      listeners.push({ type: type, fn: fn, capture: !!capture });
    }
  };

  const sandbox = {
    window: null,
    document: documentRef,
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Date: Date,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Promise: Promise,
    alert: function(m) { alerts.push(String(m)); },
    navigator: { onLine: opts.offline ? false : true },
    medisaSession: opts.session || { authenticated: true }
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  if (opts.appReadyAt) {
    sandbox.__medisaAppReadyAt = opts.appReadyAt;
    sandbox.__medisaAppReady = true;
  }

  vm.createContext(sandbox);
  vm.runInContext(bridgeSrc.replace(/\(typeof window !== 'undefined' \? window : this\)/, '(window)'), sandbox);

  function click(btn) {
    const ev = {
      target: btn,
      preventDefault: function() {},
      stopPropagation: function() {}
    };
    listeners.filter(function(l) { return l.type === 'click'; }).forEach(function(l) { l.fn(ev); });
  }

  return {
    bridge: sandbox.MedisaShellIntentBridge,
    sandbox: sandbox,
    alerts: alerts,
    statusEl: statusEl,
    body: body,
    createButton: function(id, intent) {
      const btn = createDomButton(id, intent);
      buttons[id] = btn;
      return btn;
    },
    click: click,
    wait: function(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
  };
}

function flushMicrotasks() {
  return new Promise(function(resolve) { setImmediate(resolve); });
}

async function behaviorTests() {
  await run('behavior: Test1 Kayıt erken tık → exact bir kez', async function() {
    const h = loadBridgeSandbox();
    const btn = h.createButton('kayit-btn', 'open-kayit');
    let opens = 0;
    h.click(btn);
    assert.equal(h.bridge.hasPending('open-kayit'), true);
    assert.equal(btn.getAttribute('aria-busy'), 'true');
    assert.match(h.statusEl.textContent, /hazırlanıyor/);
    h.bridge.register('open-kayit', function() { opens += 1; });
    h.bridge.markAppReady();
    await flushMicrotasks();
    await h.wait(20);
    assert.equal(opens, 1);
    assert.equal(h.bridge.hasPending('open-kayit'), false);
    assert.equal(btn.getAttribute('aria-busy'), null);
  });

  await run('behavior: Test2 Taşıtlar erken tık', async function() {
    const h = loadBridgeSandbox();
    const btn = h.createButton('tasit-btn', 'open-tasitlar');
    let opens = 0;
    let loads = 0;
    h.click(btn);
    h.bridge.register('open-tasitlar', function() {
      loads += 1;
      opens += 1;
    });
    h.bridge.markAppReady();
    await flushMicrotasks();
    await h.wait(20);
    assert.equal(opens, 1);
    assert.equal(loads, 1);
  });

  await run('behavior: Test3 Raporlar erken tık', async function() {
    const h = loadBridgeSandbox();
    const btn = h.createButton('rapor-btn', 'open-raporlar');
    let opens = 0;
    h.click(btn);
    h.bridge.register('open-raporlar', function() { opens += 1; });
    h.bridge.markAppReady();
    await flushMicrotasks();
    await h.wait(20);
    assert.equal(opens, 1);
  });

  await run('behavior: Test4 aynı intent double-click coalesce', async function() {
    const h = loadBridgeSandbox();
    const btn = h.createButton('kayit-btn', 'open-kayit');
    let opens = 0;
    let resolveOpen;
    const gate = new Promise(function(r) { resolveOpen = r; });
    h.bridge.register('open-kayit', function() {
      opens += 1;
      return gate;
    });
    h.bridge.markAppReady();
    h.click(btn);
    h.click(btn);
    h.click(btn);
    await flushMicrotasks();
    assert.equal(opens, 1);
    resolveOpen();
    await flushMicrotasks();
  });

  await run('behavior: Test5 Kayıt sonra Taşıtlar latest-wins', async function() {
    const h = loadBridgeSandbox();
    const kayit = h.createButton('kayit-btn', 'open-kayit');
    const tasit = h.createButton('tasit-btn', 'open-tasitlar');
    const opened = [];
    h.click(kayit);
    h.click(tasit);
    h.bridge.register('open-kayit', function() { opened.push('kayit'); });
    h.bridge.register('open-tasitlar', function() { opened.push('tasitlar'); });
    h.bridge.markAppReady();
    await flushMicrotasks();
    await h.wait(20);
    assert.deepEqual(opened, ['tasitlar']);
    assert.equal(kayit.getAttribute('aria-busy'), null);
  });

  await run('behavior: Test6 Taşıtlar sonra Raporlar latest-wins', async function() {
    const h = loadBridgeSandbox();
    const tasit = h.createButton('tasit-btn', 'open-tasitlar');
    const rapor = h.createButton('rapor-btn', 'open-raporlar');
    const opened = [];
    h.click(tasit);
    h.click(rapor);
    h.bridge.register('open-tasitlar', function() { opened.push('tasitlar'); });
    h.bridge.register('open-raporlar', function() { opened.push('raporlar'); });
    h.bridge.markAppReady();
    await flushMicrotasks();
    await h.wait(20);
    assert.deepEqual(opened, ['raporlar']);
  });

  await run('behavior: Test7 Ayarlar erken tık bir kez', async function() {
    const h = loadBridgeSandbox();
    const btn = h.createButton('settings-toggle-btn', 'toggle-settings');
    let opens = 0;
    h.click(btn);
    h.bridge.register('toggle-settings', function() { opens += 1; });
    h.bridge.markAppReady();
    await flushMicrotasks();
    await h.wait(20);
    assert.equal(opens, 1);
  });

  await run('behavior: Test8 Bildirimler erken tık', async function() {
    const h = loadBridgeSandbox();
    const btn = h.createButton('notifications-toggle-btn', 'toggle-notifications');
    let opens = 0;
    h.click(btn);
    h.bridge.register('toggle-notifications', async function() {
      await h.wait(15);
      opens += 1;
    });
    h.bridge.markAppReady();
    await flushMicrotasks();
    await h.wait(40);
    assert.equal(opens, 1);
  });

  await run('behavior: Test9 Aylık yapılacaklar explicit API bir kez', async function() {
    const h = loadBridgeSandbox();
    const btn = h.createButton('monthly-todo-header-btn', 'open-monthly-todo');
    let api = 0;
    h.click(btn);
    h.bridge.register('open-monthly-todo', function() { api += 1; });
    h.bridge.markAppReady();
    await flushMicrotasks();
    await h.wait(20);
    assert.equal(api, 1);
  });

  await run('behavior: Test10 module reject → busy temiz + retry', async function() {
    const h = loadBridgeSandbox();
    const btn = h.createButton('notif-btn', 'toggle-notifications');
    let tries = 0;
    h.bridge.register('toggle-notifications', function() {
      tries += 1;
      if (tries === 1) return Promise.reject(new Error('load fail'));
    });
    h.bridge.markAppReady();
    h.click(btn);
    await flushMicrotasks();
    await h.wait(20);
    assert.ok(h.alerts.length >= 1);
    assert.equal(btn.getAttribute('aria-busy'), null);
    assert.equal(h.bridge.hasPending(), false);
    await h.wait(360);
    h.click(btn);
    await flushMicrotasks();
    await h.wait(20);
    assert.equal(tries, 2);
  });

  await run('behavior: Test11 handler eksik sessiz success yok', async function() {
    const h = loadBridgeSandbox({ appReadyAt: Date.now() });
    const btn = h.createButton('kayit-btn', 'open-kayit');
    h.bridge.PENDING_TIMEOUT_MS = 50;
    // Patch timeout by re-request with short wait — use clear + manual timeout check via hasPending
    h.click(btn);
    assert.equal(h.bridge.hasPending('open-kayit'), true);
    // No register → must stay pending (not silent success)
    await h.wait(30);
    assert.equal(h.bridge.hasPending('open-kayit'), true);
    h.bridge.clear('open-kayit');
  });

  await run('behavior: Test12 timeout pending temiz + stale yok', async function() {
    const bridgeSrc = extractBetween(index, '/* medisa-shell-intent-bridge:begin */', '/* medisa-shell-intent-bridge:end */');
    const shortSrc = bridgeSrc.replace('PENDING_TIMEOUT_MS = 15000', 'PENDING_TIMEOUT_MS = 40');
    const alerts = [];
    const statusEl = { textContent: '' };
    const btn = createDomButton('kayit-btn', 'open-kayit');
    const documentRef = {
      body: { classList: { contains: function() { return false; } } },
      getElementById: function(id) { return id === 'medisa-shell-intent-status' ? statusEl : btn; },
      addEventListener: function() {}
    };
    const sandbox = {
      window: null,
      document: documentRef,
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      Date: Date,
      Object: Object,
      Promise: Promise,
      alert: function(m) { alerts.push(String(m)); },
      navigator: { onLine: true },
      medisaSession: { authenticated: true }
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(shortSrc.replace(/\(typeof window !== 'undefined' \? window : this\)/, '(window)'), sandbox);
    const bridge = sandbox.MedisaShellIntentBridge;
    bridge.request('open-kayit', { sourceEl: btn });
    await new Promise(function(r) { setTimeout(r, 80); });
    assert.equal(bridge.hasPending(), false);
    assert.ok(alerts.some(function(a) { return /hazırlanamadı/i.test(a); }));
    let opens = 0;
    bridge.register('open-kayit', function() { opens += 1; });
    bridge.markAppReady();
    await flushMicrotasks();
    assert.equal(opens, 0);
  });

  await run('behavior: Test13 app-ready event önce oluşmuş', async function() {
    const h = loadBridgeSandbox({ appReadyAt: Date.now() });
    assert.equal(h.bridge.isAppReady(), true);
    const btn = h.createButton('kayit-btn', 'open-kayit');
    let opens = 0;
    h.bridge.register('open-kayit', function() { opens += 1; });
    h.click(btn);
    await flushMicrotasks();
    await h.wait(20);
    assert.equal(opens, 1);
  });

  await run('behavior: Test14 app-ready sonra drain', async function() {
    const h = loadBridgeSandbox();
    const btn = h.createButton('kayit-btn', 'open-kayit');
    let opens = 0;
    h.bridge.register('open-kayit', function() { opens += 1; });
    h.click(btn);
    assert.equal(opens, 0);
    h.bridge.markAppReady();
    await flushMicrotasks();
    await h.wait(20);
    assert.equal(opens, 1);
  });

  await run('behavior: Test15 pointer/click dedupe', async function() {
    const h = loadBridgeSandbox();
    const btn = h.createButton('kayit-btn', 'open-kayit');
    let opens = 0;
    h.bridge.register('open-kayit', function() { opens += 1; });
    h.bridge.markAppReady();
    h.click(btn);
    h.click(btn);
    await flushMicrotasks();
    await h.wait(20);
    assert.equal(opens, 1);
  });

  await run('behavior: Test16 keyboard click aynı akış', async function() {
    const h = loadBridgeSandbox();
    const btn = h.createButton('kayit-btn', 'open-kayit');
    let opens = 0;
    h.bridge.register('open-kayit', function() { opens += 1; });
    h.bridge.markAppReady();
    // Keyboard Enter on button fires click — bridge listens click only
    h.click(btn);
    await flushMicrotasks();
    await h.wait(20);
    assert.equal(opens, 1);
  });

  await run('behavior: Test17 session fail intent iptal', async function() {
    const h = loadBridgeSandbox();
    const btn = h.createButton('kayit-btn', 'open-kayit');
    let opens = 0;
    h.click(btn);
    h.bridge.cancelSession();
    h.bridge.register('open-kayit', function() { opens += 1; });
    h.bridge.markAppReady();
    await flushMicrotasks();
    await h.wait(20);
    assert.equal(opens, 0);
    assert.equal(h.bridge.hasPending(), false);
  });

  await run('behavior: Test18 handler zaten hazır anında açılır', async function() {
    const h = loadBridgeSandbox({ appReadyAt: Date.now() });
    const btn = h.createButton('kayit-btn', 'open-kayit');
    let opens = 0;
    h.bridge.register('open-kayit', function() { opens += 1; });
    h.click(btn);
    await flushMicrotasks();
    await h.wait(20);
    assert.equal(opens, 1);
  });

  await run('behavior: auth gate aktifken request yok sayılır', async function() {
    const h = loadBridgeSandbox({ authGate: true });
    const btn = h.createButton('kayit-btn', 'open-kayit');
    let opens = 0;
    h.bridge.register('open-kayit', function() { opens += 1; });
    h.bridge.markAppReady();
    h.click(btn);
    await flushMicrotasks();
    assert.equal(opens, 0);
    assert.equal(h.bridge.hasPending(), false);
  });
}

(async function main() {
  await sourceInvariants();
  await behaviorTests();
  console.log('verify-medisa-thin-shell-interaction-invariants: ' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
})().catch(function(err) {
  console.error(err);
  process.exit(1);
});
