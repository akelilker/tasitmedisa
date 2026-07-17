/* =========================================
   SUNUCU VERI YONETIMI - DATA MANAGER
   ========================================= */

const API_BASE = (function() {
    try {
        var p = (typeof document !== 'undefined' && document.location && document.location.pathname) ? document.location.pathname : '';
        var parts = String(p || '/').split('/').filter(Boolean);
        if (!parts.length) return '';
        var lastPart = parts[parts.length - 1] || '';
        if (lastPart.indexOf('.') !== -1) parts.pop();
        var lastDir = parts[parts.length - 1] || '';
        if (lastDir === 'admin' || lastDir === 'driver') parts.pop();
        if (!parts.length) return '';
        return '/' + parts.join('/') + '/';
    } catch (e) {
        return '';
    }
})();

const API_LOAD = API_BASE + 'load.php';
const API_SAVE = API_BASE + 'save.php';
const API_LOAD_KASKO = API_BASE + 'load_kasko.php';
const API_SAVE_KASKO = API_BASE + 'save_kasko.php';
const DRIVER_INDEX_URL = API_BASE + 'driver/';
const DRIVER_DASHBOARD_URL = API_BASE + 'driver/dashboard.html';

window.MEDISA_API_BASE = API_BASE;
window.API_SAVE_KASKO = API_SAVE_KASKO;

/**
 * Taşıt tarih alanları (kayit.js ile aynı kural): ham metin → yyyy-mm-dd.
 * Ana uygulama data-manager ile yüklenir; tasitlar/kayıt bu globali kullanır.
 */
(function registerMedisaVehicleDateRawParser() {
    function isCompleteIsoDate(value) {
        if (!value || typeof value !== 'string') return false;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        var parts = value.split('-');
        var y = parseInt(parts[0], 10);
        var m = parseInt(parts[1], 10);
        var d = parseInt(parts[2], 10);
        if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
        var dt = new Date(y, m - 1, d);
        return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
    }
    function normalizeYmdToIso(y, mo, d) {
        if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
        if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1000 || y > 9999) return null;
        var dt = new Date(y, mo - 1, d);
        if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
        var mm = mo < 10 ? '0' + mo : String(mo);
        var dd = d < 10 ? '0' + d : String(d);
        return y + '-' + mm + '-' + dd;
    }
    function parseVehicleDateRawToIso(raw) {
        if (raw === undefined) return null;
        if (raw === null) return null;
        if (typeof raw !== 'string') return null;
        var s = raw.trim();
        if (!s) return null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
            return isCompleteIsoDate(s) ? s : null;
        }
        var dm = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
        if (dm) {
            var d = parseInt(dm[1], 10);
            var mo = parseInt(dm[2], 10);
            var y = parseInt(dm[3], 10);
            var isoDm = normalizeYmdToIso(y, mo, d);
            return isoDm === null ? null : isoDm;
        }
        if (/^\d{8}$/.test(s)) {
            var d8 = parseInt(s.slice(0, 2), 10);
            var m8 = parseInt(s.slice(2, 4), 10);
            var y8 = parseInt(s.slice(4, 8), 10);
            var isoD8 = normalizeYmdToIso(y8, m8, d8);
            return isoD8 === null ? null : isoD8;
        }
        return null;
    }
    window.parseVehicleDateRawToIso = parseVehicleDateRawToIso;
})();

function medisaInvalidateVehicleDateTasksCacheIfAvailable() {
    if (typeof window.invalidateVehicleDateTasksCache === 'function') {
        window.invalidateVehicleDateTasksCache();
    }
}

function getDefaultAppData() {
    return {
        tasitlar: [],
        kayitlar: [],
        branches: [],
        users: [],
        ayarlar: {
            sirketAdi: 'Medisa',
            yetkiliKisi: '',
            telefon: '',
            eposta: '',
            k2Belgesi: {
                expiryDate: '',
                documentPath: '',
                updatedAt: ''
            }
        },
        sifreler: [],
        arac_aylik_hareketler: [],
        duzeltme_talepleri: [],
        kaskoDegerListesi: {
            updatedAt: '',
            period: '',
            sourceFileName: '',
            rows: []
        },
        notificationReadState: {},
        monthlyTodoWhatsAppLogs: {}
    };
}

function getDefaultSession() {
    return {
        authenticated: false,
        role: '',
        raw_role: '',
        yonetici_only: false,
        branch_ids: [],
        kullanici_paneli: false,
        driver_dashboard: false,
        permissions: {},
        user: {
            id: '',
            isim: '',
            role: '',
            branch_ids: [],
            kullanici_paneli: false
        }
    };
}

window.appData = getDefaultAppData();
window.medisaSession = getDefaultSession();

let isDataLoaded = false;
let isDataLoading = false;
let loadPromise = null;
let isSaving = false;
let serverDatasetTrusted = false;
/** Ardışık save isteklerini sıraya alır; eşzamanlı çağrılarda biri false dönüp veri kaybı yaşanmasın. */
let saveMutex = Promise.resolve();
let offlineReadonlyWarnAt = 0;
let visibleCacheVersion = 0;
let visibleCache = {
    key: '',
    vehicles: null,
    users: null,
    branches: null
};

function invalidateMedisaVisibleCache() {
    visibleCacheVersion += 1;
    visibleCache.key = '';
    visibleCache.vehicles = null;
    visibleCache.users = null;
    visibleCache.branches = null;
}

function getMedisaSessionFingerprint() {
    var session = getSessionScope();
    var role = getSessionRoleValue(session);
    var userId = String((session.user && session.user.id) || '');
    var branchIds = Array.isArray(session.branch_ids)
        ? session.branch_ids.map(String).filter(Boolean).sort().join('|')
        : '';
    return [
        session.authenticated ? '1' : '0',
        role || '',
        userId,
        branchIds,
        String(session.raw_role || ''),
        session.yonetici_only === true ? '1' : '0',
        getStoredPortalToken() ? '1' : '0'
    ].join(':');
}

function getMedisaVisibleCacheRuntimeKey() {
    return String(visibleCacheVersion) + '|' + getMedisaSessionFingerprint();
}

function getCachedMedisaVisibleList(kind, builder) {
    var runtimeKey = getMedisaVisibleCacheRuntimeKey();
    if (visibleCache.key === runtimeKey && Array.isArray(visibleCache[kind])) {
        return visibleCache[kind].slice();
    }
    if (visibleCache.key !== runtimeKey) {
        visibleCache.key = runtimeKey;
        visibleCache.vehicles = null;
        visibleCache.users = null;
        visibleCache.branches = null;
    }
    var built = builder();
    visibleCache[kind] = Array.isArray(built) ? built : [];
    return visibleCache[kind].slice();
}

function syncDataLoadState() {
    isDataLoaded = hasUsableAppData(window.appData);
    window.__medisaDataLoaded = !!isDataLoaded;
    window.__medisaDataLoading = !!isDataLoading;
}
syncDataLoadState();

function hasUsableAppData(data) {
    return !!(
        data &&
        typeof data === 'object' &&
        (
            (Array.isArray(data.tasitlar) && data.tasitlar.length > 0) ||
            (Array.isArray(data.branches) && data.branches.length > 0) ||
            (Array.isArray(data.users) && data.users.length > 0) ||
            (Array.isArray(data.kayitlar) && data.kayitlar.length > 0)
        )
    );
}

function showOfflineReadonlyWarning() {
    var now = Date.now();
    if (now - offlineReadonlyWarnAt < 5000) return;
    offlineReadonlyWarnAt = now;
    var message = 'İnternet bağlantısı yok. Son kayıtlı veri görüntüleniyor; değişiklikler kaydedilemez.';
    if (typeof window.showCenteredInfoBox === 'function') {
        window.showCenteredInfoBox(message);
        return;
    }
    if (typeof window.showInfoModal === 'function') {
        window.showInfoModal(message);
        return;
    }
    if (typeof alert === 'function') {
        alert(message);
    }
}

function getSafeAppDataFallback() {
    if (hasUsableAppData(window.appData)) {
        return window.appData;
    }
    return getDefaultAppData();
}

function getCurrentPathname() {
    try {
        return window.location && window.location.pathname ? window.location.pathname : '';
    } catch (e) {
        return '';
    }
}

function getStoredPortalToken() {
    return window.medisaPortalSession && typeof window.medisaPortalSession.getStoredToken === 'function'
        ? (window.medisaPortalSession.getStoredToken() || '')
        : '';
}

function clearStoredPortalTokens() {
    if (window.medisaPortalSession && typeof window.medisaPortalSession.clearStoredTokens === 'function') {
        window.medisaPortalSession.clearStoredTokens();
    }
}

