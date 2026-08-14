---
title: MODIFIED truncation guard for openspec merge
ticket_id: T005310
domains: [test, scripts]
status: planning
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# MODIFIED truncation guard for openspec merge — Implementation Plan

Der MODIFIED-Pfad von `applyDelta` (scripts/openspec-merge.mjs, Z. 125-126) ersetzt die
SSOT-Sektion vollständig, ohne zu prüfen, ob das Delta weniger Szenarien trägt als der
Bestand — genau so löschte PR #4440 sechs Szenarien (T005308-Restore war die Reparatur).
Dieser Change baut den Count-Vergleich in den Merge-Punkt ein: trunkierendes MODIFIED
→ Warnung + Abbruch, außer mit explizitem `allowShrink`.

## File Structure

- `scripts/openspec-merge.mjs` — Trunkierungs-Guard im MODIFIED-Pfad von `applyDelta` (Task 2)
- `scripts/openspec-merge-truncation.test.ts` — neue Vitest-Datei, 3 Cases (Task 1, RED)
- `scripts/openspec.sh` — CLI-Option `--allow-shrink` durchreichen (Task 3)

## Task 1 — RED: Trunkierungs-Test-Cases schreiben und rot nachweisen — DONE (Branch-Commit b91804aea, rot nachgewiesen)

1. `scripts/openspec-merge-truncation.test.ts` anlegen (TMPDIR-Fixtures nach dem Muster von
   `openspec-merge.test.ts`): SSOT mit Requirement + 3 Szenarien; trunkierendes Delta (1
   Szenario); vollständiges Delta; drei Cases:
   - trunkierend ohne Flag → erwartet `toThrow('process.exit(1)')`
   - vollständig → kein throw
   - trunkierend mit `allowShrink` (7. Parameter) → kein throw
2. Rot nachweisen: Test 1 schlägt fehl (`expected: FAIL` — der Merge läuft aktuell still
   durch statt zu werfen). Runner: der bestehende Vitest-Aufruf für `scripts/*.test.ts`
   (Registrierung prüfen — `task test:inventory`/Taskfile; falls die neue Datei nicht
   automatisch erfasst wird, Registrierung im selben Zug ergänzen, sonst läuft der Guard
   nie in CI).

## Task 2 — GREEN: Count-Vergleich in applyDelta — DONE (7. Parameter allowShrink, MODIFIED-Count-Guard, Requirement-Zählungs-Warnung; 3 Cases grün, Suite grün)

1. Im MODIFIED-Pfad von `applyDelta` (scripts/openspec-merge.mjs): vor dem Ersetzen die
   Anzahl der `#### Scenario:`-Zeilen im Delta-Block gegen die im SSOT-Requirement
   vergleichen. Ist die Delta-Zahl kleiner:
   - Warnung auf stderr mit Requirement-Name und beiden Zahlen
   - ohne `allowShrink` (neuer 7. Parameter, Default false): `fail(...)` (process.exit(1),
     wie der bestehende MODIFIED-not-found-Guard) — SSOT bleibt unverändert
   - mit `allowShrink`: Merge läuft, Warnung bleibt
2. Requirement-Zählung als Zusatz-Warnung (Delta ersetzt mehrere Requirements) — nur
   warnen, nie blockieren.
3. Alle drei Cases grün fahren; die bestehende Suite `openspec-merge.test.ts` darf nicht
   rot werden (Regressionslauf).

## Task 3 — CLI-Durchreichung in scripts/openspec.sh — DONE (--allow-shrink in cmd_archive, batch-Liste, _merge_delta/_check_delta, openspec-merge.mjs-CLI, Hilfe-Text; E2E verifiziert)

`archive`-Aufruf: Option `--allow-shrink` akzeptieren und als allowShrink-Parameter an
applyDelta durchreichen. Default bleibt false — bewusste Konsolidierungen brauchen das
Flag explizit. Hilfe-Text ergänzen.

## Task 4 — Discover-Schritt + Verifikation

- Discover: alle `openspec/changes/archive/*/specs/*.md`-Deltas gegen ihre SSOT-Specs mit
  dem neuen Guard-Ergebnis prüfen (einmaliger Lauf); Funde als Kommentar an T005310
  dokumentieren und ggf. eigene Tickets (nicht in diesem Change fixen).
- `task test:changed` + `task freshness:regenerate` + `task freshness:check`
- `bash scripts/openspec.sh validate archive-truncation-guard`
