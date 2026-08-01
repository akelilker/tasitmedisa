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
- **server restore code contract (R1/R2/R3)**
- backup registry (server-owned, path-safe)
- restore dry-run (no-write)
- restore commit infrastructure (disabled-by-default)
- maintenance / write-freeze (`medisaMutateData` + `save_kasko`)
- restore quality gate (`tool:verify-server-restore`)
- F1/F2/F4 **KEEP_DEFENSIVE** kararı (invariant koruması)

## OPERASYONEL BEKLEYENLER

- Physical iPhone PWA acceptance
- History authenticated visual smoke
- Controlled live import acceptance
- Server restore **staging** acceptance
- Server restore **production activation** (flags + secret + maintenance)
- Production restore write acceptance
- Notification data cleanup (gerekiyorsa explicit data-write auth)

## SERVER RESTORE — ÜRETİM DURUMU

| Sınıf | Durum |
|-------|-------|
| Restore infrastructure | **IMPLEMENTED** |
| Safety findings P0/P1 | **CLOSED** |
| Production restore activation | **DISABLED** |
| Staging acceptance | **PENDING** |
| Production write acceptance | **PENDING** |
| Live restore performed | **NO** |
| Runtime data changed | **NO** |

- Kod hazır olması production restore’un aktif olduğu anlamına **gelmez**.
- `MEDISA_SERVER_RESTORE_ENABLED` default: **false**
- `MEDISA_RESTORE_MAINTENANCE_MODE` default: **false**
- `MEDISA_RESTORE_HMAC_SECRET` repository’de yok; yoksa commit fail-closed
- Güvenlik kapanışı: full canonical content hash, user/actor/credential invariantları, unknown collection reject, verified emergency rollback, ledger fail-closed, dry-run exact SHA no-write
- History KM edge-case (sentetik approved correction kartı ↔ badge): **CLOSED**
- Bu turda canlı restore **yapılmadı**
- Bu turda canlı import **yapılmadı**
- `data/**` değiştirilmedi / açılmadı
- `restore.php` metadata-only GET olarak kaldı (`restore_enabled: false`)
- Geçmiş `DO_NOT_IMPLEMENT_WITHOUT_EXPLICIT_PRODUCT_APPROVAL` notu: implementation vardır; activation staging + açık yetki olmadan yasaktır

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
- Kanıtsız legacy silme yapılmadı → gerekirse `DEFERRED_REQUIRES_DATA_WRITE_AUTH`

## F1/F2/F4

- Karar: **KEEP_DEFENSIVE**
- Physical iOS + mixed-cache hit count kanıtı sonrası tekrar değerlendirilecek
