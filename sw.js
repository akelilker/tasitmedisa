// Service Worker - Medisa Taşıt Yönetim Sistemi
// Version 2.6 - Network-first stratejisi aktif edildi

const CACHE_VERSION = 'medisa-v2.6';

// Subpath desteği: /medisa/sw.js ise base = '/medisa', kök deploy'da base = ''
function getBase() {
  const p = self.location.pathname.replace(/\/sw\.js$/i, '').replace(/\/$/, '');
  return p || '';
}

const CACHE_FILES = [
  '/',
  '/index.html',
  
  // Driver (giriş + panel)
  '/driver/',
  '/driver/index.html',
  '/driver/dashboard.html',
  '/driver/driver-style.css',
  '/driver/driver-script.js',
  
  // Admin
  '/admin/',
  '/admin/driver-report.html',
  '/admin/admin-report.css',
  '/admin/admin-report.js',
  
  // CSS
  '/style-core.css',
  '/kayit.css',
  '/tasitlar.css',
  '/raporlar.css',
  '/ayarlar.css',
  
  // JavaScript
  '/script-core.js',
  '/kayit.js',
  '/tasitlar.js',
  '/raporlar.js',
  '/ayarlar.js',
  '/data-manager.js',
  
  // Icons
  '/favicon.ico',
  '/icon/favicon.ico',
  '/icon/favicon.png',
  '/icon/apple-touch-icon.svg',
  '/icon/icon-192.svg',
  '/icon/icon-512.svg',
  '/icon/logo-header2.svg',
  '/icon/logo-footer.svg',
  '/icon/marker.png',
  '/icon/otomobil.svg',
  '/icon/kaporta.svg',
  
  // Manifest files (main + sub apps)
  '/manifest.json',
  '/driver/manifest.json',
  '/admin/manifest.json'
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

// Activate - Önceki cache sürümlerini temizle, sonra kontrolü al
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        const toDelete = cacheNames.filter((name) => name !== CACHE_VERSION);
        return Promise.all(toDelete.map((name) => caches.delete(name)));
      })
      .then(() => {
        return self.clients.claim();
      })
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
  
  // API çağrıları ve PHP - network-first
  if (url.pathname.includes('/api/') || url.pathname.includes('.php')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (url.pathname.includes('load.php')) {
            return response;
          }
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
          if (request.method === 'GET' && !url.pathname.includes('load.php')) {
            return caches.match(request);
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
        // İnternet yoksa eski önbellekten getir
        return caches.match(request)
          .then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            if (request.destination === 'document') {
              const base = getBase();
              const fallbackPath = base ? base + '/' : '/';
              return caches.match(fallbackPath);
            }
          });
      })
  );
});

// Background Sync (opsiyonel)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-vehicles') {
    event.waitUntil(syncVehicleData());
  }
});

async function syncVehicleData() {}

// Push Notifications
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Medisa Taşıt';
  const base = getBase();
  const defaultUrl = base ? base + '/' : '/';
  const options = {
    body: data.body || 'Yeni bildirim',
    icon: base + '/icon/icon-192.svg',
    badge: base + '/icon/icon-192.svg',
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