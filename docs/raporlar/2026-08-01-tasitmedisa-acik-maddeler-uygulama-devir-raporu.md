# TaşıtMedisa Açık Maddeler — Uygulama ve Geliştirici Devir Raporu

## 1. Belge kimliği

- Tarih: 1 Ağustos 2026
- Proje: MEDISA Taşıt Yönetim Sistemi
- Repo: `akelilker/tasitmedisa`
- İnceleme branch'i: `main`
- İnceleme başlangıç ref'i: `d775ba3b58ddfd61f4b9eacc12172b42a9508fb1`
- Nihai ref: `4d283dba80da6b88ae736ba957b33554c7956bdc`
- Nihai ref farkı: `d775ba3b..4d283dba` yalnız `.gitignore` içine yerel Cursor kuralı ekler; uygulama assetlerinde fark yoktur.
- Nihai senkron: `HEAD == origin/main == 4d283dba80da6b88ae736ba957b33554c7956bdc`
- Hazırlama modu: salt-okunur analiz + dokümantasyon; uygulama kodu ve canlı veri değiştirilmedi.

Bu belge, başka bir yapay zekâ geliştirici aracına verildiğinde mevcut durumu yeniden keşfetmeden, kapsamı genişletmeden ve üretim verisine dokunmadan çalışabilmesi için hazırlanmıştır.

## 2. Kullanım talimatı

Bu belge tek başına commit, push, deploy veya canlı veri yazma yetkisi vermez.

- Kullanıcı yalnız analiz/plan isterse hiçbir dosya değiştirme.
- Kullanıcı açıkça `UYGULA`, `DEĞİŞTİR` veya eşdeğer bir uygulama talimatı verirse yalnız Bölüm 7 ve Bölüm 8'deki zorunlu işleri uygula.
- Commit, push ve deploy ancak ayrıca açıkça istenirse yapılır.
- Canlı import, restore apply, notification verisi temizliği veya başka runtime veri yazımı için ayrı ve açık üretim yetkisi gerekir.
- Çalışmaya başlamadan önce güncel ref ve pin değerlerini yeniden oku. Bu rapordaki pin değerini körlemesine kullanma; `index.html` o andaki kanonik kaynaktır.

## 3. Değişmez proje sınırları

1. Runtime veri ana kaynağı `data/data.json` dosyasıdır.
2. `data/data.json`, `data/data.json.backup`, `data/backups/**` ve diğer canlı iş verileri bu görevde okunmaz, yazılmaz, silinmez ve commitlenmez.
3. Dosya sonuna telafi amaçlı JS/CSS yaması eklenmez.
4. Mevcut owner blokları değiştirilir; paralel helper, yeni cache sistemi veya ikinci bir modal owner oluşturulmaz.
5. `script-core.js`, `sw.js`, `style-core.css`, lazy modüller ve deploy akışı yalnız pin-parite işi gerçekten gerektiriyorsa incelenir; bu görevde içerikleri değiştirilmez.
6. Formatlama, genel refactor, whitespace cleanup ve dependency değişikliği yapılmaz.
7. İlgisiz dosyalar restore, stage, stash veya silme işlemine alınmaz.
8. UTF-8 ve Türkçe karakterler korunur; BOM veya Unicode escape dönüşümü yapılmaz.

## 4. Yönetici özeti

İlk backlog listesi tamamen güncel değildir. Güncel sınıflama şöyledir:

| Madde | Güncel karar | Uygulama durumu |
| --- | --- | --- |
| Ana shell pin / Service Worker kontratı | Kapalı | Kod, invariant ve canlı asset doğrulandı |
| K2 merkezi belge owner + authenticated smoke | Kapalı | Owner ve salt-okunur canlı smoke doğrulandı |
| Import source-of-truth kodu | Kapalı | 10/10 invariant geçti; gerçek canlı import yapılmadı |
| WhatsApp audit kodu | Kapalı | 13/13 invariant geçti; teslim/okunma iddiası yok |
| Thin shell erken tık kodu | Kapalı | 28/28 invariant geçti |
| Thin shell authenticated canlı smoke | Kapalı | Kayıt, Taşıtlar, Raporlar ilk lazy tık PASS |
| `restore.php` sunucu restore apply | Bilinçli kapalı ürün kabiliyeti | P0 bug değildir; ürün kararı olmadan uygulanmaz |
| Controlled import canlı kabulü | Deferred doğrulama | Ayrı veri-yazma izni gerekir |
| Driver/admin `script-core` pin paritesi | Açık P2 teknik iş | Dar owner düzeltmesi önerilir |
| Olay Ekle Faz 4 fallback temizliği | Deferred analiz backlog'u | Mevcut görevde uygulanmaz |
| Notification `scope:*` runtime davranışı | Kapalı / eski kayıtlar etkisiz | Canlı veri temizliği opsiyonel ve ayrı izinlidir |
| `DEVELOPER_REPORT.md` güncelliği | Açık P2 doküman işi | Dar senkron önerilir |
| Taşıt ailesi UX standardizasyonu | Ürün tasarım backlog'u | Ayrı prototip ve kullanıcı kararı gerekir |
| FTP Action sürüm bump | Stale madde | Workflow zaten `v4.4.0` kullanır |
| Fiziksel iPhone PWA kabulü | Açık kullanıcı kabulü | Masaüstü emülasyonu fiziksel kabul yerine geçmez |
| RC-6 CSS | Kapsam dışı | Tanımlı yeni görev olmadan dokunulmaz |

