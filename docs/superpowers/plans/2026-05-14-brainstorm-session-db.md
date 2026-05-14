---
ticket_id: T000374
---

# Brainstorm Session Choice Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When dev-flow-plan commits a plan, the brainstorm-chosen approach (e.g., "A") and session ID are stored in the plan frontmatter and persisted into `superpowers.plans` so the analytics dashboard can show which approach was chosen per plan.

**Architecture:** Four-layer change: (1) a helper script extracts the last `choice` from a brainstorm session events file; (2) dev-flow-plan injects `brainstorm_choice` + `brainstorm_session` into the plan frontmatter; (3) `plans_parse.py` passes these fields through to the pending JSON; (4) `writePlanToDb()` + `ensurePlanSchema()` in `track-pr.mjs` store them in `superpowers.plans`. No new DB table needed — two nullable columns on the existing `superpowers.plans` table.

**Tech Stack:** Bash (`scripts/`), Python 3 (`scripts/plans_parse.py`), Node.js ESM (`scripts/track-pr.mjs`), PostgreSQL

---

## File Map

| File | Change |
|------|--------|
| `scripts/brainstorm-extract-choice.sh` | NEW — reads `$STATE_DIR/events` NDJSON, outputs last `choice` value |
| `.claude/skills/dev-flow-plan/SKILL.md` | Add post-brainstorm step to call the helper and inject frontmatter |
| `scripts/plans_parse.py` | Read `brainstorm_choice`, `brainstorm_session` from frontmatter, include in JSON output |
| `scripts/track-pr.mjs` | `ensurePlanSchema()` adds two columns; `writePlanToDb()` persists them |

---

### Task 1: Write `brainstorm-extract-choice.sh`

**Files:**
- Create: `scripts/brainstorm-extract-choice.sh`
- Create: `tests/unit/brainstorm-extract-choice.bats`

- [ ] **Step 1: Create the script**

Create `scripts/brainstorm-extract-choice.sh`:

```bash
#!/usr/bin/env bash
# Read the last {"choice": "X"} event from a brainstorm session events file.
# Usage: brainstorm-extract-choice.sh <state_dir>
# Output: prints the choice label (e.g. "A") or exits 1 if no choice event found.
set -euo pipefail

STATE_DIR="${1:?Usage: brainstorm-extract-choice.sh <state_dir>}"
EVENTS_FILE="$STATE_DIR/events"

if [[ ! -f "$EVENTS_FILE" ]]; then
  echo "no events file at $EVENTS_FILE" >&2
  exit 1
fi

CHOICE=$(grep -o '"choice":"[^"]*"' "$EVENTS_FILE" | tail -1 | sed 's/"choice":"//;s/"//')
if [[ -z "$CHOICE" ]]; then
  echo "no choice event found in $EVENTS_FILE" >&2
  exit 1
fi

echo "$CHOICE"
```

Then: `chmod +x scripts/brainstorm-extract-choice.sh`

- [ ] **Step 2: Write a BATS test**

Create `tests/unit/brainstorm-extract-choice.bats`:

```bash
#!/usr/bin/env bats
# Tests for scripts/brainstorm-extract-choice.sh

setup() {
  TMPDIR="$(mktemp -d)"
  export TMPDIR
}

teardown() {
  rm -rf "$TMPDIR"
}

@test "extracts last choice from events file" {
  echo '{"type":"click","choice":"A","timestamp":1}' > "$TMPDIR/events"
  echo '{"type":"click","choice":"B","timestamp":2}' >> "$TMPDIR/events"
  run bash scripts/brainstorm-extract-choice.sh "$TMPDIR"
  [ "$status" -eq 0 ]
  [ "$output" = "B" ]
}

@test "exits 1 when no events file" {
  run bash scripts/brainstorm-extract-choice.sh "$TMPDIR"
  [ "$status" -eq 1 ]
}

@test "exits 1 when no choice event in file" {
  echo '{"type":"scroll","timestamp":1}' > "$TMPDIR/events"
  run bash scripts/brainstorm-extract-choice.sh "$TMPDIR"
  [ "$status" -eq 1 ]
}
```

- [ ] **Step 3: Run BATS tests**

