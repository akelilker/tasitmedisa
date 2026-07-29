
(function() {
'use strict';
var runtime = window.MedisaDriverRuntime;
if (!runtime) throw new Error('MedisaDriverRuntime eksik');
var P = runtime.paths;
var APP_ROOT = P.APP_ROOT;
var API_BASE = P.API_BASE;
var DRIVER_PAGE_BASE = P.DRIVER_PAGE_BASE;
var MAIN_APP_URL = P.MAIN_APP_URL;
var MAIN_SESSION_URL = P.MAIN_SESSION_URL;
var APP_VERSION = 'v78.1';

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
window.location.href = DRIVER_PAGE_BASE + 'dashboard.html?password-change=required';
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

function clearSavedDriverPassword() {
try { localStorage.removeItem('driver_saved_password'); } catch (e) {}
}


(function initLoginFooterDim() {
const footer = document.getElementById('app-footer');
if (!footer) return;
footer.classList.add('dimmed');
footer.classList.remove('delayed');
setTimeout(function() {
if (footer) footer.classList.add('delayed');
}, 4000);
})();

function revealDriverLoginView() {
if (document.body) document.body.classList.remove('login-gate-active');
}

async function initDriverLoginPage() {
var loginForm = document.getElementById('login-form');
if (!loginForm || loginForm.getAttribute('data-medisa-login-init') === '1') return;
loginForm.setAttribute('data-medisa-login-init', '1');


var savedToken = getStoredPortalToken();
if (!shouldForceDriverLoginView() && savedToken) {
var routedByExistingSession = await routeByCurrentSession(savedToken, false, {
nextUrl: getRequestedNextUrl()
});
if (routedByExistingSession) return;
}
revealDriverLoginView();

var usernameInput = document.getElementById('username');
var passwordInput = document.getElementById('password');

clearSavedDriverPassword();


var rememberCheckbox = document.getElementById('remember');
if (rememberCheckbox && localStorage.getItem('driver_remember_me') === '1') {
rememberCheckbox.checked = true;
var savedUser = localStorage.getItem('driver_saved_username');
if (usernameInput && savedUser) usernameInput.value = savedUser;
}

function toggleLoginInputHasValue(el) {
if (!el) return;
if (el.value && el.value.trim().length > 0) el.classList.add('has-value');
else el.classList.remove('has-value');
}
[usernameInput, passwordInput].forEach(function(inp) {
if (!inp) return;
toggleLoginInputHasValue(inp);
inp.addEventListener('input', function() { toggleLoginInputHasValue(inp); });
inp.addEventListener('change', function() { toggleLoginInputHasValue(inp); });
});


function scrollInputIntoView(el) {
if (!(el && typeof el.getBoundingClientRect === 'function' && typeof el.scrollIntoView === 'function')) return;

setTimeout(function() {
var rect = el.getBoundingClientRect();
var viewportHeight = (window.visualViewport && window.visualViewport.height) ? window.visualViewport.height : window.innerHeight;
var topSafe = 96;
var bottomSafe = 28;

var isAboveVisibleArea = rect.top < topSafe;
var isBelowVisibleArea = rect.bottom > (viewportHeight - bottomSafe);

if (isAboveVisibleArea || isBelowVisibleArea) {
el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
}
}, 350);
}
if (usernameInput) usernameInput.addEventListener('focus', function() { scrollInputIntoView(this); });
if (passwordInput) passwordInput.addEventListener('focus', function() { scrollInputIntoView(this); });

function submitLoginFormFromPageEnter(ev) {
if (!ev || ev.key !== 'Enter' || ev.defaultPrevented || ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
var active = document.activeElement;
if (active && loginForm.contains(active)) return;
if (document.body && document.body.classList.contains('login-gate-active')) return;
if (!usernameInput || !passwordInput) return;
if (!usernameInput.value.trim() || !passwordInput.value) return;
var loginBtn = document.getElementById('login-btn');
if (loginBtn && loginBtn.disabled) return;

ev.preventDefault();
if (typeof loginForm.requestSubmit === 'function') {
loginForm.requestSubmit(loginBtn || undefined);
} else if (loginBtn) {
loginBtn.click();
}
}
document.addEventListener('keydown', submitLoginFormFromPageEnter);

loginForm.addEventListener('submit', async (e) => {
e.preventDefault();

const username = document.getElementById('username').value.trim();
const password = document.getElementById('password').value;
const remember = document.getElementById('remember').checked;

const errorDiv = document.getElementById('error-message');
const loginBtn = document.getElementById('login-btn');
const btnText = loginBtn.querySelector('.btn-text');
const btnLoader = loginBtn.querySelector('.btn-loader');

errorDiv.classList.remove('show');
loginBtn.disabled = true;
btnText.style.display = 'none';
btnLoader.style.display = 'inline';

const loginUrl = window.location.origin + API_BASE + 'driver_login.php';

try {
const response = await fetch(loginUrl, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ username, password })
});
const data = await response.json();

if (data.success) {
if (remember) {
try {
localStorage.setItem('driver_remember_me', '1');
localStorage.setItem('driver_saved_username', username);
localStorage.removeItem('driver_saved_password');
} catch (e) {}
} else {
try {
localStorage.removeItem('driver_remember_me');
localStorage.removeItem('driver_saved_username');
localStorage.removeItem('driver_saved_password');
} catch (e) {}
}
var tokenToStore = data.token && typeof data.token === 'string' ? data.token : null;
if (tokenToStore) persistSessionToken(tokenToStore, remember);
var routedOk = routeByToken(tokenToStore, data.driverDashboard === true, {
nextUrl: getRequestedNextUrl(),
sessionData: {
role: data.rol || '',
kullanici_paneli: data.driverDashboard === true,
driver_dashboard: data.driverDashboard === true,
yonetici_only: data.yonetici_only === true,
ilk_giris_parola_degistirme_zorunlu: typeof data.ilk_giris_parola_degistirme_zorunlu === 'boolean'
? data.ilk_giris_parola_degistirme_zorunlu === true
: true,
user: {
role: data.rol || '',
kullanici_paneli: data.driverDashboard === true
}
}
});
if (!routedOk) {
errorDiv.textContent = 'Oturum başlatılamadı.';
errorDiv.classList.add('show');
loginBtn.disabled = false;
btnText.style.display = 'inline';
btnLoader.style.display = 'none';
}
} else {
errorDiv.textContent = data.message || 'Giriş başarısız!';
errorDiv.classList.add('show');
loginBtn.disabled = false;
btnText.style.display = 'inline';
btnLoader.style.display = 'none';
}
} catch (error) {
console.error('Hata:', error);
errorDiv.textContent = 'Bağlantı hatası! Lütfen tekrar deneyin.';
errorDiv.classList.add('show');
loginBtn.disabled = false;
btnText.style.display = 'inline';
btnLoader.style.display = 'none';
}
});
}

if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', initDriverLoginPage);
} else {
initDriverLoginPage();
}
})();
