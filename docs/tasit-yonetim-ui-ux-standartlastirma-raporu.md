# TAŞIT YÖNETİM SİSTEMİ

## UI / UX Standartlaştırma Çalışması – Durum ve Yol Haritası

## 1. Çalışmanın Amacı

Taşıt Yönetim Sistemi uzun süredir aktif olarak geliştirilmektedir. Zaman içerisinde farklı modüller, farklı dönemlerde ve farklı ihtiyaçlarla geliştirildiği için özellikle modal ekranlarda navigasyon, geri dönüş alanları, başlık yapıları ve üst bölüm yerleşimleri arasında görsel tutarsızlıklar oluşmuştur.

Bu çalışmanın amaçları şunlardır:

- Kullanıcının ekranlar arasında kaybolmasını önlemek,
- Modal navigasyonlarını standartlaştırmak,
- Aynı görevi yapan ekranların aynı görsel dili kullanmasını sağlamak,
- Gelecekte yapılacak geliştirmelerde yeni tutarsızlıkların oluşmasını engellemek,
- Mevcut yapıyı bozmadan teknik borcu azaltmak.

Çalışma boyunca temel prensip, mevcut yapıyı koruyarak düzeltme yapmak olmuş; yeni sistemler veya büyük refactor işlemlerinden özellikle kaçınılmıştır.

---

## 2. Başlangıçta Tespit Edilen Sorunlar

### 2.1. Geri Butonları ve Navigasyon Alanları

Aynı uygulama içerisinde geri alanları ekranlara göre farklılık göstermekteydi:

- Farklı boyutlar,
- Farklı renkler,
- Farklı boşluklar,
- Farklı ikon ölçüleri.

Özellikle aşağıdaki ekran aileleri birbirinden farklı davranıyordu:

- Ayarlar modülleri,
- Taşıt detay ekranları,
- Olay ekranları,
- Tarihçe ekranları.

### 2.2. CSS Override Birikimi

Yıllar içinde yapılan küçük düzeltmeler sonucunda aşağıdaki dosyalarda aynı bileşenler için çok sayıda tekrar eden kural oluşmuştu:

- `style-core.css`
- `tasitlar-base.css`
- `tasitlar-extra.css`
- `ayarlar.css`

Bu nedenle bir ekran düzeltilirken başka bir ekranın bozulması riski oluşuyordu.

### 2.3. Taşıt Modüllerinde Görsel Karmaşa

Taşıtlar tarafında özellikle aşağıdaki alanlar üst üste binmiş hissi oluşturuyordu:

- Başlık,
- Toolbar,
- Plaka alanı,
- Marka/model alanı,
- Tablo başlığı,
- Olay ve tarihçe bağlam alanları.

Ekranlar teknik olarak çalışsa da kullanıcı açısından görsel olarak yoğun ve yorucu görünüyordu.

---

## 3. Yapılan Çalışmalar

### 3.1. Faz 1 – Geri Navigasyon Standardizasyonu

Ortak geri navigasyon sistemi esas alındı.

Amaç, tüm ilgili ekranlarda aşağıdaki özelliklerin ortaklaştırılmasıydı:

- Aynı ikon ölçüsü,
- Aynı etiket boyutu,
- Aynı boşluklar,
- Aynı davranış.

Bu aşamada:

- Gereksiz CSS override’ları kaldırıldı,
- Tekrarlayan ikon tanımları temizlendi,
- Farklı font boyutları standartlaştırıldı,
- Mobil ve masaüstü davranışları hizalandı.

**Sonuç:** Ayarlar modüllerinde büyük ölçüde görsel bütünlük sağlandı.

### 3.2. Faz 2 – Layout Kontratı

Modal ekranlar üç kategoriye ayrıldı:

#### Standalone

Bağımsız yönetim ekranları için kullanılır.

Örnekler:

- Ayarlar,
- Şube Yönetimi,
- Kullanıcı Yönetimi.

