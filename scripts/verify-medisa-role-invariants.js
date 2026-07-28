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
const driverDashFn = core.slice(core.indexOf('function medisaComputeDriverDashboard'));
assert(
  'medisaComputeDriverDashboard_uses_vehicle',
  /medisaIsYoneticiOnlyUser\(\$user\)/.test(driverDashFn) &&
    /in_array\(\$role, \['sube_yonetici', 'genel_yonetici'\], true\)/.test(driverDashFn) &&
    /return medisaUserHasAssignedVehicle\(\$data, \$userId\)/.test(driverDashFn),
  'Driver dashboard: yonetici_only false; genel/sube true; kullanici yalnız atanmış taşıt'
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
assert(
  'manage_backups_server_authoritative',
  /manage_backups:\s*supplied\.manage_backups === true/.test(dm) &&
    /manage_backups:\s*false/.test(dm) &&
    /backupWrap\.style\.display = session\.permissions\.manage_backups === true/.test(dm),
  'Backup izni token rolünden türetilmemeli; sunucu payload değeri true değilse kapalı kalmalı'
);

const restore = read('restore.php');
assert(
  'restore_metadata_only',
  /medisaResolveAuthorizedContext\(\$currentData,\s*'manage_backups'\)/.test(restore) &&
    /'restore_enabled'\s*=>\s*false/.test(restore) &&
    !/file_get_contents\s*\(/.test(restore) &&
    !/json_decode\s*\(/.test(restore),
  'restore.php yalnız genel yönetici metadata cevabı vermeli; backup gövdesini okumamalı'
);

const settings = read('ayarlar.js');
assert(
  'backup_ui_has_no_silent_local_fallback',
  /window\.showLastBackupMetadata/.test(settings) &&
    /fetchServerLastBackupMetadata/.test(settings) &&
    !/window\.restoreFromLastBackup/.test(settings) &&
    !/fetchServerLastBackup\(\)[\s\S]{0,300}medisa_server_backup/.test(settings),
  'Sunucu metadata hatası eski localStorage yedeğini sessizce uygulamamalı'
);

const login = read('driver/driver_login.php');
assert(
  'login_blocks_kullanici_without_vehicle',
  /rolPrecheck === 'kullanici'/.test(login) && /medisaUserHasAssignedVehicle/.test(login),
  'Kullanıcı + taşıt yok giriş reddi korunmalı'
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
