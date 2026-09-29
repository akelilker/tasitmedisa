# Medisa Taşıt Yönetim — Yönetici Kılavuzu

Bu kılavuz **ana yönetim uygulaması** (`index.html`) ve **Kullanıcı Raporları** panelini (`admin/driver-report.html`) kapsar. Hedef kitle: **Genel Yönetici**, **Yönetici (şube yöneticisi)** ve ana uygulamaya erişimi olan yönetim kullanıcıları.

---

## 1. Giriş ve roller

### 1.1 Oturum akışı

1. `index.html` açıldığında geçerli portal token yoksa otomatik **`driver/index.html?portal=main-app`** girişine yönlendirilirsiniz.
2. Aynı **Kullanıcı Adı / Şifre** ile giriş yapılır.
3. Rolünüze göre:
   - **Genel Yönetici** (`genel_yonetici`) — tüm şubeler, şube yönetimi, yedekleme, zorunlu evraklar (K2), dış veri (yetkiliyse).
   - **Yönetici** (`sube_yonetici`) — yetkili olduğunuz şube(ler); kullanıcı yönetimi (yetkiye göre); şube yönetimi **görünmez**.
   - **Kullanıcı** (`kullanici`) — `driver_dashboard` açıksa doğrudan **Kullanıcı Paneli**; değilse oturum kapanır.

Ayarlarda kullanıcı kartı etiketleri: **Genel Yönetici**, **Yönetici**, **Kullanıcı**. Raporlarda **Satış Temsilcisi** ayrı etiket olarak geçebilir (`sales` rolü).

[EKRAN: Ana sayfa — KAYIT / TAŞITLAR / RAPORLAR menüsü]

### 1.2 Zorunlu şifre değişimi

İlk girişte geçici parola varsa ana uygulama içeriği gizlenir; şifre değişimi tamamlanana kadar menüler açılmaz.

### 1.3 Çıkış / Bu cihazı unut

**Ayarlar** menüsünde (yetkili oturumlarda görünür):

- **Bu Cihazı Unut**
- **Çıkış**

Onay metni (Bu Cihazı Unut): *Bu cihazda saklanan kullanıcı adı, parola ve oturum bilgileri silinecek.*

---

## 2. PWA kurulumu (yönetici uygulaması)

- Manifest: kök `manifest.json` — ad **Taşıt Yönetim Sistemi**, `start_url`: `./index.html`.
- **Android / masaüstü Chrome**: ortada **Uygulamayı Yükle** (`script-core.js` — `pwa-install-wrapper`).
- **iOS**: Safari → **Ana Ekrana Ekle**; `apple-mobile-web-app-title`: Taşıt Yönetim Sistemi.
- **Kullanıcı Raporları** (`admin/manifest.json`) ayrı kısayol; admin sayfasında da `pwa-install-wrapper` vardır.

Kurulu PWA’da yükleme çubuğu gizlenir.

[EKRAN: Ana sayfa ikon satırı — takvim, PWA, bildirim, ayar]

---

## 3. Ana sayfa — gezinme haritası

### 3.1 Üst ikon satırı

| Konum | `aria-label` / işlev |
|--------|----------------------|
| Sol | **Bu Ay Yapılacaklar** (takvim simgesi) — aylık özet modalını açar |
| Orta | PWA **Uygulamayı Yükle** (uygun cihazda) |
| Sağ | **Bildirimler** (zil) |
| Sağ | **Ayarlar** (dişli) |

### 3.2 Ana menü

| Düğme | Açıklama |
|--------|-----------|
| **KAYIT** | Yeni taşıt kaydı / düzenleme (`kayit.js`) |
| **TAŞITLAR** | Şube grid → taşıt listesi → taşıt detayı |
| **RAPORLAR** | Stok listesi, detay sütunları, Excel, yazdır |

Menüler lazy yüklenir; hazırlanırken *Bölüm hazırlanıyor…* durumu görülebilir.

### 3.3 Kullanıcı Paneli bağlantısı

Sayfa altında **Kullanıcı Paneli** → `driver/index.html?portal=main-app` (sürücü girişi).

