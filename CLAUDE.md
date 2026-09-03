# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Agent Routing

Before responding to any request, check these signals and delegate to the named agent. The signal lists below mirror the routing table in [`AGENTS.md`](AGENTS.md) — which is the single source of truth (it matches each agent's `description:` frontmatter in `.agents/agents/<name>.md`).

> **Subagent layout:** `.claude/agents/bachelorprojekt-*.md` is the canonical source (`.agents/agents` is a symlink). **Claude Code only** reads these via native `task` tool dispatch. **opencode** uses `.opencode/agent-models.jsonc` (local LLMs: `gptoss`, `devstral`, `gemma`, plus `deepseek` and `orchestrator`). Map: `docs/agent-guide/maps/agents-map.md`.

| Signals | Agent | MCP-Primär (Claude Code) |
|---------|-------|--------------------------|
| `components/website/`, Astro, Svelte, component, homepage, kore, mentolder brand, CSS, UI, frontend, design | `bachelorprojekt-website` | — |
| pod, logs, status, restart, crash, health, kubectl, "what's wrong", "why is X failing", "is X running", `llm:`, GPU, Ollama, model | `bachelorprojekt-ops` | `mcp-kubernetes` (localhost:18080) — Claude-Code-only SSE server, see `mcp-tool-guide.md` |
| `k3d/`, `prod*/`, manifest, kustomize, overlay, Taskfile, `ENV=`, `environments/`, deploy, `workspace:setup` | `bachelorprojekt-infra` | `mcp-kubernetes` (localhost:18080) — nur Status-Checks (Claude-Code-only) |
| test, `FA-*`, `SA-*`, `NFA-*`, `AK-*`, `FA-SF`, BATS, Playwright, `runner.sh`, "test failing", "test case", "write a test", `factory:`, autopilot | `bachelorprojekt-test` | `ticket-mcp` (Go-Adapter) — Ticket-Reads/Lifecycle; `mcp-postgres` (:13001, nur mentolder) für Nicht-Ticket-Tabellen |
| database, PostgreSQL, psql, schema, query, backup, restore, tracking, timeline, `bachelorprojekt.features`, `v_timeline` | `bachelorprojekt-db` | `mcp-postgres` (localhost:13001, nur mentolder-DB) — Ticket-Reads → `ticket-mcp` mit `brand` |
| SealedSecret, Pocket ID, OIDC client, DSGVO, credentials, rotate, certificate, secret | `bachelorprojekt-security` | — |

> **MCP-Registry ist SSOT (T002300/T002592):** `docs/agent-guide/registry/mcp.yaml` ist SSOT für Erreichbarkeit; `task mcp:sync` regeneriert `.mcp.json`, `opencode.jsonc`, `mcp_config.json`. The opencode runtime registers: `bge-mcp`, `brain-mcp`, `codebase-memory-mcp`, `docfork`, `factory-mcp`, `github-mcp`, `mcp-kubernetes`, `mcp-postgres`, `mcp-task-runner`, `playwright`, `sequential-thinking`, `ticket-mcp`, `webresearch`. `docs/agent-guide/registry/capabilities.yaml` ist SSOT für Auswahl/Nutzung. Siehe [`.claude/skills/references/mcp-tool-guide.md`](.claude/skills/references/mcp-tool-guide.md).
> **gh-axi (T004612):** Bevorzugt für Anzeige. Für maschinelles Parsen (`--json`, `-q`, `--jq`), Polling (`pr checks`) und Mutationen (`pr merge`, `gh api`) immer `gh` direkt verwenden. Siehe [`.claude/skills/references/gh-axi.md`](.claude/skills/references/gh-axi.md).

**Before dispatching any agent, inject active plan context & curated toolset:**
Run `bash scripts/plan-context.sh <role> --with-openspec` (full role name e.g. `bachelorprojekt-infra`) and `bash scripts/toolset-context.sh <role>`.

```bash
context=$(bash scripts/plan-context.sh bachelorprojekt-infra --with-openspec)
[ -n "$context" ] && prompt="<active-plans>\n${context}\n</active-plans>\n\n${task_prompt}"

tools=$(bash scripts/toolset-context.sh bachelorprojekt-infra)
[ -n "$tools" ] && prompt="<toolset>\n${tools}\n</toolset>\n\n${prompt}"
```

> **Hinweise:** `<role>` muss ein voller Rollenname sein (`bachelorprojekt-*` / `orchestrator`); `toolset-context.sh` ist fail-closed (Exit ≠ 0 bei ungültiger Rolle). Nach `superpowers:writing-plans` Planerstellung: `bash scripts/vda.sh frontmatter <plan-file>`. Tie-break: Domain der geänderten Dateien bevorzugen. Cross-cutting requests verbleiben beim Haupt-Orchestrator.

**Cross-cutting requests** (e.g. a feature spanning both website and k8s) stay with the main orchestrator, which coordinates multiple agents in sequence.

### Session model & delegation (T002153)

The main loop runs on the **user's default model** — `.claude/settings.json` deliberately pins **no** `model:` key, so `/model` (currently Opus 5, 1M context) decides. Model tiering lives where the dispatch happens:

- **Domain agents** carry it in their frontmatter: `bachelorprojekt-ops/-db/-test/-website` → `sonnet` (mechanical recon, queries, tests, UI), `bachelorprojekt-infra`/`-security` → `opus` (cross-system, risky, irreversible).
- **Ad-hoc subagents** get an explicit `model` per dispatch — inheriting the main loop now means inheriting Opus. See [`subagent-provisioning.md`](.claude/skills/references/subagent-provisioning.md).

**The 1M context window is a budget, not a licence.** Bulk reads (CI logs, research sweeps, multi-file recon) still belong in a subagent that reports back *condensed*; the orchestrator context stays reserved for decisions.

## Default Workflow

For any work request in this repo (add/change/fix/build), invoke **`dev-flow-plan`** (`.claude/skills/dev-flow-plan/SKILL.md`). It declares the path, and for **feature/fix** does worktree setup, brainstorming, spec, and plan creation — then commits and pushes the plan to the branch and stops. **Chores** (maintenance, no behavior change) route to **`dev-flow-chore`** (`.claude/skills/dev-flow-chore/SKILL.md`), which executes and merges inline (no plan/execute handoff). When ready to implement a staged plan, invoke **`dev-flow-execute`** (`.claude/skills/dev-flow-execute/SKILL.md`) — it picks up the plan, runs implementation, verification, PR, and post-merge deploy. All auto-invoke via their `description` frontmatter; no special wiring needed. The `dev-flow-*` skills are project orchestrators that call the generic `superpowers:*` skills for discipline — see `.claude/skills/OVERVIEW.md` (Schicht-Kontrakt) for the layering and which step calls which.

### OpenSpec native change workflow
Specifications are written in the OpenSpec format under `openspec/`. Drive the lifecycle with the upstream **`/opsx:*` commands** — `/opsx:propose <slug>` (skeleton, status `planning`), `/opsx:apply <slug>` (mark implementable, status `plan_staged`), `/opsx:archive <slug>` (archive a done change + merge its delta into the SSOT spec), `/opsx:explore` (think-through). The `task openspec:propose|apply|archive` wrappers and the `/opsx:*` commands must produce the **same artifact set** — both paths write `.ticket` (T002836), the delta-spec, and the proposal/design/tasks scaffold; `task openspec:validate` is the fail-closed CI gate. Authoring conventions (German Purpose, English Requirements/Scenarios, task sizing) are SSOT in **`openspec/config.yaml`**. Full contract: **AGENTS.md → "OpenSpec conventions"** (the cross-harness single source of truth — this block mirrors it).

**Delta-Spec-Konvention (T001304):** Delta-Dateien in `openspec/changes/<slug>/specs/` werden nach dem **Parent-SSOT-Slug** benannt, nicht nach dem Change-Slug. Für Sub-Features einer bestehenden Komponente: `openspec.sh propose <change-slug> --ticket T… --target-spec <parent-slug>`. Für eine wirklich neue Komponente: `openspec.sh archive <change-slug> --create-new`. Ohne `--create-new` schlägt `archive` fehl, wenn der Ziel-SSOT-Spec noch nicht existiert.

### Domain conventions: Merge = Abschluss (T001092)

Ein Ticket wird bei **grünem Auto-Merge nach `main` direkt geschlossen** (`done · resolution=shipped`) — einheitlich für Factory (`pipeline.js`) und dev-flow-execute (inkl. Batches). Der Prod-Deploy ist **entkoppelt** (push-based) und ändert den Ticket-Status NICHT; Closure trackt **Merge**, nicht Prod-Live. `awaiting_deploy` und `qa_review` sind aus dem Happy-Path entfernt, bleiben aber als Enum-Werte gültig (historische Zeilen, manuelle Sonderfälle, Watchdog `awaiting_deploy > 24h`); der Factory-Floor blendet die leere `awaiting_deploy`-Lane aus. Quality-Gate-Ergebnisse werden als `verify`-Phase-Events (`tickets.factory_phase_events`, strukturiertes `detail`) erfasst.

**Deliverable-Check vor manuellem `done`/`shipped` (M10, T002506):** Bei manuellen Closures (kein Auto-Merge — z. B. Epics, die über mehrere PRs laufen) VOR dem Setzen auf `done`/`shipped` prüfen, dass alle im Plan deklarierten Deliverable-Dateien tatsächlich auf `origin/main` existieren (`git show origin/main:<pfad>` bzw. `git log` auf die Dateipfade im letzten Merge-Commit). Ein `done` ohne Deliverable ist Prozess-Drift und erzwingt einen nachträglichen Pflaster-Commit (beobachtet bei T002459/P5.5). Redaktioneller Hinweis, kein automatisierter Guard.

## Project Overview

**Workspace MVP** -- a Kubernetes-based self-hosted collaboration platform for small teams (bachelor thesis). Integrates a custom messaging system (chat, built into the Astro website), Nextcloud (files + video via Talk), Pocket ID (SSO/OIDC), Collabora (office suite), Claude Code (AI), Vaultwarden (passwords), and supporting services. All data stays on-premises (DSGVO/GDPR by design).

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

Routes to local Ollama (at `localhost:11434`) → Opencode/OpenClaw `task-runner` agent (fallback) → error with `task --list` hint.

## Architecture

All services run as Kubernetes Deployments in the `workspace` namespace, fronted by Traefik (built-in k3s ingress). There is no docker-compose.

Services: Traefik → Pocket ID (OIDC), Nextcloud+Talk, Collabora, Talk-HPB+coturn+Janus, Vaultwarden, Whiteboard, Brett, Mailpit, Docs (oauth2-proxy), DocuSeal, Tracking, Website (separate `website` ns). All except Website share `workspace` ns. Shared PostgreSQL 16 (`shared-db`). Pocket ID provides SSO for Nextcloud, Vaultwarden, DocuSeal, Tracking, Website, Claude Code and the oauth2-proxy-gated services. LiveKit removed per T002184.

### Cluster Topology & Nodes (Fleet Stage 3 — FULLY CONSOLIDATED 2026-05-31)
- **mentolder (BRAND)**: DNS for `mentolder.de` routes to the **`fleet`** cluster (pk-hetzner-4/6/8 IPs: 204.168.244.104/37.27.251.38/62.238.23.79). The mentolder-standalone cluster has been **DECOMMISSIONED** — all k3s software uninstalled from gekko-hetzner-2/3/4; those nodes joined fleet as workers. Use `ENV=mentolder` or `ENV=fleet-mentolder` (aliases) with context `fleet`, namespace `workspace`. Both the old `mentolder` and `korczewski` kubeconfig contexts are **DEAD**. `k3s-1` has been permanently **DECOMMISSIONED** (memory corruption 2026-05-31). Local development runs via k3d on the WSL host (context: `k3d-mentolder-dev`).
- **korczewski (BRAND)**: The standalone korczewski cluster has been **TORN DOWN** (intentional, PR #1189). Its hosts `pk-hetzner-4/6/8` now run the unified **`fleet`** k3s cluster. DNS for `korczewski.de` routes to fleet. Operate the korczewski brand via the **`fleet`** context, namespace `workspace-korczewski` (`ENV=fleet-korczewski` or `ENV=korczewski`). **Die Brand ist seit 2026-07-23 eingefroren (T002479, Kosten/Wartung):** `flux/clusters/fleet/ks-korczewski.yaml` ist `suspend: true`, alle Deployments in `workspace-korczewski` und `website-korczewski` stehen auf 0 Replicas — korczewski.de liefert keine Anwendung aus, auch wenn DNS und Namespaces weiter existieren. Ein Re-Aktivieren hebt die Suspension in einem eigenen Change auf; nicht en passant hochskalieren. Zustand prüfen statt annehmen: `kubectl --context fleet get deploy -n workspace-korczewski`.
- **`fleet`**: The unified cluster — **3 CP nodes** (pk-hetzner-4/6/8) + **2 worker nodes** (gekko-hetzner-3/4). `gekko-hetzner-2` ist derzeit **nicht** im Cluster; CLAUDE.md nannte es bis T002699 als dritten Worker (`kubectl --context fleet get nodes` am 2026-08-08: fünf Knoten). Wer die Node-Liste ändert, prüft sie gegen den lebenden Cluster statt gegen diese Zeile. **Pod- und Replica-Zahlen stehen bewusst nicht mehr in dieser Datei** — sie veralten schneller, als sie gepflegt werden (T900038: die frühere Zusicherung „both brands at 26/26 pods“ behauptete über sechs Wochen lang einen Zustand, den es nicht mehr gab). Belastbar ist nur die Messung: `kubectl --context fleet get deploy -n workspace` bzw. `-n workspace-korczewski`. Laufende Workloads trägt derzeit **nur** `workspace` (mentolder); `workspace-korczewski` ist eingefroren (siehe korczewski-Zeile oben). Single source of truth for all production workloads — `fleet` is the only live **prod** context. Locally there are additionally the k3d dev contexts `k3d-mentolder-dev` and `k3d-korczewski-dev`; any other context still listed by `kubectl config get-contexts` (`devc`, `gekko-hetzner-2-dev`, …) points at decommissioned hardware.

### Key components
- **`k3d/`** -- All base Kubernetes manifests (Kustomize). This is the base that both `task workspace:deploy` (push, legacy/break-glass) and the **Flux GitOps pipeline** (pull-based, primary) apply in prod. Deployment is **pull-based via FluxCD** on the fleet cluster — the OCI artifact at `ghcr.io/paddione/fleet-manifests` is rendered by `.github/workflows/render-fleet-artifact.yml` on every `main` push, then reconciled by Flux (see `flux/clusters/fleet/`). `task workspace:deploy` exists as break-glass fallback.
- **`prod/`** -- Shared production patches (TLS, resource limits, replicas, DDNS) consumed by the env-specific overlays. Never apply directly.
- **`prod-fleet/mentolder/`, `prod-fleet/korczewski/`** -- The per-brand overlays **actually applied in prod**, referenced by `ENV_OVERLAY` (the `overlay:` key) in `environments/mentolder.yaml` / `environments/korczewski.yaml`. Each *wraps* the legacy brand overlay (`resources: ../../prod-mentolder` / `../../prod-korczewski`) and layers the `fleet-common` component + fleet node-affinity repoints on top. `task workspace:deploy ENV=<brand>` builds `prod-fleet/<brand>`.
- **`prod-fleet/mentolder-jobs/`, `prod-fleet/korczewski-jobs/`** (T002207) -- Isolated one-shot bootstrap/seed Job overlays. Use the same base as the brand but `$patch: delete` all non-Job resource types. Referenced by `flux-<brand>-jobs` Kustomizations (see below). These decouple Job failures from the brand application stack — a broken `pocket-id-client-seed` no longer blocks the entire brand deploy.
- **`prod-fleet/staging/`, `prod-fleet/website-staging/`** (T015004) -- The staging stack, wired into Flux like the brands: `flux-staging` renders `prod-fleet/staging` into `workspace-staging` (full app stack incl. CronJobs), `flux-website-staging` deploys the public site into `website-staging`, and `flux-sealed-secrets-staging` applies the pre-sealed secrets from `environments/sealed-secrets/staging.yaml`. Env profile: `environments/staging.yaml` (`env-resolve.sh staging`). The staging CronJobs target `website.website-staging.svc.cluster.local` via `${WEBSITE_NAMESPACE}` — never hardcode the prod namespace.
- **`flux/clusters/fleet/ks-jobs-mentolder.yaml`, `flux/clusters/fleet/ks-jobs-korczewski.yaml`** (T002207) -- Flux Kustomizations for the isolated Jobs overlays above. Declare `dependsOn: [flux-mentolder]` / `[flux-korczewski]` so they run AFTER the brand stack, `force: true` for self-healing against immutable field errors, and `wait: false` so they never gate downstream Kustomizations. Status checked via `flux:stalled` task.
- **`prod-mentolder/`, `prod-korczewski/`** -- Legacy standalone-cluster brand overlays. **No longer applied directly** — they survive only as the inner base the `prod-fleet/*` wrappers reuse. Don't apply these standalone.
- **`environments/`** -- Config & secrets registry:
  - `environments/<env>.yaml` -- per-env config (domain, context, env_vars, setup_vars), read by `scripts/env-resolve.sh`.
  - `environments/.secrets/<env>.yaml` -- plaintext secrets (git-crypt-encrypted at-rest, **tracked** — not gitignored; see `scripts/git-crypt-guard.sh`; only used as input to `env:seal`).
  - `environments/sealed-secrets/<env>.yaml` -- encrypted SealedSecret (committed; applied before manifests).
  - `environments/schema.yaml` -- authoritative list of every env/setup var; validated by `env:validate`.
  - `environments/certs/` -- per-cluster sealing certs fetched via `env:fetch-cert`.
- **`brett/`** -- Node.js 3D systemic-constellation board (Systembrett) at `brett.localhost`; deployed as `k3d/brett.yaml`.
- **`claude-code/`** -- Claude Code configuration and system prompt.
- **`scripts/`** -- Bash utility scripts for migration, user import, DSGVO checks, MCP registration, Stripe setup, env resolution/generation/sealing, etc.
- **`tests/`** -- Bash + Playwright test framework. `runner.sh` orchestrates all test categories.
- **`k3d/docs-content-built/`** -- Pre-built HTML served by the `docs` Deployment. Source is compiled by `node scripts/build-docs.mjs` from `docs/` and skill HTML. Deploy via `task docs:deploy`.

### Configuration patterns
- **Centralized domains**: All hostnames defined in `k3d/configmap-domains.yaml`. Never hardcode hostnames elsewhere.
- **Per-env config**: `PROD_DOMAIN`, `BRAND_NAME`, `CONTACT_EMAIL`, `ENV_CONTEXT`, `ENV_OVERLAY`, SMTP, etc. live in `environments/<env>.yaml`. `scripts/env-resolve.sh` exports them; tasks then `envsubst` them into manifests.
- **Prod secrets**: plaintext in `environments/.secrets/<env>.yaml` (git-crypt-encrypted at-rest, tracked) → `task env:seal ENV=<env>` → committed SealedSecret in `environments/sealed-secrets/<env>.yaml`. `workspace:deploy` applies the SealedSecret before manifests.
- **Dev secrets**: `k3d/secrets.yaml` (dev values only — never commit real credentials). The `prod/` overlay strips this via `$patch: delete` so sealed secrets survive.
- **Pocket ID OIDC clients**: Provisioned by `pocket-id-client-seed` Job (`k3d/pocket-id-client-seed.yaml`) via Admin API on `task workspace:deploy`. Client secrets are written back to `workspace-secrets` / `website-secrets`.
- **Nextcloud OIDC**: `k3d/nextcloud-oidc-dev.php` (dev) / `prod/nextcloud-oidc-prod.php` (prod).
- **SSO flow**: **Pocket ID** (`ghcr.io/pocket-id/pocket-id`, `k3d/pocket-id.yaml`) is the OIDC provider for ~20 clients. Services without native OIDC sit behind an `oauth2-proxy` gate.

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on every PR:
- Offline tests: `task test:all` (BATS unit tests, kustomize manifest structure, Taskfile dry-run). BATS runner: `tests/unit/lib/bats-core/bin/bats`
- **Test inventory check**: re-runs `task test:inventory` and fails the job if `components/website/src/data/test-inventory.json` differs from committed version.
- **Test- und BATS-Konventionen -> [`tests/CLAUDE.md`](tests/CLAUDE.md)**: Verzeichnisaufbau `tests/spec/<spec-slug>/`, Runner-Pfad, `$output`-Matching, Positiv-Anker-Pflicht. **Kernregel, die hier bleibt:** Tests pruefen **command output** und Resultate (output verification) statt der Implementierungsquelle, und die Zusicherung haengt an der Semantik des Outputs (Exit-Code, Vorhandensein eines Werts), nicht an dessen Darstellung.
- **Release notes**: Generate structured release notes via `bash scripts/vda.sh release-notes generate` or `task release:notes`. Publish with `publish-github` or prepend to `CHANGELOG.md` with `publish-changelog`.
- Systembrett template validation (`scripts/tests/systembrett-template.test.sh`), Security scan (`k3d/*.yaml`).
- Other workflows: `renovate.yml`, `e2e.yml`, `build-brett.yml`, `build-docs.yml`, `build-collabora.yml`, `build-transcriber.yml`, `build-website.yml` (builds brand-neutral image for both brands; no separate korczewski website workflow).

## Image Exclusions

The following components intentionally use `:latest` images and are excluded from standard pinning requirements: Website, Brett, Docs, Videovault, Mediaviewer-Widget, Mentolder-Web, Downloads, Brain, Studio, Talk-Transcriber, SDLC-Console (`website-sdlc`), Factory-Runner (`factory-runner`).

## Development Rules

1. Only deploy via k3d/k3s with Kustomize (`k3d/` is the base). Prod is deployed **pull-based via FluxCD GitOps** (primary path: `.github/workflows/render-fleet-artifact.yml` → OCI artifact → Flux reconciliation on fleet; `task workspace:deploy ENV=<brand>` is break-glass fallback).
2. All changes via Pull Requests -- no direct pushes to `main`.
3. Use **squash-and-merge** to keep `main` history clean.
4. CI must be green before merge.
5. Validate manifests before committing: `task workspace:validate`.
6. After modifying Kubernetes manifests, run the relevant test(s): `./tests/runner.sh local <TEST-ID>`.
7. Branch naming: feature/*, fix/*, chore/* (Factory-Batch-Ausnahme: feat/batch-*)

## Gotchas & Footguns

Non-obvious repo behaviors are documented in full at [`docs/superpowers/references/gotchas-footguns.md`](docs/superpowers/references/gotchas-footguns.md).

Covered sub-topics (reference file, not repeated here):
- **Security & Session**: security-guidance rewake, agent-lock.sh claim/release/reap protocol, ENV= explicit targeting, cluster node placement (wg-fleet flannel-iface).
- **Overlays & Config**: prod-fleet/* only (never bare prod/, $patch:delete), env-resolve.sh sourcing, envsubst lists, DB queries (never SELECT * on ticket_plans.content).
- **Ops & Infra**: cluster reset order, push-based/pull-first, CONFLICTING PR suppresses CI, ENV=staging, Kore design system, local-first LLM pipeline, dev.mentolder.de stack, alt-worktrees submodule gitdirs, gitleaks local install & allowlist.

### PowerShell-Skripte aus WSL (.ps1) [T002495-M7]

ASCII-Pflicht (kein BOM), Parser-Check vor dem Commit und `-Encoding ASCII` fuer generierte `.conf`-Dateien -> [`scripts/llm/CLAUDE.md`](scripts/llm/CLAUDE.md).

### Bug-Triage-Konvention (CFR-Gate G-DORA03)

**Jeder nach-Merge entdeckte Fehler wird als `type=bug`-Ticket erfasst** — kein stiller `fix()`-Commit ohne Ticket-Referenz. Die Change Failure Rate (broad proxy: fix()-Rate) wird mit `bash scripts/vda.sh cfr` gemessen (Ziel ≤ 15 % über 8 Wochen).
Ablauf: Bug entdecken → `bash scripts/ticket.sh create --type bug --title "..." --description "..."` → Branch + PR → nach Merge wird Ticket automatisch `done`.

### Mess-Konvention [T002717]

**Wer eine Messung als Entscheidungsgrundlage in ein Ticket schreibt, notiert den ausführbaren Befehl mit, der sie erzeugt hat.** Ohne ihn ist die Zahl kein Beleg, sondern eine Behauptung — und der Zweck des Festhaltens („damit die Analyse nicht wiederholt werden muss") ist verfehlt, weil genau die Wiederholung unmöglich wird.

**Das fehlende Stück ist das Suchmuster, nicht die Methode.** Ein Metadaten-Block ohne das konkrete Suchmuster dokumentiert die Sorgfalt, nicht die reproduzierbare Messung. Konkret gehört in die Beschreibung ein Code-Block mit dem ausführbaren Befehl und dem Commit-Stand:

```bash
# Stand, gegen den gemessen wurde — sonst ist die Zahl später nicht nachstellbar
PRE=6a6d4c302c1afcb4a12a6c0b7c2401505f5fd602
git grep -F -l 'Taskfile.' "$PRE" -- . ':!openspec/changes/archive' ':!docs/superpowers/plans' | wc -l
```

**Redaktioneller Hinweis, kein automatisierter Guard** — dieselbe Klasse wie der Deliverable-Check (M10, T002506). Maschinell geprüft wird ausschließlich, dass diese Regel im Repo steht (`tests/spec/agent-skills/messung-mit-befehl.bats`).
