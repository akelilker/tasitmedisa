/**
 * RECOVERY-R2 — save wire payload measurement (legacy vs delta-v1).
 * Synthetic fixture; canlı endpoint yok.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');

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

function createCtx() {
  const localStorage = createStorage();
  const windowRef = {
    appData: null,
    medisaSession: { authenticated: true, user: { id: 'u1', role: 'genel_yonetici' }, role: 'genel_yonetici' },
    medisaPortalSession: {
      getStoredToken: function() { return 'hdr.' + Buffer.from('{}').toString('base64') + '.sig'; },
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
    JSON, Object, Array, String, Number, Boolean, Math, Date, Error, Promise, Map, Set,
    parseInt, isNaN, encodeURIComponent, decodeURIComponent,
    CustomEvent: windowRef.CustomEvent,
  };
  ctx.globalThis = ctx;
  ctx.window.window = windowRef;
  ctx.fetch = async () => ({ ok: true, status: 200, json: async () => ({ success: true, vehicleVersions: [] }) });
  windowRef.fetch = ctx.fetch;
  vm.createContext(ctx);
  vm.runInContext(read('data-manager.js'), ctx, { filename: 'data-manager.js' });
  return ctx;
}

function makeVehicle(i) {
  // Gerçekçi alan seti; büyük kasko ayrı tutulur. Payload hacmi 500 kayıtla sağlanır.
  return {
    id: 'v-' + String(i).padStart(4, '0'),
    version: 1,
    plaka: '34 ABC ' + String(1000 + i),
    marka: 'Marka' + (i % 20),
    model: 'Model' + (i % 40),
    yil: 2010 + (i % 15),
    km: 50000 + i * 17,
    tip: i % 2 === 0 ? 'otomobil' : 'kamyonet',
    branchId: 'b-' + String((i % 50) + 1).padStart(2, '0'),
    assignedUserId: 'u-' + String((i % 150) + 1).padStart(3, '0'),
    sigortaBitis: '2027-01-15',
    kaskoBitis: '2027-02-15',
    muayeneBitis: '2027-03-15',
    ruhsatNot: 'rn-' + i,
    renk: 'renk-' + (i % 12),
    sasiNo: 'SASI' + String(100000 + i),
    motorNo: 'MOT' + String(200000 + i),
    lastServiceNote: 'service-history-line-' + i,
  };
}

function makeFixture() {
  const tasitlar = [];
  for (let i = 1; i <= 500; i++) tasitlar.push(makeVehicle(i));
  const branches = [];
  for (let i = 1; i <= 50; i++) branches.push({ id: 'b-' + String(i).padStart(2, '0'), name: 'Sube ' + i, aktif: true });
  const users = [];
  for (let i = 1; i <= 150; i++) {
    users.push({
      id: 'u-' + String(i).padStart(3, '0'),
      isim: 'Kullanici ' + i,
      role: i === 1 ? 'genel_yonetici' : (i <= 10 ? 'sube_yonetici' : 'kullanici'),
      branchIds: ['b-' + String(((i - 1) % 50) + 1).padStart(2, '0')],
      aktif: true,
    });
  }
  const kayitlar = [];
  for (let i = 1; i <= 500; i++) {
    kayitlar.push({ id: 'k-' + i, vehicleId: 'v-' + String(((i - 1) % 500) + 1).padStart(4, '0'), tip: 'km', deger: 1000 + i, tarih: '2026-01-01' });
  }
  const kaskoRows = [];
  for (let i = 0; i < 8000; i++) {
    kaskoRows.push({ marka: 'M' + (i % 50), model: 'X' + (i % 200), yil: 2010 + (i % 15), bedel: 500000 + i * 13, padding: 'kasko-row-' + 'y'.repeat(40) });
  }
  return {
    tasitlar, kayitlar, branches, users,
    ayarlar: { sirketAdi: 'Medisa Synthetic', yetkiliKisi: 'Test', telefon: '000', eposta: 't@example.com', k2Belgesi: { expiryDate: '', documentPath: '', updatedAt: '' } },
    sifreler: [{ id: 's1', baslik: 'ornek', not: 'synthetic' }],
    arac_aylik_hareketler: [{ id: 'am1' }],
    duzeltme_talepleri: [{ id: 'dt1' }],
    kaskoDegerListesi: { updatedAt: '2026-07-01', period: '2026-07', sourceFileName: 'synthetic.xlsx', rows: kaskoRows },
    notificationReadState: {
      'role:genel_yonetici': { readKeys: ['n1', 'n2'], dismissedKeys: ['n1'], firstSeenDates: { n1: '2026-01-01' }, migratedFromLocalStorage: false, updatedAt: '2026-07-01T00:00:00.000Z' },
    },
    monthlyTodoWhatsAppLogs: {
      'monthlyTodo:v-0001:s:2026-07': { vehicleId: 'v-0001', plate: '34 ABC 1001', type: 's', field: 'sigorta', date: '2026-07-01', firstOpenedAt: '2026-07-01T10:00:00.000Z', lastOpenedAt: '2026-07-01T10:00:00.000Z', openedCount: 1, openedBy: 'Test' },
    },
  };
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }

function stats(samples) {
  const sorted = samples.slice().sort((a, b) => a - b);
  const pct = (p) => {
    if (!sorted.length) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[idx];
  };
  return { median: pct(50), p75: pct(75), p95: pct(95), min: sorted[0] || 0, max: sorted[sorted.length - 1] || 0 };
}

function timeFn(fn, warmups, runs) {
  for (let i = 0; i < warmups; i++) fn();
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const t0 = process.hrtime.bigint();
    fn();
    const t1 = process.hrtime.bigint();
    samples.push(Number(t1 - t0) / 1e6);
  }
  return stats(samples);
}

function estimateFast4GMs(bytes) {
  return (bytes / 512000) * 1000;
}

function buildLegacyBytes(current, intent) {
  const payload = Object.assign({}, current);
  delete payload.kaskoDegerListesi;
  payload._medisaMutation = intent;
  return Buffer.byteLength(JSON.stringify(payload), 'utf8');
}

function measureScenario(name, mutator) {
  const baseline = makeFixture();
  const ctx = createCtx();
  ctx.window.appData = clone(baseline);
  vm.runInContext('setServerDatasetBaseline(window.appData)', ctx);
  mutator(ctx);

  // Unchanged collection fingerprint cache'ini ısıt.
  ctx.window.buildSaveMutationIntent();

  const intent = ctx.window.buildSaveMutationIntent();
  const legacyBytes = buildLegacyBytes(ctx.window.appData, intent);
  const legacyTiming = timeFn(() => {
    const p = Object.assign({}, ctx.window.appData);
    delete p.kaskoDegerListesi;
    p._medisaMutation = intent;
    JSON.stringify(p);
  }, 5, 20);

  const builderTiming = timeFn(() => ctx.window.buildSaveWirePayload(), 5, 20);
  const built = ctx.window.buildSaveWirePayload();
  let deltaBytes = 0;
  let networkRequest = false;
  let kaskoInDelta = false;
  let deltaTiming = { median: 0, p75: 0, p95: 0, min: 0, max: 0 };
  if (built.isNoOp) {
    deltaBytes = 0;
    networkRequest = false;
  } else {
    const json = JSON.stringify(built.wirePayload);
    deltaBytes = Buffer.byteLength(json, 'utf8');
    networkRequest = true;
    kaskoInDelta = Object.prototype.hasOwnProperty.call(built.wirePayload, 'kaskoDegerListesi');
    deltaTiming = timeFn(() => JSON.stringify(built.wirePayload), 5, 20);
  }

  const reductionPct = legacyBytes > 0 ? ((legacyBytes - deltaBytes) / legacyBytes) * 100 : 0;
  return {
    scenario: name,
    legacyBytes,
    deltaBytes,
    reductionPct: Number(reductionPct.toFixed(2)),
    absSavingKiB: Number(((legacyBytes - deltaBytes) / 1024).toFixed(2)),
    legacyStringifyP95: Number(legacyTiming.p95.toFixed(3)),
    deltaStringifyP95: Number(deltaTiming.p95.toFixed(3)),
    builderP95: Number(builderTiming.p95.toFixed(3)),
    uploadSavingMsFast4G: Number((estimateFast4GMs(legacyBytes) - estimateFast4GMs(deltaBytes)).toFixed(2)),
    networkRequest,
    kaskoInDelta,
    gzipDelta: built.isNoOp ? 0 : zlib.gzipSync(Buffer.from(JSON.stringify(built.wirePayload))).length,
  };
}

const scenarios = {
  noop: function() {},
  single_vehicle_update: function(ctx) {
    const next = ctx.window.getMedisaCollectionSnapshot('vehicles');
    next[0] = Object.assign({}, next[0], { km: next[0].km + 1 });
    ctx.window.replaceMedisaCollection('vehicles', next, { reason: 'measure-single' });
  },
  single_vehicle_create: function(ctx) {
    const next = ctx.window.getMedisaCollectionSnapshot('vehicles');
    next.push(makeVehicle(9999));
    ctx.window.replaceMedisaCollection('vehicles', next, { reason: 'measure-create' });
  },
  single_vehicle_delete: function(ctx) {
    const next = ctx.window.getMedisaCollectionSnapshot('vehicles').filter((v) => v.id !== 'v-0001');
    ctx.window.replaceMedisaCollection('vehicles', next, { reason: 'measure-delete' });
  },
  ten_vehicle_update: function(ctx) {
    const next = ctx.window.getMedisaCollectionSnapshot('vehicles').map((v, idx) => (
      idx < 10 ? Object.assign({}, v, { km: v.km + 5 }) : v
    ));
    ctx.window.replaceMedisaCollection('vehicles', next, { reason: 'measure-ten' });
  },
  branch_update: function(ctx) {
    const next = ctx.window.getMedisaCollectionSnapshot('branches').map((b, idx) => (
      idx === 0 ? Object.assign({}, b, { name: b.name + ' X' }) : b
    ));
    ctx.window.replaceMedisaCollection('branches', next, { reason: 'measure-branch' });
  },
  user_update: function(ctx) {
    const next = ctx.window.getMedisaCollectionSnapshot('users').map((u, idx) => (
      idx === 0 ? Object.assign({}, u, { isim: u.isim + ' X' }) : u
    ));
    ctx.window.replaceMedisaCollection('users', next, { reason: 'measure-user' });
  },
  notification_update: function(ctx) {
    const d = ctx.window.appData;
    const s = Object.assign({}, d.notificationReadState['role:genel_yonetici']);
    s.readKeys = (s.readKeys || []).concat(['n-new']);
    d.notificationReadState = Object.assign({}, d.notificationReadState, { 'role:genel_yonetici': s });
  },
};

const rows = Object.keys(scenarios).map((name) => measureScenario(name, scenarios[name]));
const single = rows.find((r) => r.scenario === 'single_vehicle_update');
const noop = rows.find((r) => r.scenario === 'noop');
const ten = rows.find((r) => r.scenario === 'ten_vehicle_update');

const gates = {
  noopNetworkBytesZero: noop && noop.deltaBytes === 0 && noop.networkRequest === false ? 'PASS' : 'FAIL',
  singleVehicleReduction80: single && single.reductionPct >= 80 ? 'PASS' : 'FAIL',
  singleVehicleAbs50KiB: single && single.absSavingKiB >= 50 ? 'PASS' : 'FAIL',
  tenVehicleReduction60: ten && ten.reductionPct >= 60 ? 'PASS' : 'FAIL',
  kaskoBytePayloadZero: rows.every((r) => r.kaskoInDelta === false) ? 'PASS' : 'FAIL',
  deltaStringifyP95Half: single && single.deltaStringifyP95 <= (single.legacyStringifyP95 * 0.5) ? 'PASS' : 'FAIL',
  builderP95Under5ms: single && single.builderP95 <= 5 ? 'PASS' : 'FAIL',
};

const failed = Object.values(gates).filter((v) => v !== 'PASS').length;
const report = {
  kind: 'medisa-save-wire-measurement',
  warmups: 5,
  runs: 20,
  fixture: { vehicles: 500, branches: 50, users: 150, kaskoRows: 8000 },
  gates,
  rows,
};

console.log(JSON.stringify(report, null, 2));
if (failed > 0) {
  console.error('measure-medisa-save-wire: HARD GATE FAIL (' + failed + ')');
  process.exit(1);
}
console.error('measure-medisa-save-wire: OK');
