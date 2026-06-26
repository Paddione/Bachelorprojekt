# Gemini CLI Context: Workspace MVP

> **Authoritative reference:** [CLAUDE.md](CLAUDE.md) — full task reference, agent routing, gotchas, and production-cluster topology. This file is a Gemini-CLI-shaped summary; defer to CLAUDE.md when in doubt.

## Project Overview

Kubernetes-based self-hosted collaboration platform (bachelor thesis). Beide Marken laufen auf dem unified `fleet` Cluster (3 CP pk-hetzner-4/6/8, 3 Worker gekko-hetzner-2/3/4) plus k3d for dev. All services in `workspace` (mentolder) / `workspace-korczewski` (korczewski) namespaces, fronted by Traefik.

**Core Services:**
*   **Keycloak:** Identity Provider (SSO/OIDC, eigene Realm pro Brand)
*   **Nextcloud + Talk:** Dateien, Kalender, Kontakte, Video
*   **Collabora Online:** WOPI-Backend für Nextcloud (separater `task workspace:office:deploy` Overlay)
*   **Talk HPB:** WebRTC Signaling (Janus + NATS + coturn)
*   **Vaultwarden:** Password manager (Bitwarden-kompatibel)
*   **DocuSeal:** E-Signature
*   **Whiteboard / Brett (Systembrett):** Kollaborative Tools
*   **LiveKit (Server + Ingress + Egress):** Streaming + Recording
*   **Website:** Astro + Svelte (Brand-aware: mentolder + korczewski via `BRAND_ID`)
*   **Claude Code MCP Monolith:** AI-Tooling
*   **Traefik:** Ingress Controller
*   **PostgreSQL `shared-db`:** Eigene Instanz pro Brand/Namespace (workspace / workspace-korczewski), separate DBs pro Service

**Infrastructure:**
*   k3d (Dev) + k3s (Prod, unified `fleet`-Cluster). Kustomize-basierte Manifeste, **push-basiert** deployt via `task workspace:deploy` — kein Flux/Argo-Reconciler auf dem Cluster.
*   SealedSecrets (bitnami) pro Brand; Secrets-Pipeline via `task env:seal ENV=<env>`.

## Building and Running

