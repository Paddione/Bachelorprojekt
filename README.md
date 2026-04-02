# Homeoffice MVP

Kubernetes-native collaboration platform — Mattermost (Chat), Nextcloud (Files + Talk + Collabora), Keycloak (SSO), Invoice Ninja (Billing) on k3d/k3s with Traefik Ingress.

**Prerequisites:** Docker, [k3d](https://k3d.io), kubectl, [task](https://taskfile.dev)

## Service URLs

| Service | URL | Credentials (dev) |
|---------|-----|-------------------|
| Keycloak (SSO) | `http://auth.localhost` | admin / devadmin |
| Mattermost (Chat) | `http://chat.localhost` | via Keycloak SSO |
| Nextcloud (Files + Talk) | `http://files.localhost` | via Keycloak SSO |
| Collabora (Office) | `http://office.localhost` | via Nextcloud |
| Talk HPB (Signaling) | `http://signaling.localhost` | — |
| Invoice Ninja (Billing) | `http://billing.localhost` | via Keycloak SSO |

## Quick Start

```bash
task cluster:create && task homeoffice:deploy
```

## Architecture

```
              Traefik Ingress (Ports 80/443)
                        |
    +---------+---------+---------+-----------+----------+
    v         v         v         v           v          v
Keycloak  Mattermost Nextcloud Collabora  Invoice   Talk HPB
  (SSO)    (Chat)    +Talk     Online     Ninja    Signaling
                       |                          +Janus+NATS
   shared-db (postgres:16-alpine)                 +coturn
   DBs: keycloak | mattermost | nextcloud | invoiceninja
```

## Commands

```bash
task homeoffice:status                 # pod health
task homeoffice:logs -- keycloak       # service logs
task homeoffice:restart -- mattermost  # restart
task homeoffice:validate               # validate manifests
task homeoffice:teardown               # remove everything

cd Bachelorprojekt
./tests/runner.sh local                # all local tests
./tests/runner.sh local SA-08          # single test
./tests/runner.sh report               # generate report
```

## Project Structure

```
Bachelorprojekt/
  k3d/
    kustomization.yaml          # Kustomize entry point
    configmap-domains.yaml      # central domain config (never hardcode hostnames)
    secrets.yaml                # dev-only secrets
    keycloak*.yaml / mattermost*.yaml / nextcloud*.yaml
    talk-hpb.yaml / coturn.yaml / collabora.yaml / wordpress.yaml
    realm-homeoffice-dev.json   # Keycloak realm config
    nextcloud-oidc-dev.php      # Nextcloud OIDC config
  scripts/   # migration, import, utility scripts
  tests/     # automated tests (Bash + Playwright)
  mattermost/ # Keycloak proxy config
```

## Monorepo Rules

1. **Only deployment target is k3d/k3s** — no docker-compose.
2. **All K8s manifests in `k3d/`** — Kustomize only.
3. **All changes via Pull Requests** — no direct pushes to `main`.
4. **CI must pass** before merge (manifest validation, YAML lint, shellcheck, security scan).
5. **Domain config is central** — `k3d/configmap-domains.yaml`; never hardcode hostnames.
6. **Secrets in `k3d/secrets.yaml`** (dev values only) — never commit real credentials.
