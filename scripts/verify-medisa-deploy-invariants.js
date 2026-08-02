'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const htaccessPath = path.join(root, '.htaccess');
const cpanelPath = path.join(root, '.cpanel.yml');
const deployWorkflowPath = path.join(root, '.github', 'workflows', 'deploy-cpanel.yml');
const qualityGatePath = path.join(root, '.github', 'scripts', 'quality-gate.sh');

assert.equal(fs.existsSync(htaccessPath), true, 'Kök .htaccess kaynakta bulunmalı.');
assert.equal(fs.existsSync(cpanelPath), true, '.cpanel.yml kaynakta bulunmalı.');
assert.equal(fs.existsSync(deployWorkflowPath), true, 'FTP deploy workflow kaynakta bulunmalı.');
assert.equal(fs.existsSync(qualityGatePath), true, 'Canonical quality gate kaynakta bulunmalı.');

const htaccess = fs.readFileSync(htaccessPath, 'utf8');
const cpanel = fs.readFileSync(cpanelPath, 'utf8');
const deployWorkflow = fs.readFileSync(deployWorkflowPath, 'utf8');
const qualityGate = fs.readFileSync(qualityGatePath, 'utf8');

assert.match(
  htaccess,
  /RewriteRule\s+\^data\(\/\|\$\)\s+-\s+\[F,L,NC\]/,
  'Kök .htaccess data/ yolunu reddetmeli.'
);
assert.match(htaccess, /Header always set X-Frame-Options "SAMEORIGIN"/, 'Anti-frame başlığı eksik.');
assert.match(htaccess, /Header always set X-Content-Type-Options "nosniff"/, 'nosniff başlığı eksik.');
assert.match(
  htaccess,
  /Header always set Referrer-Policy "strict-origin-when-cross-origin"/,
  'Referrer policy başlığı eksik.'
);
assert.match(
  htaccess,
  /Header always set Content-Security-Policy "frame-ancestors 'self'"/,
  'CSP frame-ancestors başlığı eksik.'
);
assert.match(
  cpanel,
  /^\s*-\s+\/bin\/test\s+-f\s+\.htaccess\s*$/m,
  'cPanel deploy kök .htaccess dosyasını doğrulamalı.'
);
assert.match(
  cpanel,
  /^\s*-\s+\/bin\/cp\s+-a\s+\.htaccess\b[^\r\n]*"\$DEPLOYPATH\/"\s*$/m,
  'cPanel deploy kök .htaccess dosyasını doğrudan canlı köke kopyalamalı.'
);
assert.match(
  deployWorkflow,
  /bash \.github\/scripts\/quality-gate\.sh/,
  'FTP deploy preflight canonical quality gate çalıştırmalı.'
);
assert.match(deployWorkflow, /deploy_sha=\$\{GITHUB_SHA\}/, 'Canlı asset parity SHA cache-bust kullanmalı.');
assert.match(deployWorkflow, /data\/data\.json/, 'Canlı runtime data erişim kapısı doğrulanmalı.');
assert.match(deployWorkflow, /\.ftp-deploy-sync-state\.json/, 'Deploy state erişim kapısı doğrulanmalı.');
assert.match(qualityGate, /tool:verify-deploy/, 'Canonical gate deploy invariantini çalıştırmalı.');
assert.match(qualityGate, /tool:verify-runtime-data-git/, 'Canonical gate runtime data invariantini çalıştırmalı.');
assert.match(qualityGate, /tool:verify-server-restore/, 'Canonical gate server restore invariantini çalıştırmalı.');
assert.match(qualityGate, /tool:verify-staging-isolation/, 'Canonical gate staging isolation invariantini çalıştırmalı.');

assert.match(deployWorkflow, /\*\*\/\.github\/\*\*/, 'FTP deploy .github exclude etmeli.');
assert.match(deployWorkflow, /scripts\/\*\*/, 'FTP deploy scripts exclude etmeli.');
assert.match(deployWorkflow, /docs\/\*\*/, 'FTP deploy docs exclude etmeli.');
assert.equal(/STAGING_FTP_PASSWORD/.test(deployWorkflow), false, 'Production deploy staging FTP secret kullanmamalı.');

const stagingDeployPath = path.join(root, '.github', 'workflows', 'deploy-staging.yml');
assert.equal(fs.existsSync(stagingDeployPath), true, 'Staging deploy workflow kaynakta bulunmalı.');
const stagingDeploy = fs.readFileSync(stagingDeployPath, 'utf8');
assert.match(stagingDeploy, /workflow_dispatch/, 'Staging deploy manual-only olmalı.');
assert.equal(/^\s*push\s*:/m.test(stagingDeploy), false, 'Staging deploy push ile tetiklenmemeli.');
assert.match(stagingDeploy, /secrets\.STAGING_FTP_PASSWORD/, 'Staging deploy staging FTP secret kullanmalı.');
assert.equal(/secrets\.FTP_PASSWORD/.test(stagingDeploy), false, 'Staging deploy production FTP_PASSWORD kullanmamalı.');
assert.match(stagingDeploy, /ftp:ssl-force true|protocol:\s*ftps/, 'Staging deploy explicit FTPS kullanmalı.');

assert.match(cpanel, /backup-registry\.php/, 'cPanel deploy backup-registry.php kopyalamalı.');
assert.match(cpanel, /backup-restore-commit\.php/, 'cPanel deploy backup-restore-commit.php kopyalamalı.');
assert.match(cpanel, /server_restore\.php/, 'cPanel deploy server_restore.php kopyalamalı.');
assert.equal(/MEDISA_RESTORE_HMAC_SECRET\s*=/.test(cpanel), false, 'cPanel secret env yazmamalı.');
assert.equal(/config\.local/.test(cpanel), false, 'cPanel config.local deploy etmemeli.');

const serverRestore = fs.readFileSync(path.join(root, 'server_restore.php'), 'utf8');
assert.match(serverRestore, /SCRIPT_FILENAME/, 'server_restore direct-hit hardening bulunmalı.');
assert.match(serverRestore, /http_response_code\(404\)/, 'server_restore direct hit 404 dönmeli.');
assert.match(serverRestore, /Not Found/, 'server_restore direct hit gövdesi sızıntısız olmalı.');

console.log('verify-medisa-deploy-invariants: OK');
