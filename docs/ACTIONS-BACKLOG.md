# GitHub Actions — notlar ve backlog

## PR Check vs Deploy cPanel

| Workflow | Dosya | Tetikleyici | Ne zaman koşar? |
|----------|--------|-------------|------------------|
| **PR Check** | `.github/workflows/pr-check.yml` | `pull_request` → hedef dal **`main`** | `main` hedefli pull request olaylarında (açma, güncelleme, reopen vb.). **`main`’e doğrudan push bu workflow’u tetiklemez.** **Static checks** job’u PHP 8.2 ve Node 24 kurduktan sonra `.github/scripts/quality-gate.sh` çağırır; canonical gate tracked PHP, tracked JS/MJS syntax ve dört invariant kontrolünü çalıştırır. **HTTP smoke** ayrı job olarak korunur (`php -S` + `curl`, `.github/scripts/ci-http-smoke.sh`). |
| **Deploy cPanel** | `.github/workflows/deploy-cpanel.yml` | `push` → **`main`** ve `workflow_dispatch` | `main` push’u veya Actions’tan elle çalıştırma. FTP başlamadan önce **deploy_preflight** job’u PHP 8.2 ve Node 24 kurar, ardından aynı **canonical kalite kapısını** (`.github/scripts/quality-gate.sh`) çalıştırır; böylece doğrudan `main` push’unda da syntax ve dört invariant zorunludur. Preflight başarılı olmadan FTP attempt job’ları başlamaz. |

Deploy ekranında gördüğün koşular **FTP deploy** workflow’una aittir; **PR Check** ayrı isimdir ve yalnızca PR akışında görünür.

### Ortak canonical kalite kapısı

Canonical owner: **`.github/scripts/quality-gate.sh`**

- **PR Check** (`Static checks` job) ve **Deploy preflight** aynı scripti çağırır.
- Kontroller workflow dosyalarında iki ayrı elle yazılmış liste olarak tutulmaz.
- Script sırasıyla şunları çalıştırır:
  - Git tarafından takip edilen tüm `*.php` dosyalarında `php -l`
  - Git tarafından takip edilen tüm `*.js` ve `*.mjs` dosyalarında `node --check`
  - Rol, taşıt-save, hassas veri ve KM state invariantları (`npm run tool:verify-*`)
- Yeni tracked `.php`, `.js` veya `.mjs` dosyaları otomatik kapsama girer; ayrı listeye eklenmeleri gerekmez.

### PR Check’i listede görmek / doğrulamak (manuel)

1. Repo **Actions** sekmesi: sol listede **`PR Check`** workflow’u, varsayılan dalda `.github/workflows/pr-check.yml` dosyası varken görünür.
2. **Çalışma kaydı** oluşması için: `main` hedefli bir **Pull Request** açılmalı veya güncellenmeli; sadece local commit push’u (PR yoksa) bu workflow’u çalıştırmaz.
3. İlk kez eklenen workflow bazen bir PR merge’ünden sonra listede netleşir; şüphede: `main`’e hedefli test PR’ı veya mevcut bir PR’a boş commit.

---

## Güncel durum: FTP Deploy Action

- **Mevcut action sürümü:** `SamKirkland/FTP-Deploy-Action@v4.4.0` (`.github/workflows/deploy-cpanel.yml` içinde üç FTP attempt job’unda).
- Eski `v4.3.6` bilgisi **stale**’dir; güncel workflow `v4.4.0` kullanır.
- `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` mitigasyonu mevcut workflow’da **yoktur**.
- Node 24 setup, canonical kalite kapısındaki repository JavaScript syntax ve invariant kontrolleri içindir; FTP action’ın kendi internal runtime’ını değiştirdiği iddia edilmemelidir.
- Şu anda FTP action sürümüyle ilgili **açık bir backlog bulunmamaktadır**.
- Yeni upstream sürüm, güvenlik uyarısı veya deprecation oluşursa ayrı kontrollü faz açılmalıdır.