Bu devir için gerçek ve uygulanabilir zorunlu kapsam yalnız şudur:

1. Paylaşılan shell'lerde `script-core.js` pin paritesini kurmak.
2. Aynı pariteyi mevcut main-shell invariant testine eklemek.
3. `DEVELOPER_REPORT.md` içindeki doğrulanmış stale bölümleri güncellemek veya belgeyi açık biçimde tarihsel snapshot olarak işaretlemek.

## 5. Doğrulanmış mevcut durum

### 5.1 Git ve çalışma ağacı

İnceleme sonunda:

```text
branch: main
HEAD: 4d283dba80da6b88ae736ba957b33554c7956bdc
origin/main: 4d283dba80da6b88ae736ba957b33554c7956bdc
working tree: clean
```

Başlangıçta izlenmeyen `.cursor/rules/ironbee-devtools-use.mdc` dosyası vardı. İnceleme sırasında kullanıcı tarafından gelen `4d283dba` commit'i bu dosyayı `.gitignore` kapsamına aldı. Uygulama kodunda değişiklik oluşmadı.

### 5.2 Ana shell ve Service Worker

Kanonik ana shell pinleri:

```text
index.html -> style-core.css?v=20260801.3
index.html -> script-core.js?v=20260801.7
sw.js      -> CACHE_VERSION = medisa-v2.268
sw.js      -> style-core.css?v=20260801.3 precache
```

Canlı doğrulama:

- Canlı `script-core.js` ile yerel `script-core.js` byte hash'i eşittir.
- Canlı `sw.js` ile yerel `sw.js` byte hash'i eşittir.
- Canlı `index.html` satır içeriği yerel `index.html` ile eşittir.
- Canlı `index.html` içinde `script-core.js?v=20260801.7`, `style-core.css?v=20260801.3` ve `MedisaShellIntentBridge` mevcuttur.

### 5.3 Authenticated thin-shell smoke

1 Ağustos 2026 tarihinde doğru TaşıtMedisa oturumuyla canlı ana uygulamada aşağıdaki ilk lazy tıklar çalıştırıldı:

1. `Kayıt`
2. Kayıt ekranından ana sayfaya dönüş
3. `Taşıtlar`
4. Taşıtlar ekranından ana sayfaya dönüş
5. `Raporlar`
6. Raporlar ekranından ana sayfaya dönüş

Sonuç:

```text
KAYIT_FIRST_LAZY_CLICK: PASS
TASITLAR_FIRST_LAZY_CLICK: PASS
RAPORLAR_FIRST_LAZY_CLICK: PASS
MODAL_DUPLICATION: 0
NON_GET_REQUESTS: 0
HTTP_4XX_5XX: 0
RUNTIME_EXCEPTIONS: 0
CONSOLE_ERROR_WARNING: 0
FINAL_ACTIVE_OVERLAYS: 0
FINAL_STATE: MAIN_MENU
```

Toplam 15 ağ isteğinin tamamı GET'tir. Kaydetme, import, restore veya başka write aksiyonu kullanılmamıştır.

### 5.4 Lokal invariant ve syntax sonuçları

```text
verify-medisa-main-shell-lazy-invariants: 65 passed, 0 failed
verify-medisa-import-source-of-truth-invariants: 10 passed, 0 failed
verify-medisa-monthly-todo-whatsapp-audit-invariants: 13 passed, 0 failed
verify-medisa-thin-shell-interaction-invariants: 28 passed, 0 failed
verify-medisa-deploy-invariants: OK
node --check script-core.js: PASS
node --check ayarlar.js: PASS
node --check notifications.js: PASS
node --check tasitlar.js: PASS
node --check sw.js: PASS
php -l restore.php: PASS
php -l core.php: PASS
```

