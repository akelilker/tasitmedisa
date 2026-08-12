/**
 * Satış Sözleşmesi belgesi — kaynak kontrat invariantleri.
 * Çalıştır: node scripts/verify-medisa-satis-sozlesmesi-invariants.js
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const tasitlar = read('tasitlar.js');
const corePhp = read('core.php');
const uploadPhp = read('upload_ruhsat.php');
const notifications = read('notifications.js');
const gitignore = read('.gitignore').replace(/\r\n/g, '\n');
const scriptCore = read('script-core.js');
const sw = read('sw.js');
const packageJson = read('package.json');
const qualityGate = read('.github/scripts/quality-gate.sh');

let passed = 0;
let failed = 0;
const pendingAsync = [];
function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      pendingAsync.push(
        result.then(function() {
          passed += 1;
          console.log('PASS ' + name);
        }).catch(function(error) {
          failed += 1;
          console.error('FAIL ' + name + ': ' + (error && error.message ? error.message : error));
        })
      );
      return;
    }
    passed += 1;
    console.log('PASS ' + name);
  } catch (error) {
    failed += 1;
    console.error('FAIL ' + name + ': ' + error.message);
  }
}

function extractBetween(src, startNeedle, endNeedle) {
  const start = src.indexOf(startNeedle);
  assert.ok(start >= 0, 'başlangıç bulunamadı: ' + startNeedle.slice(0, 80));
  const end = src.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, 'bitiş bulunamadı: ' + endNeedle.slice(0, 80));
  return src.slice(start, end);
}

function loadArchiveHelpers() {
  const block = extractBetween(
    tasitlar,
    'function getLatestSatisEvent(vehicle) {',
    'function getVehicleDateSeverityClass(vehicle) {'
  );
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(
    block +
      '\n;this.getVehicleArchiveReason = getVehicleArchiveReason;' +
      '\n;this.getVehicleArchiveStatusLabel = getVehicleArchiveStatusLabel;' +
      '\n;this.vehicleAllowsSatisSozlesmesi = vehicleAllowsSatisSozlesmesi;',
    sandbox
  );
  return sandbox;
}

function extractDocumentKeysFn() {
  const start = tasitlar.indexOf('function getVehicleDocumentKeysForVehicle(vehicle) {');
  assert.ok(start >= 0, 'getVehicleDocumentKeysForVehicle bulunmalı');
  const end = tasitlar.indexOf('\n  function getVehicleDocumentIconSvg', start);
  assert.ok(end > start, 'getVehicleDocumentKeysForVehicle bitiş sınırı');
  return tasitlar.slice(start, end);
}

function loadDocumentKeysHelpers() {
  const archive = loadArchiveHelpers();
  const keysFn = extractDocumentKeysFn();
  const sandbox = {
    window: {
      MedisaVehicleNotificationDomain: {
        vehicleNeedsK2Belgesi: function() { return false; },
        vehicleNeedsTakograf: function() { return false; }
      }
    },
    getVehicleArchiveReason: archive.getVehicleArchiveReason,
    vehicleAllowsSatisSozlesmesi: archive.vehicleAllowsSatisSozlesmesi
  };
  vm.createContext(sandbox);
  vm.runInContext(
    keysFn + '\n;this.getVehicleDocumentKeysForVehicle = getVehicleDocumentKeysForVehicle;',
    sandbox
  );
  return sandbox;
}

test('source: VEHICLE_DOCUMENT_TYPES satis_sozlesmesi sözlüğü', function() {
  assert.match(tasitlar, /satis_sozlesmesi:\s*\{/);
  assert.match(tasitlar, /pathField:\s*'satisSozlesmesiPath'/);
  assert.match(tasitlar, /label:\s*'Satış Sözleşmesi'/);
  assert.match(tasitlar, /title:\s*'SATIŞ SÖZLEŞMESİ'/);
  assert.match(tasitlar, /uploadButton:\s*'Satış Sözleşmesi Yükle'/);
  assert.match(tasitlar, /eventType:\s*'satis-sozlesmesi-yukle'|satis-sozlesmesi-yukle':\s*'Satış Sözleşmesi'/);
});

test('source: satış/pert formunda işlem türü seçimi', function() {
  assert.match(tasitlar, /radioRow\('İşlem Türü',\s*'satis',\s*'pert',\s*'Satış',\s*'Pert'\)/);
  assert.match(tasitlar, /vehicle\.arsivNedeni\s*=\s*islemTuru/);
  assert.match(tasitlar, /arsivNedeni:\s*islemTuru/);
  assert.match(tasitlar, /pertIsaret:\s*islemTuru\s*===\s*'pert'/);
});

test('source: satış/pert sonrası soru akışı (başarılı kayıt sonrası)', function() {
  assert.match(tasitlar, /Satış Sözleşmesini Yüklediniz mi\?/);
  assert.match(tasitlar, /Satış Sözleşmesini Şimdi Yüklemek İster misiniz\?/);
  assert.match(tasitlar, /function runSatisSozlesmesiPromptFlow/);
  assert.match(tasitlar, /function askSatisSozlesmesiConfirm/);
  assert.match(tasitlar, /id="satis-sozlesmesi-confirm-modal"/);
  assert.doesNotMatch(
    extractBetween(tasitlar, 'window.saveSatisPert = function()', 'function countHistoryEventsByTab'),
    /window\.confirm\s*\(/
  );
  const saveBlock = extractBetween(tasitlar, 'window.saveSatisPert = function()', 'function countHistoryEventsByTab');
  assert.match(saveBlock, /writeVehicles\(vehicles\)\.then/);
  assert.match(saveBlock, /islemTuru\s*===\s*'pert'/);
  assert.match(saveBlock, /Taşıt pert işlemi kaydedildi\. Taşıt arşive taşındı\./);
  assert.match(saveBlock, /Taşıt satış işlemi kaydedildi\./);
  assert.match(saveBlock, /runSatisSozlesmesiPromptFlow\(vehicleId\)/);
  assert.doesNotMatch(
    saveBlock,
    /if\s*\(\s*islemTuru\s*===\s*'pert'\s*\)\s*\{[\s\S]*?refreshUiAfterSatisArchive\(false\)/
  );
});

test('domain: aktif / pert / satış / legacy sınıflandırma', function() {
  const h = loadArchiveHelpers();
  assert.equal(h.getVehicleArchiveReason({ satildiMi: false }), null);
  assert.equal(h.getVehicleArchiveReason({ satildiMi: true, arsivNedeni: 'satis' }), 'satis');
  assert.equal(h.getVehicleArchiveReason({ satildiMi: true, arsivNedeni: 'pert' }), 'pert');
  assert.equal(
    h.getVehicleArchiveReason({
      satildiMi: true,
      events: [{ type: 'satis', data: { arsivNedeni: 'satis', pertIsaret: true } }]
    }),
    'satis',
    'kanonik event nedeni legacy pertIsaret değerini ezer'
  );
  assert.equal(
    h.getVehicleArchiveReason({
      satildiMi: true,
      events: [{ type: 'satis', data: { arsivNedeni: 'pert', pertIsaret: false } }]
    }),
    'pert',
    'kanonik pert nedeni legacy false değerini ezer'
  );
  assert.equal(
    h.getVehicleArchiveReason({ satildiMi: true, arsivNedeni: 'hurda' }),
    null,
    'geçersiz açık arşiv nedeni fail-closed'
  );
  assert.equal(h.getVehicleArchiveReason({ satildiMi: true }), 'satis', 'legacy satildiMi → satış');
  assert.equal(
    h.getVehicleArchiveReason({
      satildiMi: true,
      events: [{ type: 'satis', data: { pertIsaret: true } }]
    }),
    'pert',
    'legacy pertIsaret → pert'
  );
  assert.equal(h.getVehicleArchiveStatusLabel({ satildiMi: false }), '', 'aktif → etiket yok');
  assert.equal(h.getVehicleArchiveStatusLabel({ satildiMi: true, arsivNedeni: 'satis' }), 'SATILDI');
  assert.equal(h.getVehicleArchiveStatusLabel({ satildiMi: true, arsivNedeni: 'pert' }), 'PERT');
  assert.equal(
    h.getVehicleArchiveStatusLabel({
      satildiMi: true,
      events: [{ type: 'satis', data: { pertIsaret: true } }]
    }),
    'PERT',
    'legacy pert → PERT'
  );
  assert.doesNotMatch(
    String(h.getVehicleArchiveStatusLabel({ satildiMi: true, arsivNedeni: 'pert' })),
    /SATILDI/
  );
  assert.equal(h.vehicleAllowsSatisSozlesmesi({ satildiMi: false }), false, 'aktif → sözleşme yok');
  assert.equal(h.vehicleAllowsSatisSozlesmesi({ satildiMi: true, arsivNedeni: 'satis' }), true);
  assert.equal(h.vehicleAllowsSatisSozlesmesi({ satildiMi: true, arsivNedeni: 'pert' }), true);
  assert.equal(
    h.vehicleAllowsSatisSozlesmesi({
      satildiMi: true,
      events: [{ type: 'satis', data: { pertIsaret: true } }]
    }),
    true,
    'legacy pert → sözleşme var'
  );
});

test('source: arşiv kart/liste/detay etiketleri helper üzerinden', function() {
  assert.match(tasitlar, /function getVehicleArchiveStatusLabel\(vehicle\)/);
  assert.match(tasitlar, /getVehicleArchiveStatusLabel\(v\)/);
  assert.match(tasitlar, /archive-status-line/);
  assert.match(tasitlar, /detail-archive-status-badge/);
  assert.doesNotMatch(tasitlar, /archive-satildi-line/);
  assert.doesNotMatch(tasitlar, /detail-sold-badge/);
  assert.doesNotMatch(tasitlar, /soldBadge\.textContent\s*=\s*'SATILDI'/);
  assert.doesNotMatch(
    tasitlar,
    /isArchive \? ' <span style="color:#d40000;font-size:12px;">\(SATILDI\)<\/span>'/
  );
});

test('source: arşiv ve satış sözleşmesi helperları modül içinde kalır', function() {
  assert.doesNotMatch(tasitlar, /function isVehicleSold\s*\(/);
  assert.doesNotMatch(tasitlar, /function isVehiclePert\s*\(/);
  assert.doesNotMatch(
    tasitlar,
    /window\.(?:isVehicleSold|isVehiclePert|getVehicleArchiveReason|getVehicleArchiveStatusLabel|vehicleAllowsSatisSozlesmesi|openSatisSozlesmesiUploadForVehicle|runSatisSozlesmesiPromptFlow)\s*=/
  );
});

test('source: tarihçe satis chip Satış/Pert ayrımı', function() {
  assert.match(tasitlar, /function getHistoryEventTypeLabel\(eventType,\s*event\)/);
  assert.match(tasitlar, /getHistoryEventTypeLabel\(eventType,\s*event\)/);
  const labelFn = extractBetween(
    tasitlar,
    'function getHistoryEventTypeLabel(eventType, event) {',
    'window.showVehicleHistory = function'
  );
  const documentLabelOwner = extractBetween(
    tasitlar,
    'const VEHICLE_DOCUMENT_UPLOAD_EVENT_LABELS = {',
    'function getVehicleDocumentConfig(documentType) {'
  );
  const sandbox = {
    toTitleCase: function(s) { return String(s || ''); }
  };
  vm.createContext(sandbox);
  vm.runInContext(documentLabelOwner + labelFn + '\n;this.getHistoryEventTypeLabel = getHistoryEventTypeLabel;', sandbox);
  assert.equal(
    sandbox.getHistoryEventTypeLabel('satis', { data: { arsivNedeni: 'satis' } }),
    'Satış'
  );
  assert.equal(
    sandbox.getHistoryEventTypeLabel('satis', { data: { arsivNedeni: 'pert' } }),
    'Pert'
  );
  assert.equal(
    sandbox.getHistoryEventTypeLabel('satis', { data: { pertIsaret: true } }),
    'Pert'
  );
  assert.equal(sandbox.getHistoryEventTypeLabel('satis', { data: {} }), 'Satış');
  assert.equal(sandbox.getHistoryEventTypeLabel('satis-sozlesmesi-yukle'), 'Satış Sözleşmesi');
});

test('UI keys: kart stoktan düşen satış ve pertte üretilir', function() {
  const h = loadDocumentKeysHelpers();
  const active = h.getVehicleDocumentKeysForVehicle({ satildiMi: false });
  assert.ok(!active.includes('satis_sozlesmesi'), 'aktifte kart yok');
  const pert = h.getVehicleDocumentKeysForVehicle({ satildiMi: true, arsivNedeni: 'pert' });
  assert.ok(pert.includes('satis_sozlesmesi'), 'pertte kart var');
  const sold = h.getVehicleDocumentKeysForVehicle({ satildiMi: true, arsivNedeni: 'satis' });
  assert.ok(sold.includes('satis_sozlesmesi'), 'yeni satışta kart var');
  const legacySold = h.getVehicleDocumentKeysForVehicle({ satildiMi: true });
  assert.ok(legacySold.includes('satis_sozlesmesi'), 'legacy satılmışta kart var');
  const legacyPert = h.getVehicleDocumentKeysForVehicle({
    satildiMi: true,
    events: [{ type: 'satis', data: { pertIsaret: true } }]
  });
  assert.ok(legacyPert.includes('satis_sozlesmesi'), 'legacy pertIsaret kart var');
  assert.doesNotMatch(extractDocumentKeysFn(), /\.splice\s*\(/, 'render sırası key listesinden yönetilmemeli');
});

test('source: belge satır yerleşimi satış tekli / ruhsat tekli / sigorta+kasko', function() {
  const pickerBlock = extractBetween(
    tasitlar,
    'function renderVehicleDocumentsPicker(vehicle, container) {',
    'function setRuhsatSaveBtnVisibility'
  );
  assert.match(
    pickerBlock,
    /allowedKeys\.has\('satis_sozlesmesi'\)[\s\S]*?keys:\s*\['satis_sozlesmesi'\][\s\S]*?keys:\s*\['ruhsat'\][\s\S]*?keys:\s*\['sigorta',\s*'kasko'\]/
  );
  assert.doesNotMatch(
    pickerBlock,
    /keys:\s*\['ruhsat',\s*'satis_sozlesmesi'\]/
  );
  assert.match(
    tasitlar,
    /docKey\s*===\s*'satis_sozlesmesi'\s*\?\s*' vehicle-document-card-satis-sozlesmesi'/
  );
});

test('source: satış sözleşmesi kırmızı ikon CSS kontratı', function() {
  const extraCss = read('tasitlar-extra.css');
  assert.match(
    extraCss,
    /\.vehicle-document-card-satis-sozlesmesi\s+\.vehicle-document-icon-wrap\s*\{[^}]*color:\s*#ef4444/
  );
  assert.match(
    extraCss,
    /\.vehicle-document-card-satis-sozlesmesi:hover\s+\.vehicle-document-icon-wrap[\s\S]*?color:\s*#f87171/
  );
  assert.match(
    extraCss,
    /\.vehicle-document-card-satis-sozlesmesi:focus-visible\s+\.vehicle-document-icon-wrap/
  );
  assert.doesNotMatch(extraCss, /\.vehicle-document-card\.vehicle-document-card-satis-sozlesmesi/);
  assert.match(
    extraCss,
    /drop-shadow\(0 0 7px rgba\(239,\s*68,\s*68,\s*0\.28\)\)/
  );
  assert.match(
    extraCss,
    /\.vehicle-document-icon-wrap\s*\{[^}]*color:\s*#22c55e/
  );
});

test('PHP: config + preserve + archive helpers + upload gate', function() {
  assert.match(corePhp, /function medisaGetVehicleArchiveReason/);
  assert.doesNotMatch(corePhp, /function medisaIsVehicleSold/);
  assert.doesNotMatch(corePhp, /function medisaIsVehiclePert/);
  assert.match(corePhp, /function medisaVehicleAllowsSatisSozlesmesi/);
  assert.match(corePhp, /'satis_sozlesmesi'\s*=>/);
  assert.match(corePhp, /'pathField'\s*=>\s*'satisSozlesmesiPath'/);
  assert.match(corePhp, /'dir'\s*=>\s*'satis_sozlesmesi'/);
  assert.match(corePhp, /satisSozlesmesiPath/);
  const preserve = extractBetween(
    corePhp,
    'function medisaSavePreserveVehicleDocumentReferences',
    'function medisaSaveApplyVehicleMutation'
  );
  assert.match(preserve, /satisSozlesmesiPath/);
  assert.match(uploadPhp, /satis-sozlesmesi-yukle/);
  assert.match(uploadPhp, /Satış Sözleşmesi/);
  assert.match(uploadPhp, /medisaVehicleAllowsSatisSozlesmesi\(\$preVehicle\)/);
  assert.match(uploadPhp, /medisaVehicleAllowsSatisSozlesmesi\(\$vehicle\)/);
  assert.match(uploadPhp, /Satış Sözleşmesi yalnızca stoktan düşen \(satış veya pert\) taşıtlara yüklenebilir/);
  assert.match(uploadPhp, /\$documentEventExtra\['vehicleId'\]\s*=\s*\(string\)\$vehicleId/);
  assert.match(uploadPhp, /\$documentEventExtra\['plakaSnapshot'\]/);
  assert.doesNotMatch(uploadPhp, /Pert nedeniyle arşivlenen taşıtlara Satış Sözleşmesi yüklenemez/);
});

test('notifications + history label registry', function() {
  assert.match(notifications, /'satis-sozlesmesi-yukle'\s*:\s*'Sat/);
  assert.match(notifications, /evData\.plakaSnapshot\s*\|\|\s*plate/);
  assert.match(tasitlar, /const VEHICLE_DOCUMENT_UPLOAD_EVENT_LABELS\s*=\s*\{/);
  assert.match(tasitlar, /function getVehicleDocumentUploadEventLabel\(eventType, data\)/);
  assert.equal(
    (tasitlar.match(/'satis-sozlesmesi-yukle'\s*:\s*'Satış Sözleşmesi'/g) || []).length,
    1,
    'taşıt tarihçesinde belge event etiketi tek registry sahibi olmalı'
  );
  assert.doesNotMatch(tasitlar, /function getVehicleDocumentUploadLabel\(type, data\)/);
});

test('gitignore runtime klasörleri', function() {
  assert.match(gitignore, /(^|\n)data\/satis_sozlesmesi\/(\n|$)/);
  assert.match(gitignore, /(^|\n)data\/satis_sozlesmesi_preview\/(\n|$)/);
});

test('source: kompakt onay modalı ortak owner sınıfı', function() {
  const styleCore = read('style-core.css');
  const ayarlarCss = read('ayarlar.css');
  const ayarlarJs = read('ayarlar.js');
  const indexHtml = read('index.html');
  assert.match(
    tasitlar,
    /id="satis-sozlesmesi-confirm-modal"[^>]*compact-confirm-modal/
  );
  assert.match(ayarlarJs, /id="cache-confirm-modal"[^>]*compact-confirm-modal/);
  assert.match(indexHtml, /id="info-modal"[^>]*compact-confirm-modal/);
  // Ortak owner: style-core (Taşıtlar yolunda ayarlar.css yokken de kompakt kalsın)
  assert.match(styleCore, /\.compact-confirm-modal\.modal-overlay\s+\.modal-container/);
  assert.match(
    styleCore,
    /\.compact-confirm-modal\.modal-overlay\s+\.modal-container[\s\S]*?height:\s*auto\s*!important/
  );
  assert.match(styleCore, /\.compact-confirm-modal\s+\.compact-confirm-message/);
  assert.match(tasitlar, /id="satis-sozlesmesi-confirm-message"[^>]*compact-confirm-message/);
  // Cache sabit yükseklik override ayarlar.css'te kalır; ortak height:auto owner style-core'da
  assert.match(ayarlarCss, /#cache-confirm-modal\.compact-confirm-modal\s+\.modal-container/);
  assert.doesNotMatch(
    ayarlarCss,
    /\.compact-confirm-modal\.modal-overlay\s+\.modal-container[\s\S]*?height:\s*auto\s*!important/
  );
  assert.doesNotMatch(
    tasitlar,
    /#satis-sozlesmesi-confirm-modal\s*\{[^}]*height:\s*100%/
  );
  assert.doesNotMatch(tasitlar, /#satis-sozlesmesi-confirm-modal\s+\.modal-container/);
  // Opak modal-open kuralı kompakt onayı hariç tutmalı; şeffaf overlay specificity yeterli olmalı
  assert.match(
    styleCore,
    /\.modal-overlay\.active:not\(\.compact-confirm-modal\)/
  );
  assert.match(
    styleCore,
    /body:not\(\.dashboard-page\):not\(\.login-page\):not\(\.admin-report-page\)\.modal-open\s+\.compact-confirm-modal\.modal-overlay\.active/
  );
  assert.match(
    styleCore,
    /rgba\(\s*8\s*,\s*13\s*,\s*22\s*,\s*0\.55\s*\)/
  );
  assert.match(
    styleCore,
    /body\.modal-open:has\(\.compact-confirm-modal\.active\)\s+#vehicle-detail-modal\.modal-overlay\.active/
  );
});

test('source: openSatisSozlesmesiUploadForVehicle setTimeout yarışı yok', function() {
  const openFn = extractBetween(
    tasitlar,
    'function openSatisSozlesmesiUploadForVehicle(vehicleId)',
    'function runSatisSozlesmesiPromptFlow'
  );
  assert.doesNotMatch(openFn, /setTimeout\s*\(/);
  assert.doesNotMatch(openFn, /showVehicleDetail\s*\(/);
  assert.match(openFn, /openVehicleDocumentModal\s*\(\s*vid\s*,\s*'satis_sozlesmesi'\s*\)/);
  assert.doesNotMatch(tasitlar, /setTimeout\s*\(\s*function\s*\(\)\s*\{[\s\S]*?openVehicleDocumentModal[\s\S]*?\}\s*,\s*120\s*\)/);
});

test('behavior: openSatisSozlesmesiUploadForVehicle sold+pert gate + doğrudan belge modalı', function() {
  const archive = loadArchiveHelpers();
  const openFn = extractBetween(
    tasitlar,
    'function openSatisSozlesmesiUploadForVehicle(vehicleId)',
    'function runSatisSozlesmesiPromptFlow'
  );
  const vehicles = [
    { id: 'sold-1', satildiMi: true, arsivNedeni: 'satis' },
    { id: 'pert-1', satildiMi: true, arsivNedeni: 'pert' },
    { id: 'legacy-pert-1', satildiMi: true, events: [{ type: 'satis', data: { pertIsaret: true } }] },
    { id: 'active-1', satildiMi: false }
  ];
  const openCalls = [];
  const sandbox = {
    window: {
      currentDetailVehicleId: null,
      openVehicleDocumentModal: function(vid, dt) {
        openCalls.push([String(vid), String(dt)]);
      },
      showVehicleDetail: function() {
        throw new Error('showVehicleDetail çağrılmamalı');
      }
    },
    readVehicles: function() { return vehicles; },
    vehicleAllowsSatisSozlesmesi: archive.vehicleAllowsSatisSozlesmesi
  };
  vm.createContext(sandbox);
  vm.runInContext(
    openFn + '\n;this.openSatisSozlesmesiUploadForVehicle = openSatisSozlesmesiUploadForVehicle;',
    sandbox
  );

  sandbox.openSatisSozlesmesiUploadForVehicle('sold-1');
  assert.equal(sandbox.window.currentDetailVehicleId, 'sold-1');
  assert.deepEqual(openCalls, [['sold-1', 'satis_sozlesmesi']]);

  openCalls.length = 0;
  sandbox.window.currentDetailVehicleId = null;
  sandbox.openSatisSozlesmesiUploadForVehicle('pert-1');
  assert.equal(sandbox.window.currentDetailVehicleId, 'pert-1', 'pert → context sabitlenir');
  assert.deepEqual(openCalls, [['pert-1', 'satis_sozlesmesi']], 'pert → belge modalı açılır');

  openCalls.length = 0;
  sandbox.window.currentDetailVehicleId = null;
  sandbox.openSatisSozlesmesiUploadForVehicle('legacy-pert-1');
  assert.equal(sandbox.window.currentDetailVehicleId, 'legacy-pert-1');
  assert.deepEqual(openCalls, [['legacy-pert-1', 'satis_sozlesmesi']], 'legacy pert → belge modalı açılır');

  openCalls.length = 0;
  sandbox.window.currentDetailVehicleId = null;
  sandbox.openSatisSozlesmesiUploadForVehicle('active-1');
  assert.equal(sandbox.window.currentDetailVehicleId, null, 'aktif → context sabitlenmez');
  assert.equal(openCalls.length, 0, 'aktif → belge modalı açılmaz');

  sandbox.openSatisSozlesmesiUploadForVehicle('');
  assert.equal(openCalls.length, 0, 'boş id → no-op');
});

test('behavior: PHP sold/pert allow + aktif deny + satisSozlesmesiPath preserve', function() {
  // medisaSaveVehicleNeedsK2/Takograf preserve dalında çağrılır; stub ile izole et.
  const helpers = extractBetween(
    corePhp,
    'function medisaGetLatestSatisEvent($vehicle) {',
    'function medisaSaveApplyVehicleMutation'
  );
  assert.match(helpers, /function medisaSavePreserveVehicleDocumentReferences/);
  assert.match(helpers, /function medisaVehicleAllowsSatisSozlesmesi/);
  assert.match(helpers, /satisSozlesmesiPath/);
  const phpSrc = [
    '<?php',
    'error_reporting(E_ALL);',
    'function medisaSaveVehicleNeedsK2($vehicle) { return false; }',
    'function medisaSaveVehicleNeedsTakograf($vehicle) { return false; }',
    helpers,
    '$cases = [];',
    "$cases[] = medisaGetVehicleArchiveReason(['satildiMi' => true, 'arsivNedeni' => 'satis']) === 'satis';",
    "$cases[] = medisaGetVehicleArchiveReason(['satildiMi' => true, 'arsivNedeni' => 'pert']) === 'pert';",
    "$cases[] = medisaGetVehicleArchiveReason(['satildiMi' => true, 'events' => [['type' => 'satis', 'data' => ['arsivNedeni' => 'satis', 'pertIsaret' => true]]]]) === 'satis';",
    "$cases[] = medisaGetVehicleArchiveReason(['satildiMi' => true, 'events' => [['type' => 'satis', 'data' => ['arsivNedeni' => 'pert', 'pertIsaret' => false]]]]) === 'pert';",
    "$cases[] = medisaGetVehicleArchiveReason(['satildiMi' => true, 'arsivNedeni' => 'hurda']) === null;",
    "$cases[] = medisaGetVehicleArchiveReason(['satildiMi' => false]) === null;",
    "$cases[] = medisaVehicleAllowsSatisSozlesmesi(['satildiMi' => false]) === false;",
    "$cases[] = medisaVehicleAllowsSatisSozlesmesi(['satildiMi' => true, 'arsivNedeni' => 'satis']) === true;",
    "$cases[] = medisaVehicleAllowsSatisSozlesmesi(['satildiMi' => true, 'arsivNedeni' => 'pert']) === true;",
    "$cases[] = medisaVehicleAllowsSatisSozlesmesi(['satildiMi' => true, 'events' => [['type' => 'satis', 'data' => ['pertIsaret' => true]]]]) === true;",
    "$preserved = medisaSavePreserveVehicleDocumentReferences(",
    "  ['satisSozlesmesiPath' => 'data/satis_sozlesmesi/old.pdf', 'ruhsatPath' => 'data/ruhsat/a.pdf'],",
    "  ['satisSozlesmesiPath' => '', 'ruhsatPath' => 'data/ruhsat/a.pdf']",
    ');',
    "$cases[] = ($preserved['satisSozlesmesiPath'] ?? '') === 'data/satis_sozlesmesi/old.pdf';",
    "$kept = medisaSavePreserveVehicleDocumentReferences(",
    "  ['satisSozlesmesiPath' => 'data/satis_sozlesmesi/old.pdf'],",
    "  ['satisSozlesmesiPath' => 'data/satis_sozlesmesi/new.pdf']",
    ');',
    "$cases[] = ($kept['satisSozlesmesiPath'] ?? '') === 'data/satis_sozlesmesi/new.pdf';",
    'foreach ($cases as $i => $ok) {',
    '  if (!$ok) { fwrite(STDERR, "PHP case fail #" . $i . PHP_EOL); exit(1); }',
    '}',
    'echo "ok", PHP_EOL;',
    ''
  ].join('\n');
  const tmp = path.join(ROOT, 'scripts', '.tmp-verify-satis-sozlesmesi-php.php');
  fs.writeFileSync(tmp, phpSrc, 'utf8');
  try {
    const r = spawnSync('php', [tmp], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, 'PHP behavior exit: ' + (r.stderr || r.stdout || ''));
    assert.match(String(r.stdout || ''), /ok/);
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
});

test('behavior: PHP satış sözleşmesi audit event alanları', function() {
  const eventHelpers = extractBetween(
    uploadPhp,
    'function medisaUploadDocumentHistoryMeta($documentType) {',
    'function medisaCanMergeVehicleDocumentUpload'
  );
  const phpSrc = [
    '<?php',
    'error_reporting(E_ALL);',
    eventHelpers,
    "$event = medisaBuildVehicleDocumentUploadEvent(",
    "  'satis_sozlesmesi',",
    "  'data/satis_sozlesmesi/new.pdf',",
    "  'data/satis_sozlesmesi/old.pdf',",
    "  ['user' => ['isim' => 'Audit Kullanıcısı']],",
    "  ['vehicleId' => 'vehicle-42', 'plakaSnapshot' => '78 ABC 123']",
    ');',
    '$cases = [];',
    "$cases[] = ($event['type'] ?? '') === 'satis-sozlesmesi-yukle';",
    "$cases[] = trim((string)($event['timestamp'] ?? '')) !== '';",
    "$cases[] = ($event['data']['vehicleId'] ?? '') === 'vehicle-42';",
    "$cases[] = ($event['data']['plakaSnapshot'] ?? '') === '78 ABC 123';",
    "$cases[] = ($event['data']['documentPath'] ?? '') === 'data/satis_sozlesmesi/new.pdf';",
    "$cases[] = ($event['data']['previousDocumentPath'] ?? '') === 'data/satis_sozlesmesi/old.pdf';",
    "$cases[] = ($event['data']['isReplacement'] ?? false) === true;",
    "$cases[] = ($event['data']['kaydeden'] ?? '') === 'Audit Kullanıcısı';",
    'foreach ($cases as $i => $ok) {',
    '  if (!$ok) { fwrite(STDERR, "PHP audit case fail #" . $i . PHP_EOL); exit(1); }',
    '}',
    'echo "ok", PHP_EOL;',
    ''
  ].join('\n');
  const tmp = path.join(ROOT, 'scripts', '.tmp-verify-satis-sozlesmesi-audit.php');
  fs.writeFileSync(tmp, phpSrc, 'utf8');
  try {
    const r = spawnSync('php', [tmp], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, 'PHP audit behavior exit: ' + (r.stderr || r.stdout || ''));
    assert.match(String(r.stdout || ''), /ok/);
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
});

test('behavior: satış soru akışı dalları', async function() {
  const flowSrc = extractBetween(
    tasitlar,
    'function runSatisSozlesmesiPromptFlow(vehicleId, deps)',
    'window.saveSatisPert = function()'
  );
  function makeSandbox(opts) {
    const uploadCalls = [];
    const askLog = [];
    const answers = Array.isArray(opts.answers) ? opts.answers.slice() : [];
    const vehicles = opts.vehicles || [{ id: 'v1', satildiMi: true, arsivNedeni: 'satis', satisSozlesmesiPath: opts.docPath || '' }];
    const sandbox = {
      Promise: Promise,
      readVehicles: function() { return vehicles; },
      getVehicleDocumentPath: function(vehicle, key) {
        if (key !== 'satis_sozlesmesi') return '';
        return String((vehicle && vehicle.satisSozlesmesiPath) || '');
      },
      askSatisSozlesmesiConfirm: function(msg) {
        askLog.push(String(msg || ''));
        return Promise.resolve(answers.length ? answers.shift() : null);
      },
      openSatisSozlesmesiUploadForVehicle: function(vid) {
        uploadCalls.push(String(vid));
      },
      refreshUiAfterSatisArchive: function() {},
      uploadCalls: uploadCalls,
      askLog: askLog
    };
    vm.createContext(sandbox);
    vm.runInContext(
      flowSrc + '\n;this.runSatisSozlesmesiPromptFlow = runSatisSozlesmesiPromptFlow;',
      sandbox
    );
    return sandbox;
  }

  const yesNoDoc = makeSandbox({ answers: [true], docPath: '' });
  await yesNoDoc.runSatisSozlesmesiPromptFlow('v1', {
    askConfirm: yesNoDoc.askSatisSozlesmesiConfirm,
    openUpload: yesNoDoc.openSatisSozlesmesiUploadForVehicle,
    refreshUi: yesNoDoc.refreshUiAfterSatisArchive
  });
  assert.equal(yesNoDoc.uploadCalls.length, 1, 'Evet + belge yok → upload bir kez');
  assert.equal(yesNoDoc.askLog.length, 1);

  const noThenYes = makeSandbox({ answers: [false, true], docPath: '' });
  await noThenYes.runSatisSozlesmesiPromptFlow('v1', {
    askConfirm: noThenYes.askSatisSozlesmesiConfirm,
    openUpload: noThenYes.openSatisSozlesmesiUploadForVehicle,
    refreshUi: noThenYes.refreshUiAfterSatisArchive
  });
  assert.equal(noThenYes.askLog.length, 2, 'Hayır → ikinci soru');
  assert.equal(noThenYes.uploadCalls.length, 1, 'ikinci Evet → upload bir kez');

  const noThenNo = makeSandbox({ answers: [false, false], docPath: '' });
  await noThenNo.runSatisSozlesmesiPromptFlow('v1', {
    askConfirm: noThenNo.askSatisSozlesmesiConfirm,
    openUpload: noThenNo.openSatisSozlesmesiUploadForVehicle,
    refreshUi: noThenNo.refreshUiAfterSatisArchive
  });
  assert.equal(noThenNo.uploadCalls.length, 0, 'ikinci Hayır → upload yok');
  assert.equal(noThenNo.askLog.length, 2);

  const saveBlock = extractBetween(tasitlar, 'window.saveSatisPert = function()', 'function countHistoryEventsByTab');
  assert.match(saveBlock, /islemTuru\s*===\s*'pert'/);
  assert.match(saveBlock, /Taşıt pert işlemi kaydedildi\. Taşıt arşive taşındı\./);
  assert.match(saveBlock, /runSatisSozlesmesiPromptFlow\(vehicleId\)/);
  assert.doesNotMatch(
    saveBlock,
    /if\s*\(\s*islemTuru\s*===\s*'pert'\s*\)\s*\{[\s\S]*?runSatisSozlesmesiPromptFlow/
  );
  assert.doesNotMatch(saveBlock, /setTimeout\s*\(\s*[^,]*,\s*120\s*\)/);
});

test('cache / modül pin parity', function() {
  const moduleVer = (tasitlar.match(/MEDISA_TASITLAR_MODULE_VERSION\s*=\s*'([^']+)'/) || [])[1];
  const loaderVer = (scriptCore.match(/tasitlar:\s*'([^']+)'/) || [])[1];
  const notifVer = (scriptCore.match(/notifications:\s*'([^']+)'/) || [])[1];
  const ayarlarCssVer = (scriptCore.match(/ayarlarCss:\s*'([^']+)'/) || [])[1];
  const ayarlarJsVer = (scriptCore.match(/ayarlarJs:\s*'([^']+)'/) || [])[1];
  assert.equal(moduleVer, '20260811.3');
  assert.equal(loaderVer, moduleVer);
  assert.equal(notifVer, '20260811.2');
  assert.equal(ayarlarCssVer, '20260812.1');
  assert.equal(ayarlarJsVer, '20260804.2');
  assert.match(sw, /CACHE_VERSION\s*=\s*'medisa-v2\.295'/);
  assert.match(read('index.html'), /script-core\.js\?v=20260812\.1/);
  assert.match(read('index.html'), /style-core\.css\?v=20260808\.1/);
});

test('quality gate / package bağlandı', function() {
  assert.match(packageJson, /tool:verify-satis-sozlesmesi/);
  assert.match(qualityGate, /tool:verify-satis-sozlesmesi/);
});

Promise.all(pendingAsync).then(function() {
  console.log('');
  console.log(passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
}).catch(function(err) {
  console.error(err);
  process.exit(1);
});
