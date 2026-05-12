# CLAUDE.md

## Agent Routing

Before responding to any request, check these signals and delegate to the named agent:

| Signals | Agent |
|---------|-------|
| `website/`, Astro, Svelte, component, homepage, kore, brand, CSS, UI, frontend | `bachelorprojekt-website` |
| pod, logs, status, restart, crash, health, kubectl, "what's wrong", "why is X failing" | `bachelorprojekt-ops` |
| `k3d/`, `prod*/`, manifest, kustomize, overlay, ArgoCD, Taskfile, `ENV=`, `environments/`, deploy | `bachelorprojekt-infra` |
| test, `FA-*`, `SA-*`, `NFA-*`, BATS, Playwright, `runner.sh`, test case | `bachelorprojekt-test` |
| database, PostgreSQL, psql, schema, query, backup, restore, tracking, timeline | `bachelorprojekt-db` |
| SealedSecret, Keycloak realm, OIDC, DSGVO, credentials, rotate, certificate | `bachelorprojekt-security` |

**Before dispatching any agent, inject active plan context:**
Run `bash scripts/plan-context.sh <role>` and prepend output to the agent prompt wrapped in `<active-plans>` tags. If the script produces no output (no active plans for that role), omit the block entirely.

```bash
# Example orchestrator injection pattern:
context=$(bash scripts/plan-context.sh infra)
if [[ -n "$context" ]]; then
  prompt="<active-plans>\n${context}\n</active-plans>\n\n${task_prompt}"
fi
```

Also: after `superpowers:writing-plans` skill creates a new plan file, run `bash scripts/plan-frontmatter-hook.sh <plan-file>` on it before committing. This adds the required frontmatter (domains, status) that `plan-context.sh` and the GH Action depend on.

**Tie-break rule:** when signals overlap (e.g. "deploy the website"), prefer the domain of the files being changed — `bachelorprojekt-website` for `website/src/` changes, `bachelorprojekt-infra` for manifest/overlay changes.

**Cross-cutting requests** (e.g. a feature spanning both website and k8s) stay with the main orchestrator, which coordinates multiple agents in sequence.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Workspace MVP** -- a Kubernetes-based self-hosted collaboration platform for small teams (bachelor thesis). Integrates a custom messaging system (chat, built into the Astro website), Nextcloud (files + video via Talk), Keycloak (SSO/OIDC), Collabora (office suite), Claude Code (AI), Vaultwarden (passwords), and supporting services. All data stays on-premises (DSGVO/GDPR by design).

Prerequisites: Docker, k3d, kubectl, `task` (go-task).

## Common Commands

### Day-to-day workflows (fan out across BOTH prod clusters)
```bash
task feature:deploy        # workspace:deploy + post-setup on mentolder + korczewski
task feature:website       # Rebuild + roll the Astro website on both clusters
task feature:brett         # Rebuild + roll the brett service on both clusters
task feature:livekit       # Re-pin livekit/stream DNS on both clusters
task health                # Cross-cluster status + connectivity check
```
The underlying `workspace:*:all-prods` (`workspace:deploy:all-prods`, `workspace:post-setup:all-prods`, `workspace:status:all-prods`, `website:redeploy:all-prods`, `brett:deploy:all-prods`, `workspace:talk-setup:all-prods`, `workspace:recording-setup:all-prods`) just run the per-env task twice (mentolder, korczewski) — call them directly when you need finer control. The standalone operator dashboard was retired in PR #555 — its successor lives at `web.${PROD_DOMAIN}/admin/monitoring`, which redeploys with the website itself.

### Cluster & Deployment (single env)
```bash
task cluster:create                        # Create k3d cluster (k3d-config.yaml)
task cluster:delete                        # Destroy cluster
task cluster:start                         # Start stopped cluster
task cluster:stop                          # Stop cluster (preserves state)
task cluster:status                        # Show cluster status, nodes, resource usage
task workspace:up                          # Full automated setup (Cluster → MVP → Office → MCP → post-config). For ENV-aware variant on an existing cluster: `task workspace:setup ENV=<env>`.
task workspace:deploy                      # Deploy workspace (default ENV=dev)
task workspace:deploy ENV=mentolder        # Deploy to mentolder prod cluster
task workspace:deploy ENV=korczewski       # Deploy to korczewski prod cluster
task workspace:validate                    # Dry-run manifest validation
task workspace:teardown ENV=<env>          # Remove all services in a single env
task sealed-secrets:install                # Install Sealed Secrets controller via Helm
task sealed-secrets:status                 # Show Sealed Secrets controller status
```

