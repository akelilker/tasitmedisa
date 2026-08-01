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

assert.match(cpanel, /backup-registry\.php/, 'cPanel deploy backup-registry.php kopyalamalı.');
assert.match(cpanel, /backup-restore-commit\.php/, 'cPanel deploy backup-restore-commit.php kopyalamalı.');
assert.match(cpanel, /server_restore\.php/, 'cPanel deploy server_restore.php kopyalamalı.');
assert.equal(/MEDISA_RESTORE_HMAC_SECRET\s*=/.test(cpanel), false, 'cPanel secret env yazmamalı.');
assert.equal(/config\.local/.test(cpanel), false, 'cPanel config.local deploy etmemeli.');

console.log('verify-medisa-deploy-invariants: OK');
