## Task 2: M3 agent-collision false-positive fix

**Purpose:** COLLISION-Warnung unterdrücken, wenn die Datei im Peer-Worktree weder existiert noch dirty ist, und Lock↔Worktree-Zuordnung validieren.

**Files:**
- `scripts/agent-collision.sh`

**Steps:**

### Step 1: Existenz-Check härten
- Zeile 127: `[ ! -f "$wt/$file" ] && ! git -C "$wt" ls-files -- "$file"` → prüft bereits
  Dateisystem + Git-Index. Zusätzlich: `git -C "$wt" status --porcelain -- "$file"` prüfen,
  ob die Datei tatsächlich dirty (M/A/??) ist. Nur wenn dirty → COLLISION.
- Alternativ: `git -C "$wt" diff --name-only HEAD -- "$file"` UND `git -C "$wt" diff --cached --name-only -- "$file"` UND `git -C "$wt" ls-files --others --exclude-standard -- "$file"` — alle drei leer → kein Dirty → kein Alarm.

### Step 2: Lock↔Worktree-Zuordnung validieren
- Vor der COLLISION-Prüfung: `git -C "$wt" rev-parse --show-toplevel 2>/dev/null` mit
  dem Lock-Pfad vergleichen. Bei Mismatch → Lock-Pfad korrigieren oder Worktree neu auflösen.
- In der COLLISION-Meldung (Zeile 151): `worktree $wt` durch den validierten Pfad ersetzen.

**Verify:**
1. Neu angelegte Datei im Worktree A → `agent-collision.sh check --branch` im Worktree B
   → keine COLLISION-Warnung (weil Datei in B nicht existiert).
2. Bestehender Test: `bash tests/unit/lib/bats-core/bin/bats tests/spec/agent-collision-false-positives.bats` → alle grün (keine Regression).
3. `bash tests/unit/lib/bats-core/bin/bats tests/spec/mishap-bundle-T002506.bats --filter 'M3'` → RED vor Fix, grün nach Fix.
