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
        ayarlar: { sirketAdi: 'Medisa', yetkiliKisi: '', telefon: '', eposta: '' },
        sifreler: [],
        arac_aylik_hareketler: [],
        duzeltme_talepleri: []
      };
    }
    if (!Array.isArray(window.appData.tasitlar)) window.appData.tasitlar = [];
  }

  /**
   * Sunucudan araç listesini çeker, window.appData.tasitlar güncellenir.
   * @returns {Promise<Array>} Taşıt listesi (appData.tasitlar)
   */
  async function fetchVehicles() {
    const data = await window.loadDataFromServer(true);
    ensureAppData();
    if (data && Array.isArray(data.tasitlar)) {
      window.appData.tasitlar = data.tasitlar;
    }
    return window.appData.tasitlar || [];
  }

  /**
   * Tek taşıt kaydı oluşturur veya günceller. Başarı yalnızca sunucu OK döndüğünde.
   * @param {Object} record - Taşıt kaydı (id zorunlu update için)
   * @param {string} mode - 'create' | 'update'
   * @returns {Promise<boolean>} Sunucu başarılıysa true, değilse reject
   */
  async function saveVehicle(record, mode) {
    ensureAppData();
    const list = window.appData.tasitlar;
    if (mode === 'create') {
      list.unshift(record);
    } else if (mode === 'update') {
      const idx = list.findIndex(function(v) { return String(v.id) === String(record.id); });
      if (idx !== -1) list[idx] = record;
    }
    try {
      const ok = await window.saveDataToServer();
      if (ok !== true) return Promise.reject(new Error('Sunucuya kayıt yapılamadı.'));
      return true;
    } catch (e) {
      if (e && e.conflict === true) throw e;
      return Promise.reject(new Error('Sunucuya kayıt yapılamadı.'));
    }
  }

  /**
   * Taşıt siler (server-first). Sunucu başarılı olursa yerel liste güncellenir.
   * @param {string} id - Taşıt id
   * @returns {Promise<boolean>} Sunucu başarılıysa true, değilse reject
   */
  async function deleteVehicle(id) {
    ensureAppData();
    window.appData.tasitlar = window.appData.tasitlar.filter(function(v) { return String(v.id) !== String(id); });
    const ok = await window.saveDataToServer();
    if (ok !== true) return Promise.reject(new Error('Sunucuya silme kaydedilemedi.'));
    return true;
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
      if (ok !== true) return Promise.reject(new Error('Sunucuya kayıt yapılamadı.'));
    } catch (e) {
      if (e && e.conflict === true) throw e;
      return Promise.reject(new Error('Sunucuya kayıt yapılamadı.'));
    }
  }

  // Kasko Excel cache + hesaplama API'si (tasitlar.js'den taşındı)
  window._kaskoCache = null;

  function clearKaskoCache() {
    window._kaskoCache = null;
  }

  function getKaskoDegeri(kaskoKodu, modelYili) {
    if (!kaskoKodu) return '-';
    try {
      if (!window._kaskoCache) {
        var raw = localStorage.getItem('medisa_kasko_liste');
        if (!raw) return '-';
        window._kaskoCache = JSON.parse(raw);
      }
      var data = window._kaskoCache;
      if (!Array.isArray(data) || data.length < 2) return '-';

      var headerRowIndex = -1;
      for (var i = 0; i < 10; i++) {
        var rowStr = JSON.stringify(data[i] || []).toLowerCase();
        if (rowStr.includes('marka') && rowStr.includes('kod')) {
          headerRowIndex = i;
          break;
        }
      }
      if (headerRowIndex === -1) headerRowIndex = 1;
      var headers = data[headerRowIndex];

      var markaIndex = -1, tipIndex = -1, yearIndex = -1;
      var targetYear = String(modelYili || '').trim();

      for (var c = 0; c < headers.length; c++) {
        var h = String(headers[c] || '').toLowerCase().trim();
        var hRaw = String(headers[c] || '').trim();
        if (h.includes('marka') && h.includes('kod')) markaIndex = c;
        if ((h.includes('tip') || h.includes('model')) && h.includes('kod')) tipIndex = c;
        if (hRaw === targetYear || hRaw === targetYear + '.0') yearIndex = c;
      }

      if (markaIndex === -1) markaIndex = 0;
      if (tipIndex === -1) tipIndex = 1;
      if (yearIndex === -1) return 'Yıl Bulunamadı (' + targetYear + ')';

      var targetClean = String(kaskoKodu).replace(/[^0-9]/g, '').replace(/^0+/, '');

      for (var r = headerRowIndex + 1; r < data.length; r++) {
        var row = data[r];
        if (!row || row.length < 2) continue;

        var m = String(row[markaIndex] || '').replace(/[^0-9]/g, '').replace(/^0+/, '');
        var t = String(row[tipIndex] || '').replace(/[^0-9]/g, '').replace(/^0+/, '');
        var currentClean = m + t;

        if (targetClean === currentClean) {
          var rawVal = String(row[yearIndex] || '').trim();
          var cleanVal = rawVal.replace(/[^0-9,.]/g, '');
          if (cleanVal.includes(',') && cleanVal.includes('.')) {
            cleanVal = cleanVal.replace(/\./g, '').replace(',', '.');
          } else if (cleanVal.includes(',')) {
            cleanVal = cleanVal.replace(',', '.');
          } else if (cleanVal.includes('.') && !cleanVal.includes(',')) {
            cleanVal = cleanVal.replace(/\./g, '');
          }

          var numVal = parseFloat(cleanVal) || parseInt(cleanVal.replace(/\D/g, ''), 10);
          if (!isNaN(numVal) && numVal > 0) {
            return numVal.toLocaleString('tr-TR') + ' ₺';
          }
          return 'Değer Yok (Excel: 0)';
        }
      }
      return 'Kasko Kodu Bulunamadı';
    } catch (e) {
      console.error('Kasko Hata:', e);
      return '-';
    }
  }

  function guncelleTumKaskoDegerleri() {
    ensureAppData();
    var vehicles = (typeof window.getMedisaVehicles === 'function' ? window.getMedisaVehicles() : null) || [];
    if (!Array.isArray(vehicles) || vehicles.length === 0) return;
    var tarih = new Date().toISOString();
    vehicles.forEach(function(v) {
      var yearForKasko = v.year || v.modelYili || '';
      v.kaskoDegeri = getKaskoDegeri(v.kaskoKodu, yearForKasko);
      v.kaskoDegeriYuklemeTarihi = tarih;
    });
    saveVehiclesList(vehicles).catch(function(err) {
      console.warn('[Medisa] Kasko değerleri kaydedilemedi:', err && err.message);
    });
  }

  window.dataApi = {
    fetchVehicles: fetchVehicles,
    saveVehicle: saveVehicle,
    deleteVehicle: deleteVehicle,
    saveVehiclesList: saveVehiclesList
  };

  window.clearKaskoCache = clearKaskoCache;
  window.getKaskoDegeri = getKaskoDegeri;
  window.guncelleTumKaskoDegerleri = guncelleTumKaskoDegerleri;
})();
