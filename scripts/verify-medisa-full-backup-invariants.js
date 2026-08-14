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

test('full backup source files exist', function() {
  ['full_backup.php', 'full_backup_restore.php', 'backup_download.php'].forEach(function(f) {
    assert.equal(fs.existsSync(path.join(root, f)), true, f);
  });
});

test('full_backup library contracts', function() {
  const src = read('full_backup.php');
  assert.match(src, /MEDISA_FULL_BACKUP_FORMAT/);
  assert.match(src, /MEDISA_FULL_BACKUP_MAX_ZIP_BYTES/);
  assert.match(src, /MEDISA_FULL_BACKUP_MAX_ENTRY_COUNT/);
  assert.match(src, /MEDISA_FULL_BACKUP_MAX_TOTAL_UNCOMPRESSED_BYTES/);
  assert.match(src, /MEDISA_FULL_BACKUP_MAX_ENTRY_UNCOMPRESSED_BYTES/);
  assert.match(src, /DUPLICATE_ZIP_PATH/);
  assert.match(src, /DUPLICATE_MANIFEST_PATH/);
  assert.match(src, /UNEXPECTED_ENTRY/);
  assert.match(src, /TOTAL_UNCOMPRESSED_LIMIT/);
  assert.match(src, /TOO_MANY_ENTRIES/);
  assert.match(src, /medisaFullBackupRegisterCleanup/);
  assert.match(src, /medisaFullBackupCleanupAndForget/);
  assert.match(src, /medisaFullBackupCollectReferencedFiles/);
  assert.match(src, /medisaFullBackupCreateSnapshotUnderLock/);
  assert.match(src, /medisaFullBackupBuildZipFromSnapshot/);
  assert.match(src, /medisaFullBackupStageAndValidateZip/);
  assert.match(src, /medisaFullBackupCommitStagedRestoreSafe/);
  assert.match(src, /medisaFullBackupRequireZipArchive/);
  assert.match(src, /ZIP_SLIP/);
  assert.match(src, /SYMLINK_FORBIDDEN/);
  assert.match(src, /MISSING_REFERENCED_FILE/);
  assert.match(src, /getKaskoListesiFilePath|kasko-deger-listesi/);
  assert.match(src, /medisaGetVehicleDocumentConfig/);
  assert.equal(/MEDISA_SERVER_RESTORE_ENABLED\s*=\s*true/.test(src), false);
  assert.equal(/medisaRestoreIsEnabled\s*\(\s*\)\s*\|\|/.test(src), false);
});

test('endpoint auth/method/cache contracts', function() {
  const dl = read('backup_download.php');
  const rs = read('full_backup_restore.php');
  assert.match(dl, /REQUEST_METHOD'\] !== 'GET'/);
  assert.match(dl, /manage_backups/);
  assert.match(dl, /Cache-Control:\s*no-cache,\s*no-store/);
  assert.match(rs, /REQUEST_METHOD'\] !== 'POST'/);
  assert.match(rs, /manage_backups/);
  assert.match(rs, /Cache-Control:\s*no-cache,\s*no-store/);
  assert.match(rs, /medisaFullBackupStageAndValidateZip/);
  assert.match(rs, /medisaFullBackupCommitStagedRestoreSafe/);
  assert.match(read('.htaccess'), /RewriteRule\s+\^data\(\/\|\$\)\s+-\s+\[F,L,NC\]/);
});

test('backup_download uses lock then zip after snapshot', function() {
  const src = read('backup_download.php');
  assert.match(src, /medisaFullBackupCreateSnapshotUnderLock/);
  assert.match(src, /medisaFullBackupBuildZipFromSnapshot/);
  assert.match(src, /application\/zip/);
  assert.equal(/Content-Type:\s*application\/json; charset=utf-8[\s\S]{0,200}Content-Disposition:\s*attachment/.test(src), false);
});

test('full_backup_restore is POST staging-then-commit', function() {
  const src = read('full_backup_restore.php');
  assert.match(src, /REQUEST_METHOD'\] !== 'POST'/);
  assert.match(src, /medisaFullBackupStageAndValidateZip/);
  assert.match(src, /medisaFullBackupCommitStagedRestoreSafe/);
  assert.match(src, /manage_backups/);
  assert.equal(/MEDISA_SERVER_RESTORE_ENABLED/.test(src), false);
});

test('UI keeps two actions and zip+json import branch', function() {
  const settings = read('ayarlar.js');
  assert.match(settings, /Yedek Al/);
  assert.match(settings, /Yedekten Geri Yükle/);
  assert.match(settings, /processImportedFullBackupZip/);
  assert.match(settings, /full_backup_restore\.php/);
  assert.match(settings, /processImportedBackupText/);
  assert.match(settings, /Manuel tam yedek|source_label/);
  assert.equal(/Son Sunucu Yedeği Bilgisi/.test(settings), false);
  assert.equal(/window\.exportData[\s\S]{0,900}buildFullBackupPayload\s*\(/.test(settings), false);
});

test('package + quality gate wire full-backup verifier', function() {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(typeof pkg.scripts['tool:verify-full-backup'], 'string');
  assert.match(read('.github/scripts/quality-gate.sh'), /tool:verify-full-backup/);
});

test('PHP full-backup fixtures', function() {
  const r = spawnSync('php', [path.join(root, 'scripts/verify-medisa-full-backup-invariants.php')], {
    cwd: root,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error((r.stdout || '') + (r.stderr || '') || ('php exit ' + r.status));
  }
  assert.match(String(r.stdout || ''), /passed/);
});

console.log('Full backup source invariants: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