/** Ana uygulama ayarlar menüsü: oturumu kapat, portal girişine yönlendir */
function medisaMainAppLogout() {
    try {
        clearStoredPortalTokens();
        window.medisaSession = getDefaultSession();
        if (typeof document !== 'undefined' && document.body) {
            document.body.removeAttribute('data-medisa-role');
        }
        var menu = document.getElementById('settings-menu');
        if (menu) menu.classList.remove('open');
        var sub = document.getElementById('data-submenu');
        if (sub) sub.classList.remove('open');
    } catch (e) {}
    invalidateMedisaVisibleCache();
    if (typeof window === 'undefined') return;
    window.__medisaRedirecting = true;
    window.location.href = DRIVER_INDEX_URL;
}
window.medisaMainAppLogout = medisaMainAppLogout;

function decodeTokenPayload(token) {
    if (!token || typeof token !== 'string') return null;
    try {
        if (token.indexOf('.') !== -1) {
            var parts = token.split('.');
            if (parts.length !== 3) return null;
            var payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            while (payload.length % 4) payload += '=';
            var jsonText = atob(payload);
            return JSON.parse(jsonText);
        }

        return JSON.parse(atob(token));
    } catch (e) {
        return null;
    }
}

function getSessionFromToken() {
    var token = getStoredPortalToken();
    var payload = decodeTokenPayload(token);
    if (!payload || !payload.exp || Number(payload.exp) < Math.floor(Date.now() / 1000)) {
        return getDefaultSession();
    }

    var payloadRole = payload.rol || payload.role || '';
    var role = normalizeSessionRole(payloadRole);
    var rawRole = String(payload.raw_rol || payloadRole || '').trim();
    var branchIds = Array.isArray(payload.sube_ids) ? payload.sube_ids.map(String).filter(Boolean) : [];
    var driverDash = payload.driver_dashboard === true;
    return {
        authenticated: true,
        role: role || '',
        raw_role: rawRole || '',
        yonetici_only: payload.yonetici_only === true,
        branch_ids: branchIds,
        kullanici_paneli: driverDash,
        driver_dashboard: driverDash,
        permissions: {},
        user: {
            id: payload.user_id != null ? String(payload.user_id) : '',
            isim: '',
            role: role || '',
            branch_ids: branchIds,
            kullanici_paneli: driverDash
        }
    };
}

function normalizeSessionRole(role) {
    var normalizedRole = String(role || '').trim();
    if (normalizedRole === 'admin') return 'genel_yonetici';
    if (normalizedRole === 'yonetici') return 'sube_yonetici';
    if (normalizedRole === 'yonetici_kullanici') return 'sube_yonetici';
    if (normalizedRole === 'driver' || normalizedRole === 'sales' || normalizedRole === 'surucu') return 'kullanici';
    return normalizedRole;
}

function getSessionRoleValue(sessionData) {
    var session = sessionData && typeof sessionData === 'object' ? sessionData : getDefaultSession();
    return normalizeSessionRole(session.role || (session.user && session.user.role) || '');
}

window.getMedisaMainAppSessionRole = function(sessionData) {
    var session = sessionData && typeof sessionData === 'object'
        ? sessionData
        : (typeof window.getMedisaSession === 'function' ? window.getMedisaSession() : (window.medisaSession || getDefaultSession()));
    return getSessionRoleValue(session);
};

window.isMedisaMainAppSessionGenelYonetici = function(sessionData) {
    try {
        var session = sessionData && typeof sessionData === 'object'
            ? sessionData
            : (typeof window.getMedisaSession === 'function' ? window.getMedisaSession() : (window.medisaSession || getDefaultSession()));
        if (!session || !session.authenticated) return false;
        return getSessionRoleValue(session) === 'genel_yonetici';
    } catch (e) {
        return false;
    }
};

function isBranchManagerSessionRole(role) {
    return normalizeSessionRole(role) === 'sube_yonetici';
}

function hasMainAppAccessForSession(sessionData) {
    var role = getSessionRoleValue(sessionData);
    return role === 'genel_yonetici' || isBranchManagerSessionRole(role);
}

function canUseDriverPanelTransition(sessionData) {
    var session = sessionData && typeof sessionData === 'object' ? sessionData : getDefaultSession();
    if (!session.authenticated) return false;
    if (session.yonetici_only === true) return false;
    if (session.driver_dashboard !== true) return false;
    return true;
}

function hasAssignedVehicleForSessionUser(sessionData) {
    var session = sessionData && typeof sessionData === 'object' ? sessionData : getDefaultSession();
    var userId = String((session.user && session.user.id) || '').trim();
    if (!userId) return false;

    var vehicles = Array.isArray(window.appData && window.appData.tasitlar) ? window.appData.tasitlar : [];
    return vehicles.some(function(vehicle) {
        return String((vehicle && vehicle.assignedUserId) || '').trim() === userId;
    });
}

function canShowMainUserPanelLink(sessionData) {
    var session = sessionData && typeof sessionData === 'object' ? sessionData : getDefaultSession();
    if (!hasMainAppAccessForSession(session)) return false;
    return hasAssignedVehicleForSessionUser(session);
}

function buildAuthHeaders(extraHeaders) {
    var headers = Object.assign({}, extraHeaders || {});
    var token = getStoredPortalToken();
    if (token) {
        headers.Authorization = 'Bearer ' + token;
    }
    return headers;
}

function buildFallbackPermissions(role) {
    var normalizedRole = normalizeSessionRole(role);
    var hasMainAppAccess = hasMainAppAccessForSession({ role: normalizedRole });
    var canManageGlobalData = normalizedRole === 'genel_yonetici' || normalizedRole === 'sube_yonetici';
    return {
        view_main_app: hasMainAppAccess,
        view_reports: hasMainAppAccess,
        manage_users: hasMainAppAccess,
        manage_branches: normalizedRole === 'genel_yonetici',
        manage_data: canManageGlobalData,
        manage_settings: canManageGlobalData
    };
}

function normalizeSessionPermissions(role, permissions) {
    var normalizedRole = normalizeSessionRole(role);
    var fallback = buildFallbackPermissions(normalizedRole);
    var canManageGlobalData = normalizedRole === 'genel_yonetici' || normalizedRole === 'sube_yonetici';

    return {
        view_main_app: !!fallback.view_main_app,
        view_reports: !!fallback.view_reports,
        manage_users: !!fallback.manage_users,
        manage_branches: normalizedRole === 'genel_yonetici',
        manage_data: canManageGlobalData,
        manage_settings: canManageGlobalData
    };
}

function redirectToPortalLogin() {
    if (typeof window === 'undefined') return;
    var path = getCurrentPathname();
    if (path.indexOf('/driver/') !== -1) return;
    if (window.__medisaRedirecting === true) return;
    window.__medisaRedirecting = true;
    window.location.href = DRIVER_INDEX_URL;
}

function redirectToDriverDashboard() {
    if (typeof window === 'undefined') return;
    if (window.__medisaRedirecting === true) return;
    window.__medisaRedirecting = true;
    window.location.href = DRIVER_DASHBOARD_URL;
}

function resolveMainAppPortalLinkUrl(sessionData) {
    var session = sessionData && typeof sessionData === 'object' ? sessionData : (window.medisaSession || getDefaultSession());
    if (canUseDriverPanelTransition(session)) {
        return DRIVER_DASHBOARD_URL;
    }
    return DRIVER_INDEX_URL + 'index.html?portal=main-app';
}

function syncMainAppPortalLinks() {
    if (typeof document === 'undefined') return;
    if (getCurrentPathname().indexOf('/driver/') !== -1) return;

    var portalLinks = document.querySelectorAll('a.user-panel-link:not(.driver-home-link)');
    if (!portalLinks.length) return;
    var portalUrl = resolveMainAppPortalLinkUrl(window.medisaSession || getDefaultSession());

    portalLinks.forEach(function(link) {
        link.setAttribute('href', portalUrl);
    });
}

/** Dış Veri paneli dosya/Excel odaklı; mobil ve iOS PWA’da desteklenmiyor (ayarlar.openDisVeriPanel ile aynı kural). */
function medisaIsDisVeriPanelUnavailableOnDevice() {
    var hasMatchMedia = typeof window.matchMedia === 'function';
    var isMobileViewport = hasMatchMedia
        ? window.matchMedia('(max-width: 640px)').matches
        : window.innerWidth <= 640;
    var ua = navigator.userAgent || '';
    var isiOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var isStandalone = hasMatchMedia &&
        (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches);
    return isMobileViewport || (isiOS && (isStandalone || window.navigator.standalone === true));
}
window.medisaIsDisVeriPanelUnavailableOnDevice = medisaIsDisVeriPanelUnavailableOnDevice;

