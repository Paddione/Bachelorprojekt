---
title: Dev-Flow Tracking Improvements Implementation Plan
ticket_id: null
domains: [website, infra, db, ops, test, security]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Dev-Flow Tracking Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 9 tracking gaps in the dev-flow process so PR numbers, ticket-status transitions, plan-status, process frictions, fix-path staging, spec frontmatter, factory worktree cleanup, and chore audit-trails are all captured automatically.

**Architecture:** Every fix is script-, workflow- or skill-side only. No DB schema changes — `ticket_links` and `ticket_comments` already exist; the gaps were that scripts never wrote to them. `scripts/ticket.sh` gains an `add-pr-link` subcommand and `scripts/hooks/mishap-tracker.sh` gets a real implementation; `scripts/plan-frontmatter-hook.sh` learns a `--spec` mode and forces `status: active`; a new `post-merge.yml` Action closes tickets on merge; the dev-flow `*.SKILL.md` files wire these into the plan/fix/chore/execute flows.

**Tech Stack:** Bash (`set -euo pipefail`), PostgreSQL via `kubectl exec … psql` (the `_pgpod`/`_exec_sql` pattern in `ticket.sh`), GitHub Actions YAML, Markdown skill files, BATS unit tests, Vitest (pg-mem) for the website lib.

---

## ⚠️ Spec Correction — `ticket_links` schema (read before Task 1)

The spec's Fix 1 SQL (`INSERT INTO ticket_links (ticket_id, kind, ref, url)`) is **wrong**. The
actual table — confirmed in `website/src/lib/factory-floor.ts:248-272` (`getShipped`) and the
pg-mem fixture in `website/src/lib/factory-floor.test.ts:14-15` — has columns:

```
tickets.ticket_links (id serial, from_id text, to_id text, kind text, pr_number int, created_at timestamptz)
```

`getShipped()` reads `WHERE kind = 'pr' AND pr_number IS NOT NULL` and joins `l.from_id = t.id`.
So `add-pr-link` MUST write `from_id = <ticket uuid>`, `kind = 'pr'`, `pr_number = <int>`.
There is **no** `ref`/`url`/`ticket_id` column. Follow the schema, not the spec snippet.

---

## File map & S1 line budgets

`wc -l` was run on every file to be modified (limits from `docs/code-quality/gates.yaml` via
`.claude/skills/references/plan-quality-gates.md`: `.sh`/`.mjs` = 500, `.js` = 600, `.md` skills
are not gated by S1):

| File | Type | Current | Limit | Planned Δ | After | Status |
|------|------|---------|-------|-----------|-------|--------|
| `scripts/ticket.sh` | modify | 793 | n/a (`.sh`=500 but already baselined¹) | +~30 | ~823 | baselined — see note ① |
| `scripts/factory/pipeline.js` | modify | 776 | 600 (baselined¹) | +2 | ~778 | baselined — note ① |
| `scripts/factory/cleanup.sh` | modify | 59 | 500 | +5 | ~64 | safe |
| `scripts/factory/watchdog.sh` | modify | 28 | 500 | +12 | ~40 | safe |
| `scripts/hooks/mishap-tracker.sh` | rewrite | 7 | 500 | +~45 | ~52 | safe |
| `scripts/plan-frontmatter-hook.sh` | modify | 158 | 500 | +~35 | ~193 | safe |
| `scripts/plan-context.sh` | modify | 34 | 500 | 0–+3 | ~37 | safe (verify-only, see Task 4) |
| `scripts/fix-archive-plan-status.sh` | create | — | 500 | new ~25 | ~25 | safe |
| `.claude/skills/dev-flow-plan/SKILL.md` | modify | 232 | — | +~20 | ~252 | not S1-gated |
| `.claude/skills/dev-flow-chore/SKILL.md` | modify | 102 | — | +~15 | ~117 | not S1-gated |
| `.claude/skills/dev-flow-execute/SKILL.md` | modify | 437 | — | +~8 | ~445 | not S1-gated |
| `.github/workflows/post-merge.yml` | create | — | — | new ~35 | ~35 | not S1-gated |
| `docs/superpowers/specs/spec-frontmatter-standard.md` | create | — | — | new ~60 | ~60 | not S1-gated |

**① `scripts/ticket.sh` (793) and `scripts/factory/pipeline.js` (776) are already over their
S1 limits, therefore already in `docs/code-quality/baseline.json`.** The ratchet rule (S1):
a baselined file may not grow *its already-recorded over-limit value* — but the ratchet keys on
the recorded baseline number, and `task freshness:check` re-asserts the baseline key count, not
each file's exact line delta. **Before editing either file, in Task 1 / Task 9, run
`node scripts/code-quality/check.mjs` first to capture the current state, then again after the
edit; if check.mjs newly fails on these two files, the +30/+2 lines pushed them past the baselined
value → split the new logic into a sourced helper instead.** The `add-pr-link` command (~30 lines)
is the only non-trivial addition; if it trips the ratchet, extract it to
`scripts/lib/ticket-links.sh` (a pure helper sourced by `ticket.sh`, no back-import) and keep the
case-dispatch line in `ticket.sh`. The pipeline.js change is 2 lines and will not trip it.

**S2 (import cycles):** `mishap-tracker.sh` and any extracted helper are pure leaf scripts — they
call `ticket.sh` as a subprocess, never `source` it, so no cycle. **S3 (hostnames):** the GitHub
repo URL is no longer stored (we drop the `url` column entirely — see correction above), so no
brand-domain literal is introduced anywhere. **S4 (orphans):** `fix-archive-plan-status.sh` is a
one-shot — it is referenced from this plan's Task 5 and from the `## Geänderte Dateien` doc table;
to satisfy the orphan gate it is also linked from `docs/superpowers/specs/spec-frontmatter-standard.md`
(see Task 8). `post-merge.yml` is a workflow (auto-discovered by Actions, not S4-gated).

---

## Task 1: `ticket.sh add-pr-link` subcommand

**Files:**
- Modify: `scripts/ticket.sh` (add `cmd_add_pr_link`, register in dispatcher at line ~767, usage header line ~6)
- Test: `tests/unit/ticket-add-pr-link.bats` (new)

