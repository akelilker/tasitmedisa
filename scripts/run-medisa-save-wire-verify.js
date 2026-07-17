/**
 * Windows-safe save wire verify runner (php + node).
 * package.json: npm run tool:verify-save-wire
 */
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status == null ? 1 : result.status);
  }
}

run('php', [path.join('scripts', 'verify-medisa-save-wire-invariants.php')]);
run('node', [path.join('scripts', 'verify-medisa-save-wire-client.js')]);
console.log('tool:verify-save-wire OK');
