
(function() {
'use strict';

const APP_ROOT = (function() {
var p = document.location.pathname || '/';
var parts = String(p || '/').split('/').filter(Boolean);
if (!parts.length) return '/';
var lastPart = parts[parts.length - 1] || '';
if (lastPart.indexOf('.') !== -1) parts.pop();
var lastDir = (parts[parts.length - 1] || '').toLowerCase();
if (lastDir === 'driver' || lastDir === 'admin') parts.pop();
return parts.length ? ('/' + parts.join('/') + '/') : '/';
})();
const API_BASE = (APP_ROOT === '/' ? '/driver/' : APP_ROOT + 'driver/');

const ICON_BASE = (APP_ROOT === '/' ? '/icon/' : APP_ROOT + 'icon/');

const DRIVER_PAGE_BASE = API_BASE;
const MAIN_APP_URL = (APP_ROOT === '/' ? '/index.html' : APP_ROOT + 'index.html');
const MAIN_SESSION_URL = (APP_ROOT === '/' ? '/load.php' : APP_ROOT + 'load.php');
var runtime = window.MedisaDriverRuntime;
if (!runtime) throw new Error('MedisaDriverRuntime eksik');
var h = runtime.helpers;
var driverVehicleNeedsK2 = h && h.driverVehicleNeedsK2;
var driverVehicleNeedsTakograf = h && h.driverVehicleNeedsTakograf;
var driverVehicleIsHeavyCommercial = h && h.driverVehicleIsHeavyCommercial;
var bindDriverDashboardTitleCase = h && h.bindDriverDashboardTitleCase;
if (typeof driverVehicleNeedsK2 !== 'function'
|| typeof driverVehicleNeedsTakograf !== 'function'
|| typeof driverVehicleIsHeavyCommercial !== 'function') {
throw new Error('MedisaDriverRuntime vehicle document helpers eksik');
}
if (typeof bindDriverDashboardTitleCase !== 'function') {
throw new Error('MedisaDriverRuntime dashboard titlecase helper eksik');
}
runtime.paths.APP_ROOT = APP_ROOT;
runtime.paths.API_BASE = API_BASE;
runtime.paths.ICON_BASE = ICON_BASE;
runtime.paths.DRIVER_PAGE_BASE = DRIVER_PAGE_BASE;
runtime.paths.MAIN_APP_URL = MAIN_APP_URL;
runtime.paths.MAIN_SESSION_URL = MAIN_SESSION_URL;


const APP_VERSION = 'v78.1';
function showDriverOfflineReadonlyMessage() {
alert('İnternet bağlantısı yok. Son kayıtlı veri görüntüleniyor; değişiklikler kaydedilemez.');
}
function ensureDriverOnlineForWrite() {
if (typeof navigator !== 'undefined' && navigator.onLine === false) {
showDriverOfflineReadonlyMessage();
return false;
}
return true;
}

(function setDriverVersion() {
function apply() {
var el = document.getElementById('version-display');
if (!el) return;
var ua = navigator.userAgent || '';
var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
var isPWA = window.matchMedia('(display-mode: standalone)').matches || (window.navigator.standalone === true);
var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
var suffix = isPWA ? (isIOS ? ' iOS PWA' : ' PWA') : (isMobile ? ' Mobil' : '');
el.textContent = APP_VERSION + suffix;
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
else apply();
})();

function decodeDriverTokenPayload(token) {
if (!token || typeof token !== 'string') return null;
try {
if (token.indexOf('.') !== -1) {
var parts = token.split('.');
if (parts.length !== 3) return null;
var payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
while (payload.length % 4) payload += '=';
return JSON.parse(atob(payload));
}
return JSON.parse(atob(token));
} catch (e) {
return null;
}
}

function getStoredPortalToken() {
return window.medisaPortalSession && typeof window.medisaPortalSession.getStoredToken === 'function'
? (window.medisaPortalSession.getStoredToken() || null)
: null;
}

function clearStoredPortalTokens() {
if (window.medisaPortalSession && typeof window.medisaPortalSession.clearStoredTokens === 'function') {
window.medisaPortalSession.clearStoredTokens();
}
}

function shouldForceDriverLoginView() {
try {
var search = window.location && window.location.search ? window.location.search : '';
if (!search) return false;
return new URLSearchParams(search).get('force') === 'login';
} catch (e) {
return false;
}
}

function getRequestedNextUrl() {
try {
var search = window.location && window.location.search ? window.location.search : '';
if (!search) return '';
var rawNext = new URLSearchParams(search).get('next');
if (!rawNext) return '';

var resolvedUrl = new URL(rawNext, window.location.origin);
if (resolvedUrl.origin !== window.location.origin) return '';

return (resolvedUrl.pathname || '') + (resolvedUrl.search || '') + (resolvedUrl.hash || '');
} catch (e) {
return '';
}
}

function persistSessionToken(token, remember) {
if (!token) return;
clearStoredPortalTokens();
if (window.medisaPortalSession && typeof window.medisaPortalSession.storeToken === 'function') {
var storedInPreferredScope = window.medisaPortalSession.storeToken(token, remember);
if (!storedInPreferredScope) {
console.warn('Token depolamasi sirasinda sorun olustu, oturum sekme bazli tutulacak.');
}
return;
}
console.error('Token kaydedilemedi.');
}

function isPortalSessionRemembered() {
try {
return !!(window.localStorage.getItem('medisa_portal_token') || window.localStorage.getItem('driver_token'));
} catch (e) {
return false;
}
}

async function fetchCurrentPortalSession(token) {
if (!token) return null;
try {
const response = await fetch(MAIN_SESSION_URL + '?session=1&_=' + Date.now(), {
headers: { 'Authorization': 'Bearer ' + token },
cache: 'no-store'
});
if (!response.ok) return null;
const text = await response.text();
const data = text ? JSON.parse(text) : {};
return data && data.session && typeof data.session === 'object' ? data.session : null;
} catch (e) {
return null;
}
}

function normalizePortalRole(role) {
var r = String(role || '').trim();
if (r === 'yonetici_kullanici') return 'sube_yonetici';
return r;
}

function getPortalRoleValue(sessionData, payload) {
var raw = '';
if (sessionData && typeof sessionData === 'object') {
var sessionRole = String(sessionData.role || (sessionData.user && sessionData.user.role) || '').trim();
if (sessionRole) raw = sessionRole;
}
if (!raw) {
raw = String((payload && (payload.rol || payload.role)) || '').trim();
}
return normalizePortalRole(raw);
}

function isPortalMainAppRole(role) {
var normalizedRole = normalizePortalRole(role);
return normalizedRole === 'sube_yonetici'
|| normalizedRole === 'genel_yonetici';
}

function buildPortalAccessContext(payload, fallbackDashboard, sessionData) {
var driverDashboard = false;
if (sessionData && typeof sessionData.driver_dashboard === 'boolean') {
driverDashboard = sessionData.driver_dashboard === true;
} else if (payload && typeof payload.driver_dashboard === 'boolean') {
driverDashboard = payload.driver_dashboard === true;
} else if (fallbackDashboard === true) {
driverDashboard = true;
}
return {
role: getPortalRoleValue(sessionData, payload),
driverDashboard: driverDashboard,
yoneticiOnly: sessionData && typeof sessionData.yonetici_only === 'boolean'
? sessionData.yonetici_only === true
: !!(payload && payload.yonetici_only === true),
panelEnabled: driverDashboard,
passwordChangeRequired: sessionData && typeof sessionData.ilk_giris_parola_degistirme_zorunlu === 'boolean'
? sessionData.ilk_giris_parola_degistirme_zorunlu === true
: (payload && typeof payload.ilk_giris_parola_degistirme_zorunlu === 'boolean'
? payload.ilk_giris_parola_degistirme_zorunlu === true
: true)
};
}

function canOpenDriverDashboard(accessContext) {
if (!accessContext || accessContext.driverDashboard !== true) return false;
if (accessContext.yoneticiOnly === true) return false;
return true;
}

function resolvePortalDefaultSurface(accessContext) {
if (!accessContext) return null;

var role = String(accessContext.role || '').trim();
if (role === 'kullanici') {
return canOpenDriverDashboard(accessContext) ? 'dashboard' : null;
}
if (isPortalMainAppRole(role)) {
return 'main';
}
if (canOpenDriverDashboard(accessContext)) {
return 'dashboard';
}

return null;
}

function routeByAccessContext(accessContext, options) {
var routeOptions = options && typeof options === 'object' ? options : {};
if (accessContext && accessContext.passwordChangeRequired === true) {
var mandatoryUrl = DRIVER_PAGE_BASE + 'dashboard.html?password-change=required';
if (window.location.pathname.indexOf('/driver/dashboard.html') === -1) {
window.location.href = mandatoryUrl;
} else if (window.history && typeof window.history.replaceState === 'function') {
window.history.replaceState(null, '', mandatoryUrl);
}
return true;
}
var surface = resolvePortalDefaultSurface(accessContext);
var requestedNextUrl = String(routeOptions.nextUrl || '').trim();

if (requestedNextUrl && (surface === 'dashboard' || surface === 'main')) {
window.location.href = requestedNextUrl;
return true;
}

if (surface === 'dashboard') {
window.location.href = DRIVER_PAGE_BASE + 'dashboard.html';
return true;
}

if (surface === 'main') {
window.location.href = MAIN_APP_URL;
return true;
}

if (routeOptions.stayOnLoginWhenDashboardUnavailable === true) {
return false;
}

var r = normalizePortalRole(String((accessContext && accessContext.role) || ''));
if (r === 'kullanici' && !canOpenDriverDashboard(accessContext)) {
return false;
}

window.location.href = MAIN_APP_URL;
return true;
}

function routeByToken(token, fallbackDashboard, options) {
var routeOptions = options && typeof options === 'object' ? options : {};
var payload = decodeDriverTokenPayload(token);
var nowTs = Math.floor(Date.now() / 1000);
if (!payload || !payload.exp || Number(payload.exp) < nowTs) {
clearStoredPortalTokens();
return false;
}

var accessContext = buildPortalAccessContext(payload, fallbackDashboard, routeOptions.sessionData);
return routeByAccessContext(accessContext, routeOptions);
}

async function routeByCurrentSession(token, fallbackDashboard, options) {
var routeOptions = options && typeof options === 'object' ? options : {};
var payload = decodeDriverTokenPayload(token);
var nowTs = Math.floor(Date.now() / 1000);
if (!payload || !payload.exp || Number(payload.exp) < nowTs) {
clearStoredPortalTokens();
return false;
}

var currentSession = await fetchCurrentPortalSession(token);
if (!currentSession) {
clearStoredPortalTokens();
return false;
}
return routeByToken(token, fallbackDashboard, Object.assign({}, routeOptions, {
sessionData: currentSession
}));
}

function syncDashboardHomeLinkVisibility(accessContext) {
if (!document.body || !document.body.classList.contains('dashboard-page')) return;
var shouldShow = !!accessContext
&& canOpenDriverDashboard(accessContext)
&& isPortalMainAppRole(accessContext.role);
document.querySelectorAll('.dashboard-page .driver-footer-back-wrap').forEach(function(el) {
if (shouldShow) {
el.style.display = '';
} else {
el.style.display = 'none';
}
});
}


let currentToken = null;
let currentUser = null;
let currentRecordId = null;
let allHistoryRecords = [];
let allHistoryVehicles = [];

let isMuayeneConfirmed = false;

let pendingMuayeneVehicleId = null;
let currentPeriod = '';
let selectedVehicleId = null;
let driverHistoryLoaded = false;
let driverHistoryPromise = null;

let driverKmActionHandled = false;

let lastCompletedActionInSession = null;

let driverFeedbackPrefillHandled = false;
let driverKaportaSvgPromise = null;
let driverPasswordMandatoryMode = false;
function bindState(key, get, set){ Object.defineProperty(runtime.state, key, {configurable:true,enumerable:true,get:get,set:set}); }
bindState('currentToken',function(){return currentToken},function(v){currentToken=v});
bindState('currentUser',function(){return currentUser},function(v){currentUser=v});
bindState('currentRecordId',function(){return currentRecordId},function(v){currentRecordId=v});
bindState('allHistoryRecords',function(){return allHistoryRecords},function(v){allHistoryRecords=v});
bindState('allHistoryVehicles',function(){return allHistoryVehicles},function(v){allHistoryVehicles=v});
bindState('isMuayeneConfirmed',function(){return isMuayeneConfirmed},function(v){isMuayeneConfirmed=v});
bindState('pendingMuayeneVehicleId',function(){return pendingMuayeneVehicleId},function(v){pendingMuayeneVehicleId=v});
bindState('currentPeriod',function(){return currentPeriod},function(v){currentPeriod=v});
bindState('selectedVehicleId',function(){return selectedVehicleId},function(v){selectedVehicleId=v});
bindState('driverHistoryLoaded',function(){return driverHistoryLoaded},function(v){driverHistoryLoaded=v});
bindState('driverHistoryPromise',function(){return driverHistoryPromise},function(v){driverHistoryPromise=v});
bindState('lastCompletedActionInSession',function(){return lastCompletedActionInSession},function(v){lastCompletedActionInSession=v});
bindState('driverKaportaSvgPromise',function(){return driverKaportaSvgPromise},function(v){driverKaportaSvgPromise=v});
bindState('driverPasswordMandatoryMode',function(){return driverPasswordMandatoryMode},function(v){driverPasswordMandatoryMode=v});

function clearSessionGreenFeedback() { lastCompletedActionInSession = null; }
window.addEventListener('pagehide', clearSessionGreenFeedback);
document.addEventListener('visibilitychange', function() { if (document.hidden) clearSessionGreenFeedback(); });

function placePwaWrapper() {
var pwaWrapper = document.getElementById('pwa-install-wrapper');
var desktopPwaSlot = document.getElementById('driver-below-hero-pwa-slot');
var mobilePwaTarget = document.getElementById('driver-mobile-notification-slot');
if (!pwaWrapper) return;
if (window.innerWidth >= 769 && desktopPwaSlot) {
desktopPwaSlot.appendChild(pwaWrapper);
if (mobilePwaTarget) mobilePwaTarget.setAttribute('aria-hidden', 'true');
} else if (mobilePwaTarget) {
mobilePwaTarget.appendChild(pwaWrapper);
mobilePwaTarget.setAttribute('aria-hidden', pwaWrapper.querySelector('#pwa-install-bar') ? 'false' : 'true');
}
}
function placeNotificationSlot() {
var el = document.getElementById('driver-sliding-warning');
if (!el) return;
var belowHeroSlot = document.getElementById('driver-below-hero-notification-slot');
var hasContent = (el.innerHTML || '').trim().length > 0;
if (!hasContent && belowHeroSlot && el.parentNode !== belowHeroSlot) {
belowHeroSlot.appendChild(el);
return;
}
if (!hasContent) return;
if (belowHeroSlot) {
belowHeroSlot.appendChild(el);
}
}
(function initPwaPlacement() {
function run() {
if (document.body.classList.contains('dashboard-page')) placePwaWrapper();
}
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', run);
} else {
run();
}
})();
(function initPwaResizePlacement() {
var ticking = false;
window.addEventListener('resize', function() {
if (ticking) return;
ticking = true;
requestAnimationFrame(function() {
if (document.body.classList.contains('dashboard-page')) {
placePwaWrapper();
placeNotificationSlot();
}
ticking = false;
});
});
})();

(function initDriverVehicleShortcuts() {
function bind() {
if (!document.body.classList.contains('dashboard-page')) return;
var wrap = document.getElementById('driver-vehicle-shortcuts');
var toggle = document.getElementById('driver-vehicle-shortcuts-toggle');
var panel = document.getElementById('driver-vehicle-shortcuts-panel');
if (!wrap || !toggle || !panel || wrap.dataset.shortcutsBound === '1') return;
wrap.dataset.shortcutsBound = '1';

var overlay = wrap.querySelector('.driver-shortcuts-overlay');
if (overlay) {
overlay.addEventListener('click', function() { setOpen(false); });
}

var outsideCloseUnlockTimer = null;

function setOpen(open) {
wrap.classList.toggle('is-open', open);
toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
panel.setAttribute('aria-hidden', open ? 'false' : 'true');
if (!open) wrap.dataset.shortcutsOutsideGuard = '0';
}

function armOutsideCloseGuard() {
if (outsideCloseUnlockTimer) clearTimeout(outsideCloseUnlockTimer);
wrap.dataset.shortcutsOutsideGuard = '1';
outsideCloseUnlockTimer = setTimeout(function() {
wrap.dataset.shortcutsOutsideGuard = '0';
outsideCloseUnlockTimer = null;
}, 350);
}

toggle.addEventListener('click', function(e) {
e.preventDefault();
e.stopPropagation();
if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
var willOpen = !wrap.classList.contains('is-open');
setOpen(willOpen);
if (willOpen) armOutsideCloseGuard();
});

panel.addEventListener('click', function() {
setOpen(false);
});

document.addEventListener('click', function(e) {
if (!wrap.classList.contains('is-open')) return;
if (wrap.dataset.shortcutsOutsideGuard === '1') return;
if (wrap.contains(e.target)) return;
setOpen(false);
});

document.addEventListener('keydown', function(e) {
if (e.key === 'Escape' && wrap.classList.contains('is-open')) setOpen(false);
});
}
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', bind);
} else {
bind();
}
})();


function formatDateDDMMYYYY(isoDate) {
if (!isoDate || typeof isoDate !== 'string') return '';
function isValidDateParts(day, month, year) {
var d = parseInt(day, 10);
var m = parseInt(month, 10);
var y = parseInt(year, 10);
if (!d || !m || !y || m < 1 || m > 12) return false;
var dt = new Date(y, m - 1, d);
return dt.getFullYear() === y && dt.getMonth() === (m - 1) && dt.getDate() === d;
}
var raw = isoDate.trim();
var parts = raw.split('-');
if (parts.length === 3) {
var p0 = (parts[0] || '').trim();
var p1 = (parts[1] || '').trim();
var p2 = (parts[2] || '').trim();
if (/^\d{4}$/.test(p0) && /^\d{1,2}$/.test(p1) && /^\d{1,2}$/.test(p2) && isValidDateParts(p2, p1, p0)) {
return String(p2).padStart(2, '0') + '/' + String(p1).padStart(2, '0') + '/' + p0;
}
if (/^\d{1,2}$/.test(p0) && /^\d{1,2}$/.test(p1) && /^\d{4}$/.test(p2) && isValidDateParts(p0, p1, p2)) {
return String(p0).padStart(2, '0') + '/' + String(p1).padStart(2, '0') + '/' + p2;
}
return raw;
}
var digits = raw.replace(/[^\d]/g, '');
if (/^\d{8}$/.test(digits)) {
var dd = digits.slice(0, 2);
var mm = digits.slice(2, 4);
var yyyy = digits.slice(4, 8);
if (isValidDateParts(dd, mm, yyyy)) return dd + '/' + mm + '/' + yyyy;
var yyyyAlt = digits.slice(0, 4);
var mmAlt = digits.slice(4, 6);
var ddAlt = digits.slice(6, 8);
if (isValidDateParts(ddAlt, mmAlt, yyyyAlt)) return ddAlt + '/' + mmAlt + '/' + yyyyAlt;
}
return raw;
}

function getVehicleTypeRuleProfileDriver(tasitTipi) {
var rawType = tasitTipi != null ? String(tasitTipi).trim().toLowerCase() : '';
if (!rawType) return 'otomobil';
if (rawType === 'kamyon') return 'buyukTicari';
if (rawType === 'romork') return 'buyukTicari';
if (rawType === 'minivan') return 'minivan';
if (rawType === 'otomobil') return 'otomobil';
return rawType;
}


function calculateNextMuayeneDate(tarihStr, vehicle) {
if (!tarihStr) return '';
var vehicleType = (vehicle && (vehicle.vehicleType || vehicle.tip)) ? (vehicle.vehicleType || vehicle.tip) : 'otomobil';
var profile = getVehicleTypeRuleProfileDriver(vehicleType);
var years = profile === 'otomobil' ? 2 : 1;
try {
var dt = new Date(tarihStr + 'T00:00:00');
if (isNaN(dt.getTime())) return '';
dt.setFullYear(dt.getFullYear() + years);
return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
} catch (e) {
return '';
}
}
function formatDriverPlaka(plaka) {
if (!plaka) return '';
return window.innerWidth <= 768 ? String(plaka).replace(/\s+/g, '') : plaka;
}
function syncDriverDateDisplay(inputEl) {
if (!inputEl || inputEl.type !== 'date') return;
var wrap = inputEl.closest('.driver-date-wrap');
if (!wrap) return;
var display = wrap.querySelector('.driver-date-display');
if (!display) return;
var formatted = formatDateDDMMYYYY(inputEl.value || '');

if (!formatted && document.activeElement === inputEl && display.dataset.lastShown) return;
display.textContent = formatted;
if (formatted) display.dataset.lastShown = formatted;
}
function initDriverDateDisplays(container) {
var root = container && container.nodeType ? container : document;
var wraps = root.querySelectorAll ? root.querySelectorAll('.driver-date-wrap') : [];
wraps.forEach(function(wrap) {
var input = wrap.querySelector('input[type="date"]');
if (!input) return;
syncDriverDateDisplay(input);
input.removeEventListener('input', wrap._driverDateInputHandler);
input.removeEventListener('change', wrap._driverDateInputHandler);
wrap._driverDateInputHandler = function() { syncDriverDateDisplay(input); };
input.addEventListener('input', wrap._driverDateInputHandler);
input.addEventListener('change', wrap._driverDateInputHandler);
input.addEventListener('focus', function() {
if (typeof input.showPicker === 'function') { try { input.showPicker(); } catch (e) {} }
});
});
}


function updateDriverModalBodyClass() {
var open = document.querySelector('.driver-modal.show');
if (open) {
document.body.classList.add('driver-modal-open');
var id = open.id;
if (id === 'history-modal' || id === 'edit-request-modal') {
document.body.classList.add('driver-history-or-edit-modal-open');
} else {
document.body.classList.remove('driver-history-or-edit-modal-open');
}
if (id === 'driver-feedback-modal' || id === 'driver-documents-modal') {
document.body.classList.add('driver-feedback-modal-open');
} else {
document.body.classList.remove('driver-feedback-modal-open');
}
if (id !== 'history-modal') {
document.body.classList.remove('driver-history-vehicle-dropdown-open');
}
} else {
document.body.classList.remove('driver-modal-open');
document.body.classList.remove('driver-history-or-edit-modal-open');
document.body.classList.remove('driver-feedback-modal-open');
document.body.classList.remove('driver-history-vehicle-dropdown-open');
}
}



var driverSplashNotifyReady = null;


function initDriverSplash() {
const splash = document.getElementById('driver-splash');
const MIN_SPLASH_MS = 600;
const MAX_SPLASH_MS = 2400;
const FADE_MS = 400;

if (!splash) {
driverSplashNotifyReady = null;
if (document.body) document.body.classList.remove('driver-splash-active');
return;
}

if (document.body) document.body.classList.add('driver-splash-active');
var startedAt = Date.now();
var dataReady = false;
var dismissed = false;

function hideSplash() {
if (dismissed) return;
dismissed = true;
driverSplashNotifyReady = null;
splash.classList.add('hidden');
splash.setAttribute('aria-hidden', 'true');
setTimeout(function() {
splash.style.display = 'none';
if (document.body) document.body.classList.remove('driver-splash-active');
}, FADE_MS);
}

function tryDismissSplash() {
if (dismissed) return;
var elapsed = Date.now() - startedAt;
if (dataReady && elapsed >= MIN_SPLASH_MS) {
hideSplash();
return;
}
if (elapsed >= MAX_SPLASH_MS) {
hideSplash();
}
}

setTimeout(tryDismissSplash, MAX_SPLASH_MS);

driverSplashNotifyReady = function markDriverSplashReady() {
if (dismissed) return;
dataReady = true;
var remaining = MIN_SPLASH_MS - (Date.now() - startedAt);
if (remaining <= 0) {
tryDismissSplash();
} else {
setTimeout(tryDismissSplash, remaining);
}
};
}

function notifyDriverSplashReady() {
if (typeof driverSplashNotifyReady === 'function') {
driverSplashNotifyReady();
}
}

if (document.getElementById('driver-two-panel')) {
const run = () => {
initDriverSplash();
loadDashboard();
};
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', run);
} else {
run();
}
window.addEventListener('pageshow', function(ev) {
if (ev.persisted) run();
});
}

