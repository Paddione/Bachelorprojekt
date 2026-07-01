# CLAUDE.md

## Agent Routing

Before responding to any request, check these signals and delegate to the named agent. The signal lists below mirror the routing table in [`AGENTS.md`](AGENTS.md) — which is the single source of truth (it matches each agent's `description:` frontmatter in `.agents/agents/<name>.md`).

> **Subagent file layout:** `.claude/agents/bachelorprojekt-*.md` is the canonical source. `.agents/agents` is a directory symlink to `../.claude/agents` — both Claude Code and opencode read the same content via the symlink. Edit files at `.claude/agents/<name>.md` (or its `.agents/agents/<name>.md` alias).

| Signals | Agent | MCP-Primär (Claude Code) |
|---------|-------|--------------------------|
| `website/`, Astro, Svelte, component, homepage, kore, mentolder brand, CSS, UI, frontend, design | `bachelorprojekt-website` | — |
| pod, logs, status, restart, crash, health, kubectl, "what's wrong", "why is X failing", "is X running", `llm:`, GPU, Ollama, model, LiveKit | `bachelorprojekt-ops` | `mcp-kubernetes` (localhost:18080) — Claude-Code-only SSE server, see `mcp-tool-guide.md` |
| `k3d/`, `prod*/`, manifest, kustomize, overlay, Taskfile, `ENV=`, `environments/`, deploy, `workspace:setup` | `bachelorprojekt-infra` | `mcp-kubernetes` (localhost:18080) — nur Status-Checks (Claude-Code-only) |
| test, `FA-*`, `SA-*`, `NFA-*`, `AK-*`, `FA-SF`, BATS, Playwright, `runner.sh`, "test failing", "test case", "write a test", `factory:`, autopilot | `bachelorprojekt-test` | `mcp-postgres` (localhost:13001) — Ticket-Queries |
| database, PostgreSQL, psql, schema, query, backup, restore, tracking, timeline, `bachelorprojekt.features`, `v_timeline` | `bachelorprojekt-db` | `mcp-postgres` (localhost:13001) |
| SealedSecret, Keycloak realm, OIDC, DSGVO, credentials, rotate, certificate, secret | `bachelorprojekt-security` | — |

> **MCP-Server names in this table refer to Claude-Code-only SSE servers** configured in `.claude/skills/references/mcp-tool-guide.md`. The opencode runtime registers its MCP servers in `.opencode/opencode.jsonc`: `mcp-kubernetes`, `mcp-postgres`, `factory-mcp`, `codebase-memory-mcp`, `mcp-task-runner`, `ticket-mcp` (same `mcp-kubernetes` name as the table; `factory-mcp` is the HTTP factory server on `:13003`). If you are running in opencode, see the `MCP-Schnellweg` block below and the opencode config, not the table above.

> **Agent-Routing-Karten:** Generierte, grepbare Karten unter `docs/agent-guide/maps/` — `goals-map.md` (Intention → Weg → Tier → Guardrails), `tools-map.md`, `danger-map.md`. Quelle: `docs/agent-guide/registry/` (nicht von Hand editieren; via `task agent-guide:maps` regenerieren).

> **MCP-Schnellweg:** Welcher MCP-Server wann bevorzugt wird (statt `kubectl exec … psql`), steht in [`.claude/skills/references/mcp-tool-guide.md`](.claude/skills/references/mcp-tool-guide.md) — inkl. Portforward-Guard und der kubectl-Pflicht für DDL/Superuser/Writes.

> **gh-axi:** Bevorzugter GitHub-CLI-Wrapper für alle Agents (`gh-axi` statt `gh`). Kommando-Referenz: [`.claude/skills/references/gh-axi.md`](.claude/skills/references/gh-axi.md).

**Before dispatching any agent, inject active plan context:**
Run `bash scripts/plan-context.sh <role> --with-openspec` and prepend output to the agent prompt wrapped in `<active-plans>` tags. If the script produces no output, omit the block entirely. `--with-openspec` auto-loads the SSOT spec(s) for any files changed vs main — omit only when explicitly told to skip OpenSpec context.

```bash
# Example orchestrator injection pattern:
context=$(bash scripts/plan-context.sh infra --with-openspec)
if [[ -n "$context" ]]; then
  prompt="<active-plans>\n${context}\n</active-plans>\n\n${task_prompt}"
fi
```

Also: after `superpowers:writing-plans` skill creates a new plan file, run `bash scripts/plan-frontmatter-hook.sh <plan-file>` on it before committing. This adds the required frontmatter (domains, status) that `plan-context.sh` and the GH Action depend on.

**Tie-break rule:** when signals overlap (e.g. "deploy the website"), prefer the domain of the files being changed — `bachelorprojekt-website` for `website/src/` changes, `bachelorprojekt-infra` for manifest/overlay changes.

**Cross-cutting requests** (e.g. a feature spanning both website and k8s) stay with the main orchestrator, which coordinates multiple agents in sequence.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Default Workflow

For any work request in this repo (add/change/fix/build), invoke **`dev-flow-plan`** (`.claude/skills/dev-flow-plan/SKILL.md`). It declares the path, and for **feature/fix** does worktree setup, brainstorming, spec, and plan creation — then commits and pushes the plan to the branch and stops. **Chores** (maintenance, no behavior change) route to **`dev-flow-chore`** (`.claude/skills/dev-flow-chore/SKILL.md`), which executes and merges inline (no plan/execute handoff). When ready to implement a staged plan, invoke **`dev-flow-execute`** (`.claude/skills/dev-flow-execute/SKILL.md`) — it picks up the plan, runs implementation, verification, PR, and post-merge deploy. All auto-invoke via their `description` frontmatter; no special wiring needed. The `dev-flow-*` skills are project orchestrators that call the generic `superpowers:*` skills for discipline — see `.claude/skills/OVERVIEW.md` (Schicht-Kontrakt) for the layering and which step calls which.

### OpenSpec native change workflow
Specifications are written in the OpenSpec format under `openspec/`. Drive the lifecycle with the upstream **`/opsx:*` commands** — `/opsx:propose <slug>` (skeleton, status `planning`), `/opsx:apply <slug>` (mark implementable, status `plan_staged`), `/opsx:archive <slug>` (archive a done change + merge its delta into the SSOT spec), `/opsx:explore` (think-through). The `task openspec:propose|apply|archive` wrappers are **equivalent fallbacks** for environments without the OpenSpec CLI installed; `task openspec:validate` is the fail-closed CI gate. Authoring conventions (German Purpose, English Requirements/Scenarios, task sizing) are SSOT in **`openspec/config.yaml`**. Full contract: **AGENTS.md → "OpenSpec conventions"** (the cross-harness single source of truth — this block mirrors it).

**Delta-Spec-Konvention (T001304):** Delta-Dateien in `openspec/changes/<slug>/specs/` werden nach dem **Parent-SSOT-Slug** benannt, nicht nach dem Change-Slug. Für Sub-Features einer bestehenden Komponente: `openspec.sh propose <change-slug> --ticket T… --target-spec <parent-slug>`. Für eine wirklich neue Komponente: `openspec.sh archive <change-slug> --create-new`. Ohne `--create-new` schlägt `archive` fehl, wenn der Ziel-SSOT-Spec noch nicht existiert.

### Domain conventions: Merge = Abschluss (T001092)

Ein Ticket wird bei **grünem Auto-Merge nach `main` direkt geschlossen** (`done · resolution=shipped`) —
einheitlich für Factory (`pipeline.js`) und dev-flow-execute (inkl. Batches). Der Prod-Deploy ist
**entkoppelt** (push-based) und ändert den Ticket-Status NICHT. `awaiting_deploy` und `qa_review` sind
**aus dem Happy-Path entfernt**, bleiben aber als Enum-Werte gültig (historische Zeilen, manuelle
Sonderfälle, Watchdog-Sicherheitsnetz `awaiting_deploy > 24h`). Es gibt keine separate
„gemergt-aber-noch-nicht-live"-Ruhestufe mehr; Closure trackt **Merge**, nicht Prod-Live. Der Factory-Floor
blendet die `awaiting_deploy`-Lane jetzt leer aus (sie rendert nur noch bei manuell zurückgehaltenen Tickets).
Quality-Gate-Ergebnisse werden als `verify`-Phase-Events (`tickets.factory_phase_events`, strukturiertes
`detail`) erfasst.

## Project Overview

**Workspace MVP** -- a Kubernetes-based self-hosted collaboration platform for small teams (bachelor thesis). Integrates a custom messaging system (chat, built into the Astro website), Nextcloud (files + video via Talk), Keycloak (SSO/OIDC), Collabora (office suite), Claude Code (AI), Vaultwarden (passwords), and supporting services. All data stays on-premises (DSGVO/GDPR by design).

Prerequisites: Docker, k3d, kubectl, `task` (go-task).


## Running Tasks

Never look up or hardcode task commands. Use the task oracle instead:

```bash
bash scripts/vda.sh oracle '<goal in plain English>'
```

Examples:
```bash
bash scripts/vda.sh oracle 'deploy website to mentolder and korczewski brands'
bash scripts/vda.sh oracle 'show pod status for mentolder'
bash scripts/vda.sh oracle 'run all offline tests'
bash scripts/vda.sh oracle 'create a fresh k3d cluster'
```

**Agent flags** (for programmatic/automated use):
- `--dry-run` / `-n` — resolve and print the task command without executing it (safe for pre-flight checks)
- `--json` — like `--dry-run` but outputs `{"task":"...","env":"...","cmd":"..."}` on stdout
- `--quiet` / `-q` — suppress diagnostic lines on stderr (useful in pipelines)

```bash
# Pre-flight: check what would run before committing to it
bash scripts/vda.sh oracle --dry-run 'deploy website mentolder'
# → task feature:website ENV=mentolder

# Machine-readable for agent scripts
bash scripts/vda.sh oracle --json 'run all offline tests'
# → {"task":"test:all","env":"","cmd":"task test:all"}
```

Routes to local Ollama (at `localhost:11434`) → Opencode/OpenClaw `task-runner` agent (fallback) → error with `task --list` hint.

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
- **`prod-mentolder/`, `prod-korczewski/`** -- Legacy standalone-cluster brand overlays. **No longer applied directly** — they survive only as the inner base the `prod-fleet/*` wrappers reuse. Don't apply these standalone.
- **`environments/`** -- Config & secrets registry:
  - `environments/<env>.yaml` -- per-env config (domain, context, env_vars, setup_vars), read by `scripts/env-resolve.sh`.
  - `environments/.secrets/<env>.yaml` -- plaintext secrets (git-crypt-encrypted at-rest, **tracked** — not gitignored; see `scripts/git-crypt-guard.sh`; only used as input to `env:seal`).
  - `environments/sealed-secrets/<env>.yaml` -- encrypted SealedSecret (committed; applied before manifests).
  - `environments/schema.yaml` -- authoritative list of every env/setup var; validated by `env:validate`.
  - `environments/certs/` -- per-cluster sealing certs fetched via `env:fetch-cert`.
- **`deploy/`** -- Kustomize overlays for dev iteration. Contains `mcp/` for MCP server overlays.
- **`brett/`** -- Node.js 3D systemic-constellation board (Systembrett) at `brett.localhost`; deployed as `k3d/brett.yaml`.
- **`claude-code/`** -- Claude Code configuration and system prompt.
- **`scripts/`** -- Bash utility scripts for migration, user import, DSGVO checks, MCP registration, Stripe setup, env resolution/generation/sealing, etc.
- **`tests/`** -- Bash + Playwright test framework. `runner.sh` orchestrates all test categories.
- **`website/`** -- Astro + Svelte website. See `website/CLAUDE.md` for dev quick-start and content patterns; full standards in `website/WEBSITE-STANDARDS.md`.
- **`k3d/docs-content-built/`** -- Pre-built HTML served by the `docs` Deployment. Source is compiled by `node scripts/build-docs.mjs` from the `docs/` directory and skill HTML. Deploy via `task docs:deploy` (builds image). **`docs:sync` does NOT work** (read-only rootfs on the container).

### Configuration patterns
- **Centralized domains**: All hostnames defined in `k3d/configmap-domains.yaml`. Never hardcode hostnames elsewhere.
- **Per-env config**: `PROD_DOMAIN`, `BRAND_NAME`, `CONTACT_EMAIL`, `ENV_CONTEXT`, `ENV_OVERLAY`, SMTP, etc. live in `environments/<env>.yaml`. `scripts/env-resolve.sh` exports them; tasks then `envsubst` them into manifests.
- **Prod secrets**: plaintext in `environments/.secrets/<env>.yaml` (git-crypt-encrypted at-rest, tracked) → `task env:seal ENV=<env>` → committed SealedSecret in `environments/sealed-secrets/<env>.yaml`. `workspace:deploy` applies the SealedSecret before manifests.
- **Dev secrets**: `k3d/secrets.yaml` (dev values only — never commit real credentials). The `prod/` overlay strips this via `$patch: delete` so sealed secrets survive.
- **Keycloak realm**: dev uses `k3d/realm-workspace-dev.json`; each prod overlay provides its own `realm-workspace-<env>.json`.
- **Nextcloud OIDC**: `k3d/nextcloud-oidc-dev.php` (dev) / `prod/nextcloud-oidc-prod.php` (prod), both loaded as ConfigMap.
- **SSO flow**: Keycloak is the OIDC provider; Nextcloud, Vaultwarden, DocuSeal, Tracking, the website, and Claude Code all authenticate through it.

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on every PR:
- Offline tests: `task test:all` (BATS unit tests, kustomize manifest structure, Taskfile dry-run)
- **Test inventory check**: re-runs `task test:inventory` and fails the job if `website/src/data/test-inventory.json` differs from the committed version — regenerate it locally and commit alongside any test additions.
- **BATS convention (tests/spec/)**: New `@test` entries belong in `tests/spec/<spec-slug>.bats` (one file per OpenSpec SSOT spec in `openspec/specs/`). Do NOT create new ticket-numbered files (`FA-SF-42.bats`). If the spec file doesn't exist yet, create it (see `tests/spec/software-factory.bats` as template). Fallback for cross-cutting tests without a clear spec: `tests/unit/`.
- **Release notes**: Generate structured release notes from merged PRs via `bash scripts/vda.sh release-notes generate` or `task release:notes` (LLM/DeepSeek-gestützt mit deterministischem Fallback). Publish to GitHub Release body with `publish-github` or prepend to `CHANGELOG.md` with `publish-changelog`.
- Systembrett template validation (`scripts/tests/systembrett-template.test.sh`)
- Security scan: image-pin advisory + hardcoded-secret detection in `k3d/*.yaml`
Other workflows: `renovate.yml` (self-hosted Renovate weekly dependency update bot, T000898), `e2e.yml` (nightly Playwright against both brands on fleet), `build-brett.yml` (tag `brett-v*`), `build-docs.yml` (tag `docs-v*`), `build-collabora.yml`, `build-transcriber.yml`, `build-website.yml` / `build-website-korczewski.yml` (auto build+rollout on `website/**` push to main).
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

Non-obvious repo behaviors are documented in full at
[`docs/superpowers/references/gotchas-footguns.md`](docs/superpowers/references/gotchas-footguns.md).

Covered sub-topics (reference file, not repeated here):
- **security-guidance rewake** — never git-restore after a commit rewake
- **Session-Koordination** — agent-lock.sh claim/release/reap protocol
- **Environment targeting** — ENV= is always explicit; WORKSPACE_NAMESPACE
- **Cluster node placement** — wg-fleet flannel-iface; LiveKit node-pin
- **Kustomize overlays** — prod-fleet/* only; never bare prod/; $patch:delete
- **Scripts & env** — env-resolve.sh must be sourced; envsubst lists
- **Database queries** — never SELECT * on ticket_plans.content
- **Cluster reset order** — sealed-secrets → fetch-cert → seal → cert → deploy
- **Operational** — push-based; pull-first; CONFLICTING PR suppresses CI
- **Staging (ENV=staging)** — workspace-staging ns; LiveKit disabled
- **Kore design system** — korczewski brand uses website/src/components/kore/
- **Local-first LLM pipeline** — GPU host; vector space isolation; LM Studio
- **dev.mentolder.de stack** — devc decommissioned; WSL bootstrap caveats

### Brett

### Bug-Triage-Konvention (CFR-Gate G-DORA03)

**Jeder nach-Merge entdeckte Fehler wird als `type=bug`-Ticket erfasst.**
Kein stiller `fix()`-Commit ohne Ticket-Referenz. Die Change Failure Rate
(broad proxy: fix()-Rate) wird mit `bash scripts/vda.sh cfr` gemessen —
Ziel: ≤ 15 % über 8 Wochen. Ein ungeticketer `fix()`-Commit zählt als
verschleierter Bug und verschlechtert den Proxy-Wert, ohne dass er in der
DORA-Auswertung unter `/admin/dora` erscheint.

Ablauf: Bug entdecken → `bash scripts/ticket.sh create --type bug --title "..."` →
Branch + PR → nach Merge wird Ticket automatisch `done`.

