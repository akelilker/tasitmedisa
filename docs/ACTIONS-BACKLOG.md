# GitHub Actions — notlar ve backlog

## PR Check vs Deploy cPanel

| Workflow | Dosya | Tetikleyici | Ne zaman koşar? |
|----------|--------|-------------|------------------|
| **PR Check** | `.github/workflows/pr-check.yml` | `pull_request` → hedef dal **`main`** | `main`’e açılan veya güncellenen PR’larda (push/ready/reopen vb. PR olayları). **`main`’e doğrudan push bu workflow’u tetiklemez.** İki job: **Static checks** (`php -l`, `node --check`), **HTTP smoke** (`php -S` + `curl`, `.github/scripts/ci-http-smoke.sh`). |
| **Deploy cPanel** | `.github/workflows/deploy-cpanel.yml` | `push` → **`main`** ve `workflow_dispatch` | `main`’e merge/push sonrası önce canonical kalite kapıları, ardından FTP ve canlı asset/API/güvenlik doğrulaması; istenirse Actions’tan elle çalıştırma. |

Deploy ekranında gördüğün koşular **FTP deploy** workflow’una aittir; **PR Check** ayrı isimdir ve yalnızca PR akışında görünür.

### PR Check’i listede görmek / doğrulamak (manuel)

1. Repo **Actions** sekmesi: sol listede **`PR Check`** workflow’u, varsayılan dalda `.github/workflows/pr-check.yml` dosyası varken görünür.
2. **Çalışma kaydı** oluşması için: `main` hedefli bir **Pull Request** açılmalı veya güncellenmeli; sadece local commit push’u (PR yoksa) bu workflow’u çalıştırmaz.
3. İlk kez eklenen workflow bazen bir PR merge’ünden sonra listede netleşir; şüphede: `main`’e hedefli test PR’ı veya mevcut bir PR’a boş commit.

---

## FTP-Deploy-Action güncel durum

- **Durum:** `Deploy cPanel` üç denemede de `SamKirkland/FTP-Deploy-Action@v4.4.0` kullanıyor.
- Deploy preflight PHP/JavaScript syntax ve `.github/scripts/quality-gate.sh` kapılarını çalıştırıyor.
- Başarılı FTP sonucu tek başına yeterli sayılmıyor; seçili statik asset SHA’ları, yetkisiz API cevabı, runtime veri koruması ve güvenlik başlıkları ayrıca doğrulanıyor.
- **İleride (düşük öncelik):** Eylemin güncel patch/minor sürümlerini staging veya kontrollü `workflow_dispatch` ile doğruladıktan sonra yükselt.
