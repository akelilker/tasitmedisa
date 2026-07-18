const { spawnSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');

function runNode(scriptArgs) {
  const r = spawnSync(process.execPath, scriptArgs, {
    cwd: root,
    encoding: 'utf8',
    env: process.env
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) process.exit(r.status || 1);
}

runNode(['--check', path.join(root, 'data-manager.js')]);
runNode(['--check', path.join(root, 'data-service.js')]);
runNode(['--check', path.join(root, 'ayarlar.js')]);
runNode([path.join(root, 'scripts', 'verify-medisa-kasko-lookup-client.js')]);

const phpProbe = spawnSync('php', ['-v'], { encoding: 'utf8', shell: true });
if (phpProbe.status === 0) {
  ['kasko-index.php', 'load_kasko.php', 'save_kasko.php', 'core.php', 'save.php'].forEach((f) => {
    const r = spawnSync('php', ['-l', f], { cwd: root, encoding: 'utf8', shell: true });
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    if (r.status !== 0) process.exit(r.status || 1);
  });
  console.log('PHP lint PASS');
} else {
  console.log('PHP binary missing — php -l skipped (client parity PASS)');
}
console.log('tool:verify-kasko-lookup PASS');
