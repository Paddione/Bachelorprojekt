---
title: "stub-delta-pr-gate — Implementation Plan"
ticket_id: T004592
domains: [plan-authoring, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# stub-delta-pr-gate — Implementation Plan

_Ticket: T004592_

## Why

Zweite Welle unausgefüllter Stub-Deltas, die durch den PR-Merge kam (T003810/T003737/
T003812, 2026-08-14): `openspec-validate.ts` meldet Stub-Deltas nur als warnings,
`validateChange` bleibt `ok=true`, der CI-Job `test:openspec` wird grün, der PR mergebar.
Erst der Archiv-Guard schlägt später zu. Fix: Stub-Detection → errors (fail-closed im
PR-Pfad), vollständig ausformulierte Deltas bleiben grün.

## File Structure

```
scripts/openspec-validate.ts          — Stub-Muster von warnings nach errors verschieben
scripts/openspec-validate.test.ts     — Test-Semantik umstellen (RED erweitert)
openspec/changes/stub-delta-pr-gate/  — proposal + delta (dieses Ticket)
```

## Tasks

### Task 1: Rot-Phase verifizieren (failing Test)

`scripts/openspec-validate.test.ts` wurde um den Test „T004592: unedited stub delta
fails the PR gate" erweitert. Rot bestätigen:

1. `npx vitest run scripts/openspec-validate.test.ts -t "T004592"`
2. Verify test fails — `expect(result.ok).toBe(false)` schlägt fehl, weil der
   Validator aktuell `ok=true` liefert (Stub ist nur Warning).

### Task 2: Stub-Detection von warnings nach errors verschieben

`scripts/openspec-validate.ts`, Zeile 94–97 (Kommentar „Stub detection"):

1. Die drei Stub-Muster aus der `warnings`-Liste in die `errors`-Liste verschieben:
   - `### Requirement: TODO` → error `…: unedited stub '### Requirement: TODO'`
   - `#### Scenario: TODO` → error
   - `The system SHALL …` → error
2. Den Kommentar aktualisieren: Stub-Detection ist jetzt fail-closed im PR-Gate
   (`test:openspec`), Grund: zweite Archiv-Welle T004592 — Warnings haben den
   Merge nicht verhindert.
3. Keine Änderung an der Header-Validierung (ADDED/MODIFIED/…) — die ist bereits errors.

### Task 3: Test-Semantik umstellen (bestehender Warn-Test + Positiv-Anker)

`scripts/openspec-validate.test.ts`:

1. Den bestehenden Test „warns (not errors) on an unedited stub delta" durch die
   Error-Erwartung ersetzen: `expect(result.ok).toBe(false)` +
   `expect(result.errors.some(e => /stub/i.test(e))).toBe(true)` — der T004592-Test
   deckt dann beide ab (Duplikat entfernen, EINEN Stub-Test behalten).
2. Positiv-Anker prüfen: ein ausformuliertes Delta (`### Requirement: X` mit echtem
   Szenario-Text) bleibt `ok=true` — bestehender Test „passes the actual openspec/ tree"
   und die ADDED-Header-Tests müssen grün bleiben.
3. Wenn bestehende Fixtures Stub-Texte als warnings erwarten, diese Erwartungen anpassen.

### Task 4: Grün-Phase — Testlauf bestehen

1. `npm run test:openspec` — komplette Suite grün (inkl. umgestellter Stub-Test).
2. `bash scripts/openspec.sh validate` — echter Baum bleibt valide (kein Stub im
   openspec/-Bestand, sonst würde der Gate-Test jetzt eigene Fehler melden).
3. `task test:changed` — kein neuer Rot-Zustand.

### Task 5: Lint + Freshness + Finale

1. `bash scripts/plan-lint.sh openspec/changes/stub-delta-pr-gate/tasks.md`
2. `bash scripts/openspec.sh validate`
3. `task freshness:check`
4. Stage-Commit mit `chore(plans):`-Präfix (T001434).
5. Push `fix/stub-delta-archiv-welle-T004592`.

## Verify

1. `task test:changed` — Smart-Selektion grün.
2. `task freshness:regenerate` — generierte Artefakte neu erzeugen.
3. `task freshness:check` — keine uncommitteten generierten Artefakte.
4. `bash scripts/plan-lint.sh openspec/changes/stub-delta-pr-gate/tasks.md` — FAIL = 0.
5. `npm run test:openspec` — grün inkl. Stub-Error-Test.
6. `stage-plan --hold` erfolgreich (Fix-Pfad).
7. Kein PR aus dem Plan-Stand (T002816).
