/* =========================================
   MEDISA NOTIFICATIONS MODULE
   =========================================
   Owner: notification read-state, dropdown render/clicks, date scan/cache,
   monthly todo and notification-to-vehicle navigation bridges.
   ========================================= */

(function() {
  window.__medisaNotificationsModuleReady = false;

  var requiredVehicleDomainApi = [
    'vehicleNeedsK2Belgesi',
    'vehicleNeedsTakograf',
    'getK2BelgesiExpiryDate',
    'isVehicleOperationallyInactive',
    'getEgzozMuayeneState',
    'isEgzozMuayeneCritical'
  ];
  for (var vehicleDomainApiIndex = 0; vehicleDomainApiIndex < requiredVehicleDomainApi.length; vehicleDomainApiIndex++) {
    var vehicleDomainApiKey = requiredVehicleDomainApi[vehicleDomainApiIndex];
    if (!window.MedisaVehicleNotificationDomain
      || typeof window.MedisaVehicleNotificationDomain !== 'object'
      || Array.isArray(window.MedisaVehicleNotificationDomain)
      || typeof window.MedisaVehicleNotificationDomain[vehicleDomainApiKey] !== 'function') {
      throw new Error('MedisaVehicleNotificationDomain hazir degil veya gecersiz');
    }
  }

  var DOM = {};
  var monthlyTodoCloseTimer = null;
  var monthlyTodoBranchFilterId = 'all';
  var MONTHLY_TODO_INTERACTION_REV = 4;
  var MONTHLY_TODO_HEADER_REV = 2;

  DOM.notificationsDropdown = document.getElementById('notifications-dropdown');
  DOM.notificationsToggleBtn = document.getElementById('notifications-toggle-btn');

  function readBranches() { return (typeof window.getMedisaBranches === 'function' ? window.getMedisaBranches() : null) || []; }
  function readVehicles() { return (typeof window.getMedisaVehicles === 'function' ? window.getMedisaVehicles() : null) || []; }
  function readUsers() { return (typeof window.getMedisaUsers === 'function' ? window.getMedisaUsers() : null) || []; }
  function toTitleCase(str) { return (typeof window.toTitleCase === 'function' ? window.toTitleCase(str) : str); }
  function formatBrandModel(str) { return (typeof window.formatBrandModel === 'function' ? window.formatBrandModel(str) : toTitleCase(str)); }
  function formatAdSoyad(str) { return (typeof window.formatAdSoyad === 'function' ? window.formatAdSoyad(str) : str); }
  function escapeHtml(text) { return (typeof window.escapeHtml === 'function') ? window.escapeHtml(text) : String(text == null ? '' : text); }
  function escapeAttr(text) { return (typeof window.escapeAttr === 'function') ? window.escapeAttr(text) : escapeHtml(text); }
  function checkDateWarnings(dateString) { return (typeof window.checkDateWarnings === 'function' ? window.checkDateWarnings(dateString) : { class: '', days: null }); }

  function getNotificationRecorderDisplayName() {
    if (typeof window.getRecorderDisplayName === 'function') {
      return window.getRecorderDisplayName();
    }
    try {
      var sess = typeof window.medisaSession === 'object' && window.medisaSession ? window.medisaSession : null;
      if (sess && sess.authenticated) {
        var u = sess.user || {};
        var sessionName = String(u.name || u.isim || '').trim();
        if (!sessionName && u.id) {
          var users = readUsers();
          var found = Array.isArray(users) ? users.find(function(x) { return String(x && x.id) === String(u.id); }) : null;
          if (found) sessionName = String(found.name || found.isim || '').trim();
        }
        if (sessionName) return formatAdSoyad(sessionName);
      }
    } catch (e0) { /* ignore */ }
    try {
      var ad = window.appData && (window.appData.recorderDisplayName || window.appData.fleetOperatorName || window.appData.operatorName);
      if (ad && String(ad).trim()) return toTitleCase(String(ad).trim());
    } catch (e1) { /* ignore */ }
    try {
      var ls = typeof localStorage !== 'undefined' ? localStorage.getItem('medisa_recorder_display_name') : '';
      if (ls && String(ls).trim()) return toTitleCase(String(ls).trim());
    } catch (e2) { /* ignore */ }
    return 'Yönetim';
  }

  function isMainAppSessionGenelYonetici() {
    try {
      var sess = typeof window.medisaSession === 'object' && window.medisaSession ? window.medisaSession : null;
      var sr = sess && (sess.role || (sess.user && sess.user.role));
      return !!(sess && sess.authenticated && String(sr || '').trim() === 'genel_yonetici');
    } catch (e) {
      return false;
    }
  }

  function formatDateForDisplay(dateStr) {
    if (!dateStr) return '';
    const raw = String(dateStr).trim();
    if (/\d{4}-\d{2}-\d{2}[T ]\d{2}/.test(raw)) {
      const parsedIso = new Date(raw);
      if (!isNaN(parsedIso.getTime())) {
        const d = String(parsedIso.getDate()).padStart(2, '0');
        const m = String(parsedIso.getMonth() + 1).padStart(2, '0');
        const y = String(parsedIso.getFullYear());
        const hh = String(parsedIso.getHours()).padStart(2, '0');
        const min = String(parsedIso.getMinutes()).padStart(2, '0');
        return d + '/' + m + '/' + y + ' ' + hh + ':' + min;
      }
    }
    if (typeof window.formatDateShort === 'function') {
      const formatted = window.formatDateShort(dateStr);
      if (formatted) {
        const formattedStr = String(formatted).trim();
        if (formattedStr && (formattedStr !== raw || /[./-]/.test(formattedStr))) {
          return formattedStr;
        }
      }
    }
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return iso[3] + '/' + iso[2] + '/' + iso[1];
    const compactIso = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compactIso) return compactIso[3] + '/' + compactIso[2] + '/' + compactIso[1];
    const compactTr = raw.match(/^(\d{2})(\d{2})(\d{4})$/);
    if (compactTr) return compactTr[1] + '/' + compactTr[2] + '/' + compactTr[3];
    const dot = raw.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
    if (dot) return dot[1] + '/' + dot[2] + '/' + dot[3];
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) {
      const d = String(parsed.getDate()).padStart(2, '0');
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const y = String(parsed.getFullYear());
      return d + '/' + m + '/' + y;
    }
    return raw;
  }

  function medisaNotificationTalepSortMs(str) {
    const t = Date.parse(String(str || '').trim());
    if (!isNaN(t)) return t;
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.getTime();
    return 0;
  }

  const NOTIF_STATE_MAX_KEYS = 500;
  const NOTIF_STATE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
  const NOTIF_FIRST_SEEN_STORAGE_KEY = 'medisa_notif_first_seen_dates_v1';
  let notifFirstSeenBatchContext = null;

  function getCurrentNotifScopeKey() {
    const session = (window.medisaSession && typeof window.medisaSession === 'object') ? window.medisaSession : {};
    const user = (session.user && typeof session.user === 'object') ? session.user : {};
    const userId = String(user.id != null ? user.id : '').trim();
    const role = String(session.role || user.role || session.raw_role || '').trim().toLowerCase();
    let branchIds = Array.isArray(session.branch_ids)
      ? session.branch_ids.map(function(id) { return String(id).trim(); }).filter(Boolean)
      : [];
    branchIds = Array.from(new Set(branchIds)).sort();
    const branchScope = branchIds.length ? branchIds.join(',') : (role === 'genel_yonetici' || String(session.branch_scope || '').toLowerCase() === 'all' ? 'all' : 'none');
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
    const seen = {};
    const out = [];
    (Array.isArray(keys) ? keys : []).forEach(function(key) {
      const normalized = String(key || '').trim();
      if (!normalized || seen[normalized]) return;
      seen[normalized] = true;
      out.push(normalized);
    });
    return out;
  }

  function parseNotificationKeyMs(key) {
    const parts = String(key || '').split('|');
    const dateText = parts[0] === 'date' ? parts[3]
      : parts[0] === 'event' && /[T:.-]/.test(String(parts[3] || '')) ? parts[3]
      : parts[0] === 'special' && parts.length >= 4 ? (parts[2] + '-' + parts[3] + '-01')
      : '';
    if (!dateText) return 0;
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateText)) {
      const bits = dateText.split('.');
      return new Date(Number(bits[2]), Number(bits[1]) - 1, Number(bits[0])).getTime() || 0;
    }
    const ms = new Date(dateText).getTime();
    return isNaN(ms) ? 0 : ms;
  }

  function pruneNotificationKeys(keys) {
    const now = Date.now();
    const list = uniqNotificationKeys(keys).map(function(key, index) {
      return { key: key, index: index, ms: parseNotificationKeyMs(key) };
    }).filter(function(item) {
      return !item.ms || (now - item.ms) <= NOTIF_STATE_MAX_AGE_MS;
    });
    if (list.length <= NOTIF_STATE_MAX_KEYS) return list.map(function(item) { return item.key; });
    list.sort(function(a, b) {
      const am = a.ms || Number.MAX_SAFE_INTEGER;
      const bm = b.ms || Number.MAX_SAFE_INTEGER;
      if (am !== bm) return bm - am;
      return b.index - a.index;
    });
    return list.slice(0, NOTIF_STATE_MAX_KEYS).map(function(item) { return item.key; });
  }

  function normalizeFirstSeenDatesMap(rawMap) {
    const out = {};
    if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return out;
    Object.keys(rawMap).forEach(function(key) {
      const normalizedKey = String(key || '').trim();
      const normalizedDate = String(rawMap[key] || '').trim();
      if (!normalizedKey || !normalizedDate) return;
      out[normalizedKey] = normalizedDate;
    });
    return out;
  }

  function normalizeNotificationScopeState(scopeState) {
    const legacyArray = Array.isArray(scopeState) ? scopeState : null;
    const raw = (!legacyArray && scopeState && typeof scopeState === 'object') ? scopeState : {};
    const dismissedKeys = pruneNotificationKeys(raw.dismissedKeys || []);
    const readKeys = pruneNotificationKeys((legacyArray || raw.readKeys || []).concat(dismissedKeys));
    return {
      readKeys: readKeys,
      dismissedKeys: dismissedKeys,
      firstSeenDates: normalizeFirstSeenDatesMap(raw.firstSeenDates),
      migratedFromLocalStorage: raw.migratedFromLocalStorage === true,
      updatedAt: String(raw.updatedAt || '')
    };
  }

  function getNotificationScopeState(scopeKey) {
    const state = ensureNotificationReadStateObject();
    const normalized = normalizeNotificationScopeState(state[scopeKey]);
    state[scopeKey] = normalized;
    return normalized;
  }

  function cloneNotificationScopeState(scopeState) {
    const normalized = normalizeNotificationScopeState(scopeState);
    return {
      readKeys: normalized.readKeys.slice(),
      dismissedKeys: normalized.dismissedKeys.slice(),
      firstSeenDates: Object.assign({}, normalized.firstSeenDates),
      migratedFromLocalStorage: normalized.migratedFromLocalStorage,
      updatedAt: normalized.updatedAt
    };
  }

  function getViewedNotificationKeys() {
    const scopeKey = getCurrentNotifScopeKey();
    return getNotificationScopeState(scopeKey).readKeys;
  }

  function getDismissedNotificationKeys() {
    const scopeKey = getCurrentNotifScopeKey();
    return getNotificationScopeState(scopeKey).dismissedKeys;
  }

  function getKaskoState() {
    if (!window.appData || typeof window.appData !== 'object') window.appData = {};
    if (!window.appData.kaskoDegerListesi || typeof window.appData.kaskoDegerListesi !== 'object') {
      window.appData.kaskoDegerListesi = { updatedAt: '', period: '', sourceFileName: '', rows: [] };
    }
    if (!Array.isArray(window.appData.kaskoDegerListesi.rows)) window.appData.kaskoDegerListesi.rows = [];
    return window.appData.kaskoDegerListesi;
  }

  function saveNotificationScopeStateWithRollback(scopeKey, previousScoped) {
    if (typeof window.updateNotifications === 'function') window.updateNotifications();
    if (typeof window.saveDataToServer !== 'function') return;
    window.saveDataToServer()
      .then(function(ok) {
        if (ok === false) throw new Error('Bildirim state kaydedilemedi');
      })
      .catch(function() {
        const state = ensureNotificationReadStateObject();
        state[scopeKey] = cloneNotificationScopeState(previousScoped);
        if (typeof window.updateNotifications === 'function') window.updateNotifications();
      });
  }

  function getTodayNotificationDisplayDate() {
    return formatDateForDisplay(new Date()) || '-';
  }

  function getCurrentNotificationFirstSeenValue() {
    return String(Date.now());
  }

  function parseNotificationFirstSeenMs(value) {
    const raw = String(value || '').trim();
    if (!raw || raw === '-') return 0;
    if (/^\d+$/.test(raw)) {
      const n = Number(raw);
      if (isFinite(n) && n > 0) return n < 1000000000000 ? n * 1000 : n;
    }
    const trMatch = raw.match(/^(\d{2})[./-](\d{2})[./-](\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
    if (trMatch) {
      const day = Number(trMatch[1]);
      const month = Number(trMatch[2]);
      const year = Number(trMatch[3]);
      const hour = trMatch[4] != null ? Number(trMatch[4]) : 0;
      const minute = trMatch[5] != null ? Number(trMatch[5]) : 0;
      const dt = new Date(year, month - 1, day, hour, minute, 0, 0);
      if (!isNaN(dt.getTime())) return dt.getTime();
    }
    const parsed = Date.parse(raw);
    return isNaN(parsed) ? 0 : parsed;
  }

  function formatNotificationFirstSeenDisplay(value) {
    const raw = String(value || '').trim();
    const ms = parseNotificationFirstSeenMs(raw);
    if (ms > 0) {
      const parsedDate = new Date(ms);
      const d = String(parsedDate.getDate()).padStart(2, '0');
      const m = String(parsedDate.getMonth() + 1).padStart(2, '0');
      const y = String(parsedDate.getFullYear());
      return d + '/' + m + '/' + y;
    }
    return raw || '-';
  }

  function beginNotificationFirstSeenBatch(scopeKey) {
    notifFirstSeenBatchContext = scopeKey ? { scopeKey: scopeKey, previousScoped: null, changed: false } : null;
  }

  function flushNotificationFirstSeenBatch() {
    const batch = notifFirstSeenBatchContext;
    notifFirstSeenBatchContext = null;
    if (!batch || !batch.changed || !batch.previousScoped) return;
    saveNotificationScopeStateWithRollback(batch.scopeKey, batch.previousScoped);
  }

  function getOrCreateNotificationFirstSeenValue(notifKey) {
    const normalizedKey = String(notifKey || '').trim();
    if (!normalizedKey) return '-';
    const scopeKey = getCurrentNotifScopeKey();
    if (scopeKey) {
      const state = ensureNotificationReadStateObject();
      const scoped = getNotificationScopeState(scopeKey);
      const existing = scoped.firstSeenDates && scoped.firstSeenDates[normalizedKey];
      if (existing) return existing;
      const firstSeenValue = getCurrentNotificationFirstSeenValue();
      if (!scoped.firstSeenDates || typeof scoped.firstSeenDates !== 'object' || Array.isArray(scoped.firstSeenDates)) {
        scoped.firstSeenDates = {};
      }
      if (notifFirstSeenBatchContext && notifFirstSeenBatchContext.scopeKey === scopeKey) {
        if (!notifFirstSeenBatchContext.previousScoped) notifFirstSeenBatchContext.previousScoped = cloneNotificationScopeState(scoped);
        notifFirstSeenBatchContext.changed = true;
      } else {
        const previousScoped = cloneNotificationScopeState(scoped);
        scoped.firstSeenDates[normalizedKey] = firstSeenValue;
        scoped.updatedAt = new Date().toISOString();
        state[scopeKey] = scoped;
        saveNotificationScopeStateWithRollback(scopeKey, previousScoped);
        return firstSeenValue;
      }
      scoped.firstSeenDates[normalizedKey] = firstSeenValue;
      scoped.updatedAt = new Date().toISOString();
      state[scopeKey] = scoped;
      return firstSeenValue;
    }
    let localMap = {};
    try {
      const raw = localStorage.getItem(NOTIF_FIRST_SEEN_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      localMap = normalizeFirstSeenDatesMap(parsed);
    } catch (err) {}
    if (localMap[normalizedKey]) return localMap[normalizedKey];
    const firstSeenValue = getCurrentNotificationFirstSeenValue();
    localMap[normalizedKey] = firstSeenValue;
    try {
      localStorage.setItem(NOTIF_FIRST_SEEN_STORAGE_KEY, JSON.stringify(localMap));
    } catch (err) {}
    return firstSeenValue;
  }

  function getOrCreateNotificationFirstSeen(notifKey) {
    return formatNotificationFirstSeenDisplay(getOrCreateNotificationFirstSeenValue(notifKey));
  }

  function getOrCreateNotificationFirstSeenMs(notifKey) {
    const normalizedKey = String(notifKey || '').trim();
    if (!normalizedKey) return 0;
    const value = getOrCreateNotificationFirstSeenValue(normalizedKey);
    const ms = parseNotificationFirstSeenMs(value);
    if (ms > 0) return ms;
    return Date.now();
  }

  function updateNotificationKeys(keys, mode) {
    const incoming = Array.isArray(keys) ? keys : [];
    if (!incoming.length) return;
    const scopeKey = getCurrentNotifScopeKey();
    const state = ensureNotificationReadStateObject();
    const scoped = getNotificationScopeState(scopeKey);
    const previousScoped = cloneNotificationScopeState(scoped);
    const readSet = {};
    const dismissedSet = {};
    scoped.readKeys.forEach(function(key) { readSet[key] = true; });
    scoped.dismissedKeys.forEach(function(key) { dismissedSet[key] = true; readSet[key] = true; });
    let changed = false;
    incoming.forEach(function(key) {
      const normalizedKey = String(key || '').trim();
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
  }

  function markNotificationKeysAsViewed(keys) {
    updateNotificationKeys(keys, 'read');
  }

  function dismissNotificationKeys(keys) {
    updateNotificationKeys(keys, 'dismiss');
  }

  function getUnreadNotificationKeys() {
    return (DOM.notificationsDropdown ? Array.from(DOM.notificationsDropdown.querySelectorAll('.notification-item.notification-unread[data-notif-key]')) : [])
      .map(function(el) { return (el.getAttribute('data-notif-key') || '').toString().trim(); })
      .filter(Boolean);
  }

  function getVisibleMarkableNotificationKeys() {
    return uniqNotificationKeys(DOM.notificationsDropdown ? Array.from(DOM.notificationsDropdown.querySelectorAll('.notification-item[data-notif-key]'))
      .map(function(el) { return (el.getAttribute('data-notif-key') || '').toString().trim(); })
      .filter(Boolean) : []);
  }

  function getDismissibleNotificationKeys() {
    return (DOM.notificationsDropdown ? Array.from(DOM.notificationsDropdown.querySelectorAll('.notification-item[data-dismiss-key]')) : [])
      .map(function(el) { return (el.getAttribute('data-dismiss-key') || '').toString().trim(); })
      .filter(Boolean);
  }

  function buildDateNotificationKey(notif) {
    if (notif && notif.type === 'k2') {
      return ['date', 'settings', 'k2', String(notif.date || '')].join('|');
    }
    return ['date', String(notif.vehicleId || ''), String(notif.type || ''), String(notif.date || ''), String(notif.type || '')].join('|');
  }

  function buildEventNotificationKey(item) {
    const ev = item && item.event ? item.event : {};
    const vehicleId = String((item && item.vehicleId) || '');
    const eventType = String(ev.type || '');
    const eventId = String(ev.id || '').trim();
    if (eventId) return ['event', vehicleId, eventType, eventId].join('|');
    const timestamp = String(ev.timestamp || '').trim();
    if (timestamp) return ['event', vehicleId, eventType, timestamp].join('|');
    return ['event', vehicleId, eventType, String(ev.date || '')].join('|');
  }

  function isDriverFeedbackEvent(ev) {
    if (!ev || typeof ev !== 'object') return false;
    const eventType = String(ev.type || '').trim().toLowerCase();
    if (eventType === 'driver-feedback') return true;
    const eventId = String(ev.id || '').trim().toLowerCase();
    if (eventId.indexOf('feedback-') === 0) return true;
    const evData = ev.data && typeof ev.data === 'object' ? ev.data : null;
    if (!evData) return false;
    return evData.talepId != null && (evData.konuTuru != null || evData.mesaj != null);
  }

  function isKaskoDegerListesiUploadUnavailableForNotifClick() {
    if (typeof window.medisaIsDisVeriPanelUnavailableOnDevice === 'function') {
      return window.medisaIsDisVeriPanelUnavailableOnDevice();
    }
    const hasMatchMedia = typeof window.matchMedia === 'function';
    const isMobileViewport = hasMatchMedia
      ? window.matchMedia('(max-width: 640px)').matches
      : window.innerWidth <= 640;
    const ua = navigator.userAgent || '';
    const isiOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isStandalone = hasMatchMedia
      && (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches);
    return isMobileViewport || (isiOS && (isStandalone || window.navigator.standalone === true));
  }

  function showKaskoExcelMobileWarning() {
    const msg = 'Kasko değer listesi yükleme işlemi yalnızca masaüstü görünümde yapılabilir.';
    if (typeof window.showCenteredInfoBox === 'function') {
      window.showCenteredInfoBox(msg);
      return;
    }
    const overlay = document.getElementById('centered-info-box');
    const msgEl = document.getElementById('centered-info-message');
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

  /**
   * Mobil/PWA: document-level capture, script-core dışarı-tıklama (bubble) kapanışından ÖNCE çalışır;
   * stopImmediatePropagation ile panel kapanmadan uyarı gösterilir, sonra panel kapatılır.
   */
  if (!document._medisaKaskoNotifMobileCaptureBound) {
    document._medisaKaskoNotifMobileCaptureBound = true;
    document.addEventListener('click', function(e) {
      var notif = DOM.notificationsDropdown || document.getElementById('notifications-dropdown');
      if (!notif || !notif.classList.contains('open')) return;
      if (!notif.contains(e.target)) return;
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

  // Bildirim listesi: delegation (her bildirime ayrı onclick yerine tek listener)
  if (DOM.notificationsDropdown && !DOM.notificationsDropdown._notifDelegationBound) {
    DOM.notificationsDropdown._notifDelegationBound = true;
    DOM.notificationsDropdown.addEventListener('click', function(e) {
      var rawTarget = e.target;
      var targetEl = rawTarget && rawTarget.nodeType === 1
        ? rawTarget
        : (rawTarget && rawTarget.parentElement ? rawTarget.parentElement : null);
      if (!targetEl || typeof targetEl.closest !== 'function') return;

      var actionBtn = targetEl.closest('[data-notification-action]');
      if (actionBtn) {
        var toolbarAction = (actionBtn.getAttribute('data-notification-action') || '').toString().trim();
        if (toolbarAction === 'mark-all-read') {
          e.preventDefault();
          e.stopPropagation();
          markNotificationKeysAsViewed(getVisibleMarkableNotificationKeys().concat(getDismissibleNotificationKeys()));
          return;
        }
      }
      var btn = targetEl.closest('.notification-item');
      if (!btn) return;
      var action = (btn.getAttribute('data-action') || '').toString().trim();
      var notifKey = (btn.getAttribute('data-notif-key') || '').toString().trim();
      if (notifKey && !targetEl.closest('.mtv-dismiss-btn')) {
        markNotificationKeysAsViewed([notifKey]);
      }
      if (action === 'open-dis-veri') {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.setNotificationsOpenState === 'function') {
          window.setNotificationsOpenState(false);
        }
        if (isKaskoDegerListesiUploadUnavailableForNotifClick()) {
          showKaskoExcelMobileWarning();
          if (typeof window.setNotificationsOpenState === 'function') {
            window.setNotificationsOpenState(false);
          }
          return;
        }
        if (typeof window.setNotificationsOpenState === 'function') {
          window.setNotificationsOpenState(false);
        }
        if (typeof window.openDisVeriPanel === 'function') window.openDisVeriPanel();
        return;
      }
      if (action === 'open-driver-report') {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.setNotificationsOpenState === 'function') {
          window.setNotificationsOpenState(false);
        }
        window.location.href = 'admin/driver-report.html?from=notifications';
        return;
      }
      if (action === 'open-required-documents') {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.setNotificationsOpenState === 'function') {
          window.setNotificationsOpenState(false);
        }
        if (typeof window.openZorunluEvraklar === 'function') window.openZorunluEvraklar();
        return;
      }
      var plate = btn.getAttribute('data-plate') || '';
      var vehicleId = btn.getAttribute('data-vehicle-id') || '';
      var openHistory = btn.getAttribute('data-open-history') === '1';
      var historyTab = btn.getAttribute('data-history-tab') || '';
      if (!plate && !vehicleId) return;
      if (typeof window.setNotificationsOpenState === 'function') {
        window.setNotificationsOpenState(false);
      }
      var vehicles = readVehicles();
      if (!Array.isArray(vehicles) || vehicles.length === 0) {
        vehicles = (window.getMedisaVehicles && window.getMedisaVehicles()) || [];
      }
      var plateNorm = String(plate || '').trim().toUpperCase();
      var v = vehicleId
        ? vehicles.find(function(v) { return String(v.id) === String(vehicleId); })
        : vehicles.find(function(v) { return String(v.plate || '').trim().toUpperCase() === plateNorm; });
      if (!v) throw new Error('Bildirim hedef tasit bulunamadi');
      if (openHistory) {
        var tab = (/^(bakim|kaza|km|diger)$/.test(historyTab)) ? historyTab : null;
        if (typeof window.medisaOpenVehicleHistoryFromNotification !== 'function') {
          throw new Error('Bildirim tarihce koprusu hazir degil');
        }
        window.medisaOpenVehicleHistoryFromNotification(v.id, tab);
      } else {
        window.__vehicleHistoryOpenedFromNotifications = false;
        if (typeof window.medisaOpenVehicleDetailFromNotification !== 'function') {
          throw new Error('Bildirim detay koprusu hazir degil');
        }
        window.medisaOpenVehicleDetailFromNotification(v.id);
      }
    });
  }

  function syncMobileNotificationsDropdownHeight() {
    var dropdown = DOM.notificationsDropdown || document.getElementById('notifications-dropdown');
    if (!dropdown) return;
    if (!dropdown.classList.contains('open')) {
      dropdown.style.removeProperty('max-height');
      dropdown.style.removeProperty('padding-bottom');
      dropdown.style.removeProperty('scroll-padding-bottom');
      dropdown.style.removeProperty('--mobile-notifications-max-height');
      dropdown.style.removeProperty('position');
      dropdown.style.removeProperty('top');
      dropdown.style.removeProperty('left');
      dropdown.style.removeProperty('right');
      dropdown.style.removeProperty('transform');
      dropdown.style.removeProperty('width');
      dropdown.style.removeProperty('max-width');
      return;
    }

    var toggleBtn = DOM.notificationsToggleBtn || document.getElementById('notifications-toggle-btn');
    function clearNotifDropdownMobileLayout() {
      dropdown.style.removeProperty('position');
      dropdown.style.removeProperty('top');
      dropdown.style.removeProperty('left');
      dropdown.style.removeProperty('right');
      dropdown.style.removeProperty('transform');
      dropdown.style.removeProperty('width');
      dropdown.style.removeProperty('max-width');
    }
    if (window.innerWidth > 640) {
      clearNotifDropdownMobileLayout();
    } else if (toggleBtn) {
      var tr = toggleBtn.getBoundingClientRect();
      dropdown.style.setProperty('position', 'fixed', 'important');
      dropdown.style.setProperty('top', Math.round(tr.bottom + 4) + 'px', 'important');
      dropdown.style.setProperty('left', 'auto', 'important');
      dropdown.style.setProperty('right', 'max(8px, env(safe-area-inset-right, 0px))', 'important');
      dropdown.style.setProperty('transform', 'none', 'important');
      dropdown.style.setProperty('width', 'min(82vw, 420px)', 'important');
      dropdown.style.setProperty('max-width', 'calc(100vw - 28px)', 'important');
    } else {
      clearNotifDropdownMobileLayout();
    }

    var dropdownRect = dropdown.getBoundingClientRect();
    if (!dropdownRect || dropdownRect.top <= 0) return;
    var footer = document.getElementById('app-footer');
    var footerTop = footer ? (footer.getBoundingClientRect().top - 3) : (window.innerHeight - 45);
    var available = Math.floor(footerTop - dropdownRect.top);
    if (available <= 0) return;

    var dropdownStyles = window.getComputedStyle(dropdown);
    var paddingTop = parseFloat(dropdownStyles.paddingTop) || 0;
    var paddingBottom = parseFloat(dropdownStyles.paddingBottom) || 0;
    /* Mobil ve masaüstünde 6 tam kart; son border klibini önlemek için alt güvenlik payı */
    var isMobile = window.innerWidth <= 640;
    var safetyBottom = isMobile ? 10 : 14;
    var visibleLimit = 6;
    var innerBudget = Math.max(0, available - paddingTop - paddingBottom - safetyBottom);

    var toolbarHeight = 0;
    var cardHeights = [];
    var children = dropdown.children;
    for (var i = 0; i < children.length; i += 1) {
      var child = children[i];
      if (!child || child.nodeType !== 1) continue;
      var rect = child.getBoundingClientRect();
      if (!rect || rect.height <= 0) continue;
      var childStyles = window.getComputedStyle(child);
      var outerHeight = Math.ceil(
        rect.height +
        (parseFloat(childStyles.marginTop) || 0) +
        (parseFloat(childStyles.marginBottom) || 0)
      );
      if (!outerHeight) continue;
      if (child.classList.contains('notifications-toolbar')) {
        toolbarHeight += outerHeight;
        continue;
      }
      cardHeights.push(outerHeight);
    }

    var contentAfterToolbar = Math.max(0, innerBudget - toolbarHeight);
    var sumCards = 0;
    var fullCardCount = 0;
    for (var j = 0; j < cardHeights.length && fullCardCount < visibleLimit; j += 1) {
      var h = cardHeights[j];
      if (sumCards + h <= contentAfterToolbar) {
        sumCards += h;
        fullCardCount += 1;
      } else {
        break;
      }
    }

    /* safetyBottom yalnızca innerBudget'ta ayrılır; target'a eklenmez — eklenince viewport kartların altında uzar, 7. kart yarım görünür */
    var preferredContent = toolbarHeight + sumCards;
    var target = Math.ceil(paddingTop + paddingBottom + preferredContent);
    /* Hiçbir kart dikey bütçeye tam sığmıyorsa: kaydırma alanı için footer üstünü kullan (yarım satır yerine tam viewport) */
    if (cardHeights.length > 0 && fullCardCount === 0 && target < available) {
      target = available;
    } else {
      target = Math.min(available, target);
    }

    dropdown.style.setProperty('max-height', Math.max(0, target) + 'px', 'important');
    dropdown.style.setProperty('padding-bottom', safetyBottom + 'px', 'important');
    dropdown.style.setProperty('scroll-padding-bottom', safetyBottom + 'px');
    dropdown.style.setProperty('--mobile-notifications-max-height', Math.max(0, target) + 'px');
  }

  window.syncMobileNotificationsDropdownHeight = syncMobileNotificationsDropdownHeight;

  function resetNotificationsDropdownLayoutState() {
    var dropdown = DOM.notificationsDropdown || document.getElementById('notifications-dropdown');
    if (!dropdown) return;
    dropdown.style.removeProperty('max-height');
    dropdown.style.removeProperty('height');
    dropdown.style.removeProperty('min-height');
    dropdown.style.removeProperty('padding-bottom');
    dropdown.style.removeProperty('scroll-padding-bottom');
    dropdown.style.removeProperty('overflow');
    dropdown.style.removeProperty('transform');
    dropdown.style.removeProperty('--mobile-notifications-max-height');
    dropdown.style.removeProperty('position');
    dropdown.style.removeProperty('top');
    dropdown.style.removeProperty('left');
    dropdown.style.removeProperty('right');
    dropdown.style.removeProperty('width');
    dropdown.style.removeProperty('max-width');
  }

  window.resetNotificationsDropdownLayoutState = resetNotificationsDropdownLayoutState;

  if (!window.__medisaNotifDropdownResizeBound) {
    window.__medisaNotifDropdownResizeBound = true;
    window.addEventListener('resize', function() {
      if (typeof window.syncMobileNotificationsDropdownHeight === 'function') {
        requestAnimationFrame(window.syncMobileNotificationsDropdownHeight);
      }
    }, { passive: true });
  }

  function checkK2BelgesiWarnings(dateString) {
    if (!dateString) return { class: '', days: null };
    var date = new Date(dateString + 'T00:00:00');
    if (isNaN(date.getTime())) return { class: '', days: null };
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    var diffDays = Math.ceil((date - today) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { class: 'date-warning-red', days: diffDays };
    if (diffDays <= 7) return { class: 'date-warning-red', days: diffDays };
    if (diffDays <= 60) return { class: 'date-warning-orange', days: diffDays };
    return { class: '', days: diffDays };
  }

  function rawVehicleDateExpiryInCurrentCalendarMonth(rawDate) {
    if (rawDate == null || String(rawDate).trim() === '') return false;
    var y = NaN;
    var moZero = NaN;
    if (typeof window.parseVehicleDateRawToIso === 'function') {
      var iso = window.parseVehicleDateRawToIso(rawDate);
      if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        var p = iso.split('-');
        y = parseInt(p[0], 10);
        moZero = parseInt(p[1], 10) - 1;
      }
    }
    if (isNaN(y) || isNaN(moZero)) {
      var fallbackDate = new Date(String(rawDate).trim());
      if (isNaN(fallbackDate.getTime())) return false;
      y = fallbackDate.getFullYear();
      moZero = fallbackDate.getMonth();
    }
    var now = new Date();
    return moZero === now.getMonth() && y === now.getFullYear();
  }

  /**
   * Aylık özet filtresi:
   * - Geçmişe düşenler (days < 0) her zaman listelenir.
   * - Yaklaşanlarda takvim ayı kısıtı yerine aktif hatırlatma penceresi kullanılır
   *   (checkDateWarnings sınıf üretiyorsa: bugün/çok yakın/yaklaşıyor).
   * Böylece ay sonundaki kayıtlar, bir sonraki ayın ilk günlerine taşsa bile özetten kaçmaz.
   */
  function monthlyOperationalDateTaskFilterPasses(rawDate, warning) {
    if (rawDate == null || String(rawDate).trim() === '') return false;
    if (!warning || typeof warning !== 'object') return false;
    if (typeof warning.days === 'number' && warning.days < 0) return true;
    if (typeof warning.days === 'number' && warning.days >= 0 && !!warning.class) return true;
    if (rawVehicleDateExpiryInCurrentCalendarMonth(rawDate)) return true;
    return false;
  }

  var _vehicleDateTasksCache = null;
  /** Aylık modal: ana iş parçacığında tam tarama yapmadan önbelleği okumak için (null = henüz doldurulmadı). */
  function peekVehicleDateTasksCache() {
    return _vehicleDateTasksCache;
  }

  var _monthlyTodoModalBodyFillScheduled = false;

  function invalidateVehicleDateTasksCache() {
    _vehicleDateTasksCache = null;
  }
  window.invalidateVehicleDateTasksCache = invalidateVehicleDateTasksCache;

  function computeMuayeneWarningForOperationalScan(vehicle) {
    if (!vehicle || !vehicle.muayeneDate) return null;
    var warning = checkDateWarnings(vehicle.muayeneDate);
    if (window.MedisaVehicleNotificationDomain.isEgzozMuayeneCritical(vehicle)) {
      warning.class = 'date-warning-red';
      if (typeof warning.days !== 'number') warning.days = -1;
    }
    return warning;
  }

  /**
   * Tek tarama ile tarih bildirimleri ve/veya aylık önbellek.
   * @param {Array|null} notificationsArray — bildirim kuyruğu (full bildirimi senaryosu).
   * @param {'full'|'monthly-cache-only'} scanMode — `full`: bildirim + önbellek (updateNotifications ile birebir); `monthly-cache-only`: yalnız önbellek, bildirime dokunma.
   */
  function runVehicleDateOperationalScan(notificationsArray, scanMode) {
    var mode = scanMode === 'monthly-cache-only' ? 'monthly-cache-only' : 'full';
    var attachNotif = mode === 'full' && Array.isArray(notificationsArray);

    var monthly = [];
    var vehicles = readVehicles();

    vehicles.forEach(function(vehicle) {
      if (window.MedisaVehicleNotificationDomain.isVehicleOperationallyInactive(vehicle)) return;

      var plate = vehicle.plate || '-';
      var brandModel = formatBrandModel(vehicle.brandModel || '-');

      if (vehicle.sigortaDate) {
        var wSig = checkDateWarnings(vehicle.sigortaDate);
        if (monthlyOperationalDateTaskFilterPasses(vehicle.sigortaDate, wSig)) {
          monthly.push({
            vehicle: vehicle,
            type: 'Sigorta',
            field: 'sigortaDate',
            date: vehicle.sigortaDate,
            days: wSig.days,
            status: (typeof wSig.days === 'number' && wSig.days < 0) ? 'past' : 'upcoming',
            warningClass: wSig.class
          });
        }
        if (attachNotif && wSig.class) {
          var ds = wSig.days;
          notificationsArray.push({
            type: 'sigorta',
            vehicleId: vehicle.id,
            plate: plate,
            brandModel: brandModel,
            date: vehicle.sigortaDate,
            days: ds,
            warningClass: wSig.class,
            status: ds < 0 ? 'geçmiş' : ds <= 3 ? 'çok yakın' : 'yaklaşıyor'
          });
        }
      }

      if (vehicle.kaskoDate) {
        var wKas = checkDateWarnings(vehicle.kaskoDate);
        if (monthlyOperationalDateTaskFilterPasses(vehicle.kaskoDate, wKas)) {
          monthly.push({
            vehicle: vehicle,
            type: 'Kasko',
            field: 'kaskoDate',
            date: vehicle.kaskoDate,
            days: wKas.days,
            status: (typeof wKas.days === 'number' && wKas.days < 0) ? 'past' : 'upcoming',
            warningClass: wKas.class
          });
        }
        if (attachNotif && wKas.class) {
          var dk = wKas.days;
          notificationsArray.push({
            type: 'kasko',
            vehicleId: vehicle.id,
            plate: plate,
            brandModel: brandModel,
            date: vehicle.kaskoDate,
            days: dk,
            warningClass: wKas.class,
            status: dk < 0 ? 'geçmiş' : dk <= 3 ? 'çok yakın' : 'yaklaşıyor'
          });
        }
      }

      if (window.MedisaVehicleNotificationDomain.vehicleNeedsTakograf(vehicle) && vehicle.takografExpiryDate) {
        var wTak = checkDateWarnings(vehicle.takografExpiryDate);
        if (monthlyOperationalDateTaskFilterPasses(vehicle.takografExpiryDate, wTak)) {
          monthly.push({
            vehicle: vehicle,
            type: 'Takograf',
            field: 'takografExpiryDate',
            date: vehicle.takografExpiryDate,
            days: wTak.days,
            status: (typeof wTak.days === 'number' && wTak.days < 0) ? 'past' : 'upcoming',
            warningClass: wTak.class
          });
        }
        if (attachNotif && wTak.class) {
          var dtak = wTak.days;
          notificationsArray.push({
            type: 'takograf',
            vehicleId: vehicle.id,
            plate: plate,
            brandModel: brandModel,
            date: vehicle.takografExpiryDate,
            days: dtak,
            warningClass: wTak.class,
            status: dtak < 0 ? 'geçmiş' : dtak <= 3 ? 'çok yakın' : 'yaklaşıyor'
          });
        }
      }

      if (vehicle.muayeneDate) {
        var wM = computeMuayeneWarningForOperationalScan(vehicle);
        if (wM && monthlyOperationalDateTaskFilterPasses(vehicle.muayeneDate, wM)) {
          monthly.push({
            vehicle: vehicle,
            type: 'Muayene',
            field: 'muayeneDate',
            date: vehicle.muayeneDate,
            days: wM.days,
            status: (typeof wM.days === 'number' && wM.days < 0) ? 'past' : 'upcoming',
            warningClass: wM.class
          });
        }
        if (attachNotif && wM && wM.class) {
          var dm = wM.days;
          notificationsArray.push({
            type: 'muayene',
            vehicleId: vehicle.id,
            plate: plate,
            brandModel: brandModel,
            date: vehicle.muayeneDate,
            days: dm,
            warningClass: wM.class,
            status: dm < 0 ? 'geçmiş' : dm <= 3 ? 'çok yakın' : 'yaklaşıyor'
          });
        }
      }

      var egzozState = window.MedisaVehicleNotificationDomain.getEgzozMuayeneState(vehicle);
      if (egzozState.state === 'missing') {
        monthly.push({
          vehicle: vehicle,
          type: 'Egzoz Muayene',
          field: 'egzozMuayeneDate',
          date: '',
          days: -1,
          status: 'past',
          warningClass: 'date-warning-red'
        });
      } else if (egzozState.date) {
        var wEgz = checkDateWarnings(egzozState.date);
        if (monthlyOperationalDateTaskFilterPasses(egzozState.date, wEgz)) {
          monthly.push({
            vehicle: vehicle,
            type: 'Egzoz Muayene',
            field: 'egzozMuayeneDate',
            date: egzozState.date,
            days: wEgz.days,
            status: (typeof wEgz.days === 'number' && wEgz.days < 0) ? 'past' : 'upcoming',
            warningClass: wEgz.class
          });
        }
      }

      if (attachNotif && egzozState.warningClass) {
        var egDays = typeof egzozState.days === 'number' ? egzozState.days : -1;
        var egStatus = egzozState.state === 'missing'
          ? 'eksik'
          : (egDays < 0 ? 'geçmiş' : egDays <= 3 ? 'çok yakın' : 'yaklaşıyor');
        notificationsArray.push({
          type: 'egzoz',
          vehicleId: vehicle.id,
          plate: plate,
          brandModel: brandModel,
          date: egzozState.date || 'missing',
          days: egDays,
          warningClass: egzozState.warningClass,
          status: egStatus,
          missing: egzozState.state === 'missing'
        });
      }
    });

    var k2Date = window.MedisaVehicleNotificationDomain.getK2BelgesiExpiryDate();
    var k2AnchorVehicle = vehicles.find(function(vehicle) {
      return !window.MedisaVehicleNotificationDomain.isVehicleOperationallyInactive(vehicle) && window.MedisaVehicleNotificationDomain.vehicleNeedsK2Belgesi(vehicle);
    });
    if (k2AnchorVehicle && k2Date) {
      var wK2 = checkK2BelgesiWarnings(k2Date);
      if (monthlyOperationalDateTaskFilterPasses(k2Date, wK2)) {
        monthly.push({
          vehicle: { id: '', plate: 'Şirket Evrakı', brandModel: 'K2 Belgesi' },
          type: 'K2 Belgesi',
          field: 'k2BelgesiExpiryDate',
          date: k2Date,
          days: wK2.days,
          status: (typeof wK2.days === 'number' && wK2.days < 0) ? 'past' : 'upcoming',
          warningClass: wK2.class
        });
      }
      if (attachNotif && wK2.class) {
        var dk2 = wK2.days;
        notificationsArray.push({
          type: 'k2',
          vehicleId: '',
          plate: 'Şirket Evrakı',
          brandModel: 'K2 Belgesi',
          date: k2Date,
          days: dk2,
          warningClass: wK2.class,
          status: dk2 < 0 ? 'geçmiş' : dk2 <= 3 ? 'çok yakın' : 'yaklaşıyor'
        });
      }
    }

    monthly.sort(function(a, b) {
      var da = typeof a.days === 'number' ? a.days : 9999;
      var db = typeof b.days === 'number' ? b.days : 9999;
      var aPast = da < 0;
      var bPast = db < 0;
      if (aPast !== bPast) return aPast ? -1 : 1;
      return da - db;
    });

    _vehicleDateTasksCache = monthly;
  }

  function getVehicleDateTasks() {
    if (_vehicleDateTasksCache === null) {
      runVehicleDateOperationalScan(null, 'monthly-cache-only');
    }
    return _vehicleDateTasksCache || [];
  }

  function updateMonthlyTodoHeaderBadge() {
    var btn = document.getElementById('monthly-todo-header-btn');
    var badge = btn ? btn.querySelector('.monthly-todo-header-badge') : null;
    if (!btn || !badge) return;
    var list = getVehicleDateTasks();
    var merged = buildMonthlyTodoMergedDisplayTasks(list);
    var n = merged.length;
    if (n <= 0) {
      badge.textContent = '';
      badge.setAttribute('hidden', 'hidden');
      badge.setAttribute('aria-hidden', 'true');
      btn.setAttribute('aria-label', 'Bu ay yapılacaklar');
      return;
    }
    badge.textContent = String(n);
    badge.removeAttribute('hidden');
    badge.setAttribute('aria-hidden', 'false');
    btn.setAttribute('aria-label', 'Bu ay yapılacaklar, ' + String(n) + ' işlem');
  }

  function getMonthlyTodoKullaniciLabel(vehicle, userMapById) {
    if (!vehicle) return '-';
    var assignedUser = vehicle.assignedUserId ? userMapById[String(vehicle.assignedUserId)] : null;
    var raw = (assignedUser && (assignedUser.name || assignedUser.isim || assignedUser.fullName))
      || vehicle.tahsisKisi
      || '';
    if (!String(raw).trim()) return '-';
    return formatAdSoyad(String(raw));
  }

  function getMonthlyTodoVehicleBranchLabel(vehicle, branchNameMap) {
    if (!vehicle) return '';
    var branchId = vehicle.branchId;
    if (branchId === undefined || branchId === null || String(branchId).trim() === '') return '';
    var raw = branchNameMap && branchNameMap[String(branchId)];
    if (!raw || !String(raw).trim()) return '';
    return String(raw).trim();
  }

  function getMonthlyTodoAssignedUserPhone(vehicle, userMap) {
    if (!vehicle || vehicle.assignedUserId == null || String(vehicle.assignedUserId).trim() === '') return '';
    var user = userMap[String(vehicle.assignedUserId)];
    if (!user) return '';
    var p = user.phone != null ? user.phone : user.telefon;
    return String(p || '').trim();
  }

  function normalizeMonthlyTodoWhatsAppPhone(phone) {
    var d = String(phone || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length === 10 && d.charAt(0) === '5') return '90' + d;
    if (d.length === 11 && d.charAt(0) === '0') return '90' + d.slice(1);
    if (d.length === 12 && d.indexOf('90') === 0) return d;
    return '';
  }

  /** Ana uygulama kök path: /medisa/index.html → /medisa/, /index.html → / */
  function getMedisaMainAppRootPathname() {
    try {
      var p = window.location && window.location.pathname ? String(window.location.pathname) : '/';
      var parts = p.split('/').filter(Boolean);
      if (!parts.length) return '/';
      var last = parts[parts.length - 1];
      if (last && last.indexOf('.') !== -1) parts.pop();
      return parts.length ? '/' + parts.join('/') + '/' : '/';
    } catch (e) {
      return '/';
    }
  }

  /** Aylık özet: task.type + gerekirse task.field → kanonik tür (WhatsApp / kısa link / etiket ortak). task.tip kullanılmaz. */
  function resolveMonthlyTodoTaskKind(task) {
    var type = task && task.type != null ? String(task.type).trim() : '';
    if (!type && task && task.field != null) {
      var f = String(task.field).trim();
      if (f === 'sigortaDate') type = 'Sigorta';
      else if (f === 'kaskoDate') type = 'Kasko';
      else if (f === 'muayeneDate') type = 'Muayene';
      else if (f === 'egzozMuayeneDate') type = 'Egzoz Muayene';
      else if (f === 'k2BelgesiExpiryDate') type = 'K2 Belgesi';
      else if (f === 'takografExpiryDate') type = 'Takograf';
      else if (f === 'muayeneDate+egzozMuayeneDate') type = 'Muayene + Egzoz';
      else if (f === 'sigortaDate+kaskoDate') type = 'Sigorta + Kasko';
      else if (f === 'guncelKm' || f === 'km') type = 'KM';
    }
    return type;
  }

  /** Aylık özet WhatsApp kısa link (/t/...) için görev tipi → kod. */
  function getMonthlyTodoDriverFeedbackShortCode(task) {
    var type = resolveMonthlyTodoTaskKind(task);
    switch (type) {
      case 'Sigorta':
        return 's';
      case 'Kasko':
        return 'k';
      case 'Sigorta + Kasko':
        return 'sk';
      case 'Muayene':
        return 'm';
      case 'Egzoz Muayene':
        return 'e';
      case 'Muayene + Egzoz':
        return 'me';
      case 'KM':
        return 'km';
      default:
        return '';
    }
  }

  function buildMonthlyTodoDriverFeedbackUrl(task) {
    var code = getMonthlyTodoDriverFeedbackShortCode(task);
    if (!String(code || '').trim()) return '';
    var root = getMedisaMainAppRootPathname();
    var origin = window.location && window.location.origin ? String(window.location.origin) : '';
    if (!origin) return '';
    return origin + root + 't/' + code;
  }

  function appendMonthlyTodoDriverFeedbackLinkToWhatsAppBody(body, task) {
    var feedbackUrl = buildMonthlyTodoDriverFeedbackUrl(task);
    if (!feedbackUrl) return body;
    return body + '\n- Talep göndermek için kullanıcı paneline giriş yapınız:\n' + feedbackUrl;
  }

  function buildMonthlyTodoWhatsAppMessage(task, vehicle, userLabel) {
    var kul = String(userLabel || '').trim();
    if (!kul || kul === '-') kul = 'Kullanıcı';
    var plakaRaw = (vehicle && vehicle.plate != null ? String(vehicle.plate).trim() : '') || '-';
    var plaka = plakaRaw === '-' ? '-' : plakaRaw.replace(/\s+/g, '');
    var shortLink = buildMonthlyTodoDriverFeedbackUrl(task) || '';
    var type = resolveMonthlyTodoTaskKind(task);
    var dateRaw = task && task.date != null ? String(task.date).trim() : '';
    var tarih = '';
    if (dateRaw && typeof window.formatDateShort === 'function') {
      tarih = String(window.formatDateShort(dateRaw) || '').trim();
    }
    function fallbackGeneral() {
      var islem = type || 'ilgili';
      return 'Sn. ' + kul + ';\n- Kullanmakta Olduğunuz ' + plaka + ' Plakalı Taşıtınızla ilgili ' + islem + ' işlemi için hatırlatma yapılmaktadır.\n- Lütfen güncel durumunuzu kontrol ediniz.';
    }
    if (type === 'KM') {
      return 'Sn. ' + kul + ';\n• Kullanmakta Olduğunuz ' + plaka + ' Plakalı Taşıt İçin, Güncel Kilometre Bilgisinin Kullanıcı Paneli Üzerinden Bildirilmesi Gerekmektedir.\nKM Bildirimi İçin ' + shortLink;
    }
    var body;
    if (!tarih) {
      body = fallbackGeneral();
      return appendMonthlyTodoDriverFeedbackLinkToWhatsAppBody(body, task);
    }
    switch (type) {
      case 'Sigorta':
        body = 'Sn. ' + kul + ';\n• Kullanmakta Olduğunuz ' + plaka + ' Plakalı Taşıtın Zorunlu Trafik Sigortası, ' + tarih + ' Tarihinde Sona Erecektir.\n• Poliçe Süresi Geçmeden; Yenilenen Zorunlu Trafik Sigortası Poliçenizi, Kullanıcı Paneli Üzerinden Talep Ediniz; ' + shortLink;
        break;
      case 'Kasko':
        body = 'Sn. ' + kul + ';\n• Kullanmakta Olduğunuz ' + plaka + ' Plakalı Taşıtın Kaskosu, ' + tarih + ' Tarihinde Sona Erecektir.\n• Poliçe Süresi Geçmeden; Kasko Poliçenizi, Kullanıcı Paneli Üzerinden Talep Ediniz; ' + shortLink;
        break;
      case 'Muayene':
        body = 'Sn. ' + kul + ';\n• Kullanmakta Olduğunuz ' + plaka + ' Plakalı Taşıtın Genel Muayenesi, ' + tarih + ' Tarihinde Sona Erecektir.\n• Mağduriyet Yaşamamak İçin, Muayene Randevunuzu En Az 1 Hafta Önceden Almanız Tavsiye Edilir.\n• Randevu Konusunda Desteğe İhtiyaç Duyarsanız Destek Talep Edebilirsiniz.\nDestek İçin ' + shortLink;
        break;
      case 'Egzoz Muayene':
        body = 'Sn. ' + kul + ';\n• Kullanmakta Olduğunuz ' + plaka + ' Plakalı Taşıtın Egzoz Muayenesi, ' + tarih + ' Tarihinde Sona Erecektir.\n• Mağduriyet Yaşamamak İçin, Egzoz Muayenesi Randevunuzu En Az 1 Hafta Önceden Almanız Tavsiye Edilir.\n• Randevu Konusunda Desteğe İhtiyaç Duyarsanız Destek Talep Edebilirsiniz.\nDestek İçin ' + shortLink;
        break;
      case 'Muayene + Egzoz':
        body = 'Sn. ' + kul + ';\n• Kullanmakta Olduğunuz ' + plaka + ' Plakalı Taşıtın Genel Muayenesi / Egzoz Muayenesi, ' + tarih + ' Tarihinde Sona Erecektir.\n• Mağduriyet Yaşamamak İçin, Genel Muayene / Egzoz Muayenesi Randevunuzu En Az 1 Hafta Önceden Almanız Tavsiye Edilir.\n• Randevu Konusunda Desteğe İhtiyaç Duyarsanız Destek Talep Edebilirsiniz.\nDestek İçin ' + shortLink;
        break;
      case 'Sigorta + Kasko':
        body = 'Sn. ' + kul + ';\n• Kullanmakta Olduğunuz ' + plaka + ' Plakalı Taşıtın Zorunlu Trafik Sigortası ve Kaskosu, ' + tarih + ' Tarihinde Sona Erecektir.\n• Poliçe Süresi Geçmeden; Poliçelerinizi, Kullanıcı Paneli Üzerinden Talep Ediniz; ' + shortLink;
        break;
      default:
        body = fallbackGeneral();
        return appendMonthlyTodoDriverFeedbackLinkToWhatsAppBody(body, task);
    }
    return body;
  }

  function buildMonthlyTodoWhatsAppUrl(phone, message) {
    var normalized = normalizeMonthlyTodoWhatsAppPhone(phone);
    if (!normalized) return '';
    return 'https://wa.me/' + normalized + '?text=' + encodeURIComponent(message || '');
  }

  /** Aylık özet modalı WhatsApp ikonu (admin rapor SVG ile aynı path). */
  var MONTHLY_TODO_WA_INLINE_SVG = '<svg class="monthly-todo-wa-svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

  function monthlyTodoTaskIsoNormalized(task) {
    if (!task || task.date == null || String(task.date).trim() === '') return null;
    if (typeof window.parseVehicleDateRawToIso !== 'function') return null;
    return window.parseVehicleDateRawToIso(task.date);
  }

  function monthlyTodoMuayeneEgzozSameDatePair(a, b) {
    var idA = a.vehicle && a.vehicle.id != null ? String(a.vehicle.id) : '';
    var idB = b.vehicle && b.vehicle.id != null ? String(b.vehicle.id) : '';
    if (!idA || idA !== idB) return false;
    var isoA = monthlyTodoTaskIsoNormalized(a);
    var isoB = monthlyTodoTaskIsoNormalized(b);
    if (!isoA || !isoB || isoA !== isoB) return false;
    var ta = String(a.type || '').trim();
    var tb = String(b.type || '').trim();
    return (ta === 'Muayene' && tb === 'Egzoz Muayene') || (ta === 'Egzoz Muayene' && tb === 'Muayene');
  }

  function monthlyTodoSigortaKaskoSameDatePair(a, b) {
    if (!a || !b) return false;
    var idA = a.vehicle && a.vehicle.id != null ? String(a.vehicle.id) : '';
    var idB = b.vehicle && b.vehicle.id != null ? String(b.vehicle.id) : '';
    if (!idA || idA !== idB) return false;
    var isoA = monthlyTodoTaskIsoNormalized(a);
    var isoB = monthlyTodoTaskIsoNormalized(b);
    if (!isoA || !isoB || isoA !== isoB) return false;
    var ta = String(a.type || '').trim();
    var tb = String(b.type || '').trim();
    return (ta === 'Sigorta' && tb === 'Kasko') || (ta === 'Kasko' && tb === 'Sigorta');
  }

  function monthlyTodoMergeMuayeneEgzoz(a, b) {
    var da = typeof a.days === 'number' ? a.days : null;
    var db = typeof b.days === 'number' ? b.days : null;
    var days = da != null && db != null ? Math.min(da, db) : (da != null ? da : db);
    var past = String(a.status) === 'past' || String(b.status) === 'past' || (typeof days === 'number' && days < 0);
    var warningClass = '';
    if (a.warningClass === 'date-warning-red' || b.warningClass === 'date-warning-red') warningClass = 'date-warning-red';
    else if (a.warningClass === 'date-warning-orange' || b.warningClass === 'date-warning-orange') warningClass = 'date-warning-orange';
    else warningClass = a.warningClass || b.warningClass || '';
    var dateRaw = a.date != null && String(a.date).trim() ? a.date : b.date;
    return {
      vehicle: a.vehicle,
      type: 'Muayene + Egzoz',
      field: 'muayeneDate+egzozMuayeneDate',
      date: dateRaw,
      days: days,
      status: past ? 'past' : 'upcoming',
      warningClass: warningClass
    };
  }

  function monthlyTodoMergeSigortaKasko(a, b) {
    var da = typeof a.days === 'number' ? a.days : null;
    var db = typeof b.days === 'number' ? b.days : null;
    var days;
    if (da != null && db != null) days = Math.min(da, db);
    else if (da != null) days = da;
    else if (db != null) days = db;
    else days = a.days;
    var past = String(a.status) === 'past' || String(b.status) === 'past' || (typeof days === 'number' && days < 0);
    var warningClass = '';
    if (a.warningClass === 'date-warning-red' || b.warningClass === 'date-warning-red') warningClass = 'date-warning-red';
    else if (a.warningClass === 'date-warning-orange' || b.warningClass === 'date-warning-orange') warningClass = 'date-warning-orange';
    else warningClass = a.warningClass || b.warningClass || '';
    var dateRaw = a.date != null && String(a.date).trim() ? a.date : b.date;
    return {
      vehicle: a.vehicle || b.vehicle,
      type: 'Sigorta + Kasko',
      field: 'sigortaDate+kaskoDate',
      date: dateRaw,
      days: days,
      status: past ? 'past' : 'upcoming',
      warningClass: warningClass
    };
  }

  function buildMonthlyTodoMergedDisplayTasks(tasks) {
    var used = tasks.map(function() { return false; });
    var out = [];
    for (var i = 0; i < tasks.length; i++) {
      if (used[i]) continue;
      var pairIdx = -1;
      var mergeSigortaKasko = false;
      for (var j = i + 1; j < tasks.length; j++) {
        if (used[j]) continue;
        if (monthlyTodoMuayeneEgzozSameDatePair(tasks[i], tasks[j])) {
          pairIdx = j;
          mergeSigortaKasko = false;
          break;
        } else if (monthlyTodoSigortaKaskoSameDatePair(tasks[i], tasks[j])) {
          pairIdx = j;
          mergeSigortaKasko = true;
          break;
        }
      }
      if (pairIdx >= 0) {
        used[pairIdx] = true;
        if (mergeSigortaKasko) {
          out.push(monthlyTodoMergeSigortaKasko(tasks[i], tasks[pairIdx]));
        } else {
          out.push(monthlyTodoMergeMuayeneEgzoz(tasks[i], tasks[pairIdx]));
        }
      } else {
        out.push(tasks[i]);
      }
    }
    return out;
  }

  /**
   * Aynı tarih işi hem ana aylık önbellekte hem takip ayı (1–15) önbelleğinde yer alıyorsa
   * tek satırda göstermek için yinelenenleri ayıklar.
   */
  function dedupeMonthlyTodoOperationalTasks(tasks) {
    if (!tasks || !tasks.length) return [];
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < tasks.length; i++) {
      var t = tasks[i];
      if (!t) continue;
      var v = t.vehicle || {};
      var vid = v.id != null && String(v.id).trim() !== ''
        ? String(v.id).trim()
        : 'plate:' + String(v.plate || '').trim().replace(/\s+/g, '');
      var field = String(t.field != null ? t.field : '').trim();
      var typ = String(t.type != null ? t.type : '').trim();
      var iso = monthlyTodoTaskIsoNormalized(t) || String(t.date != null ? t.date : '').trim() || 'nodate';
      var key = vid + '|' + field + '|' + typ + '|' + iso;
      if (seen[key]) continue;
      seen[key] = true;
      out.push(t);
    }
    return out;
  }

  function ensureMonthlyTodoWhatsAppLogs() {
    if (!window.appData || typeof window.appData !== 'object') window.appData = {};
    var raw = window.appData.monthlyTodoWhatsAppLogs;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      window.appData.monthlyTodoWhatsAppLogs = {};
    }
    return window.appData.monthlyTodoWhatsAppLogs;
  }

  function getMonthlyTodoVehicleReminderId(vehicle) {
    if (!vehicle) return 'unknown';
    var vid = vehicle.id != null ? String(vehicle.id).trim() : '';
    if (vid) return vid;
    var plate = vehicle.plate != null ? String(vehicle.plate).trim().replace(/\s+/g, '') : '';
    if (plate) return 'plate:' + plate;
    return 'unknown';
  }

  function getMonthlyTodoReminderShortCodeForLog(task) {
    var code = String(getMonthlyTodoDriverFeedbackShortCode(task) || '').trim();
    if (code) return code;
    var f = task && task.field != null ? String(task.field).trim() : '';
    if (!f) return 'genel';
    var slug = f.replace(/[^a-zA-Z0-9+]/g, '_').replace(/_+/g, '_').toLowerCase();
    if (!slug) return 'genel';
    return slug.length > 48 ? slug.slice(0, 48) : slug;
  }

  function getMonthlyTodoLogIsoDateString(task) {
    var iso = monthlyTodoTaskIsoNormalized(task);
    return iso || '';
  }

  function buildMonthlyTodoWhatsAppReminderKey(task, vehicle) {
    var idPart = getMonthlyTodoVehicleReminderId(vehicle);
    var code = getMonthlyTodoReminderShortCodeForLog(task);
    var isoSeg = getMonthlyTodoLogIsoDateString(task);
    if (!isoSeg) isoSeg = 'no-date';
    return 'monthlyTodo:' + idPart + ':' + code + ':' + isoSeg;
  }

  var MONTHLY_TODO_WA_REOPEN_CONFIRM = 'Kullanıcıya Daha Önce Bildirim Gönderilmiş Olabilir. Yine de Bildirmek İster misiniz?';

  function recordMonthlyTodoWhatsAppOpened(reminderKey, anchorEl) {
    if (!reminderKey || !anchorEl) return;
    var logs = ensureMonthlyTodoWhatsAppLogs();
    var nowIso = new Date().toISOString();
    var prev = logs[reminderKey];
    var vehicleId = anchorEl.getAttribute('data-mtw-vid') || '';
    var plate = anchorEl.getAttribute('data-mtw-plate') || '';
    var typeCode = anchorEl.getAttribute('data-mtw-type') || '';
    var field = anchorEl.getAttribute('data-mtw-field') || '';
    var date = anchorEl.getAttribute('data-mtw-date') || '';
    var openedBy = getNotificationRecorderDisplayName();
    if (prev && typeof prev === 'object') {
      logs[reminderKey] = {
        vehicleId: String(prev.vehicleId || vehicleId || ''),
        plate: plate || String(prev.plate || ''),
        type: typeCode || String(prev.type || ''),
        field: field || String(prev.field || ''),
        date: date || String(prev.date || ''),
        firstOpenedAt: String(prev.firstOpenedAt || nowIso),
        lastOpenedAt: nowIso,
        openedCount: (Number(prev.openedCount) || 0) + 1,
        openedBy: String(openedBy || prev.openedBy || '')
      };
    } else {
      logs[reminderKey] = {
        vehicleId: vehicleId,
        plate: plate,
        type: typeCode,
        field: field,
        date: date,
        firstOpenedAt: nowIso,
        lastOpenedAt: nowIso,
        openedCount: 1,
        openedBy: openedBy
      };
    }
    anchorEl.classList.add('monthly-todo-whatsapp-btn', 'is-reminder-opened');
    anchorEl.setAttribute('aria-label', 'WhatsApp bildirimi daha önce başlatılmış olabilir');
    anchorEl.setAttribute('title', 'WhatsApp bildirimi daha önce başlatılmış olabilir');
    if (typeof window.saveDataToServer === 'function') {
      window.saveDataToServer().catch(function(err) {
        console.warn('[Medisa] monthlyTodoWhatsAppLogs kaydı başarısız:', err && err.message);
      });
    }
  }

  function wireMonthlyTodoWhatsAppLinkHandler(modalEl) {
    if (!modalEl || modalEl._medisaMonthlyTodoWaBound) return;
    modalEl._medisaMonthlyTodoWaBound = true;
    modalEl.addEventListener('click', function(ev) {
      var el = ev.target;
      if (!el || typeof el.closest !== 'function') return;
      var link = el.closest('a.monthly-todo-wa-link');
      if (!link || !modalEl.contains(link)) return;
      var waUrl = link.getAttribute('data-wa-url');
      var reminderKey = link.getAttribute('data-reminder-key');
      if (!waUrl || !reminderKey) return;
      ev.preventDefault();
      ev.stopPropagation();
      var logs = ensureMonthlyTodoWhatsAppLogs();
      if (logs[reminderKey]) {
        if (!window.confirm(MONTHLY_TODO_WA_REOPEN_CONFIRM)) return;
      }
      window.open(waUrl, '_blank', 'noopener,noreferrer');
      var rk = reminderKey;
      var anchor = link;
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(function() {
          recordMonthlyTodoWhatsAppOpened(rk, anchor);
        });
      } else {
        window.setTimeout(function() {
          recordMonthlyTodoWhatsAppOpened(rk, anchor);
        }, 0);
      }
    }, true);
  }

  function getMonthlyTodoBranchFilterHtml(branches) {
    if (!isMainAppSessionGenelYonetici()) return '';
    var visibleBranches = Array.isArray(branches) ? branches : [];
    var selectedBranch = visibleBranches.find(function(branch) {
      return String(branch && branch.id) === String(monthlyTodoBranchFilterId);
    });
    if (monthlyTodoBranchFilterId !== 'all' && !selectedBranch) monthlyTodoBranchFilterId = 'all';
    var selectedLabel = selectedBranch ? String(selectedBranch.name || '').trim() : 'Tüm Şubeler';
    var triggerLabelHtml = selectedBranch
      ? '<span class="monthly-todo-branch-filter-label">' + escapeHtml(selectedLabel || 'İsimsiz Şube') + '</span>'
      : '';
    var html = '<span class="monthly-todo-branch-filter">';
    html += '<button type="button" class="monthly-todo-branch-filter-trigger" aria-label="Şube filtresi: ' + escapeAttr(selectedLabel || 'Tüm Şubeler') + '" aria-haspopup="listbox" aria-expanded="false">';
    html += triggerLabelHtml;
    html += '<svg class="monthly-todo-branch-filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16l-6.5 7.2V18l-3 1.5v-7.3L4 5z"/></svg>';
    html += '</button>';
    html += '<span class="monthly-todo-branch-filter-menu" role="listbox" aria-label="Şube filtresi" aria-hidden="true">';
    html += '<button type="button" class="monthly-todo-branch-filter-option' + (monthlyTodoBranchFilterId === 'all' ? ' selected' : '') + '" data-branch-id="all" role="option" aria-selected="' + (monthlyTodoBranchFilterId === 'all' ? 'true' : 'false') + '">Tüm Şubeler</button>';
    visibleBranches.forEach(function(branch) {
      if (!branch || branch.id == null) return;
      var branchId = String(branch.id);
      var selected = branchId === String(monthlyTodoBranchFilterId);
      html += '<button type="button" class="monthly-todo-branch-filter-option' + (selected ? ' selected' : '') + '" data-branch-id="' + escapeAttr(branchId) + '" role="option" aria-selected="' + (selected ? 'true' : 'false') + '">' + escapeHtml(String(branch.name || '').trim() || 'İsimsiz Şube') + '</button>';
    });
    html += '</span></span>';
    return html;
  }

  function monthlyTodoTableColHeaderHtml(branches) {
    var ariaHidden = isMainAppSessionGenelYonetici() ? '' : ' aria-hidden="true"';
    var html = '<div class="monthly-todo-col-header"' + ariaHidden + '>';
    html += '<span class="monthly-todo-col-h monthly-todo-col-h--middle">';
    html += '<span class="monthly-todo-col-h-line">Plaka</span>';
    html += '<span class="monthly-todo-col-h-line monthly-todo-col-h-line--sub">Marka-Model</span>';
    html += '</span>';
    html += '<span class="monthly-todo-col-h">Kullanıcı</span>';
    html += '<span class="monthly-todo-col-h monthly-todo-col-h--desc">' + getMonthlyTodoBranchFilterHtml(branches) + '<span>Açıklama</span></span>';
    html += '</div>';
    return html;
  }

  function buildMonthlyTodoDescriptionHtml(descriptionPrefix, daysVal, dateRaw, dateShown, isPast, dateLabel) {
    var kindHtml = '<span class="monthly-todo-type-kind">' + escapeHtml(descriptionPrefix) + '</span>';
    if (!dateRaw || daysVal === null) {
      return '<span class="monthly-todo-type">' + kindHtml + '<span class="monthly-todo-type-detail"> Geçerlilik Süresi Eksiktir.</span></span>';
    }
    var detailText = '';
    if (daysVal < 0) {
      detailText = ' Geçerlilik Süresi ' + Math.abs(daysVal) + ' Gün Önce Bitmiştir.';
    } else if (daysVal === 0) {
      detailText = ' Geçerlilik Süresi Bugün Bitecektir.';
    } else {
      detailText = ' Geçerlilik Süresi ' + daysVal + ' Gün Sonra Bitecektir.';
    }
    var metaPastClass = isPast ? ' monthly-todo-description-meta--past' : '';
    var metaLabel = String(dateLabel || 'Bitiş Tarihi').trim() || 'Bitiş Tarihi';
    return '<span class="monthly-todo-type">' + kindHtml +
      '<span class="monthly-todo-type-detail">' + escapeHtml(detailText) + '</span>' +
      '<br><span class="monthly-todo-description-meta' + metaPastClass + '">' + escapeHtml(metaLabel) + ': <span class="monthly-todo-description-date">' + dateShown + '</span></span></span>';
  }

  function buildMonthlyTodoTaskRowHtml(t, userMap, typeDescriptionMap, branchNameMap) {
    var v = t.vehicle || {};
    var vid = v.id != null ? String(v.id) : '';
    var plate = escapeHtml(v.plate || '-');
    var bm = escapeHtml(formatBrandModel(v.brandModel || '-'));
    var userLabelRaw = getMonthlyTodoKullaniciLabel(v, userMap);
    var kul = escapeHtml(userLabelRaw);
    var branchLabelRaw = getMonthlyTodoVehicleBranchLabel(v, branchNameMap);
    var branchHtml = branchLabelRaw ? '<span class="monthly-todo-user-branch">' + escapeHtml(toTitleCase(branchLabelRaw)) + '</span>' : '';
    var phone = getMonthlyTodoAssignedUserPhone(v, userMap);
    var waUrl = buildMonthlyTodoWhatsAppUrl(phone, buildMonthlyTodoWhatsAppMessage(t, v, userLabelRaw));
    var waLogs = ensureMonthlyTodoWhatsAppLogs();
    var reminderKey = buildMonthlyTodoWhatsAppReminderKey(t, v);
    var reminderOpened = !!(waLogs && waLogs[reminderKey]);
    var logShortCode = getMonthlyTodoReminderShortCodeForLog(t);
    var logIsoDate = getMonthlyTodoLogIsoDateString(t);
    var plateCompact = String(v.plate != null ? v.plate : '').trim().replace(/\s+/g, '');
    var waBtnClass = 'monthly-todo-wa-link monthly-todo-whatsapp-btn' + (reminderOpened ? ' is-reminder-opened' : '');
    var waAria = reminderOpened ? 'WhatsApp bildirimi daha önce başlatılmış olabilir' : 'WhatsApp bildirimi başlat';
    var ariaRow = 'Taşıt detayı: ' + (v.plate || '-') + ', ' + formatBrandModel(v.brandModel || '-');
    var typeText = String(t.type || '').trim();
    var dateRaw = t.date != null ? String(t.date).trim() : '';
    var dateShown = '—';
    if (dateRaw) {
      if (typeof window.formatDateShort === 'function') dateShown = escapeHtml(window.formatDateShort(dateRaw));
      else dateShown = escapeHtml(dateRaw);
    }
    var warningClass = String(t.warningClass || '');
    var past = String(t.status) === 'past' || (typeof t.days === 'number' && t.days < 0);
    var daysVal = typeof t.days === 'number' ? t.days : null;
    var descriptionPrefix = typeDescriptionMap[typeText] || typeText || 'İlgili İşlemin';
    var rowTone = '';
    if (past || warningClass === 'date-warning-red') {
      rowTone = ' monthly-todo-task-row--past';
    } else if (warningClass === 'date-warning-orange') {
      rowTone = ' monthly-todo-task-row--upcoming';
    }
    var rowHtml = '';
    rowHtml += '<div class="monthly-todo-task-row' + rowTone + '" data-vehicle-id="' + escapeAttr(vid) + '" role="listitem" tabindex="0" aria-label="' + escapeAttr(ariaRow) + '">';
    rowHtml += '<span class="monthly-todo-cell monthly-todo-plate-col">';
    rowHtml += '<span class="monthly-todo-plate">' + plate + '</span>';
    rowHtml += '<span class="monthly-todo-brand">' + bm + '</span>';
    rowHtml += '</span>';
    rowHtml += '<span class="monthly-todo-cell monthly-todo-middle-col">';
    rowHtml += '<span class="monthly-todo-user">';
    rowHtml += '<span class="monthly-todo-user-name">' + kul + '</span>';
    if (waUrl) {
      rowHtml += '<a class="' + waBtnClass + '" href="#" role="button" rel="noopener noreferrer" data-wa-url="' + escapeAttr(waUrl) + '" data-reminder-key="' + escapeAttr(reminderKey) + '" data-mtw-vid="' + escapeAttr(vid) + '" data-mtw-plate="' + escapeAttr(plateCompact) + '" data-mtw-type="' + escapeAttr(logShortCode) + '" data-mtw-field="' + escapeAttr(String(t.field != null ? t.field : '').trim()) + '" data-mtw-date="' + escapeAttr(logIsoDate) + '" aria-label="' + escapeAttr(waAria) + '" title="' + escapeAttr(waAria) + '">' + MONTHLY_TODO_WA_INLINE_SVG + '</a>';
    }
    rowHtml += branchHtml;
    rowHtml += '</span>';
    rowHtml += '</span>';
    rowHtml += '<span class="monthly-todo-cell monthly-todo-desc-col">';
    var descriptionDateLabel = (typeText === 'Sigorta' || typeText === 'Kasko' || typeText === 'Sigorta + Kasko') ? 'Yenileme Tarihi' : 'Bitiş Tarihi';
    rowHtml += buildMonthlyTodoDescriptionHtml(descriptionPrefix, daysVal, dateRaw, dateShown, past, descriptionDateLabel);
    rowHtml += '</span>';
    rowHtml += '</div>';
    return rowHtml;
  }

  function fillMonthlyTodoModalBody(bodyEl, tasksArray) {
    var typeDescriptionMap = {
      'Sigorta': 'Trafik Sigortası',
      'Kasko': 'Kasko Poliçesinin',
      'Sigorta + Kasko': 'Trafik Sigortası ve Kasko Poliçesinin',
      'Muayene': 'Genel Muayenesi',
      'Egzoz Muayene': 'Egzoz Muayenesi',
      'Muayene + Egzoz': 'Genel Muayene ve Egzoz Muayenesi',
      'K2 Belgesi': 'K2 Belgesinin',
      'Takograf': 'Takograf Kalibrasyonunun'
    };
    var users = readUsers();
    var userMap = {};
    users.forEach(function(u) {
      if (u && u.id != null) userMap[String(u.id)] = u;
    });
    var branchNameMap = {};
    var branches = readBranches() || [];
    branches.forEach(function(b) {
      if (b && b.id != null) branchNameMap[String(b.id)] = String(b.name || '').trim();
    });
    var filteredTasks = tasksArray || [];
    if (isMainAppSessionGenelYonetici() && monthlyTodoBranchFilterId !== 'all') {
      filteredTasks = filteredTasks.filter(function(task) {
        var vehicle = task && task.vehicle;
        return vehicle && String(vehicle.branchId || '') === String(monthlyTodoBranchFilterId);
      });
    }
    var combinedRaw = dedupeMonthlyTodoOperationalTasks(filteredTasks);
    var displayTasks = buildMonthlyTodoMergedDisplayTasks(combinedRaw);
    displayTasks.sort(function(a, b) {
      var da = typeof a.days === 'number' ? a.days : 9999;
      var db = typeof b.days === 'number' ? b.days : 9999;
      var aPast = da < 0;
      var bPast = db < 0;
      if (aPast !== bPast) return aPast ? -1 : 1;
      return da - db;
    });
    if (!displayTasks.length && monthlyTodoBranchFilterId === 'all') {
      bodyEl.innerHTML = '<div class="monthly-todo-empty">Bu dönem için listelenecek tarih işlemi yok.</div>';
      return;
    }
    var html = '<div class="monthly-todo-sheet">';
    html += '<div class="monthly-todo-table-outer">';
    html += '<div class="monthly-todo-table-inner">';
    html += monthlyTodoTableColHeaderHtml(branches);
    html += '<div class="monthly-todo-list-scroll" role="list">';
    if (displayTasks.length) {
      displayTasks.forEach(function(t) {
        html += buildMonthlyTodoTaskRowHtml(t, userMap, typeDescriptionMap, branchNameMap);
      });
    } else {
      html += '<div class="monthly-todo-empty">Seçilen şube için listelenecek tarih işlemi yok.</div>';
    }
    html += '</div></div></div></div>';
    bodyEl.innerHTML = html;
    wireMonthlyTodoModalBodyInteraction(bodyEl);
  }

  function isMonthlyTodoDesktopView() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 769px)').matches;
  }

  function closeMonthlyTodoModal(immediate) {
    var modal = document.getElementById('monthly-todo-modal');
    if (!modal) return;
    closeMonthlyTodoBranchFilter(modal);
    modal.classList.remove('active', 'open');
    if (monthlyTodoCloseTimer) clearTimeout(monthlyTodoCloseTimer);
    if (immediate) {
      monthlyTodoCloseTimer = null;
      modal.style.display = 'none';
      modal.style.pointerEvents = 'none';
      if (typeof window.updateFooterDim === 'function') window.updateFooterDim();
      return;
    }
    monthlyTodoCloseTimer = setTimeout(function() {
      monthlyTodoCloseTimer = null;
      modal.style.display = 'none';
      modal.style.pointerEvents = '';
      if (typeof window.updateFooterDim === 'function') window.updateFooterDim();
    }, 300);
  }

  function openMonthlyTodoRowVehicleDetail(row, modalRoot) {
    if (!row) return;
    var root = modalRoot || document.getElementById('monthly-todo-modal');
    if (!root || !root.contains(row)) return;
    var vid = row.getAttribute('data-vehicle-id');
    if (!vid) return;
    closeMonthlyTodoModal(true);
    var openDetail = function() {
      if (typeof window.medisaOpenVehicleDetailFromNotification !== 'function') {
        throw new Error('Aylik yapilacaklar detay koprusu hazir degil');
      }
      window.medisaOpenVehicleDetailFromNotification(vid, { returnToMonthlyTodo: true });
    };
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(function() {
        window.requestAnimationFrame(openDetail);
      });
    } else {
      window.setTimeout(openDetail, 0);
    }
  }

  function wireMonthlyTodoModalBodyInteraction(bodyEl) {
    if (!bodyEl) return;
    if (bodyEl._medisaMonthlyTodoBodyRev === MONTHLY_TODO_INTERACTION_REV) return;
    if (bodyEl._medisaMonthlyTodoBodyClickHandler) {
      bodyEl.removeEventListener('click', bodyEl._medisaMonthlyTodoBodyClickHandler);
    }
    bodyEl._medisaMonthlyTodoBodyRev = MONTHLY_TODO_INTERACTION_REV;
    var handler = function(ev) {
      var target = ev.target;
      if (!target || typeof target.closest !== 'function') return;
      if (target.closest('.monthly-todo-wa-link')) return;
      var row = target.closest('.monthly-todo-task-row');
      if (!row || !bodyEl.contains(row)) return;
      ev.preventDefault();
      ev.stopPropagation();
      openMonthlyTodoRowVehicleDetail(row, bodyEl.closest('#monthly-todo-modal'));
    };
    bodyEl._medisaMonthlyTodoBodyClickHandler = handler;
    bodyEl.addEventListener('click', handler);
  }

  function renderMonthlyTodoModalContent() {
    var root = document.getElementById('monthly-todo-modal');
    var bodyEl = root ? root.querySelector('.monthly-todo-modal-body') : null;
    if (!bodyEl) return;
    var cached = peekVehicleDateTasksCache();
    if (cached !== null) {
      fillMonthlyTodoModalBody(bodyEl, cached);
      return;
    }
    bodyEl.innerHTML = '<div class="monthly-todo-empty">Yükleniyor…</div>';
    if (_monthlyTodoModalBodyFillScheduled) return;
    _monthlyTodoModalBodyFillScheduled = true;
    requestAnimationFrame(function() {
      _monthlyTodoModalBodyFillScheduled = false;
      var modal = document.getElementById('monthly-todo-modal');
      if (!modal || modal.style.display === 'none') return;
      var be = modal.querySelector('.monthly-todo-modal-body');
      if (!be) return;
      var tasks = getVehicleDateTasks();
      fillMonthlyTodoModalBody(be, tasks);
    });
  }

  function setMonthlyTodoBranchFilterOpen(modalEl, filterTrigger, filterMenu, shouldOpen) {
    if (!modalEl || !filterTrigger || !filterMenu) return;
    filterMenu.classList.toggle('open', shouldOpen);
    filterMenu.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
    filterTrigger.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    modalEl.classList.toggle('monthly-todo-filter-open', shouldOpen);
  }

  function closeMonthlyTodoBranchFilter(modalEl) {
    if (!modalEl) return;
    var openFilterMenu = modalEl.querySelector('.monthly-todo-branch-filter-menu.open');
    var openFilterTrigger = modalEl.querySelector('.monthly-todo-branch-filter-trigger[aria-expanded="true"]');
    if (openFilterMenu && openFilterTrigger) {
      setMonthlyTodoBranchFilterOpen(modalEl, openFilterTrigger, openFilterMenu, false);
      return;
    }
    modalEl.classList.remove('monthly-todo-filter-open');
  }

  function bindMonthlyTodoModalDelegatedInteraction(modalEl) {
    if (!modalEl) return;
    if (modalEl._medisaMonthlyTodoInteractionRev === MONTHLY_TODO_INTERACTION_REV) return;
    if (modalEl._medisaMonthlyTodoClickHandler) {
      modalEl.removeEventListener('click', modalEl._medisaMonthlyTodoClickHandler, true);
    }
    if (modalEl._medisaMonthlyTodoKeydownHandler) {
      modalEl.removeEventListener('keydown', modalEl._medisaMonthlyTodoKeydownHandler);
    }
    modalEl._medisaMonthlyTodoInteractionRev = MONTHLY_TODO_INTERACTION_REV;
    function onMonthlyTodoModalClick(ev) {
      var target = ev.target;
      if (!target || typeof target.closest !== 'function') return;
      var insidePanel = target.closest('.monthly-todo-modal-container');
      if (!insidePanel || !modalEl.contains(insidePanel)) {
        closeMonthlyTodoBranchFilter(modalEl);
        if (isMonthlyTodoDesktopView()) return;
        closeMonthlyTodoModal();
        return;
      }
      var filterTrigger = target.closest('.monthly-todo-branch-filter-trigger');
      if (filterTrigger && modalEl.contains(filterTrigger)) {
        ev.preventDefault();
        ev.stopPropagation();
        var filterMenu = filterTrigger.parentNode.querySelector('.monthly-todo-branch-filter-menu');
        var willOpen = filterMenu && !filterMenu.classList.contains('open');
        if (filterMenu) setMonthlyTodoBranchFilterOpen(modalEl, filterTrigger, filterMenu, willOpen);
        return;
      }
      var filterOption = target.closest('.monthly-todo-branch-filter-option');
      if (filterOption && modalEl.contains(filterOption)) {
        ev.preventDefault();
        ev.stopPropagation();
        monthlyTodoBranchFilterId = filterOption.getAttribute('data-branch-id') || 'all';
        closeMonthlyTodoBranchFilter(modalEl);
        renderMonthlyTodoModalContent();
        return;
      }
      if (modalEl.classList.contains('monthly-todo-filter-open')) {
        ev.preventDefault();
        ev.stopPropagation();
        closeMonthlyTodoBranchFilter(modalEl);
        return;
      }
      if (target.closest('.monthly-todo-wa-link')) return;
      var row = target.closest('.monthly-todo-task-row');
      if (!row || !modalEl.contains(row)) return;
      ev.preventDefault();
      ev.stopPropagation();
      openMonthlyTodoRowVehicleDetail(row, modalEl);
    }
    function onMonthlyTodoModalKeydown(ev) {
      if (ev.key === 'Escape' && modalEl.classList.contains('monthly-todo-filter-open')) {
        ev.preventDefault();
        closeMonthlyTodoBranchFilter(modalEl);
        var filterTrigger = modalEl.querySelector('.monthly-todo-branch-filter-trigger');
        if (filterTrigger) filterTrigger.focus();
        return;
      }
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      var target = ev.target;
      if (!target || typeof target.closest !== 'function') return;
      if (target.closest('.monthly-todo-wa-link')) return;
      var row = target.closest('.monthly-todo-task-row');
      if (!row || !modalEl.contains(row)) return;
      ev.preventDefault();
      openMonthlyTodoRowVehicleDetail(row, modalEl);
    }
    modalEl._medisaMonthlyTodoClickHandler = onMonthlyTodoModalClick;
    modalEl._medisaMonthlyTodoKeydownHandler = onMonthlyTodoModalKeydown;
    modalEl.addEventListener('click', onMonthlyTodoModalClick, true);
    modalEl.addEventListener('keydown', onMonthlyTodoModalKeydown);
    wireMonthlyTodoWhatsAppLinkHandler(modalEl);
    var bodyEl = modalEl.querySelector('.monthly-todo-modal-body');
    wireMonthlyTodoModalBodyInteraction(bodyEl);
  }

  function wireMonthlyTodoModalCloseUiOnce(modalEl) {
    if (!modalEl || modalEl._medisaMonthlyTodoCloseUiBound) return;
    var closeBtn = modalEl.querySelector('button.modal-close.monthly-todo-modal-close');
    if (!closeBtn) return;
    modalEl._medisaMonthlyTodoCloseUiBound = true;
    closeBtn.addEventListener('click', function(ev) {
      ev.preventDefault();
      closeMonthlyTodoModal();
    });
  }

  function initMonthlyTodoHeaderButtonOnce() {
    var btn = document.getElementById('monthly-todo-header-btn');
    if (!btn || btn._medisaMonthlyTodoHeaderRev === MONTHLY_TODO_HEADER_REV) return;
    btn._medisaMonthlyTodoHeaderRev = MONTHLY_TODO_HEADER_REV;
    btn.addEventListener('click', function(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      openMonthlyTodoModal();
    });
  }

  initMonthlyTodoHeaderButtonOnce();

  function getMonthlyTodoTitleText() {
    var monthName = new Date().toLocaleDateString('tr-TR', { month: 'long' });
    monthName = monthName ? monthName.charAt(0).toUpperCase() + monthName.slice(1) : '';
    return (monthName || 'Bu Ay') + ' Ayı Özet';
  }

  function getMonthlyTodoHomeButtonHtml() {
    return '<button type="button" class="modal-home" onclick="closeAllModals()" aria-label="Ana sayfaya dön" title="Ana sayfa">' +
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"></path><path d="M5 10v10h14V10"></path></svg>' +
      '</button>';
  }

  function syncMonthlyTodoModalHeader(modalEl) {
    if (!modalEl) return;
    var header = modalEl.querySelector('.modal-header');
    if (!header) return;
    if (!header.querySelector('.modal-home')) {
      header.insertAdjacentHTML('afterbegin', getMonthlyTodoHomeButtonHtml());
    }
    var h2 = header.querySelector('h2');
    if (!h2) return;
    h2.classList.add('premium-title');
    h2.textContent = getMonthlyTodoTitleText();
  }

  function ensureMonthlyTodoModalMounted() {
    var el = document.getElementById('monthly-todo-modal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'monthly-todo-modal';
      el.className = 'modal-overlay monthly-todo-modal-overlay';
      el.setAttribute('data-monthly-todo-overlay', '1');
      el.innerHTML =
        '<div class="modal-container monthly-todo-modal-container">' +
          '<div class="modal-header">' +
            getMonthlyTodoHomeButtonHtml() +
            '<h2 class="premium-title">' + escapeHtml(getMonthlyTodoTitleText()) + '</h2>' +
            '<button type="button" class="modal-close monthly-todo-modal-close" aria-label="Kapat">' +
              '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
            '</button>' +
          '</div>' +
          '<div class="modal-body monthly-todo-modal-body">' +
            '<div class="monthly-todo-empty">Yükleniyor…</div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(el);
    } else {
      syncMonthlyTodoModalHeader(el);
    }
    bindMonthlyTodoModalDelegatedInteraction(el);
    wireMonthlyTodoModalCloseUiOnce(el);
    return el;
  }

  function openMonthlyTodoModal() {
    var modal = ensureMonthlyTodoModalMounted();
    syncMonthlyTodoModalHeader(modal);
    closeMonthlyTodoBranchFilter(modal);
    if (monthlyTodoCloseTimer) {
      clearTimeout(monthlyTodoCloseTimer);
      monthlyTodoCloseTimer = null;
    }
    modal.style.display = 'flex';
    modal.style.pointerEvents = '';
    modal.classList.add('active');
    modal.classList.add('open');
    if (typeof window.updateFooterDim === 'function') window.updateFooterDim();
    renderMonthlyTodoModalContent();
    requestAnimationFrame(function() {
      if (typeof window.updateFooterDim === 'function') window.updateFooterDim();
    });
  }

  window.addEventListener('dataLoaded', function() {
    invalidateVehicleDateTasksCache();
  });

  function getEventSortTime(ev) {
    if (ev.timestamp) {
      const t = new Date(ev.timestamp).getTime();
      if (!isNaN(t)) return t;
    }
    var idTie = 0;
    if (ev.id != null && String(ev.id).trim() !== '') {
      var idNum = parseInt(String(ev.id).replace(/\D/g, ''), 10);
      if (!isNaN(idNum) && idNum > 0) {
        idTie = idNum / 1e13;
      }
    }
    if (!ev.date) return idTie;
    const parts = String(ev.date).trim().split('.');
    if (parts.length !== 3) return idTie;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    if (isNaN(d.getTime())) return idTie;
    return d.getTime() + idTie;
  }

  /**
   * Bildirim satırı için "{İsim}, {Plaka} Plakalı Taşıt İçin {Olay Mesajı}." formatında metin üretir.
   */
  function getNotificationActivityMessage(ev, plate) {
    const evData = ev.data || {};
    const type = (ev.type || '').toString().trim();
    const actorName = type === 'kullanici-atama'
      ? (evData.kaydeden || evData.surucu || evData.kisi)
      : (evData.surucu || evData.kisi || evData.kullaniciAdi || evData.kaydeden);
    const isimStr = actorName ? formatAdSoyad(String(actorName)) : 'Bilinmiyor';
    const plateStr = (plate || '-').toString().trim();
    if (type === 'vehicle-created') {
      const createdPlate = (ev.data && ev.data.plakaSnapshot) || plate || '-';
      return 'Yeni Taşıt Bilgisi Kaydedildi. (' + String(createdPlate).trim() + ')';
    }
    if (type === 'satis') {
      const soldPlate = (ev.data && ev.data.plakaSnapshot) || plate || '-';
      return String(soldPlate).trim() + ' Plakalı Taşıt, Satış/Pert Nedeniyle Arşive Kaldırıldı.';
    }
    if (type === 'lastik-guncelle') {
      const durum = String(evData.durum || 'yok').toLowerCase();
      const durumTxt = durum === 'var' ? 'Var' : 'Yok';
      const whoL = evData.kaydeden || evData.surucu || evData.kisi || evData.kullaniciAdi;
      const whoLStr = whoL ? formatAdSoyad(String(whoL)) : 'Bilinmiyor';
      return whoLStr + ', ' + plateStr + ' Plakal\u0131 Ta\u015F\u0131t \u0130\u00E7in Yazl\u0131k/ K\u0131\u015Fl\u0131k Lastik Durumunu ' + durumTxt + ' olarak Bildirdi.';
    }
    if (type === 'kasko-kodu-guncelle') {
      const who = evData.kaydeden || evData.surucu || evData.kisi || evData.kullaniciAdi;
      const whoU = who ? formatHistoryPerformerUpper(who) : 'B\u0130L\u0130NM\u0130YOR';
      return whoU + ', ' + plateStr + ' Plakal\u0131 Ta\u015F\u0131t \u0130\u00E7in Kasko Kodunu G\u00FCncelledi.';
    }
    if (type === 'kullanici-atama') {
      const kaldir = evData.atamaKaldirildi === true || String(evData.kullaniciAdi || '').trim() === 'Hen\u00fcz Tan\u0131mlanmad\u0131';
      if (kaldir) {
        const who = evData.kaydeden || evData.surucu || evData.kisi;
        const whoStr = who ? formatAdSoyad(String(who)) : 'Bilinmiyor';
        return whoStr + ', ' + plateStr + ' Plakal\u0131 Ta\u015F\u0131t \u0130\u00E7in Kullan\u0131c\u0131 Atamas\u0131n\u0131 Kald\u0131rd\u0131.';
      }
    }
    const typeMessages = {
      'km-revize': 'Km Bildirimi Yapt\u0131',
      'bakim': 'Bak\u0131m Bildirimi Yapt\u0131',
      'kaza': 'Kaza Bildirimi Yapt\u0131',
      'ceza': 'Trafik Cezas\u0131 \u0130\u015Fledi',
      'sigorta-guncelle': 'Sigorta Bilgisini G\u00FCncelledi',
      'kasko-guncelle': 'Kasko Bilgisini G\u00FCncelledi',
      'takograf-kalibrasyon-guncelle': 'Takograf Kalibrasyon Bilgisini G\u00FCncelledi',
      'tasit-karti-guncelle': 'Ta\u015F\u0131t Kart\u0131 Bilgisini G\u00FCncelledi',
      'muayene-guncelle': 'Muayene Bilgisini G\u00FCncelledi',
      'anahtar-guncelle': 'Yedek Anahtar Bilgisini G\u00FCncelledi',
      'utts-guncelle': 'UTTS Bilgisini G\u00FCncelledi',
      'kredi-guncelle': 'Hak Mahrumiyeti Bilgisini G\u00FCncelledi',
      'takip-cihaz-guncelle': 'Takip Cihaz\u0131 Bilgisini G\u00FCncelledi',
      'not-guncelle': 'Not Bilgisini G\u00FCncelledi',
      'sube-degisiklik': '\u015Eube Bilgisini G\u00FCncelledi',
      'kullanici-atama': 'Kullan\u0131c\u0131 Atamas\u0131 Yapt\u0131',
      'satis': 'Sat\u0131\u015F/Pert Bildirdi',
      'ruhsat-yukle': 'Ruhsat Belgesi Y\u00fckledi',
      'sigorta-policesi-yukle': 'Sigorta Poli\u00E7esi Y\u00FCkledi',
      'kasko-policesi-yukle': 'Kasko Poli\u00E7esi Y\u00FCkledi',
      'takograf-belgesi-yukle': 'Takograf Belgesi Y\u00FCkledi',
      'tasit-karti-yukle': 'Ta\u015F\u0131t Kart\u0131 Y\u00FCkledi'
    };
    const mesaj = typeMessages[type] || 'Bilgi G\u00FCncelledi';
    return isimStr + ', ' + plateStr + ' Plakalı Taşıt İçin ' + mesaj + '.';
  }

  /** Olay tipinden tarihçe sekme id'si (bakim, kaza, km, diger) */
  function getHistoryTabForEventType(type) {
    if (type === 'bakim') return 'bakim';
    if (type === 'kaza') return 'kaza';
    if (type === 'km-revize') return 'km';
    return 'diger';
  }

  function shouldOpenNotificationsFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      return params.get('openNotifications') === '1';
    } catch (e) {
      return false;
    }
  }

  function openNotificationsFromReturnParam() {
    if (window._medisaOpenNotificationsHandled || !shouldOpenNotificationsFromUrl()) return;
    window._medisaOpenNotificationsHandled = true;
    if (typeof window.setNotificationsOpenState === 'function' && window.setNotificationsOpenState(true)) {
      if (typeof window.syncMobileNotificationsDropdownHeight === 'function') {
        requestAnimationFrame(function() {
          window.syncMobileNotificationsDropdownHeight();
          requestAnimationFrame(window.syncMobileNotificationsDropdownHeight);
        });
      }
    }
    try {
      const cleanUrl = window.location.pathname + (window.location.hash || '');
      window.history.replaceState({}, document.title, cleanUrl);
    } catch (e) {}
  }

  /**
   * Bildirimleri güncelle (muayene, sigorta, kasko + kullanıcı paneli işlemleri)
   */
  window.updateNotifications = function() {
    if (!window.appData || !Array.isArray(window.appData.tasitlar)) {
      invalidateVehicleDateTasksCache();
      updateMonthlyTodoHeaderBadge();
      return;
    }
    const notifScopeKey = getCurrentNotifScopeKey();
    beginNotificationFirstSeenBatch(notifScopeKey);
    try {
    const vehicles = readVehicles();
    const notifications = [];
    const pendingGeneralRequests = [];
    const viewedKeys = getViewedNotificationKeys();
    const dismissedKeys = getDismissedNotificationKeys();
    const feedKeys = {};
    let hasUnreadMarkableNotification = false;
    const showDesktopSpecialNotifDate = window.innerWidth >= 641;
    let hasRed = false; // Aktif kırmızı alarm var mı?
    let hasOrange = false; // Okunmamış turuncu bildirim var mı?

    function parseNotificationDisplayDateMs(displayDate) {
      const raw = String(displayDate || '').trim();
      if (!raw) return 0;
      const firstSeenMs = parseNotificationFirstSeenMs(raw);
      if (firstSeenMs > 0) return firstSeenMs;
      const trMatch = raw.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
      if (trMatch) {
        const day = Number(trMatch[1]);
        const month = Number(trMatch[2]);
        const year = Number(trMatch[3]);
        const dt = new Date(year, month - 1, day, 0, 0, 0, 0);
        if (!isNaN(dt.getTime())) return dt.getTime();
      }
      const parsed = Date.parse(raw);
      if (!isNaN(parsed)) return parsed;
      return 0;
    }

    runVehicleDateOperationalScan(notifications, 'full');
    updateMonthlyTodoHeaderBadge();

    const usersById = {};
    readUsers().forEach(function(user) {
      if (user && user.id != null) usersById[String(user.id)] = user;
    });
    const vehiclesById = {};
    vehicles.forEach(function(vehicle) {
      if (vehicle && vehicle.id != null) vehiclesById[String(vehicle.id)] = vehicle;
    });
    function resolveRequestUserName(request) {
      const snapshotName = String((request && request.surucu_adi) || '').trim();
      if (snapshotName) return snapshotName;
      const user = usersById[String((request && request.surucu_id) || '')];
      return user ? (user.isim || user.name || user.ad_soyad || 'Bilinmiyor') : 'Bilinmiyor';
    }
    const requests = Array.isArray(window.appData.duzeltme_talepleri) ? window.appData.duzeltme_talepleri : [];
    requests.forEach(function(request) {
      if (!request || request.talep_tipi !== 'genel' || request.durum !== 'beklemede') return;
      const vehicle = vehiclesById[String(request.arac_id || '')];
      pendingGeneralRequests.push({
        id: request.id,
        type: String(request.konu_turu || 'talep'),
        message: String(request.mesaj || request.sebep || '').trim(),
        date: request.talep_tarihi || '',
        plate: vehicle ? (vehicle.plate || vehicle.plaka || '-') : '-',
        userName: resolveRequestUserName(request)
      });
    });
    pendingGeneralRequests.sort(function(a, b) {
      return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
    });

    const aylikHareketler = Array.isArray(window.appData.arac_aylik_hareketler) ? window.appData.arac_aylik_hareketler : [];
    const kayitIdToAracId = {};
    aylikHareketler.forEach(function(k) {
      if (k && k.id != null && k.arac_id != null) {
        kayitIdToAracId[String(k.id)] = String(k.arac_id);
      }
    });
    const pendingDuzeltmeRequests = [];
    requests.forEach(function(request) {
      if (!request || request.durum !== 'beklemede') return;
      if (request.talep_tipi === 'genel') return;
      const kid = request.kayit_id != null ? String(request.kayit_id) : '';
      if (!kid) return;
      const aracId = kayitIdToAracId[kid];
      if (!aracId) return;
      const vehicle = vehiclesById[aracId];
      const sebep = String(request.sebep || '').trim();
      const topicBits = [];
      if (request.yeni_km != null) topicBits.push('KM');
      if (request.yeni_bakim_aciklama != null) topicBits.push('Bakım');
      if (request.yeni_kaza_aciklama != null) topicBits.push('Kaza');
      const topic = topicBits.length ? topicBits.join(' · ') + ' düzeltmesi' : 'Düzeltme talebi';
      pendingDuzeltmeRequests.push({
        id: request.id,
        topic: topic,
        message: sebep,
        date: request.talep_tarihi || '',
        plate: vehicle ? (vehicle.plate || vehicle.plaka || '-') : '-',
        userName: resolveRequestUserName(request)
      });
    });
    pendingDuzeltmeRequests.sort(function(a, b) {
      return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
    });

    // Kullanıcı paneli işlemleri: tüm taşıtlardan son olayları topla (en yeni 15)
    const recentEvents = [];
    vehicles.forEach(vehicle => {
      const events = Array.isArray(vehicle.events) ? vehicle.events : [];
      const plate = vehicle.plate || '-';
      const brandModel = formatBrandModel(vehicle.brandModel || '-');
      const isArchivedVehicle = vehicle.satildiMi === true;
      events.forEach(ev => {
        if (isArchivedVehicle && (!ev || ev.type !== 'satis')) return;
        if (isDriverFeedbackEvent(ev)) return;
        recentEvents.push({
          vehicleId: vehicle.id,
          plate: plate,
          brandModel: brandModel,
          event: ev
        });
      });
    });
    recentEvents.sort((a, b) => getEventSortTime(b.event) - getEventSortTime(a.event));
    const recentSlice = recentEvents.slice(0, 15);

    // MTV hatırlatması: Ocak (0) veya Temmuz (6), ayın 21'i ve sonrası, ödeme yapılmadıysa
    let mtvHtml = '';
    let mtvSortMs = 0;
    const today = new Date();
    const m = today.getMonth();
    const d = today.getDate();
    const y = today.getFullYear();
    if ((m === 0 || m === 6) && d >= 21) {
      const mtvLegacyKey = 'mtv_paid_' + y + '_' + m;
      const mtvKey = 'special|mtv|' + y + '|' + String(m + 1).padStart(2, '0');
      if (localStorage.getItem(mtvLegacyKey) && dismissedKeys.indexOf(mtvKey) === -1) {
        dismissNotificationKeys([mtvKey]);
      }
      if (dismissedKeys.indexOf(mtvKey) === -1) {
        const mtvKeyEsc = (mtvKey || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const mtvRead = viewedKeys.indexOf(mtvKey) !== -1;
        const mtvStateClass = mtvRead ? ' notification-read' : ' notification-unread date-warning-orange-border';
        const mtvStyle = mtvRead
          ? '--notif-border: rgba(130, 130, 130, 0.55); --notif-fg: #9a9a9a;'
          : '--notif-border: rgba(255, 106, 0, 0.6); --notif-fg: #fff;';
        const mtvFirstSeenDisplay = getOrCreateNotificationFirstSeen(mtvKey);
        mtvSortMs = parseNotificationDisplayDateMs(mtvFirstSeenDisplay);
        const mtvDateHtml = showDesktopSpecialNotifDate ? '<div class="notif-line2 notif-meta-date">' + escapeHtml(mtvFirstSeenDisplay) + '</div>' : '';
        mtvHtml = '<div class="notification-item mtv-notification' + mtvStateClass + '" data-notif-key="' + escapeHtml(mtvKey) + '" data-dismiss-key="' + escapeHtml(mtvKey) + '" style="' + mtvStyle + '"><div class="mtv-text-container"><div class="mtv-main-text notif-line1">Ay\u0131n Son G\u00fcn\u00fcne Kadar MTV \u00d6demelerinin Yap\u0131lmas\u0131 Gerekmektedir.</div>' + mtvDateHtml + '</div><div class="mtv-dismiss-wrapper"><button type="button" class="mtv-dismiss-btn" onclick="dismissMTVNotif(event, \'' + mtvKeyEsc + '\')" aria-label="Bildirimi Kapat"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></button><div class="mtv-tooltip">\u00d6deme Yap\u0131ld\u0131ysa Bildirimi Silebilirsiniz.</div></div></div>';
        if (!mtvRead) hasUnreadMarkableNotification = true;
        if (!mtvRead) hasOrange = true;
      }
    }

    // Kasko Excel hatırlatması: Liste bu aya ait değilse (Excel yüklenince veya X ile silinene kadar kırmızı kalır)
    let kaskoExcelHtml = '';
    let kaskoExcelSortMs = 0;
    const kaskoState = getKaskoState();
    const kaskoListeGuncel = String(kaskoState.period || '') === (String(y) + '-' + String(m + 1).padStart(2, '0'));
    if (!kaskoListeGuncel) {
      const kaskoLegacyKey = 'kasko_excel_dismiss_' + y + '_' + m;
      const kaskoKey = 'special|kaskoExcel|' + y + '|' + String(m + 1).padStart(2, '0');
      if (localStorage.getItem(kaskoLegacyKey) && dismissedKeys.indexOf(kaskoKey) === -1) {
        dismissNotificationKeys([kaskoKey]);
      }
      if (dismissedKeys.indexOf(kaskoKey) === -1) {
        const kaskoKeyEsc = (kaskoKey || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const kaskoRead = viewedKeys.indexOf(kaskoKey) !== -1;
        const kaskoStateClass = (kaskoRead ? ' notification-read' : ' notification-unread') + ' date-warning-red-border';
        const kaskoStyle = '--notif-border: rgba(212, 0, 0, 0.6); --notif-fg: var(--theme-color);';
        const kaskoFirstSeenDisplay = getOrCreateNotificationFirstSeen(kaskoKey);
        kaskoExcelSortMs = parseNotificationDisplayDateMs(kaskoFirstSeenDisplay);
        const kaskoDateHtml = showDesktopSpecialNotifDate ? '<div class="notif-line2 notif-meta-date">' + escapeHtml(kaskoFirstSeenDisplay) + '</div>' : '';
        kaskoExcelHtml = '<div class="notification-item kasko-excel-notification' + kaskoStateClass + '" data-action="open-dis-veri" data-notif-key="' + escapeHtml(kaskoKey) + '" data-dismiss-key="' + escapeHtml(kaskoKey) + '" style="' + kaskoStyle + '"><div class="mtv-text-container"><div class="mtv-main-text notif-line1">G\u00fcncel Kasko De\u011fer Listesinin Y\u00fcklenmesi Gerekmektedir.</div>' + kaskoDateHtml + '</div><div class="mtv-dismiss-wrapper"><button type="button" class="mtv-dismiss-btn" onclick="dismissKaskoExcelNotif(event, \'' + kaskoKeyEsc + '\')" aria-label="Bildirimi Kapat"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button><div class="mtv-tooltip">Kapat</div></div></div>';
        if (!kaskoRead) hasUnreadMarkableNotification = true;
        hasRed = true;
      }
    }

    // Bildirimleri güncelle
    const notifDropdown = DOM.notificationsDropdown;
    const notifIcon = DOM.notificationsToggleBtn || document.getElementById('notifications-toggle-btn');

    if (notifications.length === 0 && recentSlice.length === 0 && pendingGeneralRequests.length === 0 && pendingDuzeltmeRequests.length === 0 && !mtvHtml && !kaskoExcelHtml) {
      if (notifDropdown) {
        notifDropdown.innerHTML = '<button disabled>Bildirim Yok</button>';
        if (notifDropdown.classList.contains('open') && typeof window.syncMobileNotificationsDropdownHeight === 'function') {
          requestAnimationFrame(function() {
            window.syncMobileNotificationsDropdownHeight();
            requestAnimationFrame(window.syncMobileNotificationsDropdownHeight);
          });
        }
      }
      if (notifIcon) {
        notifIcon.classList.remove('notification-red', 'notification-orange', 'notification-pulse');
      }
    } else {
      const tStart = (function() {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      })();
      const notifFeed = [];
      function pushNotifFeedOnce(notifKey, t, h) {
        const normalizedKey = String(notifKey || '').trim();
        if (!normalizedKey || feedKeys[normalizedKey]) return false;
        feedKeys[normalizedKey] = true;
        notifFeed.push({ t: t, h: h });
        return true;
      }
      if (mtvHtml) {
        pushNotifFeedOnce('special|mtv|' + y + '|' + String(m + 1).padStart(2, '0'), mtvSortMs || tStart, mtvHtml);
      }
      if (kaskoExcelHtml) {
        pushNotifFeedOnce('special|kaskoExcel|' + y + '|' + String(m + 1).padStart(2, '0'), kaskoExcelSortMs || tStart, kaskoExcelHtml);
      }

      if (pendingGeneralRequests.length > 0) {
        function notificationFeedbackTopicLabel(typeRaw) {
          var s = String(typeRaw || 'talep').toLocaleLowerCase('tr-TR');
          if (s === 'sikayet' || s === 'şikayet') return '\u015Eikayet';
          if (s === 'oneri' || s === '\u00f6neri') return '\u00d6neri';
          if (s === 'diger' || s === 'di\u011fer') return 'Di\u011fer';
          if (s === 'gorus' || s === 'g\u00f6r\u00fc\u015f') return 'G\u00f6r\u00fc\u015f';
          return 'Talep';
        }
        function notificationFeedbackIsRedSeverity(typeRaw) {
          var s = String(typeRaw || '').toLocaleLowerCase('tr-TR');
          return s === 'sikayet' || s === 'şikayet';
        }
        pendingGeneralRequests.forEach(function(request, reqIdx) {
          var topic = notificationFeedbackTopicLabel(request.type);
          var messageText = request.userName + ', ' + request.plate + ' Plakal\u0131 Ta\u015f\u0131t \u0130\u00e7in ' + topic + ' G\u00f6nderdi.';
          var notifKey = 'request|general|' + String(request.id || reqIdx);
          var dateDisplay = getOrCreateNotificationFirstSeen(notifKey);
          var isRead = viewedKeys.indexOf(notifKey) !== -1;
          var isRedRequest = notificationFeedbackIsRedSeverity(request.type);
          var borderClass = isRedRequest
            ? 'date-warning-red-border'
            : (!isRead ? 'date-warning-orange-border' : '');
          var titleClass = isRedRequest
            ? 'date-warning-red'
            : (!isRead ? 'date-warning-orange' : 'notif-read-text');
          var stateClass = isRead ? ' notification-read' : ' notification-unread';
          var notifStyle = isRedRequest
            ? '--notif-border: rgba(212, 0, 0, 0.6); --notif-fg: var(--theme-color);'
            : (isRead ? '--notif-border: rgba(130, 130, 130, 0.55); --notif-fg: #9a9a9a;' : '');
          var h = '<button type="button" data-action="open-driver-report" data-notif-key="' + escapeHtml(notifKey) + '" style="' + notifStyle + '" class="notification-item notification-item-feedback is-driver-request' + stateClass + (borderClass ? ' ' + borderClass : '') + '">' +
          '<div class="notif-line1 notif-title"><span class="' + titleClass + '">' + escapeHtml(messageText) + '</span></div>' +
          '<div class="notif-line2 notif-meta-date">' + escapeHtml(dateDisplay) + '</div>' +
        '</button>';
          var baseMs = medisaNotificationTalepSortMs(request.date);
          if (baseMs <= 0) {
            baseMs = parseNotificationDisplayDateMs(dateDisplay);
          }
          if (baseMs <= 0) {
            baseMs = tStart;
          }
          var t = baseMs - reqIdx * 1e-6;
          pushNotifFeedOnce(notifKey, t, h);
          if (!isRead) hasUnreadMarkableNotification = true;
          if (isRedRequest) {
            hasRed = true;
          } else if (!isRead) {
            hasOrange = true;
          }
        });
      }

      if (pendingDuzeltmeRequests.length > 0) {
        pendingDuzeltmeRequests.forEach(function(request, dreqIdx) {
          const messageText = `${request.userName}, ${request.plate} plakalı taşıt için ${request.topic} (onay bekliyor).`;
          const notifKey = 'request|correction|' + String(request.id || dreqIdx);
          const dateDisplay = getOrCreateNotificationFirstSeen(notifKey);
          const isRead = viewedKeys.indexOf(notifKey) !== -1;
          const stateClass = isRead ? ' notification-read' : ' notification-unread';
          const borderClass = ' date-warning-red-border';
          const notifStyle = '--notif-border: rgba(212, 0, 0, 0.6); --notif-fg: var(--theme-color);';
          const titleClass = 'date-warning-red';
          const h = `<button type="button" data-action="open-driver-report" data-notif-key="${escapeHtml(notifKey)}" style="${notifStyle}" class="notification-item notification-item-feedback${stateClass}${borderClass}">
          <div class="notif-line1 notif-title"><span class="${titleClass}">${escapeHtml(messageText)}</span></div>
          <div class="notif-line2 notif-meta-date">${escapeHtml(dateDisplay)}</div>
        </button>`;
          var dbaseMs = medisaNotificationTalepSortMs(request.date);
          if (dbaseMs <= 0) {
            dbaseMs = parseNotificationDisplayDateMs(dateDisplay);
          }
          if (dbaseMs <= 0) {
            dbaseMs = tStart;
          }
          const t = dbaseMs - dreqIdx * 1e-6;
          pushNotifFeedOnce(notifKey, t, h);
          if (!isRead) hasUnreadMarkableNotification = true;
          hasRed = true;
        });
      }

      if (notifications.length > 0) {
        notifications.forEach((notif, dIdx) => {
            const typeLabel = notif.type === 'sigorta' ? 'Sigorta'
              : notif.type === 'kasko' ? 'Kasko'
              : notif.type === 'egzoz' ? 'Egzoz Muayenesi'
              : notif.type === 'takograf' ? 'Takograf Kalibrasyon'
              : notif.type === 'k2' ? 'K2 Belgesi'
              : 'Muayene';
            const notifKey = buildDateNotificationKey(notif);
            const activeDateDisplay = getOrCreateNotificationFirstSeen(notifKey);
            const activeFirstSeenMs = getOrCreateNotificationFirstSeenMs(notifKey);
            const isRead = viewedKeys.indexOf(notifKey) !== -1;
            const isUnread = !isRead;
            const isRedDateSeverity = notif.warningClass === 'date-warning-red';
            const isOrangeDateSeverity = notif.warningClass === 'date-warning-orange';
            const shouldKeepDateSeverityClass = isRedDateSeverity || isOrangeDateSeverity;

            let messageText = '';
            if (notif.type === 'k2' && notif.days < 0) {
                messageText = `K2 Belgesi Tarihi ${Math.abs(notif.days)} Gün Geçti.`;
            } else if (notif.type === 'k2' && notif.days === 0) {
                messageText = 'K2 Belgesi Tarihi Bugün Bitiyor.';
            } else if (notif.type === 'k2') {
                messageText = `K2 Belgesi Tarihi ${notif.days} Gün Sonra Bitecek.`;
            } else if (notif.days <= 0 && notif.type === 'kasko') {
                messageText = `${notif.plate} Plakalı Taşıtın Kasko Süresi Bitmiştir.`;
            } else if (notif.type === 'egzoz' && notif.missing) {
                messageText = `${notif.plate} Plakalı Taşıtın Egzoz Muayenesi Tarihi Eksiktir.`;
            } else if (notif.days <= 0 && notif.type === 'egzoz') {
                messageText = `${notif.plate} Plakalı Taşıtın Egzoz Muayenesi Süresi Bitmiştir.`;
            } else if (notif.days <= 0 && notif.type === 'muayene') {
                messageText = `${notif.plate} Plakalı Taşıtın Muayene Süresi Bitmiştir.`;
            } else if (notif.days < 0) {
                messageText = `${notif.plate} Plakalı Taşıtın ${typeLabel} Tarihi ${Math.abs(notif.days)} Gün Geçti.`;
            } else if (notif.days === 0) {
                messageText = `${notif.plate} Plakalı Taşıtın ${typeLabel} Tarihi Bugün Bitiyor.`;
            } else if (notif.days === 1) {
                messageText = `${notif.plate} Plakalı Taşıtın ${typeLabel} Tarihi Yarın Bitiyor.`;
            } else {
                messageText = `${notif.plate} Plakalı Taşıtın ${typeLabel} Tarihi ${notif.days} Gün Sonra Bitecek.`;
            }

            const borderColor = notif.warningClass === 'date-warning-red'
              ? 'rgba(212, 0, 0, 0.6)'
              : 'rgba(255, 106, 0, 0.6)';
            const readBorderColor = 'rgba(130, 130, 130, 0.55)';

            const safePlate = (notif.type === 'k2' ? 'Şirket Evrakı' : (notif.plate || '')).replace(/"/g, '&quot;');
            const safeVid = (notif.type === 'k2' ? '' : (notif.vehicleId || '')).toString().replace(/"/g, '&quot;');
            const safeKey = notifKey.replace(/"/g, '&quot;');
            const stateClass = isUnread ? ' notification-unread' : ' notification-read';
            const borderClass = shouldKeepDateSeverityClass ? (notif.warningClass + '-border') : '';
            const titleClass = shouldKeepDateSeverityClass ? notif.warningClass : 'notif-read-text';
            const notifStyle = shouldKeepDateSeverityClass
              ? `--notif-border: ${borderColor}; --notif-fg: var(--theme-color);`
              : (isUnread
                ? `--notif-border: ${borderColor}; --notif-fg: #ccc;`
                : `--notif-border: ${readBorderColor}; --notif-fg: #9a9a9a;`);
            if (isUnread) hasUnreadMarkableNotification = true;
            if (isRedDateSeverity) {
              hasRed = true;
            } else if (isOrangeDateSeverity && isUnread) {
              hasOrange = true;
            }

            const k2ActionAttr = notif.type === 'k2' ? ' data-action="open-required-documents"' : '';
            const h = `<button type="button"${k2ActionAttr} data-plate="${safePlate}" data-vehicle-id="${safeVid}" data-notif-key="${safeKey}" style="${notifStyle}" class="notification-item ${borderClass}${stateClass}">
            <div class="notif-line1 notif-title">
              <span class="${titleClass}">${escapeHtml(messageText)}</span>
            </div>
            <div class="notif-line2 notif-meta-date">${escapeHtml(activeDateDisplay)}</div>
          </button>`;
            const t = (activeFirstSeenMs || tStart) - dIdx * 1e-6;
            pushNotifFeedOnce(notifKey, t, h);
        });
      }

      if (recentSlice.length > 0) {
        recentSlice.forEach((item, aIdx) => {
          const ev = item.event;
          const historyTab = getHistoryTabForEventType(ev.type);
          const safePlate = (item.plate || '').replace(/"/g, '&quot;');
          const safeVid = String(item.vehicleId || '').replace(/"/g, '&quot;');
          const notifKey = buildEventNotificationKey(item);
          const dateDisplay = getOrCreateNotificationFirstSeen(notifKey);
          const safeKey = notifKey.replace(/"/g, '&quot;');
          const isUnread = viewedKeys.indexOf(notifKey) === -1;
          if (isUnread) {
            hasUnreadMarkableNotification = true;
          }
          const unreadClass = isUnread ? ' notification-unread' : ' notification-read';
          const unreadStyle = isUnread
            ? '--notif-border: rgba(255, 255, 255, 0.55); --notif-fg: #a0aec0;'
            : '--notif-border: rgba(130, 130, 130, 0.55); --notif-fg: #9a9a9a;';
          const activityMsg = getNotificationActivityMessage(ev, item.plate);
          const h = `<button type="button" data-plate="${safePlate}" data-vehicle-id="${safeVid}" data-open-history="1" data-history-tab="${historyTab}" data-notif-key="${safeKey}" style="${unreadStyle}" class="notification-item notification-item-activity${unreadClass}">
          <div class="notif-line1 notif-title">${escapeHtml(activityMsg)}</div>
          <div class="notif-line2 notif-meta-date">${escapeHtml(dateDisplay)}</div>
        </button>`;
          const t = getEventSortTime(ev) - aIdx * 1e-6;
          pushNotifFeedOnce(notifKey, t, h);
        });
      }

      notifFeed.sort(function(a, b) { return b.t - a.t; });
      let html = notifFeed.map(function(x) { return x.h; }).join('');
      const hasUnreadInRenderedList = html.indexOf('notification-unread') !== -1;
      const hasUnreadDriverRequestInRenderedList = /class="[^"]*\bis-driver-request\b[^"]*\bnotification-unread\b/.test(html);

      if (notifDropdown) {
        if (hasUnreadMarkableNotification || hasUnreadInRenderedList) {
          html = `<div class="notifications-toolbar"><button type="button" class="notifications-mark-all-read-btn" data-notification-action="mark-all-read">Tümünü Okundu Olarak İşaretle</button></div>` + html;
        }
        notifDropdown.innerHTML = html;
        if (notifDropdown.classList.contains('open') && typeof window.syncMobileNotificationsDropdownHeight === 'function') {
          requestAnimationFrame(function() {
            window.syncMobileNotificationsDropdownHeight();
            requestAnimationFrame(window.syncMobileNotificationsDropdownHeight);
          });
        }
      }

      if (notifIcon) {
        notifIcon.classList.remove('notification-red', 'notification-orange', 'notification-pulse');
        if (hasRed) {
          notifIcon.classList.add('notification-red', 'notification-pulse');
        } else if (hasOrange) {
          notifIcon.classList.add('notification-orange', 'notification-pulse');
        } else if (hasUnreadDriverRequestInRenderedList || hasUnreadMarkableNotification) {
          /* Sadece nütr (faaliyet vb.) okunmamış: renk tema varsayılanı, dikkat için pulse */
          notifIcon.classList.add('notification-pulse');
        }
        /* Zil rengi: kırmızı = kritik/süresi bitmiş uyarılar; turuncu = yaklaşan tarih ve benzeri; pulse = başka okunmamış. */
      }
    }
    } catch (err) {
      if (typeof window.__medisaLogError === 'function') window.__medisaLogError('updateNotifications', err);
      else console.error('[Medisa] Bildirimler güncellenemedi:', err);
    } finally {
      updateMonthlyTodoHeaderBadge();
      flushNotificationFirstSeenBatch();
    }
    openNotificationsFromReturnParam();
  };

  window.dismissMTVNotif = function(event, key) {
    event.stopPropagation();
    event.preventDefault();

    const btn = event.currentTarget;
    const container = btn ? btn.closest('.mtv-notification') : null;
    const textSpan = container ? container.querySelector('.mtv-main-text') : null;

    // Görsel Geri Bildirim: Butonu kilitle ve metni güncelle
    if (btn) {
      btn.style.pointerEvents = 'none';
      btn.style.opacity = '0.5';
    }
    if (container) {
      container.style.cursor = 'wait';
    }
    if (textSpan) {
      textSpan.style.transition = 'all 0.3s ease';
      textSpan.innerText = 'Bildirim işleniyor, lütfen bekleyin...';
      textSpan.style.color = 'var(--txt-muted)';
    }

    dismissNotificationKeys([key]);
  };

  window.dismissKaskoExcelNotif = function(event, key) {
    event.stopPropagation();
    event.preventDefault();

    const btn = event.currentTarget;
    const container = btn ? btn.closest('.kasko-excel-notification') : null;
    const textSpan = container ? container.querySelector('.mtv-main-text') : null;

    if (btn) {
      btn.style.pointerEvents = 'none';
      btn.style.opacity = '0.5';
    }
    if (container) {
      container.style.cursor = 'wait';
    }
    if (textSpan) {
      textSpan.style.transition = 'all 0.3s ease';
      textSpan.innerText = 'Bildirim işleniyor, lütfen bekleyin...';
      textSpan.style.color = 'var(--txt-muted)';
    }

    dismissNotificationKeys([key]);
  };

  window.addEventListener('storage', function() {
    if (window.updateNotifications) window.updateNotifications();
  });

  window.addEventListener('medisa:open-monthly-todo-return', function() {
    openMonthlyTodoModal();
  });

  window.__medisaNotificationsModuleReady = true;
})();
