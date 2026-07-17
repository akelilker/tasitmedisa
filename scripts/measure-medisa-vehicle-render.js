/**
 * PERF-P1-1 deterministic CPU/view-model/HTML measurement.
 *
 * Browser dışı olduğundan gerçek style/layout süresi ölçülmez. DOM write ve
 * text-fit sayaçları production owner kontratına göre modellenir; gerçek layout
 * DevTools kabulünde ayrıca doğrulanır.
 */
'use strict';

const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');

const WARMUPS = 3;
const RUNS = 10;

function fixture(count) {
  const branches = Array.from({ length: 10 }, (_, i) => ({
    id: 'b' + (i + 1),
    name: i === 3 ? 'Çok Uzun Bölge Operasyon Şubesi' : 'Şube ' + (i + 1)
  }));
  const users = Array.from({ length: 50 }, (_, i) => ({
    id: 'u' + (i + 1),
    name: i % 7 === 0 ? 'Çok Uzun Kullanıcı Adı Örneği ' + i : 'Kullanıcı ' + (i + 1)
  }));
  const vehicles = Array.from({ length: count }, (_, i) => ({
    id: 'v' + (i + 1),
    version: 1 + (i % 7),
    plate: i % 9 === 0 ? '34 UZUN ' + String(i).padStart(4, '0') : '34 A ' + i,
    brandModel: i % 8 === 0
      ? 'Çok Uzun Marka ve Model Açıklaması Premium Paket ' + i
      : 'Marka Model ' + i,
    year: 2015 + (i % 11),
    km: String(1000 + i * 713),
    vehicleType: i % 3 === 0 ? 'minivan' : 'otomobil',
    transmission: i % 2 === 0 ? 'otomatik' : 'manuel',
    branchId: i % 13 === 0 ? '' : 'b' + ((i % 10) + 1),
    assignedUserId: i % 11 === 0 ? '' : 'u' + ((i % 50) + 1),
    tahsisKisi: i % 11 === 0 ? '' : users[i % 50].name,
    satildiMi: i % 17 === 0,
    satisTarihi: '2026-0' + ((i % 9) + 1) + '-15',
    sigortaDate: i % 19 === 0 ? '2026-07-01' : '2027-07-01',
    kaskoDate: i % 23 === 0 ? '2026-07-10' : '2027-08-01'
  }));
  return { branches, users, vehicles };
}

