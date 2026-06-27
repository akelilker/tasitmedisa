# Dağıtım notları

Bu projede **Docker / GitHub Container Registry / SSH ile container** akışı kullanılmıyor.

## Üretim (cPanel)

Desteklenen iki ana deploy yolu vardır:

- **cPanel Git Version Control + `.cpanel.yml`**: Uygulama dosyalarını hedef dizine kopyalar ve runtime upload/preview/backup klasörlerini `mkdir -p` ile hazırlar.
- **GitHub Actions FTP deploy** (`.github/workflows/deploy-cpanel.yml`): Uygulama dosyalarını FTP ile senkronlar; **`data/**` exclude** ile tüm `data/` ağacı gönderilmez.

## Runtime `data/` klasörü ve deploy politikası

- GitHub FTP deploy **`data/**` göndermez**. Canlı **`data/data.json`** bu yolla **ezilmez**; sunucudaki dosya korunur.
- **`data/data.json` runtime veridir** — lokal smoke, login veya canlı test kayıtları **commitlenmemelidir**.
- Sunucuda **`data/`** uygulama kökü altında bulunmalı ve PHP tarafından **yazılabilir** olmalıdır.
- Upload, preview, backup ve ilk `save` işlemleri `data/` yazma iznine bağlıdır.
- Belge upload (`upload_ruhsat.php`), PDF preview (`ruhsat_preview.php`) ve snapshot (`core.php` → `data/backups/`) alt klasörlerini ilk kullanımda oluşturabilir.
- `.cpanel.yml` ayrıca şu runtime klasörlerini önceden hazırlar:
  - `data/ruhsat/`
  - `data/ruhsat_preview/`
  - `data/kasko_police/`
  - `data/kasko_police_preview/`
  - `data/sigorta_police/`
  - `data/sigorta_police_preview/`
  - `data/k2_belgesi/`
  - `data/k2_belgesi_preview/`
  - `data/tasit_karti/`
  - `data/tasit_karti_preview/`
  - `data/takograf/`
  - `data/takograf_preview/`
  - `data/backups/`
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
