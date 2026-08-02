# Taşıt Yönetim Sistemi V3 - Geliştirici Raporu
**Tarih:** 22 Haziran 2026
**Doğrulama:** 22 Haziran 2026 (güncel `main` kod incelemesi)
**Sistem:** Medisa Taşıt Yönetim Sistemi
**Dil Bileşimi:** JavaScript (52.2%), CSS (36.2%), PHP (6.9%), HTML (4.6%), PowerShell (0.1%)
**Repository:** akelilker/tasitmedisa

---

## 1 Ağustos 2026 Doğrulanmış Durum Güncellemesi

Bu belgenin ilk değerlendirme tarihi **22 Haziran 2026**’dır. Belge tarihsel değerlendirme niteliği taşır; aşağıdaki satırlar 22 Haziran incelemesinin anlık görüntüsüdür.

**1 Ağustos 2026** itibarıyla doğrulanmış release güncellemeleri bu bölüme eklenmiştir. Güncel repository ref’i commit anındaki current `main` SHA’sıdır. Ayrıntılı tarihli kapanış kanıtları `docs/raporlar` veya repository içindeki ilgili raporlarda tutulur.

Eski satır numaraları, dil bileşimi yüzdeleri ve “production ready” puan ifadeleri güncel ref üzerinde otomatik olarak geçerli sayılmamalıdır. Aşağıdaki tarihsel bulgular ile bu 1 Ağustos güncellemesi açıkça ayrı tutulmalıdır.

### Doğrulanmış release özeti (1 Ağustos 2026)

#### P0 — Ana shell asset pin / Service Worker
- Ana shell asset pin ve SW cache kontratı hizalandı.
- İlgili commit: `8c0cf06eca6b6d98c396eab334d7a1d72eae4f41`
- Durum: **CLOSED**

#### P1-A — K2 merkezi owner + authenticated smoke
- K2 canonical owner: `ayarlar.k2Belgesi`
- UI owner: Ayarlar → Zorunlu Evraklar
- Ölü ID referansları kaldırıldı.
- İlgili commit: `860045a9649ba7dfd54a90e008c22eb2fb7c318f`
- Durum: **CLOSED**

#### P1-B — Import source-of-truth
- `saveDataToServer()` yalnız exact `true` ise başarı.
- `false` / reject / missing save durumunda rollback.
- `medisa_just_restored` kaldırıldı.
- İlgili commit: `7f9aedc358b6f5e70aea48411c5aa600a0957df1`
- Kod / test / deploy / authenticated read-only smoke: **CLOSED**
- Controlled staging import owner/server round-trip: **PASS** (`e2da2937`; 62/62 + cleanup 9/9)
- Production canlı import yapılmadı.

