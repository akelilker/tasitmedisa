# İsimlendirme İncelemesi – Tutarsızlıklar ve Okunaklılık Önerileri

**Not:** Bu raporda **hiçbir kod değişikliği yapılmadı**. Sadece tespit ve “sistemin çalışma mantığını bozmadan” nasıl daha okunaklı hale getirilebileceği listelenmiştir. Toplu yeniden adlandırma yapılmaz; veri yapısı (JSON, API) ve HTML id/class’lara referans çok olduğu için değişiklikler ancak planlı ve adım adım yapılmalıdır.

---

## 1. Projede Görülen İsimlendirme Desenleri

| Ortam | Gözlenen kural | Örnek |
|-------|-----------------|--------|
| **JS değişken/fonksiyon** | Çoğunlukla camelCase | `activeBranchId`, `loadDataFromServer`, `getSelectedVehicle` |
| **JS “gizli” cache** | Ön ek `_` | `_cachedMenu`, `_cachedFooter`, `loadPromise` |
| **HTML id / class** | Kebab-case | `vehicle-detail-modal`, `user-vehicles-container`, `tescil-tarih-input` |
| **API / JSON (PHP tarafı)** | Türkçe snake_case | `surucu_id`, `arac_id`, `sube_id`, `donem`, `guncel_km`, `kayit_id` |
| **JSON (istemci/taşıt)** | İngilizce camelCase + bazı Türkçe | `branchId`, `assignedUserId`, `plate`, `eskiSubeId`, `yeniSubeAdi` |

Genel standart tek bir dil veya tek bir case kuralı değil; Türkçe/İngilizce ve snake_case/camelCase karışık kullanılıyor.

---

## 2. Aynı Kavram İki Farklı İsimle (Tutarsızlık)

Sistemin çalışma mantığı bu eşleşmeler üzerine kurulu; **isim değiştirmek yerine** dokümantasyon ve yeni kodda tutarlı tercih önerilir.

| Kavram | Bir yerde | Başka yerde | Nerede kullanılıyor |
|--------|-----------|--------------|---------------------|
| Şube ID | `sube_id` | `branchId` | PHP/rapor: `sube_id`; JS/taşıt objesi: `branchId`. Kullanıcı objesinde bazen `sube_id` bazen `branchId` (admin_report.php: `$u['sube_id'] ?? $u['branchId']`). |
| Sürücü / Kullanıcı ID | `surucu_id` | `user_id` / `userId` | API/JSON: `surucu_id`; token: `user_id`; raporlar.js: `userId`. |
| Plaka | `plaka` | `plate` | Taşıt objesinde ikisi de var; tasitlar.js sütun key’i `plate`, driver bazen `vehicle.plaka`. |
| İsim (kullanıcı) | `isim` | `name` | data-manager normalize ediyor: `u2.name = u2.isim`; UI’da ikisi de kullanılıyor. |
| Taşıt atanan kullanıcı | `tahsisKisi` (string isim) | `assignedUserId` (ID) | Taşıt objesinde ikisi birlikte; tahsisKisi eski/display, assignedUserId yetki ve rapor için. |
| KM | `guncel_km` | `guncelKm` | PHP/aylık hareket: `guncel_km`; taşıt objesi: `guncelKm` (driver_save senkronize ediyor). |
| Şube değişikliği (olay) | `eskiSubeId`, `yeniSubeId`, `yeniSubeAdi` | – | Event data ve JSON’da Türkçe camelCase; İngilizce tarafında `branchId` kullanılıyor. |

**Nasıl daha okunaklı hale getirilir (mantık bozulmadan):**

- Yeni yazılan JS’te tek tercih kullanın: örn. taşıt için `branchId`, kullanıcı için `userId` (API’den gelen `surucu_id`’yi okuyup `userId` diye bir değişene atayabilirsiniz).
- Proje köküne bir **sözlük dosyası** (örn. `NAMING.md`) ekleyin: “Şube ID = branchId (JS) / sube_id (API)”, “Sürücü ID = surucu_id (API) / userId (JS)” gibi eşleşmeleri yazın; böylece neyin neye karşılık geldiği netleşir.
- İsim değiştirme yapmayın; sadece yeni kodda ve dokümantasyonda tutarlı isim kullanın.