- [ ] **Step 1: Capture S1 baseline state for ticket.sh**

Run: `cd /tmp/wt-devflow-tracking && node scripts/code-quality/check.mjs; echo "rc=$?"`
Expected: rc=0 (clean against baseline). Note the output for ticket.sh — re-run after Step 4.

- [ ] **Step 2: Write the failing BATS test**

Create `tests/unit/ticket-add-pr-link.bats`. It mocks `kubectl` so no live cluster is needed —
mirror the offline-mock style already used in the repo's ticket BATS (a `kubectl` shim on `PATH`
that echoes a fake pod for `get pod`, and records the piped SQL for `exec`).

```bash
#!/usr/bin/env bats
# Offline test: `ticket.sh add-pr-link` builds the correct INSERT into
# tickets.ticket_links (from_id = ticket uuid, kind='pr', pr_number=<int>).
# Verifies arg-parsing + SQL shape WITHOUT a live cluster (kubectl is mocked).

setup() {
  TICKET="$BATS_TEST_DIRNAME/../../scripts/ticket.sh"
  MOCKDIR="$(mktemp -d)"
  CAP="$MOCKDIR/captured.sql"
  cat > "$MOCKDIR/kubectl" <<EOF
#!/usr/bin/env bash
# get pod → fake pod name; exec → record stdin SQL to \$CAP
if [[ "\$*" == *"get pod"* ]]; then echo "pod/shared-db-0"; exit 0; fi
if [[ "\$*" == *"exec"* ]]; then cat > "$CAP"; echo "fake-uuid-1234"; exit 0; fi
exit 0
EOF
  chmod +x "$MOCKDIR/kubectl"
  PATH="$MOCKDIR:$PATH"
  export PATH CAP
}

teardown() { rm -rf "$MOCKDIR"; }

@test "add-pr-link requires --id and --pr" {
  run bash "$TICKET" add-pr-link --id T000123
  [ "$status" -ne 0 ]
  [[ "$output" == *"--id and --pr are required"* ]]
}

@test "add-pr-link rejects a non-numeric --pr" {
  run bash "$TICKET" add-pr-link --id T000123 --pr abc
  [ "$status" -ne 0 ]
  [[ "$output" == *"--pr must be an integer"* ]]
}

@test "add-pr-link inserts into ticket_links with kind='pr' and pr_number" {
  run bash "$TICKET" add-pr-link --id T000123 --pr 1234
  [ "$status" -eq 0 ]
  grep -q "INSERT INTO tickets.ticket_links" "$CAP"
  grep -q "kind" "$CAP"
  grep -qi "pr_number" "$CAP"
  # MUST NOT reference the non-existent columns from the spec snippet
  ! grep -qE "\\bref\\b|\\burl\\b" "$CAP"
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd /tmp/wt-devflow-tracking && bats tests/unit/ticket-add-pr-link.bats`
Expected: FAIL — "Unknown command: add-pr-link" (dispatcher has no `add-pr-link` case yet).

- [ ] **Step 4: Implement `cmd_add_pr_link`**

Add this function next to `cmd_add_comment` in `scripts/ticket.sh` (it reuses `_pgpod`/`_exec_sql`,
and resolves the ticket UUID from `external_id` exactly like `cmd_archive_plan` does at line ~191).

```bash
cmd_add_pr_link() {
  local id="" pr=""
  while [[ $# -gt 0 ]]; do case "$1" in
      --id) id="$2"; shift 2 ;;
      --pr) pr="$2"; shift 2 ;;
      *)    echo "Unknown add-pr-link option: $1" >&2; exit 2 ;;
    esac; done

  if [[ -z "$id" || -z "$pr" ]]; then
    echo "ERROR: --id and --pr are required." >&2
    exit 2
  fi
  if ! [[ "$pr" =~ ^[0-9]+$ ]]; then
    echo "ERROR: --pr must be an integer (got '$pr')." >&2
    exit 2
  fi

  local pod
  pod=$(_pgpod)

  # Resolve the ticket UUID so we can set from_id (getShipped joins l.from_id = t.id).
  local uuid
  uuid=$(_exec_sql "$pod" -v ext_id="$id" <<'EOF'
SELECT id FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
)
  if [[ -z "$uuid" ]]; then
    echo "ERROR: Ticket $id not found." >&2
    exit 1
  fi

  # Idempotent: skip if a pr-link for this ticket+pr already exists.
  _exec_sql "$pod" \
    -v uuid="$uuid" \
    -v pr="$pr" <<'EOF' >/dev/null
INSERT INTO tickets.ticket_links (from_id, kind, pr_number)
SELECT :'uuid', 'pr', :'pr'::integer
WHERE NOT EXISTS (
  SELECT 1 FROM tickets.ticket_links
   WHERE from_id = :'uuid' AND kind = 'pr' AND pr_number = :'pr'::integer
);
EOF

  echo "PR link #$pr recorded for ticket $id"
}
```

Register it in the dispatcher `case` (around line 767) and the usage line (~6):

```bash
  add-pr-link)       cmd_add_pr_link "$@" ;;
```

Also append `add-pr-link` to the usage-header comment block (line 6 region) and the
`Commands:` echo string at line ~762.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /tmp/wt-devflow-tracking && bats tests/unit/ticket-add-pr-link.bats`
Expected: PASS (3 tests).

- [ ] **Step 6: Re-check S1 ratchet for ticket.sh**

Run: `cd /tmp/wt-devflow-tracking && node scripts/code-quality/check.mjs; echo "rc=$?"`
Expected: rc=0. If it now FAILS on `scripts/ticket.sh`, the +30 lines crossed the baselined value —
extract `cmd_add_pr_link`'s body to `scripts/lib/ticket-links.sh` (pure helper, `source`d at the
top of `ticket.sh` next to the other `_` helpers — it only declares the function, no top-level
side effects, no back-import) and re-run. Do NOT add a new baseline entry.

- [ ] **Step 7: Commit**

```bash
git add scripts/ticket.sh tests/unit/ticket-add-pr-link.bats
git commit -m "feat(ticket): add add-pr-link subcommand writing tickets.ticket_links"
```

---

## Task 2: Call `add-pr-link` from pipeline.js and dev-flow-execute

**Files:**
- Modify: `scripts/factory/pipeline.js:644` (Deploy phase, right after the PR is opened)
- Modify: `.claude/skills/dev-flow-execute/SKILL.md` (Schritt 6.5, after PR_NUM is read)

- [ ] **Step 1: Add the call in pipeline.js Deploy phase**

In `scripts/factory/pipeline.js`, the Deploy agent prompt opens the PR and records its number at
line ~642-644:

```js
      gh pr create --title "feat(${slug}): ${A.title}" --base main
      PR=$(gh pr view --json number -q .number)
      bash ${REPO}/scripts/ticket.sh add-comment --id ${A.ticket_id} --body "Factory: PR #$PR opened (phase=Deploy)."
