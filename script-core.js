/* =========================================
   TAŞIT YÖNETİM SİSTEMİ - CORE SCRIPT
   ========================================= */

var _cachedMenu, _cachedNotif, _cachedSubmenu;
function getMenu() { return _cachedMenu || (_cachedMenu = document.getElementById('settings-menu')); }
function getNotif() { return _cachedNotif || (_cachedNotif = document.getElementById('notifications-dropdown')); }
function getSubmenu() { return _cachedSubmenu || (_cachedSubmenu = document.getElementById('data-submenu')); }
function setNotificationsOpenState(isOpen) {
  const notif = getNotif();
  const shouldOpen = !!(notif && isOpen);
  if (typeof window.resetNotificationsDropdownLayoutState === 'function') {
    window.resetNotificationsDropdownLayoutState();
  }
  if (notif) notif.classList.toggle('open', shouldOpen);
  document.body.classList.toggle('notifications-open', shouldOpen);
  return shouldOpen;
}
window.setNotificationsOpenState = setNotificationsOpenState;

function toggleSettingsMenu(e) {
  if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
  const menu = getMenu();
  setNotificationsOpenState(false);
  if (menu) menu.classList.toggle('open');
}
window.toggleSettingsMenu = toggleSettingsMenu;

function toggleNotifications(e) {
  if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
  const notif = getNotif();
  const menu = getMenu();
  if (menu) menu.classList.remove('open');
  if (notif) {
    var willOpen = !notif.classList.contains('open');
    setNotificationsOpenState(willOpen);
    if (willOpen && typeof window.syncMobileNotificationsDropdownHeight === 'function') {
      requestAnimationFrame(function() {
        window.syncMobileNotificationsDropdownHeight();
        requestAnimationFrame(function() {
          window.syncMobileNotificationsDropdownHeight();
          requestAnimationFrame(window.syncMobileNotificationsDropdownHeight);
        });
      });
    }
  }
}
window.toggleNotifications = toggleNotifications;

function showDataSubmenu() {
  const submenu = getSubmenu();
  if (submenu) submenu.classList.add('open');
}

function hideDataSubmenu(e) {
  const submenu = getSubmenu();
  if (!submenu) return;
  const next = e && e.relatedTarget ? e.relatedTarget : null;
  if (next && (submenu.contains(next) || (e.currentTarget && e.currentTarget.contains(next)))) {
    return;
  }
  submenu.classList.remove('open');
}

document.addEventListener('click', (e) => {
  const menu = getMenu();
  const notif = getNotif();
  const submenu = getSubmenu();
  
  // Settings menu içindeki click'leri ignore et (butonlar çalışsın)
  if (menu && menu.contains(e.target)) {
    return; 
  }
  
  // Submenu içindeki click'leri de ignore et
  if (submenu && submenu.contains(e.target)) {
    return;
  }
  // Bildirim paneli içindeki click'leri de ignore et (toolbar ve kart tıklamaları çalışsın)
  if (notif && notif.contains(e.target)) {
    return;
  }
  
  // Dışarı tıklandığında menüleri kapat
  if (menu && menu.classList.contains('open')) {
    menu.classList.remove('open');
  }
  if (notif && notif.classList.contains('open')) {
    setNotificationsOpenState(false);
  }
  if (submenu && submenu.classList.contains('open')) {
    submenu.classList.remove('open');
  }
});

/* =========================================
   UTILITY FUNCTIONS (Global - DRY)
   ========================================= */
