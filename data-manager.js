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
            rowCount: 0,
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
        ilk_giris_parola_degistirme_zorunlu: false,
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
var MEDISA_COLLECTION_APP_KEYS = {
    vehicles: 'tasitlar',
    branches: 'branches',
    users: 'users'
};

var medisaCollectionRevisions = {
    vehicles: 0,
    branches: 0,
    users: 0,
    session: 0
};

var visibleCollectionCache = {
    vehicles: { key: '', value: null },
    branches: { key: '', value: null },
    users: { key: '', value: null }
};

var medisaVisibleStoreMetrics = null;
var medisaVisibleStoreMetricsDisabled = false;
var medisaCollectionsChangedQueue = null;
var medisaCollectionsChangedScheduled = false;
var medisaCachedSessionFingerprint = { quick: '', value: '' };

function isMedisaVisibleStorePerfEnabled() {
    try {
        if (typeof localStorage !== 'undefined' && localStorage.getItem('medisa_perf_debug') === '1') {
            return true;
        }
    } catch (e0) {}
    try {
        var search = (window.location && window.location.search) || '';
        return /(?:^|[?&])medisaPerf=1(?:&|$)/.test(search);
    } catch (e1) {
        return false;
    }
}

function ensureMedisaVisibleStoreMetrics() {
    if (medisaVisibleStoreMetricsDisabled) return null;
    if (medisaVisibleStoreMetrics) {
        medisaVisibleStoreMetrics.revisions = medisaCollectionRevisions;
        return medisaVisibleStoreMetrics;
    }
    if (!isMedisaVisibleStorePerfEnabled()) {
        medisaVisibleStoreMetricsDisabled = true;
        if (typeof window !== 'undefined') {
            try { delete window.__medisaVisibleStoreMetrics; } catch (eDel) { window.__medisaVisibleStoreMetrics = undefined; }
        }
        return null;
    }
    medisaVisibleStoreMetrics = {
        revisions: medisaCollectionRevisions,
        cacheHits: { vehicles: 0, branches: 0, users: 0 },
        cacheMisses: { vehicles: 0, branches: 0, users: 0 },
        buildCounts: { vehicles: 0, branches: 0, users: 0 },
        invalidations: 0,
        eventsDispatched: 0,
        lastInvalidationReason: ''
    };
    window.__medisaVisibleStoreMetrics = medisaVisibleStoreMetrics;
    return medisaVisibleStoreMetrics;
}

function bumpMedisaCollectionRevision(kind) {
    if (!Object.prototype.hasOwnProperty.call(medisaCollectionRevisions, kind)) return;
    medisaCollectionRevisions[kind] = (Number(medisaCollectionRevisions[kind]) || 0) + 1;
    ensureMedisaVisibleStoreMetrics();
}

function clearMedisaVisibleCacheSlot(kind) {
    if (!visibleCollectionCache[kind]) return;
    visibleCollectionCache[kind].key = '';
    visibleCollectionCache[kind].value = null;
}

function queueMedisaCollectionsChanged(collections, reason) {
    var list = Array.isArray(collections) ? collections.filter(Boolean) : [];
    if (!list.length) return;
    if (!medisaCollectionsChangedQueue) {
        medisaCollectionsChangedQueue = {
            collections: {},
            reason: reason || ''
        };
    }
    list.forEach(function(kind) {
        medisaCollectionsChangedQueue.collections[kind] = true;
    });
    if (reason) medisaCollectionsChangedQueue.reason = reason;
    if (medisaCollectionsChangedScheduled) return;
    medisaCollectionsChangedScheduled = true;
    var schedule = typeof queueMicrotask === 'function'
        ? queueMicrotask
        : function(fn) { Promise.resolve().then(fn); };
    schedule(function() {
        medisaCollectionsChangedScheduled = false;
        var queued = medisaCollectionsChangedQueue;
        medisaCollectionsChangedQueue = null;
        if (!queued) return;
        var changed = Object.keys(queued.collections);
        if (!changed.length) return;
        var metrics = ensureMedisaVisibleStoreMetrics();
        if (metrics) metrics.eventsDispatched += 1;
        try {
            if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
                window.dispatchEvent(new CustomEvent('medisa:collections-changed', {
                    detail: {
                        collections: changed.slice(),
                        revisions: {
                            vehicles: medisaCollectionRevisions.vehicles,
                            branches: medisaCollectionRevisions.branches,
                            users: medisaCollectionRevisions.users
                        },
                        reason: queued.reason || ''
                    }
                }));
            }
        } catch (eventErr) {}
    });
}

function invalidateMedisaCollectionCache(kind, reason) {
    var metrics = ensureMedisaVisibleStoreMetrics();
    if (metrics) {
        metrics.invalidations += 1;
        metrics.lastInvalidationReason = reason || '';
    }
    if (kind === 'vehicles') {
        clearMedisaVisibleCacheSlot('vehicles');
        clearMedisaVisibleCacheSlot('branches');
        return;
    }
    if (kind === 'users') {
        clearMedisaVisibleCacheSlot('users');
        clearMedisaVisibleCacheSlot('branches');
        return;
    }
    if (kind === 'branches') {
        clearMedisaVisibleCacheSlot('branches');
        return;
    }
    clearMedisaVisibleCacheSlot('vehicles');
    clearMedisaVisibleCacheSlot('users');
    clearMedisaVisibleCacheSlot('branches');
}

function invalidateAllMedisaVisibleCaches(reason) {
    medisaCachedSessionFingerprint.quick = '';
    medisaCachedSessionFingerprint.value = '';
    bumpMedisaCollectionRevision('vehicles');
    bumpMedisaCollectionRevision('branches');
    bumpMedisaCollectionRevision('users');
    invalidateMedisaCollectionCache('all', reason || 'invalidate-all');
    queueMedisaCollectionsChanged(['vehicles', 'branches', 'users'], reason || 'invalidate-all');
}

function invalidateMedisaVisibleCache() {
    invalidateAllMedisaVisibleCaches('legacy-invalidate');
}

