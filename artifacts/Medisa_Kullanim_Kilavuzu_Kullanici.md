# Medisa Taşıt Yönetim — Kullanıcı Kılavuzu

Bu kılavuz, **Kullanıcı Paneli** (`driver/` — giriş: `driver/index.html`, panel: `driver/dashboard.html`) için hazırlanmıştır. Metinler uygulamadaki etiket ve mesajlara dayanır; kodda görünmeyen özellik eklenmemiştir.

---

## 1. Bu panel kimler içindir?

- **Kullanıcı** rolünde ve hesabında **sürücü paneli** (`driver_dashboard`) açık olan kişiler.
- Zimmetli taşıt(lar) üzerinden **km, bakım, kaza, sigorta/kasko/muayene yenileme bildirimi**, **belge görüntüleme**, **talep/şikayet** ve **geçmiş kayıtlar** buradan yapılır.
- Ana yönetim uygulamasına (`index.html`) yalnızca **Yönetim Sistemi** geri bağlantısı ile gidilir; düz kullanıcı oturumu ana menüyü açmaz (otomatik yönlendirme).

[EKRAN: Giriş ekranı — kullanıcı adı, şifre, Beni Hatırla, Giriş Yap]

---

## 2. Giriş ve oturum

### 2.1 Giriş

1. Tarayıcıda `…/driver/index.html` adresini açın (canlı ortamda kurulum yolunuza göre değişir).
2. **Kullanıcı Adı** ve **Şifre** girin.
3. İsteğe bağlı: **Beni Hatırla** — oturum ve “hatırla” tercihi cihazda saklanır.
4. **Giriş Yap** ile devam edin.

Hata mesajları form altında **error-message** alanında görünür.

### 2.2 Şifremi unuttum

**Şifremi Unuttum** düğmesi giriş formunda yer alır. Akış sunucu yapılandırmasına bağlıdır; e-posta/SMS metni bu kılavuzda sabitlenmemiştir. [DOĞRULANACAK: kurulumda şifre sıfırlama tam metni]

### 2.3 İlk girişte zorunlu şifre değişimi

Geçici parola ile girişte **Şifre Değiştir** modali açılır. Uyarı metni:

> Güvenliğiniz için geçici parolanızı değiştirmeniz gerekiyor. Yeni parolanızı belirlemeden uygulamayı kullanamazsınız.

Politika metni: **En az 6 karakter; büyük harf, küçük harf ve rakam içermelidir.**

### 2.4 Çıkış ve cihazı unutma

- Üst bölümde **Çıkış** (`title`: Çıkış).
- Kısayollar menüsünde **Bu Cihazı Unut** — onay: *Bu cihazda kayıtlı giriş bilgileri silinecek ve oturum kapanacak. Devam edilsin mi?*

---

## 3. PWA — uygulamayı ana ekrana ekleme

Uygulama adı (manifest): **Taşıt Yönetim Sistemi**. Görünüm: **standalone** (tam ekran uygulama gibi).

### 3.1 Android (Chrome ve destekleyen tarayıcılar)

1. Siteyi normal sekmede açın (`driver/index.html` veya giriş sonrası `dashboard.html`).
2. Tarayıcı, yüklenebilir uygulama koşullarını sağlarsa sayfa ortasında **Uygulamayı Yükle** düğmesi çıkar (`pwa-install-wrapper`).
3. **Uygulamayı Yükle** → sistem kurulum penceresi → onaylayın.
4. Yanındaki **× (İptal)** ile çubuğu kapatabilirsiniz; kurulum zorunlu değildir.

Kurulumdan sonra uygulama ana ekrandan açılır; footer sürüm satırında **PWA** / **Mobil PWA** gibi ekler görülebilir.

[EKRAN: Uygulamayı Yükle çubuğu]

### 3.2 iPhone / iPad (Safari)

iOS’ta **beforeinstallprompt** yoktur; uygulama içi **Uygulamayı Yükle** düğmesi çoğu zaman **görünmez**. Ana ekrana ekleme:

1. **Safari** ile `driver/` adresini açın.
2. **Paylaş** → **Ana Ekrana Ekle**.
3. Ad: **Taşıt Yönetim Sistemi** (`apple-mobile-web-app-title`).

Manifest ve `apple-touch-icon` kök ve `driver/manifest.json` üzerinden tanımlıdır.

[EKRAN: Safari Ana Ekrana Ekle adımı]