window.escapeHtml = function(text) {
  if (text == null || text === '') return '';
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

window.formatNumber = function(num) {
  if (num == null || num === '' || num === '-') return '-';
  var numStr = String(num).replace(/[^\d]/g, '');
  if (!numStr) return '-';
  return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

/** Attribute içeriği için HTML escape (& " < > ') */
window.escapeAttr = function(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};

/** KM gösterimi: rakam + binlik nokta; boşta '–' (rapor/admin ile uyumlu) */
window.formatKm = function(value) {
  if (value == null || value === '') return '–';
  var numStr = String(value).replace(/[^\d]/g, '');
  if (!numStr) return '–';
  return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

/** Kelimelerin ilk harfi büyük (tr-TR); tire ile ayrılan parçalar da büyütülür (Mercedes-Benz) */
window.capitalizeWords = function(str) {
  if (!str || typeof str !== 'string') return str;
  return str.split(/\s+/).map(function(w) {
    if (!w) return w;
    return w.split('-').map(function(part) {
      if (!part) return part;
      return part.charAt(0).toLocaleUpperCase('tr-TR') + part.slice(1).toLocaleLowerCase('tr-TR');
    }).join('-');
  }).join(' ');
};

/** Tarih uyarı sınıfı (geçmiş/≤3 gün kırmızı, ≤21 gün turuncu) */
window.checkDateWarnings = function(dateString) {
  if (!dateString) return { class: '', days: null };
  var date = new Date(dateString + 'T00:00:00');
  if (isNaN(date.getTime())) return { class: '', days: null };
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  var diffDays = Math.ceil((date - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { class: 'date-warning-red', days: diffDays };
  if (diffDays <= 3) return { class: 'date-warning-red', days: diffDays };
  if (diffDays <= 21) return { class: 'date-warning-orange', days: diffDays };
  return { class: '', days: diffDays };
};

/** Kısa tarih: Date veya string → gg/aa/yyyy (padStart bazı WebKit sürümlerinde RangeError verebilir, güvenli sarmalayıcı) */
window.formatDateShort = function(dateStr) {
  if (!dateStr) return '';
  function pad2(n) { var s = String(n); return s.length >= 2 ? s : '0' + s; }
  function isValidDateParts(day, month, year) {
    var d = parseInt(day, 10);
    var m = parseInt(month, 10);
    var y = parseInt(year, 10);
    if (!d || !m || !y || m < 1 || m > 12) return false;
    var dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === (m - 1) && dt.getDate() === d;
  }
  if (dateStr instanceof Date) {
    var d = dateStr;
    if (isNaN(d.getTime())) return '';
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
  }
  var str = String(dateStr).trim();
  var digits = str.replace(/[^\d]/g, '');
  if (digits.length === 8) {
    var dd = digits.slice(0, 2);
    var mm = digits.slice(2, 4);
    var yyyy = digits.slice(4, 8);
    if (isValidDateParts(dd, mm, yyyy)) return dd + '/' + mm + '/' + yyyy;

    var yyyyAlt = digits.slice(0, 4);
    var mmAlt = digits.slice(4, 6);
    var ddAlt = digits.slice(6, 8);
    if (isValidDateParts(ddAlt, mmAlt, yyyyAlt)) return ddAlt + '/' + mmAlt + '/' + yyyyAlt;
  }
  if (str.indexOf('-') !== -1) {
    var parts = str.split('-');
    if (parts.length === 3) {
      var p0 = (parts[0] || '').trim();
      var p1 = (parts[1] || '').trim();
      var p2 = (parts[2] || '').trim();
      if (p0.length === 4 && p1.length <= 2 && p2.length <= 2 && isValidDateParts(p2, p1, p0)) {
        return pad2(p2) + '/' + pad2(p1) + '/' + p0;
      }
      if (p2.length === 4 && p0.length <= 2 && p1.length <= 2 && isValidDateParts(p0, p1, p2)) {
        return pad2(p0) + '/' + pad2(p1) + '/' + p2;
      }
    }
  }
  if (str.indexOf('/') !== -1) return str;
  return str;
};

/** Başlık formatı: kelime başı büyük, tire sonrası da (Mercedes-Benz) */
window.toTitleCase = function(str) {
  if (!str || str === '-') return str;
  return String(str).trim().split(/\s+/).map(function(w) {
    if (!w) return w;
    return w.split('-').map(function(part) {
      if (!part) return part;
      return part.charAt(0).toLocaleUpperCase('tr-TR') + part.slice(1).toLocaleLowerCase('tr-TR');
    }).join('-');
  }).join(' ');
};

/**
 * Marka/model: önce toTitleCase; bilinen kısaltmalar tamamen büyük (örn. BMW, VW).
 * Tire ile ayrılan parçalar kelime içinde ayrı kontrol edilir (örn. Mercedes-Benz aynı kalır).
 */
(function() {
  var ALLCAPS_BRAND_KEYS = { bmw: 1, vw: 1, mg: 1, gmc: 1, ram: 1, byd: 1, jmc: 1, ds: 1 };
  window.formatBrandModel = function(str) {
    if (str == null || str === '') return str;
    if (str === '-') return str;
    var trimmed = String(str).trim();
    if (!trimmed) return '';
    var titled = typeof window.toTitleCase === 'function' ? window.toTitleCase(trimmed) : trimmed;
    if (!titled) return trimmed;
    return titled.split(/\s+/).map(function(w) {
      if (!w) return w;
      return w.split('-').map(function(part) {
        if (!part) return part;
        var key = part.toLocaleLowerCase('tr-TR');
        if (ALLCAPS_BRAND_KEYS[key]) {
          return part.toLocaleUpperCase('tr-TR');
        }
        return part;
      }).join('-');
    }).join(' ');
  };
})();

/** UI/disk rol alanını uygulama içi normalize anahtara çevirir (portal, ayarlar, raporlar ortak) */
window.medisaMapUiRoleToRol = function(role) {
  if (role === 'admin') return 'genel_yonetici';
  if (role === 'genel_yonetici') return 'genel_yonetici';
  if (role === 'yonetici' || role === 'sube_yonetici') return 'sube_yonetici';
  if (role === 'driver' || role === 'sales' || role === 'surucu') return 'kullanici';
  if (role === 'yonetici_kullanici') return 'sube_yonetici';
  return role || 'kullanici';
};

window.medisaGetUiRoleFromUser = function(user) {
  return window.medisaMapUiRoleToRol(user && (user.role || user.rol || user.tip));
};

/** Ayarlar kullanıcı kartları: Yönetici; sales/driver → Kullanıcı */
window.getUserRoleLabelManagement = function(user) {
  var labels = {
    genel_yonetici: 'Genel Yönetici',
    sube_yonetici: 'Yönetici',
    kullanici: 'Kullanıcı',
    admin: 'Genel Yönetici',
    sales: 'Kullanıcı',
    driver: 'Kullanıcı'
  };
  var uiRole = window.medisaGetUiRoleFromUser(user || {});
  return labels[uiRole] || labels[window.medisaMapUiRoleToRol(uiRole)] || uiRole || 'Kullanıcı';
};

/** Raporlar / admin: Yönetici; Satış Temsilcisi (ayarlar metinlerinden ayrı ürün dili) */
window.getUserRoleLabelAnalytics = function(user) {
  var labels = {
    genel_yonetici: 'Genel Yönetici',
    sube_yonetici: 'Yönetici',
    kullanici: 'Kullanıcı',
    admin: 'Genel Yönetici',
    sales: 'Satış Temsilcisi',
    driver: 'Kullanıcı'
  };
  var role = user && user.role ? user.role : '';
  var displayRole = role === 'yonetici_kullanici' ? 'sube_yonetici' : role;
  var raw = labels[displayRole] || displayRole || 'Kullanıcı';
  return typeof window.toTitleCase === 'function' ? window.toTitleCase(raw) : raw;
};

/** Gizli yazdırma iframe (ekran dışına taşıma) — tasitlar / tasitlar-yazici */
window.MEDISA_PRINT_IFRAME_CSS_TEXT = 'position:fixed;left:0;top:0;width:100vw;height:100vh;border:0;opacity:0.01;pointer-events:none;visibility:visible;transform:translateX(-200vw);background:#fff;z-index:-1;';

/** Plaka: bitişik + tamamen büyük harf (örn. 34ABC123); boşluklar kaldırılır */
window.formatPlaka = function(str) {
  if (str == null || str === '') return '-';
  if (str === '-') return '-';
  var s = String(str).replace(/\s+/g, '').trim();
  return s === '' ? '-' : s.toLocaleUpperCase('tr-TR');
};

/** Ad Soyad: adlar baş harf büyük, soyad tamamen büyük (tr-TR) */
window.formatAdSoyad = function(str) {
  if (!str || str === '-') return str;
  var t = String(str).trim().replace(/\s+/g, ' ');
  if (!t) return str;
  var parts = t.split(' ');
  if (parts.length === 1) {
    return typeof window.toTitleCase === 'function' ? window.toTitleCase(parts[0]) : parts[0];
  }
  var lastName = parts.pop().toLocaleUpperCase('tr-TR');
  var firstName = parts.join(' ');
  if (typeof window.toTitleCase === 'function') {
    firstName = window.toTitleCase(firstName);
  }
  return (firstName ? firstName + ' ' : '') + lastName;
};

window.medisaFitTextWithinBox = function(root, selector, options) {
  var scope = root && typeof root.querySelectorAll === 'function' ? root : document;
  if (!scope || !selector) return;
  var opts = options || {};
  var minFontSize = Number(opts.minFontSize);
  var maxReduction = Number(opts.maxReduction);
  var step = Number(opts.step) || 0.5;
  var tolerance = Number(opts.tolerance);
  if (!Number.isFinite(tolerance)) tolerance = 1;

  requestAnimationFrame(function() {
    var elements = scope.querySelectorAll(selector);
    Array.prototype.forEach.call(elements, function(el) {
      if (!el || !el.getClientRects || el.getClientRects().length === 0) return;

      el.style.removeProperty('font-size');
      var computed = window.getComputedStyle ? window.getComputedStyle(el) : null;
      var baseSize = computed ? parseFloat(computed.fontSize) : 0;
      if (!Number.isFinite(baseSize) || baseSize <= 0) return;

      var reduction = Number.isFinite(maxReduction) && maxReduction > 0 ? maxReduction : 4;
      var floorSize = Number.isFinite(minFontSize) && minFontSize > 0 ? minFontSize : Math.max(9.5, baseSize - reduction);
      var currentSize = baseSize;

      while (
        currentSize > floorSize &&
        (el.scrollWidth > el.clientWidth + tolerance || el.scrollHeight > el.clientHeight + tolerance)
      ) {
        currentSize = Math.max(floorSize, currentSize - step);
        el.style.setProperty('font-size', currentSize + 'px', 'important');
      }
    });
  });
};

/** Kolon state: localStorage'dan oku (key → JSON); yoksa default dön */
window.loadColumnState = function(key, defaultVal) {
  try {
    var raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return defaultVal;
};

/** Kolon state: localStorage'a yaz */
window.saveColumnState = function(key, state) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch (e) {}
};

/**
 * Service Worker ortak kayıt: paths ve scope ile dene, güncelleme bildirimi opsiyonel.
 * @param {Object} opts - { paths: string[], scope: string, onUpdate?: function() }
 */
window.registerServiceWorker = function(opts) {
  if (!('serviceWorker' in navigator) || !opts || !Array.isArray(opts.paths) || !opts.scope) return;
  var currentPathIndex = 0;
  var paths = opts.paths;
  var scope = opts.scope;
  var onUpdate = opts.onUpdate || null;
  function tryRegister() {
    if (currentPathIndex >= paths.length) return;
    var swPath = paths[currentPathIndex];
    navigator.serviceWorker.register(swPath, { scope: scope })
      .then(function(registration) {
        if (onUpdate && registration) {
          registration.addEventListener('updatefound', function() {
            var newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', function() {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  onUpdate();
                }
              });
            }
          });
        }
      })
      .catch(function(e) {
        currentPathIndex++;
        tryRegister();
      });
  }
  window.addEventListener('load', function() {
    tryRegister();
  });
};

window.debounce = function(fn, ms) {
  var t;
  return function() {
    var a = arguments;
    clearTimeout(t);
    t = setTimeout(function() { fn.apply(null, a); }, ms);
  };
};

/** Hata loglama – kullanıcıya göstermeden teknik bilgiyi konsola yazar */
window.__medisaLogError = function(context, error, extra) {
  var msg = error && (error.message || String(error));
  console.error('[Medisa]', context, msg, error && error.stack ? error.stack : '', extra || '');
};

window.resetModalInputs = function(modalElement) {
  if (!modalElement) return;
  var activeEl = document.activeElement;
  if (activeEl && modalElement.contains(activeEl) && typeof activeEl.blur === 'function') {
    activeEl.blur();
  }

  modalElement.querySelectorAll('input, textarea, select').forEach(function(el) {
    if (el.tagName === 'SELECT') {
      el.selectedIndex = 0;
      el.value = '';
    } else if (el.type === 'checkbox' || el.type === 'radio') {
      el.checked = false;
    } else {
      el.value = '';
    }
    el.classList.remove('field-error', 'has-value');
  });

  modalElement.querySelectorAll('.radio-btn').forEach(function(btn) {
    btn.classList.remove('active', 'green');
  });
};

/* =========================================
   LAZY LOAD – Modül JS/CSS dinamik yükleme (Faz 1 & 2)
   ========================================= */
window.__loadedAppModules = window.__loadedAppModules || Object.create(null);

/**
 * İstenen JS ve CSS dosyalarını document.createElement ile dinamik yükler.
 * Zaten yüklüyse tekrar yüklemez. Yüklendikten sonra Promise döner.
 * @param {string} jsPath - Örn. 'tasitlar.js?v=' + TASITLAR_MODULE_VERSION
 * @param {string|null|string[]} cssPathOrArray - Tek CSS yolu veya sıralı birden fazla (opsiyonel)
 * @returns {Promise<void>}
 */
window.loadAppModule = function(jsPath, cssPathOrArray) {
  var cssList = [];
  if (Array.isArray(cssPathOrArray)) {
    cssPathOrArray.forEach(function(h) {
      if (h) cssList.push(h);
    });
  } else if (cssPathOrArray) {
    cssList.push(cssPathOrArray);
  }
  var key = (jsPath || '') + '|' + cssList.join('|');
  if (window.__loadedAppModules[key]) {
    return Promise.resolve();
  }
  function loadCss(href) {
    return new Promise(function(resolve, reject) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = function() { resolve(); };
      link.onerror = function() { resolve(); }
      document.head.appendChild(link);
    });
  }
  function loadScript(src) {
    return new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.onload = function() { resolve(); };
      script.onerror = function() { reject(new Error('Script yüklenemedi: ' + src)); };
      document.head.appendChild(script);
    });
  }
  /* Çoklu CSS: sırayı koru (base → extra). Paralel yüklemede hangi link son eklenirse belirsiz; liste sütun/başlık kuralları bozuluyordu. */
  var chain = Promise.resolve();
  cssList.forEach(function(href) {
    chain = chain.then(function() { return loadCss(href); });
  });
  chain = chain.then(function() {
    if (jsPath) return loadScript(jsPath);
  });
  return chain.then(function() {
    window.__loadedAppModules[key] = true;
  });
};