function getDriverFeedbackPresetMessage(preset) {
var p = String(preset || '').trim().toLowerCase();
switch (p) {
case 's':
return 'Güncellenen Zorunlu Trafik Sigortası Poliçesinin Gönderilmesi.';
case 'k':
return 'Güncellenen Kasko Poliçesinin Gönderilmesi.';
case 'sk':
return 'Güncellenen Zorunlu Trafik Sigortası / Kasko Poliçesinin Gönderilmesi.';
case 'm':
return 'Genel Muayene Randevusu Konusunda Destek İhtiyacı';
case 'e':
return 'Genel Egzoz Muayenesi Randevusu Konusunda Destek İhtiyacı';
case 'me':
return 'Genel Muayene / Egzoz Muayenesi Randevusu Konusunda Destek İhtiyacı';
default:
return '';
}
}

function getDriverFeedbackPrefillFromQuery() {
try {
var search = window.location && window.location.search ? window.location.search : '';
if (!search) return null;
var params = new URLSearchParams(search);
if (params.get('feedback') !== 'talep') return null;
var rawMsg = params.get('msg');
if (rawMsg == null || rawMsg === '') rawMsg = params.get('message');
if (rawMsg != null && String(rawMsg).trim() !== '') {
var msgFromParam = String(rawMsg).trim();
if (msgFromParam.length > 500) msgFromParam = msgFromParam.slice(0, 500);
return { type: 'talep', message: msgFromParam };
}
var rawPreset = params.get('preset');
if (rawPreset == null || String(rawPreset).trim() === '') return null;
var preset = String(rawPreset).trim().toLowerCase();
var allowed = { s: 1, k: 1, sk: 1, m: 1, e: 1, me: 1 };
if (!allowed[preset]) return null;
var presetMsg = getDriverFeedbackPresetMessage(preset);
if (!String(presetMsg || '').trim()) return null;
if (presetMsg.length > 500) presetMsg = presetMsg.slice(0, 500);
return { type: 'talep', message: presetMsg };
} catch (e) {
console.warn('[Medisa] getDriverFeedbackPrefillFromQuery:', e);
return null;
}
}

