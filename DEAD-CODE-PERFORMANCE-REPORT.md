# Dead-Code ve Performans Tarama Raporu

Tarih: Plan uygulaması sonrası. Kapsam: Tüm uygulama (anasayfa, kayıt, taşıtlar, raporlar, ayarlar, driver, admin).

---

## 1. JS Dead-Code (Adım 1)

**Sonuç:** Net kullanılmayan global fonksiyon/değişken bulunamadı.

- script-core.js: `escapeHtml`, `formatNumber`, `escapeAttr`, `formatKm`, `capitalizeWords`, `checkDateWarnings`, `formatDateShort`, `toTitleCase`, `formatPlaka`, `formatAdSoyad`, `loadColumnState`, `saveColumnState`, `registerServiceWorker`, `debounce`, `__medisaLogError`, `resetModalInputs`, `getKaportaSvg`, `updateFooterDim`, `backToVehicleDetail`, `closeHistoryToHomeAndOpenNotifications`, `loadExcelJS` ve fallback `openVehiclesView`/`openReportsView`/`closeVehiclesModal`/`closeReportsModal` — hepsi HTML onclick veya diğer JS dosyalarında referanslı.
- tasitlar.js, kayit.js, raporlar.js, ayarlar.js, driver/driver-script.js: Tüm `window.xxx` atamaları index.html veya diğer modüllerde kullanılıyor.
- Dinamik kullanım (onclick string, optional `typeof window.xxx === 'function'`) nedeniyle tam otomatik tree-shake yapılmadı; manuel tarama yapıldı.

**Öneri:** Ek dead-code için belirli modül bazında detaylı inceleme yapılabilir.

---

## 2. CSS Dead-Code (Adım 2)

**Bulunan net dead selector:**

| Dosya | Selector | Açıklama |
|-------|----------|----------|
| style-core.css (satır ~2088) | `#kullanici-modal` | HTML'de hiçbir element `id="kullanici-modal"` taşımıyor. Kullanıcı listesi modalı `id="user-modal"`, form `id="user-form-modal"`. Bu selector eşleşmez. |

**Uygulanan temizlik:** `#kullanici-modal` aynı kuraldaki selector listesinden kaldırıldı (kural diğer id'ler ve class'larla devam ediyor).

Diğer kontrol edilen #id ve tekil class'lar (app-footer, notifications-dropdown, vehicle-history-modal, history-tabs, pwa-install-btn, branch-modal, user-modal, vb.) HTML/JS'te mevcut.

---

## 3. Tekrarlayan Kod (Adım 3)

- **Ortak pattern:** Birçok modülde `(typeof window.getMedisaVehicles === 'function' ? window.getMedisaVehicles() : null)` ve benzeri optional dependency kontrolü tekrarlanıyor. Bu, modüllerin bağımsız yüklenebilmesi için bilinçli; birleştirmek büyük refactor gerektirir. **Öneri:** İsteğe bağlı ortak bir `window.getMedisaData('vehicles')` benzeri yardımcı eklenebilir; mevcut yapı korunabilir.
- **Fetch pattern:** data-manager.js load/save, driver-script save, raporlar export — farklı endpoint ve payload'lar; ortak bir wrapper küçük kazanç sağlar, zorunlu değil.
- **Modal open/close:** Her modal kendi close/open fonksiyonuna sahip; script-core fallback'leri var. Tekrarlar işlevsel, net “kaldırılacak” blok yok.

**Çıktı:** Birleştirilebilir tekrarlar için büyük refactor gerekir; sadece raporlama yapıldı, kod değişikliği önerilmedi.

---

## 4. Performans Riskleri (Adım 4)