### Daily Operations (per env)
```bash
task workspace:status   ENV=<env>             # Show pod status, services, ingress, PVCs
task workspace:logs     ENV=<env> -- <svc>    # Tail logs (e.g., keycloak, nextcloud)
task workspace:restart  ENV=<env> -- <svc>    # Restart a specific service
task workspace:psql     ENV=<env> -- <db>     # Open psql shell to shared-db
task workspace:port-forward ENV=<env>         # Forward shared-db to localhost:5432
task clusters:status                          # One-line status across both prod clusters
```
The legacy `mentolder:*` / `korczewski:*` shorthands were removed 2026-05-05 — pass `ENV=` to the unified tasks instead.

### Backup & Restore
```bash
task workspace:backup                                    # Trigger immediate backup
task workspace:backup:list                               # List available backup timestamps
task workspace:restore -- <db> <timestamp>               # Restore one DB (keycloak|nextcloud|vaultwarden|website|docuseal)
task workspace:restore -- all <timestamp>                # Restore all DBs from one snapshot
# Prod: append -- --context mentolder|korczewski to any of the above
```

### Database Management
```bash
task workspace:db:start ENV=<env>                        # Start or restart shared-db (scale up if at 0)
task workspace:db:drop -- <dbname> ENV=<env>             # Drop a database (asks for confirmation)
task workspace:db:restore -- <db> <timestamp> ENV=<env>  # List backups then restore (db: keycloak|nextcloud|vaultwarden|website|docuseal|all)
```

### Post-Deploy Setup
```bash
task workspace:office:deploy ENV=<env>    # Deploy Collabora (separate overlay — required for full bring-up)
task workspace:post-setup                 # Enable Nextcloud apps (calendar, contacts, OIDC, Collabora)
task workspace:talk-setup                 # Configure Nextcloud Talk HPB signaling + coturn
task workspace:recording-setup            # Configure Talk recording backend
task workspace:whiteboard-setup           # Install + configure Nextcloud Whiteboard app
task workspace:systembrett-setup          # Set up Brett (Systembrett) integration in Nextcloud
task workspace:admin-users-setup          # Create default admin users
task workspace:transcriber-setup          # Set up talk-transcriber bot + Whisper
task workspace:transcriber-build          # Build talk-transcriber Docker image
task workspace:vaultwarden:seed           # Seed Vaultwarden with production secret templates
task workspace:dsgvo-check                # Run DSGVO compliance verification (NFA-01)
task claude-code:setup -- cluster         # Generate Claude Code settings.json for platform admin
task claude-code:setup -- business        # Generate Claude Code settings.json for business user
task gemini:setup -- cluster|business     # Generate Gemini CLI settings.json (parallel to claude-code:setup)
```

### Docs
```bash
task docs:deploy                # Deploy docs ConfigMap to both prod clusters (mentolder + korczewski)
```

### Claude Code MCP Servers
```bash
task mcp:deploy                       # Deploy MCP monolith pod + auth proxy
task mcp:status                       # Show MCP pod and container status
task mcp:logs -- <container>          # Tail logs (e.g., postgres|browser|github|keycloak|kubernetes)
task mcp:restart                      # Restart the MCP monolith pod
task mcp:select                       # Interactive MCP server selector
task mcp:set-github-pat -- <tok>      # Update GitHub PAT in claude-code-secrets
```

### Website (Astro + Svelte)
```bash
task website:deploy   ENV=<env>     # Build, import, and deploy website
task website:dev                    # Astro dev server (hot-reload, no ENV)
task website:redeploy ENV=<env>     # Rebuild and roll website pod
task website:status   ENV=<env>     # Show website deployment status
task website:teardown ENV=<env>     # Remove website namespace
task website:redeploy:all-prods     # Rebuild + roll on mentolder + korczewski
```

