# Belge Yükleme — Tarih Bağlantısı Geliştirici Raporu

## 1. Amaç

Taşıt Detay → **Belgeler** modalından Sigorta Poliçesi, Kasko Poliçesi ve Takograf Belgesi yüklenirken kullanıcı, isterse aynı ekranda ilgili **başlangıç/kalibrasyon tarihini** girebilsin.

Bu özellik **yeni ve bağımsız bir tarih sistemi değildir**. Mevcut **Olay Ekle → Sigorta / Kasko / Takograf** formlarındaki:

- HTML input kimlikleri (`sigorta-tarih`, `kasko-tarih`, `takograf-kalibrasyon-tarih`)
- `gg/aa/yyyy` normalizasyonu (`normalizeGgAaYyyyInputElement`, `parseGgAaYyyyToIso`)
- Takvim seçicisi (`applyDinamikOlayFormDateHelpers`)
- Gerçek takvim doğrulaması (`isValidGgAaYyyyParts`)

ortak owner fonksiyonları üzerinden belge upload ekranına bağlanmıştır.

İlgili K2 / Taşıt Kartı / Takograf veri modeli özeti için: [`k2-tasit-karti-takograf-gelistirici-raporu.md`](k2-tasit-karti-takograf-gelistirici-raporu.md).

---

## 2. Owner Dosyalar

| Dosya | Sorumluluk |
| --- | --- |
| `tasitlar.js` | Belge upload formu (`renderRuhsatUploadForm`), ortak tarih HTML/doğrulama, XHR upload (`saveRuhsatUpload`) |
| `upload_ruhsat.php` | PDF kaydı, `documentOperationDate` whitelist, taşıt alanı mutation, belge geçmişi event’i |
| `tasitlar-extra.css` | Sigorta/Kasko upload tarih alanı layout (`.ruhsat-policy-date-stack`) |
| `tasitlar-base.css` | Tarih etiketi FOUC önleme (base yüklemede ortalı etiket) |

Olay Ekle form metadata’sı (`EVENT_DEFINITIONS`, handler’lar) bu fazda değiştirilmedi; yalnızca **aynı input ID’leri** upload tarafında yeniden kullanıldı.

---

## 3. Commit Kronolojisi (main)

| Commit | Özet |
| --- | --- |
| `30f8eea9` | **FAZ 1:** Sigorta/Kasko belge upload → opsiyonel poliçe başlangıç tarihi |
| `34a62b95` | Cache bump (poliçe yükleme) |
| `fedb1a11` | UI: Başlangıç Tarihi etiketi, tarih kutusu yüksekliği, Taşıt Kartı upload sadeleştirme |
| `33150e92` | Takograf belge upload → opsiyonel kalibrasyon tarihi (ortak helper genişletmesi) |
| `1643b5c9` | Cache bump (takograf yükleme) |
| `3d34de3b` | Görsel ayarlamalar (CSS stack, Taşıt Kartı hint kaldırma) |
| `367505d6` | Başlangıç Tarihi etiketi FOUC düzeltmesi (`tasitlar-base.css` + mobil istisna) |
| `d6c08565` | Mutation başarısızlığında mevcut legacy PDF/preview dosyalarını koruyan upload yaşam döngüsü düzeltmesi |

**Güncel cache (HEAD):**

| Dosya | Sürüm |
| --- | --- |
| `script-core.js` → `tasitlar` | `20260613.1` |
| `index.html` → `script-core.js` query | `20260613.1` |
| `sw.js` → `CACHE_VERSION` | `medisa-v2.166` |

---

## 4. Ortak JS Owner Fonksiyonları

### 4.1. `getPolicyOperationDateFieldHtml(documentType, labelText)`

Belge upload formuna tarih satırı üretir. Desteklenen `documentType` değerleri:

| Tip | Input ID | Upload’da varsayılan etiket | Olay Ekle etiketi (değişmedi) |
| --- | --- | --- | --- |
| `sigorta` | `sigorta-tarih` | **Başlangıç Tarihi** (`labelText` ile verilir) | Yenileme/Başlangıç (gg/aa/yyyy) |
| `kasko` | `kasko-tarih` | **Başlangıç Tarihi** | Yenileme/Başlangıç (gg/aa/yyyy) |
| `takograf` | `takograf-kalibrasyon-tarih` | Kalibrasyon Tarihi (gg/aa/yyyy) | Aynı ID, Olay Ekle formunda |

