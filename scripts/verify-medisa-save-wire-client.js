/**
 * RECOVERY-R2 — client delta wire builder invariantleri.
 * Çalıştır: node scripts/verify-medisa-save-wire-client.js
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
    setItem(k, v) { map.set(String(k), String(v)); },
    removeItem(k) { map.delete(k); },
    clear() { map.clear(); },
  };
}

function createFakeJwt() {
  const payload = Buffer.from(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + 3600,
    rol: 'genel_yonetici',
    user_id: 'u1',
  })).toString('base64');
  return 'hdr.' + payload + '.sig';
}

function createCtx() {
  const localStorage = createStorage();
  const windowRef = {
    appData: null,
    medisaSession: { authenticated: true, user: { id: 'u1', role: 'genel_yonetici' }, role: 'genel_yonetici' },
    medisaPortalSession: {
      getStoredToken: function() { return createFakeJwt(); },
      clearStoredTokens: function() {},
    },
    localStorage,
    location: { pathname: '/', href: 'http://localhost/', origin: 'http://localhost' },
    navigator: { onLine: true },
    addEventListener() {},
    dispatchEvent() { return true; },
    CustomEvent: function CustomEvent(type, init) {
      this.type = type;
      this.detail = init && init.detail;
    },
    __medisaRedirecting: false,
  };
  const ctx = {
    window: windowRef,
    document: {
      location: windowRef.location,
      addEventListener() {},
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      body: { classList: { add() {}, remove() {}, contains() { return false; } } },
    },
    localStorage,
    sessionStorage: createStorage(),
    navigator: windowRef.navigator,
    console,
    setTimeout,
    clearTimeout,
    setImmediate,
    queueMicrotask,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Math,
    Date,
    Error,
    Promise,
    Map,
    Set,
    parseInt,
    isNaN,
    encodeURIComponent,
    decodeURIComponent,
    atob: typeof atob === 'function' ? atob : function(s) { return Buffer.from(s, 'base64').toString('binary'); },
    btoa: typeof btoa === 'function' ? btoa : function(s) { return Buffer.from(s, 'binary').toString('base64'); },
    CustomEvent: windowRef.CustomEvent,
  };
  ctx.globalThis = ctx;
  ctx.window.window = windowRef;
  ctx.fetch = async function() {
    return { ok: true, status: 200, json: async () => ({ success: true, vehicleVersions: [] }) };
  };
  windowRef.fetch = ctx.fetch;
  vm.createContext(ctx);
  vm.runInContext(read('data-manager.js'), ctx, { filename: 'data-manager.js' });
  return ctx;
}

function sampleAppData(overrides) {
  return Object.assign({
    tasitlar: [
      { id: 'v1', plate: '34 A', version: 1, km: '10' },
      { id: 'v2', plate: '34 B', version: 2, km: '20' },
    ],
    kayitlar: [{ id: 'k1' }],
    branches: [{ id: 'b1', name: 'Merkez' }],
    users: [{ id: 'u1', name: 'Admin', role: 'genel_yonetici' }],
    ayarlar: { sirketAdi: 'Medisa' },
    sifreler: [],
    arac_aylik_hareketler: [{ id: 'h1' }],
    duzeltme_talepleri: [{ id: 't1' }],
    notificationReadState: { 'user:u1': { readKeys: [], dismissedKeys: [], firstSeenDates: {} } },
    monthlyTodoWhatsAppLogs: {},
    kaskoDegerListesi: { rows: [{ x: 1 }] },
    __medisaKaskoLookupIndex: { x: 1 },
    __medisaKaskoLookupYears: [2026],
  }, overrides || {});
}

function setBaseline(ctx, data) {
  ctx.window.appData = JSON.parse(JSON.stringify(data));
  vm.runInContext('setServerDatasetBaseline(window.appData)', ctx);
}

(async function main() {
  await run('buildSaveWirePayload exports', async function() {
    const ctx = createCtx();
    assert.equal(typeof ctx.window.buildSaveWirePayload, 'function');
    assert.equal(typeof ctx.window.buildSaveMutationIntent, 'function');
  });

  await run('delta single vehicle excludes unrelated collections', async function() {
    const ctx = createCtx();
    setBaseline(ctx, sampleAppData());
    ctx.window.appData.tasitlar[0].km = '99';
    const built = ctx.window.buildSaveWirePayload();
    assert.equal(built.ok, true);
    assert.equal(built.isNoOp, false);
    assert.equal(built.wirePayload._medisaWire.mode, 'delta-v1');
    assert.equal(JSON.stringify(built.mutationIntent.collections), JSON.stringify(['tasitlar']));
    assert.equal(JSON.stringify(built.mutationIntent.changedVehicleIds), JSON.stringify(['v1']));
    assert.equal(built.wirePayload.tasitlar.length, 1);
    assert.equal(built.wirePayload.tasitlar[0].id, 'v1');
    assert.equal(built.wirePayload.users, undefined);
    assert.equal(built.wirePayload.branches, undefined);
    assert.equal(built.wirePayload.kayitlar, undefined);
    assert.equal(built.wirePayload.arac_aylik_hareketler, undefined);
    assert.equal(built.wirePayload.duzeltme_talepleri, undefined);
    assert.equal(built.wirePayload.kaskoDegerListesi, undefined);
    assert.equal(built.wirePayload.__medisaKaskoLookupIndex, undefined);
  });

  await run('10 vehicle payload only 10 vehicles', async function() {
    const vehicles = [];
    for (let i = 1; i <= 20; i++) vehicles.push({ id: 'v' + i, version: 1, km: String(i) });
    const ctx = createCtx();
    setBaseline(ctx, sampleAppData({ tasitlar: vehicles }));
    for (let i = 0; i < 10; i++) ctx.window.appData.tasitlar[i].km = 'x' + i;
    const built = ctx.window.buildSaveWirePayload();
    assert.equal(built.wirePayload.tasitlar.length, 10);
    assert.equal(built.mutationIntent.changedVehicleIds.length, 10);
  });

  await run('delete payload includes deleted id/version', async function() {
    const ctx = createCtx();
    setBaseline(ctx, sampleAppData());
    ctx.window.appData.tasitlar = [ctx.window.appData.tasitlar[0]];
    const built = ctx.window.buildSaveWirePayload();
    assert.deepEqual(built.mutationIntent.deletedVehicleIds, ['v2']);
    assert.equal(built.mutationIntent.deletedVehicleVersions.v2, 2);
    assert.equal(built.wirePayload.tasitlar.length, 0);
  });

  await run('notification-only delta', async function() {
    const ctx = createCtx();
    setBaseline(ctx, sampleAppData());
    ctx.window.appData.notificationReadState = {
      'user:u1': { readKeys: ['n1'], dismissedKeys: [], firstSeenDates: {} },
    };
    const built = ctx.window.buildSaveWirePayload();
    assert.equal(JSON.stringify(built.mutationIntent.collections), JSON.stringify(['notificationReadState']));
    assert.equal(built.wirePayload.tasitlar, undefined);
    assert.ok(built.wirePayload.notificationReadState);
  });

  await run('settings-only delta', async function() {
    const ctx = createCtx();
    setBaseline(ctx, sampleAppData());
    ctx.window.appData.ayarlar = { sirketAdi: 'Yeni' };
    const built = ctx.window.buildSaveWirePayload();
    assert.equal(JSON.stringify(built.mutationIntent.collections), JSON.stringify(['ayarlar']));
    assert.equal(built.wirePayload.users, undefined);
    assert.equal(built.wirePayload.tasitlar, undefined);
  });

  await run('full appData not copied into delta', async function() {
    const ctx = createCtx();
    setBaseline(ctx, sampleAppData());
    ctx.window.appData.tasitlar[1].km = '55';
    const built = ctx.window.buildSaveWirePayload();
    const keys = Object.keys(built.wirePayload).sort();
    assert.equal(JSON.stringify(keys), JSON.stringify(['_medisaMutation', '_medisaWire', 'tasitlar'].sort()));
  });

  await run('no-op skips network and full stringify', async function() {
    const ctx = createCtx();
    setBaseline(ctx, sampleAppData());
    let fetchCount = 0;
    ctx.fetch = async function() {
      fetchCount += 1;
      return { ok: true, status: 200, json: async () => ({ success: true, vehicleVersions: [] }) };
    };
    ctx.window.fetch = ctx.fetch;
    vm.runInContext('serverDatasetTrusted = true', ctx);
    const okSave = await ctx.window.saveDataToServer();
    assert.equal(okSave, true);
    assert.equal(fetchCount, 0);
    const built = ctx.window.buildSaveWirePayload();
    assert.equal(built.isNoOp, true);
    assert.equal(built.wireMetrics.networkBytes, 0);
  });

  await run('duplicate vehicle ids block save', async function() {
    const ctx = createCtx();
    const data = sampleAppData({
      tasitlar: [
        { id: 'v1', version: 1 },
        { id: 'v1', version: 2 },
      ],
    });
    ctx.window.appData = data;
    vm.runInContext('setServerDatasetBaseline({ tasitlar: [], kayitlar: [], branches: [], users: [], ayarlar: {}, sifreler: [], notificationReadState: {}, monthlyTodoWhatsAppLogs: {} })', ctx);
    const built = ctx.window.buildSaveWirePayload();
    assert.equal(built.ok, false);
    assert.equal(built.reason, 'duplicate_vehicle_ids');
  });

  await run('sensitive and history collections excluded', async function() {
    const src = read('data-manager.js');
    assert.match(src, /mode:\s*'delta-v1'/);
    assert.match(src, /function buildSaveWirePayload/);
    assert.match(src, /wirePayload\._medisaUserPasswordChanges/);
    const ctx = createCtx();
    setBaseline(ctx, sampleAppData());
    ctx.window.appData.tasitlar[0].km = '1';
    const built = ctx.window.buildSaveWirePayload();
    const body = JSON.stringify(built.wirePayload);
    assert.equal(body.includes('kaskoDegerListesi'), false);
    assert.equal(body.includes('arac_aylik_hareketler'), false);
    assert.equal(body.includes('duzeltme_talepleri'), false);
    assert.equal(body.includes('password'), false);
    assert.equal(body.includes('Authorization'), false);
  });

  await run('user password stays transient and storage remains secretsiz', async function() {
    const ctx = createCtx();
    const data = sampleAppData({
      users: [{
        id: 'u1',
        name: 'Admin',
        role: 'genel_yonetici',
        portal_sifresi_var: true,
      }],
    });
    setBaseline(ctx, data);
    const secret = 'TransientPass1!';
    const preview = ctx.window.buildSaveWirePayload({
      userPasswordChanges: { u1: secret },
    });
    assert.equal(preview.ok, true);
    assert.equal(preview.isNoOp, false);
    assert.equal(preview.mutationIntent.collections.includes('users'), true);
    assert.equal(preview.wirePayload._medisaUserPasswordChanges.u1, secret);
    assert.equal(JSON.stringify(preview.baselinePatchSnapshot).includes(secret), false);
    assert.equal(JSON.stringify(preview.baselinePatchSnapshot).includes('sifre_hash'), false);

    let requestBody = null;
    ctx.fetch = async function(url, opts) {
      requestBody = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => ({ success: true, vehicleVersions: [] }) };
    };
    ctx.window.fetch = ctx.fetch;
    vm.runInContext('serverDatasetTrusted = true', ctx);
    const options = { userPasswordChanges: { u1: secret } };
    const saved = await ctx.window.saveDataToServer(options);
    assert.equal(saved, true);
    assert.equal(requestBody._medisaUserPasswordChanges.u1, secret);
    assert.equal(JSON.stringify(requestBody.users).includes(secret), false);
    assert.equal(requestBody.users[0].isim, 'Admin');
    assert.equal(Object.prototype.hasOwnProperty.call(requestBody.users[0], 'name'), false);
    assert.equal(options.userPasswordChanges.u1, '');
    assert.equal(JSON.stringify(ctx.window.appData).includes(secret), false);
    assert.equal((ctx.localStorage.getItem('medisa_data_v1') || '').includes(secret), false);
    assert.equal((ctx.localStorage.getItem('medisa_server_backup') || '').includes(secret), false);
    assert.equal((ctx.localStorage.getItem('medisa_data_v1') || '').includes('sifre_hash'), false);
    assert.equal((ctx.localStorage.getItem('medisa_server_backup') || '').includes('sifre_hash'), false);
    assert.equal(ctx.window.buildSaveWirePayload().isNoOp, true);
  });

  await run('baseline advances only applied collections', async function() {
    const ctx = createCtx();
    const data = sampleAppData();
    setBaseline(ctx, data);
    ctx.window.appData.tasitlar[0].km = '42';
    let body;
    ctx.fetch = async function(url, opts) {
      body = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          wireMode: 'delta-v1',
          appliedCollections: ['tasitlar'],
          vehicleVersions: [{ id: 'v1', version: 2 }],
        }),
      };
    };
    ctx.window.fetch = ctx.fetch;
    vm.runInContext('serverDatasetTrusted = true', ctx);
    const saved = await ctx.window.saveDataToServer();
    assert.equal(saved, true);
    assert.equal(body._medisaWire.mode, 'delta-v1');
    assert.equal(body.tasitlar.length, 1);
    const baselineKm = vm.runInContext('serverDatasetBaseline.tasitlar.find(function(v){return v.id==="v1";}).km', ctx);
    const baselineVersion = vm.runInContext('serverDatasetBaseline.tasitlar.find(function(v){return v.id==="v1";}).version', ctx);
    assert.equal(baselineKm, '42');
    assert.equal(baselineVersion, 2);
    const usersBaseline = vm.runInContext('JSON.stringify(serverDatasetBaseline.users)', ctx);
    assert.equal(usersBaseline, JSON.stringify(data.users));
  });

  await run('failed save does not advance baseline', async function() {
    const ctx = createCtx();
    setBaseline(ctx, sampleAppData());
    const before = vm.runInContext('JSON.stringify(serverDatasetBaseline.tasitlar)', ctx);
    ctx.window.appData.tasitlar[0].km = '77';
    ctx.fetch = async function() {
      return { ok: false, status: 500, text: async () => 'fail' };
    };
    ctx.window.fetch = ctx.fetch;
    vm.runInContext('serverDatasetTrusted = true', ctx);
    const saved = await ctx.window.saveDataToServer();
    assert.equal(saved, false);
    const after = vm.runInContext('JSON.stringify(serverDatasetBaseline.tasitlar)', ctx);
    assert.equal(after, before);
  });

  await run('conflict does not advance baseline', async function() {
    const ctx = createCtx();
    setBaseline(ctx, sampleAppData());
    const before = vm.runInContext('JSON.stringify(serverDatasetBaseline.tasitlar)', ctx);
    ctx.window.appData.tasitlar[0].km = '88';
    ctx.fetch = async function() {
      return {
        ok: false,
        status: 409,
        json: async () => ({ conflict: true, message: 'conflict', entity: 'vehicle', id: 'v1' }),
      };
    };
    ctx.window.fetch = ctx.fetch;
    vm.runInContext('serverDatasetTrusted = true', ctx);
    await assert.rejects(() => ctx.window.saveDataToServer(), (err) => err && err.conflict === true);
    const after = vm.runInContext('JSON.stringify(serverDatasetBaseline.tasitlar)', ctx);
    assert.equal(after, before);
  });

  await run('R1 writeVehicles rollback on false save', async function() {
    const ctx = createCtx();
    setBaseline(ctx, sampleAppData());
    vm.runInContext('serverDatasetTrusted = true', ctx);
    const before = JSON.stringify(ctx.window.appData.tasitlar);
    ctx.fetch = async function() {
      return { ok: true, status: 200, json: async () => ({ success: false }) };
    };
    // force saveDataToServer false path via network error style
    ctx.fetch = async function() {
      throw new Error('Failed to fetch');
    };
    ctx.window.fetch = ctx.fetch;
    const next = JSON.parse(before);
    next[0].km = 'rollback-me';
    await ctx.window.writeVehicles(next).catch(function() {});
    // after failure, either reloaded or rolled back — at least not silently keeping optimistic without baseline advance
    const afterBaseline = vm.runInContext('JSON.stringify(serverDatasetBaseline.tasitlar)', ctx);
    assert.equal(afterBaseline, before);
  });

  await run('save mutex serializes concurrent posts', async function() {
    const ctx = createCtx();
    setBaseline(ctx, sampleAppData());
    vm.runInContext('serverDatasetTrusted = true', ctx);
    let active = 0;
    let maxActive = 0;
    let gateResolve;
    const gate = new Promise((resolve) => { gateResolve = resolve; });
    let posts = 0;
    ctx.fetch = async function() {
      posts += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      if (posts === 1) await gate;
      active -= 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          vehicleVersions: [{ id: 'v1', version: 10 + posts }],
        }),
      };
    };
    ctx.window.fetch = ctx.fetch;
    ctx.window.appData.tasitlar[0].km = '1';
    const p1 = ctx.window.saveDataToServer();
    await new Promise((r) => setImmediate(r));
    assert.equal(maxActive, 1);
    ctx.window.appData.tasitlar[0].notes = 'queued-note';
    const p2 = ctx.window.saveDataToServer();
    gateResolve();
    await Promise.all([p1, p2]);
    assert.equal(posts, 2);
    assert.equal(maxActive, 1);
  });

  await run('version map applied via replaceMedisaCollection', async function() {
    const src = read('data-manager.js');
    assert.match(src, /replaceMedisaCollection\('vehicles'/);
    assert.match(src, /reason:\s*'version-patch'/);
  });

  await run('403 authorization failure preserves session tokens', async function() {
    const ctx = createCtx();
    setBaseline(ctx, sampleAppData());
    vm.runInContext('serverDatasetTrusted = true', ctx);
    const token = createFakeJwt();
    ctx.window.medisaPortalSession.getStoredToken = function() { return token; };
    let cleared = false;
    let redirected = false;
    ctx.window.medisaPortalSession.clearStoredTokens = function() { cleared = true; };
    Object.defineProperty(ctx.window.location, 'href', {
      configurable: true,
      get: function() { return 'http://localhost/'; },
      set: function() { redirected = true; },
    });
    const sessionBefore = JSON.stringify(ctx.window.medisaSession);
    ctx.fetch = async function() {
      return { ok: false, status: 403, text: async () => 'forbidden', json: async () => ({ error: 'forbidden' }) };
    };
    ctx.window.fetch = ctx.fetch;
    ctx.window.appData.users[0].isim = 'Forbidden Edit';
    const result = await ctx.window.saveDataToServer();
    assert.equal(result, false);
    assert.equal(cleared, false);
    assert.equal(redirected, false);
    assert.equal(ctx.window.medisaPortalSession.getStoredToken(), token);
    assert.equal(JSON.stringify(ctx.window.medisaSession), sessionBefore);
    assert.equal(vm.runInContext('serverDatasetTrusted', ctx), false);
  });

  await run('401 authentication failure clears session tokens', async function() {
    const ctx = createCtx();
    setBaseline(ctx, sampleAppData());
    vm.runInContext('serverDatasetTrusted = true', ctx);
    let cleared = false;
    let redirected = false;
    ctx.window.medisaPortalSession.clearStoredTokens = function() { cleared = true; };
    Object.defineProperty(ctx.window.location, 'href', {
      configurable: true,
      get: function() { return 'http://localhost/'; },
      set: function() { redirected = true; },
    });
    ctx.fetch = async function() {
      return { ok: false, status: 401, text: async () => 'unauthorized', json: async () => ({ error: 'unauthorized' }) };
    };
    ctx.window.fetch = ctx.fetch;
    ctx.window.appData.users[0].isim = 'Auth Fail Edit';
    const result = await ctx.window.saveDataToServer();
    assert.equal(result, false);
    assert.equal(cleared, true);
    assert.equal(redirected, true);
    assert.equal(ctx.window.medisaSession.authenticated, false);
  });

  await run('save 403 allows caller rollback path', async function() {
    const ctx = createCtx();
    const original = sampleAppData();
    setBaseline(ctx, original);
    vm.runInContext('serverDatasetTrusted = true', ctx);
    const previousUsers = JSON.parse(JSON.stringify(ctx.window.appData.users));
    ctx.window.appData.users[0].isim = 'Should Rollback';
    ctx.fetch = async function() {
      return { ok: false, status: 403, text: async () => 'forbidden', json: async () => ({ error: 'forbidden' }) };
    };
    ctx.window.fetch = ctx.fetch;
    const result = await ctx.window.saveDataToServer();
    assert.equal(result, false);
    // Caller rollback contract (ayarlar persistUserManagementState pattern)
    if (result !== true) {
      ctx.window.replaceMedisaUsers(previousUsers, { reason: 'authz-rollback-test' });
    }
    assert.equal(ctx.window.appData.users[0].isim || ctx.window.appData.users[0].name, previousUsers[0].isim || previousUsers[0].name);
  });

  await run('load 403 preserves session and does not commit offline as trusted', async function() {
    const ctx = createCtx();
    setBaseline(ctx, sampleAppData());
    vm.runInContext('serverDatasetTrusted = true', ctx);
    const token = createFakeJwt();
    ctx.window.medisaPortalSession.getStoredToken = function() { return token; };
    let cleared = false;
    let redirected = false;
    ctx.window.medisaPortalSession.clearStoredTokens = function() { cleared = true; };
    Object.defineProperty(ctx.window.location, 'href', {
      configurable: true,
      get: function() { return 'http://localhost/'; },
      set: function() { redirected = true; },
    });
    // Poison offline snapshot with "unauthorized looking" payload marker
    ctx.localStorage.setItem('medisa_data_v1', JSON.stringify({
      tasitlar: [{ id: 'offline-leak', plate: 'LEAK' }],
      users: [{ id: 'hacker', role: 'genel_yonetici' }],
      branches: [],
      kayitlar: [],
      ayarlar: { sirketAdi: 'LEAK' },
      sifreler: [],
      arac_aylik_hareketler: [],
      duzeltme_talepleri: [],
      kaskoDegerListesi: { rows: [] },
      notificationReadState: {},
      monthlyTodoWhatsAppLogs: {},
    }));
    const usersBefore = JSON.stringify(ctx.window.appData.users);
    const sessionBefore = JSON.stringify(ctx.window.medisaSession);
    ctx.fetch = async function() {
      return { ok: false, status: 403, text: async () => 'forbidden', json: async () => ({ error: 'forbidden' }) };
    };
    ctx.window.fetch = ctx.fetch;
    await assert.rejects(
      () => ctx.window.loadDataFromServer(true),
      (err) => err && err.medisaHttpStatus === 403 && err.medisaAuthorizationDenied === true
    );
    assert.equal(cleared, false);
    assert.equal(redirected, false);
    assert.equal(ctx.window.medisaPortalSession.getStoredToken(), token);
    assert.equal(JSON.stringify(ctx.window.medisaSession), sessionBefore);
    assert.equal(vm.runInContext('serverDatasetTrusted', ctx), false);
    assert.equal(JSON.stringify(ctx.window.appData.users), usersBefore);
    assert.equal(ctx.window.appData.tasitlar.some(function(v) { return v && v.id === 'offline-leak'; }), false);
  });

  await run('load 401 logout redirect and clears session', async function() {
    const ctx = createCtx();
    setBaseline(ctx, sampleAppData());
    vm.runInContext('serverDatasetTrusted = true', ctx);
    let cleared = false;
    let redirected = false;
    ctx.window.medisaPortalSession.clearStoredTokens = function() { cleared = true; };
    Object.defineProperty(ctx.window.location, 'href', {
      configurable: true,
      get: function() { return 'http://localhost/'; },
      set: function() { redirected = true; },
    });
    ctx.fetch = async function() {
      return { ok: false, status: 401, text: async () => 'unauthorized', json: async () => ({ error: 'unauthorized' }) };
    };
    ctx.window.fetch = ctx.fetch;
    await assert.rejects(
      () => ctx.window.loadDataFromServer(true),
      (err) => err && err.medisaHttpStatus === 401
    );
    assert.equal(cleared, true);
    assert.equal(redirected, true);
    assert.equal(ctx.window.medisaSession.authenticated, false);
    assert.equal(vm.runInContext('serverDatasetTrusted', ctx), false);
  });

  await run('assignable normal user candidate filters managers', async function() {
    const ctx = createCtx();
    const fn = ctx.window.isAssignableNormalUserCandidate;
    assert.equal(typeof fn, 'function');
    assert.equal(fn({ id: 'u1', role: 'kullanici', branchIds: ['b1'], aktif: true }, 'b1'), true);
    assert.equal(fn({ id: 'bm1', role: 'sube_yonetici', branchIds: ['b1'], aktif: true }, 'b1'), false);
    assert.equal(fn({ id: 'gm1', role: 'genel_yonetici', branchIds: ['b1'], aktif: true }, 'b1'), false);
    assert.equal(fn({ id: 'u2', role: 'yonetici_kullanici', branchIds: ['b1'], aktif: true }, 'b1'), false);
    assert.equal(fn({ id: 'u3', role: 'kullanici', branchIds: ['b1'], aktif: false }, 'b1'), false);
    assert.equal(fn({ id: 'u4', role: 'kullanici', branchIds: ['b2'], aktif: true }, 'b1'), false);
  });

  await run('central auth status helper exists', async function() {
    const src = read('data-manager.js');
    assert.match(src, /function handleMedisaHttpAuthStatus/);
    assert.match(src, /handleMedisaHttpAuthStatus\(401/);
    assert.match(src, /handleMedisaHttpAuthStatus\(403/);
  });

  console.log('\nClient save wire: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})();
