# tasitmedisa

**MEDISA Taşıt Yönetim Sistemi V3** — taşıt kayıt, takip, belge, kullanıcı paneli ve raporlama uygulaması.

## Teknik yapı

- PHP 8.x + Apache `mod_rewrite`
- Vanilla HTML / CSS / JavaScript
- Build step yok
- Paket yöneticisi yok
- Veritabanı yok
- Runtime veri kaynağı: `data/data.json`

## Kurulum

1. Repoyu klonla:

```bash
git clone https://github.com/akelilker/tasitmedisa.git
cd tasitmedisa
```

2. PHP 8.x + Apache ile proje kökünü site kökü yap.

3. `mod_rewrite` açık olmalıdır.

4. `data/` klasörü PHP tarafından yazılabilir olmalıdır.

`data/data.json` runtime veridir. Canlı veri deploy sırasında ezilmemelidir. Yerel geliştirme için `data/` klasörü ve yazılabilir izinler yeterlidir; ilk kayıt sırasında veri dosyası oluşturulabilir.

## Veri yedekleri

Tüm ana yazımlar `core.php` içindeki `saveData()` akışı üzerinden yapılır. Mevcut `data/data.json` varken her kayıtta:

- `data/data.json.backup` — bir önceki tam sürüm
- `data/backups/snapshot-*.json` — zaman damgalı snapshot dosyaları

Snapshot üst sınırı için ortam değişkeni: `MEDISA_SNAPSHOT_MAX`.

## Deploy

Canlı dağıtım için desteklenen akışlar:

- cPanel Git Version Control + `.cpanel.yml`
- GitHub Actions FTP deploy (`.github/workflows/deploy-cpanel.yml`)
- Gerekirse manuel `public_html/medisa` kopyası

Deploy ve runtime data politikası için `DEPLOYMENT.md` dosyasına bak.

## Ana giriş noktaları

| Alan | Yol |
|---|---|
| Ana panel | `index.html` |
| PHP API | `core.php`, `load.php`, `save.php` |
| Kullanıcı portalı | `driver/` |
| Yönetici rapor paneli | `admin/` |
| Runtime veri | `data/data.json` |

## Gereksinimler

- PHP 8.x
- Apache `mod_rewrite`
- PHP JSON desteği
- Modern ES6+ tarayıcı

## Hızlı doğrulama

```bash
php -l core.php
```

Kod değişikliklerinde proje kural dosyalarındaki owner, CSS, UTF-8, data ve deploy kurallarına uyulmalıdır.
