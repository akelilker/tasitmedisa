# Dokümantasyon Teslim Raporu — Medisa Taşıt Kullanım Kılavuzları

**Tarih:** 2026-09-29  
**Kapsam:** Yalnızca `artifacts/` altında Markdown; uygulama kodu değiştirilmedi.

## Üretilen dosyalar

| Dosya | Amaç |
|--------|------|
| `artifacts/Medisa_Kullanim_Kilavuzu_Kullanici.md` | Sürücü / şube kullanıcısı — `driver/` |
| `artifacts/Medisa_Kullanim_Kilavuzu_Yonetici.md` | Yönetici — `index.html` + `admin/driver-report.html` |
| `artifacts/Medisa_Simge_Lejant.md` | Simge, `title`, `aria-label` lejantı |
| `artifacts/Dokumantasyon_Teslim_Raporu.md` | Bu özet |

## Yapı

1. **Kullanıcı kılavuzu:** Giriş → PWA (Android / iOS / masaüstü) → panel düzeni → km/bakım/kaza/belge/talep/geçmiş → bilgi-nereye tablosu.
2. **Yönetici kılavuzu:** Rol ve oturum → ana menü → kayıt → taşıtlar/detay/olay ekle → satış-pert-arşiv → ay özeti → bildirimler → raporlar → admin KM/kullanıcı raporları → K2 zorunlu evraklar → rol matrisi.
3. **Lejant:** Ana, taşıt, rapor, aylık modal, sürücü ve admin yüzeyleri ayrı bölümler; terim eşlemesi (K2, Arvento, ay özeti).

Ekran görüntüsü yerleri `[EKRAN: …]` placeholder ile işaretlendi.

## Doğrulama yöntemi

- HTML sabit etiketler: `index.html`, `driver/index.html`, `driver/dashboard.html`, `admin/driver-report.html`.
- Davranış ve metinler: `script-core.js` (PWA, roller), `tasitlar.js` (olay menüsü, satış, km, belgeler), `driver-dashboard-core.js` (sürücü aksiyonları), `notifications.js` (aylık özet başlığı, WA), `raporlar.js` (detay sütunları), `kayit.js` (kayıt formu), `data-manager.js` (rol yönlendirme), `core.php` (yetki iskeleti).

Otomatik UI testi veya canlı ekran kaydı bu görevde çalıştırılmadı; metinler statik kod incelemesine dayanır.

## UI belirsizlikleri ve [DOĞRULANACAK] maddeler

| Konu | Gözlem |
|------|--------|
| **Ay özeti adlandırma** | Header düğmesi **Bu Ay Yapılacaklar**; modal başlığı **`{Ay} Ayı Özet`**. Kullanıcıya aynı ekran için iki ad kullanılıyor. |
| **Sürat takibi** | Kodda “sürat” / “hız takip” metni yok. En yakın karşılık **Arvento** (`takip` olayı) ve rapor **Takip** sütunu. |
| **Yetki belgesi** | Kullanıcı dili “yetki belgesi” olabilir; UI **K2 Taşıt Belgesi** / **K2 Belgesi**. |
| **Şifremi unuttum (sürücü)** | Düğme var; tam kullanıcı mesajları `driver_password_reset_request.php` akışında — canlı metin doğrulanmadı. |
| **Km onay akışı** | Sürücü **Bekleniyor** göstergesi var; yönetici onay ekranının tek adım listesi admin PHP/JS’de dağınık — operasyon adımları ekran fotoğrafı ile netleştirilmeli. |
| **Admin panele giriş** | Doğrudan URL + bildirimden `open-driver-report`; ana menüde ayrı “Admin” düğmesi yok. |
| **iOS PWA yükle** | Yalnız Safari ana ekran adımı; uygulama içi **Uygulamayı Yükle** iOS’ta genelde görünmez. |
| **Aylık KM rozet tooltipleri** | `admin-report.js` içinde `title` / `aria-label` dinamik; lejantta tam metinler ekrandan doğrulanmalı. |
| **K2 grup üyeliği UI** | `ayarlar.js` — genel yönetici grup checkbox’ları; adım adım metin karmaşık, fotoğraf önerilir. |

## Kapsam dışı (bilerek yazılmadı)

- `data/data.json` içeriği ve gerçek plaka/kullanıcı örnekleri.
- Deploy, FTP, cPanel.
- Sunucu dışı entegrasyonlar (e-posta SMTP metni vb.).

## Sonraki adım önerisi (ürün sahibi)

1. `[EKRAN: …]` placeholder’larına canlı ortamdan ekran görüntüsü eklemek.  
2. Belirsizlik tablosundaki maddeleri tek oturumda UI walkthrough ile kapatmak.  
3. İsteğe bağlı: “sürat takibi” için işletme dilinde Arvento eşlemesini onboarding slaytına taşımak.
