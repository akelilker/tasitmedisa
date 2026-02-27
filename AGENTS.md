# AGENTS.md

## Cursor Cloud specific instructions

### Overview

MEDISA Taşıt Yönetim Sistemi (Vehicle Management System) — a PHP 8.2 + vanilla HTML/CSS/JS web application for corporate fleet tracking. No package manager, no build step, no database; all data is stored in `data/data.json`.

### Running the application

The app runs via Docker Compose as a single `php:8.2-apache` container:

```bash
docker compose up -d --build
```

Access at `http://localhost:8080`. See `README.md` for details.

**Important:** Docker must be running before `docker compose up`. In this Cloud VM environment, start the daemon first:

```bash
sudo dockerd &>/tmp/dockerd.log &
sleep 5
sudo chmod 666 /var/run/docker.sock
```

### Project structure (key paths)

- `index.html` — main SPA entry point
- `core.php`, `load.php`, `save.php` — PHP API (JSON read/write)
- `driver/` — driver panel sub-app (login, dashboard, event reporting)
- `admin/` — admin reporting panel (approve requests, export Excel)
- `data/data.json` — flat-file JSON data store (must be writable by Apache)
- `docker/Dockerfile` — `php:8.2-apache` image with mod_rewrite
- `docker-compose.yml` — single `web` service on port 8080

### Lint / Test / Build

This project has **no** linting tools, test frameworks, or build systems. Validation is done through manual browser testing. PHP syntax can be checked with `php -l <file>.php` inside the container:

```bash
docker compose exec web php -l core.php
```

### Caveats

- The `docker-compose.yml` uses `version: '3.8'` which triggers a deprecation warning with modern Docker Compose — this is harmless.
- The app uses `localStorage` for client-side caching and syncs to the server via `save.php`. After registering a vehicle, data is persisted on the server in `data/data.json`.
- The `.cursorrules` file contains project-specific coding conventions (Turkish language, "Premium Dark" theme, responsive isolation rules). Follow these when making code changes.
