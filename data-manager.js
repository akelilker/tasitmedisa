/* =========================================
   SUNUCU VERİ YÖNETİMİ - DATA MANAGER
   ========================================= */

// API Base: /tasitmedisa/ veya /medisa/ altındaysa mutlak yol kullan (404 önleme)
const API_BASE = (function() {
    try {
        var p = (typeof document !== 'undefined' && document.location && document.location.pathname) ? document.location.pathname : '';
        if (p.indexOf('/tasitmedisa') === 0) return '/tasitmedisa/';
        if (p.indexOf('/medisa') === 0) return '/medisa/';
        return '';
    } catch (e) { return ''; }
})();
const API_LOAD = API_BASE + 'load.php';
const API_SAVE = API_BASE + 'save.php';

// Global veri nesnesi (arac_aylik_hareketler, duzeltme_talepleri driver/admin PHP'leri için korunur)
window.appData = {
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

// Veri yükleme durumu
let isDataLoaded = false;
let isDataLoading = false;
let loadPromise = null;
let isSaving = false;

function syncDataLoadState() {
    window.__medisaDataLoaded = !!isDataLoaded;
    window.__medisaDataLoading = !!isDataLoading;
}
syncDataLoadState();

/* Varsayılan boş veri (sunucu yüklenemeyince veya hata durumunda) */
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

/* Sadece yedekten geri yükleme sonrası kullanılır (restore script veriyi localStorage'a yazmış olabilir) */
function loadDataFromLocalStorage() {
    try {
        const savedData = localStorage.getItem('medisa_data_v1');
        if (savedData) {
            const data = JSON.parse(savedData);
            const rawUsers = data.users || [];
            window.appData = {
                tasitlar: data.tasitlar || [],
                kayitlar: data.kayitlar || [],
                branches: data.branches || [],
                users: rawUsers,
                ayarlar: data.ayarlar || { sirketAdi: 'Medisa', yetkiliKisi: '', telefon: '', eposta: '' },
                sifreler: data.sifreler || [],
                arac_aylik_hareketler: data.arac_aylik_hareketler || [],
                duzeltme_talepleri: data.duzeltme_talepleri || []
            };
            isDataLoaded = true;
            syncDataLoadState();
            return window.appData;
        }
    } catch (e) { /* ignore */ }
    window.appData = getDefaultAppData();
    isDataLoaded = true;
    syncDataLoadState();
    return window.appData;
}

/* =========================================
   SUNUCUDAN VERİ YÜKLEME
   ========================================= */
async function loadDataFromServer(forceRefresh = true) {
    // #region agent log
    var _t0 = Date.now();
    fetch('http://127.0.0.1:7824/ingest/04dd9237-7037-48c1-b605-adbae39c06ee',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'13e385'},body:JSON.stringify({sessionId:'13e385',location:'data-manager.js:loadDataFromServer:entry',message:'loadDataFromServer called',data:{forceRefresh,hadLoadPromise:!!loadPromise,isDataLoaded},timestamp:_t0,hypothesisId:'H4,H5'})}).catch(function(){});
    // #endregion
    if (!forceRefresh && isDataLoaded && window.appData && typeof window.appData === 'object') {
        return Promise.resolve(window.appData);
    }

    if (loadPromise) {
        return loadPromise;
    }

    isDataLoading = true;
    syncDataLoadState();
    loadPromise = (async function() {
        try {
            const cacheBuster = new Date().getTime();
            const url = `${API_LOAD}?t=${cacheBuster}`;
            const fetchOpts = {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                },
                cache: 'no-store'
            };

            let response = await fetch(url, fetchOpts);
            // #region agent log
            var _t1 = Date.now();
            fetch('http://127.0.0.1:7824/ingest/04dd9237-7037-48c1-b605-adbae39c06ee',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'13e385'},body:JSON.stringify({sessionId:'13e385',location:'data-manager.js:after fetch',message:'fetch returned',data:{status:response.status,ok:response.ok,msSinceStart:_t1-_t0},timestamp:_t1,hypothesisId:'H1'})}).catch(function(){});
            // #endregion

            /* 503 (Service Unavailable) geçici olabilir – Docker/sunucu hazır olana kadar bir kez tekrar dene */
            if (!response.ok && response.status === 503) {
                // #region agent log
                fetch('http://127.0.0.1:7824/ingest/04dd9237-7037-48c1-b605-adbae39c06ee',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'13e385'},body:JSON.stringify({sessionId:'13e385',location:'data-manager.js:503 retry',message:'503 received, will retry in 2s',data:{msSinceStart:_t1-_t0},timestamp:Date.now(),hypothesisId:'H3'})}).catch(function(){});
                // #endregion
                isDataLoading = false;
                loadPromise = null;
                syncDataLoadState();
                await new Promise(function(r) { setTimeout(r, 2000); });
                return loadDataFromServer(forceRefresh);
            }

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Yanıt okunamadı');
                if (typeof window.__medisaLogError === 'function') {
                    window.__medisaLogError('loadDataFromServer HTTP', new Error('status ' + response.status), errorText.substring(0, 200));
                } else {
                    console.error('[Medisa] loadDataFromServer HTTP hatası', response.status, errorText.substring(0, 200));
                }
                window.appData = getSafeAppDataFallback();
                isDataLoaded = true;
                return window.appData;
            }

            const responseText = await response.text();
            // #region agent log
            var _t2 = Date.now();
            fetch('http://127.0.0.1:7824/ingest/04dd9237-7037-48c1-b605-adbae39c06ee',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'13e385'},body:JSON.stringify({sessionId:'13e385',location:'data-manager.js:after response.text',message:'response.text() done',data:{textLen:(responseText&&responseText.length)||0,msSinceStart:_t2-_t0},timestamp:_t2,hypothesisId:'H2'})}).catch(function(){});
            // #endregion
            if (!responseText || responseText.trim() === '') {
                window.appData = getSafeAppDataFallback();
                isDataLoaded = true;
                return window.appData;
            }

            const trimmedResponse = responseText.trim();
            if (trimmedResponse.startsWith('<?php') || (trimmedResponse.startsWith('<') && trimmedResponse.includes('html'))) {
                window.appData = getSafeAppDataFallback();
                isDataLoaded = true;
                return window.appData;
            }

            let data;
            try {
                data = JSON.parse(responseText);
                // #region agent log
                var _t3 = Date.now();
                fetch('http://127.0.0.1:7824/ingest/04dd9237-7037-48c1-b605-adbae39c06ee',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'13e385'},body:JSON.stringify({sessionId:'13e385',location:'data-manager.js:after JSON.parse',message:'JSON.parse done',data:{msSinceStart:_t3-_t0,parseMs:_t3-_t2},timestamp:_t3,hypothesisId:'H2'})}).catch(function(){});
                // #endregion
            } catch (parseError) {
                window.appData = getSafeAppDataFallback();
                isDataLoaded = true;
                return window.appData;
            }

            const rawUsers = data.users || [];

            // Global veri nesnesini güncelle (arac_aylik_hareketler, duzeltme_talepleri save sırasında silinmesin)
            window.appData = {
                tasitlar: data.tasitlar || [],
                kayitlar: data.kayitlar || [],
                branches: data.branches || [],
                users: rawUsers,
                ayarlar: data.ayarlar || {
                    sirketAdi: 'Medisa',
                    yetkiliKisi: '',
                    telefon: '',
                    eposta: ''
                },
                sifreler: data.sifreler || [],
                arac_aylik_hareketler: data.arac_aylik_hareketler || [],
                duzeltme_talepleri: data.duzeltme_talepleri || []
            };

            isDataLoaded = true;
            // #region agent log
            var _t4 = Date.now();
            fetch('http://127.0.0.1:7824/ingest/04dd9237-7037-48c1-b605-adbae39c06ee',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'13e385'},body:JSON.stringify({sessionId:'13e385',location:'data-manager.js:loadDataFromServer:success',message:'load complete',data:{totalMs:_t4-_t0,tasitlarCount:(window.appData&&window.appData.tasitlar&&window.appData.tasitlar.length)||0},timestamp:_t4,hypothesisId:'H1,H2'})}).catch(function(){});
            // #endregion
            return window.appData;

        } catch (error) {
            if (typeof window.__medisaLogError === 'function') window.__medisaLogError('loadDataFromServer', error);
            else console.warn('[Medisa] Veri yüklenemedi:', error && error.message);
            window.appData = getSafeAppDataFallback();
            isDataLoaded = true;
            return window.appData;
        } finally {
            isDataLoading = false;
            loadPromise = null;
            syncDataLoadState();
        }
    })();
    
    return loadPromise;
}

