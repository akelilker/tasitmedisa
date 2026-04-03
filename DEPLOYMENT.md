# Deployment Pipeline Setup

## Overview
This app uses a GitHub Actions CI/CD pipeline with Docker for:
- **Image building** via Buildx with caching
- **Container registry** push (GitHub Container Registry)
- **Automated testing** on PRs
- **SSH deployment** to production (optional)

## Local Development

### Quick Start
```bash
docker-compose up -d
```
Access app at `http://localhost:8080`

### Data Persistence
- `data/data.json` and backups live in the Docker volume `app-data`
- Volume persists across container restarts
- Configure `MEDISA_SNAPSHOT_MAX` in docker-compose.yml (default: 25)

## GitHub Secrets Setup

### For Container Registry (Required)
Uses `GITHUB_TOKEN` automatically (no setup needed).

### For SSH Production Deployment (Optional)
Add these to GitHub repository secrets (`Settings > Secrets and variables > Actions`):

| Secret | Value |
|--------|-------|
| `SSH_HOST` | Production server IP/hostname |
| `SSH_USER` | SSH user (e.g., `deploy`) |
| `SSH_KEY` | Private SSH key (full PEM content) |

**Generate SSH key pair:**
```bash
ssh-keygen -t rsa -b 4096 -f deploy_key -N ""
cat deploy_key.pub  # Add to ~/.ssh/authorized_keys on server
cat deploy_key      # Copy entire content to SSH_KEY secret
```

## Deployment Workflow

### Trigger Conditions
- **Build**: On push to `main` or `develop` branches, and on PR to `main`
- **Test**: On pull requests (health check only)
- **Deploy**: Only on push to `main` branch (requires SSH secrets)

### What Each Job Does

**build**: Builds Docker image with Buildx, caches layers, pushes to GitHub Container Registry
**test**: Validates container runs and responds to health checks
**deploy-ssh**: Pulls latest image and restarts containers on production server

## Manual Deployment

### Option 1: SSH Deploy
```bash
ssh user@host
cd ~/tasitmedisa
docker pull ghcr.io/akelilker/tasitmedisa:latest
docker-compose down
docker-compose up -d
```

### Option 2: Docker Swarm
```bash
docker service create \
  --name tasitmedisa \
  --publish 8080:80 \
  -e MEDISA_SNAPSHOT_MAX=25 \
  --mount type=volume,source=app-data,target=/var/www/html/data \
  ghcr.io/akelilker/tasitmedisa:latest
```

## Image Tags
Automatically generated from git refs:
- `main` branch → `main`, `latest`
- `develop` branch → `develop`
- `v1.0.0` tag → `1.0.0`, `1.0`, `latest`
- Commit SHA → `branch-abc123def`

Pull with:
```bash
docker pull ghcr.io/akelilker/tasitmedisa:main
docker pull ghcr.io/akelilker/tasitmedisa:latest
```

## Monitoring Deployed Container
```bash
docker-compose logs -f
docker-compose ps
docker stats tasitmedisa
```

## Rollback
```bash
docker-compose down
git checkout <previous-commit>
docker-compose up -d
```
