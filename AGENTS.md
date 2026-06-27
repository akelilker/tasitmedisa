# MEDISA Taşıt — Agent Çalışma İlkeleri

## Proje özeti

MEDISA Taşıt Yönetim Sistemi; PHP 8.2 + vanilla HTML/CSS/JS ile çalışan kurumsal taşıt kayıt, takip ve raporlama uygulamasıdır.

- Paket yöneticisi yoktur.
- Build step yoktur.
- Veritabanı yoktur.
- Kalıcı veri ana kaynağı `data/data.json` dosyasıdır.
- Canlı ortam cPanel üzerinde çalışır.
- Docker / container akışı kullanılmaz.

## Yerel çalışma

PHP 8.2 + Apache ve `mod_rewrite` açık olmalıdır. Document root, `index.html` ve `core.php` dosyalarının bulunduğu repo kökü olmalıdır.

Hızlı PHP syntax kontrolü:

```bash
php -l core.php
```

## Deploy

Üretimde iki ana dağıtım yolu vardır:

1. cPanel Git Version Control + `.cpanel.yml`
2. GitHub Actions FTP deploy (`.github/workflows/deploy-cpanel.yml`)

FTP deploy akışında `data/**` gönderilmez. Canlı `data/data.json` dosyası deploy ile ezilmemelidir. Ayrıntılar için `DEPLOYMENT.md` dosyasına bak.

## Ana dosya haritası

- `index.html` — ana SPA giriş noktası
- `core.php`, `load.php`, `save.php` — PHP API ve JSON read/write owner akışı
- `driver/` — kullanıcı portalı
- `admin/` — yönetici rapor paneli
- `data/data.json` — runtime JSON veri kaynağı; Apache/PHP tarafından yazılabilir olmalıdır
- `.cpanel.yml` — cPanel Git deploy dosya/kopyalama listesi
- `.cursor/rules/*.mdc` veya proje Cursor kural dosyaları — Cursor çalışma kuralları

## İletişim ve uygulama modu

- Kullanıcıya "kanka" diye hitap et.
- Kısa, doğrudan ve kapsam odaklı yaz.
- Kullanıcı analiz, inceleme veya plan istiyorsa dosya değiştirme.
- Önce kök nedeni ve dar uygulama planını ver; onay bekle.
- Kullanıcı açıkça `UYGULA`, `DEĞİŞTİR`, `SİL`, `EKLE`, `COMMIT`, `PUSH`, `DEPLOY` derse veya net bir `GÖREV / UYGULAMA` bölümü verirse bu uygulama onayıdır.
- Açık uygulama talimatı varken tekrar onay sorma.

## Owner ve kapsam kuralları

- Önce gerçek owner dosyayı, owner fonksiyonu veya owner selector'ı bul.
- Mevcut owner yapı üzerinden düzeltilebilecek sorun için paralel fonksiyon, helper, state, modal, class veya CSS sistemi kurma.
- Zombi, kullanılmayan veya geçiş sonrası sahipsiz kod bırakma.
- Verilen görevin dışına çıkma.
- Hedef dosya dışında değişiklik gerekiyorsa owner gerekçesini kanıtla.
- İlgisiz dosyaları restore etme, stage etme, formatlama veya commit'e dahil etme.

## CSS ve görsel kurallar

- Proje "Premium Dark" temadır.
- Başlık ve etiketler beyaz `#ffffff`.
- Veri ve açıklamalar gri `#a0aec0`.
- Dosya sonuna telafi amaçlı override bloğu ekleme.
- Aynı özelliği daha aşağıdaki selector ile tekrar ezme.
- Gereksiz `!important`, negatif margin veya transform ile hizalama yapma.
- Owner olmayan dosyada yeni selector açma.
- Bilinçli component varyantları ve modifier sınıfları kullanılabilir; mevcut ortak kontrata bağlı kalmalıdır.
- Masaüstü düzeltmesi mobili, mobil düzeltmesi masaüstünü bozmamalıdır.
- PWA ve Safe-Area için `env(safe-area-inset-*)` kullanılır.
- Mevcut `@media (display-mode: standalone)` bloklarını kaldırma veya gereksiz yere yeniden kurma.
- JS ile PWA class'ı basmak gibi geçici hack yöntemleri kullanma.