function getMedisaSessionFingerprint() {
    var session = getSessionScope();
    var role = getSessionRoleValue(session);
    var userId = String((session.user && session.user.id) || '');
    var branchIds = Array.isArray(session.branch_ids)
        ? session.branch_ids.map(String).filter(Boolean).sort().join('|')
        : '';
    var quick = [
        String(medisaCollectionRevisions.session || 0),
        session.authenticated ? '1' : '0',
        role || '',
        userId,
        branchIds
    ].join(':');
    if (medisaCachedSessionFingerprint.quick === quick && medisaCachedSessionFingerprint.value) {
        return medisaCachedSessionFingerprint.value;
    }
    var value = [
        session.authenticated ? '1' : '0',
        role || '',
        userId,
        branchIds,
        String(session.raw_role || ''),
        session.yonetici_only === true ? '1' : '0',
        getStoredPortalToken() ? '1' : '0',
        's' + String(medisaCollectionRevisions.session || 0)
    ].join(':');
    medisaCachedSessionFingerprint.quick = quick;
    medisaCachedSessionFingerprint.value = value;
    return value;
}

function getMedisaVisibleCacheRuntimeKey(kind) {
    var sessionFp = getMedisaSessionFingerprint();
    if (kind === 'vehicles') {
        return sessionFp + '|v' + String(medisaCollectionRevisions.vehicles || 0);
    }
    if (kind === 'users') {
        return sessionFp + '|u' + String(medisaCollectionRevisions.users || 0);
    }
    return sessionFp
        + '|b' + String(medisaCollectionRevisions.branches || 0)
        + '|v' + String(medisaCollectionRevisions.vehicles || 0)
        + '|u' + String(medisaCollectionRevisions.users || 0);
}

function getCachedMedisaVisibleList(kind, builder) {
    var slot = visibleCollectionCache[kind] || (visibleCollectionCache[kind] = { key: '', value: null });
    var runtimeKey = getMedisaVisibleCacheRuntimeKey(kind);
    if (slot.key === runtimeKey && Array.isArray(slot.value)) {
        var hitMetrics = medisaVisibleStoreMetrics;
        if (hitMetrics && hitMetrics.cacheHits[kind] != null) hitMetrics.cacheHits[kind] += 1;
        return slot.value.slice();
    }
    var metrics = ensureMedisaVisibleStoreMetrics();
    if (metrics) {
        if (metrics.cacheMisses[kind] != null) metrics.cacheMisses[kind] += 1;
        if (metrics.buildCounts[kind] != null) metrics.buildCounts[kind] += 1;
    }
    var built = builder();
    slot.key = runtimeKey;
    slot.value = Array.isArray(built) ? built : [];
    return slot.value.slice();
}

function getRawMedisaCollection(kind) {
    var appKey = MEDISA_COLLECTION_APP_KEYS[kind];
    if (!appKey) return [];
    if (!window.appData) window.appData = getDefaultAppData();
    if (!Array.isArray(window.appData[appKey])) window.appData[appKey] = [];
    return window.appData[appKey];
}

function replaceMedisaCollection(kind, nextList, options) {
    var appKey = MEDISA_COLLECTION_APP_KEYS[kind];
    if (!appKey) {
        throw new Error('[Medisa] Bilinmeyen koleksiyon: ' + String(kind));
    }
    if (!window.appData) window.appData = getDefaultAppData();
    var list = kind === 'users'
        ? normalizeUsers(nextList)
        : (Array.isArray(nextList) ? nextList.slice() : []);
    window.appData[appKey] = list;
    bumpMedisaCollectionRevision(kind);
    if (kind === 'vehicles') {
        medisaCachedVehicleMutationIntent = buildVehicleMutationAgainstBaseline(list);
        medisaCachedVehicleMutationIntent.revision = medisaCollectionRevisions.vehicles;
        medisaCurrentCollectionFingerprintCache.tasitlar = null;
    } else if (kind === 'branches' || kind === 'users') {
        medisaCurrentCollectionFingerprintCache[appKey] = null;
    }
    invalidateMedisaCollectionCache(kind, (options && options.reason) || ('replace-' + kind));
    syncDataLoadState();
    queueMedisaCollectionsChanged([kind], (options && options.reason) || ('replace-' + kind));
    if (kind === 'users') {
        applyMainAppSessionUiState();
    }
    if (kind === 'vehicles') {
        medisaInvalidateVehicleDateTasksCacheIfAvailable();
    }
    return list.slice();
}

function commitMedisaAppDataSnapshot(nextAppData, options) {
    var reason = (options && options.reason) || 'appdata-snapshot';
    var incoming = nextAppData && typeof nextAppData === 'object' ? nextAppData : getDefaultAppData();
    var current = window.appData && typeof window.appData === 'object' ? window.appData : getDefaultAppData();
    var defaults = getDefaultAppData();
    window.appData = {
        tasitlar: Array.isArray(incoming.tasitlar) ? incoming.tasitlar.slice() : [],
        kayitlar: Array.isArray(incoming.kayitlar) ? incoming.kayitlar : (current.kayitlar || []),
        branches: Array.isArray(incoming.branches) ? incoming.branches.slice() : [],
        users: normalizeUsers(incoming.users),
        ayarlar: incoming.ayarlar && typeof incoming.ayarlar === 'object' ? incoming.ayarlar : (current.ayarlar || defaults.ayarlar),
        sifreler: Array.isArray(incoming.sifreler) ? incoming.sifreler : (current.sifreler || []),
        arac_aylik_hareketler: Array.isArray(incoming.arac_aylik_hareketler) ? incoming.arac_aylik_hareketler : (current.arac_aylik_hareketler || []),
        duzeltme_talepleri: Array.isArray(incoming.duzeltme_talepleri) ? incoming.duzeltme_talepleri : (current.duzeltme_talepleri || []),
        kaskoDegerListesi: incoming.kaskoDegerListesi && typeof incoming.kaskoDegerListesi === 'object'
            ? incoming.kaskoDegerListesi
            : (current.kaskoDegerListesi || defaults.kaskoDegerListesi),
        notificationReadState: incoming.notificationReadState && typeof incoming.notificationReadState === 'object' && !Array.isArray(incoming.notificationReadState)
            ? incoming.notificationReadState
            : (current.notificationReadState || {}),
        monthlyTodoWhatsAppLogs: incoming.monthlyTodoWhatsAppLogs && typeof incoming.monthlyTodoWhatsAppLogs === 'object' && !Array.isArray(incoming.monthlyTodoWhatsAppLogs)
            ? incoming.monthlyTodoWhatsAppLogs
            : (current.monthlyTodoWhatsAppLogs || {})
    };
    bumpMedisaCollectionRevision('vehicles');
    bumpMedisaCollectionRevision('branches');
    bumpMedisaCollectionRevision('users');
    medisaCachedVehicleMutationIntent = null;
    medisaCurrentCollectionFingerprintCache = {};
    invalidateMedisaCollectionCache('all', reason);
    syncDataLoadState();
    applyMainAppSessionUiState();
    queueMedisaCollectionsChanged(['vehicles', 'branches', 'users'], reason);
    return window.appData;
}

