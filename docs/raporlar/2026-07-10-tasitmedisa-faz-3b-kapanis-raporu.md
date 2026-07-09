# TaşıtMedisa Faz 3B Kod Temizliği Kapanış Raporu

## 1. Amaç

Faz 3B serisinin amacı, Faz 3A'da belirlenen düşük/orta riskli ölü kod ve orphan CSS adaylarını dar kapsamlarla incelemekti.

Her aday için önce analiz yapıldı; yalnızca kanıt yeterliyse uygulama fazına geçildi.

Auth/session, role normalization, lazy-load, notification domain, data schema gibi yüksek riskli alanlara dokunulmadı.

## 2. Başlangıç Bağlamı

Faz 3A kalan ölü kod aday taraması sonrası 3B serisi açıldı.

Önceki kapanış raporu commit'i:

```text
c60b752a docs: olu kod temizligi kapanis raporunu ekle
```

3B serisi başlamadan önce ana hat commit'i, 3B-1 hazırlık çizgisi öncesinde `9382cfd2` altındaki hat üzerinden ilerledi.

Tüm fazlarda "önce analiz, sonra uygulama, sonra commit/push/deploy/smoke" modeli izlendi.

## 3. Faz 3B-1 — Düşük Riskli Orphan CSS Temizliği

Commit:

```text
9382cfd2 refactor: orphan css selectorlarini temizle
```

Değişen dosyalar:

- `style-core.css`
- `notifications.css`

Temizlenenler:

- `.login-body`
- `.user-panel-body`
- `.notif-detail`

Doğrulama:

- `git diff --check` temiz
- deploy success
- ana sayfa açıldı
- console kırmızı hata yok
- bildirim dropdown canlı auth olmadığı için o anda doğrulanamadı

Karar:

Faz 3B-1 düşük riskli CSS orphan temizliği kapandı.

## 4. Faz 3B-2 — getInstallButton PWA Helper Analizi

Commit yok.

Analiz edilen aday:

- `script-core.js` içindeki local `getInstallButton()`

Bulgular:

- Sadece local function tanımı vardı.
- Çağrı yoktu.
- Export yoktu.
- HTML inline handler yoktu.
- Dynamic lookup kanıtı yoktu.
- Aktif PWA zinciri `getInstallBar` / `removeInstallButton` / `showInstallButton` üzerinden ilerliyordu.

Karar:

`getInstallButton` kaldırılabilir düşük riskli ölü helper olarak sınıflandı.

## 5. Faz 3B-3 — Ölü PWA Helper Temizliği

Commit:

```text
ace5c31d refactor: olu pwa install helperini temizle
```

Değişen dosya:

- `script-core.js`

Temizlenen kod:

- local `getInstallButton()` helper fonksiyonu

Korunanlar:

- `getInstallBar`
- `removeInstallButton`
- `showInstallButton`
- `beforeinstallprompt`
- `appinstalled`
- `deferredInstallPrompt`
- PWA DOM/CSS

Doğrulama:

- `node --check script-core.js` PASS
- `git diff --check` temiz
- deploy success
- ana sayfa açıldı
- console kırmızı hata yok
- `#pwa-install-wrapper` mevcut
- install bar/button koşul oluşmadığı için görünmedi, görünür bozukluk yok

Karar:

Faz 3B-3 kapandı.

## 6. Faz 3B-4 — vehicle-search-hit Selector Analizi

Commit yok.

Analiz edilen selectorlar:

- `.vehicle-search-hit--brand`
- `.vehicle-search-hit--year`
- `.vehicle-search-hit--user`

Bulgular:

- CSS'te literal görünüyorlardı.
- JS tarafında dinamik class üretimi bulundu:

```text
'<mark class="vehicle-search-hit vehicle-search-hit--' + hitKind + '">'
```

- `hitKind` değerleri aktif olarak `brand`, `year`, `user` alıyor.
- `renderVehicles(query)`, `maybeHighlightCell`, `highlightVehicleSearchText`, `buildVehicleUserNameHtmlWithSearch` hattına bağlılar.

Karar:

Bu selectorlar orphan değil. Dokunma kararı verildi. Silinmeleri araç arama highlight renk davranışını bozabilir.