The project relies heavily on [`task`](https://taskfile.dev/) as the unified command runner. 

### Quick Start
To set up the cluster and deploy the full Workspace MVP locally:
```bash
task workspace:up
```

### Key Task Commands
*   `task cluster:create` / `task cluster:delete`: Manage the local k3d development cluster.
*   `task workspace:deploy`: Deploy the main workspace services via Kustomize.
*   `task workspace:status`: View the status of pods, services, and ingress rules.
*   `task workspace:logs -- <service>`: Tail logs for a specific service.
*   `task website:dev`: Run the Astro website dev server with hot-reload.
*   `task mcp:deploy`: Deploy Claude Code MCP pods.
*   `task test:all`: Run all offline tests (unit, manifests, dry-run).
*   `task workspace:dsgvo-check`: Run DSGVO/GDPR compliance verification (NFA-01).
*   `task workspace:sync-db-passwords`: Sync DB passwords between K8s secrets and Postgres roles (run after secret rotation).
*   `task workspace:vaultwarden:seed`: Seed production Vaultwarden with secret templates (critical after fresh prod deploy).

### Specialized Taskgroups
*   **`wireguard:*`**: Manage the VPN tunnel connecting the local GPU worker (for AI transcription) to the production cluster.
*   **`keycloak:sync`**: Push realm config and secret updates to the live cluster without a full redeploy.
*   **`sealed-secrets:*`**: Lifecycle of the Sealed Secrets controller (required for `env:seal`).
*   **`einvoice-sidecar:*`**: Build and manage the ZUGFeRD/XRechnung sidecar image (Java/Mustangproject).
*   **`billing:validate-einvoice`**: Validate e-invoice XML/PDF output locally.

### User Lifecycle Management
*   `task workspace:create-guest`: Provision a guest account in Keycloak and Nextcloud.
*   `task workspace:import-users`: Bulk-import users from CSV.
*   `task workspace:migrate`: Interactive data migration assistant.

*Tip: Review the `Taskfile.yml` or run `task --list` for an exhaustive list of available commands.*

## Operational Footguns & Warnings

### Session-Koordination (parallele Agenten — Claude + Gemini)

Mehrere Agenten-Sessions teilen ein `.git`/denselben Checkout. `scripts/agent-lock.sh` (dateibasierte Claims unter `.git/agent-locks/`, Identität via Unix-Session-ID) verhindert Doppelarbeit und main-Checkout-Races. Kontrakt:

- **Start jeder Session/Skill:** `bash scripts/agent-lock.sh reap` — räumt Zombie-Prozesse (cwd auf gelöschtem Worktree), stale Worktrees und tote Locks.
- **Vor Ticket-/Branch-Arbeit:** `bash scripts/agent-lock.sh claim ticket <ext-id> --branch <b> --worktree <wt> --label <skill>` (und `claim branch <b>`). Exit 1 = eine **lebende** Session arbeitet bereits daran → koordinieren oder anderes Ticket, NICHT duplizieren.
- **Am Ende / nach Merge:** `bash scripts/agent-lock.sh release ticket <ext-id>` (+ `release branch <b>`).
- **main-Checkout:** Commits im main-Checkout sind über `.githooks/pre-commit` **hart gesperrt**, wenn eine andere lebende Session den `main-checkout`-Lock hält (Gate nur im main-Checkout, in Worktrees übersprungen, fail-open). Override: `AGENT_LOCK_FORCE=1 git commit …`. Besser: in einem Worktree (`scripts/worktree-create.sh`) arbeiten. Setzt `core.hooksPath=.githooks` voraus (via `task secrets:install-hooks`).
- **Wer macht was:** `bash scripts/agent-lock.sh list`.
- Live-Claims blocken auch die **Software Factory** (Dispatcher überspringt interaktiv geclaimte Tickets).
- Optionaler **SessionStart-Reaper:** `.claude/settings.json` ist gitignored (lokal/maschinengebunden) — wer den Reaper bei jedem Session-Start (nicht nur dev-flow) will, fügt lokal hinzu: `{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"bash scripts/agent-lock.sh reap 2>/dev/null || true"}]}]}}`.

> [!CAUTION]
> **ENV= Behavior & Context Safety:**
> The `ENV=` variable is explicit. Omitting it defaults to `dev`. 
> **Crucially:** The kubectl context mismatch check **only runs when `ENV != dev`**.
> If your active kubectl context points to a production cluster and you run a command without `ENV=`, you will deploy `dev` configuration to `prod` without warning. Always verify your context or use explicit `ENV=` flags.

## Development Conventions

1.  **Kubernetes Native:** The only deployment path is k3d/k3s. `docker-compose` is not used for deployment.
2.  **Manifest Location:** All base Kubernetes manifests reside in `k3d/`. Production is applied via the `prod-fleet/mentolder/` and `prod-fleet/korczewski/` overlays — each wraps the legacy `prod-mentolder/` / `prod-korczewski/` brand overlay plus the shared `prod/` patches.
3.  **Kustomize:** Kustomize is the primary tool for orchestrating Kubernetes manifests.
4.  **Git Workflow:** Changes must be made via Pull Requests. No direct pushes to `main`.
5.  **CI Enforcement:** `task test:all` (BATS unit tests, kustomize manifest dry-run, Taskfile lint), test-inventory drift guard, image-pin/secret scan must pass before merging. `yamllint`/`shellcheck`/`kubeconform` are NOT in CI — run locally if you want them.
6.  **Centralized Domains:** Domain configuration is centralized in `k3d/configmap-domains.yaml`. Hardcoded hostnames in manifests are forbidden.
7.  **Secrets Management:** Development secrets are in `k3d/secrets.yaml`. **Never commit real credentials.** Production uses Sealed Secrets.
8.  **Testing:** Automated tests (Bash + Playwright + BATS) are run locally via `./tests/runner.sh local`.

## Service Architecture: coturn & TLS Sync

### coturn & High Performance Backend (HPB)
*   **Namespace:** `coturn` (privileged PSA for hostNetwork access).
*   **Deployment:** Pinned to a public node via `${TURN_NODE}` with `hostNetwork: true`.
*   **Internal DNS:** Reachable as `coturn.coturn` and `janus.coturn` via dedicated ClusterIP services within the `coturn` namespace.
*   **Signaling:** `spreed-signaling` uses hard `podAffinity` to co-locate with `janus` on the same physical node, ensuring WebSocket traffic stays on the loopback path and bypasses cross-node firewall blocks.

### TLS Certificate Sync (`tls-sync`)
*   **Mechanism:** A monthly CronJob (`prod/reflector.yaml`) copies the wildcard TLS secret from the authoritative workspace namespace to consumer namespaces (`coturn`, `workspace-office`, `website`).
*   **Multi-Tenancy:** RBAC (ServiceAccount/ClusterRoleBinding) and metadata are parameterized via `${WORKSPACE_NAMESPACE}` to ensure correct permissions on per-environment namespaces (e.g., `workspace-korczewski`).
*   **Manual Trigger:** To sync certs immediately after rotation: `kubectl create job --from=cronjob/tls-sync tls-sync-manual`.

## Documentation
Additional detailed documentation (Architecture, Services, Keycloak SSO, Migration, etc.) can be served locally via `task docs:deploy` and viewed at `http://docs.localhost`. Markdown sources are located in `k3d/docs-content/`.