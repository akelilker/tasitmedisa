# Dağıtım notları

Bu projede **Docker / GitHub Container Registry / SSH ile container** akışı kullanılmıyor.

## Üretim (cPanel)

Desteklenen iki ana deploy yolu vardır:

- **cPanel Git Version Control + `.cpanel.yml`**: Mevcut canlı `data/` ve `icon/` varlığını preflight ile doğrular; yalnız uygulama dosyalarını hedef dizine kopyalar.
- **GitHub Actions FTP deploy** (`.github/workflows/deploy-cpanel.yml`): Uygulama dosyalarını FTP ile senkronlar; **`data/**` exclude** ile tüm `data/` ağacı gönderilmez.

## Runtime `data/` klasörü ve deploy politikası

- GitHub FTP deploy **`data/**` göndermez**. Canlı **`data/data.json`** bu yolla **ezilmez**; sunucudaki dosya korunur.
- **`data/data.json` runtime veridir** — lokal smoke, login veya canlı test kayıtları **commitlenmemelidir**.
- Sunucuda **`data/`** uygulama kökü altında bulunmalı ve PHP tarafından **yazılabilir** olmalıdır.
- Upload, preview, backup ve ilk `save` işlemleri `data/` yazma iznine bağlıdır.
- Belge upload (`upload_ruhsat.php`), PDF preview (`ruhsat_preview.php`) ve snapshot (`core.php` → `data/backups/`) alt klasörlerini ilk kullanımda oluşturabilir.
- `.cpanel.yml` runtime `data/` veya `icon/` içeriğini kopyalamaz, silmez ve yeniden oluşturmaz.
- Gerekli upload/preview/backup alt klasörleri ilgili PHP owner akışı tarafından ilk kullanımda oluşturulur.
- **İlk kurulum / temiz sunucu kontrolü:** `medisa/data/` yazılabilir mi; PHP `mkdir` ve dosya yazma izni var mı?
- **cPanel Git deploy** ile **GitHub Actions FTP deploy** farklı yollardır. `data/` ve `data.json` davranışı deploy türüne göre doğrulanmalıdır.

## Yerel

- PHP 8.2 + Apache
- Document root = proje kökü
- `mod_rewrite` açık
- PHP sözdizimi kontrolü:

```bash
php -l core.php
```
