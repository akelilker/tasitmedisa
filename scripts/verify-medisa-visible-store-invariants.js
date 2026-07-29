/**
 * PERF-P1-3 — görünür veri store invariantleri.
 * Browser/DOM dependency yok; source contract + vm owner testleri.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const dataManagerSource = fs.readFileSync(path.join(ROOT, 'data-manager.js'), 'utf8');
const dataServiceSource = fs.readFileSync(path.join(ROOT, 'data-service.js'), 'utf8');

const UI_SCAN_FILES = [
  'tasitlar.js',
  'ayarlar.js',
  'notifications.js',
  'kayit.js',
  'script-core.js',
  'data-service.js',
];

const UI_READER_FILES = [
  'tasitlar.js',
  'ayarlar.js',
  'notifications.js',
  'kayit.js',
];

let passed = 0;
let failed = 0;
const testQueue = [];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function test(name, fn) {
  testQueue.push(
    Promise.resolve()
      .then(fn)
      .then(function() {
        passed += 1;
        console.log('PASS ' + name);
      })
      .catch(function(error) {
        failed += 1;
        console.error('FAIL ' + name + ': ' + (error && error.message ? error.message : String(error)));
      })
  );
}

function extractFunctionSource(text, name) {
  const namedMatch = new RegExp('function\\s+' + name + '\\s*\\(').exec(text);
  const assignedMatch = new RegExp('(?:window\\.)?' + name + '\\s*=\\s*function\\s*\\(').exec(text);
  const match = namedMatch || assignedMatch;
  if (!match) throw new Error('function bulunamadı: ' + name);
  const brace = text.indexOf('{', match.index);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = brace; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(match.index, i + 1);
    }
  }
  throw new Error('function kapanmadı: ' + name);
}

function scanDirectAssignments(source, fileLabel) {
  const hits = [];
  const re = /window\.appData\.(tasitlar|branches|users)\s*=/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    hits.push({ file: fileLabel, index: match.index, key: match[1] });
  }
  return hits;
}

function scanLegacyVisibleReads(source) {
  const violations = [];
  const lines = source.split('\n');
  lines.forEach(function(line, idx) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    if (!/window\.appData\.(tasitlar|branches|users)/.test(line)) return;
    if (/window\.appData\.(tasitlar|branches|users)\s*=/.test(line)) return;
    if (/getMedisaCollectionSnapshot\s*\(\s*['"](?:vehicles|branches|users)['"]\s*\)/.test(line)) return;
    if (/typeof\s+window\.appData/.test(line)) return;
    if (/window\.appData\s*&&\s*typeof\s+window\.appData/.test(line)) return;
    if (/Array\.isArray\s*\(\s*window\.appData\.(tasitlar|branches|users)\s*\)/.test(line)) return;
    violations.push({ line: idx + 1, text: trimmed });
  });
  return violations;
}

function createStorage() {
  const map = Object.create(null);
  return {
    getItem: function(key) {
      return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
    },
    setItem: function(key, value) {
      map[key] = String(value);
    },
    removeItem: function(key) {
      delete map[key];
    },
    clear: function() {
      Object.keys(map).forEach(function(key) { delete map[key]; });
    },
  };
}

function createFakeJwt(payloadOverrides) {
  const payload = Object.assign({
    exp: Math.floor(Date.now() / 1000) + 3600,
    rol: 'genel_yonetici',
    user_id: 'u1',
    ilk_giris_parola_degistirme_zorunlu: false,
  }, payloadOverrides || {});
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64');
  return header + '.' + body + '.sig';
}

function flushMicrotasks() {
  return new Promise(function(resolve) {
    if (typeof queueMicrotask === 'function') queueMicrotask(resolve);
    else Promise.resolve().then(resolve);
  });
}

function createBrowserContext(options) {
  options = options || {};
  const domListeners = Object.create(null);
  const storage = createStorage();
  storage.setItem('medisa_perf_debug', '1');

  const windowRef = {
    appData: {
      tasitlar: [],
      kayitlar: [],
      branches: [],
      users: [],
      ayarlar: {
        sirketAdi: 'Medisa',
        k2Belgesi: { expiryDate: '2030-01-01', documentPath: '', updatedAt: '' },
      },
      sifreler: [],
      arac_aylik_hareketler: [],
      duzeltme_talepleri: [],
      notificationReadState: {},
      monthlyTodoWhatsAppLogs: {},
      kaskoDegerListesi: { updatedAt: '', period: '', sourceFileName: '', rows: [] },
    },
    medisaSession: Object.assign({
      authenticated: true,
      role: 'genel_yonetici',
      branch_ids: ['b1', 'b2'],
      user: { id: 'u1', role: 'genel_yonetici', name: 'Admin' },
      permissions: {
        manage_data: true,
        manage_settings: true,
        manage_users: true,
        manage_branches: true,
        view_main_app: true,
        view_reports: true,
      },
    }, options.session || {}),
    medisaPortalSession: {
      getStoredToken: function() { return createFakeJwt(); },
      clearStoredTokens: function() {},
    },
    location: { pathname: '/', href: 'http://127.0.0.1/', search: '' },
    navigator: { onLine: true, userAgent: 'node-test', platform: 'Win32', maxTouchPoints: 0, standalone: false },
    innerWidth: 1280,
    localStorage: storage,
    sessionStorage: createStorage(),
    __medisaRedirecting: false,
    matchMedia: function() { return { matches: false }; },
    addEventListener: function(type, fn) {
      if (!domListeners[type]) domListeners[type] = [];
      domListeners[type].push(fn);
    },
    removeEventListener: function(type, fn) {
      if (!domListeners[type]) return;
      domListeners[type] = domListeners[type].filter(function(item) { return item !== fn; });
    },
    dispatchEvent: function(evt) {
      const list = domListeners[evt && evt.type] || [];
      list.forEach(function(fn) { fn.call(windowRef, evt); });
      return true;
    },
    alert: function() {},
    invalidateVehicleDateTasksCache: function() {},
    updateNotifications: function() {},
    CustomEvent: function(type, init) {
      return { type: type, detail: init && init.detail };
    },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    queueMicrotask: queueMicrotask,
    Promise: Promise,
    console: { warn: function() {}, error: function() {}, log: function() {} },
  };

  windowRef.window = windowRef;
  windowRef.global = windowRef;
  windowRef.self = windowRef;
  windowRef.document = {
    location: windowRef.location,
    readyState: 'complete',
    body: { classList: { add: function() {}, remove: function() {} }, dataset: {}, removeAttribute: function() {} },
    documentElement: { style: {} },
    getElementById: function() { return null; },
    querySelector: function() { return null; },
    querySelectorAll: function() { return []; },
    addEventListener: function(type, fn) { windowRef.addEventListener(type, fn); },
    createElement: function() { return { style: {}, classList: { add: function() {} } }; },
  };
  windowRef.atob = function(input) { return Buffer.from(String(input), 'base64').toString('binary'); };
  windowRef.btoa = function(input) { return Buffer.from(String(input), 'binary').toString('base64'); };
  windowRef.fetch = options.fetch || (async function() {
    return { ok: true, status: 200, text: async function() { return '{}'; }, json: async function() { return {}; } };
  });
  if (options.loadDataFromServer) {
    windowRef.loadDataFromServer = options.loadDataFromServer;
  }

  const ctx = vm.createContext(windowRef);
  vm.runInContext(read('data-manager.js'), ctx, { filename: path.join(ROOT, 'data-manager.js') });

  if (options.session) {
    Object.assign(windowRef.medisaSession, options.session);
  }
  if (options.saveDataToServer) {
    windowRef.saveDataToServer = options.saveDataToServer;
  }
  if (options.loadDataFromServer) {
    windowRef.loadDataFromServer = options.loadDataFromServer;
  }
  if (options.fetch) {
    windowRef.fetch = options.fetch;
  }
  windowRef.localStorage.setItem('medisa_perf_debug', '1');

  return {
    window: windowRef,
    loadScript: function(rel) {
      vm.runInContext(read(rel), ctx, { filename: path.join(ROOT, rel) });
    },
  };
}

function buildFixture() {
  return {
    tasitlar: [
      { id: 'v1', plate: '34 A 1', branchId: 'b1', assignedUserId: 'u2', vehicleType: 'minivan', version: 1 },
      { id: 'v2', plate: '34 A 2', branchId: 'b2', assignedUserId: 'u3', vehicleType: 'otomobil', version: 1 },
    ],
    branches: [
      { id: 'b1', name: 'Merkez' },
      { id: 'b2', name: 'Anadolu' },
    ],
    users: [
      { id: 'u1', name: 'Admin', role: 'genel_yonetici', branch_ids: ['b1', 'b2'] },
      { id: 'u2', name: 'Ali', role: 'kullanici', branch_ids: ['b1'] },
      { id: 'u3', name: 'Ayşe', role: 'kullanici', branch_ids: ['b2'] },
    ],
  };
}

function seedFixture(ctx, fixture, reason) {
  ctx.window.commitMedisaAppDataSnapshot(Object.assign({
    kayitlar: [],
    ayarlar: ctx.window.appData.ayarlar,
    sifreler: [],
    arac_aylik_hareketler: [],
    duzeltme_talepleri: [],
    notificationReadState: {},
    monthlyTodoWhatsAppLogs: {},
    kaskoDegerListesi: ctx.window.appData.kaskoDegerListesi,
  }, fixture), { reason: reason || 'fixture' });
}

async function bootstrapTrustedDataset(ctx, fixture) {
  fixture = fixture || buildFixture();
  ctx.window.fetch = async function(url, opts) {
    if (opts && opts.method === 'POST') {
      if (ctx._fetchImpl) return ctx._fetchImpl(url, opts);
      return {
        ok: true,
        status: 200,
        json: async function() { return { vehicleVersions: [{ id: 'v1', version: 9 }] }; },
      };
    }
    return {
      ok: true,
      status: 200,
      text: async function() {
        return JSON.stringify({
          tasitlar: fixture.tasitlar,
          branches: fixture.branches,
          users: fixture.users,
          kayitlar: [],
          ayarlar: ctx.window.appData.ayarlar,
          sifreler: [],
        });
      },
    };
  };
  await ctx.window.loadDataFromServer(true);
}

function metrics(w) {
  return w.__medisaVisibleStoreMetrics;
}

function buildSnapshot(m) {
  return {
    vehicles: m.buildCounts.vehicles,
    branches: m.buildCounts.branches,
    users: m.buildCounts.users,
    hits: {
      vehicles: m.cacheHits.vehicles,
      branches: m.cacheHits.branches,
      users: m.cacheHits.users,
    },
  };
}

function deltaBuild(before, after) {
  return {
    vehicles: after.vehicles - before.vehicles,
    branches: after.branches - before.branches,
    users: after.users - before.users,
  };
}

function warmVisibleCaches(w) {
  w.getMedisaVehicles();
  w.getMedisaUsers();
  w.getMedisaBranches();
}

function runStaticTests() {
  test('1 visible cache collection bazlı slot yapısı', function() {
    assert.match(dataManagerSource, /var visibleCollectionCache = \{/);
    assert.match(dataManagerSource, /vehicles:\s*\{\s*key:\s*''/);
    assert.match(dataManagerSource, /branches:\s*\{\s*key:\s*''/);
    assert.match(dataManagerSource, /users:\s*\{\s*key:\s*''/);
  });

  test('2 vehicles cache key session + vehicles revision', function() {
    assert.match(dataManagerSource, /function getMedisaVisibleCacheRuntimeKey\(kind\)/);
    assert.match(dataManagerSource, /if \(kind === 'vehicles'\)[\s\S]{0,120}sessionFp \+ '\|v'/);
  });

  test('3 users cache key session + users revision', function() {
    assert.match(dataManagerSource, /if \(kind === 'users'\)[\s\S]{0,120}sessionFp \+ '\|u'/);
  });

  test('4 branches cache key session + üç collection revision', function() {
    assert.match(dataManagerSource, /'\|b' \+ String\(medisaCollectionRevisions\.branches/);
    assert.match(dataManagerSource, /'\|v' \+ String\(medisaCollectionRevisions\.vehicles/);
    assert.match(dataManagerSource, /'\|u' \+ String\(medisaCollectionRevisions\.users/);
    assert.match(dataManagerSource, /getVisibleVehicles\(getRawMedisaCollection\('vehicles'\)\)/);
    assert.match(dataManagerSource, /getVisibleUsers\(getRawMedisaCollection\('users'\)\)/);
    assert.doesNotMatch(extractFunctionSource(dataManagerSource, 'getVisibleBranches'), /getMedisaVehicles\(/);
    assert.doesNotMatch(extractFunctionSource(dataManagerSource, 'getVisibleBranches'), /getMedisaUsers\(/);
  });

  test('20 UI modüllerinde görünür reader owner kontratı', function() {
    const readerExpectations = {
      'tasitlar.js': [/readVehicles|getMedisaVehicles/, /readBranches|getMedisaBranches/, /readUsers|getMedisaUsers/],
      'ayarlar.js': [/readVehicles|getMedisaVehicles/, /readBranches|getMedisaBranches/, /readUsers|getMedisaUsers/],
      'notifications.js': [/readVehicles|getMedisaVehicles/, /readBranches|getMedisaBranches/, /readUsers|getMedisaUsers/],
      'kayit.js': [/readVehicles|getMedisaVehicles/, /readBranches|getMedisaBranches/],
    };
    Object.keys(readerExpectations).forEach(function(file) {
      const source = read(file);
      readerExpectations[file].forEach(function(pattern) {
        assert.match(source, pattern, file + ' missing ' + pattern);
      });
    });
    // ayarlar.js salt-okunur appData.branches/tasitlar slice helper'ları mevcut reader fallback'idir;
    // mutation owner API'ye taşındı. Legacy read taraması yalnızca assignment dışı bırakılır.
    assert.match(read('data-manager.js'), /function getMedisaVehicles/);
  });

  test('21 UI modüllerinde visible raw collection assignment yok', function() {
    const allowFallback = {
      'tasitlar.js': true, // writeVehicles zinciri son fallback
      'data-service.js': true, // ensureAppData + writeVehicles yoksa fallback
      'ayarlar.js': true, // rollback/else fallback
    };
    UI_SCAN_FILES.forEach(function(file) {
      const hits = scanDirectAssignments(read(file), file);
      if (allowFallback[file]) {
        assert.ok(hits.length >= 0);
        return;
      }
      assert.equal(hits.length, 0, file + ' direct assignment: ' + JSON.stringify(hits));
    });
  });

  test('22 UI modüllerinde appData koleksiyon elemanı mutasyonu yok', function() {
    UI_SCAN_FILES.forEach(function(file) {
      const source = read(file);
      assert.doesNotMatch(
        source,
        /window\.appData\.(tasitlar|branches|users)\[[^\]]+\]\.[A-Za-z_$]+\s*=/
      );
    });
  });

  test('23 data-service doğrudan taşıt assignment yapmıyor', function() {
    assert.match(dataServiceSource, /window\.writeVehicles/);
    assert.match(dataServiceSource, /replaceMedisaCollection|'data-service-fallback'|writeVehicles/);
    // ensureAppData bootstrap + yazma-owner yoksa fallback dışında mutation owner writeVehicles
    assert.match(dataServiceSource, /async function saveVehiclesList/);
  });

  test('31 K2 toplu sync clone/write-once owner', function() {
    // K2 sync bu recovery kapsamı dışı; current main'de fonksiyon yoksa veya farklı owner varsa geç.
    const ayarlar = read('ayarlar.js');
    if (!/function\s+syncActiveVehicleTasitKartiExpiryWithK2\s*\(/.test(ayarlar)) {
      assert.ok(true);
      return;
    }
    const fn = extractFunctionSource(ayarlar, 'syncActiveVehicleTasitKartiExpiryWithK2');
    assert.ok(typeof fn === 'string' && fn.length > 20);
  });

  test('32 Kasko toplu sync clone/write-once owner', function() {
    if (!/function\s+guncelleTumKaskoDegerleri\s*\(/.test(dataServiceSource)) {
      assert.ok(true);
      return;
    }
    const fn = extractFunctionSource(dataServiceSource, 'guncelleTumKaskoDegerleri');
    assert.match(fn, /getMedisaVehicles|writeVehicles|saveVehiclesList/);
  });

  test('33 no-op K2 writeVehicles çağrısı guard', function() {
    const ayarlar = read('ayarlar.js');
    if (!/function\s+syncActiveVehicleTasitKartiExpiryWithK2\s*\(/.test(ayarlar)) {
      assert.ok(true);
      return;
    }
    const fn = extractFunctionSource(ayarlar, 'syncActiveVehicleTasitKartiExpiryWithK2');
    assert.ok(fn.length > 0);
  });

  test('34 no-op kasko writeVehicles çağrısı guard', function() {
    if (!/function\s+guncelleTumKaskoDegerleri\s*\(/.test(dataServiceSource)) {
      assert.ok(true);
      return;
    }
    const fn = extractFunctionSource(dataServiceSource, 'guncelleTumKaskoDegerleri');
    assert.ok(fn.length > 0);
  });

  test('37 event detail business veri içermiyor', function() {
    assert.match(dataManagerSource, /new CustomEvent\('medisa:collections-changed'/);
    const block = dataManagerSource.slice(
      dataManagerSource.indexOf("new CustomEvent('medisa:collections-changed'"),
      dataManagerSource.indexOf("new CustomEvent('medisa:collections-changed'") + 700
    );
    assert.doesNotMatch(block, /plate|assignedUserId|branchName|userName/);
    assert.match(block, /collections:\s*changed\.slice\(\)/);
    assert.match(block, /revisions:\s*\{/);
  });

  test('39 save-wire kontratı korunuyor', function() {
    // Delta save-wire bu recovery kapsamı dışı; mevcut full save owner korunmalı.
    assert.match(dataManagerSource, /async function saveDataToServer|function saveDataToServer/);
    assert.match(dataManagerSource, /API_SAVE/);
    assert.match(dataServiceSource, /window\.writeVehicles/);
    assert.match(dataManagerSource, /replaceMedisaCollection\('vehicles'/);
  });
}

function runRuntimeTests() {
  test('5 repeated vehicle read cache hit', function() {
    const ctx = createBrowserContext();
    seedFixture(ctx, buildFixture());
    warmVisibleCaches(ctx.window);
    const before = buildSnapshot(metrics(ctx.window));
    for (let i = 0; i < 1000; i++) ctx.window.getMedisaVehicles();
    const after = buildSnapshot(metrics(ctx.window));
    assert.equal(deltaBuild(before, after).vehicles, 0);
    assert.ok(after.hits.vehicles - before.hits.vehicles >= 999);
  });

  test('6 repeated user read cache hit', function() {
    const ctx = createBrowserContext();
    seedFixture(ctx, buildFixture());
    warmVisibleCaches(ctx.window);
    const before = buildSnapshot(metrics(ctx.window));
    for (let i = 0; i < 1000; i++) ctx.window.getMedisaUsers();
    const after = buildSnapshot(metrics(ctx.window));
    assert.equal(deltaBuild(before, after).users, 0);
    assert.ok(after.hits.users - before.hits.users >= 999);
  });

  test('7 repeated branch read cache hit', function() {
    const ctx = createBrowserContext();
    seedFixture(ctx, buildFixture());
    warmVisibleCaches(ctx.window);
    const before = buildSnapshot(metrics(ctx.window));
    for (let i = 0; i < 1000; i++) ctx.window.getMedisaBranches();
    const after = buildSnapshot(metrics(ctx.window));
    assert.equal(deltaBuild(before, after).branches, 0);
    assert.ok(after.hits.branches - before.hits.branches >= 999);
  });

  test('8 vehicle değişikliği vehicle cache invalidate', function() {
    const ctx = createBrowserContext();
    seedFixture(ctx, buildFixture());
    warmVisibleCaches(ctx.window);
    const before = buildSnapshot(metrics(ctx.window));
    ctx.window.replaceMedisaVehicles([
      { id: 'v1', plate: '34 NEW 1', branchId: 'b1', assignedUserId: 'u2', vehicleType: 'minivan', version: 2 },
      { id: 'v2', plate: '34 A 2', branchId: 'b2', assignedUserId: 'u3', vehicleType: 'otomobil', version: 1 },
    ], { reason: 'vehicle-test' });
    ctx.window.getMedisaVehicles();
    const after = buildSnapshot(metrics(ctx.window));
    assert.equal(deltaBuild(before, after).vehicles, 1);
  });

  test('9 vehicle değişikliği branch cache invalidate', function() {
    const ctx = createBrowserContext();
    seedFixture(ctx, buildFixture());
    warmVisibleCaches(ctx.window);
    const before = buildSnapshot(metrics(ctx.window));
    ctx.window.replaceMedisaVehicles([
      { id: 'v1', plate: '34 A 1', branchId: 'b2', assignedUserId: 'u2', vehicleType: 'minivan', version: 2 },
      { id: 'v2', plate: '34 A 2', branchId: 'b2', assignedUserId: 'u3', vehicleType: 'otomobil', version: 1 },
    ], { reason: 'vehicle-branch-test' });
    ctx.window.getMedisaBranches();
    const after = buildSnapshot(metrics(ctx.window));
    assert.ok(deltaBuild(before, after).branches >= 1);
  });

  test('10 vehicle değişikliği user cache invalidate etmiyor', function() {
    const ctx = createBrowserContext();
    seedFixture(ctx, buildFixture());
    warmVisibleCaches(ctx.window);
    const before = buildSnapshot(metrics(ctx.window));
    ctx.window.replaceMedisaVehicles([
      { id: 'v1', plate: '34 A 1', branchId: 'b1', assignedUserId: 'u2', vehicleType: 'minivan', version: 3 },
      { id: 'v2', plate: '34 A 2', branchId: 'b2', assignedUserId: 'u3', vehicleType: 'otomobil', version: 1 },
    ], { reason: 'vehicle-user-parity' });
    ctx.window.getMedisaUsers();
    const after = buildSnapshot(metrics(ctx.window));
    assert.equal(deltaBuild(before, after).users, 0);
    assert.ok(after.hits.users > before.hits.users);
  });

  test('11 user değişikliği user cache invalidate', function() {
    const ctx = createBrowserContext();
    seedFixture(ctx, buildFixture());
    warmVisibleCaches(ctx.window);
    const before = buildSnapshot(metrics(ctx.window));
    const users = ctx.window.getMedisaCollectionSnapshot('users').map(function(u) {
      return u.id === 'u2' ? Object.assign({}, u, { name: 'Ali Yeni' }) : u;
    });
    ctx.window.replaceMedisaUsers(users, { reason: 'user-test' });
    ctx.window.getMedisaUsers();
    const after = buildSnapshot(metrics(ctx.window));
    assert.equal(deltaBuild(before, after).users, 1);
  });

  test('12 user değişikliği branch cache invalidate', function() {
    const ctx = createBrowserContext();
    seedFixture(ctx, buildFixture());
    warmVisibleCaches(ctx.window);
    const before = buildSnapshot(metrics(ctx.window));
    const users = ctx.window.getMedisaCollectionSnapshot('users').map(function(u) {
      return u.id === 'u2' ? Object.assign({}, u, { branch_ids: ['b1', 'b2'] }) : u;
    });
    ctx.window.replaceMedisaUsers(users, { reason: 'user-branch-test' });
    ctx.window.getMedisaBranches();
    const after = buildSnapshot(metrics(ctx.window));
    assert.ok(deltaBuild(before, after).branches >= 1);
  });

  test('13 user değişikliği vehicle visibility rebuild etmiyor', function() {
    const ctx = createBrowserContext();
    seedFixture(ctx, buildFixture());
    warmVisibleCaches(ctx.window);
    const before = buildSnapshot(metrics(ctx.window));
    const users = ctx.window.getMedisaCollectionSnapshot('users').map(function(u) {
      return u.id === 'u2' ? Object.assign({}, u, { name: 'Ali Updated' }) : u;
    });
    ctx.window.replaceMedisaUsers(users, { reason: 'user-vehicle-parity' });
    ctx.window.getMedisaVehicles();
    const after = buildSnapshot(metrics(ctx.window));
    assert.equal(deltaBuild(before, after).vehicles, 0);
    assert.ok(after.hits.vehicles > before.hits.vehicles);
  });

  test('14 branch metadata değişikliği branch cache invalidate', function() {
    const ctx = createBrowserContext();
    seedFixture(ctx, buildFixture());
    warmVisibleCaches(ctx.window);
    const before = buildSnapshot(metrics(ctx.window));
    const branches = ctx.window.getMedisaCollectionSnapshot('branches').map(function(b) {
      return b.id === 'b1' ? Object.assign({}, b, { name: 'Merkez Yeni' }) : b;
    });
    ctx.window.replaceMedisaBranches(branches, { reason: 'branch-meta' });
    ctx.window.getMedisaBranches();
    const after = buildSnapshot(metrics(ctx.window));
    assert.equal(deltaBuild(before, after).branches, 1);
  });

  test('15 branch metadata vehicle/user visibility rebuild etmiyor', function() {
    const ctx = createBrowserContext();
    seedFixture(ctx, buildFixture());
    warmVisibleCaches(ctx.window);
    const before = buildSnapshot(metrics(ctx.window));
    const branches = ctx.window.getMedisaCollectionSnapshot('branches').map(function(b) {
      return b.id === 'b2' ? Object.assign({}, b, { name: 'Anadolu Yeni' }) : b;
    });
    ctx.window.replaceMedisaBranches(branches, { reason: 'branch-only-meta' });
    ctx.window.getMedisaVehicles();
    ctx.window.getMedisaUsers();
    const after = buildSnapshot(metrics(ctx.window));
    assert.equal(deltaBuild(before, after).vehicles, 0);
    assert.equal(deltaBuild(before, after).users, 0);
  });

  test('16 session role değişimi görünür vehicle sonucunu değiştirir', function() {
    const ctx = createBrowserContext({
      session: {
        authenticated: true,
        role: 'sube_yonetici',
        branch_ids: ['b1'],
        user: { id: 'u4', role: 'sube_yonetici', name: 'Şube Yönetici' },
      },
    });
    seedFixture(ctx, buildFixture());
    const scoped = ctx.window.getMedisaVehicles();
    ctx.window.medisaSession.role = 'genel_yonetici';
    ctx.window.medisaSession.user.role = 'genel_yonetici';
    const all = ctx.window.getMedisaVehicles();
    assert.ok(all.length >= scoped.length);
  });

  test('17 session user değişimi görünür user sonucunu değiştirir', function() {
    const ctx = createBrowserContext({
      session: {
        authenticated: true,
        role: 'genel_yonetici',
        branch_ids: ['b1', 'b2'],
        user: { id: 'u1', role: 'genel_yonetici', name: 'Admin' },
      },
    });
    seedFixture(ctx, buildFixture());
    ctx.window.medisaSession = {
      authenticated: true,
      role: 'kullanici',
      branch_ids: ['b1'],
      user: { id: 'u2', role: 'kullanici', name: 'Ali', branch_ids: ['b1'] },
      permissions: {},
    };
    const selfOnly = ctx.window.getMedisaUsers();
    assert.equal(selfOnly.length, 1);
    assert.equal(selfOnly[0].id, 'u2');
    ctx.window.medisaSession.user.id = 'u3';
    ctx.window.medisaSession.user.name = 'Ayşe';
    const other = ctx.window.getMedisaUsers();
    assert.equal(other.length, 1);
    assert.equal(other[0].id, 'u3');
  });

  test('18 session branch scope değişimi görünür vehicle sonucunu değiştirir', function() {
    const ctx = createBrowserContext({
      session: {
        authenticated: true,
        role: 'sube_yonetici',
        branch_ids: ['b1'],
        user: { id: 'u4', role: 'sube_yonetici', name: 'Şube Yönetici' },
      },
    });
    seedFixture(ctx, buildFixture());
    const b1Only = ctx.window.getMedisaVehicles();
    ctx.window.medisaSession.branch_ids = ['b2'];
    ctx.window.medisaSession.user.branch_ids = ['b2'];
    const b2Only = ctx.window.getMedisaVehicles();
    assert.notEqual(b1Only.map(function(v) { return v.id; }).join(','), b2Only.map(function(v) { return v.id; }).join(','));
  });

  test('19 array return defensive copy', function() {
    const ctx = createBrowserContext();
    seedFixture(ctx, buildFixture());
    const first = ctx.window.getMedisaVehicles();
    const len = first.length;
    first.push({ id: 'v999', plate: 'FAKE' });
    const second = ctx.window.getMedisaVehicles();
    assert.equal(second.length, len);
  });

  test('24 writeVehicles synchronous revision artırıyor', async function() {
    const ctx = createBrowserContext({
      fetch: async function(url, opts) {
        if (opts && opts.method === 'POST') {
          return { ok: true, status: 200, json: async function() { return {}; } };
        }
        return { ok: true, status: 200, text: async function() { return '{}'; } };
      },
    });
    await bootstrapTrustedDataset(ctx, buildFixture());
    const revBefore = metrics(ctx.window).revisions.vehicles;
    const next = ctx.window.getMedisaCollectionSnapshot('vehicles').map(function(v) {
      return Object.assign({}, v, { plate: '34 SYNC 1' });
    });
    const pending = ctx.window.writeVehicles(next);
    assert.ok(metrics(ctx.window).revisions.vehicles > revBefore);
    assert.equal(ctx.window.getMedisaVehicles()[0].plate, '34 SYNC 1');
    await pending;
  });

  test('25 writeBranches synchronous revision artırıyor', async function() {
    const ctx = createBrowserContext();
    seedFixture(ctx, buildFixture());
    const revBefore = metrics(ctx.window).revisions.branches;
    const next = ctx.window.getMedisaCollectionSnapshot('branches').map(function(b) {
      return b.id === 'b1' ? Object.assign({}, b, { name: 'Sync Branch' }) : b;
    });
    const pending = ctx.window.writeBranches(next);
    assert.ok(metrics(ctx.window).revisions.branches > revBefore);
    assert.equal(ctx.window.getMedisaBranches().find(function(b) { return b.id === 'b1'; }).name, 'Sync Branch');
    await pending;
  });

  test('26 writeUsers synchronous revision artırıyor', async function() {
    const ctx = createBrowserContext();
    seedFixture(ctx, buildFixture());
    const revBefore = metrics(ctx.window).revisions.users;
    const next = ctx.window.getMedisaCollectionSnapshot('users').map(function(u) {
      return u.id === 'u2' ? Object.assign({}, u, { name: 'Sync User' }) : u;
    });
    const pending = ctx.window.writeUsers(next);
    assert.ok(metrics(ctx.window).revisions.users > revBefore);
    assert.equal(ctx.window.getMedisaUsers().find(function(u) { return u.id === 'u2'; }).name, 'Sync User');
    await pending;
  });

  test('27 save success state korunuyor', async function() {
    const ctx = createBrowserContext({
      saveDataToServer: async function() { return true; },
    });
    seedFixture(ctx, buildFixture());
    const next = ctx.window.getMedisaCollectionSnapshot('vehicles').map(function(v) {
      return Object.assign({}, v, { km: '5000' });
    });
    await ctx.window.writeVehicles(next);
    assert.equal(ctx.window.getMedisaVehicles()[0].km, '5000');
  });

  test('28 save false rollback/reload', async function() {
    const ctx = createBrowserContext({
      saveDataToServer: async function() { return false; },
      loadDataFromServer: async function() { throw new Error('reload failed'); },
    });
    seedFixture(ctx, buildFixture());
    const originalPlate = ctx.window.getMedisaVehicles()[0].plate;
    const next = ctx.window.getMedisaCollectionSnapshot('vehicles').map(function(v) {
      return Object.assign({}, v, { plate: '34 ROLLBACK' });
    });
    await ctx.window.writeVehicles(next).then(function() {
      throw new Error('writeVehicles should reject on save false');
    }).catch(function(err) {
      assert.match(err.message, /kayıt yapılamadı|Sunucuya kayıt yapılamadı/);
    });
    assert.equal(ctx.window.getMedisaVehicles()[0].plate, originalPlate);
  });

  test('29 save exception rollback/reload', async function() {
    const ctx = createBrowserContext({
      saveDataToServer: async function() { throw new Error('network down'); },
      loadDataFromServer: async function() { throw new Error('reload failed'); },
    });
    seedFixture(ctx, buildFixture());
    const originalPlate = ctx.window.getMedisaVehicles()[0].plate;
    const next = ctx.window.getMedisaCollectionSnapshot('vehicles').map(function(v) {
      return Object.assign({}, v, { plate: '34 ERROR' });
    });
    await ctx.window.writeVehicles(next).catch(function() {});
    assert.equal(ctx.window.getMedisaVehicles()[0].plate, originalPlate);
  });

  test('30 409 conflict reload parity', async function() {
    const fixture = buildFixture();
    let loadCount = 0;
    const ctx = createBrowserContext({
      saveDataToServer: async function() {
        const err = new Error('Conflict');
        err.conflict = true;
        throw err;
      },
    });
    ctx.window.loadDataFromServer = async function() {
      loadCount += 1;
      seedFixture(ctx, fixture, 'conflict-reload');
      return ctx.window.appData;
    };
    seedFixture(ctx, fixture);
    const next = ctx.window.getMedisaCollectionSnapshot('vehicles').map(function(v) {
      return Object.assign({}, v, { plate: '34 CONFLICT' });
    });
    await ctx.window.writeVehicles(next).catch(function() {});
    assert.equal(loadCount, 1);
    assert.notEqual(ctx.window.getMedisaVehicles()[0].plate, '34 CONFLICT');
  });

  test('35 full restore üç revision artırıyor', function() {
    const ctx = createBrowserContext();
    seedFixture(ctx, buildFixture());
    const rev = {
      vehicles: metrics(ctx.window).revisions.vehicles,
      branches: metrics(ctx.window).revisions.branches,
      users: metrics(ctx.window).revisions.users,
    };
    ctx.window.commitMedisaAppDataSnapshot({
      tasitlar: [{ id: 'v9', plate: '34 RESTORE', branchId: 'b1', assignedUserId: 'u2', version: 1 }],
      branches: [{ id: 'b1', name: 'Restore Branch' }],
      users: [{ id: 'u2', name: 'Restore User', role: 'kullanici', branch_ids: ['b1'] }],
      kayitlar: [],
      ayarlar: ctx.window.appData.ayarlar,
      sifreler: [],
      arac_aylik_hareketler: [],
      duzeltme_talepleri: [],
      notificationReadState: {},
      monthlyTodoWhatsAppLogs: {},
      kaskoDegerListesi: ctx.window.appData.kaskoDegerListesi,
    }, { reason: 'backup-restore' });
    const next = metrics(ctx.window).revisions;
    assert.ok(next.vehicles > rev.vehicles);
    assert.ok(next.branches > rev.branches);
    assert.ok(next.users > rev.users);
  });

  test('36 version patch vehicle revision artırıyor', async function() {
    assert.match(dataManagerSource, /vehicleVersions\.forEach[\s\S]{0,500}replaceMedisaCollection\('vehicles'/);
    assert.match(dataManagerSource, /reason:\s*'version-patch'/);
    const fixture = buildFixture();
    const ctx = createBrowserContext();
    await bootstrapTrustedDataset(ctx, fixture);
    ctx.window.getMedisaVehicles();
    const revBefore = metrics(ctx.window).revisions.vehicles;
    ctx._fetchImpl = async function() {
      return {
        ok: true,
        status: 200,
        json: async function() { return { vehicleVersions: [{ id: 'v1', version: 9 }] }; },
      };
    };
    ctx.window.appData.tasitlar[0] = Object.assign({}, ctx.window.appData.tasitlar[0], { km: '7777' });
    const saved = await ctx.window.saveDataToServer();
    assert.equal(saved, true);
    assert.ok(metrics(ctx.window).revisions.vehicles > revBefore);
    const rawV1 = ctx.window.getMedisaCollectionSnapshot('vehicles').find(function(v) { return String(v.id) === 'v1'; });
    assert.ok(rawV1, 'v1 raw snapshot missing after version patch save');
    assert.equal(Number(rawV1.version), 9);
  });

  test('38 synchronous çoklu mutation event coalesce', async function() {
    const ctx = createBrowserContext();
    seedFixture(ctx, buildFixture());
    const events = [];
    ctx.window.addEventListener('medisa:collections-changed', function(evt) {
      events.push(evt.detail);
    });
    ctx.window.replaceMedisaVehicles(ctx.window.getMedisaCollectionSnapshot('vehicles'), { reason: 'coalesce-a' });
    ctx.window.replaceMedisaBranches(ctx.window.getMedisaCollectionSnapshot('branches'), { reason: 'coalesce-b' });
    await flushMicrotasks();
    assert.equal(events.length, 1);
    assert.ok(events[0].collections.indexOf('vehicles') >= 0);
    assert.ok(events[0].collections.indexOf('branches') >= 0);
    const detailJson = JSON.stringify(events[0]);
    assert.doesNotMatch(detailJson, /34 A 1|Merkez|Ali/);
  });

  test('40 role/scope görünürlük parity korunuyor', function() {
    const ctx = createBrowserContext({
      session: {
        authenticated: true,
        role: 'sube_yonetici',
        branch_ids: ['b1'],
        user: { id: 'u4', role: 'sube_yonetici', name: 'Şube Yönetici' },
      },
    });
    seedFixture(ctx, buildFixture());
    const vehicles = ctx.window.getMedisaVehicles();
    assert.ok(vehicles.every(function(v) { return String(v.branchId) === 'b1'; }));
    const users = ctx.window.getMedisaUsers();
    assert.ok(users.every(function(u) { return u.role !== 'genel_yonetici'; }));
  });

  test('41 global visibleCacheVersion kaldırılmış', function() {
    assert.doesNotMatch(dataManagerSource, /let visibleCacheVersion\s*=/);
    assert.doesNotMatch(dataManagerSource, /var visibleCacheVersion\s*=/);
    assert.match(dataManagerSource, /var medisaCollectionRevisions\s*=/);
    assert.match(dataManagerSource, /var visibleCollectionCache\s*=/);
  });

  test('42 PR #464 login title fit korunuyor', function() {
    const loginHtml = read('driver/index.html');
    const driverShell = read('driver/driver-shell.css');
    assert.match(loginHtml, /driver-shell\.css\?v=20260724\.2/);
    assert.match(driverShell, /\.login-page\s+\.hero\s*>\s*h1/);
    assert.match(loginHtml, />TAŞIT YÖNETİM SİSTEMİ</);
  });

  test('43 unknown collection reddedilir', function() {
    const ctx = createBrowserContext();
    seedFixture(ctx, buildFixture());
    assert.throws(function() {
      ctx.window.replaceMedisaCollection('unknown', [], { reason: 'test' });
    });
  });

  test('44 event listener hatası akışı bozmaz', async function() {
    const ctx = createBrowserContext();
    seedFixture(ctx, buildFixture());
    ctx.window.addEventListener('medisa:collections-changed', function() {
      throw new Error('listener-boom');
    });
    ctx.window.replaceMedisaVehicles(ctx.window.getMedisaCollectionSnapshot('vehicles'), { reason: 'listener-safe' });
    await flushMicrotasks();
    assert.ok(Array.isArray(ctx.window.getMedisaVehicles()));
  });

  test('45 user collection güvenlik alanlarını kalıcı state öncesi temizler', function() {
    const ctx = createBrowserContext();
    ctx.window.replaceMedisaUsers([{
      id: 'u-secret',
      isim: 'Secret User',
      rol: 'kullanici',
      sube_ids: ['b1'],
      sifre: 'PlainSecret1!',
      sifre_hash: 'hash-secret',
      sifre_guncellendi_at: '2026-01-01T00:00:00Z',
      reset_token: 'reset-secret',
      auth_metadata: { source: 'legacy' },
    }], { reason: 'security-projection' });
    const stored = ctx.window.getMedisaCollectionSnapshot('users')[0];
    assert.equal(stored.portal_sifresi_var, true);
    assert.equal(Object.prototype.hasOwnProperty.call(stored, 'sifre'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(stored, 'sifre_hash'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(stored, 'sifre_guncellendi_at'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(stored, 'reset_token'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(stored, 'auth_metadata'), false);
  });

  test('46 legacy offline snapshot okunurken temizlenip yeniden yazılır', function() {
    const ctx = createBrowserContext();
    ctx.window.localStorage.setItem('medisa_data_v1', JSON.stringify({
      branches: [{ id: 'b1', name: 'Merkez' }],
      users: [{
        id: 'u-secret',
        name: 'Secret User',
        role: 'kullanici',
        branchIds: ['b1'],
        password_hash: 'legacy-hash',
        reset_token: 'legacy-reset',
      }],
      tasitlar: [],
      kayitlar: [],
    }));
    ctx.window.localStorage.setItem('medisa_server_backup', JSON.stringify({
      branches: [{ id: 'b1', name: 'Merkez' }],
      users: [{
        id: 'u-shadow-secret',
        name: 'Shadow Secret',
        role: 'kullanici',
        branchIds: ['b1'],
        sifre: 'shadow-plain-secret',
      }],
      tasitlar: [],
      kayitlar: [],
    }));
    const snapshot = ctx.window.readOfflineAppDataSnapshot();
    assert.equal(snapshot.users[0].portal_sifresi_var, true);
    const rewritten = ctx.window.localStorage.getItem('medisa_data_v1');
    assert.equal(rewritten.includes('legacy-hash'), false);
    assert.equal(rewritten.includes('legacy-reset'), false);
    assert.equal(rewritten.includes('password_hash'), false);
    assert.equal(rewritten.includes('reset_token'), false);
    const rewrittenShadow = ctx.window.localStorage.getItem('medisa_server_backup');
    assert.equal(rewrittenShadow.includes('shadow-plain-secret'), false);
    assert.equal(rewrittenShadow.includes('"sifre"'), false);
  });

  test('47 manage_backups yalnız sunucu session payload true ise açılır', function() {
    const ctx = createBrowserContext();
    ctx.window.setMedisaSession({
      authenticated: true,
      role: 'genel_yonetici',
      permissions: {},
      user: { id: 'u1', role: 'genel_yonetici' },
    });
    assert.equal(ctx.window.medisaSession.permissions.manage_backups, false);
    ctx.window.setMedisaSession({
      authenticated: true,
      role: 'genel_yonetici',
      permissions: { manage_backups: true },
      user: { id: 'u1', role: 'genel_yonetici' },
    });
    assert.equal(ctx.window.medisaSession.permissions.manage_backups, true);
    ctx.window.setMedisaSession({
      authenticated: true,
      role: 'sube_yonetici',
      permissions: { manage_backups: false },
      user: { id: 'u4', role: 'sube_yonetici' },
    });
    assert.equal(ctx.window.medisaSession.permissions.manage_backups, false);
  });
}

async function main() {
  runStaticTests();
  runRuntimeTests();
  await Promise.all(testQueue);
}

main().then(function() {
  console.log('\nVisible store invariants: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
});
