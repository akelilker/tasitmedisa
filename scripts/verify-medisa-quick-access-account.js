'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const dm = fs.readFileSync(path.join(root, 'data-manager.js'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'ayarlar.js'), 'utf8');
const prefCode = dm.slice(dm.indexOf('function getQuickAccessPrefKey('), dm.indexOf('window.medisaQuickAccessPref ='));
const logoutCode = dm.slice(dm.indexOf('function medisaMainAppLogout('), dm.indexOf('window.medisaMainAppLogout ='));
const driver = fs.readFileSync(path.join(root, 'driver/driver-dashboard-core.js'), 'utf8');
const driverLogoutCode = driver.slice(driver.indexOf('function logout()'), driver.indexOf('window.logout = logout;'));
const saveCode = settings.slice(settings.indexOf('window.saveHizliErisim ='), settings.indexOf('window.reopenSettingsMenu ='));
const clone = value => JSON.parse(JSON.stringify(value));
const key = 'medisa_hizli_erisim_u1';
const enabled = { aktif: true, aracIds: ['v1'] };

function device(pref, storage = new Map(), fetcher) {
  const user = { id: 'u1' };
  if (pref !== undefined) user.quickAccessPref = clone(pref);
  let renders = 0;
  const calls = [];
  const c = vm.createContext({
    window: { medisaSession: { authenticated: true, user } },
    localStorage: {
      getItem: k => storage.get(k) || null,
      removeItem: k => storage.delete(k),
      key: i => [...storage.keys()][i],
      get length() { return storage.size; }
    },
    navigator: { onLine: true }, serverDatasetTrusted: true, API_SAVE: 'save.php',
    getDefaultSession: () => ({ authenticated: false, user: {} }),
    getAssignedVehiclesForSessionUser: () => [{ id: 'v1' }, { id: 'v2' }],
    buildAuthHeaders: extra => ({ ...extra, Authorization: 'fixture-only' }),
    renderQuickAccessRow: () => renders++,
    fetch: async (url, options) => {
      const payload = JSON.parse(options.body);
      calls.push({ url, payload });
      return fetcher ? fetcher(payload) : { ok: true, json: async () => ({ success: true, quickAccessPref: clone(payload._medisaQuickAccessPref) }) };
    }
  });
  vm.runInContext(prefCode, c);
  return { c, calls, storage, renders: () => renders };
}
async function check(label, fn) { await fn(); console.log('PASS ' + label); }

