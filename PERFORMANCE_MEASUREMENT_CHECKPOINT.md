# Taşıt Yönetim Sistemi - Performans Ölçüm Checkpoint

Bu not, performans audit sonrası gerçek cihaz/tarayıcı ölçümlerinde izlenecek ekranları, metrikleri ve eşikleri saklamak için oluşturuldu. Kod, CSS, JS, cache veya service worker değişikliği içermez.

## Ölçüm Yapılacak Ekranlar

1. Ana uygulama ilk yükleme
2. Taşıtlar listesi açılışı
3. Raporlar > Stok listesi açılışı
4. Driver dashboard açılışı
5. Driver Belgeler modalı
6. Mobil/iPhone PWA driver dashboard

## Genel Ölçüm Yöntemi

- Chrome DevTools Network sekmesinde iki ayrı ölçüm alınacak:
  - `Disable cache` açık
  - `Disable cache` kapalı
- Performance sekmesinde kayıt, aksiyon başlamadan hemen önce başlatılacak ve ekran tamamen oturduğunda durdurulacak.
- Mobil/iPhone benzeri ölçümlerde ayrıca:
  - CPU: `4x slowdown`
  - Network: `Fast 4G`
- Her ekran için aynı senaryo en az 3 kez tekrarlanacak; eşik kararları tek ölçüme göre verilmeyecek.

## Network Metrikleri

Her ekran için not alınacak değerler:

- `DOMContentLoaded`
- `Load`
- `Largest asset`
- `Total transferred size`
- İlk yüklenen CSS/JS dosyaları
- Lazy yüklenen modül dosyaları
- `from ServiceWorker` görünen assetler
- Querystring sürümü beklenen değerle uyumlu mu

## Performance Metrikleri

Her ekran için not alınacak değerler:

- JS heap başlangıç / ekran oturduktan sonra / ekran kapandıktan sonra
- Long task sayısı ve en uzun long task süresi
- Render süresi
- Scripting / Rendering / Painting dağılımı
- Layout shift veya belirgin repaint var mı
- Scroll/input sırasında jank hissediliyor mu

## Ekran Bazlı İzlenecekler

### Ana Uygulama İlk Yükleme

Network'te izlenecek assetler:

- `index.html`
- `style-core.css`
- `portal-session.js`
- `data-manager.js`
- `data-service.js`
- `script-core.js`
- `load.php`
- Google font istekleri

Performance'ta bakılacak alanlar:

- Auth yönlendirme
- Splash kapanışı
- `loadDataFromServer`
- `dataLoaded`
- `updateNotifications`

Normal kabul:

- İlk shell hızlı açılır.
- Lazy modüller ilk anda yüklenmez.

Optimizasyon eşiği:

- `DOMContentLoaded > 1.5s`
- `Load > 3s`
- Total transferred size `> 1.5MB`
- Long task `> 200ms`

### Taşıtlar Listesi Açılışı

Network'te izlenecek assetler:

- `tasitlar.js`
- `tasitlar-base.css`
- `tasitlar-extra.css`
- `icon/kaporta.svg` varsa

Performance'ta bakılacak alanlar:

- `loadAppModule`
- `renderVehicles`
- `renderBranchDashboard`
- Filtre/sort akışı
- `updateNotifications`

Normal kabul:

- İlk açılışta modül yükleme maliyeti olur.
- İkinci açılış belirgin şekilde daha hızlı olur.

Optimizasyon eşiği:

- İlk açılış render `> 800ms`
- Tekrar açılış render `> 300ms`
- Long task `> 150ms`

### Raporlar > Stok Listesi Açılışı

Network'te izlenecek assetler:

- `raporlar.js`
- `raporlar.css`
- Excel/CDN assetleri yalnız export tetiklenirse izlenecek

Performance'ta bakılacak alanlar:

- `renderStokView`
- `renderStokList`
- Sort/filter akışları
- `adjustStokResponsiveCellFontSizes`
- Header/menu taşıma işlemleri

Normal kabul:

- Stok listesi uygulamanın ağır ekranlarından biri olabilir.
- Açılış sonrası scroll ve kolon etkileşimi akıcı kalmalı.

Optimizasyon eşiği:

- Render `> 1s`
- Long task `> 200ms`
- JS heap artışı `> 25MB`

### Driver Dashboard Açılışı

Network'te izlenecek assetler:

- `driver/dashboard.html`
- `style-core.css`
- `driver-style.css`
- `portal-session.js`
- `script-core.js`
- `driver-script.js`
- `driver_data.php`

