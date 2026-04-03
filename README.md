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

3. **Yerel çalıştırma:** PHP 8.x + Apache ile bu klasörü site kökü yap (`mod_rewrite` açık). Laragon / XAMPP / cPanel alt dizini uygun.

## Deploy (karmotors.com.tr)

cPanel **Git Version Control** veya repodaki **`.cpanel.yml`** ile `public_html/medisa` hedefine kopyalama. Ayrıntı için [DEPLOY-KARMOTORS.md](DEPLOY-KARMOTORS.md) (varsa) veya hosting panelindeki dağıtım adımlarına bakın.

## Gereksinimler

- PHP 8.x (Apache mod_rewrite, JSON)
- Tarayıcı (modern ES6+)
