'use strict';
// Offline: sw.js precache URL'leri, sayfalar\u0131n ve lazy loader'lar\u0131n istedi\u011fi ?v= URL'leri ile birebir ayn\u0131 olmal\u0131.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const sw = read('sw.js');
const core = read('script-core.js');
const driverScript = read('driver/driver-script.js');
let failed = 0;
function test(name, fn) { try { fn(); console.log('PASS', name); } catch (e) { failed++; console.error('FAIL', name, '\n ', e.message); } }
function has(url) { assert.ok(sw.includes("'" + url + "'"), 'sw.js precache eksik: ' + url); }
function ver(src, key) { const m = src.match(new RegExp(key + ":\\s*'([^']+)'")); assert.ok(m, key + ' yok'); return m[1]; }

test('main lazy modules precache == MEDISA_MODULE_VERSIONS', () => {
  has('/tasitlar.js?v=' + ver(core, 'tasitlar'));
  has('/tasitlar-base.css?v=' + ver(core, 'tasitlar'));
  has('/tasitlar-extra.css?v=' + ver(core, 'tasitlar'));
  has('/notifications.js?v=' + ver(core, 'notifications'));
  has('/notifications.css?v=' + ver(core, 'notifications'));
  has('/raporlar.js?v=' + ver(core, 'raporlar'));
  has('/raporlar.css?v=' + ver(core, 'raporlar'));
  has('/kayit.js?v=' + ver(core, 'kayitJs'));
  has('/kayit.css?v=' + ver(core, 'kayitCss'));
  has('/ayarlar.js?v=' + ver(core, 'ayarlarJs'));
  has('/ayarlar.css?v=' + ver(core, 'ayarlarCss'));
  has('/tasitlar-yazici.js?v=' + ver(core, 'tasitlarYazici'));
  has('/vehicle-notification-domain.js?v=' + ver(core, 'vehicleNotificationDomain'));
});
test('raporlar cache name == raporlar version', () => {
  assert.ok(sw.includes("CACHE_RAPORLAR_VERSION = 'medisa-raporlar-" + ver(core, 'raporlar') + "'"));
});
test('driver assets precache == MEDISA_DRIVER_ASSET_VERSIONS', () => {
  has('/driver/driver-script.js?v=' + ver(driverScript, 'bootstrap'));
  has('/driver/driver-login.js?v=' + ver(driverScript, 'login'));
  has('/driver/driver-dashboard-core.js?v=' + ver(driverScript, 'dashboardCore'));
  has('/driver/driver-shell.css?v=' + ver(driverScript, 'shellCss'));
  has('/driver/driver-features.css?v=' + ver(driverScript, 'featureCss'));
  ['history', 'documents', 'feedback', 'password', 'actions'].forEach((k) => has('/driver/driver-feature-' + k + '.js?v=' + ver(driverScript, k)));
  has('/driver/index.html');
  has('/driver/dashboard.html');
});
test('page-referenced local assets are precached', () => {
  [['index.html', ''], ['driver/index.html', '/driver/'], ['driver/dashboard.html', '/driver/']].forEach(([f, dir]) => {
    const html = read(f);
    const re = /<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+\.(?:js|css)\?v=[^"]+)"/g;
    let m;
    while ((m = re.exec(html))) {
      let u = m[1];
      if (/^https?:/.test(u)) continue;
      if (u.startsWith('../')) u = '/' + u.slice(3);
      else if (u.startsWith('./')) u = dir + u.slice(2);
      else if (!u.startsWith('/')) u = (dir || '/') + u;
      has(u);
    }
  });
});
test('offline navigation: ignoreSearch + path-aware redirect', () => {
  assert.match(sw, /caches\.match\(request, \{ ignoreSearch: true \}\)/);
  assert.match(sw, /Response\.redirect\(/);
  assert.match(sw, /'\/driver\/dashboard\.html' : '\/driver\/index\.html'/);
});
test('static network-first timeout: yaln\u0131z GET statik, API/PHP hari\u00e7', () => {
  assert.match(sw, /const NETWORK_TIMEOUT_MS = 3500;/);
  const apiIdx = sw.indexOf("url.pathname.includes('/api/') || url.pathname.includes('.php')");
  const toIdx = sw.indexOf('}, NETWORK_TIMEOUT_MS);');
  assert.ok(apiIdx > 0 && toIdx > apiIdx, 'timeout API/PHP dal\u0131ndan sonra (statik dalda) olmal\u0131');
  assert.match(sw, /if \(request\.method !== 'GET'\) \{\s*event\.respondWith\(networkPromise\.catch\(offlineFallback\)\);/);
});
console.log(failed ? 'FAILED ' + failed : 'All passed');
process.exit(failed ? 1 : 0);