## 6. Kök nedenler

### 6.1 Driver/admin `script-core` pin geriliği

#### Mevcut değerler

| Owner HTML | Mevcut `script-core` referansı |
| --- | --- |
| `index.html` | `script-core.js?v=20260801.7` |
| `driver/index.html` | `../script-core.js?v=20260718.4` |
| `driver/dashboard.html` | `../script-core.js?v=20260718.4` |
| `admin/driver-report.html` | `../script-core.js` — pinsiz |

#### Kök neden

`8c0cf06e` commit'i paylaşılan `style-core.css` pinlerini dört shell arasında hizaladı; `script-core.js` için aynı shell-parite kontratı eklenmedi. Daha sonraki ana-shell değişiklikleri yalnız `index.html` pinini yükseltti. Böylece aynı fiziksel JS asseti farklı HTML owner'larında eski veya pinsiz URL ile çağrılır hale geldi.

Bu durum her çevrimiçi yüklemede zorunlu fonksiyon hatası üretmez; Service Worker static assetlerde network-first çalışır. Ancak query pininin amacı tarayıcı/ara cache katmanlarında yeni asset adresi üretmektir. Eski veya pinsiz referans bu kontratı zayıflatır. Bu nedenle madde P0 değil, gerçek bir P2 cache ve release-parite borcudur.

### 6.2 `DEVELOPER_REPORT.md` stale durumu

Belge başlığında 22 Haziran 2026 doğrulaması yazmaktadır. Daha sonra tamamlanan P0 güvenlik, PWA pin, K2, Import SoT, WhatsApp audit ve thin-shell çalışmalarını kapsamamaktadır.

Somut yanlışlık:

```text
DEVELOPER_REPORT.md mevcut iddia:
save.php geriye dönük uyumluluk için legacy scope:* yazımına izin verebilir.
```

Güncel owner gerçeği:

- `core.php::medisaBuildNotificationScopeDescriptor()` yalnız kanonik key ve `user:<id>` legacy key üretir.
- `saveAllowedKeys` içinde `scope:*` yoktur.
- Load projection `scope:*` anahtarlarını okumaz, birleştirmez veya response'a koymaz.
- Client kanonik key kullanır.

Dolayısıyla runtime güvenlik veya izolasyon açığı yoktur. Canlı JSON içinde eski kayıt varsa artık etkisiz tarihsel veridir. Temizlik ancak ayrı veri migrasyonu izniyle yapılabilir.

### 6.3 `restore.php` metadata-only davranışı

Bu davranış tesadüfi eksik implementasyon değildir. P0-A1 güvenlik çalışmasında raw backup içeriğinin istemciye açılması ve eski client-side restore akışı bilinçli olarak kapatılmıştır.

Güncel kontrat:

- Yalnız `GET` ve `OPTIONS` kabul edilir.
- `manage_backups` yetkisi gerekir.
- Yedek içeriği dönmez.
- Yalnız kaynak türü, zaman ve boyut metadata'sı döner.
- Response `restore_enabled: false` içerir.
- UI butonu `Son Yedek Bilgisi` adını taşır.
- UI açıkça `Güvenli sunucu geri yükleme özelliği henüz aktif değildir.` mesajını gösterir.

Bu nedenle “metni netleştir” alternatifi zaten tamamlanmıştır. Gerçek server-side restore istenmiyorsa açık P0 yoktur.

### 6.4 Olay Ekle Faz 4 fallback'leri

`tasitlar.js` içindeki aşağıdaki davranışlar hâlâ mevcuttur:

- `.detail-plate-row` yoksa oluşturma,
- eski marka satırından buton temizleme,
- Olay Ekle butonunu remove/recreate etme,
- `.history-btn-minimal` için çoklu görsel kontrat.

Yeni lazy markup bunların bazılarını normal happy path'te gereksiz hale getirmiş olabilir. Ancak eski HTML/yeni JS, PWA cache geçişi ve yeniden hydrate senaryoları kanıtlanmadan silinmeleri güvenli değildir. İlgili geliştirici raporu Faz 4'ü açıkça analiz-only backlog olarak tanımlar ve kritik fonksiyonel eksik olmadığını söyler.

