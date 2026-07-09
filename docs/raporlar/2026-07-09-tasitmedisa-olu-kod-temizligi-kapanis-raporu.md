# TAŞITMEDİSA — Ölü Kod Temizliği ve Duplicate Helper Hattı Kapanış Raporu

## 1. Amaç

Bu raporun amacı:

- Yapılan düşük riskli ölü kod temizliklerini kayıt altına almak
- Hangi alanlara neden dokunulmadığını belgelemek
- Duplicate helper analizinin sonucunu sabitlemek
- İleride auth/role gibi riskli alanlara kontrolsüz girilmesini önlemek

## 2. Başlangıç Bağlamı

Taşıtmedisa uygulaması thin shell + lazy module mimarisi kullanır. `index.html` ana shell olarak çalışır; `script-core.js` ise lazy modül yükleme, stub ve bootstrap katmanını taşır.

Bu mimari nedeniyle repo içinde duplicate gibi görünen her kod parçası ölü kod değildir. Lazy-load stub'lar, auth gate blokları, standalone sayfa guard'ları ve fallback helper'lar bilinçli bootstrap/timing koruması olabilir.

Bu kapanış hattında ana ilke şudur: yalnızca kullanım dışı olduğu kanıtlanan, runtime/CI/deploy bağlantısı bulunmayan veya düşük riskle owner'a delege edilebilen alanlara dokunulmuştur. Auth, token, role ve lazy-load kontratları gibi riskli alanlar cleanup kapsamında değiştirilmemiştir.

## 3. Kapanan Fazlar

### Faz 1A — Raporlar Kullanıcı Sekmesi Ölü Kod Temizliği

Commit:

`c26fa9fd refactor: raporlar kullanici sekmesi olu kodunu temizle`

Özet:

- Raporlar modalında artık sadece stok görünümü kaldığı için eski Kullanıcı sekmesi JS/CSS blokları kaldırıldı.
- `raporlar.js` içindeki kullanıcı sekmesi state/render/list/detail/search/back fonksiyonları silindi.
- `raporlar.css` içindeki `.kullanici-*` sekme stilleri ve `.stok-left-controls` legacy wrapper kuralları kaldırıldı.
- Stok raporundaki canlı kullanıcı kolonu korunmuştur.

Kapsam:

- `raporlar.js`
- `raporlar.css`

Doğrulama:

- `node --check raporlar.js` geçti.
- CSS brace kontrolü geçti.
- `git diff --check` geçti.
- Deploy success.
- Browser smoke OK.

### Faz 1B — Gereksiz Export ve Orphan CSS Temizliği

Commit:

`5c8a3810 refactor: gereksiz export ve orphan css temizle`

Özet:

- `portal-session.js` içinden kullanılmayan `window.storePortalToken` export'u kaldırıldı.
- `data-manager.js` içinden kullanılmayan `window.API_LOAD_KASKO` export'u kaldırıldı.
- `API_LOAD_KASKO` const ve iç kullanım korundu.
- `window.API_SAVE_KASKO` korundu.
- `style-core.css` içindeki orphan utility selector'lar kaldırıldı.
- `driver/driver-style.css` içindeki kullanılmayan `driver-home-link` style kuralı kaldırıldı.
- `data-manager.js` içindeki `:not(.driver-home-link)` guard'ına dokunulmadı.

Kapsam:

- `portal-session.js`
- `data-manager.js`
- `style-core.css`
- `driver/driver-style.css`

Doğrulama:

- `node --check portal-session.js` geçti.
- `node --check data-manager.js` geçti.
- CSS brace kontrolleri geçti.
- `git diff --check` geçti.
- Deploy success.
- Browser smoke OK.

### Faz 1C — Tek Seferlik Migration Script'lerini Arşivleme

Commit:

`4e0a6b2f chore: tek seferlik migration scriptlerini arsivle`

Özet:

