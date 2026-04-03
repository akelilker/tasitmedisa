/**
 * Rol / panel mimarisi için hızlı statik doğrulama (Docker/PHP gerekmez).
 * Çalıştır: node scripts/verify-medisa-role-invariants.js
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
  }
}

const core = read('core.php');
assert(
  'medisaComputeDriverDashboard_uses_vehicle',
  /return medisaUserHasAssignedVehicle\(\$data, \$userId\)/.test(core) &&
    /'genel_yonetici'/.test(core.slice(core.indexOf('function medisaComputeDriverDashboard'))),
  'Genel yönetici dahil panel yalnızca atanmış araç ile olmalı'
);
assert(
  'medisaIsBranchManagerRole_sube_only',
  /function medisaIsBranchManagerRole\(\$role\) \{[\s\S]*?return \$role === 'sube_yonetici';/.test(core),
  'Şube yöneticisi rolü yalnızca sube_yonetici olmalı'
);
assert(
  'no_medisaResolvePanelFlag',
  !core.includes('function medisaResolvePanelFlag'),
  'medisaResolvePanelFlag kaldırılmış olmalı'
);

const dm = read('data-manager.js');
assert(
  'token_uses_driver_dashboard_for_panel',
  /driverDash = payload\.driver_dashboard === true/.test(dm) &&
    /kullanici_paneli: driverDash/.test(dm),
  'JWT panel alanı driver_dashboard ile hizalı olmalı'
);

const login = read('driver/driver_login.php');
assert(
  'login_blocks_kullanici_without_vehicle',
  /rolPrecheck === 'kullanici'/.test(login) && /medisaUserHasAssignedVehicle/.test(login),
  'Kullanıcı + araç yok giriş reddi korunmalı'
);

const sc = read('script-core.js');
assert(
  'tasitlar_css_split',
  sc.includes('tasitlar-base.css') && sc.includes('tasitlar-extra.css') && sc.includes('Array.isArray(cssPathOrArray)'),
  'Taşıtlar CSS iki parça + loadAppModule dizi desteği'
);
assert(
  'no_legacy_tasitlar_css_file',
  !fs.existsSync(path.join(root, 'tasitlar.css')),
  'Eski tek tasitlar.css kaldırılmalı (base+extra kullanılır)'
);

if (failed) {
  console.error('\nDoğrulama başarısız.');
  process.exit(1);
}
console.log('verify-medisa-role-invariants: OK');