### 3.3 Masaüstü (Chrome, Edge)

Destekleyen tarayıcılarda aynı **Uygulamayı Yükle** çubuğu veya tarayıcının adres çubuğundaki yükle simgesi kullanılabilir. Kısayol: manifest **shortcuts** — Giriş / Panel (`driver/manifest.json`).

### 3.4 Zaten yüklüyse

**Standalone** modda (`display-mode: standalone`) yükleme çubuğu gösterilmez.

---

## 4. Ekran düzeni ve gezinme

### 4.1 Boş durum

Zimmet yoksa:

- **Zimmetli Taşıt Bulunamadı**
- *Size Atanmış Taşıt Bulunmamaktadır. Lütfen Yöneticinizle İletişime Geçin.*

### 4.2 Taşıt seçimi

- Sol panelde **plaka** görünür.
- Birden fazla taşıt varsa **▾** ile **Taşıt seç** listesi açılır.

### 4.3 Sol panel — bilgi ve kısayollar

- Taşıt özet alanları (ör. **KM**, **UTTS**, sigorta/kasko/muayene tarihleri — yüklenen veriye göre).
- KM yanında **Bekleniyor** göstergesi (`title`: Bekleniyor) — onay bekleyen km kaydı anlamına gelir.
- Hızlı düğmeler: **Belgeler**, **Talep**, **Geçmiş İşlemlerim**, **Şifre değiştir**.

### 4.4 Üst kısayollar (mobil)

**Taşıt Kısayolları** (ızgara simgesi) menüsü:

| Menü | İşlev |
|------|--------|
| Geçmiş İşlemler | Geçmiş modalı |
| Belgeler | BELGELER modalı |
| Talep | Talep / Şikayet / Öneri |
| Şifre | Şifre değiştir |
| Bu Cihazı Unut | Oturum + hatırlanan bilgiler |

Kaydırılabilir **uyarı** alanı yaklaşan tarih / eksik bilgi için kullanılır.

### 4.5 Sağ panel — bildirim aksiyonları

Her taşıt için dikey düğmeler (açılır formlar):

| Düğme | Açıklama |
|--------|-----------|
| **Km Bildir** | Güncel km girişi |
| **Kaza Bildir** | Kaza formu + kaporta şeması |
| **Bakım Bildir** | Bakım detayı, tarih, servis, km vb. |
| **Trafik Sigortası Yenileme** | Poliçe yenileme bildirimi |
| **Kasko Yenileme** | Kasko yenileme bildirimi |
| **Muayene Yenileme** | Muayene (ve ilgili egzoz alanları) |
| **Anahtar Durumu Bildir** | Var/Yok + açıklama |
| **Lastik Durumu Bildir** | Kış/Yaz vb. seçenekler |

Formlarda genelde **Bildir** (kaydet) ve **Vazgeç** vardır. Başarıda **Bildirildi** mesajı.

### 4.6 Yönetim sistemine dönüş

Sol alttaki **Yönetim Sistemi** (`../`) — ana uygulama girişine gider. Yetkiniz yoksa oturum davranışı sunucu rolüne göre değişir.

[EKRAN: İki panelli dashboard — plaka + Km Bildir]

---

## 5. Sık kullanılan işlemler

### 5.1 Kilometre bildirimi

1. **Km Bildir** → **Güncel KM** alanını doldurun (`aria-label`: Güncel kilometre).
2. **Bildir**.

Notlar:

- Diğer formlar (bakım/kaza) km gerektirebilir; km yoksa uyarı: *Lütfen geçerli bir KM değeri girin…*
- Bakımda bildirilen km, kayıtlı km’den yüksekse onay sorulabilir: *Bildirilmek İstenen Km Bilgisi, Taşıtın Bildirilmiş Km'sinden Fazladır…*

Km düzeltmesi kullanıcı tarafında doğrudan silme/değiştirme değil; **Geçmiş Kayıtlarım** → **Düzeltme Talep Et** ile yapılır.

### 5.2 Bakım / kaza

- **Bakım Bildir**: açıklama zorunlu; tarih, servis, kişi, km, tutar alanları.
- **Kaza Bildir**: açıklama zorunlu; **Varsa Boyanan/ Değişen Parçaları İşaretleyin** kaporta haritası.

### 5.3 Sigorta, kasko, muayene yenileme