---

## 3. Ne İşe Yaradığı Hemen Anlaşılmayan İsimler

### 3.1 Kısaltmalar / Tek harf

| İsim | Dosya / bağlam | Öneri |
|------|----------------|--------|
| `v` | Döngüde taşıt: `vehicles.filter(v => ...)` | Kısa döngüde kabul edilebilir; uzun blokta `vehicle` tercih edilebilir. |
| `u` | Döngüde kullanıcı: `users.filter(u => ...)` | Aynı şekilde uzun blokta `user` okunaklı olur. |
| `t`, `k`, `b` | PHP/JS döngü: taşıt, kayıt, şube | Aynı mantık; uzun bloklarda `$vehicle`, `$kayit`, `$branch` gibi isimler daha anlaşılır. |
| `el` | Genel element | `element` veya kullanım amacına göre `modal`, `container` vb. daha açıklayıcı olabilir. |
| `p` | data-manager.js: pathname | `pathname` veya `basePath` daha net. |
| `cols` | tasitlar.js: grid sütun sayısı | `columnCount` veya `gridColumnCount` anlamı netleştirir. |

Bunlar “nasıl daha okunaklı hale getirilir” için aday; değiştirirken tüm referansları birlikte güncellemek gerekir, davranış değişmez.

### 3.2 Anlamı bağlama bağlı isimler

| İsim | Bağlam | Açıklama / öneri |
|------|--------|-------------------|
| `activeBranchId` | tasitlar.js | Bazen `'all'`, bazen `''`, bazen şube id. “Aktif şube filtresi” anlamında `activeBranchFilter` veya yorum satırı ile netleştirilebilir. |
| `stokCurrentBranchId` | raporlar.js | Stok raporunda seçili şube; “stok” = stok/taşıt listesi. İsim zaten açıklayıcı; sadece `null`/`'all'`/id anlamı bir yorumla yazılabilir. |
| `kullaniciCurrentBranchId` | raporlar.js | Kullanıcı listesinde seçili şube. Aynı şekilde yorum yeterli. |
| `lastListContext` | tasitlar.js | Son açılan liste bağlamı (branch/liste modu). İsim mantıklı; gerekirse `lastVehiclesListContext` gibi daraltılabilir. |
| `loadPromise` | data-manager.js | Devam eden load isteğinin promise’i. `pendingLoadPromise` daha açıklayıcı olabilir. |
| `getMenu()` / `getNotif()` | script-core.js | Aslında “settings menu” ve “notifications dropdown”; isimler kısa ve yaygın, dokümantasyonda açıklanabilir. |

Bu maddeler için öncelik: yorum veya küçük refaktörle anlamı netleştirmek; zorunlu değil.

---

## 4. Türkçe / İngilizce Karışımı

- **Veri katmanı (JSON, API):** Hem Türkçe (`tasitlar`, `donem`, `duzeltme_talepleri`) hem İngilizce (`branches`, `users`) kullanılıyor. Bu yapı tüm uygulama ve PHP tarafıyla uyumlu; **isim değiştirmek veri ve API sözleşmesini bozar**.
- **JS içinde:** Türkçe değişken adları (örn. `eskiSubeId`, `yeniSube`, `kullaniciCurrentBranchId`) anlamı net; sadece “şube” için aynı objede hem `branchId` hem `sube_id` okunması karışıklık yaratıyor (yukarıdaki sözlük burada işe yarar).
- **Nasıl daha okunaklı hale getirilir:** Veri şemasını değiştirmeden, yeni JS kodunda tek dil tercih edin (örn. İngilizce değişken: `previousBranchId`, `currentBranchId`) ve API’den gelen alanı bir kez okuyup bu isimle kullanın. Mevcut Türkçe alan adları dokümantasyonda listelenebilir.

---

## 5. HTML id / class

