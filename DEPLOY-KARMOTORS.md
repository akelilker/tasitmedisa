# karmotors.com.tr - tasitmedisa Deployment

Dosyalar sunucuda bir alt dizinde (örn. **public_html/medisa** veya **public_html/tasitmedisa**) olmalı. karmotors.com.tr'deki diğer işler etkilenmez.

## Canlı Erişim Adresi

- **Ana adres:** https://karmotors.com.tr/medisa/
- Alternatif path (kod destekliyor): https://karmotors.com.tr/tasitmedisa/
- **Subdomain (isteğe bağlı):** https://medisa.karmotors.com.tr/

Uygulama hem `/medisa/` hem `/tasitmedisa/` path'ini otomatik algılar (data-manager.js, script-core.js, sw.js, driver-script.js).

---

## Kurulum (cPanel)

### Seçenek A: karmotors.com.tr/medisa (alt dizin – canlı ile aynı)

**Klasör adı medisa ise:**

- Repo/deploy hedefi: `public_html/medisa/` (veya `public_html/karmotors/medisa/`)
- **URL:** https://karmotors.com.tr/medisa/

**Klasör adı tasitmedisa ise ve URL’nin /medisa olması isteniyorsa:**

1. cPanel → Dosya Yöneticisi → `public_html`
2. Symlink: `medisa` → `tasitmedisa`
3. **URL:** https://karmotors.com.tr/medisa/ (içerik tasitmedisa’dan gelir)

### Seçenek B: karmotors.com.tr/tasitmedisa (alt dizin)

- Repo/deploy hedefi: `public_html/tasitmedisa/`
- **URL:** https://karmotors.com.tr/tasitmedisa/

### Seçenek C: Subdomain (medisa.karmotors.com.tr)

1. cPanel → **Subdomains**
2. Subdomain: `medisa`, Domain: `karmotors.com.tr`
3. Document Root: `public_html/medisa` veya `public_html/tasitmedisa`
4. **URL:** https://medisa.karmotors.com.tr/

---

## YML / Docker ile uyum

- **docker-compose.yml:** Canlı adres `karmotors.com.tr/medisa/` olarak not edildi.
- **docker/nginx-proxy.conf:** `location /medisa/` eklendi; Docker arkasında test ederken canlı ile aynı path kullanılır.

Deploy script veya GitHub Actions kullanıyorsan hedef path’i canlı klasörle eşleştir: `public_html/medisa` veya symlink’lenmiş `medisa` → `tasitmedisa`.

---

## İzinler

- `data/` klasörü: **755** veya **775** (PHP yazabilmeli)
- `data/data.json`: **644** veya **664**

---

## Dosya Yapısı (örnek)

```
public_html/
├── karmotors/          ← karmotors.com.tr (diğer işler)
├── medisa/             ← Taşıt Takip (canlı: karmotors.com.tr/medisa/)
│   ├── index.html
│   ├── load.php
│   ├── save.php
│   ├── data/
│   ├── tasitlar.js
│   └── ...
└── tasitmedisa/        ← (alternatif: medisa → symlink olabilir)
```