Performance'ta bakılacak alanlar:

- `loadDashboard`
- `renderLeftPanel`
- `renderRightPanel`
- `renderSlidingWarning`

Normal kabul:

- Tek kullanıcı / az araçta hızlı açılmalı.
- Sol/sağ panel oturduktan sonra ek repaint hissedilmemeli.

Optimizasyon eşiği:

- `DOMContentLoaded > 1.5s`
- `Load > 3s`
- Dashboard render `> 700ms`

### Driver Belgeler Modalı

Network'te izlenecek assetler:

- Belge endpointleri
- PDF/doküman istekleri
- Ruhsat veya belge URL'leri
- Belge ikonları

Performance'ta bakılacak alanlar:

- `renderDriverDocumentsModal`
- Kart listener bağlama
- Belge/PDF açma akışı

Normal kabul:

- Modal render çok kısa sürmeli.
- Asıl maliyet belge açma anında oluşabilir.

Optimizasyon eşiği:

- Modal render `> 200ms`
- PDF açılışında heap sıçraması `> 30MB`
- Long task `> 150ms`

### Mobil/iPhone PWA Driver Dashboard

Network'te izlenecek assetler:

- Driver dashboard assetleri
- Service worker üzerinden gelen assetler
- Offline/online tekrarında eski asset servis edilip edilmediği

Performance'ta bakılacak alanlar:

- Scroll jank
- Fixed footer repaint
- `renderSlidingWarning`
- Input focus scroll davranışı
- PWA install bar / safe-area etkisi

Normal kabul:

- Scroll akıcı olmalı.
- Footer/hero alanı gözle görülür repaint yapmamalı.
- Input focus ekranı zıplatmamalı.

Optimizasyon eşiği:

- Long task `> 100ms`
- FPS düşüşü kullanıcı tarafından hissedilir düzeydeyse
- JS heap ekran kapandıktan sonra düşmüyorsa
- Offline/PWA açılışında eski asset görünüyorsa

## Optimizasyon Planı Açma Kriterleri

Aşağıdaki durumlardan biri tekrarlanırsa ayrı optimizasyon planı açılacak:

- Aynı ekranda 3 ölçümün en az 2'sinde long task eşiği aşılır.
- Cache açık tekrar ölçümünde render süresi hâlâ eşik üstünde kalır.
- JS heap ekran kapandıktan sonra düşmez veya her aç/kapat döngüsünde artar.
- Service worker beklenmeyen eski asset veya querystring kopyası servis eder.
- Mobil PWA'da scroll, input focus veya fixed footer jank kullanıcı tarafından hissedilir.
- Rapor/stok veya taşıt listesi büyük veriyle 1 saniye üstü ana thread kilitler.

## Şimdilik Dokunulmayacak Yüksek Riskli Alanlar

- `data.json` flat-file mimarisini DB veya parçalı veri yapısına taşıma
- Service worker cache stratejisini kökten değiştirme
- Querystring version sistemini kaldırma veya tek merkeze zorla taşıma
- Global CSS cascade / `!important` temizliği
- `:has()` tabanlı modal/footer/rapor/K2 layout kurallarını değiştirme
- Driver dashboard sol/sağ panel layout refactoru
- Mobil/PWA safe-area, fixed footer, scroll lock ve touch-action kuralları
- PDF/iframe belge preview akışını mimari olarak değiştirme
- Bildirim severity/sıralama ve taşıt listesi plaka başı `!` marker mantığı

## İlk Baseline Ölçümleri - 2026-05-19

- Trace-20260519T092633:
  - >50ms long task görülmedi.
  - Ciddi runtime kilitlenme görünmedi.
  - Genel tablo hafif ölçüm / normal davranış olarak kabul edildi.

- Trace-20260519T092711:
  - >50ms long task: 2 adet.
  - Uzun işler ağırlıklı V8 background parse / script streaming kaynaklı.
  - Paint/layout maliyeti mevcut ama acil refactor gerektiren tekil darboğaz görünmedi.

Karar:

- Bu iki trace baseline kabul edildi.
- Şimdilik performans refactor açılmayacak.
- Yeni optimizasyon işi sadece tekrarlayan kullanıcı hissedilir yavaşlık veya performans checkpoint eşikleri aşılırsa açılacak.
- Riskli alanlar, yani global CSS cascade, service worker stratejisi, data.json mimari değişikliği ve büyük render refactorları şimdilik dokunulmayacak.