```

Insert one line immediately after the `add-comment` line, inside the same template literal:

```js
      bash ${REPO}/scripts/ticket.sh add-pr-link --id ${A.ticket_id} --pr "$PR"
```

This is a 1-line insertion into the existing prompt string — no JS control-flow change, so the
`+2` budget (incl. trailing context) is correct and will not trip the ratchet.

- [ ] **Step 2: Add the call in dev-flow-execute Schritt 6.5**

In `.claude/skills/dev-flow-execute/SKILL.md`, Schritt 6.5 already reads `PR_NUM` (line ~308) and
sets the ticket to `qa_review`. Add the `add-pr-link` call right after `PR_NUM` is read:

```bash
PR_NUM=$(gh pr view --json number -q '.number')

# PR-Nummer in ticket_links eintragen, damit der Shipped-Tab sie zeigt (Fix 1):
./scripts/ticket.sh add-pr-link --id "$TICKET_ID" --pr "$PR_NUM"
```

- [ ] **Step 3: Verify pipeline.js still loads**

Run: `cd /tmp/wt-devflow-tracking && node --check scripts/factory/pipeline.js; echo "rc=$?"`
Expected: rc=0 (syntax valid). Also run `node scripts/code-quality/check.mjs` — expect rc=0.

- [ ] **Step 4: Commit**

```bash
git add scripts/factory/pipeline.js .claude/skills/dev-flow-execute/SKILL.md
git commit -m "feat(devflow): record PR number via add-pr-link in pipeline + execute"
```

---

## Task 3: `post-merge.yml` — close ticket on merge to main

**Files:**
- Create: `.github/workflows/post-merge.yml`

- [ ] **Step 1: Write the workflow**

The merged-commit subject carries the ticket id (e.g. `feat(slug): … [T000123]` or
`chore(scope): … [T000123]`). Extract it, and if present run `ticket.sh update-status … done`
against the fleet cluster via the existing `FLEET_KUBECONFIG` secret (already used by
`build-website.yml`). `ticket.sh` resolves context/namespace itself via `TICKET_CTX`/`BRAND`;
default `BRAND=mentolder` (the `workspace` namespace owns the tickets DB). No T-id → `exit 0`.

```yaml
name: post-merge
on:
  push:
    branches: [main]

jobs:
  close-ticket:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - name: Extract ticket id from merge commit and close it
        env:
          FLEET_KUBECONFIG: ${{ secrets.FLEET_KUBECONFIG }}
        run: |
          set -euo pipefail
          TICKET_ID="$(git log -1 --pretty=%B | grep -oE 'T[0-9]{6}' | head -1 || true)"
          if [[ -z "$TICKET_ID" ]]; then
            echo "No T###### id in merge commit — nothing to close."
            exit 0
          fi
          echo "Closing ticket $TICKET_ID (merged to main)."
          mkdir -p "$HOME/.kube"
          printf '%s' "$FLEET_KUBECONFIG" > "$HOME/.kube/config"
          export KUBECONFIG="$HOME/.kube/config"
          export TICKET_CTX=fleet BRAND=mentolder
          # Idempotent: re-running update-status to 'done' on an already-done
          # ticket is a no-op. Never fail the workflow on a DB hiccup.
          bash scripts/ticket.sh update-status --id "$TICKET_ID" --status done \
            || echo "WARNING: update-status failed for $TICKET_ID (non-fatal)."
```

**Decision notes (per spec Fix 2):**
- Branch without T-id → `exit 0`, never a red workflow.
- Chore tickets are created with `status: done` (Task 9) → `update-status … done` is idempotent.
- This closes the `qa_review → done` gap: a feature left at `qa_review` after merge gets pushed
  to `done` by the merge that landed it (commit subject carries `[T000XXX]`).
- `FLEET_KUBECONFIG` is pre-existing — no new secret to provision.

- [ ] **Step 2: Validate YAML syntax**

Run: `cd /tmp/wt-devflow-tracking && python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/post-merge.yml')); print('ok')"`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/post-merge.yml
git commit -m "feat(ci): post-merge workflow closes ticket on merge to main"
```

---

## Task 4: `plan-frontmatter-hook.sh` forces `status: active`

**Files:**
- Modify: `scripts/plan-frontmatter-hook.sh`
- Verify only: `scripts/plan-context.sh` (no change expected — confirm filter already works)
- Test: `tests/unit/plan-frontmatter-hook.bats` (extend existing)

**Analysis (already verified):** the hook at lines 70-102 (Case A: no frontmatter) already writes
`status: active`, and Case B/C (lines 104-158) *fills* `status: active` only when the field is
**missing/null** (`needs_status`), but **preserves** a deliberate non-active value (e.g.
`completed`). The spec's intent for Fix 3 is that staging a plan yields `status: active`. The gap:
when a plan already carries `status: completed` (e.g. a re-staged archived plan) the hook leaves it
`completed`, so `plan-context.sh` (line 17: `[[ "$status" == "active" ]]`) skips it.

**Decision:** add an opt-in `--activate` flag that *forces* `status: active`, used by the staging
call sites. Default behavior (preserve a deliberate status) is unchanged so the archive-completion
path in Task 6 is not clobbered.

- [ ] **Step 1: Confirm plan-context.sh needs no change**

Run: `cd /tmp/wt-devflow-tracking && sed -n '15,18p' scripts/plan-context.sh`
Expected: shows `status=$(awk …)` and `[[ "$status" == "active" ]] || continue`. The filter is
correct; the only requirement is that staged plans actually carry `active`. **No edit to
plan-context.sh.** (The spec's "Sicherstellen dass Filter greift" is satisfied by verification +
the `--activate` flag below; record this in the commit message.)

- [ ] **Step 2: Write the failing test (extend the existing BATS)**

Append to `tests/unit/plan-frontmatter-hook.bats`:

```bash
@test "--activate forces status:active even over an existing completed value" {
  cat > "$TMP/d-completed.md" <<'EOF'
---
title: Done Plan
domains: [infra]
status: completed
---

# Done Plan
Touches k3d/ kustomize overlays.
EOF
  run bash "$HOOK" --activate "$TMP/d-completed.md"
  [ "$status" -eq 0 ]
  grep -q "^status: active$" "$TMP/d-completed.md"
}

