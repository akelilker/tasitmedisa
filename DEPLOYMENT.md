# Dağıtım notları

Bu projede **Docker / GitHub Container Registry / SSH ile container** akışı kullanılmıyor.

## Üretim (ör. cPanel)

- Repodaki **`.cpanel.yml`**: Git deploy görevlerinde hangi dosyaların `public_html/medisa` (veya tanımlı `DEPLOYPATH`) altına kopyalanacağını belirler.
- **`data/data.json`** canlıda yazılabilir olmalı; deploy bazen bu dosyanın üzerine yazmamalı (yedek al).

## Yerel

- **PHP 8.2 + Apache**, document root = proje kökü, `mod_rewrite` açık.
- PHP sözdizimi: `php -l core.php`
