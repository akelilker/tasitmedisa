# Medisa Staging Runbook

Dedicated staging hostname: `https://medisa-staging.karmotors.com.tr`

Production remains: `https://karmotors.com.tr/medisa`

## Isolation

- Staging FTP user: `medisa_staging@karmotors.com.tr` (jail = staging docroot)
- Workflow `server-dir`: `/`
- Explicit FTPS only (`protocol: ftps`, `security: loose`)
- GitHub Environment: `staging` (manual workflow dispatch only)
- Production FTP secrets (`FTP_*`) are never referenced by staging workflows
- Repository `data/**` is not used as staging seed source

## Deploy

Workflow: `.github/workflows/deploy-staging.yml`

Inputs:

| Input | Notes |
| --- | --- |
| `ref` | Prefer exact commit SHA |
| `confirmation` | Exact `DEPLOY MEDISA STAGING` |
| `initialize_synthetic_data` | First deploy: `true` |
| `reset_synthetic_data` | Rewrites synthetic data |
| `reset_confirmation` | Required when init/reset: exact `RESET MEDISA STAGING DATA` |

Behavior:

1. Full quality gate + staging isolation verifier
2. Download existing staging `.htaccess` and preserve Directory Privacy Auth block
3. Build temp deploy tree with staging banner/title/manifest/SW/robots/noindex
4. Generate safe `config.local.php` (restore/maintenance false)
5. FTPS upload; normal deploy excludes `data/**`
6. Post-check unauthenticated `401`
7. `always()` re-uploads cleanup/safe config

## Restore acceptance

Workflow: `.github/workflows/staging-restore-acceptance.yml`

Confirmation: exact `RUN STAGING RESTORE ACCEPTANCE`

Phases:

1. Hard gate (host, HTTPS, Basic Auth, staging marker)
2. Runner failure-injection via existing PHP restore tests (temp FS)
3. Safe-config controlled import owner round-trip + exact baseline rollback
4. Live restore black-box acceptance against staging only
5. `always()` cleanup: restore false, maintenance false, HMAC inactive, baseline seed reload, Basic Auth recheck

Accepted ref `8039e340` baseline sonucu 58/58 + cleanup 9/9 idi. Controlled import eklenen akış bu sayılara dört owner/save/reload/rollback kapısı ekler; yeni ref kendi workflow kanıtıyla raporlanır.

## Local verifier

```bash
npm run tool:verify-staging-isolation
```

Scripts: `scripts/build-medisa-staging-deploy.js`, `scripts/generate-medisa-staging-seed.php`, `scripts/run-medisa-staging-restore-acceptance.js`, `scripts/verify-medisa-staging-isolation.js`.


## Credentials

Staging secrets live only under GitHub Environment `staging`.

Local handoff (outside repo): `Documents/TasitMedisa-staging/staging-credentials.txt`  
(FTP password / token / HMAC are not stored in that handoff file.)

## Unused folder

Do not touch `/home/karmotor/medisa-staging.karmotors.com.tr`.
