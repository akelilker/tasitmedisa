/* =========================================
   MEDISA NOTIFICATIONS
   =========================================
   Bildirim sistemi ve kasko işlemleri
   ========================================= */

(function() {
  var NOTIF_READ_STORAGE_KEY = 'medisa_notif_read_keys_v1';
  var LEGACY_NOTIF_READ_SESSION_KEY = 'notifViewedKeysV2';
  var NOTIF_LOCAL_MIGRATION_FLAG_PREFIX = 'medisa_notif_read_migrated_';
  var NOTIF_STATE_MAX_KEYS = 500;
  var NOTIF_STATE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
  var NOTIF_FIRST_SEEN_STORAGE_KEY = 'medisa_notif_first_seen_dates_v1';
  var notifReadStateMigrationAttempted = false;
  var notifReadStateSaveInFlight = false;
  var notifFirstSeenBatchContext = null;
  var kaskoListMigrationAttempted = false;
  var kaskoListSaveInFlight = false;

  function getCurrentNotifScopeKey() {
    var session = (window.medisaSession && typeof window.medisaSession === 'object') ? window.medisaSession : {};
    var user = (session.user && typeof session.user === 'object') ? session.user : {};
    var userId = String(user.id != null ? user.id : '').trim();
    var role = String(session.role || user.role || session.raw_role || '').trim().toLowerCase();
    var branchIds = Array.isArray(session.branch_ids)
      ? session.branch_ids.map(function(id) { return String(id).trim(); }).filter(Boolean)
      : [];
    branchIds = Array.from(new Set(branchIds)).sort();
    var branchScope = branchIds.length ? branchIds.join(',') : (role === 'genel_yonetici' || String(session.branch_scope || '').toLowerCase() === 'all' ? 'all' : 'none');
    return 'user:' + (userId || 'anonymous') + '|role:' + (role || 'unknown') + '|branches:' + branchScope;
  }

  function ensureNotificationReadStateObject() {
    if (!window.appData || typeof window.appData !== 'object') window.appData = {};
    if (!window.appData.notificationReadState || typeof window.appData.notificationReadState !== 'object' || Array.isArray(window.appData.notificationReadState)) {
      window.appData.notificationReadState = {};
    }
    return window.appData.notificationReadState;
  }

  function uniqNotificationKeys(keys) {
    var seen = {};
    var out = [];
    (Array.isArray(keys) ? keys : []).forEach(function(key) {
      var normalized = String(key || '').trim();
      if (!normalized || seen[normalized]) return;
      seen[normalized] = true;
      out.push(normalized);
    });
    return out;
  }

  function parseNotificationKeyMs(key) {
    var parts = String(key || '').split('|');
    var dateText = parts[0] === 'date' ? parts[3]
      : parts[0] === 'event' && /[T:.-]/.test(String(parts[3] || '')) ? parts[3]
      : parts[0] === 'special' && parts.length >= 4 ? (parts[2] + '-' + parts[3] + '-01')
      : '';
    if (!dateText) return 0;
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateText)) {
      var bits = dateText.split('.');
      return new Date(Number(bits[2]), Number(bits[1]) - 1, Number(bits[0])).getTime() || 0;
    }
    var ms = new Date(dateText).getTime();
    return isNaN(ms) ? 0 : ms;
  }

  function pruneNotificationKeys(keys) {
    var now = Date.now();
    var list = uniqNotificationKeys(keys).map(function(key, index) {
      return { key: key, index: index, ms: parseNotificationKeyMs(key) };
    }).filter(function(item) {
      return !item.ms || (now - item.ms) <= NOTIF_STATE_MAX_AGE_MS;
    });
    if (list.length <= NOTIF_STATE_MAX_KEYS) return list.map(function(item) { return item.key; });
    list.sort(function(a, b) {
      var am = a.ms || Number.MAX_SAFE_INTEGER;
      var bm = b.ms || Number.MAX_SAFE_INTEGER;
      if (am !== bm) return bm - am;
      return b.index - a.index;
    });
    return list.slice(0, NOTIF_STATE_MAX_KEYS).map(function(item) { return item.key; });
  }

  function normalizeFirstSeenDatesMap(rawMap) {
    var out = {};
    if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return out;
    Object.keys(rawMap).forEach(function(key) {
      var normalizedKey = String(key || '').trim();
      var normalizedDate = String(rawMap[key] || '').trim();
      if (!normalizedKey || !normalizedDate) return;
      out[normalizedKey] = normalizedDate;
    });
    return out;
  }

  function normalizeNotificationScopeState(scopeState) {
    var legacyArray = Array.isArray(scopeState) ? scopeState : null;
    var raw = (!legacyArray && scopeState && typeof scopeState === 'object') ? scopeState : {};
    var dismissedKeys = pruneNotificationKeys(raw.dismissedKeys || []);
    var readKeys = pruneNotificationKeys((legacyArray || raw.readKeys || []).concat(dismissedKeys));
    return {
      readKeys: readKeys,
      dismissedKeys: dismissedKeys,
      firstSeenDates: normalizeFirstSeenDatesMap(raw.firstSeenDates),
      migratedFromLocalStorage: raw.migratedFromLocalStorage === true,
      updatedAt: String(raw.updatedAt || '')
    };
  }

  function getNotificationScopeState(scopeKey) {
    var state = ensureNotificationReadStateObject();
    var normalized = normalizeNotificationScopeState(state[scopeKey]);
    state[scopeKey] = normalized;
    return normalized;
  }

  function cloneNotificationScopeState(scopeState) {
    var normalized = normalizeNotificationScopeState(scopeState);
    return {
      readKeys: normalized.readKeys.slice(),
      dismissedKeys: normalized.dismissedKeys.slice(),
      firstSeenDates: Object.assign({}, normalized.firstSeenDates),
      migratedFromLocalStorage: normalized.migratedFromLocalStorage,
      updatedAt: normalized.updatedAt
    };
  }

  function migrateLegacyNotificationReadStateForScope(scopeKey) {
    if (notifReadStateMigrationAttempted || !scopeKey) return;
    notifReadStateMigrationAttempted = true;
    var state = ensureNotificationReadStateObject();
    var scoped = getNotificationScopeState(scopeKey);
    var hasCentralForScope = scoped.readKeys.length > 0 || scoped.dismissedKeys.length > 0 || Object.keys(scoped.firstSeenDates || {}).length > 0 || scoped.migratedFromLocalStorage === true;
    if (hasCentralForScope) return;
    try {
      if (localStorage.getItem(NOTIF_LOCAL_MIGRATION_FLAG_PREFIX + scopeKey) === 'true') return;
    } catch (err) {}
    var legacy = [];
    try {
      var localRaw = localStorage.getItem(NOTIF_READ_STORAGE_KEY);
      var localParsed = localRaw ? JSON.parse(localRaw) : [];
      if (Array.isArray(localParsed)) legacy = legacy.concat(localParsed);
    } catch (err) {}
    try {
      var sessionRaw = sessionStorage.getItem(LEGACY_NOTIF_READ_SESSION_KEY);
      var sessionParsed = sessionRaw ? JSON.parse(sessionRaw) : [];
      if (Array.isArray(sessionParsed)) legacy = legacy.concat(sessionParsed);
    } catch (err) {}
    var unique = pruneNotificationKeys(legacy);
    scoped.migratedFromLocalStorage = true;
    scoped.updatedAt = new Date().toISOString();
    if (unique.length) scoped.readKeys = unique;
    state[scopeKey] = scoped;
    if (typeof window.saveDataToServer !== 'function' || notifReadStateSaveInFlight) return;
    notifReadStateSaveInFlight = true;
    window.saveDataToServer()
      .then(function(ok) {
        if (ok !== false) {
          try {
            localStorage.setItem(NOTIF_LOCAL_MIGRATION_FLAG_PREFIX + scopeKey, 'true');
          } catch (err) {}
        }
      })
      .catch(function() {})
      .finally(function() { notifReadStateSaveInFlight = false; });
  }

  function getKaskoState() {
    if (!window.appData || typeof window.appData !== 'object') window.appData = {};
    if (!window.appData.kaskoDegerListesi || typeof window.appData.kaskoDegerListesi !== 'object') {
      window.appData.kaskoDegerListesi = { updatedAt: '', period: '', sourceFileName: '', rows: [] };
    }
    if (!Array.isArray(window.appData.kaskoDegerListesi.rows)) window.appData.kaskoDegerListesi.rows = [];
    return window.appData.kaskoDegerListesi;
  }

  function migrateLegacyKaskoListIfNeeded() {
    if (kaskoListMigrationAttempted) return;
    kaskoListMigrationAttempted = true;
    var kaskoState = getKaskoState();
    if (Array.isArray(kaskoState.rows) && kaskoState.rows.length > 0) return;
    var legacyRows = [];
    try {
      var raw = localStorage.getItem('medisa_kasko_liste');
      var parsed = raw ? JSON.parse(raw) : [];
      legacyRows = Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      legacyRows = [];
    }
    if (!legacyRows.length) return;
    var legacyDate = localStorage.getItem('medisa_kasko_liste_date') || '';
    var updatedAt = legacyDate || new Date().toISOString();
    var dateForPeriod = legacyDate ? new Date(legacyDate) : new Date();
    var period = String(dateForPeriod.getFullYear()) + '-' + String(dateForPeriod.getMonth() + 1).padStart(2, '0');
    window.appData.kaskoDegerListesi = {
      updatedAt: updatedAt,
      period: period,
      sourceFileName: '',
      rows: legacyRows
    };
    if (typeof window.clearKaskoCache === 'function') window.clearKaskoCache();
    var permissions = window.medisaSession && window.medisaSession.permissions ? window.medisaSession.permissions : {};
    if (!permissions.manage_data || kaskoListSaveInFlight) return;
    var saveUrl = window.API_SAVE_KASKO || ((window.MEDISA_API_BASE || '') + 'save_kasko.php');
    var headersFn = typeof window.buildAuthHeaders === 'function' ? window.buildAuthHeaders : null;
    if (!headersFn) return;
    kaskoListSaveInFlight = true;
    fetch(saveUrl, {
      method: 'POST',
      headers: headersFn({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        updatedAt: updatedAt,
        period: period,
        sourceFileName: 'legacy-localStorage',
        rows: legacyRows
      })
    })
      .catch(function() {})
      .finally(function() { kaskoListSaveInFlight = false; });
  }

  function hasAnyKaskoListData() {
    migrateLegacyKaskoListIfNeeded();
    var state = getKaskoState();
    if (Array.isArray(state.rows) && state.rows.length > 0) return true;
    return !!localStorage.getItem('medisa_kasko_liste');
  }
  window.hasAnyKaskoListData = hasAnyKaskoListData;

  function getViewedNotificationKeys() {
    var scopeKey = getCurrentNotifScopeKey();
    if (scopeKey) {
      migrateLegacyNotificationReadStateForScope(scopeKey);
      return getNotificationScopeState(scopeKey).readKeys;
    }
    try {
      var raw = localStorage.getItem(NOTIF_READ_STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) return parsed;
    } catch (err) {}
    try {
      var legacyRaw = sessionStorage.getItem(LEGACY_NOTIF_READ_SESSION_KEY);
      var legacyParsed = legacyRaw ? JSON.parse(legacyRaw) : [];
      return Array.isArray(legacyParsed) ? legacyParsed : [];
    } catch (err) {
      return [];
    }
  }

  function getDismissedNotificationKeys() {
    var scopeKey = getCurrentNotifScopeKey();
    if (scopeKey) {
      migrateLegacyNotificationReadStateForScope(scopeKey);
      return getNotificationScopeState(scopeKey).dismissedKeys;
    }
    return [];
  }

  function saveNotificationScopeStateWithRollback(scopeKey, previousScoped) {
    if (typeof window.updateNotifications === 'function') window.updateNotifications();
    if (typeof window.saveDataToServer !== 'function') return;
    window.saveDataToServer()
      .then(function(ok) {
        if (ok === false) throw new Error('Bildirim state kaydedilemedi');
      })
      .catch(function() {
        var state = ensureNotificationReadStateObject();
        state[scopeKey] = cloneNotificationScopeState(previousScoped);
        if (typeof window.updateNotifications === 'function') window.updateNotifications();
      });
  }

  function getTodayNotificationDisplayDate() {
    return window.formatDateForDisplay && typeof window.formatDateForDisplay === 'function' ? window.formatDateForDisplay(new Date()) : '-';
  }

  function beginNotificationFirstSeenBatch(scopeKey) {
    notifFirstSeenBatchContext = scopeKey ? { scopeKey: scopeKey, previousScoped: null, changed: false } : null;
  }

  function flushNotificationFirstSeenBatch() {
    var batch = notifFirstSeenBatchContext;
    notifFirstSeenBatchContext = null;
    if (!batch || !batch.changed || !batch.previousScoped) return;
    saveNotificationScopeStateWithRollback(batch.scopeKey, batch.previousScoped);
  }

  function getOrCreateNotificationFirstSeen(notifKey) {
    var normalizedKey = String(notifKey || '').trim();
    if (!normalizedKey) return '-';
    var scopeKey = getCurrentNotifScopeKey();
    if (scopeKey) {
      var state = ensureNotificationReadStateObject();
      var scoped = getNotificationScopeState(scopeKey);
      var existing = scoped.firstSeenDates && scoped.firstSeenDates[normalizedKey];
      if (existing) return existing;
      var firstSeenDisplay = getTodayNotificationDisplayDate();
      if (!scoped.firstSeenDates || typeof scoped.firstSeenDates !== 'object' || Array.isArray(scoped.firstSeenDates)) {
        scoped.firstSeenDates = {};
      }
      if (notifFirstSeenBatchContext && notifFirstSeenBatchContext.scopeKey === scopeKey) {
        if (!notifFirstSeenBatchContext.previousScoped) notifFirstSeenBatchContext.previousScoped = cloneNotificationScopeState(scoped);
        notifFirstSeenBatchContext.changed = true;
      } else {
        var previousScoped = cloneNotificationScopeState(scoped);
        scoped.firstSeenDates[normalizedKey] = firstSeenDisplay;
        scoped.updatedAt = new Date().toISOString();
        state[scopeKey] = scoped;
        saveNotificationScopeStateWithRollback(scopeKey, previousScoped);
        return firstSeenDisplay;
      }
      scoped.firstSeenDates[normalizedKey] = firstSeenDisplay;
      scoped.updatedAt = new Date().toISOString();
      state[scopeKey] = scoped;
      return firstSeenDisplay;
    }
    var localMap = {};
    try {
      var raw = localStorage.getItem(NOTIF_FIRST_SEEN_STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      localMap = normalizeFirstSeenDatesMap(parsed);
    } catch (err) {}
    if (localMap[normalizedKey]) return localMap[normalizedKey];
    var firstSeenDisplay = getTodayNotificationDisplayDate();
    localMap[normalizedKey] = firstSeenDisplay;
    try {
      localStorage.setItem(NOTIF_FIRST_SEEN_STORAGE_KEY, JSON.stringify(localMap));
    } catch (err) {}
    return firstSeenDisplay;
  }

  function updateNotificationKeys(keys, mode) {
    var incoming = Array.isArray(keys) ? keys : [];
    if (!incoming.length) return;
    var scopeKey = getCurrentNotifScopeKey();
    if (scopeKey) {
      var state = ensureNotificationReadStateObject();
      var scoped = getNotificationScopeState(scopeKey);
      var previousScoped = cloneNotificationScopeState(scoped);
      var readSet = {};
      var dismissedSet = {};
      scoped.readKeys.forEach(function(key) { readSet[key] = true; });
      scoped.dismissedKeys.forEach(function(key) { dismissedSet[key] = true; readSet[key] = true; });
      var changed = false;
      incoming.forEach(function(key) {
        var normalizedKey = String(key || '').trim();
        if (!normalizedKey) return;
        if (!readSet[normalizedKey]) {
          readSet[normalizedKey] = true;
          changed = true;
        }
        if (mode === 'dismiss' && !dismissedSet[normalizedKey]) {
          dismissedSet[normalizedKey] = true;
          changed = true;
        }
      });
      if (!changed) return;
      scoped.readKeys = pruneNotificationKeys(Object.keys(readSet));
      scoped.dismissedKeys = pruneNotificationKeys(Object.keys(dismissedSet));
      scoped.dismissedKeys.forEach(function(key) {
        if (scoped.readKeys.indexOf(key) === -1) scoped.readKeys.push(key);
      });
      scoped.readKeys = pruneNotificationKeys(scoped.readKeys);
      scoped.updatedAt = new Date().toISOString();
      state[scopeKey] = scoped;
      saveNotificationScopeStateWithRollback(scopeKey, previousScoped);
      return;
    }
    try {
      var viewed = getViewedNotificationKeys();
      incoming.forEach(function(key) {
        var normalizedKey = String(key || '').trim();
        if (normalizedKey && viewed.indexOf(normalizedKey) === -1) viewed.push(normalizedKey);
      });
      localStorage.setItem(NOTIF_READ_STORAGE_KEY, JSON.stringify(viewed));
      sessionStorage.removeItem(LEGACY_NOTIF_READ_SESSION_KEY);
    } catch (err) { return; }
    if (typeof window.updateNotifications === 'function') window.updateNotifications();
  }

  function markNotificationKeysAsViewed(keys) {
    updateNotificationKeys(keys, 'read');
  }

  function dismissNotificationKeys(keys) {
    updateNotificationKeys(keys, 'dismiss');
  }

  function getUnreadNotificationKeys() {
    var notificationsDropdown = document.getElementById('notifications-dropdown');
    return (notificationsDropdown ? Array.from(notificationsDropdown.querySelectorAll('.notification-item.notification-unread[data-notif-key]')) : [])
      .map(function(el) { return (el.getAttribute('data-notif-key') || '').toString().trim(); })
      .filter(Boolean);
  }

  function getDismissibleNotificationKeys() {
    var notificationsDropdown = document.getElementById('notifications-dropdown');
    return (notificationsDropdown ? Array.from(notificationsDropdown.querySelectorAll('.notification-item[data-dismiss-key]')) : [])
      .map(function(el) { return (el.getAttribute('data-dismiss-key') || '').toString().trim(); })
      .filter(Boolean);
  }

  function buildDateNotificationKey(notif) {
    return ['date', String(notif.vehicleId || ''), String(notif.type || ''), String(notif.date || ''), String(notif.type || '')].join('|');
  }

  function buildEventNotificationKey(item) {
    var ev = item && item.event ? item.event : {};
    var vehicleId = String((item && item.vehicleId) || '');
    var eventType = String(ev.type || '');
    var eventId = String(ev.id || '').trim();
    if (eventId) return ['event', vehicleId, eventType, eventId].join('|');
    var timestamp = String(ev.timestamp || '').trim();
    if (timestamp) return ['event', vehicleId, eventType, timestamp].join('|');
    return ['event', vehicleId, eventType, String(ev.date || '')].join('|');
  }

  function isKaskoDegerListesiUploadUnavailableForNotifClick() {
    if (typeof window.medisaIsDisVeriPanelUnavailableOnDevice === 'function') {
      return window.medisaIsDisVeriPanelUnavailableOnDevice();
    }
    var hasMatchMedia = typeof window.matchMedia === 'function';
    var isMobileViewport = hasMatchMedia
      ? window.matchMedia('(max-width: 640px)').matches
      : window.innerWidth <= 640;
    var ua = navigator.userAgent || '';
    var isiOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var isStandalone = hasMatchMedia
      && (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches);
    return isMobileViewport || (isiOS && (isStandalone || window.navigator.standalone === true));
  }

  function showKaskoExcelMobileWarning() {
    var msg = 'Kasko değer listesi yükleme işlemi yalnızca masaüstü görünümde yapılabilir.';
    if (typeof window.showCenteredInfoBox === 'function') {
      window.showCenteredInfoBox(msg);
      return;
    }
    var overlay = document.getElementById('centered-info-box');
    var msgEl = document.getElementById('centered-info-message');
    if (!overlay || !msgEl) {
      alert(msg);
      return;
    }
    window.closeCenteredInfoBox = window.closeCenteredInfoBox || function closeCenteredInfoBox() {
      overlay.classList.remove('active');
      setTimeout(function() {
        overlay.style.display = 'none';
      }, 300);
    };
    msgEl.textContent = msg;
    overlay.style.display = 'flex';
    requestAnimationFrame(function() { overlay.classList.add('active'); });
  }

  // Global exports
  window.getCurrentNotifScopeKey = getCurrentNotifScopeKey;
  window.ensureNotificationReadStateObject = ensureNotificationReadStateObject;
  window.uniqNotificationKeys = uniqNotificationKeys;
  window.parseNotificationKeyMs = parseNotificationKeyMs;
  window.pruneNotificationKeys = pruneNotificationKeys;
  window.normalizeFirstSeenDatesMap = normalizeFirstSeenDatesMap;
  window.normalizeNotificationScopeState = normalizeNotificationScopeState;
  window.getNotificationScopeState = getNotificationScopeState;
  window.cloneNotificationScopeState = cloneNotificationScopeState;
  window.migrateLegacyNotificationReadStateForScope = migrateLegacyNotificationReadStateForScope;
  window.getKaskoState = getKaskoState;
  window.migrateLegacyKaskoListIfNeeded = migrateLegacyKaskoListIfNeeded;
  window.getViewedNotificationKeys = getViewedNotificationKeys;
  window.getDismissedNotificationKeys = getDismissedNotificationKeys;
  window.saveNotificationScopeStateWithRollback = saveNotificationScopeStateWithRollback;
  window.getTodayNotificationDisplayDate = getTodayNotificationDisplayDate;
  window.beginNotificationFirstSeenBatch = beginNotificationFirstSeenBatch;
  window.flushNotificationFirstSeenBatch = flushNotificationFirstSeenBatch;
  window.getOrCreateNotificationFirstSeen = getOrCreateNotificationFirstSeen;
  window.updateNotificationKeys = updateNotificationKeys;
  window.markNotificationKeysAsViewed = markNotificationKeysAsViewed;
  window.dismissNotificationKeys = dismissNotificationKeys;
  window.getUnreadNotificationKeys = getUnreadNotificationKeys;
  window.getDismissibleNotificationKeys = getDismissibleNotificationKeys;
  window.buildDateNotificationKey = buildDateNotificationKey;
  window.buildEventNotificationKey = buildEventNotificationKey;
  window.isKaskoDegerListesiUploadUnavailableForNotifClick = isKaskoDegerListesiUploadUnavailableForNotifClick;
  window.showKaskoExcelMobileWarning = showKaskoExcelMobileWarning;

  // Mobil/PWA: document-level capture, script-core dışarı-tıklama (bubble) kapanışından ÖNCE çalışır;
  // stopImmediatePropagation ile panel kapanmadan uyarı gösterilir, sonra panel kapatılır.
  if (!document._medisaKaskoNotifMobileCaptureBound) {
    document._medisaKaskoNotifMobileCaptureBound = true;
    document.addEventListener('click', function(e) {
      var notificationsDropdown = document.getElementById('notifications-dropdown');
      if (!notificationsDropdown || !notificationsDropdown.classList.contains('open')) return;
      if (!notificationsDropdown.contains(e.target)) return;
      var item = e.target.closest && e.target.closest('.notification-item.kasko-excel-notification');
      if (!item) return;
      if (e.target.closest && e.target.closest('.mtv-dismiss-btn')) return;
      var action = (item.getAttribute('data-action') || '').toString().trim();
      if (action !== 'open-dis-veri') return;
      if (!isKaskoDegerListesiUploadUnavailableForNotifClick()) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      showKaskoExcelMobileWarning();
      setTimeout(function() {
        if (typeof window.setNotificationsOpenState === 'function') {
          window.setNotificationsOpenState(false);
        }
      }, 0);
    }, true);
  }
})();
