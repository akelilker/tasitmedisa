# Hata Yakalama (Try-Catch) İncelemesi ve İyileştirme Önerileri

**Not:** Bu raporda **hiçbir kod değişikliği yapılmadı**. Sadece tespit ve mevcut kodun içine nasıl entegre edileceği gösterilmiştir. Onayınız olmadan işlem yapılmaz.

---

## 1. Kullanıcıya Anlamsız / Teknik Hata Gösteren Yerler

### 1.1 JavaScript – Kullanıcıya `error.message` veya ham hata basan yerler

| Dosya | Satır | Mevcut davranış | Risk |
|-------|--------|------------------|------|
| **raporlar.js** | 1422–1423 | `catch (error)` → `alert('Excel dosyası oluşturulurken bir hata oluştu: ' + (error.message \|\| error))` | Kullanıcıya "TypeError: ...", "Failed to fetch" gibi teknik mesajlar gidebilir. |
| **ayarlar.js** | 1052–1053 | `catch (err)` → `alert('Yedek okunamadı: ' + (err.message \|\| 'Bilinmeyen hata'))` | `err.message` parse/stack vb. içerebilir. |
| **ayarlar.js** | 1198–1204 | `catch (error)` → `return { ..., message: error && error.message ? error.message : 'Yedekleme sırasında hata oluştu.' }` | Bu mesaj `showInfoModal` vb. ile kullanıcıya gidiyorsa teknik detay görünebilir. |
| **driver/driver-script.js** | 932, 1633, 1998 | `data.message` API’den geliyor; sunucu kontrollü. Catch’lerde `alert('Bağlantı hatası!')` / `showStatus(..., 'Bağlantı hatası!')` kullanılıyor. | API mesajları genelde temiz; catch’lerde sadece genel mesaj var – **iyi**. |
| **admin/admin-report.js** | 62 | `data.message` API’den; 341–351’de catch’te sadece retry, kullanıcıya doğrudan `error.message` basılmıyor. | **İyi**. |

**Özet:** Asıl düzeltilmesi gerekenler: **raporlar.js** (Excel alert), **ayarlar.js** (yedek okunamadı alert, yedekleme hatası mesajı).

---

### 1.2 PHP – Kullanıcıya / İstemciye Giden Yanıtlar

| Dosya | Satır | Mevcut davranış | Risk |
|-------|--------|------------------|------|
| **load.php** | 36–39 | `echo json_encode(['error' => 'Veri dosyası okunamadı', 'file_path' => $dataFile])` | `file_path` sunucu yolunu (örn. `/var/www/.../data/data.json`) istemciye gönderir; güvenlik ve kullanıcı için gereksiz. |
| **load.php** | 47–49 | `echo json_encode(['error' => 'Bozuk JSON verisi', 'json_error' => json_last_error_msg()])` | `json_error` teknik (örn. "Syntax error"); kullanıcıya göstermek anlamsız. |
| **save.php** | 9, 25, 33, 81 | `['error' => 'Method Not Allowed']` vb. | Kısa, anlamlı mesajlar – **uygun**. |
| Diğer PHP | – | Hata durumunda `json_encode(['success' => false, 'message' => '...'])` | Mesajlar genelde kullanıcı odaklı – **uygun**. |

**Özet:** **load.php** içinde `file_path` ve `json_error` istemciye gitmemeli; sadece genel bir hata mesajı dönmeli, detay sunucuda log’a yazılmalı.

---

### 1.3 data-manager.js – Fırlatılan hata metni

- **Satır 165:** `throw new Error(\`HTTP error! status: ${response.status}, message: ${errorText.substring(0, 100)}\`)`  
  Bu hata yukarıda `catch` ile yakalanıp `loadDataFromLocalStorage()` dönülüyor; kullanıcıya gösterilmiyor. Ancak `errorText` (PHP çıktısı vb.) Error mesajına yazılıyor; başka bir yer bu hatayı yakalayıp gösterirse teknik içerik sızabilir.  