### Livestream (LiveKit — WebRTC + OBS)
Admin-Steuerseite `/admin/stream`, Zuschauer-Seite `/portal/stream`.
`livekit-server` läuft auf `hostNetwork` und ist via `nodeAffinity` auf eine Pin-Node fixiert (mentolder: `gekko-hetzner-3`/`46.225.125.59`).
```bash
task livekit:status ENV=<env>            # Pods, Services, Ingress, Recording-Anzahl
task livekit:logs ENV=<env>              # Tail livekit-server logs (default)
task livekit:logs ENV=<env> -- ingress   # Tail livekit-ingress (RTMP)
task livekit:logs ENV=<env> -- egress    # Tail livekit-egress (Recording)
task livekit:recordings ENV=<env>        # MP4-Liste im egress PVC
task livekit:end-stream ENV=<env>        # Notfall: livekit-server neu starten (Raum schließen)
task livekit:dns-pin ENV=<env>           # Druckt ipv64-API-Calls für DNS-Pinning (APPLY=true zum Ausführen)
task livekit:firewall-open NODE=<ip>     # Öffnet ufw 7880/7881/tcp + 50000-60000/udp + 30000-40000/udp via SSH
```

### ArgoCD — GitOps Multi-Cluster Federation
**HUB-ONLY**: ALL `argocd:*` tasks run exclusively against `--context mentolder`.
`ENV=korczewski` is silently ignored — it does NOT redirect kubectl to korczewski.
Tasks live in `Taskfile.argocd.yml` (included under the `argocd` namespace).
```bash
task argocd:setup                # Full setup: install → login → register clusters → apply apps (run once on fresh hub)
task argocd:install              # Install ArgoCD on mentolder hub cluster
task argocd:password             # Print initial admin password
task argocd:ui                   # Port-forward ArgoCD UI to http://localhost:8090
task argocd:login                # Log in with argocd CLI
task argocd:cluster:register     # Register hetzner + korczewski clusters with workspace labels
task argocd:apps:apply           # Apply AppProject and ApplicationSet
task argocd:status               # Show sync/health status of all apps across all clusters
task argocd:sync -- <app>        # Manually trigger sync (e.g. workspace-hetzner)
task argocd:diff -- <app>        # Show diff between git and live state
```
ArgoCD files: `argocd/install/` (CMP sidecar, Ingress), `argocd/project.yaml`, `argocd/applicationset.yaml`.
Cluster config lives as annotations on ArgoCD cluster Secrets — set via `task argocd:cluster:register`.

### Brett (Systembrett)
```bash
task brett:build                 # Build Brett image (and import into k3d in dev)
task brett:push                  # Push Brett image to registry
task brett:deploy ENV=<env>      # Build, import/push, and roll out Brett
task brett:bot-setup ENV=<env>   # Register /brett slash command in Nextcloud Talk
task brett:logs ENV=<env>        # Tail Brett logs
```

### Production clusters (two physical clusters since PR #621/#622, 2026-05-09)
The earlier "unified" merge (2026-05-05) was reverted. Production now runs as two
separate k3s clusters; verify with `kubectl config get-contexts`.

**`mentolder` cluster (9 nodes, serves `mentolder.de`):**
- Control-planes (3): `gekko-hetzner-2/3/4` (Hetzner Helsinki)
- Workers (6): `k3s-1/2/3` + `k3w-1/2/3` (home LAN, joined via WireGuard mesh `wg-mesh`)
- Workspace lives in the `workspace` namespace.

**`korczewski-ha` cluster (3 nodes, serves `korczewski.de`):**
- Control-plane (1): `pk-hetzner-4`
- Workers (2): `pk-hetzner-6`, `pk-hetzner-8`
- Workspace lives in the `workspace-korczewski` namespace, with `WEBSITE_NAMESPACE=website-korczewski`.
- Has its own `shared-db` — DB password rotations on one cluster never propagate to the other.

**ArgoCD federation** still hub-runs on mentolder. Annotations on the cluster Secrets
(`cluster-mentolder`, `cluster-korczewski-ha`) drive the per-cluster overlay path
(`prod-mentolder` vs `prod-korczewski`). The spoke RBAC for korczewski-ha lives in
`argocd/spoke-rbac/korczewski-ha.yaml` (ServiceAccount `argocd-manager` in ns `argocd`,
cluster-admin binding, long-lived token Secret); `task argocd:cluster:register`
applies it and bootstraps the `cluster-korczewski-ha` Secret on the hub from the
SA's CA + bearer token (API server `https://204.168.244.104:6443`).

