## Task 5: RED Tests für M2, M3, M6, M7

**Purpose:** Failing Tests (RED) für jeden Script-Fix schreiben, die nach den Fixes grün werden.
Ergebnis-basiert (T002448-M4: Assertions auf command output/results, kein Source-Grep).
Vor den Fixes: **expected: FAIL** (vier rote BATS-Tests). Nach den Fixes: **PASS** (vier grüne Tests).

**Files:**
- `tests/spec/mishap-bundle-T002506.bats` (neu)

**Steps:**

### Step 1: M2 — check-merged false positive
- Commit auf main, der ein ANDERES Ticket (`T002493`) fixt, und im Commit-Body
  `[[T002494]]` als Wiki-Link in einer goals.md-Änderung referenziert.
- `bash scripts/agent-lock.sh check-merged T002494`
- **RED (vor Fix):** exit=1 (false positive — meldet "found in merged commit on main")
- **GREEN (nach Fix):** exit=0 (ID nur in Body → zählt nicht als Merger-Nachweis)
- Test-Setup: `init_git_repo` mit einem Commit, der `goals.md` ändert mit Text "...siehe [[T002494]]"

### Step 2: M7 — post-merge-deploy Squash-Merge
- Simulierter Squash-Merge-Commit auf origin/main: ein Commit mit einem Parent und
  `[T002501]` im Betreff.
- `bash scripts/devflow-post-merge-deploy.sh T002501`
- **RED (vor Fix):** exit=3 ("Kein Merge-Commit gefunden")
- **GREEN (nach Fix):** MERGE_COMMIT gesetzt, Skript prüft auf Deploy-Trigger

### Step 3: M3 — agent-collision false positive
- Worktree A: `agent-lock claim branch` auf Branch A mit neu angelegter Datei
  `openspec/changes/test-new/proposal.md` (brandneu, nie committed in anderem Worktree).
- Worktree B: `agent-lock claim branch` auf Branch B, sauber (keine Änderungen).
- `agent-collision.sh check --branch` in Worktree B
- **RED (vor Fix):** COLLISION-Warnung für test-new/proposal.md gegen Worktree A
- **GREEN (nach Fix):** exit=0, keine COLLISION-Warnung (weil Datei in A nicht dirty)

### Step 4: M6 — plan-lint H3-Tasks
- Plan-Datei mit `### Task 1: Test` und `### Task 2: Test` (H3-Headings),
  File-Structure-Tabelle mit einer Datei, die in Task 1 referenziert ist.
- `bash scripts/plan-lint.sh <plan>`
- **RED (vor Fix):** W3 meldet Datei als "listed in File Structure but no task references it"
- **GREEN (nach Fix):** PASS, W3 erkennt die Referenz in `### Task 1`

### Step 5: Update Test-Inventar
- `bash scripts/build-test-inventory.sh` — neue Datei registrieren
- FA-SF-Test-IDs vergeben (nächste freie Nummern aus dem Software-Factory-Namensraum)

**Verify:**
1. `bash tests/unit/lib/bats-core/bin/bats tests/spec/mishap-bundle-T002506.bats` → 4 RED (erwartete Failures)
2. Nach den Fixes (P1–P3): → 4 GREEN
3. `task test:changed` grün (keine Regression in anderen Spec-Dateien)
