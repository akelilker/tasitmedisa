'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const htaccessPath = path.join(root, '.htaccess');
const cpanelPath = path.join(root, '.cpanel.yml');

assert.equal(fs.existsSync(htaccessPath), true, 'Kök .htaccess kaynakta bulunmalı.');
assert.equal(fs.existsSync(cpanelPath), true, '.cpanel.yml kaynakta bulunmalı.');

const htaccess = fs.readFileSync(htaccessPath, 'utf8');
const cpanel = fs.readFileSync(cpanelPath, 'utf8');

assert.match(
  htaccess,
  /RewriteRule\s+\^data\(\/\|\$\)\s+-\s+\[F,L,NC\]/,
  'Kök .htaccess data/ yolunu reddetmeli.'
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

console.log('verify-medisa-deploy-invariants: OK');
