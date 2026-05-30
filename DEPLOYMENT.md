# Dağıtım notları

Bu projede **Docker / GitHub Container Registry / SSH ile container** akışı kullanılmıyor.

## Üretim (ör. cPanel)

- Repodaki **`.cpanel.yml`**: cPanel **Git Version Control** deploy’unda hangi dosyaların hedef dizine kopyalanacağını belirler; görev listesinde yalnızca birkaç `data/` alt klasörü `mkdir` edilir.
- **GitHub Actions FTP deploy** (`.github/workflows/deploy-cpanel.yml`): uygulama dosyalarını FTP ile senkronlar; **`data/**` exclude** ile tüm `data/` ağacı gönderilmez.

### Runtime data/ klasörü ve deploy politikası

- GitHub FTP deploy **`data/**` göndermez**. Canlı **`data/data.json`** bu yolla **ezilmez**; sunucudaki dosya korunur.
- **`data/data.json` runtime veridir** — lokal smoke, login veya canlı test kayıtları **commitlenmemelidir**.
- Sunucuda **`data/`** (uygulama kökü altında) PHP tarafından **yazılabilir** olmalıdır; upload, preview, backup ve ilk `save` buna bağlıdır.
- Belge upload (`upload_ruhsat.php`), PDF preview (`ruhsat_preview.php`) ve snapshot (`core.php` → `data/backups/`) alt klasörlerini **ilk kullanımda** oluşturur; FTP deploy bu klasörleri zorunlu olarak göndermez.
- **İlk kurulum / temiz sunucu kontrolü:** `medisa/data/` yazılabilir mi; PHP `mkdir` / dosya yazma izni var mı?
- **cPanel Git deploy** (`.cpanel.yml`) ile **GitHub Actions FTP deploy** farklı yollardır; `data/` ve `data.json` davranışını deploy türüne göre doğrulayın (FTP: exclude; Git: dosya kopyası yok, yalnızca sınırlı `mkdir`).

## Yerel

- **PHP 8.2 + Apache**, document root = proje kökü, `mod_rewrite` açık.
- PHP sözdizimi: `php -l core.php`
