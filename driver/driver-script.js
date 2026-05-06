/* =========================================
   MEDISA KULLANICI MODÜLÜ - SCRIPT
   ========================================= */

// API ve yönlendirme yolları: bulunduğu app root'a göre dinamik çözülür.
const APP_ROOT = (function() {
    var p = document.location.pathname || '/';
    var parts = String(p || '/').split('/').filter(Boolean);
    if (!parts.length) return '/';
    var lastPart = parts[parts.length - 1] || '';
    if (lastPart.indexOf('.') !== -1) parts.pop();
    var lastDir = (parts[parts.length - 1] || '').toLowerCase();
    if (lastDir === 'driver' || lastDir === 'admin') parts.pop();
    return parts.length ? ('/' + parts.join('/') + '/') : '/';
  })();
const API_BASE = (APP_ROOT === '/' ? '/driver/' : APP_ROOT + 'driver/');

// İkon/kaporta SVG base path (sürücü paneli farklı dizinde)
const ICON_BASE = (APP_ROOT === '/' ? '/icon/' : APP_ROOT + 'icon/');

// Sayfa yönlendirmeleri
const DRIVER_PAGE_BASE = API_BASE;
const MAIN_APP_URL = (APP_ROOT === '/' ? '/index.html' : APP_ROOT + 'index.html');
const MAIN_SESSION_URL = (APP_ROOT === '/' ? '/load.php' : APP_ROOT + 'load.php');
  
  // Uygulama sürümü (footer #version-display - kullanıcı girişi ve paneli 78.1)
  const APP_VERSION = 'v78.1';
  function showDriverOfflineReadonlyMessage() {
    alert('İnternet bağlantısı yok. Son kayıtlı veri görüntüleniyor; değişiklikler kaydedilemez.');
  }
  function ensureDriverOnlineForWrite() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      showDriverOfflineReadonlyMessage();
      return false;
    }
    return true;
  }
  
  (function setDriverVersion() {
    function apply() {
      var el = document.getElementById('version-display');
      if (!el) return;
      var ua = navigator.userAgent || '';
      var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
      var isPWA = window.matchMedia('(display-mode: standalone)').matches || (window.navigator.standalone === true);
      var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
      var suffix = isPWA ? (isIOS ? ' iOS PWA' : ' PWA') : (isMobile ? ' Mobil' : '');
      el.textContent = APP_VERSION + suffix;
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
    else apply();
  })();

  function decodeDriverTokenPayload(token) {
    if (!token || typeof token !== 'string') return null;
    try {
      if (token.indexOf('.') !== -1) {
        var parts = token.split('.');
        if (parts.length !== 3) return null;
        var payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (payload.length % 4) payload += '=';
        return JSON.parse(atob(payload));
      }
      return JSON.parse(atob(token));
    } catch (e) {
      return null;
    }
  }

  function getStoredPortalToken() {
    try {
      return localStorage.getItem('medisa_portal_token')
        || sessionStorage.getItem('medisa_portal_token')
        || localStorage.getItem('driver_token')
        || sessionStorage.getItem('driver_token')
        || null;
    } catch (e) {
      return null;
    }
  }

  function clearStoredPortalTokens() {
    try {
      localStorage.removeItem('medisa_portal_token');
      sessionStorage.removeItem('medisa_portal_token');
      localStorage.removeItem('driver_token');
      sessionStorage.removeItem('driver_token');
    } catch (e) {}
  }

  function shouldForceDriverLoginView() {
    try {
      var search = window.location && window.location.search ? window.location.search : '';
      if (!search) return false;
      return new URLSearchParams(search).get('force') === 'login';
    } catch (e) {
      return false;
    }
  }

  function getRequestedNextUrl() {
    try {
      var search = window.location && window.location.search ? window.location.search : '';
      if (!search) return '';
      var rawNext = new URLSearchParams(search).get('next');
      if (!rawNext) return '';

      var resolvedUrl = new URL(rawNext, window.location.origin);
      if (resolvedUrl.origin !== window.location.origin) return '';

      return (resolvedUrl.pathname || '') + (resolvedUrl.search || '') + (resolvedUrl.hash || '');
    } catch (e) {
      return '';
    }
  }

  function isMainAppPortalEntry() {
    try {
      var search = window.location && window.location.search ? window.location.search : '';
      if (!search) return false;
      return new URLSearchParams(search).get('portal') === 'main-app';
    } catch (e) {
      return false;
    }
  }

  function persistSessionToken(token, remember) {
    if (!token) return;
    clearStoredPortalTokens();
    try {
      if (remember) {
        localStorage.setItem('medisa_portal_token', token);
        localStorage.setItem('driver_token', token);
      } else {
        sessionStorage.setItem('medisa_portal_token', token);
        sessionStorage.setItem('driver_token', token);
      }
    } catch (storageErr) {
      console.warn('Token depolamasi sirasinda sorun olustu, oturum sekme bazli tutulacak.', storageErr);
      try {
        sessionStorage.setItem('medisa_portal_token', token);
        sessionStorage.setItem('driver_token', token);
      } catch (fallbackErr) {
        console.error('Token kaydedilemedi.', fallbackErr);
      }
    }
  }

  async function fetchCurrentPortalSession(token) {
    if (!token) return null;
    try {
      const response = await fetch(MAIN_SESSION_URL + '?_=' + Date.now(), {
        headers: { 'Authorization': 'Bearer ' + token },
        cache: 'no-store'
      });
      if (!response.ok) return null;
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      return data && data.session && typeof data.session === 'object' ? data.session : null;
    } catch (e) {
      return null;
    }
  }

  function normalizePortalRole(role) {
    var r = String(role || '').trim();
    if (r === 'yonetici_kullanici') return 'sube_yonetici';
    return r;
  }

  function getPortalRoleValue(sessionData, payload) {
    var raw = '';
    if (sessionData && typeof sessionData === 'object') {
      var sessionRole = String(sessionData.role || (sessionData.user && sessionData.user.role) || '').trim();
      if (sessionRole) raw = sessionRole;
    }
    if (!raw) {
      raw = String((payload && (payload.rol || payload.role)) || '').trim();
    }
    return normalizePortalRole(raw);
  }

  function isPortalMainAppRole(role) {
    var normalizedRole = normalizePortalRole(role);
    return normalizedRole === 'sube_yonetici'
      || normalizedRole === 'genel_yonetici';
  }

  function buildPortalAccessContext(payload, fallbackDashboard, sessionData) {
    var driverDashboard = false;
    if (sessionData && typeof sessionData.driver_dashboard === 'boolean') {
      driverDashboard = sessionData.driver_dashboard === true;
    } else if (payload && typeof payload.driver_dashboard === 'boolean') {
      driverDashboard = payload.driver_dashboard === true;
    } else if (fallbackDashboard === true) {
      driverDashboard = true;
    }
    return {
      role: getPortalRoleValue(sessionData, payload),
      driverDashboard: driverDashboard,
      yoneticiOnly: sessionData && typeof sessionData.yonetici_only === 'boolean'
        ? sessionData.yonetici_only === true
        : !!(payload && payload.yonetici_only === true),
      panelEnabled: driverDashboard
    };
  }

  function canOpenDriverDashboard(accessContext) {
    if (!accessContext || accessContext.driverDashboard !== true) return false;
    if (accessContext.yoneticiOnly === true) return false;
    return true;
  }

  function resolvePortalDefaultSurface(accessContext) {
    if (!accessContext) return null;

    var role = String(accessContext.role || '').trim();
    if (role === 'kullanici') {
      return canOpenDriverDashboard(accessContext) ? 'dashboard' : null;
    }
    if (isPortalMainAppRole(role)) {
      return 'main';
    }
    if (canOpenDriverDashboard(accessContext)) {
      return 'dashboard';
    }

    return null;
  }

  function routeByAccessContext(accessContext, options) {
    var routeOptions = options && typeof options === 'object' ? options : {};
    var surface = resolvePortalDefaultSurface(accessContext);
    var requestedNextUrl = String(routeOptions.nextUrl || '').trim();

    if (requestedNextUrl && (surface === 'dashboard' || surface === 'main')) {
      window.location.href = requestedNextUrl;
      return true;
    }

    if (surface === 'dashboard') {
      window.location.href = DRIVER_PAGE_BASE + 'dashboard.html';
      return true;
    }

    if (surface === 'main') {
      window.location.href = MAIN_APP_URL;
      return true;
    }

    if (routeOptions.stayOnLoginWhenDashboardUnavailable === true) {
      return false;
    }

    var r = normalizePortalRole(String((accessContext && accessContext.role) || ''));
    if (r === 'kullanici' && !canOpenDriverDashboard(accessContext)) {
      return false;
    }

    window.location.href = MAIN_APP_URL;
    return true;
  }

  function routeByToken(token, fallbackDashboard, options) {
    var routeOptions = options && typeof options === 'object' ? options : {};
    var payload = decodeDriverTokenPayload(token);
    var nowTs = Math.floor(Date.now() / 1000);
    if (!payload || !payload.exp || Number(payload.exp) < nowTs) {
      clearStoredPortalTokens();
      return false;
    }

    var accessContext = buildPortalAccessContext(payload, fallbackDashboard, routeOptions.sessionData);
    return routeByAccessContext(accessContext, routeOptions);
  }

  async function routeByCurrentSession(token, fallbackDashboard, options) {
    var routeOptions = options && typeof options === 'object' ? options : {};
    var payload = decodeDriverTokenPayload(token);
    var nowTs = Math.floor(Date.now() / 1000);
    if (!payload || !payload.exp || Number(payload.exp) < nowTs) {
      clearStoredPortalTokens();
      return false;
    }

    var currentSession = await fetchCurrentPortalSession(token);
    return routeByToken(token, fallbackDashboard, Object.assign({}, routeOptions, {
      sessionData: currentSession || routeOptions.sessionData || null
    }));
  }

  function syncDashboardHomeLinkVisibility(accessContext) {
    if (!document.body || !document.body.classList.contains('dashboard-page')) return;
    var shouldShow = !!accessContext
      && canOpenDriverDashboard(accessContext)
      && isPortalMainAppRole(accessContext.role);
    document.querySelectorAll('.dashboard-page .driver-footer-back-wrap').forEach(function(el) {
      if (shouldShow) {
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    });
  }
  
  // Global değişkenler
  let currentToken = null;
  let currentUser = null;
  let currentRecordId = null;
  let allHistoryRecords = [];
  let allHistoryVehicles = [];
  let currentDriverEventVehicleId = null;
  /** Muayene bildirimi teyit edildi mi (Hayır/Evet akışı). Modal kapanınca sıfırlanır. */
  let isMuayeneConfirmed = false;
  /** Bloktan (sliding block) muayene bildirimi bekliyorsa vehicleId. Teyit sonrası API çağrısı için. */
  let pendingMuayeneVehicleId = null;
  /** Popover gösterildiğinde hangi kaynaktan: 'modal' | 'block'. Butonları geri göstermek için. */
  let muayeneConfirmSource = null;
  let currentPeriod = '';
  let selectedVehicleId = null;
  /** Bu oturumda (ekran kapanana kadar) son bildirilen aksiyon: { action, vehicleId }. Ekran kapanınca temizlenir, yeşil geri bildirim beyaz/griye döner. */
  let lastCompletedActionInSession = null;
  /** KM bildirimi sonrası uyarının hemen kaybolması için: vehicleId -> period eşlemesi. loadDashboard cache veya geç yanıt verse bile uyarı kalksın. */
  let lastSuccessfulKmSubmissions = {};
  
  function clearSessionGreenFeedback() { lastCompletedActionInSession = null; }
  window.addEventListener('pagehide', clearSessionGreenFeedback);
  document.addEventListener('visibilitychange', function() { if (document.hidden) clearSessionGreenFeedback(); });

  function placePwaWrapper() {
    var pwaWrapper = document.getElementById('pwa-install-wrapper');
    var desktopPwaSlot = document.getElementById('driver-below-hero-pwa-slot');
    var mobilePwaTarget = document.getElementById('driver-mobile-notification-slot');
    if (!pwaWrapper) return;
    if (window.innerWidth >= 769 && desktopPwaSlot) {
      desktopPwaSlot.appendChild(pwaWrapper);
      if (mobilePwaTarget) mobilePwaTarget.setAttribute('aria-hidden', 'true');
    } else if (mobilePwaTarget) {
      mobilePwaTarget.appendChild(pwaWrapper);
      mobilePwaTarget.setAttribute('aria-hidden', pwaWrapper.querySelector('#pwa-install-bar') ? 'false' : 'true');
    }
  }
  function placeNotificationSlot() {
    var el = document.getElementById('driver-sliding-warning');
    if (!el) return;
    var belowHeroSlot = document.getElementById('driver-below-hero-notification-slot');
    var hasContent = (el.innerHTML || '').trim().length > 0;
    if (!hasContent && belowHeroSlot && el.parentNode !== belowHeroSlot) {
      belowHeroSlot.appendChild(el);
      return;
    }
    if (!hasContent) return;
    if (belowHeroSlot) {
      belowHeroSlot.appendChild(el);
    }
  }
  (function initPwaPlacement() {
    function run() {
      if (document.body.classList.contains('dashboard-page')) placePwaWrapper();
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
  })();
  (function initPwaResizePlacement() {
    var ticking = false;
    window.addEventListener('resize', function() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function() {
        if (document.body.classList.contains('dashboard-page')) {
          placePwaWrapper();
          placeNotificationSlot();
        }
        ticking = false;
      });
    });
  })();

  /** Tarih input değerini DD/MM/YYYY olarak göster (örn. 2025-12-01 -> 01/12/2025) */
  function formatDateDDMMYYYY(isoDate) {
    if (!isoDate || typeof isoDate !== 'string') return '';
    function isValidDateParts(day, month, year) {
      var d = parseInt(day, 10);
      var m = parseInt(month, 10);
      var y = parseInt(year, 10);
      if (!d || !m || !y || m < 1 || m > 12) return false;
      var dt = new Date(y, m - 1, d);
      return dt.getFullYear() === y && dt.getMonth() === (m - 1) && dt.getDate() === d;
    }
    var raw = isoDate.trim();
    var parts = raw.split('-');
    if (parts.length === 3) {
      var p0 = (parts[0] || '').trim();
      var p1 = (parts[1] || '').trim();
      var p2 = (parts[2] || '').trim();
      if (/^\d{4}$/.test(p0) && /^\d{1,2}$/.test(p1) && /^\d{1,2}$/.test(p2) && isValidDateParts(p2, p1, p0)) {
        return String(p2).padStart(2, '0') + '/' + String(p1).padStart(2, '0') + '/' + p0;
      }
      if (/^\d{1,2}$/.test(p0) && /^\d{1,2}$/.test(p1) && /^\d{4}$/.test(p2) && isValidDateParts(p0, p1, p2)) {
        return String(p0).padStart(2, '0') + '/' + String(p1).padStart(2, '0') + '/' + p2;
      }
      return raw;
    }
    var digits = raw.replace(/[^\d]/g, '');
    if (/^\d{8}$/.test(digits)) {
      var dd = digits.slice(0, 2);
      var mm = digits.slice(2, 4);
      var yyyy = digits.slice(4, 8);
      if (isValidDateParts(dd, mm, yyyy)) return dd + '/' + mm + '/' + yyyy;
      var yyyyAlt = digits.slice(0, 4);
      var mmAlt = digits.slice(4, 6);
      var ddAlt = digits.slice(6, 8);
      if (isValidDateParts(ddAlt, mmAlt, yyyyAlt)) return ddAlt + '/' + mmAlt + '/' + yyyyAlt;
    }
    return raw;
  }

  /** Muayene bitiş tarihi hesapla (ana panel + driver_event.php ile senkron). */
  function calculateNextMuayeneDate(tarihStr, vehicle) {
    if (!tarihStr) return '';
    var vehicleType = (vehicle && (vehicle.vehicleType || vehicle.tip)) ? (vehicle.vehicleType || vehicle.tip) : 'otomobil';
    vehicleType = String(vehicleType).toLowerCase();
    var isCommercial = vehicleType !== 'otomobil';
    var years = isCommercial ? 1 : 2;
    try {
      var dt = new Date(tarihStr + 'T00:00:00');
      if (isNaN(dt.getTime())) return '';
      dt.setFullYear(dt.getFullYear() + years);
      return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
    } catch (e) {
      return '';
    }
  }
  function formatDriverPlaka(plaka) {
    if (!plaka) return '';
    return window.innerWidth <= 768 ? String(plaka).replace(/\s+/g, '') : plaka;
  }
  function syncDriverDateDisplay(inputEl) {
    if (!inputEl || inputEl.type !== 'date') return;
    var wrap = inputEl.closest('.driver-date-wrap');
    if (!wrap) return;
    var display = wrap.querySelector('.driver-date-display');
    if (!display) return;
    var formatted = formatDateDDMMYYYY(inputEl.value || '');
    // iOS tarih seçicide boş ara değerde etiketi anında silme (odak açıkken koru).
    if (!formatted && document.activeElement === inputEl && display.dataset.lastShown) return;
    display.textContent = formatted;
    if (formatted) display.dataset.lastShown = formatted;
  }
  function initDriverDateDisplays(container) {
    var root = container && container.nodeType ? container : document;
    var wraps = root.querySelectorAll ? root.querySelectorAll('.driver-date-wrap') : [];
    wraps.forEach(function(wrap) {
      var input = wrap.querySelector('input[type="date"]');
      if (!input) return;
      syncDriverDateDisplay(input);
      input.removeEventListener('input', wrap._driverDateInputHandler);
      input.removeEventListener('change', wrap._driverDateInputHandler);
      wrap._driverDateInputHandler = function() { syncDriverDateDisplay(input); };
      input.addEventListener('input', wrap._driverDateInputHandler);
      input.addEventListener('change', wrap._driverDateInputHandler);
      input.addEventListener('focus', function() {
        if (typeof input.showPicker === 'function') { try { input.showPicker(); } catch (e) {} }
      });
    });
  }
  
  /** iOS PWA: modal içi input/textarea focus'ta sadece gerçekten görünmüyorsa en yakın konuma al */
  document.addEventListener('focusin', function(ev) {
    var el = ev.target;
    if (!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.closest)) return;

    var modal = el.closest('.driver-modal');
    if (!modal) return;

    setTimeout(function() {
      if (!(el && typeof el.getBoundingClientRect === 'function' && typeof el.scrollIntoView === 'function')) return;

      var rect = el.getBoundingClientRect();
      var viewportHeight = (window.visualViewport && window.visualViewport.height) ? window.visualViewport.height : window.innerHeight;
      var topSafe = 88;
      var bottomSafe = 24;

      var isAboveVisibleArea = rect.top < topSafe;
      var isBelowVisibleArea = rect.bottom > (viewportHeight - bottomSafe);

      if (isAboveVisibleArea || isBelowVisibleArea) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    }, 350);
  });
  
  /** Modal açıkken body scroll kilitlensin (sadece modal içi kayar). Geçmiş Kayıt / Düzeltme Talebi açıkken footer :has() olmadan da üstte kalsın. */
  function updateDriverModalBodyClass() {
    var open = document.querySelector('.driver-modal.show');
    if (open) {
      document.body.classList.add('driver-modal-open');
      var id = open.id;
      if (id === 'history-modal' || id === 'edit-request-modal') {
        document.body.classList.add('driver-history-or-edit-modal-open');
      } else {
        document.body.classList.remove('driver-history-or-edit-modal-open');
      }
      if (id === 'driver-feedback-modal') {
        document.body.classList.add('driver-feedback-modal-open');
      } else {
        document.body.classList.remove('driver-feedback-modal-open');
      }
    } else {
      document.body.classList.remove('driver-modal-open');
      document.body.classList.remove('driver-history-or-edit-modal-open');
      document.body.classList.remove('driver-feedback-modal-open');
    }
  }
  
  /* =========================================
     LOGIN SAYFASI
     ========================================= */
  
  /* Footer dimmer (sürüm metni script-core.js tarafından PWA/Mobil soneki ile yazılır) */
  (function initLoginFooterDim() {
    const footer = document.getElementById('app-footer');
    if (!footer) return;
    footer.classList.add('dimmed');
    footer.classList.remove('delayed');
    setTimeout(function() {
      if (footer) footer.classList.add('delayed');
    }, 4000);
  })();
  
  function initDriverLoginPage() {
      var loginForm = document.getElementById('login-form');
      if (!loginForm || loginForm.getAttribute('data-medisa-login-init') === '1') return;
      loginForm.setAttribute('data-medisa-login-init', '1');

      /* Geçerli bir oturum varsa login ekranını atla ve token'ın işaret ettiği yüzeye git. */
      var savedToken = getStoredPortalToken();
      if (!shouldForceDriverLoginView() && savedToken) {
          routeByCurrentSession(savedToken, false, {
              nextUrl: getRequestedNextUrl()
          });
      }
  
      var usernameInput = document.getElementById('username');
      var passwordInput = document.getElementById('password');
  
      clearSavedDriverPassword();

      /* Beni Hatırla: checkbox + kayıtlı kullanıcı adını doldur */
      var rememberCheckbox = document.getElementById('remember');
      if (rememberCheckbox && localStorage.getItem('driver_remember_me') === '1') {
          rememberCheckbox.checked = true;
          var savedUser = localStorage.getItem('driver_saved_username');
          if (usernameInput && savedUser) usernameInput.value = savedUser;
      }
  
      function toggleLoginInputHasValue(el) {
          if (!el) return;
          if (el.value && el.value.trim().length > 0) el.classList.add('has-value');
          else el.classList.remove('has-value');
      }
      [usernameInput, passwordInput].forEach(function(inp) {
          if (!inp) return;
          toggleLoginInputHasValue(inp);
          inp.addEventListener('input', function() { toggleLoginInputHasValue(inp); });
          inp.addEventListener('change', function() { toggleLoginInputHasValue(inp); });
      });
  
      /* iOS PWA / mobil: login input'u sadece gerçekten keyboard altında kalıyorsa görünür alana getir */
      function scrollInputIntoView(el) {
        if (!(el && typeof el.getBoundingClientRect === 'function' && typeof el.scrollIntoView === 'function')) return;

        setTimeout(function() {
          var rect = el.getBoundingClientRect();
          var viewportHeight = (window.visualViewport && window.visualViewport.height) ? window.visualViewport.height : window.innerHeight;
          var topSafe = 96;
          var bottomSafe = 28;

          var isAboveVisibleArea = rect.top < topSafe;
          var isBelowVisibleArea = rect.bottom > (viewportHeight - bottomSafe);

          if (isAboveVisibleArea || isBelowVisibleArea) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
          }
        }, 350);
      }
      if (usernameInput) usernameInput.addEventListener('focus', function() { scrollInputIntoView(this); });
      if (passwordInput) passwordInput.addEventListener('focus', function() { scrollInputIntoView(this); });
  
      loginForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const username = document.getElementById('username').value.trim();
          const password = document.getElementById('password').value;
          const remember = document.getElementById('remember').checked;
          
          const errorDiv = document.getElementById('error-message');
          const loginBtn = document.getElementById('login-btn');
          const btnText = loginBtn.querySelector('.btn-text');
          const btnLoader = loginBtn.querySelector('.btn-loader');
          
          errorDiv.classList.remove('show');
          loginBtn.disabled = true;
          btnText.style.display = 'none';
          btnLoader.style.display = 'inline';
          
          const loginUrl = window.location.origin + API_BASE + 'driver_login.php';
          
          try {
              const response = await fetch(loginUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ username, password })
              });
              const data = await response.json();
              
              if (data.success) {
                  if (remember) {
                      try {
                          localStorage.setItem('driver_remember_me', '1');
                          localStorage.setItem('driver_saved_username', username);
                          localStorage.removeItem('driver_saved_password');
                      } catch (e) {}
                  } else {
                      try {
                          localStorage.removeItem('driver_remember_me');
                          localStorage.removeItem('driver_saved_username');
                          localStorage.removeItem('driver_saved_password');
                      } catch (e) {}
                  }
                  var tokenToStore = data.token && typeof data.token === 'string' ? data.token : null;
                  if (tokenToStore) persistSessionToken(tokenToStore, remember);
                  var routedOk = routeByToken(tokenToStore, data.driverDashboard === true, {
                      nextUrl: getRequestedNextUrl(),
                      sessionData: {
                          role: data.rol || '',
                          kullanici_paneli: data.driverDashboard === true,
                          driver_dashboard: data.driverDashboard === true,
                          yonetici_only: data.yonetici_only === true,
                          user: {
                              role: data.rol || '',
                              kullanici_paneli: data.driverDashboard === true
                          }
                      }
                  });
                  if (!routedOk) {
                      errorDiv.textContent = 'Oturum başlatılamadı.';
                      errorDiv.classList.add('show');
                      loginBtn.disabled = false;
                      btnText.style.display = 'inline';
                      btnLoader.style.display = 'none';
                  }
              } else {
                  errorDiv.textContent = data.message || 'Giriş başarısız!';
                  errorDiv.classList.add('show');
                  loginBtn.disabled = false;
                  btnText.style.display = 'inline';
                  btnLoader.style.display = 'none';
              }
          } catch (error) {
              console.error('Hata:', error);
              errorDiv.textContent = 'Bağlantı hatası! Lütfen tekrar deneyin.';
              errorDiv.classList.add('show');
              loginBtn.disabled = false;
              btnText.style.display = 'inline';
              btnLoader.style.display = 'none';
          }
      });
  }

  if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initDriverLoginPage);
  } else {
      initDriverLoginPage();
  }
  
  /* =========================================
     SPLASH (3 sn) + DASHBOARD / LOGIN
     ========================================= */
  
  /** Splash 2 sn göster, sonra gizle ve normal akışa devam et */
  function initDriverSplash(onComplete) {
    const splash = document.getElementById('driver-splash');
    if (!splash) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }
    setTimeout(function() {
      splash.classList.add('hidden');
      splash.setAttribute('aria-hidden', 'true');
      setTimeout(function() {
        splash.style.display = 'none';
        if (typeof onComplete === 'function') onComplete();
      }, 400);
    }, 2000);
  }
  
  if (document.getElementById('driver-two-panel')) {
    const run = () => { initDriverSplash(function() { loadDashboard(); }); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
    window.addEventListener('pageshow', function(ev) {
      if (ev.persisted) run();
    });
  } else if (document.getElementById('driver-splash')) {
    (function runLoginSplash() {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { initDriverSplash(); });
      } else {
        initDriverSplash();
      }
    })();
  }
  
  async function loadDashboard() {
      const token = getStoredPortalToken();

      if (!token) {
          window.location.href = DRIVER_PAGE_BASE + 'index.html';
          return;
      }

      var tokenPayload = decodeDriverTokenPayload(token);
      var currentSession = await fetchCurrentPortalSession(token);
      var accessContext = buildPortalAccessContext(tokenPayload, false, currentSession);
      if (!canOpenDriverDashboard(accessContext)) {
          window.location.href = MAIN_APP_URL;
          return;
      }
      syncDashboardHomeLinkVisibility(accessContext);
      
      currentToken = token;
      
      try {
          const response = await fetch(API_BASE + 'driver_data.php?_=' + Date.now(), {
              headers: { 'Authorization': 'Bearer ' + token },
              cache: 'no-store'
          });
          var data;
          try {
              var text = await response.text();
              data = text ? JSON.parse(text) : {};
          } catch (parseErr) {
              console.error('Veri yükleme hatası (JSON parse):', parseErr);
              throw new Error('Sunucu yanıtı işlenemedi.');
          }
          if (!data || typeof data !== 'object') data = {};
          if (!Array.isArray(data.vehicles)) data.vehicles = [];
          if (!Array.isArray(data.records)) data.records = [];
          
          if (!data.success) {
              const spinner = document.getElementById('loading-spinner');
              if (spinner) spinner.style.display = 'none';
              alert('Oturum süresi doldu! Lütfen tekrar giriş yapın.');
              logout();
              return;
          }
  
          currentUser = data.user;
          syncDriverHeaderUserName();
          allHistoryRecords = data.records || [];
          allHistoryVehicles = data.vehicles || [];
          currentPeriod = data.current_period || '';
  
          const spinnerEl = document.getElementById('loading-spinner');
          if (spinnerEl) spinnerEl.style.display = 'none';
  
          if (!data.vehicles || data.vehicles.length === 0) {
              const emptyEl = document.getElementById('empty-state');
              if (emptyEl) emptyEl.style.display = 'block';
              return;
          }
  
          const twoPanel = document.getElementById('driver-two-panel');
          if (!twoPanel) return;
          twoPanel.style.display = 'flex';
          const emptyStateEl = document.getElementById('empty-state');
          if (emptyStateEl) emptyStateEl.style.display = 'none';
          const vehicles = data.vehicles;
          const records = data.records;
          selectedVehicleId = selectedVehicleId || (vehicles[0] != null && vehicles[0].id != null ? String(vehicles[0].id) : null);
          if (!getSelectedVehicle() && vehicles && vehicles.length && vehicles[0] != null) {
              selectedVehicleId = String(vehicles[0].id);
          }
          
          renderLeftPanel(vehicles, records);
          renderRightPanel(vehicles, records);
          renderSlidingWarning(vehicles, records);
  
          var actionArea = document.getElementById('driver-action-area');
          if (actionArea) actionArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          
          if (vehicles.length > 1) {
              const trigger = document.getElementById('driver-plate-trigger');
              if (trigger) trigger.style.display = '';
              setupPlateDropdown(vehicles);
          }
          
          setupEkstraNotAutoResize();
          setupKmInputs();
          bindDriverDashboardTitleCase(document.getElementById('driver-action-area'));

          placePwaWrapper();

      } catch (error) {
          console.error('Veri yükleme hatası:', error);
          const spinner = document.getElementById('loading-spinner');
          const emptyEl = document.getElementById('empty-state');
          if (spinner) spinner.style.display = 'none';
          if (emptyEl) {
              emptyEl.style.display = 'block';
              const h3 = emptyEl.querySelector('h3');
              const p = emptyEl.querySelector('p');
              if (h3) h3.textContent = 'Yükleme Hatası';
              if (p) p.textContent = 'Veriler yüklenemedi! Lütfen sayfayı yenileyin.';
              const icon = emptyEl.querySelector('.driver-empty-icon');
              if (icon) icon.textContent = '🚗';
          }
      }
  }
  
  function getSelectedVehicle() {
      return allHistoryVehicles.find(v => String(v.id) === String(selectedVehicleId));
  }

  function getVehicleVersionForRequest(vehicleId) {
      var vehicle = allHistoryVehicles && allHistoryVehicles.find(function(v) { return String(v.id) === String(vehicleId); });
      var version = vehicle && vehicle.version != null ? Number(vehicle.version) : 1;
      return Number.isFinite(version) && version > 0 ? version : 1;
  }

  function applyVehicleVersionUpdate(vehicleId, nextVersion) {
      if (!allHistoryVehicles || nextVersion == null) return;
      var normalizedVersion = Number(nextVersion);
      if (!Number.isFinite(normalizedVersion) || normalizedVersion <= 0) return;
      allHistoryVehicles.forEach(function(vehicle) {
          if (String(vehicle && vehicle.id) === String(vehicleId)) {
              vehicle.version = normalizedVersion;
          }
      });
  }

  async function handleDriverConflictResponse(result, fallbackMessage) {
      if (!result || result.conflict !== true) return false;
      alert(result.message || fallbackMessage || 'Veri başka biri tarafından güncellendi. Güncel veriler yüklendi.');
      await loadDashboard();
      return true;
  }
  
  function getExistingRecord(vehicleId) {
      const period = (currentPeriod || '').toString().trim();
      const matches = (allHistoryRecords || []).filter(r =>
          String(r.arac_id) === String(vehicleId) && String(r.donem || '').trim() === period
      );
      if (matches.length === 0) return null;
      matches.sort((a, b) => (b.guncelleme_tarihi || b.kayit_tarihi || '').localeCompare(a.guncelleme_tarihi || a.kayit_tarihi || ''));
      return matches[0];
  }

  function getVehicleKmState(vehicle) {
      if (!vehicle || typeof vehicle !== 'object') return 'OK';
      const state = String(vehicle.km_state || '').trim();
      return state || 'OK';
  }

  function isKmStateWarning(state) {
      return state === 'FIRST_ENTRY_REQUIRED' || state === 'MONTHLY_UPDATE_DUE_SOFT' || state === 'MONTHLY_UPDATE_DUE_HARD';
  }

  function getKmInfoClassByState(state) {
      if (state === 'MONTHLY_UPDATE_DUE_SOFT') return 'driver-warn-orange';
      if (state === 'FIRST_ENTRY_REQUIRED' || state === 'MONTHLY_UPDATE_DUE_HARD') return 'driver-warn-red';
      return '';
  }

  function getKmMessageByState(state) {
      if (state === 'MONTHLY_UPDATE_DUE_SOFT') return 'Kilometre bilgisi güncellensin';
      if (state === 'FIRST_ENTRY_REQUIRED' || state === 'MONTHLY_UPDATE_DUE_HARD') return 'Kilometre bilgisi girin';
      return '';
  }
  
  function checkDateWarningsDriver(dateStr) {
    if (!dateStr) return { class: '', days: null, level: '' };
    var date = new Date(dateStr + 'T00:00:00');
    if (isNaN(date.getTime())) return { class: '', days: null, level: '' };
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    var diffDays = Math.ceil((date - today) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { class: 'driver-warn-red', days: diffDays, level: 'red' };
    if (diffDays <= 3) return { class: 'driver-warn-red', days: diffDays, level: 'red' };
    if (diffDays <= 21) return { class: 'driver-warn-orange', days: diffDays, level: 'orange' };
    return { class: '', days: diffDays, level: '' };
  }
  
  function syncDriverHeaderUserName() {
      const nameEl = document.getElementById('main-header-user-name');
      if (!nameEl) return;
      const displayName = (currentUser && String(currentUser.name || currentUser.isim || currentUser.ad_soyad || '').trim()) || '';
      nameEl.textContent = displayName;
      nameEl.classList.toggle('is-empty', displayName === '');
  }

  function renderLeftPanel(vehicles, records) {
      const vehicle = getSelectedVehicle();
      if (!vehicle) return;
      
      const plakaEl = document.getElementById('driver-current-plaka');
      if (plakaEl) plakaEl.textContent = formatDriverPlaka(vehicle.plaka);
      const subtitleEl = document.getElementById('driver-plate-subtitle');
      if (subtitleEl) subtitleEl.textContent = (typeof window.formatBrandModel === 'function' ? window.formatBrandModel : (typeof window.toTitleCase === 'function' ? window.toTitleCase : function(x){ return x; }))(vehicle.brandModel || [vehicle.marka, vehicle.model].filter(Boolean).join(' ') || '') || '';
      
      const existingRecord = getExistingRecord(vehicle.id);
      const kmVal = vehicle.guncelKm || (existingRecord && existingRecord.guncel_km) || '-';
      const kmFormatted = (kmVal !== '-' && kmVal != null) ? String(kmVal).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '-';
      const kmState = getVehicleKmState(vehicle);
      const kmClass = getKmInfoClassByState(kmState);
      
      const sigortaW = checkDateWarningsDriver(vehicle.sigortaDate);
      const kaskoW = checkDateWarningsDriver(vehicle.kaskoDate);
      const muayeneW = checkDateWarningsDriver(vehicle.muayeneDate);
      const egzozMuayeneDate = vehicle.egzozMuayeneDate || '';
      const hasEgzozMuayeneSaved = !!(egzozMuayeneDate && String(egzozMuayeneDate).trim());
      const egzozW = checkDateWarningsDriver(hasEgzozMuayeneSaved ? egzozMuayeneDate : '');
      
      const anahtarLabel = (vehicle.anahtar === 'var')
          ? ((vehicle.anahtarNerede && String(vehicle.anahtarNerede).trim()) ? capitalizeWords(String(vehicle.anahtarNerede).trim()) : 'Var')
          : 'Yoktur.';
      const lastikLabel = (vehicle.lastikDurumu === 'var')
          ? ((vehicle.lastikAdres && String(vehicle.lastikAdres).trim()) ? capitalizeWords(String(vehicle.lastikAdres).trim()) : 'Var')
          : 'Yoktur.';
      const uttsLabel = vehicle.uttsTanimlandi ? 'Evet' : 'Hayır';
      const sigortaSaved = !!(vehicle.sigortaDate && vehicle.sigortaDate.trim());
      const kaskoSaved = !!(vehicle.kaskoDate && vehicle.kaskoDate.trim());
      const muayeneSaved = !!(vehicle.muayeneDate && vehicle.muayeneDate.trim());
      const uttsSaved = vehicle.uttsTanimlandi === true || vehicle.uttsTanimlandi === false;
      /* Yeşil (saved) sadece bu oturumda bildirim yapıldıysa; pencere kapanınca lastCompletedActionInSession temizlenir, orijinal görünüme döner */
      const vid = String(vehicle.id);
      const sessionMatch = (action) => lastCompletedActionInSession && lastCompletedActionInSession.action === action && String(lastCompletedActionInSession.vehicleId) === vid;
      const kmSavedClass = sessionMatch('km') ? 'saved' : '';
      const anahtarSavedClass = sessionMatch('anahtar') ? 'saved' : '';
      const lastikSavedClass = sessionMatch('lastik') ? 'saved' : '';
  
      const infoEl = document.getElementById('driver-vehicle-info');
      if (infoEl) {
          infoEl.innerHTML = `
              <div class="driver-info-item"><span class="label">Şube</span><span class="value">${escapeHtmlDriver((vehicle.branchName != null && String(vehicle.branchName).trim()) ? capitalizeWords(String(vehicle.branchName).trim()) : '-')}</span></div>
              <div class="driver-info-item"><span class="label">Üretim Yılı</span><span class="value">${escapeHtmlDriver(vehicle.year || '-')}</span></div>
              <div class="driver-info-item ${kmSavedClass} ${kmClass}"><span class="label">KM</span><span class="value">${escapeHtmlDriver(kmFormatted)}</span></div>
              <div class="driver-info-item ${sigortaW.class}"><span class="label">Sigorta Bitiş</span><span class="value">${formatDriverDate(vehicle.sigortaDate) || '-'}</span></div>
              <div class="driver-info-item ${kaskoW.class}"><span class="label">Kasko Bitiş</span><span class="value">${formatDriverDate(vehicle.kaskoDate) || '-'}</span></div>
              <div class="driver-info-item ${muayeneW.class}"><span class="label">Muayene Bitiş</span><span class="value">${formatDriverDate(vehicle.muayeneDate) || '-'}</span></div>
              ${hasEgzozMuayeneSaved ? `<div class="driver-info-item ${egzozW.class}"><span class="label">Egzoz Muayene Bitiş</span><span class="value">${formatDriverDate(egzozMuayeneDate) || '-'}</span></div>` : ''}
              <div class="driver-info-item ${anahtarSavedClass}"><span class="label">Yedek Anahtar</span><span class="value">${escapeHtmlDriver(anahtarLabel)}</span></div>
              <div class="driver-info-item ${lastikSavedClass}"><span class="label">Lastik Durumu</span><span class="value">${escapeHtmlDriver(lastikLabel)}</span></div>
              <div class="driver-info-item"><span class="label">UTTS</span><span class="value">${escapeHtmlDriver(uttsLabel)}</span></div>
          `;
          infoEl.querySelectorAll('.driver-info-item .value').forEach(function(valueEl) {
              var txt = (valueEl.textContent || '').trim();
              if (txt !== '-') return;
              valueEl.classList.add('driver-value-pending');
              valueEl.innerHTML = '<span class="driver-pending-indicator" title="Bekleniyor" aria-label="Bekleniyor"></span>';
          });
      }
  }
  
  function escapeHtmlDriver(t) {
    if (t == null || t === '') return '';
    var d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
  }
  
  var _plateCloseBound = false;

  function positionPlateDropdownToTrigger(dropdown, trigger) {
      if (!dropdown || !trigger) return;
      const row = trigger.closest('.driver-plate-dropdown-row');
      if (!row) return;

      if (window.innerWidth <= 640) {
          const rowRect = row.getBoundingClientRect();
          const viewportPadding = 8;
          const desiredWidth = Math.floor(window.innerWidth * 0.8);
          const availableRightWidth = Math.floor(window.innerWidth - rowRect.left - viewportPadding);
          const targetWidth = Math.max(180, Math.min(desiredWidth, availableRightWidth));
          dropdown.style.setProperty('position', 'fixed', 'important');
          dropdown.style.setProperty('top', `${Math.round(rowRect.bottom + 2)}px`, 'important');
          dropdown.style.setProperty('left', `${Math.round(rowRect.left)}px`, 'important');
          dropdown.style.setProperty('right', 'auto', 'important');
          dropdown.style.setProperty('transform', 'none', 'important');
          dropdown.style.setProperty('width', `${targetWidth}px`, 'important');
          dropdown.style.setProperty('max-width', `${targetWidth}px`, 'important');
    } else {
        const rowRect = row.getBoundingClientRect();
        const dashboard = document.querySelector('.driver-dashboard-container');
        const dashboardRect = dashboard ? dashboard.getBoundingClientRect() : null;
        const viewportPadding = 16;
        const containerPadding = 12;
        const viewportMaxWidth = Math.max(220, Math.floor(window.innerWidth - (viewportPadding * 2)));
        const containerMaxWidth = dashboardRect
            ? Math.max(220, Math.floor(dashboardRect.width - (containerPadding * 2)))
            : viewportMaxWidth;
        const halfContainerWidth = Math.max(220, Math.floor(containerMaxWidth * 0.5));
        const targetWidth = Math.min(420, viewportMaxWidth, containerMaxWidth, halfContainerWidth);
        const minLeft = dashboardRect ? Math.round(dashboardRect.left + containerPadding) : viewportPadding;
        const maxLeft = dashboardRect
            ? Math.round(dashboardRect.right - targetWidth - containerPadding)
            : Math.round(window.innerWidth - targetWidth - viewportPadding);
        const targetLeft = Math.max(minLeft, Math.min(Math.round(rowRect.left), maxLeft));

        dropdown.style.setProperty('position', 'fixed', 'important');
        dropdown.style.setProperty('top', `${Math.round(rowRect.bottom + 4)}px`, 'important');
        dropdown.style.setProperty('left', `${targetLeft}px`, 'important');
        dropdown.style.setProperty('right', 'auto', 'important');
        dropdown.style.setProperty('transform', 'none', 'important');
        dropdown.style.setProperty('width', `${targetWidth}px`, 'important');
        dropdown.style.setProperty('max-width', `${targetWidth}px`, 'important');
    }
}

  function setupPlateDropdown(vehicles) {
      const dropdown = document.getElementById('driver-plate-dropdown');
      const currentPlakaEl = document.getElementById('driver-current-plaka');
      const trigger = document.getElementById('driver-plate-trigger');
      if (!dropdown || !currentPlakaEl || !trigger) return;
      
      if (!_plateCloseBound) {
          _plateCloseBound = true;
          document.addEventListener('click', function(ev) {
              if (!ev.target.closest('.driver-plate-dropdown-row')) {
                  const d = document.getElementById('driver-plate-dropdown');
                  if (d) d.style.display = 'none';
              }
          });
      }
      
      dropdown.innerHTML = vehicles.map(v => {
          const raw = v.brandModel || [v.marka, v.model].filter(Boolean).join(' ');
          const brandModel = (typeof window.formatBrandModel === 'function' ? window.formatBrandModel : (typeof window.toTitleCase === 'function' ? window.toTitleCase : function(x){ return x; }))(raw || '') || '';
          const plate = escapeHtmlDriver(formatDriverPlaka(v.plaka));
          const brandModelHtml = escapeHtmlDriver(brandModel);
          const hasBrandModel = !!brandModel;
          return `
              <div class="driver-plate-dropdown-item" role="option" data-vehicle-id="${v.id}" tabindex="0">
                  <span class="driver-plate-dropdown-item-plate">${plate}</span>
                  <span class="driver-plate-dropdown-item-separator${hasBrandModel ? '' : ' is-hidden'}" aria-hidden="true">-</span>
                  <span class="driver-plate-dropdown-item-brand">${brandModelHtml}</span>
              </div>`;
      }).join('');
      
      dropdown.querySelectorAll('.driver-plate-dropdown-item').forEach(item => {
          item.addEventListener('click', function(ev) {
              ev.preventDefault();
              ev.stopPropagation();
              const vid = this.getAttribute('data-vehicle-id');
              if (vid == null || vid === '') return;
              selectedVehicleId = vid;
              const sel = getSelectedVehicle();
              if (sel) currentPlakaEl.textContent = formatDriverPlaka(sel.plaka);
              dropdown.style.display = 'none';
              loadDashboard();
          });
      });
      
      trigger.onclick = function(ev) {
          ev.stopPropagation();
          const isOpen = dropdown.style.display === 'block';
          dropdown.style.display = isOpen ? 'none' : 'block';
          if (!isOpen) positionPlateDropdownToTrigger(dropdown, trigger);
      };
  }
  
  function renderRightPanel(vehicles, records) {
      const vehicle = getSelectedVehicle();
      if (!vehicle) return;
      
      const areaEl = document.getElementById('driver-action-area');
      if (!areaEl) return;
      
      const vid = String(vehicle.id);
      const existingRecord = getExistingRecord(vehicle.id);
      const bakimVar = existingRecord && (existingRecord.bakim_durumu || (existingRecord.bakim_aciklama || '').trim());
      const kazaVar = existingRecord && (existingRecord.kaza_durumu || (existingRecord.kaza_aciklama || '').trim());
      const kmState = getVehicleKmState(vehicle);
      const hasKmSaved = !isKmStateWarning(kmState);
      const sigortaW = checkDateWarningsDriver(vehicle.sigortaDate);
      const kaskoW = checkDateWarningsDriver(vehicle.kaskoDate);
      const muayeneW = checkDateWarningsDriver(vehicle.muayeneDate);
      const sigortaSaved = !!(vehicle.sigortaDate && vehicle.sigortaDate.trim());
      const kaskoSaved = !!(vehicle.kaskoDate && vehicle.kaskoDate.trim());
      const muayeneSaved = !!(vehicle.muayeneDate && vehicle.muayeneDate.trim());
      const anahtarSaved = !!(vehicle.anahtar && String(vehicle.anahtar).trim());
      const lastikSaved = !!(vehicle.lastikDurumu && String(vehicle.lastikDurumu).trim());
      const sessionMatch = (action) => lastCompletedActionInSession && lastCompletedActionInSession.action === action && String(lastCompletedActionInSession.vehicleId) === vid;
      const kmBtnClass = sessionMatch('km') ? ' saved' : (isKmStateWarning(kmState) ? ' warning' : (hasKmSaved ? ' data-entered' : ''));
      const kazaBtnClass = sessionMatch('kaza') ? ' saved' : (kazaVar ? ' data-entered' : '');
      const bakimBtnClass = sessionMatch('bakim') ? ' saved' : (bakimVar ? ' data-entered' : '');
      const sigortaBtnClass = sessionMatch('sigorta') ? ' saved' : (sigortaW.class ? (' warning' + (sigortaW.level === 'orange' ? ' warning-orange' : '')) : (sigortaSaved ? ' data-entered' : ''));
      const kaskoBtnClass = sessionMatch('kasko') ? ' saved' : (kaskoW.class ? (' warning' + (kaskoW.level === 'orange' ? ' warning-orange' : '')) : (kaskoSaved ? ' data-entered' : ''));
      const muayeneBtnClass = sessionMatch('muayene') ? ' saved' : (muayeneW.class ? (' warning' + (muayeneW.level === 'orange' ? ' warning-orange' : '')) : (muayeneSaved ? ' data-entered' : ''));
      const anahtarBtnClass = sessionMatch('anahtar') ? ' saved' : (anahtarSaved ? ' data-entered' : '');
      const lastikBtnClass = sessionMatch('lastik') ? ' saved' : (lastikSaved ? ' data-entered' : '');
  
      areaEl.innerHTML = buildDriverActionArea(vehicle, existingRecord, bakimVar, kazaVar, {
          kmBtnClass, kazaBtnClass, bakimBtnClass, sigortaBtnClass, kaskoBtnClass, muayeneBtnClass, anahtarBtnClass, lastikBtnClass, vid
      });
      initDriverDateDisplays(areaEl);

      const kaportaContainer = document.getElementById('kaza-kaporta-' + vid);
      if (kaportaContainer && vehicle) {
          initKaportaForDriver(kaportaContainer, vehicle);
      }
  }
  
  function buildDriverActionArea(vehicle, existingRecord, bakimVar, kazaVar, opts) {
      const vid = String(opts.vid != null ? opts.vid : (vehicle && vehicle.id != null ? vehicle.id : ''));
      const today = new Date().toISOString().split('T')[0];
      const esc = (s) => (s == null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'));
      var boyaliJson = '{}';
      try {
          var bp = vehicle && (vehicle.boyaliParcalar || {});
          if (bp && typeof bp === 'object' && !Array.isArray(bp)) boyaliJson = JSON.stringify(bp);
      } catch (e) { boyaliJson = '{}'; }
      /* Son güncellenen km: taşıt guncelKm (kayıt sonrası) veya mevcut dönem kaydı - binlik ayırıcı ile */
      const lastKm = vehicle && (vehicle.guncelKm != null ? vehicle.guncelKm : (existingRecord && existingRecord.guncel_km != null ? existingRecord.guncel_km : ''));
      const kmVal = (lastKm !== '' && lastKm != null) ? esc(formatKm(lastKm)) : '';
      const bakimTarih = existingRecord && existingRecord.bakim_tarih ? existingRecord.bakim_tarih : today;
      const kazaTarih = existingRecord && existingRecord.kaza_tarih ? existingRecord.kaza_tarih : today;
      const bakimAciklama = existingRecord ? esc(capitalizeWords(existingRecord.bakim_aciklama || '')) : '';
      const kazaAciklama = existingRecord ? esc(capitalizeWords(existingRecord.kaza_aciklama || '')) : '';
      const kmBtnClass = opts.kmBtnClass || '';
      const kazaBtnClass = opts.kazaBtnClass || '';
      const bakimBtnClass = opts.bakimBtnClass || '';
      const sigortaBtnClass = opts.sigortaBtnClass || '';
      const kaskoBtnClass = opts.kaskoBtnClass || '';
      const muayeneBtnClass = opts.muayeneBtnClass || '';
      const anahtarBtnClass = opts.anahtarBtnClass || '';
      const lastikBtnClass = opts.lastikBtnClass || '';
      return `
          <div class="driver-action-area-inner" data-vehicle-id="${vid}">
              <div class="driver-action-group">
                  <button type="button" class="driver-action-btn${kmBtnClass}" data-action="km" onclick="toggleDriverActionBlock('km','${vid}')">Km Bildir</button>
                  <div id="km-block-${vid}" class="driver-input-form driver-km-form-wrap driver-action-block">
                      <div class="driver-km-form-content">
                          <div class="form-group driver-km-form">
                              <label for="km-${vid}">Güncel KM</label>
                              <div class="driver-km-input-wrap">
                                  <span class="driver-km-fake-placeholder" id="km-placeholder-${vid}">Örn: 45.230</span>
                                  <input type="text" id="km-${vid}" class="driver-km-input" inputmode="numeric" pattern="[0-9]*" maxlength="8" data-vehicle-id="${vid}" value="${kmVal}" required autocomplete="off" aria-label="Güncel kilometre" onfocus="this.select()">
                              </div>
                          </div>
                          <div class="universal-btn-group">
                              <button type="button" class="universal-btn-save" onclick="submitKmOnly('${vid}')">Bildir</button>
                              <button type="button" class="universal-btn-cancel" onclick="cancelKmForm('${vid}')">Vazgeç</button>
                          </div>
                      </div>
                      <div class="driver-km-success-msg" id="km-success-${vid}">Bildirildi</div>
                      <div class="driver-km-error" id="km-error-${vid}"></div>
                  </div>
              </div>
              <div class="driver-action-group">
                  <button type="button" class="driver-action-btn${kazaBtnClass}" data-action="kaza" onclick="toggleDriverActionBlock('kaza','${vid}')">Kaza Bildir</button>
                  <div id="kaza-block-${vid}" class="driver-report-block driver-report-block-kaza driver-action-block">
                      <div class="form-group"><label for="kaza-tarih-${vid}">Kaza Tarihi</label><div class="driver-date-wrap"><input type="date" id="kaza-tarih-${vid}" class="driver-kaza-input" value="${kazaTarih}"></div></div>
                      <div class="form-group"><label for="kaza-detay-${vid}">Açıklama</label><textarea id="kaza-detay-${vid}" class="driver-report-textarea-auto driver-kaza-textarea" rows="1" placeholder="Kaza açıklamasını yazın..." maxlength="500">${kazaAciklama}</textarea></div>
                      <div class="form-group"><label for="kaza-tutar-${vid}">Hasar Tutarı (TL)</label><input type="text" id="kaza-tutar-${vid}" class="driver-kaza-input" placeholder="5.000" inputmode="numeric"></div>
                      <div class="form-group" role="group" aria-labelledby="kaza-kaporta-label-${vid}"><span id="kaza-kaporta-label-${vid}" class="driver-kaporta-label">Varsa Boyanan/ Değişen Parçaları İşaretleyin</span><div id="kaza-kaporta-${vid}" class="driver-kaporta-container" data-vehicle-id="${vid}" data-boyali-parcalar='${boyaliJson}'></div></div>
                      <div class="universal-btn-group">
                          <button type="button" class="universal-btn-save" onclick="submitDriverAction('kaza','${vid}')">Bildir</button>
                          <button type="button" class="universal-btn-cancel" onclick="cancelDriverActionForm('kaza','${vid}')">Vazgeç</button>
                      </div>
                      <div class="driver-success-msg" id="kaza-success-${vid}">Bildirildi</div>
                  </div>
              </div>
              <div class="driver-action-group">
                  <button type="button" class="driver-action-btn${bakimBtnClass}" data-action="bakim" onclick="toggleDriverActionBlock('bakim','${vid}')">Bakım Bildir</button>
                  <div id="bakim-block-${vid}" class="driver-report-block driver-report-block-bakim driver-action-block">
                      <div class="form-group"><label for="bakim-tarih-${vid}">Bakım Tarihi</label><div class="driver-date-wrap"><input type="date" id="bakim-tarih-${vid}" class="driver-bakim-input" value="${bakimTarih}"></div></div>
                      <div class="form-group"><label for="bakim-servis-${vid}">İşlemi Yapan Servis</label><input type="text" id="bakim-servis-${vid}" class="driver-bakim-input" placeholder="Servis Adı"></div>
                      <div class="form-group"><label for="bakim-km-${vid}">Bakım Km</label><input type="text" id="bakim-km-${vid}" class="driver-bakim-input" placeholder="50.000" inputmode="numeric"></div>
                      <div class="form-group"><label for="bakim-tutar-${vid}">Tutar (TL)</label><input type="text" id="bakim-tutar-${vid}" class="driver-bakim-input" placeholder="2.500" inputmode="numeric"></div>
                      <div class="form-group"><label for="bakim-detay-${vid}">Yapılan İşlem/İşlemler</label><textarea id="bakim-detay-${vid}" class="driver-report-textarea-auto driver-bakim-textarea" rows="1" placeholder="Yapılan işlemleri yazın..." maxlength="500">${bakimAciklama}</textarea></div>
                      <div class="universal-btn-group">
                          <button type="button" class="universal-btn-save" onclick="submitDriverAction('bakim','${vid}')">Bildir</button>
                          <button type="button" class="universal-btn-cancel" onclick="cancelDriverActionForm('bakim','${vid}')">Vazgeç</button>
                      </div>
                      <div class="driver-success-msg" id="bakim-success-${vid}">Bildirildi</div>
                  </div>
              </div>
              <div class="driver-action-group">
                  <button type="button" class="driver-action-btn${sigortaBtnClass}" data-action="sigorta" onclick="toggleDriverActionBlock('sigorta','${vid}')">Trafik Sigortası Yenileme</button>
                  <div id="sigorta-block-${vid}" class="driver-report-block driver-report-block-sigorta driver-action-block">
                      <div class="form-group"><label for="driver-sigorta-tarih-${vid}">Yenileme / Başlangıç Tarihi</label><div class="driver-date-wrap"><input type="date" id="driver-sigorta-tarih-${vid}" class="form-input" style="width:100%"></div></div>
                      <div class="form-group"><label for="driver-sigorta-firma-${vid}">Firma (isteğe bağlı)</label><input type="text" id="driver-sigorta-firma-${vid}" class="form-input" placeholder="Sigorta Firması" style="width:100%"></div>
                      <div class="form-group"><label for="driver-sigorta-acente-${vid}">Acente (isteğe bağlı)</label><input type="text" id="driver-sigorta-acente-${vid}" class="form-input" placeholder="Acente Adı" style="width:100%"></div>
                      <div class="form-group"><label for="driver-sigorta-iletisim-${vid}">İletişim (isteğe bağlı)</label><input type="text" id="driver-sigorta-iletisim-${vid}" class="form-input" placeholder="Telefon / E-posta" inputmode="tel" style="width:100%"></div>
                      <div class="universal-btn-group">
                          <button type="button" class="universal-btn-save" onclick="saveDriverEventFromBlock('sigorta','${vid}')">Bildir</button>
                          <button type="button" class="universal-btn-cancel" onclick="cancelDriverActionForm('sigorta','${vid}')">Vazgeç</button>
                      </div>
                  </div>
              </div>
              <div class="driver-action-group">
                  <button type="button" class="driver-action-btn${kaskoBtnClass}" data-action="kasko" onclick="toggleDriverActionBlock('kasko','${vid}')">Kasko Yenileme</button>
                  <div id="kasko-block-${vid}" class="driver-report-block driver-report-block-kasko driver-action-block">
                      <div class="form-group"><label for="driver-kasko-tarih-${vid}">Yenileme / Başlangıç Tarihi</label><div class="driver-date-wrap"><input type="date" id="driver-kasko-tarih-${vid}" class="form-input" style="width:100%"></div></div>
                      <div class="form-group"><label for="driver-kasko-firma-${vid}">Firma (isteğe bağlı)</label><input type="text" id="driver-kasko-firma-${vid}" class="form-input" placeholder="Kasko Firması" style="width:100%"></div>
                      <div class="form-group"><label for="driver-kasko-acente-${vid}">Acente (isteğe bağlı)</label><input type="text" id="driver-kasko-acente-${vid}" class="form-input" placeholder="Acente Adı" style="width:100%"></div>
                      <div class="form-group"><label for="driver-kasko-iletisim-${vid}">İletişim (isteğe bağlı)</label><input type="text" id="driver-kasko-iletisim-${vid}" class="form-input" placeholder="Telefon / E-posta" inputmode="tel" style="width:100%"></div>
                      <div class="universal-btn-group">
                          <button type="button" class="universal-btn-save" onclick="saveDriverEventFromBlock('kasko','${vid}')">Bildir</button>
                          <button type="button" class="universal-btn-cancel" onclick="cancelDriverActionForm('kasko','${vid}')">Vazgeç</button>
                      </div>
                  </div>
              </div>
              <div class="driver-action-group">
                  <button type="button" class="driver-action-btn${muayeneBtnClass}" data-action="muayene" onclick="toggleDriverActionBlock('muayene','${vid}')">Muayene Yenileme</button>
                  <div id="muayene-block-${vid}" class="driver-report-block driver-report-block-muayene driver-action-block">
                      <div class="form-group"><label for="driver-muayene-tarih-${vid}">Muayene Tarihi</label><div class="driver-date-wrap"><input type="date" id="driver-muayene-tarih-${vid}" class="form-input" style="width:100%"></div></div>
                      <label class="driver-egzoz-muayene-check" for="driver-muayene-egzoz-different-${vid}">
                          <input type="checkbox" id="driver-muayene-egzoz-different-${vid}" onchange="syncDriverEgzozMuayeneFields('${vid}')">
                          <span>Egzoz Muayenesi Farklı Tarih İse İşaretleyin..</span>
                      </label>
                      <div id="driver-muayene-egzoz-date-wrap-${vid}" class="form-group driver-egzoz-date-wrap">
                          <label for="driver-muayene-egzoz-tarih-${vid}">Egzoz Muayene Tarihi</label>
                          <div class="driver-date-wrap"><input type="date" id="driver-muayene-egzoz-tarih-${vid}" class="form-input" style="width:100%" disabled></div>
                      </div>
                      <div class="universal-btn-group">
                          <button type="button" class="universal-btn-save" onclick="saveDriverEventFromBlock('muayene','${vid}')">Bildir</button>
                          <button type="button" class="universal-btn-cancel" onclick="cancelDriverActionForm('muayene','${vid}')">Vazgeç</button>
                      </div>
                  </div>
              </div>
              <div class="driver-action-group">
                  <button type="button" class="driver-action-btn${anahtarBtnClass}" data-action="anahtar" onclick="toggleDriverActionBlock('anahtar','${vid}')">Anahtar Durumu Bildir</button>
                  <div id="anahtar-block-${vid}" class="driver-report-block driver-report-block-anahtar driver-action-block">
                      <div class="form-group driver-radio-row" role="group" aria-labelledby="anahtar-durum-label-${vid}">
                          <span id="anahtar-durum-label-${vid}" class="driver-radio-label driver-radio-label-multiline">Yedek Anahtar</span>
                          <div class="driver-radio-group" data-group="anahtar" data-vid="${vid}">
                              <button type="button" class="driver-radio-btn" data-value="var" data-group="anahtar">Var</button>
                              <button type="button" class="driver-radio-btn" data-value="yok" data-group="anahtar">Yok</button>
                          </div>
                      </div>
                      <div id="driver-anahtar-detay-wrap-${vid}" class="form-group" style="display:none">
                          <label for="driver-anahtar-detay-${vid}" style="color:#ccc;font-size:15px;">Açıklama:</label>
                          <input type="text" id="driver-anahtar-detay-${vid}" class="form-input" placeholder="Anahtar nerede?" style="width:100%">
                      </div>
                      <div class="universal-btn-group">
                          <button type="button" class="universal-btn-save" onclick="saveDriverEventFromBlock('anahtar','${vid}')">Bildir</button>
                          <button type="button" class="universal-btn-cancel" onclick="cancelDriverActionForm('anahtar','${vid}')">Vazgeç</button>
                      </div>
                  </div>
              </div>
              <div class="driver-action-group">
                  <button type="button" class="driver-action-btn${lastikBtnClass}" data-action="lastik" onclick="toggleDriverActionBlock('lastik','${vid}')">Lastik Durumu Bildir</button>
                  <div id="lastik-block-${vid}" class="driver-report-block driver-report-block-lastik driver-action-block">
                      <div class="form-group driver-radio-row" role="group" aria-labelledby="lastik-durum-label-${vid}">
                          <span id="lastik-durum-label-${vid}" class="driver-radio-label driver-radio-label-multiline">Yazlık/ Kışlık</span>
                          <div class="driver-radio-group" data-group="lastik" data-vid="${vid}">
                              <button type="button" class="driver-radio-btn" data-value="var" data-group="lastik">Var</button>
                              <button type="button" class="driver-radio-btn" data-value="yok" data-group="lastik">Yok</button>
                          </div>
                      </div>
                      <div id="driver-lastik-adres-wrap-${vid}" class="form-group" style="display:none">
                          <label for="driver-lastik-adres-${vid}" style="color:#ccc;font-size:15px;">Adres:</label>
                          <input type="text" id="driver-lastik-adres-${vid}" class="form-input" placeholder="Lastik adresi" style="width:100%">
                      </div>
                      <div class="universal-btn-group">
                          <button type="button" class="universal-btn-save" onclick="saveDriverEventFromBlock('lastik','${vid}')">Bildir</button>
                          <button type="button" class="universal-btn-cancel" onclick="cancelDriverActionForm('lastik','${vid}')">Vazgeç</button>
                      </div>
                  </div>
              </div>
              <div class="driver-action-group driver-action-footer"><button type="button" onclick="saveVehicleData('${vid}')" class="universal-btn-save" id="btn-save-${vid}">Bildir</button><div id="status-${vid}" class="status-message"></div></div>
              <div class="driver-action-group driver-action-feedback-slot driver-request-fab-row"><button type="button" class="driver-action-btn-feedback driver-request-fab" onclick="openDriverFeedbackModal()" aria-label="Talep, şikayet veya öneri gönder"><svg class="driver-action-btn-feedback-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.05" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h14a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-2.8L18 21l-5-3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z"></path><line x1="7" y1="9" x2="17" y2="9"></line><line x1="7" y1="13" x2="14" y2="13"></line></svg><span class="driver-request-fab-label">Talep Gönder</span></button></div>
          </div>
      `;
  }
  
  window.toggleDriverActionBlock = function(type, vehicleId) {
      const vid = String(vehicleId);
      const inner = document.querySelector('.driver-action-area-inner[data-vehicle-id="' + vid + '"]');
      if (!inner) return;
      const blocks = {
          km: inner.querySelector('#km-block-' + vid),
          kaza: document.getElementById('kaza-block-' + vid),
          bakim: document.getElementById('bakim-block-' + vid),
          sigorta: document.getElementById('sigorta-block-' + vid),
          kasko: document.getElementById('kasko-block-' + vid),
          muayene: document.getElementById('muayene-block-' + vid),
          anahtar: document.getElementById('anahtar-block-' + vid),
          lastik: document.getElementById('lastik-block-' + vid)
      };
      const target = blocks[type];
      if (!target) return;
      const isShown = target.classList.contains('show');
      inner.classList.remove('driver-km-open');
      document.body.classList.remove('driver-action-block-open');
      inner.querySelectorAll('.driver-action-block').forEach(function(b) { if (b) b.classList.remove('show'); });
      if (!isShown) {
          target.classList.add('show');
          var expandTypes = ['km', 'kaza', 'bakim', 'sigorta', 'kasko', 'muayene', 'anahtar', 'lastik'];
          if (expandTypes.indexOf(type) !== -1) {
              inner.classList.add('driver-km-open');
              document.body.classList.add('driver-action-block-open');
          }
          if (type === 'kaza') {
              const dateEl = document.getElementById('kaza-tarih-' + vid);
              if (dateEl && !dateEl.value) { dateEl.value = new Date().toISOString().split('T')[0]; syncDriverDateDisplay(dateEl); }
              const container = document.getElementById('kaza-kaporta-' + vid);
              if (container && !container.querySelector('svg')) {
                  let boyaliParcalar = {};
                  try { const raw = container.getAttribute('data-boyali-parcalar'); if (raw) boyaliParcalar = JSON.parse(raw); } catch (e) {}
                  initDriverKaporta(vid, boyaliParcalar);
              }
              var kazaTa = document.getElementById('kaza-detay-' + vid);
              if (kazaTa && kazaTa.classList.contains('driver-report-textarea-auto')) {
                  requestAnimationFrame(function() {
                      kazaTa.style.height = 'auto';
                      kazaTa.style.height = kazaTa.scrollHeight + 'px';
                  });
              }
          }
          if (type === 'bakim') {
              const dateEl = document.getElementById('bakim-tarih-' + vid);
              if (dateEl && !dateEl.value) { dateEl.value = new Date().toISOString().split('T')[0]; syncDriverDateDisplay(dateEl); }
              var bakimTa = document.getElementById('bakim-detay-' + vid);
              if (bakimTa && bakimTa.classList.contains('driver-report-textarea-auto')) {
                  requestAnimationFrame(function() {
                      bakimTa.style.height = 'auto';
                      bakimTa.style.height = bakimTa.scrollHeight + 'px';
                  });
              }
          }
          if (type === 'sigorta' || type === 'kasko' || type === 'muayene') {
              var dateId = type === 'muayene' ? 'driver-muayene-tarih' : (type === 'sigorta' ? 'driver-sigorta-tarih' : 'driver-kasko-tarih');
              var dateEl = document.getElementById(dateId + '-' + vid);
              if (dateEl && !dateEl.value) { dateEl.value = new Date().toISOString().split('T')[0]; syncDriverDateDisplay(dateEl); }
              if (type === 'muayene') window.syncDriverEgzozMuayeneFields(vid);
          }
          if (type === 'anahtar' || type === 'lastik') {
              setupDriverEventRadioHandlersForBlock(type, vid);
          }
          if (type === 'km') {
              setTimeout(function() {
                  const inp = document.getElementById('km-' + vid);
                  if (inp) inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 50);
          } else {
              var group = target.closest('.driver-action-group');
              (group || target).scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
      }
  };
  
  window.focusKmInput = function(vehicleId) {
      toggleDriverActionBlock('km', vehicleId);
  };
  
  window.cancelKmForm = function(vid) {
      cancelDriverActionForm('km', vid);
  };
  
  window.cancelDriverActionForm = function(type, vid) {
      const inner = document.querySelector('.driver-action-area-inner[data-vehicle-id="' + vid + '"]');
      const blockIds = { km: 'km-block-', kaza: 'kaza-block-', bakim: 'bakim-block-', sigorta: 'sigorta-block-', kasko: 'kasko-block-', muayene: 'muayene-block-', anahtar: 'anahtar-block-', lastik: 'lastik-block-' };
      const blockId = (blockIds[type] || '') + vid;
      const block = document.getElementById(blockId);
      if (block) block.classList.remove('show');
      if (inner) {
          var anyOpen = inner.querySelectorAll('.driver-action-block.show').length > 0;
          if (!anyOpen) {
              inner.classList.remove('driver-km-open');
              document.body.classList.remove('driver-action-block-open');
          }
      }
  };
  
  window.submitDriverAction = async function(type, vid) {
      if (!ensureDriverOnlineForWrite()) return;
      if (type === 'km') {
          submitKmOnly(vid);
          return;
      }
      var guncelKmEl = document.getElementById('km-' + vid);
      var guncelKm = guncelKmEl ? parseInt(String(guncelKmEl.value).replace(/\D/g, ''), 10) : 0;
      if (!guncelKm || guncelKm <= 0) {
          var rec = getExistingRecord(vid);
          if (rec != null && rec.guncel_km != null) guncelKm = parseInt(String(rec.guncel_km).replace(/\D/g, ''), 10);
      }
      if (!guncelKm || guncelKm <= 0) {
          alert('Lütfen geçerli bir KM değeri girin (Km alanı veya mevcut kayıt).');
          if (guncelKmEl) guncelKmEl.focus();
          return;
      }
      var btnBildir, btnVazgec, formActions, successMsg;
      if (type === 'kaza') {
          var kazaAciklama = (document.getElementById('kaza-detay-' + vid) || {}).value.trim();
          if (!kazaAciklama) {
              alert('Kaza bildirimi için açıklama girin.');
              return;
          }
          btnBildir = document.querySelector('#kaza-block-' + vid + ' .universal-btn-save');
          btnVazgec = document.querySelector('#kaza-block-' + vid + ' .universal-btn-cancel');
          formActions = document.querySelector('#kaza-block-' + vid + ' .universal-btn-group');
          successMsg = document.getElementById('kaza-success-' + vid);
      } else {
          var bakimAciklama = (document.getElementById('bakim-detay-' + vid) || {}).value.trim();
          if (!bakimAciklama) {
              alert('Bakım bildirimi için açıklama girin.');
              return;
          }
          btnBildir = document.querySelector('#bakim-block-' + vid + ' .universal-btn-save');
          btnVazgec = document.querySelector('#bakim-block-' + vid + ' .universal-btn-cancel');
          formActions = document.querySelector('#bakim-block-' + vid + ' .universal-btn-group');
          successMsg = document.getElementById('bakim-success-' + vid);
      }
      if (btnBildir) btnBildir.disabled = true;
      if (btnVazgec) btnVazgec.disabled = true;
      var payload = {
          arac_id: parseInt(vid, 10),
          guncel_km: guncelKm,
          bakim_durumu: type === 'bakim' ? 1 : 0,
          bakim_aciklama: type === 'bakim' ? capitalizeWords((document.getElementById('bakim-detay-' + vid) || {}).value.trim()) : '',
          bakim_tarih: type === 'bakim' ? (document.getElementById('bakim-tarih-' + vid) || {}).value : '',
          bakim_servis: type === 'bakim' ? capitalizeWords(((document.getElementById('bakim-servis-' + vid) || {}).value || '').trim()) : '',
          bakim_kisi: type === 'bakim' ? capitalizeWords(((document.getElementById('bakim-kisi-' + vid) || {}).value || '').trim()) : '',
          bakim_km: type === 'bakim' ? ((document.getElementById('bakim-km-' + vid) || {}).value || '').trim() : '',
          bakim_tutar: type === 'bakim' ? ((document.getElementById('bakim-tutar-' + vid) || {}).value || '').trim() : '',
          kaza_durumu: type === 'kaza' ? 1 : 0,
          kaza_aciklama: type === 'kaza' ? capitalizeWords(document.getElementById('kaza-detay-' + vid).value.trim()) : '',
          kaza_tarih: type === 'kaza' ? (document.getElementById('kaza-tarih-' + vid).value || '') : '',
          kaza_hasar_tutari: type === 'kaza' ? ((document.getElementById('kaza-tutar-' + vid) || {}).value || '').trim() : '',
          boya_parcalar: '{}'
      };
      payload.vehicle_version = getVehicleVersionForRequest(vid);
      if (type === 'kaza') {
          var boyaParcalar = {};
          var kaportaContainer = document.getElementById('kaza-kaporta-' + vid);
          if (kaportaContainer) {
              kaportaContainer.querySelectorAll('svg path[id]').forEach(function(part) {
                  var partId = part.getAttribute('id');
                  if (partId === 'araba-govde') return;
                  var state = part.dataset.state;
                  if (state === 'boyali' || state === 'degisen') boyaParcalar[partId] = state;
              });
          }
          payload.boya_parcalar = JSON.stringify(boyaParcalar);
      }
      try {
          var response = await fetch(API_BASE + 'driver_save.php', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentToken },
              body: JSON.stringify(payload)
          });
          var data = await response.json();
          if (await handleDriverConflictResponse(data)) return;
          if (data.success) {
              applyVehicleVersionUpdate(vid, data.vehicleVersion);
              lastCompletedActionInSession = { action: type, vehicleId: vid };
              if (formActions) formActions.style.display = 'none';
              if (successMsg) successMsg.classList.add('show');
              const period = (currentPeriod || new Date().toISOString().slice(0, 7)).toString().trim();
              lastSuccessfulKmSubmissions[String(vid)] = period;
              allHistoryRecords = allHistoryRecords || [];
              allHistoryRecords.push({
                  arac_id: vid,
                  donem: period,
                  guncel_km: guncelKm,
                  kayit_tarihi: new Date().toISOString()
              });
              renderSlidingWarning(allHistoryVehicles || [], allHistoryRecords);
              setTimeout(function() { renderSlidingWarning(allHistoryVehicles || [], allHistoryRecords); }, 300);
              setTimeout(function() {
                  var block = document.getElementById((type === 'kaza' ? 'kaza-block-' : 'bakim-block-') + vid);
                  var inner = document.querySelector('.driver-action-area-inner[data-vehicle-id="' + vid + '"]');
                  if (block) block.classList.remove('show');
                  if (inner) {
                      inner.classList.remove('driver-km-open');
                      document.body.classList.remove('driver-action-block-open');
                  }
                  if (formActions) formActions.style.display = '';
                  if (successMsg) successMsg.classList.remove('show');
                  var actionBtn = inner ? inner.querySelector('.driver-action-btn[data-action="' + type + '"]') : null;
                  if (actionBtn) actionBtn.classList.add('saved');
                  loadDashboard();
              }, 4000);
          } else {
              alert(data.message || 'Kayıt yapılamadı.');
          }
      } catch (err) {
          console.error('Bildirim kaydetme hatası:', err);
          alert('Bağlantı hatası.');
      } finally {
          if (btnBildir) btnBildir.disabled = false;
          if (btnVazgec) btnVazgec.disabled = false;
      }
  };
  
  window.submitKmOnly = async function(vid) {
      if (!ensureDriverOnlineForWrite()) return;
      const kmEl = document.getElementById('km-' + vid);
      const km = kmEl ? parseInt(String(kmEl.value).replace(/\D/g, ''), 10) : 0;
      if (!km || km <= 0) {
          alert('Lütfen geçerli bir KM değeri girin!');
          if (kmEl) kmEl.focus();
          return;
      }
      var vehicle = allHistoryVehicles && allHistoryVehicles.find(function(v) { return String(v.id) === String(vid); });
      var rec = getExistingRecord(vid);
      var oncekiKm = (vehicle && (vehicle.guncelKm != null ? vehicle.guncelKm : '')) || (rec && rec.guncel_km != null ? rec.guncel_km : '');
      var oncekiKmNum = parseInt(String(oncekiKm).replace(/\D/g, ''), 10) || 0;
      if (oncekiKmNum > 0 && km < oncekiKmNum) {
          alert('Bildirilmek İstenen Km, Önceki Kayıtlarla Uyuşmamaktadır. Şirket Yetkilisi İle Görüşün');
          if (kmEl) kmEl.focus();
          return;
      }
      const btnBildir = document.querySelector('#km-block-' + vid + ' .universal-btn-save');
      const btnVazgec = document.querySelector('#km-block-' + vid + ' .universal-btn-cancel');
      const formContent = document.querySelector('#km-block-' + vid + ' .driver-km-form-content');
      const successMsg = document.getElementById('km-success-' + vid);
      const errorEl = document.getElementById('km-error-' + vid);
      if (errorEl) { errorEl.classList.remove('show'); errorEl.textContent = ''; }
      if (btnBildir) btnBildir.disabled = true;
      if (btnVazgec) btnVazgec.disabled = true;
      try {
          const response = await fetch(API_BASE + 'driver_save.php', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentToken },
              body: JSON.stringify({
                  arac_id: parseInt(vid, 10),
                  vehicle_version: getVehicleVersionForRequest(vid),
                  guncel_km: km,
                  km_only: true,
                  bakim_durumu: 0,
                  bakim_aciklama: '',
                  bakim_tarih: '',
                  bakim_servis: '',
                  bakim_kisi: '',
                  bakim_km: '',
                  bakim_tutar: '',
                  kaza_durumu: 0,
                  kaza_aciklama: '',
                  kaza_tarih: '',
                  kaza_hasar_tutari: '',
                  boya_parcalar: '{}'
              })
          });
          const data = await response.json();
          if (await handleDriverConflictResponse(data)) return;
          if (data.success) {
              applyVehicleVersionUpdate(vid, data.vehicleVersion);
              lastCompletedActionInSession = { action: 'km', vehicleId: vid };
              if (formContent) formContent.style.display = 'none';
              if (successMsg) successMsg.classList.add('show');
              const period = (currentPeriod || new Date().toISOString().slice(0, 7)).toString().trim();
              lastSuccessfulKmSubmissions[String(vid)] = period;
              allHistoryRecords = allHistoryRecords || [];
              allHistoryRecords.push({
                  arac_id: vid,
                  donem: period,
                  guncel_km: km,
                  kayit_tarihi: new Date().toISOString()
              });
              renderSlidingWarning(allHistoryVehicles || [], allHistoryRecords);
              setTimeout(function() { renderSlidingWarning(allHistoryVehicles || [], allHistoryRecords); }, 300);
              setTimeout(function() {
                  const block = document.getElementById('km-block-' + vid);
                  const inner = document.querySelector('.driver-action-area-inner[data-vehicle-id="' + vid + '"]');
                  if (block) block.classList.remove('show');
                  if (inner) {
                      inner.classList.remove('driver-km-open');
                      document.body.classList.remove('driver-action-block-open');
                  }
                  if (formContent) formContent.style.display = '';
                  if (successMsg) successMsg.classList.remove('show');
                  const kmBtn = inner ? inner.querySelector('.driver-action-btn[data-action="km"]') : null;
                  if (kmBtn) kmBtn.classList.add('saved');
                  loadDashboard();
              }, 4000);
          } else {
              if (errorEl) { errorEl.textContent = data.message || 'Kayıt yapılamadı.'; errorEl.classList.add('show'); }
          }
      } catch (err) {
          console.error('Km kaydetme hatası:', err);
          if (errorEl) { errorEl.textContent = 'Bağlantı hatası.'; errorEl.classList.add('show'); }
      } finally {
          if (btnBildir) btnBildir.disabled = false;
          if (btnVazgec) btnVazgec.disabled = false;
      }
  };
  
  function buildSlidingWarnings(vehicles, records) {
      const warnings = [];
      const period = (currentPeriod || new Date().toISOString().slice(0, 7)).toString().trim();
      const userName = (currentUser && (currentUser.name || currentUser.isim || currentUser.ad_soyad)) || 'Kullanıcı';
  
      for (const v of vehicles) {
          const vid = String(v.id);
          const plaka = formatDriverPlaka(v.plaka);
          const kmState = getVehicleKmState(v);
          const kmMessage = getKmMessageByState(kmState);
          if (kmMessage) {
              warnings.push({ text: plaka + ' Plakalı Taşıt İçin ' + kmMessage, plaka: plaka, type: null });
          }
          const checkDate = (dateStr, label) => {
              if (!dateStr) return;
              const w = checkDateWarningsDriver(dateStr);
              if (w.class && w.days != null) {
                  let msg;
                  if (w.days <= 0) {
                      const bitmistirLabel = label === 'Sigorta' ? 'Trafik Sigortası' : label;
                      msg = plaka + ' Plakalı Taşıtın ' + bitmistirLabel + ' Bitmiştir.';
                  } else {
                      msg = plaka + ' Plakalı Taşıtın ' + label + ' Tarihine ' + w.days + ' Gün Kalmıştır';
                  }
                  warnings.push({ text: msg, plaka: plaka, type: null, warnLevel: w.level });
              }
          };
          checkDate(v.muayeneDate, 'Muayene');
          if (v.egzozMuayeneDate && v.egzozMuayeneDate !== v.muayeneDate) {
              checkDate(v.egzozMuayeneDate, 'Egzoz Muayenesi');
          }
          checkDate(v.sigortaDate, 'Sigorta');
          checkDate(v.kaskoDate, 'Kasko');
      }
      return warnings;
  }
  
  let slidingWarningInterval = null;
  
  function renderSlidingWarning(vehicles, records) {
      const el = document.getElementById('driver-sliding-warning');
      if (!el) return;
      
      if (slidingWarningInterval) {
          clearInterval(slidingWarningInterval);
          slidingWarningInterval = null;
      }
      
      const warnings = buildSlidingWarnings(vehicles, records);
      var belowHeroSlot = document.getElementById('driver-below-hero-notification-slot');
      if (warnings.length === 0) {
          el.innerHTML = '';
          el.className = 'driver-sliding-warning';
          if (belowHeroSlot && el.parentNode !== belowHeroSlot) belowHeroSlot.appendChild(el);
          return;
      }
      if (belowHeroSlot) {
          belowHeroSlot.appendChild(el);
      }
      
      let cycleCount = 0;
      let idx = 0;
      
      function applyMarqueeIfOverflow(container) {
          var textSpan = container.querySelector('.driver-warning-text');
          if (!textSpan) return;
          container.classList.remove('driver-warning-scroll');
          /* Taşma kontrolü: metin genişliği mevcut alandan fazlaysa marquee yap */
          var raw = (textSpan.textContent || '').trim();
          if (raw.length === 0) return;
          var measure = document.createElement('span');
          measure.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:inherit;';
          measure.textContent = raw;
          document.body.appendChild(measure);
          var textW = measure.offsetWidth;
          document.body.removeChild(measure);
          var iconEl = container.querySelector('.driver-warning-icon');
          var iconW = iconEl ? (iconEl.offsetWidth || 24) + 4 : 28;
          var availW = container.clientWidth - iconW - 16;
          if (textW > availW) {
              var safe = escapeHtmlDriver(raw);
              var marqueeHtml = '<span class="driver-warning-marquee-outer"><span class="driver-warning-marquee-inner"><span>' + safe + '</span><span aria-hidden="true">' + safe + '</span></span></span>';
              textSpan.outerHTML = marqueeHtml;
              container.classList.add('driver-warning-scroll');
          }
      }
      
      function showNext() {
          const w = warnings[idx];
          const text = w ? w.text : '';
          const isKaza = w && w.type === 'kaza';
          const orangeBar = w && w.warnLevel === 'orange';
          el.innerHTML = '<span class="driver-warning-icon" aria-hidden="true">⚠️</span> <span class="driver-warning-text">' + escapeHtmlDriver(text) + '</span>';
          el.className = 'driver-sliding-warning' + (orangeBar ? ' driver-sliding-warning-orange' : '') + (isKaza ? ' driver-warning-kaza-pulse' : (cycleCount >= 3 ? ' driver-warning-pulse' : ''));
          /* Taşma varsa sola kayan marquee uygula (requestAnimationFrame ile ölçüm doğru yapılsın) */
          requestAnimationFrame(function() { applyMarqueeIfOverflow(el); });
          idx = (idx + 1) % warnings.length;
          if (idx === 0) {
              cycleCount++;
          }
      }
      
      showNext();
      slidingWarningInterval = setInterval(showNext, 5000);
  }
  
  function initKaportaForDriver(container, vehicle) {
      if (typeof initKaporta === 'function') {
          initKaporta(container, vehicle);
      }
  }
  
  window.toggleDriverPlateDropdown = function(ev) {
      ev.stopPropagation();
      const dropdown = document.getElementById('driver-plate-dropdown');
      if (!dropdown) return;
      const isOpen = dropdown.style.display === 'block';
      dropdown.style.display = isOpen ? 'none' : 'block';
  };
  
  function formatDriverDate(val) {
      if (!val) return '-';
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
          const [y, m, d] = val.split('-');
          return d + '.' + m + '.' + y;
      }
      return val;
  }
  
  function setupKmInputs() {
      document.querySelectorAll('.vehicle-card input.driver-km-input, #driver-input-area input.driver-km-input, .driver-action-area input.driver-km-input').forEach(input => {
          var ph = input.parentElement && input.parentElement.querySelector('.driver-km-fake-placeholder');
          function togglePlaceholder() {
              if (ph) ph.style.visibility = (input.value || document.activeElement === input) ? 'hidden' : 'visible';
          }
          togglePlaceholder();
          input.addEventListener('input', function() {
              this.value = this.value.replace(/\D/g, '').slice(0, 8);
              togglePlaceholder();
          });
          input.addEventListener('paste', function(e) {
              e.preventDefault();
              var text = '';
              try {
                  text = (e.clipboardData || window.clipboardData).getData('text');
              } catch (err) {}
              this.value = (this.value + (text || '')).replace(/\D/g, '').slice(0, 8);
              togglePlaceholder();
          });
          input.addEventListener('focus', function() { togglePlaceholder(); this.select(); });
          input.addEventListener('blur', togglePlaceholder);
      });
  }
  
  function setupEkstraNotAutoResize() {
      document.querySelectorAll('.vehicle-card textarea.driver-ekstra-not, #driver-input-area textarea.driver-ekstra-not, .driver-action-area textarea.driver-ekstra-not').forEach(ta => {
          function resize() {
              ta.style.height = 'auto';
              ta.style.height = ta.scrollHeight + 'px';
          }
          ta.addEventListener('input', resize);
          resize();
      });
      document.querySelectorAll('.vehicle-card textarea.driver-report-textarea-auto, #driver-input-area textarea.driver-report-textarea-auto, .driver-action-area textarea.driver-report-textarea-auto').forEach(ta => {
          function resize() {
              ta.style.height = 'auto';
              ta.style.height = ta.scrollHeight + 'px';
          }
          ta.addEventListener('input', resize);
          resize();
      });
  }
  
  /* =========================================
     OLAY EKLE - Event Menu & Modals
     ========================================= */
  
  function escapeDriverAttr(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  
  window.openDriverEventMenu = function(vehicleId) {
      currentDriverEventVehicleId = vehicleId;
      const modal = document.getElementById('driver-event-menu-modal');
      const list = document.getElementById('driver-event-menu-list');
      if (!modal || !list) return;
      const events = [
          { id: 'km', label: 'Km Güncelle' },
          { id: 'bakim', label: 'Bakım Bilgisi Ekle' },
          { id: 'kaza', label: 'Kaza Bilgisi Ekle' },
          { id: 'anahtar', label: 'Yedek Anahtar Bilgisi Güncelle' },
          { id: 'lastik', label: 'Yazlık/Kışlık Lastik Durumu Güncelle' },
          { id: 'utts', label: 'UTTS Bilgisi Güncelle' },
          { id: 'muayene', label: 'Muayene Bilgisi Güncelle' },
          { id: 'sigorta', label: 'Trafik Sigortası Yenileme' },
          { id: 'kasko', label: 'Kasko Yenileme' }
      ];
      list.innerHTML = events.map(function(e) {
          const isKaza = e.id === 'kaza';
          return '<button type="button" class="driver-event-menu-btn' + (isKaza ? ' driver-event-menu-btn-kaza' : '') + '" data-event-id="' + escapeDriverAttr(e.id) + '" data-vehicle-id="' + escapeDriverAttr(vehicleId) + '">' + escapeHtmlDriver(e.label) + '</button>';
      }).join('');
      list.querySelectorAll('.driver-event-menu-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
              window.handleDriverEventChoice(btn.dataset.eventId, btn.dataset.vehicleId);
          });
      });
      modal.classList.add('show');
      updateDriverModalBodyClass();
  };
  
  window.closeDriverEventMenu = function() {
      const modal = document.getElementById('driver-event-menu-modal');
      if (modal) modal.classList.remove('show');
      currentDriverEventVehicleId = null;
      updateDriverModalBodyClass();
  };
  
  window.handleDriverEventChoice = function(type, vehicleId) {
      closeDriverEventMenu();
      if (type === 'km') {
          toggleDriverActionBlock('km', vehicleId);
      } else if (type === 'bakim') {
          var block = document.getElementById('bakim-block-' + vehicleId);
          if (block && block.closest('.driver-action-area-inner')) {
              toggleDriverActionBlock('bakim', vehicleId);
          } else {
              toggleReportBlock('bakim', vehicleId);
              block = document.getElementById('bakim-block-' + vehicleId);
              if (block) block.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
      } else if (type === 'kaza') {
          var kazaBlock = document.getElementById('kaza-block-' + vehicleId);
          if (kazaBlock && kazaBlock.closest('.driver-action-area-inner')) {
              toggleDriverActionBlock('kaza', vehicleId);
          } else {
              toggleReportBlock('kaza', vehicleId);
              if (kazaBlock) kazaBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
      } else if (['sigorta', 'kasko', 'muayene', 'anahtar', 'lastik'].indexOf(type) !== -1) {
          toggleDriverActionBlock(type, vehicleId);
      } else {
          openDriverEventModal(type, vehicleId);
      }
  };
  
  window.openDriverEventModal = function(type, vehicleId) {
      currentDriverEventVehicleId = vehicleId;
      const inner = document.querySelector('.driver-action-area-inner[data-vehicle-id="' + String(vehicleId) + '"]');
      if (inner) inner.classList.add('driver-modal-open');
      const modalId = 'driver-' + type + '-modal';
      const modal = document.getElementById(modalId);
      if (!modal) return;
      if (type === 'anahtar') {
          const vehicle = allHistoryVehicles.find(function(v) { return String(v.id) === String(vehicleId); });
          const wrap = document.getElementById('driver-anahtar-detay-wrap');
          const detay = document.getElementById('driver-anahtar-detay');
          const btns = document.querySelectorAll('#driver-anahtar-modal .driver-radio-btn');
          btns.forEach(function(b) {
              b.classList.toggle('active', b.dataset.value === (vehicle && vehicle.anahtar === 'var' ? 'var' : 'yok'));
          });
          if (wrap && detay) {
              const isVar = (vehicle && vehicle.anahtar === 'var');
              wrap.style.display = isVar ? 'block' : 'none';
              detay.value = (vehicle && vehicle.anahtarNerede) || '';
          }
          setupDriverEventRadioHandlers('anahtar', wrap, detay);
      } else if (type === 'lastik') {
          const vehicle = allHistoryVehicles.find(function(v) { return String(v.id) === String(vehicleId); });
          const wrap = document.getElementById('driver-lastik-adres-wrap');
          const adres = document.getElementById('driver-lastik-adres');
          const btns = document.querySelectorAll('#driver-lastik-modal .driver-radio-btn');
          btns.forEach(function(b) {
              b.classList.toggle('active', b.dataset.value === (vehicle && vehicle.lastikDurumu === 'var' ? 'var' : 'yok'));
          });
          if (wrap && adres) {
              const isVar = (vehicle && vehicle.lastikDurumu === 'var');
              wrap.style.display = isVar ? 'block' : 'none';
              adres.value = (vehicle && vehicle.lastikAdres) || '';
          }
          setupDriverEventRadioHandlers('lastik', wrap, adres);
      } else if (type === 'utts') {
          const vehicle = allHistoryVehicles.find(function(v) { return String(v.id) === String(vehicleId); });
          const btns = document.querySelectorAll('#driver-utts-modal .driver-radio-btn');
          const evet = vehicle && vehicle.uttsTanimlandi;
          btns.forEach(function(b) {
              b.classList.toggle('active', (b.dataset.value === 'evet') === evet);
          });
      } else if (type === 'muayene') {
          const input = document.getElementById('driver-muayene-tarih');
          if (input) input.value = new Date().toISOString().split('T')[0];
          const egzozCheckbox = document.getElementById('driver-muayene-egzoz-different');
          if (egzozCheckbox) egzozCheckbox.checked = false;
          window.syncDriverEgzozMuayeneFields();
      } else if (type === 'sigorta') {
          const input = document.getElementById('driver-sigorta-tarih');
          if (input) input.value = new Date().toISOString().split('T')[0];
          ['firma', 'acente', 'iletisim'].forEach(f => {
              const el = document.getElementById('driver-sigorta-' + f);
              if (el) el.value = '';
          });
      } else if (type === 'kasko') {
          const input = document.getElementById('driver-kasko-tarih');
          if (input) input.value = new Date().toISOString().split('T')[0];
          ['firma', 'acente', 'iletisim'].forEach(f => {
              const el = document.getElementById('driver-kasko-' + f);
              if (el) el.value = '';
          });
      }
      modal.classList.add('show');
      updateDriverModalBodyClass();
  };
  
  function setupDriverEventRadioHandlersForBlock(group, vid) {
      const block = document.getElementById(group + '-block-' + vid);
      if (!block) return;
      const btns = block.querySelectorAll('.driver-radio-btn[data-group="' + group + '"]');
      var wrap = document.getElementById('driver-' + group + (group === 'anahtar' ? '-detay-wrap' : '-adres-wrap') + '-' + vid);
      var input = document.getElementById('driver-' + group + (group === 'anahtar' ? '-detay' : '-adres') + '-' + vid);
      var activeBtn = block.querySelector('.driver-radio-btn.active');
      if (wrap) wrap.style.display = (activeBtn && activeBtn.dataset.value === 'var') ? 'block' : 'none';
      btns.forEach(function(btn) {
          btn.onclick = function() {
              btns.forEach(function(b) { b.classList.remove('active'); });
              btn.classList.add('active');
              var isVar = btn.dataset.value === 'var';
              if (wrap) wrap.style.display = isVar ? 'block' : 'none';
              if (input && !isVar) input.value = '';
          };
      });
  }
  
  function setupDriverEventRadioHandlers(group, detailWrap, detailInput) {
      const container = document.getElementById('driver-' + group + '-modal');
      if (!container) return;
      const btns = container.querySelectorAll('.driver-radio-btn[data-group="' + group + '"]');
      btns.forEach(function(btn) {
          btn.onclick = function() {
              btns.forEach(function(b) { b.classList.remove('active'); });
              btn.classList.add('active');
              const isVar = btn.dataset.value === 'var';
              if (detailWrap) detailWrap.style.display = isVar ? 'block' : 'none';
              if (detailInput && !isVar) detailInput.value = '';
          };
      });
  }

  window.syncDriverEgzozMuayeneFields = function(vehicleId) {
      const suffix = vehicleId ? '-' + String(vehicleId) : '';
      const checkbox = document.getElementById('driver-muayene-egzoz-different' + suffix);
      const wrap = document.getElementById('driver-muayene-egzoz-date-wrap' + suffix);
      const input = document.getElementById('driver-muayene-egzoz-tarih' + suffix);
      const visible = !!(checkbox && checkbox.checked);
      if (wrap) wrap.classList.toggle('driver-egzoz-date-visible', visible);
      if (input) {
          input.disabled = !visible;
          if (!visible) input.value = '';
      }
  };

  function getDriverMuayenePayload(vehicleId) {
      const suffix = vehicleId ? '-' + String(vehicleId) : '';
      const tarih = document.getElementById('driver-muayene-tarih' + suffix)?.value.trim() || '';
      if (!tarih) {
          alert('Tarih zorunludur!');
          return null;
      }
      const egzozCheckbox = document.getElementById('driver-muayene-egzoz-different' + suffix);
      const egzozDifferent = !!(egzozCheckbox && egzozCheckbox.checked);
      const egzozMuayeneYapilmaDate = egzozDifferent
          ? (document.getElementById('driver-muayene-egzoz-tarih' + suffix)?.value.trim() || '')
          : '';
      if (egzozDifferent && !egzozMuayeneYapilmaDate) {
          alert('Egzoz Muayene Tarihi zorunludur!');
          const egzozInput = document.getElementById('driver-muayene-egzoz-tarih' + suffix);
          if (egzozInput) egzozInput.focus();
          return null;
      }
      return { tarih: tarih, egzozMuayeneYapilmaDate: egzozMuayeneYapilmaDate };
  }

  function positionAndShowMuayenePopover(dateInputEl, source) {
      var popover = document.getElementById('muayene-confirm-popover');
      if (!popover || !dateInputEl) return;
      muayeneConfirmSource = source;
      var inputRect = dateInputEl.getBoundingClientRect();
      var container = dateInputEl.closest('.driver-report-block') || dateInputEl.closest('.driver-modal-content');
      if (!container) container = dateInputEl.closest('.modal-body') || document.body;
      var containerRect = container.getBoundingClientRect();
      if (source === 'modal') {
          var wrap = document.querySelector('#driver-muayene-modal .muayene-submit-wrap');
          if (wrap) wrap.style.visibility = 'hidden';
      } else if (source === 'block' && pendingMuayeneVehicleId) {
          var btnGroup = document.querySelector('#muayene-block-' + pendingMuayeneVehicleId + ' .universal-btn-group');
          if (btnGroup) btnGroup.style.visibility = 'hidden';
      }
      popover.style.visibility = 'hidden';
      popover.style.display = 'block';
      var popoverRect = popover.getBoundingClientRect();
      var top = inputRect.bottom + 5;
      var left = containerRect.left + (containerRect.width / 2) - (popoverRect.width / 2);
      var leftClamped = Math.max(16, Math.min(left, window.innerWidth - popoverRect.width - 16));
      popover.style.top = top + 'px';
      popover.style.left = leftClamped + 'px';
      popover.style.visibility = '';
  }

  function hideMuayenePopoverAndRestore() {
      var popover = document.getElementById('muayene-confirm-popover');
      if (popover) popover.style.display = 'none';
      if (muayeneConfirmSource === 'modal') {
          var wrap = document.querySelector('#driver-muayene-modal .muayene-submit-wrap');
          if (wrap) wrap.style.visibility = '';
      } else if (muayeneConfirmSource === 'block' && pendingMuayeneVehicleId) {
          var btnGroup = document.querySelector('#muayene-block-' + pendingMuayeneVehicleId + ' .universal-btn-group');
          if (btnGroup) btnGroup.style.visibility = '';
      }
      muayeneConfirmSource = null;
  }

  window.cancelMuayeneSubmit = function() {
      hideMuayenePopoverAndRestore();
      pendingMuayeneVehicleId = null;
  };

  window.confirmMuayeneSubmit = async function() {
      if (!ensureDriverOnlineForWrite()) return;
      isMuayeneConfirmed = true;
      hideMuayenePopoverAndRestore();
      if (pendingMuayeneVehicleId) {
          const vid = pendingMuayeneVehicleId;
          pendingMuayeneVehicleId = null;
          const payload = getDriverMuayenePayload(vid);
          if (!payload) { isMuayeneConfirmed = false; return; }
          try {
              const res = await fetch(API_BASE + 'driver_event.php', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentToken },
                  body: JSON.stringify({ arac_id: parseInt(vid, 10), vehicle_version: getVehicleVersionForRequest(vid), event_type: 'muayene', data: payload })
              });
              const result = await res.json();
              if (await handleDriverConflictResponse(result)) return;
              if (result.success) {
                  applyVehicleVersionUpdate(vid, result.vehicleVersion);
                  lastCompletedActionInSession = { action: 'muayene', vehicleId: vid };
                  cancelDriverActionForm('muayene', vid);
                  await loadDashboard();
              } else {
                  alert(result.message || 'Kayıt başarısız!');
              }
          } catch (err) {
              console.error(err);
              alert('Bağlantı hatası!');
          } finally {
              isMuayeneConfirmed = false;
          }
      } else {
          await saveDriverEvent('muayene');
          isMuayeneConfirmed = false;
      }
  };

  window.closeDriverEventModal = function(type) {
      const vid = currentDriverEventVehicleId;
      if (vid) {
          const inner = document.querySelector('.driver-action-area-inner[data-vehicle-id="' + String(vid) + '"]');
          if (inner) inner.classList.remove('driver-modal-open');
      }
      const modal = document.getElementById('driver-' + type + '-modal');
      if (modal) modal.classList.remove('show');
      currentDriverEventVehicleId = null;
      updateDriverModalBodyClass();
      if (type === 'muayene') {
          isMuayeneConfirmed = false;
          pendingMuayeneVehicleId = null;
          hideMuayenePopoverAndRestore();
      }
  };
  
  window.saveDriverEventFromBlock = async function(type, vehicleId) {
      if (!ensureDriverOnlineForWrite()) return;
      vehicleId = String(vehicleId);
      if (!vehicleId || !currentToken) return;
      let data = {};
      if (type === 'anahtar') {
          const block = document.getElementById('anahtar-block-' + vehicleId);
          const active = block ? block.querySelector('.driver-radio-btn.active') : null;
          if (!active) { alert('Lütfen Durum seçiniz!'); return; }
          const durum = active.dataset.value;
          data = { durum: durum, detay: durum === 'var' ? capitalizeWords(document.getElementById('driver-anahtar-detay-' + vehicleId)?.value.trim() || '') : '' };
      } else if (type === 'lastik') {
          const block = document.getElementById('lastik-block-' + vehicleId);
          const active = block ? block.querySelector('.driver-radio-btn.active') : null;
          if (!active) { alert('Lütfen Durum seçiniz!'); return; }
          const durum = active.dataset.value;
          data = { durum: durum, adres: durum === 'var' ? capitalizeWords(document.getElementById('driver-lastik-adres-' + vehicleId)?.value.trim() || '') : '' };
      } else if (type === 'muayene') {
          const payload = getDriverMuayenePayload(vehicleId);
          if (!payload) return;
          if (!isMuayeneConfirmed) {
              const vehicle = allHistoryVehicles && allHistoryVehicles.find(function(v) { return String(v.id) === String(vehicleId); });
              const bitisStr = calculateNextMuayeneDate(payload.tarih, vehicle);
              const dateEl = document.getElementById('muayene-calc-date');
              if (dateEl) dateEl.textContent = bitisStr ? formatDateDDMMYYYY(bitisStr) : '--/--/----';
              pendingMuayeneVehicleId = vehicleId;
              var dateInput = document.getElementById('driver-muayene-tarih-' + vehicleId);
              positionAndShowMuayenePopover(dateInput, 'block');
              return;
          }
          data = payload;
      } else if (type === 'sigorta') {
          const tarih = document.getElementById('driver-sigorta-tarih-' + vehicleId)?.value.trim() || '';
          if (!tarih) { alert('Tarih zorunludur!'); return; }
          data = {
              tarih: tarih,
              firma: capitalizeWords(document.getElementById('driver-sigorta-firma-' + vehicleId)?.value.trim() || ''),
              acente: capitalizeWords(document.getElementById('driver-sigorta-acente-' + vehicleId)?.value.trim() || ''),
              iletisim: document.getElementById('driver-sigorta-iletisim-' + vehicleId)?.value.trim() || ''
          };
      } else if (type === 'kasko') {
          const tarih = document.getElementById('driver-kasko-tarih-' + vehicleId)?.value.trim() || '';
          if (!tarih) { alert('Tarih zorunludur!'); return; }
          data = {
              tarih: tarih,
              firma: capitalizeWords(document.getElementById('driver-kasko-firma-' + vehicleId)?.value.trim() || ''),
              acente: capitalizeWords(document.getElementById('driver-kasko-acente-' + vehicleId)?.value.trim() || ''),
              iletisim: document.getElementById('driver-kasko-iletisim-' + vehicleId)?.value.trim() || ''
          };
      } else return;
      try {
          const res = await fetch(API_BASE + 'driver_event.php', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentToken },
              body: JSON.stringify({ arac_id: parseInt(vehicleId, 10), vehicle_version: getVehicleVersionForRequest(vehicleId), event_type: type, data: data })
          });
          const result = await res.json();
          if (await handleDriverConflictResponse(result)) return;
          if (result.success) {
              applyVehicleVersionUpdate(vehicleId, result.vehicleVersion);
              lastCompletedActionInSession = { action: type, vehicleId: vehicleId };
              cancelDriverActionForm(type, vehicleId);
              await loadDashboard();
          } else {
              alert(result.message || 'Kayıt başarısız!');
          }
      } catch (err) {
          console.error(err);
          alert('Bağlantı hatası!');
      }
  };
  
  window.saveDriverEvent = async function(type) {
      if (!ensureDriverOnlineForWrite()) return;
      const vehicleId = currentDriverEventVehicleId;
      if (!vehicleId || !currentToken) return;
      let data = {};
      if (type === 'anahtar') {
          const active = document.querySelector('#driver-anahtar-modal .driver-radio-btn.active');
          if (!active) { alert('Lütfen Durum seçiniz!'); return; }
          const durum = active.dataset.value;
          data = { durum: durum, detay: durum === 'var' ? capitalizeWords(document.getElementById('driver-anahtar-detay')?.value.trim() || '') : '' };
      } else if (type === 'lastik') {
          const active = document.querySelector('#driver-lastik-modal .driver-radio-btn.active');
          if (!active) { alert('Lütfen Durum seçiniz!'); return; }
          const durum = active.dataset.value;
          data = { durum: durum, adres: durum === 'var' ? capitalizeWords(document.getElementById('driver-lastik-adres')?.value.trim() || '') : '' };
      } else if (type === 'utts') {
          const active = document.querySelector('#driver-utts-modal .driver-radio-btn.active');
          data = { durum: active && active.dataset.value === 'evet' };
      } else if (type === 'muayene') {
          const payload = getDriverMuayenePayload();
          if (!payload) return;
          if (!isMuayeneConfirmed) {
              const vehicle = allHistoryVehicles && allHistoryVehicles.find(function(v) { return String(v.id) === String(vehicleId); });
              const bitisStr = calculateNextMuayeneDate(payload.tarih, vehicle);
              const dateEl = document.getElementById('muayene-calc-date');
              if (dateEl) dateEl.textContent = bitisStr ? formatDateDDMMYYYY(bitisStr) : '--/--/----';
              var dateInput = document.getElementById('driver-muayene-tarih');
              positionAndShowMuayenePopover(dateInput, 'modal');
              return;
          }
          data = payload;
      } else if (type === 'sigorta') {
          const tarih = document.getElementById('driver-sigorta-tarih')?.value.trim() || '';
          if (!tarih) {
              alert('Tarih zorunludur!');
              return;
          }
          data = {
              tarih: tarih,
              firma: capitalizeWords(document.getElementById('driver-sigorta-firma')?.value.trim() || ''),
              acente: capitalizeWords(document.getElementById('driver-sigorta-acente')?.value.trim() || ''),
              iletisim: document.getElementById('driver-sigorta-iletisim')?.value.trim() || ''
          };
      } else if (type === 'kasko') {
          const tarih = document.getElementById('driver-kasko-tarih')?.value.trim() || '';
          if (!tarih) {
              alert('Tarih zorunludur!');
              return;
          }
          data = {
              tarih: tarih,
              firma: capitalizeWords(document.getElementById('driver-kasko-firma')?.value.trim() || ''),
              acente: capitalizeWords(document.getElementById('driver-kasko-acente')?.value.trim() || ''),
              iletisim: document.getElementById('driver-kasko-iletisim')?.value.trim() || ''
          };
      }
      try {
          const res = await fetch(API_BASE + 'driver_event.php', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentToken },
              body: JSON.stringify({ arac_id: vehicleId, vehicle_version: getVehicleVersionForRequest(vehicleId), event_type: type, data: data })
          });
          const result = await res.json();
          if (await handleDriverConflictResponse(result)) return;
          if (result.success) {
              applyVehicleVersionUpdate(vehicleId, result.vehicleVersion);
              closeDriverEventModal(type);
              await loadDashboard();
          } else {
              alert(result.message || 'Kayıt başarısız!');
          }
      } catch (err) {
          console.error(err);
          alert('Bağlantı hatası!');
      }
  };
  
  // Blok Aç/Kapa (aksiyon butonlarından çağrılır)
  window.toggleAndScrollToBlock = function(type, vehicleId) {
      toggleReportBlock(type, vehicleId);
      const block = document.getElementById(type + '-block-' + vehicleId);
      if (block) block.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  
  window.toggleReportBlock = function(type, vehicleId) {
      const block = document.getElementById(`${type}-block-${vehicleId}`);
      if (!block) return;
      
      const isShown = block.classList.contains('show');
      if (isShown) {
          block.classList.remove('show');
      } else {
          block.classList.add('show');
          // Açılınca tarih boşsa bugünün tarihini ver
          const dateEl = document.getElementById(`${type}-tarih-${vehicleId}`);
          if(dateEl && !dateEl.value) {
               dateEl.value = new Date().toISOString().split('T')[0];
          }
          // Kaza bloku açıldığında kaporta SVG'yi ilk kez yükle (container boşsa)
          if (type === 'kaza') {
              const container = document.getElementById('kaza-kaporta-' + vehicleId);
              if (container && !container.querySelector('svg')) {
                  let boyaliParcalar = {};
                  try {
                      const raw = container.getAttribute('data-boyali-parcalar');
                      if (raw) boyaliParcalar = JSON.parse(raw);
                  } catch (e) {}
                  initDriverKaporta(vehicleId, boyaliParcalar);
              }
          }
      }
  };
  
  /**
   * Sürücü paneli kaza blokunda kaporta SVG yükler; mevcut boyaliParcalar uygulanır, parçalar tıklanarak boyasız/boyalı/değişen döngüsü
   */
  function initDriverKaporta(vehicleId, boyaliParcalar) {
      const container = document.getElementById('kaza-kaporta-' + vehicleId);
      if (!container) return;
      boyaliParcalar = boyaliParcalar || {};
      const url = ICON_BASE + 'kaporta.svg';
      fetch(url)
          .then(function(res) { return res.text(); })
          .then(function(svgText) {
              const parser = new DOMParser();
              const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
              const svg = svgDoc.querySelector('svg');
              if (!svg) return;
              container.innerHTML = '';
              const schemaWrapper = document.createElement('div');
              schemaWrapper.className = 'driver-kaporta-schema-wrapper';
              schemaWrapper.style.display = 'flex';
              schemaWrapper.style.flexDirection = 'column';
              schemaWrapper.style.alignItems = 'center';
              schemaWrapper.style.justifyContent = 'flex-start';
              schemaWrapper.style.overflow = 'visible';
              const svgClone = svg.cloneNode(true);
              schemaWrapper.appendChild(svgClone);
              svgClone.setAttribute('width', '120');
              svgClone.setAttribute('height', '180');
              svgClone.style.width = '180px';
              svgClone.style.height = '120px';
              svgClone.style.margin = '0';
              svgClone.style.display = 'block';
              svgClone.style.transform = 'rotate(90deg)';
              svgClone.style.transformOrigin = 'center center';
              const allParts = svgClone.querySelectorAll('path[id]');
              // Varsayılan gri
              allParts.forEach(function(part) {
                  const partId = part.getAttribute('id');
                  if (partId === 'araba-govde') return;
                  part.setAttribute('fill', '#888888');
                  part.style.fill = '#888888';
              });
              // Önceki kazalardan gelen parçalar: sadece görsel, readonly, dataset.state atanmaz (yeni kayda dahil edilmez)
              Object.keys(boyaliParcalar).forEach(function(partId) {
                  if (partId === 'araba-govde') return;
                  const part = svgClone.querySelector('#' + CSS.escape(partId));
                  if (!part) return;
                  const state = boyaliParcalar[partId];
                  if (state === 'boyali') {
                      part.setAttribute('fill', '#28a745');
                      part.style.fill = '#28a745';
                  } else if (state === 'degisen') {
                      part.setAttribute('fill', '#d40000');
                      part.style.fill = '#d40000';
                  }
                  part.style.pointerEvents = 'none';
                  part.style.opacity = '0.7';
              });
              // Bu kazada seçilebilecek parçalar: tıklanabilir, sadece bunlar kayda gider
              allParts.forEach(function(part) {
                  const partId = part.getAttribute('id');
                  if (partId === 'araba-govde') return;
                  if (boyaliParcalar[partId]) return;
                  part.style.cursor = 'pointer';
                  part.dataset.state = 'boyasiz';
                  part.addEventListener('click', function(e) {
                      e.preventDefault();
                      e.stopPropagation();
                      const cur = this.dataset.state || 'boyasiz';
                      var next = 'boyasiz';
                      if (cur === 'boyasiz') next = 'boyali';
                      else if (cur === 'boyali') next = 'degisen';
                      this.dataset.state = next;
                      if (next === 'boyasiz') {
                          this.setAttribute('fill', '#888888');
                          this.style.fill = '#888888';
                      } else if (next === 'boyali') {
                          this.setAttribute('fill', '#28a745');
                          this.style.fill = '#28a745';
                      } else {
                          this.setAttribute('fill', '#d40000');
                          this.style.fill = '#d40000';
                      }
                  });
              });
              const legend = document.createElement('div');
              legend.className = 'boya-legend';
              legend.style.display = 'flex';
              legend.style.flexDirection = 'row';
              legend.style.flexWrap = 'nowrap';
              legend.style.gap = '12px';
              legend.style.justifyContent = 'center';
              legend.style.fontSize = '11px';
              legend.style.color = '#aaa';
              legend.innerHTML = '<div class="boya-legend-item"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#888;margin-right:6px;"></span>Boyasız</div><div class="boya-legend-item"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#28a745;margin-right:6px;"></span>Boyalı</div><div class="boya-legend-item"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#d40000;margin-right:6px;"></span>Değişen</div>';
              container.appendChild(schemaWrapper);
              container.appendChild(legend);
          })
          .catch(function(err) { console.error('Kaporta SVG yüklenemedi:', err); });
  }
  
  // Kaydetme
  window.saveVehicleData = async function(vehicleId) {
      const km = document.getElementById(`km-${vehicleId}`).value;
      
      const bakimBlock = document.getElementById(`bakim-block-${vehicleId}`);
      const bakimAciklama = document.getElementById(`bakim-detay-${vehicleId}`).value.trim();
      const bakimTarih = document.getElementById(`bakim-tarih-${vehicleId}`).value;
      const bakimServis = document.getElementById(`bakim-servis-${vehicleId}`)?.value.trim() || '';
      const bakimKisi = document.getElementById(`bakim-kisi-${vehicleId}`)?.value.trim() || '';
      const bakimKm = document.getElementById(`bakim-km-${vehicleId}`)?.value.trim() || '';
      const bakimTutar = document.getElementById(`bakim-tutar-${vehicleId}`)?.value.trim() || '';
      
      const kazaBlock = document.getElementById(`kaza-block-${vehicleId}`);
      const kazaAciklama = document.getElementById(`kaza-detay-${vehicleId}`).value.trim();
      const kazaTarih = document.getElementById(`kaza-tarih-${vehicleId}`).value;
      const kazaHasarTutari = document.getElementById(`kaza-tutar-${vehicleId}`)?.value.trim() || '';
  
      // Panel açık veya açıklama doluysa "Var" say
      const bakimVar = bakimBlock.classList.contains('show') || bakimAciklama.length > 0;
      const kazaVar = kazaBlock.classList.contains('show') || kazaAciklama.length > 0;
  
      if (!km || km <= 0) {
          alert('Lütfen geçerli bir KM değeri girin!');
          document.getElementById(`km-${vehicleId}`).focus();
          return;
      }
  
      if (bakimVar && bakimAciklama === '') {
          alert('Bakım bildirdiniz, lütfen açıklama girin veya iptal etmek için paneli kapatın.');
          bakimBlock.classList.add('show');
          return;
      }
  
      if (kazaVar && kazaAciklama === '') {
          alert('Kaza bildirdiniz, lütfen açıklama girin veya iptal etmek için paneli kapatın.');
          kazaBlock.classList.add('show');
          return;
      }
      
      // Kaporta: sadece boyalı/değişen parçaları topla
      let boyaParcalar = {};
      const kaportaContainer = document.getElementById('kaza-kaporta-' + vehicleId);
      if (kaportaContainer) {
          const paths = kaportaContainer.querySelectorAll('svg path[id]');
          paths.forEach(function(part) {
              const partId = part.getAttribute('id');
              if (partId === 'araba-govde') return;
              const state = part.dataset.state;
              if (state === 'boyali' || state === 'degisen') boyaParcalar[partId] = state;
          });
      }
  
      const btn = document.getElementById(`btn-save-${vehicleId}`);
      btn.disabled = true;
      btn.textContent = 'Kaydediliyor...';
      
      try {
          const response = await fetch(API_BASE + 'driver_save.php', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer ' + currentToken
              },
              body: JSON.stringify({
                  arac_id: vehicleId,
                  vehicle_version: getVehicleVersionForRequest(vehicleId),
                  guncel_km: parseInt(km),
                  bakim_durumu: bakimVar ? 1 : 0,
                  bakim_aciklama: capitalizeWords(bakimAciklama),
                  bakim_tarih: bakimTarih,
                  bakim_servis: capitalizeWords(bakimServis),
                  bakim_kisi: capitalizeWords(bakimKisi),
                  bakim_km: bakimKm,
                  bakim_tutar: bakimTutar,
                  kaza_durumu: kazaVar ? 1 : 0,
                  kaza_aciklama: capitalizeWords(kazaAciklama),
                  kaza_tarih: kazaTarih,
                  kaza_hasar_tutari: kazaHasarTutari,
                  boya_parcalar: JSON.stringify(boyaParcalar)
              })
          });
          
          const data = await response.json();
          if (await handleDriverConflictResponse(data)) {
              btn.textContent = 'GÜNCELLE';
              return;
          }
          
          if (data.success) {
              applyVehicleVersionUpdate(vehicleId, data.vehicleVersion);
              showStatus(vehicleId, 'success', '✓ Kaydedildi!');
              btn.textContent = 'GÜNCELLE';
  
              lastCompletedActionInSession = { action: 'km', vehicleId: vehicleId };
              const period = (currentPeriod || new Date().toISOString().slice(0, 7)).toString().trim();
              lastSuccessfulKmSubmissions[String(vehicleId)] = period;
  
              allHistoryRecords = allHistoryRecords || [];
              allHistoryRecords.push({
                  arac_id: vehicleId,
                  donem: period,
                  guncel_km: parseInt(km),
                  kayit_tarihi: new Date().toISOString()
              });
              renderSlidingWarning(allHistoryVehicles || [], allHistoryRecords);
              setTimeout(function() { renderSlidingWarning(allHistoryVehicles || [], allHistoryRecords); }, 300);
  
              setTimeout(() => {
                  loadDashboard();
              }, 4000);
  
              if (data.warning) {
                  setTimeout(() => { alert(data.warning); }, 500);
              }
          } else {
              showStatus(vehicleId, 'error', '❌ ' + data.message);
              btn.textContent = 'KAYDET';
          }
          
      } catch (error) {
          console.error('Kaydetme hatası:', error);
          showStatus(vehicleId, 'error', '❌ Bağlantı hatası!');
          btn.textContent = 'KAYDET';
      } finally {
          btn.disabled = false;
      }
  };
  
  // Durum mesajı
  function showStatus(vehicleId, type, message) {
      const statusDiv = document.getElementById(`status-${vehicleId}`);
      statusDiv.className = `status-message ${type}`;
      statusDiv.textContent = message;
      
      setTimeout(() => {
          statusDiv.className = 'status-message';
          statusDiv.textContent = '';
      }, 5000);
  }
  
  // Dönem formatı
  function formatPeriod(period) {
      const [year, month] = period.split('-');
      const months = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN',
                      'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];
      return `${months[parseInt(month) - 1]} ${year}`;
  }
  
  function formatKm(value) {
    if (value == null || value === '') return '';
    var numStr = String(value).replace(/[^\d]/g, '');
    if (!numStr) return '';
    return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function formatHistoryVehicleTriggerLabel(v) {
      if (!v) return 'Tüm Taşıtlar';
      var raw = v.brandModel || [v.marka, v.model].filter(Boolean).join(' ');
      var brandModel = (typeof window.formatBrandModel === 'function' ? window.formatBrandModel : (typeof window.toTitleCase === 'function' ? window.toTitleCase : function(x){ return x; }))(raw || '') || '';
      return [formatDriverPlaka(v.plaka), brandModel].filter(Boolean).join(' - ');
  }
  
  function updateHistoryTriggerTone(selectedValue) {
      const trigger = document.querySelector('.history-vehicle-trigger');
      if (!trigger) return;
      const isAllSelected = selectedValue === '' || selectedValue == null;
      trigger.classList.toggle('history-all-selected', isAllSelected);
  }
  
  // Geçmiş kayıtlar - custom dropdown
  window.showHistory = function() {
      var modal = document.getElementById('history-modal');
      var hiddenInput = document.getElementById('history-vehicle-filter');
      var triggerText = document.querySelector('.history-vehicle-trigger-text');
      var dropdown = document.getElementById('history-vehicle-dropdown');
      var trigger = document.querySelector('.history-vehicle-trigger');
      if (!modal || !hiddenInput || !dropdown) return;
      dropdown.innerHTML = '';
      var optAll = document.createElement('div');
      optAll.className = 'history-vehicle-option';
      optAll.dataset.value = '';
      optAll.textContent = 'Tüm Taşıtlar';
      optAll.onclick = function() { selectHistoryVehicle('', 'Tüm Taşıtlar'); };
      dropdown.appendChild(optAll);
      (allHistoryVehicles || []).forEach(function(v) {
          var opt = document.createElement('div');
          opt.className = 'history-vehicle-option';
          opt.dataset.value = String(v.id);
          var raw = v.brandModel || [v.marka, v.model].filter(Boolean).join(' ');
          var brandModel = (typeof window.formatBrandModel === 'function' ? window.formatBrandModel : (typeof window.toTitleCase === 'function' ? window.toTitleCase : function(x){ return x; }))(raw || '') || '';
          opt.textContent = [formatDriverPlaka(v.plaka), brandModel].filter(Boolean).join(' - ');
          opt.onclick = function() { selectHistoryVehicle(String(v.id), opt.textContent); };
          dropdown.appendChild(opt);
      });
      var defaultVal = '';
      var defaultText = 'Tüm Taşıtlar';
      if (allHistoryVehicles && allHistoryVehicles.length === 1) {
          defaultVal = String(allHistoryVehicles[0].id);
          defaultText = formatHistoryVehicleTriggerLabel(allHistoryVehicles[0]);
      } else if (allHistoryVehicles && allHistoryVehicles.length > 1 && selectedVehicleId != null && String(selectedVehicleId) !== '') {
          var selForHistory = allHistoryVehicles.find(function(v) { return String(v.id) === String(selectedVehicleId); });
          if (selForHistory) {
              defaultVal = String(selForHistory.id);
              defaultText = formatHistoryVehicleTriggerLabel(selForHistory);
          }
      }
      hiddenInput.value = defaultVal;
      if (triggerText) triggerText.textContent = defaultText;
      updateHistoryTriggerTone(defaultVal);
      dropdown.style.display = 'none';
      if (trigger) trigger.classList.remove('history-vehicle-trigger-open');
      modal.classList.add('show');
      updateDriverModalBodyClass();
      requestAnimationFrame(function() {
          renderHistoryList();
      });
  };
  
  window.toggleHistoryVehicleDropdown = function(ev) {
      ev.stopPropagation();
      const dropdown = document.getElementById('history-vehicle-dropdown');
      const trigger = document.querySelector('.history-vehicle-trigger');
      if (!dropdown || !trigger) return;
      const isOpen = dropdown.style.display !== 'none';
      if (isOpen) {
          dropdown.style.display = 'none';
          trigger.classList.remove('history-vehicle-trigger-open');
      } else {
          dropdown.style.display = 'block';
          trigger.classList.add('history-vehicle-trigger-open');
      }
  };
  
  function selectHistoryVehicle(value, text) {
      const hiddenInput = document.getElementById('history-vehicle-filter');
      const triggerText = document.querySelector('.history-vehicle-trigger-text');
      const dropdown = document.getElementById('history-vehicle-dropdown');
      const trigger = document.querySelector('.history-vehicle-trigger');
      if (hiddenInput) hiddenInput.value = value;
      if (triggerText) triggerText.textContent = text;
      updateHistoryTriggerTone(value);
      if (dropdown) dropdown.style.display = 'none';
      if (trigger) trigger.classList.remove('history-vehicle-trigger-open');
      renderHistoryList();
  }
  
  document.addEventListener('click', function(ev) {
      const wrap = document.querySelector('.history-vehicle-dropdown-wrap');
      const dropdown = document.getElementById('history-vehicle-dropdown');
      if (wrap && dropdown && dropdown.style.display !== 'none' && !wrap.contains(ev.target)) {
          dropdown.style.display = 'none';
          const trigger = document.querySelector('.history-vehicle-trigger');
          if (trigger) trigger.classList.remove('history-vehicle-trigger-open');
      }
  });

  function normalizeDriverHistoryKm(val) {
      if (val == null || val === '') return null;
      var n = parseInt(String(val).replace(/\D/g, ''), 10);
      return isNaN(n) ? null : n;
  }

  function driverHistoryDateKey(tsOrIso) {
      if (!tsOrIso || typeof tsOrIso !== 'string') return '';
      var s = tsOrIso.trim();
      var head10 = s.length >= 10 ? s.slice(0, 10) : '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(head10)) return head10;
      var d = new Date(s);
      if (isNaN(d.getTime())) return '';
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var day = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
  }

  /** driver_save KM kaydıyla aynı gün/taşıt/KM ise olay zaman çizgisinde tekrarı göstermeyiz */
  function isRedundantKmRevizeEvent(evItem, hareketPool) {
      if (!evItem || evItem._type !== 'event' || evItem.eventType !== 'km-revize') return false;
      var yeni = normalizeDriverHistoryKm(evItem.data && evItem.data.yeniKm);
      if (yeni === null) return false;
      var vid = String(evItem.arac_id != null ? evItem.arac_id : '');
      var dayEvt = '';
      var evDateRaw = evItem.date ? String(evItem.date).trim() : '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(evDateRaw)) {
          dayEvt = evDateRaw;
      } else {
          dayEvt = driverHistoryDateKey(evItem.timestamp || '');
      }
      if (!dayEvt) return false;
      var pool = hareketPool || [];
      return pool.some(function (h) {
          if (!h || h._type !== 'hareket') return false;
          if (String(h.arac_id) !== vid) return false;
          if (normalizeDriverHistoryKm(h.guncel_km) !== yeni) return false;
          var dayH = driverHistoryDateKey(h.guncelleme_tarihi || h.kayit_tarihi || '');
          return dayH !== '' && dayH === dayEvt;
      });
  }
  
  function buildCombinedHistoryList() {
      var filterEl = document.getElementById('history-vehicle-filter');
      var vehicleFilter = (filterEl && filterEl.value) ? filterEl.value : '';
      const hareketler = (allHistoryRecords || []).map(r => ({ ...r, _type: 'hareket' }));
      const eventItems = [];
      (allHistoryVehicles || []).forEach(v => {
          const aracId = v.id;
          if (vehicleFilter && String(aracId) !== String(vehicleFilter)) return;
          const events = v.events || [];
          events.forEach(ev => {
              eventItems.push({
                  _type: 'event',
                  id: 'evt-' + (ev.id || Math.random()),
                  arac_id: aracId,
                  eventType: ev.type,
                  timestamp: ev.timestamp || '',
                  date: ev.date || '',
                  data: ev.data || {}
              });
          });
      });
      const hareketFiltered = vehicleFilter
          ? hareketler.filter(r => String(r.arac_id) === String(vehicleFilter))
          : hareketler;
      const eventItemsDedup = eventItems.filter(function (ei) {
          return !isRedundantKmRevizeEvent(ei, hareketFiltered);
      });
      const combined = [...hareketFiltered, ...eventItemsDedup];
      // En yeni kayıt listenin en başında: tarih+saat ile sırala (aynı gün içinde de yeni eklenen üstte).
      const sortKey = (item) => {
          if (item._type === 'hareket') {
              const ts = item.guncelleme_tarihi || item.kayit_tarihi || '';
              return ts + '\t' + (item.id != null ? String(item.id) : '');
          }
          if (item.timestamp) return item.timestamp;
          const d = item.date ? parseHistoryDate(item.date) : null;
          return d ? d.toISOString() : '';
      };
      combined.sort((a, b) => (sortKey(b) || '').localeCompare(sortKey(a) || ''));
      return combined;
  }
  
  function parseHistoryDate(str) {
      if (!str || typeof str !== 'string') return null;
      const trimmed = str.trim();
      if (!trimmed) return null;
      if (trimmed.includes('.')) {
          const parts = trimmed.split('.');
          if (parts.length === 3) {
              const day = parseInt(parts[0], 10);
              const month = parseInt(parts[1], 10) - 1;
              const year = parseInt(parts[2], 10);
              if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                  const d = new Date(year, month, day);
                  if (!isNaN(d.getTime())) return d;
              }
          }
      }
      const d = new Date(trimmed);
      return isNaN(d.getTime()) ? null : d;
  }
  
  function formatHistoryPeriod(item) {
      function formatDateDDMMYYYY(d) {
          if (!d || isNaN(d.getTime())) return '';
          const dd = String(d.getDate()).padStart(2, '0');
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const yyyy = String(d.getFullYear());
          return `${dd}.${mm}.${yyyy}`;
      }
  
      if (item._type === 'hareket') {
          const ts = item.guncelleme_tarihi || item.kayit_tarihi || '';
          const d = ts ? (parseHistoryDate(ts) || new Date(ts)) : null;
          const f = d && !isNaN(d.getTime()) ? formatDateDDMMYYYY(d) : '';
          return f || formatPeriod(item.donem || '');
      }
  
      if (item.date) {
          const d = parseHistoryDate(item.date);
          const f = d ? formatDateDDMMYYYY(d) : '';
          return f || item.date;
      }
  
      if (item.timestamp) {
          const d = parseHistoryDate(item.timestamp) || new Date(item.timestamp);
          return d && !isNaN(d.getTime()) ? formatDateDDMMYYYY(d) : '';
      }
  
      return '';
  }
  
  function capitalizeWords(str) {
    if (!str || typeof str !== 'string') return str;
    return str.split(/\s+/).map(function(w) {
      return w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1).toLocaleLowerCase('tr-TR');
    }).join(' ');
  }

  function getDriverFeedbackHistoryTypeLabel(type) {
      var t = String(type || '').toLocaleLowerCase('tr-TR');
      if (t === 'sikayet' || t === 'şikayet') return 'Şikayet';
      if (t === 'oneri' || t === 'öneri') return 'Öneri';
      if (t === 'diger' || t === 'diğer') return 'Diğer';
      return 'Talep';
  }

  /** Dashboard aksiyon alanı: odaktan çıkınca metni kelime başı büyük yap (tr-TR). KM/tutar/sayı ve iletişim satırı hariç. */
  function bindDriverDashboardTitleCase(areaEl) {
      if (!areaEl || areaEl.nodeType !== 1) return;
      areaEl.querySelectorAll('textarea, input[type="text"]').forEach(function(el) {
          var id = el.id || '';
          if (/km-|kaza-tutar-|bakim-km-|bakim-tutar-|iletisim-/i.test(id)) return;
          if (el.classList.contains('driver-km-input')) return;
          if (el.getAttribute('inputmode') === 'numeric') return;
          el.addEventListener('blur', function () {
              var raw = el.value;
              var v = raw.trim();
              if (!v) return;
              if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(v)) return;
              var out = capitalizeWords(v);
              if (out !== raw) {
                  el.value = out;
                  try {
                      el.dispatchEvent(new Event('input', { bubbles: true }));
                  } catch (e) {}
              }
          });
      });
  }
  
  function renderHistoryList() {
      var listEl = document.getElementById('history-list');
      if (!listEl) return;
      var sorted;
      try {
          sorted = buildCombinedHistoryList();
      } catch (e) {
          listEl.innerHTML = '<p class="history-empty">Kayıtlar yüklenirken hata oluştu.</p>';
          return;
      }
      listEl.innerHTML = '';
      if (!sorted || sorted.length === 0) {
          listEl.innerHTML = '<p class="history-empty">Geçmiş kayıt bulunamadı.</p>';
          return;
      }
      window._historyRecordMap = window._historyRecordMap || {};
      sorted.forEach(item => {
          const vehicle = allHistoryVehicles.find(v => String(v.id) === String(item.arac_id));
          const plaka = vehicle ? formatDriverPlaka(vehicle.plaka) : item.arac_id;
          const periodLabel = formatHistoryPeriod(item);
  
          let detailsHtml = '';
          let showEditBtn = false;
  
          if (item._type === 'hareket') {
              window._historyRecordMap[item.id] = item;
              showEditBtn = true;
              if (item.kaza_durumu) {
                  detailsHtml = '<p>Kaza Bilgisi Bildirildi.</p>';
                  if (item.kaza_hasar_tutari) detailsHtml += `<p>Hasar tutar\u0131: ${escapeHtmlDriver(item.kaza_hasar_tutari)} TL olarak bildirildi.</p>`;
              } else if (item.bakim_durumu) {
                  const bakimAcik = escapeHtmlDriver(capitalizeWords(item.bakim_aciklama || 'Var'));
                  detailsHtml = `<p>Bak\u0131m bilgisi ${bakimAcik} olarak bildirildi.</p>`;
                  if (item.bakim_tarih) detailsHtml += `<p>Tarih: ${escapeHtmlDriver(item.bakim_tarih)}.</p>`;
                  if (item.guncel_km) detailsHtml += `<p>Km; ${formatKm(item.guncel_km)} olarak bildirildi.</p>`;
              } else {
                  detailsHtml = `<p>Km; ${formatKm(item.guncel_km) || '0'} olarak bildirildi.</p>`;
              }
          } else {
              const d = item.data || {};
              if (item.eventType === 'anahtar-guncelle') {
                  const durum = (d.durum === 'var') ? 'Var' : 'Yok';
                  detailsHtml = `<p>Yedek anahtar ${escapeHtmlDriver(durum)} olarak bildirildi.</p>`;
                  if (d.detay) detailsHtml += `<p>Konum: ${escapeHtmlDriver(d.detay)}.</p>`;
              } else if (item.eventType === 'lastik-guncelle') {
                  const durum = (d.durum === 'var') ? 'Var' : 'Yok';
                  detailsHtml = `<p>Yazl\u0131k/ K\u0131\u015fl\u0131k lastik durumu ${escapeHtmlDriver(durum)} olarak bildirildi.</p>`;
                  if (d.adres) detailsHtml += `<p>Adres: ${escapeHtmlDriver(d.adres)}.</p>`;
              } else if (item.eventType === 'utts-guncelle') {
                  const durum = d.durum ? 'Evet' : 'Hay\u0131r';
                  detailsHtml = `<p>UTTS ${escapeHtmlDriver(durum)} olarak bildirildi.</p>`;
              } else if (item.eventType === 'muayene-guncelle') {
                  detailsHtml = '<p>Muayene bilgisi g\u00fcncellendi olarak bildirildi.</p>';
                  if (d.bitisTarihi) detailsHtml += `<p>Biti\u015f tarihi: ${escapeHtmlDriver(d.bitisTarihi)}.</p>`;
                  if (d.egzozMuayeneYapilmaDate) detailsHtml += `<p>Egzoz muayene — yapt\u0131r\u0131lan: ${escapeHtmlDriver(d.egzozMuayeneYapilmaDate)}.</p>`;
                  if (d.egzozMuayeneDate) detailsHtml += `<p>Egzoz muayene — biti\u015f: ${escapeHtmlDriver(d.egzozMuayeneDate)}.</p>`;
              } else if (item.eventType === 'kasko-guncelle') {
                  detailsHtml = '<p>Kasko yenilemesi bildirildi.</p>';
                  if (d.bitisTarihi) detailsHtml += `<p>Biti\u015f tarihi: ${escapeHtmlDriver(d.bitisTarihi)}.</p>`;
              } else if (item.eventType === 'sigorta-guncelle') {
                  detailsHtml = '<p>Trafik sigortas\u0131 yenileme bildirildi.</p>';
                  if (d.bitisTarihi) detailsHtml += `<p>Biti\u015f tarihi: ${escapeHtmlDriver(d.bitisTarihi)}.</p>`;
              } else if (item.eventType === 'kasko-kodu-guncelle') {
                  detailsHtml = '<p>Kasko kodu g\u00fcncellendi.</p>';
                  if (d.kaskoKodu) detailsHtml += `<p>Yeni kod: ${escapeHtmlDriver(d.kaskoKodu)}.</p>`;
              } else if (item.eventType === 'satis') {
                  detailsHtml = '<p>Sat\u0131\u015f/pert bildirildi.</p>';
                  if (d.tutar) detailsHtml += `<p>Tutar: ${escapeHtmlDriver(d.tutar)} TL.</p>`;
                  if (d.aciklama) detailsHtml += `<p>A\u00e7\u0131klama: ${escapeHtmlDriver(d.aciklama)}.</p>`;
              } else if (item.eventType === 'ceza') {
                  detailsHtml = '<p>Trafik cezas\u0131 bildirildi.</p>';
                  if (d.tutar) detailsHtml += `<p>Tutar: ${escapeHtmlDriver(d.tutar)} TL.</p>`;
                  if (d.aciklama) detailsHtml += `<p>A\u00e7\u0131klama: ${escapeHtmlDriver(d.aciklama)}.</p>`;
              } else if (item.eventType === 'kredi-guncelle') {
                  detailsHtml = '<p>Hak mahrumiyeti bilgisi g\u00fcncellendi olarak bildirildi.</p>';
              } else if (item.eventType === 'takip-cihaz-guncelle') {
                  detailsHtml = '<p>Takip cihaz\u0131 bilgisi g\u00fcncellendi olarak bildirildi.</p>';
              } else if (item.eventType === 'not-guncelle') {
                  detailsHtml = '<p>Not bilgisi g\u00fcncellendi olarak bildirildi.</p>';
              } else if (item.eventType === 'sube-degisiklik') {
                  detailsHtml = '<p>\u015eube bilgisi g\u00fcncellendi olarak bildirildi.</p>';
              } else if (item.eventType === 'kullanici-atama') {
                  detailsHtml = '<p>Kullan\u0131c\u0131 atamas\u0131 yap\u0131ld\u0131 olarak bildirildi.</p>';
              } else if (item.eventType === 'driver-feedback') {
                  const konu = getDriverFeedbackHistoryTypeLabel(d.konuTuru || d.konu_turu || d.type);
                  detailsHtml = `<p>${escapeHtmlDriver(konu)} yöneticiye gönderildi.</p>`;
                  if (d.mesaj) detailsHtml += `<p>Mesaj: ${escapeHtmlDriver(d.mesaj)}.</p>`;
              } else {
                  let fallbackLabel = item.eventType || 'G\u00fcncelleme';
                  fallbackLabel = fallbackLabel.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                  detailsHtml = `<p>${escapeHtmlDriver(fallbackLabel)} olarak bildirildi.</p>`;
              }
          }
  
          const card = document.createElement('div');
          card.className = 'history-card';
          const editId = typeof item.id === 'number' ? item.id : JSON.stringify(String(item.id));
          card.setAttribute('data-record-id', String(editId));
          const pencilSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
          card.innerHTML = `
              <div class="history-card-content">
                  <div class="history-header">
                      <span class="history-period">${escapeHtmlDriver(periodLabel)}</span>
                      <span class="history-vehicle">${escapeHtmlDriver(plaka)}</span>
                  </div>
                  <div class="history-details-row">
                      <div class="history-details">${detailsHtml}</div>
                      ${showEditBtn ? `<button type="button" onclick="showEditRequest(${editId})" class="history-edit-icon" title="Düzeltme Talep Et" aria-label="Düzeltme Talep Et">${pencilSvg}</button>` : ''}
                  </div>
              </div>
          `;
          listEl.appendChild(card);
      });
  }
  
  window.closeHistory = function() {
      document.getElementById('history-modal').classList.remove('show');
      updateDriverModalBodyClass();
  };
  
  // Düzeltme talebi - kartla aynı kural: sadece ilgili bölüm gösterilir (kaza > bakım > km)
  window.showEditRequest = function(recordId) {
      const record = window._historyRecordMap && window._historyRecordMap[recordId];
      if (!record) return;
      currentRecordId = recordId;
      document.getElementById('current-km').textContent = formatKm(record.guncel_km) || '0';
      document.getElementById('new-km').value = '';
      document.getElementById('new-km').placeholder = formatKm(record.guncel_km) || 'Örn: 54230';
      
      document.getElementById('current-bakim').textContent = record.bakim_durumu ? capitalizeWords(record.bakim_aciklama || 'Var') : 'Yok';
      document.getElementById('new-bakim').value = '';
      document.getElementById('new-bakim').placeholder = record.bakim_durumu ? capitalizeWords(record.bakim_aciklama || '') : "Boş bırakırsanız 'Yok' sayılır";
      
      document.getElementById('current-kaza').textContent = record.kaza_durumu ? capitalizeWords(record.kaza_aciklama || 'Var') : 'Yok';
      document.getElementById('new-kaza').value = '';
      document.getElementById('new-kaza').placeholder = record.kaza_durumu ? capitalizeWords(record.kaza_aciklama || '') : "Boş bırakırsanız 'Yok' sayılır";
      
      document.getElementById('edit-reason').value = '';
  
      var sectionKm = document.getElementById('edit-section-km');
      var sectionBakim = document.getElementById('edit-section-bakim');
      var sectionKaza = document.getElementById('edit-section-kaza');
      if (sectionKm) sectionKm.style.display = 'none';
      if (sectionBakim) sectionBakim.style.display = 'none';
      if (sectionKaza) sectionKaza.style.display = 'none';
      if (record.kaza_durumu) {
          if (sectionKaza) sectionKaza.style.display = 'block';
          window._editRequestVisibleSection = 'kaza';
      } else if (record.bakim_durumu) {
          if (sectionBakim) sectionBakim.style.display = 'block';
          window._editRequestVisibleSection = 'bakim';
      } else {
          if (sectionKm) sectionKm.style.display = 'block';
          window._editRequestVisibleSection = 'km';
      }
  
      document.getElementById('edit-request-modal').classList.add('show');
      updateDriverModalBodyClass();
      var row = document.querySelector('#history-modal .history-card[data-record-id="' + String(recordId) + '"]');
      if (row) row.classList.add('history-row-editing');
  };
  
  window.closeEditRequest = function() {
      document.querySelectorAll('#history-modal .history-card.history-row-editing').forEach(function(el) { el.classList.remove('history-row-editing'); });
      document.getElementById('edit-request-modal').classList.remove('show');
      currentRecordId = null;
      updateDriverModalBodyClass();
  };
  
  window.submitEditRequest = async function() {
      if (!ensureDriverOnlineForWrite()) return;
      const record = window._historyRecordMap && window._historyRecordMap[currentRecordId];
      if (!record) return;
      const visibleSection = window._editRequestVisibleSection || 'km';
      const reason = document.getElementById('edit-reason').value.trim();
      if (!reason) {
          alert('Düzeltme sebebini yazmalısınız!');
          return;
      }
  
      var kmChanged = false, bakimChanged = false, kazaChanged = false;
      var newKm = null, newBakim = '', newKaza = '';
      if (visibleSection === 'km') {
          var newKmVal = document.getElementById('new-km').value.trim();
          newKm = newKmVal ? parseInt(newKmVal.replace(/\./g, ''), 10) : null;
          kmChanged = newKm !== null && newKm !== (record.guncel_km || 0);
          if (newKm !== null && newKm <= 0) {
              alert('Geçerli bir KM değeri girin!');
              return;
          }
      } else if (visibleSection === 'bakim') {
          newBakim = document.getElementById('new-bakim').value.trim();
          var currentBakim = record.bakim_durumu ? (record.bakim_aciklama || '') : '';
          bakimChanged = (newBakim || '') !== (currentBakim || '');
      } else if (visibleSection === 'kaza') {
          newKaza = document.getElementById('new-kaza').value.trim();
          var currentKaza = record.kaza_durumu ? (record.kaza_aciklama || '') : '';
          kazaChanged = (newKaza || '') !== (currentKaza || '');
      }
  
      if (!kmChanged && !bakimChanged && !kazaChanged) {
          alert('En az bir alanda değişiklik yapmalısınız!');
          return;
      }
  
      const payload = { kayit_id: currentRecordId, sebep: reason };
      if (kmChanged && newKm !== null) payload.yeni_km = newKm;
      if (bakimChanged) {
          payload.yeni_bakim_durumu = newBakim ? 1 : 0;
          payload.yeni_bakim_aciklama = capitalizeWords(newBakim);
      }
      if (kazaChanged) {
          payload.yeni_kaza_durumu = newKaza ? 1 : 0;
          payload.yeni_kaza_aciklama = capitalizeWords(newKaza);
      }
      try {
          const response = await fetch(API_BASE + 'driver_request.php', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer ' + currentToken
              },
              body: JSON.stringify(payload)
          });
          
          const data = await response.json();
          
          if (data.success) {
              alert('✓ Düzeltme talebiniz gönderildi. Admin onayı bekleniyor.');
              closeEditRequest();
              if (document.getElementById('history-list').parentElement && document.getElementById('history-modal').classList.contains('show')) {
                  renderHistoryList();
              }
          } else {
              alert('❌ ' + data.message);
          }
          
      } catch (error) {
          alert('❌ Bağlantı hatası!');
      }
  };

  function setDriverFeedbackMessage(message, isError) {
      const messageEl = document.getElementById('driver-feedback-message-status');
      if (!messageEl) return;
      messageEl.textContent = message || '';
      messageEl.classList.toggle('is-error', !!isError);
      messageEl.classList.toggle('is-success', !!message && !isError);
  }

  /** Talep modalı Konu Türü: kayıt şube dropdown ile aynı koyu liste (native select yerine). */
  function closeDriverFeedbackTypeList() {
      var list = document.getElementById('driver-feedback-type-list');
      var trigger = document.getElementById('driver-feedback-type-trigger');
      if (!list || !trigger) return;
      unbindFeedbackTypeOutsideClose();
      list.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
      list.setAttribute('aria-hidden', 'true');
      list.style.position = '';
      list.style.top = '';
      list.style.bottom = '';
      list.style.left = '';
      list.style.right = '';
      list.style.width = '';
      list.style.maxHeight = '';
      list.style.overflowY = '';
      list.style.marginTop = '';
      list.style.marginBottom = '';
      list.style.zIndex = '';
  }

  function syncDriverFeedbackTypeTriggerFromSelect() {
      var select = document.getElementById('driver-feedback-type');
      var trigger = document.getElementById('driver-feedback-type-trigger');
      var list = document.getElementById('driver-feedback-type-list');
      if (!select || !trigger || !list) return;
      var idx = select.selectedIndex >= 0 ? select.selectedIndex : 0;
      var opt = select.options[idx];
      trigger.textContent = opt ? opt.textContent : '';
      var val = select.value;
      list.querySelectorAll('.vehicle-branch-option').forEach(function(o) {
          o.classList.toggle('selected', o.getAttribute('data-value') === val);
      });
  }

  function positionDriverFeedbackTypeList() {
      var trigger = document.getElementById('driver-feedback-type-trigger');
      var list = document.getElementById('driver-feedback-type-list');
      if (!trigger || !list) return;
      var r = trigger.getBoundingClientRect();
      var gap = 6;
      var edgePad = 10;
      var footerReserve = 56;
      var vh = window.innerHeight || document.documentElement.clientHeight || 640;
      var vw = window.innerWidth || document.documentElement.clientWidth || 400;
      var spaceBelow = Math.max(0, Math.floor(vh - r.bottom - gap - edgePad - footerReserve));
      var spaceAbove = Math.max(0, Math.floor(r.top - gap - edgePad));
      var desired = Math.max(list.scrollHeight || 0, 160);
      var useAbove = spaceBelow < Math.min(96, desired) && spaceAbove > spaceBelow;
      var rawMax = useAbove ? spaceAbove : spaceBelow;
      var listMaxHeight = Math.min(260, Math.max(52, rawMax));
      var w = Math.min(Math.max(120, r.width), vw - 2 * edgePad);
      var left = Math.min(Math.max(edgePad, r.left), vw - w - edgePad);
      list.style.position = 'fixed';
      list.style.left = left + 'px';
      list.style.width = w + 'px';
      list.style.right = 'auto';
      list.style.marginTop = '0';
      list.style.marginBottom = '0';
      list.style.maxHeight = listMaxHeight + 'px';
      list.style.overflowY = 'auto';
      list.style.zIndex = '10060';
      if (useAbove) {
          list.style.top = 'auto';
          list.style.bottom = Math.max(edgePad, vh - r.top + gap) + 'px';
      } else {
          list.style.top = (r.bottom + gap) + 'px';
          list.style.bottom = 'auto';
      }
  }

  var feedbackTypeOutsideBound = false;
  function outsideCloseFeedbackType(ev) {
      var list = document.getElementById('driver-feedback-type-list');
      var wrap = document.querySelector('#driver-feedback-modal .driver-feedback-type-dropdown-wrap');
      if (!list || !list.classList.contains('open')) return;
      if (wrap && ev.target && typeof wrap.contains === 'function' && wrap.contains(ev.target)) return;
      closeDriverFeedbackTypeList();
  }
  function bindFeedbackTypeOutsideClose() {
      if (feedbackTypeOutsideBound) return;
      feedbackTypeOutsideBound = true;
      document.addEventListener('click', outsideCloseFeedbackType, true);
  }
  function unbindFeedbackTypeOutsideClose() {
      if (!feedbackTypeOutsideBound) return;
      feedbackTypeOutsideBound = false;
      document.removeEventListener('click', outsideCloseFeedbackType, true);
  }

  function initDriverFeedbackTypeCustomSelect() {
      var select = document.getElementById('driver-feedback-type');
      var trigger = document.getElementById('driver-feedback-type-trigger');
      var list = document.getElementById('driver-feedback-type-list');
      var wrap = document.querySelector('#driver-feedback-modal .driver-feedback-type-dropdown-wrap');
      if (!select || !trigger || !list || !wrap) return;
      if (trigger.dataset.feedbackTypeBound === '1') return;
      trigger.dataset.feedbackTypeBound = '1';

      function rebuildOptionRows() {
          list.innerHTML = '';
          for (var i = 0; i < select.options.length; i++) {
              var opt = select.options[i];
              var div = document.createElement('div');
              div.className = 'vehicle-branch-option';
              div.setAttribute('role', 'option');
              div.setAttribute('data-value', opt.value);
              div.textContent = opt.textContent;
              list.appendChild(div);
          }
          syncDriverFeedbackTypeTriggerFromSelect();
      }
      rebuildOptionRows();

      trigger.addEventListener('click', function(ev) {
          ev.preventDefault();
          ev.stopPropagation();
          var isOpen = list.classList.contains('open');
          if (isOpen) {
              closeDriverFeedbackTypeList();
          } else {
              list.classList.add('open');
              trigger.setAttribute('aria-expanded', 'true');
              list.setAttribute('aria-hidden', 'false');
              positionDriverFeedbackTypeList();
              requestAnimationFrame(function() {
                  positionDriverFeedbackTypeList();
                  setTimeout(function() { bindFeedbackTypeOutsideClose(); }, 0);
              });
          }
      });
      trigger.addEventListener('keydown', function(ev) {
          if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              trigger.click();
          }
          if (ev.key === 'Escape' && list.classList.contains('open')) {
              ev.preventDefault();
              closeDriverFeedbackTypeList();
          }
      });

      list.addEventListener('click', function(ev) {
          var option = ev.target.closest('.vehicle-branch-option');
          if (!option || !option.hasAttribute('data-value')) return;
          var value = option.getAttribute('data-value');
          select.value = value;
          list.querySelectorAll('.vehicle-branch-option').forEach(function(o) { o.classList.remove('selected'); });
          option.classList.add('selected');
          trigger.textContent = option.textContent;
          closeDriverFeedbackTypeList();
          select.dispatchEvent(new Event('change', { bubbles: true }));
      });

      /* Dışarı tık: aynı tıklama döngüsünde kapanmayı önlemek için listener event’ten sonra eklenir */
      document.addEventListener('keydown', function(ev) {
          if (ev.key !== 'Escape') return;
          if (!list.classList.contains('open')) return;
          ev.preventDefault();
          closeDriverFeedbackTypeList();
      }, true);
      window.addEventListener('resize', function() {
          if (list.classList.contains('open')) closeDriverFeedbackTypeList();
      });
  }

  if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initDriverFeedbackTypeCustomSelect);
  } else {
      initDriverFeedbackTypeCustomSelect();
  }

  window.openDriverFeedbackModal = function() {
      const modal = document.getElementById('driver-feedback-modal');
      const form = document.getElementById('driver-feedback-form');
      if (!modal) return;
      closeDriverFeedbackTypeList();
      if (form) form.reset();
      syncDriverFeedbackTypeTriggerFromSelect();
      setDriverFeedbackMessage('', false);
      const vehicle = typeof getSelectedVehicle === 'function' ? getSelectedVehicle() : null;
      const vid = vehicle && vehicle.id != null ? String(vehicle.id) : '';
      if (vid) {
          const inner = document.querySelector('.driver-action-area-inner[data-vehicle-id="' + vid + '"]');
          if (inner) inner.classList.add('driver-feedback-panel-open');
      }
      modal.classList.add('show');
      updateDriverModalBodyClass();
      /* iOS: textarea’ya otomatik odak tür seçicide ilk dokunuşu / klavyeyi bozabiliyor */
  };

  window.closeDriverFeedbackModal = function() {
      const modal = document.getElementById('driver-feedback-modal');
      const form = document.getElementById('driver-feedback-form');
      closeDriverFeedbackTypeList();
      if (modal) modal.classList.remove('show');
      if (form) form.reset();
      setDriverFeedbackMessage('', false);
      document.querySelectorAll('.driver-action-area-inner.driver-feedback-panel-open').forEach(function(el) {
          el.classList.remove('driver-feedback-panel-open');
      });
      updateDriverModalBodyClass();
  };

  window.submitDriverFeedback = async function(event) {
      if (event && event.preventDefault) event.preventDefault();
      if (!ensureDriverOnlineForWrite()) return false;
      const vehicle = getSelectedVehicle();
      const typeEl = document.getElementById('driver-feedback-type');
      const messageEl = document.getElementById('driver-feedback-message');
      const submitBtn = document.getElementById('driver-feedback-submit');
      const type = typeEl ? String(typeEl.value || '').trim() : '';
      const message = messageEl ? String(messageEl.value || '').trim() : '';

      if (!vehicle || vehicle.id == null) {
          setDriverFeedbackMessage('Taşıt bilgisi bulunamadı.', true);
          return false;
      }
      if (!type) {
          setDriverFeedbackMessage('Konu türünü seçmelisiniz.', true);
          return false;
      }
      if (!message) {
          setDriverFeedbackMessage('Mesaj alanını doldurmalısınız.', true);
          return false;
      }
      const messageFormatted = capitalizeWords(message);
      if (messageFormatted.length > 500) {
          setDriverFeedbackMessage('Mesaj çok uzun. En fazla 500 karakter yazabilirsiniz.', true);
          return false;
      }
      if (messageEl) messageEl.value = messageFormatted;

      if (submitBtn) submitBtn.disabled = true;
      setDriverFeedbackMessage('Gönderiliyor...', false);

      try {
          const response = await fetch(API_BASE + 'driver_feedback.php', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer ' + currentToken
              },
              body: JSON.stringify({
                  arac_id: vehicle.id,
                  konu_turu: type,
                  mesaj: messageFormatted
              })
          });
          const data = await response.json();
          if (data && data.success) {
              var feedbackTimestamp = data.talep_tarihi || new Date().toISOString();
              var localVehicle = (allHistoryVehicles || []).find(function(v) {
                  return String(v.id) === String(vehicle.id);
              });
              if (localVehicle) {
                  if (!Array.isArray(localVehicle.events)) localVehicle.events = [];
                  localVehicle.events.unshift({
                      id: data.event_id || ('feedback-' + (data.talep_id || Date.now())),
                      type: 'driver-feedback',
                      date: feedbackTimestamp.slice(0, 10),
                      timestamp: feedbackTimestamp,
                      data: {
                          konuTuru: type,
                          mesaj: messageFormatted
                      }
                  });
              }
              setDriverFeedbackMessage('Talebiniz yöneticiye gönderildi.', false);
              setTimeout(function() {
                  closeDriverFeedbackModal();
              }, 700);
          } else {
              setDriverFeedbackMessage((data && data.message) || 'Talep gönderilemedi.', true);
          }
      } catch (error) {
          setDriverFeedbackMessage('Bağlantı hatası oluştu.', true);
      } finally {
          if (submitBtn) submitBtn.disabled = false;
      }

      return false;
  };

  function setDriverPasswordMessage(message, isError) {
      const messageEl = document.getElementById('driver-password-message');
      if (!messageEl) return;
      messageEl.textContent = message || '';
      messageEl.classList.toggle('is-error', !!isError);
      messageEl.classList.toggle('is-success', !!message && !isError);
  }

  function clearSavedDriverPassword() {
      try {
          localStorage.removeItem('driver_saved_password');
      } catch (e) {}
  }

  window.openDriverPasswordModal = function() {
      const modal = document.getElementById('driver-password-modal');
      const form = document.getElementById('driver-password-form');
      if (!modal) return;
      if (form) form.reset();
      setDriverPasswordMessage('', false);
      modal.classList.add('show');
      updateDriverModalBodyClass();
      setTimeout(function() {
          const currentInput = document.getElementById('driver-current-password');
          if (currentInput) currentInput.focus();
      }, 50);
  };

  window.closeDriverPasswordModal = function() {
      const modal = document.getElementById('driver-password-modal');
      const form = document.getElementById('driver-password-form');
      if (modal) modal.classList.remove('show');
      if (form) form.reset();
      setDriverPasswordMessage('', false);
      updateDriverModalBodyClass();
  };

  window.submitDriverPasswordChange = async function(event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      if (!ensureDriverOnlineForWrite()) return false;
      if (!currentToken) {
          logout();
          return false;
      }

      const currentInput = document.getElementById('driver-current-password');
      const newInput = document.getElementById('driver-new-password');
      const confirmInput = document.getElementById('driver-new-password-confirm');
      const submitBtn = document.getElementById('driver-password-submit');
      const currentPassword = currentInput ? currentInput.value.trim() : '';
      const newPassword = newInput ? newInput.value.trim() : '';
      const confirmPassword = confirmInput ? confirmInput.value.trim() : '';

      if (!currentPassword || !newPassword || !confirmPassword) {
          setDriverPasswordMessage('Tüm şifre alanlarını doldurun.', true);
          return false;
      }
      if (newPassword.length < 6) {
          setDriverPasswordMessage('Yeni şifre en az 6 karakter olmalı.', true);
          return false;
      }
      if (newPassword !== confirmPassword) {
          setDriverPasswordMessage('Yeni şifre tekrarı eşleşmiyor.', true);
          return false;
      }
      if (newPassword === currentPassword) {
          setDriverPasswordMessage('Yeni şifre mevcut şifreyle aynı olamaz.', true);
          return false;
      }

      if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Kaydediliyor...';
      }
      setDriverPasswordMessage('', false);

      try {
          const response = await fetch(API_BASE + 'driver_change_password.php', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer ' + currentToken
              },
              body: JSON.stringify({
                  currentPassword: currentPassword,
                  newPassword: newPassword
              })
          });
          const data = await response.json();

          if (!response.ok || !data.success) {
              setDriverPasswordMessage((data && data.message) || 'Şifre değiştirilemedi.', true);
              return false;
          }

          setDriverPasswordMessage('Şifre değiştirildi. Yeniden giriş yapmanız gerekiyor.', false);
          clearSavedDriverPassword();
          clearStoredPortalTokens();
          setTimeout(function() {
              window.location.href = DRIVER_PAGE_BASE + 'index.html';
          }, 900);
      } catch (error) {
          setDriverPasswordMessage('Bağlantı hatası. Lütfen tekrar deneyin.', true);
      } finally {
          if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = 'Kaydet';
          }
      }

      return false;
  };

  // Çıkış
  window.logout = function() {
      clearSavedDriverPassword();
      clearStoredPortalTokens();
      window.location.href = DRIVER_PAGE_BASE + 'index.html';
  };
