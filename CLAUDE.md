# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Workspace MVP** — a Kubernetes-based self-hosted collaboration platform for small teams (bachelor thesis). Integrates Mattermost (chat), Nextcloud (files + video via Talk), Keycloak (SSO/OIDC), Collabora (office suite), and supporting services. All data stays on-premises (DSGVO/GDPR by design).

Prerequisites: Docker, k3d, kubectl, `task` (go-task).

## Common Commands

### Cluster & Deployment
```bash
task cluster:create              # Create k3d cluster (k3d-config.yaml)
task cluster:delete              # Destroy cluster
task cluster:start / stop        # Pause/resume cluster
task workspace:deploy           # Deploy all services (Kustomize)
task workspace:validate         # Dry-run manifest validation
task workspace:teardown         # Remove all services
```

### Daily Operations
```bash
task workspace:status           # Show pod status
task workspace:logs -- <svc>    # Tail logs (e.g., keycloak, mattermost)
task workspace:restart -- <svc> # Restart a specific service
task workspace:monitoring       # Install Prometheus + Grafana (NFA-02)
task workspace:post-setup       # Enable Nextcloud apps (calendar, contacts, OIDC)
```

### Testing
```bash
./tests/runner.sh local              # All tests against k3d
./tests/runner.sh local <TEST-ID>    # Single test (e.g., SA-08, FA-03)
./tests/runner.sh local --verbose    # Verbose output
./tests/runner.sh report             # Generate Markdown report
```

Test IDs: `FA-01`–`FA-11` (functional), `SA-01`–`SA-09` (security), `NFA-01`–`NFA-07` (non-functional), `AK-03`, `AK-04` (acceptance).

### Building the billing-bot (Go)
```bash
cd billing-bot && go build ./...
```

## Architecture

All services run as Kubernetes Deployments in the `workspace` namespace, fronted by Traefik (built-in k3s ingress). There is no docker-compose.

```
Traefik Ingress (80/443)
  ├── Keycloak (auth.localhost)      — OIDC provider for all services
  ├── Mattermost (chat.localhost)    — Team chat
  ├── Nextcloud (files.localhost)    — Files, Talk video, Collabora editor
  ├── Collabora (office.localhost)   — LibreOffice-based online office
  ├── Talk HPB (signaling.localhost) — WebRTC signaling (Janus + NATS + coturn)
  ├── Invoice Ninja (billing.localhost)
  ├── OpenClaw (ai.localhost)        — Self-hosted AI (Ollama + Anthropic API)
  ├── WordPress (web.localhost)
  ├── OpenSearch, Vaultwarden, Whiteboard, Mailpit, Docs
  └── billing-bot (internal)         — Mattermost ↔ Invoice Ninja bridge (Go)

Shared: PostgreSQL 16 (one DB per service, single cluster)
```

### Key components
- **`k3d/`** — All base Kubernetes manifests (Kustomize). This is the only deployment path.
- **`prod/`** — Production overlays/patches (TLS, resource limits, replicas).
- **`deploy/`** — Alternative Skaffold-based deploy path (hot-reload for dev iteration).
- **`billing-bot/`** — Go microservice (`main.go`). Exposes `/slash`, `/actions`, `/healthz`.
- **`scripts/`** — Bash utility scripts for migration, user import, DSGVO checks, etc.
- **`tests/`** — Bash + Playwright test framework. `runner.sh` orchestrates all test categories.

### Configuration patterns
- **Centralized domains**: All hostnames defined in `k3d/configmap-domains.yaml`. Never hardcode hostnames elsewhere.
- **Dev secrets**: `k3d/secrets.yaml` (dev values only — never commit real credentials).
- **Keycloak realm**: `k3d/realm-workspace-dev.json` (exported realm config loaded as ConfigMap).
- **Nextcloud OIDC**: `k3d/nextcloud-oidc-dev.php` (loaded as ConfigMap).
- **SSO flow**: Keycloak is the OIDC provider; Mattermost, Nextcloud, and Invoice Ninja all authenticate through it.

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on every PR:
- Manifest validation: `kustomize build` + `kubeconform` (K8s 1.31.0)
- YAML linting: `yamllint` (200-char line limit)
- Shell linting: `shellcheck` on all scripts
- Config validation: JSON (realm), PHP (OIDC), secret detection, image pinning checks

## Development Rules

1. Only deploy via k3d/k3s with Kustomize (`k3d/` is the base).
2. All changes via Pull Requests — no direct pushes to `main`.
3. Use **squash-and-merge** to keep `main` history clean.
4. CI must be green before merge.
5. Validate manifests before committing: `task workspace:validate`.
6. After modifying Kubernetes manifests, run the relevant test(s): `./tests/runner.sh local <TEST-ID>`.
7. Branch naming: `feature/*`, `fix/*`, `chore/*`.