**WireGuard mesh (`wg-mesh`):** since the partition fix, all mentolder nodes —
Hetzner CPs and home workers — peer over `wg-mesh` with Flannel pinned to that
interface (`flannel-iface=wg-mesh` on Hetzner CPs, `node-ip=<public>` for the
control-planes). VXLAN now traverses correctly; system-pod nodeAffinity to
Hetzner nodes is no longer load-bearing for connectivity (it remains for
predictable placement of CoreDNS/ArgoCD/etc.).

```bash
task ha:setup                    # Bootstrap 3-node k3s HA cluster on Hetzner (run once — historical)
task ha:import-image -- <path> <image:tag>  # Build and import image to all HA nodes
task ha:cert-renew               # Renew HA cluster certificates
task ha:status                   # Show HA cluster status
```

### TLS & DNS (Production)
```bash
task cert:install                # Install cert-manager + lego DNS-01 webhook
task cert:secret -- <key>        # Store ipv64 API key as Secret
task cert:status                 # Show wildcard cert and ClusterIssuer status
```

### Environments & Secrets
```bash
task env:validate ENV=<env>      # Validate an env file against environments/schema.yaml
task env:validate:all            # Validate all env files
task env:show ENV=<env>          # Print resolved environments/<env>.yaml
task env:init ENV=<new>          # Scaffold a new environments/<new>.yaml from schema
task env:generate ENV=<env>      # Generate fresh secrets into environments/.secrets/<env>.yaml
task env:seal ENV=<env>          # Encrypt .secrets/<env>.yaml → environments/sealed-secrets/<env>.yaml
task env:fetch-cert ENV=<env>    # Fetch a cluster's sealing cert into environments/certs/<env>.pem
task config:show ENV=<env>       # Show resolved PROD_DOMAIN/BRAND_NAME/CONTACT_EMAIL for an env
```

### Tracking, tickets, theming, and other day-to-day tasks
```bash
task tracking:psql ENV=<env>             # psql into the bachelorprojekt tracking schema
task tracking:backfill                   # Re-emit tracking JSON for historical PRs into tracking/pending/
task tracking:backfill:dry               # Dry-run of tracking:backfill (prints what would be written)
task tracking:ingest:local               # Drain tracking/pending/ into bachelorprojekt.features (needs TRACKING_DB_URL)
task keycloak:sync ENV=<env>             # Reconcile Keycloak realm + client config from JSON
task workspace:sync-db-passwords ENV=<env>  # Reconcile shared-db role passwords against the current SealedSecret
task workspace:fix-tickets-grants ENV=<env> # Re-grant ticket-schema permissions to service roles
task tickets:sunset:audit ENV=<env>      # Report ticket-system migrations still pending
task tickets:sunset ENV=<env>            # Apply pending ticket-sunset migrations
task workspace:theme ENV=<env>           # Re-apply Nextcloud branding (logos, colours, app order)
task workspace:verify ENV=<env>          # Post-deploy smoke probes (per env)
task workspace:verify:all-prods          # Same, fanned out across both prod clusters
task db:diagram                          # Render a current schema ER diagram
task gemini:setup:all                    # Generate Gemini CLI configs for all roles in one go
task claude-code:export                  # Export the current Claude Code agent definitions
task claude-code:invite                  # Mint an invite token for a Claude Code business user
task claude-code:rotate-tokens           # Rotate the auth-proxy + agent tokens
```

### Testing
```bash
./tests/runner.sh local              # All tests against k3d
./tests/runner.sh local <TEST-ID>    # Single test (e.g., SA-08, FA-03)
./tests/runner.sh local --verbose    # Verbose output
./tests/runner.sh report             # Generate Markdown report
task test:unit                        # Run BATS unit tests (assertion lib, scripts, configs)
task test:manifests                   # Validate kustomize output structure (no cluster needed)
task test:all                         # Run all offline tests: unit + manifests + dry-run
```

Test IDs: `FA-01`--`FA-29` (functional), `SA-01`--`SA-10` (security), `NFA-01`--`NFA-09` (non-functional), `AK-03`, `AK-04` (acceptance).
Note: gaps in FA-/SA- numbering (FA-01..08, FA-22, SA-06, SA-09) reflect the removal of Mattermost and InvoiceNinja from the stack — see git history. Many other tests have individual test cases conditionally skipped when their preconditions are not met.

