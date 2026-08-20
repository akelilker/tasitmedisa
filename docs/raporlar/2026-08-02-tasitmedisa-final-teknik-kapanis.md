# TaşıtMedisa — Final Teknik Kapanış Raporu (2026-08-02)

## KAPANANLAR

- P0 asset/SW kontratları (önceki turlar)
- K2 owner hizası
- WhatsApp bildirim geçmişi / audit
- thin-shell early click
- remember-me
- Olay Ekle idempotent aksiyon
- History H1/H2 (UI + verifier)
- import transaction SoT
- import same-page lock
- controlled staging import owner/server round-trip (`e2da2937`; PASS)
- **server restore code contract (R1/R2/R3)**
- backup registry (server-owned, path-safe)
- restore dry-run (no-write)
- restore commit infrastructure (disabled-by-default)
- maintenance / write-freeze (`medisaMutateData` + `save_kasko`)
- restore quality gate (`tool:verify-server-restore`)
- server restore + controlled import staging acceptance (`e2da2937`; live black-box 62/62 + cleanup 9/9)
- production restore ikinci aktivasyon kapısı (`MEDISA_PRODUCTION_RESTORE_APPROVED`, default false)
- runtime data health PII-free ölçüm owner'ı
- notification legacy scope dry-run/apply + exact rollback owner'ı
- F1/F2/F4 **KEEP_DEFENSIVE** kararı (invariant koruması)

## OPERASYONEL BEKLEYENLER

- Physical iPhone PWA acceptance
- History authenticated visual smoke
- Production live import acceptance (yalnız ayrıca istenirse)
- Server restore **production activation** (flags + secret + maintenance)
- Production restore write acceptance
- Notification data cleanup (gerekiyorsa explicit data-write auth)

## SERVER RESTORE — ÜRETİM DURUMU

| Sınıf | Durum |
|-------|-------|
| Restore infrastructure | **IMPLEMENTED** |
| Safety findings P0/P1 | **CLOSED** |
| Production restore activation | **DISABLED** |
| Staging acceptance | **PASS** (`e2da2937`; 62/62 + cleanup 9/9; production isteği 0) |
| Production write acceptance | **PENDING** |
| Live restore performed | **NO** |
| Runtime data changed | **NO** |

- Kod hazır olması production restore’un aktif olduğu anlamına **gelmez**.
- `MEDISA_SERVER_RESTORE_ENABLED` default: **false**
- `MEDISA_RESTORE_MAINTENANCE_MODE` default: **false**
- `MEDISA_RESTORE_HMAC_SECRET` repository’de yok; yoksa commit fail-closed
- Production commit `MEDISA_PRODUCTION_RESTORE_APPROVED=true` olmadan fail-closed
- Güvenlik kapanışı: full canonical content hash, user/actor/credential invariantları, unknown collection reject, verified emergency rollback, ledger fail-closed, dry-run exact SHA no-write
- History KM edge-case (sentetik approved correction kartı ↔ badge): **CLOSED**
- Bu turda canlı restore **yapılmadı**
- Bu turda canlı import **yapılmadı**
- `data/**` değiştirilmedi / açılmadı
- `restore.php` metadata-only GET olarak kaldı (`restore_enabled: false`)
- Geçmiş `DO_NOT_IMPLEMENT_WITHOUT_EXPLICIT_PRODUCT_APPROVAL` notu: implementation ve staging kabulü vardır; production activation ikinci flag + açık yetki olmadan yasaktır

## ENDPOINTLER

| Endpoint | Method | Rol |
|----------|--------|-----|
| `restore.php` | GET | Son yedek metadata (eski kontrat) |
| `backup-registry.php` | GET | Registry list + capability |
| `backup-restore-dry-run.php` | POST | No-write dry-run + intent |
| `backup-restore-commit.php` | POST | Commit (flag+maintenance+intent+idempotency) |
| `backup-restore-status.php` | GET | Transaction status (PII-free) |

## NOTIFICATION / LEGACY

- `medisa_just_restored`: kaynakta yok (korundu)
- `medisa_server_backup`: offline shadow backup — **korundu** (caller var)
- Notification `scope:*` temizliği için dry-run/apply + exact SHA/count/rollback owner'ı hazır; production apply yapılmadı → `DEFERRED_REQUIRES_DATA_WRITE_AUTH`

## F1/F2/F4

- Karar: **KEEP_DEFENSIVE**
- Physical iOS + mixed-cache hit count kanıtı sonrası tekrar değerlendirilecek