var _moduleSpinnerEl = null;
function showModuleSpinner() {
  if (_moduleSpinnerEl) {
    _moduleSpinnerEl.classList.add('active');
    return;
  }
  var wrap = document.createElement('div');
  wrap.id = 'module-load-spinner';
  wrap.className = 'module-load-spinner';
  wrap.setAttribute('aria-live', 'polite');
  wrap.setAttribute('aria-label', 'Yükleniyor');
  wrap.innerHTML = '<div class="module-load-spinner-dot"></div><div class="module-load-spinner-dot"></div><div class="module-load-spinner-dot"></div><span class="module-load-spinner-text">Yükleniyor…</span>';
  document.body.appendChild(wrap);
  _moduleSpinnerEl = wrap;
  requestAnimationFrame(function() { wrap.classList.add('active'); });
}
function hideModuleSpinner() {
  if (!_moduleSpinnerEl) return;
  _moduleSpinnerEl.classList.remove('active');
  setTimeout(function() {
    if (_moduleSpinnerEl && !_moduleSpinnerEl.classList.contains('active')) {
      _moduleSpinnerEl.style.visibility = 'hidden';
    }
  }, 200);
}

/** Kaporta SVG metni - tek fetch, cache paylaşımı (tasitlar + kayit) */
var _kaportaSvgCache = null;
window.getKaportaSvg = async function() {
  if (_kaportaSvgCache !== null) return _kaportaSvgCache;
  try {
    var res = await fetch('icon/kaporta.svg');
    var text = await res.text();
    _kaportaSvgCache = text || '';
    return _kaportaSvgCache;
  } catch (e) {
    console.error('Kaporta SVG yüklenemedi:', e);
    return '';
  }
};

