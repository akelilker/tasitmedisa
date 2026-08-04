#!/usr/bin/env node
'use strict';

/**
 * Staging izolasyon / production target deny source verifier.
 * Secret değer okumaz; yalnız kaynak kontratını doğrular.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));

const STAGING_HOST = 'medisa-staging.karmotors.com.tr';
const STAGING_URL = 'https://medisa-staging.karmotors.com.tr';
const STAGING_FTP_USER = 'medisa_staging@karmotors.com.tr';
const PROD_URL = 'https://karmotors.com.tr/medisa';
const PROD_DOCROOT = '/home/karmotor/public_html/medisa';
const PROTECTED_RULE = '.cursor/rules/ironbee-devtools-use.mdc';

function assertNoMatch(src, re, msg) {
  assert.equal(re.test(src), false, msg);
}

function assertManualOnly(workflowSrc, name) {
  assert.match(workflowSrc, /workflow_dispatch/, `${name}: workflow_dispatch zorunlu`);
  assertNoMatch(workflowSrc, /^\s*push\s*:/m, `${name}: push trigger yasak`);
  assertNoMatch(workflowSrc, /^\s*pull_request\s*:/m, `${name}: pull_request trigger yasak`);
  assertNoMatch(workflowSrc, /^\s*schedule\s*:/m, `${name}: schedule trigger yasak`);
  assertNoMatch(workflowSrc, /workflow_call\s*:/, `${name}: workflow_call yasak`);
}

assert.equal(exists('.github/workflows/deploy-staging.yml'), true, 'deploy-staging.yml eksik');
assert.equal(exists('.github/workflows/staging-restore-acceptance.yml'), true, 'staging-restore-acceptance.yml eksik');
assert.equal(exists('scripts/build-medisa-staging-deploy.js'), true, 'build script eksik');
assert.equal(exists('scripts/generate-medisa-staging-seed.php'), true, 'seed generator eksik');
assert.equal(exists('scripts/run-medisa-staging-restore-acceptance.js'), true, 'acceptance runner eksik');
assert.equal(exists('scripts/medisa-staging-ftps.js'), true, 'ftps helper eksik');
assert.equal(exists('scripts/verify-medisa-staging-ftps.js'), true, 'ftps verifier eksik');
assert.equal(exists('docs/runbooks/medisa-staging.md'), true, 'staging runbook eksik');

const deployWf = read('.github/workflows/deploy-staging.yml');
const acceptWf = read('.github/workflows/staging-restore-acceptance.yml');
const prodWf = read('.github/workflows/deploy-cpanel.yml');
const build = read('scripts/build-medisa-staging-deploy.js');
const seed = read('scripts/generate-medisa-staging-seed.php');
const accept = read('scripts/run-medisa-staging-restore-acceptance.js');
const pkg = read('package.json');
const gate = read('.github/scripts/quality-gate.sh');
const gitignore = read('.gitignore');
const htaccess = read('.htaccess');
const core = read('core.php');

assertManualOnly(deployWf, 'deploy-staging');
assertManualOnly(acceptWf, 'staging-restore-acceptance');

assert.match(deployWf, /environment:\s*\r?\n\s*name:\s*staging\b/, 'deploy environment staging');
assert.match(acceptWf, /environment:\s*\r?\n\s*name:\s*staging\b/, 'acceptance environment staging');
assert.match(deployWf, /medisa-staging-deploy/, 'deploy concurrency group');
assert.match(acceptWf, /medisa-staging-restore-acceptance/, 'acceptance concurrency group');
assert.match(deployWf, /cancel-in-progress:\s*false/, 'deploy cancel-in-progress false');
assert.match(acceptWf, /cancel-in-progress:\s*false/, 'acceptance cancel-in-progress false');

assert.match(deployWf, /DEPLOY MEDISA STAGING/, 'typed deploy confirmation');
assert.match(deployWf, /RESET MEDISA STAGING DATA/, 'typed reset confirmation');
assert.match(acceptWf, /RUN STAGING RESTORE ACCEPTANCE/, 'typed acceptance confirmation');

assert.match(deployWf, new RegExp(STAGING_HOST.replace(/\./g, '\\.')), 'staging hostname in deploy');
assert.match(deployWf, /STAGING_FTP_USERNAME/, 'staging FTP username var');
assert.match(deployWf, /medisa_staging@karmotors\.com\.tr/, 'exact staging FTP user');
assert.match(deployWf, /server-dir:\s*\/|lcd \.staging-deploy|mirror -R/, 'FTP server-dir / via jail root deploy');
assert.match(deployWf, /ftp:ssl-force true|protocol:\s*ftps/, 'explicit FTPS');
assert.match(deployWf, /ssl:verify-certificate no|security:\s*loose/, 'FTPS loose/verify off for cPanel cert');
assert.match(deployWf, /attempt|retries|sleep 45/, 'FTP retry present');

assertNoMatch(deployWf, /secrets\.FTP_PASSWORD/, 'deploy must not use production FTP_PASSWORD');
assertNoMatch(deployWf, /secrets\.FTP_SERVER\b/, 'deploy must not use production FTP_SERVER');
assertNoMatch(deployWf, /secrets\.FTP_USERNAME\b/, 'deploy must not use production FTP_USERNAME');
assertNoMatch(deployWf, /secrets\.FTP_REMOTE_DIR/, 'deploy must not use production FTP_REMOTE_DIR');
assertNoMatch(acceptWf, /secrets\.FTP_PASSWORD/, 'acceptance must not use production FTP_PASSWORD');
assertNoMatch(acceptWf, /secrets\.FTP_SERVER\b/, 'acceptance must not use production FTP_SERVER');
assertNoMatch(acceptWf, /secrets\.FTP_USERNAME\b/, 'acceptance must not use production FTP_USERNAME');

assertNoMatch(deployWf, new RegExp(PROD_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'deploy must not target prod URL');
assertNoMatch(deployWf, /public_html\/medisa(?!-staging)/, 'deploy must not reference prod docroot');
assertNoMatch(acceptWf, /public_html\/medisa(?!-staging)/, 'acceptance must not reference prod docroot');

assert.match(deployWf, /tool:verify-staging-isolation/, 'deploy runs isolation verifier');
assert.match(deployWf, /quality-gate\.sh/, 'deploy runs quality gate');
assert.match(deployWf, /initialize_synthetic_data/, 'initialize input');
assert.match(deployWf, /data\/\*\*/, 'normal deploy excludes data/**');
assert.match(deployWf, /AuthType|AuthUserFile|Directory Privacy|existing.*htaccess|MEDISA_STAGING_EXISTING_HTACCESS/i, 'Auth block preservation');
assert.match(deployWf, /unauthenticated|401/, 'Basic Auth health check');
assert.match(deployWf, /if:\s*always\(\)/, 'deploy cleanup always');

