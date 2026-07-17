/* =========================================
   VERİ SERVİSİ - SERVER-FIRST MİMARİ
   Taşıt yazma owner'ı data-manager.writeVehicles.
   Bu dosya kasko lookup + compatibility wrapper taşır.
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
    if (!window.appData.kaskoDegerListesi || typeof window.appData.kaskoDegerListesi !== 'object') {
      window.appData.kaskoDegerListesi = { updatedAt: '', period: '', sourceFileName: '', rows: [] };
    }
    if (!Array.isArray(window.appData.kaskoDegerListesi.rows)) window.appData.kaskoDegerListesi.rows = [];
    if (!window.appData.notificationReadState || typeof window.appData.notificationReadState !== 'object' || Array.isArray(window.appData.notificationReadState)) {
      window.appData.notificationReadState = {};
    }
  }

  /**
   * Compatibility wrapper — canonical owner window.writeVehicles.
   * @param {Array} vehicles
   * @returns {Promise<void>}
   */
  async function saveVehiclesList(vehicles) {
    if (typeof window.writeVehicles !== 'function') {
      return Promise.reject(new Error('[Medisa] writeVehicles owner hazır değil; kayıt yapılamadı.'));
    }
    await window.writeVehicles(vehicles);
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
      var source = (typeof window.getMedisaVehicles === 'function' ? window.getMedisaVehicles() : null) || [];
      if (!Array.isArray(source) || source.length === 0) return false;

      var tarih = new Date().toISOString();
      var changed = false;
      var nextVehicles = source.map(function(v) {
        if (!v || typeof v !== 'object') return v;
        var yearForKasko = v.year || v.modelYili || '';
        var nextValue = getKaskoDegeri(v.kaskoKodu, yearForKasko);
        if (String(v.kaskoDegeri || '') === String(nextValue) && String(v.kaskoDegeriYuklemeTarihi || '') === tarih) {
          return v;
        }
        changed = true;
        return Object.assign({}, v, {
          kaskoDegeri: nextValue,
          kaskoDegeriYuklemeTarihi: tarih
        });
      });

      if (!changed) return false;

      if (typeof window.writeVehicles !== 'function') {
        return Promise.reject(new Error('[Medisa] writeVehicles owner hazır değil; kayıt yapılamadı.'));
      }

      return window.writeVehicles(nextVehicles).then(function() {
        return true;
      }).catch(function(err) {
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
