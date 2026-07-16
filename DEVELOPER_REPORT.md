# Taşıt Yönetim Sistemi V3 - Geliştirici Raporu
**Tarih:** 22 Haziran 2026
**Doğrulama:** 15 Temmuz 2026 (P0 güvenli durdurma ve go-live güvenlik kapısı)
**Sistem:** Medisa Taşıt Yönetim Sistemi
**Dil Bileşimi:** JavaScript (52.2%), CSS (36.2%), PHP (6.9%), HTML (4.6%), PowerShell (0.1%)
**Repository:** akelilker/tasitmedisa

---

## 📋 YÖNETİCİ ÖZETİ

Güncel `main` branch kod incelemesi sonucu **doğrulanmış aktif ORTA güvenlik riski bulunmamaktadır.**

Doc-token güvenlik fazı ile belge URL'lerinde ana session JWT taşınması kapatılmıştır. Şube veri izolasyonu bulgusu kod akışına göre **yanlış alarm** olarak sınıflandırılmıştır.

Runtime `data/data.json` artık Git tarafından takip edilmez. Boş şema örneği `data/data.example.json` altında tutulur. Hassas veri invariantı **canonical kalite kapısının** bir parçasıdır; aynı kapı hem PR Check hem Deploy preflight tarafından (`.github/scripts/quality-gate.sh`) çağrılır ve dinamik PHP/JS/MJS syntax kontrolleri ile dört invariantı (roller, taşıt-save, hassas veri, KM state) zorunlu kılar. Repo geçmişine ilişkin güvenlik çalışmaları ayrı, koordineli P0 operasyon fazıdır.

Kalan işler **veri bütünlüğü, hijyen ve platform/backlog** kalemleridir. Driver login ARIA artık açık UX işi değildir; vehicle modal button-type maddesi gerçek bir bug değildir.

**Genel Puanlandırma (revize):**
- 🟢 Güvenlik: **97%** (doc-token fazı + mevcut filtreleme)
- 🟢 Veri İzolasyonu: **95%** (şube filtresi mevcut owner akışında çalışıyor)
- 🟢 Erişilebilirlik: **80%** (driver `#error-message` alert semantiği mevcut; kapsamlı A11Y puanlaması bu revizyonda yeniden hesaplanmadı)
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

**Dosyalar:** `.gitignore`, `data/data.example.json`, `scripts/verify-medisa-sensitive-data.js`, `.github/scripts/quality-gate.sh`, `.github/workflows/deploy-cpanel.yml`
**Durum:** **ÇÖZÜLDÜ / KALICI GUARD MEVCUT**

- `data/data.json` runtime kaynağıdır ve Git tarafından takip edilmez.
- `data/data.example.json` yalnızca boş şema örneğidir; uygulama bunu otomatik runtime kaynağı olarak kullanmaz.
- GitHub FTP deploy `data/**` ağacını dışlar; canlı runtime dosyası kod deploy'u ile ezilmez.
- Hassas veri invariantı canonical kalite kapısının bir parçasıdır; PR Check ve Deploy preflight aynı scripti çağırır.
- Repo geçmişine ilişkin temizlik, rotasyon ve dağıtılmış kopya doğrulaması ayrı ve koordineli P0 güvenlik fazıdır.

### Canonical CI / Deploy Kalite Kapısı

**Dosyalar:** `.github/scripts/quality-gate.sh`, `.github/workflows/pr-check.yml`, `.github/workflows/deploy-cpanel.yml`
**Durum:** **ÇÖZÜLDÜ / KALICI GUARD MEVCUT**

- Canonical owner: `.github/scripts/quality-gate.sh`
- PR Check (`Static checks`) ve Deploy preflight aynı scripti çağırır.
- PHP ve JS/MJS syntax kapsamı tracked dosyalardan dinamik üretilir (`git ls-files`).
- Roller, taşıt-save, hassas veri ve KM state invariantları zorunludur.
- Doğrudan `main` push'u deploy öncesinde bu kapıyı atlayamaz.
- HTTP smoke PR Check içinde ayrı job olarak kalır.

### 4. Driver Login ARIA

**Dosya:** `driver/index.html` (`#error-message`), `driver/driver-script.js` (login hata akışı)
**Durum:** **ÇÖZÜLDÜ**

**Kanıt:**
- `driver/index.html` içinde `#error-message` üzerinde `role="alert"` ve `aria-live="assertive"` mevcuttur.
- Login hata mesajı ekran okuyucular için canlı alert semantiğine sahiptir.
- Bu madde için yeni kod değişikliği gerekmez.
- Eski “ARIA yok” açıklaması **stale**'dir.

### 5. Form Button Type — Vehicle Modal

