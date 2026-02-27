# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

MEDISA Taşıt Yönetim Sistemi (Vehicle Management System) — a PHP 8.2 + Apache web app with vanilla HTML/CSS/JS frontend and flat-file JSON data storage (`data/data.json`). No package manager, no build step, no database.

### Running the application

The app runs via Docker Compose on port 8080:

```bash
sudo dockerd &>/tmp/dockerd.log &
sleep 3
sudo docker compose up -d --build
```

Access at `http://localhost:8080`.

### Important caveats

- **Data directory permissions**: After first container start, run `sudo docker exec tasittakip-web chown -R www-data:www-data /var/www/html/data && sudo docker exec tasittakip-web chmod -R 775 /var/www/html/data` to enable write operations (save, backup).
- **No automated tests or linting**: The project has no test framework, no linter configuration, and no CI checks beyond deployment. Testing is manual via browser.
- **No package manager**: No `npm install`, `composer install`, or similar is needed. Zero runtime dependencies to install.
- **docker-compose.yml `version` key**: The `version: '3.8'` key triggers a deprecation warning — it is harmless and can be ignored.
- **Hot reload**: The Docker volume mounts the workspace root into the container, so file changes to PHP/HTML/CSS/JS are reflected immediately without container restart.
- **API endpoints**: `load.php` (GET) returns all data; `save.php` (POST) writes data. Driver module endpoints are under `driver/`. Admin endpoints under `admin/`.

### Entry points

| Module | URL | Description |
|--------|-----|-------------|
| Admin panel | `http://localhost:8080/` | Main vehicle management dashboard |
| Driver portal | `http://localhost:8080/driver/` | Driver login & dashboard |
| Admin reports | `http://localhost:8080/admin/driver-report.html` | Monthly driver reports |
