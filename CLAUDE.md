# CLAUDE.md

## Agent Routing

Before responding to any request, check these signals and delegate to the named agent:

| Signals | Agent |
|---------|-------|
| `website/`, Astro, Svelte, component, homepage, kore, brand, CSS, UI, frontend, design | `bachelorprojekt-website` |
| pod, logs, status, restart, crash, health, kubectl, "what's wrong", "why is X failing", "is X running" | `bachelorprojekt-ops` |
| `k3d/`, `prod*/`, manifest, kustomize, overlay, Taskfile, `ENV=`, `environments/`, deploy | `bachelorprojekt-infra` |
| test, `FA-*`, `SA-*`, `NFA-*`, `AK-*`, BATS, Playwright, `runner.sh`, test case, "test failing", "write a test" | `bachelorprojekt-test` |
| database, PostgreSQL, psql, schema, query, backup, restore, tracking, timeline, `bachelorprojekt.features`, `v_timeline` | `bachelorprojekt-db` |
| SealedSecret, Keycloak realm, OIDC, DSGVO, credentials, rotate, certificate, secret | `bachelorprojekt-security` |

> **Agent-Routing-Karten:** Generierte, grepbare Karten unter `docs/agent-guide/maps/` — `goals-map.md` (Intention → Weg → Tier → Guardrails), `tools-map.md`, `danger-map.md`. Quelle: `docs/agent-guide/registry/` (nicht von Hand editieren; via `task agent-guide:maps` regenerieren).

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

## Default Workflow

For any work request in this repo (add/change/fix/build), invoke **`dev-flow-plan`** (`.claude/skills/dev-flow-plan/SKILL.md`). It handles path declaration (feature/fix/chore), worktree setup, brainstorming, spec, and plan creation — then commits and pushes the plan to the branch and stops. Chores execute fully inline. When ready to implement a staged plan, invoke **`dev-flow-execute`** (`.claude/skills/dev-flow-execute/SKILL.md`) — it picks up the plan, runs implementation, verification, PR, and post-merge deploy. Both skills auto-invoke via their `description` frontmatter; no special wiring needed.

## Project Overview

**Workspace MVP** -- a Kubernetes-based self-hosted collaboration platform for small teams (bachelor thesis). Integrates a custom messaging system (chat, built into the Astro website), Nextcloud (files + video via Talk), Keycloak (SSO/OIDC), Collabora (office suite), Claude Code (AI), Vaultwarden (passwords), and supporting services. All data stays on-premises (DSGVO/GDPR by design).

Prerequisites: Docker, k3d, kubectl, `task` (go-task).


## Running Tasks

Never look up or hardcode task commands. Use the task oracle instead:

```bash
bash scripts/task-oracle.sh '<goal in plain English>'
```

Examples:
```bash
bash scripts/task-oracle.sh 'deploy website to mentolder and korczewski brands'
bash scripts/task-oracle.sh 'show pod status for mentolder'
bash scripts/task-oracle.sh 'run all offline tests'
bash scripts/task-oracle.sh 'create a fresh k3d cluster'
```

Routes to local Ollama (at `localhost:11434`) or local LM Studio (at `localhost:1234`) → Opencode/OpenClaw `task-runner` agent (fallback) → error with `task --list` hint.

## Architecture

All services run as Kubernetes Deployments in the `workspace` namespace, fronted by Traefik (built-in k3s ingress). There is no docker-compose.

Services: Traefik → Keycloak (OIDC), Nextcloud+Talk, Collabora, Talk-HPB+coturn+Janus, Vaultwarden, Whiteboard, Brett, Mailpit, Docs (oauth2-proxy), DocuSeal, Tracking, LiveKit+Ingress+Egress, Website (separate `website` ns). All except Website share `workspace` ns. Shared PostgreSQL 16 (`shared-db`). Keycloak provides SSO for Nextcloud, Vaultwarden, DocuSeal, Tracking, Website, Claude Code.