İlgili düğmeyi açın, tarih/belge alanlarını doldurup **Bildir**. Muayenede egzoz muayenesi farklı tarihliyse sürücü formunda alanlar senkronlanır (`syncDriverEgzozMuayeneFields`).

Muayene kaydında popover: *Muayene Bitiş Tarihi … Evrak üzerinden doğruluğunu teyit etmeniz gerekmektedir. Teyit edildi mi?* — **Evet** / **Hayır**.

### 5.4 Belgeler (salt okunur)

**Belgeler** modalında taşıta yüklenmiş dosyalar listelenir:

- Ruhsat, Sigorta Poliçesi, Kasko Poliçesi, Taşıt Kartı, Takograf Belgesi

Yüklü değilse: *… belgesi yüklü değil.* Yükleme **yönetici panelinden** yapılır; kullanıcı yalnızca görüntüler.

[EKRAN: BELGELER listesi]

### 5.5 Talep / şikayet / öneri

Modal: **Talep / Şikayet / Öneri**

- **Talep Türü**: Talep, Şikayet, Öneri, Diğer
- **Mesaj** (en fazla 500 karakter)
- **Kaydet** / **Vazgeç**

### 5.6 Geçmiş ve düzeltme talebi

**Geçmiş Kayıtlarım** / **Geçmiş İşlemlerim**:

- Filtre: **Taşıt:** (Tüm Taşıtlar veya tek plaka)
- Kayıtlarda **Düzeltme Talep Et** (kalem simgesi) — km, bakım veya kaza için **Düzeltme Talebi** formu:
  - **Yeni KM Değeri** / bakım / kaza alanları
  - **Düzeltme Sebebi** (zorunlu)
  - **Talep Gönder**

Onay yönetici tarafında **Kullanıcı Raporları** / bekleyen talepler üzerinden [DOĞRULANACAK: onay ekranı detayı yönetici kılavuzunda].

---

## 6. Bildirimler (kullanıcı paneli)

Üst **Uyarıları göster** tetikleyicisi ve açılır **Bildirimler** listesi (`aria-label`: Bildirimler). İçerik taşıt tarihleri ve eksik evraklara göre üretilir; metinler turuncu/kırmızı vurgulu olabilir.

---

## 7. Hangi bilgi nereye? (kullanıcı perspektifi)

| Bilgi | Kullanıcı nerede girer / görür? | Kim kalıcı kaydeder? |
|--------|----------------------------------|----------------------|
| Güncel km | **Km Bildir** | Sunucu (`driver_save.php`) — onay akışı varsa “Bekleniyor” |
| Bakım / kaza | İlgili **Bildir** formları | Sunucu |
| Sigorta / kasko / muayene yenileme | İlgili **Bildir** formları | Sunucu + yönetici doğrulama [DOĞRULANACAK] |
| Anahtar / lastik durumu | **Anahtar / Lastik Durumu Bildir** | Sunucu |
| Belgeler | **Belgeler** (görüntüleme) | Yönetici yükler |
| Satış / pert / şube değişimi | — | Yalnız yönetici (ana uygulama) |
| Taşıt kartı bitiş / takograf | Detayda görülebilir; güncelleme | Yönetici **Olay Ekle** |
| UTTS / Arvento (takip) | Sol panelde **UTTS** metni; güncelleme | Yönetici |
| Düzeltme | **Geçmiş** → **Düzeltme Talep Et** | Talep kuyruğu |

---

## 8. Sürat / konum takibi

Arayüzde **“sürat takibi”** adlı ayrı bir menü yoktur. Kurumsal takip **Arvento** alanı ile temsil edilir (yönetici **Olay Ekle → Kurumsal Eklentiler → Arvento**). Kullanıcı panelinde yalnızca özet bilgi görülebilir.

---

## 9. İpuçları

- İnternet yokken yazma işlemleri engellenir (`ensureDriverOnlineForWrite`).
- **Önbellek** sorunlarında yöneticiniz ana uygulamadan **Önbellek Temizle** önerebilir; kullanıcı panelinde doğrudan menü yoktur.
- Footer: **● Sistem Hazır** ve sürüm numarası.

---

## 10. Terimler

- **TYS-Medisa Kullanıcı**: paylaşım önizleme başlığı (WhatsApp vb.).
- **KULLANICI PANELİ**: dashboard alt başlığı.

Sorun yaşarsanız yöneticinize plaka ve işlem saatini iletin.
