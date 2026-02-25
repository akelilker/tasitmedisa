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
  if (notif) notif.classList.toggle('open');
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

window.debounce = function(fn, ms) {
  var t;
  return function() {
    var a = arguments;
    clearTimeout(t);
    t = setTimeout(function() { fn.apply(null, a); }, ms);
  };
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
  document.querySelectorAll('.modal-overlay').forEach(modal => {
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

document.addEventListener('DOMContentLoaded', () => {
  // Sayfa yüklendiğinde footer animasyonunu başlat
  startFooterAnimation();
  
  // Modal kontrolü için ilk kontrol
  window.updateFooterDim();
  
  // Modal Observer: Body class yönetimi (Scroll engelleme vb.)
  const modalObserver = new MutationObserver((mutations) => {
    window.updateFooterDim();
  });

  // Modal attribute değişikliklerini izle (footer dim, body.modal-open)
  const allModals = document.querySelectorAll('.modal-overlay');
  allModals.forEach(modal => {
    modalObserver.observe(modal, { attributes: true, attributeFilter: ['class', 'style'] });
  });
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
   SERVICE WORKER REGISTRATION
   ========================================= */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Service Worker kaydını güvenli şekilde dene
    // Önce mevcut dizinde dene, sonra root'ta dene
    const swPaths = ['./sw.js', '/sw.js', '/tasitmedisa/sw.js', '/medisa/sw.js'];
    let currentPathIndex = 0;
    
    function tryRegisterSW() {
      if (currentPathIndex >= swPaths.length) {
        // Tüm path'ler denendi, sessizce devam et
        return;
      }
      
      const swPath = swPaths[currentPathIndex];
      navigator.serviceWorker.register(swPath, { scope: './' })
        .then((registration) => {
          // Yeni service worker varsa güncelle
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                var toast = document.createElement('div');
                toast.className = 'update-toast';
                toast.innerHTML = '<span class="update-toast-text">Yeni sürüm mevcut</span><button type="button" class="update-toast-btn">Yenile</button>';
                document.body.appendChild(toast);
                requestAnimationFrame(function() { toast.classList.add('visible'); });
                toast.querySelector('.update-toast-btn').addEventListener('click', function() {
                  window.location.reload(true);
                });
              }
            });
          });
        })
        .catch((e) => { currentPathIndex++; tryRegisterSW(); });
    }
    
    tryRegisterSW();
  });
}

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