## Architecture

All services run as Kubernetes Deployments in the `workspace` namespace, fronted by Traefik (built-in k3s ingress). There is no docker-compose.

```mermaid
graph TB
    Traefik["fa:fa-globe Traefik Ingress (80/443)"]

    subgraph workspace ["Namespace: workspace"]
        KC["fa:fa-key Keycloak<br/>auth.localhost"]
        NC["fa:fa-cloud Nextcloud + Talk<br/>files.localhost"]
        CO["fa:fa-file-word Collabora Online<br/>office.localhost"]
        HPB["fa:fa-video Talk HPB Signaling<br/>signaling.localhost"]
        VW["fa:fa-lock Vaultwarden<br/>vault.localhost"]
        WB["fa:fa-chalkboard Whiteboard<br/>board.localhost"]
        BRETT["fa:fa-sitemap Brett 3D Board<br/>brett.localhost"]
        MP["fa:fa-envelope Mailpit<br/>mail.localhost"]
        DOCS["fa:fa-file-lines Docs<br/>docs.localhost"]
        DS["fa:fa-file-signature DocuSeal<br/>sign.localhost"]
        TR["fa:fa-list-check Tracking<br/>tracking.localhost"]
        OAUTH2[oauth2-proxy-docs]
        WHISPER["fa:fa-microphone Whisper<br/>Transkription"]
        TRBOT["fa:fa-closed-captioning Talk Transcriber"]
        JANUS[Janus + NATS + coturn]
        LK["fa:fa-broadcast-tower LiveKit Server<br/>livekit.localhost (hostNet)"]
        LKI["fa:fa-tower-broadcast LiveKit Ingress<br/>stream.localhost (RTMP)"]
        LKE["fa:fa-record-vinyl LiveKit Egress<br/>(recording)"]
        DB[("fa:fa-database PostgreSQL 16<br/>shared-db")]
    end

    subgraph website-ns ["Namespace: website"]
        WEB["fa:fa-globe Website Astro + Messaging<br/>web.localhost"]
    end

    Traefik --> KC & NC & CO & HPB & VW & WB & BRETT & MP & DOCS & DS & TR & WEB & LK & LKI

    KC -. OIDC .-> NC & VW & WEB & DS & TR & BRETT
    OAUTH2 --> KC
    DOCS --> OAUTH2
    NC --> CO
    NC --> HPB --> JANUS
    HPB --> TRBOT --> WHISPER
    WEB --> LK
    LKI --> LK
    LK --> LKE
    KC & NC & DS & TR --> DB
    BRETT --> DB
    WEB --> DB
```

### Key components
- **`k3d/`** -- All base Kubernetes manifests (Kustomize). This is the only deployment path.
- **`prod/`** -- Shared production patches (TLS, resource limits, replicas, DDNS) consumed by the env-specific overlays. Never apply directly.
- **`prod-mentolder/`, `prod-korczewski/`** -- Per-env overlays referenced by `ENV_OVERLAY` in `environments/<env>.yaml`. This is what `workspace:deploy` actually applies in prod.
- **`environments/`** -- Config & secrets registry:
  - `environments/<env>.yaml` -- per-env config (domain, context, env_vars, setup_vars), read by `scripts/env-resolve.sh`.
  - `environments/.secrets/<env>.yaml` -- plaintext secrets (gitignored; only used as input to `env:seal`).
  - `environments/sealed-secrets/<env>.yaml` -- encrypted SealedSecret (committed; applied before manifests).
  - `environments/schema.yaml` -- authoritative list of every env/setup var; validated by `env:validate`.
  - `environments/certs/` -- per-cluster sealing certs fetched via `env:fetch-cert`.
- **`deploy/`** -- Kustomize overlays for dev iteration. Contains `mcp/` for MCP server overlays.
- **`argocd/`** -- ArgoCD AppProject + three ApplicationSets (`applicationset.yaml`, `applicationset-office.yaml`, `applicationset-coturn.yaml`) and the `install/` CMP sidecar.
- **`brett/`** -- Node.js 3D systemic-constellation board (Systembrett) at `brett.localhost`; deployed as `k3d/brett.yaml`.
- **`claude-code/`** -- Claude Code configuration and system prompt.
- **`scripts/`** -- Bash utility scripts for migration, user import, DSGVO checks, MCP registration, Stripe setup, env resolution/generation/sealing, etc.
- **`tests/`** -- Bash + Playwright test framework. `runner.sh` orchestrates all test categories.
- **`website/`** -- Astro + Svelte website.
- **`docs-site/`** -- Docsify index.html for the docs service.

