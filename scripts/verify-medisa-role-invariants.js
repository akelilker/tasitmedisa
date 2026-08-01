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

const corePerms = read('core.php');
assert(
  'execute_server_restore_genel_yonetici_only',
  /'execute_server_restore'\s*=>\s*\$role === 'genel_yonetici'/.test(corePerms) &&
    /'manage_backups'\s*=>\s*\$role === 'genel_yonetici'/.test(corePerms),
  'execute_server_restore yalnız genel_yonetici olmalı'
);
assert(
  'client_execute_server_restore_server_authoritative',
  /execute_server_restore:\s*supplied\.execute_server_restore === true/.test(dm) &&
    /execute_server_restore:\s*false/.test(dm),
  'execute_server_restore client tarafında token rolünden türetilmemeli'
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
assert(
  'user_password_ui_uses_safe_flag',
  /existingUser\.portal_sifresi_var === true/.test(settings) &&
    /passwordInput\.value = ''/.test(settings) &&
    !/existingUser\.sifre_hash/.test(settings),
  'Kullanıcı formu parola hash veya açık parola alanına bağımlı olmamalı'
);
assert(
  'backup_import_export_uses_safe_users',
  /function normalizeBackupUsers/.test(settings) &&
    /Array\.isArray\(raw\.users\)\s*\?\s*normalizeBackupUsers\(raw\.users\)/.test(settings) &&
    /const users = readUsers\(\)/.test(settings) &&
    !/sifre_hash:\s*u\.sifre_hash/.test(settings),
  'Import, export ve kullanıcı serializer güvenli kullanıcı projeksiyonunu kullanmalı'
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

assert(
  'bm_view_not_coupled_to_manage',
  (function() {
    const start = core.indexOf('function medisaCanViewUserRecord');
    const end = core.indexOf('function medisaCanViewReportUserRecord');
    if (start < 0 || end < 0 || end <= start) return false;
    const block = core.slice(start, end);
    return /medisaIsBranchManagerRole\(\$role\)/.test(block)
      && /medisaIsNormalUserRole\(\$targetRole\)/.test(block)
      && !/medisaCanManageUserRecord\(/.test(block);
  })(),
  'BM view policy manage helperına dolaylı bağlanmamalı; yalnız normal kullanıcı + scope'
);
assert(
  'bm_manage_requires_normal_user_role',
  /function medisaCanManageUserRecord[\s\S]*?medisaIsNormalUserRole\(\$targetRole\)/.test(core)
    && /function medisaSaveValidateUserCollectionMutations/.test(core),
  'BM manage yalnız kullanici + current/incoming mutation validator'
);
assert(
  'password_channel_p0a1_preserved',
  /_medisaUserPasswordChanges/.test(core)
    && /medisaReconcileUserCredentials/.test(core)
    && /portal_sifresi_var/.test(core),
  'P0-A1 parola kanalı korunmalı'
);

assert(
  'authz_403_does_not_logout',
  /function handleMedisaHttpAuthStatus/.test(dm)
    && /clearProtectedDataset/.test(dm)
    && /exitUnauthorizedMainAppShell/.test(dm)
    && /handleMedisaHttpAuthStatus\(401/.test(dm)
    && /handleMedisaHttpAuthStatus\(403/.test(dm)
    && /medisaAuthorizationDenied/.test(dm)
    && !/if \(response\.status === 401 \|\| response\.status === 403\)/.test(dm),
  '403 oturumu kapatmamalı; load 403 dataset temizler, save 403 trust korur'
);
assert(
  'p0c_gm_invariant_helpers',
  /function medisaIsActiveGeneralManager/.test(core)
    && /function medisaCountActiveGeneralManagers/.test(core)
    && /function medisaValidateGeneralManagerInvariants/.test(core)
    && /medisaValidateGeneralManagerInvariants\(/.test(core)
    && /Kendi hesabınızı silemezsiniz/.test(core)
    && /en az bir aktif genel yönetici/.test(core),
  'P0-C GM self/last-active helper ve validator owner core.php içinde olmalı'
);
assert(
  'p0c_frontend_gm_protection_ui',
  /function isProtectedGeneralManagerTarget/.test(settings)
    && /function countActiveGeneralManagers/.test(settings)
    && /lockToGeneralManager/.test(settings)
    && /Sistemde en az bir aktif genel yönetici bulunmalıdır/.test(settings),
  'P0-C self/last GM UI kilitleri ayarlar.js owner içinde olmalı'
);
assert(
  'report_user_projection_bm_normal_only',
  (function() {
    const start = core.indexOf('function medisaCanViewReportUserRecord');
    const end = core.indexOf('function medisaBuildNotificationScopeDescriptor');
    if (start < 0 || end < 0 || end <= start) return false;
    const block = core.slice(start, end);
    return /medisaIsNormalUserRole\(\$targetRole\)/.test(block)
      && /medisaIsKnownUserRole\(\$targetRole\)/.test(block)
      && /user_id/.test(block)
      && !/\$targetRole === 'genel_yonetici'/.test(block);
  })(),
  'Report projection BM için yalnız kullanici + scope + self hariç olmalı'
);
assert(
  'assignable_normal_user_candidate_helper',
  /function isAssignableNormalUserCandidate/.test(dm)
    && /window\.isAssignableNormalUserCandidate/.test(dm),
  'Taşıt/ceza adayları merkezi normal-kullanıcı helper kullanmalı'
);

const tasitlar = read('tasitlar.js');
assert(
  'vehicle_assign_uses_assignable_helper',
  /getAssignableUsersForVehicle/.test(tasitlar)
    && /isAssignableNormalUserCandidate/.test(tasitlar),
  'Tahsis ve ceza listeleri yönetici adaylarını elemiş olmalı'
);

assert(
  'bm_user_form_role_locked_kullanici',
  /effectiveScope\.isBranchManager\s*\?\s*USER_FORM_ROLE_OPTIONS\.filter/.test(settings)
    && /scope\.isBranchManager \? 'kullanici' : selectedRole/.test(settings)
    && /isUserManageableInUserManagement/.test(settings),
  'BM formunda yönetici rol seçenekleri olmamalı; payload kullanici sabitlenmeli'
);

if (failed) {
  console.error('\nDoğrulama başarısız.');
  process.exit(1);
}
console.log('verify-medisa-role-invariants: OK');