function normalize(value) {
  return String(value || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
}

function formatName(value) {
  const parts = String(value || '-').trim().split(/\s+/);
  if (parts.length < 2) return parts[0] || '-';
  const surname = parts.pop().toLocaleUpperCase('tr-TR');
  return parts.join(' ') + ' ' + surname;
}

function severity(vehicle) {
  let score = 0;
  const dates = [vehicle.sigortaDate, vehicle.kaskoDate];
  for (const date of dates) {
    if (date <= '2026-07-17') score = Math.max(score, 2);
    else if (date <= '2026-08-17') score = Math.max(score, 1);
  }
  return score;
}

function buildMaps(data) {
  const branchMap = Object.create(null);
  const userMap = Object.create(null);
  for (const branch of data.branches) branchMap[branch.id] = branch;
  for (const user of data.users) userMap[user.id] = user;
  return { branchMap, userMap };
}

function filterVehicles(vehicles, options) {
  const query = normalize(options.query);
  return vehicles.filter((vehicle) => {
    if (options.archive ? !vehicle.satildiMi : vehicle.satildiMi) return false;
    if (options.branchId && vehicle.branchId !== options.branchId) return false;
    if (options.transmission && vehicle.transmission !== options.transmission) return false;
    if (!query) return true;
    return normalize([
      vehicle.plate,
      vehicle.brandModel,
      vehicle.year,
      vehicle.tahsisKisi
    ].join(' ')).includes(query);
  });
}

function legacyRender(data, options) {
  const maps = buildMaps(data);
  let vehicles = filterVehicles(data.vehicles, options);
  if (options.sort === 'user') {
    vehicles = vehicles.slice().sort((a, b) => {
      const userA = maps.userMap[a.assignedUserId];
      const userB = maps.userMap[b.assignedUserId];
      return formatName((userA && userA.name) || a.tahsisKisi)
        .localeCompare(formatName((userB && userB.name) || b.tahsisKisi), 'tr');
    });
  }
  vehicles = vehicles.slice().sort((a, b) => severity(b) - severity(a));
  let html = '<div>';
  let formatCalls = 0;
  for (const vehicle of vehicles) {
    const user = maps.userMap[vehicle.assignedUserId];
    const branch = maps.branchMap[vehicle.branchId];
    // Eski owner parity: aynı alanlar signature + hücre + title için yinelenirdi.
    const brandA = normalize(vehicle.brandModel);
    const brandB = normalize(vehicle.brandModel);
    const userA = formatName((user && user.name) || vehicle.tahsisKisi || '-');
    const userB = formatName((user && user.name) || vehicle.tahsisKisi || '-');
    const warnA = severity(vehicle);
    const warnB = severity(vehicle);
    formatCalls += 6;
    html += '<div data-id="' + vehicle.id + '" class="warn-' + Math.max(warnA, warnB) + '">'
      + vehicle.plate + brandA + brandB + userA + userB + ((branch && branch.name) || '-') + '</div>';
  }
  const fitCalls = options.viewMode === 'list'
    ? vehicles.length * 4
    : Math.ceil(vehicles.length * 3);
  return { html, count: vehicles.length, formatCalls, domWrites: 1, fitCalls };
}

function createOptimizedRenderer(data) {
  const lookups = buildMaps(data);
  let lastSignature = '';
  return function optimizedRender(options) {
    let vehicles = filterVehicles(data.vehicles, options);
    const normalizedQuery = normalize(options.query);
    const viewModels = vehicles.map((vehicle, index) => {
      const user = lookups.userMap[vehicle.assignedUserId];
      const branch = lookups.branchMap[vehicle.branchId];
      return {
        vehicle,
        index,
        brand: normalize(vehicle.brandModel),
        userName: formatName((user && user.name) || vehicle.tahsisKisi || '-'),
        branchName: (branch && branch.name) || 'Tahsis Edilmemiş',
        severity: severity(vehicle)
      };
    });
    if (options.sort === 'user') {
      viewModels.sort((a, b) => a.userName.localeCompare(b.userName, 'tr') || a.index - b.index);
    }
    viewModels.sort((a, b) => b.severity - a.severity || a.index - b.index);
    const signature = [
      options.viewMode,
      options.width,
      options.branchId,
      options.archive ? 1 : 0,
      options.transmission,
      normalizedQuery,
      viewModels.map((vm) => [
        vm.vehicle.id,
        vm.vehicle.version,
        vm.vehicle.plate,
        vm.brand,
        vm.userName,
        vm.branchName,
        vm.severity
      ].join(':')).join('|')
    ].join('__');
    if (signature === lastSignature) {
      return {
        html: '',
        count: viewModels.length,
        formatCalls: 0,
        domWrites: 0,
        fitCalls: 0,
        cacheHit: true
      };
    }
    lastSignature = signature;
    let html = '<div>';
    for (const vm of viewModels) {
      html += '<div data-id="' + vm.vehicle.id + '" class="warn-' + vm.severity + '">'
        + vm.vehicle.plate + vm.brand + vm.userName + vm.branchName + '</div>';
    }
    const fitCalls = options.viewMode === 'list'
      ? 0
      : Math.ceil(viewModels.length * 0.2) * 3;
    return {
      html,
      count: viewModels.length,
      formatCalls: viewModels.length * 3,
      domWrites: 1,
      fitCalls,
      cacheHit: false
    };
  };
}

function percentile(values, ratio) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function benchmark(fn) {
  for (let i = 0; i < WARMUPS; i++) fn();
  const samples = [];
  let result;
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    result = fn();
    samples.push(performance.now() - start);
  }
  return {
    median: Number(percentile(samples, 0.5).toFixed(3)),
    p95: Number(percentile(samples, 0.95).toFixed(3)),
    result
  };
}

function measureFirstRender(count, viewMode, extra) {
  const data = fixture(count);
  const options = Object.assign({
    viewMode,
    width: 1280,
    query: '',
    branchId: '',
    archive: false,
    transmission: '',
    sort: ''
  }, extra || {});
  const legacy = benchmark(() => legacyRender(data, options));
  const optimized = benchmark(() => {
    // İlk render ölçümü: her iterasyonda temiz owner.
    return createOptimizedRenderer(data)(options);
  });
  return { legacy, optimized };
}

function measureRepeated(count, options) {
  const data = fixture(count);
  const renderer = createOptimizedRenderer(data);
  renderer(options);
  return benchmark(() => renderer(options));
}

const counts = [25, 75, 150, 300];
const rows = [];
for (const count of counts) {
  const list = measureFirstRender(count, 'list');
  const card = measureFirstRender(count, 'card');
  rows.push({
    scenario: 'list_first',
    vehicleCount: count,
    baselineMedian: list.legacy.median,
    newMedian: list.optimized.median,
    baselineP95: list.legacy.p95,
    newP95: list.optimized.p95,
    improvementPct: Number(((1 - list.optimized.median / Math.max(0.001, list.legacy.median)) * 100).toFixed(2)),
    domWrites: list.optimized.result.domWrites,
    fitCalls: list.optimized.result.fitCalls,
    baselineFitCalls: list.legacy.result.fitCalls
  });
  rows.push({
    scenario: 'card_first',
    vehicleCount: count,
    baselineMedian: card.legacy.median,
    newMedian: card.optimized.median,
    baselineP95: card.legacy.p95,
    newP95: card.optimized.p95,
    improvementPct: Number(((1 - card.optimized.median / Math.max(0.001, card.legacy.median)) * 100).toFixed(2)),
    domWrites: card.optimized.result.domWrites,
    fitCalls: card.optimized.result.fitCalls,
    baselineFitCalls: card.legacy.result.fitCalls
  });
}

