# K2 Belgesi, Taşıt Kartı ve Takograf Geliştirici Raporu

## Kapsam

Bu fazda K2 Belgesi merkezi şirket belgesi olarak, Taşıt Kartı araç bazlı belge olarak, Takograf Kalibrasyonu ise sadece motorlu büyük ticari araçlarda araç bazlı süre/belge olarak ele alınır.

K1/K2 seçimi yapılmaz. Bu işletme kendi malını taşıdığı için ilgili ticari taşıtlarda varsayılan belge tipi K2 kabul edilir.

## Araç Tipi Kuralları

| Taşıt tipi | K2 Belgesi | Taşıt Kartı | Takograf |
| --- | --- | --- | --- |
| Otomobil | Yok | Yok | Yok |
| Küçük Ticari | Var | Var | Yok |
| Büyük Ticari | Var | Var | Var |
| Römork | Var | Var | Yok |

Römork çekilen taşıt olduğu için kilometre sayacı ve takograf kalibrasyonu kapsamına alınmaz.

## Veri Modeli

K2 Belgesi merkezi tutulur:

- `appData.ayarlar.k2Belgesi.expiryDate`
- `appData.ayarlar.k2Belgesi.documentPath`
- `appData.ayarlar.k2Belgesi.updatedAt`

Araç bazlı yeni alanlar:

- `tasitKartiPath`
- `takografBelgesiPath`
- `takografKalibrasyonDate`
- `takografExpiryDate`
- `takografServis`

Takograf bitiş tarihi kalibrasyon tarihinden itibaren 2 yıl sonrasına otomatik hesaplanır.

## Ekran Davranışları

Yeni kayıt sırasında taşıt tipi zorunludur. Küçük ticari, büyük ticari veya römork seçilip merkezi K2 geçerlilik tarihi daha önce girilmemişse K2 Belgesi Geçerlilik tarihi sorulur.

Taşıt detayında ilgili araç tipine göre K2 Belgesi Geçerlilik, Taşıt Kartı ve Takograf Kalibrasyon Bitiş alanları gösterilir.

Taşıt tipi değiştirildiğinde kapsam dışı kalan alanlar kayıt öncesinde temizlenmelidir. Örneğin Büyük Ticari seçilmişken takograf tarihi girildikten sonra araç Küçük Ticari, Otomobil veya Römork olarak değiştirilirse `takografKalibrasyonDate`, `takografExpiryDate`, `takografBelgesiPath` ve `takografServis` alanları `null`/boş değere çekilmelidir. Bu temizlik sadece araç bazlı alanlar içindir; merkezi K2 belgesi tek bir aracın tip değişiminde silinmez.

Belgeler modalında:

- Her araçta Ruhsat, Sigorta Poliçesi, Kasko Poliçesi kalır.
- Küçük ticari, büyük ticari ve römorkta K2 Belgesi ve Taşıt Kartı eklenir.
- Sadece büyük ticaride Takograf Belgesi eklenir.

Olay Ekle menüsünde:

- K2 kapsamındaki araçlarda `K2 Belgesi Bilgisi Güncelle` görünür.
- Sadece büyük ticaride `Takograf Kalibrasyon Güncelle` görünür.

Kullanıcı paneli belgeler modalı da aynı araç tipi kurallarına göre ek belgeleri görüntüler.

## Bildirim ve Aylık İşler

K2 Belgesi geçerlilik tarihi merkezi olduğu için bildirim/aylık iş listesinde ilk uygun K2 kapsamındaki araç üzerinden tek görev olarak temsil edilir.

Takograf kalibrasyon bitiş tarihi büyük ticari araçlarda normal tarih uyarı sistemine dahil edilir.

Taşıt satıldığında, silindiğinde veya pasif/arşiv statüsüne alındığında bu araç tarih taramalarında kapsam dışı kalmalıdır. Böylece satılmış ya da pasif büyük ticari araçlar takograf kalibrasyon uyarısı üretmeye devam etmez. Aynı akışta araç bazlı `tasitKartiPath` ve `takograf*` alanları aktif bildirim/aylık iş listesi için yok sayılmalı; araç tamamen silindiyse bu bağlantılar da veri kaydıyla birlikte düşmelidir.

## Faz Dışı Bırakılanlar

- Yangın tüpü ve zorunlu ekipman takipleri
- SRC / psikoteknik / personel belgeleri
- K1 seçimi veya K1/K2 ayrımı
- Römorkta takograf ve kilometre takibi
