# K2 Belgesi, Taşıt Kartı ve Takograf Geliştirici Raporu

## Kapsam

Bu fazda K2 Belgesi merkezi şirket belgesi olarak, Taşıt Kartı taşıt bazlı belge olarak, Takograf Kalibrasyonu ise sadece motorlu büyük ticari taşıtlarda taşıt bazlı süre/belge olarak ele alınır.

K1/K2 seçimi yapılmaz. Bu işletme kendi malını taşıdığı için ilgili ticari taşıtlarda varsayılan belge tipi K2 kabul edilir.

## Taşıt Tipi Kuralları

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

Taşıt bazlı yeni alanlar:

- `tasitKartiPath`
- `takografBelgesiPath`
- `takografKalibrasyonDate`
- `takografExpiryDate`
- `takografServis`

Takograf bitiş tarihi kalibrasyon tarihinden itibaren 2 yıl sonrasına otomatik hesaplanır.

## Ekran Davranışları

Yeni kayıt sırasında taşıt tipi zorunludur. Küçük ticari, büyük ticari veya römork seçilip merkezi K2 geçerlilik tarihi daha önce girilmemişse K2 Belgesi Geçerlilik tarihi sorulur.

Taşıt detayında ilgili taşıt tipine göre K2 Belgesi Geçerlilik, Taşıt Kartı ve Takograf Kalibrasyon Bitiş alanları gösterilir.

Taşıt tipi değiştirildiğinde kapsam dışı kalan alanlar kayıt öncesinde temizlenir. Örneğin Büyük Ticari seçilmişken takograf tarihi girildikten sonra taşıt Küçük Ticari, Otomobil veya Römork olarak değiştirilirse `takografKalibrasyonDate`, `takografExpiryDate`, `takografBelgesiPath` ve `takografServis` alanları boş değere çekilir. Aynı temizlik taşıt detayındaki taşıt tipi picker akışında da uygulanır. Bu temizlik sadece taşıt bazlı alanlar içindir; merkezi K2 belgesi tek bir taşıtın tip değişiminde silinmez.

Belgeler modalında:

- Her taşıtta Ruhsat, Sigorta Poliçesi, Kasko Poliçesi kalır.
- Küçük ticari, büyük ticari ve römorkta K2 Belgesi ve Taşıt Kartı eklenir.
- Sadece büyük ticaride Takograf Belgesi eklenir.

Olay Ekle menüsünde:

- K2 kapsamındaki taşıtlarda `K2 Belgesi Bilgisi Güncelle` görünür.
- Sadece büyük ticaride `Takograf Kalibrasyon Güncelle` görünür.

Kullanıcı paneli belgeler modalı da aynı taşıt tipi kurallarına göre ek belgeleri görüntüler.

## Bildirim ve Aylık İşler

K2 Belgesi geçerlilik tarihi merkezi olduğu için bildirim/aylık iş listesinde ilk uygun K2 kapsamındaki taşıt üzerinden tek görev olarak temsil edilir.

Takograf kalibrasyon bitiş tarihi büyük ticari taşıtlarda normal tarih uyarı sistemine dahil edilir.

Taşıt satıldığında, silindiğinde veya pasif/arşiv statüsüne alındığında bu taşıt tarih taramalarında kapsam dışı kalır. Kod tarafında `satildiMi`, `arsiv`, `pasif`, `aktif === false`, `aktifMi === false` ve `durum === "pasif"` durumları aktif bildirim/aylık iş listesi için operasyon dışı kabul edilir. Böylece satılmış ya da pasif büyük ticari taşıtlar takograf kalibrasyon uyarısı üretmeye devam etmez. Aynı akışta taşıt bazlı `tasitKartiPath` ve `takograf*` alanları aktif bildirim/aylık iş listesi için yok sayılır; taşıt tamamen silindiyse bu bağlantılar da veri kaydıyla birlikte düşer.

## Belge Upload — Tarih Bağlantısı (2026-06)

Taşıt Detay → Belgeler üzerinden Sigorta/Kasko/Takograf PDF yüklerken opsiyonel tarih girişi eklendi. Ortak JS owner (`getPolicyOperationDateFieldHtml`, `validatePolicyDocumentOperationDate`), PHP mutation (`upload_ruhsat.php` → `documentOperationDate`) ve UI/CSS detayları ayrı raporda:

→ [`belge-yukleme-tarih-baglantisi-gelistirici-raporu.md`](belge-yukleme-tarih-baglantisi-gelistirici-raporu.md)

Özet:

- Sigorta/Kasko: opsiyonel **Başlangıç Tarihi** → doluysa `sigortaDate` / `kaskoDate` (+1 yıl bitiş)
- Takograf (büyük ticari): opsiyonel **Kalibrasyon Tarihi** → doluysa `takografKalibrasyonDate` / `takografExpiryDate` (+2 yıl)
- Taşıt Kartı upload: kullanıcı tarih alanı yok; K2 merkezi geçerlilik kontrolü devam eder

## Faz Dışı Bırakılanlar

- Yangın tüpü ve zorunlu ekipman takipleri
- SRC / psikoteknik / personel belgeleri
- K1 seçimi veya K1/K2 ayrımı
- Römorkta takograf ve kilometre takibi