/* =========================================
   MODAL MANAGER (Global)
   ========================================= */
// Footer dim kontrolü fonksiyonu (Global)
let dimTimeout = null;

var _cachedFooter;
function getFooter() { return _cachedFooter || (_cachedFooter = document.getElementById('app-footer')); }
var _cachedModalOverlays = null;
function refreshModalOverlays() { _cachedModalOverlays = document.querySelectorAll('.modal-overlay'); return _cachedModalOverlays; }
function getModalOverlays() { return _cachedModalOverlays || refreshModalOverlays(); }

// Sayfa yüklendiğinde footer animasyonunu başlat
function startFooterAnimation() {
  const footer = getFooter();
  if (!footer) {
    // Footer bulunamadı
    return;
  }
  
  // Önceki timeout'u temizle
  if (dimTimeout) {
    clearTimeout(dimTimeout);
    dimTimeout = null;
  }
  
  // Başta dimmed ekle (versiyon ve durum normal, MEDISA soluk)
  footer.classList.add('dimmed');
  footer.classList.remove('delayed');
  // Footer animasyonu başladı
  
  // 4 saniye sonra delayed class'ını ekle (versiyon ve durum soluk, MEDISA normal)
  dimTimeout = setTimeout(() => {
    if (footer) {
      footer.classList.add('delayed');
      // Footer animasyonu tamamlandı
    }
  }, 4000);
}