/* =========================================
   SUNUCUYA VERİ KAYDETME
   ========================================= */
async function saveDataToServer() {
    if (isSaving) return false;
    isSaving = true;
    try {
        const response = await fetch(API_SAVE, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(window.appData)
        });

        if (!response.ok) {
            if (response.status === 409) {
                const conflictErr = new Error('Conflict');
                conflictErr.conflict = true;
                throw conflictErr;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data && data.conflict === true) {
            const conflictErr = new Error('Conflict');
            conflictErr.conflict = true;
            throw conflictErr;
        }
        return true;

    } catch (error) {
        if (error && error.conflict === true) {
            throw error;
        }
        // HTTP 405 hatası (Method Not Allowed) - Sunucu yapılandırması sorunu
        if (error.message && error.message.includes('405')) {
            return false; // Sessizce false dön
        }
        if (error.message && error.message.includes('409')) {
            const conflictErr = new Error('Conflict');
            conflictErr.conflict = true;
            throw conflictErr;
        }
        const responseText = error.message || '';
        if (responseText.includes('<?php') || responseText.includes('Unexpected token')) {
            return false;
        }
        if (error.message && (error.message.includes('404') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) {
            console.warn('[Medisa] Kayıt sunucuya ulaşamadı. Lütfen bağlantıyı kontrol edip tekrar deneyin.');
            return false;
        }
        // Diğer hatalar için konsola yaz (alert rahatsız edici)
        console.warn('[Medisa] Veri kaydedilemedi:', error.message);
        return false;
    } finally {
        isSaving = false;
    }
}

/* =========================================
   YARDIMCI FONKSİYONLAR
   ========================================= */

function genericSaveData(collectionName, item) {
    if (!window.appData || typeof window.appData[collectionName] === 'undefined') {
        return Promise.reject(new Error('Veri henüz yüklenmedi veya geçersiz koleksiyon'));
    }
    const collection = window.appData[collectionName];
    if (!Array.isArray(collection)) {
        window.appData[collectionName] = [];
        window.appData[collectionName].push(item);
        return saveDataToServer();
    }
    const existingIndex = collection.findIndex(x => x.id === item.id);
    if (existingIndex >= 0) {
        collection[existingIndex] = item;
    } else {
        collection.push(item);
    }
    return saveDataToServer();
}

// Taşıt ekleme/güncelleme
window.saveTasit = async function(tasit) {
    return await genericSaveData('tasitlar', tasit);
};

// Taşıt silme
window.deleteTasit = async function(tasitId) {
    window.appData.tasitlar = window.appData.tasitlar.filter(t => t.id !== tasitId);
    return await saveDataToServer();
};

// Ayarları kaydetme
window.saveAyarlar = async function(ayarlar) {
    window.appData.ayarlar = ayarlar;
    return await saveDataToServer();
};

// Şifre ekleme/güncelleme
window.saveSifre = async function(sifre) {
    return await genericSaveData('sifreler', sifre);
};

// Şifre silme
window.deleteSifre = async function(sifreId) {
    window.appData.sifreler = window.appData.sifreler.filter(s => s.id !== sifreId);
    return await saveDataToServer();
};

/* =========================================
   SAYFA YÜKLENME
   ========================================= */
document.addEventListener('DOMContentLoaded', async function() {
    // #region agent log
    var _dc = Date.now();
    fetch('http://127.0.0.1:7824/ingest/04dd9237-7037-48c1-b605-adbae39c06ee',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'13e385'},body:JSON.stringify({sessionId:'13e385',location:'data-manager.js:DOMContentLoaded',message:'DOMContentLoaded handler started',data:{},timestamp:_dc,hypothesisId:'H5'})}).catch(function(){});
    // #endregion
    isDataLoaded = false;
    isDataLoading = false;
    syncDataLoadState();

    // Yedekten geri yükleme sonrası: restore script veriyi localStorage'a yazmış olabilir, bir kez oradan oku
    if (sessionStorage.getItem('medisa_just_restored') === '1') {
        sessionStorage.removeItem('medisa_just_restored');
        loadDataFromLocalStorage();
        window.dispatchEvent(new CustomEvent('dataLoaded', { detail: window.appData }));
        return;
    }

    // Normal açılış: sadece sunucudan veri çek (başarısızsa boş veri)
    await loadDataFromServer(true);
    // #region agent log
    fetch('http://127.0.0.1:7824/ingest/04dd9237-7037-48c1-b605-adbae39c06ee',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'13e385'},body:JSON.stringify({sessionId:'13e385',location:'data-manager.js:dataLoaded dispatch',message:'dispatching dataLoaded',data:{elapsedMs:Date.now()-_dc},timestamp:Date.now(),hypothesisId:'H5'})}).catch(function(){});
    // #endregion
    window.dispatchEvent(new CustomEvent('dataLoaded', { detail: window.appData }));
});