@test "without --activate a deliberate completed status is preserved" {
  cat > "$TMP/e-keep.md" <<'EOF'
---
title: Keep Plan
domains: [infra]
status: completed
---

# Keep Plan
Touches k3d/ kustomize overlays.
EOF
  run bash "$HOOK" "$TMP/e-keep.md"
  [ "$status" -eq 0 ]
  grep -q "^status: completed$" "$TMP/e-keep.md"
}
```

- [ ] **Step 3: Run the test to verify the new --activate test fails**

Run: `cd /tmp/wt-devflow-tracking && bats tests/unit/plan-frontmatter-hook.bats`
Expected: the `--activate` test FAILS (flag unknown → treated as the file arg → file-not-found),
the "preserve" test PASSES (current behavior).

- [ ] **Step 4: Implement the `--activate` flag**

In `scripts/plan-frontmatter-hook.sh`, parse a leading `--activate` flag before binding `FILE`
(top of file, after `set -euo pipefail`):

```bash
FORCE_ACTIVE=0
if [[ "${1:-}" == "--activate" ]]; then FORCE_ACTIVE=1; shift; fi
FILE="${1:?Usage: plan-frontmatter-hook.sh [--activate] <plan.md>}"
```

In **Case A** (no frontmatter, ~line 89) it already prints `status: active` — no change needed.

In **Case B/C** force-activate logic: change the `needs_status` computation so `--activate`
always rewrites it. Replace the existing `needs_status` block (line ~112) with:

```bash
needs_status=0
case "$st_raw" in ""|"null") needs_status=1 ;; esac
[[ "$FORCE_ACTIVE" -eq 1 ]] && needs_status=1
```

The awk already writes `status: active` whenever `needs_st==1` (lines 149-153, both the
"insert when missing" and "rewrite existing" branches), so setting `needs_status=1` is sufficient —
no awk change required. Verify the early-exit guard at line 116 still triggers a rewrite: when
`FORCE_ACTIVE=1` and only the status differs, `needs_status=1` so the guard is skipped and the awk
runs. Good.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd /tmp/wt-devflow-tracking && bats tests/unit/plan-frontmatter-hook.bats`
Expected: PASS (all cases, including the two new ones).

- [ ] **Step 6: Wire --activate into the staging call sites**

These call sites stage plans and must force-activate. Update them in the skills that own staging:
- `.claude/skills/dev-flow-plan/SKILL.md` Schritt 4.5 (feature path) and the Fix-path (Task 7).
- This plan's own bootstrap already ran the hook without `--activate` — fine, it had `null`.

In `dev-flow-plan/SKILL.md` Schritt 4.5, after the `stage-plan` call, add:

```bash
bash scripts/plan-frontmatter-hook.sh --activate "docs/superpowers/plans/<date>-<slug>.md"
```

(The Fix-path edit is in Task 7; the chore path does not stage a plan so it is not touched here.)

- [ ] **Step 7: Commit**

```bash
git add scripts/plan-frontmatter-hook.sh tests/unit/plan-frontmatter-hook.bats \
        .claude/skills/dev-flow-plan/SKILL.md
git commit -m "feat(devflow): --activate flag forces status:active when staging a plan"
```

---

## Task 5: One-shot archive-plan status fixer

**Files:**
- Create: `scripts/fix-archive-plan-status.sh`
- Data fix: the 25 `archive/*.md` plans currently carrying `status: active`

- [ ] **Step 1: Write the one-shot script**

```bash
#!/usr/bin/env bash
# scripts/fix-archive-plan-status.sh
# One-shot: flip every archived plan from `status: active` to `status: completed`
# so plan-context.sh stops injecting historical plans into agent prompts (Fix 4).
# Idempotent: re-running after the first pass changes nothing. Safe to run from
# the repo root; commit the result. Referenced by the Fix-7 spec-frontmatter doc.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
ARCHIVE_DIR="$REPO_ROOT/docs/superpowers/plans/archive"

[[ -d "$ARCHIVE_DIR" ]] || { echo "No archive dir at $ARCHIVE_DIR — nothing to do."; exit 0; }

count=0
while IFS= read -r f; do
  sed -i 's/^status: active$/status: completed/' "$f"
  echo "Fixed: ${f#"$REPO_ROOT/"}"
  count=$((count + 1))
done < <(grep -rl '^status: active$' "$ARCHIVE_DIR" --include='*.md' || true)

echo "fix-archive-plan-status: flipped $count plan(s) active → completed."
```

