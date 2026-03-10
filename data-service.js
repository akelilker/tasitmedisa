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
    const ok = await window.saveDataToServer();
    if (ok !== true) return Promise.reject(new Error('Sunucuya kayıt yapılamadı.'));
    return true;
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
    const ok = await window.saveDataToServer();
    if (ok !== true) return Promise.reject(new Error('Sunucuya kayıt yapılamadı.'));
  }

  window.dataApi = {
    fetchVehicles: fetchVehicles,
    saveVehicle: saveVehicle,
    deleteVehicle: deleteVehicle,
    saveVehiclesList: saveVehiclesList
  };
})();
