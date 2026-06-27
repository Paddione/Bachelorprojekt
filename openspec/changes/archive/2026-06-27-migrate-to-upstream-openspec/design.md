# Design: OpenSpec improvements batch (per 2026-06-27 audit)

_Ticket: T001267 — see `proposal.md` for scope._

This document covers the implementation approach for the **3 active tickets** in the batch (T001261, T001263, T001265). T001264 is already shipped (commit `cdc8d61f`); T001262 + T001266 are parked.

---

## T001261 — Backfill SSOT specs (hoch, mittel effort)

**Goal:** Restore OpenSpec format conformance. Unblock the (future) upstream CLI migration, whose strict validator would otherwise fail on the same 11 stubs.

### Approach

**Step 1: Fill the 11 stub specs.** For each of the 11 stub specs, two strategies:

1. **Source from the archived change** — find `openspec/changes/archive/<date>-<slug>/` (if it exists), read `tasks.md` and any non-stub delta, then rewrite the SSOT spec with real Requirements/Scenarios derived from those.
2. **Delete the spec/change pair** — if the underlying work was never done, the SSOT is documenting phantom behavior. Delete the spec file and any associated change.

**Stub list** (from audit, 2026-06-27):
| Spec | Likely source | Action |
|------|---------------|--------|
| `active-sessions-hub.md` | archive/2026-06-21-active-sessions-hub | backfill |
| `ci-speed.md` | (no archive match) | investigate then decide |
| `cockpit-direct-ticket-links.md` | archive/2026-06-21-cockpit-direct-ticket-links | backfill |
| `fix-coaching-studio-prod-manifest.md` | (no archive match) | investigate then decide |
| `korczewski-monolith-keycloak-auth.md` | (no archive match) | investigate then decide |
| `openspec-pgvector.md` | archive/2026-06-21-openspec-pgvector | backfill |
| `openspec-ticket-detail-view.md` | (no archive match) | investigate then decide |
| `secrets-deploy-automation.md` | (no archive match) | investigate then decide |
| `sidekick-ai-quality.md` | (no archive match) | investigate then decide |
| `sidekick-cleanup-grilling-broadcast.md` | (no archive match) | investigate then decide |
| `t1224-lockfile-drift.md` | archive/2026-06-27-t1224-lockfile-drift | backfill |

**Step 2: Add `## Purpose` + `## Requirements` H2 headers** to all 60 specs. Mechanical: find the first paragraph after the H1 title, wrap it in `## Purpose\n…\n## Requirements\n…`. Use a sed/awk pass for the bulk, then manual review.

**Step 3: Update the homegrown validator** (`scripts/openspec-validate.ts`) to assert the new structure, so future stubs can't slip through.

### Risks

- The 11 backfilled specs might be missing context that the original author never wrote down. Mitigation: cite the source (`<!-- from archive/2026-06-XX-<slug>/tasks.md line N -->`) for traceability.
- The 60-spec bulk edit could introduce formatting issues in specs with atypical structures. Mitigation: manual review of every change; `git diff` before commit.

---

## T001263 — Install `/opsx:*` workflow commands (mittel, klein effort)

**Goal:** Make the upstream workflow commands available in both AI runtimes, so agent prompts can stop routing through `task openspec:*` bash wrappers.

### Plan