// Modal kontrolü için ayrı fonksiyon
window.updateFooterDim = function() {
  const footer = getFooter();
  if (!footer) return;
  
  let isAnyModalOpen = false;
  getModalOverlays().forEach(modal => {
    if (
      modal.classList.contains('active') ||
      modal.classList.contains('open') ||
      modal.style.display === 'flex'
    ) {
      isAnyModalOpen = true;
    }
  });

  if (isAnyModalOpen) {
    document.body.classList.add('modal-open');
  } else {
    document.body.classList.remove('modal-open');
  }
}

/** Taşıt Detay'a dön - tasitlar.js override eder; yoksa modalları kapat (fallback) */
window.backToVehicleDetail = function() {
  if (typeof window.closeEventMenuModal === 'function') {
    window.closeEventMenuModal();
    if (window.currentDetailVehicleId && typeof window.showVehicleDetail === 'function') {
      window.showVehicleDetail(window.currentDetailVehicleId);
    }
  } else if (typeof window.closeAllModals === 'function') {
    window.closeAllModals();
  }
};

/** Tarihçe modalından anasayfaya dön ve bildirim dropdown'ını aç (X veya ESC) */
window.closeHistoryToHomeAndOpenNotifications = function() {
  if (typeof window.closeAllModals === 'function') {
    window.closeAllModals();
  }
  if (setNotificationsOpenState(true) && typeof window.syncMobileNotificationsDropdownHeight === 'function') {
    requestAnimationFrame(function() {
      window.syncMobileNotificationsDropdownHeight();
      requestAnimationFrame(window.syncMobileNotificationsDropdownHeight);
    });
  }
};