- [ ] **Step 2: Run it (this PR's data fix)**

Run: `cd /tmp/wt-devflow-tracking && bash scripts/fix-archive-plan-status.sh`
Expected: `Fixed: …` lines for ~25 files, then `flipped 25 plan(s) active → completed.`

- [ ] **Step 3: Verify idempotency and that no active archive plans remain**

```bash
cd /tmp/wt-devflow-tracking
bash scripts/fix-archive-plan-status.sh   # second run
grep -rl '^status: active$' docs/superpowers/plans/archive/ --include='*.md' | wc -l
```
Expected: second run reports `flipped 0 plan(s)`; the `grep | wc -l` prints `0`.

- [ ] **Step 4: Commit (script + the 25 flipped files together)**

```bash
git add scripts/fix-archive-plan-status.sh docs/superpowers/plans/archive/
git commit -m "fix(plans): flip 25 archived plans active->completed + one-shot fixer"
```

---

## Task 6: dev-flow-execute sets `status: completed` before archive

**Files:**
- Modify: `.claude/skills/dev-flow-execute/SKILL.md` Schritt 7 (line ~318-345)

This prevents Fix 4 from re-occurring: when a plan is archived, its lingering file (if any) and the
DB-archive flow should mark the plan `completed`, not leave it `active`.

- [ ] **Step 1: Edit Schritt 7**

In `.claude/skills/dev-flow-execute/SKILL.md`, Schritt 7 currently does `archive-plan` then
`rm "$PLAN_FILE"`. Insert a frontmatter flip **before** `archive-plan` so the content stored in
`tickets.ticket_plans` already reflects `completed`:

```bash
SLUG="<slug>"
BRANCH="feature/<slug>" # oder fix/<slug>
PR_NUM=$(gh pr view --json number -q '.number' 2>/dev/null || echo "")

# Plan-Frontmatter auf completed setzen, BEVOR der Inhalt archiviert wird (Fix 3/4):
sed -i 's/^status: active$/status: completed/' "$PLAN_FILE"

./scripts/ticket.sh archive-plan \
  --id "$TICKET_ID" \
  --slug "$SLUG" \
  --branch "$BRANCH" \
  --plan-file "$PLAN_FILE" \
  --pr "$PR_NUM"
```

(The `sed` is a no-op if the plan already lacks an `active` status — safe.)

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/dev-flow-execute/SKILL.md
git commit -m "feat(devflow): mark plan status:completed before archive (Schritt 7)"
```

---

## Task 7: Fix-path gains lock-claim + stage-plan

**Files:**
- Modify: `.claude/skills/dev-flow-plan/SKILL.md` Fix-Pfad (lines 176-208)

**Per spec Fix 6.** The Fix-path currently never claims the ticket lock and never stages the plan,
so fix tickets are invisible in the Kommissionierung and cannot be handed to the Factory.

- [ ] **Step 1: Add Schritt 2.5 (lock claim) after the worktree step**

In the Fix-Pfad, after Schritt 2 (Worktree anlegen, line ~198), add:

```markdown
### Schritt 2.5: Ticket & Branch claimen (Session-Koordination [T000510])
```bash
bash scripts/agent-lock.sh claim ticket "$TICKET_EXT_ID" \
  --branch "fix/<slug>" --worktree "$PWD" --label dev-flow-plan
bash scripts/agent-lock.sh claim branch "fix/<slug>" --worktree "$PWD" --label dev-flow-plan
```
Exit 1 = eine lebende Session arbeitet schon daran → koordinieren, nicht duplizieren.
```

- [ ] **Step 2: Add Schritt 4.5 (stage-plan) after the plan is written**

After Schritt 4 (Plan schreiben, line ~204), add:

```markdown
### Schritt 4.5: Plan stagen + Frontmatter aktivieren (Fix 6)
```bash
./scripts/ticket.sh stage-plan \
  --id "$TICKET_EXT_ID" \
  --branch "fix/<slug>" \
  --plan "docs/superpowers/plans/<date>-<slug>.md"

bash scripts/plan-frontmatter-hook.sh --activate "docs/superpowers/plans/<date>-<slug>.md"
```
Damit ist das Fix-Ticket in der Kommissionierung sichtbar und kann via UI-Knopf oder
`ticket.sh enqueue` an die Factory übergeben werden.
```

> **Note:** verify the `stage-plan` flag is `--plan` (not `--plan-file`). `cmd_stage_plan` parses
> `--id`/`--branch`/`--plan` (ticket.sh ~line 364-368). Match the existing feature-path call at
> Schritt 4.5 line ~150 verbatim.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/dev-flow-plan/SKILL.md
git commit -m "feat(devflow): fix-path claims lock + stages plan (Kommissionierung visibility)"
```

---

## Task 8: Spec-frontmatter standard + `--spec` mode

**Files:**
- Create: `docs/superpowers/specs/spec-frontmatter-standard.md`
- Modify: `scripts/plan-frontmatter-hook.sh` (`--spec` mode)
- Modify: `.claude/skills/dev-flow-plan/SKILL.md` Schritt 3 (Brainstorming → spec frontmatter)
- Test: `tests/unit/plan-frontmatter-hook.bats` (extend)

- [ ] **Step 1: Write the standard doc**

Create `docs/superpowers/specs/spec-frontmatter-standard.md`. Keep it ~60 lines.

```markdown
---
ticket_id: null
plan_ref: null
status: active
date: 2026-06-13
---

# Spec-Frontmatter-Standard

Jede **neue** Spec-Datei unter `docs/superpowers/specs/` erhält am Dateianfang einen
YAML-Frontmatter-Block, damit die Verbindung Spec ↔ Plan ↔ Ticket maschinenlesbar ist
(nicht nur über die Namenskonvention).

## Format

```yaml
---
ticket_id: T000XXX        # oder null, wenn (noch) kein Ticket existiert
plan_ref: docs/superpowers/plans/YYYY-MM-DD-<slug>.md   # oder null
status: active            # active = in Arbeit; completed = abgeschlossen/archiviert
date: YYYY-MM-DD
---
```

## Wer setzt es

- `dev-flow-plan` Schritt 3 (nach dem Brainstorming): setzt den Block auf die frische Spec.
- Maschinell: `bash scripts/plan-frontmatter-hook.sh --spec <spec.md>` ergänzt den Block,
  falls er fehlt (idempotent — vorhandenes Frontmatter bleibt unangetastet).

## Keine retroaktive Migration

Bestehende 100+ Specs bleiben unverändert. Der Standard gilt nur für neue Dateien.

## Verwandt

- `scripts/fix-archive-plan-status.sh` — flippt archivierte **Plan**-Frontmatter
  `active → completed` (analoge Statussemantik für Pläne).
- `scripts/plan-frontmatter-hook.sh` — Plan- und (mit `--spec`) Spec-Frontmatter.
```

(The link to `fix-archive-plan-status.sh` here satisfies the S4 orphan-reachability requirement
for that one-shot script.)

- [ ] **Step 2: Write the failing test for `--spec` mode**

Append to `tests/unit/plan-frontmatter-hook.bats`:

```bash
@test "--spec adds spec frontmatter to a spec missing it" {
  cat > "$TMP/f-spec.md" <<'EOF'
# My Feature Design

Some design prose.
EOF
  run bash "$HOOK" --spec "$TMP/f-spec.md"
  [ "$status" -eq 0 ]
  head -1 "$TMP/f-spec.md" | grep -q '^---$'
  grep -q '^ticket_id:' "$TMP/f-spec.md"
  grep -q '^plan_ref:'  "$TMP/f-spec.md"
  grep -q '^status: active$' "$TMP/f-spec.md"
  grep -q '^date:' "$TMP/f-spec.md"
}

@test "--spec is idempotent when frontmatter already present" {
  cat > "$TMP/g-spec.md" <<'EOF'
---
ticket_id: T000999
plan_ref: null
status: active
date: 2026-06-13
---

# Already Has It
EOF
  before="$(cat "$TMP/g-spec.md")"
  run bash "$HOOK" --spec "$TMP/g-spec.md"
  [ "$status" -eq 0 ]
  [ "$before" == "$(cat "$TMP/g-spec.md")" ]
}
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd /tmp/wt-devflow-tracking && bats tests/unit/plan-frontmatter-hook.bats`
Expected: the two `--spec` tests FAIL (`--spec` treated as the file arg → not found).

- [ ] **Step 4: Implement `--spec` mode**

In `scripts/plan-frontmatter-hook.sh`, handle `--spec` as a distinct early branch (before the
plan-domains logic), since specs use a different frontmatter shape (ticket_id/plan_ref/status/date,
no domains). Add after the `--activate` parsing from Task 4:

```bash
SPEC_MODE=0
if [[ "${1:-}" == "--spec" ]]; then SPEC_MODE=1; shift; fi
FILE="${1:?Usage: plan-frontmatter-hook.sh [--activate|--spec] <file.md>}"

if [[ "$SPEC_MODE" -eq 1 ]]; then
  # Idempotent: only prepend when the file has no frontmatter yet.
  if [[ "$(head -1 "$FILE" | tr -d '\r')" == "---" ]]; then
    echo "Spec frontmatter already present in $FILE — nothing to do."
    exit 0
  fi
  tmpfile="$(mktemp)"
  {
    printf '%s\n' "---"
    printf 'ticket_id: null\n'
    printf 'plan_ref: null\n'
    printf 'status: active\n'
    printf 'date: %s\n' "$(date +%F)"
    printf '%s\n\n' "---"
    cat "$FILE"
  } > "$tmpfile"
  mv "$tmpfile" "$FILE"
  echo "Added spec frontmatter to $FILE"
  exit 0
fi
```

This reuses the `_has_frontmatter`-style line-1 check inline (the helper functions are defined
below this point, so the inline `head -1` check avoids an ordering dependency — keep it inline).

- [ ] **Step 5: Run to verify pass**

Run: `cd /tmp/wt-devflow-tracking && bats tests/unit/plan-frontmatter-hook.bats`
Expected: PASS (all cases).

- [ ] **Step 6: Wire spec-frontmatter into dev-flow-plan Schritt 3**

In `.claude/skills/dev-flow-plan/SKILL.md` Schritt 3 (Brainstorming, ~line 103-105) which produces
`docs/superpowers/specs/<date>-<slug>-design.md`, add an instruction line:

```markdown
Nach dem Schreiben der Spec das Frontmatter setzen (siehe
`docs/superpowers/specs/spec-frontmatter-standard.md`):
`bash scripts/plan-frontmatter-hook.sh --spec docs/superpowers/specs/<date>-<slug>-design.md`
und `ticket_id`/`plan_ref` ausfüllen sobald Ticket-ID und Plan-Pfad feststehen.
```

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/spec-frontmatter-standard.md \
        scripts/plan-frontmatter-hook.sh tests/unit/plan-frontmatter-hook.bats \
        .claude/skills/dev-flow-plan/SKILL.md
git commit -m "feat(devflow): spec-frontmatter standard + --spec hook mode"
```

---

## Task 9: Mishap-tracker implementation

**Files:**
- Rewrite: `scripts/hooks/mishap-tracker.sh`
- Modify: `.gitignore` (add `.mishaps.log` if not already ignored)
- Test: `tests/unit/mishap-tracker.bats` (new)

- [ ] **Step 1: Check .gitignore for .mishaps.log**

Run: `cd /tmp/wt-devflow-tracking && grep -n 'mishaps' .gitignore || echo "NOT IGNORED"`
If `NOT IGNORED`, add a line `.mishaps.log` to `.gitignore` in Step 5's commit.

- [ ] **Step 2: Write the failing test**

Create `tests/unit/mishap-tracker.bats`:

```bash
#!/usr/bin/env bats
# scripts/hooks/mishap-tracker.sh — records process frictions to a ticket comment
# (via ticket.sh add-comment) or, with no --ticket, to a local .mishaps.log.

setup() {
  TRACKER="$BATS_TEST_DIRNAME/../../scripts/hooks/mishap-tracker.sh"
  WORK="$(mktemp -d)"
  cd "$WORK"
  # Stub ticket.sh on PATH so --ticket mode is observable offline.
  mkdir -p bin
  cat > bin/ticket-stub.log </dev/null
}

teardown() { rm -rf "$WORK"; }

@test "no --ticket writes to .mishaps.log" {
  run bash "$TRACKER" --friction "ENV var missing" --severity minor
  [ "$status" -eq 0 ]
  [ -f .mishaps.log ]
  grep -q "ENV var missing" .mishaps.log
  grep -q "minor" .mishaps.log
}

@test "missing --friction fails with usage" {
  run bash "$TRACKER" --severity major
  [ "$status" -ne 0 ]
  [[ "$output" == *"--friction is required"* ]]
}

@test "default severity is minor" {
  run bash "$TRACKER" --friction "no severity given"
  [ "$status" -eq 0 ]
  grep -q "minor" .mishaps.log
}
```

(The `--ticket` path delegates to `ticket.sh add-comment` which needs a cluster; it is exercised
manually in the Verification task, not in offline BATS.)

- [ ] **Step 3: Run to verify it fails**

Run: `cd /tmp/wt-devflow-tracking && bats tests/unit/mishap-tracker.bats`
Expected: FAIL — the current 7-line stub ignores all flags and writes nothing.

- [ ] **Step 4: Rewrite the tracker**

```bash
#!/usr/bin/env bash
# scripts/hooks/mishap-tracker.sh
# Record a process friction encountered during a dev-flow / factory run.
#   mishap-tracker.sh --friction "<text>" [--ticket T000XXX] [--severity minor|major|critical]
# With --ticket: appends an internal ticket comment via ticket.sh add-comment.
# Without --ticket: appends a line to ./.mishaps.log (gitignored).
# Never hard-fails a caller's flow: a failed comment write degrades to the log.
set -euo pipefail

TICKET_ID=""
FRICTION=""
SEVERITY="minor"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ticket)   TICKET_ID="$2"; shift 2 ;;
    --friction) FRICTION="$2";  shift 2 ;;
    --severity) SEVERITY="$2";  shift 2 ;;
    *)          echo "mishap-tracker: unknown option: $1" >&2; shift ;;
  esac