Sigorta/Kasko upload’da açıklama metni (“Yeni dönem poliçesi ise…”) bilinçli olarak **kaldırıldı**.

### 4.2. `validatePolicyDocumentOperationDate(documentType)`

- Alan **boş** → `{ valid: true }` (tarih zorunlu değil)
- Alan dolu → `normalizeGgAaYyyyInputElement` + `parseGgAaYyyyToIso` (tek parse)
- Geçersiz takvim → `{ valid: false, message: '...' }`
- Geçerli → `{ valid: true, iso: 'YYYY-MM-DD' }`

### 4.3. `parseGgAaYyyyToIso()` — gerçek takvim doğrulaması

FAZ 1 kapanışında regex-only doğrulama kaldırıldı. `isValidGgAaYyyyParts()` ile `31/02/2026`, `29/02/2025` gibi geçersiz tarihler reddedilir. Owner: `tasitlar.js` (Olay Ekle ve belge upload ortak).

### 4.4. `renderRuhsatUploadForm()`

- `sigorta` / `kasko`: `event-form-stack ruhsat-policy-date-stack` + `getPolicyOperationDateFieldHtml(..., 'Başlangıç Tarihi')`
- `takograf`: `event-form-stack ruhsat-policy-date-stack--takograf` + `getPolicyOperationDateFieldHtml('takograf')`
- Dosya seçimi sonrası: `validatePolicyDocumentOperationDate` → `saveRuhsatUpload`
- Tarih alanı render sonrası: `applyDinamikOlayFormDateHelpers(modal)` (takvim ikonu / mobil native date)

### 4.5. `saveRuhsatUpload(documentType)`

`documentOperationDate` yalnızca doğrulama `iso` döndürdüğünde `FormData`’ya eklenir. Boş tarih → POST alanı gönderilmez.

---

## 5. İş Kuralları

### 5.1. Tarih boş (tüm desteklenen belge tipleri)

| Davranış | Açıklama |
| --- | --- |
| PDF kaydı | Evet — dosya yolu güncellenir |
| `sigortaDate` / `kaskoDate` | **Değişmez** |
| `takografKalibrasyonDate` / `takografExpiryDate` | **Değişmez** |
| Bitiş hesabı | Yapılmaz |
| Belge upload event | Oluşturulmaya devam eder (tarih extra’sız) |

**Kullanım senaryosu:** Mevcut belgenin düzeltilmesi, eksik PDF’in ilk kez eklenmesi (tarih bilinmiyorsa).

### 5.2. Tarih dolu — Sigorta / Kasko

| Adım | Sonuç |
| --- | --- |
| JS | `documentOperationDate` = ISO başlangıç tarihi |
| PHP | `medisaUploadAddYears(operationDate, 1)` → bitiş |
| Taşıt alanı | `sigortaDate` veya `kaskoDate` = **bitiş tarihi** (mevcut Olay Ekle semantiği ile uyumlu) |
| Event extra | `operationDate`, `expiryDate` |

### 5.3. Tarih dolu — Takograf (yalnızca büyük ticari)

| Adım | Sonuç |
| --- | --- |
| Kapsam | `vehicleNeedsTakograf()` (JS) / `medisaUploadVehicleNeedsTakograf()` (PHP) |
| JS | `documentOperationDate` = kalibrasyon ISO |
| PHP | `medisaUploadAddYears(operationDate, 2)` → bitiş |
| Taşıt alanları | `takografKalibrasyonDate`, `takografExpiryDate` |
| Event | `takograf-belgesi-yukle` (tek event tipi; tarih extra opsiyonel) |

### 5.4. Taşıt Kartı belge upload (tarih alanı eklenmedi)

Taşıt Kartı upload ekranında **kullanıcı tarih alanı yoktur**. K2 geçerlilik kontrolü upload sırasında `validateTasitKartiK2SourceDate()` ile devam eder; bitiş tarihi merkezi K2’den (`getTasitKartiExpiryDate`) türetilir.

UI sadeleştirmeleri:

- Boş readonly “Geçerlilik Tarihi” kutusu kaldırıldı (yazılamıyordu)
- İlk yüklemede “Dosya seçildiğinde belge otomatik yüklenir.” hint’i gizlendi
- Mevcut belge değişiminde replace onay akışı korundu

---

## 6. PHP — `upload_ruhsat.php`

### 6.1. Giriş doğrulama