- **Genel:** id ve class’lar çoğunlukla **kebab-case** ve anlaşılır: `vehicle-detail-modal`, `branch-form-modal`, `user-vehicles-container`, `tescil-tarih-confirm-modal`, `anahtar-guncelle-modal`.
- **Tutarlılık:** Hem Türkçe (`olay-ekle-modal`, `tescil-tarih-input`) hem İngilizce (`vehicle-detail-content`) kullanılıyor; bu proje genelinde böyle ve referans çok. **Toplu değişiklik yapılmamalı**; yeni eklenen id/class’larda tek bir kural (örn. kebab-case + tercihen İngilizce) seçilebilir.
- **Öneri:** Mevcut id/class’ları değiştirmeyin; yeni eklerde kebab-case ve anlamlı kelimeler kullanın.

---

## 6. PHP Değişken / Dizi Anahtarı

- **Dizi anahtarları:** `surucu_id`, `arac_id`, `kayit_id`, `donem`, `guncel_km`, `arac_aylik_hareketler`, `duzeltme_talepleri` – API ve JSON ile uyumlu; değiştirmek istemciyi ve driver/admin script’lerini bozar.
- **PHP yerel değişkenler:** `$ubeId` (typo: şube → ube), `$surucu`, `$kayit`, `$talep` anlaşılır. Sadece `$ubeId` yazım hatası gibi görünüyor; düzeltmek için tüm kullanımları `$subeId` yapıp kontrol etmek gerekir (şu an rapor sadece listeleme, onaysız değişiklik yok).

---

## 7. Özet – “Nasıl Daha Okunaklı Hale Getirilir” Checklist (Mantık Bozulmadan)

| Öncelik | Yapılacak | Risk |
|--------|-----------|------|
| 1 | **NAMING.md (veya benzeri) sözlük:** API/JSON alan adları ile JS’te kullanılan isimlerin eşleşmesini yazın (sube_id ↔ branchId, surucu_id ↔ userId, plaka ↔ plate, guncel_km ↔ guncelKm). | Yok |
| 2 | Yeni JS kodunda tek tercih: taşıt için `branchId`, kullanıcı için `userId`; API’den gelen `surucu_id`’yi okuyup `userId` değişkenine atayın. | Yok |
| 3 | Uzun fonksiyonlarda döngü değişkeni: `v` → `vehicle`, `u` → `user` (sadece yeni veya refaktör edilen bloklarda). | Düşük; referanslar aynı kalmalı. |
| 4 | data-manager.js: `p` → `pathname` veya `basePath`; isteğe bağlı `loadPromise` → `pendingLoadPromise`. | Düşük. |
| 5 | tasitlar.js: `cols` → `columnCount` (veya gridColumnCount); `activeBranchId` için kısa yorum: “'all' | '' | branch id”. | Düşük. |
| 6 | PHP: `$ubeId` → `$subeId` (şube ID) yalnızca tüm kullanımlar birlikte değiştirilirse. | Orta; tüm referanslar güncellenmeli. |
| 7 | **Veri şeması / API alan adı değişikliği yapmayın** (tasitlar, donem, surucu_id, arac_aylik_hareketler vb.); sadece dokümantasyon ve yeni kodda tutarlı isim kullanın. | – |

---

## 8. Yapılmayacaklar (Sistem Mantığını Korumak İçin)

- **Toplu yeniden adlandırma:** Özellikle `data.json`, API yanıtları ve tüm PHP/JS referansları birlikte değişmeden tek tarafta alan adı (örn. `branchId` → `sube_id`) değiştirmeyin.
- **HTML id/class değiştirme:** Çok sayıda `getElementById`, `querySelector`, CSS ve event bağlantısı bu isimlere bağlı; toplu değişiklik hata riski taşır.
- **Mevcut fonksiyon imzaları:** `createBranchCard(id, name, count, isUnassigned)` gibi public/window fonksiyonları yeniden adlandırırsanız, HTML `onclick` ve diğer dosyalardaki çağrıları da güncellemeniz gerekir; dikkatli yapılmalı.

Bu rapor sadece tespit ve öneri listesidir; onay vermeden kodda veya veri yapısında değişiklik yapılmamıştır.
