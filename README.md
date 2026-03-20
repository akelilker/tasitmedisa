# tasitmedisa

**Taşıt Yönetim Sistemi V2** – Taşıt kayıt, takip ve raporlama uygulaması.

## Kurulum

1. Repoyu klonla:
   ```bash
   git clone https://github.com/akelilker/tasitmedisa.git
   cd tasitmedisa
   ```

2. **data/** klasörü: `data/data.json` repoda yok; sunucuda ilk kayıtta `save.php` ile oluşturulur veya boş şablon manuel eklenir. Yerel geliştirme için `data/` klasörü ve yazılabilir izinler yeterli.

### Veri yedekleri (sunucu)

Tüm yazımlar `core.php` içindeki `saveData()` üzerinden yapılır. Mevcut `data.json` varken her kayıtta:

- **`data/data.json.backup`** — bir önceki tam sürüm (geri yükleme önceliği).
- **`data/backups/snapshot-*.json`** — zaman damgalı anlık kopyalar; varsayılan en fazla **25** dosya tutulur, eskiler silinir.

Üst sınır için ortam değişkeni: `MEDISA_SNAPSHOT_MAX` (3–200 arası). `restore.php` önce `.backup` dosyasını dener; yoksa en yeni snapshot’ı kullanır.

İlk kurulumda `data.json` henüz yoksa yedek adımı atlanır (sadece atomik yazım).

3. **Docker (isteğe bağlı):**
   ```bash
   docker-compose up -d
   ```
   Uygulama `http://localhost:8080` adresinde çalışır.

## Deploy (karmotors.com.tr)

Push `main`/`master` branch’e yapıldığında GitHub Actions ile `public_html/tasitmedisa/` klasörüne SSH deploy yapılır. Detay için [DEPLOY-KARMOTORS.md](DEPLOY-KARMOTORS.md) dosyasına bakın.

## Gereksinimler

- PHP 8.x (Apache mod_rewrite, JSON)
- Tarayıcı (modern ES6+)