- Runtime/CI/deploy/package bağlantısı olmayan iki tek seferlik veri düzeltme script'i silinmeden archive altına taşındı.
- İçerik değişmedi.
- Sadece R100 rename yapıldı.

Eski path:

- `scripts/fix-data10-json.mjs`
- `scripts/patch-data11-plates.mjs`

Yeni path:

- `scripts/archive/fix-data10-json.mjs`
- `scripts/archive/patch-data11-plates.mjs`

Doğrulama:

- R100 rename
- 0 insertion / 0 deletion
- Deploy success
- Browser smoke OK

### Faz 2A — asset.php Canlı Kullanım Analizi

Commit yok.

Karar:

`asset.php` dosyasına dokunulmadı.

Analiz sonucu:

- Repo içinde `asset.php?f=...` client çağrısı bulunmadı.
- HTML/JS/CSS loader `asset.php` kullanmıyor.
- `.htaccess` `asset.php` dosyasına rewrite yapmıyor.
- cPanel/deploy hâlâ `asset.php` dosyasını canlıya taşıyor.
- `portal-session.js` `asset.php` allowlist içinde yok.
- `asset.php` eski WordPress/cPanel static asset fallback yüzeyi olabilir.

Karar gerekçesi:

- Repo içinde aktif kullanım kanıtı yok.
- Ama canlı access log olmadan kesin kullanılmıyor denemez.
- Dosyanın varlığı düşük maliyetli.
- Silmek eski cihaz/cache/fallback kullanımını kırabilir.

Son karar:

- `asset.php` korunacak.
- Deploy listesinden çıkarılmayacak.
- Silme kararı için en az 14 gün, tercihen 30 gün access log kontrolü gerekir.
- `asset.php` yeniden aktif proxy olarak kullanılacaksa `portal-session.js` allowlist'e eklenmelidir.

### Faz 2B — Duplicate Helper Ön Analizi

Commit yok.

Analiz edilen alanlar:

- Token/session helper
- JWT decode
- Auth gate
- Role normalization
- Recorder display name
- Notification domain validation
- Format fallback pattern

Karar:

- Token/session: dokunma, yüksek risk.
- JWT decode: dokunma, yüksek risk.
- Auth gate: dokunma, yüksek risk.
- Role normalization: ayrı sözleşme/tasarım işi, şimdilik dokunma.
- Notification domain validation: dokunma, lazy-load kontrat guard'ı.
- Format fallback pattern: dokunma, lazy module/standalone toleransı.
- Recorder display name: düşük/orta riskli ilk aday.

### Faz 2B-1 — tasitlar.js Kaydeden Adını Global Helper'a Bağlama

Commit:

`a1fd9b71 refactor: tasitlar kaydeden adini global helpera bagla`

Özet:

- `script-core.js` global owner olarak `window.getRecorderDisplayName` sağlıyor.
- `tasitlar.js` içinde local `getRecorderDisplayName` duplicate helper vardı.
- Local helper silinmedi.
- Call site'lar değiştirilmedi.
- Helper'ın başına güvenli delegasyon eklendi.
- `window.getRecorderDisplayName` varsa ve kendisi değilse global owner çağrılıyor.
- Global sonuç boşsa mevcut local fallback çalışmaya devam ediyor.
- Recursion guard eklendi:
  `window.getRecorderDisplayName !== getRecorderDisplayName`

Kapsam:

- `tasitlar.js`

Doğrulama:

- `node --check tasitlar.js` geçti.
- `git diff --check` geçti.
- Deploy success.
- Hedefli browser smoke OK:
  - Ana sayfa
  - Taşıtlar görünümü
  - Taşıt detay
  - Taşıt geçmiş/tarihçe kaydeden bilgisi
  - Yeni kayıt/düzenleme sonrası kaydeden bilgisi
  - Bildirim dropdown
  - Console hata kontrolü

## 4. Güncel Commit Çizgisi

