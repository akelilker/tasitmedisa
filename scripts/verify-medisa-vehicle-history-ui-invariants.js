/**
 * Taşıt Tarihçesi UI invariantleri (H1 + H2 Alternative A).
 * Çalıştır: node scripts/verify-medisa-vehicle-history-ui-invariants.js
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
const baseCss = read('tasitlar-base.css');
const extraCss = read('tasitlar-extra.css');
const packageJson = read('package.json');
const qualityGate = read('.github/scripts/quality-gate.sh');

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

function countMatches(src, re) {
  const copy = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  return (src.match(copy) || []).length;
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

function extractBetween(src, startNeedle, endNeedle) {
  const start = src.indexOf(startNeedle);
  assert.ok(start >= 0, 'başlangıç bulunamadı: ' + startNeedle.slice(0, 60));
  const end = src.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, 'bitiş bulunamadı: ' + endNeedle.slice(0, 60));
  return src.slice(start, end);
}

function extractHistoryFunctions() {
  const helpersStart = tasitlar.indexOf('function countHistoryEventsByTab');
  assert.ok(helpersStart >= 0, 'countHistoryEventsByTab bulunmalı');
  const showStart = tasitlar.indexOf('window.showVehicleHistory = function');
  assert.ok(showStart > helpersStart, 'showVehicleHistory bulunmalı');
  const closeStart = tasitlar.indexOf('window.closeVehicleHistoryModal = function');
  assert.ok(closeStart > showStart, 'closeVehicleHistoryModal bulunmalı');
  const backStart = tasitlar.indexOf('window.backFromHistoryToVehicleDetail = function');
  assert.ok(backStart > closeStart, 'backFromHistoryToVehicleDetail bulunmalı');
  const withGuard = tasitlar.indexOf('function withSaveButtonGuard', backStart);
  assert.ok(withGuard > backStart, 'history bloğu bitiş sınırı bulunmalı');
  return {
    diger: extractBetween(
      tasitlar,
      'function renderHistoryDigerEventHtml',
      'function refreshOpenVehicleHistoryList'
    ),
    switchTab: extractBetween(
      tasitlar,
      'window.switchHistoryTab = function',
      'window.closeVehicleHistoryModal = function'
    ),
    close: extractBetween(
      tasitlar,
      'window.closeVehicleHistoryModal = function',
      'window.backFromHistoryToVehicleDetail = function'
    ),
    back: extractBetween(
      tasitlar,
      'window.backFromHistoryToVehicleDetail = function',
      'function withSaveButtonGuard'
    ),
    block: tasitlar.slice(helpersStart, withGuard)
  };
}

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
  El.prototype.querySelector = function(sel) {
    return this.querySelectorAll(sel)[0] || null;
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
    if (sel.charAt(0) === '#') return node.id === sel.slice(1);
    if (sel.charAt(0) === '.') {
      const cls = sel.slice(1);
      return String(node.className || '').split(/\s+/).filter(Boolean).indexOf(cls) !== -1;
    }
    if (sel.indexOf('.') !== -1) {
      const parts = sel.split('.');
      const tag = parts[0].toUpperCase();
      if (tag && node.tagName !== tag) return false;
      return parts.slice(1).every(function(c) {
        return String(node.className || '').split(/\s+/).filter(Boolean).indexOf(c) !== -1;
      });
    }
    if (sel.indexOf('[') !== -1) {
      const m = sel.match(/^([a-z0-9-]*)\[([^=\]]+)(?:=['"]?([^'"\]]+)['"]?)?\]$/i);
      if (!m) return false;
      if (m[1] && node.tagName !== m[1].toUpperCase()) return false;
      const attr = m[2];
      const val = m[3];
      const got = node.getAttribute(attr);
      if (val == null) return got != null;
      return got === val;
    }
    return node.tagName === sel.toUpperCase();
  }
  return {
    El: El,
    document: {
      createElement: function(tag) { return new El(tag); }
    }
  };
}

function parseHydrateHistoryFragment(markup) {
  const start = markup.indexOf('id="vehicle-history-modal"');
  assert.ok(start >= 0);
  const chunk = markup.slice(start - 5, markup.indexOf('id="history-content"') + 80);
  return chunk;
}

const hydrateMarkup = extractHydrateMarkup();
const historyFns = extractHistoryFunctions();
const historyModalChunk = parseHydrateHistoryFragment(hydrateMarkup);

test('package tool:verify-vehicle-history-ui tanımlı', function() {
  assert.match(packageJson, /"tool:verify-vehicle-history-ui"\s*:\s*"node scripts\/verify-medisa-vehicle-history-ui-invariants\.js"/);
});

test('quality gate history UI verifier çalıştırır', function() {
  assert.match(qualityGate, /tool:verify-vehicle-history-ui/);
  assert.match(qualityGate, /Vehicle history UI invariants|Vehicle detail \/ Olay Ekle/);
});

test('modal markup: #vehicle-history-modal tekil', function() {
  assert.equal(countMatches(hydrateMarkup, /id="vehicle-history-modal"/g), 1);
});

test('modal markup: başlık id + dialog semantics', function() {
  assert.match(historyModalChunk, /id="vehicle-history-title"/);
  assert.match(historyModalChunk, /<h2[^>]*id="vehicle-history-title"[^>]*>\s*TAŞIT TARİHÇESİ\s*<\/h2>/);
  assert.match(historyModalChunk, /role="dialog"/);
  assert.match(historyModalChunk, /aria-modal="true"/);
  assert.match(historyModalChunk, /aria-labelledby="vehicle-history-title"/);
});

test('modal markup: close aria-label ve type=button', function() {
  assert.match(
    historyModalChunk,
    /modal-close[^>]*aria-label="Tarihçeyi Kapat"|aria-label="Tarihçeyi Kapat"[^>]*modal-close/
  );
  assert.match(historyModalChunk, /<button[^>]*class="modal-close"[^>]*type="button"|<button[^>]*type="button"[^>]*class="modal-close"/);
  assert.match(historyModalChunk, /onclick="closeVehicleHistoryModal\(\);"/);
});

test('modal markup: geri/home owner korunur', function() {
  assert.match(historyModalChunk, /backFromHistoryToVehicleDetail/);
  assert.match(historyModalChunk, /aria-label="Taşıt detayına dön"/);
  assert.match(historyModalChunk, /onclick="closeAllModals\(\)"/);
  assert.match(historyModalChunk, /aria-label="Ana sayfaya dön"/);
});

test('modal markup: tabs/content/identity tekil', function() {
  assert.equal(countMatches(hydrateMarkup, /id="history-tabs"/g), 1);
  assert.equal(countMatches(hydrateMarkup, /id="history-content"/g), 1);
  assert.equal(countMatches(hydrateMarkup, /history-vehicle-identity/g), 1);
});

test('sekme kontratı: dört canonical data-tab + label/count', function() {
  ['bakim', 'kaza', 'km', 'diger'].forEach(function(tab) {
    assert.equal(
      countMatches(historyModalChunk, new RegExp('data-tab="' + tab + '"', 'g')),
      1,
      tab + ' tekil olmalı'
    );
  });
  assert.equal(countMatches(historyModalChunk, /class="history-tab-label"/g), 4);
  assert.equal(countMatches(historyModalChunk, /class="history-tab-count"/g), 4);
  assert.equal(countMatches(historyModalChunk, /history-tab-count"[^>]*>0</g), 4);
  assert.match(historyModalChunk, /data-tab="bakim"[^>]*class="[^"]*active|class="history-tab active"[^>]*data-tab="bakim"/);
});

test('sekme kontratı: onclick owner korunur; label metni bozulmaz', function() {
  assert.match(historyModalChunk, /onclick="switchHistoryTab\('bakim'\)"/);
  assert.match(historyModalChunk, /onclick="switchHistoryTab\('kaza'\)"/);
  assert.match(historyModalChunk, /onclick="switchHistoryTab\('km'\)"/);
  assert.match(historyModalChunk, /onclick="switchHistoryTab\('diger'\)"/);
  assert.match(historyModalChunk, /history-tab-label">Bakım</);
  assert.match(historyModalChunk, /history-tab-label">Kaza</);
  assert.match(historyModalChunk, /history-tab-label">KM</);
  assert.match(historyModalChunk, /history-tab-label">Diğer</);
});

test('default tab source: showVehicleHistory bakim', function() {
  assert.match(
    historyFns.block,
    /const tab = \(initialTab && \/\^\(bakim\|kaza\|km\|diger\)\$\/\.test\(initialTab\)\) \? initialTab : 'bakim'/
  );
});

test('Escape source unchanged: prevent/stop, close yok', function() {
  const escStart = scriptCore.search(
    /document\.addEventListener\(\s*['"]keydown['"]\s*,\s*function\s*\(\s*e\s*\)\s*\{[\s\S]*?getElementById\(\s*['"]vehicle-history-modal['"]\s*\)/
  );
  assert.ok(escStart >= 0, 'history Escape keydown owner bulunmalı');
  const escEnd = scriptCore.indexOf("document.addEventListener('DOMContentLoaded'", escStart);
  assert.ok(escEnd > escStart, 'Escape bloğu bitiş sınırı bulunmalı');
  const esc = scriptCore.slice(escStart, escEnd);
  assert.match(esc, /e\.preventDefault\(\)/);
  assert.match(esc, /e\.stopPropagation\(\)/);
  assert.doesNotMatch(esc, /closeVehicleHistoryModal|backFromHistoryToVehicleDetail/);
});

test('overlay source unchanged: stopPropagation, close yok', function() {
  const overlayOpen = historyModalChunk.match(
    /id="vehicle-history-modal"[^>]*onclick="([^"]*)"/
  );
  assert.ok(overlayOpen && overlayOpen[1], 'overlay onclick bulunmalı');
  assert.match(overlayOpen[1], /event\.target === this/);
  assert.match(overlayOpen[1], /stopPropagation\(\)/);
  assert.doesNotMatch(overlayOpen[1], /closeVehicleHistoryModal/);
});

test('owner fonksiyonları mevcut', function() {
  assert.match(tasitlar, /window\.showVehicleHistory\s*=\s*function/);
  assert.match(tasitlar, /window\.switchHistoryTab\s*=\s*function/);
  assert.match(tasitlar, /function renderHistoryDigerEventHtml\s*\(/);
  assert.match(tasitlar, /window\.closeVehicleHistoryModal\s*=\s*function/);
  assert.match(tasitlar, /window\.backFromHistoryToVehicleDetail\s*=\s*function/);
  assert.match(tasitlar, /function updateHistoryTabCounts\s*\(/);
  assert.match(tasitlar, /function getEffectiveHistoryTabCounts\s*\(/);
  assert.match(tasitlar, /function hasDisplayableApprovedKmCorrectionCard\s*\(/);
  assert.match(tasitlar, /function buildHistoryEmptyHtml\s*\(/);
  assert.match(tasitlar, /function historyEventDatetimeAttr\s*\(/);
  assert.match(historyFns.switchTab, /updateHistoryTabCounts\(events,\s*vehicle\)/);
});

test('close/back handler owner değişmedi', function() {
  assert.match(historyFns.close, /resetModalState\(modal\)|__vehicleHistoryOpenedFromNotifications/);
  assert.match(historyFns.back, /currentDetailVehicleId/);
  assert.match(historyFns.back, /detailModal\.classList\.add\('active'\)/);
  assert.doesNotMatch(historyFns.back, /showVehicleDetail\s*\(/);
});

test('event ordering: unshift korunur; switchHistoryTab date-sort eklemez', function() {
  assert.match(tasitlar, /vehicle\.events\.unshift\(/);
  assert.doesNotMatch(historyFns.switchTab, /\.sort\s*\(/);
});

test('tab count filtreleri current kategorilerle aynı', function() {
  assert.match(historyFns.block, /e\.type === 'bakim'/);
  assert.match(historyFns.block, /e\.type === 'kaza'/);
  assert.match(historyFns.block, /e\.type === 'km-revize'/);
  assert.match(
    historyFns.block,
    /e\.type !== 'bakim' && e\.type !== 'kaza' && e\.type !== 'km-revize'/
  );
  assert.match(historyFns.switchTab, /updateHistoryTabCounts\(/);
  assert.doesNotMatch(historyFns.block, /createElement\(\s*['"]span['"]\s*\)[\s\S]{0,80}history-tab-count/);
});

test('event card hierarchy source kontratı', function() {
  assert.match(historyFns.switchTab, /history-item-header/);
  assert.match(historyFns.switchTab, /history-item-date/);
  assert.match(historyFns.switchTab, /history-item-body/);
  assert.match(historyFns.switchTab, /history-item-meta/);
  assert.doesNotMatch(historyFns.switchTab, /history-item-type/);
  assert.match(historyFns.diger, /history-item-header/);
  assert.match(historyFns.diger, /history-item-date/);
  assert.doesNotMatch(historyFns.diger, /history-item-type/);
  assert.match(historyFns.diger, /history-item-body history-item-summary/);
  assert.match(historyFns.diger, /history-item-meta history-item-details/);
  assert.match(tasitlar, /function historyDetailPartsHtml\s*\(/);
  assert.match(tasitlar, /history-detail-part/);
  assert.doesNotMatch(historyFns.switchTab, /font-size:\s*12px/);
  assert.doesNotMatch(historyFns.diger, /font-size:\s*12px/);
  assert.doesNotMatch(historyFns.switchTab, /edit|sil|delete|href=.*belge/i);
  assert.doesNotMatch(historyFns.diger, /Olay Ekle|openEventModal/);
});

test('escapeHtml / safe rendering korunur', function() {
  assert.match(historyFns.switchTab, /escapeHtml\(/);
  assert.match(historyFns.diger, /escapeHtml\(/);
  assert.match(historyFns.diger, /fileName/);
  assert.match(historyFns.diger, /note\.length > 120 \? note\.slice\(0, 120\) \+ '\.\.\.'/);
});

test('empty state kontratı', function() {
  assert.match(historyFns.switchTab, /buildHistoryEmptyHtml\(/);
  assert.match(historyFns.block, /history-empty-msg/);
  assert.match(historyFns.block, /Diğer tarihçe sekmelerini kontrol edebilirsiniz/);
  assert.doesNotMatch(historyFns.block, /Olay Ekle|openEventModal|writeVehicles/);
});

test('CSS owner: history namespace + mobil ≥15px', function() {
  assert.match(baseCss, /#vehicle-history-modal[^{]*\.history-tab-count/);
  assert.match(baseCss, /#vehicle-history-modal\s+\.history-item-header/);
  assert.match(baseCss, /#vehicle-history-modal\s+\.history-item-date/);
  assert.doesNotMatch(baseCss, /#vehicle-history-modal\s+\.history-item-type/);
  assert.match(baseCss, /#vehicle-history-modal\s+\.history-detail-part/);
  assert.match(baseCss, /#vehicle-history-modal\s+\.history-item-meta/);
  assert.match(baseCss, /#vehicle-history-modal\s+\.history-empty-msg/);
  assert.match(extraCss, /#vehicle-history-modal\s+\.history-item/);
  assert.match(extraCss, /#vehicle-history-modal[\s\S]{0,220}font-size:\s*15px/);
  assert.match(extraCss, /#vehicle-history-modal\s+\.history-item\s+\.history-item-date/);
  assert.doesNotMatch(extraCss, /#vehicle-history-modal\s+\.history-item\s+\.history-item-type/);
  assert.doesNotMatch(baseCss, /^\.history-item\s*\{/m);
});

test('fixture: tab count update idempotent, duplicate yok', function() {
  const { document } = createMiniDom();
  const tabs = document.createElement('div');
  tabs.id = 'history-tabs';
  ['bakim', 'kaza', 'km', 'diger'].forEach(function(tab) {
    const btn = document.createElement('button');
    btn.className = 'history-tab' + (tab === 'bakim' ? ' active' : '');
    btn.setAttribute('data-tab', tab);
    btn.setAttribute('aria-label', tab);
    const label = document.createElement('span');
    label.className = 'history-tab-label';
    label.textContent = tab;
    const count = document.createElement('span');
    count.className = 'history-tab-count';
    count.setAttribute('aria-hidden', 'true');
    count.textContent = '0';
    btn.appendChild(label);
    btn.appendChild(count);
    tabs.appendChild(btn);
  });

  const updateSrc = extractBetween(
    tasitlar,
    'function countHistoryEventsByTab',
    'function buildHistoryEmptyHtml'
  );
  const sandbox = {
    modal: { querySelectorAll: function(sel) { return tabs.querySelectorAll(sel); } },
    DOM: { vehicleHistoryModal: null },
    events: [
      { type: 'bakim' },
      { type: 'bakim' },
      { type: 'kaza' },
      { type: 'km-revize' },
      { type: 'muayene-guncelle' }
    ],
    getLatestApprovedKmCorrection: function() { return null; },
    buildKmCorrectionNoteHtml: function() { return ''; }
  };
  sandbox.DOM.vehicleHistoryModal = sandbox.modal;
  vm.createContext(sandbox);
  vm.runInContext(
    updateSrc + '\nupdateHistoryTabCounts(events);\nupdateHistoryTabCounts(events);',
    sandbox
  );
  const counts = tabs.querySelectorAll('.history-tab-count');
  assert.equal(counts.length, 4);
  assert.equal(counts[0].textContent, '2');
  assert.equal(counts[1].textContent, '1');
  assert.equal(counts[2].textContent, '1');
  assert.equal(counts[3].textContent, '1');
  assert.equal(tabs.querySelectorAll('.history-tab-label').length, 4);
});

test('KM effective count: synthetic approved card edge-cases', function() {
  const src = extractBetween(
    tasitlar,
    'function countHistoryEventsByTab',
    'function buildHistoryEmptyHtml'
  );
  function runCounts(events, approved) {
    const sandbox = {
      getLatestApprovedKmCorrection: function() {
        return approved ? { talep_tarihi: '2026-01-01', yeni_km: 12000 } : null;
      },
      buildKmCorrectionNoteHtml: function(talep) {
        return talep ? '<div class="note">x</div>' : '';
      }
    };
    vm.createContext(sandbox);
    return vm.runInContext(
      src + '\ngetEffectiveHistoryTabCounts({ id: "v1" }, ' + JSON.stringify(events) + ');',
      sandbox
    );
  }
  assert.equal(runCounts([], false).km, 0);
  assert.equal(runCounts([], true).km, 1);
  assert.equal(runCounts([{ type: 'km-revize' }], false).km, 1);
  assert.equal(runCounts([{ type: 'km-revize' }], true).km, 1);
  assert.equal(runCounts([{ type: 'km-revize' }, { type: 'km-revize' }], true).km, 2);
  const pendingSandbox = {
    getLatestApprovedKmCorrection: function() { return null; },
    buildKmCorrectionNoteHtml: function() { return ''; }
  };
  vm.createContext(pendingSandbox);
  const pending = vm.runInContext(
    src + '\ngetEffectiveHistoryTabCounts({ id: "v1" }, []);',
    pendingSandbox
  );
  assert.equal(pending.km, 0);
  assert.equal(pending.bakim, 0);
});

test('fixture: empty html write CTA içermez', function() {
  const emptySrc = extractBetween(
    tasitlar,
    'function buildHistoryEmptyHtml',
    'function historyEventDatetimeAttr'
  );
  const sandbox = {
    escapeHtml: function(s) { return String(s); },
    counts: { bakim: 0, kaza: 2, km: 0, diger: 0 }
  };
  vm.createContext(sandbox);
  const html = vm.runInContext(
    emptySrc + '\nbuildHistoryEmptyHtml("bakim", counts);',
    sandbox
  );
  assert.match(String(html), /history-empty-msg/);
  assert.match(String(html), /Bakım/);
  assert.match(String(html), /Diğer tarihçe sekmelerini kontrol edebilirsiniz/);
  assert.doesNotMatch(String(html), /Olay Ekle|button|href=/i);
});

console.log('Vehicle history UI invariants: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
