# MEDISA Taşıt Yönetimi — Geliştirici Gerçeklik Raporu

Bu belge repo içindeki mevcut durumu konuşma geçmişinden ayırmak için tutulur. Amaç, “konuşuldu”, “denendi”, “committe var” ayrımını sabit tutmaktır.

## Bugün Committe Olan Çerçeve
- Ana SPA ile Admin Reports ayrı yüzeylerdir.
  - Ana SPA Raporlar: `index.html` içindeki `#reports-modal` + `raporlar.js`
  - Admin Reports: `admin/driver-report.html` ve `admin/` altı PHP/JS akışı
- Ana SPA artık oturumlu çalışır.
  - `load.php` ve `save.php` bearer token ister.
  - Ana SPA token yoksa `driver/` giriş ekranına yönlenir.
- Portal ve ana uygulama aynı imzalı oturum token'ını paylaşır.
  - Token üretimi ve doğrulaması `core.php` içindedir.
  - `driver-script.js` oturumun dashboard mu ana uygulama mı açacağını token payload'ından çözer.

## Rol ve Görünürlük Gerçeği
- Hedef görünürlük kuralı kodda uygulanmıştır:
  - `genel_yonetici`: mevcut görünümün tamamı
  - `sube_yonetici`: yalnız kendi `branchIds/sube_ids` kapsamı
  - `kullanici`: ana SPA yerine kullanıcı paneli/dashboard akışı
- İstemci tarafındaki görünürlük yardımcıları `data-manager.js` içindedir:
  - `getVisibleBranches`
  - `getVisibleVehicles`
  - `getVisibleUsers`
  - `getVisibleEvents`
- Sunucu tarafında `load.php` filtreli veri döndürür; `save.php` ise görünmeyen datayı koruyup yalnız yetkili scope'u merge eder.

## Terminoloji Gerçeği
- Hedef ürün dili `kullanici paneli`dir.
- Geçiş uyumluluğu korunur:
  - yeni alan: `kullanici_paneli`
  - eski okuma uyumu: `surucu_paneli`
- Kullanıcı formu ve login cevabı yeni adı üretir; eski alan okunmaya devam eder.

## Raporlar Yüzeyi Gerçeği
- Ana SPA Raporlar modalında iki sekme vardır:
  - `Taşıt`
  - `Kullanıcı`
- `raporlar.js` içindeki kullanıcı görünümü artık HTML tarafında da bağlıdır.
- Admin Reports bu akıştan bağımsız kalır; ana SPA Raporlar'ın devamı değildir.

## Bilinçli Olarak Hâlâ Bitmemiş Konular
- `admin/` altındaki rapor ve onay uçları bu çalışmada rol/token sertleştirmesi almadı.
- `restore.php`, `upload_ruhsat.php` gibi yan uçlar bu çalışmanın güvenlik kapsamına dahil edilmedi.
- Audit log, aktif şube UX ve tam sunucu tarafı modül bazlı yetki matrisi ayrı fazdır.

## Bu Belge Ne İçin Var?
- Repo içindeki gerçeği konuşma geçmişinden ayırmak için
- Yeni görevlerde “şu an gerçekten ne var?” sorusuna tek yerden cevap vermek için
- Cursor/Codex bağlam kaydırdığında geri dönülecek çıpayı sabit tutmak için
