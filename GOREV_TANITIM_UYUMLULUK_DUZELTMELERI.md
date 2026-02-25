# GÖREV / TALİMAT BLOĞU – Tanıtım Broşürü Uyumluluk Düzeltmeleri

**Kapsam:** Veri akışı, DRY, UI bağlantıları, driver/admin API, zombi kod. Premium Dark standartlarına uygun, tek parça çözüm.

---

## Tespit edilen mantık hataları ve kopukluklar

| # | Konum | Sorun |
|---|--------|--------|
| 1 | `admin/admin_approve.php` | `$data['duzeltme_talepleri']` ve `$data['arac_aylik_hareketler']` üzerinde doğrudan `foreach` kullanılıyor; eski veya eksik `data.json` yapısında bu anahtarlar yoksa PHP Warning/Fatal. |
| 2 | `driver/driver_request.php` | `$data['arac_aylik_hareketler']` üzerinde `foreach` (kayıt arama); key yoksa hata. |
| 3 | `data-manager.js` | `genericSaveData` içinde `window.appData[collectionName]` undefined veya array değilse `findIndex` çağrısı exception fırlatır (sunucudan eksik key ile gelen veri veya henüz yüklenmemiş appData). |

**Doğrulanan (sorun yok):**
- Kaporta SVG: `index.html` #kaza-kaporta-container ↔ tasitlar.js `renderBoyaSchemaKaza` bağlı.
- Şube Değişikliği: `#sube-degisiklik-modal`, `#sube-select`, `closeEventModalAndShowEventMenu('sube')` ve şube doldurma (tasitlar.js) bağlı.
- Sütun bazlı sıralanabilir raporlar: raporlar.js `sortStokList`, `stokSortState`, sütun başlıkları bağlı.
- Raporlar/Taşıtlar veri kaynağı: getMedisaVehicles/Branches/Users kullanıyor (DRY).
- Önbellek Temizleme: ayarlar.js + index.html `#cache-confirm-modal` bağlı.
- driver_event.php: `users`/`tasitlar` için `?? []` kullanıyor.

---

## Uygulanacak kod değişiklikleri (tek blok – Cursor’da uygulayın)

### 1. admin/admin_approve.php

**Değiştirilecek:** Talebi bulma döngüsü ve arac_aylik_hareketler döngüsü güvenli hale getirilecek.

```php
// Talebi bul (satır ~39)
$talepIndex = -1;
$talep = null;
foreach (($data['duzeltme_talepleri'] ?? []) as $idx => $t) {
    if ($t['id'] === $requestId) {
        $talepIndex = $idx;
        $talep = $t;
        break;
    }
}
```

```php
// Eğer onaylandıysa, ana kaydı güncelle (satır ~71)
foreach (($data['arac_aylik_hareketler'] ?? []) as $idx => $k) {
```

**Yapılacak:** Yukarıdaki iki `foreach` satırında `$data['duzeltme_talepleri']` → `($data['duzeltme_talepleri'] ?? [])` ve `$data['arac_aylik_hareketler']` → `($data['arac_aylik_hareketler'] ?? [])` yapın.

---

### 2. driver/driver_request.php

**Değiştirilecek:** Kayıt arama döngüsü.

```php
// Kaydı bul (satır ~71)
$kayit = null;
foreach (($data['arac_aylik_hareketler'] ?? []) as $k) {
    if ($k['id'] === $kayitId) {
        $kayit = $k;
        break;
    }
}
```

**Yapılacak:** `foreach ($data['arac_aylik_hareketler'] as $k)` → `foreach (($data['arac_aylik_hareketler'] ?? []) as $k)` yapın.

---

### 3. data-manager.js – genericSaveData

**Değiştirilecek:** Collection yoksa veya array değilse hata vermeden güvenli davran.

```javascript
function genericSaveData(collectionName, item) {
    if (!window.appData || typeof window.appData[collectionName] === 'undefined') {
        return Promise.reject(new Error('Veri henüz yüklenmedi veya geçersiz koleksiyon'));
    }
    const collection = window.appData[collectionName];
    if (!Array.isArray(collection)) {
        window.appData[collectionName] = [];
        window.appData[collectionName].push(item);
        return saveDataToServer();
    }
    const existingIndex = collection.findIndex(x => x.id === item.id);
    if (existingIndex >= 0) {
        collection[existingIndex] = item;
    } else {
        collection.push(item);
    }
    return saveDataToServer();
}
```

**Yapılacak:** Mevcut `genericSaveData` fonksiyonunun gövdesini yukarıdaki ile değiştirin (appData ve array kontrolü + fallback).

---

## Özet

- **admin_approve.php:** İki yerde `?? []` ile null-safe foreach.
- **driver_request.php:** Bir yerde `?? []` ile null-safe foreach.
- **data-manager.js:** `genericSaveData` için appData/collection varlık ve array kontrolü; eksikse reject veya boş array ile devam.

Bu üç değişiklik, broşürde belirtilen veri mimarisi (`data.json` + `medisa_data_v1`) ile driver/admin API’lerinin eski veya eksik JSON yapılarında çökmeden çalışmasını ve ana uygulama kayıt akışında hata fırlatılmamasını sağlar.
