# TaşıtMedisa Faz 3F Egzoz Modal Undefined Handler Kapanış Raporu

## 1. Amaç

Faz 3F-1 kapsamında çözülen Egzoz modal undefined handler hatasını kısa kapanış/devir raporu olarak dokümante etmek.

Bu faz yalnızca dokümantasyon üretir; kod değişikliği, commit veya deploy içermez.

## 2. Başlangıç Bulgusu

Authenticated kayıt smoke sırasında iki console hatası görülmüştü:

- `cancelVehicleEgzozDateModal is not defined`
- `closeVehicleEgzozQuestionFlow is not defined`

Bu hatalar Faz 3E-3 Tramer/Boya temizliğinden kaynaklanmıyordu; ayrı bulgu olarak Faz 3F altında ele alındı.

Ön analiz (Faz 3F ön analiz) sonrası uygulama fazı Faz 3F-1 olarak açıldı.

## 3. Kök Neden

- Egzoz modal butonları `index.html` içinde inline `onclick` ile global handler çağırıyordu.
- Gerçek handler'lar `kayit.js` içinde `window` export olarak tanımlıydı.
- `kayit.js` lazy-load olduğu için erken tıklama veya cache/yükleme sırası durumunda inline `onclick` handler'ı henüz `window` üzerinde bulunmayabiliyordu.
- `index.html` içinde `closeVehicleModal` için erken fallback vardı; egzoz handler'ları için yoktu.

## 4. Uygulanan Çözüm

`index.html` içindeki erken fallback bloğuna iki guarded fallback eklendi:

- `window.closeVehicleEgzozQuestionFlow`
- `window.cancelVehicleEgzozDateModal`

Ortak minimal helper:

- `hideEgzozModal(...)`

Guard mantığı:

- `if (!window.closeVehicleEgzozQuestionFlow)`
- `if (!window.cancelVehicleEgzozDateModal)`

Böylece `kayit.js` yüklendiğinde gerçek implementasyonların davranışı korunur.

Kapsam dışı bırakılanlar:

- Inline `onclick` isimleri değiştirilmedi.
- Modal DOM id'leri değiştirilmedi.
- `kayit.js` gerçek handler implementasyonlarına dokunulmadı.

## 5. Değişen Dosya

- `index.html`

## 6. Deploy Doğrulaması

| Kalem | Sonuç |
|-------|-------|
| Workflow | Deploy cPanel |
| Run | #1895 |
| Run id | 29141649412 |
| Run linki | https://github.com/akelilker/tasitmedisa/actions/runs/29141649412 |
| Sonuç | success |
| Deploy içeriği | Yalnızca `index.html` replace |

Canlı asset doğrulaması:

- Canlı URL: `https://karmotors.com.tr/medisa/index.html`
- HTTP: 200
- Boyut: 81337 byte (repo ile uyumlu)
- Canlı `index.html` içinde fallback guard'ları doğrulandı:
  - `if (!window.closeVehicleEgzozQuestionFlow)`
  - `if (!window.cancelVehicleEgzozDateModal)`
  - `hideEgzozModal(...)`

## 7. Authenticated Smoke Sonucu

Kayıt ekranı açıldı.

Akış:

1. Muayene tarihi girildi
2. Egzoz confirm modalı tetiklendi
3. **Hayır** seçildi
4. Egzoz date modalı açıldı
5. **Vazgeç** ve **X** ile kapatma denendi

Sonuç:

| Test | Sonuç |
|------|-------|
| Egzoz X | OK |
| Egzoz Vazgeç | OK |
| Console | kırmızı hata yok |

Önceki iki ReferenceError canlı authenticated smoke'da tekrar etmedi:

- `cancelVehicleEgzozDateModal is not defined` — görülmedi
- `closeVehicleEgzozQuestionFlow is not defined` — görülmedi

## 8. Dokunulmayan Alanlar

- `kayit.js` gerçek handler implementasyonları
- `script-core.js` lazy-load yapısı
- `vehicle-notification-domain.js`
- `notifications.js`
- `data-manager.js`
- PHP/core endpointleri
- service worker/cache
- Tramer/Boya akışı
- Egzoz tarih hesaplama kuralları
- Notification threshold logic
- Modal DOM yapısı ve inline onclick isimleri

## 9. Nihai Durum

İşlenen commit:

```text
ac8e78f9 fix(kayit-shell): egzoz modal erken fallback handlerlarini ekle
```

- Faz 3F-1 tamamen kapandı.
- Egzoz modal undefined handler bugfix canlıda doğrulandı.

## 10. Sonraki Öneri

- Yeni runtime temizlik veya fix işine geçmeden önce repo kısa stabil durum raporu alınabilir.
- Eğer devam edilecekse yeni iş ayrı faz olarak açılmalı; örnek:
  - **Faz 3G** — Notifications helper dar analiz
  - veya **Faz 3G** — Authenticated smoke backlog temizliği