### 3.4 Ayarlar menüsü (rol filtreli)

| Öğe | Kim görür? |
|-----|------------|
| **Şube Yönetimi** | `manage_branches` (genelde Genel Yönetici) |
| **Kullanıcı Yönetimi** | `manage_users` |
| **Zorunlu Evraklar** | Veri yönetimi yetkisi |
| **Dış Veri Yönetimi** | `manage_data`; mobil/iOS PWA’da gizlenebilir |
| **Veri Yedekleme** → Yedek Al / Yedekten Geri Yükle | `manage_backups` (genelde Genel Yönetici) |
| **Önbellek Temizle** | Veri veya ayar yetkisi |
| **Bu Cihazı Unut** / **Çıkış** | Oturum açıkken |

---

## 4. Kayıt işlemleri (KAYIT)

Modal başlığı: **KAYIT İŞLEMLERİ**.

### 4.1 Temel alanlar

- **Taşıt Tipi**: Otomobil/SUV, Küçük Ticari, Büyük Ticari, Römork
- **Plaka**, **Üretim Yılı**, **Marka / Model**
- **Km (Alındığı Tarih)**, **Taşıtın Alım Bedeli**
- **Şanzıman Tipi**, **Tramer Kaydı**, **Boya / Değişen**
- **Sigorta / Kasko / Muayene Bitiş Tarihi** (`gg.aa.yyyy`)
- **Egzoz muayenesi farklı mı?** onay kutusu → **Egzoz Muayenesi Bitiş Tarihi**
- **Yedek Anahtar**, **Hak Mahrumiyeti?** (+ açıklama)
- **Tahsis Edilen Şube** (şube yöneticisinde yeni kayıtta bölüm gizlenebilir)
- **Kasko Kodu**, **Notlar**
- Ruhsat / tescil akışı: **Tescil Tarihi** ve ruhsat yükleme adımları form içinde

Kayıt sonrası taşıt **TAŞITLAR** listesinde görünür.

[EKRAN: Kayıt formu — plaka ve tarih alanları]

---

## 5. Taşıtlar (TAŞITLAR)

### 5.1 Şube seçimi

İlk açılış: **şube kartları** (şube adı + taşıt sayısı). **Tümü** ve tekil şubeler.

Araç çubuğu (dashboard):

- **Genel Arama** (`title`: Genel Arama)
- **Şanzıman tipi** — Tümü / Otomatik / Manuel
- **Arşiv** (`title`: Arşiv) — satılmış/pert taşıtlar

### 5.2 Liste görünümü

Şube seçildikten sonra:

- **Şube Seçimi** (geri)
- **Ara**, **Şanzıman**, **Görünüm** (kutu ↔ liste)

Kartlarda plaka, marka/model; **!** turuncu/kırmızı — **Tarih uyarısı** (sigorta, kasko, muayene, egzoz).

### 5.3 Taşıt detayı

Plaka satırı:

- **! Olay Ekle** — olay menüsü
- Plaka (arşivde **SATILDI** / **PERT** etiketi)

Araç çubuğu (detay):

| Simge | `title` / işlev |
|--------|------------------|
| Saat / kum saati | **Tarihçe** |
| Belge | **Belgeler** |
| Yazıcı | **Taşıt Kartı Yazdır** |

Şubesi yoksa: **Şubeye Tahsis Etmek İçin +**

Sol/sağ kolonlarda özet: sigorta, kasko, muayene, **Egzoz Muayene Bitiş**, **Taşıt Kartı**, takograf, **Arvento**, **UTTS**, km, notlar vb.

Muayene satırında taşıt tipi seçilmediyse **!** ve ipucu: *Taşıt Tipi Seçilmediğinden, Muayene Bitiş Tarihi Hatalı Gözükebilir…*

Notlar satırında kalem: **Notları düzenle** (yönetici inline).

[EKRAN: Taşıt detay — Olay Ekle ve üç simge]

---

## 6. Olay Ekle — tüm yönetim kayıtları