### 6.5 Taşıt ailesi UX standardizasyonu

Bu başlık artık teknik CSS standardizasyonu değildir. Mevcut UX raporu kalan problemin bilgi mimarisi ve görsel hiyerarşi olduğunu belirtir. Liste, detay, olay, tarihçe ve belge ekranlarının ortak UX dili ürün kararı gerektirir.

Bu nedenle genel CSS düzenlemesi veya toplu selector refactor'u başlatılmamalıdır. Önce tarihçe ekranında prototip ve kullanıcı kabulü gerekir.

## 7. Zorunlu uygulama Faz A — `script-core` shell pin paritesi

### 7.1 İzin verilen dosyalar

Uygulama onayı verildiğinde yalnız şu dosyalar değiştirilmelidir:

```text
driver/index.html
driver/dashboard.html
admin/driver-report.html
scripts/verify-medisa-main-shell-lazy-invariants.js
```

`index.html` yalnız kanonik pin kaynağı olarak okunur. İçeriği değiştirilmez.

### 7.2 Kesin değişiklikler

1. `index.html` içinden güncel `script-core.js?v=<pin>` değerini oku.
2. `driver/index.html` içindeki `../script-core.js?v=...` değerini aynı pine getir.
3. `driver/dashboard.html` içindeki `../script-core.js?v=...` değerini aynı pine getir.
4. `admin/driver-report.html` içindeki pinsiz `../script-core.js` referansını `../script-core.js?v=<canonical-pin>` yap.
5. `scripts/verify-medisa-main-shell-lazy-invariants.js` içinde mevcut `paylaşılan shell style-core pin parity` testinin yanına aynı dört HTML owner'ı için `script-core` pin parite testi ekle.
6. Test her dosyada pinin bulunmasını ve dört pinin `index.html` kanonik piniyle birebir eşit olmasını assert etsin.

Base ref değişmemişse beklenen kanonik değer:

```text
20260801.7
```

Ref değişmişse rapordaki değeri değil, güncel `index.html` değerini kullan.

### 7.3 Uygulanmaması gereken yaklaşımlar

- `script-core.js` içeriğini değiştirme.
- Sırf driver pinini hizalamak için ana shell pinini yeniden bump etme.
- `sw.js` cache version veya precache listesini değiştirme.
- Yeni invariant scripti oluşturma; mevcut main-shell invariant owner'ını genişlet.
- HTML sonuna ikinci bir script tag ekleme.
- Query parametre dışında path, defer sırası veya script yükleme mimarisini değiştirme.
- Driver login/dashboard davranışını refactor etme.

### 7.4 Faz A kabul kriterleri

```text
index.html script-core pin == driver/index.html pin
index.html script-core pin == driver/dashboard.html pin
index.html script-core pin == admin/driver-report.html pin
Her HTML içinde script-core referansı tam olarak bir kez bulunur
Mevcut script sırası değişmez
Main-shell invariant yeni parite testini geçirir
Driver lazy ve auth invariantları regresyonsuz geçer
```

## 8. Zorunlu uygulama Faz B — `DEVELOPER_REPORT.md` senkronu

### 8.1 İzin verilen dosya

```text
DEVELOPER_REPORT.md
```

### 8.2 Güvenli senkron yaklaşımı

Belgenin tüm güvenlik yüzdelerini yeni baştan üretmek için kanıtsız tahmin yapılmamalıdır. İki kabul edilebilir yöntem vardır:

#### Tercih edilen yöntem

Belgenin başına belirgin bir durum notu ekle:

```text
Durum: Tarihsel değerlendirme + 1 Ağustos 2026 doğrulanmış ek güncelleme
Kanonik güncel kapanış kanıtları: docs/raporlar altındaki tarihli raporlar
```

Ardından yalnız doğrulanmış stale bölümleri güncelle.

#### Alternatif yöntem

Belgenin tamamı yeniden denetlenecekse tüm yüzde, satır numarası ve “production ready” iddialarını güncel ref üzerinde yeniden kanıtla. Bu geniş güvenlik denetimi bu devir raporunun zorunlu kapsamı değildir.

### 8.3 Kesin içerik düzeltmeleri

1. Doğrulama tarihi ve ref provenance'ını ekle.
2. Notification Scope Migration bölümünde `scope:*` yazımına izin verilebilir iddiasını kaldır.
3. Güncel kontratı şu şekilde yaz:
   - Client kanonik key üretir.
   - Save yalnız kanonik ve `user:<id>` legacy key kabul eder.
   - Load yalnız `user:<id>` ve kanonik key'i birleştirir.
   - Generic `scope:*` okunmaz, yazılmaz ve projekte edilmez.
