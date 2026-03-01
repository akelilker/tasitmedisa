# Atıl Kod Analizi – Zombi Fonksiyonlar, Kullanılmayan CSS, Gereksiz Bağlantılar

**Tarih:** 2025  
**Not:** Bu raporda **hiçbir silme işlemi yapılmadı**. Sadece tespit ve güvenli silme önerileri listelenmiştir. Değişiklik yapmadan önce onayınız gerekir.

---

## 1. Zombi JS Fonksiyonları (Tanımlı, Hiç Çağrılmıyor)

### 1.1 `data-manager.js`

| Öğe | Satır | Açıklama |
|-----|-------|----------|
| `window.saveKayit` | ~356 | Kayıt (kayit) kaydetmek için tanımlanmış; projede hiçbir yerde çağrılmıyor. |
| `window.deleteKayit` | ~361 | Kayıt silmek için tanımlanmış; projede hiçbir yerde çağrılmıyor. |

**Güvenli silme önerisi:**  
- Uygulama sadece taşıt/şube/kullanıcı/ayarlar üzerinden çalışıyorsa ve “kayit” CRUD’u kullanılmıyorsa bu iki fonksiyon kaldırılabilir.  
- İleride “kayit” yönetimi eklenecekse bırakılabilir; sadece kullanılmadığı için “zombi” sayılır.

---

### 1.2 `tasitlar.js`

| Öğe | Satır | Açıklama |
|-----|-------|----------|
| `formatDateShort(dateStr)` | ~1576 | Sadece tanımlı; hiçbir yerde çağrılmıyor. |

**Güvenli silme önerisi:**  
- Fonksiyon gövdesi ve tanımı silinebilir.  
- Aynı dosyada `formatDateForDisplay` kullanıldığı için `formatDateShort` gereksiz görünüyor.

---

### 1.3 `driver/driver-script.js` – Geliştirme / Debug Kodu

| Öğe | Satır | Açıklama |
|-----|-------|----------|
| `logRightPanelLayout` + `setTimeout(..., 500)` bloğu | ~284–300 | Dış sunucuya (`http://127.0.0.1:7824/ingest/...`) layout bilgisi gönderen debug kodu. Canlı ortamda çalışmaz ve gereksiz ağ isteği oluşturur. |

**Güvenli silme önerisi:**  
- `// #region agent log` ile `// #endregion` arasındaki `setTimeout` ve içindeki `fetch(...)` tamamen kaldırılabilir.  
- Sadece geliştirme aracı için kullanılıyorsa, production build’de olmamalı.

---

## 2. Kullanılmayan CSS Sınıfları (Adaylar)

Aşağıdaki sınıflar **HTML ve JS dosyalarında** (class=, classList, className) **hiç geçmiyor**. Dinamik ekleme için proje genelinde arama yapıldı; yine de silmeden önce kısa bir manuel kontrol önerilir.

### 2.1 `style-core.css`

| Sınıf | Satır (c.) | Not |
|-------|------------|-----|
| `.view-section` | 971 | `display: none` ile tanımlı; hiçbir HTML/JS’te kullanılmıyor. |
| `.btn-secondary` | 975, 981 | Base + `:hover`; hiçbir yerde bu sınıf atanmıyor. |

**Güvenli silme önerisi:**  
- Bu iki kural bloğu silinir.  
- Başka CSS dosyalarında `.view-section` veya `.btn-secondary` referansı (miras/override) yoksa risk düşüktür.

---

## 3. Gereksiz veya Tekrarlı Kütüphane / Kaynak Bağlantıları

### 3.1 Font bağlantıları

- **index.html:**  
  - `preconnect` (fonts.googleapis.com, fonts.gstatic.com)  
  - `preload` (Source Sans 3)  
  - `link rel="stylesheet"` (aynı font)  
  Üçü de aynı font için; preload + stylesheet normal ve gerekli. Tekrarlı “gereksiz” bir kütüphane yok.

- **driver/index.html, driver/dashboard.html, admin/driver-report.html:**  
  Benzer şekilde sadece Source Sans 3 kullanılıyor; ek bir kütüphane yok.

### 3.2 Script / kütüphane

- Projede **jQuery, lodash, Bootstrap** vb. harici kütüphane yok.  
- Sadece kendi JS modülleri (data-manager, script-core, kayit, tasitlar, raporlar, ayarlar) ve driver/admin script’leri var.  
- **ExcelJS** index.html’de yorumda geçiyor (“lazy load”) ancak script etiketi yok; gereksiz bağlantı tespit edilmedi.

**Sonuç:** Gereksiz veya tekrarlı kütüphane bağlantısı tespit edilmedi. Projeyi hafifletmek için ek bir “link/script kaldırma” önerisi yok.

---

## 4. Özet – Güvenli Silme Checklist (Onay Sonrası)

| # | Dosya | Yapılacak | Risk |
|---|--------|-----------|------|
| 1 | `data-manager.js` | `window.saveKayit` ve `window.deleteKayit` fonksiyonlarını kaldır | Düşük (çağrı yok) |
| 2 | `tasitlar.js` | `formatDateShort` fonksiyonunu kaldır | Düşük (çağrı yok) |
| 3 | `driver/driver-script.js` | `logRightPanelLayout` + `setTimeout` içindeki `fetch` debug bloğunu kaldır (#region/#endregion arası) | Düşük (sadece debug) |
| 4 | `style-core.css` | `.view-section { ... }` ve `.btn-secondary { ... }` / `.btn-secondary:hover { ... }` kurallarını kaldır | Düşük (sınıf kullanılmıyor) |

---

## 5. Silme Yapmadan Önce Önerilen Kontroller

1. **saveKayit / deleteKayit:**  
   - “Kayıt” (kayit) ile ilgili herhangi bir UI veya planlı özellik var mı diye proje dokümantasyonuna veya backlog’a bakın. Yoksa silinebilir.

2. **formatDateShort:**  
   - Projede “formatDateShort” ile arama yapın; sadece tanım çıkıyorsa güvenle silinebilir.

3. **Debug bloğu (driver-script.js):**  
   - 127.0.0.1:7824 kullanılan bir geliştirme aracı varsa, bu kodu sadece production’dan çıkarmak (ör. build/conditional) da bir seçenektir; tamamen silmek de mümkün.

4. **CSS:**  
   - `.view-section` veya `.btn-secondary`’nin başka bir sayfa veya gelecek bir özellikte kullanılıp kullanılmayacağını kontrol edin; yoksa stil blokları kaldırılabilir.

Onay verdiğiniz maddeler için tek tek veya toplu silme adımlarını uygulayabilirim; onay vermeden kod veya stil dosyasında değişiklik yapılmamıştır.
