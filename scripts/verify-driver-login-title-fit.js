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
const driverStyle = read('driver/driver-style.css');
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
  /href="driver-shell\.css\?v=\d{8}\.\d+"/.test(indexHtml),
  'Login driver-shell.css?v=<valid-version> yüklemeli'
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
  /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.login-page\s+\.hero\s*>\s*h1\s*\{[^}]*font-size:\s*clamp\(16\.8px,\s*5\.35vw,\s*22px\)[^}]*letter-spacing:\s*clamp\(0\.2px,\s*0\.08vw,\s*0\.8px\)/.test(driverShell),
  'Telefon login fit kontratı (16.8px / 5.35vw / 22px) olmalı'
);

assert(
  'login_mobile_header_scale_contract',
  /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.login-page\s+\.hero\s*\{[^}]*min-height:\s*72px[^}]*padding-top:\s*12px[^}]*padding-bottom:\s*12px/.test(driverShell) &&
    /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.login-page\s+\.hero-logo\s*\{[^}]*width:\s*48px[^}]*flex:\s*0\s+0\s+48px[^}]*margin-right:\s*15px/.test(driverShell) &&
    /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.login-page\s+\.hero-logo\s+img\s*\{[^}]*height:\s*36px/.test(driverShell),
  'Telefon login hero/logo ölçeği 72px / 12px / 48px / 36px olmalı'
);

assert(
  'login_tablet_fit_contract_unchanged',
  /@media\s*\(min-width:\s*641px\)\s*and\s*\(max-width:\s*768px\)\s*\{[\s\S]*?\.login-page\s+\.hero\s*>\s*h1\s*\{[^}]*font-size:\s*clamp\(16\.5px,\s*4\.9vw,\s*20px\)[^}]*letter-spacing:\s*clamp\(0\.9px,\s*0\.4vw,\s*1\.8px\)/.test(driverShell),
  '641–768px tablet fit kontratı değişmemeli'
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
  (() => {
    const loginPin = indexHtml.match(/href="driver-shell\.css\?v=(\d{8}\.\d+)"/);
    const dashboardPin = dashHtml.match(/href="driver-shell\.css\?v=(\d{8}\.\d+)"/);
    const aggregatorPin = driverStyle.match(/driver-shell\.css\?v=(\d{8}\.\d+)/);
    return loginPin && dashboardPin && aggregatorPin &&
      loginPin[1] === dashboardPin[1] && loginPin[1] === aggregatorPin[1];
  })(),
  'Login, dashboard ve aggregator driver-shell pinleri aynı olmalı'
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
