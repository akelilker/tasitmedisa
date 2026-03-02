/* =========================================
   TAŞIT YÖNETİM SİSTEMİ - CORE SCRIPT
   ========================================= */

var _cachedMenu, _cachedNotif, _cachedSubmenu;
function getMenu() { return _cachedMenu || (_cachedMenu = document.getElementById('settings-menu')); }
function getNotif() { return _cachedNotif || (_cachedNotif = document.getElementById('notifications-dropdown')); }
function getSubmenu() { return _cachedSubmenu || (_cachedSubmenu = document.getElementById('data-submenu')); }

function toggleSettingsMenu(e) {
  e.stopPropagation();
  const menu = getMenu();
  const notif = getNotif();
  if (notif) notif.classList.remove('open');
  if (menu) menu.classList.toggle('open');
}

function toggleNotifications(e) {
  e.stopPropagation();
  const notif = getNotif();
  const menu = getMenu();
  if (menu) menu.classList.remove('open');
  if (notif) {
    var wasOpen = notif.classList.contains('open');
    notif.classList.toggle('open');
    /* Açılırken sınıfı kaldırma: okunmamışlar kırmızı çerçeve ile görünsün. Kapanırken "okundu" işaretle. */
    if (wasOpen) {
      var keys = [];
      notif.querySelectorAll('.notification-item-activity[data-notif-key]').forEach(function(el) {
        var k = (el.getAttribute('data-notif-key') || '').toString().trim();
        if (k) keys.push(k);
      });
      if (keys.length) {
        try {
          var viewed = JSON.parse(sessionStorage.getItem('notifViewedKeysV2') || '[]');
          keys.forEach(function(k) { if (viewed.indexOf(k) === -1) viewed.push(k); });
          sessionStorage.setItem('notifViewedKeysV2', JSON.stringify(viewed));
          if (typeof window.updateNotifications === 'function') window.updateNotifications();
        } catch (err) {}
      }
    }
  }
}

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
  
  // Dışarı tıklandığında menüleri kapat
  if (menu && menu.classList.contains('open')) {
    menu.classList.remove('open');
  }
  if (notif && notif.classList.contains('open')) {
    notif.classList.remove('open');
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
  if (dateStr instanceof Date) {
    var d = dateStr;
    if (isNaN(d.getTime())) return '';
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
  }
  var str = String(dateStr);
  if (str.indexOf('-') !== -1) {
    var parts = str.split('-');
    if (parts.length === 3) return parts[2] + '/' + parts[1] + '/' + parts[0];
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

/** Plaka: tamamen büyük (tr-TR) */
window.formatPlaka = function(str) {
  if (str == null || str === '' || str === '-') return str === '' ? '-' : (str || '-');
  return String(str).trim().toLocaleUpperCase('tr-TR');
};

/** Ad Soyad: soyad büyük, ad(lar) title case */
window.formatAdSoyad = function(str) {
  if (!str || str === '-') return str;
  var parts = String(str).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return str;
  if (parts.length === 1) return window.toTitleCase(parts[0]);
  var last = parts.pop();
  return parts.map(function(w) { return w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1).toLocaleLowerCase('tr-TR'); }).join(' ') + ' ' + last.toLocaleUpperCase('tr-TR');
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
    if (modal.classList.contains('active') || modal.style.display === 'flex') {
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
  var notif = getNotif();
  if (notif) {
    notif.classList.add('open');
  }
};

document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  var historyModal = document.getElementById('vehicle-history-modal');
  if (!historyModal) return;
  var isVisible = historyModal.style.display === 'flex' || (historyModal.style.display !== 'none' && historyModal.offsetParent !== null);
  if (isVisible && historyModal.classList.contains('active')) {
    if (typeof window.closeHistoryToHomeAndOpenNotifications === 'function') {
      window.closeHistoryToHomeAndOpenNotifications();
    }
    e.preventDefault();
    e.stopPropagation();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  // Sayfa yüklendiğinde footer animasyonunu başlat
  startFooterAnimation();
  
  // Modal kontrolü için ilk kontrol
  window.updateFooterDim();

  // #region agent log
  function logModalOverlayGap(overlay) {
    if (!overlay || !overlay.classList.contains('active')) return;
    var id = overlay.id || '';
    if (id !== 'vehicles-modal' && id !== 'reports-modal') return;
    requestAnimationFrame(function() {
      var cs = window.getComputedStyle(overlay);
      var standalone = window.matchMedia('(display-mode: standalone)').matches;
      var payload = {
        sessionId: 'f40416',
        runId: 'modal-gap',
        hypothesisId: id === 'vehicles-modal' ? 'A' : 'B',
        location: 'script-core.js:modalObserver',
        message: 'Modal overlay computed styles (iOS PWA gap)',
        data: {
          modalId: id,
          bottom: cs.bottom,
          paddingBottom: cs.paddingBottom,
          maxHeight: cs.maxHeight,
          height: cs.height,
          standalone: standalone,
          innerHeight: window.innerHeight
        },
        timestamp: Date.now()
      };
      fetch('http://127.0.0.1:7824/ingest/aaeefe94-e582-470c-8671-3dbfa48b74c7', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f40416' }, body: JSON.stringify(payload) }).catch(function() {});
    });
  }
  // #endregion
  
  // Modal Observer: Body class yönetimi (Scroll engelleme vb.)
  const modalObserver = new MutationObserver((mutations) => {
    mutations.forEach(function(m) {
      if (m.type === 'attributes' && (m.attributeName === 'class' || m.attributeName === 'style')) {
        var el = m.target;
        if (el.id === 'vehicles-modal' || el.id === 'reports-modal') logModalOverlayGap(el);
      }
    });
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

// Modal açma fonksiyonları: tasitlar.js ve raporlar.js kendi openVehiclesView/openReportsView tanımlar
// (şube seçimi, renderBranchDashboard vb.). Burada sadece fallback - modüller yüklenmezse.
(function() {
  if (!window.openVehiclesView) {
    window.openVehiclesView = function() { 
      const modal = document.getElementById('vehicles-modal');
      if (modal) {
        modal.style.display = 'flex';
        requestAnimationFrame(() => {
          modal.classList.add('active');
          setTimeout(() => window.updateFooterDim(), 100);
        });
      }
    };
  }
  
  if (!window.openReportsView) {
    window.openReportsView = function() {
      const modal = document.getElementById('reports-modal');
      if (modal) {
        modal.style.display = 'flex';
        requestAnimationFrame(() => {
          modal.classList.add('active');
          setTimeout(() => window.updateFooterDim(), 100);
        });
      }
    };
  }
  
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
   VERSION DISPLAY (Global Core - v78.1)
   ========================================= */
document.addEventListener('DOMContentLoaded', function() {
    const APP_VERSION = "v78.2";
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

// Loading screen: index.html'deki window.hideLoading kullanılır (load + dataLoaded + 8 sn fallback)
window.addEventListener('load', () => { if (window.hideLoading) window.hideLoading(); });
window.addEventListener('dataLoaded', () => { setTimeout(() => { if (window.hideLoading) window.hideLoading(); }, 50); });
setTimeout(() => { if (window.hideLoading) window.hideLoading(); }, 8000);

/* =========================================
   SERVICE WORKER REGISTRATION (scope pathname'e göre: /medisa/, /tasitmedisa/ veya /)
   ========================================= */
(function() {
  var p = (typeof document !== 'undefined' && document.location) ? document.location.pathname : '';
  var base = (p.indexOf('/tasitmedisa') === 0) ? '/tasitmedisa' : (p.indexOf('/medisa') === 0) ? '/medisa' : '';
  var scope = base ? base + '/' : '/';
  var paths = base ? [base + '/sw.js'] : ['./sw.js', '/sw.js', '/tasitmedisa/sw.js', '/medisa/sw.js'];
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

  function removeInstallButton() {
    const existing = getInstallButton();
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  }

  function showInstallButton() {
    if (isStandaloneMode()) return;
    if (!deferredInstallPrompt) return;
    if (getInstallButton()) return;

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

    var wrapper = document.getElementById('pwa-install-wrapper');
    if (wrapper) {
      wrapper.appendChild(btn);
    } else {
      document.body.appendChild(btn);
    }
  }

  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredInstallPrompt = e;
    showInstallButton();
  });

  window.addEventListener('appinstalled', function() {
    deferredInstallPrompt = null;
    removeInstallButton();
  });
})();

/* =========================================
   MANIFEST.JSON CORS HATASI YÖNETİMİ
   ========================================= */
// Manifest.json CORS/404 hatası için sessizce devam et
// Bu hata PWA özelliklerini etkileyebilir ama uygulama çalışmaya devam eder
(function() {
  // Error event listener - manifest.json hatalarını yakala (sessizce)
  const originalError = window.onerror;
  window.onerror = function(message, source, lineno, colno, error) {
    // Manifest.json ile ilgili hataları filtrele
    if (message && typeof message === 'string' && (
      message.includes('manifest.json') ||
      message.includes('CORS') ||
      message.includes('blocked')
    )) {
      return true; // Hata handle edildi, sessizce devam et
    }
    // Diğer hataları normal şekilde işle
    if (originalError) {
      return originalError.apply(this, arguments);
    }
    return false;
  };
  
  // Link element error'ları için
  document.addEventListener('error', (event) => {
    if (event.target && event.target.tagName === 'LINK' && event.target.rel === 'manifest') {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
  }, true);
  
  // Unhandled promise rejection'ları için
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason && (
      (reason.message && reason.message.includes('manifest.json')) ||
      (reason.message && reason.message.includes('CORS')) ||
      (reason.message && reason.message.includes('blocked'))
    )) {
      event.preventDefault(); // Sessizce handle et
    }
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