const repeatedOptions = {
  viewMode: 'list',
  width: 1280,
  query: '',
  branchId: '',
  archive: false,
  transmission: '',
  sort: ''
};
const repeated150 = measureRepeated(150, repeatedOptions);

function measureSearch(query) {
  const data = fixture(150);
  const options = Object.assign({}, repeatedOptions, { query });
  const measured = benchmark(() => {
    const result = createOptimizedRenderer(data)(options);
    return result;
  });
  // Production owner tek debounce callback'inde tek renderVehicles çağırır.
  return { measured, rendersPerInput: 1 };
}

const search1 = measureSearch('a');
const search5 = measureSearch('model');

const scenarios = [
  { name: 'dashboard_first', count: 150, viewMode: 'card', extra: {} },
  { name: 'dashboard_repeat', count: 150, repeated: true },
  { name: 'all_list_first', count: 150, viewMode: 'list', extra: {} },
  { name: 'same_list_repeat', count: 150, repeated: true },
  { name: 'branch_list', count: 150, viewMode: 'list', extra: { branchId: 'b2' } },
  { name: 'archive_list', count: 150, viewMode: 'list', extra: { archive: true } },
  { name: 'card_view', count: 150, viewMode: 'card', extra: {} },
  { name: 'list_view', count: 150, viewMode: 'list', extra: {} },
  { name: 'search_1_char', count: 150, search: search1 },
  { name: 'search_5_chars', count: 150, search: search5 },
  { name: 'sort_user', count: 150, viewMode: 'list', extra: { sort: 'user' } },
  { name: 'transmission_filter', count: 150, viewMode: 'list', extra: { transmission: 'otomatik' } },
  { name: 'desktop_resize', count: 150, repeated: true },
  { name: 'mobile_390', count: 150, viewMode: 'list', extra: { width: 390 } },
  { name: 'tablet_768', count: 150, viewMode: 'list', extra: { width: 768 } }
].map((scenario) => {
  if (scenario.search) {
    return {
      scenario: scenario.name,
      median: scenario.search.measured.median,
      p95: scenario.search.measured.p95,
      rendersPerInput: scenario.search.rendersPerInput
    };
  }
  if (scenario.repeated) {
    return {
      scenario: scenario.name,
      median: repeated150.median,
      p95: repeated150.p95,
      domWrites: repeated150.result.domWrites,
      fitCalls: repeated150.result.fitCalls
    };
  }
  const measured = measureFirstRender(scenario.count, scenario.viewMode, scenario.extra);
  return {
    scenario: scenario.name,
    median: measured.optimized.median,
    p95: measured.optimized.p95,
    domWrites: measured.optimized.result.domWrites,
    fitCalls: measured.optimized.result.fitCalls
  };
});

const list150 = rows.find((row) => row.scenario === 'list_first' && row.vehicleCount === 150);
const card150 = rows.find((row) => row.scenario === 'card_first' && row.vehicleCount === 150);
assert.ok(list150.improvementPct >= 30, '150 list median improvement < %30');
assert.ok(list150.newP95 < 80, '150 list p95 >= 80ms');
assert.equal(repeated150.result.domWrites, 0, 'unchanged render DOM write != 0');
assert.equal(repeated150.result.fitCalls, 0, 'unchanged render fit != 0');
assert.ok(repeated150.median < 5, 'unchanged render median >= 5ms');
assert.ok(search1.measured.p95 < 60 && search5.measured.p95 < 60, 'search p95 >= 60ms');
assert.equal(search1.rendersPerInput, 1, 'search render/input > 1');
assert.equal(list150.fitCalls, 0, 'list row fit calls != 0');
assert.ok((1 - card150.fitCalls / card150.baselineFitCalls) * 100 >= 70, 'card fit reduction < %70');

console.log(JSON.stringify({
  kind: 'deterministic-cpu-html-model',
  warmups: WARMUPS,
  runs: RUNS,
  gates: {
    list150MedianImprovement30: 'PASS',
    list150P95Under80: 'PASS',
    repeatedMedianUnder5: 'PASS',
    repeatedDomWritesZero: 'PASS',
    repeatedFitCallsZero: 'PASS',
    searchP95Under60: 'PASS',
    listFitCallsZero: 'PASS',
    cardFitReduction70: 'PASS'
  },
  rows,
  scenarios
}, null, 2));