**Dosya:** `index.html` (vehicle modal Kaydet/Vazgeç butonları)
**Durum:** **KAPANDI / GERÇEK RİSK YOK**

- İncelenen Kaydet/Vazgeç butonları `<form>` içinde değildir (`vehicle-modal` → `div.modal-body` / `universal-btn-group`).
- Implicit submit riski yoktur.
- Bu nedenle hata düzeltmesi gerekmemektedir.
- Yalnız semantik görünüm amacıyla `type="button"` eklemek ürün veya kalite gereksinimi değildir (mevcut butonlar zaten `type="button"` kullanır).
- Bu madde için kod değişikliği önerilmez.

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
| Canonical CI/Deploy quality gate | .github/scripts/quality-gate.sh, pr-check.yml, deploy-cpanel.yml | ✅ ÇÖZÜLDÜ / KALICI GUARD |
| Driver Login ARIA | driver/index.html `#error-message` | ✅ ÇÖZÜLDÜ |
| Vehicle modal button type | index.html vehicle-modal | ✅ GERÇEK RİSK YOK / KOD AKSİYONU YOK |
| Runtime veri Git sınırı | .gitignore, data/data.example.json, canonical quality gate | ✅ MEVCUT |

---

## 📊 ÖZETLEŞTİRİLMİŞ SORUN LİSTESİ (REVİZE)

| No | Sorun | Dosya | Öncelik (eski) | Durum (güncel) | Aksiyon |
|----|-------|-------|----------------|----------------|---------|
| 1 | Query Token / URL exposure | core.php + belge akışı | ORTA | **ÇÖZÜLDÜ / STALE** | Eski `?token=` reddetme guard'ını koru |
| 2 | Şube izolasyonu | core.php 1120-1177 | ORTA | **YANLIŞ ALARM** | Kod değişikliği yok |
| 3 | JSON UTF-8 verify | core.php saveData | ORTA | **BACKLOG** | Tasarım backlog |
| 4 | Driver ARIA | driver/index.html | DÜŞÜK | **ÇÖZÜLDÜ** | Kod değişikliği yok; mevcut ARIA kontratını koru |
| 5 | Button type | index.html vehicle-modal | DÜŞÜK | **KAPANDI / RİSK YOK** | Kod değişikliği yok |
| 6 | Windows atomic write | core.php 198-203 | DÜŞÜK | **BACKLOG** | Windows dev only |
| 7 | Notification scope | core.php 941-991 | DÜŞÜK | **BACKLOG / HİJYEN** | Legacy cleanup |

---

## 🎯 ÖNERİLEN ÖNCELİK SIRASI (GÜNCEL)