(async () => {
  await check('İki ayrı tarayıcı aynı sunucu tercihini okur; yerel kopya oluşmaz', async () => {
    let server = null;
    const first = device(null, new Map(), async payload => {
      server = clone(payload._medisaQuickAccessPref);
      return { ok: true, json: async () => ({ success: true, quickAccessPref: clone(server) }) };
    });
    assert.equal(await first.c.writeQuickAccessPref('u1', enabled), true);
    const second = device(server);
    assert.deepEqual(clone(second.c.readQuickAccessPref('u1')), enabled);
    assert.equal(first.storage.size + second.storage.size, 0);
    assert.deepEqual(Object.keys(first.calls[0].payload).sort(), ['_medisaQuickAccessOnlyIfMissing', '_medisaQuickAccessPref']);
  });
  await check('Başka hesap ve eski backend için yazım yapılmaz', async () => {
    const d = device(undefined);
    assert.equal(await d.c.writeQuickAccessPref('u1', enabled), false);
    assert.equal(await d.c.writeQuickAccessPref('u2', enabled), false);
    assert.equal(d.calls.length, 0);
    assert.deepEqual(clone(d.c.readQuickAccessPref('u2')), { aktif: false, aracIds: [] });
  });
  await check('Sunucu hatasında seçim ve aktarılacak yerel kayıt korunur', async () => {
    const old = { aktif: false, aracIds: [] };
    const d = device(old, new Map([[key, JSON.stringify(enabled)]]), async () => ({ ok: false }));
    assert.equal(await d.c.writeQuickAccessPref('u1', enabled), false);
    assert.deepEqual(clone(d.c.readQuickAccessPref('u1')), old);
    assert(d.storage.has(key));
    assert.equal(d.renders(), 0);
  });
  await check('Offline kayıt başarılı gibi gösterilmez', async () => {
    const d = device(null);
    d.c.navigator.onLine = false;
    assert.equal(await d.c.writeQuickAccessPref('u1', enabled), false);
    assert.equal(d.calls.length, 0);
  });
  await check('Aktarım yalnız atanmış taşıtları bir kez taşır', async () => {
    const storage = new Map([[key, JSON.stringify({ aktif: true, aracIds: ['v1', 'foreign', 'v1', 'v2'] })]]);
    const d = device(null, storage);
    await d.c.migrateQuickAccessPref();
    assert.equal(d.calls.length, 1);
    assert.equal(d.calls[0].payload._medisaQuickAccessOnlyIfMissing, true);
    assert.deepEqual(d.calls[0].payload._medisaQuickAccessPref.aracIds, ['v1', 'v2']);
    assert.equal(storage.size, 0);
    await d.c.migrateQuickAccessPref();
    assert.equal(d.calls.length, 1);
  });
  await check('Kapalı sunucu tercihi eski açık seçimle değiştirilmez', async () => {
    const d = device({ aktif: false, aracIds: [] }, new Map([[key, JSON.stringify(enabled)]]));
    await d.c.migrateQuickAccessPref();
    assert.equal(d.calls.length, 0);
    assert.equal(d.storage.size, 0);
  });
  await check('Başka cihaz aktarımı önce tamamladıysa sunucu sonucu kullanılır', async () => {
    const winner = { aktif: true, aracIds: ['v2'] };
    const d = device(null, new Map([[key, JSON.stringify(enabled)]]), async () => ({ ok: true, json: async () => ({ success: true, quickAccessPref: winner }) }));
    await d.c.migrateQuickAccessPref();
    assert.deepEqual(clone(d.c.readQuickAccessPref('u1')), winner);
  });
  await check('Başarısız aktarım eski kaydı silmez ve sonraki yüklemede denenebilir', async () => {
    const d = device(null, new Map([[key, JSON.stringify(enabled)]]), async () => ({ ok: false }));
    await d.c.migrateQuickAccessPref();
    assert(d.storage.has(key));
    assert.equal(d.c.window.medisaSession.user.quickAccessPref, null);
  });
  await check('Yanıt sırasında hesap değişirse diğer hesabın seçimine dokunulmaz', async () => {
    let resolve;
    const response = new Promise(r => { resolve = r; });
    const d = device(null, new Map([[key, JSON.stringify(enabled)]]), () => response);
    const saving = d.c.writeQuickAccessPref('u1', enabled);
    d.c.window.medisaSession = { authenticated: true, user: { id: 'u2', quickAccessPref: null } };
    resolve({ ok: true, json: async () => ({ success: true, quickAccessPref: enabled }) });
    assert.equal(await saving, false);
    assert.equal(d.c.window.medisaSession.user.quickAccessPref, null);
    assert(d.storage.has(key));
  });
  await check('Çıkış tercihi ve aktarılmamış eski seçimi silmez', async () => {
    const d = device(enabled, new Map([[key, JSON.stringify(enabled)]]));
    const saved = clone(d.c.window.medisaSession.user.quickAccessPref);
    Object.assign(d.c, {
      clearPortalSessionAndDocumentCaches() {}, setMedisaSession(s) { d.c.window.medisaSession = s; },
      closeMainAppSettingsMenus() {}, DRIVER_INDEX_URL: 'driver/', document: { body: { removeAttribute() {} } }
    });
    d.c.window.location = {};
    vm.runInContext(logoutCode, d.c);
    d.c.medisaMainAppLogout();
    assert(d.storage.has(key));
    assert.equal(d.c.window.medisaSession.authenticated, false);
    const nextLogin = device(saved);
    assert.deepEqual(clone(nextLogin.c.readQuickAccessPref('u1')), enabled);
  });
  await check('Kullanıcı panelinden çıkış da aktarılmamış seçimi silmez', async () => {
    let clearedTokens = 0;
    const c = vm.createContext({
      window: { location: {} }, runtime: { paths: { DRIVER_PAGE_BASE: 'driver/' } },
      clearStoredPortalTokens: () => clearedTokens++,
      clearDriverQuickAccessPref: () => { throw new Error('Eski seçim silindi'); }
    });
    vm.runInContext(driverLogoutCode, c);
    c.logout();
    assert.equal(clearedTokens, 1);
    assert.equal(c.window.location.href, 'driver/index.html?force=login');
  });
  await check('Kaydet sunucu yanıtını bekler, hatada modal açık ve tekrar kaydedilebilir', async () => {
    let resolve;
    let closed = 0;
    const button = { disabled: false };
    const msg = { textContent: '' };
    const c = vm.createContext({
      window: { medisaQuickAccessPref: { write: () => new Promise(r => { resolve = r; }) }, closeHizliErisim: () => closed++ },
      hizliErisimGetSessionUserId: () => 'u1',
      document: {
        querySelector: () => button,
        getElementById: id => id === 'hizli-erisim-aktif' ? { checked: true } : id === 'hizli-erisim-arac-list' ? { querySelectorAll: () => [{ getAttribute: () => 'v1' }] } : msg
      }
    });
    vm.runInContext(saveCode, c);
    const failedSave = c.window.saveHizliErisim();
    assert.equal(button.disabled, true);
    assert.equal(closed, 0);
    await c.window.saveHizliErisim();
    resolve(false);
    await failedSave;
    assert.equal(button.disabled, false);
    assert.equal(closed, 0);
    assert.match(msg.textContent, /kaydedilemedi/);
    const success = c.window.saveHizliErisim();
    resolve(true);
    await success;
    assert.equal(closed, 1);
  });
  console.log('Quick access account JS: 12 passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