#### Toolbar

Toolbar içinde navigasyon veya aksiyon barındıran ekranlar için kullanılır.

Örnekler:

- Taşıt listeleri,
- Taşıt detay ekranı.

#### Context

Navigasyonla birlikte taşıt bağlamının gösterildiği ekranlar için kullanılır.

Örnekler:

- Olay ekranları,
- Tarihçe ekranları,
- Belge ekranları.

Bu sınıflandırma sayesinde her ekranın hangi yerleşim tipine ait olduğu netleştirildi.

### 3.3. Faz 3 – Taşıt Detay Teknik Borç Temizliği

Kod incelemelerinde aşağıdaki geçici hizalama yapıları tespit edildi:

- `margin-top: -20px`,
- `margin-top: -16px`,
- Padding telafileri,
- 24px toolbar yüksekliği.

Bu yapılar geçmişte oluşan hizalama problemlerini gizlemek amacıyla kullanılmıştı.

Yapılan düzenlemeler:

- Negatif marginler kaldırıldı,
- Toolbar yüksekliği standartlaştırıldı,
- İçerik alanları sadeleştirildi,
- Mobil touch target uyumu sağlandı.

**Sonuç:** Plaka alanının toolbar üzerine binmesi engellendi ve detay ekranı daha sağlıklı hale getirildi.

---

## 4. Başarısız Denemeler ve Öğrenilenler

Çalışma sırasında aşağıdaki yaklaşımlar test edildi:

- Geri etiketlerinin değiştirilmesi,
- Parent ekran isimlerinin değiştirilmesi,
- “Şube Seçimi” yaklaşımının kullanılması,
- Tüm taşıt ekranlarında “Geri” etiketine geçilmesi,
- Geri etiketlerinin tekrar eski yapıya döndürülmesi,
- Farklı navigasyon metinlerinin test edilmesi.

### Sonuç

Bu değişikliklerin hiçbiri kullanıcı algısında anlamlı bir iyileşme sağlamadı.

### Çıkarım

Problemin temel nedeni geri butonu metinleri değildir.

Yapılan testler sonucunda kullanıcı tarafından hissedilen görsel karmaşanın aşağıdaki konulardan kaynaklandığı anlaşıldı:

- Bilgi mimarisi,
- Görsel hiyerarşi,
- Header altındaki katman yoğunluğu,
- Navigasyon ve bağlam bilgilerinin aynı alanda rekabet etmesi.

Bu tespit, ileride aynı metin ve etiket denemelerinin tekrar edilmesini önlemesi açısından önemlidir.

---

## 5. Bugün Gelinen Nokta

### 5.1. Tamamlanan Konular

#### Ayarlar Modülleri

**Durum:** Büyük ölçüde tamamlandı.

- Görsel bütünlük sağlandı,
- Navigasyon yapısı oturdu,
- Geri alanları standartlaştı.

#### Geri Navigasyon Sistemi

**Durum:** Büyük ölçüde tamamlandı.

- Ortak davranış elde edildi,
- Tekrarlayan CSS yapıları azaltıldı.

#### Taşıt Detay Teknik Borcu

**Durum:** Temizlendi.

- Negatif marginler kaldırıldı,
- Toolbar kontratı iyileştirildi.

### 5.2. Taşıt Detay Ekranı İçin Güncel Not

Taşıt detay ekranı mevcut durumda taşıt ailesinin en olgun ve en stabil ekranıdır. Bu nedenle **geçici referans ekran** olarak kullanılabilir. Ancak taşıt ailesi için nihai UX modeli henüz kesinleşmediğinden kalıcı referans ekran olarak kabul edilmemelidir.

Yapılan teknik borç temizliği sonrası taşıt detay ekranı önemli ölçüde iyileşmiştir. Ancak tarihçe, olay ve belge ekranlarında yapılacak UX çalışmaları sonucunda daha başarılı bir üst bölüm modeli ortaya çıkabilir. Böyle bir durumda elde edilen model taşıt detay ekranına da geri taşınabilir.

