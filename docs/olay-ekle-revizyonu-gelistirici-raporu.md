# Olay Ekle Revizyonu — Güncel Kod Durumu ve Kapanış Kontrolü

## 1. Amaç

Olay Ekle ekranındaki işlem yoğunluğunu azaltmak, işlemleri mantıksal kategorilere ayırmak ve taşıt bazlı süreli işlemleri aynı akış altında toplamak amaçlandı.

Özellikle Taşıt Kartı işlemi, taşıt bazlı süreli bir kayıt olmasına rağmen daha önce Olay Ekle akışında yer almıyordu. Bu çalışma ile Taşıt Kartı, K2 mimarisi bozulmadan Olay Ekle sistemine dahil edildi.

## 2. Tamamlanan Fazlar

### Faz 1 — Owner / Mimari Analiz

Tamamlandı.

Tespit edilen ana owner dosya:

- `tasitlar.js`

İncelenen ana yapılar:

- Olay Ekle kategori yapısı
- Event ID listesi
- Takograf event hattı
- Muayene / Egzoz checkbox hattı
- Taşıt Kartı field yapısı
- K2 bağlantısı
- Tarihçe / bildirim sistemi

Ana tespitler:

- K2 şirket bazlıdır.
- Taşıt Kartı taşıt bazlı görünür; ancak mevcut sistemde bitiş tarihi K2 bitiş tarihini mirror eder.
- Bu nedenle Taşıt Kartı event'i eklenirken K2 sync, upload, ayarlar, kayıt ve driver tarafına dokunulmamalıdır.

### Faz 2 — Olay Ekle Kategori Yapısı

Tamamlandı.

Olay Ekle menüsü artık kategori bazlıdır.

| Kategori | İşlemler |
| --- | --- |
| Taşıt Süreli İşlemleri | Muayene, Takograf, Taşıt Kartı |
| Poliçe İşlemleri | Sigorta, Kasko |
| Taşıt Üzeri / Donanım | Takip, UTTS, Anahtar, Lastik, Hak Mahrumiyeti / Kredi, Kasko Kodu |
| Operasyon / Genel | Ceza, KM, Bakım, Kaza, Şube, Kullanıcı, Satış/Pert |

Korunan kurallar:

- Egzoz ayrı event değildir; mevcut Muayene formu içindeki checkbox akışıyla çalışmaya devam eder.
- Takograf yalnızca `vehicleNeedsTakograf()` şartını sağlayan taşıtlarda görünür.
- Şube/Kullanıcı işlemleri arşiv/kilit mantığına göre filtrelenmeye devam eder.

### Faz 3 — Taşıt Kartı Güncelle Event'i

Tamamlandı.

| Alan | Değer |
| --- | --- |
| Menü/event ID | `tasitkarti` |
| Kayıt event tipi | `tasit-karti-guncelle` |
| Label | Taşıt Kartı Güncelle |

Davranış:

- Sadece K2 kapsamındaki taşıtlarda görünür.
- K2 kapsamı dışındaki taşıtlarda menüye gelmez; doğrudan açılmaya çalışılırsa işlem ayrıca engellenir.
- Kullanıcı yapılma/giriş tarihi girer.
- Bitiş tarihi readonly olarak şirket bazlı K2 belgesi bitiş tarihinden gelir.
- K2 bitiş tarihi yoksa kayıt engellenir ve veri yazılmaz.
- Kayıt sonrası tarihçe oluşur.
- Bildirim/tarihçe mesajları güncellenmiştir.

## 3. Güncel Kodda Doğrulananlar

Kapanış kontrolünde aşağıdaki maddeler güncel kodda doğrulanmıştır:

- `tasitkarti` event label'ı mevcuttur.
- `availableEventIds` içine `tasitkarti` yalnızca `vehicleNeedsK2Belgesi(currentMenuVehicle)` ile eklenir.
- K2 dışı taşıtlarda `tasitkarti` görünmez.
- `case 'tasitkarti'` formu mevcuttur.
- `window.updateTasitKartiInfo` kayıt handler'ı mevcuttur.
- `tasit-karti-guncelle` history/event tipi mevcuttur.
- `tasitKartiYapilmaDate` alanı işlenir.
- Taşıt Kartı bitiş tarihi doğrudan K2 kaynağından alınır; K2 kaynak tarihi yoksa kayıt engellenir.
- Egzoz için ayrı event oluşturulmamıştır.
- Takograf görünürlük şartı korunmuştur.
- K2 sync yapısı korunmuştur.
- `upload_ruhsat.php`, `ayarlar.js`, `kayit.js`, `driver/`, raporlar ve `data/data.json` bu çalışma kapsamında değiştirilmemiştir.

## 4. Cache / Version Durumu

Güncel kodda cache bump mevcuttur.

| Dosya | Doğrulanan sürüm |
| --- | --- |
| `script-core.js` içindeki `tasitlar` modül sürümü | `20260607.7` |
| `index.html` içindeki `script-core.js` query sürümü | `20260607.5` |

Canlı testte hard refresh veya uygulamadaki önbellek temizleme işlemi sonrasında güncel `tasitlar.js` yüklenmelidir.

