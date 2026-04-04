/* =========================================
   SUNUCU VERI YONETIMI - DATA MANAGER
   ========================================= */

const API_BASE = (function() {
    try {
        var p = (typeof document !== 'undefined' && document.location && document.location.pathname) ? document.location.pathname : '';
        var pairs = [
            ['/tasitmedisa', '/tasitmedisa/'],
            ['/medisa', '/medisa/']
        ];
        for (var i = 0; i < pairs.length; i++) {
            var seg = pairs[i][0];
            if (p === seg || p.indexOf(seg + '/') === 0) {
                return pairs[i][1];
            }
        }
        return '';
    } catch (e) {
        return '';
    }
})();

const API_LOAD = API_BASE + 'load.php';
const API_SAVE = API_BASE + 'save.php';

(function medisaWarnWrongDeployPath() {
    if (typeof document === 'undefined' || !document.location) return;
    if (API_BASE) return;
    var p = document.location.pathname || '';
    if (p !== '/' && p !== '/index.html') return;
    if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            '[Medisa] Sayfa kökten açılıyor (/). Uygulama /medisa/ veya /tasitmedisa/ altındaysa ' +
            'API tabanı boş kalır; load.php yanlış yerde istenir. Örnek: ' +
            (document.location.origin || '') + '/medisa/'
        );
    }
})();
const DRIVER_INDEX_URL = API_BASE + 'driver/';
const DRIVER_DASHBOARD_URL = API_BASE + 'driver/dashboard.html';

try {
    window.MEDISA_PORTAL_LOGIN_URL = DRIVER_INDEX_URL;
} catch (ePortalUrl) {}

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
            eposta: ''
        },
        sifreler: [],
        arac_aylik_hareketler: [],
        duzeltme_talepleri: []
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

function getSafeAppDataFallback() {
    if (hasUsableAppData(window.appData)) {
        return window.appData;
    }
    return getDefaultAppData();
}

function buildPersistableAppDataSnapshot(data) {
    var source = data && typeof data === 'object' ? data : getDefaultAppData();
    return {
        tasitlar: Array.isArray(source.tasitlar) ? source.tasitlar : [],
        kayitlar: Array.isArray(source.kayitlar) ? source.kayitlar : [],
        branches: Array.isArray(source.branches) ? source.branches : [],
        users: Array.isArray(source.users) ? source.users : [],
        ayarlar: source.ayarlar || {
            sirketAdi: 'Medisa',
            yetkiliKisi: '',
            telefon: '',
            eposta: ''
        },
        sifreler: Array.isArray(source.sifreler) ? source.sifreler : [],
        arac_aylik_hareketler: Array.isArray(source.arac_aylik_hareketler) ? source.arac_aylik_hareketler : [],
        duzeltme_talepleri: Array.isArray(source.duzeltme_talepleri) ? source.duzeltme_talepleri : []
    };
}

function persistAppDataToLocalShadow(data) {
    try {
        localStorage.setItem('medisa_data_v1', JSON.stringify(buildPersistableAppDataSnapshot(data)));
    } catch (storageErr) {}
}

function getCurrentPathname() {
    try {
        return window.location && window.location.pathname ? window.location.pathname : '';
    } catch (e) {
        return '';
    }
}

function getStoredPortalToken() {
    try {
        return localStorage.getItem('medisa_portal_token')
            || sessionStorage.getItem('medisa_portal_token')
            || localStorage.getItem('driver_token')
            || sessionStorage.getItem('driver_token')
            || '';
    } catch (e) {
        return '';
    }
}

