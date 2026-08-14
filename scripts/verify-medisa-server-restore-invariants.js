'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('PASS ' + name);
  } catch (err) {
    failed += 1;
    console.error('FAIL ' + name + ': ' + (err && err.message ? err.message : err));
  }
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('endpoint files exist', function() {
  ['backup_download.php', 'full_backup.php', 'full_backup_restore.php', 'backup-registry.php', 'backup-restore-dry-run.php', 'backup-restore-commit.php', 'backup-restore-status.php', 'server_restore.php'].forEach(function(f) {
    assert.equal(fs.existsSync(path.join(root, f)), true, f);
  });
});

test('backup_download.php is GET-only full ZIP backup (no JSON fallback)', function() {
  const src = read('backup_download.php');
  assert.match(src, /REQUEST_METHOD'\] !== 'GET'/);
  assert.match(src, /medisaResolveAuthorizedContext\(\$currentData,\s*'manage_backups'\)/);
  assert.match(src, /medisaFullBackupCreateSnapshotUnderLock/);
  assert.match(src, /medisaFullBackupBuildZipFromSnapshot/);
  assert.match(src, /medisaFullBackupRequireZipArchive/);
  assert.match(src, /Content-Disposition:\s*attachment/);
  assert.match(src, /application\/zip/);
  assert.match(src, /Cache-Control:\s*no-cache,\s*no-store/);
  assert.match(src, /\.zip/);
  assert.equal(/getMainBackupFilePath\s*\(/.test(src), false);
  assert.equal(/data\.json\.backup/.test(src), false);
  assert.equal(/saveData\s*\(/.test(src), false);
  assert.equal(/medisaMutateData\s*\(/.test(src), false);
  assert.equal(/\$_POST/.test(src), false);
  assert.equal(/php:\/\/input/.test(src), false);
  assert.equal(/buildFullBackupPayload/.test(src), false);
  assert.equal(/window\.appData/.test(src), false);
});

test('restore.php metadata prefers manual full backup label', function() {
  const src = read('restore.php');
  assert.match(src, /REQUEST_METHOD'\] !== 'GET'/);
  assert.match(src, /'restore_enabled'\s*=>\s*false/);
  assert.match(src, /medisaFullBackupReadLastMeta/);
  assert.match(src, /Manuel tam yedek/);
  assert.match(src, /Otomatik sunucu yedeği/);
  assert.match(src, /getMainBackupFilePath\s*\(/);
  assert.match(src, /findLatestSnapshotPath\s*\(/);
  assert.match(src, /filemtime/);
});

test('feature flags default false via env helpers', function() {
  const src = read('server_restore.php');
  assert.match(src, /MEDISA_SERVER_RESTORE_ENABLED/);
  assert.match(src, /MEDISA_PRODUCTION_RESTORE_APPROVED/);
  assert.match(src, /PRODUCTION_RESTORE_APPROVAL_REQUIRED/);
  assert.match(src, /medisaRestoreProductionActivationApproved/);
  assert.match(src, /MEDISA_RESTORE_MAINTENANCE_MODE/);
  assert.match(src, /MEDISA_RESTORE_HMAC_SECRET/);
  assert.match(src, /function medisaEnvFlagTrue/);
});

test('commit is POST-only and confirmation gated', function() {
  assert.match(read('backup-restore-commit.php'), /POST/);
  assert.match(read('server_restore.php'), /MEDISA_RESTORE_CONFIRMATION_TEXT/);
  assert.match(read('server_restore.php'), /SUNUCU YEDEĞİNİ GERİ YÜKLE/);
  assert.match(read('server_restore.php'), /IDEMPOTENCY_CONFLICT/);
  assert.match(read('server_restore.php'), /EMERGENCY_BACKUP_FAILED/);
  assert.match(read('server_restore.php'), /medisaAtomicWriteFile/);
  assert.match(read('server_restore.php'), /medisaAcquireDataLock/);
});

test('full content hash and user/rollback owners', function() {
  const src = read('server_restore.php');
  assert.match(src, /function medisaRestoreCanonicalContentHash/);
  assert.match(src, /function medisaRestoreCanonicalizeForHash/);
  assert.match(src, /function medisaRestoreValidateUserSecurityInvariants/);
  assert.match(src, /function medisaRestoreRollbackFromEmergencyBackup/);
  assert.match(src, /RESTORE_STATE_UNCERTAIN/);
  assert.match(src, /RESTORE_UNKNOWN_COLLECTIONS/);
  assert.match(src, /NORMALIZATION_DATA_LOSS/);
  assert.match(src, /TRANSACTION_LEDGER_WRITE_FAILED/);
  assert.match(src, /IDEMPOTENCY_FINALIZE_FAILED/);
  assert.match(src, /current_content_sha256/);
  assert.match(src, /SCRIPT_FILENAME/);
});

test('dry-run exact sha assertion present in PHP verifier', function() {
  const php = read('scripts/verify-medisa-server-restore-invariants.php');
  assert.match(php, /dry-run preserves exact data file sha256/);
  assert.equal(/exact_match\s*\|\|\s*file_non_empty/.test(php), false);
  assert.equal(/md5_file\(\$dataFile\)\s*===\s*md5\(/.test(php), false);
});

test('dry-run POST-only and no saveData call in dry-run handler', function() {
  assert.match(read('backup-restore-dry-run.php'), /POST/);
  const src = read('server_restore.php');
  const dryFn = src.split('function medisaRestoreHandleDryRun')[1].split('function medisaRestoreIdempotencyPath')[0];
  assert.equal(/saveData\s*\(/.test(dryFn), false);
  assert.equal(/medisaAtomicWriteFile\s*\(/.test(dryFn), false);
});

test('permission execute_server_restore only genel_yonetici', function() {
  const core = read('core.php');
  assert.match(core, /'execute_server_restore'\s*=>\s*\$role === 'genel_yonetici'/);
  const dm = read('data-manager.js');
  assert.match(dm, /execute_server_restore:\s*false/);
  assert.match(dm, /execute_server_restore:\s*supplied\.execute_server_restore === true/);
});

test('maintenance write freeze in medisaMutateData and save_kasko', function() {
  assert.match(read('core.php'), /medisaRestoreIsWriteFrozen/);
  assert.match(read('core.php'), /MAINTENANCE_REQUIRED/);
  assert.match(read('save_kasko.php'), /MAINTENANCE_REQUIRED/);
});

test('driver login bypasses restore write-freeze', function() {
  const loginPhp = read('driver/driver_login.php');
  assert.match(loginPhp, /medisaRestoreSetCommitBypass\(true\)/);
  assert.match(loginPhp, /medisaRestoreSetCommitBypass\(false\)/);
  assert.match(loginPhp, /medisaMutateData/);
});

test('UI wording metadata-only and disabled commit gates', function() {
  const settings = read('ayarlar.js');
  assert.match(settings, /Yedekten Geri Yükle/);
  assert.match(settings, /Sunucudaki Son Yedekleme Dosyası/);
  assert.match(settings, /Yedek Almak İçin/);
  assert.match(settings, /refreshDataManagementBackupMeta/);
  assert.match(settings, /fetchServerLastBackupMetadata/);
  assert.match(settings, /backup_download\.php/);
  assert.match(settings, /Yedek alınamadı\. Sunucu verisi indirilemedi\./);
  assert.equal(/Son Sunucu Yedeği Bilgisi/.test(settings), false);
  assert.equal(/window\.exportData[\s\S]{0,800}buildFullBackupPayload\s*\(/.test(settings), false);
  assert.match(settings, /medisa-server-restore-ui:begin/);
  assert.match(settings, /backup-registry\.php/);
  assert.match(settings, /backup-restore-dry-run\.php/);
  assert.match(settings, /backup-restore-commit\.php/);
  assert.match(settings, /serverRestoreUi\.restoreEnabled === true/);
  assert.match(settings, /serverRestoreUi\.maintenanceMode === true/);
  assert.match(settings, /importInFlight/);
  assert.equal(/window\.restoreFromLastBackup/.test(settings), false);
});

test('cpanel deploys new restore endpoints and not secrets', function() {
  const cpanel = read('.cpanel.yml');
  assert.match(cpanel, /backup_download\.php/);
  assert.match(cpanel, /full_backup\.php/);
  assert.match(cpanel, /full_backup_restore\.php/);
  assert.match(cpanel, /backup-registry\.php/);
  assert.match(cpanel, /backup-restore-dry-run\.php/);
  assert.match(cpanel, /backup-restore-commit\.php/);
  assert.match(cpanel, /backup-restore-status\.php/);
  assert.match(cpanel, /server_restore\.php/);
  assert.equal(/MEDISA_RESTORE_HMAC_SECRET\s*=/.test(cpanel), false);
  assert.equal(/config\.local/.test(cpanel), false);
});

test('quality gate and package wire server restore verifier', function() {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(typeof pkg.scripts['tool:verify-server-restore'], 'string');
  assert.match(read('.github/scripts/quality-gate.sh'), /tool:verify-server-restore/);
});

test('F1/F2/F4 KEEP_DEFENSIVE marker preserved', function() {
  const olay = read('scripts/verify-medisa-vehicle-detail-olay-invariants.js');
  assert.match(olay, /F1\/F2\/F4/);
  assert.match(olay, /KEEP_DEFENSIVE|bu turda silinmez/);
  const tasitlar = read('tasitlar.js');
  assert.match(tasitlar, /detail-plate-row/);
  assert.match(tasitlar, /Eski konumdan butonları temizle/);
});

test('notification legacy medisa_just_restored remains absent', function() {
  ['ayarlar.js', 'data-manager.js', 'script-core.js', 'notifications.js'].forEach(function(f) {
    assert.equal(read(f).includes('medisa_just_restored'), false, f + ' should not revive medisa_just_restored');
  });
});

test('PHP integration invariants', function() {
  const r = spawnSync('php', [path.join(root, 'scripts/verify-medisa-server-restore-invariants.php')], {
    cwd: root,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error((r.stdout || '') + (r.stderr || '') || ('php exit ' + r.status));
  }
});

console.log('Server restore source invariants: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
