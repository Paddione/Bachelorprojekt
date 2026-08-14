# QWEN.md — Project Context

## Project Overview

**Workspace MVP** — A Kubernetes-based, self-hosted collaboration platform built as a bachelor thesis by Patrick Korczewski. It bundles Nextcloud (files + Talk), Pocket ID (SSO/OIDC), Collabora (Office), Vaultwarden (passwords), DocuSeal (e-signatures), Whiteboard, Brett (3D system board), and an Astro + Svelte website with integrated chat — all running on k3d/k3s with Traefik Ingress. DSGVO-compliant, all data on-premises.

Two brands are deployed: **mentolder** (mentolder.de) and **korczewski** (korczewski.de), both on a unified `fleet` cluster (Hetzner nodes). Primary deploy path is **pull-based via FluxCD** (OCI artifact → Flux reconciliation); `task workspace:deploy` exists as break-glass fallback only.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Cluster | k3d (dev), k3s (prod), Traefik Ingress |
| GitOps | FluxCD (OCI artifact reconcile via `.github/workflows/render-fleet-artifact.yml`) |
| SSO / OIDC | Pocket ID (~20 seeded clients, see below) |
| Backend services | Node.js 22+, TypeScript, Hono, Drizzle ORM, PostgreSQL 16 |
| Website | Astro + Svelte (pnpm, brand-aware) |
| Brett | Node.js 3D system board (npm) |
| IaC / manifests | Kustomize (base `k3d/`, overlays `prod-fleet/mentolder/`, `prod-fleet/korczewski/`) |
| Task runner | [go-task](https://taskfile.dev) (`Taskfile.yml`, 5000+ lines) |
| Testing | Vitest, BATS (vendored at `tests/unit/lib/bats-core/`), Playwright (E2E) |
| LLM stack | Local Gemma models via llama.cpp, llm-proxy, OpenCode orchestrator |
| CI | GitHub Actions (`.github/workflows/ci.yml`) |
| Secrets | SealedSecrets in `environments/sealed-secrets/` |

## Cluster Topology

**`fleet` cluster** — the only live prod context (unified since 2026-05-31):
- **3 control-plane nodes**: pk-hetzner-4/6/8 (IPs: 204.168.244.104 / 37.27.251.38 / 62.238.23.79)
- **2 worker nodes**: gekko-hetzner-3/4 (`gekko-hetzner-2` is currently NOT in the cluster)
- **mentolder brand**: namespace `workspace`, context `fleet`, `ENV=mentolder` (alias `ENV=fleet-mentolder`)
- **korczewski brand**: namespace `workspace-korczewski`, context `fleet`, `ENV=korczewski` (alias `ENV=fleet-korczewski`)
- Both brands at 26/26 pods. Old standalone clusters (`mentolder`, `korczewski`, `k3s-1`) are **decommissioned** — any other context in `kubectl config get-contexts` points at dead hardware.
- **Local dev**: k3d contexts `k3d-mentolder-dev` and `k3d-korczewski-dev`.

## Repository Layout

```
k3d/                    # Base Kustomize manifests (single deployment path)
  docs-content-built/   #   Pre-built HTML served by docs Deployment (build via scripts/build-docs.mjs)
prod-fleet/             # Prod overlays per brand (actually applied in prod)
  mentolder/            #   mentolder overlay (wraps prod-mentolder + fleet-common + node-affinity)
  mentolder-jobs/       #   Isolated one-shot bootstrap/seed Jobs ($patch: delete non-Job types) [T002207]
  korczewski/           #   korczewski overlay (wraps prod-korczewski + fleet-common + node-affinity)
  korczewski-jobs/      #   Isolated one-shot bootstrap/seed Jobs [T002207]
prod/                   # Shared production patches (TLS, resources, replicas, DDNS) — never apply directly
prod-mentolder/         # Legacy brand overlay — inner base for prod-fleet/mentolder/, never apply standalone
prod-korczewski/        # Legacy brand overlay — inner base for prod-fleet/korczewski/, never apply standalone
environments/           # Per-env config + secrets
  <env>.yaml            #   domain, context, env_vars, setup_vars (read by env-resolve.sh)
  .secrets/<env>.yaml   #   plaintext secrets (git-crypt-encrypted, tracked; input to env:seal)
  sealed-secrets/       #   encrypted SealedSecrets (committed, applied before manifests)
  schema.yaml           #   authoritative env/setup var list (validated by env:validate)
  certs/                #   per-cluster sealing certs (via env:fetch-cert)
website/                # Astro + Svelte website (pnpm, brand-aware)
brett/                  # Node.js 3D system board (npm); deployed as k3d/brett.yaml
scripts/                # ~280 operational scripts (agent, backup, factory, llm, etc.)
taskfiles/              # Included Taskfiles (llm, finetune, factory, staging, ...)
openspec/               # OpenSpec change proposals + SSOT specs (config.yaml = authoring SSOT)
flux/                   # FluxCD cluster definitions
  clusters/fleet/       #   Kustomizations including ks-jobs-mentolder.yaml, ks-jobs-korczewski.yaml
tests/                  # BATS + Playwright test suites
docs/                   # Documentation + agent-guide
mcp-task-runner/        # MCP server for task execution
```

## Key Commands

### Task Oracle (preferred — never hardcode task names)

```bash
bash scripts/vda.sh oracle '<goal in plain English>'
bash scripts/vda.sh oracle --dry-run '<goal>'   # resolve without executing
bash scripts/vda.sh oracle --json '<goal>'      # {"task":"...","env":"...","cmd":"..."}
bash scripts/vda.sh oracle --quiet '<goal>'     # suppress stderr diagnostics
```

Routes to local Ollama (`localhost:11434`) → Opencode task-runner agent → fallback error with `task --list` hint.

### Dev / Local (k3d)

```bash
task workspace:up          # Full dev stack: cluster + workspace + office + MCP + post-setup
task cluster:create        # Create k3d cluster with local registry
task workspace:deploy      # Deploy workspace manifests
task workspace:status      # Pods, services, ingress, PVCs
task workspace:logs -- <svc>   # Service logs
task workspace:restart -- <svc> # Restart a service
task workspace:port-forward    # shared-db → localhost:5432
task workspace:psql -- website # psql shell
task workspace:teardown    # Interactive cleanup
```

### Production

```bash
task workspace:deploy ENV=mentolder    # Deploy to mentolder prod (break-glass; prefer Flux)
task workspace:deploy ENV=korczewski   # Deploy to korczewski prod
task feature:deploy                    # Fan-out deploy to BOTH prod clusters
task feature:website                   # Rebuild + redeploy website on both clusters
task health                           # Cross-cluster health check
```

### Testing

```bash
task test:all                # Offline suite (unit + manifests + dry-run)
task test:changed            # Smart test selection (pre-commit gate)
task test:inventory          # Regenerate website/src/data/test-inventory.json
./tests/runner.sh local      # All tests against k3d
./tests/runner.sh local <ID> # Single test (FA-01..FA-29, SA-01..SA-10, NFA-01..NFA-09, AK-03/04)
npm run test:code-quality    # File-size caps, import cycles, hostname scan
```

BATS runner: `tests/unit/lib/bats-core/bin/bats` (vendored) — NOT global `bats` or `./tests/bats/bin/bats` (doesn't exist).

### Validation / Quality

```bash
task workspace:validate      # Kustomize dry-run
task freshness:check         # Generated artifacts committed?
task test:code-quality       # Code quality gates
```

### Other Useful Commands

```bash
bash scripts/vda.sh cfr                         # Change Failure Rate (target ≤15% over 8 weeks)
bash scripts/vda.sh release-notes generate       # Generate release notes from merged PRs
task release:notes                              # Same (LLM/DeepSeek-gestützt mit Fallback)
bash scripts/vda.sh frontmatter <plan-file>     # Add required frontmatter after plan creation
bash scripts/ticket.sh create --type bug --title "..." --description "..."  # File a bug ticket
task docs:deploy                                # Build + deploy docs (docs:sync does NOT work — read-only rootfs)
```

## Development Workflow

1. **Branch**: `feature/*`, `fix/*`, `chore/*`, `docs/*` — no direct pushes to `main`
2. **Plan**: `dev-flow-plan` (or `opencode-flow-plan`) → creates worktree, brainstorm, plan, push. After plan creation, run `bash scripts/vda.sh frontmatter <plan-file>` before committing. (`scripts/plan-frontmatter-hook.sh` is deprecated.)
3. **Execute**: `dev-flow-execute` → implements plan, runs tests, creates PR
4. **CI**: Must be green before merge (`task test:all`). Note: a CONFLICTING PR suppresses CI.
5. **Merge**: Squash-and-merge via PR; `scripts/preflight-pr-scope.sh` enforces worktrees for feature/fix
6. **Chores**: `dev-flow-chore` executes and merges inline (no plan/execute handoff)

### Merge = Closure (T001092)

A ticket closes on **green auto-merge to `main`** (`done · resolution=shipped`). Prod deploy is decoupled and does NOT change ticket status. `awaiting_deploy` and `qa_review` are removed from the happy path but remain valid enum values (historical rows, manual edge cases).

**Deliverable-check before manual `done`/`shipped` (M10, T002506):** For manual closures (e.g. epics spanning multiple PRs), verify all plan-declared deliverable files actually exist on `origin/main` (`git show origin/main:<path>`) before setting done. A `done` without deliverable is process drift.

### OpenSpec Conventions

- Lifecycle: `/opsx:propose <slug>` → `/opsx:apply <slug>` → `/opsx:archive <slug>`
- `/opsx:explore` for thinking-through (no artifact produced)
- Language: Purpose in German; Requirements/Scenarios in English (GIVEN/WHEN/THEN)
- Delta files in `openspec/changes/<slug>/specs/` are named after the **parent SSOT slug**, not the change slug
- New component needs `archive --create-new`; without it, archive fails if target SSOT spec doesn't exist
- `task openspec:propose|apply|archive` wrappers and `/opsx:*` commands produce the **same artifact set** (both write `.ticket`, delta-spec, proposal/design/tasks scaffold)
- `task openspec:validate` is the fail-closed CI gate
- Authoring SSOT: `openspec/config.yaml`

### Configuration Patterns

- **Centralized domains**: All hostnames in `k3d/configmap-domains.yaml` — never hardcode
- **Per-env config**: `environments/<env>.yaml` → `scripts/env-resolve.sh` (must be **sourced**) → `envsubst` into manifests. Exports `PROD_DOMAIN`, `BRAND_NAME`, `CONTACT_EMAIL`, `ENV_CONTEXT`, `ENV_OVERLAY`, SMTP, etc.
- **Prod secrets**: plaintext in `environments/.secrets/<env>.yaml` (git-crypt, tracked) → `task env:seal ENV=<env>` → SealedSecret in `environments/sealed-secrets/<env>.yaml`. `workspace:deploy` applies the SealedSecret before manifests.
- **Dev secrets**: `k3d/secrets.yaml` (dev values only); `prod/` overlay strips it via `$patch: delete`
- **Pocket ID OIDC clients**: No realm JSON — clients live in `pocket_id.oidc_clients` (PostgreSQL). Provisioned by `pocket-id-client-seed` Job (`k3d/pocket-id-client-seed.yaml`) via Admin REST API on every deploy. Client secrets written back into `workspace-secrets` (website client additionally into `website-secrets` in `website` namespace). Editing clients in the UI causes drift the next deploy overwrites.
- **Seeded clients (~20)**: website, nextcloud, vaultwarden, brett, docs, downloads, grafana, mediaviewer, studio, videovault, brain, comfy, terminal, traefik, mail, rustdesk-web, session-hub, claude-code
- **Nextcloud OIDC**: `k3d/nextcloud-oidc-dev.php` (dev) / `prod/nextcloud-oidc-prod.php` (prod), loaded as ConfigMap, pointing at Pocket ID (`http://pocket-id:1411` in dev)
- **Services without native OIDC**: sit behind `oauth2-proxy` gate (20 manifests reference it)

### FluxCD Job Isolation (T002207)

`prod-fleet/mentolder-jobs/` and `prod-fleet/korczewski-jobs/` are isolated one-shot bootstrap/seed Job overlays. They use the same base as the brand but `$patch: delete` all non-Job resource types. Flux Kustomizations (`flux/clusters/fleet/ks-jobs-*.yaml`) declare `dependsOn: [flux-<brand>]` (run AFTER brand stack), `force: true` (self-healing against immutable field errors), `wait: false` (never gate downstream). Status checked via `flux:stalled` task. A broken `pocket-id-client-seed` no longer blocks the entire brand deploy.

### Image Exclusions

These use `:latest` intentionally — excluded from digest pinning: Website, Brett, Docs, Videovault, Mediaviewer-Widget, Mentolder-Web, Downloads, Brain, Studio, Talk-Transcriber, SDLC-Console (`website-sdlc`).

### Removed Components

- **LiveKit** — removed per T002184
- **tracking-import CronJob** — removed PR #788 (2026-05-15)
- **track-pr.yml** — removed PR #993 (2026-05-23)
- **build-tracking.yml, track-plans.yml** — fully removed; `v_timeline` shows historical data only (last tracked PR: #787)

## Package Managers

| Area | Manager | Lockfile |
|------|---------|----------|
| Root | npm | `package-lock.json` |
| `website/` | pnpm | `website/pnpm-lock.yaml` |
| `brett/` | npm | `brett/package-lock.json` |

## Service Endpoints (Dev — localhost)

| Service | URL |
|---------|-----|
| Website (Astro + Chat) | `http://web.localhost` |
| Pocket ID (SSO) | `http://auth.localhost` |
| Nextcloud (Files + Talk) | `http://files.localhost` |
| Collabora (Office) | `http://office.localhost` |
| Talk HPB (Signaling) | `http://signaling.localhost` |
| Vaultwarden | `http://vault.localhost` |
| Whiteboard | `http://board.localhost` |
| Brett (System Board) | `http://brett.localhost` |
| DocuSeal | `http://sign.localhost` |
| Docs | `http://docs.localhost` |
| Mailpit (dev mail) | `http://mail.localhost` |

Prod uses `*.mentolder.de` / `*.korczewski.de`.

## Agent Routing

Before responding, check signals and delegate to the named domain agent:

| Signals | Agent | MCP Primary |
|---------|-------|-------------|
| `website/`, Astro, Svelte, component, homepage, kore, mentolder brand, CSS, UI, frontend, design | `bachelorprojekt-website` | — |
| pod, logs, status, restart, crash, health, kubectl, "what's wrong", `llm:`, GPU, Ollama, model | `bachelorprojekt-ops` | `mcp-kubernetes` (localhost:18080, Claude-Code-only SSE) |
| `k3d/`, `prod*/`, manifest, kustomize, overlay, Taskfile, `ENV=`, `environments/`, deploy | `bachelorprojekt-infra` | `mcp-kubernetes` (status checks only) |
| test, `FA-*`, `SA-*`, `NFA-*`, `AK-*`, `FA-SF`, BATS, Playwright, `runner.sh`, factory, autopilot | `bachelorprojekt-test` | `ticket-mcp` (Go-Adapter), `mcp-postgres` (:13001, non-ticket tables) |
| database, PostgreSQL, psql, schema, query, backup, restore, `bachelorprojekt.features`, `v_timeline` | `bachelorprojekt-db` | `mcp-postgres` (localhost:13001, mentolder-DB only) |
| SealedSecret, Pocket ID, OIDC client, DSGVO, credentials, rotate, certificate, secret | `bachelorprojekt-security` | — |

**Tie-break**: prefer the domain of the files being changed. Cross-cutting features stay with the orchestrator.

**Before dispatching**: inject plan context via `bash scripts/plan-context.sh <role> --with-openspec` (wrap in `<active-plans>`) and toolset via `bash scripts/toolset-context.sh <role>` (wrap in `<toolset>`). The role must be a full name (`bachelorprojekt-infra`, not `infra` — short forms silently fall back to `__ALL__` returning all proposals unfiltered, T002322). `toolset-context.sh` is **fail-closed** (unknown role → exit ≠ 0, no output) unlike `plan-context.sh`.

## Agent / AI Infrastructure

- **OpenCode orchestrator** dispatches local LLM subagents (Gemma 4 26B/12B via llama.cpp). Agent definitions in `.opencode/agent-models.jsonc` (SSOT). opencode MCP servers: `bge-mcp`, `codebase-memory-mcp`, `docfork`, `factory-mcp`, `github-mcp`, `mcp-kubernetes`, `mcp-postgres`, `mcp-task-runner`, `playwright`, `sequential-thinking`, `task-master-ai`, `ticket-mcp`, `webresearch`.
- **Session model**: Main loop on user's default model (Opus 5, 1M ctx). Domain agents carry model tier in frontmatter: `ops/-db/-test/-website` → Sonnet (mechanical recon, queries, tests, UI), `infra/-security` → Opus (cross-system, risky, irreversible). 1M context is a budget — bulk reads belong in subagents that report back condensed.
- **Software Factory** — automated ticket→plan→implement→PR pipeline (`scripts/factory/`, MCP at `factory-mcp` on `:13003`)
- **MCP servers** — Postgres (`mcp-postgres`), Kubernetes (`mcp-kubernetes`), Playwright, Brain Wiki (`brain-mcp`), Ticket (`ticket-mcp`), Factory (`factory-mcp`), Codebase Memory (`codebase-memory-mcp`), Task Runner (`mcp-task-runner`)
- **MCP registry SSOT**: `docs/agent-guide/registry/mcp.yaml` (reachability: transport, endpoint, credentials) + `capabilities.yaml` (selection/usage: which instance provides a capability, when to use it, which roles lead it). `task mcp:sync` regenerates `.mcp.json` (Claude Code), `.opencode/opencode.jsonc` (opencode), `~/.gemini/config/mcp_config.json` (agy). `task mcp:check` verifies drift. **Never edit configs by hand** — changes go into the registry.
- **Agent coordination** — `scripts/agent-lock.sh` (claim/release/reap), `scripts/agent-msg.sh` (messaging)
- **Agent routing maps** — generated grep-able maps in `docs/agent-guide/maps/`: `goals-map.md` (intention → path → tier → guardrails), `tools-map.md`, `danger-map.md`. Regenerate via `task agent-guide:maps`.
- **Brain Wiki** — knowledge base ingested from openspec, runbooks, ADRs (`scripts/brain-ingest.sh`)
- **gh-axi** — preferred GitHub CLI wrapper (use `gh-axi` instead of `gh`). Reference: `.claude/skills/references/gh-axi.md`

## CI/CD

**`.github/workflows/ci.yml`** runs on every PR:
- Offline tests: `task test:all` (BATS unit, kustomize structure, Taskfile dry-run)
- Test inventory check: `task test:inventory` must match committed `website/src/data/test-inventory.json` — regenerate and commit alongside test additions
- Security scan: gitleaks (secret detection), image-pin advisory + hardcoded-secret detection in `k3d/*.yaml`
- Systembrett template validation (`scripts/tests/systembrett-template.test.sh`)

**Other workflows**:
- `renovate.yml` — self-hosted Renovate weekly dependency update bot (T000898)
- `e2e.yml` — nightly Playwright against both brands on fleet
- `build-brett.yml` — auto build+rollout both brands on `brett/**` push to main
- `build-docs.yml` — auto build on `docs/**`/docs-script push to main + manual dispatch
- `build-collabora.yml`, `build-transcriber.yml`
- `build-website.yml` — **one** workflow builds a brand-neutral image that feeds both mentolder and korczewski deploy jobs (no separate korczewski website workflow, see T001229/T001276)

### BATS Conventions

- **Spec-dir layout (T002416)**: New `@test` blocks go in `tests/spec/<spec-slug>/<kurz-slug>.bats` (one dir per SSOT spec from `openspec/specs/`, one file per operation). Don't append to the legacy collector `tests/spec/<spec-slug>.bats` — this caused parallel-work collisions at file end. No ticket-numbered files (`FA-SF-42.bats`); fallback for cross-cutting tests without clear spec is `tests/unit/`.
- **Both forms coexist**: Runner uses `bats -r tests/spec/` and captures both. Legacy top-level files are NOT migrated, just no longer extended.
- **Test both forms locally (T002696)**: Because collector and directory coexist, searching for `tests/spec/<spec>.bats` finds only half. Always capture both:
  ```bash
  tests/unit/lib/bats-core/bin/bats -r tests/spec/<spec-slug>*
  ```
- **No `merge=union` for `.bats`** — it merges line-by-line without block structure, producing syntactically broken files with no conflict markers. Guard: `tests/spec/ci-cd/spec-dir-convention.bats`.
- **Append-conflict resolution**: When parallel work collides at file end in legacy collectors, keep **both** blocks and duplicate the shared closing brace.
- **Output verification (T002448-M4)**: Tests MUST check command output/results (`run`, `$output`, `$status`), NOT source code patterns (`grep` on script internals). Exception: cross-cutting tests whose result lives only in source (doc conventions, CI config). The test file documents which check mode is used in a header comment.
- **Semantics over presentation (T002716)**: Assertions must target semantics (exit code, value presence, substring without line anchors), not formatting (exact wording, table columns). Format-bound guards break across tool versions — locally invisible, red only in CI. Four failure modes:
  1. **Dokumentposition (T003104)**: `grep -n … | head -1` measures position of first random match. Unrelated insertion above changes result. → Narrow search to section (awk range, sed range).
  2. **Options-Parsing (T003108)**: `grep -qF '--flag'` exits **2** (not 1) — `-F` makes pattern literal but doesn't prevent option parsing. In `if` conditions, tool errors and "not found" are indistinguishable. → Use `-e` or `--`.
  3. **Konfiguration statt Laufzeit (T003548)**: If the defect sits in runtime, a config assertion is no proxy. Rule: **a RED run that is green is a finding about the test, not "already satisfied".**
  4. **Prozesslisten-Format (T003230)**: `ps -eo pid=` right-pads to `pid_max` width. A test that finds the format instead of enforcing it depends on machine uptime — locally green, fresh runner red. → Enforce format (`tr -d '[:blank:]'`).
- **`$output` matching pitfall**: Never assert `[[ "$output" == *"<term>"* ]]` unqualified against full stdout+stderr — if the script prints `$0` in usage/help, the worktree directory name (derived from change slug) can satisfy the match even when the feature doesn't exist. Narrow to the relevant output line first.
- **Positive anchor (T002356-M1)**: Every negative test ("X must not occur") needs a positive anchor in the same test that fails when the feature is missing. Without it, the test is vacuous: missing feature → empty candidate list → "1 is not in []" holds trivially. Order: first check valid case passes, then the negative assertion.
- **CRLF-tolerant anchors for `.ps1` (T002338-M2)**: PowerShell files (`scripts/llm/*.ps1`) are CRLF. A regex anchoring on `$` doesn't match — `\r` is in POSIX `[[:space:]]`, so use `[[:space:]]*$`. Same expression matched in interactive shell but not under BATS.
- **`bash -n` is NOT a syntax check for `.bats` (T002351-M2)**: `@test "name" { … }` is not valid Bash syntax; `bash -n` gives a misleading error. Use `tests/unit/lib/bats-core/bin/bats --count <file>`.

## Gotchas & Footguns

Full reference: `docs/superpowers/references/gotchas-footguns.md`

Covered sub-topics there: Security & Session (agent-lock protocol, ENV= targeting, wg-fleet flannel-iface), Overlays & Config (prod-fleet/* only, $patch:delete, envsubst lists), Ops & Infra (cluster reset order, Kore design system, local-first LLM pipeline, dev.mentolder.de stack, alt-worktrees submodule gitdirs).

Critical ones inline:
- `scripts/env-resolve.sh` must be **sourced**, not executed
- Never `SELECT *` from `tickets.ticket_plans` (multi-MB `content` column)
- OpenSpec archival ONLY in worktrees — main-checkout commits leave orphaned files
- `website/` is pnpm-only — never `npm install` inside `website/`
- **gitleaks**: install the CI version (8.18.2 via curl), NOT `apt install` (delivers 8.16.0). Local pre-commit silently skips if binary is missing (`⚠ gitleaks binary not found — skipping secret scan`), but CI is fail-closed — a leaked key is only caught after push, when it's already compromised. Install:
  ```bash
  curl -sSfL https://github.com/gitleaks/gitleaks/releases/download/v8.18.2/gitleaks_8.18.2_linux_x64.tar.gz \
    | tar -xz -C /tmp gitleaks && install -m 0755 /tmp/gitleaks ~/.local/bin/gitleaks
  ```
  Hook and CI use `--no-git` (scan working tree, not versioned). `node_modules/` and `tmp/` are in `allowlist.paths` (gitignored, can't enter a commit). Add new gitignored sources there — don't disable the hook.
- **Bug triage (CFR-Gate G-DORA03)**: Every post-merge bug MUST be filed as `type=bug` ticket — no silent `fix()` commits. File via `bash scripts/ticket.sh create --type bug --title "..." --description "..."`. Measure with `bash scripts/vda.sh cfr`, target ≤15% over 8 weeks. Unticketed `fix()` commits count as concealed bugs, worsening the proxy without appearing in DORA at `/admin/dora`.
- **Measurement convention (T002717)**: When writing a measurement as decision basis in a ticket, include the executable command that produced it (commit hash + search pattern). Without it, the number is a claim, not evidence. The real case: T002700 deferred work based on "about 23 live files" — re-measurement found 149 occurrences in 63 files (factor ~2.6). Include a block like:
  ```bash
  PRE=6a6d4c302c1afcb4a12a6c0b7c2401505f5fd602
  git grep -F -l 'Taskfile.' "$PRE" -- . ':!openspec/changes/archive' ':!docs/superpowers/plans' | wc -l
  ```
  Editorial note, not an automated guard — only the rule's presence in the repo is machine-checked (`tests/spec/agent-skills/messung-mit-befehl.bats`).
- **PowerShell from WSL (T002495-M7)**: `.ps1` files under `scripts/llm/` must be pure ASCII (no BOM, no typographic characters/em-dashes). PS 5.1 on Windows reads UTF-8 without BOM as CP1252. Validate before commit with `[System.Management.Automation.Language.Parser]::ParseFile`. Write generated `.conf` files with `-Encoding ASCII` not `UTF8` (BOM in WireGuard configs breaks tunnel services).

## Development Rules

1. Only deploy via k3d/k3s with Kustomize. Prod is **pull-based via FluxCD GitOps** (primary: `.github/workflows/render-fleet-artifact.yml` → OCI artifact `ghcr.io/paddione/fleet-manifests` → Flux reconciliation on fleet). `task workspace:deploy ENV=<brand>` is break-glass fallback only.
2. All changes via Pull Requests — no direct pushes to `main`.
3. Squash-and-merge to keep `main` history clean.
4. CI must be green before merge.
5. Validate manifests before committing: `task workspace:validate`.
6. After modifying K8s manifests, run relevant tests: `./tests/runner.sh local <TEST-ID>`.
7. Branch naming: `feature/*`, `fix/*`, `chore/*`, `docs/*`.

## Reference Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Authoritative comprehensive reference (all tasks, topology, footguns) — **read on demand** |
| `AGENTS.md` | Quick-start for orchestrator sessions (agent routing, core commands) |
| `CONTRIBUTING.md` | Branch conventions, CI pipeline, dev workflow |
| `IDENTITY.md` | AI assistant identity/persona |
| `website/CLAUDE.md` | Astro/Svelte quick-start for the website |
| `website/WEBSITE-STANDARDS.md` | Full website standards |
| `docs/agent-guide/README.md` | Agent operating guide |
| `docs/superpowers/references/gotchas-footguns.md` | Full gotchas & footguns reference |
| `docs/agent-guide/registry/mcp.yaml` | MCP server reachability SSOT (transport, endpoint, credentials) |
| `docs/agent-guide/registry/capabilities.yaml` | MCP tool selection/usage SSOT (which instance, when, who) |
| `docs/agent-guide/maps/` | Generated routing maps: `goals-map.md`, `tools-map.md`, `danger-map.md`, `toolset-map.md`, `agents-map.md` |
| `.claude/skills/references/mcp-tool-guide.md` | MCP server preference guide (which MCP over `kubectl exec … psql`) |
| `.claude/skills/references/gh-axi.md` | gh-axi GitHub CLI wrapper reference |
| `.claude/skills/references/subagent-provisioning.md` | Subagent model/effort/context provisioning |
| `.claude/skills/OVERVIEW.md` | Skill layering contract (which step calls which) |
| `openspec/config.yaml` | OpenSpec authoring conventions SSOT |
