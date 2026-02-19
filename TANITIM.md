# TAŞIT YÖNETİM SİSTEMİ – GÜNCEL TANITIM BELGESİ

**MEDISA Taşıt Yönetim Sistemi** – Versiyon 78.x  
Son güncelleme: Şubat 2025

---

## İçindekiler

1. [Genel Bakış](#1-genel-bakış)
2. [Uygulama Yapısı](#2-uygulama-yapısı)
3. [Ana Uygulama (Yönetim Paneli)](#3-ana-uygulama-yönetim-paneli)
4. [Taşıt Kayıt İşlemleri](#4-taşıt-kayıt-işlemleri)
5. [Taşıtlar Modülü](#5-taşıtlar-modülü)
6. [Raporlar Modülü](#6-raporlar-modülü)
7. [Ayarlar ve Veri Yönetimi](#7-ayarlar-ve-veri-yönetimi)
8. [Kullanıcı Paneli (Şoför Modülü)](#8-kullanıcı-paneli-şoför-modülü)
9. [Admin Rapor Sayfası](#9-admin-rapor-sayfası)
10. [Teknik Özellikler](#10-teknik-özellikler)

---

## 1. Genel Bakış

**Taşıt Yönetim Sistemi**, kurumsal araç filosunun kaydı, takibi ve raporlanması için geliştirilmiş web tabanlı bir uygulamadır. Şube bazlı taşıt envanteri, kullanıcı atamaları, süre yaklaşan bakım/sigorta/muayene bildirimleri ve şoförlerin doğrudan olay bildirimi yapabildiği entegre bir yapı sunar.

### Temel Hedefler

- Taşıt kayıtlarının merkezi ve düzenli tutulması
- Sigorta, kasko, muayene gibi süreli işlemlerin takibi
- Şube ve kullanıcı bazlı atama yönetimi
- Şoförlerin Km, Bakım, Kaza vb. olayları doğrudan bildirebilmesi
- Excel dışa aktarma ile raporlama imkânı

### Teknoloji ve Erişim

- **Web uygulaması:** Modern tarayıcılar (Chrome, Firefox, Safari, Edge)
- **PWA desteği:** Mobil cihazlara ana ekrana eklenebilir
- **Sunucu:** PHP 8.x, JSON veri depolama
- **Canlı adres örneği:** karmotors.com.tr/medisa/

---

## 2. Uygulama Yapısı

### Modüller

| Modül | Amaç | Hedef Kullanıcı |
|-------|------|-----------------|
| Ana Sayfa | Giriş noktası, menü, bildirimler | Tüm yetkili kullanıcılar |
| Taşıt Kayıt İşlemleri | Yeni taşıt ekleme / düzenleme | Yönetici, Satış |
| Taşıtlar | Taşıt listesi, detay, olay yönetimi | Yönetici, Satış |
| Raporlar | Stok ve kullanıcı bazlı raporlar | Yönetici, Satış |
| Ayarlar | Şube, kullanıcı, veri yönetimi | Yönetici |
| Kullanıcı Paneli | Zimmetli taşıt görüntüleme, olay bildirimi | Şoför |

### Splash Ekranı

Uygulama açılışında **logo** ve **“TAŞIT YÖNETİM SİSTEMİ”** başlığı yaklaşık **3 saniye** süreyle gösterilir. Hem ana sayfada hem de Kullanıcı Paneli sayfasında bu görüntü aynı boyut ve tasarımla yer alır.

---

## 3. Ana Uygulama (Yönetim Paneli)

Ana sayfa (`index.html`), tüm modüllere erişim sağlayan merkezi arayüzdür.

### Hero Bölümü

- MEDISA logosu
- “TAŞIT YÖNETİM SİSTEMİ” ana başlık

### Menü Öğeleri

1. **TAŞIT KAYIT İŞLEMLERİ** – Yeni taşıt ekleme veya mevcut kayıt düzenleme
2. **TAŞITLAR** – Taşıt listesi, şube bazlı filtreleme, detay ve olay ekleme
3. **RAPORLAR** – Stok ve kullanıcı raporları

### Üst Araçlar

- **Bildirimler** – Süresi yaklaşan sigorta, muayene vb. uyarıları (kırmızı / turuncu gösterim)
- **Ayarlar** – Şube yönetimi, kullanıcı yönetimi, veri yönetimi, önbellek temizleme

### Kullanıcı Paneli Bağlantısı

- “Kullanıcı Paneli >” linki ile şoför giriş sayfasına geçiş
- Footer’da versiyon (örn. v78.1) ve “● Sistem Hazır” durum göstergesi

---

## 4. Taşıt Kayıt İşlemleri

### Taşıt Tipi Seçimi

- **Otomobil / SUV**
- **Küçük Ticari**
- **Büyük Ticari**

Her tip için özel ikonlar kullanılır.

### Form Alanları

**Temel bilgiler:**

- Plaka
- Üretim yılı
- Marka / Model
- Km (alındığı tarih)
- Alım bedeli
- Şanzıman (Manuel / Otomatik)

**Hasar / Onarım:**

- Tramer kaydı (Var / Yok), tramer detayları
- Boya / Değişen (Var / Yok), parça detayları

**Süreli işlemler:**

- Sigorta bitiş tarihi
- Kasko bitiş tarihi
- Muayene bitiş tarihi

**Ek bilgiler:**

- Yedek anahtar (Var / Yok, varsa açıklama)
- Kredi / Rehin (Var / Yok, varsa detay)
- Tahsis edilen şube (dropdown)
- Notlar

### Özellikler

- Modal pencerede açılır form
- Kaydet / Vazgeç butonları
- Zorunlu alan kontrolü (plaka, marka/model vb.)
- Tescil tarihi ile ilgili onay/uyarı akışları (varsa)

---

## 5. Taşıtlar Modülü

### Görünümler

1. **Şube Grid** – Şubeler kutu/kart olarak listelenir, “Tümü” seçeneği mevcuttur
2. **Taşıt Listesi** – Seçilen şubeye ait taşıtlar liste veya kart görünümünde
3. **Taşıt Detayı** – Plaka, marka/model, tüm kayıt bilgileri

### Özellikler

- **Filtreleme:** Şube bazlı
- **Sıralama:** Plaka, km, yıl vb. alanlara göre
- **Olay Ekle:** Taşıt detayından doğrudan olay ekleme menüsü

### Desteklenen Olay Tipleri

| Olay | Açıklama |
|------|----------|
| Bakım | Bakım kaydı ekleme |
| Kaza | Kaza kaydı, kaporta hasar bölgeleri (SVG) |
| Sigorta | Sigorta yenileme |
| Kasko | Kasko yenileme |
| Muayene | Muayene yenileme |
| Anahtar | Yedek anahtar durumu (Var / Yok, adres vb.) |
| Kredi/Rehin | Kredi bilgisi güncelleme |
| Km | Kilometre güncelleme |
| Lastik | Yazlık / Kışlık lastik durumu ve adres |
| UTTS | UTTS tanımlama durumu |
| Takip Cihazı | Takip cihazı montaj durumu |
| Şube Değişikliği | Taşıt şubesi değiştirme |
| Kullanıcı Atama | Taşıtı şoföre atama |
| Satış/Pert | Satış veya hurdaya çıkarma |
| Tarihçe | Bakım, kaza, km, şube/kullanıcı geçmiş kayıtları |

### Kaza Modülü

- Kaporta SVG ile hasar bölgelerinin işaretlenmesi
- Boya / değişen parça bilgisi

---

## 6. Raporlar Modülü

### Stok Görünümü

- Şube grid’den şube seçimi veya “Tümü”
- Tablo formatında taşıt listesi

**Temel sütunlar:** Sıra, Şube, Yıl, Marka/Model, Plaka, Şanzıman, Km

**Detay sütunları (opsiyonel, sürükle-bırak ile sıralanabilir):**

- Sigorta, Kasko, Muayene
- Kredi, Lastik, UTTS, Takip
- Tramer, Boya
- Kullanıcı
- Tescil tarihi

**Özellikler:**

- Sütun bazlı sıralama (artan / azalan)
- Excel dışa aktarma (admin export API ile)

### Kullanıcı Görünümü

- Kullanıcı bazlı taşıt listeleme
- Şube ve arama filtresi
- Kullanıcı detayı ve atanmış taşıtları

---

## 7. Ayarlar ve Veri Yönetimi

### Şube Yönetimi

- Şube listesi
- Yeni şube ekleme
- Şube düzenleme / silme
- Alanlar: Şube adı, şehir

### Kullanıcı Yönetimi

- Kullanıcı listesi
- Yeni kullanıcı ekleme / düzenleme / silme

**Kullanıcı formu alanları:**

- Ad Soyad
- Şube (dropdown)
- Telefon, E-posta
- Görev: Yönetici / Satış Temsilcisi / Şoför
- Kullanıcı adı, Şifre
- Taşıt ataması (checkbox listesi ile zimmetli taşıtlar)

### Veri Yönetimi

- **Yedek Al:** Tüm verileri JSON formatında indirme
- **Yedekten Geri Yükle:** JSON dosyasından veri içe aktarma

### Önbellek Temizleme

- Önbellek temizleme onay penceresi
- localStorage ve geçici verilerin temizlenmesi

---

## 8. Kullanıcı Paneli (Şoför Modülü)

### Giriş

- **driver/index.html** – Kullanıcı adı ve şifre ile giriş
- “Beni Hatırla” ile oturum bilgisinin saklanması
- Giriş başarılıysa doğrudan dashboard’a yönlendirme

### Dashboard

- **Header:** Logo, “TAŞIT YÖNETİM SİSTEMİ”, “KULLANICI PANELİ” alt başlık
- **Kayan uyarı:** Süresi yaklaşan Km bildirimi vb. (kırmızı banner)
- **Tarihçe** ve **Çıkış** butonları

### Sol Panel (Taşıt Bilgileri)

- Kullanıcı adı soyadı
- Plaka (birden fazla taşıt varsa dropdown ile seçim)
- Marka / model
- Şube, üretim yılı, Km
- Sigorta bitiş, Kasko bitiş, Muayene bitiş
- Yedek Anahtar, Lastik Durumu, UTTS durumu

### Sağ Panel (Olay Bildirimi)

Her taşıt için ayrı ayrı:

- **Km Bildir** – Güncel km girişi
- **Kaza Bildir** – Kaza kaydı
- **Bakım Bildir** – Bakım kaydı
- **Trafik Sigortası Yenileme** – Sigorta bilgisi
- **Kasko Yenileme** – Kasko bilgisi
- **Muayene Yenileme** – Muayene bilgisi
- **Anahtar Durumu Bildir** – Var / Yok, adres
- **Lastik Durumu Bildir** – Var / Yok, adres
- **Not** – Serbest metin notu

### Geri Bildirim

- Başarılı işlem sonrası yeşil geri bildirim
- Ekran kapatılıp tekrar açıldığında bu bildirim sıfırlanır (beyaz/gri görünüm)
- Süresi yaklaşan kırmızı bildirimler ekranda kalmaya devam eder

### Düzeltme Talebi

- KM, Bakım veya Kaza alanında düzeltme talebi oluşturma
- Sebep açıklaması ile birlikte gönderim
- Admin panelinden onay/red işlemi

### Tarihçe

- “Geçmiş Kayıtlarım” modal penceresi
- Taşıt seçimi ile filtreleme
- Km, bakım, kaza vb. geçmiş kayıt listesi

### Tasarım Özellikleri

- Splash ekranı: logo + başlık (anasayfa ile aynı boyut)
- Sol panel sabit, sadece sağ panel kaydırılır
- Plaka ortalanmış (dropdown işareti hesaba katılmadan)
- Mobil ve masaüstü uyumlu
- Scrollbar gizli (kaydırma yine çalışır)

---

## 9. Admin Rapor Sayfası

**admin/driver-report.html** – Aylık kullanıcı raporu ve düzeltme talepleri

### Özellikler

- Dönem, şube ve durum filtreleri
- Toplam kullanıcı, bildirim, bekleyen, tamamlanan yüzdesi
- Tablo: Kullanıcı, Marka, Plaka, KM, Bakım, Kaza, Durum, İşlem
- WhatsApp ile iletişim linki
- Excel dışa aktarma
- Düzeltme talepleri listesi: Onay / Red işlemleri

### API Entegrasyonu

- `admin_report.php` – Dönem, şube, durum parametreleri ile rapor verisi
- `admin_approve.php` – Talep onaylama/reddetme
- `admin_export.php` – Excel export

---

## 10. Teknik Özellikler

### Veri Depolama

- **Birincil:** `data/data.json` (PHP `load.php` / `save.php` üzerinden)
- **Yedek:** localStorage (`medisa_vehicles_v1`, `medisa_branches_v1`, `medisa_users_v1` vb.)
- **Şoför oturumu:** Token ve giriş bilgileri localStorage’da

### PHP Uç Noktaları

| Endpoint | Metot | Amaç |
|----------|-------|------|
| load.php | GET | Ana uygulama verilerini yükle |
| save.php | POST | Ana uygulama verilerini kaydet |
| driver/driver_login.php | POST | Şoför girişi |
| driver/driver_data.php | GET | Zimmetli taşıt listesi |
| driver/driver_save.php | POST | Km/Bakım/Kaza güncelleme |
| driver/driver_event.php | POST | Olay bildirimi |
| driver/driver_request.php | POST | Düzeltme talebi |
| driver/admin_report.php | GET | Admin rapor verisi |
| admin/admin_approve.php | POST | Talep onaylama/red |
| admin/admin_export.php | GET | Excel dışa aktarma |

### PWA (Progressive Web App)

- Service Worker (`sw.js`) ile önbellekleme
- manifest.json ile uygulama meta bilgileri
- Ana ekrana eklenebilir ikon
- Offline kısmi destek

### Kullanıcı Deneyimi

- Mobil ve masaüstü responsive tasarım
- Koyu tema (kırmızı vurgu)
- Klavye ve dokunmatik erişilebilirlik
- Uzun metinlerde metin taşmasını önleyen (ellipsis) gösterim

---

## Ek Notlar

- Tüm sayfa ve modallarda footer ile tutarlı versiyon gösterimi
- Modallar arası geçişte scroll ve odak yönetimi
- Tarayıcı başlık ve PWA adları sayfaya göre özelleştirilmiş

---

*Bu belge, Taşıt Yönetim Sistemi kod tabanı incelenerek Şubat 2025 itibarıyla güncellenmiştir.*