- `a1fd9b71 refactor: tasitlar kaydeden adini global helpera bagla`
- `4e0a6b2f chore: tek seferlik migration scriptlerini arsivle`
- `e65aaaf7 Update raporlar.js`
- `5c8a3810 refactor: gereksiz export ve orphan css temizle`
- `c26fa9fd refactor: raporlar kullanici sekmesi olu kodunu temizle`

Notlar:

- `e65aaaf7` semantik değişiklik gibi görünmeyen `raporlar.js` satır sonu/format commit'i olarak değerlendirilmiştir.
- Daha önce cloud workspace kaynaklı duplicate `5c277977` riski tespit edilmiş, push edilmemiş ve workspace `origin/main` ile hizalanmıştır.

## 5. Dokunulmayan Riskli Alanlar

Aşağıdaki alanlara bilinçli olarak dokunulmadı.

### Auth / Token / Session

Neden:

- `index.html` inline early gate scriptlerden önce çalışıyor.
- `portal-session.js` public kontrat sahibi.
- `data-manager.js` main app auth owner wrapper.
- `driver/admin` standalone auth yüzeyleri var.
- Ortaklaştırma login redirect, splash timing, PWA/cache ve session sürelerini kırabilir.

Karar:

- Cleanup kapsamında dokunulmayacak.
- Ayrı auth refactor tasarım dokümanı gerekir.

### JWT Decode

Neden:

- `index.html`, `data-manager.js`, `driver-script.js` farklı timing/yüzeylerde decode yapıyor.
- Erken gate ve standalone dashboard guard ayrışıyor.

Karar:

- Cleanup kapsamında dokunulmayacak.

### Role Normalization

Neden:

- `script-core.js` UI role mapping owner gibi duruyor.
- `data-manager.js` session permission normalize owner.
- `kayit.js` yerel kopya içeriyor.
- `driver/admin` tarafında farklı routing/label ihtiyaçları var.

Karar:

- Önce role sözleşmesi çıkarılmadan kod değiştirilmeyecek.

### Notification Domain Validation

Neden:

- `vehicle-notification-domain.js` owner.
- `script-core.js` lazy-load kontrat doğrulaması yapıyor.
- Duplicate gibi görünse de defensive bootstrap guard.

Karar:

- Dokunulmayacak.

### Format Helper Fallback Pattern

Neden:

- Lazy module ve standalone sayfa toleransı sağlıyor.
- Her fallback ölü kod değildir.

Karar:

- Toplu silme/refactor yapılmayacak.

## 6. Sonraki Olası İşler

Aşağıdaki maddeler yalnızca öneridir; bu rapor uygulama kararı vermez.

1. Role normalization sözleşme dokümanı
   - Rol canonical değerleri
   - UI role mapping
   - Session permission mapping
   - Driver/admin ayrımları
   - Test matrisi

2. Auth/session refactor tasarım dokümanı
   - Early gate
   - `portal-session` public API
   - `data-manager` auth wrapper
   - `driver/admin` standalone guard
   - PWA/cache etkisi

3. `asset.php` canlı log incelemesi
   - 14-30 gün access log
   - `asset.php` / `asset.php?f=` araması
   - Kullanım yoksa kaldırma ayrı faz olarak değerlendirilebilir

## 7. Genel Smoke Matrisi

- Ana sayfa açılışı
- Login/session devamlılığı
- Raporlar > Stok
- Taşıtlar görünümü
- Taşıt detay
- Taşıt geçmiş/tarihçe kaydeden bilgisi
- Yeni kayıt/düzenleme
- Bildirim dropdown
- Kullanıcı paneli
- Driver panel
- Admin rapor
- Console kırmızı hata kontrolü

## 8. Nihai Karar

Bu hat kapsamında düşük riskli ölü kod temizliği ve tek güvenli duplicate helper delegasyonu tamamlanmıştır.

Canlı deploy ve browser smoke kontrolleri geçmiştir.

Bundan sonraki işler cleanup değil, tasarım/refactor işi olarak ele alınmalıdır.
