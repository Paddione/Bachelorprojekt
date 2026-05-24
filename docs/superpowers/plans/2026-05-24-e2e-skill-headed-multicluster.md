---
ticket_id: T000217
title: E2E Skill — Headed Multi-Cluster + Self-Patch Loop Implementation Plan
domains: []
status: active
pr_number: null
---

# E2E Skill — Headed Multi-Cluster + Self-Patch Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update `dev-flow-e2e` so that `systemtest` runs fan out across mentolder and korczewski concurrently with 4 headed workers each, and the skill auto-patches itself from mishap tickets after every run.

**Architecture:** Four targeted changes — a one-line env-var parameterisation in `playwright.config.ts`, two new Taskfile targets for headed/concurrent execution, a new `scripts/e2e-skill-selfpatch.sh` that handles the git+PR+DB orchestration for the self-patch loop, and targeted edits to `SKILL.md` wiring Step 5 and Step 9 to these new pieces.

**Tech Stack:** Bash, go-task (Taskfile), Playwright (TypeScript config), BATS (test), kubectl + psql (DB query), gh CLI (PR automation)

---

## File Map

| File | Change |
|------|--------|
| `tests/e2e/playwright.config.ts` | Replace `workers: 1` (line 9) with env-var expression |
| `Taskfile.yml` | Add two targets after `systemtest:all-prods` (after line 412) |
| `scripts/e2e-skill-selfpatch.sh` | Create new script (~90 lines, three modes) |
| `tests/local/e2e-skill-selfpatch.bats` | Create BATS unit tests for the script |
| `.claude/skills/dev-flow-e2e/SKILL.md` | Update Step 5 (add conditional) + Step 9 (replace manual block) |

---

## Task 1: Parameterise `playwright.config.ts` workers

**Files:**
- Modify: `tests/e2e/playwright.config.ts:9`

- [ ] **Step 1: Verify current value**

```bash
grep -n "workers" tests/e2e/playwright.config.ts
```

Expected output: `9:  workers: 1,`

- [ ] **Step 2: Replace the hardcoded value**

In `tests/e2e/playwright.config.ts`, replace line 9:

```ts
// Before:
  workers: 1,

// After:
  workers: process.env.PLAYWRIGHT_WORKERS ? parseInt(process.env.PLAYWRIGHT_WORKERS, 10) : 1,
```

- [ ] **Step 3: Verify the change compiles**

```bash
cd tests/e2e && node_modules/.bin/playwright --version
PLAYWRIGHT_WORKERS=4 node_modules/.bin/playwright test --list --config playwright.config.ts 2>&1 | head -3
```

Expected: no TypeScript errors, version prints, list output begins.

- [ ] **Step 4: Confirm default is still 1**

```bash
cd tests/e2e && node -e "
const { execSync } = require('child_process');
// playwright config is TS; parse worker count via config loader
" 2>&1 || true
grep "PLAYWRIGHT_WORKERS" tests/e2e/playwright.config.ts
```

Expected: the grep shows `process.env.PLAYWRIGHT_WORKERS`.

- [ ] **Step 5: Run offline test suite (must stay green)**

```bash
task test:all
```

Expected: all tests pass. If any fail, investigate before continuing.

- [ ] **Step 6: Commit**

```bash
cd /tmp/wt-e2e-skill-headed-multicluster
git add tests/e2e/playwright.config.ts
git commit -m "feat(e2e): parameterise playwright workers via PLAYWRIGHT_WORKERS env var"
```

---

## Task 2: Add Taskfile targets for headed concurrent runs

**Files:**
- Modify: `Taskfile.yml` (after line 412, after the `systemtest:all-prods` block)

- [ ] **Step 1: Verify insertion point**

```bash
grep -n "systemtest:all-prods\|systemtest:analyze" Taskfile.yml | head -4
```

Expected: `systemtest:all-prods` at ~401, `systemtest:analyze` at ~414. Insert between them.

- [ ] **Step 2: Add `systemtest:all:headed` target**

In `Taskfile.yml`, insert after the closing line of `systemtest:all-prods` (after the `vars: { ENV: "korczewski" }` line, before `systemtest:analyze:`):