```php
$documentOperationDateRaw = trim((string)($_POST['documentOperationDate'] ?? ''));
$documentOperationDate = ... medisaNormalizeUploadDocumentDateToIso(...);
```

- Ham değer var ama normalize edilemiyorsa → **400** `Geçersiz işlem tarihi`
- Whitelist: yalnızca `sigorta`, `kasko`, `takograf` → aksi **400** `Bu belge tipi için işlem tarihi gönderilemez`
- Takograf: taşıt tipi kontrolü (`medisaUploadVehicleNeedsTakograf`)

### 6.2. JSON mutation ve dosya yaşam döngüsü

PDF yolu + tarih alanları **aynı `medisaMutateData` callback** içinde güncellenir. Tarih doluysa:

- Sigorta/Kasko → +1 yıl bitiş → `sigortaDate` / `kaskoDate`
- Takograf → +2 yıl bitiş → `takografKalibrasyonDate`, `takografExpiryDate`

Response payload’da ilgili alanlar yalnızca mutation gerçekleştiyse döner.

Dosyanın diske taşınması JSON mutation dışında gerçekleşir. `d6c08565` sonrasında legacy PDF kopyası ve eski preview temizliği yalnızca mutation başarıyla tamamlanırsa yapılır. Mutation başarısız olduğunda yalnızca yeni yüklenen hedef dosya kaldırılır; mevcut legacy PDF ve preview korunur.

### 6.3. Belge geçmişi event tipleri

| Belge | Event type |
| --- | --- |
| Sigorta Poliçesi | `sigorta-policesi-yukle` |
| Kasko Poliçesi | `kasko-policesi-yukle` |
| Takograf Belgesi | `takograf-belgesi-yukle` |

Tarih girildiyse event extra: `operationDate`, `expiryDate`.

Tarihçe UI’si bu değerleri aşağıdaki etiketlerle gösterir:

- Sigorta/Kasko: `Başlangıç Tarihi`
- Takograf: `Kalibrasyon Tarihi`
- Ortak bitiş: `Geçerlilik`

---

## 7. CSS ve UI

### 7.1. `.ruhsat-policy-date-stack` (`tasitlar-extra.css`)

Sigorta/Kasko upload tarih alanı:

- `max-width: 280px`, yatay ortalı (Dosya Seç kutusu ile hizalı)
- Etiket: ortalı, `12px`, beyaz
- Input / mobil date wrap: **36px** sabit yükseklik

Takograf upload, aynı tarih alanı kurallarının takografa özel yerleşimini `.ruhsat-policy-date-stack--takograf` owner sınıfıyla uygular.

### 7.2. Başlangıç Tarihi etiketi FOUC (`367505d6`)

**Sorun:** Modal açılışında `tasitlar-base.css` içindeki `.olay-ekle-modal .modal-body label { text-align: left !important }` etiketi sola yaslıyor; `tasitlar-extra.css` yüklenince ortaya kayıyordu.

**Çözüm:** Owner istisna hem `tasitlar-base.css` (global + masaüstü media) hem mobil blok sonunda `tasitlar-extra.css` içinde:

```css
#dinamik-olay-modal #ruhsat-modal-content .ruhsat-policy-date-stack .form-label {
  text-align: center !important;
}
```

Paralel override dosya sonuna eklenmedi; mevcut `.ruhsat-policy-date-stack` owner bloğu genişletildi.

---

## 8. Olay Ekle ile Farklar

| Konu | Olay Ekle | Belge upload |
| --- | --- | --- |
| Sigorta/Kasko etiket | Yenileme/Başlangıç (gg/aa/yyyy) | Başlangıç Tarihi |
| Tarih zorunluluğu | Olay kaydında forma göre değişir | **Opsiyonel** |
| Kaydet tetikleyici | Kaydet butonu | Dosya seçimi (+ replace onay) |
| Handler | `updateSigortaInfo` / `updateKaskoInfo` / `updateTakografKalibrasyonInfo` | `saveRuhsatUpload` → `upload_ruhsat.php` |

Input ID’leri ve parse/doğrulama owner’ı ortaktır; iki akış birbirinin yerine geçmez.

---

## 9. Statik Doğrulama (uygulama sırasında)