**! Olay Ekle** → kategori menüsü:

| Kategori | Olaylar |
|----------|---------|
| **Yasal Zorunluluklar** | Muayene, Takograf Kalibrasyonu, Taşıt Kartı |
| **Sigorta İşlemleri** | Sigorta, Kasko, Kasko Kodu |
| **Kurumsal Eklentiler** | **Arvento**, UTTS |
| **Kullanım ve Olaylar** | **Kilometre**, Trafik Cezası, Bakım, Lastik Durumu, Yedek Anahtar, Kaza |
| **Yönetim İşlemleri** | Kullanıcı Atama / Değişikliği, Şube Değişikliği, Hak Mahrumiyeti, **Satış / Pert** |

Menü öğelerinde renk göstergesi: eksik tarih (turuncu/kırmızı), dolu (yeşil ton).

Her olay modalında **Kaydet** / **Vazgeç**; geri: **Olay Ekle** veya **Taşıt Detay'a dön**.

### 6.1 Kilometre güncelleme (yönetici)

**Olay Ekle → Kilometre** → modal **KM GÜNCELLE**:

1. Kilometre alanını doldurun.
2. Kaydedin.

Kurallar (uyarı metinleri):

- Boş veya geçersiz değer reddedilir.
- Yeni km, önceki kayıttan küçükse: *Bildirilmek İstenen Km, Önceki Kayıtlarla Uyuşmamaktadır. Şirket Yetkilisi İle Görüşün*

Kayıt `guncelKm` alanını günceller ve tarihçede **km-revize** olayı oluşur.

### 6.2 Satış / pert (arşiv)

**Olay Ekle → Satış / Pert** → **SATIŞ/PERT BİLDİRİMİ**:

1. **İşlem Türü**: **Satış** veya **Pert**
2. **Satış/Pert Tarihi** (zorunlu)
3. Tutar ve açıklama alanları
4. Kaydet

Sonuç:

- `satildiMi = true`, taşıt **Arşiv** görünümüne gider.
- Mesaj: *Taşıt satış işlemi kaydedildi.* veya pert + *Taşıt arşive taşındı.*

Kayıt sonrası isteğe bağlı akış:

- *Satış Sözleşmesini Yüklediniz mi?*
- *Satış Sözleşmesini Şimdi Yüklemek İster misiniz?*

**Belgeler** içinde **Satış Sözleşmesi** yalnız arşiv (satış/pert) taşıtlarda yüklenir.

[EKRAN: Satış/Pert formu]

### 6.3 Muayene, egzoz, taşıt kartı, takograf

- **Muayene**: bitiş tarihi; egzoz farklı tarihli ise formda egzoz alanları.
- **Taşıt Kartı**: K2 kapsamındaki taşıtlarda; aksi halde uyarı: *Taşıt Kartı güncellemesi sadece K2 belgesi kapsamındaki taşıtlarda kullanılır.*
- **Takograf Kalibrasyonu**: ilgili taşıt tiplerinde menüde anlamlıdır.

### 6.4 Arvento (takip cihazı) — “sürat takibi”

UI’da **Arvento Var mı?** (Evet/Hayır). Detay satırı **Arvento**. Ayrı “sürat takibi” modülü yoktur; operasyonel takip bu alan üzerinden yürütülür.

### 6.5 UTTS

**UTTS Cihazı Var mı?** — detayda **UTTS** satırı.

### 6.6 Belgeler (yükleme)

Detay → **Belgeler** veya olay akışından:

| Belge | Not |
|--------|-----|
| Ruhsat | Ruhsat Yükle / Değiştir |
| Sigorta / Kasko Poliçesi | Poliçe Yükle |
| K2 Belgesi | Ayarlar kapsamında da tanımlanabilir |
| Taşıt Kartı | Taşıt bazlı dosya |
| Takograf Belgesi | |
| Satış Sözleşmesi | Yalnız arşiv taşıt |

### 6.7 Tarihçe

**Tarihçe** simgesi → sekmeler:

- **Bakım geçmişi**, **Kaza geçmişi**, **Km güncelleme geçmişi**, **Diğer geçmiş kayıtları**

