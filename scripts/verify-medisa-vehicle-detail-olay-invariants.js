/**
 * Taşıt detay / Olay Ekle canonical DOM kontratı (Faz 4A+).
 * Çalıştır: node scripts/verify-medisa-vehicle-detail-olay-invariants.js
 *
 * jsdom yok — kaynak kontrat + minimal fake DOM fixture.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const tasitlar = read('tasitlar.js');
const scriptCore = read('script-core.js');

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

function extractHydrateMarkup() {
  const marker = 'function hydrateMedisaVehiclesMarkup()';
  const start = tasitlar.indexOf(marker);
  assert.ok(start >= 0, 'hydrateMedisaVehiclesMarkup bulunmalı');
  const assign = tasitlar.indexOf('host.innerHTML = `', start);
  assert.ok(assign >= 0, 'hydrate innerHTML template bulunmalı');
  const tplStart = assign + 'host.innerHTML = `'.length;
  const tplEnd = tasitlar.indexOf('`;', tplStart);
  assert.ok(tplEnd > tplStart, 'hydrate template kapanışı bulunmalı');
  return tasitlar.slice(tplStart, tplEnd);
}

function countMatches(src, re) {
  const copy = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  return (src.match(copy) || []).length;
}

function extractShowVehicleDetail() {
  const start = tasitlar.indexOf('window.showVehicleDetail = function');
  assert.ok(start >= 0, 'showVehicleDetail bulunmalı');
  const next = tasitlar.indexOf('\n  window.showVehicleHistory = function', start);
  assert.ok(next > start, 'showVehicleDetail bitiş sınırı bulunmalı');
  return tasitlar.slice(start, next);
}

function extractAddEventBlock(detailSrc) {
  const start = detailSrc.indexOf('// Plaka satırı: Olay Ekle solda');
  assert.ok(start >= 0, 'Olay Ekle plaka satırı bloğu bulunmalı');
  const end = detailSrc.indexOf('// Marka/model satırı', start);
  assert.ok(end > start, 'Olay Ekle bloğu marka satırına kadar uzanmalı');
  return detailSrc.slice(start, end);
}

/** Minimal element for plate-row ensure fixture (no jsdom). */
function createMiniDom() {
  let seq = 0;
  function El(tag) {
    this.tagName = String(tag || '').toUpperCase();
    this.className = '';
    this.id = '';
    this.type = '';
    this.innerHTML = '';
    this.textContent = '';
    this.onclick = null;
    this.parentNode = null;
    this.childNodes = [];
    this.attributes = Object.create(null);
    this._uid = ++seq;
  }
  El.prototype.setAttribute = function(name, value) {
    this.attributes[name] = String(value);
    if (name === 'type') this.type = String(value);
    if (name === 'id') this.id = String(value);
    if (name === 'class') this.className = String(value);
  };
  El.prototype.getAttribute = function(name) {
    if (name === 'type') return this.type || null;
    if (name === 'id') return this.id || null;
    if (name === 'class') return this.className || null;
    return this.attributes[name] != null ? this.attributes[name] : null;
  };
  El.prototype.remove = function() {
    if (!this.parentNode) return;
    const kids = this.parentNode.childNodes;
    const i = kids.indexOf(this);
    if (i >= 0) kids.splice(i, 1);
    this.parentNode = null;
  };
  El.prototype.appendChild = function(child) {
    if (child.parentNode) child.remove();
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  };
  El.prototype.insertBefore = function(child, ref) {
    if (child.parentNode) child.remove();
    child.parentNode = this;
    if (!ref) {
      this.childNodes.push(child);
      return child;
    }
    const i = this.childNodes.indexOf(ref);
    if (i < 0) this.childNodes.push(child);
    else this.childNodes.splice(i, 0, child);
    return child;
  };
  El.prototype.querySelector = function(sel) {
    const all = this.querySelectorAll(sel);
    return all[0] || null;
  };
  El.prototype.querySelectorAll = function(sel) {
    const out = [];
    const walk = (node) => {
      if (matches(node, sel)) out.push(node);
      node.childNodes.forEach(walk);
    };
    this.childNodes.forEach(walk);
    return out;
  };
  function matches(node, sel) {
    if (!sel) return false;
    if (sel.charAt(0) === '.') {
      const cls = sel.slice(1);
      return String(node.className || '')
        .split(/\s+/)
        .filter(Boolean)
        .indexOf(cls) !== -1;
    }
    return false;
  }
  const document = {
    createElement: function(tag) {
      return new El(tag);
    }
  };
  return { El: El, document: document };
}

function buildCanonicalPlateRow(document) {
  const plateRow = document.createElement('div');
  plateRow.className = 'detail-plate-row';
  const plate = document.createElement('div');
  plate.className = 'detail-plate';
  plate.textContent = '34 ABC 123';
  plateRow.appendChild(plate);
  return plateRow;
}

function runAddEventBlock(blockSrc, plateRow, vehicle, openEventModal, document) {
  const sandbox = {
    plateRow: plateRow,
    vehicle: vehicle,
    openEventModal: openEventModal,
    document: document
  };
  vm.createContext(sandbox);
  vm.runInContext(
    '(function(){\n' + blockSrc + '\n})();',
    sandbox
  );
}

const hydrateMarkup = extractHydrateMarkup();
const detailSrc = extractShowVehicleDetail();
const addEventBlock = extractAddEventBlock(detailSrc);

test('canonical hydrate: detail-plate-row tam bir kez', function() {
  assert.equal(countMatches(hydrateMarkup, /class="detail-plate-row"/g), 1);
});