function clearDriverFeedbackPrefillQuery() {
try {
var u = new URL(window.location.href);
u.searchParams.delete('feedback');
u.searchParams.delete('msg');
u.searchParams.delete('message');
u.searchParams.delete('source');
u.searchParams.delete('preset');
var qs = u.searchParams.toString();
var newUrl = u.pathname + (qs ? '?' + qs : '') + (u.hash || '');
history.replaceState(null, '', newUrl);
} catch (e) {
console.warn('[Medisa] clearDriverFeedbackPrefillQuery:', e);
}
}

function applyDriverFeedbackPrefill(prefill) {
if (!prefill) return false;
if (typeof window.openDriverFeedbackModal !== 'function') return false;
try {
window.openDriverFeedbackModal();
var modal = document.getElementById('driver-feedback-modal');
if (!modal || !modal.classList.contains('show')) return false;
var typeSelect = document.getElementById('driver-feedback-type');
if (typeSelect) typeSelect.value = 'talep';
if (runtime.helpers && typeof runtime.helpers.syncDriverFeedbackTypeTriggerFromSelect === 'function') runtime.helpers.syncDriverFeedbackTypeTriggerFromSelect();
var messageEl = document.getElementById('driver-feedback-message');
if (messageEl) {
messageEl.value = prefill.message || '';
messageEl.dispatchEvent(new Event('input', { bubbles: true }));
messageEl.dispatchEvent(new Event('change', { bubbles: true }));
}
return true;
} catch (e) {
console.warn('[Medisa] applyDriverFeedbackPrefill:', e);
return false;
}
}

function tryOpenDriverFeedbackPrefillFromQuery() {
if (driverFeedbackPrefillHandled) return;
var prefill = getDriverFeedbackPrefillFromQuery();
if (!prefill) return;
driverFeedbackPrefillHandled = true;
runtime.loadFeature('feedback').then(function() {
var ok = false;
try { ok = applyDriverFeedbackPrefill(prefill); } catch (e) {
console.warn('[Medisa] tryOpenDriverFeedbackPrefillFromQuery:', e);
}
if (ok) clearDriverFeedbackPrefillQuery();
}).catch(function(err){ console.warn('[Medisa] feedback feature:', err); });
}

function getDriverActionFromQuery() {
try {
var search = window.location && window.location.search ? window.location.search : '';
if (!search) return '';
var params = new URLSearchParams(search);
var raw = params.get('action');
if (raw == null) return '';
var v = String(raw).trim().toLowerCase();
return v === 'km' ? 'km' : '';
} catch (e) {
console.warn('[Medisa] getDriverActionFromQuery:', e);
return '';
}
}

function clearDriverActionQuery() {
try {
var u = new URL(window.location.href);
u.searchParams.delete('action');
var qs = u.searchParams.toString();
var newUrl = u.pathname + (qs ? '?' + qs : '') + (u.hash || '');
history.replaceState(null, '', newUrl);
} catch (e) {
console.warn('[Medisa] clearDriverActionQuery:', e);
}
}

function tryOpenDriverKmActionFromQuery() {
if (driverKmActionHandled) return;
if (getDriverActionFromQuery() !== 'km') return;
if (!selectedVehicleId) return;
driverKmActionHandled = true;
runtime.loadFeature('actions').then(function() {
if (typeof window.focusKmInput === 'function') window.focusKmInput(selectedVehicleId);
else window.toggleDriverActionBlock('km', selectedVehicleId);
var vid = String(selectedVehicleId);
setTimeout(function() {
try {
var kmInp = document.getElementById('km-' + vid);
if (kmInp && typeof kmInp.focus === 'function') {
kmInp.focus();
if (typeof kmInp.select === 'function') kmInp.select();
}
} catch (e2) {
console.warn('[Medisa] tryOpenDriverKmActionFromQuery focus:', e2);
}
}, 80);
clearDriverActionQuery();
}).catch(function(err) {
console.warn('[Medisa] actions feature:', err);
driverKmActionHandled = false;
});
}

async function loadDashboard() {
setDriverPlateListOpenState(false);
try {
const token = getStoredPortalToken();

if (!token) {
window.location.href = DRIVER_PAGE_BASE + 'index.html';
return;
}

var tokenPayload = decodeDriverTokenPayload(token);
var nowTs = Math.floor(Date.now() / 1000);
if (!tokenPayload || !tokenPayload.exp || Number(tokenPayload.exp) < nowTs) {
clearStoredPortalTokens();
window.location.href = DRIVER_PAGE_BASE + 'index.html';
return;
}

currentToken = token;

var tokenAccessContext = buildPortalAccessContext(tokenPayload, false, null);
if (tokenAccessContext.passwordChangeRequired === true && document.body) {
document.body.classList.add('password-change-gate-active');
}

var currentSession = await fetchCurrentPortalSession(token);
if (!currentSession) {
clearStoredPortalTokens();
window.location.href = DRIVER_PAGE_BASE + 'index.html';
return;
}

var accessContext = buildPortalAccessContext(tokenPayload, false, currentSession);
if (accessContext.passwordChangeRequired === true) {
if (document.body) document.body.classList.add('password-change-gate-active');
currentUser = currentSession.user || null;
syncDriverHeaderUserName();
const mandatorySpinner = document.getElementById('loading-spinner');
if (mandatorySpinner) mandatorySpinner.style.display = 'none';
try {
const passwordFeature = await runtime.loadFeature('password');
if (!passwordFeature || typeof passwordFeature.openMandatoryDriverPasswordChange !== 'function') {
throw new Error('Zorunlu parola özelliği hazır değil.');
}
passwordFeature.openMandatoryDriverPasswordChange();
} catch (featureError) {
console.error('Zorunlu parola ekranı yükleme hatası:', featureError);
alert('Zorunlu parola ekranı yüklenemedi. İnternet bağlantınızı kontrol edip sayfayı yenileyin.');
}
return;
}

if (document.body) document.body.classList.remove('password-change-gate-active');
if (!canOpenDriverDashboard(accessContext)) {
window.location.href = MAIN_APP_URL;
return;
}
syncDashboardHomeLinkVisibility(accessContext);

const response = await fetch(API_BASE + 'driver_data.php?_=' + Date.now(), {
headers: { 'Authorization': 'Bearer ' + token },
cache: 'no-store'
});
var data;
try {
var text = await response.text();
data = text ? JSON.parse(text) : {};
} catch (parseErr) {
console.error('Veri yükleme hatası (JSON parse):', parseErr);
throw new Error('Sunucu yanıtı işlenemedi.');
}
if (!data || typeof data !== 'object') data = {};
if (!Array.isArray(data.vehicles)) data.vehicles = [];
if (!Array.isArray(data.records)) data.records = [];

if (!data.success) {
const spinner = document.getElementById('loading-spinner');
if (spinner) spinner.style.display = 'none';
if (response.status === 403) {
window.location.href = MAIN_APP_URL;
return;
}
alert('Oturum süresi doldu! Lütfen tekrar giriş yapın.');
logout();
return;
}

currentUser = data.user;
syncDriverHeaderUserName();
allHistoryRecords = data.records || [];
allHistoryVehicles = data.vehicles || [];
driverHistoryLoaded = false;
driverHistoryPromise = null;
currentPeriod = data.current_period || '';

const spinnerEl = document.getElementById('loading-spinner');
if (spinnerEl) spinnerEl.style.display = 'none';

if (!data.vehicles || data.vehicles.length === 0) {
const emptyEl = document.getElementById('empty-state');
if (emptyEl) emptyEl.style.display = 'block';
return;
}

const twoPanel = document.getElementById('driver-two-panel');
if (!twoPanel) return;
twoPanel.style.display = 'flex';
const emptyStateEl = document.getElementById('empty-state');
if (emptyStateEl) emptyStateEl.style.display = 'none';
const vehicles = data.vehicles;
const records = data.records;
selectedVehicleId = selectedVehicleId || (vehicles[0] != null && vehicles[0].id != null ? String(vehicles[0].id) : null);
if (!getSelectedVehicle() && vehicles && vehicles.length && vehicles[0] != null) {
selectedVehicleId = String(vehicles[0].id);
}

renderLeftPanel(vehicles, records);
renderRightPanel(vehicles, records);
renderSlidingWarning(vehicles, records);

var actionArea = document.getElementById('driver-action-area');
if (actionArea) actionArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

if (vehicles.length > 1) {
const trigger = document.getElementById('driver-plate-trigger');
if (trigger) trigger.style.display = '';
setupPlateDropdown(vehicles);
}

tryOpenDriverFeedbackPrefillFromQuery();

setupEkstraNotAutoResize();
setupKmInputs();
tryOpenDriverKmActionFromQuery();
bindDriverDashboardTitleCase(document.getElementById('driver-action-area'));

placePwaWrapper();

} catch (error) {
console.error('Veri yükleme hatası:', error);
const spinner = document.getElementById('loading-spinner');
const emptyEl = document.getElementById('empty-state');
if (spinner) spinner.style.display = 'none';
if (emptyEl) {
emptyEl.style.display = 'block';
const h3 = emptyEl.querySelector('h3');
const p = emptyEl.querySelector('p');
if (h3) h3.textContent = 'Yükleme Hatası';
if (p) p.textContent = 'Veriler yüklenemedi! Lütfen sayfayı yenileyin.';
const icon = emptyEl.querySelector('.driver-empty-icon');
if (icon) icon.textContent = '🚗';
}
} finally {
notifyDriverSplashReady();
}
}

