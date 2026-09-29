# Medisa Taşıt — Simge ve Düğme Lejantı

Bu dosya, arayüzdeki anlamlı simgeleri, `title` / `aria-label` metinlerini ve **nerede göründüklerini** listeler. Pazarlama ikonları değil; yalnızca işlevsel UI öğeleri.

**Kısaltmalar**

- **Ana** = `index.html` yönetim kabuğu
- **Taşıt** = TAŞITLAR modali / detay
- **Sürücü** = `driver/dashboard.html`
- **Admin** = `admin/driver-report.html`

---

## 1. Ana sayfa (`index.html`)

| Görünüm | Konum | `aria-label` / metin | İşlev |
|---------|--------|----------------------|--------|
| Takvim + noktalar (SVG) | Üst sol | **Bu Ay Yapılacaklar** | Aylık özet modalı (`open-monthly-todo`) |
| Rozet | Takvim üstü | (gizli sayaç) | Bekleyen aylık görev adedi |
| **Uygulamayı Yükle** | Üst orta | (düğme metni) | PWA kurulum prompt’u |
| × | Yükle çubuğu | **İptal** | Yükleme çubuğunu kapat |
| Zil (SVG) | Üst sağ | **Bildirimler** | Bildirim açılır menü |
| Dişli (SVG) | Üst sağ | **Ayarlar** | Ayarlar açılır menü |
| **KAYIT** | Ana menü | Kayıt | Kayıt modali |
| **TAŞITLAR** | Ana menü | Taşıtlar | Taşıt modali |
| **RAPORLAR** | Ana menü | Raporlar | Rapor modali |
| Ok + metin | Alt | **Kullanıcı Paneli** | Sürücü girişi |

### Ayarlar açılır menü öğeleri

| Metin | İşlev |
|--------|--------|
| Şube Yönetimi | Şube CRUD |
| Kullanıcı Yönetimi | Kullanıcı CRUD |
| Zorunlu Evraklar | K2 zorunlu belge |
| Dış Veri Yönetimi | Harici veri / kasko listesi |
| Veri Yedekleme | Alt: Yedek Al, Yedekten Geri Yükle |
| 🗑️ Önbellek Temizle | SW / önbellek |
| Bu Cihazı Unut | Yerel oturum sil |
| Çıkış | Oturum kapat |

---

## 2. Taşıtlar modali — liste araç çubuğu

### Şube dashboard (grid)

| Simge / metin | `title` | İşlev |
|---------------|---------|--------|
| Büyüteç | **Genel Arama** | Global arama kutusu |
| Vites / şanzıman | **Şanzıman tipi** | Otomatik / Manuel filtre |
| Kutu (arşiv) | **Arşiv** | Satılmış/pert listesi |

### Şube detay listesi

| Simge | `title` | İşlev |
|--------|---------|--------|
| Geri ok + **Şube Seçimi** | — | Dashboard’a dön |
| Büyüteç | **Ara** | Liste içi arama |
| Şanzıman | **Şanzıman tipi** | Filtre |
| Izgara | **Görünüm** | Kart ↔ liste |

### Taşıt kartı (liste/kutu)

| Simge | `title` / `aria-label` | Anlam |
|--------|-------------------------|--------|
| **!** kırmızı | Tarih uyarısı | Kritik tarih (sigorta/kasko/muayene/egzoz) |
| **!** turuncu | Tarih uyarısı | Yaklaşan tarih |

---

## 3. Taşıt detay modali

| Öğe | Metin | İşlev |
|-----|--------|--------|
| Düğme | **! Olay Ekle** | Olay kategori menüsü |
| Saat/kum saati SVG | **Tarihçe** | Bakım/kaza/km/diğer sekmeleri |
| Belge SVG | **Belgeler** | Ruhsat, poliçe, taşıt kartı vb. |
| Yazıcı SVG | **Taşıt Kartı Yazdır** | Yazdırma / iOS ön izleme |
| Metin | **Şubeye Tahsis Etmek İçin +** | Şube atama olayı |
| Kalem (15px) | **Notları düzenle** | Not inline edit |
| **!** (muayene) | Taşıt tipi seçilmedi | Muayene tarihi uyarısı |
| Ev (modal header) | **Ana sayfaya dön** | Tüm modalleri kapat |

### Olay menüsü kategorileri (simge + başlık)

Her kategoride SVG simge + başlık metni:

- **Yasal Zorunluluklar**
- **Sigorta İşlemleri**
- **Kurumsal Eklentiler**
- **Kullanım ve Olaylar**
- **Yönetim İşlemleri**

Olay satırlarında durum rengi: `--status-red/orange/ok` (menü kartı kenarlığı).

### Tarihçe sekmeleri

| `aria-label` | Sekme |
|--------------|--------|
| Bakım geçmişi | Bakım |
| Kaza geçmişi | Kaza |
| Km güncelleme geçmişi | Km |
| Diğer geçmiş kayıtları | Diğer |

---

## 4. Olay / belge modalları (ortak)

| Simge | `aria-label` | İşlev |
|--------|--------------|--------|
| Ev | Ana sayfaya dön | Kabuğa dön |
| × | Kapat | Modal kapat |
| Geri ok | Olay Ekle / Taşıt Detay / Ayarlar | Bağlama göre geri |

### Belge kartları (iç simgeler — `icon` alanı)

| icon anahtarı | Belge |
|---------------|--------|
| document | Ruhsat, K2, Taşıt Kartı, Takograf, Satış Sözleşmesi |
| shield | Sigorta / Kasko poliçesi |

Ruhsat görüntüleyicide ek düğmeler: indir / değiştir / sil (sınıf: `ruhsat-download-btn`, `ruhsat-add-btn`, `ruhsat-remove-btn`; `title` metinleri bağlama göre üretilir).