### Cluster Topology & Nodes (Fleet Stage 3 — FULLY CONSOLIDATED 2026-05-31)
- **mentolder (BRAND)**: DNS for `mentolder.de` routes to the **`fleet`** cluster (pk-hetzner-4/6/8 IPs: 204.168.244.104/37.27.251.38/62.238.23.79). The mentolder-standalone cluster has been **DECOMMISSIONED** — all k3s software uninstalled from gekko-hetzner-2/3/4; those nodes joined fleet as workers. Use `ENV=mentolder` or `ENV=fleet-mentolder` (aliases) with context `fleet`, namespace `workspace`. Both the old `mentolder` and `korczewski` kubeconfig contexts are **DEAD**. `k3s-1` has been permanently **DECOMMISSIONED** (memory corruption 2026-05-31). Local development runs via k3d on the WSL host (context: `k3d-mentolder-dev`).
- **korczewski (BRAND)**: The standalone korczewski cluster has been **TORN DOWN** (intentional, PR #1189). Its hosts `pk-hetzner-4/6/8` now run the unified **`fleet`** k3s cluster. DNS for `korczewski.de` routes to fleet. Operate the korczewski brand via the **`fleet`** context, namespace `workspace-korczewski` (`ENV=fleet-korczewski` or `ENV=korczewski`).
- **`fleet`**: The unified cluster — **3 CP nodes** (pk-hetzner-4/6/8) + **3 worker nodes** (gekko-hetzner-2/3/4). Both brands at **26/26** pods in `workspace` and `workspace-korczewski`. All kubeconfig contexts other than `fleet` and `k3d-mentolder-dev` are dead. Single source of truth for all production workloads.

### Key components
- **`k3d/`** -- All base Kubernetes manifests (Kustomize). This is the base that `task workspace:deploy` (push) applies in prod. Deployment is **push-based** — there is no in-cluster GitOps reconciler (no Flux/Argo) on the fleet cluster.
- **`prod/`** -- Shared production patches (TLS, resource limits, replicas, DDNS) consumed by the env-specific overlays. Never apply directly.
- **`prod-fleet/mentolder/`, `prod-fleet/korczewski/`** -- The per-brand overlays **actually applied in prod**, referenced by `ENV_OVERLAY` (the `overlay:` key) in `environments/mentolder.yaml` / `environments/korczewski.yaml`. Each *wraps* the legacy brand overlay (`resources: ../../prod-mentolder` / `../../prod-korczewski`) and layers the `fleet-common` component + fleet node-affinity repoints on top. `task workspace:deploy ENV=<brand>` builds `prod-fleet/<brand>`.
- **`prod-mentolder/`, `prod-korczewski/`** -- Legacy standalone-cluster brand overlays. **No longer applied directly** — they survive only as the inner base the `prod-fleet/*` wrappers reuse (plus a few Taskfile call sites, e.g. arena). Don't apply these standalone.
- **`environments/`** -- Config & secrets registry:
  - `environments/<env>.yaml` -- per-env config (domain, context, env_vars, setup_vars), read by `scripts/env-resolve.sh`.
  - `environments/.secrets/<env>.yaml` -- plaintext secrets (gitignored; only used as input to `env:seal`).
  - `environments/sealed-secrets/<env>.yaml` -- encrypted SealedSecret (committed; applied before manifests).
  - `environments/schema.yaml` -- authoritative list of every env/setup var; validated by `env:validate`.
  - `environments/certs/` -- per-cluster sealing certs fetched via `env:fetch-cert`.
- **`deploy/`** -- Kustomize overlays for dev iteration. Contains `mcp/` for MCP server overlays.
- **`brett/`** -- Node.js 3D systemic-constellation board (Systembrett) at `brett.localhost`; deployed as `k3d/brett.yaml`.
- **`claude-code/`** -- Claude Code configuration and system prompt.
- **`scripts/`** -- Bash utility scripts for migration, user import, DSGVO checks, MCP registration, Stripe setup, env resolution/generation/sealing, etc.
- **`tests/`** -- Bash + Playwright test framework. `runner.sh` orchestrates all test categories.
- **`website/`** -- Astro + Svelte website. See `website/CLAUDE.md` for dev quick-start and content patterns; full standards in `website/WEBSITE-STANDARDS.md`.
- **`k3d/docs-content-built/`** -- Pre-built HTML served by the `docs` Deployment. Source is compiled by `node scripts/build-docs.js` from the `docs/` directory and skill HTML. Deploy via `task docs:deploy` (builds image). **`docs:sync` does NOT work** (read-only rootfs on the container).

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
Other workflows: `e2e.yml` (nightly Playwright against both brands on fleet), `build-brett.yml` (tag `brett-v*`), `build-docs.yml` (tag `docs-v*`), `build-collabora.yml`, `build-transcriber.yml`, `build-website.yml` / `build-website-korczewski.yml` (auto build+rollout on `website/**` push to main).
Note: `tracking-import` CronJob was removed in PR #788 (2026-05-15); `track-pr.yml` was removed in PR #993 (2026-05-23); `build-tracking.yml` and `track-plans.yml` are gone — both parts of the tracking pipeline are fully removed. The Kore homepage timeline still renders from `v_timeline` but shows only historical data (last tracked PR: #787).

## Development Rules

1. Only deploy via k3d/k3s with Kustomize (`k3d/` is the base). Prod is deployed **push-based** via `task workspace:deploy ENV=<brand>` / `task feature:*` — there is no GitOps reconciler on fleet.
2. All changes via Pull Requests -- no direct pushes to `main`.
3. Use **squash-and-merge** to keep `main` history clean.
4. CI must be green before merge.
5. Validate manifests before committing: `task workspace:validate`.
6. After modifying Kubernetes manifests, run the relevant test(s): `./tests/runner.sh local <TEST-ID>`.
7. Branch naming: `feature/*`, `fix/*`, `chore/*`.

## Gotchas & Footguns

Non-obvious repo behaviors. Violating these silently breaks things or hits the wrong cluster.

### Environment targeting
- **`ENV=` is always explicit.** Env-sensitive tasks (`workspace:deploy`, `workspace:office:deploy`, `workspace:post-setup`, `docs:deploy`, `workspace:talk-setup`, etc.) default to `ENV=dev` when unset. The kubectl context mismatch check only runs when `ENV != dev`, so a missing `ENV=` + wrong active context silently deploys to whatever cluster is current. Always pass `ENV=mentolder` (or `ENV=fleet-mentolder`) for the mentolder brand, `ENV=korczewski` (or `ENV=fleet-korczewski`) for korczewski — both resolve to the `fleet` context. Or use `feature:*` / `*:all-prods` umbrellas which fan out across both brands explicitly.
- **All workspace tasks now honour `WORKSPACE_NAMESPACE`.** Earlier the Taskfile and several `scripts/*.sh` hardcoded `-n workspace`, which silently wrote korczewski-targeted post-config (theming, OIDC redirects, talk signaling) into mentolder's `workspace` namespace. After 2026-05-05 every ENV-aware task sources `env-resolve.sh` and uses `${WORKSPACE_NAMESPACE:-workspace}` (mentolder=`workspace`, korczewski=`workspace-korczewski`); scripts default to `${NAMESPACE:-${WORKSPACE_NAMESPACE:-workspace}}` and the Taskfile call sites export the env var before invoking. If you add a new task that touches workspace resources, follow this pattern.
- **Both brands are now on the single `fleet` cluster.** `mentolder` was a separate standalone cluster until 2026-05-31 (Phase 3 decommission); gekko-hetzner-2/3/4 nodes left that cluster and joined fleet as workers. There is no longer a separate mentolder `shared-db`, cert-manager, or Keycloak — fleet owns everything. Cross-cutting changes (DB password rotation, OIDC client tweaks, schema migrations) still need to be applied to **both namespaces** (`workspace` and `workspace-korczewski`) explicitly, because those are separate per-brand deployments within the same cluster.

### Cluster node placement (fleet)
- **All fleet nodes use `wg-fleet` (10.20.0.x) for pod-to-pod traffic.** k3s agents join with `--flannel-iface=wg-fleet`. Adding a node without joining the wg-fleet mesh will silently break pod-to-pod traffic from that node. See `wireguard/wg-mesh-nodes.yaml` for the peer config.
- **LiveKit is pinned to `pk-hetzner-4` via `nodeAffinity`.** It runs with `hostNetwork: true` and needs a stable IP for DNS pinning. The fleet overlay (`prod-fleet/mentolder/kustomization.yaml`) sets this pin. `livekit.<domain>` and `stream.<domain>` should DNS-pin to `204.168.244.104` (pk-hetzner-4) via `task livekit:dns-pin`.

### Kustomize overlays
- **Apply `prod-fleet/mentolder/` or `prod-fleet/korczewski/`, never base `prod/` (or the bare `prod-mentolder/`/`prod-korczewski/`) alone.** `ENV_OVERLAY` resolves to the `prod-fleet/<brand>` wrapper, which reuses the brand overlay + `fleet-common`. The base `prod/` exists to be consumed by the env-specific overlays and contains a `$patch: delete` on the `workspace-secrets` Secret — applying it directly relies on the sealed secret existing and can leave the cluster without credentials.
- **Never remove the `$patch: delete` block in `prod/kustomization.yaml`.** Its job is to strip the dev placeholder from `k3d/secrets.yaml` so SealedSecrets-managed secrets survive each deploy. Removing it overwrites production secrets with dev values.
- **Collabora and CoTURN are NOT in the base kustomization.** `k3d/office-stack` and `k3d/coturn-stack` are deployed separately via `task workspace:office:deploy`. A full bring-up order is `workspace:deploy` → `workspace:office:deploy` → CoTURN apply.
- **Website, Brett, and Docs images use `:latest` intentionally** (`k3d/website.yaml`, `k3d/brett.yaml`, `k3d/docs.yaml`). CI warns about `:latest` for all three; do not "fix" these tags to a digest — each image is rebuilt and re-imported/pushed on every release (`task feature:brett`, `task docs:deploy`, `task feature:website`).

### Scripts & env
- **`scripts/env-resolve.sh` must be sourced, never executed.** It uses `return 1 2>/dev/null || exit 1`, so `bash scripts/env-resolve.sh` exits the parent shell and subsequent task commands never run. Always `source scripts/env-resolve.sh "$ENV"`.
- **`envsubst` variable lists are hardcoded per task in `Taskfile.yml` (not `Taskfile.yaml`).** If you add a new `${VAR}` reference to a manifest, also register it in `environments/schema.yaml` AND the `envsubst` list in every task that builds that manifest. See `docs/superpowers/references/envsubst-variable-management.md` for the complete checklist and common failure modes.
- **`env:generate ENV=<target>` must run before `env:seal` and before deploying prod.** `talk-hpb-setup.sh` aborts on placeholder `MANAGED_EXTERNALLY` values if signaling/turn secrets were never generated.

### Database queries
- **Never run `SELECT *` or query the `content` column on the entire `tickets.ticket_plans` table.** The `content` column stores large plan markdown files, and selecting it over a `kubectl exec` connection will transfer megabytes of data, causing connection timeouts. Always query metadata columns (such as `id`, `ticket_id`, `slug`, `branch`, `pr_number`, `archived_at`) or filter explicitly by a specific `ticket_id` or `slug`.

### Cluster reset / fresh cluster bring-up order
After any cluster reset (including replacing a Sealed Secrets controller keypair), the mandatory order is:

1. `task sealed-secrets:install ENV=<env>` — controller must exist before any SealedSecret is applied
2. `task env:fetch-cert ENV=<env>` — refreshes the sealing cert from the new controller
3. `task env:seal ENV=<env>` — re-encrypts plaintext secrets with the new cert
4. `task cert:install ENV=<env>` — installs cert-manager CRDs; must precede `workspace:deploy`
5. `task cert:secret -- <ipv64-key> ENV=<env>` — stores the ACME DNS-01 key; creates it in both `cert-manager` AND `$WORKSPACE_NAMESPACE`
6. `task workspace:deploy ENV=<env>` — applies SealedSecrets + kustomize overlay

**SealedSecrets keypair rotation is expected on every cluster reset.** Old sealed files won't decrypt. Always run steps 2–3 after a reset.

**`knowledge-secrets` conflict:** if the overlay contains a `secretGenerator`-managed Secret with the same name as a SealedSecret, the controller refuses to adopt it. Delete the plain Secret first (`kubectl delete secret knowledge-secrets -n $WORKSPACE_NS`) then re-apply.

### Operational
- **No GitOps reconciler — prod is push-based.** Merging to `main` does **not** auto-apply to fleet (there is no Flux/Argo controller; `flux-system` does not exist on the cluster). After a merge, deploy explicitly: `task workspace:deploy ENV=mentolder` **and** `ENV=korczewski` (or a `task feature:*` umbrella that fans out across both brands). Website changes auto-roll-out via the `build-website*.yml` Actions (which push with `FLEET_KUBECONFIG`); everything else needs an explicit deploy.
- **Pull-first.** Always `git pull --rebase origin main` before any work. With dirty tree: `git stash && git pull --rebase && git stash pop`. The `dev-flow-plan`/`dev-flow-execute`/`using-git-worktrees` skills enforce this automatically.
- **Docs source is `k3d/docs-content-built/` (pre-built HTML), not a Markdown source tree.** The `docs/` directory holds the Markdown source; `node scripts/build-docs.js` compiles it to HTML in `k3d/docs-content-built/`. Deploy via `task docs:deploy` (build + Docker image push + rollout on fleet for both brands). **`docs:sync` does NOT work** — `kubectl cp` fails with "Read-only file system" because the static-web-server container runs with a read-only rootfs. `docs:configmap:apply` is kept only for kustomize validation — it has no visible effect on running pods.
- **No yamllint/shellcheck/kubeconform in CI.** Earlier docs claimed these ran on PRs; the current `ci.yml` only runs `task test:all`. Run `yamllint`/`shellcheck` locally if you want lint feedback before pushing.
- **LiveKit needs node-pinning + DNS-pinning + ufw rules.** `livekit-server` runs with `hostNetwork: true` (workspace ns is `pod-security: privileged` for this) and is pinned via `nodeAffinity` to `pk-hetzner-4` (fleet). The Hetzner host firewall blocks all inter-node traffic except 80/443 — `prod/cloud-init.yaml` opens 7880/tcp + 7881/tcp + 50000-60000/udp + 30000-40000/udp on every node. `livekit.<domain>` and `stream.<domain>` should DNS-pin to `204.168.244.104` (pk-hetzner-4) via `task livekit:dns-pin` (browsers otherwise hit a non-LiveKit node ~66% of the time and ICE silently fails). `Room.connect()` must run from a user gesture — Chrome blocks the AudioContext otherwise.

### Korczewski homepage uses the Kore design system (different from mentolder)

`web.korczewski.de` and `web.mentolder.de` no longer share a layout. `website/src/pages/index.astro` branches on `process.env.BRAND_ID ?? process.env.BRAND` and renders the components under `website/src/components/kore/` for the `korczewski` brand. Mentolder still uses the existing Hero/WhyMe/ServiceRow/... Svelte components.

The Kore homepage has a timeline section (`BrandConfig.homepage.timeline === true`) that reads from `v_timeline`. The tracking pipeline was fully removed: `tracking-import` CronJob in PR #788, `track-pr.yml` in PR #993; the timeline shows historical data only (last entry: PR #787). New PRs are no longer tracked automatically.

The env var is `BRAND` in the Kubernetes ConfigMap (`k3d/website.yaml`) and `BRAND_ID` in local dev — `index.astro` reads both with `process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder'`.

### Local-first LLM pipeline

- **The GPU host is a single, user-provided box on `wg-mesh`** (RTX 5070 Ti, 16 GB). Both prod environments share it via three Services (`llm-gateway-embed:8081`, `llm-gateway-rerank:8082`, `llm-gateway-chat:11434`) that point at the same `${LLM_HOST_IP}`. Losing the host stalls embedding indexing on `bge-m3` collections and makes chat-class requests return 503 (no cloud fallback). Voyage-tagged collections are unaffected.
- **Embeddings/rerank NEVER fall back across vector spaces.** A `bge-m3` collection always queries with bge-m3 and **fails closed** if TEI is down. A `voyage-multilingual-2` collection always queries with Voyage. The `MixedEmbeddingModelError` rejects multi-collection queries that span both. Don't "fix" this by adding silent fallback — vectors from different spaces in the same `<=>` query mean garbage retrieval.
- **`llm-gpu.yaml` and `llm-router.yaml` are in `prod/` overlay only.** Dev (k3d) has no GPU and no router; `embeddings.ts` falls through to direct Voyage when `LLM_ENABLED=false`. Don't add them to `k3d/kustomization.yaml`.
- **`LLM_HOST_IP` is required when `LLM_ENABLED=true`.** Set it in `environments/<env>.yaml` to the GPU host's wg-mesh IP. The `llm:deploy` task aborts if unset.
- **Model swap costs ~3-6s on first call after idle.** Ollama's `OLLAMA_KEEP_ALIVE=5m` evicts idle models; the next request pays the swap. Router's chat-class timeout is 30s — beyond that, it falls back to Anthropic. Don't set the timeout below ~10s without testing all four models cold.
- **Opencode / OpenClaw on the WSL host** (`openclaw/`, `Taskfile.openclaw.yml`) talks directly to Ollama on `localhost:11434/v1` or `10.10.0.3:11434/v1`, **not** through `llm-router`. Bootstrap: `task openclaw:install && task openclaw:configure`. Operational: `task openclaw:start` (restart daemon), `task openclaw:status` (health probe), `task openclaw:logs` (journalctl tail), `task openclaw:backup` / `task openclaw:restore` (snapshot ~/.openclaw), `task openclaw:wipe CONFIRM=yes` (destructive reset).
- **Cross-brand shared-infrastructure security analysis:** Full analysis in `docs/superpowers/references/shared-infrastructure-security.md` — covers LLM GPU host brand isolation, backup encryption pipeline (AES-256-CBC encrypt-then-upload), Filen/SMTP shared-account risk assessment, and WireGuard mesh peer trust model. Key finding: no data leaks; collections are DB-level isolated per brand; all backups are encrypted before upload.

### dev.mentolder.de stack

**Architecture & Status (2026-06):** The previous 3-node `devc` k3s HA cluster and the legacy `k3s-1` VM have been permanently **DECOMMISSIONED**. A new Proxmox cluster is active at IPs `10.0.0.9`, `10.0.0.11`, and `10.0.0.25`. Local development is performed via local k3d.

- **Storage & Services:** Historical reference: longhorn, shared-db-dev, and sish tunnels are offline. Local dev utilizes standard k3d namespaces.
- **WSL Bootstrapping & Workstation Setup**

- **`task` command collision:** On Ubuntu 24.04 (and newer), `apt install task` installs `taskwarrior` instead of `go-task`. Use `snap install task --classic` or install via the official go-task script.
- **Docker Desktop integration:** WSL integration is not auto-enabled for new distros, which blocks all build/k3d/docker work. Enable it manually under Docker Desktop Settings > Resources > WSL Integration.
- **SSH Key Permissions:** Private keys copied from Windows mount points often arrive with `644` permissions, which SSH will refuse. Run `chmod 600 ~/.ssh/id_ed25519` to fix.
- **Node.js Version requirements:** Enforced via `.nvmrc` and `engines` in `package.json` (requires Node.js >= 22.13.0 for pnpm 11 compatibility).
- See [WSL-BOOTSTRAP.md](file:///home/patrick/Bachelorprojekt/docs/WSL-BOOTSTRAP.md) for more details.

