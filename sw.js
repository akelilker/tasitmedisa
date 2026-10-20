// Service Worker - Medisa Taşıt Yönetim Sistemi
// Version 2.15 - Güvenli offline okuma kabuğu

const CACHE_VERSION = 'medisa-v2.401';
// Raporlar modülü (raporlar.js / raporlar.css): ana shell cache'inden ayrı; MEDISA_MODULE_VERSIONS.raporlar ile senkron tut
const CACHE_RAPORLAR_VERSION = 'medisa-raporlar-20261020.1';

function isRaporlarModuleAssetUrl(u) {
  return /\/raporlar\.(js|css)$/i.test(u.pathname);
}

// Subpath desteği: /medisa/sw.js ise base = '/medisa', kök deploy'da base = ''
function getBase() {
  const p = self.location.pathname.replace(/\/sw\.js$/i, '').replace(/\/$/, '');
  return p || '';
}

// Sadece kritik giriş noktaları ve manifest; CSS/JS modülleri fetch ile network-first + cache fallback ile ilk kullanımda cache'lenir
// PERFORMANS: Sadece uygulamanın ana "Shell" dosyaları (iskelet) önden yüklenir.
// Admin ve kullanıcı paneli gibi alt modüller ilk girişte kullanıcının kotasını harcamaz.
const CACHE_FILES = [
  '/',
  '/index.html',
  '/style-core.css?v=20261018.5',
  '/script-core.js?v=20261020.3',
  '/data-manager.js?v=20261020.1',
  '/data-service.js?v=20261014.2',
  '/portal-session.js?v=20260731.3',
  '/manifest.json?v=20260506-1',
  '/icon/logo-header2.svg',
  '/icon/logo-footer.svg',
  '/icon/favicon-32.png?v=20260506-1',
  '/icon/medisa-round-pwa-192.png?v=20260506-1',
  '/icon/medisa-round-pwa-192.png',
  '/icon/marker.png?v=20260421.1',
  // Lazy modüller (offline): URL'ler script-core.js MEDISA_MODULE_VERSIONS loader'ı ile birebir aynı olmalı
  '/tasitlar.js?v=20261020.2',
  '/tasitlar-base.css?v=20261020.2',
  '/tasitlar-extra.css?v=20261020.2',
  '/tasitlar-yazici.js?v=20261014.2',
  '/notifications.js?v=20261019.1',
  '/notifications.css?v=20261019.1',
  '/vehicle-notification-domain.js?v=20260817.2',
  '/kayit.js?v=20261015.3',
  '/kayit.css?v=20261015.3',
  '/ayarlar.js?v=20261014.2',
  '/ayarlar.css?v=20261015.1',
  // Kullanıcı paneli (driver) sayfaları ve kabuk/özellik dosyaları (driver-script.js MEDISA_DRIVER_ASSET_VERSIONS ile aynı)
  '/driver/index.html',
  '/driver/dashboard.html',
  '/driver/manifest.json?v=20260506-1',
  '/driver/driver-shell.css?v=20260925.7',
  '/driver/driver-script.js?v=20261020.1',
  '/driver/driver-login.js?v=20261020.1',
  '/driver/driver-dashboard-core.js?v=20261020.1',
  '/driver/driver-features.css?v=20261016.2',
  '/driver/driver-feature-history.js?v=20261014.2',
  '/driver/driver-feature-documents.js?v=20261016.1',
  '/driver/driver-feature-feedback.js?v=20260813.1',
  '/driver/driver-feature-password.js?v=20260913.2',
  '/driver/driver-feature-actions.js?v=20261016.1'
];
// Raporlar modülü ayrı önbellekte tutulur (CACHE_RAPORLAR_VERSION)
const CACHE_RAPORLAR_FILES = [
  '/raporlar.js?v=20261020.1',
  '/raporlar.css?v=20261020.1'
];

// Install - Cache tüm dosyaları (hata toleranslı, subpath destekli)
self.addEventListener('install', (event) => {
  const base = getBase();
  const origin = self.location.origin;
  // Her dosya tek tek; biri eksik/hatalı olsa da kurulum düşmez
  function precacheInto(cacheName, files) {
    return caches.open(cacheName).then((cache) => Promise.all(files.map((path) => {
      const fullUrl = origin + base + path;
      return fetch(fullUrl)
        .then((response) => {
          if (response && response.status === 200) {
            return cache.put(fullUrl, response);
          }
          return Promise.resolve();
        })
        .catch(() => Promise.resolve());
    })));
  }
  event.waitUntil(
    Promise.all([
      precacheInto(CACHE_VERSION, CACHE_FILES),
      precacheInto(CACHE_RAPORLAR_VERSION, CACHE_RAPORLAR_FILES)
    ])
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

// Activate - Önce eski cache'leri temizle, sonra claim (claim() sadece "active" worker'da çalışır; önce yapılırsa InvalidStateError olabiliyor)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        const keep = new Set([CACHE_VERSION, CACHE_RAPORLAR_VERSION]);
        const toDelete = cacheNames.filter((name) => !keep.has(name));
        return Promise.all(toDelete.map((name) => caches.delete(name)));
      })
      .then(() => caches.open(CACHE_VERSION))
      .then((cache) =>
        cache.keys().then((keys) =>
          Promise.all(
            keys
              .filter((req) => isRaporlarModuleAssetUrl(new URL(req.url)))
              .map((req) => cache.delete(req))
          )
        )
      )
      .then(() => self.clients.claim())
      .catch((err) => {
        console.warn('SW activate:', err);
      })
  );
});