## 5. Bilerek Dokunulmayan Alanlar

Bu çalışmada aşağıdaki alanlara bilinçli olarak dokunulmadı:

- `upload_ruhsat.php`
- `ayarlar.js`
- `kayit.js`
- `driver/`
- Raporlar
- `data/data.json`
- K2 ayar akışı
- Taşıt Kartı belge upload akışı

Gerekçe:

- K2 şirket bazlı kalmalıdır.
- Taşıt Kartı bitiş tarihi mevcut mimaride K2 bitiş tarihini mirror eder.
- Bu fazın amacı K2 mimarisini değiştirmek değil, Taşıt Kartı için Olay Ekle event hattı açmaktır.

## 6. Kapanış Test Senaryoları

### 6.1 K2 Kapsamındaki Taşıt

Taşıt tipleri: `minivan`, `kamyon`, `romork`

Beklenen:

- Olay Ekle → Taşıt Süreli İşlemleri → Taşıt Kartı Güncelle görünür.
- Yapılma Tarihi girilebilir.
- Bitiş Tarihi readonly görünür ve K2 bitiş tarihiyle aynıdır.
- Kaydetme sonrası `vehicle.tasitKartiYapilmaDate` set edilir.
- `vehicle.tasitKartiExpiryDate`, K2 bitişiyle uyumlu kalır.
- `tasit-karti-guncelle` event'i oluşur.
- Tarihçede Taşıt Kartı güncelleme kaydı görünür.

### 6.2 K2 Dışı Taşıt

Taşıt tipi: `otomobil`

Beklenen:

- Taşıt Kartı Güncelle menüde görünmez.
- İşlem doğrudan tetiklenmeye çalışılırsa kayıt yapılmaz.

### 6.3 K2 Bitiş Tarihi Yoksa

Beklenen:

- Taşıt Kartı Güncelle kaydı yapılamaz.
- Kullanıcıya uyarı verilir.
- Veri yazılmaz.

### 6.4 Egzoz Kontrolü

Beklenen:

- Egzoz için ayrı event yoktur.
- Egzoz mevcut Muayene formu içindeki checkbox akışında çalışır.

### 6.5 Takograf Kontrolü

Beklenen:

- Takograf yalnızca `vehicleNeedsTakograf()` sonucu `true` ise görünür.
- Mevcut takograf form/save/history hattı değişmemiştir.

## 7. Kalan Backlog

Bu çalışma kapsamında zorunlu eksik kalmamıştır. Aşağıdaki işler yeni faz / backlog olarak değerlendirilmelidir.

### Backlog 1 — Belge Yükleme + Tarih Entegrasyonu

Mevcut durumda Belgeler ekranında belge yüklenir, Olay Ekle ekranında tarih girilir.

İleride belge yüklerken yapılma tarihinin de girildiği ve belge upload + Olay Ekle tarih güncellemesinin tek işlemde yapıldığı bir yapı değerlendirilebilir.

Risk: Belge history + olay history çift kayıt üretebilir. Bu nedenle ayrı analiz ve ayrı faz gerektirir.

### Backlog 2 — Olay Ekle Kart Etiketlerini Kısaltma

Mevcut örnekler:

- Muayene Bilgisi Güncelle
- Sigorta Bilgisi Güncelle
- Kasko Bilgisi Güncelle

Alternatif kısa etiketler: Muayene, Sigorta, Kasko.

Şu an değiştirilmedi; mevcut uzun etiketler işlemin güncelleme olduğunu net anlatır ve form başlıklarıyla tutarlıdır. Bu değişiklik kozmetik olduğu için kapsam dışı bırakılmıştır.

### Backlog 3 — Görsel Kategori Ayrıştırması

Kategori başlıkları veya kartlar ileride hafif görsel ayrımla iyileştirilebilir. Mevcut ikon bazlı ayrım işlevseldir; renk/vurgu bazlı ayrım zorunlu değildir.

### Backlog 4 — Olay Metadata Tanımlarının Merkezileştirilmesi

Olay ikonları, etiketleri, kategorileri, başlıkları ve kayıt handler eşlemeleri birden fazla yerde tutulmaktadır. Yeni olay tipi eklenirken ilgili listelerin birlikte güncellenmesi gerekir. İleride tek kaynaklı metadata yapısıyla sadeleştirilebilir.

## 8. Sonuç

Olay Ekle revizyonu fonksiyonel olarak tamamlanmıştır.

Tamamlanan ana çıktılar:

- Kategori bazlı Olay Ekle menüsü
- Taşıt Kartı Güncelle event'i
- K2 kapsamına bağlı görünürlük
- Yapılma tarihi girişi
- K2 bitişine bağlı readonly bitiş tarihi
- K2 tarihi yoksa kayıt engeli
- Tarihçe entegrasyonu
- Bildirim mesajı entegrasyonu
- Cache/version güncellemesi

Mevcut kodda bu çalışma için kritik eksik görünmemektedir.

| Faz | Durum |
| --- | --- |
| Faz 1 | Tamam |
| Faz 2 | Tamam |
| Faz 3 | Tamam |
| Olay Ekle çalışması | Kapatılabilir |
