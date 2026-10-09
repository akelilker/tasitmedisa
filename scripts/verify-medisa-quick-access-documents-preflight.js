/**
 * Hızlı Erişim + belge kartı sürükle-bırak birleşik pin ve owner kontratı.
 * İki PR'nin ayrı script-core / SW kimlikleri burada yeniden kullanılmaz.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const index = read('index.html');
const sw = read('sw.js');
const core = read('script-core.js');
const dataManager = read('data-manager.js');
const tasitlar = read('tasitlar.js');
const shells = ['index.html', 'driver/index.html', 'driver/dashboard.html', 'admin/driver-report.html'];

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('PASS ' + name);
  } catch (error) {
    failed += 1;
    console.error('FAIL ' + name + ': ' + (error && error.message ? error.message : error));
  }
}

test('birleşik script-core her iki modül sürümünü taşır ve yeni shell pin kullanır', function() {
  assert.match(core, /tasitlar:\s*'20261009\.1'/);
  assert.match(core, /ayarlarJs:\s*'20261009\.1'/);
  assert.match(tasitlar, /MEDISA_TASITLAR_MODULE_VERSION = '20261009\.1'/);
  shells.forEach(function(name) {
    assert.match(read(name), /script-core\.js\?v=20261009\.3/);
    assert.doesNotMatch(read(name), /script-core\.js\?v=20261009\.1/);
    assert.doesNotMatch(read(name), /script-core\.js\?v=20261009\.2/);
  });
  assert.match(index, /style-core\.css\?v=20261009\.3/);
  assert.match(index, /data-manager\.js\?v=20261009\.4/);
  assert.doesNotMatch(index, /data-manager\.js\?v=20261009\.3/);
});

test('SW önbelleği shell pinleriyle birebir ve önceki 370 kimliğinden ayrılır', function() {
  assert.match(sw, /CACHE_VERSION = 'medisa-v2\.375'/);
  assert.doesNotMatch(sw, /medisa-v2\.370/);
  assert.doesNotMatch(sw, /medisa-v2\.371/);
  assert.doesNotMatch(sw, /medisa-v2\.372/);
  assert.doesNotMatch(sw, /medisa-v2\.373/);
  assert.doesNotMatch(sw, /medisa-v2\.374/);
  assert.match(sw, /'\/style-core\.css\?v=20261009\.3'/);
  assert.match(sw, /'\/script-core\.js\?v=20261009\.3'/);
  assert.match(sw, /'\/data-manager\.js\?v=20261009\.4'/);
});

test('Hızlı Erişim ve belge kartı drop ownerları birlikte durur', function() {
  assert.match(dataManager, /function canShowQuickAccess\(sessionData\)/);
  assert.match(dataManager, /function getQuickAccessVehicleIcon\(\)/);
  assert.match(dataManager, /stroke="currentColor"/);
  assert.match(dataManager, /stroke-width="1\.35"/);
  assert.match(dataManager, /M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0/);
  assert.doesNotMatch(dataManager, /M17 3\.34a10 10 0 1 1 -15 8\.66/);
  assert.doesNotMatch(dataManager, /M6\.2 16\.8C6\.2 8\.2 17\.8 8\.2 17\.8 16\.8H6\.2/);
  assert.doesNotMatch(dataManager, /function getQuickAccessVehicleType/);
  assert.doesNotMatch(dataManager, /M4 16l-1-5/);
  assert.match(dataManager, /function renderQuickAccessRow\(\)/);
  assert.match(dataManager, /DRIVER_DASHBOARD_URL \+ '\?vehicle=' \+ encodeURIComponent\(String\(id\)\)/);
  assert.match(index, /id="hizli-erisim-satiri"/);
  assert.match(tasitlar, /function bindVehicleDocumentCardDragDrop\(card, vehicleId, docKey\)/);
  assert.match(tasitlar, /function openVehicleDocumentFromCardDrop\(vehicleId, docKey, file\)/);
  assert.match(tasitlar, /takePendingVehicleDocumentDrop\(pinnedVehicleId, cfg\.key\)/);
  assert.doesNotMatch(tasitlar, /<<<<<<<|>>>>>>>/);
  assert.doesNotMatch(sw, /<<<<<<<|>>>>>>>/);
});

console.log('');
console.log('Quick access + documents preflight: ' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
