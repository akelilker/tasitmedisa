/**
 * Satış Sözleşmesi belgesi — kaynak kontrat invariantleri.
 * Çalıştır: node scripts/verify-medisa-satis-sozlesmesi-invariants.js
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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
    'window.isVehicleSold = isVehicleSold;'
  );
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(
    block +
      '\n;this.getVehicleArchiveReason = getVehicleArchiveReason;' +
      '\n;this.isVehicleSold = isVehicleSold;' +
      '\n;this.isVehiclePert = isVehiclePert;',
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
    isVehicleSold: archive.isVehicleSold,
    isVehiclePert: archive.isVehiclePert
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

test('source: satış sonrası soru akışı (pert hariç, başarılı kayıt sonrası)', function() {
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
  assert.match(saveBlock, /runSatisSozlesmesiPromptFlow\(vehicleId\)/);
  assert.ok(
    saveBlock.indexOf("islemTuru === 'pert'") < saveBlock.indexOf('runSatisSozlesmesiPromptFlow'),
    'pert dalı satış soru akışından önce ayrılmalı'
  );
});

test('domain: aktif / pert / satış / legacy sınıflandırma', function() {
  const h = loadArchiveHelpers();
  assert.equal(h.getVehicleArchiveReason({ satildiMi: false }), null);
  assert.equal(h.isVehicleSold({ satildiMi: false }), false);
  assert.equal(h.isVehicleSold({ satildiMi: true, arsivNedeni: 'satis' }), true);
  assert.equal(h.isVehicleSold({ satildiMi: true, arsivNedeni: 'pert' }), false);
  assert.equal(h.isVehiclePert({ satildiMi: true, arsivNedeni: 'pert' }), true);
  assert.equal(h.isVehicleSold({ satildiMi: true }), true, 'legacy satildiMi → satış');
  assert.equal(
    h.isVehicleSold({
      satildiMi: true,
      events: [{ type: 'satis', data: { pertIsaret: true } }]
    }),
    false,
    'legacy pertIsaret → satış değil'
  );
  assert.equal(
    h.isVehiclePert({
      satildiMi: true,
      events: [{ type: 'satis', data: { pertIsaret: true } }]
    }),
    true
  );
});

test('UI keys: kart yalnızca satılmışta üretilir', function() {
  const h = loadDocumentKeysHelpers();
  const active = h.getVehicleDocumentKeysForVehicle({ satildiMi: false });
  assert.ok(!active.includes('satis_sozlesmesi'), 'aktifte kart yok');
  const pert = h.getVehicleDocumentKeysForVehicle({ satildiMi: true, arsivNedeni: 'pert' });
  assert.ok(!pert.includes('satis_sozlesmesi'), 'pertte kart yok');
  const sold = h.getVehicleDocumentKeysForVehicle({ satildiMi: true, arsivNedeni: 'satis' });
  assert.ok(sold.includes('satis_sozlesmesi'), 'yeni satışta kart var');
  const legacySold = h.getVehicleDocumentKeysForVehicle({ satildiMi: true });
  assert.ok(legacySold.includes('satis_sozlesmesi'), 'legacy satılmışta kart var');
  const legacyPert = h.getVehicleDocumentKeysForVehicle({
    satildiMi: true,
    events: [{ type: 'satis', data: { pertIsaret: true } }]
  });
  assert.ok(!legacyPert.includes('satis_sozlesmesi'), 'legacy pertIsaret kart yok');
  assert.equal(
    sold.slice(0, 4).join(','),
    'ruhsat,satis_sozlesmesi,sigorta,kasko',
    'satış belgesi ruhsat sonrası sırada: ' + sold.join(',')
  );
});

test('source: belge satır yerleşimi ruhsat+satış / sigorta+kasko', function() {
  assert.match(
    tasitlar,
    /keys:\s*\['ruhsat',\s*'satis_sozlesmesi'\]/
  );
  assert.match(
    tasitlar,
    /keys:\s*\['sigorta',\s*'kasko'\]/
  );
});

test('PHP: config + preserve + archive helpers + upload gate', function() {
  assert.match(corePhp, /function medisaGetVehicleArchiveReason/);
  assert.match(corePhp, /function medisaIsVehicleSold/);
  assert.match(corePhp, /function medisaIsVehiclePert/);
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
  assert.match(uploadPhp, /medisaIsVehicleSold\(\$preVehicle\)/);
  assert.match(uploadPhp, /medisaIsVehicleSold\(\$vehicle\)/);
  assert.match(uploadPhp, /Satış Sözleşmesi yalnızca satılmış taşıtlara yüklenebilir/);
  assert.match(uploadPhp, /Pert nedeniyle arşivlenen taşıtlara Satış Sözleşmesi yüklenemez/);
});

test('notifications + history label registry', function() {
  assert.match(notifications, /'satis-sozlesmesi-yukle'\s*:\s*'Sat/);
  assert.match(tasitlar, /'satis-sozlesmesi-yukle'\s*:\s*'Satış Sözleşmesi'/);
});

test('gitignore runtime klasörleri', function() {
  assert.match(gitignore, /(^|\n)data\/satis_sozlesmesi\/(\n|$)/);
  assert.match(gitignore, /(^|\n)data\/satis_sozlesmesi_preview\/(\n|$)/);
});

test('cache / modül pin parity', function() {
  const moduleVer = (tasitlar.match(/MEDISA_TASITLAR_MODULE_VERSION\s*=\s*'([^']+)'/) || [])[1];
  const loaderVer = (scriptCore.match(/tasitlar:\s*'([^']+)'/) || [])[1];
  const notifVer = (scriptCore.match(/notifications:\s*'([^']+)'/) || [])[1];
  assert.equal(moduleVer, '20260804.1');
  assert.equal(loaderVer, moduleVer);
  assert.equal(notifVer, '20260804.1');
  assert.match(sw, /CACHE_VERSION\s*=\s*'medisa-v2\.269'/);
  assert.match(read('index.html'), /script-core\.js\?v=20260804\.1/);
});

test('quality gate / package bağlandı', function() {
  assert.match(packageJson, /tool:verify-satis-sozlesmesi/);
  assert.match(qualityGate, /tool:verify-satis-sozlesmesi/);
});

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
