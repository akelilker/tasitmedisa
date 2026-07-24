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

test('core shell ana menü triggerlarını korur', function() {
  ['openVehicleModal()', 'openVehiclesView()', 'openReportsView()'].forEach(function(needle) {
    assert.ok(index.includes(needle), needle + ' yok');
  });
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
    ['openBranchManagement', 'openUserManagement', 'openZorunluEvraklar', 'openDataManagement', 'openDisVeriPanel', 'exportData', 'restoreFromLastBackup', 'importData'].forEach(function(name) {
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
  test('version ve SW cache beklenen değerde', function() {
    assert.match(core, /tasitlar: '20260723\.3'/);
    assert.match(index, /script-core\.js\?v=20260723\.5/);
    assert.match(index, /style-core\.css\?v=20260723\.16/);
    assert.match(sw, /medisa-v2\.248/);
  });
  test('fiziksel footer gap layer owner kontratı', function() {
    var gapMatches = index.match(/id="app-footer-gap-layer"/g) || [];
    assert.strictEqual(gapMatches.length, 1, 'index içinde tek app-footer-gap-layer olmalı');
    var gapIdx = index.indexOf('id="app-footer-gap-layer"');
    var footerIdx = index.indexOf('id="app-footer"');
    assert.ok(gapIdx > -1 && footerIdx > gapIdx, 'gap layer footer siblinginden önce olmalı');
    assert.match(style, /#app-footer-gap-layer\s*\{/);
    // Gap ışığı yalnız modal açıkken görünür (KAYIT/metin sızıntısı önleme); modal kapalıyken
    // footer kendi doğal box-shadow'uyla yumuşak sönümlenir (eski davranış korunur).
    assert.match(style, /body:not\(\.dashboard-page\):not\(\.login-page\):not\(\.admin-report-page\)\.modal-open #app-footer-gap-layer\s*\{/);
    assert.match(style, /#app-footer-gap-layer[\s\S]*?z-index:\s*10010/);
    assert.match(style, /#app-footer-gap-layer[\s\S]*?pointer-events:\s*none/);
    assert.match(style, /#app-footer-gap-layer[\s\S]*?var\(--bg\)/);
    assert.match(style, /#app-footer-gap-layer[\s\S]*?var\(--app-footer-gap/);
    // Footer bloom'u modal açık/kapalı AYNI kalır: red-glow her durumda açıktır ve
    // modal açılınca footer ışığı kapatılmaz (kullanıcı: "modal yokken nasılsa öyle").
    assert.match(style, /body:not\(\.dashboard-page\):not\(\.login-page\):not\(\.admin-report-page\) #app-footer\s*\{[\s\S]*?var\(--footer-red-glow\)\s*!important/);
    assert.doesNotMatch(style, /\.modal-open #app-footer\s*\{[\s\S]*?box-shadow:\s*0 -1px 0 var\(--footer-top-highlight\)\s*!important;/);
    assert.doesNotMatch(style, /:has\([^)]*\)\s*#app-footer::before/);
    assert.doesNotMatch(style, /body[^{]*\.modal-open[^{]*#app-footer::before\s*\{[^}]*opacity:\s*1/);
    assert.doesNotMatch(style, /#app-footer::before\s*\{[^}]*background:\s*none/, 'ölü #app-footer::before override kaldırılmalı');
    assert.doesNotMatch(style, /z-index:\s*100060/);
    var footerZMatch = style.match(/^#app-footer\s*\{[\s\S]*?z-index:\s*(\d+)/m);
    var gapZMatch = style.match(/^#app-footer-gap-layer\s*\{[\s\S]*?z-index:\s*(\d+)/m);
    var modalZMatch = style.match(/^\.modal-overlay\s*\{[\s\S]*?z-index:\s*(\d+)/m);
    assert.ok(footerZMatch && gapZMatch && modalZMatch, 'footer/gap/modal z-index owner bulunmalı');
    var footerZ = Number(footerZMatch[1]);
    var gapZ = Number(gapZMatch[1]);
    var modalZ = Number(modalZMatch[1]);
    assert.strictEqual(footerZ, 10000);
    assert.strictEqual(gapZ, 10010);
    assert.strictEqual(modalZ, 10020);
    assert.ok(footerZ < gapZ && gapZ < modalZ, '10000 < 10010 < 10020 sıralaması korunmalı');
  });
  test('package main shell araçlarını içerir', function() {
    assert.match(packageJson, /tool:verify-main-shell/);
    assert.match(packageJson, /tool:measure-main-shell/);
  });
  test('canonical quality gate main shell araçlarını çalıştırır', function() {
    assert.match(qualityGate, /npm run tool:verify-main-shell/);
    assert.match(qualityGate, /npm run tool:measure-main-shell/);
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
}

console.log('\nMain shell invariants: ' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exitCode = 1;