function getSelectedVehicle() {
return allHistoryVehicles.find(v => String(v.id) === String(selectedVehicleId));
}

function getVehicleVersionForRequest(vehicleId) {
var vehicle = allHistoryVehicles && allHistoryVehicles.find(function(v) { return String(v.id) === String(vehicleId); });
var version = vehicle && vehicle.version != null ? Number(vehicle.version) : 1;
return Number.isFinite(version) && version > 0 ? version : 1;
}

function applyVehicleVersionUpdate(vehicleId, nextVersion) {
if (!allHistoryVehicles || nextVersion == null) return;
var normalizedVersion = Number(nextVersion);
if (!Number.isFinite(normalizedVersion) || normalizedVersion <= 0) return;
allHistoryVehicles.forEach(function(vehicle) {
if (String(vehicle && vehicle.id) === String(vehicleId)) {
vehicle.version = normalizedVersion;
}
});
}

async function handleDriverConflictResponse(result, fallbackMessage) {
if (!result || result.conflict !== true) return false;
alert(result.message || fallbackMessage || 'Veri başka biri tarafından güncellendi. Güncel veriler yüklendi.');
await loadDashboard();
return true;
}

function getExistingRecord(vehicleId) {
const period = (currentPeriod || '').toString().trim();
const matches = (allHistoryRecords || []).filter(r =>
String(r.arac_id) === String(vehicleId) && String(r.donem || '').trim() === period
);
if (matches.length === 0) return null;
matches.sort((a, b) => (b.guncelleme_tarihi || b.kayit_tarihi || '').localeCompare(a.guncelleme_tarihi || a.kayit_tarihi || ''));
return matches[0];
}

function getVehicleKmState(vehicle) {
if (!vehicle || typeof vehicle !== 'object') return 'OK';
const state = String(vehicle.km_state || '').trim();
return state || 'OK';
}

function isKmStateWarning(state) {
return state === 'FIRST_ENTRY_REQUIRED' || state === 'MONTHLY_UPDATE_DUE_SOFT' || state === 'MONTHLY_UPDATE_DUE_HARD';
}

function getKmInfoClassByState(state) {
if (state === 'MONTHLY_UPDATE_DUE_SOFT') return 'driver-warn-orange';
if (state === 'FIRST_ENTRY_REQUIRED' || state === 'MONTHLY_UPDATE_DUE_HARD') return 'driver-warn-red';
return '';
}

function getKmMessageByState(state) {
if (state === 'MONTHLY_UPDATE_DUE_SOFT') return 'Kilometre bilgisi güncellensin';
if (state === 'FIRST_ENTRY_REQUIRED' || state === 'MONTHLY_UPDATE_DUE_HARD') return 'Kilometre Bilgisi Girin';
return '';
}

function checkDateWarningsDriver(dateStr) {
if (!dateStr) return { class: '', days: null, level: '' };
var date = new Date(dateStr + 'T00:00:00');
if (isNaN(date.getTime())) return { class: '', days: null, level: '' };
var today = new Date();
today.setHours(0, 0, 0, 0);
date.setHours(0, 0, 0, 0);
var diffDays = Math.ceil((date - today) / (1000 * 60 * 60 * 24));
if (diffDays < 0) return { class: 'driver-warn-red', days: diffDays, level: 'red' };
if (diffDays <= 3) return { class: 'driver-warn-red', days: diffDays, level: 'red' };
if (diffDays <= 21) return { class: 'driver-warn-orange', days: diffDays, level: 'orange' };
return { class: '', days: diffDays, level: '' };
}

function getDriverVehicleWarningLevel(vehicle) {
if (!vehicle || typeof vehicle !== 'object') return '';
const kmState = getVehicleKmState(vehicle);
if (kmState === 'FIRST_ENTRY_REQUIRED' || kmState === 'MONTHLY_UPDATE_DUE_HARD') return 'red';
let level = kmState === 'MONTHLY_UPDATE_DUE_SOFT' ? 'orange' : '';
[vehicle.sigortaDate, vehicle.kaskoDate, vehicle.muayeneDate, vehicle.egzozMuayeneDate].forEach(function(dateStr) {
const w = checkDateWarningsDriver(dateStr);
if (w.level === 'red') level = 'red';
else if (w.level === 'orange' && level !== 'red') level = 'orange';
});
if (driverVehicleNeedsTakograf(vehicle)) {
const takografW = checkDateWarningsDriver(vehicle.takografExpiryDate);
if (takografW.level === 'red') level = 'red';
else if (takografW.level === 'orange' && level !== 'red') level = 'orange';
}
if (driverVehicleNeedsK2(vehicle)) {
const k2W = checkDateWarningsDriver(vehicle.k2BelgesiExpiryDate);
if (k2W.level === 'red') level = 'red';
else if (k2W.level === 'orange' && level !== 'red') level = 'orange';
}
return level;
}

function formatDriverBrandModel(raw) {
const formatter = typeof window.formatBrandModel === 'function'
? window.formatBrandModel
: (typeof window.toTitleCase === 'function' ? window.toTitleCase : function(x) { return x; });
return formatter(raw || '') || '';
}

function syncDriverHeaderUserName() {
const nameEl = document.getElementById('main-header-user-name');
if (!nameEl) return;
const displayName = (currentUser && String(currentUser.name || currentUser.isim || currentUser.ad_soyad || '').trim()) || '';
nameEl.textContent = displayName;
nameEl.classList.toggle('is-empty', displayName === '');
}

function renderLeftPanel(vehicles, records) {
const vehicle = getSelectedVehicle();
if (!vehicle) return;

const plakaEl = document.getElementById('driver-current-plaka');
if (plakaEl) plakaEl.textContent = formatDriverPlaka(vehicle.plaka);
const subtitleEl = document.getElementById('driver-plate-subtitle');
if (subtitleEl) subtitleEl.textContent = formatDriverBrandModel(vehicle.brandModel || [vehicle.marka, vehicle.model].filter(Boolean).join(' ') || '');

const existingRecord = getExistingRecord(vehicle.id);
const kmVal = vehicle.guncelKm || (existingRecord && existingRecord.guncel_km) || '-';
const kmFormatted = (kmVal !== '-' && kmVal != null) ? String(kmVal).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '-';
const kmState = getVehicleKmState(vehicle);
const kmClass = getKmInfoClassByState(kmState);

const sigortaW = checkDateWarningsDriver(vehicle.sigortaDate);
const kaskoW = checkDateWarningsDriver(vehicle.kaskoDate);
const muayeneW = checkDateWarningsDriver(vehicle.muayeneDate);
const egzozMuayeneDate = vehicle.egzozMuayeneDate || '';
const hasEgzozMuayeneSaved = !!(egzozMuayeneDate && String(egzozMuayeneDate).trim());
const egzozW = checkDateWarningsDriver(hasEgzozMuayeneSaved ? egzozMuayeneDate : '');
const showTasitKartiInfo = driverVehicleNeedsK2(vehicle);
const showTakografInfo = driverVehicleNeedsTakograf(vehicle);
const tasitKartiDate = (vehicle.k2BelgesiExpiryDate && String(vehicle.k2BelgesiExpiryDate).trim()) ? String(vehicle.k2BelgesiExpiryDate).trim() : '';
const takografDate = (vehicle.takografExpiryDate && String(vehicle.takografExpiryDate).trim())
? String(vehicle.takografExpiryDate).trim()
: ((vehicle.takografKalibrasyonDate && String(vehicle.takografKalibrasyonDate).trim()) ? String(vehicle.takografKalibrasyonDate).trim() : '');
const tasitKartiW = checkDateWarningsDriver(tasitKartiDate);
const takografW = checkDateWarningsDriver(takografDate);

const anahtarLabel = (vehicle.anahtar === 'var')
? ((vehicle.anahtarNerede && String(vehicle.anahtarNerede).trim()) ? window.capitalizeWords(String(vehicle.anahtarNerede).trim()) : 'Var')
: 'Yoktur.';
const lastikLabel = (vehicle.lastikDurumu === 'var')
? ((vehicle.lastikAdres && String(vehicle.lastikAdres).trim()) ? window.capitalizeWords(String(vehicle.lastikAdres).trim()) : 'Var')
: 'Yoktur.';
const uttsLabel = vehicle.uttsTanimlandi ? 'Evet' : 'Hayır';
const sigortaSaved = !!(vehicle.sigortaDate && vehicle.sigortaDate.trim());
const kaskoSaved = !!(vehicle.kaskoDate && vehicle.kaskoDate.trim());
const muayeneSaved = !!(vehicle.muayeneDate && vehicle.muayeneDate.trim());
const uttsSaved = vehicle.uttsTanimlandi === true || vehicle.uttsTanimlandi === false;

const vid = String(vehicle.id);
const sessionMatch = (action) => lastCompletedActionInSession && lastCompletedActionInSession.action === action && String(lastCompletedActionInSession.vehicleId) === vid;
const kmSavedClass = sessionMatch('km') ? 'saved' : '';
const anahtarSavedClass = sessionMatch('anahtar') ? 'saved' : '';
const lastikSavedClass = sessionMatch('lastik') ? 'saved' : '';

const infoEl = document.getElementById('driver-vehicle-info');
if (infoEl) {
infoEl.innerHTML = `
<div class="driver-info-item"><span class="label">Üretim Yılı</span><span class="value">${escapeHtmlDriver(vehicle.year || '-')}</span></div>
<div class="driver-info-item ${kmSavedClass} ${kmClass}"><span class="label">KM</span><span class="value">${escapeHtmlDriver(kmFormatted)}</span></div>
<div class="driver-info-item ${sigortaW.class}"><span class="label">Sigorta Bitiş</span><span class="value">${formatDriverDate(vehicle.sigortaDate) || '-'}</span></div>
<div class="driver-info-item ${kaskoW.class}"><span class="label">Kasko Bitiş</span><span class="value">${formatDriverDate(vehicle.kaskoDate) || '-'}</span></div>
<div class="driver-info-item ${muayeneW.class}"><span class="label">Muayene Bitiş</span><span class="value">${formatDriverDate(vehicle.muayeneDate) || '-'}</span></div>
${hasEgzozMuayeneSaved ? `<div class="driver-info-item ${egzozW.class}"><span class="label">Egzoz Muayene Bitiş</span><span class="value">${formatDriverDate(egzozMuayeneDate) || '-'}</span></div>` : ''}
${showTasitKartiInfo ? `<div class="driver-info-item ${tasitKartiW.class}"><span class="label">Taşıt Kartı Bitiş</span><span class="value">${renderDriverRequiredExpiryValue(tasitKartiDate)}</span></div>` : ''}
${showTakografInfo ? `<div class="driver-info-item ${takografW.class}"><span class="label">Takograf Kalibrasyon Bitiş</span><span class="value">${renderDriverRequiredExpiryValue(takografDate)}</span></div>` : ''}
<div class="driver-info-item ${anahtarSavedClass}"><span class="label">Yedek Anahtar</span><span class="value">${escapeHtmlDriver(anahtarLabel)}</span></div>
<div class="driver-info-item ${lastikSavedClass}"><span class="label">Lastik Durumu</span><span class="value">${escapeHtmlDriver(lastikLabel)}</span></div>
<div class="driver-info-item"><span class="label">UTTS</span><span class="value">${escapeHtmlDriver(uttsLabel)}</span></div>
`;
infoEl.querySelectorAll('.driver-info-item .value').forEach(function(valueEl) {
if (valueEl.querySelector('.driver-info-missing-value')) return;
var txt = (valueEl.textContent || '').trim();
if (txt !== '-') return;
valueEl.classList.add('driver-value-pending');
valueEl.innerHTML = '<span class="driver-pending-indicator" title="Bekleniyor" aria-label="Bekleniyor"></span>';
});
}

const dashboardContainer = document.querySelector('.driver-dashboard-container');
if (dashboardContainer) {
dashboardContainer.classList.toggle('driver-heavy-commercial-active', driverVehicleIsHeavyCommercial(vehicle));
}
}