function setMedisaSession(sessionData) {
    var tokenSession = getSessionFromToken();
    var nextSession = Object.assign({}, getDefaultSession(), tokenSession, sessionData || {});
    var mergedRoleSource = nextSession.role || (nextSession.user && nextSession.user.role) || '';
    nextSession.branch_ids = Array.isArray(nextSession.branch_ids) ? nextSession.branch_ids.map(String).filter(Boolean) : [];
    nextSession.raw_role = String(nextSession.raw_role || mergedRoleSource || '').trim();
    nextSession.role = normalizeSessionRole(mergedRoleSource);
    nextSession.permissions = normalizeSessionPermissions(nextSession.role || '', nextSession.permissions);
    nextSession.user = Object.assign({}, getDefaultSession().user, nextSession.user || {});
    nextSession.user.id = nextSession.user.id != null ? String(nextSession.user.id) : '';
    nextSession.user.role = normalizeSessionRole(nextSession.user.role || nextSession.role || '');
    nextSession.user.branch_ids = Array.isArray(nextSession.user.branch_ids) ? nextSession.user.branch_ids.map(String).filter(Boolean) : nextSession.branch_ids.slice();
    if (nextSession.user.kullanici_paneli !== true && nextSession.user.kullanici_paneli !== false) {
        nextSession.user.kullanici_paneli = !!nextSession.kullanici_paneli;
    }
    window.medisaSession = nextSession;
    applyMainAppSessionUiState();
    invalidateMedisaVisibleCache();
}

function resolveMainAppHeaderUserName(sessionData) {
    var session = sessionData && typeof sessionData === 'object' ? sessionData : getDefaultSession();
    var directName = String((session.user && (session.user.isim || session.user.name)) || '').trim();
    if (directName !== '') {
        return directName;
    }

    var userId = String((session.user && session.user.id) || '').trim();
    if (userId === '' || !window.appData || !Array.isArray(window.appData.users)) {
        return '';
    }

    for (var i = 0; i < window.appData.users.length; i++) {
        var user = window.appData.users[i];
        if (String((user && user.id) || '') !== userId) continue;
        return String((user && (user.isim || user.name)) || '').trim();
    }

    return '';
}

function syncMainAppHeaderUserName(sessionData) {
    if (typeof document === 'undefined') return;
    if (getCurrentPathname().indexOf('/driver/') !== -1) return;

    var nameEl = document.getElementById('main-header-user-name');
    if (!nameEl) return;

    var displayName = resolveMainAppHeaderUserName(sessionData);
    nameEl.textContent = displayName;
    nameEl.classList.toggle('is-empty', displayName === '');
}

function clearMainAppAuthGate() {
    if (typeof document === 'undefined') return;
    if (getCurrentPathname().indexOf('/driver/') !== -1) return;
    if (!document.body) return;
    document.body.classList.remove('main-auth-gate-active');
}

function applyMainAppSessionUiState() {
    if (typeof document === 'undefined') return;
    if (getCurrentPathname().indexOf('/driver/') !== -1) return;

    syncMainAppPortalLinks();

    var session = window.medisaSession || getDefaultSession();
    syncMainAppHeaderUserName(session);
    var logoutBtn = document.getElementById('settings-logout-btn');
    if (logoutBtn) {
        logoutBtn.style.display = getStoredPortalToken() ? '' : 'none';
    }
    var changePasswordBtn = document.getElementById('settings-change-password-btn');
    if (changePasswordBtn) {
        changePasswordBtn.style.display = getStoredPortalToken() ? '' : 'none';
    }

    var mainUserPanelLink = document.getElementById('main-user-panel-link');
    if (mainUserPanelLink) {
        mainUserPanelLink.style.display = canShowMainUserPanelLink(session) ? '' : 'none';
    }

    var branchBtn = document.getElementById('settings-branch-btn');
    var userBtn = document.getElementById('settings-user-btn');
    var disVeriBtn = document.getElementById('dis-veri-btn');
    var backupWrap = document.getElementById('settings-data-wrap');
    var clearCacheBtn = document.getElementById('settings-clear-cache-btn');

    if (branchBtn) branchBtn.style.display = 'none';
    if (userBtn) userBtn.style.display = 'none';
    if (disVeriBtn) disVeriBtn.style.display = 'none';
    if (backupWrap) backupWrap.style.display = 'none';
    if (clearCacheBtn) clearCacheBtn.style.display = 'none';

    if (!session.authenticated) return;

    document.body.dataset.medisaRole = session.role || '';

    if (session.role === 'kullanici') {
        if (session.driver_dashboard === true) {
            redirectToDriverDashboard();
        } else {
            medisaMainAppLogout();
        }
        return;
    }

    if (branchBtn) branchBtn.style.display = session.permissions.manage_branches ? '' : 'none';
    if (userBtn) userBtn.style.display = session.permissions.manage_users ? '' : 'none';
    if (disVeriBtn) {
        disVeriBtn.style.display = (session.permissions.manage_data && !medisaIsDisVeriPanelUnavailableOnDevice()) ? '' : 'none';
    }
    if (backupWrap) backupWrap.style.display = session.permissions.manage_data ? '' : 'none';
    if (clearCacheBtn) {
        clearCacheBtn.style.display = (session.permissions.manage_data || session.permissions.manage_settings) ? '' : 'none';
    }

    clearMainAppAuthGate();
}

function ensureMainAppSession() {
    if (getCurrentPathname().indexOf('/driver/') !== -1) return true;
    var token = getStoredPortalToken();
    if (!token) {
        redirectToPortalLogin();
        return false;
    }
    return true;
}

function normalizeOfflineAppDataSnapshot(data) {
    data = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    return {
        tasitlar: Array.isArray(data.tasitlar) ? data.tasitlar : (Array.isArray(data.vehicles) ? data.vehicles : []),
        kayitlar: Array.isArray(data.kayitlar) ? data.kayitlar : [],
        branches: Array.isArray(data.branches) ? data.branches : [],
        users: Array.isArray(data.users) ? data.users : [],
        ayarlar: data.ayarlar || {
            sirketAdi: 'Medisa',
            yetkiliKisi: '',
            telefon: '',
            eposta: '',
            k2Belgesi: {
                expiryDate: '',
                documentPath: '',
                updatedAt: ''
            }
        },
        sifreler: Array.isArray(data.sifreler) ? data.sifreler : [],
        arac_aylik_hareketler: Array.isArray(data.arac_aylik_hareketler) ? data.arac_aylik_hareketler : [],
        duzeltme_talepleri: Array.isArray(data.duzeltme_talepleri) ? data.duzeltme_talepleri : [],
        kaskoDegerListesi: {
            updatedAt: String((data.kaskoDegerListesi && data.kaskoDegerListesi.updatedAt) || ''),
            period: String((data.kaskoDegerListesi && data.kaskoDegerListesi.period) || ''),
            sourceFileName: String((data.kaskoDegerListesi && data.kaskoDegerListesi.sourceFileName) || ''),
            rows: []
        },
        notificationReadState: (data.notificationReadState && typeof data.notificationReadState === 'object' && !Array.isArray(data.notificationReadState))
            ? data.notificationReadState
            : {},
        monthlyTodoWhatsAppLogs: (data.monthlyTodoWhatsAppLogs && typeof data.monthlyTodoWhatsAppLogs === 'object' && !Array.isArray(data.monthlyTodoWhatsAppLogs))
            ? data.monthlyTodoWhatsAppLogs
            : {}
    };
}

function readOfflineAppDataSnapshot() {
    var keys = ['medisa_data_v1', 'medisa_server_backup'];
    for (var i = 0; i < keys.length; i++) {
        try {
            var savedData = localStorage.getItem(keys[i]);
            if (!savedData) continue;
            var normalized = normalizeOfflineAppDataSnapshot(JSON.parse(savedData));
            if (hasUsableAppData(normalized)) return normalized;
        } catch (e) {}
    }
    return null;
}

function persistOfflineAppDataSnapshot(data) {
    try {
        var snapshot = normalizeOfflineAppDataSnapshot(data);
        if (!hasUsableAppData(snapshot)) return;
        localStorage.setItem('medisa_data_v1', JSON.stringify(snapshot));
    } catch (e) {}
}

function loadDataFromLocalStorage() {
    var offlineSnapshot = readOfflineAppDataSnapshot();
    window.appData = offlineSnapshot || getDefaultAppData();
    setMedisaSession(getSessionFromToken());
    serverDatasetTrusted = false;
    syncDataLoadState();
    return window.appData;
}

/**
 * Kompakt kasko lookup indeksini ayrı endpoint’ten yükler (mode=index).
 * Tam satır matrisi appData’ya yazılmaz.
 * @param {boolean} [forceRefresh]
 * @returns {Promise<boolean>}
 */
var kaskoIndexLoadPromise = null;

function medisaClearKaskoLookupRuntime() {
    window.__medisaKaskoLookupIndex = null;
    window.__medisaKaskoLookupYears = null;
    window.__medisaKaskoLookupRevision = '';
    window.__medisaKaskoLookupRowCount = 0;
    window.__medisaKaskoLookupAvailable = false;
    window.__medisaKaskoLookupLoaded = false;
}

