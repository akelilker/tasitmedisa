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
  assert.match(files.loginHtml, /driver-shell\.css\?v=20260717\.3/);
});
test('Dashboard HTML compatibility aggregator yüklemiyor', () => {
  assert.doesNotMatch(files.dashboardHtml, /driver-style\.css/);
  assert.match(files.dashboardHtml, /driver-shell\.css\?v=20260717\.3/);
});
test('Login vehicle notification domain yüklemiyor', () => {
  assert.doesNotMatch(files.loginHtml, /vehicle-notification-domain\.js/);
});
test('Bootstrap yalnız runtime ve surface loader ownerı', () => {
  assert.match(files.bootstrap, /MedisaDriverRuntime/);
  assert.match(files.bootstrap, /loadFeature/);
  assert.match(files.bootstrap, /registerFeature/);
  assert.doesNotMatch(files.bootstrap, /driver_(?:save|event|feedback|request|change_password)\.php/);
  assert.ok(size('driver/driver-script.js') <= 20 * 1024);
});
test('Login surface yalnız login modülü yükler', () => {
  assert.match(files.bootstrap, /driver-login\.js/);
  assert.doesNotMatch(files.loginHtml, /driver-dashboard-core|driver-feature-/);
});
test('Dashboard surface yalnız core modülü yükler', () => {
  assert.match(files.bootstrap, /driver-dashboard-core\.js/);
  assert.doesNotMatch(files.dashboardHtml, /driver-login|driver-feature-/);
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
test('Password suggestion otomatik lazy load edilir', () => {
  assert.match(files.core, /ilk_giris_parola_onerisi_bekliyor\s*===\s*true/);
  assert.match(files.core, /loadFeature\(['"]password['"]\)|openDriverPasswordSuggestion/);
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

console.log('\nDriver lazy invariants: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