---

## 5. Raporlar modali (Stok)

| Simge | `title` | İşlev |
|--------|---------|--------|
| **+ Detay Ekleme** | (düğme metni) | Detay sütun menüsü |
| Excel | **Excel'e Aktar** | Stok Excel |
| Yazıcı | **Yazdır** | Stok yazdır |
| Taşıt tipi ikonları | `title` = tip etiketi | Otomobil / ticari / römork |

Detay sütun anahtarları (menüde): sigorta, kasko, kaskoDegeri, muayene, kredi, lastik, utts, takip, tramer, boya, kullanici, tescil (+ egzoz muayene bölünmesi).

---

## 6. Aylık özet modalı (`monthly-todo-modal`)

| Öğe | Metin | İşlev |
|-----|--------|--------|
| Ev | **Ana sayfaya dön** | Ana kabuk |
| × | **Kapat** | Modal kapat |
| Başlık | `{Ay} Ayı Özet` | [Not: tetikleyici **Bu Ay Yapılacaklar**] |
| Filtre | **Şube filtresi** | Şube listbox |
| WhatsApp (yeşil) | `aria-label` hatırlatma metni | WA deep link + log |
| Satır | `role="listitem"` | Taşıt detayına git |

---

## 7. Sürücü paneli (`driver/dashboard.html`)

### Üst satır

| Simge | `title` / `aria-label` | İşlev |
|--------|-------------------------|--------|
| 2×2 kare ızgara | **Taşıt Kısayolları** | Açılır menü |
| Anahtar SVG | **Şifre değiştir** | Şifre modalı |
| Kapı/çıkış SVG | **Çıkış** | logout() |

### Kısayol menüsü (`role="menu"`)

| Öğe | `title` |
|-----|---------|
| Geçmiş İşlemler | Geçmiş İşlemler |
| Belgeler | Belgeler |
| Talep | Talep |
| Şifre | Şifre |
| Bu Cihazı Unut | Bu Cihazı Unut |

### Sol hızlı aksiyonlar (aynı işlevler)

Belgeler, Talep, Geçmiş İşlemlerim, Şifre değiştir.

### Sağ panel ana düğmeler (metin — simge yok)

Km Bildir, Kaza Bildir, Bakım Bildir, Trafik Sigortası Yenileme, Kasko Yenileme, Muayene Yenileme, Anahtar Durumu Bildir, Lastik Durumu Bildir.

### Geçmiş modalı

| Simge | `title` |
|--------|---------|
| Kalem | **Düzeltme Talep Et** |

### Durum

| Görünüm | `title` / `aria-label` |
|---------|-------------------------|
| Nokta / çizgi | **Bekleniyor** (km onayı) |

---

## 8. Sürücü giriş (`driver/index.html`)

| Alan | Etiket |
|------|--------|
| Metin | Kullanıcı Adı, Şifre |
| Onay | Beni Hatırla |
| Bağlantı | Şifremi Unuttum |
| Düğme | Giriş Yap |

PWA: aynı **Uygulamayı Yükle** çubuğu (`pwa-install-wrapper`).

---

## 9. Admin — Kullanıcı Raporları

| Simge | `title` / `aria-label` | İşlev |
|--------|-------------------------|--------|
| Geri | **Yönetim Sistemi** | Ana uygulama |
| Büyüteç | **Ara** | Arama |
| Izgara | **Kutu görünümü** | Liste/kutu |
| Excel | **Excel İndir** | Aylık export |
| Saat + metin | **WhatsApp Geçmişi** | Genel yönetici audit |

### Aylık KM özet kutuları (düğme)

Toplam Taşıt, Bildiren, Beklenen, Tahsisi Olmayan — `data-monthly-stat-filter`.

### Durum rozetleri (KM izleme)

SVG içerik + `aria-label` / `title` — girdi / girmedi / atamasız [DOĞRULANACAK: her rozet için tam tooltip metni ekrandan]

---

## 10. Bildirim satırları (ana uygulama)

| Tür | Görsel ipucu | Aksiyon |
|-----|--------------|---------|
| Sürücü talebi | Turuncu/kırmızı başlık sınıfları | **open-driver-report** → admin |
| Tarih uyarısı | `date-warning-orange` / `date-warning-red` | Plaka / taşıt detay / tarihçe |
| Okundu | Soluk metin | `notif-read-text` |

---

## 11. Footer (tüm kabuklar)

| Metin | Anlam |
|--------|--------|
| `v…` sürüm | Uygulama sürümü |
| MEDISA logosu | Marka |
| **● Sistem Hazır** | Hazır durumu (yeşil) |

---

## 12. Terim eşlemesi (kullanıcı sorusu → UI)

| Kullanıcı ifadesi | UI’daki ad |
|-------------------|------------|
| Yetki belgesi | **K2 Taşıt Belgesi** / **K2 Belgesi** |
| Sürat / hız takibi | **Arvento** (takip cihazı) |
| Ay özeti | Modal: **{Ay} Ayı Özet**; düğme: **Bu Ay Yapılacaklar** |
| GPS | **Arvento** / **UTTS** (ayrı alanlar) |

---

## 13. Bilinçli olarak listelenmeyenler

- Font Awesome / dekoratif gradient çizgiler
- Taşıt tipi picker içindeki araç silüetleri (yalnızca tip seçimi)
- Splash / loading spinner
- Vendor (PDF.js) arayüzü

Güncelleme: UI etiketleri `tasitlar.js`, `index.html`, `driver/dashboard.html`, `notifications.js`, `raporlar.js`, `script-core.js` kaynaklarından türetilmiştir.
