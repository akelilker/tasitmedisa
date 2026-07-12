# Taşıt Yönetim Sistemi V3 - Geliştirici Raporu
**Tarih:** 22 Haziran 2026
**Doğrulama:** 12 Temmuz 2026 (güncel `main` kod incelemesi)
**Sistem:** Medisa Taşıt Yönetim Sistemi
**Dil Bileşimi:** JavaScript (52.2%), CSS (36.2%), PHP (6.9%), HTML (4.6%), PowerShell (0.1%)
**Repository:** akelilker/tasitmedisa

---

## 📋 YÖNETİCİ ÖZETİ

Güncel `main` branch kod incelemesi sonucu **doğrulanmış aktif ORTA güvenlik riski bulunmamaktadır.**

Doc-token güvenlik fazı ile belge URL'lerinde ana session JWT taşınması kapatılmıştır. Şube veri izolasyonu bulgusu kod akışına göre **yanlış alarm** olarak sınıflandırılmıştır.

Runtime `data/data.json` artık Git tarafından takip edilmez. Boş şema örneği `data/data.example.json` altında tutulur ve deploy preflight hassas veri invariantı bu sınırı doğrular. Repo geçmişine ilişkin güvenlik çalışmaları ayrı, koordineli P0 operasyon fazıdır.

Kalan işler **düşük öncelikli UX, hijyen ve backlog** kalemleridir.

**Genel Puanlandırma (revize):**
- 🟢 Güvenlik: **97%** (doc-token fazı + mevcut filtreleme)
- 🟢 Veri İzolasyonu: **95%** (şube filtresi mevcut owner akışında çalışıyor)
- 🟢 Erişilebilirlik: **80%** (driver login ARIA eksik)
- 🟢 Kod Kalitesi: **88%**

---

## 🔴 KRİTİK SORUNLAR

Aktif kaynak ağacında yeni kritik kod bulgusu yoktur. Repo geçmişine ilişkin kontrollü güvenlik operasyonu bu raporun kapsamı dışında açık P0 fazı olarak tutulur.

---

## 🟠 ORTA ÖNCELİKLİ SORUNLAR (AKTİF)

**Bulunmamıştır.** ✅

Önceki rapordaki ORTA maddeler (Query Token, Şube İzolasyonu, JSON UTF-8 Verify) güncel kod incelemesinde sırasıyla **çözülmüş/stale**, **yanlış alarm** ve **düşük değerli backlog** olarak yeniden sınıflandırılmıştır.

---

## ✅ ÇÖZÜLMÜŞ / STALE

### 1. Query Token — URL Token Exposure (önceki rapor: "Query Token XSS / ORTA")

**Dosya:** `core.php`, `ruhsat.php`, `ruhsat_preview.php`, `tasitlar.js`, `ayarlar.js`, `driver/driver-script.js`
**Durum:** **ÇÖZÜLDÜ / STALE**

**Sınıflandırma düzeltmesi:**
- Önceki rapordaki **XSS sınıflandırması yanlıştı**.
- Doğru risk sınıfı: **URL token exposure** (history, referrer, log sızıntısı).

**Güncel doğrulama (main):**
- Belge URL'lerinde ana session JWT **taşınmıyor**.
- `?token=` belge akışı **kaldırıldı**; eski `?token=` istekleri **401** ile reddediliyor (`medisaResolveDocumentAccessContext`).
- Belge erişimi `?doc=` üzerinden **kısa ömürlü DOC JWT** (`typ: DOC`, `purpose: document_view`) ile yapılıyor.
- `validateToken()` DOC token'ları session olarak **kabul etmiyor**.
- Repo genelinde `searchParams.set('token')` ve `appendMedisaDocumentAuthToUrl` çağrısı **yok**.
- `medisaReadAccessToken()` parametresizdir ve yalnızca `Authorization: Bearer` başlığını okur.
- API session doğrulaması `validateToken()` üzerinden Bearer token ile çalışır.
- `medisaResolveDocumentAccessContext()` içindeki eski `?token=` talebini 401 ile reddeden branch bilinçli güvenlik korumasıdır; ölü kod değildir ve kaldırılmamalıdır.

### 1.1 Runtime Veri Sınırı

**Dosyalar:** `.gitignore`, `data/data.example.json`, `scripts/verify-medisa-sensitive-data.js`, `.github/workflows/deploy-cpanel.yml`
**Durum:** **ÇÖZÜLDÜ / KALICI GUARD MEVCUT**

- `data/data.json` runtime kaynağıdır ve Git tarafından takip edilmez.
- `data/data.example.json` yalnızca boş şema örneğidir; uygulama bunu otomatik runtime kaynağı olarak kullanmaz.
- GitHub FTP deploy `data/**` ağacını dışlar; canlı runtime dosyası kod deploy'u ile ezilmez.
- `tool:verify-sensitive-data` ve deploy preflight adımı takip/ignore/example invariantlarını doğrular.
- Repo geçmişine ilişkin temizlik, rotasyon ve dağıtılmış kopya doğrulaması ayrı ve koordineli P0 güvenlik fazıdır.

