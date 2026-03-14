# RAPORLAR Modalı – Mobil Düzeltme Talepleri

Bu belge, Mobil Özel Düzeltmeler Planına **ek** olarak RAPORLAR modalı için tespit edilen mobil düzeltme taleplerini içerir.

---

## 11. RAPORLAR Modal – Detay Ekleme Bloğu 36px Yukarı

**Sorun:** "Butonları bir bütün olarak düşünebilir ve yapısını hiç bozmayalım. Başka hiçbir yere dokunmadan, 36px yukarı al. Başka hiçbir yer değişmesin"

**Etkilenen dosya:** [raporlar.css](raporlar.css)

**Kapsam:** Detay Ekle/Ekleme metni + tüm buton satırları (Lastik D., Kullanıcı, Kasko Değeri, Muayene, Kaporta vb.) + filtre satırı (arama ikonu, X, yazdır, BAŞLANGIÇ T., BİTİŞ T.) — tek bir bütün olarak header’a doğru 36px yukarı taşınacak. İç yapı ve layout değişmeyecek.

**Mevcut yapı:**
- `#reports-modal .reports-list-header-actions` – padding 8px 4px (satır 156)
- `.stok-controls-row-1 .universal-back-bar` – margin-top: -20px (satır 193)
- `#stok-list-container .stok-list-top-controls > .stok-controls-row-2` – margin-top: 8px, padding-top: 14px (satır 1159)

**Öneri:** 
- `.reports-list-header-actions` veya `.stok-detail-add-wrap` için `margin-top: -36px` veya padding azaltma ile blok 36px yukarı alınacak
- Sadece bu blok etkilenecek; tablo, modal header, footer vb. değişmeyecek

---

## 12. RAPORLAR Modal – Başlık ile Tarih Alanı Çakışması

**Sorun:** "RAPORLAR" başlığı "BAŞLANGIÇ T." (Başlangıç Tarihi) input alanını kapatıyor/örtüyor. Başlık ile tarih alanı aynı alanda çakışıyor.

**Etkilenen dosyalar:** [raporlar.css](raporlar.css), [raporlar.js](raporlar.js)

**Mevcut yapı:**
- `#reports-modal .modal-header h2` – başlık ortada, position: relative
- `#reports-modal .modal-header` – height: 60px, flex center
- Tarih alanları `stok-controls-row-2` içinde, `.stok-date-range-controls` altında

**Öneri:**
- Header ile içerik arası yeterli boşluk bırakılacak VEYA
- Başlık veya tarih alanları konumlandırılacak (grid/flex düzenlemesi) ki üst üste binmesin
- Masaüstü ve mobil görünümde çakışma giderilecek

---

## Uygulama Durumu

- **11. RAPORLAR Detay Ekleme bloğu 36px yukarı:** `raporlar.css` içinde masaüstü (641px+) için `margin-top: -36px` uygulandı. Header 48px’e indirilerek çakışma azaltıldı.
- **12. RAPORLAR başlık–tarih çakışması:** Header 60px’ten 48px’e indirildi, padding/margin sadeleştirildi, overlap yaratan negatif margin kaldırıldı.

## Uygulama Sırası (referans)

11. RAPORLAR Detay Ekleme bloğu 36px yukarı
12. RAPORLAR başlık–tarih çakışması