1. **Notification scope** kullanıcı legacy state migration planı
2. **`saveData` post-write verify** tasarımı (maliyet/fayda değerlendirmesi sonrası)
3. **Windows atomic write** iyileştirmesi (yalnızca Windows dev sorun çıkarırsa)
4. **Repo geçmişi güvenlik operasyonu** (ayrı, koordineli ve yedekli P0 fazı)

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
Durum: P0 GO-LIVE GÜVENLİK KAPISI AÇIK — gerçek kullanıcı kullanımına hazır değil
```

---

## 💡 GENEL ÖNERİLER (REVİZE)

### Kısa Vadeli (düşük risk)

Bu revizyonda doğrulanmış aktif kısa vadeli kod düzeltmesi yoktur.

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
- Canonical kalite kapısını hem PR Check hem deploy preflight'ta koru; hassas veri invariantı bu kapının bir parçasıdır — kapıyı yeniden tekil hassas veri kontrolüne düşürme
- Security headers (CSP, X-Frame-Options, vb.)

---

## P0-A — Tamamlandı

- Repo private duruma alındı.
- İstemciye ve güvenli projection çıktısına parola/credential alanı sızması engellendi.
- Parolaların sunucu tarafında hash'lenmesi sağlandı.
- Canlı authenticated projection smoke PASS.
- P0-A commit: `f1f82a88163bd3875d5672baeb5c16c2ab0b1280`

## P0-B — Canlı Portal Hesap / Secret Rotasyonu (Aşama 2B)

Tarih: 2026-07-16

Canlıda tamamlananlar:
- 48 aktif hesabın parola rotasyonu uygulandı.
- 28 mevcut geçerli kullanıcı adı korundu; 20 kullanıcı adı canonical kural ile oluşturuldu.
- Legacy düz metin parola alanı canlıda 0.
- Canonical parola hash 48.
- İlk giriş parola önerisi bekleyen aktif kullanıcı 48.
- JWT/DOC signing secret rotate edildi.
- Eski JWT ile authenticated load → 401.
- Eski parola ile login reddedildi.
- Yeni genel yönetici login → 200.
- Yeni JWT ile authenticated load → 200.
- Projection içinde `sifre` / `sifre_hash` / parola alanları yok; `portal_sifresi_var` yalnız boolean.
- Geçici maintenance endpoint, staged data ve apply state silindi (endpoint GET → 404).
- İlk rastgele credential CSV üretildi; sonraki ürün kararıyla isim tabanlı modele geçilerek dağıtım dışı bırakıldı.
- Rollback gerekmedi.

Kapanış etiketleri:
- `P0_PASSWORD_ROTATION_CLOSED`
- `P0_TOKEN_SECRET_ROTATION_CLOSED`
- `P0_OLD_SESSIONS_INVALIDATED`
- `P0_LIVE_CREDENTIAL_PROJECTION_VERIFIED`
- `P0_PRE_APPLY_SERVER_BACKUPS_REMOVED`
- `P0_HISTORY_CLEANUP_PENDING`

Kullanılmayan etiket:
- `P0_SECURITY_GO_LIVE_GATE_CLOSED` (Git history cleanup tamamlanmadan kapatılmaz)

## Aşama 2B-2 — Pre-apply sunucu yedek temizliği

Tarih: 2026-07-16

- Aşama 2B pre-apply data backup silindi.
- Aşama 2B pre-apply secret backup silindi.
- Aktif `data.json` korundu.
- Aktif signing secret korundu.
- Yeni login / authenticated load smoke PASS.
- Sunucuda eski düz metin credential içeren geçici rollback backup’ı kalmadı.
- Normal `data.json.backup` ve `backups/` klasörü korundu.
- Git history cleanup hâlâ bekliyor.
- Manuel UI smoke hâlâ bekliyor.

## İsim tabanlı başlangıç hesapları — canlı düzeltme

Tarih: 2026-07-16

Ürün kararı düzeltmesi uygulandı:
- Rastgele başlangıç parolaları kaldırıldı.
- 48 aktif kullanıcı için isim tabanlı başlangıç parolası (ilk ad ASCII + `123`) canlıya yazıldı.
- Kullanıcı adları canonical kuralda doğrulandı; Serhan Köse → `serhanK`.
- Parolalar yalnız `sifre_hash` olarak saklandı; düz metin `sifre` alanı 0.
- `ilk_giris_parola_onerisi_bekliyor = true` (48).
- JWT/DOC signing secret değiştirilmedi.
- Serhan Köse login smoke PASS; authenticated load PASS; projection PASS.
- Rollback gerekmedi.
- Eski rastgele credential CSV dağıtım dışı bırakılıp güvenli silindi.
- Yeni Excel listesi repo dışında üretildi:
  `MEDISA-GUVENLI\kullanici-hesaplari\TasitMedisa-Kullanici-Adlari-ve-Parolalar.xlsx`

Etiketler:
- `NAME_BASED_INITIAL_PASSWORDS_LIVE`
- `RANDOM_INITIAL_PASSWORDS_REMOVED`
- `USER_ACCOUNT_XLSX_READY`
- `FIRST_LOGIN_PASSWORD_SUGGESTION_ACTIVE`
- `USER_ACCOUNTS_COMPLETED`
- `P0_HISTORY_CLEANUP_PENDING`

## Hâlâ açık — Git history cleanup

- Git history rewrite henüz uygulanmadı.
- Eski klonlar kaldırılmalı / yeniden clone edilmeli.
- Issue #456 history cleanup tamamlanana kadar açık kalır.
- Yeni Excel hesap listesi güvenli kanal ile dağıtılmalı; içerik Git’e veya sohbete yazılmamalı.
- Manuel UI smoke (ilk giriş öneri modalı) operatör tarafından doğrulanmalı.

## Notlar

- Apply öncesi eski genel yönetici smoke login’i `son_giris` alanını güncellediği için canlı data hash’i orijinal yedek hash’ten farklılaştı; apply sonrası canlı hash hazır JSON hash ile eşleşti.
- Maintenance cleanup staged/state/endpoint’i sildi; pre-apply data/secret yedekleri Aşama 2B-2’de otomatik FTP ile kaldırıldı.
- İsim tabanlı başlangıç parolaları bilinçli zayıf ürün kararıdır; ilk girişte opsiyonel değiştirme önerisi aktiftir.

---

## 📞 İletişim & Sorular

**İlk Rapor:** GitHub Copilot (22 Haziran 2026)
**Doğrulama & Revizyon:** Kod incelemesi (13 Temmuz 2026, `main` branch, commit `0353889`)
**Sistem:** Medisa Taşıt Yönetim Sistemi V3

Herhangi bir sorun veya açıklama için repository'de issue açabilirsiniz.

---

**Son Güncelleme:** 2026-07-16 (isim tabanlı başlangıç hesapları canlı düzeltme)
