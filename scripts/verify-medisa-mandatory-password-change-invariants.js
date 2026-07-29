/**
 * Zorunlu ilk giriş parola değişikliği kaynak ve route invariantleri.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const files = {
  core: read('core.php'),
  loginPhp: read('driver/driver_login.php'),
  changePhp: read('driver/driver_change_password.php'),
  commonPhp: read('driver/driver_common.php'),
  loginJs: read('driver/driver-login.js'),
  dashboardJs: read('driver/driver-dashboard-core.js'),
  passwordJs: read('driver/driver-feature-password.js'),
  dashboardHtml: read('driver/dashboard.html'),
  featureCss: read('driver/driver-features.css'),
  dataManager: read('data-manager.js'),
  cpanel: read('.cpanel.yml'),
  sw: read('sw.js')
};

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('PASS ' + name);
  } catch (error) {
    failed += 1;
    console.error('FAIL ' + name + ': ' + error.message);
  }
}

test('Canonical first-login alanı backend ve frontend boyunca tek isim kullanır', () => {
  const joined = files.core + files.loginPhp + files.loginJs + files.dashboardJs + files.dataManager;
  assert.match(joined, /ilk_giris_parola_degistirme_zorunlu/);
  assert.doesNotMatch(joined, /ilk_giris_password_change_required|first_login_password_required/);
});
test('Flag normalization malformed değeri fail closed tutar', () => {
  assert.match(files.core, /function medisaNormalizeFirstLoginPasswordChangeRequired/);
  assert.match(files.core, /return true;\s*}\s*function medisaUserRequiresFirstLoginPasswordChange/);
});
test('Login tokenı parola hashine bağlı sürüm taşır', () => {
  assert.match(files.core, /hash_hmac\('sha256', \$passwordHash, medisaGetTokenSecret\(\)\)/);
  assert.match(files.core, /'pwdv'\s*=>\s*medisaBuildUserPasswordVersion/);
  assert.match(files.loginPhp, /medisaBuildSessionTokenClaims/);
});
test('Session context eski token sürümünü reddeder', () => {
  assert.match(files.core, /medisaBuildAuthenticatedAccessContext/);
  assert.match(files.core, /medisaTokenMatchesUserPasswordVersion/);
});
test('Backend first-login bypassı PASSWORD_CHANGE_REQUIRED ile kapatır', () => {
  assert.match(files.core, /'code'\s*=>\s*'PASSWORD_CHANGE_REQUIRED'/);
  assert.match(files.commonPhp, /medisaResolveSessionContext/);
});
test('Parola değişimi hash ve bayrağı tek owner mutationda günceller', () => {
  assert.match(files.core, /function medisaApplyUserPasswordChange[\s\S]{0,220}medisaSetUserPasswordHash[\s\S]{0,220}ilk_giris_parola_onerisi_bekliyor'\]\s*=\s*false/);
  assert.match(files.changePhp, /medisaMutateData[\s\S]{0,2200}medisaApplyUserPasswordChange/);
});
test('Parola değişimi yeni token üretir', () => {
  assert.match(files.changePhp, /medisaCreateSignedToken/);
  assert.match(files.changePhp, /\$result\['token'\]/);
});
test('Server parola politikası minimum 10 ve karmaşıklık uygular', () => {
  assert.match(files.core, /mb_strlen\(\$newPassword,\s*'UTF-8'\)\s*>=\s*10/);
  assert.match(files.core, /\[A-ZÇĞİÖŞÜ\]/u);
  assert.match(files.core, /\[a-zçğıöşü\]/u);
  assert.match(files.core, /\[0-9\]/);
});
test('Tahmin edilebilir birebir kullanıcı değerleri reddedilir', () => {
  assert.match(files.core, /kullanici_adi/);
  assert.match(files.core, /soyisim/);
  assert.match(files.core, /medisaUserPasswordPolicyDeniedValues/);
});
test('Login first-login kullanıcısını next route yerine zorunlu ekrana yollar', () => {
  const requiredAt = files.loginJs.indexOf('passwordChangeRequired === true');
  const nextAt = files.loginJs.indexOf('requestedNextUrl');
  assert.ok(requiredAt >= 0 && nextAt >= 0 && requiredAt < nextAt);
  assert.match(files.loginJs, /dashboard\.html\?password-change=required/);
});
test('Dashboard session doğrulamadan driver verisi istemez', () => {
  const sessionAt = files.dashboardJs.indexOf('fetchCurrentPortalSession(token)');
  const dataAt = files.dashboardJs.indexOf("fetch(API_BASE + 'driver_data.php");
  assert.ok(sessionAt >= 0 && dataAt >= 0 && sessionAt < dataAt);
});
test('Dashboard zorunlu modda veri bootstrapından önce döner', () => {
  assert.match(files.dashboardJs, /passwordChangeRequired\s*===\s*true[\s\S]{0,1500}openMandatoryDriverPasswordChange[\s\S]{0,500}return;/);
});
test('Zorunlu modal kapatma ve vazgeç düğmelerini gizler', () => {
  assert.match(files.passwordJs, /driverPasswordMandatoryMode/);
  assert.match(files.passwordJs, /closeBtn\.hidden\s*=\s*isMandatory/);
  assert.match(files.passwordJs, /cancelBtn\.hidden\s*=\s*isMandatory/);
  assert.match(files.passwordJs, /if\s*\(s\.driverPasswordMandatoryMode\)\s*return/);
  assert.match(files.featureCss, /driver-password-modal-close\[hidden\][\s\S]{0,180}display:\s*none\s*!important/);
});
test('Öneri ve mevcut parolayla devam bypassı kaldırılmıştır', () => {
  const joined = files.passwordJs + files.dashboardHtml;
  assert.doesNotMatch(joined, /driver_password_suggestion|continueWithCurrentPassword|Mevcut parolayla devam et|Daha sonra değiştir|Atla/);
});
test('Canonical parola endpointi driver base path üzerinden çağrılır', () => {
  assert.match(files.passwordJs, /p\.API_BASE\s*\+\s*'driver_change_password\.php'/);
  assert.match(files.cpanel, /driver\/driver_change_password\.php/);
});
test('Zorunlu modal üç parola alanı ve minimum 10 kontratına sahiptir', () => {
  assert.match(files.dashboardHtml, /driver-current-password/);
  assert.match(files.dashboardHtml, /driver-new-password/);
  assert.match(files.dashboardHtml, /driver-new-password-confirm/);
  assert.equal((files.dashboardHtml.match(/minlength="10"/g) || []).length, 2);
});
test('Zorunlu ekran güvenlik mesajını eksiksiz gösterir', () => {
  assert.match(files.dashboardHtml, /Güvenliğiniz için geçici parolanızı değiştirmeniz gerekiyor\./);
  assert.match(files.dashboardHtml, /Yeni parolanızı belirlemeden uygulamayı kullanamazsınız\./);
});
test('Ana shell offline snapshot öncesinde token flagini kontrol eder', () => {
  assert.match(files.dataManager, /function ensureMainAppSession[\s\S]{0,700}ilk_giris_parola_degistirme_zorunlu[\s\S]{0,250}redirectToMandatoryPasswordChange/);
  assert.match(files.dataManager, /function loadDataFromLocalStorage\(\)\s*\{\s*if\s*\(!ensureMainAppSession\(\)\)/);
});
test('Ana shell zorunlu durumda auth gatei açmaz', () => {
  const requiredAt = files.dataManager.indexOf('session.ilk_giris_parola_degistirme_zorunlu === true');
  const clearAt = files.dataManager.indexOf('clearMainAppAuthGate();', requiredAt);
  assert.ok(requiredAt >= 0 && clearAt > requiredAt);
});
test('Cache sürümü tek adım artırılmıştır', () => {
  assert.match(files.sw, /CACHE_VERSION\s*=\s*'medisa-v2\.264'/);
});

console.log(`Mandatory password change invariants: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