assert.match(acceptWf, /if:\s*always\(\)/, 'acceptance cleanup always');
assert.match(acceptWf, /MEDISA_SERVER_RESTORE_ENABLED|restore enabled|cleanup/i, 'cleanup restores safe flags');
assert.match(acceptWf, /run-medisa-staging-restore-acceptance\.js/, 'acceptance runner wired');
assert.match(acceptWf, /FTPS auth preflight|preflight-only/, 'acceptance FTPS preflight before live');
assert.match(acceptWf, /MEDISA_STAGING_SKIP_PREFLIGHT/, 'live skips duplicate preflight');
assert.match(acceptWf, /STAGING_CLEANUP_UNCERTAIN/, 'cleanup uncertain fails workflow');
assert.match(acceptWf, /tool:verify-staging-ftps/, 'acceptance runs ftps verifier');

const ftps = read('scripts/medisa-staging-ftps.js');
assert.match(ftps, /NON_TRANSIENT_AUTH_FAILURE/, '530 non-transient');
assert.match(ftps, /PersistentFtpsSession/, 'persistent FTPS session');
assert.match(accept, /PersistentFtpsSession/, 'runner persistent session');
assert.match(accept, /STAGING_CLEANUP_UNCERTAIN/, 'runner cleanup uncertain');