Geri: **Taşıt detayına dön**.

---

## 7. Bu Ay Yapılacaklar / Ay özeti

### 7.1 Nereden açılır?

Ana sayfa sol üst **Bu Ay Yapılacaklar** (takvim ikonu).

### 7.2 Modal başlığı

Kod: **`{Ay adı} Ayı Özet`** (ör. *Eylül Ayı Özet*). Buton etiketi ile başlık farklıdır; kullanıcıya anlatırken ikisini de söyleyin.

### 7.3 Ne işe yarar?

- Seçilen ay için **yaklaşan / geçmiş** yasal ve sigorta tarihlerini taşıt bazında listeler.
- Sütunlar: **Plaka / Marka-Model**, **Kullanıcı** (+ şube), **Açıklama** (sigorta, kasko, muayene, egzoz vb. birleşik metinler).
- **Şube filtresi** (`title`: Şube filtresi).
- Satırda **WhatsApp** simgesi — hatırlatma mesajı; daha önce açıldıysa `title`: *WhatsApp bildirimi daha önce başlatılmış olabilir*.
- Satıra tıklayınca modal kapanır ve ilgili **taşıt detayı** açılır; dönüşte aylık listeye geri köprüsü vardır.

Boş liste: *Bu dönem için listelenecek tarih işlemi yok.*

Üst rozet: bekleyen görev sayısı (varsa).

[EKRAN: Ayı Özet modal — WhatsApp sütunu]

---

## 8. Bildirimler

**Bildirimler** zil menüsü:

- Yaklaşan/bitmiş tarihler, eksik belgeler, sürücü **talep/şikayet** kayıtları.
- Talep satırları **Kullanıcı Raporları**na gider (`admin/driver-report.html?from=notifications`).
- Kasko değer listesi / dış veri kısayolları (yetki + cihaz).

Okundu durumu sunucuda tutulur.

---

## 9. Raporlar (RAPORLAR)

Tek sekme mantığı: **Stok görünümü** (şube grid → liste).

### 9.1 Temel sütunlar

Sıra, Şube, Yıl, Marka/Mod., Taşıt tipi (mobilde gizlenebilir), Plaka, Şanzıman, **KM** (güncel km öncelikli).

### 9.2 Detay ekleme

**+ Detay Ekleme** menüsünden isteğe bağlı sütunlar (oturum boyunca; sayfa yenilenince sıfırlanır):

Sigorta, Kasko, Kasko değeri, Muayene, Hak Mahrumiyeti, Lastik, UTTS, Takip (Arvento), Tramer, Boya, Kullanıcı, Tescil — ayrıca muayene/egzoz bölünmüş görünüm.

Sütun sırası sürükle-bırak ile değiştirilebilir (kalıcı kısım localStorage’da).

### 9.3 Dışa aktarma

- **Excel'e Aktar** (`exportStokToExcel`)
- **Yazdır** (`printStokReport` — *Stok Raporu Yazdır*)

[EKRAN: Stok listesi — Detay Ekleme açık]

---

## 10. Kullanıcı Raporları (`admin/driver-report.html`)

Erişim: doğrudan URL veya bildirimlerdeki sürücü talebi satırı. Oturum token’ı gerekir; yetkisizde 401/403.

Alt başlık: **KULLANICI RAPORLARI**. Geri: **Yönetim Sistemi**.

### 10.1 Sekme: Aylık KM İzleme

1. Şube kartı seçin.
2. **Dönem seçimi** (`aria-label`: Dönem seçimi).
3. Özet kutuları (filtre):

| Kutu | Anlam |
|------|--------|
| **Toplam Taşıt** | Tümü |
| **Bildiren** | Dönemde km girenler |
| **Beklenen** | Girmeyenler |
| **Tahsisi Olmayan** | Atamasız |

- **Ara**, **Kutu görünümü**, **Excel İndir**
- Liste: plaka, kullanıcı, km durumu rozetleri

### 10.2 Sekme: Kullanıcı Raporları