// Merkezi kullanıcı normalizasyonu — frontend tek format (name, phone, branchId, role)
function normalizeUser(u) {
    if (!u || typeof u !== 'object') return { id: '', name: '', phone: '', branchId: '', role: 'driver' };
    const id = u.id != null ? String(u.id) : '';
    let name = u.name || u.isim || '';
    if (!name && (u.firstName || u.lastName)) name = ((u.firstName || '') + ' ' + (u.lastName || '')).trim();
    const phone = u.phone != null ? String(u.phone) : (u.telefon != null ? String(u.telefon) : '');
    const branchId = u.branchId != null && u.branchId !== '' ? String(u.branchId) : (u.sube_id != null && u.sube_id !== '' ? String(u.sube_id) : '');
    let role = u.role || '';
    if (!role && u.tip) role = u.tip === 'admin' ? 'admin' : (u.tip === 'surucu' ? 'driver' : (u.tip === 'kullanici' ? 'sales' : 'driver'));
    if (!role) role = 'driver';
    return Object.assign({}, u, { id, name, phone, branchId, role });
}
function normalizeUsers(arr) {
    return Array.isArray(arr) ? arr.map(normalizeUser) : [];
}

const MEDISA_DEBUG_USERS = typeof window !== 'undefined' && window.location && window.location.search && window.location.search.includes('medisa_debug=1');

