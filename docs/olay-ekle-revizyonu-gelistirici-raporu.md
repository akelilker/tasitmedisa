# Olay Ekle Revizyonu — Güncel Kod Durumu ve Kapanış Kontrolü

## 1. Amaç

Olay Ekle ekranındaki işlem yoğunluğunu azaltmak, işlemleri mantıksal kategorilere ayırmak ve taşıt bazlı süreli işlemleri aynı akış altında toplamak.

Taşıt Kartı işlemi K2 mimarisi bozulmadan Olay Ekle sistemine dahil edildi. Sonraki temizlik fazlarında menü metadata'sı, ikon registry'si, form CSS owner'ı ve geliştirici dokümantasyonu güncel kod yapısına hizalandı.

## 2. Güncel Olay Ekle Menü Yapısı

Olay Ekle menüsü 5 ana kategori kartı ve inline SVG ikonlarla çalışır.

| Kategori ID | Başlık | Olay sırası |
| --- | --- | --- |
| `sureli` | Yasal Zorunluluklar | Muayene, Takograf Kalibrasyonu, Taşıt Kartı |
| `police` | Sigorta İşlemleri | Sigorta, Kasko, Kasko Kodu |
| `donanim` | Kurumsal Eklentiler | Taşıt Takip Cihazı, UTTS |
| `kullanim` | Kullanım ve Olaylar | Kilometre, Trafik Cezası, Bakım, Lastik Durumu, Yedek Anahtar, Kaza |
| `yonetim` | Yönetim İşlemleri | Kullanıcı Atama / Değişikliği, Şube Değişikliği, Hak Mahrumiyeti, Satış / Pert |

Korunan kurallar:

- Egzoz ayrı event değildir; Muayene formu içindeki checkbox akışıyla çalışır.
- Takograf yalnızca `vehicleNeedsTakograf()` şartını sağlayan taşıtlarda görünür.
- Taşıt Kartı yalnızca `vehicleNeedsK2Belgesi()` kapsamındaki taşıtlarda görünür.
- Şube/Kullanıcı işlemleri arşiv/kilit mantığına göre filtrelenir.

## 3. Güncel Metadata Owner Yapısı (`tasitlar.js`)

Ana owner dosya: `tasitlar.js`

### 3.1. İkon registry'leri

Modül seviyesinde sabitler:

- `EVENT_MENU_SHIELD_CHECK_SVG`
- `EVENT_MENU_CATEGORY_ICONS` — kategori kart ikonları (`sureli`, `police`, `donanim`, `kullanim`, `yonetim`)
- `EVENT_MENU_EVENT_ICONS` — olay kart ikonları (18 olay + fallback `vehicle`)

`getEventMenuCategoryIconHtml()` bu registry'lerden HTML üretir. Sigorta/Kasko kategori kartlarında tikli kalkan + dış S/K harfi korunur.

### 3.2. `EVENT_DEFINITIONS` — tek metadata owner

Her olay tanımı şu alanları taşır:

- `menuLabel` — menü kart etiketi
- `modalTitle` — dinamik olay modal başlığı
- `saveHandlerName` — kayıt handler adı (yalnızca string)

`EVENT_MENU_LABELS`, `EVENT_DEFINITIONS` üzerinden otomatik türetilir. Ayrı `EVENT_TITLES` veya local `saveHandlers` map'i kullanılmaz.

### 3.3. Kategori ve varsayılan olay listeleri

- `EVENT_MENU_GROUPS` — kategori sırası, başlıklar ve kategori içi olay sırası
- `EVENT_MENU_DEFAULT_EVENT_IDS` — menüde başlangıçta görünen olay ID seti; takograf, taşıt kartı, şube/kullanıcı koşulları runtime'da eklenir veya çıkarılır

### 3.4. Runtime handler çözümleme

Modal açıldığında Kaydet butonu şu akışla bağlanır:

```javascript
const handler = window[eventDefinition.saveHandlerName];
```

Handler referansı registry'de tutulmaz; dosya sonundaki save guard wrapper'ları korunur.

### 3.5. Vehicle ID escape akışı

- `eventMenuRenderState.vehicleId` ham/orijinal string taşır.
- State'e yazarken `.replace(/"/g, '&quot;')` uygulanmaz.
- Escape yalnızca HTML attribute render edilirken `escapeAttr()` ile yapılır.
- Menü butonundan okunan `data-vehicle-id` ham ID olarak `openEventModal`'a iletilir.

### 3.6. Form stack CSS owner

