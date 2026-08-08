/**
 * PERF-P2-1 — ana shell lazy markup source invariantleri.
 * Baseline aşamasında ölçüm scripti/owner sınırlarını; implementation sonrası
 * registry, proxy ve initial-DOM kontratlarını doğrular.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const index = read('index.html');
const core = read('script-core.js');
const style = read('style-core.css');
const measure = read('scripts/measure-medisa-main-shell.js');
const owners = {
  kayit: read('kayit.js'),
  vehicles: read('tasitlar.js'),
  reports: read('raporlar.js'),
  settings: read('ayarlar.js')
};
const vehiclesYazici = read('tasitlar-yazici.js');
const sw = read('sw.js');
const tasitlarBase = read('tasitlar-base.css');
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

test('baseline ölçümü index/body/feature byte alanlarını içerir', function() {
  assert.match(measure, /indexHtmlBytes/);
  assert.match(measure, /bodyBytes/);
  assert.match(measure, /hiddenFeatureMarkupBytes/);
});

test('baseline ölçümü node ve duplicate ID alanlarını içerir', function() {
  assert.match(measure, /totalElementNodes/);
  assert.match(measure, /initialHiddenFeatureNodes/);
  assert.match(measure, /duplicateIdCount/);
});

test('core shell ana menü intent attribute korur', function() {
  ['open-kayit', 'open-tasitlar', 'open-raporlar'].forEach(function(intent) {
    assert.ok(index.includes('data-medisa-shell-intent="' + intent + '"'), intent + ' yok');
  });
  assert.match(index, /MedisaShellIntentBridge/);
  assert.doesNotMatch(index, /onclick="openVehicleModal\(\)"/);
  assert.doesNotMatch(index, /onclick="openVehiclesView\(\)"/);
  assert.doesNotMatch(index, /onclick="openReportsView\(\)"/);
});

test('thin-shell direct-open early fallback yok', function() {
  assert.doesNotMatch(index, /openModal\('vehicles-modal'\)/);
  assert.doesNotMatch(index, /openModal\('reports-modal'\)/);
  assert.doesNotMatch(index, /openModal\('vehicle-modal'\)/);
});

test('splash minimum süresi 2000 ms kalır', function() {
  assert.match(index, /MIN_SPLASH_MS\s*=\s*2000/);
});

test('mevcut lazy module ownerı korunur', function() {
  assert.match(core, /window\.loadAppModule\s*=/);
  assert.match(core, /window\.openVehiclesView\s*=\s*lazyOpenVehiclesView/);
  assert.match(core, /window\.openVehicleModal\s*=\s*lazyOpenVehicleModal/);
});

const implementationPresent = /MedisaMainSurfaceRegistry/.test(core);

if (implementationPresent) {
  test('surface registry register/ensure/isHydrated/getMetrics kontratı', function() {
    ['register:', 'ensure:', 'isHydrated:', 'getMetrics:'].forEach(function(needle) {
      assert.ok(core.includes(needle), needle + ' eksik');
    });
  });

  test('feature markup initial DOM dışında', function() {
    [
      'id="vehicle-modal"',
      'id="vehicles-modal"',
      'id="reports-modal"',
      'id="branch-modal"',
      'id="user-modal"',
      'id="required-documents-modal"',
      'id="event-menu-modal"',
      'id="vehicle-history-modal"'
    ].forEach(function(needle) {
      assert.ok(!index.includes(needle), needle + ' initial DOM içinde');
    });
  });

  test('offline uncached surface kontrollü hata mesajı', function() {
    assert.match(core, /Bu bölüm ilk kullanım için internet bağlantısı gerektiriyor\./);
  });

  test('feature assetleri SW install-time precache listesinde yok', function() {
    const cacheFiles = sw.match(/const CACHE_FILES\s*=\s*\[([\s\S]*?)\];/);
    assert.ok(cacheFiles);
    assert.doesNotMatch(cacheFiles[1], /kayit|tasitlar|raporlar|ayarlar/);
  });

  [
    ['kayıt', 'vehicle-modal', owners.kayit],
    ['taşıtlar', 'vehicles-modal', owners.vehicles],
    ['raporlar', 'reports-modal', owners.reports],
    ['ayarlar', 'branch-modal', owners.settings]
  ].forEach(function(owner) {
    test(owner[0] + ' markup owner modülünde', function() {
      assert.ok(owner[2].includes('id="' + owner[1] + '"'));
      assert.match(owner[2], /__medisaMainSurfaceHydrators/);
    });
  });

  test('kayıt surface tek injection guardı kullanır', function() {
    assert.match(owners.kayit, /getElementById\('vehicle-modal'\)\) return/);
  });
  test('taşıtlar surface tek injection guardı kullanır', function() {
    assert.match(owners.vehicles, /getElementById\('vehicles-modal'\)\) return/);
  });
  test('raporlar surface tek injection guardı kullanır', function() {
    assert.match(owners.reports, /getElementById\('reports-modal'\)\) return/);
  });
  test('ayarlar surface tek injection guardı kullanır', function() {
    assert.match(owners.settings, /getElementById\('branch-modal'\)\) return/);
  });

  test('paralel ensure aynı inflight Promise döndürür', function() {
    assert.match(core, /if \(inflight\[name\]\) return inflight\[name\]/);
  });
  test('başarısız ensure retry için inflight temizler', function() {
    assert.match(core, /hydrated\[name\] = false/);
    assert.match(core, /delete inflight\[name\]/);
  });
  test('başarılı ikinci ensure yeniden load yapmaz', function() {
    assert.match(core, /if \(hydrated\[name\]\)[\s\S]*?Promise\.resolve/);
  });
  test('markup injection document fragment ile atomik yapılır', function() {
    Object.values(owners).forEach(function(owner) {
      assert.match(owner, /createDocumentFragment/);
      assert.match(owner, /document\.body\.appendChild\(fragment\)/);
    });
  });
  test('document.write ve full-page replacement yok', function() {
    Object.values(owners).forEach(function(owner) {
      const hydrator = owner.slice(0, owner.indexOf('window.__medisaMainSurfaceHydrators'));
      assert.doesNotMatch(hydrator, /document\.write/);
      assert.doesNotMatch(hydrator, /document\.documentElement\.innerHTML|document\.body\.innerHTML\s*=/);
    });
  });

  test('kayıt zorunlu ID kontratları registry içinde', function() {
    ['vehicle-modal', 'vehicle-type-picker-overlay', 'tescil-tarih-confirm-modal', 'vehicle-egzoz-date-modal'].forEach(function(id) {
      assert.ok(core.includes("'" + id + "'"));
    });
  });
  test('taşıt zorunlu ID kontratları registry içinde', function() {
    ['vehicles-modal', 'vehicle-detail-modal', 'event-menu-modal', 'vehicle-history-modal'].forEach(function(id) {
      assert.ok(core.includes("'" + id + "'"));
    });
  });
  test('rapor zorunlu ID kontratları registry içinde', function() {
    ['reports-modal', 'reports-body', 'reports-list-header-actions'].forEach(function(id) {
      assert.ok(core.includes("'" + id + "'"));
    });
  });
  test('ayarlar zorunlu ID kontratları registry içinde', function() {
    ['branch-modal', 'user-modal', 'required-documents-modal', 'data-management-modal', 'dis-veri-panel'].forEach(function(id) {
      assert.ok(core.includes("'" + id + "'"));
    });
  });

  test('global kayıt ve taşıt proxyleri core yüklenince atanır', function() {
    assert.match(core, /window\.openVehicleModal\s*=\s*lazyOpenVehicleModal/);
    assert.match(core, /window\.openVehiclesView\s*=\s*lazyOpenVehiclesView/);
  });
  test('global rapor proxy registry ensure kullanır', function() {
    assert.match(core, /MedisaMainSurfaceRegistry\.ensure\('reports'\)/);
  });
  test('global ayarlar proxyleri registry ensure kullanır', function() {
    assert.match(core, /MedisaMainSurfaceRegistry\.ensure\('settings'\)/);
    ['openBranchManagement', 'openUserManagement', 'openZorunluEvraklar', 'openDataManagement', 'openDisVeriPanel', 'exportData', 'showLastBackupMetadata', 'importData'].forEach(function(name) {
      assert.ok(core.includes("wrapAyarlar('" + name + "')"), name + ' proxy eksik');
    });
  });
  test('bildirimden detay geçişi taşıt surface ready ownerını kullanır', function() {
    assert.match(core, /medisaOpenVehicleDetailFromNotification[\s\S]*?ensureVehicleNotificationTargetReady/);
  });
  test('bildirimden tarihçe geçişi taşıt surface ready ownerını kullanır', function() {
    assert.match(core, /medisaOpenVehicleHistoryFromNotification[\s\S]*?ensureVehicleNotificationTargetReady/);
  });
  test('core shell feature markup taşımaz; parola surface ayarlar/lazy tarafında', function() {
    assert.doesNotMatch(index, /id="vehicle-modal"/);
    assert.doesNotMatch(index, /id="branch-modal"/);
    assert.doesNotMatch(index, /id="main-password-modal"/);
  });
  test('ayarlar idle preload kaldırılmıştır', function() {
    assert.doesNotMatch(core, /preloadAyarlarModuleInIdleTime/);
  });
  test('CSS ve JS loadAppModule kontratıyla birlikte beklenir', function() {
    assert.match(core, /loadAppModule\(KAYIT_JS, KAYIT_CSS\)/);
    assert.match(core, /loadAppModule\(TASITLAR_JS, TASITLAR_CSS_LIST\)/);
    assert.match(core, /loadAppModule\(RAPORLAR_JS, RAPORLAR_CSS\)/);
    assert.match(core, /loadAppModule\(AYARLAR_JS, AYARLAR_CSS\)/);
  });
  test('debug metrikleri yalnız explicit flag ile açılır', function() {
    assert.match(core, /medisa_perf_debug/);
    assert.match(core, /medisaPerf=1/);
  });
  test('debug metrik alanları teknik ve sınırlıdır', function() {
    ['initialHtmlBytes', 'initialDomNodes', 'initialHiddenNodes', 'hydratedSurfaces', 'surfaceHydrationMs', 'surfaceInjectionCounts', 'duplicateIdCount', 'appReadyAt', 'splashHiddenAt'].forEach(function(name) {
      assert.ok(core.includes(name), name + ' metriği eksik');
    });
    assert.doesNotMatch(core.match(/metrics = \{[\s\S]*?\n      \};/)[0], /plate|password|userName|tasitlar|users/);
  });
  test('splash appReady ve hidden metriklerini ayrı kaydeder', function() {
    assert.match(index, /__medisaMainShellMetrics\.appReadyAt/);
    assert.match(index, /__medisaMainShellMetrics\.splashHiddenAt/);
  });
  test('style-core HTML pinleri ve SW precache parity', function() {
    var stylePins = [];
    var stylePinRe = /style-core\.css\?v=([^"'\s>]+)/g;
    var m;
    while ((m = stylePinRe.exec(index)) !== null) stylePins.push(m[1]);
    assert.ok(stylePins.length >= 3, 'index.html style-core pin referansları bulunmalı');
    var stylePin = stylePins[0];
    assert.ok(stylePin, 'style-core pin boş olmamalı');
    stylePins.forEach(function(pin) {
      assert.strictEqual(pin, stylePin, 'index.html preload/stylesheet/noscript style-core pinleri eşit olmalı');
    });
    assert.notStrictEqual(stylePin, '20260724.1', 'style-core pin eski merge regresyon değeri olmamalı');

    var cacheFiles = sw.match(/const CACHE_FILES\s*=\s*\[([\s\S]*?)\];/);
    assert.ok(cacheFiles, 'CACHE_FILES bulunmalı');
    var cacheBlock = cacheFiles[1];
    assert.match(cacheBlock, new RegExp("'/style-core\\.css\\?v=" + stylePin.replace(/\./g, '\\.') + "'"));
    assert.doesNotMatch(cacheBlock, /'\/style-core\.css'/);
  });
  test('paylaşılan shell style-core pin parity', function() {
    var shells = {
      'index.html': index,
      'driver/index.html': read('driver/index.html'),
      'driver/dashboard.html': read('driver/dashboard.html'),
      'admin/driver-report.html': read('admin/driver-report.html')
    };
    var pins = {};
    Object.keys(shells).forEach(function(name) {
      var match = shells[name].match(/style-core\.css\?v=([^"'\s>]+)/);
      assert.ok(match && match[1], name + ' style-core pin bulunmalı');
      pins[name] = match[1];
    });
    var canonical = pins['index.html'];
    Object.keys(pins).forEach(function(name) {
      assert.strictEqual(pins[name], canonical, name + ' style-core pin ana shell ile eşit olmalı');
    });
  });
  test('paylaşılan shell script-core pin parity', function() {
    var shells = {
      'index.html': index,
      'driver/index.html': read('driver/index.html'),
      'driver/dashboard.html': read('driver/dashboard.html'),
      'admin/driver-report.html': read('admin/driver-report.html')
    };
    var canonicalMatch = index.match(/script-core\.js\?v=([^"'\s>]+)/);
    assert.ok(canonicalMatch && canonicalMatch[1], 'index.html içinde versioned script-core.js?v=<pin> bulunmalı');
    var canonical = canonicalMatch[1];
    assert.match(canonical, /^\d{8}\.\d+$/, 'kanonik script-core pin tarih.surum formatında olmalı');

    Object.keys(shells).forEach(function(name) {
      var html = shells[name];
      var expectedPath = name === 'index.html' ? 'script-core.js' : '../script-core.js';
      var refs = [];
      var refRe = /(?:\.\.\/)?script-core\.js(?:\?[^"'\s>]*)?/g;
      var m;
      while ((m = refRe.exec(html)) !== null) {
        refs.push(m[0]);
      }
      assert.strictEqual(
        refs.length,
        1,
        name + ' script-core referansı tam bir kez bulunmalı (bulunan=' + refs.length + ', refs=' + JSON.stringify(refs) + ')'
      );
      var ref = refs[0];
      var pathOnly = ref.split('?')[0];
      assert.strictEqual(
        pathOnly,
        expectedPath,
        name + ' script-core path yanlış (beklenen=' + expectedPath + ', bulunan=' + pathOnly + ')'
      );
      var pinMatch = ref.match(/\?v=([^&"'\s>]+)/);
      assert.ok(
        pinMatch && pinMatch[1],
        name + ' script-core referansı versioned olmalı; pinsiz kabul edilmez (ref=' + ref + ')'
      );
      assert.strictEqual(
        pinMatch[1],
        canonical,
        name + ' script-core pin (' + pinMatch[1] + ') kanonik index.html pini (' + canonical + ') ile ayrışıyor'
      );
    });
  });
  test('version ve SW cache owner parity', function() {
    var loaderVer = (core.match(/tasitlar:\s*'([^']+)'/) || [])[1];
    var moduleVer = (owners.vehicles.match(/MEDISA_TASITLAR_MODULE_VERSION\s*=\s*'([^']+)'/) || [])[1];
    assert.ok(loaderVer && moduleVer, 'tasitlar sürüm sabitleri bulunmalı');
    assert.strictEqual(loaderVer, moduleVer, 'MEDISA_MODULE_VERSIONS.tasitlar === MEDISA_TASITLAR_MODULE_VERSION');

    var scriptPin = (index.match(/script-core\.js\?v=([^"'\s>]+)/) || [])[1];
    assert.ok(scriptPin, 'script-core pin bulunmalı');
    assert.match(scriptPin, /^\d{8}\.\d+$/, 'script-core pin tarih.surum formatında olmalı');

    var dataManagerPin = (index.match(/data-manager\.js\?v=([^"'\s>]+)/) || [])[1];
    assert.ok(dataManagerPin, 'data-manager pin bulunmalı');
    assert.match(dataManagerPin, /^\d{8}\.\d+$/, 'data-manager pin tarih.surum formatında olmalı');

    var ayarlarJsVer = (core.match(/ayarlarJs:\s*'([^']+)'/) || [])[1];
    assert.ok(ayarlarJsVer, 'MEDISA_MODULE_VERSIONS.ayarlarJs bulunmalı');
    assert.match(ayarlarJsVer, /^\d{8}\.\d+$/, 'ayarlarJs sürümü tarih.surum formatında olmalı');

    var cacheVersion = (sw.match(/CACHE_VERSION\s*=\s*'([^']+)'/) || [])[1];
    assert.ok(cacheVersion, 'CACHE_VERSION tanımlı olmalı');
    assert.match(cacheVersion, /^medisa-v2\.\d+$/);
    assert.notStrictEqual(cacheVersion, 'medisa-v2.266', 'CACHE_VERSION bilinen merge regressyon değeri olmamalı');
  });
  test('Raporlar modül ve SW cache sürüm paritesi', function() {
    var raporlarModuleVer = (core.match(/raporlar:\s*'([^']+)'/) || [])[1];
    var raporlarCacheVer = (sw.match(/CACHE_RAPORLAR_VERSION\s*=\s*'medisa-raporlar-([^']+)'/) || [])[1];
    assert.ok(raporlarModuleVer, 'MEDISA_MODULE_VERSIONS.raporlar bulunmalı');
    assert.ok(raporlarCacheVer, 'CACHE_RAPORLAR_VERSION bulunmalı');
    assert.strictEqual(raporlarModuleVer, raporlarCacheVer, 'Raporlar modül ve SW cache aynı tarih sürümünü taşımalı');
  });
  test('KAYIT home closeVehicleModal owner kullanır', function() {
    var kayitHome = owners.kayit.match(/id="vehicle-modal"[\s\S]*?class="modal-home"[^>]*>/);
    assert.ok(kayitHome, 'KAYIT modal-home bulunmalı');
    assert.match(kayitHome[0], /onclick="closeVehicleModal\(\)"/);
    assert.doesNotMatch(kayitHome[0], /closeAllModals/);
    assert.match(owners.kayit, /window\.closeVehicleModal\s*=\s*function/);
  });
  test('RAPORLAR home closeReportsModal owner kullanır', function() {
    var reportsHome = owners.reports.match(/id="reports-modal"[\s\S]*?class="modal-home"[^>]*>/);
    assert.ok(reportsHome, 'RAPORLAR modal-home bulunmalı');
    assert.match(reportsHome[0], /onclick="closeReportsModal\(\)"/);
    assert.doesNotMatch(reportsHome[0], /closeAllModals/);
    assert.match(owners.reports, /window\.closeReportsModal\s*=\s*function/);
  });
  test('aylık yapılacaklar home closeAllModals taşımıyor; local owner bağlanır', function() {
    var notifications = read('notifications.js');
    assert.match(notifications, /data-action="monthly-todo-home"/);
    assert.doesNotMatch(notifications, /getMonthlyTodoHomeButtonHtml[\s\S]*?onclick="closeAllModals\(\)"/);
    assert.match(notifications, /function closeMonthlyTodoModal\s*\(/);
    assert.match(notifications, /wireMonthlyTodoModalCloseUiOnce[\s\S]*?data-action="monthly-todo-home"[\s\S]*?closeMonthlyTodoModal\s*\(/);
    assert.doesNotMatch(notifications, /window\.closeMonthlyTodoModal\s*=/);
  });
  test('taşıt dışı lazy markup onclick closeAllModals taşımaz', function() {
    assert.doesNotMatch(owners.kayit, /onclick="closeAllModals\(\)"/);
    assert.doesNotMatch(owners.reports, /onclick="closeAllModals\(\)"/);
    var notifications = read('notifications.js');
    assert.doesNotMatch(notifications, /onclick="closeAllModals\(\)"/);
  });
  test('taşıtlar closeAllModals owner ve güvenli iç çağrı korunur', function() {
    assert.match(owners.vehicles, /window\.closeAllModals\s*=\s*function/);
    assert.match(owners.vehicles, /onclick="closeAllModals\(\)"/);
    assert.match(owners.vehicles, /else if \(typeof window\.closeAllModals === 'function'\) \{\s*window\.closeAllModals\(\);\s*\}/);
    assert.doesNotMatch(owners.vehicles, /else \{\s*closeAllModals\(\);\s*\}/);
  });
  test('modal açıkken yan çerçeve gap bandına inmez', function() {
    assert.match(style, /body:not\(\.dashboard-page\):not\(\.login-page\):not\(\.admin-report-page\)\.modal-open \.app-container::before\s*\{[\s\S]*?var\(--app-footer-real-height\)\s*\+\s*var\(--app-footer-gap\)/);
  });
  test('masaüstü ana modal üst çerçevesi header kırmızısından ayrılır', function() {
    // Option A2: shared desktop single-inset ::before frame owner (lifecycle-independent).
    // Native border/outline transparent; mobile top-highlight stays in tasitlar-base.
    assert.match(
      style,
      /@media \(min-width:\s*641px\)[\s\S]*?#vehicle-modal\.modal-overlay \.modal-container,[\s\S]*?#vehicles-modal\.modal-overlay \.modal-container,[\s\S]*?#reports-modal\.modal-overlay \.modal-container\s*\{[\s\S]*?border-color:\s*transparent\s*!important;[\s\S]*?outline-color:\s*transparent\s*!important;/
    );
    assert.match(
      style,
      /@media \(min-width:\s*641px\)[\s\S]*?#vehicle-modal\.modal-overlay \.modal-container::before,[\s\S]*?#vehicles-modal\.modal-overlay \.modal-container::before,[\s\S]*?#reports-modal\.modal-overlay \.modal-container::before\s*\{[\s\S]*?inset:\s*0;[\s\S]*?border:\s*1px solid rgba\(200,\s*208,\s*216,\s*0\.60\);/
    );
    assert.match(
      style,
      /@media \(min-width:\s*641px\)[\s\S]*?\.modal-open\.modal-returning \.app-container::before\s*\{[\s\S]*?bottom:\s*var\(--app-footer-real-height\)/
    );
    assert.match(
      tasitlarBase,
      /@media \(max-width:\s*640px\)\s*\{[\s\S]*?#vehicles-modal \.modal-container::before\s*\{[\s\S]*?height:\s*1px;/
    );
  });
  test('detail-underlay boyama yapmaz (footer gap bloom ezilmesin)', function() {
    assert.match(tasitlarBase, /#vehicles-modal\.detail-underlay[\s\S]*?visibility:\s*hidden\s*!important/);
    assert.match(tasitlarBase, /#vehicles-modal\.detail-underlay[\s\S]*?isolation:\s*auto\s*!important/);
  });
  test('footer red-glow tek ışık kaynağı (ayrı gap layer yok)', function() {
    // Ayrı fiziksel gap ışık katmanı (#app-footer-gap-layer) tamamen kaldırıldı.
    // Işık yalnız footer'ın kendi --footer-red-glow box-shadow'undan gelir ve modal
    // açık/kapalı FARK ETMEKSİZİN aynı kalır (modal sadece üste biner).
    assert.strictEqual(index.indexOf('id="app-footer-gap-layer"'), -1, 'gap layer div kaldırılmalı');
    assert.doesNotMatch(style, /#app-footer-gap-layer/, 'gap layer CSS bloğu kaldırılmalı');
    assert.doesNotMatch(core, /getFooterGapLayer|app-footer-gap-layer/, 'gap layer JS mantığı kaldırılmalı');
    // Footer bloom'u modal açık/kapalı AYNI: red-glow her durumda açık; modal açılınca
    // footer ışığını kapatan/sadeleştiren override yok (kullanıcı: "modal yokken nasılsa öyle").
    assert.match(style, /body:not\(\.dashboard-page\):not\(\.login-page\):not\(\.admin-report-page\) #app-footer\s*\{[\s\S]*?var\(--footer-red-glow\)\s*!important/);
    assert.doesNotMatch(style, /\.modal-open #app-footer\s*\{[\s\S]*?box-shadow:\s*0 -1px 0 var\(--footer-top-highlight\)\s*!important;/);
    assert.doesNotMatch(style, /:has\([^)]*\)\s*#app-footer::before/);
    assert.doesNotMatch(style, /#app-footer::before\s*\{[^}]*background:\s*none/, 'ölü #app-footer::before override kaldırılmalı');
    assert.doesNotMatch(style, /z-index:\s*100060/);
    var footerZMatch = style.match(/^#app-footer\s*\{[\s\S]*?z-index:\s*(\d+)/m);
    var modalZMatch = style.match(/^\.modal-overlay\s*\{[\s\S]*?z-index:\s*(\d+)/m);
    assert.ok(footerZMatch && modalZMatch, 'footer/modal z-index owner bulunmalı');
    var footerZ = Number(footerZMatch[1]);
    var modalZ = Number(modalZMatch[1]);
    assert.strictEqual(footerZ, 10000);
    assert.strictEqual(modalZ, 10020);
    assert.ok(footerZ < modalZ, 'footer modal altında (10000 < 10020) kalmalı');
  });
  test('package main shell araçlarını içerir', function() {
    assert.match(packageJson, /tool:verify-main-shell/);
    assert.match(packageJson, /tool:measure-main-shell/);
    assert.match(packageJson, /tool:verify-thin-shell/);
  });
  test('canonical quality gate main shell araçlarını çalıştırır', function() {
    assert.match(qualityGate, /npm run tool:verify-main-shell/);
    assert.match(qualityGate, /npm run tool:measure-main-shell/);
    assert.match(qualityGate, /npm run tool:verify-thin-shell/);
  });
  test('ölçüm hard gate alanlarını içerir', function() {
    ['htmlReduction30PctOr50KiB', 'initialDomNodeReduction40Pct', 'initialFeatureModalNodesZero', 'htmlPlusTemplatesWithin110Pct'].forEach(function(name) {
      assert.ok(measure.includes(name));
    });
  });
  test('browser ölçümü 3 canonical viewport içerir', function() {
    ['1280, height: 800', '768, height: 1024', '390, height: 844'].forEach(function(needle) {
      assert.ok(measure.includes(needle));
    });
  });
  test('browser ölçümü 3 warm-up ve 10 run varsayılanını korur', function() {
    assert.match(measure, /MEDISA_BROWSER_WARMUPS \|\| 3/);
    assert.match(measure, /MEDISA_BROWSER_RUNS \|\| 10/);
  });
  test('iOS device helper global owner mevcut', function() {
    assert.match(core, /window\.isMedisaIOSDevice\s*=\s*function\s+isMedisaIOSDevice\s*\(/);
  });
  test('isIOSPWA standalone şartını korur', function() {
    assert.match(core, /window\.isIOSPWA\s*=\s*function\s+isIOSPWA\s*\(/);
    assert.match(core, /isMedisaIOSDevice\(\)/);
    assert.match(core, /display-mode:\s*standalone/);
    assert.match(core, /navigator\.standalone/);
  });
  test('taşıt kartı iOS device helper ile manuel preview', function() {
    assert.match(vehiclesYazici, /isMedisaIOSDevice\(\)[\s\S]*?openMedisaIosPwaPrintPreview\(printHtml,\s*'Taşıt Kartı Yazdır'\)/);
    assert.doesNotMatch(vehiclesYazici, /isIOSPWA\(\)[\s\S]{0,120}openMedisaIosPwaPrintPreview\(printHtml,\s*'Taşıt Kartı Yazdır'\)/);
  });
  test('stok raporu iOS device helper ile manuel preview', function() {
    assert.match(owners.reports, /isMedisaIOSDevice\(\)[\s\S]*?openMedisaIosPwaPrintPreview\(printHtml,\s*'Stok Raporu Yazdır'\)/);
    assert.doesNotMatch(owners.reports, /setTimeout\(runIframePrint,\s*200\)/);
    assert.doesNotMatch(owners.reports, /isIOSPWA\(\)[\s\S]{0,160}openMedisaIosPwaPrintPreview\(printHtml,\s*'Stok Raporu Yazdır'\)/);
  });
  test('belge image/PDF print iOS device helper sonrası preview', function() {
    assert.match(owners.vehicles, /useIosManualPrintPreview[\s\S]*?isMedisaIOSDevice\(\)/);
    assert.match(owners.vehicles, /useIosManualPrintPreview\s*&&\s*isImage[\s\S]*?openMedisaIosPwaPrintPreview\(buildImagePrintHtml/);
    assert.match(owners.vehicles, /useIosManualPrintPreview\s*&&\s*!isImage[\s\S]*?openMedisaIosPwaPrintPreview\(buildIosPwaPdfPrintHtml/);
  });
  test('Android taşıt kartı preview owner korunur', function() {
    assert.match(vehiclesYazici, /isAndroidDevice\(\)\s*&&\s*openPrintPreviewWindow\(printHtml\)/);
  });
  test('desktop/non-iOS iframe fallback owner korunur', function() {
    assert.match(vehiclesYazici, /function printWithIframeFallback\s*\(/);
    assert.match(vehiclesYazici, /printWithIframeFallback\(\);/);
    assert.match(owners.reports, /function runIframePrint\s*\(/);
    assert.match(owners.reports, /runIframePrint\(\);/);
  });
  test('preview helper native print yalnız toolbar print action içinde', function() {
    var previewStart = core.indexOf('window.openMedisaIosPwaPrintPreview = function');
    assert.ok(previewStart !== -1, 'openMedisaIosPwaPrintPreview owner bulunmalı');
    var previewEnd = core.indexOf('\nwindow.formatPlaka', previewStart);
    if (previewEnd === -1) previewEnd = previewStart + 6000;
    var previewSlice = core.slice(previewStart, previewEnd);
    assert.match(previewSlice, /action === 'print'/);
    assert.match(previewSlice, /frameWindow\.print\(\)/);
    assert.ok(previewSlice.indexOf("action === 'print'") < previewSlice.indexOf('frameWindow.print()'), 'print toolbar action içinde olmalı');
    assert.doesNotMatch(previewSlice, /setTimeout\([^)]*print/);
  });
  test('tasitlarYazici sürüm registry paritesi', function() {
    assert.match(core, /tasitlarYazici:\s*'20260726\.3'/);
  });
}

console.log('\nMain shell invariants: ' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exitCode = 1;