- **Öneri:** Kullanıcıya hiç gösterilmeyecekse, throw etmeden önce sadece `console.error` (ve varsa log yardımcısı) ile loglayıp, throw’u daha genel bir mesajla yapmak (örn. `throw new Error('LOAD_FAILED')`) veya doğrudan `return loadDataFromLocalStorage()` yapmak.

---

## 2. Mevcut Yapıyı Bozmadan Entegre Edilebilecek Yöntem

Yeni bir “hata sistemi” kurmak yerine, **mevcut catch bloklarında** şu iki şeyi yapmak yeterli:

1. **Kullanıcıya:** Hep aynı, anlaşılır, Türkçe kısa mesaj (sabit string veya duruma göre birkaç seçenek).
2. **Arkada log:** `console.error` ile teknik bilgi (ve isteğe bağlı `error.message`, stack, context); ileride dosyaya/sunucuya log eklenirse aynı yere eklenebilir.

### 2.1 Basit log yardımcısı (tek yerde, isteğe bağlı)

Tüm sayfalarda ortak kullanmak için **script-core.js** (veya en önce yüklenen bir dosya) içine tek bir yardımcı eklenebilir:

```javascript
// Hata loglama – kullanıcıya göstermeden teknik bilgiyi konsola (ileride dosyaya) yazar
window.__medisaLogError = function(context, error, extra) {
  var msg = error && (error.message || String(error));
  console.error('[Medisa]', context, msg, error && error.stack ? error.stack : '', extra || '');
};
```

- **context:** Örn. `'Excel export'`, `'Yedek geri yükle'`, `'loadDataFromServer'`.
- **error:** Yakalanan exception/Error.
- **extra:** İsteğe bağlı ek bilgi (örn. response status).

Catch bloklarında: önce `__medisaLogError('...', error)` çağrılır, sonra kullanıcıya **sadece** sabit/anlamlı mesaj gösterilir.

### 2.2 PHP tarafında log

- **load.php:** Hata durumunda `file_path` ve `json_error`’u **echo etmeden önce** `error_log('...')` ile yazmak.
- İstemciye dönen JSON’da sadece: `['error' => 'Veri yüklenemedi. Lütfen daha sonra tekrar deneyin.']` (ve gerekiyorsa `http_response_code(500)`).

Böylece hem kullanıcı sade mesaj görür hem sunucu log’unda teknik detay kalır.

---

## 3. Dosya Bazlı Önerilen Değişiklikler (Onay Sonrası Uygulanabilir)

### 3.1 raporlar.js (Excel export)

**Mevcut (satır 1421–1424):**
```javascript
} catch (error) {
    console.error('Excel export hatası:', error);
    alert('Excel dosyası oluşturulurken bir hata oluştu: ' + (error.message || error));
}
```

**Önerilen:**
- Arkada: `if (window.__medisaLogError) window.__medisaLogError('Excel export', error);` else `console.error('Excel export hatası:', error);`
- Kullanıcıya: `alert('Excel dosyası oluşturulurken bir hata oluştu. Lütfen tekrar deneyin.');`  
  (error.message / error hiç gösterilmez.)

---

### 3.2 ayarlar.js – Yedek okunamadı

**Mevcut (satır 1052–1054):**
```javascript
} catch (err) {
  alert('Yedek okunamadı: ' + (err.message || 'Bilinmeyen hata'));
}
```

**Önerilen:**
- Arkada: `__medisaLogError('Yedek geri yükle (restoreFromLastBackup)', err);`
- Kullanıcıya: `alert('Yedek okunamadı. Lütfen geçerli bir yedek dosyası ile tekrar deneyin.');`

---

### 3.3 ayarlar.js – Yedekleme hatası mesajı (uploadToServer / clearCache akışı)

**Mevcut (satır 1198–1204):**
```javascript
} catch (error) {
  return {
    success: false,
    localBackup: false,
    serverBackup: false,
    message: error && error.message ? error.message : 'Yedekleme sırasında hata oluştu.'
  };
}
```