function medisaUnpackKaskoPackedLookup(payload) {
    var years = Array.isArray(payload.years) ? payload.years.map(String) : [];
    var packed = payload.lookup;
    var out = Object.create(null);

    if (!packed || typeof packed !== 'object' || Array.isArray(packed)) {
        return { years: years, lookup: out, rowCount: 0 };
    }

    if (packed.format !== 'packed-v1') {
        Object.keys(packed).forEach(function(code) {
            var yearMap = packed[code];
            if (!yearMap || typeof yearMap !== 'object' || Array.isArray(yearMap)) return;
            var norm = String(code || '').replace(/[^0-9]/g, '').replace(/^0+/, '');
            if (!norm) return;
            var clean = Object.create(null);
            Object.keys(yearMap).forEach(function(year) {
                var n = Number(yearMap[year]);
                if (year && n > 0) clean[String(year)] = n;
            });
            out[norm] = clean;
        });
        return { years: years, lookup: out, rowCount: Object.keys(out).length };
    }

    function decodeBase36(token) {
        token = String(token || '').trim();
        if (!token) return null;
        if (token.charAt(0) === '~') {
            var raw = token.slice(1);
            var f = Number(raw);
            return Number.isFinite(f) ? f : null;
        }
        if (!/^[0-9a-z]+$/i.test(token)) return null;
        var dec = parseInt(token, 36);
        return Number.isFinite(dec) ? dec : null;
    }

    var codeTokens = packed.codes ? String(packed.codes).split(',') : [];
    var packTokens = packed.packs != null ? String(packed.packs).split(';') : [];
    if (codeTokens.length !== packTokens.length) {
        throw new Error('Kasko packed lookup uzunluk uyumsuz');
    }

    var prev = 0;
    for (var i = 0; i < codeTokens.length; i++) {
        var delta = decodeBase36(codeTokens[i]);
        if (delta == null) throw new Error('Kasko packed code token gecersiz');
        var codeInt = i === 0 ? delta : (prev + delta);
        prev = codeInt;
        var code = String(codeInt);
        var pack = packTokens[i];
        var yearMap = Object.create(null);
        if (pack) {
            var parts = pack.split('|');
            if (parts.length !== 2) throw new Error('Kasko packed pack gecersiz');
            var minPos = decodeBase36(parts[0]);
            if (minPos == null) throw new Error('Kasko packed minPos gecersiz');
            var valueTokens = parts[1] ? parts[1].split(',') : [];
            for (var offset = 0; offset < valueTokens.length; offset++) {
                var vt = valueTokens[offset];
                if (!vt) continue;
                var num = decodeBase36(vt);
                if (!(num > 0)) continue;
                var pos = minPos + offset;
                if (years[pos] == null) continue;
                yearMap[String(years[pos])] = num;
            }
        }
        out[code] = yearMap;
    }

    return {
        years: years,
        lookup: out,
        rowCount: Object.keys(out).length
    };
}

async function loadKaskoListIntoAppData(forceRefresh) {
    try {
        if (!ensureMainAppSession()) return false;
        if (forceRefresh === true) {
            medisaClearKaskoLookupRuntime();
            if (typeof window.clearKaskoCache === 'function') window.clearKaskoCache();
        } else if (window.__medisaKaskoLookupLoaded === true) {
            return true;
        }

        if (kaskoIndexLoadPromise) return kaskoIndexLoadPromise;

        kaskoIndexLoadPromise = (async function() {
            var url = API_LOAD_KASKO + '?mode=index&t=' + Date.now();
            var response = await fetch(url, {
                method: 'GET',
                headers: buildAuthHeaders({
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache'
                }),
                cache: 'no-store'
            });
            if (!response.ok) return false;
            var kd = await response.json();
            if (!kd || typeof kd !== 'object' || kd.success === false) return false;
            if (Number(kd.schemaVersion) !== 1) return false;
            if (!kd.lookup || typeof kd.lookup !== 'object' || Array.isArray(kd.lookup)) return false;
            if (!Array.isArray(kd.years)) return false;

            var unpacked = medisaUnpackKaskoPackedLookup(kd);
            if (!window.appData || typeof window.appData !== 'object') window.appData = getDefaultAppData();
            window.appData.kaskoDegerListesi = {
                updatedAt: String(kd.updatedAt || ''),
                period: String(kd.period || ''),
                sourceFileName: String(kd.sourceFileName || ''),
                rows: []
            };
            window.__medisaKaskoLookupIndex = unpacked.lookup;
            window.__medisaKaskoLookupYears = unpacked.years;
            window.__medisaKaskoLookupRevision = String(kd.revision || '');
            window.__medisaKaskoLookupRowCount = Number(kd.rowCount) || unpacked.rowCount || 0;
            window.__medisaKaskoLookupAvailable = window.__medisaKaskoLookupRowCount > 0;
            window.__medisaKaskoLookupLoaded = true;
            if (typeof window.clearKaskoCache === 'function') window.clearKaskoCache();
            return true;
        })().catch(function() {
            return false;
        }).finally(function() {
            kaskoIndexLoadPromise = null;
        });

        return kaskoIndexLoadPromise;
    } catch (e) {
        return false;
    }
}

window.loadKaskoListFromServer = loadKaskoListIntoAppData;
window.medisaClearKaskoLookupRuntime = medisaClearKaskoLookupRuntime;

async function loadDataFromServer(forceRefresh) {
    if (forceRefresh !== true && serverDatasetTrusted === true && hasUsableAppData(window.appData)) {
        return Promise.resolve(window.appData);
    }

    if (!ensureMainAppSession()) {
        window.appData = getDefaultAppData();
        serverDatasetTrusted = false;
        syncDataLoadState();
        invalidateMedisaVisibleCache();
        return Promise.reject(new Error('Medisa oturum yok'));
    }

    if (loadPromise) {
        return loadPromise;
    }

    isDataLoading = true;
    syncDataLoadState();

    loadPromise = (async function() {
        function finishLoadError(optionalErr) {
            serverDatasetTrusted = false;
            window.appData = hasUsableAppData(window.appData)
                ? getSafeAppDataFallback()
                : (readOfflineAppDataSnapshot() || getSafeAppDataFallback());
            invalidateMedisaVisibleCache();
            if (hasUsableAppData(window.appData)) {
                showOfflineReadonlyWarning();
                return window.appData;
            }
            var e = optionalErr || new Error('Medisa veri yüklenemedi');
            e.medisaNoUsableFallback = true;
            throw e;
        }

        try {
            var cacheBuster = Date.now();
            var url = API_LOAD + '?t=' + cacheBuster;
            var response = await fetch(url, {
                method: 'GET',
                headers: buildAuthHeaders({
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                }),
                cache: 'no-store'
            });

            if (!response.ok && response.status === 503) {
                if ((typeof navigator !== 'undefined' && navigator.onLine === false) || readOfflineAppDataSnapshot()) {
                    return finishLoadError(new Error('HTTP 503'));
                }
                isDataLoading = false;
                loadPromise = null;
                syncDataLoadState();
                await new Promise(function(resolve) { setTimeout(resolve, 2000); });
                return await loadDataFromServer(forceRefresh);
            }

            if (response.status === 401 || response.status === 403) {
                clearStoredPortalTokens();
                redirectToPortalLogin();
                serverDatasetTrusted = false;
                window.appData = getDefaultAppData();
                invalidateMedisaVisibleCache();
                var authErr = new Error('Unauthorized');
                authErr.medisaHttpStatus = response.status;
                throw authErr;
            }

            if (!response.ok) {
                var errorText = await response.text().catch(function() { return 'Yanıt okunamadı'; });
                console.error('[Medisa] loadDataFromServer HTTP hatası', response.status, String(errorText).substring(0, 200));
                return finishLoadError(new Error('HTTP ' + response.status));
            }

            var responseText = await response.text();
            if (!responseText || responseText.trim() === '') {
                return finishLoadError(new Error('Empty response'));
            }

            var data;
            try {
                data = JSON.parse(responseText);
            } catch (parseErr) {
                console.warn('[Medisa] loadDataFromServer parse hatası', parseErr && parseErr.message);
                return finishLoadError(parseErr);
            }

            if (!data || typeof data !== 'object' || Array.isArray(data)) {
                return finishLoadError(new Error('Invalid load payload'));
            }

            window.appData = {
                tasitlar: data.tasitlar || [],
                kayitlar: data.kayitlar || [],
                branches: data.branches || [],
                users: data.users || [],
                ayarlar: data.ayarlar || {
                    sirketAdi: 'Medisa',
                    yetkiliKisi: '',
                    telefon: '',
                    eposta: '',
                    k2Belgesi: {
                        expiryDate: '',
                        documentPath: '',
                        updatedAt: ''
                    }
                },
                sifreler: data.sifreler || [],
                arac_aylik_hareketler: data.arac_aylik_hareketler || [],
                duzeltme_talepleri: data.duzeltme_talepleri || [],
                kaskoDegerListesi: {
                    updatedAt: '',
                    period: '',
                    sourceFileName: '',
                    rows: []
                },
                notificationReadState: (data.notificationReadState && typeof data.notificationReadState === 'object' && !Array.isArray(data.notificationReadState))
                    ? data.notificationReadState
                    : {},
                monthlyTodoWhatsAppLogs: (data.monthlyTodoWhatsAppLogs && typeof data.monthlyTodoWhatsAppLogs === 'object' && !Array.isArray(data.monthlyTodoWhatsAppLogs))
                    ? data.monthlyTodoWhatsAppLogs
                    : {}
            };

            invalidateMedisaVisibleCache();
            setMedisaSession(data.session || getSessionFromToken());

            serverDatasetTrusted = true;
            setServerDatasetBaseline(window.appData);
            persistOfflineAppDataSnapshot(window.appData);
            return window.appData;
        } catch (error) {
            if (error && error.medisaHttpStatus) {
                throw error;
            }
            if (error && error.medisaNoUsableFallback) {
                throw error;
            }
            console.warn('[Medisa] Veri yüklenemedi:', error && error.message);
            return finishLoadError(error);
        } finally {
            isDataLoading = false;
            loadPromise = null;
            syncDataLoadState();
        }
    })();

    return loadPromise;
}