// Ortak veri okuyucu — operasyonel veri (taşıt, şube, kullanıcı) yalnızca appData'dan; ana kaynak sunucu
function getMedisaData(key, localKey) {
    if (window.appData && Array.isArray(window.appData[key])) return window.appData[key];
    return [];
}
function getMedisaVehicles() { return getMedisaData('tasitlar', 'medisa_vehicles_v1'); }
function getMedisaBranches() { return getMedisaData('branches', 'medisa_branches_v1'); }
function getMedisaUsers() {
    const raw = getMedisaData('users', 'medisa_users_v1');
    const normalized = normalizeUsers(raw);
    if (MEDISA_DEBUG_USERS) console.log('[Medisa] getMedisaUsers', { rawCount: (raw && raw.length) || 0, normalized });
    return normalized;
}

/** Taşıt listesini güncelle: appData + sadece sunucuya kaydet */
window.writeVehicles = function(arr) {
    if (!window.appData) window.appData = getDefaultAppData();
    window.appData.tasitlar = Array.isArray(arr) ? arr : [];
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

/** Şube listesini güncelle: appData + sadece sunucuya kaydet */
window.writeBranches = function(arr) {
    if (!window.appData) return;
    window.appData.branches = Array.isArray(arr) ? arr : [];
    if (typeof window.saveDataToServer === 'function') window.saveDataToServer().catch(function(err) { console.error('Sunucuya kaydetme hatası:', err); });
};

/** Kullanıcı listesini güncelle: appData + sadece sunucuya kaydet */
window.writeUsers = function(arr) {
    if (!window.appData) return;
    window.appData.users = Array.isArray(arr) ? arr : [];
    if (typeof window.saveDataToServer === 'function') window.saveDataToServer().catch(function(err) { console.error('Sunucuya kaydetme hatası:', err); });
};

window.getMedisaVehicles = getMedisaVehicles;
window.getMedisaBranches = getMedisaBranches;
window.getMedisaUsers = getMedisaUsers;
window.normalizeUsers = normalizeUsers;

// Export fonksiyonları
window.loadDataFromServer = loadDataFromServer;
window.saveDataToServer = saveDataToServer;
