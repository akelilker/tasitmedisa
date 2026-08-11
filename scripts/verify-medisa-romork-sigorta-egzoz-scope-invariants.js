'use strict';

/**
 * Römork: trafik sigortası + egzoz muayenesi kapsam dışı regression.
 * Mevcut verify-* stilinde source + domain runtime assert.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const domainSrc = read('vehicle-notification-domain.js');
const kayitSrc = read('kayit.js');
const notifSrc = read('notifications.js');
const tasitlarSrc = read('tasitlar.js');
const coreSrc = read('script-core.js');

function loadDomain(checkDateWarningsImpl) {
  const sandbox = {
    window: {
      checkDateWarnings: checkDateWarningsImpl || function() {
        return { class: 'date-warning-red', days: -10 };
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(domainSrc, sandbox);
  return sandbox.window.MedisaVehicleNotificationDomain;
}

function test(name, fn) {
  fn();
  console.log('[PASS]', name);
}

test('PUBLIC_KEYS / script-core key parity', function() {
  assert.match(domainSrc, /vehicleNeedsTrafikSigortasi/);
  assert.match(domainSrc, /vehicleNeedsEgzozMuayene/);
  assert.match(domainSrc, /not_applicable/);
  assert.match(coreSrc, /'vehicleNeedsTrafikSigortasi'/);
  assert.match(coreSrc, /'vehicleNeedsEgzozMuayene'/);
  const domainKeys = (domainSrc.match(/var PUBLIC_KEYS = \[([\s\S]*?)\];/) || [])[1] || '';
  const coreKeys = (coreSrc.match(/var MEDISA_VEHICLE_NOTIFICATION_DOMAIN_KEYS = \[([\s\S]*?)\];/) || [])[1] || '';
  const parseKeys = (block) => (block.match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
  assert.deepEqual(parseKeys(domainKeys).sort(), parseKeys(coreKeys).sort());
});

test('kayit owner: registration scope + clear + UI sync', function() {
  assert.match(kayitSrc, /function registrationVehicleNeedsTrafikSigortasi/);
  assert.match(kayitSrc, /function registrationVehicleNeedsEgzozMuayene/);
  assert.match(kayitSrc, /function clearVehicleTrafikSigortasiFieldsWhenOutOfScope/);
  assert.match(kayitSrc, /function clearVehicleEgzozMuayeneFieldsWhenOutOfScope/);
  assert.match(kayitSrc, /function syncRegistrationSigortaEgzozScopeUi/);
  assert.match(kayitSrc, /syncRegistrationSigortaEgzozScopeUi\(getModal\(\)\)/);
  assert.match(kayitSrc, /clearVehicleTrafikSigortasiFieldsWhenOutOfScope\(vehicle\)/);
  assert.match(kayitSrc, /clearVehicleEgzozMuayeneFieldsWhenOutOfScope\(vehicle\)/);
  assert.match(kayitSrc, /registrationVehicleNeedsEgzozMuayene\(getRegistrationModalSelectedVehicleType/);
  assert.match(kayitSrc, /needsSigorta\s*\?\s*\(readVehicleDateIso/);
});

test('notifications: sigorta gate uses domain helper', function() {
  assert.match(
    notifSrc,
    /vehicleNeedsTrafikSigortasi\(vehicle\)\s*&&\s*vehicle\.sigortaDate/
  );
  assert.match(notifSrc, /'vehicleNeedsTrafikSigortasi'/);
  assert.match(notifSrc, /'vehicleNeedsEgzozMuayene'/);
});

test('tasitlar: warning/menu/muayene egzoz scope', function() {
  assert.match(tasitlarSrc, /vehicleNeedsTrafikSigortasi\(vehicle\)\s*&&\s*vehicle\.sigortaDate/);
  assert.match(tasitlarSrc, /availableEventIds\.delete\('sigorta'\)/);
  assert.match(tasitlarSrc, /vehicleNeedsEgzozMuayene\(vehicle\)/);
  assert.match(tasitlarSrc, /needsEgzoz \? egzozMuayeneDate : ''/);
});

test('domain runtime: romork not_applicable + critical false', function() {
  const domain = loadDomain();
  const legacyRomork = {
    vehicleType: 'romork',
    sigortaDate: '2020-01-01',
    egzozMuayeneDate: '2020-01-01'
  };
  const egzoz = domain.getEgzozMuayeneState(legacyRomork);
  assert.equal(egzoz.state, 'not_applicable');
  assert.equal(egzoz.warningClass, '');
  assert.equal(egzoz.date, '');
  assert.equal(domain.isEgzozMuayeneCritical(legacyRomork), false);
  assert.equal(domain.vehicleNeedsTrafikSigortasi(legacyRomork), false);
  assert.equal(domain.vehicleNeedsEgzozMuayene(legacyRomork), false);
  assert.equal(domain.vehicleNeedsTakograf(legacyRomork), false);
  assert.equal(domain.vehicleNeedsK2Belgesi(legacyRomork), true);
});

test('domain runtime: otomobil/minivan/kamyon negative regression', function() {
  const domain = loadDomain(function() {
    return { class: '', days: 90 };
  });
  ['otomobil', 'minivan', 'kamyon'].forEach(function(typeKey) {
    const v = { vehicleType: typeKey, egzozMuayeneDate: '2027-01-01' };
    assert.equal(domain.vehicleNeedsTrafikSigortasi(v), true, typeKey + ' sigorta');
    assert.equal(domain.vehicleNeedsEgzozMuayene(v), true, typeKey + ' egzoz');
    const st = domain.getEgzozMuayeneState(v);
    assert.notEqual(st.state, 'not_applicable', typeKey + ' egzoz state');
  });
  assert.equal(domain.vehicleNeedsTakograf({ vehicleType: 'kamyon' }), true);
  assert.equal(domain.vehicleNeedsTakograf({ vehicleType: 'minivan' }), false);
  assert.equal(domain.vehicleNeedsK2Belgesi({ vehicleType: 'otomobil' }), false);
  assert.equal(domain.vehicleNeedsK2Belgesi({ vehicleType: 'minivan' }), true);
});

test('domain runtime: missing egzoz still red for non-romork', function() {
  const domain = loadDomain();
  const st = domain.getEgzozMuayeneState({ vehicleType: 'otomobil', egzozMuayeneDate: '' });
  assert.equal(st.state, 'missing');
  assert.equal(st.warningClass, 'date-warning-red');
  assert.equal(domain.isEgzozMuayeneCritical({ vehicleType: 'otomobil', egzozMuayeneDate: '' }), true);
});

test('asset pin chain bumped for changed runtime modules', function() {
  assert.match(coreSrc, /vehicleNotificationDomain:\s*'20260811\.2'/);
  assert.match(coreSrc, /kayitJs:\s*'20260811\.2'/);
  assert.match(coreSrc, /notifications:\s*'20260811\.2'/);
  assert.match(coreSrc, /tasitlar:\s*'20260811\.3'/);
  assert.match(coreSrc, /kayitCss:\s*'20260811\.4'/);
  assert.match(tasitlarSrc, /MEDISA_TASITLAR_MODULE_VERSION = '20260811\.3'/);
  assert.match(read('index.html'), /script-core\.js\?v=20260811\.4/);
  assert.match(read('sw.js'), /CACHE_VERSION = 'medisa-v2\.294'/);
});

test('notification merge simulation: romork excludes sigorta/egzoz merges', function() {
  const domain = loadDomain(function() {
    return { class: 'date-warning-red', days: -5 };
  });
  function scan(vehicle) {
    const monthly = [];
    const notifs = [];
    if (domain.vehicleNeedsTrafikSigortasi(vehicle) && vehicle.sigortaDate) {
      monthly.push('Sigorta');
      notifs.push('sigorta');
    }
    if (vehicle.kaskoDate) monthly.push('Kasko');
    if (vehicle.muayeneDate) monthly.push('Muayene');
    const eg = domain.getEgzozMuayeneState(vehicle);
    if (eg.state === 'missing' || eg.date) monthly.push('Egzoz Muayene');
    if (eg.warningClass) notifs.push('egzoz');
    let display = monthly.slice();
    if (display.indexOf('Muayene') !== -1 && display.indexOf('Egzoz Muayene') !== -1) {
      display = display.filter(function(t) { return t !== 'Muayene' && t !== 'Egzoz Muayene'; });
      display.push('Muayene + Egzoz');
    }
    if (display.indexOf('Sigorta') !== -1 && display.indexOf('Kasko') !== -1) {
      display = display.filter(function(t) { return t !== 'Sigorta' && t !== 'Kasko'; });
      display.push('Sigorta + Kasko');
    }
    return { monthly: monthly, notifs: notifs, display: display };
  }
  const romork = scan({
    vehicleType: 'romork',
    sigortaDate: '2020-01-01',
    egzozMuayeneDate: '2020-01-01',
    kaskoDate: '2020-06-01',
    muayeneDate: '2020-06-01'
  });
  assert.deepEqual(romork.monthly, ['Kasko', 'Muayene']);
  assert.deepEqual(romork.notifs, []);
  assert.equal(romork.display.indexOf('Sigorta'), -1);
  assert.equal(romork.display.indexOf('Egzoz Muayene'), -1);
  assert.equal(romork.display.indexOf('Muayene + Egzoz'), -1);
  assert.equal(romork.display.indexOf('Sigorta + Kasko'), -1);

  const auto = scan({
    vehicleType: 'otomobil',
    sigortaDate: '2020-01-01',
    egzozMuayeneDate: '',
    kaskoDate: '2020-01-01',
    muayeneDate: '2020-01-01'
  });
  assert.ok(auto.display.indexOf('Sigorta + Kasko') !== -1);
  assert.ok(auto.display.indexOf('Muayene + Egzoz') !== -1 || auto.monthly.indexOf('Egzoz Muayene') !== -1);
});

console.log(JSON.stringify({
  ok: true,
  checks: [
    'public-keys-parity',
    'kayit-scope-owner',
    'notifications-sigorta-gate',
    'tasitlar-scope',
    'romork-not-applicable',
    'non-romork-regression',
    'asset-pins',
    'merge-simulation'
  ]
}, null, 2));
