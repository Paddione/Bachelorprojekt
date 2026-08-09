## Task 1: Audit-Runner `scripts/lib/zielfamilien-audit.sh` bauen

**Purpose:** Neuer, eigenständiger Audit-Runner als CLI (`bash scripts/lib/zielfamilien-audit.sh <subcommand>`),
der die T002356-M1-Fehlerklassen (E1/E2/E4/E5) auf Fixture-Korpora prüft. Läuft offline
(kein Netz/DB/Cluster — REQ-HEALTH-GOALS-AUDIT-001) und ist der Verhaltensvertrag für
`tests/spec/health-goals/zielfamilien-audit.bats` (T002448-M4: command output verification).

**Files:**
- `scripts/lib/zielfamilien-audit.sh` (neu; Budget 800, Zielgröße ≤ 350 — analog T002442)

**Kontext (Pflichtlektüre):**
- RED-Test: `tests/spec/health-goals/zielfamilien-audit.bats` (84 Zeilen, committet, rot)
- Spec: `openspec/changes/zielfamilien-audit/specs/health-goals.md` REQ-001 + REQ-002
- Taxonomie: `tasks.md` Abschnitt "Fehlerklassen" (E1–E5)

**Steps:**

### Step 1: Skeleton + Katalog-Ableitung
- Shebang `#!/usr/bin/env bash`, `set -euo pipefail`; REPO_ROOT aus `dirname "${BASH_SOURCE[0]}")/../.."`.
- Zielkatalog ableiten (keine hartkodierte Liste — SSOT sind goals.md + health-goals-check.sh):
  - `zf_catalog()` gibt pro Zeile `<FAMILY> <GOAL_ID>` aus, dedupliziert:
    - aus `.claude/lib/goals.md`: `grep -oE '^## G-[A-Z0-9]+'` → Goal-ID = `G-…`; Family = Goal-ID
      ohne abschließende Ziffernfolge (z. B. `G-E2E01` → Family `E2E`, `G-AGENTIC09` → `AGENTIC`)
    - aus `scripts/health-goals-check.sh`: `grep -oE 'row (gate|target) G-[A-Z0-9]+'` → gleiche Splittung
    - Union beider Quellen, exklusive Family `LLM` und `WT` (T002442/T002443-FREEZE)
- Fixture-Auflösung: `zf_fixture_dir()` → `--fixture <dir>`-Wert oder `$ZF_AUDIT_FIXTURES`; weder
  gesetzt → Fehlertext auf stderr + exit 2 (REQ-001: beide Wege müssen funktionieren).

### Step 2: `list-families`
- `zf_catalog()`-Familien sortieren (LC_ALL=C, `sort -u`), eine je Zeile auf stdout, exit 0.
- Muss exakt die 18 In-Scope-Familien enthalten (RED-Test):
  `AGENTIC BRAIN CFG CI CQ DB DEP DOC E2E FE GIT IF IMG OPS RH SEC SIZE TEST`
- `LLM`/`WT` dürfen NIE auftauchen.

### Step 3: `evaluate <id> <actual> [--present|--absent]` — Regel-Engine pur
- Argumente: Goal-ID, Messwert, optional Basis-Status. Default Basis-Status = `present`.
- Reihenfolge der Regeln (erste zutreffende gewinnt):
  1. `actual == "-"` → **E2** (SKIP-forever): bei `--present` → `FAIL <id> E2`, exit 1;
     bei `--absent` → PASS (korrektes n/a statt 0 — T002442-Muster, kein Fehler)
  2. `actual` nicht numerisch (kein `^-?[0-9]+$`) und nicht `-` → **E4** (Text im Vergleich):
     `FAIL <id> E4`, exit 1 — unabhängig vom Basis-Status
  3. `actual == 0` oder leer UND `--absent` → **E1** (vakuos grün, T002356-M1): `FAIL <id> E1`, exit 1
  4. sonst → `PASS <id>`, exit 0 (reale Null mit vorhandener Basis ist ein echter Messwert)
- Ausgabezeile exakt `PASS <id>` bzw. `FAIL <id> E<N>` (Begründung optional nach Doppelpunkt).

### Step 4: `check --family <P> [--fixture <dir>]` — Messung + Regeln
- Fixture-Dir via Step 1 auflösen. Goal-IDs der Family aus `zf_catalog()` filtern.
- Pro Goal-ID:
  - Marker `$fx/basis/<P>/<GOAL>.absent` → **E5** (Existenz-Anker fehlt): `FAIL <GOAL> E5: Mess-Basis fehlt (Existenz-Anker)`
  - Marker `$fx/basis/<P>/<GOAL>.present` → `PASS <GOAL>`
  - optionale Datei `$fx/basis/<P>/<GOAL>.value` (Inhalt = Messwert) → wenn vorhanden,
    Wert aus der Datei lesen und via `evaluate`-Regeln mit dem Marker-Basis-Status bewerten
  - kein Marker für das Goal → `SKIP <GOAL>` (kein Exit-Einfluss; Suite legt die Marker in p4 an)
- Exit: 0 wenn kein Goal FAIL, sonst 1. Ausgabe eine Zeile je Goal (PASS/FAIL/SKIP).
- Beispiel-Fixture (RED-Test): `basis/CQ/G-CQ02.absent` → `FAIL G-CQ02 E5: …`, exit 1;
  `basis/CQ/G-CQ02.present` → `PASS G-CQ02`, exit 0.

### Step 5: Main-Dispatch
- `case "${1:-}"` → `list-families|evaluate|check|help|*` (unbekannt: usage auf stderr, exit 2).
- Skript bleibt als CLI aufrufbar (`bash scripts/lib/zielfamilien-audit.sh …`), darf keine
  DB-/Netz-/Cluster-Aufrufe enthalten.

**Verify:**
1. `bash tests/unit/lib/bats-core/bin/bats tests/spec/health-goals/zielfamilien-audit.bats`
   → alle 7 Tests grün, exit 0 (vorher rot: `command not found` 127)
2. `bash scripts/lib/zielfamilien-audit.sh list-families` → exakt die 18 Familien, eine je Zeile
3. `bash scripts/lib/zielfamilien-audit.sh evaluate G-DB09 3 --present` → `PASS G-DB09`, exit 0
4. `wc -l scripts/lib/zielfamilien-audit.sh` → ≤ 350 (Zielgröße, Budget 800)
5. `shellcheck scripts/lib/zielfamilien-audit.sh` → keine neuen Findings
6. `task test:changed` grün