test('canonical hydrate: history-add-event-btn yok', function() {
  assert.equal(countMatches(hydrateMarkup, /history-add-event-btn/g), 0);
});

test('canonical hydrate: marka satırında history/add-event yok', function() {
  const brandStart = hydrateMarkup.indexOf('detail-brand-year-row');
  assert.ok(brandStart >= 0);
  const brandChunk = hydrateMarkup.slice(brandStart, brandStart + 280);
  assert.doesNotMatch(brandChunk, /history-btn-minimal|history-add-event-btn/);
});

test('showVehicleDetail current path Olay Ekle butonunu plaka satırına sağlar', function() {
  assert.match(addEventBlock, /history-add-event-btn/);
  assert.match(addEventBlock, /openEventModal\(\s*['"]menu['"]\s*,\s*vehicle\.id\s*\)/);
  assert.match(addEventBlock, /createElement\(\s*['"]button['"]\s*\)/);
});

test('fixture: ilk detay render sonrası add-event sayısı 1', function() {
  const { document } = createMiniDom();
  const plateRow = buildCanonicalPlateRow(document);
  const calls = [];
  runAddEventBlock(
    addEventBlock,
    plateRow,
    { id: 'v1' },
    function(type, id) { calls.push([type, id]); },
    document
  );
  const buttons = plateRow.querySelectorAll('.history-add-event-btn');
  assert.equal(buttons.length, 1);
  assert.match(String(buttons[0].className), /history-add-event-btn/);
  assert.match(String(buttons[0].innerHTML || buttons[0].textContent), /Olay Ekle/);
  assert.equal(typeof buttons[0].onclick, 'function');
  buttons[0].onclick();
  assert.deepEqual(calls, [['menu', 'v1']]);
});

test('fixture: tekrar detay render sonrası add-event sayısı 1 (birikim yok)', function() {
  const { document } = createMiniDom();
  const plateRow = buildCanonicalPlateRow(document);
  const calls = [];
  const open = function(type, id) { calls.push([type, id]); };
  runAddEventBlock(addEventBlock, plateRow, { id: 'v1' }, open, document);
  runAddEventBlock(addEventBlock, plateRow, { id: 'v2' }, open, document);
  runAddEventBlock(addEventBlock, plateRow, { id: 'v2' }, open, document);
  const buttons = plateRow.querySelectorAll('.history-add-event-btn');
  assert.equal(buttons.length, 1);
  buttons[0].onclick();
  assert.deepEqual(calls[calls.length - 1], ['menu', 'v2']);
});

test('marka satırı migration cleanup source mevcut; current path buton üretmez', function() {
  assert.match(detailSrc, /Eski konumdan butonları temizle/);
  assert.match(detailSrc, /brandYearRow\.querySelector\('\.history-add-event-btn'\)/);
  assert.doesNotMatch(
    detailSrc,
    /brandYearRow\.appendChild\(\s*addEventBtn\s*\)|brandYearRow\.insertBefore\(\s*addEventBtn/
  );
});

test('toolbar history dual-class ve belge butonu source kontratı', function() {
  assert.equal(
    countMatches(detailSrc, /className\s*=\s*'vehicle-history-btn history-btn-minimal'/g),
    1
  );
  assert.equal(countMatches(detailSrc, /className\s*=\s*'vehicle-ruhsat-btn'/g), 1);
  assert.match(detailSrc, /openVehicleHistoryFromDetailButton/);
  assert.match(detailSrc, /openVehicleDocumentsFromDetailButton/);
});

test('Olay menü/form owner source dokunulmamış (window.openEventModal)', function() {
  assert.match(tasitlar, /window\.openEventModal\s*=\s*function/);
  assert.match(tasitlar, /function openEventModalBody\s*\(/);
  assert.match(tasitlar, /EVENT_MENU_GROUPS/);
  assert.match(tasitlar, /id="event-menu-modal"/);
  assert.match(tasitlar, /id="dinamik-olay-modal"/);
});

test('Belge/Ruhsat handler owner source korunur', function() {
  assert.match(tasitlar, /function openVehicleDocumentsFromDetailButton\s*\(/);
  assert.match(detailSrc, /openVehicleDocumentsFromDetailButton\(\s*e\s*,\s*vehicleId\s*\)/);
});

test('duplicate id: hydrate vehicle detail zorunlu id’ler tekil', function() {
  ['vehicle-detail-modal', 'vehicle-detail-content', 'event-menu-modal', 'dinamik-olay-modal', 'vehicle-history-modal']
    .forEach(function(id) {
      assert.equal(countMatches(hydrateMarkup, new RegExp('id="' + id + '"', 'g')), 1, id + ' tekil olmalı');
    });
});

test('F1/F2/F4 legacy fallback source korunur (bu turda silinmez)', function() {
  assert.match(detailSrc, /let plateRow = contentEl\.querySelector\('\.detail-plate-row'\)/);
  assert.match(detailSrc, /if \(!plateRow\)/);
  assert.match(addEventBlock, /existingPlateHistoryBtn/);
  assert.match(detailSrc, /Eski konumdan butonları temizle/);
});

test('main shell vehicles requiredIds hâlâ detay/olay modallarını içerir', function() {
  assert.match(
    scriptCore,
    /requiredIds:\s*\[[^\]]*vehicle-detail-modal[^\]]*event-menu-modal[^\]]*dinamik-olay-modal[^\]]*vehicle-history-modal/
  );
});

console.log('Vehicle detail/Olay invariants: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
