/* =========================================
   VERİ SERVİSİ - SERVER-FIRST MİMARİ
   Tüm taşıt veri işlemleri bu API üzerinden yapılır.
   Modüller doğrudan localStorage veya saveDataToServer kullanmaz.
   ========================================= */

(function() {
  'use strict';

  if (typeof window.loadDataFromServer !== 'function' || typeof window.saveDataToServer !== 'function') {
    console.warn('[Medisa] data-service.js: data-manager.js yüklü değil veya loadDataFromServer/saveDataToServer eksik.');
  }

  function ensureAppData() {
    if (!window.appData) {
      window.appData = {
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
        kaskoDegerListesi: { updatedAt: '', period: '', sourceFileName: '', rows: [] },
        notificationReadState: {},
        monthlyTodoWhatsAppLogs: {}
      };
    }
    if (!Array.isArray(window.appData.tasitlar)) window.appData.tasitlar = [];
    if (!window.appData.kaskoDegerListesi || typeof window.appData.kaskoDegerListesi !== 'object') {
      window.appData.kaskoDegerListesi = { updatedAt: '', period: '', sourceFileName: '', rows: [] };
    }
    if (!Array.isArray(window.appData.kaskoDegerListesi.rows)) window.appData.kaskoDegerListesi.rows = [];
    if (!window.appData.notificationReadState || typeof window.appData.notificationReadState !== 'object' || Array.isArray(window.appData.notificationReadState)) {
      window.appData.notificationReadState = {};
    }
  }

  function notifyVehicleListPersisted() {
    if (typeof window.invalidateVehicleDateTasksCache === 'function') {
      window.invalidateVehicleDateTasksCache();
    }
    if (typeof window.updateNotifications === 'function') {
      window.updateNotifications();
    }
  }

  /**
   * Taşıt listesini toplu günceller (sunucuya yazar). Başarı yalnızca sunucu OK döndüğünde.
   * @param {Array} vehicles - Yeni taşıt listesi
   * @returns {Promise<void>} Başarılıysa resolve, değilse reject
   */
  async function saveVehiclesList(vehicles) {
    ensureAppData();
    window.appData.tasitlar = Array.isArray(vehicles) ? vehicles : [];
    try {
      const ok = await window.saveDataToServer();
      if (ok !== true && typeof window.loadDataFromServer === 'function') {
        await window.loadDataFromServer(true).catch(function() {});
      }
      if (ok !== true) return Promise.reject(new Error('Sunucuya kayıt yapılamadı.'));
      notifyVehicleListPersisted();
    } catch (e) {
      if (!(e && e.conflict === true) && typeof window.loadDataFromServer === 'function') {
        await window.loadDataFromServer(true).catch(function() {});
      }
      if (e && e.conflict === true) {
        if (typeof window.loadDataFromServer === 'function') {
          await window.loadDataFromServer(true).catch(function() {});
        }
        console.warn('[Medisa] Çakışma: Veri başka biri tarafından güncellenmiş. Veriler sunucudan yenilendi.');
        return Promise.reject(e);
      }
      return Promise.reject(new Error('Sunucuya kayıt yapılamadı.'));
    }
  }

  // Kasko kompakt lookup API'si (satır matrisi yok; O(1) index)
  window._kaskoCache = null;
  let kaskoListRequestPromise = null;

  function clearKaskoCache() {
    window._kaskoCache = null;
  }

  function getKaskoDegerListesiState() {
    ensureAppData();
    if (!Array.isArray(window.appData.kaskoDegerListesi.rows)) {
      window.appData.kaskoDegerListesi.rows = [];
    }
    return window.appData.kaskoDegerListesi;
  }

  function hasAnyKaskoListData() {
    if (window.__medisaKaskoLookupAvailable === true) return true;
    if ((Number(window.__medisaKaskoLookupRowCount) || 0) > 0) return true;
    var index = window.__medisaKaskoLookupIndex;
    if (index && typeof index === 'object') {
      for (var key in index) {
        if (Object.prototype.hasOwnProperty.call(index, key)) return true;
      }
    }
    return false;
  }

  function ensureKaskoListLoaded() {
    if (window.__medisaKaskoLookupLoaded === true) return Promise.resolve(true);
    if (kaskoListRequestPromise) return kaskoListRequestPromise;

    if (typeof window.loadKaskoListFromServer !== 'function') {
      return Promise.resolve(false);
    }

    kaskoListRequestPromise = window.loadKaskoListFromServer()
      .then(function(ok) {
        if (ok) clearKaskoCache();
        return !!ok;
      })
      .catch(function() {
        return false;
      })
      .finally(function() {
        kaskoListRequestPromise = null;
      });

    return kaskoListRequestPromise;
  }

  function normalizeKaskoQueryCode(kaskoKodu) {
    return String(kaskoKodu || '').replace(/[^0-9]/g, '').replace(/^0+/, '');
  }

  function getKaskoDegeri(kaskoKodu, modelYili) {
    if (!kaskoKodu) return '-';
    try {
      var index = window.__medisaKaskoLookupIndex;
      var years = window.__medisaKaskoLookupYears;
      if (!index || typeof index !== 'object' || !Array.isArray(years)) {
        return '-';
      }

      var targetYear = String(modelYili || '').trim();
      var yearKnown = false;
      for (var yi = 0; yi < years.length; yi++) {
        var yRaw = String(years[yi] || '').trim();
        if (yRaw === targetYear || yRaw === targetYear + '.0') {
          yearKnown = true;
          targetYear = yRaw.replace(/\.0$/, '');
          break;
        }
      }
      if (!yearKnown) return 'Yıl Bulunamadı (' + String(modelYili || '').trim() + ')';

      var targetClean = normalizeKaskoQueryCode(kaskoKodu);
      if (!targetClean) return 'Kasko Kodu Bulunamadı';

      if (!Object.prototype.hasOwnProperty.call(index, targetClean)) {
        return 'Kasko Kodu Bulunamadı';
      }

      var yearMap = index[targetClean];
      if (!yearMap || typeof yearMap !== 'object') {
        return 'Değer Yok (Excel: 0)';
      }

      var numVal = yearMap[targetYear];
      if (!(Number(numVal) > 0)) {
        return 'Değer Yok (Excel: 0)';
      }
      return Number(numVal).toLocaleString('tr-TR') + ' ₺';
    } catch (e) {
      console.error('Kasko Hata:', e);
      return '-';
    }
  }

  function getKaskoDegeriAsync(kaskoKodu, modelYili) {
    if (!kaskoKodu) return Promise.resolve('-');
    return ensureKaskoListLoaded().then(function() {
      return getKaskoDegeri(kaskoKodu, modelYili);
    });
  }

  function guncelleTumKaskoDegerleri() {
    return ensureKaskoListLoaded().then(function() {
      ensureAppData();
      var vehicles = (typeof window.getMedisaVehicles === 'function' ? window.getMedisaVehicles() : null) || [];
      if (!Array.isArray(vehicles) || vehicles.length === 0) return false;

      var tarih = new Date().toISOString();
      vehicles.forEach(function(v) {
        var yearForKasko = v.year || v.modelYili || '';
        v.kaskoDegeri = getKaskoDegeri(v.kaskoKodu, yearForKasko);
        v.kaskoDegeriYuklemeTarihi = tarih;
      });

      return saveVehiclesList(vehicles).catch(function(err) {
        if (err && err.conflict === true) {
          alert('Dikkat! Bu taşıt siz işlem yaparken başka biri tarafından güncellenmiş. Veri ezilmesini önlemek için lütfen sayfayı yenileyip güncel durumu kontrol edin.');
          if (typeof window.renderBranchDashboard === 'function') window.renderBranchDashboard();
          if (typeof window.renderVehicles === 'function') window.renderVehicles();
          return false;
        }
        console.warn('[Medisa] Kasko değerleri kaydedilemedi:', err && err.message);
        return false;
      });
    });
  }

  window.dataApi = {
    saveVehiclesList: saveVehiclesList
  };

  window.clearKaskoCache = clearKaskoCache;
  window.getKaskoDegeri = getKaskoDegeri;
  window.getKaskoDegeriAsync = getKaskoDegeriAsync;
  window.guncelleTumKaskoDegerleri = guncelleTumKaskoDegerleri;
  window.getKaskoDegerListesiState = getKaskoDegerListesiState;
  window.hasAnyKaskoListData = hasAnyKaskoListData;
})();
