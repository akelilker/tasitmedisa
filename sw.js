// Service Worker - Medisa Taşıt Yönetim Sistemi
// Version 2.11 - Activate: claim önce (InvalidStateError düzeltmesi); syntax temiz

const CACHE_VERSION = 'medisa-v2.47';

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
  '/style-core.css',
  '/script-core.js',
  '/data-manager.js',
  '/manifest.json',
  '/icon/logo-header2.svg'
];

// Install - Cache tüm dosyaları (hata toleranslı, subpath destekli)
self.addEventListener('install', (event) => {
  const base = getBase();
  const origin = self.location.origin;
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => {
        const cachePromises = CACHE_FILES.map((path) => {
          const fullUrl = origin + base + path;
          return fetch(fullUrl)
            .then((response) => {
              if (response && response.status === 200) {
                return cache.put(fullUrl, response);
              }
              return Promise.resolve();
            })
            .catch(() => Promise.resolve());
        });
        return Promise.all(cachePromises);
      })
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

// Activate - Önce eski cache'leri temizle, sonra claim (claim() sadece "active" worker'da çalışır; önce yapılırsa InvalidStateError olabiliyor)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        const toDelete = cacheNames.filter((name) => name !== CACHE_VERSION);
        return Promise.all(toDelete.map((name) => caches.delete(name)));
      })
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
      p.indexOf('ruhsat.php') !== -1 ||
      p.indexOf('ruhsat_preview.php') !== -1;
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
        // Başarılıysa cache'i yenile
        const responseClone = response.clone();
        caches.open(CACHE_VERSION).then((cache) => {
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
            if (request.destination === 'document') {
              const base = getBase();
              const fallbackPath = base ? base + '/' : '/';
              const fallbackUrl = origin + fallbackPath;
              return caches.match(fallbackUrl);
            }
            return new Response('Not in cache', { status: 503 });
          })
          .then((res) => res || new Response('Not in cache', { status: 503 }));
      })
  );
});

// Push Notifications
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Medisa Taşıt';
  const base = getBase();
  const defaultUrl = base ? base + '/' : '/';
  const options = {
    body: data.body || 'Yeni bildirim',
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