var serverDatasetBaseline = null;

function cloneServerDatasetValue(value) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (e) {
        return null;
    }
}

function setServerDatasetBaseline(data) {
    serverDatasetBaseline = cloneServerDatasetValue(data);
}

function medisaValuesEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

/** save.php persist allowlist — arac_aylik_hareketler / duzeltme_talepleri driver|admin owner. */
var MEDISA_SAVE_PERSIST_COLLECTIONS = [
    'kayitlar',
    'branches',
    'users',
    'ayarlar',
    'sifreler',
    'notificationReadState',
    'monthlyTodoWhatsAppLogs'
];

function medisaFindDuplicateVehicleIds(vehicles) {
    var seen = {};
    var duplicates = [];
    (Array.isArray(vehicles) ? vehicles : []).forEach(function(vehicle) {
        if (!vehicle || vehicle.id == null) return;
        var id = String(vehicle.id).trim();
        if (!id) return;
        if (seen[id]) {
            if (duplicates.indexOf(id) === -1) duplicates.push(id);
            return;
        }
        seen[id] = true;
    });
    return duplicates;
}

function buildSaveMutationIntent() {
    var current = window.appData || {};
    var baseline = serverDatasetBaseline || {};
    var collections = [];
    MEDISA_SAVE_PERSIST_COLLECTIONS.forEach(function(key) {
        if (!medisaValuesEqual(current[key], baseline[key])) collections.push(key);
    });

    var currentVehicles = Array.isArray(current.tasitlar) ? current.tasitlar : [];
    var baselineVehicles = Array.isArray(baseline.tasitlar) ? baseline.tasitlar : [];
    var currentById = {};
    var baselineById = {};
    currentVehicles.forEach(function(vehicle) {
        if (vehicle && vehicle.id != null) currentById[String(vehicle.id)] = vehicle;
    });
    baselineVehicles.forEach(function(vehicle) {
        if (vehicle && vehicle.id != null) baselineById[String(vehicle.id)] = vehicle;
    });

    var changedVehicleIds = [];
    Object.keys(currentById).forEach(function(id) {
        if (!Object.prototype.hasOwnProperty.call(baselineById, id) || !medisaValuesEqual(currentById[id], baselineById[id])) {
            changedVehicleIds.push(id);
        }
    });
    var deletedVehicleIds = Object.keys(baselineById).filter(function(id) {
        return !Object.prototype.hasOwnProperty.call(currentById, id);
    });
    var deletedVehicleVersions = {};
    deletedVehicleIds.forEach(function(id) {
        deletedVehicleVersions[id] = Number(baselineById[id] && baselineById[id].version) || 1;
    });
    if (changedVehicleIds.length || deletedVehicleIds.length) collections.push('tasitlar');

    return {
        collections: collections,
        changedVehicleIds: changedVehicleIds,
        deletedVehicleIds: deletedVehicleIds,
        deletedVehicleVersions: deletedVehicleVersions
    };
}

/**
 * Delta-v1 save wire owner. Full appData kopyalamaz.
 * @returns {{
 *   ok: boolean,
 *   reason?: string,
 *   isNoOp?: boolean,
 *   wirePayload?: object,
 *   mutationIntent?: object,
 *   baselinePatchSnapshot?: object,
 *   wireMetrics?: object
 * }}
 */
function buildSaveWirePayload(options) {
    options = options || {};
    var current = window.appData || {};
    var duplicateIds = medisaFindDuplicateVehicleIds(current.tasitlar);
    if (duplicateIds.length) {
        return { ok: false, reason: 'duplicate_vehicle_ids', duplicateVehicleIds: duplicateIds };
    }

    var mutationIntent = buildSaveMutationIntent();
    var passwordChanges = options.userPasswordChanges && typeof options.userPasswordChanges === 'object'
        ? options.userPasswordChanges
        : null;
    var sanitizedPasswordChanges = null;
    if (passwordChanges) {
        sanitizedPasswordChanges = {};
        Object.keys(passwordChanges).forEach(function(userId) {
            var key = String(userId || '').trim();
            if (!key) return;
            var value = passwordChanges[userId];
            if (value == null || typeof value === 'object') return;
            sanitizedPasswordChanges[key] = String(value);
        });
        if (Object.keys(sanitizedPasswordChanges).length === 0) {
            sanitizedPasswordChanges = null;
        } else if ((mutationIntent.collections || []).indexOf('users') === -1) {
            mutationIntent.collections = (mutationIntent.collections || []).concat(['users']);
        }
    }

    var isNoOp = !(mutationIntent.collections || []).length
        && !(mutationIntent.changedVehicleIds || []).length
        && !(mutationIntent.deletedVehicleIds || []).length
        && !sanitizedPasswordChanges;
    if (isNoOp) {
        return {
            ok: true,
            isNoOp: true,
            mutationIntent: mutationIntent,
            wirePayload: null,
            baselinePatchSnapshot: null,
            wireMetrics: { legacyBytes: 0, deltaBytes: 0, networkBytes: 0 }
        };
    }

    var wirePayload = {
        _medisaWire: {
            schemaVersion: 1,
            mode: 'delta-v1'
        },
        _medisaMutation: mutationIntent
    };
    if (sanitizedPasswordChanges) {
        wirePayload._medisaUserPasswordChanges = sanitizedPasswordChanges;
    }

    var changedLookup = {};
    (mutationIntent.changedVehicleIds || []).forEach(function(id) {
        changedLookup[String(id)] = true;
    });
    var baselinePatchSnapshot = {};

    (mutationIntent.collections || []).forEach(function(key) {
        if (key === 'tasitlar') {
            var currentVehicles = Array.isArray(current.tasitlar) ? current.tasitlar : [];
            var changedVehicles = currentVehicles.filter(function(vehicle) {
                return vehicle && vehicle.id != null && changedLookup[String(vehicle.id)];
            }).map(function(vehicle) {
                return cloneServerDatasetValue(vehicle);
            });
            wirePayload.tasitlar = changedVehicles;
            baselinePatchSnapshot.tasitlar = cloneServerDatasetValue(changedVehicles);
            return;
        }
        var cloned = cloneServerDatasetValue(current[key]);
        wirePayload[key] = cloned;
        baselinePatchSnapshot[key] = cloneServerDatasetValue(cloned);
    });

    delete wirePayload.kaskoDegerListesi;
    delete wirePayload.__medisaKaskoLookupIndex;
    delete wirePayload.__medisaKaskoLookupYears;
    delete baselinePatchSnapshot.kaskoDegerListesi;
    delete baselinePatchSnapshot.__medisaKaskoLookupIndex;
    delete baselinePatchSnapshot.__medisaKaskoLookupYears;

    var deltaBytes = 0;
    try {
        deltaBytes = JSON.stringify(wirePayload).length;
    } catch (e) {
        return { ok: false, reason: 'stringify_failed' };
    }

    return {
        ok: true,
        isNoOp: false,
        wirePayload: wirePayload,
        mutationIntent: mutationIntent,
        baselinePatchSnapshot: baselinePatchSnapshot,
        wireMetrics: {
            deltaBytes: deltaBytes,
            networkBytes: deltaBytes
        }
    };
}