- Şube → kullanıcı listesi / detay
- **WhatsApp Geçmişi** (yalnız **Genel Yönetici** — aksi halde *Bu geçmiş yalnız genel yönetici tarafından görüntülenebilir.*)

### 10.3 Bekleyen talepler

Sayfa altı **Bekleyen Talepler** — sürücü düzeltme/talep onayları (`admin_approve.php`).

[EKRAN: Aylık KM — Bildiren / Beklenen kutuları]

---

## 11. Zorunlu evraklar (K2)

**Ayarlar → Zorunlu Evraklar** → **ZORUNLU EVRAKLAR**

- Şube listesi → **K2 Taşıt Belgesi**
- **Dosya Seç** (PDF), **Geçerlilik Süresi**, **Kaydet**
- Genel yönetici: şube grupları / üye şubeler [DOĞRULANACAK: grup UI adımları ekran görüntüsü ile]

Bu belge, taşıt kartı zorunluluğu ve K2 kapsamı hesapları ile bağlantılıdır.

---

## 12. Hangi bilgi nereye? (yönetici özeti)

| Konu | Giriş yeri |
|------|------------|
| Yeni taşıt | **KAYIT** |
| İlk km / alım km | Kayıt formu **Km (Alındığı Tarih)** |
| Güncel km | **TAŞITLAR → Olay Ekle → Kilometre** (veya sürücü **Km Bildir** + onay) |
| Satış / pert | **Olay Ekle → Satış / Pert** → **Arşiv** |
| Satış sözleşmesi | Arşiv taşıt **Belgeler** |
| Muayene / egzoz | Kayıt veya **Olay Ekle → Muayene**; egzoz ayrı tarih kayıtta |
| Sigorta / kasko | Kayıt tarihleri veya olay güncelleme |
| Taşıt kartı / takograf | **Olay Ekle** (yasal zorunluluklar) + belge yükleme |
| K2 / yetki belgesi | **Zorunlu Evraklar** + K2 belge dosyası |
| UTTS / Arvento | **Olay Ekle → Kurumsal Eklentiler** |
| Şube / kullanıcı atama | **Olay Ekle → Yönetim** veya **Ayarlar** |
| Aylık takip listesi | **Bu Ay Yapılacaklar / Ayı Özet** |
| Km disiplini raporu | **admin → Aylık KM İzleme** |
| Stok / Excel | **RAPORLAR** |

---

## 13. Rol farkları (kısa)

| Yetki | Genel Yönetici | Şube Yöneticisi | Kullanıcı |
|--------|----------------|-----------------|-----------|
| Ana uygulama | Evet | Evet (kapsam) | Hayır (panel) |
| Tüm şubeler | Evet | Atandığı şubeler | Zimmetli taşıt |
| Şube yönetimi | Evet | Hayır | Hayır |
| Veri yedekleme | Evet | Hayır | Hayır |
| WhatsApp geçmişi (admin) | Evet | Hayır | Hayır |
| Satış/pert | Evet (yetkili taşıt) | Evet (kapsam) | Hayır |

Kapsam sunucu `load.php` / `save.php` ile filtrelenir; istemcide görünen liste oturum verisidir.

---

## 14. Sorun giderme

| Belirti | Öneri |
|---------|--------|
| *Bu bölüm ilk kullanım için internet bağlantısı gerektiriyor.* | İlk modül indirmesi için ağ gerekir |
| *Veri yüklenemedi* | Bağlantı / oturum |
| *Başka biri tarafından güncellenmiş* | Sayfayı yenileyin |
| PWA eski arayüz | **Önbellek Temizle** veya tarayıcı site verisini silin |

Footer: **● Sistem Hazır**, sürüm numarası.

---

## 15. İlgili dosyalar (geliştirici referansı — kullanıcı okumaz)

`index.html`, `tasitlar.js`, `kayit.js`, `raporlar.js`, `notifications.js`, `ayarlar.js`, `admin/driver-report.html`, `admin/admin-report.js`.

Bu kılavuz yalnızca UI davranışını anlatır.