document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  var historyModal = document.getElementById('vehicle-history-modal');
  if (!historyModal) return;
  var isVisible = historyModal.style.display === 'flex' || (historyModal.style.display !== 'none' && historyModal.offsetParent !== null);
  if (isVisible && historyModal.classList.contains('active')) {
    e.preventDefault();
    e.stopPropagation();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  // Sayfa yüklendiğinde footer animasyonunu başlat
  startFooterAnimation();

  // Modal kontrolü için ilk kontrol
  window.updateFooterDim();

  // Modal Observer: class/style veya DOM değişince footer dim + overlay önbelleği
  const modalObserver = new MutationObserver(() => {
    refreshModalOverlays();
    window.updateFooterDim();
  });

  // Modal attribute değişikliklerini izle (footer dim, body.modal-open)
  const allModals = refreshModalOverlays();
  allModals.forEach(modal => {
    modalObserver.observe(modal, { attributes: true, attributeFilter: ['class', 'style'] });
  });

  modalObserver.observe(document.body, { childList: true, subtree: true });
});


// Lazy modül asset sürümleri — tek nesne; index.html içindeki style-core ?v= ile tasitlar sürümü uyumlu kalmalı
var MEDISA_MODULE_VERSIONS = {
  tasitlar: '20260501.2',
  raporlar: '20260501.2',
  kayitJs: '20260429.1',
  kayitCss: '20260501.1',
  ayarlarJs: '20260429.2',
  ayarlarCss: '20260429.2'
};
window.MEDISA_MODULE_VERSIONS = MEDISA_MODULE_VERSIONS;
var TASITLAR_MODULE_VERSION = MEDISA_MODULE_VERSIONS.tasitlar;

// Modal açma fonksiyonları: Lazy load – modül yüklenir, sonra ilgili açma fonksiyonu tetiklenir.
// tasitlar.js / raporlar.js / kayit.js / ayarlar.js yüklendiğinde kendi open* implementasyonlarını yazar.
(function() {
  var V = MEDISA_MODULE_VERSIONS;
  var TASITLAR_JS = 'tasitlar.js?v=' + V.tasitlar;
  var TASITLAR_CSS_LIST = [
    'tasitlar-base.css?v=' + V.tasitlar,
    'tasitlar-extra.css?v=' + V.tasitlar
  ];
  var RAPORLAR_JS = 'raporlar.js?v=' + V.raporlar;
  var RAPORLAR_CSS = 'raporlar.css?v=' + V.raporlar;
  var KAYIT_JS = 'kayit.js?v=' + V.kayitJs;
  var KAYIT_CSS = 'kayit.css?v=' + V.kayitCss;
  var AYARLAR_JS = 'ayarlar.js?v=' + V.ayarlarJs;
  var AYARLAR_CSS = 'ayarlar.css?v=' + V.ayarlarCss;

  window.openVehiclesView = function() {
    showModuleSpinner();
    window.loadAppModule(TASITLAR_JS, TASITLAR_CSS_LIST).then(function() {
      hideModuleSpinner();
      if (typeof window.openVehiclesView === 'function') window.openVehiclesView();
    }).catch(function(err) {
      hideModuleSpinner();
      console.error('[Medisa] Taşıtlar modülü yüklenemedi:', err);
    });
  };

  window.openReportsView = function() {
    showModuleSpinner();
    window.loadAppModule(RAPORLAR_JS, RAPORLAR_CSS).then(function() {
      hideModuleSpinner();
      if (typeof window.openReportsView === 'function') window.openReportsView();
    }).catch(function(err) {
      hideModuleSpinner();
      console.error('[Medisa] Raporlar modülü yüklenemedi:', err);
    });
  };

  window.openVehicleModal = function() {
    showModuleSpinner();
    window.loadAppModule(KAYIT_JS, KAYIT_CSS).then(function() {
      hideModuleSpinner();
      if (typeof window.openVehicleModal === 'function') window.openVehicleModal();
    }).catch(function(err) {
      hideModuleSpinner();
      console.error('[Medisa] Kayıt modülü yüklenemedi:', err);
    });
  };

  function wrapAyarlar(fnName) {
    return function() {
      var args = arguments;
      showModuleSpinner();
      window.loadAppModule(AYARLAR_JS, AYARLAR_CSS).then(function() {
        hideModuleSpinner();
        window._ayarlarLoaded = true;
        if (typeof window[fnName] === 'function') window[fnName].apply(window, args);
      }).catch(function(err) {
        hideModuleSpinner();
        console.error('[Medisa] Ayarlar modülü yüklenemedi:', err);
      });
    };
  }
  window.openBranchManagement = wrapAyarlar('openBranchManagement');
  window.openUserManagement = wrapAyarlar('openUserManagement');
  window.openDisVeriPanel = wrapAyarlar('openDisVeriPanel');
  window.openDataManagement = wrapAyarlar('openDataManagement');
  window.clearCache = wrapAyarlar('clearCache');
  window.exportData = wrapAyarlar('exportData');
  window.restoreFromLastBackup = wrapAyarlar('restoreFromLastBackup');
  window.importData = wrapAyarlar('importData');
  window.tsbKaskoListesiIndir = wrapAyarlar('tsbKaskoListesiIndir');
  window.kaskoExcelYukle = wrapAyarlar('kaskoExcelYukle');

  window.closeVehiclesModal = function() {
    const modal = document.getElementById('vehicles-modal');
    if (modal) {
      modal.classList.remove('active');
      setTimeout(() => {
        modal.style.display = 'none';
        setTimeout(() => window.updateFooterDim(), 100);
      }, 300);
    }
  };

  window.closeReportsModal = function() {
    const modal = document.getElementById('reports-modal');
    if (modal) {
      modal.classList.remove('active');
      setTimeout(() => {
        modal.style.display = 'none';
        setTimeout(() => window.updateFooterDim(), 100);
      }, 300);
    }
  };
})();