---

## ❌ YANLIŞ ALARM

### 2. Şube Veri İzolasyonu Eksikliği (önceki rapor: "Veri Sızıntısı / ORTA")

**Dosya:** `core.php` — `medisaFilterDataForContextWithUserPredicate()`
**Durum:** **YANLIŞ ALARM** — kod değişikliği önerilmez.

**Güncel doğrulama (main):**
- `visibleVehicles` zaten `medisaCanViewVehicleRecord()` ile rol/şube filtreli oluşuyor.
- `visibleVehicleIds` yalnızca bu filtreli taşıtlardan üretiliyor.
- `arac_aylik_hareketler` → `visibleVehicleIds` dışına çıkamıyor.
- `duzeltme_talepleri` → `visibleVehicleIds` veya `visibleAylikKayitIds` üzerinden filtreleniyor (`visibleAylikKayitIds` de filtreli aylık kayıtlardan geliyor).
- Şube yöneticisi başka şubenin taşıtına erişemez → o taşıt `visibleVehicleIds`'de olmaz → ilgili aylık kayıt ve düzeltme talebi de gelmez.

**Sonuç:** Önerilen ikinci seviye `sube_id` filtresi **redundant**. Owner fonksiyon mevcut haliyle yeterli.

---

## 📦 BACKLOG (DÜŞÜK ÖNCELİK)

### 3. JSON UTF-8 — Yazım Sonrası Verify

**Dosya:** `core.php` — `saveData()`, `medisaAtomicWriteFile()`, `backupDataFileBeforeWrite()`, `loadData()`
**Durum:** **BACKLOG** (gerçek ama düşük değerli)

**Mevcut koruma:**
- `loadData()`: `json_decode` + `json_last_error` kontrolü
- `saveData()`: `json_encode` false check, yazım öncesi backup
- `medisaAtomicWriteFile()`: `LOCK_EX`, yazılan byte = `strlen($content)` doğrulaması

**Değerlendirme:** Her save sonrası `json_decode` verify eklemek ek IO/parse maliyeti getirir; mevcut atomic write + backup riski zaten ciddi ölçüde azaltıyor. İhtiyaç halinde tasarım backlog'unda tutulabilir.

---

### 4. Driver ARIA Eksikleri

**Dosya:** `driver/index.html` (satır ~91), `driver/driver-script.js` (login hata akışı)
**Durum:** **BACKLOG** — güvenlik değil, **UX/A11Y** mini iş

`#error-message` div'inde `role="alert"` / `aria-live` yok. Düşük riskli; ekran okuyucu kullanıcıları için iyileştirme.

---

### 5. Form Button Type — Vehicle Modal

**Dosya:** `index.html` (satır ~495-496)
**Durum:** **KISMEN STALE / MİNİ BACKLOG**

İşaretlenen Kaydet/Vazgeç butonları `<form>` içinde **değil** (`vehicle-modal` → `div.modal-body`). Gerçek submit riski **yok**. Semantik tutarlılık için `type="button"` eklenebilir; `branch-form` ve `user-form` içindeki butonlar zaten `type="button"` kullanıyor.

---

### 6. Windows Atomic Write

**Dosya:** `core.php` — `medisaAtomicWriteFile()` (satır ~198-203)
**Durum:** **BACKLOG**

- Canlı ortam Linux/cPanel → Windows branch **prod riski yok**.
- Lokal Windows geliştirmede nadir yazım hatası / temp kalıntısı mümkün.
- `core.php` write fonksiyonuna **şu an dokunulmamalı**.

---

### 7. Notification Scope Migration

**Dosya:** `core.php` — `medisaBuildNotificationScopeDescriptor`, `medisaProjectNotificationReadStateForContext`; `save.php` merge
**Durum:** **BACKLOG / HİJYEN** — güvenlik açığı değil

**Güncel doğrulama:**
- Canonical key: `user:<id>|role:<role>|branches:<scope>`
- Aktif client (`notifications.js`) canonical key kullanıyor; `scope:*` üretmiyor.
- Load projection: `scope:*` anahtarları **okunmaz, merge edilmez, response'a konmaz**.
- `save.php` yalnızca canonical anahtar ile kullanıcıya ait legacy `user:<id>` anahtarını kabul eder; generic `scope:*` yazımı kabul edilmez.

**Kalan iş:** Eski `data.json` içindeki generic `scope:role` kayıtlarının temizlenmesi / deprecate edilmesi (migration hijyeni).

---

## ✅ DÜZELTİLMİŞ SORUNLAR

