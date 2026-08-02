# Medisa — Sunucu Taşıma Handoff (Staging + Production)

Hazırlık tarihi: 2026-08-02  
Repo: `akelilker/tasitmedisa`  
CURRENT_MAIN: `278a3320973c1c2ee69cf2d8d2a72ca80e0ce1c8`

Bu belge secretsizdir. Parola, token, HMAC veya Basic Auth değerleri yazılmaz.  
Eski staging klasörü, yeni sunucu acceptance tamamen PASS olmadan silinmez.

İlgili runbook: `docs/runbooks/medisa-staging.md`

---

## Mevcut production mimarisi

| Alan | Değer |
| --- | --- |
| URL | `https://karmotors.com.tr/medisa` |
| Docroot | `/home/karmotor/public_html/medisa` |
| Deploy yolları | (1) cPanel Git + `.cpanel.yml` (`DEPLOYPATH=/home/karmotor/public_html/medisa`) (2) GitHub Actions FTP: `.github/workflows/deploy-cpanel.yml` |
| Production FTP secrets | `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`, `FTP_REMOTE_DIR` (+ opsiyonel `FTP_PROTOCOL`/`FTP_PORT`/`FTP_SECURITY`) |
| Kalıcı veri | `data/data.json` (deploy `data/**` göndermez / ezmez) |
| PHP | 8.2 (workflow ve yerel kontrat) |

Production staging secret’larını (`STAGING_*`) kullanmaz. Staging production FTP secret’larını (`FTP_*`) kullanmaz.

---

## Mevcut staging mimarisi

| Alan | Değer |
| --- | --- |
| Hostname / URL | `https://medisa-staging.karmotors.com.tr` |
| Aktif docroot | `/home/karmotor/public_html/medisa-staging` |
| FTP user | `medisa_staging@karmotors.com.tr` |
| FTP server (workflow hard-gate) | `ftp.karmotors.com.tr` |
| FTP port (varsayılan) | `21` |
| FTP jail / PWD | jail = staging docroot; workflow `STAGING_FTP_SERVER_DIR=/`; PWD beklentisi `/` |
| GitHub Environment | `staging` (yalnız `workflow_dispatch`) |
| Deploy workflow | `.github/workflows/deploy-staging.yml` |
| Acceptance workflow | `.github/workflows/staging-restore-acceptance.yml` |
| Protocol | Explicit FTPS (`ssl-force`, certificate verify off / loose) |

### Kullanılmayan klasör (aktif değil)

```text
/home/karmotor/medisa-staging.karmotors.com.tr
```

Silme veya aktif docroot kabul etme. Sunucu taşınacağı için ek cleanup operasyonel fayda sağlamaz.

### Workflow confirmation metinleri (exact)

| Workflow | Input | Exact metin |
| --- | --- | --- |
| Deploy Staging | `confirmation` | `DEPLOY MEDISA STAGING` |
| Deploy Staging | `reset_confirmation` (init/reset açıkken zorunlu) | `RESET MEDISA STAGING DATA` |
| Staging Restore Acceptance | `confirmation` | `RUN STAGING RESTORE ACCEPTANCE` |

### Sentetik data initialize / reset

- İlk kurulum / seed: `initialize_synthetic_data=true` + `reset_confirmation=RESET MEDISA STAGING DATA`
- Seed yeniden yaz: `reset_synthetic_data=true` + aynı reset confirmation
- Normal deploy: `data/**` hariç tutulur; seed generator yalnız init/reset’te çalışır
- Seed marker: `stagingSynthetic`, plakalar `TEST 001` / `TEST 002` / `TEST 003`
- Repo `data/**` staging seed kaynağı değildir

### Basic Auth koruma mekanizması

1. cPanel Directory Privacy (`.htaccess` Auth bloğu: `AuthType` / `AuthUserFile` / `Require valid-user`)
2. Deploy mevcut staging `.htaccess` indirir; Auth bloğunu korur (`MEDISA_STAGING_EXISTING_HTACCESS`)
3. Post-deploy: yetkisiz `401`, Basic Auth ile `200` + staging banner / `[STAGING]` title
4. Acceptance hard-gate ve cleanup aynı Basic Auth kontrollerini tekrarlar
5. Overlay: `X-Robots-Tag: noindex`, `robots.txt` `Disallow: /`, sticky staging banner