/* =========================================
   VERSION DISPLAY (Anasayfa - v78.1)
   ========================================= */
document.addEventListener('DOMContentLoaded', function() {
    var path = (document.location.pathname || '');
    if (path.indexOf('/driver') !== -1 || path.indexOf('/admin') !== -1) return; /* Kullanıcı paneli 78.2, raporlar 78.3 kendi scriptlerinde */
    const APP_VERSION = "v78.1";
    const versionEl = document.getElementById('version-display');

    if (versionEl) {
        const ua = navigator.userAgent || navigator.vendor || window.opera;
        // iOS Tespiti
        const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
        // Mobil Tespiti
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
        // PWA Tespiti
        const isPWA = window.matchMedia('(display-mode: standalone)').matches || (window.navigator.standalone === true);

        let suffix = "";
        if (isPWA) {
            suffix = isIOS ? " iOS PWA" : " PWA";
        } else if (isMobile) {
            suffix = " Mobil";
        }
        // Masaüstü ise suffix boş kalır

        versionEl.textContent = APP_VERSION + suffix;
    }

    // Bildirimleri güncelle (sayfa yüklendiğinde)
    setTimeout(() => {
      if (window.updateNotifications) window.updateNotifications();
    }, 1000);

    // Loading screen'i kapat (index.html'deki window.hideLoading kullanılır)
    if (window.hideLoading) window.hideLoading();
});

// Splash kapanışı index.html tarafında; veri gelince ayrıca bildirim motorunu çalıştır.
window.addEventListener('dataLoaded', () => {
    if (typeof window.hideLoading === 'function') {
        setTimeout(window.hideLoading, 50);
    }

    // Bildirimler tasitlar.js içinde; taşıtlar ekranı açılmadan önce veri gelirse modül burada yüklenir.
    const runNotifications = () => {
        if (typeof window.updateNotifications === 'function') {
            window.updateNotifications();
        }
    };

    if (typeof window.updateNotifications === 'function') {
        runNotifications();
        return;
    }

    if (typeof window.loadAppModule === 'function') {
      var tasitlarJsForNotif = 'tasitlar.js?v=' + TASITLAR_MODULE_VERSION;
      var tasitlarCssForNotif = [
        'tasitlar-base.css?v=' + TASITLAR_MODULE_VERSION,
        'tasitlar-extra.css?v=' + TASITLAR_MODULE_VERSION
      ];
      window.loadAppModule(tasitlarJsForNotif, tasitlarCssForNotif)
            .then(runNotifications)
            .catch(function(err) {
                console.error('[Medisa] Bildirim modülü yüklenemedi:', err);
            });
    }
});

/* =========================================
   SERVICE WORKER REGISTRATION (scope bulunduğu uygulama köküne göre)
   ========================================= */