4. Eski canlı kayıt temizliğini “opsiyonel production-data hijyeni” olarak sınıflandır.
5. Açık veri migrasyonu izni olmadan `data/data.json` temizliği yapılmaması gerektiğini belirt.
6. Aşağıdaki kapanışları tarih/ref ile ekle:
   - P0 ana pin/SW kontratı,
   - K2 merkezi owner ve authenticated smoke,
   - Import SoT kod kontratı,
   - WhatsApp audit kod kontratı,
   - Thin shell intent bridge ve authenticated ilk-lazy-tık smoke.
7. FTP Action bump maddesini açık backlog olarak taşıma; workflow zaten `v4.4.0` kullanır.
8. Restore'u “güvenli server restore aktif değil; metadata-only davranış bilinçli ve UI'da açık” biçiminde yaz.
9. Controlled import canlı testini kod eksikliği değil, ayrı yazma yetkili acceptance maddesi olarak göster.
10. Fiziksel iPhone PWA kabulünü masaüstü/Chrome smoke'tan ayrı tut.

### 8.4 Faz B kabul kriterleri

- Belge güncel ref'i veya açık tarihsel-snapshot niteliğini belirtir.
- `scope:*` hakkında güncel koda aykırı cümle kalmaz.
- Tamamlanan kod işi ile yapılmayan canlı write acceptance birbirine karıştırılmaz.
- Restore davranışı “bozuk endpoint” olarak gösterilmez.
- P2 ürün/tasarım backlog'ları P0 gibi sunulmaz.
- Kanıtsız güvenlik yüzdesi veya canlı PASS üretilmez.

## 9. Karar kapısı — gerçek server-side restore

### 9.1 Varsayılan karar

```text
RESTORE_APPLY_DECISION: DO_NOT_IMPLEMENT_WITHOUT_EXPLICIT_PRODUCT_APPROVAL
```

Mevcut UI zaten metadata-only davranışı doğru anlatır. Ürün sahibi “Son sunucu yedeğinden tek tıkla geri yükleme gerçekten gerekli” demedikçe `restore.php` değiştirilmemelidir.

### 9.2 Ürün onayı verilirse zorunlu teknik tasarım

Bu iş Faz A/B ile aynı diff'e eklenmemelidir. Ayrı görev, ayrı risk değerlendirmesi ve ayrı test planı gerekir.

Owner zinciri:

```text
restore.php
  -> medisaResolveAuthorizedContext(..., 'manage_backups')
  -> getMainBackupFilePath() / findLatestSnapshotPath()
  -> JSON doğrulama
  -> medisaMutateData() kilidi
  -> saveData() yedek + atomic write + post-write JSON verify
ayarlar.js
  -> showLastBackupMetadata()
  -> ayrı açık kullanıcı onayı
  -> server apply isteği
```

Asgari güvenlik ve veri kriterleri:

1. GET metadata-only kalır; raw backup istemciye dönmez.
2. Restore apply yalnız explicit POST ile çalışır.
3. `manage_backups === true` zorunludur; frontend guard güvenlik owner'ı değildir.
4. Kaynak dosya yalnız server-owned allowlist yolundan seçilir; request ile keyfi path alınmaz.
5. Backup JSON parse edilir ve en az `branches`, `users`, `tasitlar` koleksiyon kontratları doğrulanır.
6. Genel yönetici sürekliliği ve kullanıcı güvenlik invariantları bozulamaz.
7. Mutation `medisaMutateData()` kilidi altında yürür.
8. Yazma `saveData()` owner'ı üzerinden yapılır; mevcut veri restore öncesi yeniden snapshotlanır.
9. Yedekleme başarısızsa restore başlamaz.
10. Post-write read/JSON verify başarısızsa başarı response'u dönmez.
11. Response raw kullanıcı parola/hash/token veya tam veri taşımaz.
12. Audit için aktörü, zamanı, kaynak türünü ve sonucu kişisel veri sızdırmadan loglama tasarlanır.
13. Double submit/idempotency veya ikinci onay token'ı değerlendirilir.
14. Başarı UI mesajı yalnız server `success === true` döndükten sonra gösterilir.
15. Branch manager ve normal kullanıcı endpoint seviyesinde 403 almalıdır.

Zorunlu restore test matrisi:

