/**
 * Driver login ana başlık sığma kontratı (statik; Docker/PHP gerekmez).
 * Çalıştır: node scripts/verify-driver-login-title-fit.js
 * npm: tool:verify-login-title-fit
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

let failed = false;
function assert(name, cond, detail) {
  if (!cond) {
    console.error('[FAIL]', name, detail || '');
    failed = true;
  } else {
    console.log('[OK]', name);
  }
}

const indexHtml = read('driver/index.html');
const dashHtml = read('driver/dashboard.html');
const driverShell = read('driver/driver-shell.css');
const styleCore = read('style-core.css');

assert(
  'login_plain_hero_h1',
  /class="hero"(?![^>]*hero-two-rows)[\s\S]*?<h1>TAŞIT YÖNETİM SİSTEMİ<\/h1>/.test(indexHtml) &&
    !indexHtml.includes('hero-title-line') &&
    !indexHtml.includes('hero-title-block'),
  'Login HTML plain .hero > h1 olmalı'
);

assert(
  'login_loads_driver_shell',
  /href="driver-shell\.css\?v=20260723\.2"/.test(indexHtml),
  'Login driver-shell.css?v=20260723.2 yüklemeli'
);

assert(
  'login_no_blocking_features_css',
  !/href="driver-features\.css/.test(indexHtml),
  'Login driver-features.css blocking yüklememeli'
);

assert(
  'login_no_blocking_style_aggregator',
  !/href="driver-style\.css/.test(indexHtml),
  'Login driver-style.css aggregator blocking yüklememeli'
);

assert(
  'login_h1_direct_child_selector',
  /\.login-page\s+\.hero\s*>\s*h1\s*\{/.test(driverShell),
  'driver-shell.css .login-page .hero > h1 selector içermeli'
);

assert(
  'login_fit_contract_min_width_flex',
  /\.login-page\s+\.hero\s*>\s*h1\s*\{[^}]*min-width:\s*0/.test(driverShell) &&
    /\.login-page\s+\.hero\s*>\s*h1\s*\{[^}]*flex:\s*1\s+1\s+0/.test(driverShell),
  'Login h1 min-width/flex kontratı olmalı'
);

assert(
  'login_desktop_fit_contract',
  /\.login-page\s+\.hero\s*>\s*h1\s*\{[^}]*font-size:\s*20px/.test(driverShell) &&
    /\.login-page\s+\.hero\s*>\s*h1\s*\{[^}]*letter-spacing:\s*2\.4px/.test(driverShell) &&
    /\.login-page\s+\.hero\s*>\s*h1\s*\{[^}]*text-overflow:\s*clip/.test(driverShell),
  'Desktop login fit kontratı (20px / 2.4px / clip) olmalı'
);

assert(
  'login_mobile_fit_contract',
  /clamp\(16\.5px,\s*4\.9vw,\s*20px\)/.test(driverShell) &&
    /clamp\(0\.9px,\s*0\.4vw,\s*1\.8px\)/.test(driverShell),
  'Tablet/mobile login fit clamp kontratı olmalı'
);

assert(
  'style_core_hero_h1_unchanged_ellipsis',
  /\.hero h1\s*\{[\s\S]*?text-overflow:\s*ellipsis;/.test(styleCore),
  'Global style-core .hero h1 ellipsis kuralı korunmalı'
);

assert(
  'title_text_unchanged',
  indexHtml.includes('>TAŞIT YÖNETİM SİSTEMİ</h1>'),
  'Başlık metni değiştirilmemeli'
);

assert(
  'dashboard_two_rows_preserved',
  /class="hero hero-two-rows"/.test(dashHtml) &&
    /class="hero-title-line"/.test(dashHtml) &&
    /KULLANICI PANELİ/.test(dashHtml),
  'Dashboard hero-two-rows / başlık yapısı korunmalı'
);

assert(
  'dashboard_shell_version_aligned',
  /href="driver-shell\.css\?v=20260723\.2"/.test(dashHtml),
  'Dashboard driver-shell version login ile aynı olmalı'
);

assert(
  'login_footer_height_includes_safe_area',
  /\.login-page\s+#app-footer\.login-footer\s*\{[^}]*height:\s*calc\(\s*var\(--app-footer-real-height\)\s*\+\s*env\(safe-area-inset-bottom,\s*0\)\s*\)/.test(driverShell),
  'Login footer height safe-area dahil olmalı'
);

assert(
  'login_footer_content_no_double_safe_area',
  /\.login-page\s+#app-footer\.login-footer\s+\.footer-content\s*\{[^}]*padding-bottom:\s*4px\s*!important/.test(driverShell) &&
    !/\.login-page\s+#app-footer\.login-footer\s+\.footer-content\s*\{[^}]*padding-bottom:\s*max\(6px,\s*env\(safe-area-inset-bottom/.test(driverShell),
  'Login footer-content çift safe-area padding kullanmamalı'
);

if (failed) {
  console.error('\nverify-driver-login-title-fit: FAIL');
  process.exit(1);
}
console.log('\nverify-driver-login-title-fit: OK');
