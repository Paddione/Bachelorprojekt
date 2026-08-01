## Task 3: M6 plan-lint W3/G1 H3-Tolerant machen

**Purpose:** W3-Cross-Check und G1-Granularitätswarnung erkennen `### Task N`-Headings (H3) ebenso wie `## Task N` (H2).

**Files:**
- `scripts/plan-lint.sh`

**Steps:**

### Step 1: W3 — File Structure Exit-Grenze anpassen
- Zeile 394: Der `awk`-Block `f&&/^##[[:space:]]/{infs=0}` beendet den File-Structure-Skip.
  Ändern zu:
  ```awk
  f&&/^##[[:space:]]Task /{infs=0}
  f&&/^###[[:space:]]+Task [0-9]/{infs=0}
  ```
  Die erste Klausel erkennt `## Task N` (H2, bestehendes Verhalten). Die zweite Klausel
  erkennt `### Task N` (H3, neues Verhalten). `### New files` innerhalb der File Structure
  triggert keine der beiden Klauseln → bleibt korrekt als Teil der File-Structure-Sektion.

### Step 2: W3 — Test-Fixture anlegen
- Eine Fixture-Datei `tests/unit/fixtures/plan-lint-h3-tasks.md` mit `### Task 1` und
  `### Task 2` (H3-Headings), gleiche Struktur wie bestehende Fixtures.
- Verifikation: `bash scripts/plan-lint.sh tests/unit/fixtures/plan-lint-h3-tasks.md` muss
  PASS (0 hard) liefern und W3 darf keine false negatives erzeugen.

### Step 3: G1 — Verifizieren (kein Code-Change nötig)
- G1 verwendet bereits `/^#+[[:space:]]+Task /` (Zeile 426), matcht also H3 korrekt.
  Der Fix in Step 1 behebt automatisch die falsche Dateizählung (weil File-Structure-
  Dateien nicht mehr in den G1-Prüfbereich fallen).
- Nach Step 1 testen: Plan mit `### Task N` + 4 Dateireferenzen → G1 soll warnen
  (wie bei `## Task N`).

**Verify:**
1. `bash scripts/plan-lint.sh tests/unit/fixtures/plan-lint-h3-tasks.md` → PASS (0 hard)
2. `bash tests/unit/lib/bats-core/bin/bats tests/unit/plan-lint.bats` → keine Regression
3. `bash tests/unit/lib/bats-core/bin/bats tests/spec/mishap-bundle-T002506.bats --filter 'M6'` → RED vor Fix, grün nach Fix