### Configuration patterns
- **Centralized domains**: All hostnames defined in `k3d/configmap-domains.yaml`. Never hardcode hostnames elsewhere.
- **Per-env config**: `PROD_DOMAIN`, `BRAND_NAME`, `CONTACT_EMAIL`, `ENV_CONTEXT`, `ENV_OVERLAY`, SMTP, etc. live in `environments/<env>.yaml`. `scripts/env-resolve.sh` exports them; tasks then `envsubst` them into manifests.
- **Prod secrets**: plaintext in `environments/.secrets/<env>.yaml` (gitignored) → `task env:seal ENV=<env>` → committed SealedSecret in `environments/sealed-secrets/<env>.yaml`. `workspace:deploy` applies the SealedSecret before manifests.
- **Dev secrets**: `k3d/secrets.yaml` (dev values only — never commit real credentials). The `prod/` overlay strips this via `$patch: delete` so sealed secrets survive.
- **Keycloak realm**: dev uses `k3d/realm-workspace-dev.json`; each prod overlay provides its own `realm-workspace-<env>.json`.
- **Nextcloud OIDC**: `k3d/nextcloud-oidc-dev.php` (dev) / `prod/nextcloud-oidc-prod.php` (prod), both loaded as ConfigMap.
- **SSO flow**: Keycloak is the OIDC provider; Nextcloud, Vaultwarden, DocuSeal, Tracking, the website, and Claude Code all authenticate through it.

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on every PR:
- Offline tests: `task test:all` (BATS unit tests, kustomize manifest structure, Taskfile dry-run)
- **Test inventory check**: re-runs `task test:inventory` and fails the job if `website/src/data/test-inventory.json` differs from the committed version — regenerate it locally and commit alongside any test additions.
- Systembrett template validation (`scripts/tests/systembrett-template.test.sh`)
- Security scan: image-pin advisory + hardcoded-secret detection in `k3d/*.yaml`

Other workflows: `e2e.yml` (nightly Playwright against both prod clusters), `track-pr.yml` (PR → tracking JSON), `tracking.yml` (drain into DB), `track-plans.yml`, `build-collabora.yml`, `build-tracking.yml`, `build-transcriber.yml`.

## Development Rules

1. Only deploy via k3d/k3s with Kustomize (`k3d/` is the base).
2. All changes via Pull Requests -- no direct pushes to `main`.
3. Use **squash-and-merge** to keep `main` history clean.
4. CI must be green before merge.
5. Validate manifests before committing: `task workspace:validate`.
6. After modifying Kubernetes manifests, run the relevant test(s): `./tests/runner.sh local <TEST-ID>`.
7. Branch naming: `feature/*`, `fix/*`, `chore/*`.

## Gotchas & Footguns

Non-obvious repo behaviors. Violating these silently breaks things or hits the wrong cluster.

