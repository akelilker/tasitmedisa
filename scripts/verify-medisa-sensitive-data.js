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
if (/userPasswordChanges/.test(ayarlarJs)) {
  fail('ayarlar.js eski manuel userPasswordChanges hattını kullanmamalı.');
}
if (!/user_portal_credentials\.php/.test(ayarlarJs)) {
  fail('ayarlar.js güvenli başlangıç parolası yenileme endpointi eksik.');
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
if (!/driver\/driver_password_suggestion\.php/.test(dataManagerJs)) {
  fail('data-manager.js canonical dismiss endpoint kullanmiyor.');
}
if (!/driver\/driver_change_password\.php/.test(dataManagerJs)) {
  fail('data-manager.js canonical self-service endpoint kullanmiyor.');
}
if (!/maybeOpenMainAppPasswordSuggestion/.test(dataManagerJs)
    || !/openMainAppPasswordChange/.test(dataManagerJs)
    || !/continueMainAppWithCurrentPassword/.test(dataManagerJs)) {
  fail('Ana uygulama parola akisi eksik.');
}
if (!/Yeni parolanız en az 6 karakter olmalıdır/.test(dataManagerJs)) {
  fail('Ana uygulama parola politikasi mesaji eksik.');
}

const savePhp = fs.readFileSync(path.join(repoRoot, 'save.php'), 'utf8');
const saveWireOwnerPhp = fs.readFileSync(path.join(repoRoot, 'core.php'), 'utf8');
if (!/medisaSaveApplyIncomingData\s*\(/.test(savePhp)) {
  fail('save.php medisaSaveApplyIncomingData owner cagrisi eksik.');
}
if (!/medisaReconcileUserCredentials\s*\(/.test(saveWireOwnerPhp)) {
  fail('core.php credential reconciliation cagrisi eksik.');
}
if (!/_medisaUserPasswordChanges/.test(saveWireOwnerPhp)) {
  fail('core.php transient parola okuma eksik.');
}
if (!/Parola yönetimi yalnız güvenli başlangıç parolası yenileme/.test(saveWireOwnerPhp)) {
  fail('core.php eski manuel parola payloadunu reddetmiyor.');
}

const adminCredentialPhp = fs.readFileSync(path.join(repoRoot, 'admin', 'user_portal_credentials.php'), 'utf8');
if (!/medisaProjectUserForClient/.test(adminCredentialPhp)) {
  fail('Yönetici credential response güvenli projection kullanmıyor.');
}
if (/['"]sifre_hash['"]\s*=>/.test(adminCredentialPhp)) {
  fail('Yönetici credential response hash dönmemeli.');
}
if (!/medisaCanResetPortalInitialPassword/.test(adminCredentialPhp)) {
  fail('Yönetici credential endpoint hedef rol helper kullanmıyor.');
}
if (!/Bu kullanıcının başlangıç parolasını sıfırlama yetkiniz bulunmamaktadır/.test(adminCredentialPhp)) {
  fail('Yönetici credential 403 mesajı eksik.');
}
const helperIdx = adminCredentialPhp.indexOf('medisaCanResetPortalInitialPassword');
const assignIdx = adminCredentialPhp.indexOf('medisaAssignInitialPortalPassword');
if (helperIdx < 0 || assignIdx < 0 || helperIdx > assignIdx) {
  fail('Yetki kontrolü parola üretiminden önce olmalı.');
}
if (!/function medisaCanResetPortalInitialPassword/.test(corePhp)) {
  fail('core.php medisaCanResetPortalInitialPassword helper eksik.');
}
if (!/return \$targetRole === 'kullanici' \|\| \$targetRole === 'sube_yonetici'/.test(corePhp)) {
  fail('Reset helper yalnız kullanici/sube_yonetici hedeflerine izin vermeli.');
}
if (!/\$targetRole === 'genel_yonetici'[\s\S]{0,80}return false/.test(corePhp)) {
  fail('Reset helper genel_yonetici hedefini reddetmeli.');
}
if (!/targetRole === 'kullanici' \|\| targetRole === 'sube_yonetici'/.test(ayarlarJs)) {
  fail('ayarlar.js reset butonu hedef rol filtresi eksik.');
}
if (/Portal: Var|Portal: Yok|İlk giriş:|Portal hesabı yok|Portal hesabı var/.test(ayarlarJs)) {
  fail('ayarlar.js kullanici kartlarinda teknik portal metinleri kalmamali.');
}
if (!/syncUserPasswordAdminActions/.test(ayarlarJs) || !/reopenUserPasswordSuggestion/.test(ayarlarJs)) {
  fail('ayarlar.js parola yonetici islemleri eksik.');
}

const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
if (/Hesap Durumu|user-account-status-summary|user-password-reset-self-hint|user-portal-toggle-btn/.test(indexHtml)) {
  fail('Kullanici formunda teknik hesap durumu metinleri kalmamali.');
}
if (!/user-password-reset-btn/.test(indexHtml) || !/İlk Giriş Uyarısını Yeniden Göster/.test(indexHtml)) {
  fail('Kullanici formunda parola yonetici butonlari eksik.');
}
if (!/settings-change-password-btn/.test(indexHtml) || !/Parolamı Değiştir/.test(indexHtml)) {
  fail('Ana uygulama Parolamı Değiştir menusu eksik.');
}
if (!/main-password-modal/.test(indexHtml) || !/Mevcut Parolayla Devam Et/.test(indexHtml)) {
  fail('Ana uygulama parola onerisi modali eksik.');
}
if (/user-portal-status|user-password-suggestion-status|user-password-changed-at/.test(indexHtml)) {
  fail('Kullanici formunda eski teknik portal metinleri kalmamali.');
}

const adminPortalAccountPhp = fs.readFileSync(path.join(repoRoot, 'admin', 'user_portal_account.php'), 'utf8');
if (!/medisaCanResetPortalInitialPassword/.test(adminPortalAccountPhp)) {
  fail('Portal hesap admin endpoint hedef rol helper kullanmiyor.');
}
if (!/reopen_password_suggestion/.test(adminPortalAccountPhp) || !/toggle_portal_status/.test(adminPortalAccountPhp)) {
  fail('Portal hesap admin endpoint aksiyonlari eksik.');
}
const portalAuthPos = adminPortalAccountPhp.indexOf('medisaResolveAuthorizedContext($rawData');
const portalBodyPos = adminPortalAccountPhp.indexOf("json_decode(file_get_contents('php://input')");
if (portalAuthPos === -1 || portalBodyPos === -1 || portalAuthPos > portalBodyPos) {
  fail('Portal hesap admin endpoint auth sirasi hatali (body validation auth oncesi).');
}

const driverScript = fs.readFileSync(path.join(repoRoot, 'driver', 'driver-script.js'), 'utf8');
if (!/driver_password_suggestion\.php/.test(driverScript)) {
  fail('İlk giriş önerisi devam aksiyonu eksik.');
}
if (/localStorage\.setItem\([^)]*(?:password|parola|sifre)/i.test(driverScript)
    || /sessionStorage\.setItem\([^)]*(?:password|parola|sifre)/i.test(driverScript)) {
  fail('Driver istemcisi parola storage alanına yazmamalı.');
}
if (!/ilk_giris_parola_onerisi_bekliyor\s*===\s*true/.test(driverScript)
    || !/openDriverPasswordSuggestion/.test(driverScript)
    || !/continueWithCurrentPassword/.test(driverScript)) {
  fail('İlk başarılı giriş parola önerisi istemci akışı eksik.');
}
const driverDashboard = fs.readFileSync(path.join(repoRoot, 'driver', 'dashboard.html'), 'utf8');
if (!/Parolanızı Değiştirmeniz Önerilir/.test(driverScript)
    || !/Mevcut Parolayla Devam Et/.test(driverDashboard)
    || !/Şimdi Parolamı Değiştir/.test(driverDashboard)) {
  fail('İlk giriş önerisi modal kontratı eksik.');
}

const applyPortalPhp = fs.readFileSync(path.join(repoRoot, 'scripts', 'apply-medisa-portal-accounts.php'), 'utf8');
if (!/PHP_SAPI\s*!==\s*'cli'/.test(applyPortalPhp)) {
  fail('apply-medisa-portal-accounts.php CLI-only koruması eksik.');
}
if (!/--confirm=KULLANICI_HESAPLARINI_OLUSTUR/.test(applyPortalPhp)) {
  fail('apply-medisa-portal-accounts.php apply confirmation koruması eksik.');
}

const deployWorkflow = fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'deploy-cpanel.yml'), 'utf8');
if (!/scripts\/\*\*/.test(deployWorkflow)) {
  fail('Deploy workflow scripts klasörünü dışlamıyor.');
}

console.log('verify-medisa-sensitive-data: OK');
