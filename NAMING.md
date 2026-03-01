# İsimlendirme Sözlüğü (API / JSON ↔ JS)

Projede aynı kavram bazen Türkçe, bazen İngilizce veya farklı case ile kullanılıyor. Bu dosya eşleşmeleri netleştirir. **Veri şeması veya API sözleşmesi değiştirilmez.**

## Şube (Branch)

| Ortam        | Alan / değişken   | Açıklama              |
|-------------|-------------------|------------------------|
| API / JSON  | `sube_id`         | Kullanıcıya ait şube ID (PHP, eski format) |
| API / JSON  | `branchId`        | Taşıt/kullanıcı şube ID (JS, taşıt objesi)  |
| JS          | `branchId`        | Tercih edilen isim (yeni kodda kullan)     |
| JS          | `activeBranchId`  | Filtre: `'all'` \| `''` \| şube id          |

## Sürücü / Kullanıcı (User / Driver)

| Ortam        | Alan / değişken   | Açıklama              |
|-------------|-------------------|------------------------|
| API / JSON  | `surucu_id`       | Aylık hareket / talep (PHP, JSON)          |
| Token       | `user_id`         | Giriş yapan kullanıcı ID                   |
| JS          | `userId`          | Tercih edilen isim (yeni kodda kullan)     |
| JS          | `assignedUserId`  | Taşıta atanmış kullanıcı ID                |

## Taşıt (Vehicle)

| Ortam        | Alan / değişken   | Açıklama              |
|-------------|-------------------|------------------------|
| API / JSON  | `arac_id`         | Aylık hareket kaydındaki taşıt ID          |
| JSON        | `plaka`           | Plaka (Türkçe)                             |
| JSON        | `plate`           | Plaka (İngilizce; tasitlar sütun key)      |
| JS          | `vehicle.plaka` veya `vehicle.plate` | İkisi de kullanılıyor, normalize edilebilir |

## Kullanıcı adı / İsim

| Ortam        | Alan / değişken   | Açıklama              |
|-------------|-------------------|------------------------|
| API / JSON  | `isim`            | Kullanıcı adı (Türkçe) |
| API / JSON  | `name`            | Kullanıcı adı (İngilizce) |
| JS          | data-manager normalize ediyor: `u2.name = u2.isim` | Tek alan kullanımı için |

## KM

| Ortam        | Alan / değişken   | Açıklama              |
|-------------|-------------------|------------------------|
| API / JSON  | `guncel_km`       | Aylık hareket / kayıt (snake_case)         |
| Taşıt objesi| `guncelKm`        | Güncel km (camelCase; driver_save senkronize eder) |

## Kayıt / Olay

| Ortam        | Alan / değişken   | Açıklama              |
|-------------|-------------------|------------------------|
| API / JSON  | `kayit_id`        | Aylık hareket kaydı ID |
| API / JSON  | `donem`           | Dönem (YYYY-MM)        |
| Event data  | `eskiSubeId`, `yeniSubeId`, `yeniSubeAdi` | Şube değişikliği olayı |

## Genel kurallar (yeni kod)

- **JS:** camelCase; taşıt için `branchId`, kullanıcı için `userId` tercih et.
- **HTML id/class:** kebab-case (mevcut yapıyı bozmadan).
- **API/JSON alan adları:** Değiştirme; sadece okuyup JS’te anlamlı değişken adına atama yap.