```yaml
  systemtest:all:headed:
    desc: "Run all 12 system-test specs headed with 4 workers (ENV=mentolder|korczewski)"
    vars:
      ENV: '{{.ENV | default "mentolder"}}'
    preconditions:
      - sh: '[ -n "${E2E_ADMIN_PASS:-}" ]'
        msg: "systemtest:all:headed requires E2E_ADMIN_PASS in the env"
    env:
      PLAYWRIGHT_WORKERS: "4"
      SKIP_DB_PURGE: "1"
    cmds:
      - task: systemtest:cycle
        vars: { CYCLE: "1", ENV: "{{.ENV}}" }
        ignore_error: true
      - task: systemtest:cycle
        vars: { CYCLE: "2", ENV: "{{.ENV}}" }
        ignore_error: true
      - task: systemtest:cycle
        vars: { CYCLE: "3", ENV: "{{.ENV}}" }
        ignore_error: true
      - task: systemtest:cycle
        vars: { CYCLE: "4", ENV: "{{.ENV}}" }
        ignore_error: true

  systemtest:all:headed:both-prods:
    desc: "Headed 4-worker systemtest against mentolder + korczewski concurrently"
    preconditions:
      - sh: '[ -n "${E2E_ADMIN_PASS:-}" ]'
        msg: "systemtest:all:headed:both-prods requires E2E_ADMIN_PASS in the env"
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
        if [ $RC_M -ne 0 ] || [ $RC_K -ne 0 ]; then
          echo "[e2e] mentolder exit=$RC_M  korczewski exit=$RC_K"
          exit 1
        fi

```

- [ ] **Step 3: Verify targets appear in task list**

```bash
task --list 2>/dev/null | grep "systemtest:all:headed"
```

Expected output (two lines):
```
* systemtest:all:headed:              Run all 12 system-test specs headed with 4 workers ...
* systemtest:all:headed:both-prods:   Headed 4-worker systemtest against mentolder + korczewski concurrently
```

- [ ] **Step 4: Validate Taskfile syntax**

```bash
task --list 2>&1 | grep -c "systemtest:all:headed"
```

Expected: `2` (both new targets listed; if Taskfile has syntax errors, `task --list` itself exits non-zero).

- [ ] **Step 5: Confirm `E2E_ADMIN_PASS` precondition fires**

```bash
task systemtest:all:headed ENV=mentolder 2>&1 | head -3
```

Expected: task exits with error mentioning `E2E_ADMIN_PASS required` (since the var is not set in this shell).

- [ ] **Step 6: Commit**

```bash
cd /tmp/wt-e2e-skill-headed-multicluster
git add Taskfile.yml
git commit -m "feat(e2e): add systemtest:all:headed and systemtest:all:headed:both-prods Taskfile targets"
```

---

## Task 3: Create `scripts/e2e-skill-selfpatch.sh`

The script has three modes called from SKILL.md Step 9:
- `--list-trivial` — query DB, print `EXT_ID|DESCRIPTION` for each `ai_ready` trivial ticket
- `--commit EXT_ID BRANCH_NAME` — stage SKILL.md, commit, push, PR, merge, mark ticket done
- `--defer-structural` — mark all remaining `ai_ready` structural tickets as `needs_human`

**Files:**
- Create: `scripts/e2e-skill-selfpatch.sh`
- Create: `tests/local/e2e-skill-selfpatch.bats`

- [ ] **Step 1: Write the script**

Create `scripts/e2e-skill-selfpatch.sh`:

