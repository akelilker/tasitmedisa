(function() {
  var PUBLIC_KEYS = [
    'vehicleNeedsK2Belgesi',
    'vehicleNeedsTakograf',
    'vehicleNeedsTrafikSigortasi',
    'vehicleNeedsEgzozMuayene',
    'getK2BelgeGroups',
    'getK2BelgeGroupForBranch',
    'getK2BelgeGroupForVehicle',
    'getK2BelgesiExpiryDateForVehicle',
    'getK2BelgesiDocumentPathForVehicle',
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

  /** Trafik sigortası takibi: römork kapsam dışı. */
  function vehicleNeedsTrafikSigortasi(vehicle) {
    return getVehicleTypeKey(vehicle) !== 'romork';
  }

  /** Egzoz muayenesi takibi: römork kapsam dışı. */
  function vehicleNeedsEgzozMuayene(vehicle) {
    return getVehicleTypeKey(vehicle) !== 'romork';
  }

  function getK2BelgeGroups() {
    var groups = window.appData && window.appData.ayarlar && window.appData.ayarlar.k2BelgeGruplari;
    return Array.isArray(groups) ? groups : [];
  }

  function getK2BelgeGroupForBranch(branchId) {
    var id = String(branchId || '').trim();
    if (!id) return null;
    return getK2BelgeGroups().find(function(group) {
      return group && Array.isArray(group.branchIds) && group.branchIds.map(String).indexOf(id) !== -1;
    }) || null;
  }

  function getK2BelgeGroupForVehicle(vehicle) {
    return getK2BelgeGroupForBranch(vehicle && vehicle.branchId);
  }

  function getK2BelgesiExpiryDateForVehicle(vehicle) {
    var group = getK2BelgeGroupForVehicle(vehicle);
    return String(group && group.expiryDate || '').trim();
  }

  function getK2BelgesiDocumentPathForVehicle(vehicle) {
    var group = getK2BelgeGroupForVehicle(vehicle);
    return String(group && group.documentPath || '').trim();
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
    if (!vehicleNeedsEgzozMuayene(vehicle)) {
      return {
        state: 'not_applicable',
        date: '',
        days: null,
        warningClass: ''
      };
    }

    if (isVehicleOperationallyInactive(vehicle)) {
      return {
        state: 'inactive',
        date: '',
        days: null,
        warningClass: ''
      };
    }

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
    vehicleNeedsTrafikSigortasi: vehicleNeedsTrafikSigortasi,
    vehicleNeedsEgzozMuayene: vehicleNeedsEgzozMuayene,
    getK2BelgeGroups: getK2BelgeGroups,
    getK2BelgeGroupForBranch: getK2BelgeGroupForBranch,
    getK2BelgeGroupForVehicle: getK2BelgeGroupForVehicle,
    getK2BelgesiExpiryDateForVehicle: getK2BelgesiExpiryDateForVehicle,
    getK2BelgesiDocumentPathForVehicle: getK2BelgesiDocumentPathForVehicle,
    isVehicleOperationallyInactive: isVehicleOperationallyInactive,
    getEgzozMuayeneState: getEgzozMuayeneState,
    isEgzozMuayeneCritical: isEgzozMuayeneCritical
  };
})();
