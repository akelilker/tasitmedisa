# Manuel smoke checklist (MEDISA Taşıt)

Deploy veya büyük değişiklikten önce hızlı regresyon kontrolü. Otomasyon yok; tarayıcıda elle işaretle.

**Ortam:** PHP + Apache ile ana dizin (`index.html` ile aynı kök). Yerel örnek: `http://localhost:8080/` veya vhost. Admin için: `.../admin/driver-report.html`.

---

## 1. Ana menü

- [ ] Sayfa açılıyor; splash kapanıyor (veya kapanma davranışı beklenen).
- [ ] Hero, logo, alt çizgi (`animated-line`) görünür.
- [ ] Ana menü: **KAYIT İŞLEMLERİ**, **TAŞITLAR**, **RAPORLAR** butonları tıklanabilir.
- [ ] Footer / sürüm satırı görünür (ortamına göre).

---

## 2. Kayıt (KAYIT İŞLEMLERİ)

- [ ] Modal açılıyor; kapatma çalışıyor.
- [ ] Form alanları görünür; taşıt tipi / plaka vb. etkileşim bozulmamış.
- [ ] İptal / akış beklenen şekilde.

---

## 3. Taşıtlar

- [ ] Taşıtlar listesi veya boş durum görünür.
- [ ] Taşıt detayı açılıyor (varsa veri ile).
- [ ] Geri / kapatma ve scroll kabul edilebilir.

---

## 4. Raporlar

- [ ] Raporlar modalı açılıyor.
- [ ] Stok / rapor görünümleri yükleniyor (veri varsa).

---

## 5. Ayarlar (diş menü)

- [ ] Ayarlar menüsünden en az bir akış: şube veya kullanıcı veya veri yedekleme modalı açılıyor.
- [ ] Modal kapanıyor; ana ekrana dönüş bozulmuyor.

---

## 6. Admin rapor

- [ ] `admin/driver-report.html` açılıyor.
- [ ] Sekmeler (ör. aylık / kullanıcı) tıklanabiliyor; kritik alanlar hata vermiyor.

---

## 7. Yazdırma

- [ ] Taşıt tarafında yazdırma akışı (ör. ruhsat / kart) tetikleniyor; tarayıcı yazdırma penceresi veya önizleme açılıyor.
- [ ] (İsteğe bağlı) Mobil veya PWA’da bir tur denendi.

---

## Not

Bu liste **davranış doğrulaması** içindir; `php -l` / `node --check` gibi statik kontroller GitHub Actions PR workflow’unda çalışır.