## 7. Faz 3B-5 — Event Menu Selector Analizi

Commit yok.

Analiz edilen selectorlar:

- `.event-menu-category-icon-wrap--police-letter`
- `.event-menu-category-icon-letter`
- `.event-menu-item--status-ok`
- `.event-menu-item--status-orange`
- `.event-menu-item--status-red`
- `.event-menu-category-back`

Bulgular:

- status selectorları JS'te dinamik üretiliyor:

```text
return ' event-menu-item--status-' + statusLevel;
```

- `statusLevel` değerleri `ok`, `orange`, `red` olabiliyor.
- police-letter / icon-letter için JS/HTML üretici bulunmadı.
- police kategorisi mevcutta `EVENT_MENU_SHIELD_CHECK_SVG` ile normal `event-menu-category-icon` üzerinden render ediliyor.
- `.event-menu-category-back` yalnızca `tasitlar-extra.css` içinde `:not(...)` exclusion parçası olarak bulundu.

Karar:

- status selectorları: dokunma
- police-letter / icon-letter / category-back: Faz 3B-6 uygulama adayı

## 8. Faz 3B-6 — Event Menu Orphan CSS Temizliği

Commit:

```text
f0ca2c3f refactor: event menu orphan css kalintilarini temizle
```

Değişen dosyalar:

- `tasitlar-base.css`
- `tasitlar-extra.css`

Temizlenenler:

- `.event-menu-category-icon-wrap--police-letter`
- `.event-menu-category-icon-letter`
- `:not(.event-menu-category-back)`

Korunanlar:

- `.event-menu-item--status-ok`
- `.event-menu-item--status-orange`
- `.event-menu-item--status-red`
- `getEventMenuCardStatusClass`
- `renderEventMenuCategoryRoot`
- `renderEventMenuCategoryItems`
- `getEventMenuCategoryIconHtml`
- `tasitlar.js`

Doğrulama:

- `git diff --check` temiz
- deploy success
- ana sayfa/login açıldı
- console kırmızı hata yok
- authenticated smoke sonrası:
  - Taşıtlar ekranı OK
  - Taşıt detay OK
  - Event menu / olay menüsü OK
  - Görsel bozulma yok
  - Console kırmızı hata yok

Karar:

Faz 3B-6 tamamen kapandı.

## 9. Korunan Hassas Alanlar

Şu alanlara bilinçli olarak dokunulmadı:

- auth/token/session
- JWT decode
- role normalization
- `index.html` early auth gate
- `portal-session.js` public kontratı
- `data-manager.js` auth/session wrapper
- driver/admin standalone auth guard
- lazy-load bootstrap/stub yapısı
- notification domain guard
- format helper fallback patternleri
- `asset.php`
- data schema / legacy alanlar
- vehicle-search-hit dynamic selectorları
- event-menu status dynamic selectorları

## 10. Nihai Durum

| Faz | Tip | Commit | Karar |
|---|---|---|---|
| 3B-1 | Uygulama | `9382cfd2` | Kapandı |
| 3B-2 | Analiz | Yok | getInstallButton kaldırılabilir |
| 3B-3 | Uygulama | `ace5c31d` | Kapandı |
| 3B-4 | Analiz | Yok | vehicle-search-hit selectorlarına dokunma |
| 3B-5 | Analiz | Yok | status dokunma, police/back temizlenebilir |
| 3B-6 | Uygulama | `f0ca2c3f` | Kapandı |

## 11. Sonraki Olası İşler

- Yeni temizlik fazı açılacaksa önce tekrar analiz yapılmalı.
- Dynamic class üretimi olan alanlarda yalnızca literal `rg` sonucuna güvenilmemeli.
- Event menu, vehicle search, notification, auth/session alanları doğrudan silme adayı yapılmamalı.
- `asset.php` için önce canlı access/error log gerekir.
- Eğer devam edilecekse yeni adaylar Faz 3D ön analiz olarak açılmalı.

## 12. Son Karar

Faz 3B serisi başarıyla kapandı.

Düşük riskli CSS/JS ölü kod temizliği tamamlandı.

Yanlış pozitif adaylar dokunma kararıyla korundu.

Repo/deploy/smoke çizgisi stabil.
