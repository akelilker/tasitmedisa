
(function() {
'use strict';

function applyMedisaIosPwaClass() {
try {
var ua = navigator.userAgent || '';
var isIOS = (/iPad|iPhone|iPod/.test(ua) && !window.MSStream)
|| (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
var isStandalone = (window.navigator.standalone === true)
|| (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
var root = document.documentElement;
var body = document.body;
if (isIOS && isStandalone) {
if (root) root.classList.add('is-ios-pwa');
if (body) body.classList.add('is-ios-pwa');
} else {
if (root) root.classList.remove('is-ios-pwa');
if (body) body.classList.remove('is-ios-pwa');
}
} catch (e) {}
}
applyMedisaIosPwaClass();
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', applyMedisaIosPwaClass);
}

var VERSION = '20260813.1';
window.MEDISA_DRIVER_ASSET_VERSIONS = window.MEDISA_DRIVER_ASSET_VERSIONS || {
bootstrap: '20260813.1',
login: '20260731.3',
dashboardCore: '20260731.3',
history: '20260814.1',
documents: '20260718.3',
feedback: '20260813.1',
password: '20260731.1',
actions: '20260718.1',
shellCss: '20260731.3',
featureCss: '20260814.1'
};

var APP_ROOT = (function() {
var p = document.location.pathname || '/';
var parts = String(p || '/').split('/').filter(Boolean);
if (!parts.length) return '/';
var lastPart = parts[parts.length - 1] || '';
if (lastPart.indexOf('.') !== -1) parts.pop();
var lastDir = (parts[parts.length - 1] || '').toLowerCase();
if (lastDir === 'driver' || lastDir === 'admin') parts.pop();
return parts.length ? ('/' + parts.join('/') + '/') : '/';
})();
var API_BASE = (APP_ROOT === '/' ? '/driver/' : APP_ROOT + 'driver/');
var ICON_BASE = (APP_ROOT === '/' ? '/icon/' : APP_ROOT + 'icon/');
var DRIVER_PAGE_BASE = API_BASE;
var MAIN_APP_URL = (APP_ROOT === '/' ? '/index.html' : APP_ROOT + 'index.html');
var MAIN_SESSION_URL = (APP_ROOT === '/' ? '/load.php' : APP_ROOT + 'load.php');

var scriptPromises = Object.create(null);
var stylePromises = Object.create(null);
var featurePromises = Object.create(null);
var featuresCssPromise = null;
var bootStart = Date.now();

function isPerfDebugEnabled() {
try {
if (window.localStorage && window.localStorage.getItem('medisa_perf_debug') === '1') return true;
var search = window.location && window.location.search ? window.location.search : '';
return !!(search && new URLSearchParams(search).get('medisaPerf') === '1');
} catch (e) {
return false;
}
}

function publishBootMetrics(patch) {
if (!isPerfDebugEnabled()) return;
var metrics = window.__medisaDriverBootMetrics || {
surface: '',
bootstrapBytes: 0,
surfaceJsBytes: 0,
blockingCssBytes: 0,
bootStart: bootStart,
surfaceModuleLoaded: 0,
interactiveAt: 0,
dashboardContentReady: 0,
loadedFeatures: [],
featureLoadDurations: {}
};
Object.keys(patch || {}).forEach(function(key) { metrics[key] = patch[key]; });
window.__medisaDriverBootMetrics = metrics;
}

function loadDriverScriptOnce(url) {
if (!url) return Promise.resolve();
if (scriptPromises[url]) return scriptPromises[url];
if (typeof window.__medisaLoadScriptOnce === 'function') {
scriptPromises[url] = window.__medisaLoadScriptOnce(url).catch(function(err) {
delete scriptPromises[url];
throw err;
});
return scriptPromises[url];
}
scriptPromises[url] = new Promise(function(resolve, reject) {
var script = document.createElement('script');
script.src = url;
script.async = true;
script.onload = function() { resolve(); };
script.onerror = function() {
if (script.parentNode) script.parentNode.removeChild(script);
delete scriptPromises[url];
reject(new Error('Script yuklenemedi: ' + url));
};
(document.head || document.documentElement).appendChild(script);
});
return scriptPromises[url];
}

function loadDriverStyleOnce(url) {
if (!url) return Promise.resolve();
if (stylePromises[url]) return stylePromises[url];
var existing = document.querySelector('link[data-medisa-driver-style="' + url + '"]');
if (existing && existing.getAttribute('data-medisa-load-state') === 'loaded') {
stylePromises[url] = Promise.resolve();
return stylePromises[url];
}
stylePromises[url] = new Promise(function(resolve, reject) {
var link = existing || document.createElement('link');
link.rel = 'stylesheet';
link.href = url;
link.setAttribute('data-medisa-driver-style', url);
link.onload = function() {
link.setAttribute('data-medisa-load-state', 'loaded');
resolve();
};
link.onerror = function() {
link.setAttribute('data-medisa-load-state', 'failed');
if (link.parentNode) link.parentNode.removeChild(link);
delete stylePromises[url];
reject(new Error('CSS yuklenemedi: ' + url));
};
if (!existing) (document.head || document.documentElement).appendChild(link);
});
return stylePromises[url];
}

function assetUrl(fileName, versionKey) {
var versions = window.MEDISA_DRIVER_ASSET_VERSIONS || {};
var version = versions[versionKey] || VERSION;
return DRIVER_PAGE_BASE + fileName + '?v=' + version;
}

function featureOfflineMessage() {
return 'Bu bölüm ilk kullanım için internet bağlantısı gerektiriyor.';
}

function ensureFeaturesCss() {
if (featuresCssPromise) return featuresCssPromise;
featuresCssPromise = loadDriverStyleOnce(assetUrl('driver-features.css', 'featureCss')).catch(function(err) {
featuresCssPromise = null;
throw err;
});
return featuresCssPromise;
}

var FEATURE_FILES = {
history: { js: 'driver-feature-history.js', versionKey: 'history' },
documents: { js: 'driver-feature-documents.js', versionKey: 'documents' },
feedback: { js: 'driver-feature-feedback.js', versionKey: 'feedback' },
password: { js: 'driver-feature-password.js', versionKey: 'password' },
actions: { js: 'driver-feature-actions.js', versionKey: 'actions' }
};

function getDriverVehicleTypeKey(vehicle) {
return String((vehicle && (vehicle.vehicleType || vehicle.tip)) || '').trim().toLowerCase();
}

function normalizeDriverVehicleTypeKey(typeKey) {
return String(typeKey || '')
.toLowerCase()
.replace(/ğ/g, 'g')
.replace(/ü/g, 'u')
.replace(/ş/g, 's')
.replace(/ı/g, 'i')
.replace(/ö/g, 'o')
.replace(/ç/g, 'c')
.replace(/\s+/g, '_')
.trim();
}

function driverVehicleNeedsK2(vehicle) {
var typeKey = getDriverVehicleTypeKey(vehicle);
var normalizedType = normalizeDriverVehicleTypeKey(typeKey);
return normalizedType === 'minivan'
|| normalizedType === 'kucuk_ticari'
|| normalizedType === 'kamyon'
|| normalizedType === 'buyuk_ticari'
|| normalizedType === 'romork';
}

function driverVehicleNeedsTakograf(vehicle) {
var normalizedType = normalizeDriverVehicleTypeKey(getDriverVehicleTypeKey(vehicle));
return normalizedType === 'kamyon' || normalizedType === 'buyuk_ticari';
}

function driverVehicleIsHeavyCommercial(vehicle) {
var normalized = normalizeDriverVehicleTypeKey(getDriverVehicleTypeKey(vehicle));
return normalized === 'kamyon' || normalized === 'buyuk_ticari';
}

function bindDriverDashboardTitleCase(areaEl) {
if (!areaEl || areaEl.nodeType !== 1) return;
areaEl.querySelectorAll('textarea, input[type="text"]').forEach(function(el) {
if (el.getAttribute('data-driver-titlecase-bound') === '1') return;
var id = el.id || '';
if (/km-|kaza-tutar-|bakim-km-|bakim-tutar-|iletisim-/i.test(id)) return;
if (el.classList.contains('driver-km-input')) return;
if (el.getAttribute('inputmode') === 'numeric') return;
el.setAttribute('data-driver-titlecase-bound', '1');
el.addEventListener('blur', function () {
var raw = el.value;
var v = raw.trim();
if (!v) return;
if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(v)) return;
var out = window.capitalizeWords(v);
if (out !== raw) {
el.value = out;
try {
el.dispatchEvent(new Event('input', { bubbles: true }));
} catch (e) {}
}
});
});
}

var runtime = {
version: VERSION,
paths: {
APP_ROOT: APP_ROOT,
API_BASE: API_BASE,
ICON_BASE: ICON_BASE,
DRIVER_PAGE_BASE: DRIVER_PAGE_BASE,
MAIN_APP_URL: MAIN_APP_URL,
MAIN_SESSION_URL: MAIN_SESSION_URL
},
state: {},
helpers: {
getDriverVehicleTypeKey: getDriverVehicleTypeKey,
normalizeDriverVehicleTypeKey: normalizeDriverVehicleTypeKey,
driverVehicleNeedsK2: driverVehicleNeedsK2,
driverVehicleNeedsTakograf: driverVehicleNeedsTakograf,
driverVehicleIsHeavyCommercial: driverVehicleIsHeavyCommercial,
bindDriverDashboardTitleCase: bindDriverDashboardTitleCase
},
features: {},
registerFeature: function(name, api) {
runtime.features[name] = api || {};
return runtime.features[name];
},
getContext: function() {
return {
paths: runtime.paths,
state: runtime.state,
helpers: runtime.helpers,
features: runtime.features,
token: function() { return runtime.state.currentToken || null; },
user: function() { return runtime.state.currentUser || null; },
vehicles: function() { return runtime.state.allHistoryVehicles || []; },
records: function() { return runtime.state.allHistoryRecords || []; },
selectedVehicleId: function() { return runtime.state.selectedVehicleId; }
};
},
loadFeature: function(name) {
if (runtime.features[name]) return Promise.resolve(runtime.features[name]);
if (featurePromises[name]) return featurePromises[name];
var meta = FEATURE_FILES[name];
if (!meta) return Promise.reject(new Error('Bilinmeyen feature: ' + name));
var jsUrl = assetUrl(meta.js, meta.versionKey);
if (typeof navigator !== 'undefined' && navigator.onLine === false && !scriptPromises[jsUrl]) {
return Promise.reject(new Error(featureOfflineMessage()));
}
var started = Date.now();
featurePromises[name] = Promise.all([
ensureFeaturesCss(),
loadDriverScriptOnce(jsUrl)
]).then(function() {
if (!runtime.features[name]) throw new Error('Feature kaydolmadi: ' + name);
if (isPerfDebugEnabled()) {
var metrics = window.__medisaDriverBootMetrics || { loadedFeatures: [], featureLoadDurations: {} };
if (metrics.loadedFeatures.indexOf(name) === -1) metrics.loadedFeatures.push(name);
metrics.featureLoadDurations[name] = Date.now() - started;
window.__medisaDriverBootMetrics = metrics;
}
return runtime.features[name];
}).catch(function(err) {
delete featurePromises[name];
if (typeof navigator !== 'undefined' && navigator.onLine === false) {
throw new Error(featureOfflineMessage());
}
throw err;
});
return featurePromises[name];
}
};
window.MedisaDriverRuntime = runtime;

function installProxy(fnName, featureName, apiName) {
var inFlight = null;
window[fnName] = function() {
var args = arguments;
var invoke = function(api) {
var impl = api && api[apiName];
if (typeof impl !== 'function') throw new Error(fnName + ' hazir degil');
return impl.apply(api, args);
};
if (runtime.features[featureName]) return invoke(runtime.features[featureName]);
if (inFlight) return inFlight.then(invoke);
inFlight = runtime.loadFeature(featureName).then(function(api) {
inFlight = null;
return api;
}).catch(function(err) {
inFlight = null;
var message = (err && err.message) ? err.message : featureOfflineMessage();
alert(message);
throw err;
});
return inFlight.then(invoke);
};
}

function installCoreProxy(fnName) {
window[fnName] = function() {
var args = arguments;
var helpers = runtime.helpers || {};
if (typeof helpers[fnName] === 'function') return helpers[fnName].apply(null, args);
if (fnName === 'logout') {
try {
if (window.medisaPortalSession && typeof window.medisaPortalSession.clearStoredTokens === 'function') {
window.medisaPortalSession.clearStoredTokens();
}
} catch (e) {}
window.location.href = DRIVER_PAGE_BASE + 'index.html?force=login';
return;
}
if (fnName === 'forgetThisDevice' || fnName === 'confirmForgetThisDevice') {
try {
if (window.medisaPortalSession && typeof window.medisaPortalSession.forgetThisDevice === 'function') {
window.medisaPortalSession.forgetThisDevice();
} else if (window.medisaPortalSession && typeof window.medisaPortalSession.clearStoredTokens === 'function') {
window.medisaPortalSession.clearStoredTokens();
if (typeof window.medisaPortalSession.clearRememberCredentials === 'function') {
window.medisaPortalSession.clearRememberCredentials();
}
}
} catch (e) {}
window.location.href = DRIVER_PAGE_BASE + 'index.html?force=login';
return;
}
if (fnName === 'openForgetThisDeviceConfirm' || fnName === 'closeForgetThisDeviceConfirm') {
return;
}
alert('Panel henüz hazır değil. Lütfen tekrar deneyin.');
};
}

[
['showHistory', 'history', 'showHistory'],
['closeHistory', 'history', 'closeHistory'],
['toggleHistoryVehicleDropdown', 'history', 'toggleHistoryVehicleDropdown'],
['showEditRequest', 'history', 'showEditRequest'],
['closeEditRequest', 'history', 'closeEditRequest'],
['submitEditRequest', 'history', 'submitEditRequest'],
['openDriverDocumentsModal', 'documents', 'openDriverDocumentsModal'],
['closeDriverDocumentsModal', 'documents', 'closeDriverDocumentsModal'],
['openDriverFeedbackModal', 'feedback', 'openDriverFeedbackModal'],
['closeDriverFeedbackModal', 'feedback', 'closeDriverFeedbackModal'],
['submitDriverFeedback', 'feedback', 'submitDriverFeedback'],
['openDriverPasswordModal', 'password', 'openDriverPasswordModal'],
['closeDriverPasswordModal', 'password', 'closeDriverPasswordModal'],
['openMandatoryDriverPasswordChange', 'password', 'openMandatoryDriverPasswordChange'],
['submitDriverPasswordChange', 'password', 'submitDriverPasswordChange'],
['toggleDriverActionBlock', 'actions', 'toggleDriverActionBlock'],
['focusKmInput', 'actions', 'focusKmInput'],
['cancelKmForm', 'actions', 'cancelKmForm'],
['cancelDriverActionForm', 'actions', 'cancelDriverActionForm'],
['submitDriverAction', 'actions', 'submitDriverAction'],
['submitKmOnly', 'actions', 'submitKmOnly'],
['syncDriverEgzozMuayeneFields', 'actions', 'syncDriverEgzozMuayeneFields'],
['cancelMuayeneSubmit', 'actions', 'cancelMuayeneSubmit'],
['confirmMuayeneSubmit', 'actions', 'confirmMuayeneSubmit'],
['saveDriverEventFromBlock', 'actions', 'saveDriverEventFromBlock']
].forEach(function(item) { installProxy(item[0], item[1], item[2]); });

installCoreProxy('logout');
installCoreProxy('forgetThisDevice');
installCoreProxy('openForgetThisDeviceConfirm');
installCoreProxy('closeForgetThisDeviceConfirm');
installCoreProxy('confirmForgetThisDevice');
installCoreProxy('openDriverNotifications');
installCoreProxy('closeDriverNotifications');

function detectSurface() {
if (document.body && document.body.classList.contains('login-page')) return 'login';
if (document.body && document.body.classList.contains('dashboard-page')) return 'dashboard';
if (document.getElementById('login-form')) return 'login';
if (document.getElementById('driver-two-panel')) return 'dashboard';
return 'login';
}

function bootSurface() {
var surface = detectSurface();
publishBootMetrics({ surface: surface, bootStart: bootStart });
var loader = surface === 'dashboard'
? Promise.all([
ensureFeaturesCss(),
loadDriverScriptOnce(assetUrl('driver-dashboard-core.js', 'dashboardCore'))
])
: loadDriverScriptOnce(assetUrl('driver-login.js', 'login'));
loader.then(function() {
publishBootMetrics({
surface: surface,
surfaceModuleLoaded: Date.now(),
interactiveAt: Date.now()
});
}).catch(function(err) {
console.error('[Medisa] driver surface yuklenemedi:', err);
alert('Kullanıcı paneli yüklenemedi. Lütfen sayfayı yenileyin.');
});
}

document.addEventListener('focusin', function(ev) {
var el = ev.target;
if (!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.closest)) return;
var modal = el.closest('.driver-modal');
if (!modal) return;
setTimeout(function() {
if (!(el && typeof el.getBoundingClientRect === 'function' && typeof el.scrollIntoView === 'function')) return;
var rect = el.getBoundingClientRect();
var viewportHeight = (window.visualViewport && window.visualViewport.height) ? window.visualViewport.height : window.innerHeight;
if (rect.top < 88 || rect.bottom > (viewportHeight - 24)) {
el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
}
}, 350);
});

if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', bootSurface);
} else {
bootSurface();
}
})();
