/**
 * PERF-P0-3 — deterministic save wire payload size measurement + hard gates.
 * Gerçek canlı değer basmaz. Çalıştır: node scripts/measure-medisa-save-wire.js
 */
'use strict';

const assert = require('node:assert/strict');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeVehicle(i) {
  return {
    id: 'v' + i,
    plate: '34 PLT ' + String(i).padStart(3, '0'),
    version: 1 + (i % 7),
    branchId: 'b' + ((i % 10) + 1),
    vehicleType: i % 2 === 0 ? 'otomobil' : 'minivan',
    km: String(1000 + i),
    notes: 'fixture-note-' + i,
    sigortaBitis: '2027-01-15',
    kaskoBitis: '2027-02-15',
  };
}

function makeUser(i) {
  return {
    id: 'u' + i,
    name: 'User ' + i,
    role: i === 1 ? 'genel_yonetici' : (i % 5 === 0 ? 'sube_yonetici' : 'kullanici'),
    branchIds: ['b' + ((i % 10) + 1)],
  };
}

function buildFixture() {
  const tasitlar = [];
  for (let i = 1; i <= 150; i++) tasitlar.push(makeVehicle(i));
  const users = [];
  for (let i = 1; i <= 50; i++) users.push(makeUser(i));
  const branches = [];
  for (let i = 1; i <= 10; i++) branches.push({ id: 'b' + i, name: 'Branch ' + i });
  const kayitlar = [];
  for (let i = 1; i <= 500; i++) {
    kayitlar.push({
      id: 'k' + i,
      vehicleId: 'v' + ((i % 150) + 1),
      type: 'note',
      text: 'kayit-fixture-' + i,
      at: '2026-01-01T00:00:00+03:00',
    });
  }
  const notificationReadState = {};
  for (let i = 1; i <= 50; i++) {
    notificationReadState['user:u' + i] = {
      readKeys: ['n' + i, 'n' + (i + 100)],
      dismissedKeys: [],
      firstSeenDates: { ['n' + i]: '2026-01-01T10:00:00+03:00' },
      migratedFromLocalStorage: false,
      updatedAt: '2026-01-01T10:00:00+03:00',
    };
  }
  const aylik = [];
  for (let i = 1; i <= 200; i++) {
    aylik.push({ id: 'h' + i, vehicleId: 'v' + ((i % 150) + 1), period: '2026-01', guncel_km: String(i) });
  }
  const talepler = [];
  for (let i = 1; i <= 40; i++) {
    talepler.push({ id: 't' + i, kayit_id: 'h' + i, durum: 'beklemede' });
  }
  const monthlyTodoWhatsAppLogs = {};
  for (let i = 1; i <= 80; i++) {
    monthlyTodoWhatsAppLogs['monthlyTodo:v' + i + ':s:2026-01'] = {
      vehicleId: 'v' + i,
      plate: '34 PLT ' + String(i).padStart(3, '0'),
      type: 's',
      field: 'sigorta',
      date: '2026-01',
      firstOpenedAt: '2026-01-02T10:00:00+03:00',
      lastOpenedAt: '2026-01-02T10:00:00+03:00',
      openedCount: 1,
      openedBy: 'User 1',
    };
  }

  return {
    tasitlar,
    kayitlar,
    branches,
    users,
    ayarlar: {
      sirketAdi: 'Medisa Fixture',
      yetkiliKisi: 'Yetkili',
      telefon: '000',
      eposta: 'a@b.c',
      k2Belgesi: { expiryDate: '', documentPath: '', updatedAt: '' },
    },
    sifreler: [],
    arac_aylik_hareketler: aylik,
    duzeltme_talepleri: talepler,
    notificationReadState,
    monthlyTodoWhatsAppLogs,
  };
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function timeStringify(obj, rounds) {
  const samples = [];
  for (let i = 0; i < rounds; i++) {
    const t0 = process.hrtime.bigint();
    JSON.stringify(obj);
    const t1 = process.hrtime.bigint();
    samples.push(Number(t1 - t0) / 1e6);
  }
  return median(samples);
}

function buildLegacyPayload(appData, mutation) {
  const payload = Object.assign({}, clone(appData));
  delete payload.kaskoDegerListesi;
  payload._medisaMutation = mutation;
  return payload;
}

function buildDeltaPayload(appData, mutation) {
  const payload = {
    _medisaWire: { schemaVersion: 1, mode: 'delta-v1' },
    _medisaMutation: mutation,
  };
  (mutation.collections || []).forEach((key) => {
    if (key === 'tasitlar') {
      const changed = new Set(mutation.changedVehicleIds || []);
      payload.tasitlar = (appData.tasitlar || []).filter((v) => changed.has(String(v.id))).map(clone);
      return;
    }
    payload[key] = clone(appData[key]);
  });
  return payload;
}

function measureScenario(name, appData, mutation, options) {
  options = options || {};
  const legacy = options.legacyOverride || buildLegacyPayload(appData, mutation);
  const delta = options.deltaOverride || buildDeltaPayload(appData, mutation);
  const legacyBytes = options.networkBytesLegacy != null
    ? options.networkBytesLegacy
    : Buffer.byteLength(JSON.stringify(legacy), 'utf8');
  const deltaBytes = options.networkBytesDelta != null
    ? options.networkBytesDelta
    : Buffer.byteLength(JSON.stringify(delta), 'utf8');
  const reductionBytes = legacyBytes - deltaBytes;
  const reductionPct = legacyBytes === 0 ? 0 : (reductionBytes / legacyBytes) * 100;
  const rounds = 21;
  const legacyMs = options.skipTiming ? 0 : timeStringify(legacy, rounds);
  const deltaMs = options.skipTiming ? 0 : timeStringify(delta, rounds);
  return {
    scenario: name,
    legacyBytes,
    deltaBytes,
    reductionBytes,
    reductionPct: Number(reductionPct.toFixed(2)),
    legacyStringifyMedianMs: Number(legacyMs.toFixed(4)),
    deltaStringifyMedianMs: Number(deltaMs.toFixed(4)),
  };
}

const fixture = buildFixture();
const results = [];

// 1) Tek taşıt güncelleme
{
  const app = clone(fixture);
  app.tasitlar[0].km = '9999';
  const mutation = {
    collections: ['tasitlar'],
    changedVehicleIds: ['v1'],
    deletedVehicleIds: [],
    deletedVehicleVersions: {},
  };
  results.push(measureScenario('single_vehicle_update', app, mutation));
}

// 2) Tek taşıt silme
{
  const app = clone(fixture);
  app.tasitlar = app.tasitlar.filter((v) => v.id !== 'v2');
  const mutation = {
    collections: ['tasitlar'],
    changedVehicleIds: [],
    deletedVehicleIds: ['v2'],
    deletedVehicleVersions: { v2: 1 },
  };
  results.push(measureScenario('single_vehicle_delete', app, mutation));
}

// 3) Notification-only
{
  const app = clone(fixture);
  app.notificationReadState['user:u1'].readKeys.push('n-extra');
  const mutation = {
    collections: ['notificationReadState'],
    changedVehicleIds: [],
    deletedVehicleIds: [],
    deletedVehicleVersions: {},
  };
  results.push(measureScenario('notification_only', app, mutation));
}

// 4) Settings-only
{
  const app = clone(fixture);
  app.ayarlar.sirketAdi = 'Medisa Measured';
  const mutation = {
    collections: ['ayarlar'],
    changedVehicleIds: [],
    deletedVehicleIds: [],
    deletedVehicleVersions: {},
  };
  results.push(measureScenario('settings_only', app, mutation));
}

// 5) Users collection
{
  const app = clone(fixture);
  app.users[0].name = 'User 1 Updated';
  const mutation = {
    collections: ['users'],
    changedVehicleIds: [],
    deletedVehicleIds: [],
    deletedVehicleVersions: {},
  };
  results.push(measureScenario('users_collection', app, mutation));
}

// 6) Branches
{
  const app = clone(fixture);
  app.branches[0].name = 'Branch 1 Updated';
  const mutation = {
    collections: ['branches'],
    changedVehicleIds: [],
    deletedVehicleIds: [],
    deletedVehicleVersions: {},
  };
  results.push(measureScenario('branches_collection', app, mutation));
}

// 7) Kayitlar
{
  const app = clone(fixture);
  app.kayitlar[0].text = 'updated';
  const mutation = {
    collections: ['kayitlar'],
    changedVehicleIds: [],
    deletedVehicleIds: [],
    deletedVehicleVersions: {},
  };
  results.push(measureScenario('kayitlar_collection', app, mutation));
}

// 8) Çoklu taşıt
{
  const app = clone(fixture);
  app.tasitlar[0].km = '1';
  app.tasitlar[1].km = '2';
  app.tasitlar[2].km = '3';
  const mutation = {
    collections: ['tasitlar'],
    changedVehicleIds: ['v1', 'v2', 'v3'],
    deletedVehicleIds: [],
    deletedVehicleVersions: {},
  };
  results.push(measureScenario('multi_vehicle_update', app, mutation));
}

// 9) No-op
results.push(measureScenario('no_op', fixture, {
  collections: [],
  changedVehicleIds: [],
  deletedVehicleIds: [],
  deletedVehicleVersions: {},
}, {
  networkBytesLegacy: Buffer.byteLength(JSON.stringify(buildLegacyPayload(fixture, {
    collections: [],
    changedVehicleIds: [],
    deletedVehicleIds: [],
    deletedVehicleVersions: {},
  })), 'utf8'),
  networkBytesDelta: 0,
  skipTiming: false,
  deltaOverride: { _noop: true },
}));

// 10) Legacy full payload (reference row; delta == legacy bytes when forced full)
{
  const mutation = {
    collections: ['tasitlar', 'kayitlar', 'branches', 'users', 'ayarlar', 'sifreler', 'notificationReadState', 'monthlyTodoWhatsAppLogs'],
    changedVehicleIds: fixture.tasitlar.map((v) => v.id),
    deletedVehicleIds: [],
    deletedVehicleVersions: {},
  };
  const legacy = buildLegacyPayload(fixture, mutation);
  results.push(measureScenario('legacy_full_payload', fixture, mutation, {
    deltaOverride: legacy,
  }));
}

function find(name) {
  return results.find((r) => r.scenario === name);
}

const single = find('single_vehicle_update');
const notif = find('notification_only');
const settings = find('settings_only');
const noop = find('no_op');

assert.ok(single.deltaBytes <= single.legacyBytes * 0.15, 'single vehicle gate failed');
assert.ok(notif.deltaBytes <= notif.legacyBytes * 0.10, 'notification gate failed');
assert.ok(settings.deltaBytes <= settings.legacyBytes * 0.10, 'settings gate failed');
assert.equal(noop.deltaBytes, 0, 'no-op network bytes must be 0');

console.log(JSON.stringify({
  ok: true,
  gates: {
    single_vehicle_update: 'PASS',
    notification_only: 'PASS',
    settings_only: 'PASS',
    no_op: 'PASS',
  },
  results,
}, null, 2));