function updateServerDatasetBaselineAfterSave(intent, requestSnapshot, versionMap) {
    if (!requestSnapshot || typeof requestSnapshot !== 'object') {
        return;
    }
    versionMap = versionMap && typeof versionMap === 'object' ? versionMap : {};
    if (!serverDatasetBaseline) {
        setServerDatasetBaseline(requestSnapshot);
        return;
    }
    (intent.collections || []).forEach(function(key) {
        if (key !== 'tasitlar') serverDatasetBaseline[key] = cloneServerDatasetValue(requestSnapshot[key]);
    });
    if ((intent.collections || []).indexOf('tasitlar') === -1) return;

    var changedIds = {};
    (intent.changedVehicleIds || []).forEach(function(id) { changedIds[String(id)] = true; });
    var deletedIds = {};
    (intent.deletedVehicleIds || []).forEach(function(id) { deletedIds[String(id)] = true; });
    var snapshotVehicles = Array.isArray(requestSnapshot.tasitlar) ? requestSnapshot.tasitlar : [];
    var baselineVehicles = Array.isArray(serverDatasetBaseline.tasitlar) ? serverDatasetBaseline.tasitlar : [];
    var snapshotById = {};
    snapshotVehicles.forEach(function(vehicle) {
        if (vehicle && vehicle.id != null) snapshotById[String(vehicle.id)] = vehicle;
    });
    serverDatasetBaseline.tasitlar = baselineVehicles.filter(function(vehicle) {
        var id = vehicle && vehicle.id != null ? String(vehicle.id) : '';
        return id && !deletedIds[id] && !changedIds[id];
    });
    Object.keys(changedIds).forEach(function(id) {
        if (!snapshotById[id]) return;
        var vehicle = cloneServerDatasetValue(snapshotById[id]);
        if (Object.prototype.hasOwnProperty.call(versionMap, id)) {
            vehicle.version = versionMap[id];
        }
        serverDatasetBaseline.tasitlar.push(vehicle);
    });
}

async function saveDataToServer(options) {
    if (!ensureMainAppSession()) return false;
    if (!serverDatasetTrusted) return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        showOfflineReadonlyWarning();
        return false;
    }

    var prevMutex = saveMutex;
    var releaseNext;
    saveMutex = new Promise(function(resolve) {
        releaseNext = resolve;
    });
    await prevMutex.catch(function() {});

    isSaving = true;
    syncDataLoadState();
    try {
        var built = buildSaveWirePayload(options || {});
        if (!built || built.ok === false) {
            if (built && built.reason === 'duplicate_vehicle_ids') {
                console.warn('[Medisa] Yinelenen taşıt kimliği nedeniyle kayıt engellendi.');
            }
            return false;
        }
        if (built.isNoOp) {
            return true;
        }

        var payloadObj = built.wirePayload;
        var mutationIntent = built.mutationIntent;
        delete payloadObj.kaskoDegerListesi;
        var requestBody = JSON.stringify(payloadObj);
        var requestSnapshot = built.baselinePatchSnapshot
            ? cloneServerDatasetValue(built.baselinePatchSnapshot)
            : null;
        if (!requestSnapshot) {
            try {
                requestSnapshot = JSON.parse(requestBody);
            } catch (snapshotParseErr) {
                console.warn('[Medisa] Kayıt snapshot doğrulanamadı:', snapshotParseErr && snapshotParseErr.message);
                return false;
            }
        }
        delete requestSnapshot._medisaMutation;
        delete requestSnapshot._medisaWire;
        delete requestSnapshot._medisaUserPasswordChanges;

        var response = await fetch(API_SAVE, {
            method: 'POST',
            headers: buildAuthHeaders({
                'Content-Type': 'application/json'
            }),
            body: requestBody
        });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                clearStoredPortalTokens();
                redirectToPortalLogin();
                return false;
            }
            if (response.status === 409) {
                var conflictError = new Error('Conflict');
                conflictError.conflict = true;
                try {
                    var conflictBody = await response.json();
                    if (conflictBody && typeof conflictBody === 'object') {
                        if (typeof conflictBody.message === 'string' && conflictBody.message.trim() !== '') {
                            conflictError.medisaServerMessage = conflictBody.message.trim();
                        }
                        if (conflictBody.entity != null && String(conflictBody.entity).trim() !== '') {
                            conflictError.medisaConflictEntity = String(conflictBody.entity).trim();
                        }
                        if (conflictBody.id != null && String(conflictBody.id).trim() !== '') {
                            conflictError.medisaConflictId = String(conflictBody.id).trim();
                        }
                    }
                } catch (parse409Err) {}
                throw conflictError;
            }
            throw new Error('HTTP error! status: ' + response.status);
        }

        var data = await response.json();
        if (data && data.conflict === true) {
            var conflictErr = new Error('Conflict');
            conflictErr.conflict = true;
            if (typeof data.message === 'string' && data.message.trim() !== '') {
                conflictErr.medisaServerMessage = data.message.trim();
            }
            if (data.entity != null && String(data.entity).trim() !== '') {
                conflictErr.medisaConflictEntity = String(data.entity).trim();
            }
            if (data.id != null && String(data.id).trim() !== '') {
                conflictErr.medisaConflictId = String(data.id).trim();
            }
            throw conflictErr;
        }

        var versionMap = {};
        if (data && Array.isArray(data.vehicleVersions)) {
            data.vehicleVersions.forEach(function(item) {
                var id = item && item.id != null ? String(item.id) : '';
                if (!id) return;
                versionMap[id] = Number(item.version) || 1;
            });
        }
        if (Object.keys(versionMap).length && window.appData && Array.isArray(window.appData.tasitlar)) {
            window.appData.tasitlar = window.appData.tasitlar.map(function(vehicle) {
                if (!vehicle || vehicle.id == null) return vehicle;
                var vehicleId = String(vehicle.id);
                if (!Object.prototype.hasOwnProperty.call(versionMap, vehicleId)) return vehicle;
                return Object.assign({}, vehicle, {
                    version: versionMap[vehicleId]
                });
            });
        }

        try {
            var autoBackup = Object.assign({}, window.appData, {
                upload_date: new Date().toISOString(),
                version: '1.1',
                source: 'auto_shadow_backup'
            });
            delete autoBackup.kaskoDegerListesi;
            localStorage.setItem('medisa_server_backup', JSON.stringify(autoBackup));
        } catch (storageErr) {}
        persistOfflineAppDataSnapshot(window.appData);
        updateServerDatasetBaselineAfterSave(mutationIntent, requestSnapshot, versionMap);

        medisaInvalidateVehicleDateTasksCacheIfAvailable();
        return true;
    } catch (error) {
        if (error && error.conflict === true) {
            throw error;
        }
        if (error.message && error.message.indexOf('405') !== -1) {
            return false;
        }
        if (error.message && error.message.indexOf('409') !== -1) {
            var conflictErr2 = new Error('Conflict');
            conflictErr2.conflict = true;
            throw conflictErr2;
        }
        if (error.message && (error.message.indexOf('404') !== -1 || error.message.indexOf('Failed to fetch') !== -1 || error.message.indexOf('NetworkError') !== -1)) {
            console.warn('[Medisa] Kayıt sunucuya ulaşılamadı. Lütfen bağlantıyı kontrol edip tekrar deneyin.');
            showOfflineReadonlyWarning();
            return false;
        }
        console.warn('[Medisa] Veri kaydedilemedi:', error.message);
        return false;
    } finally {
        isSaving = false;
        syncDataLoadState();
        invalidateMedisaVisibleCache();
        if (typeof releaseNext === 'function') releaseNext();
    }
}

function normalizeUser(user) {
    if (!user || typeof user !== 'object') {
        return {
            id: '',
            name: '',
            phone: '',
            branchId: '',
            branchIds: [],
            role: 'kullanici',
            kullanici_paneli: false,
            surucu_paneli: false
        };
    }

    var id = user.id != null ? String(user.id) : '';
    var name = user.name || user.isim || '';
    if (!name && (user.firstName || user.lastName)) {
        name = ((user.firstName || '') + ' ' + (user.lastName || '')).trim();
    }
    var phone = user.phone != null ? String(user.phone) : (user.telefon != null ? String(user.telefon) : '');

    var branchIds = [];
    if (Array.isArray(user.branchIds)) {
        branchIds = user.branchIds.map(String).filter(Boolean);
    } else if (Array.isArray(user.sube_ids)) {
        branchIds = user.sube_ids.map(String).filter(Boolean);
    } else if (user.branchId != null && user.branchId !== '') {
        branchIds = [String(user.branchId)];
    } else if (user.sube_id != null && user.sube_id !== '') {
        branchIds = [String(user.sube_id)];
    }
    var branchId = branchIds[0] || '';

    var role = user.role || user.rol || '';
    if (!role && user.tip) {
        if (user.tip === 'admin') role = 'genel_yonetici';
        else if (user.tip === 'yonetici' || user.tip === 'sube_yonetici') role = 'sube_yonetici';
        else role = 'kullanici';
    }
    if (role === 'admin') role = 'genel_yonetici';
    if (role === 'yonetici') role = 'sube_yonetici';
    if (role === 'yonetici_kullanici') role = 'sube_yonetici';
    if (role === 'driver' || role === 'sales' || role === 'surucu') role = 'kullanici';
    if (!role) role = 'kullanici';

    var kullaniciPaneli = user.kullanici_paneli;
    if (kullaniciPaneli === undefined) {
        kullaniciPaneli = user.surucu_paneli;
    }
    if (kullaniciPaneli === undefined) {
        kullaniciPaneli = false;
    }

    return Object.assign({}, user, {
        id: id,
        name: name,
        phone: phone,
        branchId: branchId,
        branchIds: branchIds,
        role: role,
        kullanici_paneli: !!kullaniciPaneli,
        surucu_paneli: !!kullaniciPaneli
    });
}