| Kontrol | Sonuç |
| --- | --- |
| `node --check tasitlar.js` | OK |
| `php -l upload_ruhsat.php` | OK |
| Tarih matrisi (15 geçerli/geçersiz gg/aa/yyyy) | PASS |
| Backend upload matrisi | 15 PASS / 0 FAIL / 2 UI SKIP |
| Tarih boşken mevcut tarihlerin korunması | PASS |
| Tarih doluyken PDF + tarih kaydı | PASS |
| Geçersiz tarih / stale version / belge-only merge kontrolleri | PASS |
| Kamyon dışı Takograf ve Taşıt Kartı tarih payload reddi | PASS |
| `git diff --check` | OK |

---

## 10. Manuel Test Matrisi (önerilen)

### 10.1. Sigorta / Kasko

- [ ] Tarih boş + yeni PDF → yalnızca dosya kaydı, mevcut bitiş tarihi korunur
- [ ] Tarih dolu + yeni PDF → bitiş = başlangıç + 1 yıl
- [ ] Mevcut belge replace → onay (Evet/Hayır); Hayır’da dosya seçimi sıfırlanır
- [ ] Geçersiz tarih (31/02/2026) → alert, upload başlamaz
- [ ] Masaüstü + 390px: etiket ilk çizimden itibaren ortada (FOUC yok)
- [ ] Takvim ikonu / gg/aa/yyyy doldurma

### 10.2. Takograf (büyük ticari)

- [ ] Küçük ticari / otomobil → belge menüsünde Takograf yok
- [ ] Tarih boş → PDF only, kalibrasyon alanları korunur
- [ ] Tarih dolu → kalibrasyon + 2 yıl bitiş
- [ ] Olay Ekle Takograf formu regresyonsuz

### 10.3. Taşıt Kartı

- [ ] K2 bitiş yok → upload engellenir (alert)
- [ ] K2 var → yalnızca dosya seç; boş tarih kutusu yok
- [ ] İlk yüklemede otomatik upload hint’i görünmez

### 10.4. Dar temizlik kabul testi (2026-06-13)

- [x] Sigorta / Kasko / Takograf: geçerli tarih + yeni dosya → otomatik upload
- [x] Geçersiz `31/02/2026` + dosya seçimi → upload başlamaz; dosya input’u ve yeşil görünüm sıfırlanır
- [x] Tarih düzeltildikten sonra aynı dosya yeniden seçilip yüklenebilir
- [x] Mevcut Kasko belgesinde `Hayır` → seçim sıfırlanır, mevcut belge korunur
- [x] Mevcut Kasko belgesinde `Evet` → replacement event’iyle yeni belge yüklenir
- [x] Ruhsat mobil görünümünde `Yazdır` butonu görünür; mevcut `48px` yükseklik ve `8px` radius korunur
- [x] Upload modalında tek `Vazgeç` butonu yatay ortalı kalır
- [ ] İki oturumlu conflict üretimi → çalıştırılmadı; conflict kod yolu ve kullanıcı mesajı statik doğrulandı

Test sırasında oluşan `data.json` değişiklikleri ve yüklenen test PDF’leri başlangıç yedeğine geri alındı.

---

## 11. Bilinçli Kapsam Dışı

- `data/data.json` commit’lenmedi; runtime veri korundu
- Ruhsat belgesi upload → tarih alanı yok
- Taşıt Kartı upload → kullanıcı tarih girişi yok (K2 merkezi model)
- Driver / admin / raporlar modülleri
- Belge önizleme, yazdırma, object URL cache davranışı
- Deploy pipeline (FTP aralıklı timeout ayrı konu — bkz. `docs/ACTIONS-BACKLOG.md`)

---

## 12. Sonuç

Sigorta, Kasko ve Takograf belge yükleme ekranları, Olay Ekle tarih altyapısındaki ortak helper’lar üzerinden bağlandı. Tarih opsiyoneldir; boş bırakıldığında yalnızca PDF güncellenir. Tarih girildiğinde PDF yolu ve tarih alanları aynı JSON mutation içinde güncellenir (+1 yıl poliçe, +2 yıl takograf). Dosya yaşam döngüsündeki legacy kopya ve preview temizliği yalnızca başarılı mutation sonrasında yapılır.

Yeni belge tipi için tarih bağlantısı eklerken: önce Olay Ekle’de input ID ve iş kuralı owner’ını netleştir; ardından `getPolicyOperationDateFieldHtml` / `validatePolicyDocumentOperationDate` whitelist’ine ve `upload_ruhsat.php` mutation bloğuna ekle.
