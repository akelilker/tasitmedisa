# Olay Ekle Revizyonu – Geliştirici Raporu

## 1. Amaç

Olay Ekle ekranını kategori bazlı hale getirmek ve araç bazlı süreli işlemleri aynı mantık altında toplamak.

## 2. Tamamlanan Çalışmalar

Faz 1 Analiz, Faz 2 Kategori Sistemi ve Faz 3 Taşıt Kartı Güncelle çalışmaları tamamlandı.

Olay Ekle akışı mevcut dinamik olay modalı ve kayıt altyapısı korunarak yeniden düzenlendi. Menü artık önce kategori seçtirir, ardından seçilen kategori altındaki olayları gösterir.

## 3. Mevcut Nihai Yapı

Olay Ekle menüsünde aşağıdaki kategoriler aktif durumdadır:

| Kategori | Kapsam |
| --- | --- |
| Araç Süreli İşlemleri | Muayene, Takograf Kalibrasyon, Taşıt Kartı |
| Poliçe İşlemleri | Sigorta, Kasko |
| Araç Üzeri / Donanım | Taşıt takip cihazı, UTTS, yedek anahtar, lastik, hak mahrumiyeti, kasko kodu |
| Operasyon / Genel | Trafik cezası, kilometre, bakım, kaza, şube, kullanıcı atama, satış/pert |

Takograf ve Taşıt Kartı seçenekleri taşıt tipi kurallarına göre görünür. Takograf sadece büyük ticari/kamyon kapsamındaki araçlarda, Taşıt Kartı ise K2 kapsamındaki araçlarda kullanılır.

## 4. Korunan Kurallar ve Yapılmaması Gerekenler

- K2 şirket bazlı yapısı korunmuştur.
- Taşıt Kartı bitiş tarihi, şirket bazlı K2 belgesi geçerlilik tarihiyle mirror mantığında çalışmaya devam eder.
- Egzoz ayrı event yapılmamıştır; Muayene işlemi altında yönetilmeye devam eder.
- Mevcut event altyapısı korunmuştur; kategori menüsü yalnızca seçim deneyimini düzenler.
- K1/K2 ayrımı veya K2 belge tip seçimi eklenmemiştir.

## 5. Kalan Backlog

Aşağıdaki maddeler isteğe bağlı backlog olarak bırakılmıştır:

- Belgeler + Olay Ekle birleşimi.
- Kategoriye özel daha güçlü görsel ayrıştırma: mevcut yapıda ikon bazlı ayrım vardır; ileride renk/vurgu bazlı ayrım güçlendirilebilir.
- Etiket sadeleştirmesi.
- Olay metadata tanımlarının merkezileştirilmesi: ikon, etiket, kategori, başlık ve kayıt handler eşlemeleri ileride tek kaynak altında toplanabilir.

## 6. Teknik Borç

Kritik açık teknik borç bulunmamaktadır.

Düşük öncelikli bakım borcu olarak olay tanımları birden fazla yerde tutulmaktadır. Yeni olay tipi eklenirken ikon, kategori, başlık ve kayıt handler listelerinin birlikte güncellenmesi gerekir. Bu durum mevcut fonksiyonu bozmaz; yalnızca ileride merkezi metadata yapısı ile sadeleştirilebilir.

## 7. Sonuç

Olay Ekle çalışması fonksiyonel olarak tamamlanmış ve kapatılabilir durumdadır.

Kategori sistemi, K2 şirket bazlı yapı, Taşıt Kartı K2 mirror davranışı ve mevcut event altyapısı korunmuştur. Egzoz muayenesi ayrı olay oluşturulmadan Muayene işlemi altında yönetilmektedir. Belgeler entegrasyonu, kategoriye özel daha güçlü görsel ayrıştırma, etiket sadeleştirmesi ve olay metadata tanımlarının merkezileştirilmesi isteğe bağlı backlog olarak bırakılmıştır.

Manuel masaüstü ve mobil smoke test sonrasında çalışma kapatılabilir.