```text
GET genel yönetici -> metadata only
GET yetkisiz -> 401/403
POST genel yönetici + geçerli backup -> controlled fixture üzerinde PASS
POST branch manager -> 403
POST normal kullanıcı -> 403
POST bozuk JSON backup -> no write
POST eksik koleksiyon -> no write
POST yedekleme başarısız -> no write
POST atomic write başarısız -> no success
POST sonrası JSON verify başarısız -> no success
İkinci istek / double click -> tanımlı ve güvenli sonuç
Raw credential projection -> 0
```

Canlı üretim kabulü ayrıca tam backup, indirilen backup kanıtı, rollback ve veri sayımı gerektirir. Lokal fixture PASS, canlı PASS yerine geçmez.

## 10. Deferred doğrulama — controlled import

Import kodu güncel olarak şu kontratı uygular:

- Import önce mevcut runtime/local snapshot'ı alır.
- Dosya payload'ı runtime state'e uygulanır.
- `saveDataToServer()` sonucu yalnız exact `true` ise başarıdır.
- `false`, reject veya fonksiyon yokluğu halinde runtime/local rollback yapılır.
- Başarı metadata'sı yalnız server save doğrulandıktan sonra best-effort yazılır.
- `medisa_just_restored` köprüsü kaldırılmıştır.

Kod invariantları 10/10 geçmiştir. Kalan kabul gerçek dosya seçimi ve server round-trip doğrulamasıdır.

### 10.1 Güvenli tercih

Önce disposable lokal/staging veri kopyası üzerinde çalıştır:

1. Mevcut fixture hash ve koleksiyon sayılarını kaydet.
2. Aynı fixture'dan export al.
3. Kontrollü küçük, sahte ve kişisel veri içermeyen değişiklik üret.
4. Dosyadan import et.
5. Server save `true`, reload sonrası içerik ve kaynak doğrula.
6. Pre-import snapshot ve rollback yolunu ayrıca hata enjeksiyonuyla doğrula.
7. Test fixture'ını temizle.

### 10.2 Canlı ortam sınırı

Canlı dosya importu gerçek `data/data.json` içeriğini değiştirebilir. Kullanıcı ayrıca açıkça canlı write yetkisi vermeden dosya seçici açma, dosya yükleme veya onay modalını kabul etme.

Canlı kabul istenirse minimum kapılar:

```text
AUTHORIZED_LIVE_WRITE: YES
BACKUP_COMPLETED_AND_DOWNLOADED: YES
BACKUP_SHA256_RECORDED: YES
PRE_STATE_COUNTS_RECORDED: YES
ROLLBACK_PATH_VERIFIED: YES
CONTROLLED_IMPORT_APPLIED: YES
POST_RELOAD_STATE_VERIFIED: YES
TEST_DATA_CLEANUP_VERIFIED: YES
```

## 11. Deferred analiz — Olay Ekle Faz 4

Bu faz için mevcut görevde kod yazma.

Başlatma şartları:

1. Kullanıcı ayrıca Faz 4 analizi ister.
2. Güncel lazy markup ve eski cache geçiş matrisi çıkarılır.
3. Physical/standalone PWA veya eşdeğer güvenilir cache-transition testi yapılır.
4. Her fallback'in caller ve DOM owner'ı kanıtlanır.
5. Silme sonrası desktop, mobile, modal dönüşleri ve offline warm-cache regresyonu çalıştırılır.

Belge/Ruhsat bloğu Faz 4 kapsamına dahil değildir.

## 12. Deferred ürün işi — taşıt ailesi UX

Bu görev CSS cleanup değildir. Uygulama sırası:

1. Tarihçe ekranında salt prototip.
2. Navigasyon alanı, taşıt kimliği ve sekme hiyerarşisinin kullanıcı değerlendirmesi.
3. Mobil dikey alan ve geri dönüş netliği kabulü.
4. Başarılı modelin olay/belge/detay ekranlarına taşınmasına ayrı karar.
5. En son liste toolbar/tablo başlığı hiyerarşisi.

Kullanıcı bir UX yönü seçmeden owner CSS'e müdahale etme.

## 13. Notification legacy veri hijyeni

Runtime owner kapalıdır; generic `scope:*` artık etkisizdir. Bu nedenle varsayılan karar:

```text
NOTIFICATION_SCOPE_RUNTIME: CLOSED
LEGACY_DATA_CLEANUP: OPTIONAL_DEFERRED
```