function formatKm(value) {
if (value == null || value === '') return '';
var numStr = String(value).replace(/[^\d]/g, '');
if (!numStr) return '';
return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function escapeHtmlDriver(t) {
if (t == null || t === '') return '';
var d = document.createElement('div');
d.textContent = t;
return d.innerHTML;
}

var _plateCloseBound = false;

function setDriverPlateListOpenState(isOpen) {
if (!document.body) return;
document.body.classList.toggle('driver-plate-list-open', !!isOpen && document.body.classList.contains('dashboard-page'));
}

function setDriverPlateDropdownVisibility(dropdown, isOpen) {
if (!dropdown) return;
dropdown.style.display = isOpen ? 'block' : 'none';
setDriverPlateListOpenState(!!isOpen);
}

function positionPlateDropdownToTrigger(dropdown, trigger) {
if (!dropdown || !trigger) return;
const row = trigger.closest('.driver-plate-dropdown-row');
if (!row) return;

if (window.innerWidth <= 640) {
const rowRect = row.getBoundingClientRect();
const viewportPadding = 8;
const desiredWidth = Math.floor(window.innerWidth * 0.8);
const availableRightWidth = Math.floor(window.innerWidth - rowRect.left - viewportPadding);
const targetWidth = Math.max(180, Math.min(desiredWidth, availableRightWidth));
dropdown.style.setProperty('position', 'fixed', 'important');
dropdown.style.setProperty('top', `${Math.round(rowRect.bottom + 2)}px`, 'important');
dropdown.style.setProperty('left', `${Math.round(rowRect.left)}px`, 'important');
dropdown.style.setProperty('right', 'auto', 'important');
dropdown.style.setProperty('transform', 'none', 'important');
dropdown.style.setProperty('width', `${targetWidth}px`, 'important');
dropdown.style.setProperty('max-width', `${targetWidth}px`, 'important');
} else {
const rowRect = row.getBoundingClientRect();
const dashboard = document.querySelector('.driver-dashboard-container');
const dashboardRect = dashboard ? dashboard.getBoundingClientRect() : null;
const viewportPadding = 16;
const containerPadding = 12;
const viewportMaxWidth = Math.max(220, Math.floor(window.innerWidth - (viewportPadding * 2)));
const containerMaxWidth = dashboardRect
? Math.max(220, Math.floor(dashboardRect.width - (containerPadding * 2)))
: viewportMaxWidth;
const halfContainerWidth = Math.max(220, Math.floor(containerMaxWidth * 0.5));
const targetWidth = Math.min(420, viewportMaxWidth, containerMaxWidth, halfContainerWidth);
const minLeft = dashboardRect ? Math.round(dashboardRect.left + containerPadding) : viewportPadding;
const maxLeft = dashboardRect
? Math.round(dashboardRect.right - targetWidth - containerPadding)
: Math.round(window.innerWidth - targetWidth - viewportPadding);
const targetLeft = Math.max(minLeft, Math.min(Math.round(rowRect.left), maxLeft));

dropdown.style.setProperty('position', 'fixed', 'important');
dropdown.style.setProperty('top', `${Math.round(rowRect.bottom + 4)}px`, 'important');
dropdown.style.setProperty('left', `${targetLeft}px`, 'important');
dropdown.style.setProperty('right', 'auto', 'important');
dropdown.style.setProperty('transform', 'none', 'important');
dropdown.style.setProperty('width', `${targetWidth}px`, 'important');
dropdown.style.setProperty('max-width', `${targetWidth}px`, 'important');
}
}

function setupPlateDropdown(vehicles) {
const dropdown = document.getElementById('driver-plate-dropdown');
const currentPlakaEl = document.getElementById('driver-current-plaka');
const trigger = document.getElementById('driver-plate-trigger');
if (!dropdown || !currentPlakaEl || !trigger) return;

if (!_plateCloseBound) {
_plateCloseBound = true;
document.addEventListener('click', function(ev) {
if (!ev.target.closest('.driver-plate-dropdown-row')) {
const d = document.getElementById('driver-plate-dropdown');
if (d) setDriverPlateDropdownVisibility(d, false);
}
});
}

dropdown.innerHTML = vehicles.map(v => {
const raw = v.brandModel || [v.marka, v.model].filter(Boolean).join(' ');
const brandModel = formatDriverBrandModel(raw || '');
const plate = escapeHtmlDriver(formatDriverPlaka(v.plaka));
const brandModelHtml = escapeHtmlDriver(brandModel);
const hasBrandModel = !!brandModel;
const warningLevel = getDriverVehicleWarningLevel(v);
const warningClass = warningLevel ? (' driver-plate-warning-dot-' + warningLevel) : '';
return `
<div class="driver-plate-dropdown-item medisa-boxed-select-option" role="option" data-vehicle-id="${v.id}" tabindex="0">
<span class="driver-plate-warning-dot${warningClass}" aria-hidden="true"></span>
<span class="driver-plate-dropdown-item-plate">${plate}</span>
<span class="driver-plate-dropdown-item-separator${hasBrandModel ? '' : ' is-hidden'}" aria-hidden="true">-</span>
<span class="driver-plate-dropdown-item-brand">${brandModelHtml}</span>
</div>`;
}).join('');

dropdown.querySelectorAll('.driver-plate-dropdown-item').forEach(item => {
item.addEventListener('click', function(ev) {
ev.preventDefault();
ev.stopPropagation();
const vid = this.getAttribute('data-vehicle-id');
if (vid == null || vid === '') return;
setDriverPlateDropdownVisibility(dropdown, false);
if (!switchDriverDashboardVehicle(vid)) {
loadDashboard();
}
});
});

trigger.onclick = function(ev) {
ev.stopPropagation();
const isOpen = dropdown.style.display === 'block';
setDriverPlateDropdownVisibility(dropdown, !isOpen);
if (!isOpen) positionPlateDropdownToTrigger(dropdown, trigger);
};
}

function renderRightPanel(vehicles, records) {
const vehicle = getSelectedVehicle();
if (!vehicle) return;

const areaEl = document.getElementById('driver-action-area');
if (!areaEl) return;

const vid = String(vehicle.id);
const existingRecord = getExistingRecord(vehicle.id);
const bakimVar = existingRecord && (existingRecord.bakim_durumu || (existingRecord.bakim_aciklama || '').trim());
const kazaVar = existingRecord && (existingRecord.kaza_durumu || (existingRecord.kaza_aciklama || '').trim());
const kmState = getVehicleKmState(vehicle);
const hasKmSaved = !isKmStateWarning(kmState);
const sigortaW = checkDateWarningsDriver(vehicle.sigortaDate);
const kaskoW = checkDateWarningsDriver(vehicle.kaskoDate);
const muayeneW = checkDateWarningsDriver(vehicle.muayeneDate);
const sigortaSaved = !!(vehicle.sigortaDate && vehicle.sigortaDate.trim());
const kaskoSaved = !!(vehicle.kaskoDate && vehicle.kaskoDate.trim());
const muayeneSaved = !!(vehicle.muayeneDate && vehicle.muayeneDate.trim());
const anahtarSaved = !!(vehicle.anahtar && String(vehicle.anahtar).trim());
const lastikSaved = !!(vehicle.lastikDurumu && String(vehicle.lastikDurumu).trim());
const sessionMatch = (action) => lastCompletedActionInSession && lastCompletedActionInSession.action === action && String(lastCompletedActionInSession.vehicleId) === vid;
const kmBtnClass = sessionMatch('km') ? ' saved' : (isKmStateWarning(kmState) ? ' warning' : (hasKmSaved ? ' data-entered' : ''));
const kazaBtnClass = sessionMatch('kaza') ? ' saved' : (kazaVar ? ' data-entered' : '');
const bakimBtnClass = sessionMatch('bakim') ? ' saved' : (bakimVar ? ' data-entered' : '');
const sigortaBtnClass = sessionMatch('sigorta') ? ' saved' : (sigortaW.class ? (' warning' + (sigortaW.level === 'orange' ? ' warning-orange' : '')) : (sigortaSaved ? ' data-entered' : ''));
const kaskoBtnClass = sessionMatch('kasko') ? ' saved' : (kaskoW.class ? (' warning' + (kaskoW.level === 'orange' ? ' warning-orange' : '')) : (kaskoSaved ? ' data-entered' : ''));
const muayeneBtnClass = sessionMatch('muayene') ? ' saved' : (muayeneW.class ? (' warning' + (muayeneW.level === 'orange' ? ' warning-orange' : '')) : (muayeneSaved ? ' data-entered' : ''));
const anahtarBtnClass = sessionMatch('anahtar') ? ' saved' : (anahtarSaved ? ' data-entered' : '');
const lastikBtnClass = sessionMatch('lastik') ? ' saved' : (lastikSaved ? ' data-entered' : '');

areaEl.innerHTML = buildDriverActionArea(vehicle, existingRecord, bakimVar, kazaVar, {
kmBtnClass, kazaBtnClass, bakimBtnClass, sigortaBtnClass, kaskoBtnClass, muayeneBtnClass, anahtarBtnClass, lastikBtnClass, vid
});
initDriverDateDisplays(areaEl);
}

function buildDriverActionArea(vehicle, existingRecord, bakimVar, kazaVar, opts) {
const vid = String(opts.vid != null ? opts.vid : (vehicle && vehicle.id != null ? vehicle.id : ''));
const today = new Date().toISOString().split('T')[0];
const esc = (s) => (s == null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'));
var boyaliJson = '{}';
try {
var bp = vehicle && (vehicle.boyaliParcalar || {});
if (bp && typeof bp === 'object' && !Array.isArray(bp)) boyaliJson = JSON.stringify(bp);
} catch (e) { boyaliJson = '{}'; }

const lastKm = vehicle && (vehicle.guncelKm != null ? vehicle.guncelKm : (existingRecord && existingRecord.guncel_km != null ? existingRecord.guncel_km : ''));
const kmVal = (lastKm !== '' && lastKm != null) ? esc(formatKm(lastKm)) : '';
const bakimTarih = existingRecord && existingRecord.bakim_tarih ? existingRecord.bakim_tarih : today;
const kazaTarih = existingRecord && existingRecord.kaza_tarih ? existingRecord.kaza_tarih : today;
const bakimAciklama = existingRecord ? esc(window.capitalizeWords(existingRecord.bakim_aciklama || '')) : '';
const kazaAciklama = existingRecord ? esc(window.capitalizeWords(existingRecord.kaza_aciklama || '')) : '';
const kmBtnClass = opts.kmBtnClass || '';
const kazaBtnClass = opts.kazaBtnClass || '';
const bakimBtnClass = opts.bakimBtnClass || '';
const sigortaBtnClass = opts.sigortaBtnClass || '';
const kaskoBtnClass = opts.kaskoBtnClass || '';
const muayeneBtnClass = opts.muayeneBtnClass || '';
const anahtarBtnClass = opts.anahtarBtnClass || '';
const lastikBtnClass = opts.lastikBtnClass || '';
return `
<div class="driver-action-area-inner" data-vehicle-id="${vid}">
<div class="driver-action-group">
<button type="button" class="driver-action-btn${kmBtnClass}" data-action="km" onclick="toggleDriverActionBlock('km','${vid}')">Km Bildir</button>
<div id="km-block-${vid}" class="driver-input-form driver-km-form-wrap driver-action-block">
<div class="driver-km-form-content">
<div class="form-group driver-km-form">
<label for="km-${vid}">Güncel KM</label>
<div class="driver-km-input-wrap">
<span class="driver-km-fake-placeholder" id="km-placeholder-${vid}">Örn: 45.230</span>
<input type="text" id="km-${vid}" class="driver-km-input" inputmode="numeric" pattern="[0-9]*" maxlength="8" data-vehicle-id="${vid}" value="${kmVal}" required autocomplete="off" aria-label="Güncel kilometre" onfocus="this.select()">
</div>
</div>
<div class="universal-btn-group">
<button type="button" class="universal-btn-save" onclick="submitKmOnly('${vid}')">Bildir</button>
<button type="button" class="universal-btn-cancel" onclick="cancelKmForm('${vid}')">Vazgeç</button>
</div>
</div>
<div class="driver-km-success-msg" id="km-success-${vid}">Bildirildi</div>
<div class="driver-km-error" id="km-error-${vid}"></div>
</div>
</div>
<div class="driver-action-group">
<button type="button" class="driver-action-btn${kazaBtnClass}" data-action="kaza" onclick="toggleDriverActionBlock('kaza','${vid}')">Kaza Bildir</button>
<div id="kaza-block-${vid}" class="driver-report-block driver-report-block-kaza driver-action-block">
<div class="form-group"><label for="kaza-tarih-${vid}">Kaza Tarihi</label><div class="driver-date-wrap"><input type="date" id="kaza-tarih-${vid}" class="driver-kaza-input" value="${kazaTarih}"></div></div>
<div class="form-group"><label for="kaza-detay-${vid}">Açıklama</label><textarea id="kaza-detay-${vid}" class="driver-report-textarea-auto driver-kaza-textarea" rows="1" placeholder="Kaza açıklamasını yazın..." maxlength="500">${kazaAciklama}</textarea></div>
<div class="form-group"><label for="kaza-tutar-${vid}">Hasar Tutarı (TL)</label><input type="text" id="kaza-tutar-${vid}" class="driver-kaza-input" placeholder="5.000" inputmode="numeric"></div>
<div class="form-group" role="group" aria-labelledby="kaza-kaporta-label-${vid}"><span id="kaza-kaporta-label-${vid}" class="driver-kaporta-label">Varsa Boyanan/ Değişen Parçaları İşaretleyin</span><div id="kaza-kaporta-${vid}" class="driver-kaporta-container" data-vehicle-id="${vid}" data-boyali-parcalar='${boyaliJson}'></div></div>
<div class="universal-btn-group">
<button type="button" class="universal-btn-save" onclick="submitDriverAction('kaza','${vid}')">Bildir</button>
<button type="button" class="universal-btn-cancel" onclick="cancelDriverActionForm('kaza','${vid}')">Vazgeç</button>
</div>
<div class="driver-success-msg" id="kaza-success-${vid}">Bildirildi</div>
</div>
</div>
<div class="driver-action-group">
<button type="button" class="driver-action-btn${bakimBtnClass}" data-action="bakim" onclick="toggleDriverActionBlock('bakim','${vid}')">Bakım Bildir</button>
<div id="bakim-block-${vid}" class="driver-report-block driver-report-block-bakim driver-action-block">
<div class="form-group"><label for="bakim-tarih-${vid}">Bakım Tarihi</label><div class="driver-date-wrap"><input type="date" id="bakim-tarih-${vid}" class="driver-bakim-input" value="${bakimTarih}"></div></div>
<div class="form-group"><label for="bakim-servis-${vid}">İşlemi Yapan Servis</label><input type="text" id="bakim-servis-${vid}" class="driver-bakim-input" placeholder="Servis Adı"></div>
<div class="form-group"><label for="bakim-km-${vid}">Bakım Km</label><input type="text" id="bakim-km-${vid}" class="driver-bakim-input" placeholder="50.000" inputmode="numeric"></div>
<div class="form-group"><label for="bakim-tutar-${vid}">Tutar (TL)</label><input type="text" id="bakim-tutar-${vid}" class="driver-bakim-input" placeholder="2.500" inputmode="numeric"></div>
<div class="form-group"><label for="bakim-detay-${vid}">Yapılan İşlem/İşlemler</label><textarea id="bakim-detay-${vid}" class="driver-report-textarea-auto driver-bakim-textarea" rows="1" placeholder="Yapılan işlemleri yazın..." maxlength="500">${bakimAciklama}</textarea></div>
<div class="universal-btn-group">
<button type="button" class="universal-btn-save" onclick="submitDriverAction('bakim','${vid}')">Bildir</button>
<button type="button" class="universal-btn-cancel" onclick="cancelDriverActionForm('bakim','${vid}')">Vazgeç</button>
</div>
<div class="driver-success-msg" id="bakim-success-${vid}">Bildirildi</div>
</div>
</div>
<div class="driver-action-group">
<button type="button" class="driver-action-btn${sigortaBtnClass}" data-action="sigorta" onclick="toggleDriverActionBlock('sigorta','${vid}')">Trafik Sigortası Yenileme</button>
<div id="sigorta-block-${vid}" class="driver-report-block driver-report-block-sigorta driver-action-block">
<div class="form-group"><label for="driver-sigorta-tarih-${vid}">Yenileme / Başlangıç Tarihi</label><div class="driver-date-wrap"><input type="date" id="driver-sigorta-tarih-${vid}" class="form-input" style="width:100%"></div></div>
<div class="form-group"><label for="driver-sigorta-firma-${vid}">Firma (isteğe bağlı)</label><input type="text" id="driver-sigorta-firma-${vid}" class="form-input" placeholder="Sigorta Firması" style="width:100%"></div>
<div class="form-group"><label for="driver-sigorta-acente-${vid}">Acente (isteğe bağlı)</label><input type="text" id="driver-sigorta-acente-${vid}" class="form-input" placeholder="Acente Adı" style="width:100%"></div>
<div class="form-group"><label for="driver-sigorta-iletisim-${vid}">İletişim (isteğe bağlı)</label><input type="text" id="driver-sigorta-iletisim-${vid}" class="form-input" placeholder="Telefon / E-posta" inputmode="tel" style="width:100%"></div>
<div class="universal-btn-group">
<button type="button" class="universal-btn-save" onclick="saveDriverEventFromBlock('sigorta','${vid}')">Bildir</button>
<button type="button" class="universal-btn-cancel" onclick="cancelDriverActionForm('sigorta','${vid}')">Vazgeç</button>
</div>
</div>
</div>
<div class="driver-action-group">
<button type="button" class="driver-action-btn${kaskoBtnClass}" data-action="kasko" onclick="toggleDriverActionBlock('kasko','${vid}')">Kasko Yenileme</button>
<div id="kasko-block-${vid}" class="driver-report-block driver-report-block-kasko driver-action-block">
<div class="form-group"><label for="driver-kasko-tarih-${vid}">Yenileme / Başlangıç Tarihi</label><div class="driver-date-wrap"><input type="date" id="driver-kasko-tarih-${vid}" class="form-input" style="width:100%"></div></div>
<div class="form-group"><label for="driver-kasko-firma-${vid}">Firma (isteğe bağlı)</label><input type="text" id="driver-kasko-firma-${vid}" class="form-input" placeholder="Kasko Firması" style="width:100%"></div>
<div class="form-group"><label for="driver-kasko-acente-${vid}">Acente (isteğe bağlı)</label><input type="text" id="driver-kasko-acente-${vid}" class="form-input" placeholder="Acente Adı" style="width:100%"></div>
<div class="form-group"><label for="driver-kasko-iletisim-${vid}">İletişim (isteğe bağlı)</label><input type="text" id="driver-kasko-iletisim-${vid}" class="form-input" placeholder="Telefon / E-posta" inputmode="tel" style="width:100%"></div>
<div class="universal-btn-group">
<button type="button" class="universal-btn-save" onclick="saveDriverEventFromBlock('kasko','${vid}')">Bildir</button>
<button type="button" class="universal-btn-cancel" onclick="cancelDriverActionForm('kasko','${vid}')">Vazgeç</button>
</div>
</div>
</div>
<div class="driver-action-group">
<button type="button" class="driver-action-btn${muayeneBtnClass}" data-action="muayene" onclick="toggleDriverActionBlock('muayene','${vid}')">Muayene Yenileme</button>
<div id="muayene-block-${vid}" class="driver-report-block driver-report-block-muayene driver-action-block">
<div class="form-group"><label for="driver-muayene-tarih-${vid}">Muayene Tarihi</label><div class="driver-date-wrap"><input type="date" id="driver-muayene-tarih-${vid}" class="form-input" style="width:100%"></div></div>
<label class="driver-egzoz-muayene-check" for="driver-muayene-egzoz-different-${vid}">
<input type="checkbox" id="driver-muayene-egzoz-different-${vid}" onchange="syncDriverEgzozMuayeneFields('${vid}')">
<span>Egzoz Muayenesi Farklı Tarih İse İşaretleyin..</span>
</label>
<div id="driver-muayene-egzoz-date-wrap-${vid}" class="form-group driver-egzoz-date-wrap">
<label for="driver-muayene-egzoz-tarih-${vid}">Egzoz Muayene Tarihi</label>
<div class="driver-date-wrap"><input type="date" id="driver-muayene-egzoz-tarih-${vid}" class="form-input" style="width:100%" disabled></div>
</div>
<div class="universal-btn-group">
<button type="button" class="universal-btn-save" onclick="saveDriverEventFromBlock('muayene','${vid}')">Bildir</button>
<button type="button" class="universal-btn-cancel" onclick="cancelDriverActionForm('muayene','${vid}')">Vazgeç</button>
</div>
</div>
</div>
<div class="driver-action-group">
<button type="button" class="driver-action-btn${anahtarBtnClass}" data-action="anahtar" onclick="toggleDriverActionBlock('anahtar','${vid}')">Anahtar Durumu Bildir</button>
<div id="anahtar-block-${vid}" class="driver-report-block driver-report-block-anahtar driver-action-block">
<div class="form-group driver-radio-row" role="group" aria-labelledby="anahtar-durum-label-${vid}">
<span id="anahtar-durum-label-${vid}" class="driver-radio-label driver-radio-label-multiline">Yedek Anahtar</span>
<div class="driver-radio-group" data-group="anahtar" data-vid="${vid}">
<button type="button" class="driver-radio-btn" data-value="var" data-group="anahtar">Var</button>
<button type="button" class="driver-radio-btn" data-value="yok" data-group="anahtar">Yok</button>
</div>
</div>
<div id="driver-anahtar-detay-wrap-${vid}" class="form-group" style="display:none">
<label for="driver-anahtar-detay-${vid}" style="color:#ccc;font-size:15px;">Açıklama:</label>
<input type="text" id="driver-anahtar-detay-${vid}" class="form-input" placeholder="Anahtar nerede?" style="width:100%">
</div>
<div class="universal-btn-group">
<button type="button" class="universal-btn-save" onclick="saveDriverEventFromBlock('anahtar','${vid}')">Bildir</button>
<button type="button" class="universal-btn-cancel" onclick="cancelDriverActionForm('anahtar','${vid}')">Vazgeç</button>
</div>
</div>
</div>
<div class="driver-action-group">
<button type="button" class="driver-action-btn${lastikBtnClass}" data-action="lastik" onclick="toggleDriverActionBlock('lastik','${vid}')">Lastik Durumu Bildir</button>
<div id="lastik-block-${vid}" class="driver-report-block driver-report-block-lastik driver-action-block">
<div class="form-group driver-radio-row" role="group" aria-labelledby="lastik-durum-label-${vid}">
<span id="lastik-durum-label-${vid}" class="driver-radio-label driver-radio-label-multiline">Yazlık/ Kışlık</span>
<div class="driver-radio-group" data-group="lastik" data-vid="${vid}">
<button type="button" class="driver-radio-btn" data-value="var" data-group="lastik">Var</button>
<button type="button" class="driver-radio-btn" data-value="yok" data-group="lastik">Yok</button>
</div>
</div>
<div id="driver-lastik-adres-wrap-${vid}" class="form-group" style="display:none">
<label for="driver-lastik-adres-${vid}" style="color:#ccc;font-size:15px;">Adres:</label>
<input type="text" id="driver-lastik-adres-${vid}" class="form-input" placeholder="Lastik adresi" style="width:100%">
</div>
<div class="universal-btn-group">
<button type="button" class="universal-btn-save" onclick="saveDriverEventFromBlock('lastik','${vid}')">Bildir</button>
<button type="button" class="universal-btn-cancel" onclick="cancelDriverActionForm('lastik','${vid}')">Vazgeç</button>
</div>
</div>
</div>
</div>
`;
}

function buildSlidingWarnings(vehicles, records) {
const warnings = [];
const period = (currentPeriod || new Date().toISOString().slice(0, 7)).toString().trim();
let k2WarningAdded = false;
const userName = (currentUser && (currentUser.name || currentUser.isim || currentUser.ad_soyad)) || 'Kullanıcı';

for (const v of vehicles) {
const vid = String(v.id);
const plaka = formatDriverPlaka(v.plaka);
const hasKmForPeriod = (records || []).some(function(r) {
if (String(r.arac_id) !== vid) return false;
if (String(r.donem || '').trim() !== period) return false;
if (r.guncel_km == null) return false;
const kmText = String(r.guncel_km).trim();
if (kmText === '') return false;
const kmNum = parseInt(kmText.replace(/\D/g, ''), 10);
return Number.isFinite(kmNum) && kmNum > 0;
});
const kmState = hasKmForPeriod ? 'OK' : getVehicleKmState(v);
const kmMessage = getKmMessageByState(kmState);
if (kmMessage) {
const kmWarnLevel = kmState === 'MONTHLY_UPDATE_DUE_SOFT' ? 'orange' : 'red';
warnings.push({ text: plaka + ' Plakalı Taşıt İçin ' + kmMessage, plaka: plaka, vehicleId: vid, action: 'km', type: 'km', warnLevel: kmWarnLevel });
}
const checkDate = (dateStr, label, actionType) => {
if (!dateStr) return;
const w = checkDateWarningsDriver(dateStr);
if (w.class && w.days != null) {
let msg;
if (w.days <= 0) {
const bitmistirLabel = label === 'Sigorta' ? 'Trafik Sigortası' : label;
msg = plaka + ' Plakalı Taşıtın ' + bitmistirLabel + ' Bitmiştir.';
} else {
msg = plaka + ' Plakalı Taşıtın ' + label + ' Tarihine ' + w.days + ' Gün Kalmıştır';
}
warnings.push({ text: msg, plaka: plaka, vehicleId: vid, action: actionType || null, type: actionType || null, warnLevel: w.level, warnClass: w.class, days: w.days });
}
};
checkDate(v.muayeneDate, 'Muayene', 'muayene');
if (v.egzozMuayeneDate && v.egzozMuayeneDate !== v.muayeneDate) {
checkDate(v.egzozMuayeneDate, 'Egzoz Muayenesi', 'muayene');
}
checkDate(v.sigortaDate, 'Sigorta', 'sigorta');
checkDate(v.kaskoDate, 'Kasko', 'kasko');
if (!k2WarningAdded && driverVehicleNeedsK2(v) && v.k2BelgesiExpiryDate) {
const k2Warning = checkDateWarningsDriver(v.k2BelgesiExpiryDate);
if (k2Warning.class && k2Warning.days != null) {
const k2Text = k2Warning.days <= 0
? 'Taşıt Kartı / K2 Belgesi Geçerliliği Bitmiştir.'
: 'Taşıt Kartı / K2 Belgesi Geçerliliğine ' + k2Warning.days + ' Gün Kalmıştır';
warnings.push({ text: k2Text, plaka: '', type: null, warnLevel: k2Warning.level, warnClass: k2Warning.class, days: k2Warning.days });
k2WarningAdded = true;
}
}
if (driverVehicleNeedsTakograf(v)) {
checkDate(v.takografExpiryDate, 'Takograf Kalibrasyon', null);
}
}
return warnings;
}

function getDriverNotificationItemLevel(w) {
if (!w) return 'red';
if (typeof w.days === 'number' && !isNaN(w.days)) {
if (w.days < 0 || w.days <= 7) return 'red';
if (w.days <= 30) return 'orange';
}
if (w.warnClass === 'driver-warn-orange') return 'orange';
if (w.warnClass === 'driver-warn-red') return 'red';
return w.warnLevel === 'orange' ? 'orange' : 'red';
}

const DRIVER_NOTIFICATIONS_DROPDOWN_ID = 'driver-notifications-dropdown';
const DRIVER_NOTIFICATIONS_BACKDROP_ID = 'driver-notifications-backdrop';
const DRIVER_NOTIFICATIONS_LIST_ID = 'driver-notifications-dropdown-list';
const driverNotificationEmptyStateHtml = '<div class="driver-notification-empty">Aktif bildirim bulunmuyor.</div>';
let driverNotificationsResizeHandler = null;

function removeOrphanDriverNotificationsDropdown() {
var orphan = document.getElementById(DRIVER_NOTIFICATIONS_DROPDOWN_ID);
if (orphan && orphan.parentNode && orphan.parentNode.id === 'driver-sliding-warning') orphan.remove();
}

function ensureDriverNotificationsUi() {
removeOrphanDriverNotificationsDropdown();

var backdrop = document.getElementById(DRIVER_NOTIFICATIONS_BACKDROP_ID);
if (!backdrop) {
backdrop = document.createElement('div');
backdrop.id = DRIVER_NOTIFICATIONS_BACKDROP_ID;
backdrop.className = 'driver-notifications-backdrop';
backdrop.setAttribute('aria-hidden', 'true');
backdrop.addEventListener('click', function() {
window.closeDriverNotifications();
});
document.body.appendChild(backdrop);
}

var dropdown = document.getElementById(DRIVER_NOTIFICATIONS_DROPDOWN_ID);
if (!dropdown) {
dropdown = document.createElement('div');
dropdown.id = DRIVER_NOTIFICATIONS_DROPDOWN_ID;
dropdown.className = 'driver-notifications-dropdown';
dropdown.hidden = true;
dropdown.setAttribute('role', 'dialog');
dropdown.setAttribute('aria-label', 'Bildirimler');
dropdown.addEventListener('click', function(ev) {
ev.stopPropagation();
});

var list = document.createElement('div');
list.id = DRIVER_NOTIFICATIONS_LIST_ID;
list.className = 'driver-notifications-dropdown-list';
list.setAttribute('aria-live', 'polite');
dropdown.appendChild(list);
document.body.appendChild(dropdown);
} else if (dropdown.parentNode !== document.body) {
document.body.appendChild(dropdown);
}

return {
backdrop: backdrop,
dropdown: dropdown,
list: document.getElementById(DRIVER_NOTIFICATIONS_LIST_ID)
};
}

function positionDriverNotificationsDropdown(triggerEl) {
var dropdown = document.getElementById(DRIVER_NOTIFICATIONS_DROPDOWN_ID);
if (!dropdown || !triggerEl || typeof triggerEl.getBoundingClientRect !== 'function') return;

var rect = triggerEl.getBoundingClientRect();
var gap = 8;
var pad = 12;
dropdown.style.top = Math.round(rect.bottom + gap) + 'px';
dropdown.style.left = Math.round(rect.left + (rect.width / 2)) + 'px';
dropdown.style.transform = 'translateX(-50%)';

requestAnimationFrame(function() {
if (!dropdown.classList.contains('is-open')) return;
var panelRect = dropdown.getBoundingClientRect();
var viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
if (panelRect.left < pad) {
dropdown.style.left = pad + 'px';
dropdown.style.transform = 'none';
} else if (panelRect.right > viewportWidth - pad) {
dropdown.style.left = Math.round(viewportWidth - pad - panelRect.width) + 'px';
dropdown.style.transform = 'none';
}
});
}

function bindDriverNotificationsGlobalHandlersOnce() {
if (document.body.dataset.driverNotificationsGlobalBound === '1') return;
document.body.dataset.driverNotificationsGlobalBound = '1';

document.addEventListener('keydown', function(ev) {
if (ev.key === 'Escape' && document.body.classList.contains('driver-notifications-open')) {
window.closeDriverNotifications();
}
});
}

function buildDriverNotificationItemHtml(w) {
const level = getDriverNotificationItemLevel(w);
const itemIconClass = level === 'orange' ? 'driver-warning-icon-engine-orange' : 'driver-warning-icon-engine-red';
const text = escapeHtmlDriver((w && w.text) || '');
const icon = '<span class="driver-warning-icon driver-warning-icon-engine ' + itemIconClass + '" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"></svg></span>';
const vehicleId = w && w.vehicleId != null && String(w.vehicleId) !== '' ? String(w.vehicleId) : '';
if (!vehicleId) {
return '<div class="driver-warning-panel-item driver-warning-panel-item-' + level + '">'
+ icon
+ '<span class="driver-warning-panel-text">' + text + '</span>'
+ '</div>';
}
const action = w && w.action ? String(w.action) : '';
const actionAttr = action ? ' data-action="' + escapeHtmlDriver(action) + '"' : '';
return '<button type="button" class="driver-warning-panel-item driver-warning-panel-item-' + level + ' driver-warning-panel-item-action"'
+ ' data-vehicle-id="' + escapeHtmlDriver(vehicleId) + '"' + actionAttr
+ ' aria-label="' + text + '">'
+ icon
+ '<span class="driver-warning-panel-text">' + text + '</span>'
+ '</button>';
}

function switchDriverDashboardVehicle(vehicleId) {
const vid = String(vehicleId);
const sel = allHistoryVehicles.find(function(v) { return String(v.id) === vid; });
if (!sel) return false;
selectedVehicleId = vid;
const plakaEl = document.getElementById('driver-current-plaka');
if (plakaEl) plakaEl.textContent = formatDriverPlaka(sel.plaka);
renderLeftPanel(allHistoryVehicles, allHistoryRecords);
renderRightPanel(allHistoryVehicles, allHistoryRecords);
renderSlidingWarning(allHistoryVehicles, allHistoryRecords);
setupEkstraNotAutoResize();
setupKmInputs();
bindDriverDashboardTitleCase(document.getElementById('driver-action-area'));
return true;
}

function openDriverNotificationAction(vehicleId, action) {
window.closeDriverNotifications();
const vid = String(vehicleId);
const sameVehicle = String(selectedVehicleId) === vid;
if (!sameVehicle && !switchDriverDashboardVehicle(vid)) return;
if (!action) return;
setTimeout(function() {
const inner = document.querySelector('.driver-action-area-inner[data-vehicle-id="' + vid + '"]');
if (!inner) return;
const blockMap = {
km: 'km-block-' + vid,
kaza: 'kaza-block-' + vid,
bakim: 'bakim-block-' + vid,
sigorta: 'sigorta-block-' + vid,
kasko: 'kasko-block-' + vid,
muayene: 'muayene-block-' + vid,
anahtar: 'anahtar-block-' + vid,
lastik: 'lastik-block-' + vid
};
const block = document.getElementById(blockMap[action] || '');
if (!block) return;
if (!block.classList.contains('show')) {
if (typeof window.toggleDriverActionBlock === 'function') {
window.toggleDriverActionBlock(action, vid);
}
return;
}
if (action === 'km') {
const inp = document.getElementById('km-' + vid);
if (inp && typeof inp.focus === 'function') {
inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
inp.focus();
if (typeof inp.select === 'function') inp.select();
}
} else {
const group = block.closest('.driver-action-group');
(group || block).scrollIntoView({ behavior: 'smooth', block: 'start' });
}
}, sameVehicle ? 0 : 80);
}

function bindDriverNotificationItemClicks() {
const list = document.getElementById(DRIVER_NOTIFICATIONS_LIST_ID);
if (!list) return;
list.querySelectorAll('.driver-warning-panel-item-action[data-vehicle-id]').forEach(function(item) {
if (item.dataset.driverNotificationBound === '1') return;
item.dataset.driverNotificationBound = '1';
item.addEventListener('click', function(ev) {
ev.preventDefault();
ev.stopPropagation();
const vid = item.getAttribute('data-vehicle-id');
const action = item.getAttribute('data-action') || '';
if (!vid) return;
openDriverNotificationAction(vid, action);
});
});
}

function setDriverNotificationsContent(warningItemsHtml) {
var ui = ensureDriverNotificationsUi();
if (!ui.list) return;
ui.list.innerHTML = warningItemsHtml && warningItemsHtml.trim()
? warningItemsHtml
: driverNotificationEmptyStateHtml;
bindDriverNotificationItemClicks();
}

window.openDriverNotifications = function(warningItemsHtml, triggerEl) {
var ui = ensureDriverNotificationsUi();
if (!ui.dropdown || !ui.backdrop) return;
setDriverNotificationsContent(warningItemsHtml || '');
document.body.classList.add('driver-notifications-open');
ui.backdrop.setAttribute('aria-hidden', 'false');
ui.dropdown.hidden = false;
ui.dropdown.classList.add('is-open');
if (triggerEl) {
positionDriverNotificationsDropdown(triggerEl);
triggerEl.setAttribute('aria-expanded', 'true');
}
bindDriverNotificationsGlobalHandlersOnce();
if (driverNotificationsResizeHandler) {
window.removeEventListener('resize', driverNotificationsResizeHandler);
}
driverNotificationsResizeHandler = function() {
var activeTrigger = document.querySelector('#driver-sliding-warning .driver-warning-trigger');
if (document.body.classList.contains('driver-notifications-open') && activeTrigger) {
positionDriverNotificationsDropdown(activeTrigger);
}
};
window.addEventListener('resize', driverNotificationsResizeHandler);
};

window.closeDriverNotifications = function() {
document.body.classList.remove('driver-notifications-open');
var dropdown = document.getElementById(DRIVER_NOTIFICATIONS_DROPDOWN_ID);
var backdrop = document.getElementById(DRIVER_NOTIFICATIONS_BACKDROP_ID);
if (dropdown) {
dropdown.classList.remove('is-open');
dropdown.hidden = true;
}
if (backdrop) backdrop.setAttribute('aria-hidden', 'true');
var trigger = document.querySelector('#driver-sliding-warning .driver-warning-trigger');
if (trigger) trigger.setAttribute('aria-expanded', 'false');
if (driverNotificationsResizeHandler) {
window.removeEventListener('resize', driverNotificationsResizeHandler);
driverNotificationsResizeHandler = null;
}
};

function renderSlidingWarning(vehicles, records) {
removeOrphanDriverNotificationsDropdown();
const el = document.getElementById('driver-sliding-warning');
if (!el) return;

const warnings = buildSlidingWarnings(vehicles, records);
var belowHeroSlot = document.getElementById('driver-below-hero-notification-slot');
if (warnings.length === 0) {
el.innerHTML = '';
el.className = 'driver-sliding-warning';
window.closeDriverNotifications();
if (belowHeroSlot && el.parentNode !== belowHeroSlot) belowHeroSlot.appendChild(el);
return;
}
if (belowHeroSlot) {
belowHeroSlot.appendChild(el);
}
const hasRedWarning = warnings.some(function(w) { return !w || w.warnLevel !== 'orange'; });
const iconClass = hasRedWarning ? 'driver-warning-icon-engine-red' : 'driver-warning-icon-engine-orange';
const warningItemsHtml = warnings.map(function(w) {
return buildDriverNotificationItemHtml(w);
}).join('');
const engineIcon = '<span class="driver-warning-icon driver-warning-icon-engine ' + iconClass + '" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"></svg></span>';

window.closeDriverNotifications();
el.className = 'driver-sliding-warning driver-warning-popover' + (hasRedWarning ? '' : ' driver-sliding-warning-orange');
el.innerHTML = '<button type="button" class="driver-warning-trigger" aria-label="Uyarıları göster" aria-expanded="false" aria-haspopup="dialog" aria-controls="' + DRIVER_NOTIFICATIONS_DROPDOWN_ID + '">'
+ engineIcon
+ '</button>';

const trigger = el.querySelector('.driver-warning-trigger');
if (trigger) {
trigger.addEventListener('click', function(e) {
e.preventDefault();
e.stopPropagation();
if (document.body.classList.contains('driver-notifications-open')) {
window.closeDriverNotifications();
return;
}
window.openDriverNotifications(warningItemsHtml, trigger);
});
}
}

function formatDriverDate(val) {
if (!val) return '-';
if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
const [y, m, d] = val.split('-');
return d + '.' + m + '.' + y;
}
return val;
}

function renderDriverRequiredExpiryValue(dateStr) {
var trimmed = (dateStr && String(dateStr).trim()) ? String(dateStr).trim() : '';
if (trimmed) return formatDriverDate(trimmed);
return '<span class="driver-info-missing-value">-</span>';
}

function setupKmInputs() {
document.querySelectorAll('.driver-action-area input.driver-km-input').forEach(input => {
var ph = input.parentElement && input.parentElement.querySelector('.driver-km-fake-placeholder');
function togglePlaceholder() {
if (ph) ph.style.visibility = (input.value || document.activeElement === input) ? 'hidden' : 'visible';
}
togglePlaceholder();
input.addEventListener('input', function() {
this.value = this.value.replace(/\D/g, '').slice(0, 8);
togglePlaceholder();
});
input.addEventListener('paste', function(e) {
e.preventDefault();
var text = '';
try {
text = (e.clipboardData || window.clipboardData).getData('text');
} catch (err) {}
this.value = (this.value + (text || '')).replace(/\D/g, '').slice(0, 8);
togglePlaceholder();
});
input.addEventListener('focus', function() { togglePlaceholder(); this.select(); });
input.addEventListener('blur', togglePlaceholder);
});
}

function setupEkstraNotAutoResize() {
document.querySelectorAll('.driver-action-area textarea.driver-report-textarea-auto').forEach(ta => {
function resize() {
ta.style.height = 'auto';
ta.style.height = ta.scrollHeight + 'px';
}
ta.addEventListener('input', resize);
resize();
});
}




function clearRememberCredentials() {
if (window.medisaPortalSession && typeof window.medisaPortalSession.clearRememberCredentials === 'function') {
window.medisaPortalSession.clearRememberCredentials();
}
}

function forgetThisDevice() {
if (window.medisaPortalSession && typeof window.medisaPortalSession.forgetThisDevice === 'function') {
window.medisaPortalSession.forgetThisDevice();
} else {
clearStoredPortalTokens();
clearRememberCredentials();
}
window.location.href = DRIVER_PAGE_BASE + 'index.html?force=login';
}

function openForgetThisDeviceConfirm() {
var popover = document.getElementById('driver-forget-device-confirm');
if (!popover) {
forgetThisDevice();
return;
}
popover.style.display = 'block';
popover.setAttribute('aria-hidden', 'false');
}

function closeForgetThisDeviceConfirm() {
var popover = document.getElementById('driver-forget-device-confirm');
if (!popover) return;
popover.style.display = 'none';
popover.setAttribute('aria-hidden', 'true');
}

function confirmForgetThisDevice() {
closeForgetThisDeviceConfirm();
forgetThisDevice();
}

function logout() {
clearStoredPortalTokens();
window.location.href = DRIVER_PAGE_BASE + 'index.html?force=login';
}
window.logout = logout;
window.forgetThisDevice = forgetThisDevice;
window.openForgetThisDeviceConfirm = openForgetThisDeviceConfirm;
window.closeForgetThisDeviceConfirm = closeForgetThisDeviceConfirm;
window.confirmForgetThisDevice = confirmForgetThisDevice;
function publishDriverRuntimeHelpers() {
var h = runtime.helpers;
h.driverVehicleNeedsK2 = driverVehicleNeedsK2;
h.driverVehicleNeedsTakograf = driverVehicleNeedsTakograf;
h.driverVehicleIsHeavyCommercial = driverVehicleIsHeavyCommercial;
h.ensureDriverOnlineForWrite = ensureDriverOnlineForWrite;
h.showDriverOfflineReadonlyMessage = showDriverOfflineReadonlyMessage;
h.escapeHtmlDriver = escapeHtmlDriver;
h.formatDriverPlaka = formatDriverPlaka;
h.formatDriverBrandModel = formatDriverBrandModel;
h.formatKm = formatKm;
h.formatDateDDMMYYYY = formatDateDDMMYYYY;
h.updateDriverModalBodyClass = updateDriverModalBodyClass;
h.syncDriverDateDisplay = syncDriverDateDisplay;
h.initDriverDateDisplays = initDriverDateDisplays;
h.getSelectedVehicle = getSelectedVehicle;
h.getExistingRecord = getExistingRecord;
h.getVehicleVersionForRequest = getVehicleVersionForRequest;
h.applyVehicleVersionUpdate = applyVehicleVersionUpdate;
h.handleDriverConflictResponse = handleDriverConflictResponse;
h.loadDashboard = loadDashboard;
h.switchDriverDashboardVehicle = switchDriverDashboardVehicle;
h.renderSlidingWarning = renderSlidingWarning;
h.setupPlateDropdown = setupPlateDropdown;
h.renderLeftPanel = renderLeftPanel;
h.renderRightPanel = renderRightPanel;
h.calculateNextMuayeneDate = calculateNextMuayeneDate;
h.getVehicleTypeRuleProfileDriver = getVehicleTypeRuleProfileDriver;
h.clearStoredPortalTokens = clearStoredPortalTokens;
h.clearRememberCredentials = clearRememberCredentials;
h.persistSessionToken = persistSessionToken;
h.isPortalSessionRemembered = isPortalSessionRemembered;
h.logout = logout;
h.forgetThisDevice = forgetThisDevice;
h.openForgetThisDeviceConfirm = openForgetThisDeviceConfirm;
h.closeForgetThisDeviceConfirm = closeForgetThisDeviceConfirm;
h.confirmForgetThisDevice = confirmForgetThisDevice;
h.openDriverNotifications = window.openDriverNotifications;
h.closeDriverNotifications = window.closeDriverNotifications;
if (window.__medisaDriverBootMetrics) window.__medisaDriverBootMetrics.dashboardContentReady = Date.now();
}
publishDriverRuntimeHelpers();

})();
