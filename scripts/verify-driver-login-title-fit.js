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
  /href="driver-shell\.css\?v=20260718\.1"/.test(indexHtml),
  'Login driver-shell.css?v=20260718.1 yüklemeli'
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
  /clamp\(14\.5px,\s*4\.4vw,\s*18\.5px\)/.test(driverShell) &&
    /clamp\(0\.4px,\s*0\.32vw,\s*1\.2px\)/.test(driverShell),
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
  /href="driver-shell\.css\?v=20260718\.1"/.test(dashHtml),
  'Dashboard driver-shell version login ile aynı olmalı'
);

if (failed) {
  console.error('\nverify-driver-login-title-fit: FAIL');
  process.exit(1);
}
console.log('\nverify-driver-login-title-fit: OK');