done

if [[ -z "$FRICTION" ]]; then
  echo "ERROR: --friction is required." >&2
  exit 2
fi

case "$SEVERITY" in
  minor|major|critical) : ;;
  *) echo "WARNING: unknown severity '$SEVERITY' — defaulting to minor." >&2; SEVERITY="minor" ;;
esac

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TICKET_SH="$HERE/../ticket.sh"

if [[ -n "$TICKET_ID" ]] && [[ -x "$TICKET_SH" ]]; then
  if bash "$TICKET_SH" add-comment --id "$TICKET_ID" \
       --body "MISHAP [${SEVERITY}]: ${FRICTION}" >/dev/null 2>&1; then
    echo "mishap recorded as comment on $TICKET_ID [${SEVERITY}]"
    exit 0
  fi
  echo "WARNING: comment write failed — falling back to .mishaps.log" >&2
fi

printf '%s [%s] %s\n' "$(date -Iseconds)" "$SEVERITY" "$FRICTION" >> .mishaps.log
echo "mishap appended to .mishaps.log [${SEVERITY}]"
```

(No emoji in the comment body — keep it ASCII `MISHAP [..]:` per project communication rules.)

- [ ] **Step 5: Run to verify it passes; commit**

Run: `cd /tmp/wt-devflow-tracking && bats tests/unit/mishap-tracker.bats`
Expected: PASS (3 tests).

```bash
# add .mishaps.log to .gitignore if Step 1 said NOT IGNORED
git add scripts/hooks/mishap-tracker.sh tests/unit/mishap-tracker.bats .gitignore
git commit -m "feat(devflow): implement mishap-tracker (--friction/--ticket/--severity)"
```

---

## Task 10: Factory worktree-cleanup hardening

**Files:**
- Modify: `scripts/factory/cleanup.sh` (add `trap cleanup EXIT`)
- Modify: `scripts/factory/watchdog.sh` (zombie-worktree removal on reset)

- [ ] **Step 1: Add trap to cleanup.sh**

`scripts/factory/cleanup.sh` already removes the worktree in the main body (lines 26-36) and always
exits 0. Harden it so an early failure/`set -e` abort still tears down the worktree. Wrap the
existing teardown in a function and trap it. Refactor minimally: rename the existing removal block
into a `_do_cleanup()` function called both directly and from the trap-guard. Simplest safe form —
add near the top after arg-parsing:

```bash
# Belt-and-suspenders: even if a later step aborts, ensure the worktree is gone.
_trap_cleanup() {
  [[ -n "${WT_PATH:-}" && -d "${WT_PATH:-/nonexistent}" ]] && \
    git worktree remove --force "$WT_PATH" 2>/dev/null || true
}
trap _trap_cleanup EXIT
```

This is additive — the existing explicit removal still runs first (idempotent: a second
`git worktree remove` on an already-removed path is a no-op `|| true`).

- [ ] **Step 2: Add zombie-worktree cleanup to watchdog.sh**

In `scripts/factory/watchdog.sh`, after a stale feature is reset to `triage` and its slot released
(inside the loop, after the `add-comment` at line ~25), remove any leftover factory worktree whose
checked-out branch matches the ticket. The factory branch convention is `feature/sf-<ticket-lc>`
(see `cleanup.sh` usage examples `feature/sf-t000469` / `/tmp/wt-sf-t000469`). Derive both and
remove defensively:

```bash
  # Zombie-Worktree-Cleanup: a hung pipeline leaves /tmp/wt-sf-* behind. Remove the
  # worktree whose branch matches this ticket (idempotent; never fails the loop).
  ext_lc="$(printf '%s' "$ext_id" | tr '[:upper:]' '[:lower:]')"
  stale_wt="$(git worktree list --porcelain 2>/dev/null \
    | awk -v b="refs/heads/feature/sf-$ext_lc" '
        /^worktree /{w=$2} $0=="branch "b{print w}')"
  if [[ -n "$stale_wt" ]]; then
    git worktree remove --force "$stale_wt" 2>/dev/null || rm -rf "$stale_wt" 2>/dev/null || true
    git worktree prune 2>/dev/null || true
  fi
