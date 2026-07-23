/**
 * PERF-P1-2 — driver lazy surface/feature owner invariantleri.
 * Browser/DOM dependency yok; source, HTML, cache ve deterministic byte kapıları.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const size = (relative) => fs.statSync(path.join(ROOT, relative)).size;
const files = {
  loginHtml: read('driver/index.html'),
  dashboardHtml: read('driver/dashboard.html'),
  bootstrap: read('driver/driver-script.js'),
  login: read('driver/driver-login.js'),
  core: read('driver/driver-dashboard-core.js'),
  history: read('driver/driver-feature-history.js'),
  documents: read('driver/driver-feature-documents.js'),
  feedback: read('driver/driver-feature-feedback.js'),
  password: read('driver/driver-feature-password.js'),
  actions: read('driver/driver-feature-actions.js'),
  shellCss: read('driver/driver-shell.css'),
  featureCss: read('driver/driver-features.css'),
  compatibilityCss: read('driver/driver-style.css'),
  sw: read('sw.js')
};

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

function count(text, pattern) {
  return (text.match(pattern) || []).length;
}

test('Login HTML compatibility aggregator yüklemiyor', () => {
  assert.doesNotMatch(files.loginHtml, /driver-style\.css/);
  assert.match(files.loginHtml, /driver-shell\.css\?v=20260723\.1/);
});
test('Dashboard HTML compatibility aggregator yüklemiyor', () => {
  assert.doesNotMatch(files.dashboardHtml, /driver-style\.css/);
  assert.match(files.dashboardHtml, /driver-shell\.css\?v=20260723\.1/);
});
test('Login vehicle notification domain yüklemiyor', () => {
  assert.doesNotMatch(files.loginHtml, /vehicle-notification-domain\.js/);
});
test('Bootstrap yalnız runtime ve surface loader ownerı', () => {
  assert.match(files.bootstrap, /MedisaDriverRuntime/);
  assert.match(files.bootstrap, /loadFeature/);
  assert.match(files.bootstrap, /registerFeature/);
  assert.doesNotMatch(files.bootstrap, /driver_(?:save|event|feedback|request|change_password)\.php/);
  assert.ok(size('driver/driver-script.js') <= 30 * 1024, 'bootstrap bytes=' + size('driver/driver-script.js'));
});
test('Login surface yalnız login modülü yükler', () => {
  assert.match(files.bootstrap, /driver-login\.js/);
  assert.doesNotMatch(files.loginHtml, /driver-dashboard-core|driver-feature-/);
});
test('Dashboard surface yalnız core modülü yükler', () => {
  assert.match(files.bootstrap, /driver-dashboard-core\.js/);
  assert.doesNotMatch(files.dashboardHtml, /driver-login|driver-feature-/);
});
test('Dashboard ilk render feature CSS ile core modülünü birlikte yükler', () => {
  assert.match(files.bootstrap, /surface === 'dashboard'[\s\S]{0,300}Promise\.all\(\[[\s\S]{0,160}ensureFeaturesCss\(\)[\s\S]{0,160}driver-dashboard-core\.js/);
});
['history', 'documents', 'feedback', 'password', 'actions'].forEach((feature) => {
  test(feature + ' başlangıç HTML zincirinde yok', () => {
    assert.doesNotMatch(files.loginHtml + files.dashboardHtml, new RegExp('driver-feature-' + feature + '\\.js'));
  });
});
test('Feature proxy ilk çağrıyı Promise sonrası replay eder', () => {
  assert.match(files.bootstrap, /loadFeature[\s\S]{0,1000}(?:apply|arguments)/);
  assert.match(files.bootstrap, /Promise/);
});
test('Paralel feature çağrıları tek promise registry kullanır', () => {
  assert.match(files.bootstrap, /(?:promises|registry|inflight|loads)/i);
  assert.match(files.bootstrap, /if\s*\([^)]*(?:promises|registry|inflight|loads)/i);
});
test('Başarısız load retry için registry temizlenir', () => {
  assert.match(files.bootstrap, /\.catch\s*\([\s\S]{0,500}delete\s+/);
});
test('Feature CSS tek promise zincirinde yüklenir', () => {
  assert.match(files.bootstrap, /loadDriverStyleOnce/);
  assert.match(files.bootstrap, /driver-features\.css/);
});
test('Feature API CSS ve JS sonrası çağrılır', () => {
  assert.match(files.bootstrap, /Promise\.all|loadDriverStyleOnce[\s\S]{0,500}loadDriverScriptOnce/);
});
test('Inline onclick global isimleri korunur', () => {
  const globals = [
    'showHistory', 'closeHistory', 'toggleHistoryVehicleDropdown', 'showEditRequest',
    'closeEditRequest', 'submitEditRequest', 'openDriverDocumentsModal',
    'closeDriverDocumentsModal', 'openDriverFeedbackModal', 'closeDriverFeedbackModal',
    'submitDriverFeedback', 'openDriverPasswordModal', 'closeDriverPasswordModal',
    'openDriverPasswordSuggestion', 'startSuggestedPasswordChange',
    'continueWithCurrentPassword', 'submitDriverPasswordChange',
    'toggleDriverActionBlock', 'focusKmInput', 'cancelKmForm',
    'cancelDriverActionForm', 'submitDriverAction', 'submitKmOnly',
    'syncDriverEgzozMuayeneFields', 'cancelMuayeneSubmit',
    'confirmMuayeneSubmit', 'saveDriverEventFromBlock', 'logout'
  ];
  globals.forEach((name) => assert.match(files.bootstrap + files.core, new RegExp('(?:window\\.)?' + name)));
});
test('Login token routing parity ownerı login modülünde', () => {
  assert.match(files.login, /routeByToken/);
  assert.match(files.login, /routeByCurrentSession/);
  assert.match(files.login, /driver_login\.php/);
});
test('Dashboard auth parity core ownerında', () => {
  assert.match(files.core, /driver_data\.php/);
  assert.match(files.core, /Authorization/);
  assert.match(files.core, /canOpenDriverDashboard|driverDashboard/);
});
test('401 veya başarısız auth logout yönlendirmesi korunur', () => {
  assert.match(files.core, /logout|clearStoredPortalTokens/);
  assert.match(files.core, /index\.html/);
});
test('force=login parity korunur', () => {
  assert.match(files.login, /force/);
  assert.match(files.login, /login/);
});
test('next yalnız same-origin kabul edilir', () => {
  assert.match(files.login, /resolvedUrl\.origin\s*!==\s*window\.location\.origin|origin\s*!==\s*window\.location\.origin/);
});
test('Password feature lazy proxy mevcut; current main auto-suggestion yok', () => {
  assert.match(files.bootstrap, /openDriverPasswordModal/);
  assert.match(files.password, /submitDriverPasswordChange|driver_change_password\.php/);
  assert.doesNotMatch(files.core, /ilk_giris_parola_onerisi_bekliyor\s*===\s*true/);
});
test('KM deep-link actions modülünü otomatik yükler', () => {
  assert.match(files.core, /action/);
  assert.match(files.core, /loadFeature\(['"]actions['"]\)|focusKmInput/);
});
test('Feedback prefill feedback modülünü otomatik yükler', () => {
  assert.match(files.core, /feedback/);
  assert.match(files.core, /loadFeature\(['"]feedback['"]\)|openDriverFeedbackModal/);
});
test('SW statikleri network-first ve cache fallback ile saklar', () => {
  assert.match(files.sw, /Static dosyalar - NETWORK-FIRST/);
  assert.match(files.sw, /cache\.put\(request/);
  assert.match(files.sw, /caches\.match\(request\)/);
});
test('Uncached offline feature kontrollü mesaj kontratı var', () => {
  assert.match(files.bootstrap, /Bu bölüm ilk kullanım için internet bağlantısı gerektiriyor\./);
});
test('Driver feature assetleri SW install precache listesinde yok', () => {
  const cacheStart = files.sw.indexOf('const CACHE_FILES');
  const cacheEnd = files.sw.indexOf('];', cacheStart);
  const cacheList = files.sw.slice(cacheStart, cacheEnd);
  assert.doesNotMatch(cacheList, /driver-(?:script|shell|feature|login|dashboard)/);
});
test('Boot metrics varsayılan kapalı ve business veri içermez', () => {
  assert.match(files.bootstrap, /medisaPerf|medisa_perf_debug/);
  assert.match(files.bootstrap, /__medisaDriverBootMetrics/);
  const metricsOwner = files.bootstrap.slice(files.bootstrap.indexOf('__medisaDriverBootMetrics'));
  assert.doesNotMatch(metricsOwner.slice(0, 1800), /plaka|username|password|token/i);
});
test('Compatibility CSS shell ve features sırasını korur', () => {
  const shellAt = files.compatibilityCss.indexOf('driver-shell.css');
  const featuresAt = files.compatibilityCss.indexOf('driver-features.css');
  assert.ok(shellAt >= 0 && featuresAt > shellAt);
});
test('Eski HTML yeni bootstrap zinciriyle surface tespit edebilir', () => {
  assert.match(files.bootstrap, /login-page|login-form/);
  assert.match(files.bootstrap, /dashboard-page|driver-two-panel/);
});
test('Feature toplam byte hard gate geçer', () => {
  const total = [
    'driver/driver-script.js', 'driver/driver-login.js', 'driver/driver-dashboard-core.js',
    'driver/driver-feature-history.js', 'driver/driver-feature-documents.js',
    'driver/driver-feature-feedback.js', 'driver/driver-feature-password.js',
    'driver/driver-feature-actions.js'
  ].reduce((sum, file) => sum + size(file), 0);
  assert.ok(total <= 208561 * 1.10, 'toplam JS=' + total);
});
test('Login başlangıç byte hard gate geçer', () => {
  const total = size('driver/driver-script.js') + size('driver/driver-login.js');
  assert.ok(total <= Math.min(65 * 1024, 208561 * 0.30), 'login JS=' + total);
});
test('Dashboard başlangıç byte hard gate geçer', () => {
  const total = size('driver/driver-script.js') + size('driver/driver-dashboard-core.js');
  assert.ok(total <= Math.min(115 * 1024, 208561 * 0.55), 'dashboard JS=' + total);
});
test('Render-blocking CSS ve toplam CSS hard gate geçer', () => {
  const shell = size('driver/driver-shell.css');
  const total = shell + size('driver/driver-features.css');
  assert.ok(shell <= 206536 * 0.45, 'shell CSS=' + shell);
  assert.ok(total <= 206536 * 1.05, 'split CSS=' + total);
});
test('Feature registerFeature owner kontratı kullanır', () => {
  ['history', 'documents', 'feedback', 'password', 'actions'].forEach((name) => {
    assert.match(files[name], new RegExp("registerFeature\\(['\"]" + name + "['\"]"));
  });
});
test('CSS split dosyalarında brace dengesi korunur', () => {
  [files.shellCss, files.featureCss].forEach((css) => {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:\\.|[^"])*"|'(?:\\.|[^'])*'/g, '');
    assert.equal(count(stripped, /\{/g), count(stripped, /\}/g));
  });
});

test('Bootstrap ortak vehicle helper ownerıdır', () => {
  assert.match(files.bootstrap, /function getDriverVehicleTypeKey\s*\(/);
  assert.match(files.bootstrap, /function normalizeDriverVehicleTypeKey\s*\(/);
  assert.match(files.bootstrap, /function driverVehicleNeedsK2\s*\(/);
  assert.match(files.bootstrap, /function driverVehicleNeedsTakograf\s*\(/);
  assert.match(files.bootstrap, /function driverVehicleIsHeavyCommercial\s*\(/);
  assert.match(files.bootstrap, /function bindDriverDashboardTitleCase\s*\(/);
});
test('Beş helper runtime.helpers içine publish edilir', () => {
  assert.match(files.bootstrap, /helpers:\s*\{[\s\S]*getDriverVehicleTypeKey\s*:/);
  assert.match(files.bootstrap, /helpers:\s*\{[\s\S]*normalizeDriverVehicleTypeKey\s*:/);
  assert.match(files.bootstrap, /helpers:\s*\{[\s\S]*driverVehicleNeedsK2\s*:/);
  assert.match(files.bootstrap, /helpers:\s*\{[\s\S]*driverVehicleNeedsTakograf\s*:/);
  assert.match(files.bootstrap, /helpers:\s*\{[\s\S]*driverVehicleIsHeavyCommercial\s*:/);
  assert.match(files.bootstrap, /helpers:\s*\{[\s\S]*bindDriverDashboardTitleCase\s*:/);
  assert.match(files.bootstrap, /window\.MedisaDriverRuntime\s*=\s*runtime/);
  const helpersBlock = files.bootstrap.slice(
    files.bootstrap.indexOf('helpers: {'),
    files.bootstrap.indexOf('features: {')
  );
  assert.ok(helpersBlock.indexOf('getDriverVehicleTypeKey') >= 0);
  assert.ok(helpersBlock.indexOf('driverVehicleNeedsK2') >= 0);
  assert.ok(helpersBlock.indexOf('driverVehicleNeedsTakograf') >= 0);
  assert.ok(helpersBlock.indexOf('driverVehicleIsHeavyCommercial') >= 0);
  assert.ok(helpersBlock.indexOf('bindDriverDashboardTitleCase') >= 0);
});
test('Dashboard core helperları runtime.helpers üzerinden çözer', () => {
  assert.match(files.core, /var h = runtime\.helpers/);
  assert.match(files.core, /var driverVehicleNeedsK2 = h && h\.driverVehicleNeedsK2/);
  assert.match(files.core, /var driverVehicleNeedsTakograf = h && h\.driverVehicleNeedsTakograf/);
  assert.match(files.core, /var driverVehicleIsHeavyCommercial = h && h\.driverVehicleIsHeavyCommercial/);
  assert.match(files.core, /var bindDriverDashboardTitleCase = h && h\.bindDriverDashboardTitleCase/);
  assert.match(files.core, /MedisaDriverRuntime vehicle document helpers eksik/);
  assert.match(files.core, /MedisaDriverRuntime dashboard titlecase helper eksik/);
  assert.match(files.core, /function clearSavedDriverPassword\s*\(/);
});
test('Documents feature helperları runtime.helpers üzerinden çözer', () => {
  assert.match(files.documents, /var h = runtime\.helpers/);
  assert.match(files.documents, /var getDriverVehicleTypeKey = h\.getDriverVehicleTypeKey/);
  assert.match(files.documents, /var normalizeDriverVehicleTypeKey = h\.normalizeDriverVehicleTypeKey/);
  assert.match(files.documents, /var driverVehicleNeedsK2 = h\.driverVehicleNeedsK2/);
  assert.match(files.documents, /var driverVehicleNeedsTakograf = h\.driverVehicleNeedsTakograf/);
  assert.match(files.documents, /var driverVehicleIsHeavyCommercial = h\.driverVehicleIsHeavyCommercial/);
});
test('Dashboard core içinde local vehicle helper function declaration yoktur', () => {
  assert.doesNotMatch(files.core, /function\s+driverVehicleNeedsK2\s*\(/);
  assert.doesNotMatch(files.core, /function\s+driverVehicleNeedsTakograf\s*\(/);
  assert.doesNotMatch(files.core, /function\s+driverVehicleIsHeavyCommercial\s*\(/);
  assert.doesNotMatch(files.core, /function\s+getDriverVehicleTypeKey\s*\(/);
  assert.doesNotMatch(files.core, /function\s+normalizeDriverVehicleTypeKey\s*\(/);
  assert.doesNotMatch(files.core, /function\s+bindDriverDashboardTitleCase\s*\(/);
});
test('Documents feature içinde mükerrer vehicle helper function declaration yoktur', () => {
  assert.doesNotMatch(files.documents, /function\s+driverVehicleNeedsK2\s*\(/);
  assert.doesNotMatch(files.documents, /function\s+driverVehicleNeedsTakograf\s*\(/);
  assert.doesNotMatch(files.documents, /function\s+driverVehicleIsHeavyCommercial\s*\(/);
  assert.doesNotMatch(files.documents, /function\s+getDriverVehicleTypeKey\s*\(/);
  assert.doesNotMatch(files.documents, /function\s+normalizeDriverVehicleTypeKey\s*\(/);
});
test('driverVehicleNeedsK2 toplam canonical function declaration sayısı = 1', () => {
  const all = files.bootstrap + files.core + files.documents + files.history + files.feedback + files.password + files.actions + files.login;
  assert.equal(count(all, /function\s+driverVehicleNeedsK2\s*\(/g), 1);
});
test('driverVehicleNeedsTakograf toplam canonical function declaration sayısı = 1', () => {
  const all = files.bootstrap + files.core + files.documents + files.history + files.feedback + files.password + files.actions + files.login;
  assert.equal(count(all, /function\s+driverVehicleNeedsTakograf\s*\(/g), 1);
});
test('driverVehicleIsHeavyCommercial toplam canonical function declaration sayısı = 1', () => {
  const all = files.bootstrap + files.core + files.documents + files.history + files.feedback + files.password + files.actions + files.login;
  assert.equal(count(all, /function\s+driverVehicleIsHeavyCommercial\s*\(/g), 1);
});
test('bindDriverDashboardTitleCase toplam canonical function declaration sayısı = 1', () => {
  const all = files.bootstrap + files.core + files.documents + files.history + files.feedback + files.password + files.actions + files.login;
  assert.equal(count(all, /function\s+bindDriverDashboardTitleCase\s*\(/g), 1);
});
test('bindDriverDashboardTitleCase declaration bootstrap içindedir', () => {
  assert.match(files.bootstrap, /function\s+bindDriverDashboardTitleCase\s*\(/);
  assert.doesNotMatch(files.history, /function\s+bindDriverDashboardTitleCase\s*\(/);
});
test('Titlecase binding idempotent dataset guard kullanır', () => {
  assert.match(files.bootstrap, /data-driver-titlecase-bound/);
});
test('Documents feature hâlâ lazydir', () => {
  assert.match(files.bootstrap, /documents:\s*\{\s*js:\s*'driver-feature-documents\.js'/);
  assert.doesNotMatch(files.dashboardHtml, /driver-feature-documents\.js/);
  assert.match(files.bootstrap, /loadFeature\(['"]documents['"]\)|FEATURE_FILES/);
});
test('History feature hâlâ lazydir ve cold bootta yüklenmez', () => {
  assert.match(files.bootstrap, /history:\s*\{\s*js:\s*'driver-feature-history\.js'/);
  assert.doesNotMatch(files.dashboardHtml, /driver-feature-history\.js/);
  assert.doesNotMatch(files.core, /loadFeature\(['"]history['"]\)/);
});
test('Dashboard boot documents feature yüklenmeden helper erişimine sahiptir', () => {
  const publishIdx = files.bootstrap.indexOf('window.MedisaDriverRuntime = runtime');
  const helpersIdx = files.bootstrap.indexOf('driverVehicleNeedsK2:');
  assert.ok(helpersIdx >= 0 && helpersIdx < publishIdx);
  assert.match(files.core, /MedisaDriverRuntime vehicle document helpers eksik/);
  assert.doesNotMatch(files.core, /loadFeature\(['"]documents['"]\)[\s\S]{0,200}driverVehicleNeedsK2/);
});
test('K2 tip matrisi aynıdır', () => {
  assert.match(files.bootstrap, /normalizedType === 'minivan'/);
  assert.match(files.bootstrap, /normalizedType === 'kucuk_ticari'/);
  assert.match(files.bootstrap, /normalizedType === 'kamyon'/);
  assert.match(files.bootstrap, /normalizedType === 'buyuk_ticari'/);
  assert.match(files.bootstrap, /normalizedType === 'romork'/);
});
test('Takograf tip matrisi aynıdır', () => {
  assert.match(files.bootstrap, /normalizedType === 'kamyon' \|\| normalizedType === 'buyuk_ticari'/);
});
test('Driver asset version matrisi dar bump kullanır', () => {
  assert.match(files.bootstrap, /bootstrap:\s*'20260719\.1'/);
  assert.match(files.bootstrap, /dashboardCore:\s*'20260718\.4'/);
  assert.match(files.bootstrap, /history:\s*'20260718\.4'/);
  assert.match(files.bootstrap, /documents:\s*'20260718\.3'/);
  assert.match(files.bootstrap, /login:\s*'20260718\.1'/);
  assert.match(files.bootstrap, /feedback:\s*'20260718\.1'/);
  assert.match(files.bootstrap, /password:\s*'20260718\.1'/);
  assert.match(files.bootstrap, /actions:\s*'20260718\.1'/);
  assert.match(files.loginHtml, /driver-script\.js\?v=20260719\.1/);
  assert.match(files.dashboardHtml, /driver-script\.js\?v=20260719\.1/);
  assert.match(files.loginHtml, /driver-shell\.css\?v=20260723\.1/);
  assert.match(files.dashboardHtml, /driver-shell\.css\?v=20260723\.1/);
});
test('Vehicle document helper behavioral matrix', () => {
  function getDriverVehicleTypeKey(vehicle) {
    return String((vehicle && (vehicle.vehicleType || vehicle.tip)) || '').trim().toLowerCase();
  }
  function normalizeDriverVehicleTypeKey(typeKey) {
    return String(typeKey || '')
      .toLowerCase()
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
      .replace(/\s+/g, '_')
      .trim();
  }
  function driverVehicleNeedsK2(vehicle) {
    var normalizedType = normalizeDriverVehicleTypeKey(getDriverVehicleTypeKey(vehicle));
    return normalizedType === 'minivan'
      || normalizedType === 'kucuk_ticari'
      || normalizedType === 'kamyon'
      || normalizedType === 'buyuk_ticari'
      || normalizedType === 'romork';
  }
  function driverVehicleNeedsTakograf(vehicle) {
    var normalizedType = normalizeDriverVehicleTypeKey(getDriverVehicleTypeKey(vehicle));
    return normalizedType === 'kamyon' || normalizedType === 'buyuk_ticari';
  }
  const cases = [
    [{ tip: 'minivan' }, true, false],
    [{ tip: 'küçük ticari' }, true, false],
    [{ tip: 'kamyon' }, true, true],
    [{ tip: 'büyük ticari' }, true, true],
    [{ tip: 'römork' }, true, false],
    [{ tip: 'otomobil' }, false, false],
    [null, false, false],
    [{}, false, false]
  ];
  cases.forEach(([vehicle, k2, tako]) => {
    assert.equal(driverVehicleNeedsK2(vehicle), k2, JSON.stringify(vehicle) + ' k2');
    assert.equal(driverVehicleNeedsTakograf(vehicle), tako, JSON.stringify(vehicle) + ' tako');
  });
  assert.equal(normalizeDriverVehicleTypeKey('Küçük Ticari'), 'kucuk_ticari');
  assert.equal(normalizeDriverVehicleTypeKey('Büyük Ticari'), 'buyuk_ticari');
  assert.equal(normalizeDriverVehicleTypeKey('Römork'), 'romork');
});

console.log('\nDriver lazy invariants: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