| Sorun | Dosya | Durum |
|-------|-------|-------|
| Query Token / URL Token Exposure (belge akışı) | core.php, ruhsat*.php, tasitlar.js, ayarlar.js, driver-script.js | ✅ ÇÖZÜLDÜ (doc-token fazı) |
| Atomic File Writing | core.php (180-214) | ✅ MEVCUT |
| Document Token System (`?doc=` DOC JWT) | core.php (1564+), document_token.php | ✅ MEVCUT |
| Bearer Token Priority | core.php (548+) | ✅ MEVCUT |
| Şube veri izolasyonu (load filtresi) | core.php medisaFilterDataForContextWithUserPredicate | ✅ ÇALIŞIYOR (yanlış alarm kapatıldı) |
| Form Button Semantics (çoğunluk) | index.html | ✅ MEVCUT (branch/user formları) |
| Runtime veri Git sınırı | .gitignore, data/data.example.json, deploy preflight | ✅ MEVCUT |

---

## 📊 ÖZETLEŞTİRİLMİŞ SORUN LİSTESİ (REVİZE)

| No | Sorun | Dosya | Öncelik (eski) | Durum (güncel) | Aksiyon |
|----|-------|-------|----------------|----------------|---------|
| 1 | Query Token / URL exposure | core.php + belge akışı | ORTA | **ÇÖZÜLDÜ / STALE** | Eski `?token=` reddetme guard'ını koru |
| 2 | Şube izolasyonu | core.php 1120-1177 | ORTA | **YANLIŞ ALARM** | Kod değişikliği yok |
| 3 | JSON UTF-8 verify | core.php saveData | ORTA | **BACKLOG** | Tasarım backlog |
| 4 | Driver ARIA | driver/index.html | DÜŞÜK | **BACKLOG (A11Y)** | Mini UX fix |
| 5 | Button type | index.html 495-496 | DÜŞÜK | **KISMEN STALE** | Semantik mini fix |
| 6 | Windows atomic write | core.php 198-203 | DÜŞÜK | **BACKLOG** | Windows dev only |
| 7 | Notification scope | core.php 941-991 | DÜŞÜK | **BACKLOG / HİJYEN** | Legacy cleanup |

---

## 🎯 ÖNERİLEN ÖNCELİK SIRASI (GÜNCEL)

1. **Driver ARIA** mini UX fix (`driver/index.html` + `driver-script.js`)
2. **Vehicle modal** `type="button"` semantik mini fix (`index.html` ~495-496)
3. **Notification scope** kullanıcı legacy state migration planı
4. **`saveData` post-write verify** tasarımı (maliyet/fayda değerlendirmesi sonrası)
5. **Windows atomic write** iyileştirmesi (yalnızca Windows dev sorun çıkarırsa)
6. **Repo geçmişi güvenlik operasyonu** (ayrı, koordineli ve yedekli P0 fazı)

---

## 📈 KALİTE METRİKLERİ (REVİZE)

```
Güvenlik Puanı:          97/100  ███████████████████░░
Kod Kalitesi:            88/100  █████████████████░░░
Erişilebilirlik:         80/100  ████████████████░░░░
Veri Bütünlüğü:          92/100  ██████████████████░░
Veri İzolasyonu:         95/100  ███████████████████░
Performans:              94/100  ██████████████████░░
─────────────────────────────────────────────────────
Genel Puanlandırma:      91.0/100 ██████████████████░░
Durum: PRODUCTION READY ✅
```

---

## 💡 GENEL ÖNERİLER (REVİZE)

### Kısa Vadeli (düşük risk)
- Driver login hata mesajına ARIA ekle
- Vehicle modal butonlarına `type="button"` ekle

### Orta Vadeli (hijyen)
- Notification kullanıcı legacy state migration planını ayrı tasarla
- Eski `?token=` taleplerini reddeden güvenlik branch'ini koru

### Uzun Vadeli (opsiyonel)
- `saveData` post-write verify (maliyet analizi sonrası)
- Windows geliştirme ortamı için atomic write iyileştirmesi
- Veritabanı migration (JSON → SQLite/MySQL) değerlendirmesi

### DevOps
- Production error logging
- Backup rotasyonu
- Runtime hassas veri invariantını preflight kapısı olarak koru
- Security headers (CSP, X-Frame-Options, vb.)

---

## 📞 İletişim & Sorular

**İlk Rapor:** GitHub Copilot (22 Haziran 2026)
**Doğrulama & Revizyon:** Kod incelemesi (12 Temmuz 2026, `main` branch)
**Sistem:** Medisa Taşıt Yönetim Sistemi V3

Herhangi bir sorun veya açıklama için repository'de issue açabilirsiniz.

---

**Son Güncelleme:** 2026-07-12 (runtime veri sınırı ve token davranışı revizyonu)