```

(Place it inside the existing `for ext_id in "${stale[@]}"` loop. It runs from whatever cwd the
watchdog has — `git worktree` operates on the repo of cwd; the watchdog runs from the repo root.)

- [ ] **Step 3: Verify both scripts still parse + lint clean**

```bash
cd /tmp/wt-devflow-tracking
bash -n scripts/factory/cleanup.sh && echo "cleanup ok"
bash -n scripts/factory/watchdog.sh && echo "watchdog ok"
node scripts/code-quality/check.mjs; echo "rc=$?"
```
Expected: `cleanup ok`, `watchdog ok`, `rc=0` (both files far under the 500-line `.sh` limit).

- [ ] **Step 4: Commit**

```bash
git add scripts/factory/cleanup.sh scripts/factory/watchdog.sh
git commit -m "feat(factory): trap-based worktree cleanup + watchdog zombie-worktree reap"
```

---

## Task 11: dev-flow-chore minimal audit ticket

**Files:**
- Modify: `.claude/skills/dev-flow-chore/SKILL.md` (Schritt 1 + Schritt 4)

**Per spec Fix 9.** Chores currently leave no audit trail. Create a minimal `done` ticket and embed
its id in the commit subject so `post-merge.yml` (Task 3) finds it (and, being already `done`, the
status update is a harmless no-op).

- [ ] **Step 1: Add ticket creation to Schritt 1**

In `.claude/skills/dev-flow-chore/SKILL.md` Schritt 1 (Worktree anlegen & claimen, line ~31-41),
after the worktree + branch claim, add:

```markdown
Lege ein minimales Audit-Ticket an (type=task, status=done — Chores haben keinen Plan,
nur eine Audit-Spur):
```bash
TICKET_RESULT=$(./scripts/ticket.sh create \
  --type task \
  --brand mentolder \
  --title "chore: <slug>" \
  --status done \
  --description "Branch: chore/<slug>"$'\n'"Kein Plan — direktes Chore.")
TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)
```
```

> **Note:** valid ticket types are only `bug|feature|task|project` (NOT `chore`/`fix`). `type=task`
> is correct here. `cmd_create` accepts `--status done` directly (line 59-95), so no follow-up
> `update-status` is needed.

- [ ] **Step 2: Embed the id in the commit subject (Schritt 4)**

In Schritt 4 (Commit, Push & PR, line ~60-66), change the commit example to carry the ticket id so
`post-merge.yml` can pick it up:

```bash
git commit -m "chore(<scope>): <subject> [$TICKET_EXT_ID]"   # commitlint: Body-Zeilen <100 Zeichen
```

Add a one-line note: *"Die `[T000XXX]`-Referenz wird von `.github/workflows/post-merge.yml`
gelesen — das Ticket ist bereits `done`, der Status-Update ist ein idempotenter No-op."*

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/dev-flow-chore/SKILL.md
git commit -m "feat(devflow): chore-path creates done audit ticket + embeds id in commit"
```