- `#dinamik-olay-modal #dinamik-olay-form-icerik` — flex column, gap 12px (`tasitlar-base.css` owner bloğu)
- `.event-form-stack` — 18 dinamik olay formunun kök sarmalayıcı sınıfı
- `index.html` içindeki `#dinamik-olay-form-icerik` inline flex stili kaldırıldı

## 4. Cache / Version Durumu

| Dosya | Güncel sürüm |
| --- | --- |
| `script-core.js` → `tasitlar` | `20260611.20` |
| `index.html` → `script-core.js` query | `20260611.17` |
| `sw.js` → `CACHE_VERSION` | `medisa-v2.150` |

## 5. Tamamlanan Faz Özetleri

| Faz | Kapsam | Durum |
| --- | --- | --- |
| Faz 1A | Kesin ölü Olay Ekle CSS/JS/PNG temizliği | Tamam |
| Faz 1B | Genel taşıt legacy selector temizliği | Tamam |
| Faz 2A-1 | Taşıt detay `.detail-plate-row` statik DOM | Tamam |
| Faz 2B-1 | Taşıt detay mobil üst alan CSS tekrar temizliği | Tamam |
| Faz 3A | İkon registry modül seviyesine taşındı | Tamam |
| Faz 3B-1 | Menü metadata (`EVENT_MENU_LABELS`, `EVENT_MENU_GROUPS`, `EVENT_MENU_DEFAULT_EVENT_IDS`) | Tamam |
| Faz 3C-1 | `EVENT_DEFINITIONS` tek metadata owner | Tamam |
| Faz 3C-2 | Vehicle ID çift escape düzeltmesi | Tamam |
| Faz 3C-3 | `.event-form-stack` CSS owner | Tamam |
| Faz 3C-4 | Bu geliştirici raporu güncellemesi | Tamam |

## 6. Bilerek Dokunulmayan Alanlar

- `data/data.json`
- `upload_ruhsat.php`, `ayarlar.js`, `kayit.js`
- `driver/`, `admin/`, raporlar
- K2 ayar akışı, Taşıt Kartı belge upload akışı

### Belge / Ruhsat bloğu — kapsam dışı

Belge/Ruhsat bloğu (belge yükleme, değiştirme, görüntüleme, önizleme, yazdırma; PDF/görsel belge; object URL/cache; Android/iOS PWA kodları) bilinçli olarak tüm temizlik fazlarından çıkarılmıştır. **Faz 4 modül adayı değildir**; ayrı analiz ve onay gerektirir.

## 7. Kapanış Test Senaryoları

### 7.1 K2 kapsamındaki taşıt

- Olay Ekle → Yasal Zorunluluklar → Taşıt Kartı görünür.
- Yapılma tarihi girilebilir; bitiş tarihi K2 bitişinden readonly gelir.
- K2 bitişi yoksa kayıt engellenir.

### 7.2 K2 dışı taşıt

- Taşıt Kartı menüde görünmez; doğrudan tetiklenirse engellenir.

### 7.3 Metadata ve handler

- 18 olay key'i menü etiketi, modal başlığı ve handler adıyla eşleşir.
- Kaydet butonu doğru `window[saveHandlerName]` fonksiyonuna bağlanır.

### 7.4 Form düzeni

- Desktop ve 390px: Bakım, Kaza, Sigorta, Muayene, Kullanıcı Atama, Yedek Anahtar formlarında alan aralıkları korunur.

## 8. Faz 4 — Analiz / Modülerleştirme Backlog'u

Faz 4 yalnızca analiz ve planlama fazıdır; otomatik uygulama kapsamı dışındadır.

Olası güvenli adaylar (Belge/Ruhsat hariç):

- Olay form `switch` ve availability kurallarının `EVENT_DEFINITIONS` ile genişletilmesi (handler/form yönlendirmesi ayrı alt faz)
- `getEventMenuCategoryIconHtml` → `getEventMenuIconHtml` isimlendirme netleştirmesi
- Taşıt detay migration fallback'lerinin PWA doğrulaması sonrası kaldırılması
- Mobil Olay Ekle / taşıt detay CSS parçalanmasının owner birleştirmesi
- Genel taşıt legacy selector temizliği (runtime smoke sonrası)

Belge/Ruhsat bloğu bu listeye dahil edilmemelidir.

## 9. Sonuç

Olay Ekle revizyonu ve Faz 3C metadata/CSS temizliği tamamlanmıştır. Kritik fonksiyonel eksik görünmemektedir. Yeni olay tipi eklerken `EVENT_DEFINITIONS`, `EVENT_MENU_GROUPS`, `EVENT_MENU_DEFAULT_EVENT_IDS` ve ilgili ikon registry'si birlikte güncellenmelidir.
