# AGENTS.md

## Cursor Cloud specific instructions

### Overview

MEDISA Taşıt Yönetim Sistemi (Vehicle Management System) — a PHP 8.2 + vanilla HTML/CSS/JS web application for corporate fleet tracking. No package manager, no build step, no database; all data is stored in `data/data.json`.

### Running the application

Use **PHP 8.2 + Apache** with `mod_rewrite` enabled. Point the virtual host or document root at this repository (same folder as `index.html` and `core.php`). Example local stacks: Laragon, XAMPP, WAMP, or Linux `apache2` + `libapache2-mod-php`.

Quick syntax check (no server):

```bash
php -l core.php
```

Production deploy: **cPanel** Git + `.cpanel.yml` (see repo root), **veya** GitHub Actions **Deploy cPanel** (FTP; `.github/workflows/deploy-cpanel.yml`, Actions secrets gerekir). Manuel olarak `public_html/medisa` kopyası da kullanılabilir. Docker yok.

### Project structure (key paths)

- `index.html` — main SPA entry point
- `core.php`, `load.php`, `save.php` — PHP API (JSON read/write)
- `driver/` — user portal sub-app (login, dashboard, event reporting)
- `admin/` — admin reporting panel (approve requests, export Excel)
- `data/data.json` — flat-file JSON data store (must be writable by Apache)
- `.cpanel.yml` — optional cPanel Git deployment copy list

### Entry points

| Module | URL | Description |
|--------|-----|-------------|
| Main dashboard | `http://localhost:8080/` or your vhost | Main vehicle management dashboard |
| User portal | `.../driver/` | User portal login & dashboard |
| Admin reports | `.../admin/driver-report.html` | Monthly user reports |

### Lint / Test / Build

This project has **no** linting tools, test frameworks, or build systems. Validation is done through manual browser testing. PHP syntax: `php -l <file>.php`.

### Caveats

- The app uses `localStorage` for client-side caching and syncs to the server via `save.php`. After registering a vehicle, data is persisted on the server in `data/data.json`.
- The `.cursorrules` file contains project-specific coding conventions (Turkish language, "Premium Dark" theme, responsive isolation rules). Follow these when making code changes.