```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/brainstorm-extract-choice.bats
```

Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add scripts/brainstorm-extract-choice.sh tests/unit/brainstorm-extract-choice.bats
git commit -m "feat(brainstorm): add brainstorm-extract-choice.sh helper [T000374]"
```

---

### Task 2: Inject brainstorm fields into plan frontmatter in `dev-flow-plan`

**Files:**
- Modify: `.claude/skills/dev-flow-plan/SKILL.md`

- [ ] **Step 1: Locate the ticket_id injection block in the skill**

In `.claude/skills/dev-flow-plan/SKILL.md`, find the `awk` block that injects `ticket_id` into the plan frontmatter (in "Schritt 4.5: Ticket anlegen"). It looks like:

```bash
awk 'NR==1{print; print "ticket_id: '"$TICKET_EXT_ID"'"; next} 1' \
  docs/superpowers/plans/<date>-<slug>.md > /tmp/_plan_tmp.md && \
  mv /tmp/_plan_tmp.md docs/superpowers/plans/<date>-<slug>.md
```

- [ ] **Step 2: Add brainstorm field injection immediately after the ticket_id block**

Insert after the `mv /tmp/_plan_tmp.md ...` line:

```bash
# Inject brainstorm_choice + brainstorm_session (best-effort — skip if no events)
if BRAINSTORM_CHOICE=$(bash scripts/brainstorm-extract-choice.sh "$STATE_DIR" 2>/dev/null); then
  SESSION_ID=$(basename "$(dirname "$STATE_DIR")")
  awk -v c="$BRAINSTORM_CHOICE" -v s="$SESSION_ID" \
    'NR==1{print; print "brainstorm_choice: " c; print "brainstorm_session: " s; next} 1' \
    docs/superpowers/plans/<date>-<slug>.md > /tmp/_plan_tmp.md && \
    mv /tmp/_plan_tmp.md docs/superpowers/plans/<date>-<slug>.md
  echo "Brainstorm choice '\''$BRAINSTORM_CHOICE'\'' (session $SESSION_ID) recorded"
fi
```

Note: `$STATE_DIR` is already set earlier in the Feature-Pfad from the `start-server.sh` output. `SESSION_ID` is the brainstorm session directory name (parent of `state/`).

- [ ] **Step 3: Verify the edit**

```bash
grep -c "brainstorm_choice" .claude/skills/dev-flow-plan/SKILL.md
```

Expected: 1 or more occurrences.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/dev-flow-plan/SKILL.md
git commit -m "feat(dev-flow-plan): inject brainstorm_choice + brainstorm_session into plan frontmatter [T000374]"
```

---

### Task 3: Pass `brainstorm_choice` and `brainstorm_session` through `plans_parse.py`

**Files:**
- Modify: `scripts/plans_parse.py`
- Create: `scripts/plans_parse.test.py`

- [ ] **Step 1: Write a failing Python test**

Create `scripts/plans_parse.test.py`:

```python
#!/usr/bin/env python3
import tempfile, pathlib, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plans_parse import parse_plan

def make_plan(extra=""):
    content = f"""---
title: Test Plan
domains: [website]
status: active
{extra}
---

# Test Plan

## Task 1: Do thing

- [ ] Step 1: Do the thing
"""
    f = tempfile.NamedTemporaryFile(suffix='.md', mode='w', delete=False)
    f.write(content)
    f.close()
    return f.name

def test_includes_brainstorm_fields():
    path = make_plan("brainstorm_choice: B\nbrainstorm_session: 123456-789012")
    result = parse_plan(path)
    assert result.get('brainstorm_choice') == 'B', \
        f"Expected 'B', got {result.get('brainstorm_choice')}"
    assert result.get('brainstorm_session') == '123456-789012', \
        f"Got {result.get('brainstorm_session')}"
    print("PASS: brainstorm fields included")

def test_missing_brainstorm_fields_are_none():
    path = make_plan()
    result = parse_plan(path)
    assert result.get('brainstorm_choice') is None, \
        f"Expected None, got {result.get('brainstorm_choice')}"
    assert result.get('brainstorm_session') is None, \
        f"Expected None, got {result.get('brainstorm_session')}"
    print("PASS: missing brainstorm fields are None")

test_includes_brainstorm_fields()
test_missing_brainstorm_fields_are_none()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python3 scripts/plans_parse.test.py
```

Expected: `AssertionError` — fields not present in result dict.

- [ ] **Step 3: Add the two fields to `parse_plan()` return dict in `scripts/plans_parse.py`**

Change the `return` statement in `parse_plan()` from:

```python
    return {
        'type': 'plan',
        'slug': slug,
        'title': fm.get('title', slug),
        'domains': fm.get('domains', []),
        'status': fm.get('status', 'active'),
        'pr_number': fm.get('pr_number'),
        'file_path': str(path),
        'sections': sections,
    }
```

to:

```python
    return {
        'type': 'plan',
        'slug': slug,
        'title': fm.get('title', slug),
        'domains': fm.get('domains', []),
        'status': fm.get('status', 'active'),
        'pr_number': fm.get('pr_number'),
        'file_path': str(path),
        'sections': sections,
        'brainstorm_choice': fm.get('brainstorm_choice') or None,
        'brainstorm_session': fm.get('brainstorm_session') or None,
    }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
python3 scripts/plans_parse.test.py
```

Expected:
```
PASS: brainstorm fields included
PASS: missing brainstorm fields are None
```

- [ ] **Step 5: Commit**

```bash
git add scripts/plans_parse.py scripts/plans_parse.test.py
git commit -m "feat(plans-parse): include brainstorm_choice + brainstorm_session in plan JSON [T000374]"
```

---

### Task 4: Store brainstorm fields in `superpowers.plans` DB table

**Files:**
- Modify: `scripts/track-pr.mjs` (`ensurePlanSchema()` and `writePlanToDb()`)

- [ ] **Step 1: Add ALTER TABLE to `ensurePlanSchema()`**

After the two `CREATE INDEX` statements in `ensurePlanSchema()` (lines 198–199), add:

```js
  // Self-heal: add brainstorm columns if they don't exist (idempotent ALTER)
  await pgClient.query(`
    ALTER TABLE superpowers.plans
      ADD COLUMN IF NOT EXISTS brainstorm_choice  TEXT,
      ADD COLUMN IF NOT EXISTS brainstorm_session TEXT
  `);
```

- [ ] **Step 2: Update INSERT and ON CONFLICT in `writePlanToDb()`**

Replace the INSERT query in `writePlanToDb()` (lines 203–213):

```js
  const result = await pgClient.query(
    `INSERT INTO superpowers.plans
       (slug, title, domains, status, pr_number, file_path,
        brainstorm_choice, brainstorm_session)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (slug) DO UPDATE SET
       title              = EXCLUDED.title,
       domains            = EXCLUDED.domains,
       status             = EXCLUDED.status,
       pr_number          = EXCLUDED.pr_number,
       file_path          = EXCLUDED.file_path,
       brainstorm_choice  = COALESCE(EXCLUDED.brainstorm_choice,
                                     superpowers.plans.brainstorm_choice),
       brainstorm_session = COALESCE(EXCLUDED.brainstorm_session,
                                     superpowers.plans.brainstorm_session)
     RETURNING id`,
    [row.slug, row.title, row.domains, row.status, row.pr_number ?? null, row.file_path,
     row.brainstorm_choice ?? null, row.brainstorm_session ?? null]
  );
```

The `COALESCE` pattern means a re-ingest without brainstorm fields won't overwrite an existing non-null value.

- [ ] **Step 3: Syntax check**

```bash
node --check scripts/track-pr.mjs && echo "OK"
```

Expected: `OK`

- [ ] **Step 4: Run track-pr unit tests**

```bash
node --test scripts/track-pr.test.mjs 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/track-pr.mjs
git commit -m "feat(plans-db): persist brainstorm_choice + brainstorm_session in superpowers.plans [T000374]"
```

---

### Task 5: Verification & PR

- [ ] **Step 1: Run all offline unit tests**

```bash
task test:unit 2>&1 | tail -15
```

Expected: all pass, including new `brainstorm-extract-choice.bats`.

- [ ] **Step 2: Verify superpowers.plans schema on prod (after first ingest post-deploy)**

```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -At -c \
  "\d superpowers.plans" 2>/dev/null | grep brainstorm
```

Expected: `brainstorm_choice` and `brainstorm_session` columns present.

- [ ] **Step 3: Create PR via commit-commands:commit-push-pr**

Invoke skill `commit-commands:commit-push-pr`.

Title: `feat(brainstorm): persist chosen approach + session ID in superpowers.plans [T000374]`

Body:
```
## Summary
- New `scripts/brainstorm-extract-choice.sh` reads last `choice` event from brainstorm session events NDJSON
- `dev-flow-plan` skill injects `brainstorm_choice` + `brainstorm_session` into plan frontmatter after brainstorming
- `plans_parse.py` passes these fields through to the pending JSON
- `ensurePlanSchema()` adds two nullable columns; `writePlanToDb()` persists them (COALESCE-safe on re-ingest)

## Test plan
- [x] `bats tests/unit/brainstorm-extract-choice.bats` passes (3 tests)
- [x] `python3 scripts/plans_parse.test.py` passes (2 tests)
- [x] `node --test scripts/track-pr.test.mjs` all pass
- [x] `task test:unit` green
- [ ] After merge: next dev-flow-plan session with brainstorming populates the fields on the next plan commit
```
