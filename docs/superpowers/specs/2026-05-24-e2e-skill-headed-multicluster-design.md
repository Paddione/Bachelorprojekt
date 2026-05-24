# Design: dev-flow-e2e — Headed Multi-Cluster E2E + Self-Patch Loop

**Date:** 2026-05-24  
**Branch:** `feature/e2e-skill-headed-multicluster`  
**Status:** approved

---

## Problem

The `dev-flow-e2e` skill has three gaps:

1. `playwright.config.ts` hardcodes `workers: 1` — no way to run parallel sessions without editing the file
2. `systemtest` runs are headed by design (Playwright needs a visible browser for Keycloak SSO flows) but the skill doesn't route to the right invocation; headed mode and 4-worker fan-out are undocumented and require manual commands
3. The self-improvement loop in Step 9 requires manual `kubectl exec` DB queries and inline git commands — it works but creates friction every cycle

---

## Approach: Hybrid — Taskfile targets + one dedicated patch script

### 1. `playwright.config.ts` — parameterise workers

Replace hardcoded `workers: 1` with:

```ts
workers: process.env.PLAYWRIGHT_WORKERS ? parseInt(process.env.PLAYWRIGHT_WORKERS, 10) : 1,
```

Default stays `1` — all existing CI behaviour unchanged. Setting `PLAYWRIGHT_WORKERS=4` activates parallel sessions. `--headed` is a CLI flag, not a config property, so no config change needed there.

---

### 2. Taskfile — two new targets

**`systemtest:all:headed`** (single cluster, 4 workers, headed)

Mirrors `systemtest:all` but exports `PLAYWRIGHT_WORKERS=4` and passes `--headed` to each `systemtest:cycle` call via `CLI_ARGS`. Requires `E2E_ADMIN_PASS` + `ENV`. All four cycles run sequentially with `ignore_error: true` (same as `systemtest:all`) so a single cycle failure doesn't abort the rest.

**`systemtest:all:headed:both-prods`** (concurrent fan-out, both clusters)

Launches `systemtest:all:headed ENV=mentolder -- --headed` and `systemtest:all:headed ENV=korczewski -- --headed` as background shell jobs, captures PIDs, `wait`s for both, aggregates exit codes. Fails the target if either cluster returned non-zero. Uses inline `& / wait` shell because Taskfile's native `deps:` array is sequential and `--parallel` doesn't support per-task ENV overrides.

```yaml
systemtest:all:headed:both-prods:
  desc: "Headed 4-worker systemtest against mentolder + korczewski (concurrent)"
  preconditions:
    - sh: '[ -n "${E2E_ADMIN_PASS:-}" ]'
      msg: "E2E_ADMIN_PASS required"
  env:
    PLAYWRIGHT_WORKERS: "4"
    SKIP_DB_PURGE: "1"
  cmds:
    - |
      task systemtest:all:headed ENV=mentolder -- --headed &
      PID_M=$!
      task systemtest:all:headed ENV=korczewski -- --headed &
      PID_K=$!
      wait $PID_M; RC_M=$?
      wait $PID_K; RC_K=$?
      [ $RC_M -eq 0 ] && [ $RC_K -eq 0 ]
```

---

### 3. `scripts/e2e-skill-selfpatch.sh` — post-run self-improvement

Replaces the manual Step 9a/9b/9c block. Called once at end of every `dev-flow-e2e` run, after `mishap-tracker` has committed new mishap tickets.

**Flow:**

1. **Query DB** — same SQL as current Step 9a: `tickets.tickets WHERE component LIKE 'skills/dev-flow-e2e' AND attention_mode = 'ai_ready' AND status NOT IN ('done','archived')`
2. **Classify each ticket** — trivial (command fix, missing step, example clarification) vs. structural (step reorder, routing change, new section)
3. **Trivial path:**
   - Locate `.claude/skills/dev-flow-e2e/SKILL.md`
   - Write patch instructions to a temp file; signal Claude to apply (or use `sed`/`awk` for single-line fixes)
   - Branch: `chore/e2e-skill-selfpatch-YYYYMMDDHHMMSS`
   - `git add` → `git commit` → `git push` → `gh pr create --auto` → `gh pr merge --squash --delete-branch`
   - `git checkout main && git pull --rebase origin main`
   - Mark ticket `status='done', resolution='fixed'` in DB
4. **Structural path:** set `attention_mode='needs_human'`, skip, continue
5. **Exit:** print `N trivial fixes applied, M structural tickets deferred`

**Timing invariant:** script runs *after* `mishap-tracker` inserts this run's new tickets. New mishaps are therefore eligible for the *next* run's patch loop — never the same run. This prevents infinite self-application loops.

---

### 4. `SKILL.md` — three targeted edits

**Step 5 (update — conditional run command):** Step 5 currently has a single `npx playwright test` invocation. Replace with a conditional block at the top of the step:

```
if project == systemtest:
  Prerequisites: E2E_ADMIN_PASS must be set
  Run: task systemtest:all:headed:both-prods
  (PLAYWRIGHT_WORKERS=4, --headed, concurrent mentolder + korczewski)
else:
  Run: task test:e2e ENV=<cluster>  ← existing path, unchanged
```

All existing result-category handling (green / env-missing skip / real failure) stays below the conditional, unchanged.

**Step 8 (minor update):** optional smoke step updated to reference `test:e2e:all-prods` for non-systemtest suites (wording clarification only).

**Step 9 (replace):** three-part manual block (kubectl query + inline git + loop-restart) replaced with:

```bash
bash scripts/e2e-skill-selfpatch.sh
```

Followed by the existing `ticket-management` loop-restart line. No other steps change.

---

## Files changed

| File | Change |
|------|--------|
| `tests/e2e/playwright.config.ts` | `workers` env-var parameterisation (1 line) |
| `Taskfile.yml` | Two new targets: `systemtest:all:headed`, `systemtest:all:headed:both-prods` |
| `scripts/e2e-skill-selfpatch.sh` | New script (~80 lines) |
| `.claude/skills/dev-flow-e2e/SKILL.md` | Step 5 insert, Step 8 wording, Step 9 replace |

---

## Out of scope

- Other Playwright projects (`website`, `mentolder`, `korczewski`, `services`) — stay headless single-worker; no changes
- CI `e2e.yml` workflow — nightly run continues using `test:e2e:all-prods` (headless, 1 worker); the new headed targets are for local skill invocation only
- `playwright.config.ts` timeout / retry tuning — not changed; existing `retries: 1` and `timeout: 45_000` apply to headed runs too

---

## Success criteria

1. `task systemtest:all:headed:both-prods` fans out across mentolder and korczewski concurrently, each with 4 headed workers, and exits non-zero if either cluster fails
2. Regular `task test:e2e ENV=mentolder` still runs 1 worker headless (no regression)
3. After a `dev-flow-e2e` run with at least one `ai_ready` `skills/dev-flow-e2e` ticket in the DB, `e2e-skill-selfpatch.sh` auto-applies trivial fixes, opens a PR, merges it, and marks the ticket `done` — without human intervention
4. `task test:all` stays green