### 5.3. Devam Eden Konular

#### Taşıt Liste Ekranı

Taşıt liste ekranında hâlen aşağıdaki üç katmanlı üst bölge bulunmaktadır:

```text
Header
→ Toolbar
→ Tablo Başlığı
```

Bu yapı teknik olarak çalışmaktadır ancak görsel olarak yoğun görünmektedir.

#### Olay ve Tarihçe Ekranları

Geri navigasyonu ile taşıt kimlik bilgileri aynı bölgede yer almaktadır.

Bu durum aşağıdaki iki bilginin aynı alanda rekabet etmesine neden olmaktadır:

- Navigasyon bilgisi,
- Taşıt bağlam bilgisi.

#### Taşıt Ailesi İçin Ortak UX Dili

Teknik standartlar büyük ölçüde oluşturulmuş olsa da aşağıdaki ekranların tamamında aynı UX dili henüz oluşmuş değildir:

- Liste,
- Detay,
- Olay,
- Tarihçe,
- Belgeler.

Bu çalışma devam etmektedir.

---

## 6. Güncel Teşhis

Çalışmanın mevcut aşamasında sorun artık teknik bir CSS problemi olarak değerlendirilmemektedir.

Yapılan testler sonucunda aşağıdaki alanlarda gerçekleştirilen değişikliklerin kullanıcı deneyiminde beklenen iyileşmeyi sağlamadığı görülmüştür:

- Font boyutları,
- İkon ölçüleri,
- Geri etiketleri,
- Boşluklar,
- Navigasyon metinleri.

Bu nedenle kalan çalışmaların odağı teknik standardizasyon değil, **bilgi mimarisi ve görsel hiyerarşi** olacaktır.

Mevcut sorun aşağıdaki sorular üzerinden değerlendirilmelidir:

1. Kullanıcı hangi ekranda?
2. Kullanıcı nereden geldi?
3. Kullanıcı nereye dönebilir?
4. Kullanıcı hangi taşıt üzerinde işlem yapıyor?
5. Ekrandaki ana görev nedir?

Taşıt ailesindeki her ekran bu sorulara aynı görsel öncelik sırasıyla cevap verdiğinde ortak UX dili oluşacaktır.

---

## 7. Güncellenmiş Öncelik Sırası ve Yol Haritası

### Öncelik 1 – Tarihçe Ekranında UX Prototipi Hazırlanması

Tarihçe ekranında aşağıdaki alanlar arasındaki ilişki yeniden değerlendirilecektir:

- Navigasyon alanı,
- Taşıt kimlik alanı,
- Sekme alanı.

**Gerekçe:** Tarihçe ekranı, taşıt ailesindeki en yoğun üst bölüme sahip ekranlardan biridir. Yapılacak değişikliklerin etkisi bu ekranda daha net gözlemlenebilir.

Prototipte değerlendirilecek temel yaklaşım:

```text
Modal Başlığı
→ Geri Navigasyon Alanı
→ Taşıt Kimlik Alanı
→ Sekmeler
→ İçerik
```

Prototip, mevcut modal yapısını bozmadan ve büyük refactor gerçekleştirmeden hazırlanmalıdır.

### Öncelik 2 – Tarihçe Prototipinin Değerlendirilmesi

Hazırlanan prototip aşağıdaki başlıklar altında değerlendirilecektir:

- Mobil kullanılabilirlik,
- Bilgi okunabilirliği,
- Dikey alan kullanımı,
- Navigasyon netliği,
- Taşıt bağlamının algılanabilirliği.

Özellikle mobil cihazlarda aşağıdaki sorulara cevap aranacaktır:

