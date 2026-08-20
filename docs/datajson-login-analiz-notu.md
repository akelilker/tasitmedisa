# Data.json Güncelleme ve Login Hatası – Teknik Değerlendirme Notu

Bu not, mevcut **Geliştirici Raporu**nu proje koduna göre doğrulamak ve aksiyonları netleştirmek için hazırlanmıştır.

## 1) Raporun doğru tespitleri

- `brandModel` alanı, giriş (login) doğrulamasında kullanılmıyor.
- Login akışı `users` koleksiyonu üzerinden `kullanici_adi` + `sifre`/`sifre_hash` ile çalışıyor.
- Bu nedenle sadece `tasitlar[].brandModel` güncellemesi tek başına login’i bozmamalı.

Kod referansı:
- Login endpoint’i `driver/driver_login.php` içinde kullanıcıyı `users` içinden bulur ve şifre doğrular.
- Şifre doğrulama `core.php` içindeki `medisaVerifyUserPassword` ile yapılır.

## 2) Muhtemel kök nedenlerin önceliklendirilmiş listesi

### P1 (en olası): JSON parse edilemiyor

`core.php -> loadData()` içinde `json_decode` hatası olursa `null` döner. Bu durumda login dahil veri erişimi gerektiren işlemler bozulur.

### P2: `users` yapısı korunmadı / anahtar isimleri değişti

Login tarafı aşağıdaki alanları bekler:
- kullanıcı adı: `kullanici_adi` (veya fallback alias’lar)
- şifre: `sifre` veya `sifre_hash`

Bu alanlar silinmiş/boşaltılmışsa login başarısız olur.

### P3: Yanlış dosya hedefi

Uygulama veri kaynağı **tekil olarak** `data/data.json` dosyasını okuyor (`getDataFilePath`).
Yani farklı bir konuma yükleme yapıldıysa uygulama onu kullanmaz.

### P4: Cache/session

Client token/session kaynaklı sorunlar olabilir; fakat “şifre kabul etmiyor” semptomunda sunucu tarafı veri/format bozulması genelde daha yüksek olasılıktır.

## 3) Hızlı doğrulama checklist’i (production öncesi)

1. `data/data.json` dosyasını UTF-8 (BOM’suz) formatta tut.
2. Sunucuda `php -r '$j=file_get_contents("data/data.json"); json_decode($j,true); echo json_last_error_msg(),PHP_EOL;'` çalıştır.
3. En az bir aktif kullanıcı için şu alanları doğrula:
   - `kullanici_adi`
   - `sifre` veya `sifre_hash`
   - `aktif` (pasif olmamalı)
4. Dosya yolunun gerçekten `data/data.json` olduğunu doğrula.
5. Başarısız girişte dönen API mesajını kontrol et (`Kullanıcı adı hatalı`, `Şifre hatalı`, `Şifre tanımlı değil` vb.).

## 4) Güvenli güncelleme önerisi

Toplu overwrite yerine kontrollü patch yaklaşımı uygulanmalı:

- Yalnızca `tasitlar[].brandModel` alanlarını güncelle.
- `users`, `branches`, `arac_aylik_hareketler` ve diğer koleksiyonlara dokunma.
- Deploy öncesi otomatik JSON parse kontrolü + zorunlu anahtar kontrolü çalıştır.
- Gerekirse önce staging’de login smoke test yapıp sonra production’a al.

## 5) Sonuç

Mevcut raporun ana yargısı teknik olarak doğru:

- `brandModel` standardizasyonu tek başına login’i bozmaz.
- Sorun büyük olasılıkla veri dosyasının yüklenme/formatlanma sürecinde oluşur.

Bu yüzden operasyonel olarak en güvenli akış:

1. Çalışan veriyle rollback doğrulaması
2. Kontrollü patch ile yeniden güncelleme
3. Login + temel ekran smoke test
