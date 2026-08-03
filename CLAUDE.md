# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Agent Routing

Before responding to any request, check these signals and delegate to the named agent. The signal lists below mirror the routing table in [`AGENTS.md`](AGENTS.md) — which is the single source of truth (it matches each agent's `description:` frontmatter in `.agents/agents/<name>.md`).

> **Subagent file layout:** `.claude/agents/bachelorprojekt-*.md` is the canonical source. `.agents/agents` is a directory symlink to `../.claude/agents` — **Claude Code only** reads these via its native `task` tool dispatch. **opencode does NOT read `.agents/agents/`** — it uses its own agent definitions in `.opencode/agent-models.jsonc` (local LLM subagents: `gemma26-1`, `gemma26-2`, `gemma26-primary`, `deepseek-helper`, `orchestrator`). Die generierte Übersicht `docs/agent-guide/maps/agents-map.md` listet alle Rollen und Runtimes — sie ist die konsolidierte Karte zur Registry `docs/agent-guide/registry/agents.yaml`. Edit domain agents at `.claude/agents/<name>.md` (or its `.agents/agents/<name>.md` alias).

| Signals | Agent | MCP-Primär (Claude Code) |
|---------|-------|--------------------------|
| `website/`, Astro, Svelte, component, homepage, kore, mentolder brand, CSS, UI, frontend, design | `bachelorprojekt-website` | — |
| pod, logs, status, restart, crash, health, kubectl, "what's wrong", "why is X failing", "is X running", `llm:`, GPU, Ollama, model | `bachelorprojekt-ops` | `mcp-kubernetes` (localhost:18080) — Claude-Code-only SSE server, see `mcp-tool-guide.md` |
| `k3d/`, `prod*/`, manifest, kustomize, overlay, Taskfile, `ENV=`, `environments/`, deploy, `workspace:setup` | `bachelorprojekt-infra` | `mcp-kubernetes` (localhost:18080) — nur Status-Checks (Claude-Code-only) |
| test, `FA-*`, `SA-*`, `NFA-*`, `AK-*`, `FA-SF`, BATS, Playwright, `runner.sh`, "test failing", "test case", "write a test", `factory:`, autopilot | `bachelorprojekt-test` | `ticket-mcp` (Go-Adapter) — Ticket-Reads/Lifecycle; `mcp-postgres` (:13001, nur mentolder) für Nicht-Ticket-Tabellen |
| database, PostgreSQL, psql, schema, query, backup, restore, tracking, timeline, `bachelorprojekt.features`, `v_timeline` | `bachelorprojekt-db` | `mcp-postgres` (localhost:13001, nur mentolder-DB) — Ticket-Reads → `ticket-mcp` mit `brand` |
| SealedSecret, Pocket ID, OIDC client, DSGVO, credentials, rotate, certificate, secret | `bachelorprojekt-security` | — |

> **MCP-Registry ist SSOT (T002300):** `docs/agent-guide/registry/mcp.yaml` ist die einzige Quelle für alle drei Harness-Configs. `task mcp:sync` regeneriert daraus `.mcp.json` (Claude Code), `.opencode/opencode.jsonc` (opencode) und `~/.gemini/config/mcp_config.json` (agy); `task mcp:check` prüft auf Drift. Configs nicht von Hand editieren — die Änderung geht in die Registry.
>
> **Zwei Registries, zwei Zuständigkeiten (T002592):** `mcp.yaml` ist SSOT für die *Erreichbarkeit* eines Servers (Transport, Endpunkt, Credentials). `docs/agent-guide/registry/capabilities.yaml` ist SSOT für *Auswahl und Nutzung* — welche Instanz eine Fähigkeit liefert, wann sie einzusetzen ist und welche Rollen sie führen. Das ist die häufigste Verwechslungsquelle zwischen beiden.

> **MCP-Server names in this table refer to Claude-Code-only SSE servers** configured in `.claude/skills/references/mcp-tool-guide.md`. The opencode runtime registers its MCP servers in `.opencode/opencode.jsonc`: `bge-mcp`, `codebase-memory-mcp`, `docfork`, `factory-mcp`, `github-mcp`, `mcp-kubernetes`, `mcp-postgres`, `mcp-task-runner`, `playwright`, `sequential-thinking`, `task-master-ai`, `ticket-mcp`, `webresearch` (same `mcp-kubernetes` name as the table; `factory-mcp` is the HTTP factory server on `:13003`). If you are running in opencode, see the `MCP-Schnellweg` block below and the opencode config, not the table above.

> **Agent-Routing-Karten:** Generierte, grepbare Karten unter `docs/agent-guide/maps/` — `goals-map.md` (Intention → Weg → Tier → Guardrails), `tools-map.md`, `danger-map.md`. Quelle: `docs/agent-guide/registry/` (nicht von Hand editieren; via `task agent-guide:maps` regenerieren).

> **MCP-Schnellweg:** Welcher MCP-Server wann bevorzugt wird (statt `kubectl exec … psql`), steht in [`.claude/skills/references/mcp-tool-guide.md`](.claude/skills/references/mcp-tool-guide.md) — inkl. Portforward-Guard und der kubectl-Pflicht für DDL/Superuser/Writes.

> **gh-axi:** Bevorzugter GitHub-CLI-Wrapper für alle Agents (`gh-axi` statt `gh`). Kommando-Referenz: [`.claude/skills/references/gh-axi.md`](.claude/skills/references/gh-axi.md).

**Before dispatching any agent, inject active plan context:**
Run `bash scripts/plan-context.sh <role> --with-openspec` and prepend output to the agent prompt wrapped in `<active-plans>` tags. If the script produces no output, omit the block entirely. `--with-openspec` auto-loads the SSOT spec(s) for any files changed vs main — omit only when explicitly told to skip OpenSpec context.

```bash
context=$(bash scripts/plan-context.sh bachelorprojekt-infra --with-openspec)
[ -n "$context" ] && prompt="<active-plans>\n${context}\n</active-plans>\n\n${task_prompt}"
```

> **`<role>` muss ein voller Rollenname sein.** Gültig sind ausschließlich die in
> `_role_allowlist()` in `scripts/plan-context.sh` gelisteten Namen —
> `bachelorprojekt-{website,ops,infra,test,db,security}` plus `orchestrator`. Eine Kurzform wie
> `infra` schlägt **nicht** fehl: sie fällt still auf `__ALL__` zurück, gibt nur ein `WARN:
> unknown role` auf stderr aus und liefert **alle** Proposals ungefiltert — der Rollenfilter wirkt
> dann gar nicht (T002322). Die Allowlist wird hier bewusst nicht dupliziert; maßgeblich ist die
> Funktion im Skript.

**Zusätzlich den kuratierten Werkzeug-Satz injizieren:**
`bash scripts/toolset-context.sh <role>` rendert aus `docs/agent-guide/registry/capabilities.yaml`
alle Werkzeuge, die diese Rolle führen darf — samt `use_when`, `avoid_when`, `fallback` und
Verweis auf die Tiefenreferenz. Damit greift ein Subagent zum kanonischen Pfad (`gh-axi` statt
`gh`, `ticket-mcp` statt `kubectl exec … psql`), statt zu raten.

```bash
context=$(bash scripts/plan-context.sh bachelorprojekt-infra --with-openspec)
[ -n "$context" ] && prompt="<active-plans>\n${context}\n</active-plans>\n\n${task_prompt}"

tools=$(bash scripts/toolset-context.sh bachelorprojekt-infra)
[ -n "$tools" ] && prompt="<toolset>\n${tools}\n</toolset>\n\n${prompt}"
```

> **`toolset-context.sh` ist fail-closed — anders als `plan-context.sh`.** Eine unbekannte Rolle
> beendet es mit Exit ≠ 0 und gibt **keine** Instanz aus, statt auf „alle" zurückzufallen. Für
> einen Werkzeug-Block wäre der stille Fallback schädlich: eine vertippte Rolle injizierte das
> vollständige Arsenal in jeden Prompt und erzeugte genau den Kontext-Bloat, gegen den kuriert
> wird. Die Rollenliste ist dieselbe, erweitert um die Wildcard `all`. Kuration und
> Registry-Schema: Skill [`toolset-curate`](.claude/skills/toolset-curate/SKILL.md), Gate
> `task agents:toolset:check` (fail-closed), Karte `docs/agent-guide/maps/toolset-map.md`.

Also: after `superpowers:writing-plans` skill creates a new plan file, run `bash scripts/vda.sh frontmatter <plan-file>` on it before committing. (`scripts/plan-frontmatter-hook.sh` ist deprecated und gibt bei jedem Aufruf eine Deprecation-Warnung aus — sie erschien bisher bei **jedem** Planlauf, weil diese Zeile genau das Skript verlangte [T002342-M2]. Das Skript selbst bleibt bestehen: es kann externe Aufrufer haben, und Löschen wäre ein eigener Vorgang mit eigener Prüfung.) This adds the required frontmatter (domains, status) that `plan-context.sh` and the GH Action depend on.

**Tie-break rule:** when signals overlap (e.g. "deploy the website"), prefer the domain of the files being changed — `bachelorprojekt-website` for `website/src/` changes, `bachelorprojekt-infra` for manifest/overlay changes.

**Cross-cutting requests** (e.g. a feature spanning both website and k8s) stay with the main orchestrator, which coordinates multiple agents in sequence.

### Session model & delegation (T002153)

The main loop runs on the **user's default model** — `.claude/settings.json` deliberately pins **no** `model:` key, so `/model` (currently Opus 5, 1M context) decides. Model tiering lives where the dispatch happens:

- **Domain agents** carry it in their frontmatter: `bachelorprojekt-ops/-db/-test/-website` → `sonnet` (mechanical recon, queries, tests, UI), `bachelorprojekt-infra`/`-security` → `opus` (cross-system, risky, irreversible).
- **Ad-hoc subagents** get an explicit `model` per dispatch — inheriting the main loop now means inheriting Opus. See [`subagent-provisioning.md`](.claude/skills/references/subagent-provisioning.md).

**The 1M context window is a budget, not a licence.** Bulk reads (CI logs, research sweeps, multi-file recon) still belong in a subagent that reports back *condensed*; the orchestrator context stays reserved for decisions.

## Default Workflow

For any work request in this repo (add/change/fix/build), invoke **`dev-flow-plan`** (`.claude/skills/dev-flow-plan/SKILL.md`). It declares the path, and for **feature/fix** does worktree setup, brainstorming, spec, and plan creation — then commits and pushes the plan to the branch and stops. **Chores** (maintenance, no behavior change) route to **`dev-flow-chore`** (`.claude/skills/dev-flow-chore/SKILL.md`), which executes and merges inline (no plan/execute handoff). When ready to implement a staged plan, invoke **`dev-flow-execute`** (`.claude/skills/dev-flow-execute/SKILL.md`) — it picks up the plan, runs implementation, verification, PR, and post-merge deploy. All auto-invoke via their `description` frontmatter; no special wiring needed. The `dev-flow-*` skills are project orchestrators that call the generic `superpowers:*` skills for discipline — see `.claude/skills/OVERVIEW.md` (Schicht-Kontrakt) for the layering and which step calls which.

### OpenSpec native change workflow
Specifications are written in the OpenSpec format under `openspec/`. Drive the lifecycle with the upstream **`/opsx:*` commands** — `/opsx:propose <slug>` (skeleton, status `planning`), `/opsx:apply <slug>` (mark implementable, status `plan_staged`), `/opsx:archive <slug>` (archive a done change + merge its delta into the SSOT spec), `/opsx:explore` (think-through). The `task openspec:propose|apply|archive` wrappers are **equivalent fallbacks** for environments without the OpenSpec CLI installed; `task openspec:validate` is the fail-closed CI gate. Authoring conventions (German Purpose, English Requirements/Scenarios, task sizing) are SSOT in **`openspec/config.yaml`**. Full contract: **AGENTS.md → "OpenSpec conventions"** (the cross-harness single source of truth — this block mirrors it).

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
- **korczewski (BRAND)**: The standalone korczewski cluster has been **TORN DOWN** (intentional, PR #1189). Its hosts `pk-hetzner-4/6/8` now run the unified **`fleet`** k3s cluster. DNS for `korczewski.de` routes to fleet. Operate the korczewski brand via the **`fleet`** context, namespace `workspace-korczewski` (`ENV=fleet-korczewski` or `ENV=korczewski`).
- **`fleet`**: The unified cluster — **3 CP nodes** (pk-hetzner-4/6/8) + **3 worker nodes** (gekko-hetzner-2/3/4). Both brands at **26/26** pods in `workspace` and `workspace-korczewski`. Single source of truth for all production workloads — `fleet` is the only live **prod** context. Locally there are additionally the k3d dev contexts `k3d-mentolder-dev` and `k3d-korczewski-dev`; any other context still listed by `kubectl config get-contexts` (`devc`, `gekko-hetzner-2-dev`, …) points at decommissioned hardware.

### Key components
- **`k3d/`** -- All base Kubernetes manifests (Kustomize). This is the base that both `task workspace:deploy` (push, legacy/break-glass) and the **Flux GitOps pipeline** (pull-based, primary) apply in prod. Deployment is **pull-based via FluxCD** on the fleet cluster — the OCI artifact at `ghcr.io/paddione/fleet-manifests` is rendered by `.github/workflows/render-fleet-artifact.yml` on every `main` push, then reconciled by Flux (see `flux/clusters/fleet/`). `task workspace:deploy` exists as break-glass fallback.
- **`prod/`** -- Shared production patches (TLS, resource limits, replicas, DDNS) consumed by the env-specific overlays. Never apply directly.
- **`prod-fleet/mentolder/`, `prod-fleet/korczewski/`** -- The per-brand overlays **actually applied in prod**, referenced by `ENV_OVERLAY` (the `overlay:` key) in `environments/mentolder.yaml` / `environments/korczewski.yaml`. Each *wraps* the legacy brand overlay (`resources: ../../prod-mentolder` / `../../prod-korczewski`) and layers the `fleet-common` component + fleet node-affinity repoints on top. `task workspace:deploy ENV=<brand>` builds `prod-fleet/<brand>`.
- **`prod-fleet/mentolder-jobs/`, `prod-fleet/korczewski-jobs/`** (T002207) -- Isolated one-shot bootstrap/seed Job overlays. Use the same base as the brand but `$patch: delete` all non-Job resource types. Referenced by `flux-<brand>-jobs` Kustomizations (see below). These decouple Job failures from the brand application stack — a broken `pocket-id-client-seed` no longer blocks the entire brand deploy.
- **`flux/clusters/fleet/ks-jobs-mentolder.yaml`, `flux/clusters/fleet/ks-jobs-korczewski.yaml`** (T002207) -- Flux Kustomizations for the isolated Jobs overlays above. Declare `dependsOn: [flux-mentolder]` / `[flux-korczewski]` so they run AFTER the brand stack, `force: true` for self-healing against immutable field errors, and `wait: false` so they never gate downstream Kustomizations. Status checked via `flux:stalled` task.
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
- **Pocket ID OIDC clients**: there are **no realm JSON files** — Pocket ID keeps its clients in its own PostgreSQL database (`pocket_id.oidc_clients`). They are provisioned by the `pocket-id-client-seed` Job (`k3d/pocket-id-client-seed.yaml`) via the Pocket ID Admin REST API on every `task workspace:deploy`. Client secrets are written back into `workspace-secrets` (and, for the website client only, additionally into `website-secrets` in the `website` namespace — see `k3d/pocket-id-client-seed-website-rbac.yaml`). Editing clients by hand in the UI causes drift the next deploy will overwrite.
- **Nextcloud OIDC**: `k3d/nextcloud-oidc-dev.php` (dev) / `prod/nextcloud-oidc-prod.php` (prod), both loaded as ConfigMap. They point at Pocket ID (`oidc_login_provider_url` → `http://pocket-id:1411` in dev).
- **SSO flow**: **Pocket ID** (`ghcr.io/pocket-id/pocket-id`, `k3d/pocket-id.yaml`) is the OIDC provider. Around 20 clients are seeded, including website, nextcloud, vaultwarden, brett, docs, downloads, grafana, mediaviewer, studio, videovault, brain, comfy, terminal, traefik, mail, rustdesk-web, session-hub and claude-code. Services without native OIDC sit behind an `oauth2-proxy` gate (20 manifests reference it) rather than talking to the provider directly.

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on every PR:
- Offline tests: `task test:all` (BATS unit tests, kustomize manifest structure, Taskfile dry-run)
- **Test inventory check**: re-runs `task test:inventory` and fails the job if `website/src/data/test-inventory.json` differs from the committed version — regenerate it locally and commit alongside any test additions.
- **BATS convention (tests/spec/) [T002416]**: Neue `@test`-Blöcke gehören in eine **eigene Datei** unter `tests/spec/<spec-slug>/<kurz-slug>.bats` — ein Verzeichnis pro OpenSpec-SSOT-Spec aus `openspec/specs/`, eine Datei pro Vorgang. Nicht mehr an die Sammeldatei `tests/spec/<spec-slug>.bats` anhängen: genau das ließ Parallelarbeit strukturell am Dateiende kollidieren (`tests/spec/ci-cd.bats` lag am 2026-07-28 gleichzeitig in drei offenen PRs). Der Runner läuft seit T002416 mit `bats -r tests/spec/` und erfasst **beide** Formen, deshalb bleiben die Bestandsdateien auf der obersten Ebene unverändert liegen — sie werden nicht migriert, nur nicht mehr erweitert. Weiterhin gilt: keine ticket-nummerierten Dateien (`FA-SF-42.bats`); Fallback für Querschnittstests ohne klare Spec ist `tests/unit/`.
  > `merge=union` für `.bats` ist **keine** Lösung für Append-Konflikte und darf nicht gesetzt werden: es merged zeilenweise ohne Blockstruktur, erzeugt syntaktisch kaputte Dateien und liefert dabei **keinen** Konfliktmarker — der Merge gilt als erfolgreich. Guard: `tests/spec/ci-cd/spec-dir-convention.bats`.
- **BATS `$output` matching**: never assert `[[ "$output" == *"<term>"* ]]` unqualified against a script's full stdout+stderr — if the script prints `$0` in its usage/help text (common; `grep -rl 'echo.*\$0\|Usage:.*\$0' scripts/*.sh` lists current offenders), the invoking worktree's directory name (itself usually derived from the change slug) can satisfy the match even when the feature being tested does not exist yet. Narrow the assertion to the relevant output line first (`... | grep '^Commands:' | grep -c 'term'`). One confirmed case fixed in `tests/spec/factory-reclaim-lock-respect.bats` (T002267/T002272); repo-wide scan found no further open occurrences, so this stays a documented convention rather than a CI lint for now — re-evaluate if more cases surface.
- **Output- statt Source-Verifikation [T002448-M4]**: Tests prüfen command output und Resultate, nicht die Implementierungsquelle. Ein Test, der z.B. belegen will, dass `scripts/agent-lock.sh claim` den Lock schreibt, führt den Befehl AUS und prüft dessen output/result (Lock-Datei existiert, JSON-Feld korrekt) — er greppt nicht die Quelldatei. Source-Grep (z.B. `grep -q 'claim' scripts/agent-lock.sh`) belegt nur, dass Text existiert, nicht dass Verhalten stimmt — solche Assertions sind output verification widrig.
- **BATS runner path**: Use `tests/unit/lib/bats-core/bin/bats` (vendored) — NOT `./tests/bats/bin/bats` (does not exist) or `which bats` (global npm version, may differ from CI). Example: `tests/unit/lib/bats-core/bin/bats tests/spec/my-test.bats`
- **Positiv-Anker-Pflicht bei Negativtests [T002356-M1]**: Jeder Test der Form „X darf nicht vorkommen" braucht **im selben Test** einen Positiv-Anker, der bei fehlender Implementierung rot wird. Ohne ihn besteht der Test vakuos: fehlt die Funktion, ist die Kandidatenliste leer, und „1 ist nicht in []" gilt trivial. Reihenfolge: erst prüfen, dass der gültige Fall durchläuft, dann die Negativ-Aussage.
- **CRLF-tolerante Anker bei `.ps1`-Dateien [T002338-M2]**: Die PowerShell-Dateien im Repo (`scripts/llm/*.ps1`) sind durchgehend CRLF. Ein Regex, der auf `$` ankert, matcht dort nicht — `\r` gehört zur POSIX-Klasse `[[:space:]]`, also `[[:space:]]*$` verwenden; sonst schlagen Guards gegen Windows-stämmige Skripte falsch-negativ fehl. Bemerkenswert und deshalb hier notiert: derselbe Ausdruck matchte in der interaktiven Shell, aber nicht unter BATS.
- **`bash -n` taugt NICHT als Syntax-Check für `.bats` [T002351-M2]**: `@test "name" { … }` ist keine gültige Bash-Syntax; `bash -n` meldet einen irreführenden Fehler. Brauchbar ist `tests/unit/lib/bats-core/bin/bats --count <datei>`.
- **Append-Konflikte in `tests/spec/*.bats` sind normal [T002351-M2]**: Die Konvention „eine `.bats`-Datei pro SSOT-Spec" führt dazu, dass Parallelarbeit an derselben Spec am **Dateiende** kollidiert. Die Auflösung ist nicht „eine Seite wählen", sondern **beide Blöcke behalten** und die geteilte schließende Klammer duplizieren.
- **Release notes**: Generate structured release notes from merged PRs via `bash scripts/vda.sh release-notes generate` or `task release:notes` (LLM/DeepSeek-gestützt mit deterministischem Fallback). Publish to GitHub Release body with `publish-github` or prepend to `CHANGELOG.md` with `publish-changelog`.
- Systembrett template validation (`scripts/tests/systembrett-template.test.sh`)
- Security scan: image-pin advisory + hardcoded-secret detection in `k3d/*.yaml`
Other workflows: `renovate.yml` (self-hosted Renovate weekly dependency update bot, T000898), `e2e.yml` (nightly Playwright against both brands on fleet), `build-brett.yml` (auto build+rollout both brands on `brett/**` push to main), `build-docs.yml` (auto build on `docs/**`/docs-script push to main, plus manual dispatch), `build-collabora.yml`, `build-transcriber.yml`, `build-website.yml` (auto build+rollout on `website/**` push to main — **one** workflow builds a brand-neutral image that feeds both the mentolder and korczewski deploy jobs; there is no separate korczewski website workflow, see T001229/T001276).
Note: `tracking-import` CronJob was removed in PR #788 (2026-05-15); `track-pr.yml` was removed in PR #993 (2026-05-23); `build-tracking.yml` and `track-plans.yml` are gone — both parts of the tracking pipeline are fully removed. The Kore homepage timeline still renders from `v_timeline` but shows only historical data (last tracked PR: #787).

## Image Exclusions

The following components intentionally use `:latest` images and are excluded from standard pinning requirements: Website, Brett, Docs, Videovault, Mediaviewer-Widget, Mentolder-Web, Downloads, Brain, Studio, Talk-Transcriber.
This ensures that Infrastructure and Dev workflows correctly identify these as "live" targets that do not require manual digest pinning.

## Development Rules

1. Only deploy via k3d/k3s with Kustomize (`k3d/` is the base). Prod is deployed **pull-based via FluxCD GitOps** (primary path: `.github/workflows/render-fleet-artifact.yml` → OCI artifact → Flux reconciliation on fleet). The legacy `task workspace:deploy ENV=<brand>` / `task feature:*` push-based path exists as **break-glass fallback** only — prefer Flux reconciliation.
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
- **Security & Session**: security-guidance rewake, agent-lock.sh claim/release/reap protocol, ENV= explicit targeting, cluster node placement (wg-fleet flannel-iface).
- **Overlays & Config**: prod-fleet/* only (never bare prod/, $patch:delete), env-resolve.sh sourcing, envsubst lists, DB queries (never SELECT * on ticket_plans.content).
- **Ops & Infra**: cluster reset order, push-based/pull-first, CONFLICTING PR suppresses CI, ENV=staging, Kore design system, local-first LLM pipeline, dev.mentolder.de stack, alt-worktrees submodule gitdirs.
- **gitleaks: lokal installieren, aber die CI-Version (T002506/T002554)**: Fehlt `gitleaks`, wird der lokale Pre-Commit-Secret-Scan **stillschweigend übersprungen** (`⚠ gitleaks binary not found — skipping secret scan`); CI ist fail-closed, aber ein versehentlich committeter Schlüssel fällt dann erst **nach dem Push** auf — nach dem Zeitpunkt, ab dem er als kompromittiert gilt.
  > **Nicht `apt install`** — das liefert 8.16.0, während `.github/workflows/ci.yml` per curl **8.18.2** holt. Lokal und CI würden unterschiedlich prüfen. Stattdessen dieselbe Version installieren:
  > ```bash
  > curl -sSfL https://github.com/gitleaks/gitleaks/releases/download/v8.18.2/gitleaks_8.18.2_linux_x64.tar.gz \
  >   | tar -xz -C /tmp gitleaks && install -m 0755 /tmp/gitleaks ~/.local/bin/gitleaks
  > ```
  > Hook und CI rufen gitleaks mit `--no-git` auf, scannen also den **Arbeitsbaum** statt der Versionierung. Der CI-Job `security-scan` führt kein `npm ci` aus und hat deshalb weder `node_modules` noch `tmp/` — lokal existieren beide. Bis T002554 blockierten daraus 85 Fehlalarme jeden lokalen Commit: gitleaks zu *installieren* machte den Commit-Pfad kaputt, und brauchbar war der Hook nur, solange das Binary fehlte und er fail-open übersprang. Beide Pfade stehen jetzt in `allowlist.paths` (sie sind gitignored, können also nie in einen Commit gelangen). Wer eine neue gitignorierte Fundquelle hinzufügt, ergänzt sie dort — nicht den Hook abschalten.

### Test-Resultats-Konvention [T002448-M4]

Tests MÜSSEN die tatsächlichen Ergebnisse/Outputs von Kommandos prüfen (`run`, `$output`, `$status`) — d.h. **command output verification** statt Implementierungsmuster im Quellcode (`grep` auf Script-Interna). Ein Test, der per `grep` einen Flag-Namen im Source sucht statt das tatsächliche Laufzeitverhalten zu messen, kann den falschen Erfolgsfall bestätigen, während die reale Operation fehlschlägt. Ausnahme: Querschnittstests, deren Ergebnis sich ausschließlich im Quelltext manifestiert (z. B. Dokumentationskonventionen, CI-Konfiguration) — hier ist `grep` das angemessene Mittel. Die Testdatei selbst dokumentiert im Header-Kommentar, welcher Prüfmodus verwendet wird.

### PowerShell-Skripte aus WSL (.ps1) [T002495-M7]

PowerShell-Skripte unter `scripts/llm/*.ps1`, die aus WSL bearbeitet werden:
- MÜSSEN rein ASCII kodiert sein (kein BOM, keine typografischen Sonderzeichen/Em-Dashes). PS 5.1 unter Windows liest UTF-8 ohne BOM als CP1252.
- Vor dem Commit mit `[System.Management.Automation.Language.Parser]::ParseFile` oder BATS/linter prüfen.
- Generierte Konfigurationsdateien (`.conf`) mit `-Encoding ASCII` statt `UTF8` schreiben (BOM in WireGuard-Confs bricht Tunnel-Services ab).

### Bug-Triage-Konvention (CFR-Gate G-DORA03)

**Jeder nach-Merge entdeckte Fehler wird als `type=bug`-Ticket erfasst** — kein stiller `fix()`-Commit ohne Ticket-Referenz. Die Change Failure Rate (broad proxy: fix()-Rate) wird mit `bash scripts/vda.sh cfr` gemessen, Ziel ≤ 15 % über 8 Wochen; ein ungeticketer `fix()`-Commit zählt als verschleierter Bug und verschlechtert den Proxy-Wert, ohne in der DORA-Auswertung unter `/admin/dora` zu erscheinen.

Ablauf: Bug entdecken → `bash scripts/ticket.sh create --type bug --title "..."` → Branch + PR → nach Merge wird Ticket automatisch `done`.