async function restoreMedisaCollectionAfterWriteFailure(kind, previousList, reason) {
    var restored = false;
    if (typeof window.loadDataFromServer === 'function') {
        try {
            await window.loadDataFromServer(true);
            restored = true;
        } catch (reloadErr) {
            console.warn('[Medisa] Yazma sonrası sunucu yenileme başarısız:', reloadErr && reloadErr.message);
        }
    }
    if (!restored) {
        replaceMedisaCollection(kind, Array.isArray(previousList) ? previousList : [], {
            reason: reason || ('rollback-' + kind)
        });
    }
    return restored;
}

function syncDataLoadState() {
    isDataLoaded = hasUsableAppData(window.appData);
    window.__medisaDataLoaded = !!isDataLoaded;
    window.__medisaDataLoading = !!isDataLoading;
    window.__medisaServerDatasetTrusted = !!serverDatasetTrusted;
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

function closeMainAppSettingsMenus() {
    var menu = document.getElementById('settings-menu');
    if (menu) menu.classList.remove('open');
    var sub = document.getElementById('data-submenu');
    if (sub) sub.classList.remove('open');
    if (typeof document !== 'undefined' && document.body) {
        document.body.classList.remove('settings-open');
    }
}

/** Ana uygulama ayarlar menüsü: oturumu kapat, portal girişine yönlendir */
function medisaMainAppLogout() {
    try {
        clearStoredPortalTokens();
        setMedisaSession(getDefaultSession());
        if (typeof document !== 'undefined' && document.body) {
            document.body.removeAttribute('data-medisa-role');
        }
        closeMainAppSettingsMenus();
    } catch (e) {}
    if (typeof window === 'undefined') return;
    window.__medisaRedirecting = true;
    window.location.href = DRIVER_INDEX_URL + 'index.html?force=login';
}
window.medisaMainAppLogout = medisaMainAppLogout;

function medisaMainAppForgetThisDevice() {
    try {
        if (window.medisaPortalSession && typeof window.medisaPortalSession.forgetThisDevice === 'function') {
            window.medisaPortalSession.forgetThisDevice();
        } else {
            clearStoredPortalTokens();
            if (window.medisaPortalSession && typeof window.medisaPortalSession.clearRememberCredentials === 'function') {
                window.medisaPortalSession.clearRememberCredentials();
            }
        }
        setMedisaSession(getDefaultSession());
        if (typeof document !== 'undefined' && document.body) {
            document.body.removeAttribute('data-medisa-role');
        }
        closeMainAppSettingsMenus();
    } catch (e) {}
    if (typeof window === 'undefined') return;
    window.__medisaRedirecting = true;
    window.location.href = DRIVER_INDEX_URL + 'index.html?force=login';
}
window.medisaMainAppForgetThisDevice = medisaMainAppForgetThisDevice;

var __medisaForgetConfirmPrevFocus = null;
var __medisaForgetConfirmEscapeBound = false;

function onMedisaForgetConfirmEscape(ev) {
    if (!ev || ev.key !== 'Escape') return;
    var modal = document.getElementById('forget-device-confirm-modal');
    if (!modal || !modal.classList.contains('active')) return;
    ev.preventDefault();
    closeMedisaMainAppForgetThisDeviceConfirm();
}

function openMedisaMainAppForgetThisDeviceConfirm() {
    var modal = document.getElementById('forget-device-confirm-modal');
    if (!modal) {
        medisaMainAppForgetThisDevice();
        return;
    }
    closeMainAppSettingsMenus();
    __medisaForgetConfirmPrevFocus = document.activeElement || null;
    if (typeof document !== 'undefined' && document.body) {
        document.body.classList.add('modal-open');
    }
    modal.style.display = 'flex';
    requestAnimationFrame(function() {
        modal.classList.add('active');
        var cancelBtn = document.getElementById('forget-device-confirm-cancel');
        if (cancelBtn && typeof cancelBtn.focus === 'function') cancelBtn.focus();
    });
    if (!__medisaForgetConfirmEscapeBound) {
        document.addEventListener('keydown', onMedisaForgetConfirmEscape);
        __medisaForgetConfirmEscapeBound = true;
    }
}
window.openMedisaMainAppForgetThisDeviceConfirm = openMedisaMainAppForgetThisDeviceConfirm;

function closeMedisaMainAppForgetThisDeviceConfirm() {
    var modal = document.getElementById('forget-device-confirm-modal');
    if (!modal) return;
    modal.classList.remove('active');
    setTimeout(function() {
        modal.style.display = 'none';
        if (typeof window.updateFooterDim === 'function') {
            window.updateFooterDim();
        } else if (document.body) {
            document.body.classList.remove('modal-open');
        }
        if (__medisaForgetConfirmPrevFocus && typeof __medisaForgetConfirmPrevFocus.focus === 'function') {
            try { __medisaForgetConfirmPrevFocus.focus(); } catch (e) {}
        }
        __medisaForgetConfirmPrevFocus = null;
    }, 300);
}
window.closeMedisaMainAppForgetThisDeviceConfirm = closeMedisaMainAppForgetThisDeviceConfirm;

function confirmMedisaMainAppForgetThisDevice() {
    closeMedisaMainAppForgetThisDeviceConfirm();
    medisaMainAppForgetThisDevice();
}
window.confirmMedisaMainAppForgetThisDevice = confirmMedisaMainAppForgetThisDevice;

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
    var passwordChangeRequired = typeof payload.ilk_giris_parola_degistirme_zorunlu === 'boolean'
        ? payload.ilk_giris_parola_degistirme_zorunlu === true
        : true;
    return {
        authenticated: true,
        role: role || '',
        raw_role: rawRole || '',
        yonetici_only: payload.yonetici_only === true,
        branch_ids: branchIds,
        kullanici_paneli: driverDash,
        driver_dashboard: driverDash,
        ilk_giris_parola_degistirme_zorunlu: passwordChangeRequired,
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
        manage_settings: canManageGlobalData,
        manage_backups: false
    };
}

