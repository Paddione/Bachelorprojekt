---
ticket_id: T900858
plan_ref: .agents/plans/primary-agents-omo/tasks.md
status: active
date: 2026-10-02
---

# Primary Agents over OMO Engine — Design

Date: 2026-10-02 · Status: draft for review · Scope: `docs`
Approvers: human partner. Precedence note: this skill step normally says
"commit"; repo rules (AGENTS.md) forbid direct `main` commits, so the file
stays uncommitted until reviewed, then goes via a `docs/*` branch + PR.

## 1. Context

- Interactive orchestration is Slim's `orchestrator` (sole definition;
  model pinned in `.opencode/oh-my-opencode-slim.jsonc`, workflow rules in
  `~/.config/opencode/oh-my-opencode-slim/orchestrator_append.md`).
- OMO engine (generic, no domain): `explorer`, `librarian`, `fixer`,
  `oracle`, `designer` (models pinned in `oh-my-opencode-slim.jsonc`).
- Workers: `local` (Qwen3.8-27B :1919, strong/sequential), `qwen35-mtp`
  (Qwen3.5-4B :1920, cheap, 3 slots), `exe-muse` (Muse Spark via Go,
  cloud escalation, leaf), `reviewer` (read-only).
- Current opencode primaries: `glimmer-primary` (autonomous ticket hammer),
  `big-pickle`, `ox-alpha-free` (+ internal `plan-worker-4b/-self`).
- Current Claude Code domain agents (`.claude/agents/`): `bachelorprojekt-ops,
  -db, -infra, -test, -website, -security` — six files, overlapping prompts,
  full topology duplicated.
- Agreed direction (2026-10-02): both harnesses, domain kept thin
  (OMO capability + minimal domain prompt).

## 2. Goals / non-goals

Goals: 3 thin domain primaries replacing 6 domain agents + 3 legacy opencode
primaries as interactive entry points; domain knowledge by reference
(SSOT files), never duplicated; same roster in opencode + Claude Code.
Non-goals: touching OMO engine models, MCP registry, ticket DB schema,
plan-runner workers.

## 3. Proposed roster (Approach A)

| Primary | Covers (replaces) | Signals |
|---|---|---|
| `bp-build` | infra + security (+ db schema/manifest side) | `fleet/`, kustomize, Taskfile, `ENV=`, SealedSecret, OIDC, DSGVO |
| `bp-run` | ops + db live reads | pods/logs/kubectl, GPU/LLM, postgres queries, timeline |
| `bp-ship` | test + website | BATS/Playwright, `FA-*`, Astro/Svelte, CSS, brand pages |

Slim `orchestrator` stays the only cross-cutting driver; the three primaries
are tab-selectable domain entries. `glimmer-primary` retires (its ticket-hammer
loop moves into orchestrator + `sdlc-autopilot`); `big-pickle` /
`ox-alpha-free` retire once the three are live (free-tier fallback becomes a
model choice, not a separate primary). `plan-worker-*` untouched.

## 4. Per-primary definition (thin)

Common prompt skeleton (each ≤60 lines, in `.opencode/prompts/bp-<name>.md`,
mirrored as frontmatter `description` in `.claude/agents/bp-<name>.md`):
1. role + signals (2 lines), 2. SSOT references (AGENTS.md routing,
   `docs/agent-guide/reference.md`, `docs/agent-guide/registry/runtimes.md`,
   recall-routing), 3. `bash scripts/vda.sh oracle '<goal>'` (never hardcode
   tasks), 4. plan-context injection
   (`scripts/plan-context.sh <full-role-name>`), 5. escalation-protocol
   (`scripts/agent-escalate.sh`), 6. read-only vs write scope.
No topology tables, no command lists — those live in referenced files.

- `bp-build`: model `llamacpp-local/Qwen3.8-27B`, write-capable primary,
  `task: {local, qwen35-mtp, reviewer, fixer, oracle}`. MCP: k8s status-only.
  Scope: manifests/overlays, Taskfile, secrets handling (no plaintext credential output).
- `bp-run`: model `llamacpp-local/Qwen3.8-27B`, primary, `task: {local,
  qwen35-mtp, exe-muse, oracle}`. MCP: `mcp-kubernetes` + `mcp-postgres`
  (mentolder only). Read-only filesystem for manifests; operate via
  `task workspace:*` / kubectl. First step: session-integrity probe
  (`kubectl get nodes --context fleet`).
- `bp-ship`: model `opencode-go-oai/muse-spark-1.3-contributor` (variant low)
  — reasoning-heavy UI/test work suits cloud; fallback `local`. Primary,
  `task: {local, qwen35-mtp, reviewer, designer, librarian}`. MCP: none
  (playwright disabled by default). Scope: `components/website/` (pnpm only),
  `tests/`, runner `tests/unit/lib/bats-core/bin/bats`.

## 5. Config changes

- `.opencode/agent-models.jsonc` `agent`: add `bp-build`, `bp-run`, `bp-ship`
  (`mode: primary`, prompts above, `steps: 150`); remove `glimmer-primary`,
  `big-pickle`, `ox-alpha`, `ox-alpha-free` after cutover (one PR per removal
  or single chore; keep `local`, `qwen35-mtp`, `exe-muse`, `reviewer`,
  `plan-worker-*`).
- `.opencode/opencode.jsonc` `permission.task`: extend allowlists of the three
  new primaries to the OMO plugin agents (`explorer`, `fixer`, `oracle`,
  `designer`, `librarian`) in addition to workers.
- `.opencode/oh-my-opencode-slim.jsonc`: no change (engine models stay).
- `.claude/agents/`: add `bp-build.md`, `bp-run.md`, `bp-ship.md` (same
  description + library includes + escalation); delete six legacy files after
  cutover.
- `AGENTS.md` routing table: 3 rows replacing 6; skill-dispatch map
  (`infra-ops`→build, `incident-response`→run, `database-specialist`→run,
  `website-specialist`/`web-audit`→ship, `dev-flow-e2e`→ship).

## 6. Verification

- `task mcp:sync` regenerates `.mcp.json`/opencode configs without drift.
- `task test:changed` + `task freshness:check` + `task workspace:validate`
  green on the config PR.
- Manual: each new primary tab-completes, dispatches one worker + one OMO
  agent, `plan-context.sh <full-role-name>` returns plan block, escalation
  script path resolves.

## 7. Rollout

PR1 (this spec, `docs/*` branch). PR2: opencode primaries + prompts +
permission allowlists. PR3: Claude Code mirrors + AGENTS.md routing. PR4:
retire legacy (`glimmer-primary`, `big-pickle`, `ox-alpha*`,
six `bachelorprojekt-*`). Each PR: scope preflight
(`preflight-pr-scope.sh "<title>"`), CI gate, squash-merge; tickets close
`done/shipped` on green auto-merge.

## 8. Open questions for reviewer

1. Names: `bp-*` vs full `bachelorprojekt-*` (tab-completion vs grep-compat)?
2. `bp-ship` default model: cloud `exe-muse` family (spec) vs local Qwen?
3. Keep `glimmer-primary` as deprecated alias for one cycle or delete outright?
