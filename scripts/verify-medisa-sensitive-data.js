'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const examplePath = path.join(repoRoot, 'data', 'data.example.json');

function fail(message) {
  console.error('[FAIL] ' + message);
  process.exit(1);
}

function runGit(args) {
  return spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true
  });
}

const trackedResult = runGit(['ls-files', '--error-unmatch', '--', 'data/data.json']);
if (trackedResult.status === 0) {
  fail('data/data.json Git tarafindan takip ediliyor.');
}

const ignoredResult = runGit(['check-ignore', '-q', '--', 'data/data.json']);
if (ignoredResult.status !== 0) {
  fail('data/data.json .gitignore tarafindan ignore edilmiyor.');
}

if (!fs.existsSync(examplePath)) {
  fail('data/data.example.json bulunamadi.');
}

let example;
try {
  example = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
} catch (error) {
  fail('data/data.example.json gecerli JSON degil.');
}

const emptyCollections = [
  'tasitlar',
  'kayitlar',
  'branches',
  'users',
  'sifreler',
  'arac_aylik_hareketler',
  'duzeltme_talepleri'
];

emptyCollections.forEach(function(key) {
  if (!Array.isArray(example[key]) || example[key].length !== 0) {
    fail('Example koleksiyonu bos olmali: ' + key);
  }
});

['notificationReadState', 'monthlyTodoWhatsAppLogs'].forEach(function(key) {
  const value = example[key];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 0) {
    fail('Example state alani bos nesne olmali: ' + key);
  }
});

if (!example.kaskoDegerListesi || !Array.isArray(example.kaskoDegerListesi.rows) || example.kaskoDegerListesi.rows.length !== 0) {
  fail('Example kasko satirlari bos olmali.');
}

function assertNoSensitiveValue(value, keyPath) {
  if (Array.isArray(value)) {
    value.forEach(function(item, index) {
      assertNoSensitiveValue(item, keyPath + '[' + index + ']');
    });
    return;
  }
  if (!value || typeof value !== 'object') return;

  Object.keys(value).forEach(function(key) {
    const child = value[key];
    if (/(?:password|passwd|sifre|şifre|sifre_hash|şifre_hash)/i.test(key)) {
      const isEmpty = child === '' || child === null || child === undefined
        || (Array.isArray(child) && child.length === 0)
        || (typeof child === 'object' && child !== null && Object.keys(child).length === 0);
      if (!isEmpty) fail('Example hassas alan degeri bos olmali: ' + keyPath + '.' + key);
    }
    assertNoSensitiveValue(child, keyPath + '.' + key);
  });
}

assertNoSensitiveValue(example, 'example');

const corePhp = fs.readFileSync(path.join(repoRoot, 'core.php'), 'utf8');
if (!/function\s+medisaProjectUserForClient\s*\(/.test(corePhp)) {
  fail('core.php medisaProjectUserForClient helper eksik.');
}
if (!/function\s+medisaReconcileUserCredentials\s*\(/.test(corePhp)) {
  fail('core.php medisaReconcileUserCredentials helper eksik.');
}
if (!/array_map\(\s*'medisaProjectUserForClient'\s*,\s*\$visibleUsers\s*\)/.test(corePhp)
    && !/array_map\("medisaProjectUserForClient",\s*\$visibleUsers\)/.test(corePhp)) {
  fail('core.php filter users projection contract eksik.');
}

const ayarlarJs = fs.readFileSync(path.join(repoRoot, 'ayarlar.js'), 'utf8');
const forbiddenAyarlarPatterns = [
  { re: /passwordInput\.value\s*=\s*user\.sifre/, label: 'passwordInput.value = user.sifre' },
  { re: /users\[idx\]\.sifre\s*=/, label: 'users[idx].sifre =' },
  { re: /sifre\s*:\s*sifre\b/, label: 'yeni user sifre: sifre' },
  { re: /delete\s+users\[idx\]\.sifre_hash/, label: 'delete users[idx].sifre_hash' }
];
forbiddenAyarlarPatterns.forEach(function(item) {
  if (item.re.test(ayarlarJs)) {
    fail('ayarlar.js yasak pattern: ' + item.label);
  }
});
if (!/portal_sifresi_var\s*===\s*true/.test(ayarlarJs)) {
  fail('ayarlar.js portal_sifresi_var kontrati eksik.');
}
if (!/userPasswordChanges/.test(ayarlarJs)) {
  fail('ayarlar.js transient userPasswordChanges hattı eksik.');
}

const dataManagerJs = fs.readFileSync(path.join(repoRoot, 'data-manager.js'), 'utf8');
if (!/_medisaUserPasswordChanges/.test(dataManagerJs)) {
  fail('data-manager.js transient _medisaUserPasswordChanges eksik.');
}
if (!/delete\s+requestSnapshot\._medisaUserPasswordChanges/.test(dataManagerJs)) {
  fail('data-manager.js requestSnapshot transient parola temizligi eksik.');
}
if (/serverDatasetBaseline\[.*\]\s*=\s*.*_medisaUserPasswordChanges/.test(dataManagerJs)) {
  fail('data-manager.js baseline transient parola almamali.');
}
if (/localStorage\.setItem\([^)]*_medisaUserPasswordChanges/.test(dataManagerJs)) {
  fail('data-manager.js localStorage transient parola almamali.');
}
if (/window\.appData\._medisaUserPasswordChanges\s*=/.test(dataManagerJs)) {
  fail('data-manager.js appData transient parola almamali.');
}

const savePhp = fs.readFileSync(path.join(repoRoot, 'save.php'), 'utf8');
if (!/medisaReconcileUserCredentials\s*\(/.test(savePhp)) {
  fail('save.php credential reconciliation cagrisi eksik.');
}
if (!/_medisaUserPasswordChanges/.test(savePhp)) {
  fail('save.php transient parola okuma eksik.');
}

console.log('verify-medisa-sensitive-data: OK');