**Step 1: Install the upstream CLI** (this is a one-time host setup, not a per-repo change — done on the agent's host, not committed to git).

```bash
npm i -g @fission-ai/openspec@1.3.1
```

**Step 2: Run `openspec init` to scaffold the AI tool integration** (committed in this batch).

```bash
openspec init --tools opencode,claude --profile core --force
```

This generates:
- `.opencode/commands/opsx-{propose,explore,apply,archive}.md` (4 files; OpenCode adapter uses the plural `commands/` dir per CHANGELOG 1.3.0 PR #760)
- `.claude/skills/openspec-{propose,explore,apply,archive}/SKILL.md` (4 dirs, one SKILL.md each)

Profile `core` = `propose, explore, apply, archive` (per `src/core/profiles.ts:14`). We do NOT install `new`/`ff`/`continue`/`sync`/`verify`/`bulk-archive`/`onboard` — they're not part of our workflow.

**Step 3: Update agent skills to use the new commands** (committed).

- `.agents/skills/dev-flow-plan/SKILL.md` — replace "use `task openspec:propose -- ...`" with "use `/opsx:propose` (after `openspec init` is run)"
- `.agents/skills/dev-flow-execute/SKILL.md` — same for `/opsx:apply`

**Step 4: Verify** (manual smoke test in a worktree).

```bash
# In a fresh worktree
openspec config list     # should show profile: core, workflows: propose,explore,apply,archive
ls .opencode/commands/   # should show 4 opsx-*.md files
ls .claude/skills/openspec-*  # should show 4 directories
```

### Risks

- `openspec init` is interactive by default (asks which tools to install). The `--tools` + `--force` flags make it non-interactive; verify with a test run.
- The `--force` flag overwrites existing files in `.opencode/commands/` and `.claude/skills/`. We currently have nothing there (empty dirs), so this is safe.
- The OpenCode adapter has had two path-related bugs in the last 3 versions (CHANGELOG 1.1.1 colon→hyphen, 1.3.0 commands plural). v1.3.1 is the safe target.

### Acceptance

- 4 files in `.opencode/commands/opsx-*.md`
- 4 dirs in `.claude/skills/openspec-*/SKILL.md`
- `openspec config list` shows profile: core
- `dev-flow-plan` and `dev-flow-execute` skills reference `/opsx:*` (not `task openspec:*`)
- A dry-run of `/opsx:propose` creates the right change directory shape

---

## T001265 — Polish (niedrig, klein effort)

**Goal:** Four small hygiene items, all config + doc, batched.

### 1. Frontmatter convention

The 7 changes using YAML frontmatter in `proposal.md` (`agent-push-notifications`, `ai-ticket-auto-triage`, `bats-coverage-batch1`, `cockpit-bulk-status`, `cockpit-filter-presets`, `cockpit-mobile-view`, `s1-violations-batch1`) keep their frontmatter — our pipeline already parses it (see `scripts/openspec-embed.mjs` `stripFrontmatter`). Document the choice in `AGENTS.md` under a new "OpenSpec conventions" section so future authors don't get confused.

### 2. Expand `config.yaml:rules:`

Add two new keys to `openspec/config.yaml`:

```yaml
rules:
  proposal:
    - Schreibe Requirements auf Deutsch, Scenarios auf Englisch (GIVEN/WHEN/THEN)
    - ...
  tasks:
    - ...
  specs:                                                # NEW
    - Purpose auf Deutsch, Requirements auf Englisch, Scenarios auf Englisch (GIVEN/WHEN/THEN)
  design:                                               # NEW
    - Goals/Non-Goals explizit trennen
    - Decisions mit Begründung und ggf. Trade-offs
```

### 3. CI telemetry opt-out

Add to all `.github/workflows/*.yml` either at the workflow level or per-job:

```yaml
env:
  OPENSPEC_TELEMETRY: '0'
```

If there's a shared workflow `_common.yml` or composite action, prefer that. Otherwise, audit all `.github/workflows/*.yml` files and patch each.

### 4. Document `openspec completion install`

Add to `AGENTS.md` under a "Dev experience" section (new):

```markdown
## Dev experience

- After installing the OpenSpec CLI, run `openspec completion install` once to enable shell completions (bash/zsh/fish/powershell).
```

---

## Execution order

```
T001261 ─┐
T001263 ─┼─ parallel, no inter-dependencies
T001265 ─┘
```

T001264 is already done. T001262 + T001266 are parked.

Within each ticket, the steps are sequential. Across tickets, they're independent. Each ticket is a self-contained PR; reviewers can merge in any order.