Canlı veri temizliği istenirse:

- Önce sadece sayım ve key örneği içermeyen yapısal rapor üret.
- Backup ve rollback kanıtı olmadan yazma yapma.
- Yalnız `notificationReadState` içindeki doğrulanmış generic `scope:*` key'lerini hedefle.
- `user:<id>` ve kanonik key'lere dokunma.
- Başka collection'ı formatlama veya yeniden yazma.
- Temizlik sonrası load/save role-matrix invariantlarını çalıştır.

Bu temizlik ürün davranışını düzeltmez; yalnız veri hijyenidir.

## 14. Fiziksel iPhone PWA kabul planı

Chrome responsive emülasyonu veya masaüstü PWA, fiziksel iPhone standalone kabulü değildir.

Kullanıcı cihazında kontrol listesi:

1. Ana ekrana eklenmiş PWA tamamen kapatılır.
2. PWA yeniden açılır ve güncel sürüm uyarısı varsa yenilenir.
3. İlk açılışta sırayla Kayıt, Taşıtlar ve Raporlar butonları denenir.
4. Her buton ilk dokunuşta yalnız bir modal açmalıdır.
5. Busy/takılı splash, boş modal, çift modal veya ikinci dokunuş gereksinimi olmamalıdır.
6. Her modalden ana sayfaya dönüş test edilir.
7. Olay Ekle kategori ve geri dönüş akışı denenir; kaydetme yapılmaz.
8. Safe-area, üst çerçeve ve alt footer boşluğu görsel olarak kontrol edilir.
9. Uygulama kapatılıp warm-cache açılışı tekrarlanır.
10. Mümkünse çevrimdışı yalnız önceden cache'lenmiş yüzey davranışı gözlenir; veri yazılmaz.

Sonuç yalnız kullanıcı veya fiziksel cihazı gerçekten gören testçi tarafından `IPHONE_PWA_ACCEPTED` yapılabilir.

## 15. FTP action ve deploy kararı

`.github/workflows/deploy-cpanel.yml` içindeki üç FTP denemesi de:

```text
SamKirkland/FTP-Deploy-Action@v4.4.0
```

kullanır. Bu nedenle “FTP action version bump” açık iş değildir.

1 Ağustos 2026 dış doğrulamasında resmi GitHub Marketplace kaydı da `v4.4.0` sürümünü güncel sürüm olarak göstermektedir: <https://github.com/marketplace/actions/ftp-deploy>. İleride bu madde yeniden açılırsa sürüm bilgisi zamana bağlı olduğu için resmi kaynak tekrar kontrol edilmelidir.

Bu görevde:

- Action sürümünü değiştirme.
- Retry job yapısını refactor etme.
- FTP secrets veya variables'a dokunma.
- Deploy çalıştırma.

Supply-chain amacıyla immutable commit SHA pinleme istenirse bu, sürüm bump'tan farklı ve ayrıca onaylanması gereken bir DevOps görevidir.

## 16. RC-6 kararı

Repo içindeki güncel rapor yalnız `RC-6 CSS` başlığını kapsam dışı olarak kaydeder; bu devirde uygulanabilir owner, selector ve acceptance kriteri tanımlı değildir.

Varsayılan karar:

```text
RC_6: OUT_OF_SCOPE_NO_ACTION
```

Yeni görev verilmeden RC-6 adıyla CSS tarama, selector silme veya override ekleme.

## 17. Uygulama sonrası zorunlu doğrulama

Faz A ve Faz B uygulanırsa en az şu kontroller çalıştırılmalıdır:

```powershell
node scripts/verify-medisa-main-shell-lazy-invariants.js
node scripts/verify-medisa-driver-lazy-invariants.js
node scripts/verify-medisa-driver-cold-dependencies.js
node scripts/verify-medisa-mandatory-password-change-invariants.js
node scripts/verify-medisa-remember-me-invariants.js
node scripts/verify-medisa-deploy-invariants.js
node --check script-core.js
git status --short
git diff --stat
git diff --check
```

Notlar:

- `script-core.js` değiştirilmemiş olsa da ortak asset kontratı nedeniyle syntax check düşük maliyetli güvenlik kapısıdır.
- Bir test makinede çalışmıyorsa başarılı gibi raporlama; exact hata ve nedeni yaz.
- `git diff --check` CRLF kaynaklı gürültü üretirse EOL ve normalize içerik karşılaştırılmadan gerçek build drift ilan etme.

### 17.1 Beklenen diff sınırı