### Restore / maintenance safe defaultları

`config.local.php` (safe / cleanup):

- `MEDISA_ENVIRONMENT=staging`
- `MEDISA_SERVER_RESTORE_ENABLED=false`
- `MEDISA_RESTORE_MAINTENANCE_MODE=false`
- `MEDISA_PRODUCTION_RESTORE_APPROVED=false`
- HMAC secret satırı inactive (`putenv('MEDISA_RESTORE_HMAC_SECRET')` boş)
- `$GLOBALS['MEDISA_STAGING_MARKER'] = true`

Acceptance sırasında geçici olarak restore+maintenance açılır; `always()` cleanup safe config + baseline seed + Basic Auth recheck ile kapanır.

### Staging acceptance terminal beklentileri

Kaynak: `scripts/run-medisa-staging-restore-acceptance.js` + workflow.

Hard gate / safe faz örnekleri:

- `safe_unauth_401` → HTTP `401`
- `safe_auth_home` → HTTP `200`
- `safe_staging_banner` / `safe_staging_title`
- `safe_noindex_header`
- `safe_restore_disabled` / `safe_maintenance_false`
- `ftp_preflight_pwd` → PWD ok (`/`)
- Production host’a istek `0`

Cleanup:

- `STAGING_CLEANUP=PASS`
- `cleanup_unauth_401`, `cleanup_restore_disabled`, `cleanup_maintenance_false`
- `STAGING_CLEANUP_UNCERTAIN` veya `FTP_AUTH=FAIL_530` → workflow FAIL

