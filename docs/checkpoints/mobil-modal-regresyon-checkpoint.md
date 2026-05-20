# Mobil Modal Regresyon Checkpoint

## 1. Sorunun Kök Nedeni

Mobil regresyonun ana nedeni, `style-core.css` içindeki mobil `.modal-overlay`, `.modal-container` ve `.modal-body` kurallarının tüm modallara genel ve kör şekilde uygulanmasıydı. Bu genel kurallar bazı ekranların kendi owner CSS davranışlarını ezdi:

- Modal dış frame/padding değerleri ekran özelindeki owner kuralların üstüne çıktı.
- Full-screen davranış ihtiyacı olmayan modallar da `height: 100%`, `margin: 0`, `overflow: hidden` rejimine girdi.
- `.modal-body` için verilen genel `padding-bottom` ekran özelindeki body paddinglerini bozdu.

## 2. Yapılan Ana Düzeltme

`style-core.css` içinde mobil full-screen modal davranışı genel selector yerine opt-in liste mantığına çekildi. Böylece full-screen olması gereken modallar açıkça listeye alınır; diğer modallar kendi owner dosyasındaki frame/padding davranışını korur.

Temel prensip:

- `.modal-overlay` sadece güvenli temel davranışları taşımalı.
- Full-screen container/body davranışı opt-in modal ID listesine uygulanmalı.
- Genel `.modal-overlay .modal-container` ve `.modal-overlay .modal-body` selectorları mobilde genişletilmemeli.

## 3. Owner Sınırları

- `style-core.css`: Ana uygulama ortak modal altyapısı ve full-screen opt-in davranışı.
- `ayarlar.css`: Ayarlar modalları, Zorunlu Evraklar ve ayarlar içi özel frame/içerik davranışları.
- `driver/driver-style.css`: Kullanıcı paneli modalları, Belgeler modalı, Geçmiş Kayıtlar ve kullanıcı paneli layout/frame davranışları.
- `tasitlar-base.css` ve `tasitlar-extra.css`: Taşıt modülü ve taşıt modali özel davranışları.

Owner sınırı net değilse önce mevcut selector sahibi bulunmalı, sonra değişiklik yapılmalı.

## 4. Dokunulmaması Gereken Genel Selectorlar

`style-core.css` içindeki mobil `.modal-overlay`, `.modal-container` ve `.modal-body` kuralları genel ve kör şekilde genişletilmemeli.

Özellikle dikkat:

- `.modal-overlay .modal-container` tüm modallara `height: 100%`, `margin: 0`, `overflow: hidden` basmamalı.
- `.modal-overlay .modal-body` tüm modallara ortak `padding-bottom` basmamalı.
- Full-screen mobil modal davranışı opt-in liste mantığıyla yönetilmeli.
- Yeni modal eklenirse önce full-screen gerekip gerekmediği belirlenmeli.

## 5. Modal Bazlı Owner Kararları

- Ayarlar modalları kendi frame standardıyla korunmalı.
- Zorunlu Evraklar `ayarlar.css` owner'ına bağlıdır.
- Driver modalları `driver/driver-style.css` owner'ına bağlıdır.
- Belgeler kart frame'i `style-core.css` değil `driver/driver-style.css` içindedir.
- Ay Özeti gibi ana uygulama modalları full-screen opt-in listesine alınmadan önce özel davranışı kontrol edilmelidir.

## 6. Gelecekte Değişiklik Yaparken Kontrol Listesi

- Değişiklik mobil mi, masaüstü mü, yoksa ikisini de mi etkiliyor?
- Modal full-screen davranışına gerçekten ihtiyaç duyuyor mu?
- Değiştirilecek selector genel mi, yoksa ekran/modal owner'ına ait mi?
- `style-core.css` değişikliği ayarlar veya driver modallarını ezebilir mi?
- `ayarlar.css` içindeki değişiklik sadece ayarlar modal ailesiyle sınırlı mı?
- `driver/driver-style.css` içindeki değişiklik sadece kullanıcı panelini mi etkiliyor?
- Border/frame düzeltmesi yapılırken layout, padding, safe-area ve footer boşluğu korunuyor mu?
- `git diff` sadece hedef owner dosya ve hedef selectorlarla sınırlı mı?