- Geri butonu rahatça algılanabiliyor ve kullanılabiliyor mu?
- Plaka bilgisi kolayca fark ediliyor mu?
- Marka/model bilgisi gereğinden fazla görsel ağırlık taşıyor mu?
- Sekmeler gereğinden fazla aşağı itiliyor mu?
- Üst bölüm içerik alanını aşırı daraltıyor mu?

### Öncelik 3 – Başarılı Modelin Diğer Ekranlara Uygulanmasının Değerlendirilmesi

Tarihçe ekranındaki prototip başarılı olursa aynı modelin aşağıdaki ekranlara uygulanması değerlendirilecektir:

- Olay ekranları,
- Belge ekranları,
- Gerekirse taşıt detay ekranı.

Bu aşamada taşıt detay ekranının geçici referans niteliği yeniden değerlendirilecek; prototip daha başarılı bir üst bölüm modeli ortaya koyarsa bu model detay ekranına geri taşınabilecektir.

### Öncelik 4 – Taşıt Liste Ekranının Görsel Hiyerarşisinin Sadeleştirilmesi

Taşıt liste ekranındaki toolbar ve tablo başlığı ilişkisi, context ekranlarındaki model doğrulandıktan sonra ele alınacaktır.

Amaç toolbar’ı tamamen değiştirmek değil, toolbar ile tablo başlığı arasındaki görsel rekabeti azaltmaktır.

Değerlendirilebilecek küçük ve kontrollü müdahaleler:

- Toolbar ile tablo başlığı arasındaki görsel geçişin yumuşatılması,
- Tablo başlığının border ve shadow ağırlığının azaltılması,
- Toolbar ikonlarının görsel ritminin dengelenmesi,
- Header, toolbar ve tablo başlığının aynı görsel ağırlıkta görünmesinin engellenmesi,
- Liste başlığının “kolon rehberi”, toolbar’ın ise “aksiyon alanı” olarak daha net algılanması.

---

## 8. Uygulama Prensipleri

Sonraki çalışmalar sırasında aşağıdaki sınırlar korunacaktır:

- Global geri navigasyon sistemi korunacak,
- Standalone, Toolbar ve Context ayrımı korunacak,
- Büyük refactor yapılmayacak,
- Yeni component sistemi kurulmayacak,
- Mevcut modal sistemi bozulmayacak,
- JavaScript render akışına minimum düzeyde müdahale edilecek,
- Mobil ve masaüstü davranışları ayrı ayrı değerlendirilecek,
- İlk değişiklik küçük, izole ve geri alınabilir olacak.

---

## 9. Sonuç

Çalışmanın ilk amacı olan teknik borç temizliği büyük ölçüde başarıyla tamamlanmıştır.

- Ayarlar tarafındaki tutarsızlıklar önemli ölçüde giderilmiştir,
- Geri navigasyon sistemi büyük ölçüde standartlaştırılmıştır,
- Taşıt detay ekranındaki eski hizalama hackleri kaldırılmıştır,
- Taşıt detay ekranı daha stabil hale getirilmiştir.

Bu çalışma sürecindeki en önemli kazanımlardan biri, problemin kaynağının doğru tespit edilmiş olmasıdır.

Başlangıçta sorunların geri butonları, etiket metinleri veya CSS tutarsızlıklarından kaynaklandığı düşünülmüş; ancak yapılan testler bunun doğru olmadığını göstermiştir.

Gelinen noktada kullanıcı tarafından hissedilen görsel karmaşanın temel nedeninin **bilgi mimarisi ve görsel hiyerarşi** olduğu anlaşılmıştır.

Bu nedenle sonraki çalışmaların odağı teknik düzeltmeler değil, kullanıcı deneyimi tasarımı olacaktır.

Bir sonraki somut adım, tarihçe ekranında düşük kapsamlı bir UX prototipi hazırlamak ve bu prototipi özellikle mobil kullanılabilirlik açısından değerlendirmektir. Prototip başarılı olursa aynı yaklaşım olay ve belge ekranlarına; gerekli görülürse taşıt detay ekranına uygulanacaktır.