- **getBoundingClientRect / getComputedStyle:** driver-script.js (dropdown konumlama) ve kayit.js (textarea min/max, tarih placeholder) — event/init bağlamında tek seferlik veya düşük sıklıkta kullanılıyor; scroll/resize içinde sürekli çağrı yok. **Risk: Düşük.**
- **querySelector/getElementById:** tasitlar.js içinde birçok kullanım var; döngü içinde tekrarlayan getElementById tespit edilmedi. Bir yerde (`v-search-input` için aynı ifade iki kez) aynı element iki kez alınıyor; tek değişkene alınması küçük iyileştirme sağlar. **Öneri:** tasitlar.js içinde `document.getElementById('v-search-input')` tek değişkende cache’lenebilir (opsiyonel).
- **Event listener:** Sayfa başına çok sayıda listener kaydı; çoğu delegasyon veya tek modal/panel ile sınırlı. Duplicate listener tespiti yapılmadı. **Risk: Düşük.**
- **CSS selector derinliği:** Uzun descendant zincirleri spot kontrol edildi; animasyon/scroll’da sürekli repaint tetikleyen aşırı ağır selector not edilmedi.

**Çıktı:** Performans notları listelendi; acil değişiklik gerekmiyor, opsiyonel iyileştirme önerildi.

---

## 5. Özet ve Uygulanan Değişiklikler

| Kategori | Bulgu | Uygulama |
|----------|--------|----------|
| JS dead-code | Yok | - |
| CSS dead-code | 1 selector: `#kullanici-modal` | style-core.css’ten kaldırıldı |
| Tekrarlayan kod | Optional dependency pattern’leri | Sadece rapor |
| Performans | Düşük risk; opsiyonel cache önerisi | tasitlar.js: v-search-input cache (getVSearchInput) uygulandı |

**Yapılan kod değişiklikleri:**
- [style-core.css](style-core.css): `#kullanici-modal` selector’ı kaldırıldı.
- [tasitlar.js](tasitlar.js): Arama/toolbar elementleri için getter’lar eklendi: `getVSearchInput()`, `getVSearchContainer()`, `getVTransmissionDropdown()`, `getFilterDropdown()`; ilgili tüm `getElementById` kullanımları bu getter’lara taşındı.

Tarama, build aracı olmadan grep ve manuel inceleme ile yapıldı. Temizlik sonrası manuel tarayıcı kontrolü önerilir.

---

## 6. En yoğun modül (taşıtlar) taraması

**Modül:** tasitlar.js (~4354 satır). Diğer modüller: script-core 598, kayit 1952, raporlar 1739, ayarlar 1366, data-manager 436 satır. Taşıtlar hem en büyük hem de ana kullanıcı akışının (şube/taşıt listesi, detay, olay modalleri) merkezinde.

| Kontrol | Sonuç |
|--------|--------|
| **DOM cache** | `bindDOM()` ile ana modal/detay elementleri bir kere alınıyor; `getVSearchInput()` ile arama kutusu tek referansta. |
| **renderVehicles** | `DOM.vehiclesModalContent` kullanılıyor; döngü içinde getElementById/querySelector yok. HTML string birleştirilip tek `innerHTML` atanıyor. |
| **getBoundingClientRect** | Sadece 1 kullanım (satır ~2423): kaporta/boya şeması boyutlandırması, `requestAnimationFrame` içinde tek seferlik. Scroll/resize döngüsünde değil. **Risk: yok.** |
| **getComputedStyle** | tasitlar.js içinde kullanılmıyor. |
| **Event listener** | Listener’lar tekil kayıt (modalContent, dropdown, document); `_vehicleClickBound` vb. ile duplicate önlenmiş. Duplicate tespit edilmedi. |
| **Tekrarlayan getElementById** | `v-search-container`, `v-transmission-dropdown`, `filter-dropdown` için getter’lar eklendi; tüm kullanımlar bu getter’lara taşındı. |

**Özet:** Taşıtlar modülünde kritik performans riski yok. DOM erişimi getter’lar üzerinden tek noktadan; ağır layout/style okuması hot path’te değil. **Uygulandı:** `getVSearchContainer()`, `getVTransmissionDropdown()`, `getFilterDropdown()` eklendi.
