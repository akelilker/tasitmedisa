---
name: Medisa Performans ve Zombi Kod
overview: data-manager.js'te yalnızca medisa_data_v1 ile tek I/O yazımına geçilecek, script-core.js'teki splash ile ilgili zombi kod kaldırılıp index.html'deki hideLoading globalleştirilecek; getter'lar medisa_data_v1 öncelikli okuyacak.
todos: []
isProject: false
---

# Taşıt Yönetim Sistemi (Medisa) – Performans ve Zombi Kod Planı

## Mevcut durum özeti

- **data-manager.js**: Hem `medisa_data_v1` hem de `medisa_vehicles_v1` / `medisa_branches_v1` / `medisa_users_v1` yazılıyor (gereksiz 4x I/O).
- **script-core.js**: `hideLoadingScreenIfVisible`, `SPLASH_MIN_MS`, `_pageStartTime` ile index.html’deki inline splash mantığının tekrarı var (zombi blok).
- **index.html**: Inline script’te `hideLoading()` tanımlı ama global değil; script-core bu isimle kendi fonksiyonunu kullanıyor.

Değişiklikler sadece [data-manager.js](c:\Users\Akel\Desktop\tasitmedisa\data-manager.js), [script-core.js](c:\Users\Akel\Desktop\tasitmedisa\script-core.js) ve [index.html](c:\Users\Akel\Desktop\tasitmedisa\index.html) üzerinde; tasarım (Premium Dark, flex/align) ve mevcut davranış korunacak.

---

## 1. data-manager.js – I/O ve getter güncellemeleri

### 1.1 Yazımları sadece `medisa_data_v1` yapacak şekilde sadeleştir

**loadDataFromServer** (satır 259–267):  
Eski key’lere yazan 3 satırı kaldır; sadece şu kalsın:

```js
localStorage.setItem('medisa_data_v1', JSON.stringify(window.appData));
```

**DOMContentLoaded – “yedekten geri yükleme” bloğu** (satır 397–412):  
`medisa_vehicles_v1` / `medisa_branches_v1` / `medisa_users_v1` için yapılan 3 ayrı `setItem`’ı kaldır. Yerine tek satır:

```js
localStorage.setItem('medisa_data_v1', JSON.stringify(window.appData));
```

**DOMContentLoaded – normal açılış bloğu** (satır 422–435):  
Aynı şekilde 3 ayrı `setItem` kaldırılıp tek satır:

```js
localStorage.setItem('medisa_data_v1', JSON.stringify(window.appData));
```

### 1.2 loadDataFromLocalStorage – değişiklik yok

Eski key’ler sadece bu fonksiyonda **okuma/fallback** için kalacak (satır 76–79); mevcut yapı aynen korunacak.

### 1.3 getMedisaVehicles / getMedisaBranches / getMedisaUsers

`window.appData` yoksa veya ilgili dizi yoksa **önce** `medisa_data_v1`’den okuyacak, yoksa eski key’e düşecek.

- **getMedisaVehicles**: `window.appData.tasitlar` varsa onu dön; yoksa `medisa_data_v1` parse et → `data.tasitlar`; yoksa `medisa_vehicles_v1` fallback.
- **getMedisaBranches**: Aynı mantık, `branches` ve `medisa_branches_v1`.
- **getMedisaUsers**: Aynı mantık, `users` ve `medisa_users_v1`.

Try/catch ile parse hatalarında boş dizi/array dönüşü mevcut gibi korunacak.

---

## 2. index.html – hideLoading globalleştirme

Inline script (satır ~1316):  
`function hideLoading()` tanımını globalleştir:

```js
window.hideLoading = function hideLoading() {
  // mevcut gövde aynen
};
```

IIFE ve diğer davranışlar (SPLASH_MIN, DOMContentLoaded, load, 2500 ms timeout, error listener) değişmeyecek; sadece `hideLoading` artık `window` üzerinden erişilebilir olacak.

---

## 3. script-core.js – Zombi splash kodu kaldırma ve listener güncelleme

### 3.1 DOMContentLoaded içindeki çağrı (satır 279–281)

`hideLoadingScreenIfVisible()` çağrısını kaldırıp yerine:

```js
if (window.hideLoading) window.hideLoading();
```

### 3.2 Kaldırılacak blok (satır 284–312)

Aşağıdaki bölüm **tamamen silinecek**:

- `/* LOADING SCREEN CLOSE ... */` yorumu
- `const SPLASH_MIN_MS = 2000;`
- `const _pageStartTime = Date.now();`
- `function hideLoadingScreenIfVisible() { ... }` (tüm fonksiyon)
- `window.addEventListener('load', hideLoadingScreenIfVisible);`
- `window.addEventListener('dataLoaded', function() { setTimeout(hideLoadingScreenIfVisible, 50); });`
- `setTimeout(hideLoadingScreenIfVisible, 8000);`

### 3.3 Yerine eklenecek üç satır

Aynı konumda (Service Worker bloğundan hemen önce):

```js
window.addEventListener('load', () => { if (window.hideLoading) window.hideLoading(); });
window.addEventListener('dataLoaded', () => { setTimeout(() => { if (window.hideLoading) window.hideLoading(); }, 50); });
setTimeout(() => { if (window.hideLoading) window.hideLoading(); }, 8000);
```

Böylece splash kapatma tek kaynaktan (index.html’deki `window.hideLoading`) yönetilir; script-core sadece load, dataLoaded ve 8 sn fallback ile bu fonksiyonu çağırır.

---

## 4. Tasarım ve davranış kontrolü

- Hiçbir CSS veya HTML yapısı (flex/align) değiştirilmeyecek.
- Sadece JS değişiklikleri yapılacak; konsol ve arayüzde hata olmaması hedeflenecek.
- `kayit.js`, `raporlar.js`, `ayarlar.js`, `tasitlar.js` içinde eski key’lere doğrudan `localStorage` yazan yerler **bu plan kapsamında değiştirilmeyecek**; bu dosyalar `getMedisaVehicles` / `getMedisaBranches` / `getMedisaUsers` kullandığı sürece güncel veri `medisa_data_v1` + getter’lardan gelecek. İsteğe bağlı ileride bu modüller de yalnızca `window.appData` / getter kullanacak şekilde sadeleştirilebilir.

---

## Uygulama sırası

1. **index.html** – `hideLoading`’i `window.hideLoading` yap (script-core yüklendiğinde kullanılabilir olsun).
2. **data-manager.js** – Tüm gereksiz `setItem`’ları kaldır; getter’lara `medisa_data_v1` öncelikli okuma ekle.
3. **script-core.js** – DOMContentLoaded’daki çağrıyı `window.hideLoading` kullanacak şekilde değiştir; zombi blokları sil; yerine 3 satırlık load/dataLoaded/8000 ms listener’ları yaz.

Bu sıra, script yükleme sırası ve `window.hideLoading`’in tanımlı olması açısından güvenlidir.