function normalizeUsers(arr) {
    return Array.isArray(arr) ? arr.map(normalizeUser) : [];
}

function getSessionScope() {
    return window.medisaSession && window.medisaSession.authenticated ? window.medisaSession : getSessionFromToken();
}

function arrayHasId(list, value) {
    return Array.isArray(list) && list.some(function(entry) { return String(entry) === String(value); });
}

function getUserBranchIds(user) {
    return normalizeUser(user).branchIds;
}

function isUserWithinManagedBranches(user, allowedBranchIds) {
    var targetBranchIds = getUserBranchIds(user);
    if (targetBranchIds.length === 0) return false;
    return targetBranchIds.every(function(branchId) { return arrayHasId(allowedBranchIds, branchId); });
}

function getVisibleVehicles(vehicles) {
    var list = Array.isArray(vehicles) ? vehicles.slice() : [];
    var session = getSessionScope();
    var sessionRole = getSessionRoleValue(session);
    if (!session.authenticated || !sessionRole || sessionRole === 'genel_yonetici') {
        return list;
    }

    if (isBranchManagerSessionRole(sessionRole)) {
        return list.filter(function(vehicle) {
            return arrayHasId(session.branch_ids || [], vehicle && vehicle.branchId);
        });
    }

    return list.filter(function(vehicle) {
        if (!vehicle || session.user.id === '') return false;
        if (String(vehicle.assignedUserId || '') === String(session.user.id)) return true;
        return false;
    });
}

function getVisibleUsers(users) {
    var normalized = normalizeUsers(users);
    var session = getSessionScope();
    var sessionRole = getSessionRoleValue(session);
    if (!session.authenticated || !sessionRole || sessionRole === 'genel_yonetici') {
        return normalized;
    }

    if (isBranchManagerSessionRole(sessionRole)) {
        return normalized.filter(function(user) {
            if (user.role === 'genel_yonetici') return false;
            if (String(user && user.id) === String(session.user && session.user.id)) return false;
            return isUserWithinManagedBranches(user, session.branch_ids || []);
        });
    }

    return normalized.filter(function(user) {
        return String(user.id) === String(session.user.id);
    });
}

function getVisibleBranches(branches) {
    var list = Array.isArray(branches) ? branches.slice() : [];
    var session = getSessionScope();
    var sessionRole = getSessionRoleValue(session);
    if (!session.authenticated || !sessionRole || sessionRole === 'genel_yonetici') {
        return list;
    }

    var visibleBranchIds = {};
    (session.branch_ids || []).forEach(function(branchId) {
        visibleBranchIds[String(branchId)] = true;
    });
    getMedisaVehicles().forEach(function(vehicle) {
        if (vehicle && vehicle.branchId != null && vehicle.branchId !== '') {
            visibleBranchIds[String(vehicle.branchId)] = true;
        }
    });
    getMedisaUsers().forEach(function(user) {
        getUserBranchIds(user).forEach(function(branchId) {
            visibleBranchIds[String(branchId)] = true;
        });
    });

    return list.filter(function(branch) {
        return !!visibleBranchIds[String(branch && branch.id)];
    });
}

function getMedisaData(key) {
    if (window.appData && Array.isArray(window.appData[key])) {
        return window.appData[key];
    }
    return [];
}

function getMedisaVehicles() {
    return getCachedMedisaVisibleList('vehicles', function() {
        return getVisibleVehicles(getMedisaData('tasitlar'));
    });
}

function getMedisaBranches() {
    return getCachedMedisaVisibleList('branches', function() {
        return getVisibleBranches(getMedisaData('branches'));
    });
}

function getMedisaUsers() {
    return getCachedMedisaVisibleList('users', function() {
        return getVisibleUsers(getMedisaData('users'));
    });
}

function resolveWriteVehiclesConflictUi(options) {
    if (!options || typeof options !== 'object') return 'generic';
    return options.conflictUi === 'caller' ? 'caller' : 'generic';
}

function showWriteVehiclesConflictAlert(conflictUi) {
    if (conflictUi === 'caller') return;
    alert('Dikkat! Veri başka biri tarafından güncellenmiş. Lütfen sayfayı yenileyin.');
}

function notifyWriteVehiclesFallbackPersisted() {
    if (typeof window.updateNotifications === 'function') {
        window.updateNotifications();
    }
}

window.writeVehicles = function(arr, options) {
    if (!window.appData) window.appData = getDefaultAppData();
    applyMainAppSessionUiState();
    var conflictUi = resolveWriteVehiclesConflictUi(options);
    var vehicles = Array.isArray(arr) ? arr : [];

    if (window.dataApi && typeof window.dataApi.saveVehiclesList === 'function') {
        return window.dataApi.saveVehiclesList(vehicles)
            .then(function(result) {
                syncDataLoadState();
                invalidateMedisaVisibleCache();
                return result;
            })
            .catch(function(err) {
                if (err && err.conflict) {
                    showWriteVehiclesConflictAlert(conflictUi);
                    return Promise.reject(err);
                }
                console.error('Sunucuya kaydetme hatası:', err);
                return Promise.reject(err);
            });
    }
    window.appData.tasitlar = vehicles;
    syncDataLoadState();
    invalidateMedisaVisibleCache();
    if (typeof window.saveDataToServer === 'function') {
        return window.saveDataToServer().then(function(ok) {
            if (ok !== true) {
                return Promise.reject(new Error('Sunucuya kayıt yapılamadı.'));
            }
            notifyWriteVehiclesFallbackPersisted();
            return ok;
        }).catch(async function(err) {
            if (err && err.conflict) {
                if (typeof window.loadDataFromServer === 'function') {
                    try {
                        await window.loadDataFromServer(true);
                    } catch (reloadErr) {
                        console.warn('[Medisa] Çakışma sonrası taşıt verisi yenilenemedi:', reloadErr && reloadErr.message);
                    }
                }
                showWriteVehiclesConflictAlert(conflictUi);
                return Promise.reject(err);
            }
            if (err && err.message === 'Sunucuya kayıt yapılamadı.') {
                return Promise.reject(err);
            }
            console.error('Sunucuya kaydetme hatası:', err);
            return Promise.reject(err);
        });
    }
    return Promise.reject(new Error('[Medisa] writeVehicles owner hazır değil; kayıt yapılamadı.'));
};

window.writeBranches = function(arr) {
    if (!window.appData) return Promise.resolve(false);
    window.appData.branches = Array.isArray(arr) ? arr : [];
    syncDataLoadState();
    invalidateMedisaVisibleCache();
    if (typeof window.saveDataToServer === 'function') {
        return window.saveDataToServer().catch(function(err) {
            console.error('Sunucuya kaydetme hatası:', err);
            return false;
        });
    }
    return Promise.resolve(true);
};

window.writeUsers = function(arr) {
    if (!window.appData) return Promise.resolve(false);
    window.appData.users = Array.isArray(arr) ? arr : [];
    syncDataLoadState();
    invalidateMedisaVisibleCache();
    applyMainAppSessionUiState();
    if (typeof window.saveDataToServer === 'function') {
        return window.saveDataToServer().catch(function(err) {
            console.error('Sunucuya kaydetme hatası:', err);
            return false;
        });
    }
    return Promise.resolve(true);
};

window.getMedisaVehicles = getMedisaVehicles;
window.getMedisaBranches = getMedisaBranches;
window.getMedisaUsers = getMedisaUsers;
window.normalizeUsers = normalizeUsers;
window.getMedisaSession = function() { return window.medisaSession || getDefaultSession(); };
window.loadDataFromServer = loadDataFromServer;
window.saveDataToServer = saveDataToServer;
window.buildSaveWirePayload = buildSaveWirePayload;
window.buildSaveMutationIntent = buildSaveMutationIntent;
window.buildAuthHeaders = buildAuthHeaders;

var MAIN_APP_PASSWORD_SUGGESTION_URL = API_BASE + 'driver/driver_password_suggestion.php';
var MAIN_APP_CHANGE_PASSWORD_URL = API_BASE + 'driver/driver_change_password.php';
var mainPasswordSuggestionMode = false;

function resolveMainAppSessionUserRecord() {
    var session = window.medisaSession || getDefaultSession();
    var userId = session && session.user ? String(session.user.id || '').trim() : '';
    if (!userId || !window.appData || !Array.isArray(window.appData.users)) return null;
    for (var i = 0; i < window.appData.users.length; i++) {
        var candidate = window.appData.users[i];
        if (candidate && String(candidate.id || '') === userId) return candidate;
    }
    return null;
}

