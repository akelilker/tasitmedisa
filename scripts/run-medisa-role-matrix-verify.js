/**
 * Windows-safe role matrix verify runner (static JS + PHP behavioral matrix).
 * package.json: npm run tool:verify-roles
 */
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function resolvePhp() {
  const candidates = [
    process.env.PHP_BIN,
    path.join(ROOT, '.tools', 'php82', 'php.exe'),
    'php',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate === 'php') return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'php';
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) {
    console.error('Failed to run ' + cmd + ':', result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status == null ? 1 : result.status);
  }
}

run('node', [path.join('scripts', 'verify-medisa-role-invariants.js')]);
run(resolvePhp(), [path.join('scripts', 'verify-medisa-role-matrix.php')]);
console.log('tool:verify-roles OK');