Referans (eski sunucu, accepted ref): runbook’ta `e2da2937` → 62/62 + cleanup 9/9 ([run 30742050836](https://github.com/akelilker/tasitmedisa/actions/runs/30742050836)).

---

## Eski sunucudan alınacak yedekler

### Staging ZIP (bugün — silmeden önce)

Kaynak:

```text
/home/karmotor/public_html/medisa-staging
```

ZIP adı:

```text
medisa-staging-pre-migration-20260802.zip
```

Yerel indirme (GitHub / sohbet / genel bulut yasak — `config.local.php` secret içerir):

```text
C:\Users\Akel\Documents\TasitMedisa-server-migration\
```

ZIP içinde en az:

```text
.htaccess
config.local.php
data/data.json
index.html
robots.txt
manifest.json
sw.js
```

### Production yedek (taşıma günü — ayrı paket)

Minimum:

```text
/home/karmotor/public_html/medisa/
  .htaccess
  config.local.php (varsa)
  data/data.json
  icon/
  uygulama dosyaları
```

Production `data/data.json` deploy ile ezilmemelidir. Canlı veri yalnız bilinçli migration/restore ile taşınır.

### cPanel yapılandırma kaydı (manuel ekran / not)

Staging için kaydet:

- Subdomain: `medisa-staging.karmotors.com.tr`
- Docroot: `/home/karmotor/public_html/medisa-staging`
- AutoSSL: aktif
- FTP user: `medisa_staging@karmotors.com.tr`
- FTP jail: yalnız staging docroot
- FTP PWD: `/`
- PHP sürümü
- DNS A kaydı ve TTL
- Directory Privacy kullanıcı adı (parola sohbete yazılmaz)
- Staging klasör toplam boyutu

Production için aynı şekilde subdomain/path, FTP, PHP, SSL, DNS kaydı alınır.

---

## Gizli dosya ve Directory Privacy gereksinimleri

| Öğe | Not |
| --- | --- |
| `config.local.php` | Commit edilmez (`.gitignore`); staging’de token/HMAC/restore bayrakları |
| `.htaccess` Auth bloğu | Deploy korur; yeni sunucuda path değişebilir |
| `AuthUserFile` | Eski sunucu yolu yeni sunucuda geçersiz olabilir → **Directory Privacy yeniden oluşturulacak** |
| Basic Auth user/pass | GitHub secrets `STAGING_BASIC_AUTH_*`; değerler bu belgede yok |

**DIRECTORY_PRIVACY_RECREATE_REQUIRED:** `true` (yeni sunucuda AuthUserFile yolu yeniden kurulmalı; eski path varsayılmamalı).

Manuel adım: aktif staging `.htaccess` içindeki `AuthUserFile ...` satırını yerel migration notuna kaydet (ZIP içinde de bulunur).

---

## GitHub Environment variable/secret envanteri

Environment adı: `staging`  
Doğrulama (2026-08-02): adlar mevcut; secret **değerleri okunmadı / yazılmadı**.

### Variables (beklenen adlar + kaynak hard-gate değerleri)

| Name | Beklenen / not |
| --- | --- |
| `STAGING_BASE_URL` | `https://medisa-staging.karmotors.com.tr` |
| `STAGING_FTP_SERVER` | `ftp.karmotors.com.tr` |
| `STAGING_FTP_PORT` | `21` (tipik) |
| `STAGING_FTP_SERVER_DIR` | `/` |
| `STAGING_FTP_USERNAME` | `medisa_staging@karmotors.com.tr` |
| `STAGING_APP_ADMIN_USERNAME` | staging admin kullanıcı adı |
| `MEDISA_ENVIRONMENT` | `staging` |

### Secrets (yalnız adlar)

| Name |
| --- |
| `STAGING_FTP_PASSWORD` |
| `STAGING_BASIC_AUTH_USERNAME` |
| `STAGING_BASIC_AUTH_PASSWORD` |
| `STAGING_APP_ADMIN_PASSWORD` |
| `STAGING_TOKEN_SECRET` |
| `STAGING_RESTORE_HMAC_SECRET` |

Yeni sunucuda FTP veya Basic Auth değişirse ilgili secret/variable güncellenir; değerler loglanmaz.

Production environment / repository secrets (`FTP_*`) bu listenin dışındadır; production taşımasında ayrı güncellenir.

---

## Yeni sunucuda production kurulum sırası

1. `karmotors.com.tr` / path `/medisa` için docroot oluştur: hedef kontrat `/home/<user>/public_html/medisa` (cPanel path yeni hesap adıyla güncellenebilir; `.cpanel.yml` `DEPLOYPATH` hard-check’i varsa kaynak güncellemesi gerekir).
2. PHP 8.2 + `mod_rewrite` + gerekli Apache modülleri.
3. AutoSSL / sertifika.
4. Production FTP hesabı (jail tercihen production docroot veya bilinen `FTP_REMOTE_DIR`).
5. Mevcut production dosya + **canlı** `data/data.json` + `icon/` taşı.
6. `config.local.php` production safe değerleriyle kur (restore/maintenance kapalı; production restore kapıları ayrı runbook).
7. GitHub production FTP secrets/vars güncelle.
8. DNS kesmeden önce staging + production smoke; production deploy kabul kontrolü (aşağı).
9. DNS/SSL geçişi (aşağıdaki sıra).
10. 24 saat stabilite sonrası eski production kapatma listesi.

> Not: Bu handoff staging odaklıdır. Production `.cpanel.yml` içinde `/home/karmotor/...` sabittir; yeni cPanel kullanıcı adı değişirse production kaynak güncellemesi gerekir.

---

## Yeni sunucuda staging kurulum sırası

1. Subdomain: `medisa-staging.karmotors.com.tr`
2. Ayrı staging docroot (eski aktif path ile aynı mantık: production’dan ayrı klasör)
3. AutoSSL etkinleştir
4. Directory Privacy oluştur (yeni `AuthUserFile`; eski path kopyalama)
5. Yalnız staging docroot’a bağlı FTP hesabı oluştur
   - Tercihen aynı kimlikler: user `medisa_staging@karmotors.com.tr`, server `ftp.karmotors.com.tr`, PWD `/`
6. GitHub `staging` environment FTP + Basic Auth secret/variable’larını yeni bilgilerle güncelle
7. `Deploy Staging` çalıştır: `confirmation=DEPLOY MEDISA STAGING`, `initialize_synthetic_data=true`, `reset_confirmation=RESET MEDISA STAGING DATA`
8. Doğrula:
   - Yetkisiz `401`
   - Basic Auth `200`
   - Staging banner
   - `noindex`
   - FTP PWD `/`
   - Production `/medisa` erişilemiyor (staging FTP jail)
   - Restore `false`
   - Maintenance `false`
9. `Staging Restore Acceptance` çalıştır: `confirmation=RUN STAGING RESTORE ACCEPTANCE`
10. Acceptance + cleanup tamamen PASS olduktan sonra DNS’i yeni sunucuya geçir
11. Yeni sunucu 24 saat stabil olduktan sonra eski staging klasörü ve FTP hesabı silinir

---

## DNS/SSL geçiş sırası

1. Yeni sunucuda staging + production docroot, FTP, Directory Privacy, AutoSSL hazır.
2. Staging deploy (sentetik init) + staging acceptance PASS + cleanup PASS.
3. Production dosya/veri taşıma + production deploy kabul kontrolü PASS.
4. TTL düşür (önceden, mümkünse 24–48s önce).
5. A kayıtlarını yeni sunucuya yönlendir (`medisa-staging` ve ana host).
6. AutoSSL / sertifika yenilenmesini doğrula (HTTPS 443).
7. Staging ve production smoke tekrar (401/200, banner, canlı asset SHA).
8. Eski sunucuyu hemen silme; 24 saat rollback penceresi bırak.

---

## Production deploy kabul kontrolü

- `https://karmotors.com.tr/medisa/` erişilebilir (beklenen HTTP 200)
- Login / ana shell yüklenir
- Canlı asset doğrulaması (deploy workflow post-check SHA mantığı)
- `data/data.json` deploy ile ezilmedi
- Restore / maintenance production’da kapalı (görev dışı restore açma)
- Staging URL’den production içeriği sızmıyor

---

## Staging deploy kabul kontrolü

- Unauth: `401`
- Basic Auth: `200`
- Banner: `STAGING — SENTETİK VERİ — PRODUCTION DEĞİL` / `medisa-staging-banner`
- Title: `[STAGING]`
- `X-Robots-Tag` / robots `Disallow: /`
- FTP user jail → production `/medisa` yazılamaz / listelenemez
- Normal deploy sonrası `config.local.php`: restore false, maintenance false
- Init sonrası sentetik seed marker’ları (`stagingSynthetic`, `TEST 001`…)

---

## Restore ve maintenance güvenlik kontrolü

- Staging safe default: restore off, maintenance off, production approval false
- Acceptance yalnız staging host’a HTTP atar; production host deny
- Cleanup `always()`: safe config upload + baseline seed + unauth 401
- `STAGING_CLEANUP_UNCERTAIN` → PASS sayılmaz
- Production restore: ayrı kapılar (`MEDISA_ENVIRONMENT`, production approval); staging acceptance production’ı açamaz

---

## Rollback planı

| Senaryo | Aksiyon |
| --- | --- |
| Yeni staging deploy FAIL | DNS’i değiştirme; eski staging docroot açık kalsın |
| Acceptance / cleanup FAIL | DNS’i değiştirme; cleanup uncertain ise FTP/Auth secret’ları kontrol et; eski sunucu korunur |
| DNS sonrası staging bozuk | A kaydını eski sunucuya geri al; TTL kısa tutulmuş olmalı |
| Production bozuk | Production A / host kaydını eski sunucuya rollback; canlı `data/data.json` eski sunucudan restore |
| Secret yanlış | GitHub `staging` secret güncelle; kaynak kod değiştirme (kimlikler aynıysa) |

Eski staging silinmeden önce yeni ortam acceptance + 24 saat stabilite şarttır.

---

## Eski sunucu kapatma ve silme kontrol listesi

Yalnız yeni sunucu 24 saat stabil + staging acceptance PASS sonrası:

- [ ] Yeni staging URL 401/200/banner/noindex OK
- [ ] Staging acceptance + cleanup PASS (güncel run)
- [ ] Production canlı OK
- [ ] Yerel ZIP yedek mevcut: `C:\Users\Akel\Documents\TasitMedisa-server-migration\medisa-staging-pre-migration-20260802.zip`
- [ ] AuthUserFile / Directory Privacy notu kaydı mevcut
- [ ] GitHub `staging` env yeni sunucu kimliklerine güncellendi
- [ ] Eski staging FTP hesabını sil
- [ ] Eski aktif docroot’u sil: `/home/karmotor/public_html/medisa-staging`
- [ ] Kullanılmayan klasör isteğe bağlı: `/home/karmotor/medisa-staging.karmotors.com.tr` (zorunlu değil)
- [ ] Eski production docroot / FTP (production stabilite sonrası, ayrı onay)

---

## Kimlik değişince / değişmeyince kaynak güncellemesi

### Aynı hostname + FTP server + FTP username korunursa

**WORKFLOW_SOURCE_CHANGE_REQUIRED_IF_SAME_IDENTITIES:** `false`

Yalnız GitHub Environment secret değerleri (şifreler) ve yeni sunucu Directory Privacy güncellenir. Kaynak kod / workflow hard-gate değişmez.

Korunan kimlikler:

- Host: `medisa-staging.karmotors.com.tr`
- FTP server: `ftp.karmotors.com.tr`
- FTP username: `medisa_staging@karmotors.com.tr`
- FTP dir / PWD: `/`

### FTP server veya FTP username (veya hostname) değişirse

**WORKFLOW_SOURCE_CHANGE_REQUIRED_IF_IDENTITIES_CHANGE:** `true`

Exact güncellenecek dosyalar:

| Dosya | Ne güncellenir |
| --- | --- |
| `.github/workflows/deploy-staging.yml` | Hard-gate: `STAGING_BASE_URL`, `STAGING_FTP_USERNAME`, `STAGING_FTP_SERVER`, environment `url` |
| `.github/workflows/staging-restore-acceptance.yml` | Hard-gate username/base URL; environment `url` |
| `scripts/verify-medisa-staging-isolation.js` | `STAGING_HOST`, `STAGING_URL`, `STAGING_FTP_USER` |
| `scripts/medisa-staging-ftps.js` | `STAGING_FTP_USER` sabiti + mismatch guard |
| `scripts/run-medisa-staging-restore-acceptance.js` | `STAGING_HOST`, `STAGING_FTP_USER` |
| `scripts/build-medisa-staging-deploy.js` | Overlay URL rewrite (`medisa-staging.karmotors.com.tr`) |
| `docs/runbooks/medisa-staging.md` | Runbook kimlikleri |
| `docs/runbooks/medisa-server-migration-handoff.md` | Bu handoff |

Ayrıca GitHub `staging` variables yeni değerlere çekilir; secret’lar yenilenir.

Port veya yalnız şifre değişirse: genelde yalnız `STAGING_FTP_PORT` / `STAGING_FTP_PASSWORD` (kaynak hard-gate yoksa kod değişmez). Username/server hard-coded olduğu için onlar değişirse yukarıdaki liste zorunludur.

---

## Yerel verifier komutları (kaynak kontrat)

```bash
npm run tool:verify-staging-isolation
npm run tool:verify-staging-ftps
npm run tool:verify-server-restore
git diff --check
```

Canlı FTP/deploy bu handoff görevinde çalıştırılmaz.

---

## Sonraki manuel aksiyon (bugün)

1. cPanel File Manager: aktif staging docroot ZIP → yerel migration klasörü  
2. `.htaccess` içinden `AuthUserFile` yolunu not et  
3. cPanel ekran notları (PHP, DNS A/TTL, klasör boyutu, Directory Privacy kullanıcı adı)  
4. Staging klasörünü silme
)
