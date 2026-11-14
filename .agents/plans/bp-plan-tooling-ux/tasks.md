---
title: bp-plan-tooling-ux — Plan-Lint und Finalizer melden klar und fehlerfrei
ticket_id: none (Bachelorprojekt, repo.tickets none)
domains: [scripts, testing]
status: staged
goal: bp-plan-tooling-ux
---

# bp-plan-tooling-ux — Implementation Plan

Spec: `.agents/goals/bp-plan-tooling-ux/GOAL.md` (Modell: Plan traegt Goal).
Base: `origin/main`, Branch `fix/bp-plan-tooling-ux`.
Reproducer: `proposal.md` (alle vier Befunde mit Befehl und Ausgabe belegt).
Design-Entscheide: `design.md`.

## File Structure

- Modify: `scripts/plan-lint.sh`
- Modify: `scripts/devflow-post-merge-finalize.sh`
- Modify: `scripts/lib/finalize-frontmatter.sh`
- Modify: `tests/py/spec/native_ported/spec/devflow-mcp/test_plan_stage.py`
- New: `tests/py/spec/test_bp_plan_tooling_ux.py`
- Modify (mcp-servers-Checkout, eigener Commit): `server.mjs`, `lib/plan-stage.mjs`
  unter `~/mcp-servers/devflow/`

Wirksame Schwellen ohne Backticks notiert (keine behaupteten Zahlen im Plan):
plan-lint.sh Ist 745 gegen Schwelle 800, Aenderung strikt zeilenneutral halten.
devflow-post-merge-finalize.sh Ist 354 gegen Baseline 812, Reserve gross.
finalize-frontmatter.sh Ist 61 gegen Schwelle 800, Reserve gross.
test_plan_stage.py Ist 263 gegen Schwelle 800, Reserve gross.
Das neue Testmodul bleibt deutlich unter der py-Schwelle 800.

## Task 1: RED-Beleg sichern

**Files:**
- Modify: `tests/py/spec/test_bp_plan_tooling_ux.py`
- Modify: `tests/py/spec/native_ported/spec/devflow-mcp/test_plan_stage.py`

 Pruefe, dass alle neuen Tests auf dem Stand vor dem Fix fehlschlagen:

```bash
bash scripts/pytest-run.sh tests/py/spec/test_bp_plan_tooling_ux.py
```

Run: `bash scripts/pytest-run.sh tests/py/spec/test_bp_plan_tooling_ux.py`
Expected: FAIL with 5 failing tests (STRUCT2-Dateibezug, Partial-Dateibezug,
Zeichenlimit, Draft-Status, unaufloesbarer Plan).

```bash
bash scripts/pytest-run.sh tests/py/spec/native_ported/spec/devflow-mcp/test_plan_stage.py
```

Run: `bash scripts/pytest-run.sh tests/py/spec/native_ported/spec/devflow-mcp/test_plan_stage.py`
Expected: FAIL with 1 failing test (unbekanntes Repo wird ignoriert).

## Task 2: plan-lint meldet Datei und Regeltext

**Files:**
- Modify: `scripts/plan-lint.sh`
- Modify: `tests/py/spec/test_bp_plan_tooling_ux.py`

Erweitere die zwei STRUCT2-`hard`-Zeilen und die T002453-C-Zeile in
`scripts/plan-lint.sh` um den geprueften Dateibezug und den Regeltext:

- Single-Modus: `STRUCT2: no task contains a failing-test step (checked
  <relpath>) — at least one task must run a real test runner and expect it to
  FAIL first; the final 'task test:*' verify does NOT count`. `<relpath>` ist
  repo-relativ oder der Basisname ausserhalb des Repos.
- Phrase-ohne-Runner: gleiche Klammer mit Dateibezug und `does NOT count`.
- Partial-Modus: dieselben Saetze mit `tasks.d/<tests-partial>` als Bezug,
  abgeleitet aus `STRUCT2_FILE`.
- Budget: `T002453-C: <base> hat ~<tokens> Token (>7000, ~<chars> Zeichen,
  Limit ~28000) — every tasks.d/ partial stays <= 7000 tokens (~28000 chars)
  - split the slot otherwise`.
- Zeilenneutral bleiben (Reserve nur 55 Zeilen): keine neuen Funktionen,
  nur Meldungsbau. Danach alle drei Tests aus Task 1 im Plan-Lint-Teil gruen.

## Task 3: Finalizer Schritt 7 ohne stille Fehler und ohne False Positives

**Files:**
- Modify: `scripts/devflow-post-merge-finalize.sh`
- Modify: `scripts/lib/finalize-frontmatter.sh`
- Modify: `tests/py/spec/test_bp_plan_tooling_ux.py`

- `_plan_frontmatter_state` in `scripts/lib/finalize-frontmatter.sh` meldet
  `completed` nur bei `^status: completed$`, `stale` bei der bestehenden
  Aktiv-Alternation und sonst nichts (Exit 1 ohne Ausgabe). Die Alternation
  steht weiter genau einmal im Hauptskript.
- Schritt 7 in `scripts/devflow-post-merge-finalize.sh`: `completed` bleibt
  Skip, `stale` bleibt Markieren+Commit, unbekannter Status und im Worktree
  nicht aufloesbarer Plan werden `ERROR: Schritt 7` mit Status- bzw.
  Pfadnennung, Exit 1, Worktree erhalten. Danach beide Finalizer-Tests gruen.

## Task 4: plan_stage und plan_lint pruefen das Ziel-Repo

**Files:**
- Modify: `tests/py/spec/native_ported/spec/devflow-mcp/test_plan_stage.py`
- Modify (mcp-servers-Checkout, eigener Commit): `server.mjs`
- Modify (mcp-servers-Checkout, eigener Commit): `lib/plan-stage.mjs`

- `repo`-Feld (Pfad oder Alias) in die Input-Schemas von `plan_stage` und
  `plan_lint` in `server.mjs` aufnehmen, ueber `resolveRepo` aufloesen und vor
  jeder Worktree-Anlage pruefen (Verzeichnis plus Git-Repo, sonst Fehler mit
  `repo` im Text, kein Worktree). `planStage` prueft das Ziel zusaetzlich.
- Der mcp-servers-Anteil wird im mcp-servers-Checkout separat committet.
- Danach alle Tests in `test_plan_stage.py` gruen, inklusive Anker mit
  explizitem Repo.

## Task 5: Verify

- [ ] Voller Gate-Lauf ueber die geaenderten Bereiche:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