**Önerilen:**
- Arkada: `__medisaLogError('Yedekleme (uploadToServer)', error);`
- Dönen `message`: Her zaman kullanıcı odaklı sabit metin: `'Yedekleme sırasında hata oluştu. Lütfen tekrar deneyin.'`  
  (error.message kullanılmaz.)

---

### 3.4 load.php – Hata yanıtı

**Mevcut (dosya okunamazsa, satır 34–40):**
```php
if ($content === false) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Veri dosyası okunamadı',
        'file_path' => $dataFile
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
```

**Önerilen:**
- Hemen üstüne: `error_log('[Medisa load.php] Veri dosyası okunamadı: ' . $dataFile);`
- Echo: `file_path` olmadan sadece `['error' => 'Veri yüklenemedi. Lütfen daha sonra tekrar deneyin.']`

**Mevcut (JSON bozuksa, satır 45–51):**
```php
if ($data === null) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Bozuk JSON verisi',
        'json_error' => json_last_error_msg()
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
```

**Önerilen:**
- Hemen üstüne: `error_log('[Medisa load.php] Bozuk JSON: ' . json_last_error_msg());`
- Echo: `json_error` olmadan sadece `['error' => 'Veri yüklenemedi. Lütfen daha sonra tekrar deneyin.']`

---

### 3.5 data-manager.js – loadDataFromServer hata metni

**Mevcut (satır 163–165):**  
Sunucu `!response.ok` iken sunucu yanıtının ilk 100 karakteri Error mesajına ekleniyor.

**Önerilen:**
- Throw etmeden önce: `console.error('[Medisa] loadDataFromServer HTTP hatası', response.status, errorText.substring(0, 200));`
- Sonra: `return loadDataFromLocalStorage();` (throw kaldırılır) **veya** throw’u genel bırakın: `throw new Error('LOAD_FAILED');` (catch zaten localStorage’a düşüyor).

Böylece teknik içerik sadece konsol/log’da kalır, kullanıcıya hiç gitmez.

---

## 4. Diğer Catch Blokları – Kısa Not

- **driver-script.js:** Catch’lerde zaten “Bağlantı hatası!”, “Kayıt yapılamadı.” gibi sabit mesajlar kullanılıyor; `data.message` sadece API’den gelen kontrollü mesaj. İsterseniz bu catch’lere de `__medisaLogError('...', err)` eklenebilir; kullanıcı mesajı değiştirilmez.
- **kayit.js:** “Kayıt sırasında bir hata oluştu! Lütfen tekrar deneyin.” – kullanıcıya teknik bilgi verilmiyor; sadece catch’e `__medisaLogError` eklenebilir.
- **tasitlar.js renderVehicles:** Catch’te kullanıcıya “Bir hata oluştu. Lütfen sayfayı yenileyin.” deniyor, konsola `error` yazılıyor – **uygun**. İsteğe bağlı: `__medisaLogError('renderVehicles', error)`.

---

## 5. Özet Tablo

| Konum | Sorun | Önerilen davranış (onay sonrası) |
|-------|--------|-----------------------------------|
| raporlar.js ~1423 | alert’te `error.message` / error | Sabit mesaj + arkada `__medisaLogError('Excel export', error)` |
| ayarlar.js ~1053 | alert’te `err.message` | Sabit mesaj + `__medisaLogError('Yedek geri yükle', err)` |
| ayarlar.js ~1203 | return message’da `error.message` | Sabit mesaj + `__medisaLogError('Yedekleme', error)` |
| load.php | file_path, json_error istemciye gidiyor | error_log ile logla; istemciye sadece genel “Veri yüklenemedi” |
| data-manager.js ~165 | Error’a sunucu yanıtı yazılıyor | Log + genel throw veya doğrudan localStorage fallback |
| script-core.js | – | İsteğe bağlı: `window.__medisaLogError(context, error, extra)` tanımı |

Bu adımlar uygulandığında kod patladığında kullanıcı yalnızca anlaşılır, kısa mesajlar görür; teknik detaylar konsol ve (PHP tarafında) sunucu log’unda kalır. Onay verirseniz bu değişiklikleri adım adım uygulayabilirim.