```bash
#!/usr/bin/env bash
# scripts/e2e-skill-selfpatch.sh — self-patch orchestrator for dev-flow-e2e skill.
#
# Modes:
#   --list-trivial          Print "EXT_ID|DESCRIPTION" for each ai_ready trivial ticket
#   --commit EXT_ID BRANCH  Stage SKILL.md, commit, push, PR, merge, mark ticket done
#   --defer-structural      Mark remaining ai_ready structural tickets as needs_human
#
# Trivial vs structural classification:
#   Trivial  — description contains: command|flag|example|typo|path|exit.?code|missing.*step
#   Structural — anything else (step reorder, routing change, new section)
set -euo pipefail

SKILL_MD=".claude/skills/dev-flow-e2e/SKILL.md"
SKILL_COMPONENT="skills/dev-flow-e2e"
CONTEXT="mentolder"
NS="workspace"

_pgpod() {
  kubectl get pod -n "$NS" --context "$CONTEXT" \
    -l app=shared-db -o name 2>/dev/null | head -1
}

_psql() {
  local pod="$1"; shift
  kubectl exec "$pod" -n "$NS" --context "$CONTEXT" -- \
    psql -U website -d website -At -c "$@" 2>/dev/null
}

_is_trivial() {
  echo "$1" | grep -qiE 'command|flag|example|typo|wrong.*path|missing.*step|exit.?code|add.*check'
}

case "${1:-}" in

  --list-trivial)
    POD=$(_pgpod)
    if [[ -z "$POD" ]]; then
      echo "[selfpatch] No postgres pod — skipping" >&2
      exit 0
    fi
    ROWS=$(_psql "$POD" \
      "SELECT external_id, description
       FROM tickets.tickets
       WHERE status NOT IN ('done','archived')
         AND component = '$SKILL_COMPONENT'
         AND attention_mode = 'ai_ready'
       ORDER BY created_at ASC;")
    while IFS='|' read -r ext_id desc; do
      [[ -z "$ext_id" ]] && continue
      if _is_trivial "$desc"; then
        printf '%s|%s\n' "$ext_id" "$desc"
      fi
    done <<< "$ROWS"
    ;;

  --commit)
    EXT_ID="${2:?--commit requires EXT_ID}"
    BRANCH="${3:?--commit requires BRANCH_NAME}"
    POD=$(_pgpod)

    git add "$SKILL_MD"
    git commit -m "chore(skills): skill-improvement from ticket $EXT_ID"
    git push -u origin "$BRANCH"
    gh pr create \
      --title "chore(skills): skill-improvement [$EXT_ID]" \
      --body "Auto-applied from skill-friction ticket $EXT_ID via e2e-skill-selfpatch." \
      --base main
    gh pr merge --squash --delete-branch --auto
    git checkout main
    git pull --rebase origin main

    if [[ -n "$POD" ]]; then
      _psql "$POD" \
        "UPDATE tickets.tickets SET
           status = 'done', resolution = 'fixed', done_at = now(),
           notes = COALESCE(notes || E'\n\n', '') ||
             '[e2e-skill-selfpatch $(date +%Y-%m-%d)] Trivial fix applied and merged.'
         WHERE external_id = '$EXT_ID';" >/dev/null
    fi
    echo "[selfpatch] ✓ $EXT_ID applied and merged"
    ;;

  --defer-structural)
    POD=$(_pgpod)
    [[ -z "$POD" ]] && exit 0
    ROWS=$(_psql "$POD" \
      "SELECT external_id, description
       FROM tickets.tickets
       WHERE status NOT IN ('done','archived')
         AND component = '$SKILL_COMPONENT'
         AND attention_mode = 'ai_ready'
       ORDER BY created_at ASC;")
    COUNT=0
    while IFS='|' read -r ext_id desc; do
      [[ -z "$ext_id" ]] && continue
      if ! _is_trivial "$desc"; then
        _psql "$POD" \
          "UPDATE tickets.tickets SET
             attention_mode = 'needs_human',
             notes = COALESCE(notes || E'\n\n', '') ||
               '[e2e-skill-selfpatch $(date +%Y-%m-%d)] Structural — requires human review.'
           WHERE external_id = '$ext_id';" >/dev/null
        echo "[selfpatch] → $ext_id deferred (structural)"
        COUNT=$((COUNT + 1))
      fi
    done <<< "$ROWS"
    echo "[selfpatch] $COUNT structural tickets deferred"
    ;;

  *)
    echo "Usage: $0 --list-trivial | --commit EXT_ID BRANCH | --defer-structural" >&2
    exit 2
    ;;
esac
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/e2e-skill-selfpatch.sh
```

- [ ] **Step 3: Write BATS unit tests**

Create `tests/local/e2e-skill-selfpatch.bats`:

```bash
#!/usr/bin/env bats
# tests/local/e2e-skill-selfpatch.bats — unit tests for e2e-skill-selfpatch.sh
# These tests stub kubectl/gh so they run fully offline.

setup() {
  export BATS_TMPDIR="$(mktemp -d)"
  # Stub kubectl and gh before real binaries
  mkdir -p "$BATS_TMPDIR/stubs"
  cat > "$BATS_TMPDIR/stubs/kubectl" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *"get pod"* ]]; then
  echo "pod/shared-db-0"
elif [[ "$*" == *"psql"* ]]; then
  # Return fixture rows based on query content
  if [[ "$*" == *"list-trivial-fixture"* ]]; then
    printf 'T000001|Wrong command flag --headed missing\nT000002|Step reorder needed for routing\n'
  else
    echo "1"
  fi
fi
EOF
  chmod +x "$BATS_TMPDIR/stubs/kubectl"
  # Stub gh: always exits 0
  cat > "$BATS_TMPDIR/stubs/gh" <<'EOF'
#!/usr/bin/env bash
echo "[stub-gh] $*"
EOF
  chmod +x "$BATS_TMPDIR/stubs/gh"
  export PATH="$BATS_TMPDIR/stubs:$PATH"
}

teardown() {
  rm -rf "$BATS_TMPDIR"
}

@test "e2e-skill-selfpatch: exits 2 with no args" {
  run bash scripts/e2e-skill-selfpatch.sh
  [ "$status" -eq 2 ]
  [[ "$output" == *"Usage:"* ]]
}

@test "e2e-skill-selfpatch: --list-trivial exits 0 when no pod found" {
  # Override kubectl stub to return empty pod
  cat > "$BATS_TMPDIR/stubs/kubectl" <<'EOF'
#!/usr/bin/env bash
echo ""
EOF
  chmod +x "$BATS_TMPDIR/stubs/kubectl"
  run bash scripts/e2e-skill-selfpatch.sh --list-trivial
  [ "$status" -eq 0 ]
}

@test "e2e-skill-selfpatch: trivial classification regex matches command errors" {
  # Test the classification regex directly — same pattern used in the script
  run bash -c '
    echo "wrong command flag --headed missing" \
      | grep -qiE "command|flag|example|typo|wrong.*path|missing.*step|exit.?code|add.*check" \
      && echo "trivial" || echo "structural"
  '
  [ "$status" -eq 0 ]
  [ "$output" = "trivial" ]
}

@test "e2e-skill-selfpatch: trivial classification regex rejects structural description" {
  run bash -c '
    echo "Step 5 should be moved before Step 3 to match routing order" \
      | grep -qiE "command|flag|example|typo|wrong.*path|missing.*step|exit.?code|add.*check" \
      && echo "trivial" || echo "structural"
  '
  [ "$status" -eq 0 ]
  [ "$output" = "structural" ]
}

@test "e2e-skill-selfpatch: --commit requires two args" {
  run bash scripts/e2e-skill-selfpatch.sh --commit
  [ "$status" -ne 0 ]
}

@test "e2e-skill-selfpatch: --defer-structural exits 0 when no pod" {
  cat > "$BATS_TMPDIR/stubs/kubectl" <<'EOF'
#!/usr/bin/env bash
echo ""
EOF
  chmod +x "$BATS_TMPDIR/stubs/kubectl"
  run bash scripts/e2e-skill-selfpatch.sh --defer-structural
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 4: Run BATS tests (expect pass)**

```bash
./tests/runner.sh local e2e-skill-selfpatch 2>&1 || bats tests/local/e2e-skill-selfpatch.bats
```

Expected: all 6 tests pass. If runner.sh doesn't pick up the new file by name, run bats directly.

- [ ] **Step 5: Run full offline suite**

```bash
task test:all
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
cd /tmp/wt-e2e-skill-headed-multicluster
git add scripts/e2e-skill-selfpatch.sh tests/local/e2e-skill-selfpatch.bats
git commit -m "feat(e2e): add e2e-skill-selfpatch.sh + BATS unit tests"
```

---

## Task 4: Update `SKILL.md` — Step 5 conditional + Step 9 replacement

**Files:**
- Modify: `.claude/skills/dev-flow-e2e/SKILL.md`

- [ ] **Step 1: Locate the Step 5 run command**

```bash
grep -n "npx playwright test\|Schritt 5\|Tests ausführen" .claude/skills/dev-flow-e2e/SKILL.md | head -6
```

Expected: Step 5 header at ~line 170, `npx playwright test` command visible.

- [ ] **Step 2: Replace the Step 5 run block**

Find the `## Schritt 5: Tests ausführen und verifizieren` section. The current content is:

```bash
# Einzelnen Spec gegen die Live-URL ausführen
WEBSITE_URL="$BASE_URL" npx playwright test \
  --config tests/e2e/playwright.config.ts \
  --project website \
  tests/e2e/specs/<neu>.spec.ts
```

Replace that code block with the conditional:

```bash
# Wähle Ausführungsmodus basierend auf dem Playwright-Projekt

if [[ "$PLAYWRIGHT_PROJECT" == "systemtest" ]]; then
  # systemtest: 4 headed workers, beide Cluster parallel
  # Voraussetzung: E2E_ADMIN_PASS muss gesetzt sein
  if [[ -z "${E2E_ADMIN_PASS:-}" ]]; then
    echo "ERROR: E2E_ADMIN_PASS required for systemtest runs" >&2
    exit 1
  fi
  task systemtest:all:headed:both-prods

else
  # Alle anderen Projekte: 1 Worker headless (Standardpfad)
  WEBSITE_URL="$BASE_URL" npx playwright test \
    --config tests/e2e/playwright.config.ts \
    --project "$PLAYWRIGHT_PROJECT" \
    tests/e2e/specs/<neu>.spec.ts
fi
```

Add a note above the block:

```markdown
`PLAYWRIGHT_PROJECT` ergibt sich aus Schritt 1 (URL-Mapping-Tabelle).
Für `systemtest` läuft der vollständige Zyklus gegen beide Cluster (via `task systemtest:all:headed:both-prods`).
```

- [ ] **Step 3: Locate Step 9**

```bash
grep -n "Schritt 9\|Loop-Restart\|9a\|9b\|9c\|Skill-Verbesserung" .claude/skills/dev-flow-e2e/SKILL.md | head -10
```

Expected: Step 9 header around line 253, sections 9a/9b/9c visible.

- [ ] **Step 4: Replace the Step 9 manual block**

Find `## Schritt 9: Loop-Restart & Skill-Verbesserung` through the end of the file (the `9c — Loop neu starten` section). Replace the entire content of Step 9 with:

```markdown
## Schritt 9: Loop-Restart & Skill-Verbesserung

Nach dem Mishap Report: offene Skill-Improvement-Tickets prüfen, triviale Fixes auto-anwenden, dann nächsten Zyklus starten.

### 9a — Triviale Tickets ermitteln

```bash
TRIVIAL_TICKETS=$(bash scripts/e2e-skill-selfpatch.sh --list-trivial)
```

Falls `$TRIVIAL_TICKETS` leer: direkt zu **9c**.

### 9b — Triviale Fixes anwenden

Für jedes Ticket aus `$TRIVIAL_TICKETS` (Format: `EXT_ID|DESCRIPTION`):

```bash
while IFS='|' read -r EXT_ID DESCRIPTION; do
  [[ -z "$EXT_ID" ]] && continue

  echo "Applying fix for $EXT_ID: $DESCRIPTION"

  # 1. Patch anwenden: DESCRIPTION lesen und SKILL.md editieren (Edit-Tool verwenden)
  #    Triviale Fixes: falschen Command korrigieren, fehlenden Schritt ergänzen, Beispiel präzisieren
  #    NIEMALS strukturelle Änderungen hier — nur Zeilen-Level-Korrekturen

  # 2. Nach dem Edit: Branch anlegen und via Script committen + mergen
  BRANCH="chore/e2e-skill-selfpatch-${EXT_ID,,}"
  git checkout -b "$BRANCH"
  bash scripts/e2e-skill-selfpatch.sh --commit "$EXT_ID" "$BRANCH"

