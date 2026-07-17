/**
 * PERF-P1-1 — taşıt liste/render/text-fit invariantleri.
 * Browser/DOM dependency yok; source contract + deterministic owner testleri.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'tasitlar.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'tasitlar-base.css'), 'utf8')
  + '\n'
  + fs.readFileSync(path.join(ROOT, 'tasitlar-extra.css'), 'utf8');
const dataManager = fs.readFileSync(path.join(ROOT, 'data-manager.js'), 'utf8');

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
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = '';
      }
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

const renderVehiclesSource = extractFunctionSource(source, 'renderVehicles');
const dashboardStart = source.indexOf('window.renderBranchDashboard = function');
const dashboardEnd = source.indexOf('function createBranchCard', dashboardStart);
const dashboardSource = source.slice(dashboardStart, dashboardEnd);
const fitSource = extractFunctionSource(source, 'fitVehicleTextBoxes');
const fitConfigSource = extractFunctionSource(source, 'getVehicleFitConfig');
const resizeOwnerStart = source.indexOf('// Aktif taşıt modalı resize owner');
const resizeOwnerEnd = source.indexOf('// Toolbar Container Oluştur', resizeOwnerStart);
const resizeOwner = source.slice(resizeOwnerStart, resizeOwnerEnd);
const searchOwnerStart = source.indexOf('var vehicleSearchCompositionActive');
const searchOwnerEnd = source.indexOf('// Şanzıman menüsünü dış tıklamada', searchOwnerStart);
const searchOwner = source.slice(searchOwnerStart, searchOwnerEnd);

test('renderVehicles cached branch/user reader kullanır', function() {
  assert.match(renderVehiclesSource, /getVehicleRenderLookups\(\)/);
  assert.match(source, /function readBranches\(\)/);
  assert.match(source, /function readUsers\(\)/);
});

test('renderVehicles doğrudan appData branches/users okumaz', function() {
  assert.doesNotMatch(renderVehiclesSource, /window\.appData[\s\S]{0,40}\.(branches|users)/);
  assert.doesNotMatch(source, /window\.appData\?\.(branches|users)/);
});

test('lookup cache branch/user map tekrar kullanım ownerı', function() {
  assert.match(source, /vehicleRenderLookupCache/);
  assert.match(source, /vehicleRenderLookupCache\.signature === signature/);
  assert.match(source, /Duplicate ID parity:[\s\S]{0,100}son görünür kayıt kazanır/);
});

test('unchanged vehicle signature DOM rewrite yapmaz', function() {
  const fastSignature = renderVehiclesSource.indexOf('lastVehiclesInputSignature === inputSignature');
  const viewModelBuild = renderVehiclesSource.indexOf('buildVehicleRenderViewModels');
  const cacheCheck = renderVehiclesSource.indexOf('lastVehiclesRenderSignature === renderSignature');
  const domWrite = renderVehiclesSource.indexOf('listContainer.innerHTML = html');
  assert.ok(fastSignature >= 0 && fastSignature < viewModelBuild);
  assert.ok(cacheCheck >= 0 && domWrite > cacheCheck);
  const cacheBlock = renderVehiclesSource.slice(cacheCheck, domWrite);
  assert.match(cacheBlock, /domWrites:\s*0/);
  assert.match(cacheBlock, /fitCalls:\s*0/);
});

test('list view full text-fit döngüsüne girmez', function() {
  assert.match(fitConfigSource, /Liste satırlarında CSS ellipsis \/ line-clamp owner/);
  assert.match(fitConfigSource, /return null/);
  assert.doesNotMatch(fitConfigSource, /\.view-list/);
  assert.match(renderVehiclesSource, /if \(viewMode === 'card'\)[\s\S]{0,100}fitVehicleTextBoxes/);
});

test('card fit yalnız izinli selectorları kullanır', function() {
  assert.match(fitConfigSource, /\.view-card \.card-plate/);
  assert.match(fitConfigSource, /\.view-card \.card-brand-model/);
  assert.match(fitConfigSource, /\.view-card \.card-third-line/);
  assert.doesNotMatch(fitConfigSource, /list-cell/);
});

test('dashboard aynı signatureda tekrar fit etmez', function() {
  const cacheHitStart = dashboardSource.indexOf('lastDashboardRenderSignature === renderSignature');
  const domWrite = dashboardSource.indexOf('modalContent.innerHTML = html');
  const cacheHitBody = dashboardSource.slice(cacheHitStart, domWrite);
  assert.ok(cacheHitStart >= 0 && domWrite > cacheHitStart);
  assert.match(cacheHitBody, /layoutChanged = lastVehicleResizeLayoutKey !== dashboardLayoutKey/);
  assert.match(cacheHitBody, /if \(layoutChanged\)[\s\S]{0,160}fitVehicleTextBoxes/);
  assert.match(cacheHitBody, /fitCalls:\s*layoutChanged \? 1 : 0/);
});

test('fit cache text ve width/height değişiminde invalidate olur', function() {
  const fitSignatureSource = extractFunctionSource(source, 'buildVehicleFitSignature');
  assert.match(fitSignatureSource, /textContent/);
  assert.match(fitSignatureSource, /clientWidth/);
  assert.match(fitSignatureSource, /clientHeight/);
  assert.match(fitSource, /vehicleFitSignatures\[fitMode\] === signature/);
});

test('resize görünmeyen modalı işlemiyor', function() {
  assert.match(resizeOwner, /modal\.classList\.contains\('active'\)/);
  assert.match(resizeOwner, /modal\.style\.display === 'none'/);
  assert.match(resizeOwner, /lastVehicleResizeLayoutKey === layoutKey/);
});

test('search mevcut tek debounce ownerını korur', function() {
  assert.match(searchOwner, /window\.debounce\(handleSearchImpl,\s*200\)/);
  assert.equal((searchOwner.match(/window\.debounce\(/g) || []).length, 1);
});

test('IME composition ara renderı engeller', function() {
  assert.match(searchOwner, /compositionstart/);
  assert.match(searchOwner, /compositionend/);
  assert.match(searchOwner, /if \(vehicleSearchCompositionActive\) return/);
});

test('vehicle click delegation korunur', function() {
  assert.match(source, /closest\('\[data-vehicle-id\]'\)/);
  assert.match(source, /showVehicleDetail/);
});

test('branch card delegation korunur', function() {
  assert.match(source, /closest\('\.branch-card'\)/);
  assert.match(source, /openBranchList/);
});

test('liste kolon sıralaması korunur', function() {
  assert.match(source, /defaultVehicleColumnOrder = \['year', 'plate', 'brand', 'km', 'type', 'transmission', 'user', 'branch'\]/);
  assert.match(source, /handleVehicleColumnDrop/);
});

test('mobile column hiding korunur', function() {
  assert.match(renderVehiclesSource, /k === 'type' \|\| k === 'transmission'/);
});

test('archive user-column kuralı korunur', function() {
  assert.match(renderVehiclesSource, /activeBranchId === '__archive__' && k === 'user'/);
});

test('search highlighting korunur', function() {
  assert.match(source, /vehicle-search-hit/);
  assert.match(renderVehiclesSource, /maybeHighlightCell/);
  assert.match(renderVehiclesSource, /buildPlateCellHtml/);
});

test('date-warning pin sırası tek severity hesabını kullanır', function() {
  assert.match(renderVehiclesSource, /buildVehicleRenderViewModels/);
  assert.match(renderVehiclesSource, /vm\.vehicleDateSeverityClass/);
  assert.equal((renderVehiclesSource.match(/getVehicleDateSeverityClass\(/g) || []).length, 0);
});

test('empty list header korunur', function() {
  assert.match(renderVehiclesSource, /list-header-row/);
  assert.match(renderVehiclesSource, /view-list-empty/);
});

test('visible branch/user parity data-manager ownerında', function() {
  assert.match(dataManager, /getCachedMedisaVisibleList\('branches'/);
  assert.match(dataManager, /getVisibleBranches/);
  assert.match(dataManager, /getCachedMedisaVisibleList\('users'/);
  assert.match(dataManager, /getVisibleUsers/);
});

test('list CSS ellipsis/line-clamp kontratı var', function() {
  assert.match(css, /\.view-list \.list-cell:not\([\s\S]{0,200}text-overflow:\s*ellipsis/);
  assert.match(css, /\.view-list \.list-cell\.list-user[\s\S]{0,300}overflow:\s*hidden/);
  assert.match(css, /\.list-cell\.list-branch[\s\S]{0,500}line-clamp:\s*2/);
});

test('view-model business vehicle nesnesini mutate etmez', function() {
  const fnSource = extractFunctionSource(source, 'buildVehicleRenderViewModels');
  assert.doesNotMatch(fnSource, /vehicle\.[A-Za-z0-9_$]+\s*=/);
  const context = {
    activeBranchId: 'all',
    window: {
      MedisaVehicleSearch: {
        normalizeText: (value) => String(value || '').toLowerCase(),
        getFieldHits: () => ({ plate: false, brand: false, year: false, user: false })
      }
    },
    formatBrandModel: (value) => String(value),
    formatPlaka: (value) => String(value),
    formatAdSoyad: (value) => String(value),
    toTitleCase: (value) => String(value),
    formatNumber: (value) => String(value),
    getVehicleTypeLabel: (value) => value,
    getTransmissionShortLabel: (value) => value || '-',
    getVehicleDateSeverityClass: () => ''
  };
  vm.createContext(context);
  vm.runInContext(fnSource + '; result = buildVehicleRenderViewModels;', context);
  const vehicle = Object.freeze({
    id: 'v1',
    plate: '34 A',
    brandModel: 'Model',
    branchId: 'b1',
    assignedUserId: 'u1',
    km: '10',
    vehicleType: 'otomobil',
    transmission: 'otomatik'
  });
  const result = context.result([vehicle], '', {
    branchMap: { b1: { id: 'b1', name: 'Merkez' } },
    userMap: { u1: { id: 'u1', name: 'Test User' } }
  });
  assert.equal(result[0].vehicle, vehicle);
  assert.equal(vehicle.km, '10');
});

test('render metrics varsayılan kapalı ve business veri içermez', function() {
  assert.match(source, /function isVehicleRenderPerfEnabled/);
  assert.match(source, /medisa_perf_debug/);
  assert.match(source, /window\.__medisaVehicleRenderMetrics/);
  assert.doesNotMatch(extractFunctionSource(source, 'publishVehicleRenderMetrics'), /plate|userName|branchName/);
});

console.log('\nVehicle render invariants: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