function normalizeSessionPermissions(role, permissions) {
    var normalizedRole = normalizeSessionRole(role);
    var fallback = buildFallbackPermissions(normalizedRole);
    var canManageGlobalData = normalizedRole === 'genel_yonetici' || normalizedRole === 'sube_yonetici';
    var supplied = permissions && typeof permissions === 'object' && !Array.isArray(permissions)
        ? permissions
        : {};

    return {
        view_main_app: !!fallback.view_main_app,
        view_reports: !!fallback.view_reports,
        manage_users: !!fallback.manage_users,
        manage_branches: normalizedRole === 'genel_yonetici',
        manage_data: canManageGlobalData,
        manage_settings: canManageGlobalData,
        manage_backups: supplied.manage_backups === true
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

/**
 * HTTP 401/403 owner ayrımı — authentication vs authorization.
 * 401: token+session temizlenir, login'e yönlendirilir, trusted düşer.
 * 403 load (clearProtectedDataset): token korunur; korumalı dataset temizlenir; unauthorized shell'den çıkılır.
 * 403 save: token/session/trust korunur; yalnız mutation başarısız; retry mümkün.
 * @returns {'auth'|'forbidden'|null}
 */
function handleMedisaHttpAuthStatus(status, options) {
    var opts = options && typeof options === 'object' ? options : {};
    var code = Number(status) || 0;
    if (code === 401) {
        clearStoredPortalTokens();
        setMedisaSession(getDefaultSession());
        serverDatasetTrusted = false;
        if (opts.commitEmptyDataset === true) {
            commitMedisaAppDataSnapshot(getDefaultAppData(), { reason: 'auth-gate' });
        }
        redirectToPortalLogin();
        return 'auth';
    }
    if (code === 403) {
        if (opts.clearProtectedDataset === true) {
            serverDatasetTrusted = false;
            commitMedisaAppDataSnapshot(getDefaultAppData(), { reason: 'authz-load-gate' });
            setServerDatasetBaseline(getDefaultAppData());
            if (opts.exitUnauthorizedShell === true) {
                exitUnauthorizedMainAppShell();
            }
        }
        return 'forbidden';
    }
    return null;
}

/** Ana uygulama yetkisi yok: token korunur, korumalı shell'den portal yüzeye çıkılır. */
function exitUnauthorizedMainAppShell() {
    if (typeof window === 'undefined') return;
    if (getCurrentPathname().indexOf('/driver/') !== -1) return;
    if (window.__medisaRedirecting === true) return;
    window.__medisaRedirecting = true;
    var session = window.medisaSession || getDefaultSession();
    if (session && session.driver_dashboard === true) {
        window.location.href = DRIVER_DASHBOARD_URL;
        return;
    }
    window.location.href = DRIVER_INDEX_URL;
}

function redirectToDriverDashboard() {
    if (typeof window === 'undefined') return;
    if (window.__medisaRedirecting === true) return;
    window.__medisaRedirecting = true;
    window.location.href = DRIVER_DASHBOARD_URL;
}

function redirectToMandatoryPasswordChange() {
    if (typeof window === 'undefined') return;
    if (window.__medisaRedirecting === true) return;
    window.__medisaRedirecting = true;
    window.location.href = DRIVER_DASHBOARD_URL + '?password-change=required';
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
    bumpMedisaCollectionRevision('session');
    medisaCachedSessionFingerprint.quick = '';
    medisaCachedSessionFingerprint.value = '';
    applyMainAppSessionUiState();
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
    var showLogoutActions = !!getStoredPortalToken();
    var logoutBtn = document.getElementById('settings-logout-btn');
    if (logoutBtn) {
        logoutBtn.style.display = showLogoutActions ? '' : 'none';
    }
    var forgetBtn = document.getElementById('settings-forget-device-btn');
    if (forgetBtn) {
        forgetBtn.style.display = showLogoutActions ? '' : 'none';
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
    if (session.ilk_giris_parola_degistirme_zorunlu === true) {
        redirectToMandatoryPasswordChange();
        return;
    }

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
    if (backupWrap) backupWrap.style.display = session.permissions.manage_backups === true ? '' : 'none';
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
    var tokenSession = getSessionFromToken();
    if (tokenSession.ilk_giris_parola_degistirme_zorunlu === true) {
        redirectToMandatoryPasswordChange();
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
        users: normalizeUsers(data.users),
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
            rowCount: Number((data.kaskoDegerListesi && data.kaskoDegerListesi.rowCount) || 0) || 0,
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
    var firstUsableSnapshot = null;
    for (var i = 0; i < keys.length; i++) {
        try {
            var savedData = localStorage.getItem(keys[i]);
            if (!savedData) continue;
            var normalized = normalizeOfflineAppDataSnapshot(JSON.parse(savedData));
            if (hasUsableAppData(normalized)) {
                if (!firstUsableSnapshot) firstUsableSnapshot = normalized;
                try {
                    localStorage.setItem(keys[i], JSON.stringify(normalized));
                } catch (storageWriteError) {}
            }
        } catch (e) {}
    }
    return firstUsableSnapshot;
}

function persistOfflineAppDataSnapshot(data) {
    try {
        var snapshot = normalizeOfflineAppDataSnapshot(data);
        if (!hasUsableAppData(snapshot)) return;
        localStorage.setItem('medisa_data_v1', JSON.stringify(snapshot));
    } catch (e) {}
}

function loadDataFromLocalStorage() {
    if (!ensureMainAppSession()) {
        return getDefaultAppData();
    }
    var offlineSnapshot = readOfflineAppDataSnapshot();
    commitMedisaAppDataSnapshot(offlineSnapshot || getDefaultAppData(), { reason: 'offline-local-load' });
    setMedisaSession(getSessionFromToken());
    serverDatasetTrusted = false;
    syncDataLoadState();
    return window.appData;
}

/**
 * Compact kasko index yükler (load_kasko.php?mode=index).
 * Tam rows appData'ya yazılmaz; runtime Map window.__medisaKaskoLookupIndex üzerindedir.
 * @returns {Promise<boolean>}
 */
async function loadKaskoListIntoAppData() {
    try {
        if (!ensureMainAppSession()) return false;
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
        var txt = await response.text();
        var kd = JSON.parse(txt);
        if (!kd || typeof kd !== 'object') return false;
        if (String(kd.format || '') !== 'packed-v1') return false;
        if (!Array.isArray(kd.keys) || !Array.isArray(kd.values) || !Array.isArray(kd.dictionary) || !Array.isArray(kd.years)) {
            return false;
        }
        if (kd.keys.length !== kd.values.length) return false;

        var map = new Map();
        for (var i = 0; i < kd.keys.length; i++) {
            map.set(String(kd.keys[i]), kd.values[i]);
        }
        var yearIndex = Object.create(null);
        for (var yi = 0; yi < kd.years.length; yi++) {
            yearIndex[String(kd.years[yi])] = yi;
        }

        window.__medisaKaskoLookupIndex = {
            format: 'packed-v1',
            sourceFingerprint: String(kd.sourceFingerprint || ''),
            updatedAt: String(kd.updatedAt || ''),
            period: String(kd.period || ''),
            sourceFileName: String(kd.sourceFileName || ''),
            rowCount: Number(kd.rowCount || kd.keys.length) || kd.keys.length,
            years: kd.years.slice(),
            yearIndex: yearIndex,
            dictionary: kd.dictionary.slice(),
            map: map
        };

        if (!window.appData || typeof window.appData !== 'object') window.appData = getDefaultAppData();
        window.appData.kaskoDegerListesi = {
            updatedAt: String(kd.updatedAt || ''),
            period: String(kd.period || ''),
            sourceFileName: String(kd.sourceFileName || ''),
            rowCount: Number(kd.rowCount || kd.keys.length) || kd.keys.length,
            rows: []
        };
        if (typeof window.clearKaskoCache === 'function') window.clearKaskoCache();
        return true;
    } catch (e) {
        return false;
    }
}

window.loadKaskoListFromServer = loadKaskoListIntoAppData;
window.clearMedisaKaskoLookupIndex = function() {
    try { window.__medisaKaskoLookupIndex = null; } catch (e) {}
};

async function loadDataFromServer(forceRefresh) {
    if (forceRefresh !== true && serverDatasetTrusted === true && hasUsableAppData(window.appData)) {
        return Promise.resolve(window.appData);
    }

    if (!ensureMainAppSession()) {
        commitMedisaAppDataSnapshot(getDefaultAppData(), { reason: 'session-missing' });
        serverDatasetTrusted = false;
        syncDataLoadState();
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
            var fallback = hasUsableAppData(window.appData)
                ? getSafeAppDataFallback()
                : (readOfflineAppDataSnapshot() || getSafeAppDataFallback());
            commitMedisaAppDataSnapshot(fallback, { reason: 'load-error-fallback' });
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

            if (response.status === 401) {
                handleMedisaHttpAuthStatus(401, { commitEmptyDataset: true });
                var authErr = new Error('Unauthorized');
                authErr.medisaHttpStatus = 401;
                throw authErr;
            }

            if (response.status === 403) {
                handleMedisaHttpAuthStatus(403, {
                    clearProtectedDataset: true,
                    exitUnauthorizedShell: true
                });
                var forbidErr = new Error('Forbidden');
                forbidErr.medisaHttpStatus = 403;
                forbidErr.medisaAuthorizationDenied = true;
                throw forbidErr;
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

            commitMedisaAppDataSnapshot({
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
            }, { reason: 'server-load' });

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
var serverDatasetBaselineFingerprints = {
    collections: {},
    vehicles: {},
    tasitlarArray: ''
};
var medisaCurrentCollectionFingerprintCache = {};
var medisaCachedVehicleMutationIntent = null;
var MEDISA_SAVE_PERSIST_COLLECTIONS = [
    'kayitlar',
    'branches',
    'users',
    'ayarlar',
    'sifreler',
    'notificationReadState',
    'monthlyTodoWhatsAppLogs'
];

function cloneServerDatasetValue(value) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (e) {
        return null;
    }
}

function medisaFingerprintValue(value) {
    try {
        return JSON.stringify(value);
    } catch (e) {
        return '\u0000';
    }
}

function medisaFingerprintCollectionCurrent(key, value) {
    // Aynı dizi/nesne referansı için tekrar stringify etme (in-place vehicle edit bu cache'i kullanmaz).
    var cached = medisaCurrentCollectionFingerprintCache[key];
    if (cached && cached.ref === value) {
        return cached.fp;
    }
    var fp = medisaFingerprintValue(value);
    medisaCurrentCollectionFingerprintCache[key] = { ref: value, fp: fp };
    return fp;
}

function rebuildServerDatasetBaselineFingerprints() {
    var collections = {};
    var vehicles = {};
    var baseline = serverDatasetBaseline || {};
    MEDISA_SAVE_PERSIST_COLLECTIONS.forEach(function(key) {
        collections[key] = medisaFingerprintValue(baseline[key]);
    });
    var baselineVehicles = Array.isArray(baseline.tasitlar) ? baseline.tasitlar : [];
    baselineVehicles.forEach(function(vehicle) {
        if (!vehicle || vehicle.id == null) return;
        vehicles[String(vehicle.id)] = medisaFingerprintValue(vehicle);
    });
    serverDatasetBaselineFingerprints = {
        collections: collections,
        vehicles: vehicles,
        tasitlarArray: medisaFingerprintValue(baselineVehicles)
    };
    medisaCurrentCollectionFingerprintCache = {};
    medisaCachedVehicleMutationIntent = null;
}

function setServerDatasetBaseline(data) {
    serverDatasetBaseline = cloneServerDatasetValue(data);
    rebuildServerDatasetBaselineFingerprints();
}

function medisaValuesEqual(a, b) {
    if (a === b) return true;
    return medisaFingerprintValue(a) === medisaFingerprintValue(b);
}

function medisaFindDuplicateVehicleIds(vehicles) {
    var seen = {};
    var duplicates = [];
    (Array.isArray(vehicles) ? vehicles : []).forEach(function(vehicle) {
        if (!vehicle || vehicle.id == null) return;
        var id = String(vehicle.id);
        if (!id) return;
        if (seen[id]) {
            if (duplicates.indexOf(id) === -1) duplicates.push(id);
            return;
        }
        seen[id] = true;
    });
    return duplicates;
}

function buildVehicleMutationAgainstBaseline(currentVehicles) {
    var baseline = serverDatasetBaseline || {};
    var vehicleFp = (serverDatasetBaselineFingerprints && serverDatasetBaselineFingerprints.vehicles) || {};
    var baselineVehicles = Array.isArray(baseline.tasitlar) ? baseline.tasitlar : [];
    var currentById = {};
    var baselineById = {};
    (Array.isArray(currentVehicles) ? currentVehicles : []).forEach(function(vehicle) {
        if (vehicle && vehicle.id != null) currentById[String(vehicle.id)] = vehicle;
    });
    baselineVehicles.forEach(function(vehicle) {
        if (vehicle && vehicle.id != null) baselineById[String(vehicle.id)] = vehicle;
    });
    var changedVehicleIds = [];
    Object.keys(currentById).forEach(function(id) {
        var baselineVehicleFingerprint = Object.prototype.hasOwnProperty.call(vehicleFp, id)
            ? vehicleFp[id]
            : (baselineById[id] ? medisaFingerprintValue(baselineById[id]) : null);
        if (baselineVehicleFingerprint == null || medisaFingerprintValue(currentById[id]) !== baselineVehicleFingerprint) {
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
    return {
        changedVehicleIds: changedVehicleIds,
        deletedVehicleIds: deletedVehicleIds,
        deletedVehicleVersions: deletedVehicleVersions
    };
}

function buildSaveMutationIntent() {
    var current = window.appData || {};
    var baseline = serverDatasetBaseline || {};
    var collectionFp = (serverDatasetBaselineFingerprints && serverDatasetBaselineFingerprints.collections) || {};
    var collections = [];
    MEDISA_SAVE_PERSIST_COLLECTIONS.forEach(function(key) {
        var baselineFp = Object.prototype.hasOwnProperty.call(collectionFp, key)
            ? collectionFp[key]
            : medisaFingerprintValue(baseline[key]);
        if (medisaFingerprintCollectionCurrent(key, current[key]) !== baselineFp) collections.push(key);
    });

    var changedVehicleIds = [];
    var deletedVehicleIds = [];
    var deletedVehicleVersions = {};
    var currentVehicles = Array.isArray(current.tasitlar) ? current.tasitlar : [];
    if (
        medisaCachedVehicleMutationIntent
        && medisaCachedVehicleMutationIntent.revision === medisaCollectionRevisions.vehicles
    ) {
        changedVehicleIds = (medisaCachedVehicleMutationIntent.changedVehicleIds || []).slice();
        deletedVehicleIds = (medisaCachedVehicleMutationIntent.deletedVehicleIds || []).slice();
        deletedVehicleVersions = Object.assign({}, medisaCachedVehicleMutationIntent.deletedVehicleVersions || {});
    } else {
        var computed = buildVehicleMutationAgainstBaseline(currentVehicles);
        changedVehicleIds = computed.changedVehicleIds;
        deletedVehicleIds = computed.deletedVehicleIds;
        deletedVehicleVersions = computed.deletedVehicleVersions;
    }
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
 */
function buildSaveWirePayload(options) {
    options = options || {};
    var current = window.appData || {};
    var duplicateIds = medisaFindDuplicateVehicleIds(current.tasitlar);
    if (duplicateIds.length) {
        return { ok: false, reason: 'duplicate_vehicle_ids', duplicateVehicleIds: duplicateIds };
    }

    var mutationIntent = buildSaveMutationIntent();
    var passwordChanges = options.userPasswordChanges
        && typeof options.userPasswordChanges === 'object'
        && !Array.isArray(options.userPasswordChanges)
        ? options.userPasswordChanges
        : {};
    var passwordChangeIds = Object.keys(passwordChanges).filter(function(userId) {
        return String(userId || '').trim() !== ''
            && typeof passwordChanges[userId] === 'string'
            && passwordChanges[userId].trim() !== '';
    });
    if (passwordChangeIds.length && mutationIntent.collections.indexOf('users') === -1) {
        mutationIntent.collections.push('users');
    }
    var isNoOp = !(mutationIntent.collections || []).length
        && !(mutationIntent.changedVehicleIds || []).length
        && !(mutationIntent.deletedVehicleIds || []).length;
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
    if (passwordChangeIds.length) {
        wirePayload._medisaUserPasswordChanges = Object.create(null);
        passwordChangeIds.forEach(function(userId) {
            wirePayload._medisaUserPasswordChanges[userId] = passwordChanges[userId];
        });
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
        if (key === 'users') {
            var safeUsers = normalizeUsers(current.users);
            wirePayload.users = safeUsers.map(serializeUserForServer);
            baselinePatchSnapshot.users = cloneServerDatasetValue(safeUsers);
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
    rebuildServerDatasetBaselineFingerprints();
    medisaCachedVehicleMutationIntent = null;
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
        if (payloadObj._medisaUserPasswordChanges) {
            Object.keys(payloadObj._medisaUserPasswordChanges).forEach(function(userId) {
                payloadObj._medisaUserPasswordChanges[userId] = '';
            });
            delete payloadObj._medisaUserPasswordChanges;
        }
        if (options && options.userPasswordChanges && typeof options.userPasswordChanges === 'object') {
            Object.keys(options.userPasswordChanges).forEach(function(userId) {
                options.userPasswordChanges[userId] = '';
            });
        }
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
            if (response.status === 401) {
                handleMedisaHttpAuthStatus(401);
                return false;
            }
            if (response.status === 403) {
                handleMedisaHttpAuthStatus(403);
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
            replaceMedisaCollection('vehicles', window.appData.tasitlar.map(function(vehicle) {
                if (!vehicle || vehicle.id == null) return vehicle;
                var vehicleId = String(vehicle.id);
                if (!Object.prototype.hasOwnProperty.call(versionMap, vehicleId)) return vehicle;
                return Object.assign({}, vehicle, {
                    version: versionMap[vehicleId]
                });
            }), { reason: 'version-patch' });
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

    var hasPortalPassword = user.portal_sifresi_var === true
        || (typeof user.sifre === 'string' && user.sifre.trim() !== '')
        || (typeof user.sifre_hash === 'string' && user.sifre_hash.trim() !== '')
        || (typeof user.password === 'string' && user.password.trim() !== '')
        || (typeof user.password_hash === 'string' && user.password_hash.trim() !== '');
    var email = user.email != null ? String(user.email) : '';
    var username = user.kullanici_adi != null ? String(user.kullanici_adi) : '';
    var createdAt = user.createdAt != null
        ? String(user.createdAt)
        : (user.kayit_tarihi != null ? String(user.kayit_tarihi) : '');
    var assignedVehicles = Array.isArray(user.zimmetli_araclar)
        ? user.zimmetli_araclar.slice()
        : [];
    var tip = role === 'genel_yonetici'
        ? 'admin'
        : (role === 'sube_yonetici' ? 'yonetici' : 'kullanici');

    return {
        id: id,
        isim: name,
        name: name,
        kullanici_adi: username,
        telefon: phone,
        phone: phone,
        email: email,
        sube_id: branchId,
        sube_ids: branchIds.slice(),
        branchId: branchId,
        branchIds: branchIds,
        rol: role,
        role: role,
        tip: tip,
        kullanici_paneli: !!kullaniciPaneli,
        surucu_paneli: !!kullaniciPaneli,
        zimmetli_araclar: assignedVehicles,
        aktif: user.aktif !== false,
        kayit_tarihi: createdAt,
        createdAt: createdAt,
        son_giris: user.son_giris != null ? user.son_giris : null,
        portal_sifresi_var: hasPortalPassword
    };
}

function normalizeUsers(arr) {
    return Array.isArray(arr) ? arr.map(normalizeUser) : [];
}

function serializeUserForServer(user) {
    var normalized = normalizeUser(user);
    return {
        id: normalized.id,
        isim: normalized.name,
        kullanici_adi: normalized.kullanici_adi,
        telefon: normalized.phone,
        email: normalized.email,
        sube_id: normalized.branchId,
        sube_ids: normalized.branchIds.slice(),
        rol: normalized.role,
        tip: normalized.tip,
        kullanici_paneli: normalized.kullanici_paneli,
        surucu_paneli: normalized.surucu_paneli,
        zimmetli_araclar: normalized.zimmetli_araclar.slice(),
        aktif: normalized.aktif,
        kayit_tarihi: normalized.createdAt,
        son_giris: normalized.son_giris
    };
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

function isNormalUserSessionRole(role) {
    return normalizeSessionRole(role) === 'kullanici';
}

/**
 * Taşıt tahsis / ceza adayları: yalnız aktif normal kullanıcı.
 * Yönetici paneli bayrağı veya taşıt ilişkisi aday yapmaz.
 */
function isAssignableNormalUserCandidate(user, branchId) {
    var normalized = normalizeUser(user);
    if (!normalized || !normalized.id) return false;
    if (!isNormalUserSessionRole(normalized.role)) return false;
    if (normalized.aktif === false) return false;
    var scopeBranchId = branchId != null ? String(branchId).trim() : '';
    if (!scopeBranchId) return true;
    return arrayHasId(getUserBranchIds(normalized), scopeBranchId);
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
            if (!isNormalUserSessionRole(user && user.role)) return false;
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
    getVisibleVehicles(getRawMedisaCollection('vehicles')).forEach(function(vehicle) {
        if (vehicle && vehicle.branchId != null && vehicle.branchId !== '') {
            visibleBranchIds[String(vehicle.branchId)] = true;
        }
    });
    getVisibleUsers(getRawMedisaCollection('users')).forEach(function(user) {
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
        return getVisibleVehicles(getRawMedisaCollection('vehicles'));
    });
}

function getMedisaBranches() {
    return getCachedMedisaVisibleList('branches', function() {
        return getVisibleBranches(getRawMedisaCollection('branches'));
    });
}

function getMedisaUsers() {
    return getCachedMedisaVisibleList('users', function() {
        return getVisibleUsers(getRawMedisaCollection('users'));
    });
}

window.writeVehicles = function(arr) {
    if (!window.appData) window.appData = getDefaultAppData();
    applyMainAppSessionUiState();
    var previousVehicles = getRawMedisaCollection('vehicles').slice();
    var vehicles = Array.isArray(arr) ? arr.slice() : [];
    replaceMedisaCollection('vehicles', vehicles, { reason: 'vehicle-write' });

    if (typeof window.saveDataToServer !== 'function') {
        return Promise.reject(new Error('[Medisa] writeVehicles owner hazır değil; kayıt yapılamadı.'));
    }

    return window.saveDataToServer().then(function(ok) {
        if (ok !== true) {
            return restoreMedisaCollectionAfterWriteFailure('vehicles', previousVehicles, 'vehicle-write-false').then(function() {
                return Promise.reject(new Error('Sunucuya kayıt yapılamadı.'));
            });
        }
        medisaInvalidateVehicleDateTasksCacheIfAvailable();
        return ok;
    }).catch(async function(err) {
        if (err && err.message === 'Sunucuya kayıt yapılamadı.') {
            return Promise.reject(err);
        }
        if (err && err.conflict) {
            if (typeof window.loadDataFromServer === 'function') {
                try {
                    await window.loadDataFromServer(true);
                } catch (reloadErr) {
                    console.warn('[Medisa] Çakışma sonrası taşıt verisi yenilenemedi:', reloadErr && reloadErr.message);
                    replaceMedisaCollection('vehicles', previousVehicles, { reason: 'vehicle-conflict-rollback' });
                }
            } else {
                replaceMedisaCollection('vehicles', previousVehicles, { reason: 'vehicle-conflict-rollback' });
            }
            if (typeof window.onMedisaConflict === 'function') window.onMedisaConflict();
            else alert('Dikkat! Veri başka biri tarafından güncellenmiş. Lütfen sayfayı yenileyin.');
            return Promise.reject(err);
        }
        await restoreMedisaCollectionAfterWriteFailure('vehicles', previousVehicles, 'vehicle-write-error');
        console.error('Sunucuya kaydetme hatası:', err);
        return Promise.reject(err);
    });
};

window.writeBranches = function(arr) {
    if (!window.appData) return Promise.resolve(false);
    var previousBranches = getRawMedisaCollection('branches').slice();
    replaceMedisaCollection('branches', Array.isArray(arr) ? arr : [], { reason: 'branch-write' });
    if (typeof window.saveDataToServer !== 'function') {
        return Promise.resolve(true);
    }
    return window.saveDataToServer().then(function(ok) {
        if (ok === true) return true;
        return restoreMedisaCollectionAfterWriteFailure('branches', previousBranches, 'branch-write-false').then(function() {
            return false;
        });
    }).catch(function(err) {
        console.error('Sunucuya kaydetme hatası:', err);
        return restoreMedisaCollectionAfterWriteFailure('branches', previousBranches, 'branch-write-error').then(function() {
            return false;
        });
    });
};

window.writeUsers = function(arr) {
    if (!window.appData) return Promise.resolve(false);
    var previousUsers = getRawMedisaCollection('users').slice();
    replaceMedisaCollection('users', Array.isArray(arr) ? arr : [], { reason: 'user-write' });
    if (typeof window.saveDataToServer !== 'function') {
        return Promise.resolve(true);
    }
    return window.saveDataToServer().then(function(ok) {
        if (ok === true) return true;
        return restoreMedisaCollectionAfterWriteFailure('users', previousUsers, 'user-write-false').then(function() {
            return false;
        });
    }).catch(function(err) {
        console.error('Sunucuya kaydetme hatası:', err);
        return restoreMedisaCollectionAfterWriteFailure('users', previousUsers, 'user-write-error').then(function() {
            return false;
        });
    });
};

window.getMedisaVehicles = getMedisaVehicles;
window.getMedisaBranches = getMedisaBranches;
window.getMedisaUsers = getMedisaUsers;
window.getMedisaCollectionRevisions = function() {
    return {
        vehicles: Number(medisaCollectionRevisions.vehicles) || 0,
        branches: Number(medisaCollectionRevisions.branches) || 0,
        users: Number(medisaCollectionRevisions.users) || 0,
        session: Number(medisaCollectionRevisions.session) || 0
    };
};
window.replaceMedisaVehicles = function(arr, options) {
    return replaceMedisaCollection('vehicles', arr, options || { reason: 'replace-vehicles' });
};
window.replaceMedisaBranches = function(arr, options) {
    return replaceMedisaCollection('branches', arr, options || { reason: 'replace-branches' });
};
window.replaceMedisaUsers = function(arr, options) {
    return replaceMedisaCollection('users', arr, options || { reason: 'replace-users' });
};
window.replaceMedisaCollection = replaceMedisaCollection;
window.commitMedisaAppDataSnapshot = commitMedisaAppDataSnapshot;
window.getMedisaCollectionSnapshot = function(kind) {
    return getRawMedisaCollection(kind).slice();
};
window.normalizeUsers = normalizeUsers;
window.isAssignableNormalUserCandidate = isAssignableNormalUserCandidate;
window.getMedisaSession = function() { return window.medisaSession || getDefaultSession(); };
window.loadDataFromServer = loadDataFromServer;
window.saveDataToServer = saveDataToServer;
window.buildAuthHeaders = buildAuthHeaders;
window.setServerDatasetBaseline = setServerDatasetBaseline;
window.buildSaveWirePayload = buildSaveWirePayload;
window.buildSaveMutationIntent = buildSaveMutationIntent;

document.addEventListener('DOMContentLoaded', async function() {
    syncMainAppPortalLinks();
    setMedisaSession(getSessionFromToken());
    if (!ensureMainAppSession()) return;

    try {
        await loadDataFromServer(true);
    } catch (loadErr) {
        console.warn('[Medisa] İlk veri yüklemesi tamamlanamadı:', loadErr && loadErr.message);
    }
    window.dispatchEvent(new CustomEvent('dataLoaded', { detail: window.appData }));
    if (typeof window.medisaNotifyAppReady === 'function') window.medisaNotifyAppReady();
});