done <<< "$TRIVIAL_TICKETS"
```

**Trivial vs. strukturell:**
- **Trivial:** Command korrigieren, Exit-Code-Check ergänzen, fehlendes `bash`-Schritt hinzufügen, Beispiel präzisieren
- **Strukturell:** Nummerierte Schritte umordnen/entfernen, Skill-Aufruf-Zeitpunkt ändern, Routing-Tabelle in CLAUDE.md anpassen

### 9c — Strukturelle Tickets zurückstellen

```bash
bash scripts/e2e-skill-selfpatch.sh --defer-structural
```

### 9d — Loop neu starten

```
Schritt 9 abgeschlossen. Alle skill-improvement Tickets bearbeitet (oder keine vorhanden).
→ Nächsten Zyklus starten: rufe `ticket-management` auf.
```
```

- [ ] **Step 5: Verify the skill reads cleanly**

```bash
grep -n "systemtest:all:headed:both-prods\|e2e-skill-selfpatch\|9a\|9b\|9c\|9d" \
  .claude/skills/dev-flow-e2e/SKILL.md
```

Expected: all four references present with correct line numbers.

- [ ] **Step 6: Run offline suite**

```bash
task test:all
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
cd /tmp/wt-e2e-skill-headed-multicluster
git add .claude/skills/dev-flow-e2e/SKILL.md
git commit -m "feat(e2e): update dev-flow-e2e skill — headed systemtest routing + selfpatch loop in Step 9"
```

---

## Task 5: Update test inventory + push + PR

- [ ] **Step 1: Regenerate test inventory (new BATS file added)**

```bash
task test:inventory
git diff website/src/data/test-inventory.json
```

If diff is non-empty, stage it.

- [ ] **Step 2: Run plan-frontmatter hook**

```bash
bash scripts/plan-frontmatter-hook.sh \
  docs/superpowers/plans/2026-05-24-e2e-skill-headed-multicluster.md
```

- [ ] **Step 3: Final full test run**

```bash
task test:all
```

Expected: all pass.

- [ ] **Step 4: Stage remaining files and push**

```bash
cd /tmp/wt-e2e-skill-headed-multicluster
git add docs/superpowers/plans/2026-05-24-e2e-skill-headed-multicluster.md \
        website/src/data/test-inventory.json 2>/dev/null || true
git status
git push -u origin feature/e2e-skill-headed-multicluster
```

- [ ] **Step 5: Open PR**

```bash
gh pr create \
  --title "feat(e2e): headed 4-worker multi-cluster systemtest + self-patch loop" \
  --body "$(cat <<'EOF'
## Summary
- `playwright.config.ts`: `workers` driven by `PLAYWRIGHT_WORKERS` env var (default 1 — no CI regression)
- Taskfile: `systemtest:all:headed` (single-cluster, 4 workers headed) + `systemtest:all:headed:both-prods` (concurrent fan-out across mentolder + korczewski)
- `scripts/e2e-skill-selfpatch.sh`: three-mode script handling DB query, trivial-ticket classification, git+PR+DB orchestration for the self-patch loop
- `dev-flow-e2e` SKILL.md: Step 5 routes `systemtest` project to headed both-prods target; Step 9 replaces manual kubectl block with script calls

## Test plan
- [ ] `task test:all` green
- [ ] `task --list | grep systemtest:all:headed` shows both new targets
- [ ] `task systemtest:all:headed ENV=mentolder` fails precondition without `E2E_ADMIN_PASS` (correct)
- [ ] `bats tests/local/e2e-skill-selfpatch.bats` — 6 tests pass
EOF
  )"
```

- [ ] **Step 6: Merge**

```bash
gh pr merge --squash --delete-branch
git checkout main
git pull --rebase origin main
```

---

## Success Criteria

1. `task systemtest:all:headed:both-prods` fans out across both clusters concurrently (4 headed workers each) and exits non-zero if either cluster fails
2. `task test:e2e ENV=mentolder` still runs 1 worker headless — no regression
3. `bash scripts/e2e-skill-selfpatch.sh --list-trivial` exits 0 when no DB pod reachable
4. `bats tests/local/e2e-skill-selfpatch.bats` — all 6 tests pass
5. `task test:all` green throughout
