'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function tracked(pathspec) {
  const out = git(['ls-files', '--', pathspec]);
  return out === '' ? [] : out.split(/\r?\n/).filter(Boolean);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

// Runtime data must not be tracked.
assert.deepEqual(tracked('data/data.json'), [], 'data/data.json tracked olamaz');
assert.deepEqual(tracked('data/data.json.backup'), [], 'data/data.json.backup tracked olamaz');
assert.deepEqual(
  tracked('data/backups').filter((p) => p === 'data/backups' || p.startsWith('data/backups/')),
  [],
  'data/backups/** tracked olamaz'
);
assert.deepEqual(
  tracked('data/.migration-secure').filter(
    (p) => p === 'data/.migration-secure' || p.startsWith('data/.migration-secure/')
  ),
  [],
  'data/.migration-secure/** tracked olamaz'
);

const ignoreDataJson = git(['check-ignore', '-v', '--', 'data/data.json']);
assert.match(ignoreDataJson, /data\/data\.json/, 'data/data.json ignore edilmeli');

const gitignore = read('.gitignore').replace(/\r\n/g, '\n');
assert.match(gitignore, /(^|\n)\/?data\/data\.json(\n|$)/, '.gitignore data/data.json kurali eksik');
assert.match(
  gitignore,
  /(^|\n)\/?data\/data\.json\.backup(\n|$)|(^|\n)data\/\*\.backup(\n|$)/,
  '.gitignore backup kurali eksik'
);
assert.match(gitignore, /(^|\n)\/?data\/backups\/?(\n|$)/, '.gitignore data/backups/ kurali eksik');
assert.match(
  gitignore,
  /(^|\n)\/?data\/\.migration-secure\/?(\n|$)/,
  '.gitignore data/.migration-secure/ kurali eksik'
);
assert.doesNotMatch(
  gitignore,
  /(^|\n)!data\/data\.json(\n|$)/,
  '.gitignore data/data.json icin un-ignore (! ) olmamali'
);

// Example file must exist, be tracked, and contain no secrets.
const exampleRel = 'data/data.example.json';
assert.equal(fs.existsSync(path.join(root, exampleRel)), true, 'data/data.example.json bulunmali');
assert.deepEqual(tracked(exampleRel), [exampleRel], 'data/data.example.json tracked olmali');
const example = JSON.parse(read(exampleRel));
assert.ok(Array.isArray(example.users), 'example users dizisi olmali');
for (const user of example.users) {
  assert.equal(Object.prototype.hasOwnProperty.call(user, 'sifre'), false, 'example sifre alani yasak');
  assert.equal(Object.prototype.hasOwnProperty.call(user, 'sifre_hash'), false, 'example sifre_hash yasak');
  assert.equal(Object.prototype.hasOwnProperty.call(user, 'password'), false, 'example password yasak');
  assert.equal(Object.prototype.hasOwnProperty.call(user, 'parola'), false, 'example parola yasak');
  assert.equal(Object.prototype.hasOwnProperty.call(user, 'portal_sifresi'), false, 'example portal_sifresi yasak');
  const id = String(user.id || '');
  assert.match(id, /^user-example-/, 'example kullanici id sentetik olmali');
}

// Tip-level tracked JSON under data/ must not contain plaintext password fields.
const trackedDataFiles = tracked('data').filter((p) => p.endsWith('.json'));
for (const rel of trackedDataFiles) {
  if (rel === 'data/kasko-deger-listesi.json') {
    continue; // kasko lookup table, not user credentials
  }
  const raw = read(rel);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    continue;
  }
  const users = Array.isArray(parsed?.users)
    ? parsed.users
    : Array.isArray(parsed?.kullanicilar)
      ? parsed.kullanicilar
      : [];
  for (const user of users) {
    if (!user || typeof user !== 'object') continue;
    const plain = String(user.sifre || user.parola || user.portal_sifresi || user.password || '').trim();
    assert.equal(plain, '', `${rel} plaintext parola alani tasiyamaz`);
  }
}

// Deploy must exclude data/**
const deployYml = read('.github/workflows/deploy-cpanel.yml');
assert.match(deployYml, /data\/\*\*/, 'FTP deploy data/** exclude etmeli');
assert.match(deployYml, /exclude:\s*\|[\s\S]*data\/\*\*/, 'FTP deploy exclude blogunda data/** olmali');

// Runtime seed must not invent real credentials when file missing; default schema has empty users.
const core = read('core.php');
assert.match(core, /function\s+medisaDefaultData\s*\(/, 'medisaDefaultData owner bulunmali');
assert.match(core, /'users'\s*=>\s*\[\]/, 'default data users bos olmali');

console.log('verify-medisa-runtime-data-git-invariants: OK');
