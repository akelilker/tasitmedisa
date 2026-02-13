# karmotors.com.tr - tasitmedisa Deployment

Dosyalar **public_html/tasitmedisa** klasöründe kalır. karmotors.com.tr'deki diğer işler etkilenmez.

## Erişim Adresi

- **Alt dizin:** https://karmotors.com.tr/tasitmedisa/
- **Subdomain (tercih):** https://medisa.karmotors.com.tr/ (veya tasit.karmotors.com.tr)

---

## Kurulum (cPanel)

### Seçenek A: karmotors.com.tr/tasitmedisa (alt dizin)

**karmotors.com.tr → public_html** ise tasitmedisa zaten `public_html/tasitmedisa` içinde:

- **URL:** https://karmotors.com.tr/tasitmedisa/

**karmotors.com.tr → public_html/karmotors** ise symlink:

1. cPanel → Dosya Yöneticisi → `public_html/karmotors`
2. Symlink: `tasitmedisa` → `../tasitmedisa`
3. **URL:** https://karmotors.com.tr/tasitmedisa/

### Seçenek B: Subdomain (medisa.karmotors.com.tr)

1. cPanel → **Subdomains**
2. Subdomain: `medisa`, Domain: `karmotors.com.tr`
3. Document Root: `public_html/tasitmedisa`
4. **URL:** https://medisa.karmotors.com.tr/

---

## İzinler

- `data/` klasörü: **755** veya **775** (PHP yazabilmeli)
- `data/data.json`: **644** veya **664**

---

## Dosya Yapısı

```
public_html/
├── karmotors/          ← karmotors.com.tr (diğer işler)
│   └── tasitmedisa → ../tasitmedisa   (sadece symlink gerekirse)
└── tasitmedisa/        ← Taşıt Takip (tüm dosyalar burada)
    ├── index.html
    ├── load.php
    ├── save.php
    ├── data/
    ├── tasitlar.js
    └── ...
```