// Fetch - Strateji
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Sadece same-origin istekleri cache'le
  if (url.origin !== location.origin) {
    event.respondWith(
      fetch(request)
        .catch(() => {
          return new Response('Network error', { status: 503 });
        })
    );
    return;
  }
  
  // API çağrıları ve PHP - network-first; dinamik uçlar asla cache.put / stale fallback yok
  if (url.pathname.includes('/api/') || url.pathname.includes('.php')) {
    const p = url.pathname;
    const isNoCachePhp =
      p.indexOf('load.php') !== -1 ||
      p.indexOf('save.php') !== -1 ||
      p.indexOf('core.php') !== -1 ||
      /\/driver_[^/]*\.php$/i.test(p) ||
      /\/admin_[^/]*\.php$/i.test(p) ||
      p.indexOf('upload_ruhsat.php') !== -1 ||
      p.indexOf('ruhsat.php') !== -1 ||
      p.indexOf('ruhsat_preview.php') !== -1 ||
      p.indexOf('delete_document.php') !== -1;
    if (isNoCachePhp) {
      event.respondWith(
        fetch(request).catch(() => new Response('Network error', { status: 503 }))
      );
      return;
    }
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (request.method === 'GET' && response && response.status === 200) {
            const cacheControl = response.headers.get('Cache-Control');
            if (!cacheControl ||
                (!cacheControl.includes('no-cache') &&
                 !cacheControl.includes('no-store') &&
                 !cacheControl.includes('must-revalidate'))) {
              const responseClone = response.clone();
              caches.open(CACHE_VERSION).then((cache) => {
                cache.put(request, responseClone);
              });
            }
          }
          return response;
        })
        .catch(() => {
          if (request.method === 'GET') {
            return caches.match(request).then((cached) => cached || new Response('Network error', { status: 503 }));
          }
          return new Response('Network error', { status: 503 });
        })
    );
    return;
  }
  
  // Static dosyalar - NETWORK-FIRST (Önce internetten güncelini çek)
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }
        // Başarılıysa cache'i yenile (raporlar modülü ayrı önbellek adı)
        const responseClone = response.clone();
        const targetCache = isRaporlarModuleAssetUrl(url) ? CACHE_RAPORLAR_VERSION : CACHE_VERSION;
        caches.open(targetCache).then((cache) => {
          cache.put(request, responseClone);
        });
        return response;
      })
      .catch(() => {
        // İnternet yoksa eski önbellekten getir; hiçbir zaman undefined dönme (Response gerekli)
        const origin = self.location.origin;
        return caches.match(request)
          .then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            if (request.mode === 'navigate' || request.destination === 'document') {
              return offlineNavigationResponse(request, url, origin);
            }
            return new Response('Not in cache', { status: 503 });
          })
          .then((res) => res || new Response('Not in cache', { status: 503 }));
      })
  );
});

// Offline sayfa açılışı: ?sorgu yok sayılarak eşleştir; yoksa yola göre doğru sayfaya YÖNLENDİR
// (başka sayfanın HTML'i yanlış adreste verilirse göreli CSS/JS yolları kırılır ve döngü oluşur).
function offlineNavigationResponse(request, url, origin) {
  const base = getBase();
  return caches.match(request, { ignoreSearch: true }).then((hit) => {
    if (hit) return hit;
    const rel = url.pathname.slice(base.length);
    let target = '/index.html';
    if (/^\/driver(\/|$)/i.test(rel)) {
      target = /dashboard\.html$/i.test(rel) ? '/driver/dashboard.html' : '/driver/index.html';
    }
    const targetUrl = origin + base + target;
    if (targetUrl === origin + url.pathname) {
      return caches.match(origin + base + '/').then((root) => root || new Response('Not in cache', { status: 503 }));
    }
    return caches.match(targetUrl).then((cached) => {
      if (cached) return Response.redirect(targetUrl + url.search, 302);
      return caches.match(origin + base + '/', { ignoreSearch: true }).then((root) => {
        if (root && target === '/index.html') return Response.redirect(origin + base + '/', 302);
        return new Response('Not in cache', { status: 503 });
      });
    });
  });
}

// Push Notifications
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Medisa Taşıt';
  const base = getBase();
  const defaultUrl = base ? base + '/' : '/';
  const options = {
    body: data.body || 'Yeni Bildirim',
    icon: base + '/icon/logo-header2.svg',
    badge: base + '/icon/logo-header2.svg',
    data: data.url || defaultUrl
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const base = getBase();
  const defaultUrl = base ? base + '/' : '/';
  event.waitUntil(
    clients.openWindow(event.notification.data || defaultUrl)
  );
});
