(function() {
  var PUBLIC_KEYS = [
    'vehicleNeedsK2Belgesi',
    'vehicleNeedsTakograf',
    'getK2BelgesiState',
    'getK2BelgesiExpiryDate',
    'isVehicleOperationallyInactive',
    'getEgzozMuayeneState',
    'isEgzozMuayeneCritical'
  ];

  function isValidNamespace(namespace) {
    if (!namespace || typeof namespace !== 'object' || Array.isArray(namespace)) return false;

    var keys = Object.keys(namespace);
    if (keys.length !== PUBLIC_KEYS.length) return false;

    for (var i = 0; i < PUBLIC_KEYS.length; i++) {
      var key = PUBLIC_KEYS[i];
      if (keys.indexOf(key) === -1 || typeof namespace[key] !== 'function') return false;
    }

    return true;
  }

  if (isValidNamespace(window.MedisaVehicleNotificationDomain)) return;

  function getVehicleTypeKey(vehicle) {
    return String((vehicle && (vehicle.vehicleType || vehicle.tip)) || '').trim().toLowerCase();
  }

  function vehicleNeedsK2Belgesi(vehicle) {
    var typeKey = getVehicleTypeKey(vehicle);
    return typeKey === 'minivan' || typeKey === 'kamyon' || typeKey === 'romork';
  }

  function vehicleNeedsTakograf(vehicle) {
    return getVehicleTypeKey(vehicle) === 'kamyon';
  }

  function getK2BelgesiState() {
    if (!window.appData) window.appData = {};
    if (!window.appData.ayarlar || typeof window.appData.ayarlar !== 'object' || Array.isArray(window.appData.ayarlar)) {
      window.appData.ayarlar = {};
    }
    if (!window.appData.ayarlar.k2Belgesi || typeof window.appData.ayarlar.k2Belgesi !== 'object' || Array.isArray(window.appData.ayarlar.k2Belgesi)) {
      window.appData.ayarlar.k2Belgesi = { expiryDate: '', documentPath: '', updatedAt: '' };
    }
    return window.appData.ayarlar.k2Belgesi;
  }

  function getK2BelgesiExpiryDate() {
    return String(getK2BelgesiState().expiryDate || '').trim();
  }

  function isVehicleOperationallyInactive(vehicle) {
    if (!vehicle || typeof vehicle !== 'object') return true;
    return vehicle.satildiMi === true
      || vehicle.arsiv === true
      || vehicle.pasif === true
      || vehicle.aktif === false
      || vehicle.aktifMi === false
      || String(vehicle.durum || '').trim().toLowerCase() === 'pasif';
  }

  function getEgzozMuayeneState(vehicle) {
    var rawDate = vehicle && vehicle.egzozMuayeneDate != null ? String(vehicle.egzozMuayeneDate).trim() : '';
    if (!rawDate) {
      return {
        state: 'missing',
        date: '',
        days: null,
        warningClass: 'date-warning-red'
      };
    }

    var warning = window.checkDateWarnings(rawDate);
    if (warning.class === 'date-warning-red') {
      return {
        state: 'expired',
        date: rawDate,
        days: warning.days,
        warningClass: 'date-warning-red'
      };
    }

    if (warning.class === 'date-warning-orange') {
      return {
        state: 'approaching',
        date: rawDate,
        days: warning.days,
        warningClass: 'date-warning-orange'
      };
    }

    return {
      state: 'valid',
      date: rawDate,
      days: warning.days,
      warningClass: ''
    };
  }

  function isEgzozMuayeneCritical(vehicle) {
    var egzozState = getEgzozMuayeneState(vehicle);
    return egzozState.warningClass === 'date-warning-red';
  }

  window.MedisaVehicleNotificationDomain = {
    vehicleNeedsK2Belgesi: vehicleNeedsK2Belgesi,
    vehicleNeedsTakograf: vehicleNeedsTakograf,
    getK2BelgesiState: getK2BelgesiState,
    getK2BelgesiExpiryDate: getK2BelgesiExpiryDate,
    isVehicleOperationallyInactive: isVehicleOperationallyInactive,
    getEgzozMuayeneState: getEgzozMuayeneState,
    isEgzozMuayeneCritical: isEgzozMuayeneCritical
  };
})();
