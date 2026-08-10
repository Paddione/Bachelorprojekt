## Task 1: M2 check-merged + M7 post-merge-deploy fixen

**Purpose:** Zwei Script-Bugs mit klarem Root-Cause und trivialem Fix beheben.

**Files:**
- `scripts/agent-lock-merged.sh`
- `scripts/devflow-post-merge-deploy.sh`

**Steps:**

### Step 1: M2 — check-merged false-positive fix
- `scripts/agent-lock-merged.sh:38`: `git log origin/main --oneline --grep="$ticket_id"` →
  `"[${ticket_id}]"` — nur PR-Betreff-Konvention matcht (kein Wiki-Link im Body)
- `scripts/agent-lock-merged.sh:45-52`: Body-Scan-Block ersatzlos streichen (selber Defekt)
- `scripts/agent-lock-merged.sh:38`: `--format="%H %s"` → `--format="%h %s"` (Kosmetik)

### Step 2: M7 — post-merge-deploy --merges entfernen
- `scripts/devflow-post-merge-deploy.sh:14`: `--merges` ersatzlos streichen
- Der bestehende `--grep="\\[${TICKET_ID}\\]"`-Match identifiziert den Squash-Commit bereits eindeutig

**Verify:**
1. `bash scripts/agent-lock.sh check-merged T002494` → `rc=0` (ID so nicht im main-Betreff)
2. `bash scripts/devflow-post-merge-deploy.sh T002501` → findet Commit `6d4c21775`
3. `task test:changed` grün
4. `bash tests/unit/lib/bats-core/bin/bats tests/spec/mishap-bundle-T002506.bats --filter 'M[27]'` → RED vor Fix, grün nach Fix