Faz A/B birlikte onaylandıysa beklenen maksimum dosya kümesi:

```text
driver/index.html
driver/dashboard.html
admin/driver-report.html
scripts/verify-medisa-main-shell-lazy-invariants.js
DEVELOPER_REPORT.md
```

Bunun dışında değişiklik oluşursa dur ve owner gerekçesini raporla. Otomatik olarak restore etme veya stage etme.

### 17.2 Opsiyonel salt-okunur canlı smoke

Deploy ayrıca istenmiş ve başarıyla tamamlanmışsa:

1. `HEAD`, `origin/main` ve deploy edilen SHA eşitliği doğrulanır.
2. Dört shell HTML'den `script-core` pinleri okunur.
3. Canlı `script-core.js` hash'i yerel dosyayla karşılaştırılır.
4. Authenticated ana uygulamada Kayıt, Taşıtlar, Raporlar ilk lazy tık çalıştırılır.
5. Ağ trafiğinde POST/PUT/PATCH/DELETE olmadığını kanıtla.
6. 4xx/5xx, runtime exception ve console error/warning sayısını raporla.
7. Ekranı ana menü durumunda bırak.

Deploy yetkisi yoksa canlı smoke'u yerel test sonucu gibi gösterme.

## 18. Başarı tanımı

Bu devir paketi aşağıdaki koşullarda tamamlanmış sayılır:

```text
PIN_PARITY_IMPLEMENTED: YES
PIN_PARITY_INVARIANT: PASS
DRIVER_REGRESSION_TESTS: PASS
DEVELOPER_REPORT_SCOPE_SYNCED: YES
RESTORE_APPLY_CHANGED: NO
RUNTIME_DATA_CHANGED: NO
NOTIFICATION_DATA_MIGRATED: NO
OLAY_EKLE_PHASE4_CHANGED: NO
UX_CHANGED: NO
FTP_ACTION_CHANGED: NO
RC6_CHANGED: NO
UNRELATED_FILES_CHANGED: NO
```

## 19. Başka yapay zekânın teslim formatı

Çalışmayı yapan araç sonuç mesajını şu formatta vermelidir:

```text
BASE_REF: <sha>
FINAL_REF: <sha veya NOT_COMMITTED>

CHANGED_FILES:
- <dosya>

IMPLEMENTED:
- Driver/admin script-core pin parity
- Existing main-shell invariant extended
- Developer report stale sections synchronized

TESTS:
- verify-medisa-main-shell-lazy-invariants: PASS/FAIL
- verify-medisa-driver-lazy-invariants: PASS/FAIL
- verify-medisa-driver-cold-dependencies: PASS/FAIL
- verify-medisa-mandatory-password-change-invariants: PASS/FAIL
- verify-medisa-remember-me-invariants: PASS/FAIL
- verify-medisa-deploy-invariants: PASS/FAIL
- node --check script-core.js: PASS/FAIL
- git diff --check: PASS/FAIL

LIVE:
- DEPLOY: NOT_AUTHORIZED / NOT_RUN / PASS / FAIL
- AUTH_SMOKE: NOT_RUN / PASS / FAIL
- NON_GET_REQUESTS: <sayı veya NOT_CAPTURED>
- HTTP_4XX_5XX: <sayı veya NOT_CAPTURED>
- CONSOLE_ERRORS_WARNINGS: <sayı veya NOT_CAPTURED>

UNCHANGED_BY_DESIGN:
- restore.php apply
- data/**
- notification legacy data
- Olay Ekle Faz 4
- Taşıt ailesi UX
- FTP Action
- RC-6 CSS

GIT_STATUS:
<git status --short çıktısı>

BLOCKERS_OR_NOTES:
- <varsa exact engel>
```

## 20. Son karar

Gerçek zorunlu teknik iş, driver/admin shell'lerinin aynı `script-core.js` assetini kanonik cache-bust piniyle çağırmasını sağlamak ve bu kontratı mevcut invariant owner'ına bağlamaktır.

`DEVELOPER_REPORT.md` senkronu runtime düzeltmesi değildir ancak bir sonraki yapay zekânın stale bilgiden yanlış P0 üretmesini engellemek için gereklidir.

Server restore, canlı import, notification veri temizliği, Olay Ekle Faz 4, taşıt ailesi UX, fiziksel iPhone PWA ve RC-6 aynı uygulama paketine dahil edilmemelidir. Her biri kendi karar veya kanıt kapısıyla ilerlemelidir.