(function() {
  var host = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : '';
  var isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';

  // Local geliştirmede SW cache kaynaklı eski dosya/503 karışıklığını önle
  if (isLocalhost && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then(function(registrations) {
        registrations.forEach(function(reg) { reg.unregister(); });
      })
      .catch(function() {});
    return;
  }

  var resolveAppRootPath = function(pathname) {
    var parts = String(pathname || '/').split('/').filter(Boolean);
    if (!parts.length) return '/';
    var lastPart = parts[parts.length - 1] || '';
    if (lastPart.indexOf('.') !== -1) parts.pop();
    var lastDir = parts[parts.length - 1] || '';
    if (lastDir === 'admin' || lastDir === 'driver') parts.pop();
    return parts.length ? ('/' + parts.join('/') + '/') : '/';
  };
  var p = (typeof document !== 'undefined' && document.location) ? document.location.pathname : '/';
  var scope = resolveAppRootPath(p);
  var base = scope === '/' ? '' : scope.slice(0, -1);
  var paths = base ? [base + '/sw.js', './sw.js'] : ['./sw.js', '/sw.js'];
  window.registerServiceWorker({
    paths: paths,
    scope: scope,
    onUpdate: function() {
      var toast = document.createElement('div');
      toast.className = 'update-toast';
      toast.innerHTML = '<span class="update-toast-text">Yeni sürüm mevcut</span><button type="button" class="update-toast-btn">Yenile</button>';
      document.body.appendChild(toast);
      requestAnimationFrame(function() { toast.classList.add('visible'); });
      if (toast.querySelector('.update-toast-btn')) {
        toast.querySelector('.update-toast-btn').addEventListener('click', function() { window.location.reload(true); });
      }
    }
  });
})();

/* =========================================
   PWA INSTALL PROMPT HANDLER
   ========================================= */
(function() {
  let deferredInstallPrompt = null;

  function isStandaloneMode() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function getInstallButton() {
    return document.getElementById('pwa-install-btn');
  }

  function getInstallBar() {
    return document.getElementById('pwa-install-bar');
  }

  function removeInstallButton() {
    const bar = getInstallBar();
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    var driverMobileSlot = document.getElementById('driver-mobile-notification-slot');
    if (driverMobileSlot && !driverMobileSlot.querySelector('#pwa-install-bar')) {
      driverMobileSlot.setAttribute('aria-hidden', 'true');
    }
  }

  function showInstallButton() {
    if (isStandaloneMode()) return;
    if (!deferredInstallPrompt) return;
    if (getInstallBar()) return;

    const bar = document.createElement('div');
    bar.id = 'pwa-install-bar';
    bar.className = 'pwa-install-bar';

    const btn = document.createElement('button');
    btn.id = 'pwa-install-btn';
    btn.type = 'button';
    btn.textContent = 'Uygulamayı Yükle';
    btn.className = 'pwa-install-btn';

    btn.addEventListener('click', async function() {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      try {
        await deferredInstallPrompt.userChoice;
      } catch (err) {
        // Kullanıcı prompt'u kapatırsa sessiz devam edilir.
      }
      deferredInstallPrompt = null;
      removeInstallButton();
    });

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'pwa-install-close';
    closeBtn.setAttribute('aria-label', 'İptal');
    closeBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    closeBtn.addEventListener('click', function() {
      removeInstallButton();
    });

    bar.appendChild(btn);
    bar.appendChild(closeBtn);

    var wrapper = document.getElementById('pwa-install-wrapper');
    if (wrapper) {
      wrapper.appendChild(bar);
      var driverMobileSlot = document.getElementById('driver-mobile-notification-slot');
      if (driverMobileSlot && driverMobileSlot.contains(wrapper)) {
        driverMobileSlot.setAttribute('aria-hidden', 'false');
      }
    } else {
      document.body.appendChild(bar);
    }
  }

  window.addEventListener('beforeinstallprompt', function(e) {
    // preventDefault kaldırıldı: tarayıcının standart "Ana Ekrana Ekle" afişi doğal akışında gösterilsin
    deferredInstallPrompt = e;
    showInstallButton();
  });

  window.addEventListener('appinstalled', function() {
    deferredInstallPrompt = null;
    removeInstallButton();
  });
})();

/* =========================================
   EXCELJS LAZY LOAD
   ========================================= */
window.loadExcelJS = function() {
  return new Promise((resolve, reject) => {
    // Zaten yüklüyse direkt dön
    if (typeof ExcelJS !== 'undefined' || typeof window.ExcelJS !== 'undefined') {
      resolve(ExcelJS || window.ExcelJS);
      return;
    }
    
    // Script yükleniyorsa bekle
    if (window.excelJSLoading) {
      window.excelJSLoading.then(resolve).catch(reject);
      return;
    }
    
    // Script'i yükle
    window.excelJSLoading = new Promise((res, rej) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
      script.onload = () => {
        resolve(ExcelJS || window.ExcelJS);
        res(ExcelJS || window.ExcelJS);
      };
      script.onerror = () => {
        const err = new Error('ExcelJS yüklenemedi');
        reject(err);
        rej(err);
      };
      document.head.appendChild(script);
    });
    
    window.excelJSLoading.then(resolve).catch(reject);
  });
};
