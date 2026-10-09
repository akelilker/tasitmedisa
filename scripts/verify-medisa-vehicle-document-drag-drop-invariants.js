/**
 * Belge kartı sürükle-bırak invariantleri.
 * Yeni upload endpoint'i açılmaz; kart bırakması mevcut renderRuhsatUploadForm akışına bağlanır.
 * Çalıştır: node scripts/verify-medisa-vehicle-document-drag-drop-invariants.js
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const tasitlar = read('tasitlar.js');
const extraCss = read('tasitlar-extra.css');

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

function extractBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, 'başlangıç yok: ' + startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, 'bitiş yok: ' + endMarker);
  return source.slice(start, end);
}

const cardFn = extractBetween(
  tasitlar,
  'function buildVehicleDocumentCardElement(vehicle, docKey, vehicleId) {',
  'function renderVehicleDocumentsPicker(vehicle, container) {'
);
const dropFn = extractBetween(
  tasitlar,
  'function openVehicleDocumentFromCardDrop(vehicleId, docKey, file) {',
  'function bindVehicleDocumentCardDragDrop(card, vehicleId, docKey) {'
);
const bindFn = extractBetween(
  tasitlar,
  'function bindVehicleDocumentCardDragDrop(card, vehicleId, docKey) {',
  'function buildVehicleDocumentCardElement(vehicle, docKey, vehicleId) {'
);
const uploadFn = extractBetween(
  tasitlar,
  'function renderRuhsatUploadForm(content, saveBtn, hasExistingRuhsat, documentType) {',
  'function setRuhsatUploadProgressVisible(visible, percent, indeterminate) {'
);

test('kart tıklaması mevcut modal açılışını korur ve bırakmayı aynı karta bağlar', function() {
  assert.match(cardFn, /window\.openVehicleDocumentModal\(vid, docKey\)/);
  assert.match(cardFn, /bindVehicleDocumentCardDragDrop\(card, vid, docKey\)/);
  assert.doesNotMatch(cardFn, /upload_ruhsat\.php|saveRuhsatUpload\(/);
});

test('bırakma tek PDF ister, mevcut uyarıları kullanır ve yükleme formuna devreder', function() {
  assert.match(bindFn, /Yalnızca tek dosya bırakılabilir\./);
  assert.match(bindFn, /Yalnızca PDF dosyası yüklenebilir\./);
  assert.match(bindFn, /isVehicleDocumentPdfFile\(droppedFile\)/);
  assert.match(bindFn, /openVehicleDocumentFromCardDrop\(vehicleId, docKey, droppedFile\)/);
  assert.match(bindFn, /isVehicleDocumentDesktopDragContext\(\)/);
  assert.match(bindFn, /vehicle-document-card--drag-over/);
  assert.doesNotMatch(bindFn, /upload_ruhsat\.php/);
});

test('mevcut belgede sessiz değiştirme yok; dosya mevcut yükleme formuna alınır', function() {
  assert.match(dropFn, /window\.openVehicleDocumentModal\(vid, dt\)/);
  assert.match(dropFn, /opened === false/);
  assert.match(dropFn, /!content\.querySelector\('#ruhsat-file-input'\)/);
  assert.match(dropFn, /renderRuhsatUploadForm\(content, document\.getElementById\('dinamik-olay-kaydet-btn'\), true, dt\)/);
  assert.match(uploadFn, /takePendingVehicleDocumentDrop\(pinnedVehicleId, cfg\.key\)/);
  assert.match(uploadFn, /assignRuhsatUploadFileAndDispatchChange\(stagedDropFile\)/);
  assert.match(uploadFn, /hasExistingRuhsat/);
  assert.match(uploadFn, /Yüklü Dosya Silinecektir/);
});

test('modal kapanışı ve taşıt değişimi bekleyen dosyayı temizler', function() {
  const resetFn = extractBetween(tasitlar, 'function resetModalState(modal) {', 'function showDynamicEventSaveMessage(modal, text) {');
  assert.match(resetFn, /clearPendingVehicleDocumentDrop\(\)/);
  assert.match(resetFn, /#ruhsat-file-input/);
  assert.match(tasitlar, /discardStagedVehicleDocumentFileIfVehicleChanged\(vehicleId\)/);
  assert.match(tasitlar, /pendingVehicleDocumentDrop\.vehicleId !== nextId/);
  assert.match(tasitlar, /pinned !== nextId/);
});

test('sayfa yönlendirmesi yalnız açık belgeler yüzeyinde engellenir', function() {
  assert.match(tasitlar, /function ensureVehicleDocumentPageDragGuard\(\)/);
  assert.match(tasitlar, /isVehicleDocumentDragSurfaceActive\(\)/);
  assert.match(tasitlar, /modal\.dataset\.eventType === 'documents'/);
  const guard = extractBetween(
    tasitlar,
    'function ensureVehicleDocumentPageDragGuard() {',
    'function discardStagedVehicleDocumentFileIfVehicleChanged(nextVehicleId) {'
  );
  assert.match(guard, /addEventListener\('dragover'/);
  assert.match(guard, /addEventListener\('drop'/);
  assert.match(guard, /event\.preventDefault\(\)/);
});

test('drag-over vurgusu mevcut kart owner CSS içindedir ve satış sözleşmesi ayrımı korunur', function() {
  assert.match(extraCss, /#dinamik-olay-modal #ruhsat-modal-content \.vehicle-document-card--drag-over \.vehicle-document-icon-wrap/);
  assert.match(extraCss, /\.vehicle-document-card-satis-sozlesmesi\.vehicle-document-card--drag-over \.vehicle-document-icon-wrap/);
  assert.doesNotMatch(extraCss, /\.vehicle-document-card\.vehicle-document-card-satis-sozlesmesi/);
  assert.match(extraCss, /color:\s*#4ade80/);
  assert.match(extraCss, /color:\s*#f87171/);
});

test('modül sürümü ve script-core pin tasitlar değişimine hizalıdır', function() {
  assert.match(tasitlar, /MEDISA_TASITLAR_MODULE_VERSION = '20261009\.1'/);
  assert.match(read('script-core.js'), /tasitlar:\s*'20261009\.1'/);
  assert.match(read('index.html'), /script-core\.js\?v=20261009\.2/);
  assert.match(read('sw.js'), /'\/script-core\.js\?v=20261009\.2'/);
  assert.match(read('sw.js'), /CACHE_VERSION = 'medisa-v2\.371'/);
  assert.match(read('index.html'), /style-core\.css\?v=20261009\.1/);
  assert.match(read('script-core.js'), /ayarlarJs:\s*'20261009\.1'/);
});

console.log('');
console.log('Vehicle document drag-drop invariants: ' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
