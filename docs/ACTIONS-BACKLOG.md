# GitHub Actions — notlar ve backlog

## PR Check vs Deploy cPanel

| Workflow | Dosya | Tetikleyici | Ne zaman koşar? |
|----------|--------|-------------|------------------|
| **PR Check** | `.github/workflows/pr-check.yml` | `pull_request` → hedef dal **`main`** | `main`’e açılan veya güncellenen PR’larda (push/ready/reopen vb. PR olayları). **`main`’e doğrudan push bu workflow’u tetiklemez.** İki job: **Static checks** (`php -l`, `node --check`), **HTTP smoke** (`php -S` + `curl`, `.github/scripts/ci-http-smoke.sh`). |
| **Deploy cPanel** | `.github/workflows/deploy-cpanel.yml` | `push` → **`main`** ve `workflow_dispatch` | `main`’e merge/push sonrası FTP; istenirse Actions’tan elle çalıştırma. |

Deploy ekranında gördüğün koşular **FTP deploy** workflow’una aittir; **PR Check** ayrı isimdir ve yalnızca PR akışında görünür.

### PR Check’i listede görmek / doğrulamak (manuel)

1. Repo **Actions** sekmesi: sol listede **`PR Check`** workflow’u, varsayılan dalda `.github/workflows/pr-check.yml` dosyası varken görünür.
2. **Çalışma kaydı** oluşması için: `main` hedefli bir **Pull Request** açılmalı veya güncellenmeli; sadece local commit push’u (PR yoksa) bu workflow’u çalıştırmaz.
3. İlk kez eklenen workflow bazen bir PR merge’ünden sonra listede netleşir; şüphede: `main`’e hedefli test PR’ı veya mevcut bir PR’a boş commit.

---

## Backlog: FTP-Deploy-Action ve Node 20 uyarısı

- **Durum:** `Deploy cPanel` içinde `SamKirkland/FTP-Deploy-Action@v4.3.6` kullanılıyor. Eylem veya runner tarafında **Node 20 deprecation** uyarısı çıkabilir (GitHub’ın eski Node varsayılanları / eylem içi runtime).
- **Mevcut mitigasyon (deploy dosyasında):** `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` ile uyarı azaltılmaya çalışılmış; tamamen kaybolmayabilir.
- **Şimdilik:** Deploy mantığına ve eylem sürümüne **dokunulmuyor**; üretim FTP akışı riske atılmıyor.
- **İleride (düşük öncelik):** SamKirkland eyleminin Node 24 uyumlu yeni sürümünü izle; çıkınca `v4.3.6` → güncel patch/minor ile deneme + staging veya elle `workflow_dispatch` ile doğrulama.