### Environment targeting
- **`ENV=` is always explicit.** Env-sensitive tasks (`workspace:deploy`, `workspace:office:deploy`, `workspace:post-setup`, `docs:deploy`, `workspace:talk-setup`, etc.) default to `ENV=dev` when unset. The kubectl context mismatch check only runs when `ENV != dev`, so a missing `ENV=` + wrong active context silently deploys to whatever cluster is current. Always pass `ENV=mentolder` or `ENV=korczewski` for live work — or use the `feature:*` / `*:all-prods` umbrellas which fan out across both prod clusters explicitly.
- **All workspace tasks now honour `WORKSPACE_NAMESPACE`.** Earlier the Taskfile and several `scripts/*.sh` hardcoded `-n workspace`, which silently wrote korczewski-targeted post-config (theming, OIDC redirects, talk signaling) into mentolder's `workspace` namespace. After 2026-05-05 every ENV-aware task sources `env-resolve.sh` and uses `${WORKSPACE_NAMESPACE:-workspace}` (mentolder=`workspace`, korczewski=`workspace-korczewski`); scripts default to `${NAMESPACE:-${WORKSPACE_NAMESPACE:-workspace}}` and the Taskfile call sites export the env var before invoking. If you add a new task that touches workspace resources, follow this pattern.
- **ArgoCD tasks are hub-only and enforce it.** All `argocd:*` tasks live in `Taskfile.argocd.yml` and have a `_hub-guard` precondition that aborts with a clear error if the `mentolder` context is unreachable. `ENV=korczewski` is silently ignored — it does NOT redirect kubectl to korczewski.
- **`mentolder` and `korczewski-ha` are two physical clusters.** The 2026-05-05 merge was reverted on 2026-05-09 (PRs #621/#622). The `korczewski-ha` context targets a standalone 3-node cluster on `pk-hetzner-4/6/8`; korczewski.de no longer routes through mentolder Traefik. Each cluster has its own `shared-db`, sealed-secrets controller, cert-manager, and Keycloak realm — anything cross-cluster (DB password rotation, OIDC client tweaks, schema changes) must be applied to **both** explicitly.

### Cluster node placement (mentolder)
- **System pods are pinned to Hetzner nodes by nodeAffinity, even though the CNI partition is fixed.** Pre-2026-05-05 Flannel VXLAN couldn't traverse the WireGuard double-hop; the fix moved every mentolder node onto the `wg-mesh` overlay with `flannel-iface=wg-mesh` (and `node-ip=<public>` on the Hetzner CPs). Connectivity now works end-to-end, but CoreDNS/ArgoCD/etc. stay pinned to `gekko-hetzner-*` for predictable placement and lower egress latency. Removing the affinity won't break DNS today — but unpinning without thinking about it loses the deliberate locality.
- **`wg-mesh` membership is load-bearing for mentolder.** Adding a node without joining the mesh + setting `flannel-iface=wg-mesh` will silently break pod-to-pod traffic from that node. See `wireguard/` for the peer config and the partition-fix memory for the gory details.

### Kustomize overlays
- **Apply `prod-mentolder/` or `prod-korczewski/`, never base `prod/` alone.** The base `prod/` exists to be consumed by the env-specific overlays. It also contains a `$patch: delete` on the `workspace-secrets` Secret — applying `prod/` directly relies on the sealed secret existing and can leave the cluster without credentials.
- **Never remove the `$patch: delete` block in `prod/kustomization.yaml`.** Its job is to strip the dev placeholder from `k3d/secrets.yaml` so SealedSecrets-managed secrets survive each deploy. Removing it overwrites production secrets with dev values.
- **Collabora and CoTURN are NOT in the base kustomization.** `k3d/office-stack` and `k3d/coturn-stack` deploy via separate ArgoCD Applications (`argocd/applicationset-office.yaml`, `argocd/applicationset-coturn.yaml`) and `task workspace:office:deploy`. A full bring-up order is `workspace:deploy` → `workspace:office:deploy` → CoTURN apply.
- **Website image `:latest` is intentional** (`k3d/website.yaml`). CI warns about `:latest` elsewhere; do not "fix" the website tag to a digest — it is rebuilt and re-imported per deploy.

### Scripts & env
- **`scripts/env-resolve.sh` must be sourced, never executed.** It uses `return 1 2>/dev/null || exit 1`, so `bash scripts/env-resolve.sh` exits the parent shell and subsequent task commands never run. Always `source scripts/env-resolve.sh "$ENV"`.
- **`envsubst` variable lists are hardcoded per task in `Taskfile.yml` (not `Taskfile.yaml`).** If you add a new `${VAR}` reference to a manifest, also add it to the `envsubst "\$VAR1 \$VAR2 ..."` list in every task that builds that manifest, or the placeholder stays literal and kubectl apply fails with an invalid manifest. Key locations: dev deploy (line ~1117, vars: `PROD_DOMAIN BRAND_NAME CONTACT_EMAIL BRAND_ID`), prod deploy (line ~1145, dynamic `ENVSUBST_VARS` build — append there), `mcp:deploy` (line ~1350), `workspace:office:deploy` (line ~510).
- **`env:generate ENV=<target>` must run before `env:seal` and before deploying prod.** `talk-hpb-setup.sh` aborts on placeholder `MANAGED_EXTERNALLY` values if signaling/turn secrets were never generated.

### Operational
- **Docs ConfigMap is not auto-synced by ArgoCD.** After changing `docs-site/` or the `docs-content` ConfigMap, run `task docs:deploy` (it now updates and restarts both clusters in one go — `docs:restart` was removed as it was a no-op alias). Applying the ConfigMap alone leaves the old content served.
- **No yamllint/shellcheck/kubeconform in CI.** Earlier docs claimed these ran on PRs; the current `ci.yml` only runs `task test:all`. Run `yamllint`/`shellcheck` locally if you want lint feedback before pushing.
- **LiveKit needs node-pinning + DNS-pinning + ufw rules.** `livekit-server` runs with `hostNetwork: true` (workspace ns is `pod-security: privileged` for this) and is pinned via `nodeAffinity` to `gekko-hetzner-3` (mentolder). The Hetzner host firewall blocks all inter-node traffic except 80/443 — `prod/cloud-init.yaml` opens 7880/tcp + 7881/tcp + 50000-60000/udp + 30000-40000/udp on every node. `livekit.<domain>` and `stream.<domain>` should DNS-pin to the pin-node IP via `task livekit:dns-pin` (browsers otherwise hit a non-LiveKit node ~66% of the time and ICE silently fails). `Room.connect()` must run from a user gesture — Chrome blocks the AudioContext otherwise.

### Korczewski homepage uses the Kore design system (different from mentolder)

`web.korczewski.de` and `web.mentolder.de` no longer share a layout. `website/src/pages/index.astro` branches on `process.env.BRAND_ID ?? process.env.BRAND` and renders the components under `website/src/components/kore/` for the `korczewski` brand. Mentolder still uses the existing Hero/WhyMe/ServiceRow/... Svelte components.

The Kore homepage shows a live PR-driven timeline:
- Every merged PR triggers `.github/workflows/track-pr.yml` → writes `tracking/pending/<pr>.json` to main.
- The `tracking-import` CronJob in workspace ns drains pending into `bachelorprojekt.features` every 5 minutes.
- The homepage reads `bachelorprojekt.v_timeline` (joined to `bugs.bug_tickets.fixed_in_pr` for fix counts) via `/api/timeline`.

To backfill historical PRs: `task tracking:backfill && task tracking:ingest:local` (the latter requires `TRACKING_DB_URL` from a port-forward to shared-db).

The env var is `BRAND` in the Kubernetes ConfigMap (`k3d/website.yaml`) and `BRAND_ID` in local dev — `index.astro` reads both with `process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder'`.

### Local-first LLM pipeline

- **The GPU host is a single, user-provided box on `wg-mesh`** (RTX 5070 Ti, 16 GB). Both prod clusters share it via three Services (`llm-gateway-embed:8081`, `llm-gateway-rerank:8082`, `llm-gateway-chat:11434`) that point at the same `${LLM_HOST_IP}`. Losing the host stalls embedding indexing on `bge-m3` collections and makes chat-class requests return 503 (no cloud fallback). Voyage-tagged collections are unaffected.
- **Embeddings/rerank NEVER fall back across vector spaces.** A `bge-m3` collection always queries with bge-m3 and **fails closed** if TEI is down. A `voyage-multilingual-2` collection always queries with Voyage. The `MixedEmbeddingModelError` rejects multi-collection queries that span both. Don't "fix" this by adding silent fallback — vectors from different spaces in the same `<=>` query mean garbage retrieval.
- **`llm-gpu.yaml` and `llm-router.yaml` are in `prod/` overlay only.** Dev (k3d) has no GPU and no router; `embeddings.ts` falls through to direct Voyage when `LLM_ENABLED=false`. Don't add them to `k3d/kustomization.yaml`.
- **`LLM_HOST_IP` is required when `LLM_ENABLED=true`.** Set it in `environments/<env>.yaml` to the GPU host's wg-mesh IP. The `llm:deploy` task aborts if unset.
- **Model swap costs ~3-6s on first call after idle.** Ollama's `OLLAMA_KEEP_ALIVE=5m` evicts idle models; the next request pays the swap. Router's chat-class timeout is 30s — beyond that, it falls back to Anthropic. Don't set the timeout below ~10s without testing all four models cold.