## Data, storage ve persistence kuralları

- Gerçek kullanıcı, taşıt, plaka, rapor, tarih, kasko, muayene, sigorta, egzoz, kredi, anahtar, lastik, UTTS ve takip verileri test amacıyla değiştirilmez, silinmez veya örnek veriyle ezilmez.
- `data/data.json` runtime veridir; lokal smoke, login veya canlı test kayıtları commitlenmemelidir.
- `data/data.json` veya canlı veri dosyalarına yalnızca görev açıkça veri migrasyonu, veri düzeltmesi veya persistence değişikliği istiyorsa dokunulur.
- Kalıcı iş verisi `localStorage` içine yazılmaz.
- `localStorage` yalnızca geçici UI state veya legacy uyumluluk için kullanılabilir.
- Okundu bilgisi, kasko listesi, taşıt kayıtları, kullanıcı raporları ve benzeri kalıcı veriler mevcut server/data owner kontratı üzerinden yürütülür.
- Yeni fallback, shadow cache veya migration davranışı eklenmeden önce mevcut read/write owner zinciri incelenir.
- Eski veriyle uyumluluk bozulacaksa migration veya backward compatibility planı yapılmadan kod yazılmaz.

## Git güvenliği

- Çalışmaya başlamadan önce branch, `HEAD`, `origin/main` ve working tree durumu kontrol edilir.
- Başkasına veya önceki göreve ait değişiklik varsa bunlara dokunulmaz.
- `git reset`, `git clean`, `git checkout`, `git restore`, `git stash`, `rebase`, `amend` gibi geçmişi veya çalışma ağacını etkileyen komutlar yalnızca kullanıcı açıkça isterse çalıştırılır.
- Untracked dosyalar görev kapsamına ait değilse silinmez, taşınmaz, stage edilmez ve commit'e dahil edilmez.
- Tek görev tek mantıksal diff üretmelidir.
- Commit, push ve deploy yalnızca açık talimatla yapılır.

## Format, refactor ve dependency sınırı

- Görev doğrudan istemedikçe toplu formatlama, Prettier/lint fix, import sıralama, whitespace cleanup veya genel refactor yapılmaz.
- Sadece görev kapsamındaki satırlar ve owner noktalar değiştirilir.
- `package.json`, lock dosyaları, build config, Vite config, PWA manifest, service worker, `.env`, deploy config ve benzeri altyapı dosyalarına yalnızca görev doğrudan gerektiriyorsa dokunulur.
- Yeni dependency eklemek, dependency güncellemek veya build pipeline değiştirmek son çaredir ve açık gerekçe ister.
- Otomatik global find-replace yapılmaz.
- Türkçe karakter, selector, class veya fonksiyon isimleri toplu değiştirilecekse önce kapsam ve risk raporlanır.

## Encoding

- Tüm dosyalar UTF-8, BOM olmadan kaydedilmelidir.
- Dosya encoding'i değiştirilmez.
- `ş, ğ, ü, ö, ç, ı, İ, Ş, Ğ, Ü, Ö, Ç` karakterleri Unicode kaçış dizilerine veya bozuk sembollere dönüştürülmez.
- Görev dışında mevcut bozuk karakter görülürse değiştirilmez; raporlanır.

## Doğrulama

Kod değişikliği sonrası görev kapsamına uygun olarak en az şu kontroller çalıştırılır; çalıştırılamayan kontrol varsa nedeni raporlanır:

```bash
git status --short
git diff --stat
git diff --check
```

İlgili PHP dosyaları için:

```bash
php -l <dosya>.php
```

İlgili JS dosyaları için:

```bash
node --check <dosya>.js
```

CSS değişikliklerinde brace/syntax kontrolü yapılır.

UI/CSS değişikliği varsa manuel doğrulama matrisi düşünülür:

- Masaüstü görünüm
- Mobil dar ekran
- Modal açık/kapalı durumları
- PWA standalone / safe-area etkisi
- İlgili buton, filtre, arama, kayıt veya rapor aksiyonu

Ortak component değiştiyse bu component'i kullanan diğer ana ekranlarda hızlı regresyon kontrolü yapılır. Çalıştırılmayan test, görülmeyen ekran veya doğrulanmayan canlı davranış başarılı gibi raporlanmaz.