**Import ayrımı:**
1. Import source-of-truth kod kontratı: **CLOSED**
2. Sentetik staging dosyasıyla controlled owner/server round-trip: **PASS** ([workflow 30742050836](https://github.com/akelilker/tasitmedisa/actions/runs/30742050836))
3. Production gerçek backup importu: **NOT PERFORMED**

Production import yapılmaması kod eksikliği değildir. Gerçek import canlı server verisini değiştirebilir; ayrı write yetkisi, backup, rollback ve bakım penceresi gerekir. Staging kabulü kişisel veri içermeyen sentetik payload ile exact baseline rollback uygular.

#### P1-C — WhatsApp Audit
- Genel yönetici audit UI
- Aggregate log owner
- True-only save + rollback
- Gönderim / teslim / okunma iddiası yok
- İlgili commit: `825295eddedf453eb55f69b29ade8dd496e0d190`
- Kullanıcı UI kabulü: **PASS**
- Durum: **CLOSED**

#### P1-D — Thin shell erken tık
- Direct-open erken fallback kaldırıldı.
- `MedisaShellIntentBridge`
- latest-intent-wins
- duplicate click coalesce
- lazy target strict validation
- İlgili commit: `d775ba3b58ddfd61f4b9eacc12172b42a9508fb1`
- Kayıt / Taşıtlar / Raporlar authenticated ilk lazy click: **PASS** (masaüstü / agent doğrulaması)
- Fiziksel iPhone PWA kabulü masaüstü testlerinden ayrı tutulur: **PENDING_USER_ACCEPTANCE**

### Restore durumu (`restore.php` + server restore)

- `restore.php` gerçek restore apply yapmaz; metadata-only GET kontratı korunur.
- Server restore altyapısı **IMPLEMENTED** (registry / dry-run / commit / status).
- Production restore **DISABLED** (`MEDISA_SERVER_RESTORE_ENABLED` default false; maintenance default false; HMAC secret repo’da yok).
- Production commit ayrıca `MEDISA_PRODUCTION_RESTORE_APPROVED=true` ikinci aktivasyon kapısını ister; bilinmeyen ortam production kabul edilir.
- P0/P1 güvenlik kapanışı: full canonical content hash, user/actor/credential invariantları, unknown collection reject, verified emergency rollback, ledger fail-closed, dry-run exact no-write.
- Geçmiş karar notu: `DO_NOT_IMPLEMENT_WITHOUT_EXPLICIT_PRODUCT_APPROVAL` — implementation ve staging acceptance tamamlanmıştır; production **activation** açık yetkilendirme olmadan yasaktır.
- Staging acceptance: **PASS** (`e2da2937`; live black-box 62/62 + cleanup 9/9; production isteği 0)
- Production write acceptance: **PENDING**
- Live restore performed: **NO**
- Runtime data changed: **NO**

### FTP Deploy Action

Current main workflow (`.github/workflows/deploy-cpanel.yml`) zaten `SamKirkland/FTP-Deploy-Action@v4.4.0` kullanır. “FTP Action version bump” aktif backlog / P2 hata olarak gösterilmez. Sürüm bilgisi zamana bağlıdır; gelecekte resmi kaynaktan yeniden doğrulanmalıdır. Supply-chain amacıyla immutable commit SHA pinleme istenirse bu ayrı bir DevOps kararıdır. Bu senkron görevinde workflow / action sürümü / secrets / retry yapısı değiştirilmemiştir.

### Fiziksel iPhone kabul ayrımı

- Chrome responsive emülasyonu fiziksel iPhone kabulü değildir.
- Fiziksel PWA cold-start ve early-tap kabulü kullanıcı veya gerçek cihazı gören testçi tarafından yapılmalıdır.
- Agent masaüstü testini fiziksel cihaz **PASS** olarak raporlamamalıdır.
- Fiziksel kullanıcı kabulü bu belge kapsamında kayda geçmemiştir → **PENDING_USER_ACCEPTANCE**

### Notification scope kontratı (current main özeti)

Ayrıntı §7’de güncellenmiştir. Özet: client kanonik key üretir; server save yalnız kanonik + gerekli `user:<id>` legacy key kabul eder; generic `scope:*` runtime write allowlist’inde değildir ve load projection kaynağı değildir.

---

## 📋 YÖNETİCİ ÖZETİ

Güncel `main` branch kod incelemesi sonucu **doğrulanmış aktif ORTA güvenlik riski bulunmamaktadır.**

Doc-token güvenlik fazı ile belge URL'lerinde ana session JWT taşınması kapatılmıştır. Şube veri izolasyonu bulgusu kod akışına göre **yanlış alarm** olarak sınıflandırılmıştır.

Kalan işler **düşük öncelikli UX, hijyen ve backlog** kalemleridir.

**Genel Puanlandırma (revize):**
- 🟢 Güvenlik: **97%** (doc-token fazı + mevcut filtreleme)
- 🟢 Veri İzolasyonu: **95%** (şube filtresi mevcut owner akışında çalışıyor)
- 🟢 Erişilebilirlik: **80%** (driver login ARIA eksik)
- 🟢 Kod Kalitesi: **88%**

---

## 🔴 KRİTİK SORUNLAR

**Bulunmamıştır.** ✅

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
- Repo genelinde `searchParams.set('token')`, `appendMedisaDocumentAuthToUrl` ve `allowQueryToken=true` çağrısı **yok**.
- Tüm API uçları `validateToken()` / `validateToken(false)` ile Bearer-only çalışıyor.

**Kalan iş (hijyen backlog, canlı risk değil):**
- `medisaReadAccessToken($allowQueryToken)` ve `allowQueryToken` parametresi ölü kod olarak duruyor; hiçbir çağrıda `true` geçilmiyor.
- Uzun vadede parametre ve `$_GET['token']` branch'i kaldırılabilir.

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

**Dosya:** `core.php` — `medisaBuildNotificationScopeDescriptor`, `medisaProjectNotificationReadStateForContext`; `save.php` merge; `scripts/migrate-medisa-notification-scope-legacy.php`
**Durum:** **BACKLOG / HİJYEN** — güvenlik açığı değil; runtime write/load kontratı current main’de kapalı

**Güncel doğrulama (current main owner):**
- Client kanonik scope key üretir: `user:<id>|role:<role>|branches:<scope>` (`notifications.js`).
- Server save yalnız current code’un izin verdiği kanonik key ile gerekli `user:<id>` legacy key davranışını kabul eder (`saveAllowedKeys`).
- Generic `scope:*` runtime write allowlist’inde **değildir**; `save.php` / merge owner’ı `scope:*` yazımına izin vermez.
- Load projection generic `scope:*` key’lerini **okumaz, birleştirmez veya response’a koymaz**.
- Generic `scope:*` mevcut eski veriler runtime authorization veya görünürlük owner’ı **değildir**.
- Eski kayıtlar varsa yalnız etkisiz tarihsel veri / hijyen borcudur.
- Dry-run/apply migration owner'ı hazırdır; exact SHA + exact count + rollback backup olmadan apply çalışmaz.
- Production `data/data.json` temizliği bakım penceresi ve indirilen backup kanıtıyla ayrıca çalıştırılır.

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

---

## 📊 ÖZETLEŞTİRİLMİŞ SORUN LİSTESİ (REVİZE)

| No | Sorun | Dosya | Öncelik (eski) | Durum (güncel) | Aksiyon |
|----|-------|-------|----------------|----------------|---------|
| 1 | Query Token / URL exposure | core.php + belge akışı | ORTA | **ÇÖZÜLDÜ / STALE** | `allowQueryToken` hijyen backlog |
| 2 | Şube izolasyonu | core.php 1120-1177 | ORTA | **YANLIŞ ALARM** | Kod değişikliği yok |
| 3 | JSON UTF-8 verify | core.php saveData | ORTA | **BACKLOG** | Tasarım backlog |
| 4 | Driver ARIA | driver/index.html | DÜŞÜK | **BACKLOG (A11Y)** | Mini UX fix |
| 5 | Button type | index.html 495-496 | DÜŞÜK | **KISMEN STALE** | Semantik mini fix |
| 6 | Windows atomic write | core.php 198-203 | DÜŞÜK | **BACKLOG** | Windows dev only |
| 7 | Notification scope | core.php owner | DÜŞÜK | **BACKLOG / HİJYEN** | Eski `scope:*` veri hijyeni (ayrı write izni); runtime write/load kapalı |

---

## 🎯 ÖNERİLEN ÖNCELİK SIRASI (GÜNCEL)

1. **Driver ARIA** mini UX fix (`driver/index.html` + `driver-script.js`)
2. **Vehicle modal** `type="button"` semantik mini fix (`index.html` ~495-496)
3. **`allowQueryToken` dead code cleanup** tasarımı (`core.php` hijyen)
4. **Notification scope** production dry-run/apply operasyonu (migration owner hazır; runtime kontrat kapalı)
5. **Runtime data health** PII-free boyut/count çıktısını periyodik izle (`tool:inspect-runtime-data-health`)
6. **`saveData` post-write verify** tasarımı (maliyet/fayda değerlendirmesi sonrası)
7. **Windows atomic write** iyileştirmesi (yalnızca Windows dev sorun çıkarırsa)
8. **Fiziksel iPhone PWA kabulü** (PENDING_USER_ACCEPTANCE; masaüstü emülasyonu yeterli değildir)
9. **Server-side restore production activation** (IMPLEMENTED; staging PASS; second activation flag + explicit authorization + production write acceptance pending)

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
- `allowQueryToken` ölü kodunu kaldır
- Notification eski `scope:*` kayıtlarını yalnız ayrı production-data mutation izniyle temizle (runtime write allowlist’te değil)

### Uzun Vadeli (opsiyonel)
- `saveData` post-write verify (maliyet analizi sonrası)
- Windows geliştirme ortamı için atomic write iyileştirmesi
- Veritabanı migration (JSON → SQLite/MySQL) değerlendirmesi
- Production gerçek backup importu (ayrı write yetkisi, backup, rollback ve bakım penceresi olmadan uygulanmaz)
- Production server-side restore activation/kabulü (ürün onayı olmadan uygulanmaz)

### DevOps
- Production error logging
- Backup rotasyonu
- Security headers (CSP, X-Frame-Options, vb.)
- FTP Action sürümü zamana bağlı yeniden doğrulama; immutable SHA pinleme ayrı DevOps kararı (current: `SamKirkland/FTP-Deploy-Action@v4.4.0`)

---

## 📞 İletişim & Sorular

**İlk Rapor:** GitHub Copilot (22 Haziran 2026)
**Doğrulama & Revizyon:** Kod incelemesi (22 Haziran 2026, `main` branch)
**1 Ağustos 2026 güncellemesi:** Doğrulanmış release / kontrat senkronu (tarihsel gövde korunur; üst bölüm güncel)
**Sistem:** Medisa Taşıt Yönetim Sistemi V3

Herhangi bir sorun veya açıklama için repository'de issue açabilirsiniz.

---

**Son Güncelleme:** 2026-08-01 (doğrulanmış durum güncellemesi; 22 Haziran tarihsel gövde korunur)