assert.match(build, /\[STAGING\]/, 'title staging prefix');
assert.match(build, /STAGING — SENTETİK VERİ — PRODUCTION DEĞİL/, 'staging banner');
assert.match(build, /rewriteProductionUrls|medisa-staging\.karmotors\.com\.tr/, 'production URL rewrite in overlay');
assert.match(build, /isExcludedDirName|\.staging-/, 'staging temp dirs excluded from copy');
assert.match(build, /TaşıtMedisa Staging|Medisa Staging/, 'manifest names');
assert.match(build, /medisa-staging-v/, 'SW cache namespace');
assert.match(build, /Disallow: \//, 'robots disallow');
assert.match(build, /X-Robots-Tag/, 'noindex header');
assert.match(build, /AuthUserFile/, 'Auth block extract');
assert.match(build, /RewriteRule \^ https:/, 'HTTPS redirect');
assert.match(build, /MEDISA_SERVER_RESTORE_ENABLED/, 'restore flag in config');
assert.match(build, /MEDISA_PRODUCTION_RESTORE_APPROVED=false/, 'staging production approval false');
assert.doesNotMatch(deployWf, /MEDISA_PRODUCTION_RESTORE_APPROVED=true/, 'staging deploy production approval açamaz');
assert.doesNotMatch(acceptWf, /MEDISA_PRODUCTION_RESTORE_APPROVED=true/, 'staging acceptance production approval açamaz');
assert.match(build, /MEDISA_RESTORE_MAINTENANCE_MODE/, 'maintenance flag in config');
assert.match(build, /config_mode|safe|acceptance|cleanup/, 'config modes');

assert.match(seed, /TEST 001/, 'synthetic plate 001');
assert.match(seed, /TEST 002/, 'synthetic plate 002');
assert.match(seed, /TEST 003/, 'synthetic plate 003');
assert.match(seed, /staging_admin/, 'staging admin user');
assert.match(seed, /staging_user/, 'staging limited user');
assert.match(seed, /stagingSynthetic/, 'synthetic marker');
assert.match(seed, /valid-restore-candidate/, 'valid fixture');
assert.match(seed, /unknown-collection/, 'unknown collection fixture');
assert.match(seed, /password_hash/, 'hashed passwords only');
assertNoMatch(seed, /34\s*[A-Z]{1,3}\s*\d{2,4}/, 'no real-looking TR plate');
assertNoMatch(seed, /05\d{9}/, 'no phone-like numbers');

assert.match(accept, /STAGING_BASE_URL|baseUrl/, 'acceptance base URL');
assert.match(accept, /BEFORE_HASH_CHANGED/, 'before-hash conflict case');
assert.match(accept, /IDEMPOTENCY_CONFLICT|409/, 'idempotency conflict');
assert.match(accept, /runControlledImportAcceptance/, 'controlled import staging acceptance owner');
assert.match(accept, /controlled_import_rollback_exact/, 'controlled import exact rollback gate');
assert.match(accept, /createImportHarness/, 'controlled import gerçek owner harness kullanır');
assert.match(accept, /mode:\s*['"]delta-v1['"]/, 'controlled import gerçek delta-v1 wire ownerını kullanır');
assert.match(accept, /collections:\s*\[\s*['"]ayarlar['"]\s*\]/, 'controlled import yalnız ayarlar koleksiyonunu kaydeder');
assert.match(accept, /MAINTENANCE_REQUIRED|423/, 'maintenance freeze');
assert.match(accept, /cleanup|always/i, 'acceptance mentions cleanup');
assertNoMatch(accept, /secrets\.FTP_PASSWORD/, 'runner no prod FTP secret names');

assert.match(pkg, /tool:verify-staging-isolation/, 'package script');
assert.match(pkg, /tool:verify-staging-ftps/, 'ftps package script');
assert.match(gate, /tool:verify-staging-isolation/, 'quality gate includes isolation');
assert.match(gate, /tool:verify-staging-ftps/, 'quality gate includes ftps verifier');

assert.match(gitignore, /config\.local\.php/, 'gitignore config.local');
assert.match(gitignore, /\.staging-deploy\//, 'gitignore staging deploy tree');
assert.match(htaccess, /config\\.local\\.php/, 'htaccess denies config.local');
assert.match(core, /config\.local\.php/, 'core optional local config');

assert.equal(exists('config.local.php'), false, 'config.local.php must not be committed');
assertNoMatch(prodWf, /STAGING_FTP_PASSWORD/, 'prod workflow must not use staging FTP secret');
assert.match(prodWf, /\*\*\/\.github\/\*\*/, 'prod FTP excludes .github');
assert.match(prodWf, /scripts\/\*\*/, 'prod FTP excludes scripts');
assert.match(prodWf, /docs\/\*\*/, 'prod FTP excludes docs');
assert.match(prodWf, /data\/\*\*/, 'prod FTP excludes data');

assert.match(deployWf, /MEDISA_SERVER_RESTORE_ENABLED.*false|restore.*false|config_mode=safe|CONFIG_MODE=safe/i, 'safe default restore false');
assert.match(build, /restoreOn = mode === 'acceptance'/, 'restore only in acceptance mode');

// Banner must not live in committed shell HTML
for (const shell of ['index.html', 'driver/index.html', 'driver/dashboard.html', 'admin/driver-report.html']) {
  if (!exists(shell)) continue;
  assertNoMatch(read(shell), /medisa-staging-banner/, `${shell}: committed staging banner yasak`);
  assertNoMatch(read(shell), /STAGING — SENTETİK VERİ/, `${shell}: committed staging banner text yasak`);
}

// Rule yerel gitignore altında olabilir; CI checkout'ta dosya bulunmayabilir.
assert.match(gitignore, /ironbee-devtools-use\.mdc/, 'protected cursor rule remains gitignored');
assertNoMatch(deployWf, /ironbee-devtools-use/, 'workflows must not touch protected rule');
assertNoMatch(acceptWf, /ironbee-devtools-use/, 'acceptance must not touch protected rule');
assert.equal(
  spawnSync('git', ['ls-files', '--error-unmatch', PROTECTED_RULE], { cwd: root }).status === 0,
  false,
  'protected cursor rule must not be tracked'
);

assert.equal(STAGING_URL.includes(STAGING_HOST), true);
assert.notEqual(STAGING_HOST, 'karmotors.com.tr');
assert.notEqual(STAGING_FTP_USER, '');
assert.ok(PROD_DOCROOT.includes('public_html/medisa'));

console.log('verify-medisa-staging-isolation: OK');
console.log('staging_host=' + STAGING_HOST);
console.log('staging_ftp_user=' + STAGING_FTP_USER);
console.log('production_url_denied_in_staging_workflows=true');