---

## Task 12: Test inventory + final verification

**Files:**
- Modify: `website/src/data/test-inventory.json` (regenerated — 3 new BATS files added)

This task is the mandatory CI-equivalent gate. New BATS files were added in Tasks 1, 9 (and tests
extended in 4, 8), so the inventory must be regenerated and committed.

- [ ] **Step 1: Regenerate the test inventory**

Run: `cd /tmp/wt-devflow-tracking && task test:inventory`
Expected: `website/src/data/test-inventory.json` updated to include `ticket-add-pr-link.bats`,
`mishap-tracker.bats` (and the extended `plan-frontmatter-hook.bats`).

- [ ] **Step 2: Run the full offline suite**

Run: `cd /tmp/wt-devflow-tracking && task test:all`
Expected: PASS — all BATS (incl. the 3 new/extended files), kustomize structure, Taskfile dry-run,
`test:code-quality`, `test:factory`.

- [ ] **Step 3: Regenerate freshness artifacts**

Run: `cd /tmp/wt-devflow-tracking && task freshness:regenerate`
Expected: regenerates test-inventory, repo-index, agent-guide maps, etc. Re-stage any changes.

- [ ] **Step 4: Run the CI-equivalent freshness + quality gate**

Run: `cd /tmp/wt-devflow-tracking && task freshness:check`
Expected: PASS — freshness (no stale artifacts) + `quality:check` (S1–S4 ratchet) + baseline
key-count assertion. **If S1 fails on `scripts/ticket.sh`** → apply the Task 1 Step 6 helper-extract
fallback. **The baseline.json key count MUST equal main's** (no new baseline entries — verify with
`git diff main -- docs/code-quality/baseline.json` shows no added keys).

- [ ] **Step 5: Commit any regenerated artifacts**

```bash
cd /tmp/wt-devflow-tracking
git add website/src/data/test-inventory.json docs/ 2>/dev/null || true
git status --porcelain   # confirm nothing stale remains uncommitted
git commit -m "chore: regenerate test-inventory + freshness artifacts" || echo "nothing to commit"
```

- [ ] **Step 6: Final green-state assertion**

```bash
cd /tmp/wt-devflow-tracking
task test:all && task freshness:check && echo "ALL GREEN"
git status --porcelain   # MUST be empty
```
Expected: `ALL GREEN` and an empty `git status` (every change committed).

---

## Self-Review

**Spec coverage** — all 9 fixes + the two cross-cutting call-site edits map to tasks:
- Fix 1 (add-pr-link) → Task 1; its callers → Task 2 (pipeline.js + execute Schritt 6.5).
- Fix 2 (post-merge.yml) → Task 3.
- Fix 3 (hook status:active + execute Schritt 7 completed) → Task 4 + Task 6.
- Fix 4 (archive batch) → Task 5.
- Fix 5 (mishap-tracker) → Task 9.
- Fix 6 (fix-path lock+stage) → Task 7.
- Fix 7 (spec-frontmatter standard + --spec) → Task 8.
- Fix 8 (cleanup trap + watchdog zombie) → Task 10.
- Fix 9 (chore audit ticket) → Task 11.
- Mandatory verification (test:all/freshness) → Task 12.

**Schema correction recorded:** Task 1 uses the real `ticket_links(from_id,kind,pr_number)` columns
and explicitly asserts the spec's `ref`/`url` snippet is wrong (verified against `factory-floor.ts`).

**Placeholder scan:** every code step contains complete content; `<slug>`/`<scope>`/`<date>`
placeholders are skill-template variables (the skills already use them), not plan gaps.

**Type/flag consistency:** `add-pr-link --id/--pr`; `stage-plan --id/--branch/--plan` (matches
ticket.sh); hook flags `--activate` and `--spec` are parsed before `FILE` binding in the same task
that introduces them; mishap flags `--friction/--ticket/--severity` consistent across impl + tests.

**S1/S2/S3/S4:** budgets tabled above; the only at-risk files (`ticket.sh`, `pipeline.js`) are
pre-baselined with a check.mjs gate + helper-extract fallback (Task 1 Step 6); no new brand-domain
literals (the `url` column was dropped); `fix-archive-plan-status.sh` reachability satisfied via the
spec-standard doc link (Task 8).
