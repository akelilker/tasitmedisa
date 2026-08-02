# MEDISA Runtime Data Operasyon Runbook

Bu runbook production Restore aktivasyonu, `data/data.json` sağlık ölçümü ve legacy notification veri hijyeni için fail-closed owner akışını tanımlar.

## Production Restore ikinci aktivasyon kapısı

Restore commit için mevcut flag, maintenance, HMAC, genel yönetici yetkisi, intent ve idempotency kapılarına ek olarak production ortamında aşağıdaki bağımsız onay gerekir:

```text
MEDISA_PRODUCTION_RESTORE_APPROVED=true
```

- Varsayılan değer false kabul edilir.
- `MEDISA_ENVIRONMENT` boş, bilinmeyen veya production ise ikinci kapı zorunludur.
- Yalnız `MEDISA_ENVIRONMENT=staging` sentetik kabulü bu production kapısından muaftır.
- Bu değer repository dosyalarına veya workflow kaynaklarına true olarak yazılmaz.
- Production kabul penceresi bitince false/boş duruma geri alınır.
- İkinci kapı; indirilen backup, SHA-256, bakım penceresi ve rollback kanıtının yerine geçmez.

## Runtime data.json sağlık ölçümü

Araç salt-okunurdur ve kullanıcı adı, plaka, telefon veya kayıt içeriği yazdırmaz:

```bash
php scripts/inspect-medisa-runtime-data-health.php --data=/absolute/path/data.json
```

Varsayılan eşikler:

- WARN: 16 MiB
- CRITICAL: 32 MiB

Çıktı yalnız dosya boyutu, SHA-256, değiştirilme zamanı, bilinen koleksiyon sayıları ve bilinmeyen üst-seviye alan sayısını içerir. Exit kodları `OK=0`, `WARN=1`, `CRITICAL/invalid=2` şeklindedir.

## Legacy notification scope temizliği

Araç yalnız `notificationReadState` içindeki `scope:` ile başlayan etkisiz legacy key'leri hedefler. `user:<id>` ve kanonik role/branch key'leri korunur.

Önce dry-run:

```bash
php scripts/migrate-medisa-notification-scope-legacy.php --mode=dry-run --data=/absolute/path/data.json
```

Apply yalnız dry-run çıktısındaki exact sayı ve SHA-256 ile çalışır:

```bash
php scripts/migrate-medisa-notification-scope-legacy.php --mode=apply --data=/absolute/path/data.json --expect-remove=N --expect-sha256=SHA256 --confirm=REMOVE_LEGACY_NOTIFICATION_SCOPES
```

Apply davranışı:

1. Dosyayı kilit altında yeniden okur ve dry-run SHA/count eşleşmesini doğrular.
2. `data/backups/notification-scope-precleanup-*.json` rollback yedeğini atomik yazar ve hash doğrular.
3. Yalnız hedef key'leri kaldırır.
4. Yazım sonrası JSON, kalan key sayısı ve diğer collection bütünlüğünü doğrular.
5. Post-write doğrulama başarısızsa exact ham backup içeriğini geri yazar.

Production apply; backup dosyasının indirildiği ve rollback yolunun doğrulandığı bakım penceresinde çalıştırılır.

## Controlled import staging kabulü

`Staging Restore Acceptance` akışının safe-config fazı artık gerçek import owner bloğunu sentetik staging verisiyle çalıştırır:

1. Authenticated `/load.php` baseline ve canonical hash alınır.
2. Kişisel veri içermeyen kontrollü JSON import payload'ı üretilir.
3. `ayarlar.js` import owner bloğu çalıştırılır ve `/save.php` exact true sonucu doğrulanır.
4. Reload sonrası kontrollü işaret doğrulanır.
5. Baseline aynı API owner üzerinden geri yazılır ve canonical projected hash eşitliği aranır.

Production URL istekleri bu kabul scriptinde fail-closed reddedilir.
