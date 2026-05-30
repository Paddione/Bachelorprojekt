# CLAUDE.md

## Agent Routing

Before responding to any request, check these signals and delegate to the named agent:

| Signals | Agent |
|---------|-------|
| `website/`, Astro, Svelte, component, homepage, kore, brand, CSS, UI, frontend, design | `bachelorprojekt-website` |
| pod, logs, status, restart, crash, health, kubectl, "what's wrong", "why is X failing", "is X running" | `bachelorprojekt-ops` |
| `k3d/`, `prod*/`, manifest, kustomize, overlay, Taskfile, `ENV=`, `environments/`, `flux/`, deploy | `bachelorprojekt-infra` |
| test, `FA-*`, `SA-*`, `NFA-*`, `AK-*`, BATS, Playwright, `runner.sh`, test case, "test failing", "write a test" | `bachelorprojekt-test` |
| database, PostgreSQL, psql, schema, query, backup, restore, tracking, timeline, `bachelorprojekt.features`, `v_timeline` | `bachelorprojekt-db` |
| SealedSecret, Keycloak realm, OIDC, DSGVO, credentials, rotate, certificate, secret | `bachelorprojekt-security` |

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
bash scripts/task-oracle.sh 'deploy website to both prod clusters'
bash scripts/task-oracle.sh 'show pod status for mentolder'
bash scripts/task-oracle.sh 'run all offline tests'
bash scripts/task-oracle.sh 'create a fresh k3d cluster'
```

Routes to Hermes (local `qwen/qwen3-4b-2507` via LM Studio at `100.102.71.114:1234`, free) → OpenClaw `task-runner` agent (Claude fallback) → error with `task --list` hint.

## Architecture

All services run as Kubernetes Deployments in the `workspace` namespace, fronted by Traefik (built-in k3s ingress). There is no docker-compose.

Services: Traefik → Keycloak (OIDC), Nextcloud+Talk, Collabora, Talk-HPB+coturn+Janus, Vaultwarden, Whiteboard, Brett, Mailpit, Docs (oauth2-proxy), DocuSeal, Tracking, LiveKit+Ingress+Egress, Website (separate `website` ns). All except Website share `workspace` ns. Shared PostgreSQL 16 (`shared-db`). Keycloak provides SSO for Nextcloud, Vaultwarden, DocuSeal, Tracking, Website, Claude Code.

### Cluster Topology & Nodes (Fleet Stage 2 migration IN PROGRESS — 2026-05-30)
- **mentolder**: Still a STANDALONE k3s cluster, ALIVE, running on Hetzner host nodes (`gekko-hetzner-*`) plus 3 Raspberry Pi worker nodes (`k3w-1`, `k3w-2`, `k3w-3` as arm64 workers). Its migration onto the fleet is a *reversible DNS flip* (see `docs/fleet-stage2-cutover-runbook.md`) and is NOT done yet.
- **korczewski (BRAND)**: The standalone korczewski cluster has been **TORN DOWN** (intentional). Its hosts `pk-hetzner-4/6/8` now run the unified **`fleet`** k3s cluster. Operate the korczewski brand via the **`fleet`** context, namespace `workspace-korczewski`. The old `korczewski` kubeconfig context (`204.168.244.104:6443`) is **DEAD** — that IP now serves the fleet k3s CA (x509 error, T000340). `korczewski`/`fleet-korczewski`/`BRAND=korczewski` remain valid brand/env identifiers.
- **`fleet`**: The unified cluster on `pk-hetzner-4/6/8`. `task fleet:deploy` **HAS been run (Phase 2a complete)** — both brands' core workloads are deployed and Running: namespace `workspace` (mentolder brand) and `workspace-korczewski` are each at **26/26** pods (PRs #1193, #1205, #1206, #1213). The fleet API is reached via the **pk-4 public IP**, not the `127.0.0.1:16443` tunnel. **Still pending (Phase 2b/2c):** Collabora office-stack + CoTURN live deploy on fleet (mechanism merged #1197, not yet run), the wildcard cert won't issue (T000351, so coturn is cert-gated), website apps are not yet on fleet, and the **DNS cutover is NOT done** — `korczewski.de` and `mentolder.de` still route to their existing endpoints (mentolder remains a live standalone cluster; the flip is reversible). Cutover mechanism merged (PR #1189): `scripts/fleet-dns-cutover.sh`, `task fleet:dns:cutover|rollback`; the LIVE cutover is NOT done. See plan T000338.

### Key components
- **`k3d/`** -- All base Kubernetes manifests (Kustomize). This is the base for both manual `task workspace:deploy` (push) and Flux GitOps (pull).
- **`prod/`** -- Shared production patches (TLS, resource limits, replicas, DDNS) consumed by the env-specific overlays. Never apply directly.
- **`prod-mentolder/`, `prod-korczewski/`** -- Per-env overlays referenced by `ENV_OVERLAY` in `environments/<env>.yaml`. This is what `workspace:deploy` actually applies in prod.
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
- `arena-server` build + unit/integration tests (pnpm, real Postgres service container)
- **Arena protocol drift guard**: `arena-server/src/proto/messages.ts` and `website/src/components/arena/shared/lobbyTypes.ts` must be byte-identical — CI fails if they diverge

Other workflows: `e2e.yml` (nightly Playwright against both prod clusters), `build-brett.yml` (tag `brett-v*`), `build-arena-server.yml` (tag `arena-server-v*`), `build-docs.yml` (tag `docs-v*`), `build-collabora.yml`, `build-transcriber.yml`, `build-website.yml` / `build-website-korczewski.yml` (auto build+rollout on `website/**` push to main), `dev-auto-deploy.yml` (auto-deploy to dev.mentolder.de on relevant push), `dev-smoke.yml` (nightly BATS against dev.mentolder.de at 05:00 UTC).
Note: `tracking-import` CronJob was removed in PR #788 (2026-05-15); `track-pr.yml` was removed in PR #993 (2026-05-23); `build-tracking.yml` and `track-plans.yml` are gone — both parts of the tracking pipeline are fully removed. The Kore homepage timeline still renders from `v_timeline` but shows only historical data (last tracked PR: #787).

## Development Rules

1. Only deploy via k3d/k3s with Kustomize (`k3d/` is the base). In prod, use Flux GitOps for automated reconciliation.
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
- **`mentolder` and `korczewski` were two separate physical clusters.** The 2026-05-05 merge was reverted on 2026-05-09 (PRs #621/#622); korczewski.de no longer routes through mentolder Traefik. **Since then (Fleet Stage 2, 2026-05-30) the standalone korczewski cluster has been TORN DOWN** — its `pk-hetzner-4/6/8` hosts now run the unified `fleet` cluster. The old `korczewski` kubeconfig context (`204.168.244.104:6443`) is **DEAD** (now serves the fleet CA, T000340); operate the korczewski BRAND via the **`fleet`** context, namespace `workspace-korczewski`. The "apply cross-cutting changes (DB password rotation, OIDC client tweaks, schema changes) to **both** explicitly" rule **still holds today** because mentolder is still its own cluster with its own `shared-db`, sealed-secrets controller, cert-manager, and Keycloak realm — it will collapse only once fleet hosts both brands (after the mentolder DNS flip).

### Cluster node placement (mentolder)
- **System pods are pinned to Hetzner nodes by nodeAffinity, even though the CNI partition is fixed.** Pre-2026-05-05 Flannel VXLAN couldn't traverse the WireGuard double-hop; the fix moved every mentolder node onto the `wg-mesh` overlay with `flannel-iface=wg-mesh` (and `node-ip=<public>` on the Hetzner CPs). Connectivity now works end-to-end, but CoreDNS/etc. stay pinned to `gekko-hetzner-*` for predictable placement and lower egress latency. Removing the affinity won't break DNS today — but unpinning without thinking about it loses the deliberate locality.
- **`wg-mesh` membership is load-bearing for mentolder.** Adding a node without joining the mesh + setting `flannel-iface=wg-mesh` will silently break pod-to-pod traffic from that node. See `wireguard/` for the peer config and the partition-fix memory for the gory details.

### Kustomize overlays
- **Apply `prod-mentolder/` or `prod-korczewski/`, never base `prod/` alone.** The base `prod/` exists to be consumed by the env-specific overlays. It also contains a `$patch: delete` on the `workspace-secrets` Secret — applying `prod/` directly relies on the sealed secret existing and can leave the cluster without credentials.
- **Never remove the `$patch: delete` block in `prod/kustomization.yaml`.** Its job is to strip the dev placeholder from `k3d/secrets.yaml` so SealedSecrets-managed secrets survive each deploy. Removing it overwrites production secrets with dev values.
- **Collabora and CoTURN are NOT in the base kustomization.** `k3d/office-stack` and `k3d/coturn-stack` are deployed separately via `task workspace:office:deploy`. A full bring-up order is `workspace:deploy` → `workspace:office:deploy` → CoTURN apply.
- **Website, Brett, and Docs images use `:latest` intentionally** (`k3d/website.yaml`, `k3d/brett.yaml`, `k3d/docs.yaml`). CI warns about `:latest` for all three; do not "fix" these tags to a digest — each image is rebuilt and re-imported/pushed on every release (`task feature:brett`, `task docs:deploy`, `task feature:website`).

### Scripts & env
- **`scripts/env-resolve.sh` must be sourced, never executed.** It uses `return 1 2>/dev/null || exit 1`, so `bash scripts/env-resolve.sh` exits the parent shell and subsequent task commands never run. Always `source scripts/env-resolve.sh "$ENV"`.
- **`envsubst` variable lists are hardcoded per task in `Taskfile.yml` (not `Taskfile.yaml`).** If you add a new `${VAR}` reference to a manifest, also add it to the `envsubst "\$VAR1 \$VAR2 ..."` list in every task that builds that manifest, or the placeholder stays literal and kubectl apply fails with an invalid manifest. Key locations: dev deploy (line ~1117, vars: `PROD_DOMAIN BRAND_NAME CONTACT_EMAIL BRAND_ID`), prod deploy (line ~1145, dynamic `ENVSUBST_VARS` build — append there), `mcp:deploy` (line ~1350), `workspace:office:deploy` (line ~510).
- **`env:generate ENV=<target>` must run before `env:seal` and before deploying prod.** `talk-hpb-setup.sh` aborts on placeholder `MANAGED_EXTERNALLY` values if signaling/turn secrets were never generated.

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
- **Flux: reconcile source before kustomization.** After a PR merges, `flux reconcile kustomization workspace --context <env>` may apply the OLD revision if the GitRepository hasn't polled yet. Always prime with `flux reconcile source git flux-system --context <env>` first, then reconcile the kustomization. Applies to both clusters.
- **Pull-first.** Always `git pull --rebase origin main` before any work. With dirty tree: `git stash && git pull --rebase && git stash pop`. The `dev-flow-plan`/`dev-flow-execute`/`using-git-worktrees` skills enforce this automatically.
- **Docs source is `k3d/docs-content-built/` (pre-built HTML), not a Markdown source tree.** The `docs/` directory holds the Markdown source; `node scripts/build-docs.js` compiles it to HTML in `k3d/docs-content-built/`. Deploy via `task docs:deploy` (build + Docker image push + rollout on both clusters). **`docs:sync` does NOT work** — `kubectl cp` fails with "Read-only file system" because the static-web-server container runs with a read-only rootfs. `docs:configmap:apply` is kept only for kustomize validation — it has no visible effect on running pods.
- **No yamllint/shellcheck/kubeconform in CI.** Earlier docs claimed these ran on PRs; the current `ci.yml` only runs `task test:all`. Run `yamllint`/`shellcheck` locally if you want lint feedback before pushing.
- **LiveKit needs node-pinning + DNS-pinning + ufw rules.** `livekit-server` runs with `hostNetwork: true` (workspace ns is `pod-security: privileged` for this) and is pinned via `nodeAffinity` to `gekko-hetzner-3` (mentolder). The Hetzner host firewall blocks all inter-node traffic except 80/443 — `prod/cloud-init.yaml` opens 7880/tcp + 7881/tcp + 50000-60000/udp + 30000-40000/udp on every node. `livekit.<domain>` and `stream.<domain>` should DNS-pin to the pin-node IP via `task livekit:dns-pin` (browsers otherwise hit a non-LiveKit node ~66% of the time and ICE silently fails). `Room.connect()` must run from a user gesture — Chrome blocks the AudioContext otherwise.

### Korczewski homepage uses the Kore design system (different from mentolder)

`web.korczewski.de` and `web.mentolder.de` no longer share a layout. `website/src/pages/index.astro` branches on `process.env.BRAND_ID ?? process.env.BRAND` and renders the components under `website/src/components/kore/` for the `korczewski` brand. Mentolder still uses the existing Hero/WhyMe/ServiceRow/... Svelte components.

The Kore homepage has a timeline section (`BrandConfig.homepage.timeline === true`) that reads from `v_timeline`. The tracking pipeline was fully removed: `tracking-import` CronJob in PR #788, `track-pr.yml` in PR #993; the timeline shows historical data only (last entry: PR #787). New PRs are no longer tracked automatically.

The env var is `BRAND` in the Kubernetes ConfigMap (`k3d/website.yaml`) and `BRAND_ID` in local dev — `index.astro` reads both with `process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder'`.

### Local-first LLM pipeline

- **The GPU host is a single, user-provided box on `wg-mesh`** (RTX 5070 Ti, 16 GB). Both prod clusters share it via three Services (`llm-gateway-embed:8081`, `llm-gateway-rerank:8082`, `llm-gateway-chat:11434`) that point at the same `${LLM_HOST_IP}`. Losing the host stalls embedding indexing on `bge-m3` collections and makes chat-class requests return 503 (no cloud fallback). Voyage-tagged collections are unaffected.
- **Embeddings/rerank NEVER fall back across vector spaces.** A `bge-m3` collection always queries with bge-m3 and **fails closed** if TEI is down. A `voyage-multilingual-2` collection always queries with Voyage. The `MixedEmbeddingModelError` rejects multi-collection queries that span both. Don't "fix" this by adding silent fallback — vectors from different spaces in the same `<=>` query mean garbage retrieval.
- **`llm-gpu.yaml` and `llm-router.yaml` are in `prod/` overlay only.** Dev (k3d) has no GPU and no router; `embeddings.ts` falls through to direct Voyage when `LLM_ENABLED=false`. Don't add them to `k3d/kustomization.yaml`.
- **`LLM_HOST_IP` is required when `LLM_ENABLED=true`.** Set it in `environments/<env>.yaml` to the GPU host's wg-mesh IP. The `llm:deploy` task aborts if unset.
- **Model swap costs ~3-6s on first call after idle.** Ollama's `OLLAMA_KEEP_ALIVE=5m` evicts idle models; the next request pays the swap. Router's chat-class timeout is 30s — beyond that, it falls back to Anthropic. Don't set the timeout below ~10s without testing all four models cold.
- **OpenClaw on the WSL host** (`openclaw/`, `Taskfile.openclaw.yml`) talks directly to Ollama on `10.10.0.3:11434/v1`, **not** through `llm-router` — llm-router has no Ingress, and adding one is Phase 2 work. Bootstrap: `task openclaw:install && task openclaw:configure`. Operational: `task openclaw:start` (restart daemon), `task openclaw:status` (health probe), `task openclaw:logs` (journalctl tail), `task openclaw:backup` / `task openclaw:restore` (snapshot ~/.openclaw), `task openclaw:wipe CONFIRM=yes` (destructive reset).

### dev.mentolder.de stack

- **The dev k3d cluster runs on `k3s-1` as a Docker sibling of the k3s control-plane.** `task dev:cluster:create` SSHes to that node — running it elsewhere fails. Recreating the cluster without `task dev:cluster:create` loses the load-bearing port mappings (`127.0.0.1:18080`, `0.0.0.0:2222`, `127.0.0.1:15432`).
- **Dev sees prod data.** The 03:30 UTC `dev-db-refresh` CronJob drops + recreates the prod databases in `shared-db-dev` (the CronJob targets `website`, `bugs`, `bachelorprojekt` but **skips any DB not present on the prod source** — in practice only `website` exists on prod `shared-db`, so only it is refreshed). Since #1130 (T000286) the refresh **streams a live `pg_dump` from the prod `shared-db` Service over the cluster network**, not the encrypted snapshot files — the old Longhorn `backup-pvc` mount was dropped because the `$DEV_NODE` (k3s-1) pin has no Longhorn CSI driver. The local `task dev:db:refresh` path still restores from snapshot files. Don't write production rituals against the dev DB — they will be erased nightly.
- **SSH 2222 is publicly exposed** but ufw-deny-default'd. Per-CIDR allow rules apply via `task dev:firewall:open` (reads `DEV_SSH_ALLOWLIST` from `environments/mentolder.yaml`). Even allowlisted clients still need a key in `DEV_SISH_AUTHORIZED_KEYS` to publish tunnels.
- **Dev secrets are sealed against the mentolder cert** (the dev-db-refresh CronJob runs in prod), but materialised inside dev k3d as plain Secrets by `task dev:_materialise-secrets`. Don't `kubectl apply environments/sealed-secrets/mentolder.yaml` to the `k3d-mentolder-dev` context — there's no sealed-secrets controller there.
- **`workspace-dev` Keycloak client enforces `/dev-access` group membership at the oauth2-proxy layer** (`--allowed-groups=/dev-access`). Add yourself in the KC admin UI before the first visit, else you'll loop on 403.

### WSL Bootstrapping & Workstation Setup

- **`task` command collision:** On Ubuntu 24.04 (and newer), `apt install task` installs `taskwarrior` instead of `go-task`. Use `snap install task --classic` or install via the official go-task script.
- **Docker Desktop integration:** WSL integration is not auto-enabled for new distros, which blocks all build/k3d/docker work. Enable it manually under Docker Desktop Settings > Resources > WSL Integration.
- **SSH Key Permissions:** Private keys copied from Windows mount points often arrive with `644` permissions, which SSH will refuse. Run `chmod 600 ~/.ssh/id_ed25519` to fix.
- **Node.js Version requirements:** Enforced via `.nvmrc` and `engines` in `package.json` (requires Node.js >= 22.13.0 for pnpm 11 compatibility).
- See [WSL-BOOTSTRAP.md](file:///home/patrick/Bachelorprojekt/docs/WSL-BOOTSTRAP.md) for more details.