function patchMainAppSessionUserRecord(patch) {
    if (!patch || typeof patch !== 'object') return;
    var userId = String(patch.id || '').trim();
    if (!userId || !window.appData || !Array.isArray(window.appData.users)) return;
    for (var i = 0; i < window.appData.users.length; i++) {
        if (String(window.appData.users[i].id || '') !== userId) continue;
        window.appData.users[i] = Object.assign({}, window.appData.users[i], patch);
        break;
    }
}

function setMainPasswordMessage(text, isError) {
    var el = document.getElementById('main-password-message');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-error', !!isError);
}

function setMainPasswordSuggestionMessage(text) {
    var el = document.getElementById('main-password-suggestion-message');
    if (!el) return;
    el.textContent = text || '';
}

function setMainPasswordModalMode(isSuggestion, showForm) {
    var title = document.getElementById('main-password-modal-title');
    var closeBtn = document.getElementById('main-password-modal-close');
    var cancelBtn = document.getElementById('main-password-cancel');
    var suggestion = document.getElementById('main-password-suggestion');
    var form = document.getElementById('main-password-form');
    mainPasswordSuggestionMode = isSuggestion === true;
    if (title) {
        title.textContent = isSuggestion
            ? 'Parolanızı Değiştirmeniz Önerilir'
            : 'Parolamı Değiştir';
    }
    if (closeBtn) closeBtn.hidden = isSuggestion;
    if (cancelBtn) cancelBtn.hidden = isSuggestion;
    if (suggestion) suggestion.hidden = !(isSuggestion && !showForm);
    if (form) form.hidden = isSuggestion && !showForm;
}

function openMainPasswordModalOverlay() {
    var modal = document.getElementById('main-password-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    requestAnimationFrame(function() { modal.classList.add('active'); });
    if (document.body) document.body.classList.add('modal-open');
}

function forceCloseMainPasswordModal() {
    mainPasswordSuggestionMode = false;
    var modal = document.getElementById('main-password-modal');
    var form = document.getElementById('main-password-form');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
    if (form) form.reset();
    setMainPasswordMessage('', false);
    setMainPasswordSuggestionMessage('');
    if (document.body) document.body.classList.remove('modal-open');
}

function closeMainPasswordModalOverlay() {
    if (mainPasswordSuggestionMode) return;
    forceCloseMainPasswordModal();
}

window.closeMainPasswordModal = closeMainPasswordModalOverlay;

window.openMainAppPasswordChange = function openMainAppPasswordChange() {
    var form = document.getElementById('main-password-form');
    if (form) form.reset();
    setMainPasswordMessage('', false);
    setMainPasswordSuggestionMessage('');
    setMainPasswordModalMode(false, true);
    openMainPasswordModalOverlay();
    setTimeout(function() {
        var currentInput = document.getElementById('main-current-password');
        if (currentInput) currentInput.focus();
    }, 50);
};

window.openMainAppPasswordSuggestion = function openMainAppPasswordSuggestion() {
    var form = document.getElementById('main-password-form');
    if (form) form.reset();
    setMainPasswordMessage('', false);
    setMainPasswordSuggestionMessage('');
    setMainPasswordModalMode(true, false);
    openMainPasswordModalOverlay();
};

window.startMainAppSuggestedPasswordChange = function startMainAppSuggestedPasswordChange() {
    setMainPasswordModalMode(true, true);
    setTimeout(function() {
        var currentInput = document.getElementById('main-current-password');
        if (currentInput) currentInput.focus();
    }, 50);
};

window.continueMainAppWithCurrentPassword = async function continueMainAppWithCurrentPassword() {
    var token = getStoredPortalToken();
    var button = document.getElementById('main-password-continue');
    if (!token) return;
    if (button) button.disabled = true;
    setMainPasswordSuggestionMessage('');
    try {
        var response = await fetch(MAIN_APP_PASSWORD_SUGGESTION_URL, {
            method: 'POST',
            headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
            body: '{}'
        });
        var data = await response.json();
        if (!response.ok || !data.success) {
            setMainPasswordSuggestionMessage((data && data.message) || 'Tercihiniz kaydedilemedi.');
            return;
        }
        var sessionUser = resolveMainAppSessionUserRecord();
        if (sessionUser) {
            patchMainAppSessionUserRecord({
                id: sessionUser.id,
                ilk_giris_parola_onerisi_bekliyor: false
            });
        }
        forceCloseMainPasswordModal();
    } catch (error) {
        setMainPasswordSuggestionMessage('Bağlantı hatası. Lütfen tekrar deneyin.');
    } finally {
        if (button) button.disabled = false;
    }
};

window.submitMainAppPasswordChange = async function submitMainAppPasswordChange(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    var token = getStoredPortalToken();
    if (!token) return false;

    var currentInput = document.getElementById('main-current-password');
    var newInput = document.getElementById('main-new-password');
    var confirmInput = document.getElementById('main-new-password-confirm');
    var submitBtn = document.getElementById('main-password-submit');
    var currentPassword = currentInput ? currentInput.value : '';
    var newPassword = newInput ? newInput.value : '';
    var confirmPassword = confirmInput ? confirmInput.value : '';

    if (!currentPassword || !newPassword || !confirmPassword) {
        setMainPasswordMessage('Tüm parola alanlarını doldurun.', true);
        return false;
    }
    if (newPassword.trim() === '') {
        setMainPasswordMessage('Parola yalnız boşluklardan oluşamaz.', true);
        return false;
    }
    if (newPassword.length < 6) {
        setMainPasswordMessage('Yeni parolanız en az 6 karakter olmalıdır.', true);
        return false;
    }
    if (newPassword !== confirmPassword) {
        setMainPasswordMessage('Yeni parola tekrarı eşleşmiyor.', true);
        return false;
    }
    if (newPassword === currentPassword) {
        setMainPasswordMessage('Yeni parola mevcut parolayla aynı olamaz.', true);
        return false;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Kaydediliyor...';
    }
    setMainPasswordMessage('', false);

    try {
        var response = await fetch(MAIN_APP_CHANGE_PASSWORD_URL, {
            method: 'POST',
            headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                currentPassword: currentPassword,
                newPassword: newPassword
            })
        });
        var data = await response.json();
        if (!response.ok || !data.success) {
            setMainPasswordMessage((data && data.message) || 'Parola değiştirilemedi.', true);
            return false;
        }
        var sessionUser = resolveMainAppSessionUserRecord();
        if (sessionUser) {
            patchMainAppSessionUserRecord({
                id: sessionUser.id,
                ilk_giris_parola_onerisi_bekliyor: false,
                parola_son_degisim_tarihi: new Date().toISOString()
            });
        }
        mainPasswordSuggestionMode = false;
        var form = document.getElementById('main-password-form');
        if (form) form.reset();
        setMainPasswordMessage('Parolanız güncellendi.', false);
        forceCloseMainPasswordModal();
    } catch (error) {
        setMainPasswordMessage('Bağlantı hatası. Lütfen tekrar deneyin.', true);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Kaydet';
        }
    }
    return false;
};

function maybeOpenMainAppPasswordSuggestion() {
    if (getCurrentPathname().indexOf('/driver/') !== -1) return;
    var session = window.medisaSession || getDefaultSession();
    if (!session.authenticated || !getStoredPortalToken()) return;
    var user = resolveMainAppSessionUserRecord();
    if (!user || user.ilk_giris_parola_onerisi_bekliyor !== true) return;
    if (typeof window.openMainAppPasswordSuggestion === 'function') {
        window.openMainAppPasswordSuggestion();
    }
}

window.maybeOpenMainAppPasswordSuggestion = maybeOpenMainAppPasswordSuggestion;

document.addEventListener('DOMContentLoaded', async function() {
    syncMainAppPortalLinks();
    setMedisaSession(getSessionFromToken());

    if (sessionStorage.getItem('medisa_just_restored') === '1') {
        sessionStorage.removeItem('medisa_just_restored');
        loadDataFromLocalStorage();
        window.dispatchEvent(new CustomEvent('dataLoaded', { detail: window.appData }));
        if (typeof window.medisaNotifyAppReady === 'function') window.medisaNotifyAppReady();
        maybeOpenMainAppPasswordSuggestion();
        return;
    }

    try {
        await loadDataFromServer(true);
    } catch (loadErr) {
        console.warn('[Medisa] İlk veri yüklemesi tamamlanamadı:', loadErr && loadErr.message);
    }
    window.dispatchEvent(new CustomEvent('dataLoaded', { detail: window.appData }));
    if (typeof window.medisaNotifyAppReady === 'function') window.medisaNotifyAppReady();
    maybeOpenMainAppPasswordSuggestion();
});

document.addEventListener('keydown', function(ev) {
    if (ev.key !== 'Escape' || !mainPasswordSuggestionMode) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
}, true);

document.addEventListener('click', function(ev) {
    if (!mainPasswordSuggestionMode) return;
    var modal = document.getElementById('main-password-modal');
    if (modal && ev.target === modal) {
        ev.preventDefault();
        ev.stopPropagation();
    }
}, true);
