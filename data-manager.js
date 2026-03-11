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

/* Sadece yedekten geri yükleme sonrası kullanılır (restore script veriyi localStorage'a yazmış olabilir) */
function loadDataFromLocalStorage() {
    try {
        const savedData = localStorage.getItem('medisa_data_v1');
        if (savedData) {
            const data = JSON.parse(savedData);
            const rawUsers = data.users || [];
            const users = rawUsers.map(u => {
                const u2 = { ...u };
                if (!u2.name && u2.isim) u2.name = u2.isim;
                return u2;
            });
            window.appData = {
                tasitlar: data.tasitlar || [],
                kayitlar: data.kayitlar || [],
                branches: data.branches || [],
                users: users,
                ayarlar: data.ayarlar || { sirketAdi: 'Medisa', yetkiliKisi: '', telefon: '', eposta: '' },
                sifreler: data.sifreler || [],
                arac_aylik_hareketler: data.arac_aylik_hareketler || [],
                duzeltme_talepleri: data.duzeltme_talepleri || []
            };
            isDataLoaded = true;
            return window.appData;
        }
    } catch (e) { /* ignore */ }
    window.appData = getDefaultAppData();
    isDataLoaded = true;
    return window.appData;
}

/* =========================================
   SUNUCUDAN VERİ YÜKLEME
   ========================================= */
async function loadDataFromServer(forceRefresh = true) {
    if (loadPromise) {
        return loadPromise;
    }

    isDataLoading = true;
    loadPromise = (async function() {
        try {
            // Cache-busting parametresi ekle (her seferinde güncel veri çekmek için)
            const cacheBuster = new Date().getTime();
            const url = `${API_LOAD}?t=${cacheBuster}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                },
                cache: 'no-store'
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Yanıt okunamadı');
                if (typeof window.__medisaLogError === 'function') {
                    window.__medisaLogError('loadDataFromServer HTTP', new Error('status ' + response.status), errorText.substring(0, 200));
                } else {
                    console.error('[Medisa] loadDataFromServer HTTP hatası', response.status, errorText.substring(0, 200));
                }
                window.appData = getDefaultAppData();
                isDataLoaded = true;
                return window.appData;
            }

            const responseText = await response.text();
            if (!responseText || responseText.trim() === '') {
                window.appData = getDefaultAppData();
                isDataLoaded = true;
                return window.appData;
            }

            const trimmedResponse = responseText.trim();
            if (trimmedResponse.startsWith('<?php') || (trimmedResponse.startsWith('<') && trimmedResponse.includes('html'))) {
                window.appData = getDefaultAppData();
                isDataLoaded = true;
                return window.appData;
            }

            let data;
            try {
                data = JSON.parse(responseText);
            } catch (parseError) {
                window.appData = getDefaultAppData();
                isDataLoaded = true;
                return window.appData;
            }

            // Kullanıcıları normalize et (isim -> name, tüm modüller tek alan kullansın)
            const rawUsers = data.users || [];
            const users = rawUsers.map(u => {
                const u2 = { ...u };
                if (!u2.name && u2.isim) u2.name = u2.isim;
                return u2;
            });

            // Global veri nesnesini güncelle (arac_aylik_hareketler, duzeltme_talepleri save sırasında silinmesin)
            window.appData = {
                tasitlar: data.tasitlar || [],
                kayitlar: data.kayitlar || [],
                branches: data.branches || [],
                users: users,
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
            return window.appData;

        } catch (error) {
            if (typeof window.__medisaLogError === 'function') window.__medisaLogError('loadDataFromServer', error);
            else console.warn('[Medisa] Veri yüklenemedi:', error && error.message);
            window.appData = getDefaultAppData();
            isDataLoaded = true;
            return window.appData;
        } finally {
            isDataLoading = false;
            loadPromise = null;
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
    isDataLoaded = false;
    isDataLoading = false;

    // Yedekten geri yükleme sonrası: restore script veriyi localStorage'a yazmış olabilir, bir kez oradan oku
    if (sessionStorage.getItem('medisa_just_restored') === '1') {
        sessionStorage.removeItem('medisa_just_restored');
        loadDataFromLocalStorage();
        window.dispatchEvent(new CustomEvent('dataLoaded', { detail: window.appData }));
        return;
    }

    // Normal açılış: sadece sunucudan veri çek (başarısızsa boş veri)
    await loadDataFromServer(true);
    window.dispatchEvent(new CustomEvent('dataLoaded', { detail: window.appData }));
});

// Ortak veri okuyucu — operasyonel veri (taşıt, şube, kullanıcı) yalnızca appData'dan; ana kaynak sunucu
function getMedisaData(key, localKey) {
    if (window.appData && Array.isArray(window.appData[key])) return window.appData[key];
    return [];
}
function getMedisaVehicles() { return getMedisaData('tasitlar', 'medisa_vehicles_v1'); }
function getMedisaBranches() { return getMedisaData('branches', 'medisa_branches_v1'); }
function getMedisaUsers() { return getMedisaData('users', 'medisa_users_v1'); }

/** Taşıt listesini güncelle: appData + sadece sunucuya kaydet */
window.writeVehicles = function(arr) {
    if (!window.appData) window.appData = getDefaultAppData();
    window.appData.tasitlar = Array.isArray(arr) ? arr : [];
    if (typeof window.saveDataToServer === 'function') window.saveDataToServer().catch(function(err) { console.error('Sunucuya kaydetme hatası:', err); });
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

// Export fonksiyonları
window.loadDataFromServer = loadDataFromServer;
window.saveDataToServer = saveDataToServer;