function clearStoredPortalTokens() {
    try {
        localStorage.removeItem('medisa_portal_token');
        sessionStorage.removeItem('medisa_portal_token');
        localStorage.removeItem('driver_token');
        sessionStorage.removeItem('driver_token');
    } catch (e) {}
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

function canShowMainUserPanelLink(sessionData) {
    var session = sessionData && typeof sessionData === 'object' ? sessionData : getDefaultSession();
    return hasMainAppAccessForSession(session) && canUseDriverPanelTransition(session);
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
    return {
        view_main_app: hasMainAppAccess,
        view_reports: hasMainAppAccess,
        manage_users: hasMainAppAccess,
        manage_branches: normalizedRole === 'genel_yonetici',
        manage_data: normalizedRole === 'genel_yonetici',
        manage_settings: normalizedRole === 'genel_yonetici'
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

function setMedisaSession(sessionData) {
    var tokenSession = getSessionFromToken();
    var nextSession = Object.assign({}, getDefaultSession(), tokenSession, sessionData || {});
    var mergedRoleSource = nextSession.role || (nextSession.user && nextSession.user.role) || '';
    nextSession.branch_ids = Array.isArray(nextSession.branch_ids) ? nextSession.branch_ids.map(String).filter(Boolean) : [];
    nextSession.raw_role = String(nextSession.raw_role || mergedRoleSource || '').trim();
    nextSession.role = normalizeSessionRole(mergedRoleSource);
    nextSession.permissions = nextSession.permissions && typeof nextSession.permissions === 'object' ? nextSession.permissions : {};
    if (Object.keys(nextSession.permissions).length === 0) {
        nextSession.permissions = buildFallbackPermissions(nextSession.role || '');
    }
    nextSession.user = Object.assign({}, getDefaultSession().user, nextSession.user || {});
    nextSession.user.id = nextSession.user.id != null ? String(nextSession.user.id) : '';
    nextSession.user.role = normalizeSessionRole(nextSession.user.role || nextSession.role || '');
    nextSession.user.branch_ids = Array.isArray(nextSession.user.branch_ids) ? nextSession.user.branch_ids.map(String).filter(Boolean) : nextSession.branch_ids.slice();
    if (nextSession.user.kullanici_paneli !== true && nextSession.user.kullanici_paneli !== false) {
        nextSession.user.kullanici_paneli = !!nextSession.kullanici_paneli;
    }
    window.medisaSession = nextSession;
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
    if (disVeriBtn) disVeriBtn.style.display = session.permissions.manage_data ? '' : 'none';
    if (backupWrap) backupWrap.style.display = session.permissions.manage_data ? '' : 'none';
    if (clearCacheBtn) {
        clearCacheBtn.style.display = (session.permissions.manage_data || session.permissions.manage_settings) ? '' : 'none';
    }
}

/**
 * Ana uygulama (index): sunucu load/save için Bearer token gerekir.
 * Token yokken burada YÖNLENDİRME YAPILMAZ — kullanıcı /medisa adresinde kalır;
 * aksi halde (özellikle özel dolaşma) her açılışta /medisa/driver/ sanılıyordu.
 * Süresi dolmuş/geçersiz token: load.php 401 → redirectToPortalLogin() ayrıca tetiklenir.
 */
function ensureMainAppSession() {
    if (getCurrentPathname().indexOf('/driver/') !== -1) return true;
    return !!getStoredPortalToken();
}

function loadDataFromLocalStorage() {
    try {
        var savedData = localStorage.getItem('medisa_data_v1');
        if (savedData) {
            var data = JSON.parse(savedData);
            window.appData = {
                tasitlar: data.tasitlar || [],
                kayitlar: data.kayitlar || [],
                branches: data.branches || [],
                users: data.users || [],
                ayarlar: data.ayarlar || { sirketAdi: 'Medisa', yetkiliKisi: '', telefon: '', eposta: '' },
                sifreler: data.sifreler || [],
                arac_aylik_hareketler: data.arac_aylik_hareketler || [],
                duzeltme_talepleri: data.duzeltme_talepleri || []
            };
            setMedisaSession(getSessionFromToken());
            serverDatasetTrusted = false;
            syncDataLoadState();
            return window.appData;
        }
    } catch (e) {}

    window.appData = getDefaultAppData();
    setMedisaSession(getSessionFromToken());
    serverDatasetTrusted = false;
    syncDataLoadState();
    return window.appData;
}

async function loadDataFromServer(forceRefresh) {
    // #region agent log
    (function agentLogLoadEntry() {
        try {
            var p = getCurrentPathname();
            var tok = !!getStoredPortalToken();
            var lsShadow = false;
            try {
                var raw = localStorage.getItem('medisa_data_v1');
                if (raw) {
                    var o = JSON.parse(raw);
                    lsShadow = !!(o && Array.isArray(o.tasitlar) && o.tasitlar.length > 0);
                }
            } catch (eSh) {}
            var host = (typeof location !== 'undefined' && location.hostname) ? location.hostname : '';
            fetch('http://127.0.0.1:7753/ingest/302b1fd7-6809-479d-8a04-ce5cebe4d3da', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '8fa95c' }, body: JSON.stringify({ sessionId: '8fa95c', hypothesisId: 'H2', runId: 'pre', location: 'data-manager.js:loadDataFromServer:entry', message: 'loadDataFromServer entry', data: { forceRefresh: forceRefresh === true, ensureOk: ensureMainAppSession(), hasToken: tok, path: p, lsShadowVehicles: lsShadow, hostname: host }, timestamp: Date.now() }) }).catch(function() {});
        } catch (eLog) {}
    })();
    // #endregion
    if (forceRefresh !== true && serverDatasetTrusted === true && hasUsableAppData(window.appData)) {
        return Promise.resolve(window.appData);
    }

    if (!ensureMainAppSession()) {
        // #region agent log
        try {
            fetch('http://127.0.0.1:7753/ingest/302b1fd7-6809-479d-8a04-ce5cebe4d3da', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '8fa95c' }, body: JSON.stringify({ sessionId: '8fa95c', hypothesisId: 'H2', runId: 'pre', location: 'data-manager.js:loadDataFromServer:noSession', message: 'reject no portal token', data: { path: getCurrentPathname() }, timestamp: Date.now() }) }).catch(function() {});
        } catch (eLog2) {}
        // #endregion
        window.appData = getDefaultAppData();
        serverDatasetTrusted = false;
        syncDataLoadState();
        var needAuth = new Error('Medisa oturum yok');
        needAuth.medisaAuthRequired = true;
        return Promise.reject(needAuth);
    }

    if (loadPromise) {
        return loadPromise;
    }

    isDataLoading = true;
    syncDataLoadState();

    loadPromise = (async function() {
        function finishLoadError(optionalErr) {
            serverDatasetTrusted = false;
            window.appData = getSafeAppDataFallback();
            if (hasUsableAppData(window.appData)) {
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

            setMedisaSession(data.session || getSessionFromToken());

            window.appData = buildPersistableAppDataSnapshot(data);

            if (getSessionRoleValue(window.medisaSession) === 'kullanici') {
                redirectToDriverDashboard();
            }

            syncMainAppHeaderUserName(window.medisaSession);
            persistAppDataToLocalShadow(window.appData);

            serverDatasetTrusted = true;
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

async function saveDataToServer() {
    if (isSaving) return false;
    if (!ensureMainAppSession()) return false;
    if (!serverDatasetTrusted) return false;

    isSaving = true;
    try {
        var response = await fetch(API_SAVE, {
            method: 'POST',
            headers: buildAuthHeaders({
                'Content-Type': 'application/json'
            }),
            body: JSON.stringify(window.appData)
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
                throw conflictError;
            }
            throw new Error('HTTP error! status: ' + response.status);
        }

        var data = await response.json();
        if (data && data.conflict === true) {
            var conflictErr = new Error('Conflict');
            conflictErr.conflict = true;
            throw conflictErr;
        }

        if (data && Array.isArray(data.vehicleVersions) && window.appData && Array.isArray(window.appData.tasitlar)) {
            var versionMap = {};
            data.vehicleVersions.forEach(function(item) {
                var id = item && item.id != null ? String(item.id) : '';
                if (!id) return;
                versionMap[id] = Number(item.version) || 1;
            });

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
            localStorage.setItem('medisa_server_backup', JSON.stringify(autoBackup));
        } catch (storageErr) {}
        persistAppDataToLocalShadow(window.appData);

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
            return false;
        }
        console.warn('[Medisa] Veri kaydedilemedi:', error.message);
        return false;
    } finally {
        isSaving = false;
        syncDataLoadState();
    }
}

function genericSaveData(collectionName, item) {
    if (!window.appData || typeof window.appData[collectionName] === 'undefined') {
        return Promise.reject(new Error('Veri henüz yüklenmedi veya geçersiz koleksiyon'));
    }
    var collection = window.appData[collectionName];
    if (!Array.isArray(collection)) {
        window.appData[collectionName] = [];
        window.appData[collectionName].push(item);
        syncDataLoadState();
        return saveDataToServer();
    }
    var existingIndex = collection.findIndex(function(entry) { return entry.id === item.id; });
    if (existingIndex >= 0) {
        collection[existingIndex] = item;
    } else {
        collection.push(item);
    }
    syncDataLoadState();
    return saveDataToServer();
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
    getVisibleVehicles(window.appData && window.appData.tasitlar).forEach(function(vehicle) {
        if (vehicle && vehicle.branchId != null && vehicle.branchId !== '') {
            visibleBranchIds[String(vehicle.branchId)] = true;
        }
    });
    getVisibleUsers(window.appData && window.appData.users).forEach(function(user) {
        getUserBranchIds(user).forEach(function(branchId) {
            visibleBranchIds[String(branchId)] = true;
        });
    });

    return list.filter(function(branch) {
        return !!visibleBranchIds[String(branch && branch.id)];
    });
}

function getVisibleEvents(vehicles) {
    return getVisibleVehicles(vehicles).reduce(function(all, vehicle) {
        var events = Array.isArray(vehicle && vehicle.events) ? vehicle.events.slice() : [];
        return all.concat(events);
    }, []);
}

function getMedisaData(key) {
    if (window.appData && Array.isArray(window.appData[key])) {
        return window.appData[key];
    }
    return [];
}

function getMedisaVehicles() {
    return getVisibleVehicles(getMedisaData('tasitlar'));
}

function getMedisaBranches() {
    return getVisibleBranches(getMedisaData('branches'));
}

function getMedisaUsers() {
    return getVisibleUsers(getMedisaData('users'));
}

window.saveTasit = async function(tasit) {
    return await genericSaveData('tasitlar', tasit);
};

window.deleteTasit = async function(tasitId) {
    window.appData.tasitlar = window.appData.tasitlar.filter(function(tasit) { return tasit.id !== tasitId; });
    syncDataLoadState();
    return await saveDataToServer();
};

window.saveAyarlar = async function(ayarlar) {
    window.appData.ayarlar = ayarlar;
    syncDataLoadState();
    return await saveDataToServer();
};

window.saveSifre = async function(sifre) {
    return await genericSaveData('sifreler', sifre);
};

window.deleteSifre = async function(sifreId) {
    window.appData.sifreler = window.appData.sifreler.filter(function(sifre) { return sifre.id !== sifreId; });
    syncDataLoadState();
    return await saveDataToServer();
};

window.writeVehicles = function(arr) {
    if (!window.appData) window.appData = getDefaultAppData();
    window.appData.tasitlar = Array.isArray(arr) ? arr : [];
    syncDataLoadState();
    if (typeof window.saveDataToServer === 'function') {
        window.saveDataToServer().catch(function(err) {
            if (err && err.conflict) {
                if (typeof window.onMedisaConflict === 'function') window.onMedisaConflict();
                else alert('Dikkat! Veri başka biri tarafından güncellenmiş. Lütfen sayfayı yenileyin.');
                return;
            }
            console.error('Sunucuya kaydetme hatası:', err);
        });
    }
};

window.writeBranches = function(arr) {
    if (!window.appData) return;
    window.appData.branches = Array.isArray(arr) ? arr : [];
    syncDataLoadState();
    if (typeof window.saveDataToServer === 'function') {
        window.saveDataToServer().catch(function(err) {
            console.error('Sunucuya kaydetme hatası:', err);
        });
    }
};

window.writeUsers = function(arr) {
    if (!window.appData) return;
    window.appData.users = Array.isArray(arr) ? arr : [];
    syncDataLoadState();
    if (typeof window.saveDataToServer === 'function') {
        window.saveDataToServer().catch(function(err) {
            console.error('Sunucuya kaydetme hatası:', err);
        });
    }
};

window.getMedisaVehicles = getMedisaVehicles;
window.getMedisaBranches = getMedisaBranches;
window.getMedisaUsers = getMedisaUsers;
window.getVisibleVehicles = getVisibleVehicles;
window.getVisibleBranches = getVisibleBranches;
window.getVisibleUsers = getVisibleUsers;
window.getVisibleEvents = getVisibleEvents;
window.normalizeUsers = normalizeUsers;
window.getMedisaSession = function() { return window.medisaSession || getDefaultSession(); };
window.loadDataFromServer = loadDataFromServer;
window.saveDataToServer = saveDataToServer;

document.addEventListener('DOMContentLoaded', async function() {
    syncMainAppPortalLinks();
    setMedisaSession(getSessionFromToken());

    if (!hasUsableAppData(window.appData)) {
        loadDataFromLocalStorage();
    }

    if (sessionStorage.getItem('medisa_just_restored') === '1') {
        sessionStorage.removeItem('medisa_just_restored');
        loadDataFromLocalStorage();
        window.dispatchEvent(new CustomEvent('dataLoaded', { detail: window.appData }));
        return;
    }

    try {
        await loadDataFromServer(true);
    } catch (loadErr) {
        console.warn('[Medisa] İlk veri yüklemesi tamamlanamadı:', loadErr && loadErr.message);
    }
    // #region agent log
    (function agentLogDomReady() {
        try {
            var tok = !!getStoredPortalToken();
            var pwa = false;
            try {
                pwa = !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
            } catch (eP) {}
            fetch('http://127.0.0.1:7753/ingest/302b1fd7-6809-479d-8a04-ce5cebe4d3da', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '8fa95c' }, body: JSON.stringify({ sessionId: '8fa95c', hypothesisId: 'H5', runId: 'pre', location: 'data-manager.js:DOMContentLoaded:end', message: 'after initial load', data: { hasToken: tok, medisaDataLoaded: !!window.__medisaDataLoaded, standalonePWA: pwa, path: getCurrentPathname() }, timestamp: Date.now() }) }).catch(function() {});
        } catch (eLog3) {}
    })();
    // #endregion
    window.dispatchEvent(new CustomEvent('dataLoaded', { detail: window.appData }));
});
