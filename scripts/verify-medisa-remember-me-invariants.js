/**
 * Beni Hatırla / Bu Cihazı Unut storage + kaynak invariantleri.
 * Çalıştır: node scripts/verify-medisa-remember-me-invariants.js
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const files = {
  portalSession: read('portal-session.js'),
  loginJs: read('driver/driver-login.js'),
  coreJs: read('driver/driver-dashboard-core.js'),
  passwordJs: read('driver/driver-feature-password.js'),
  bootstrap: read('driver/driver-script.js'),
  shellCss: read('driver/driver-shell.css'),
  loginHtml: read('driver/index.html'),
  dashboardHtml: read('driver/dashboard.html'),
  indexHtml: read('index.html'),
  dataManager: read('data-manager.js'),
  styleCore: read('style-core.css')
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

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(String(key)) ? map.get(String(key)) : null;
    },
    setItem(key, value) {
      map.set(String(key), String(value));
    },
    removeItem(key) {
      map.delete(String(key));
    },
    clear() {
      map.clear();
    },
    _map: map
  };
}

function loadPortalSession(options) {
  const localStorage = (options && options.localStorage) || createMemoryStorage();
  const sessionStorage = (options && options.sessionStorage) || createMemoryStorage();
  const context = {
    window: {},
    console
  };
  context.window.localStorage = localStorage;
  context.window.sessionStorage = sessionStorage;
  context.localStorage = localStorage;
  context.sessionStorage = sessionStorage;
  vm.createContext(context);
  vm.runInContext(files.portalSession, context);
  return {
    api: context.window.medisaPortalSession,
    localStorage,
    sessionStorage,
    window: context.window
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const TTL_MS = 30 * DAY_MS;

test('portal-session merkezi hatırlama API yayınlar', () => {
  assert.match(files.portalSession, /clearRememberCredentials/);
  assert.match(files.portalSession, /getValidRememberCredentials/);
  assert.match(files.portalSession, /saveRememberCredentials/);
  assert.match(files.portalSession, /syncRememberPasswordAfterChange/);
  assert.match(files.portalSession, /forgetThisDevice/);
  assert.match(files.portalSession, /REMEMBER_TTL_MS\s*=\s*30\s*\*\s*24/);
});

test('1) Beni Hatırla açık başarılı giriş kaydı', () => {
  const ctx = loadPortalSession();
  const before = Date.now();
  assert.equal(ctx.api.saveRememberCredentials('serhanK', 'Secret1'), true);
  assert.equal(ctx.api.storeToken('token-persist', true), true);
  assert.equal(ctx.localStorage.getItem('driver_remember_me'), '1');
  assert.equal(ctx.localStorage.getItem('driver_saved_username'), 'serhanK');
  assert.equal(ctx.localStorage.getItem('driver_saved_password'), 'Secret1');
  const expires = Number(ctx.localStorage.getItem('driver_remember_expires_at'));
  assert.ok(expires >= before + TTL_MS - 2000);
  assert.ok(expires <= Date.now() + TTL_MS + 2000);
  assert.equal(ctx.localStorage.getItem('medisa_portal_token'), 'token-persist');
  assert.equal(ctx.sessionStorage.getItem('medisa_portal_token'), null);
});

test('2) Beni Hatırla kapalı giriş eski kaydı siler, token sekmelik', () => {
  const ctx = loadPortalSession();
  ctx.api.saveRememberCredentials('oldUser', 'OldPass1');
  ctx.api.clearRememberCredentials();
  assert.equal(ctx.api.storeToken('token-session', false), true);
  assert.equal(ctx.localStorage.getItem('driver_remember_me'), null);
  assert.equal(ctx.localStorage.getItem('driver_saved_username'), null);
  assert.equal(ctx.localStorage.getItem('driver_saved_password'), null);
  assert.equal(ctx.localStorage.getItem('driver_remember_expires_at'), null);
  assert.equal(ctx.sessionStorage.getItem('medisa_portal_token'), 'token-session');
  assert.equal(ctx.localStorage.getItem('medisa_portal_token'), null);
});

test('3) Geçerli süre login alanlarını doldurur', () => {
  const ctx = loadPortalSession();
  ctx.api.saveRememberCredentials('serhanK', 'Secret1');
  const creds = ctx.api.getValidRememberCredentials();
  assert.ok(creds);
  assert.equal(creds.username, 'serhanK');
  assert.equal(creds.password, 'Secret1');
});

test('4) Süre dolunca hatırlama kaydı temizlenir', () => {
  const ctx = loadPortalSession();
  ctx.localStorage.setItem('driver_remember_me', '1');
  ctx.localStorage.setItem('driver_saved_username', 'serhanK');
  ctx.localStorage.setItem('driver_saved_password', 'Secret1');
  ctx.localStorage.setItem('driver_remember_expires_at', String(Date.now() - 1000));
  assert.equal(ctx.api.getValidRememberCredentials(), null);
  assert.equal(ctx.localStorage.getItem('driver_remember_me'), null);
  assert.equal(ctx.localStorage.getItem('driver_saved_password'), null);
  assert.equal(ctx.localStorage.getItem('driver_saved_username'), null);
  assert.equal(ctx.localStorage.getItem('driver_remember_expires_at'), null);
});

test('5) Yeni giriş süreyi 30 güne yeniler', () => {
  const ctx = loadPortalSession();
  ctx.localStorage.setItem('driver_remember_me', '1');
  ctx.localStorage.setItem('driver_saved_username', 'serhanK');
  ctx.localStorage.setItem('driver_saved_password', 'Secret1');
  ctx.localStorage.setItem('driver_remember_expires_at', String(Date.now() + DAY_MS));
  const before = Date.now();
  ctx.api.saveRememberCredentials('serhanK', 'Secret1');
  const expires = Number(ctx.localStorage.getItem('driver_remember_expires_at'));
  assert.ok(expires >= before + TTL_MS - 2000);
});

test('6) Başarısız giriş kaynakta hatırlama kaydını değiştirmez', () => {
  const successIdx = files.loginJs.indexOf('if (data.success)');
  assert.ok(successIdx >= 0);
  const successBlock = files.loginJs.slice(successIdx, successIdx + 700);
  assert.match(successBlock, /saveRememberCredentials\(username,\s*password\)/);
  assert.match(successBlock, /clearRememberCredentials\(\)/);

  const failIdx = files.loginJs.indexOf("errorDiv.textContent = data.message || 'Giriş başarısız!'");
  assert.ok(failIdx >= 0);
  const failBlock = files.loginJs.slice(failIdx, failIdx + 450);
  assert.doesNotMatch(failBlock, /clearRememberCredentials|saveRememberCredentials|driver_saved_/);

  const catchIdx = files.loginJs.indexOf("errorDiv.textContent = 'Bağlantı hatası!");
  assert.ok(catchIdx >= 0);
  const catchBlock = files.loginJs.slice(catchIdx, catchIdx + 350);
  assert.doesNotMatch(catchBlock, /clearRememberCredentials|saveRememberCredentials|driver_saved_/);
});

test('7) Normal çıkış token siler, hatırlamayı korur', () => {
  const ctx = loadPortalSession();
  ctx.api.saveRememberCredentials('serhanK', 'Secret1');
  ctx.api.storeToken('token-persist', true);
  ctx.api.clearStoredTokens();
  assert.equal(ctx.localStorage.getItem('medisa_portal_token'), null);
  assert.equal(ctx.localStorage.getItem('driver_saved_username'), 'serhanK');
  assert.equal(ctx.localStorage.getItem('driver_saved_password'), 'Secret1');
  assert.equal(ctx.localStorage.getItem('driver_remember_me'), '1');

  const logoutIdx = files.coreJs.indexOf('function logout()');
  assert.ok(logoutIdx >= 0);
  const logoutBlock = files.coreJs.slice(logoutIdx, files.coreJs.indexOf('window.logout = logout'));
  assert.match(logoutBlock, /clearStoredPortalTokens\(\)/);
  assert.match(logoutBlock, /index\.html\?force=login/);
  assert.doesNotMatch(logoutBlock, /clearRememberCredentials|driver_saved_password|forgetThisDevice/);
});

test('8) Bu Cihazı Unut tüm kayıtları siler ve force=login kullanır', () => {
  const ctx = loadPortalSession();
  ctx.api.saveRememberCredentials('serhanK', 'Secret1');
  ctx.api.storeToken('token-persist', true);
  ctx.sessionStorage.setItem('driver_token', 'session-token');
  ctx.api.forgetThisDevice();
  assert.equal(ctx.localStorage.getItem('medisa_portal_token'), null);
  assert.equal(ctx.sessionStorage.getItem('medisa_portal_token'), null);
  assert.equal(ctx.sessionStorage.getItem('driver_token'), null);
  assert.equal(ctx.localStorage.getItem('driver_remember_me'), null);
  assert.equal(ctx.localStorage.getItem('driver_saved_username'), null);
  assert.equal(ctx.localStorage.getItem('driver_saved_password'), null);
  assert.equal(ctx.localStorage.getItem('driver_remember_expires_at'), null);
  assert.match(files.coreJs, /forgetThisDevice[\s\S]{0,400}force=login/);
  assert.match(files.dashboardHtml, /Bu Cihazı Unut/);
  assert.match(files.loginJs, /shouldForceDriverLoginView|force.*login/);
});

test('9) Başarılı parola değişimi kayıtlı parolayı günceller ve süreyi yeniler', () => {
  const ctx = loadPortalSession();
  ctx.api.saveRememberCredentials('serhanK', 'OldPass1');
  ctx.localStorage.setItem('driver_remember_expires_at', String(Date.now() + DAY_MS));
  const before = Date.now();
  assert.equal(ctx.api.syncRememberPasswordAfterChange('NewPass1'), true);
  assert.equal(ctx.localStorage.getItem('driver_saved_password'), 'NewPass1');
  assert.notEqual(ctx.localStorage.getItem('driver_saved_password'), 'OldPass1');
  assert.equal(ctx.localStorage.getItem('driver_saved_username'), 'serhanK');
  assert.equal(ctx.localStorage.getItem('driver_remember_me'), '1');
  const expires = Number(ctx.localStorage.getItem('driver_remember_expires_at'));
  assert.ok(expires >= before + TTL_MS - 2000);
  assert.match(files.passwordJs, /syncRememberPasswordAfterChange\(newPassword\)/);
  assert.doesNotMatch(files.passwordJs, /clearSavedDriverPassword/);
});

test('10) Beni Hatırla kapalıyken parola değişimi kayıt oluşturmaz', () => {
  const ctx = loadPortalSession();
  assert.equal(ctx.api.syncRememberPasswordAfterChange('NewPass1'), false);
  assert.equal(ctx.localStorage.getItem('driver_saved_password'), null);
  assert.equal(ctx.localStorage.getItem('driver_remember_me'), null);
});

test('11) Storage hatasında login çökmez', () => {
  const brokenLocal = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); }
  };
  const ctx = loadPortalSession({ localStorage: brokenLocal, sessionStorage: createMemoryStorage() });
  assert.equal(ctx.api.getValidRememberCredentials(), null);
  assert.equal(ctx.api.saveRememberCredentials('u', 'p'), false);
  assert.doesNotThrow(() => ctx.api.clearRememberCredentials());
  assert.doesNotThrow(() => ctx.api.forgetThisDevice());
  assert.equal(ctx.api.storeToken('tok', false), true);
  assert.equal(ctx.sessionStorage.getItem('medisa_portal_token'), 'tok');
});

test('12) Kaynakta parola sızıntısı / sahte şifreleme yok', () => {
  const joined = files.portalSession + files.loginJs + files.coreJs + files.passwordJs;
  assert.doesNotMatch(joined, /console\.(log|warn|error|info|debug)\([^)]*password/i);
  assert.doesNotMatch(joined, /btoa\s*\(\s*(password|normalizedPass|newPassword)/);
  assert.doesNotMatch(joined, /atob\s*\(\s*(localStorage|driver_saved_password)/);
  assert.doesNotMatch(joined, /CryptoJS|AES\.encrypt|fake.?encrypt/i);
  assert.match(files.loginJs, /JSON\.stringify\(\{\s*username,\s*password\s*\}\)/);
  assert.doesNotMatch(files.loginJs, /clearSavedDriverPassword/);
  assert.match(files.loginJs, /saveRememberCredentials\(username,\s*password\)/);
  assert.match(files.loginJs, /restoreRememberedLoginForm|applyRememberedCredentialsToLoginForm/);
});

test('Login açılışında kayıtlı parola otomatik silinmez', () => {
  assert.doesNotMatch(files.loginJs, /clearSavedDriverPassword/);
  const initSlice = files.loginJs.slice(
    files.loginJs.indexOf('async function initDriverLoginPage'),
    files.loginJs.indexOf('loginForm.addEventListener')
  );
  assert.doesNotMatch(initSlice, /removeItem\(['"]driver_saved_password['"]\)/);
  assert.doesNotMatch(initSlice, /clearRememberCredentials\(/);
  assert.match(initSlice, /restoreRememberedLoginForm/);
  assert.match(initSlice, /pageshow/);
});

test('Ana uygulama Bu Cihazı Unut UI ve auth kuralı', () => {
  assert.match(files.indexHtml, /id="settings-forget-device-btn"/);
  assert.match(files.indexHtml, />Bu Cihazı Unut</);
  assert.match(files.indexHtml, /id="settings-logout-btn"/);
  assert.match(files.indexHtml, /id="forget-device-confirm-modal"/);
  assert.match(files.indexHtml, /Bu cihazda saklanan kullanıcı adı, parola ve oturum bilgileri silinecek/);
  assert.match(files.indexHtml, />Vazgeç</);
  const forgetBtn = files.indexHtml.match(/<button[^>]*id="settings-forget-device-btn"[^>]*>/);
  assert.ok(forgetBtn, 'forget button markup');
  assert.match(forgetBtn[0], /type="button"/);
  assert.match(files.dataManager, /settings-forget-device-btn[\s\S]{0,220}showLogoutActions/);
  assert.match(files.dataManager, /settings-logout-btn[\s\S]{0,220}showLogoutActions/);
});

test('Ana uygulama forget merkezi portal-session API kullanır', () => {
  assert.match(files.dataManager, /function medisaMainAppForgetThisDevice\s*\(/);
  assert.match(files.dataManager, /medisaPortalSession\.forgetThisDevice/);
  assert.match(files.dataManager, /index\.html\?force=login/);
  const forgetFn = files.dataManager.slice(
    files.dataManager.indexOf('function medisaMainAppForgetThisDevice'),
    files.dataManager.indexOf('window.medisaMainAppForgetThisDevice')
  );
  assert.doesNotMatch(forgetFn, /localStorage\.removeItem/);
  assert.doesNotMatch(forgetFn, /sessionStorage\.removeItem/);
  assert.doesNotMatch(forgetFn, /driver_saved_password/);
});

test('Ana uygulama normal çıkış hatırlamayı korur', () => {
  const logoutFn = files.dataManager.slice(
    files.dataManager.indexOf('function medisaMainAppLogout'),
    files.dataManager.indexOf('window.medisaMainAppLogout')
  );
  assert.match(logoutFn, /clearStoredPortalTokens\(\)/);
  assert.match(logoutFn, /index\.html\?force=login/);
  assert.doesNotMatch(logoutFn, /forgetThisDevice|clearRememberCredentials|driver_saved_/);
});

test('Ana uygulama Vazgeç kayıt silmez', () => {
  const closeFn = files.dataManager.slice(
    files.dataManager.indexOf('function closeMedisaMainAppForgetThisDeviceConfirm'),
    files.dataManager.indexOf('window.closeMedisaMainAppForgetThisDeviceConfirm')
  );
  assert.doesNotMatch(closeFn, /forgetThisDevice|clearRememberCredentials|clearStoredPortalTokens|removeItem/);
});

test('iOS PWA login class ve CSS owner kuralları', () => {
  assert.match(files.bootstrap, /function applyMedisaIosPwaClass\s*\(/);
  assert.match(files.bootstrap, /isIOS && isStandalone/);
  assert.match(files.bootstrap, /classList\.add\('is-ios-pwa'\)/);
  assert.match(files.shellCss, /body\.is-ios-pwa\.login-page[\s\S]{0,220}justify-content:\s*center/);
  assert.match(files.shellCss, /body\.is-ios-pwa\.login-page[\s\S]{0,120}margin-top:\s*0/);
  assert.match(files.shellCss, /body\.is-ios-pwa\.login-page[\s\S]{0,260}padding-top:\s*4px/);
  assert.match(files.shellCss, /body\.is-ios-pwa\.login-page[\s\S]{0,280}padding-top:\s*11px/);
  assert.match(files.shellCss, /body\.is-ios-pwa\.login-page[\s\S]{0,320}padding-top:\s*15px/);
  assert.match(files.shellCss, /body:not\(\.is-ios-pwa\)\.login-page[\s\S]{0,180}clamp\(48px,\s*12dvh,\s*104px\)/);
  assert.match(files.shellCss, /\.login-form \.form-group input \{[\s\S]{0,80}padding:\s*8px 16px/);
  assert.match(files.shellCss, /\.btn-login \{[\s\S]{0,60}padding:\s*12px/);
  assert.doesNotMatch(files.shellCss.slice(-900), /is-ios-pwa|padding-top:\s*11px/);
});

test('Bu görev style-core.css ownerına dokunmaz ve asset pinleri tutarlıdır', () => {
  assert.match(files.bootstrap, /shellCss:\s*'20260731\.3'/);
  assert.match(files.bootstrap, /bootstrap:\s*'20260731\.3'/);
  assert.match(files.loginHtml, /driver-shell\.css\?v=20260731\.3/);
  assert.match(files.dashboardHtml, /driver-shell\.css\?v=20260731\.3/);
  assert.match(files.loginHtml, /driver-script\.js\?v=20260731\.3/);
  assert.match(files.indexHtml, /data-manager\.js\?v=20260731\.3/);
  // style-core dirty olabilir ama görev iOS/login kurallarını oraya taşımamalı
  assert.doesNotMatch(files.styleCore, /is-ios-pwa/);
  assert.doesNotMatch(files.styleCore, /settings-forget-device-btn/);
});

console.log(`Remember-me invariants: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
