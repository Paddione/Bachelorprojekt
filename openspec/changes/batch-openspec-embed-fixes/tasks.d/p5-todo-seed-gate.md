# p5 — Platzhalter im Delta fail-closed (T003281)

## Ziel

`openspec.sh propose` seedet Platzhalter-Requirement ins Delta. Kein Gate fängt es —
plan-lint P1 prüft nur tasks.md, openspec:validate stuft das Stub-Delta als warn ein.
Ein vergessenes Delta landet so im SSOT.

## Steps

1. **RED.** Test in `tests/spec/batch-openspec-embed-fixes.bats`: Change mit unverändertem
   Stub-Delta wird vom Gate mit Exit ≠ 0 abgelehnt. Positiv-Anker: ausformuliertes Delta
   läuft durch (sonst vakue Zusicherung). Gegen Fixture-Verzeichnis, nicht echten Bestand.
   `expected: FAIL` (Gate besteht noch still).

2. **GREEN — Gate schärfen.** Eine der beiden Varianten:
   - plan-lint P1 (TBD-Platzhalter-Verbot) auf die Delta-Dateien des Changes ausdehnen
     (`openspec/changes/<slug>/specs/*.md`); oder
   - `openspec:validate` wertet das Stub-Delta als Fehler statt als warn.

3. **GREEN — Vermeidbarkeit (optional).** Prüfen, ob das propose-Skelett den Platzhalter
   braucht — ein Delta ohne Requirement-Block wäre ehrlicher. Zusätzlich: tasks.md-Skelett
   schlägt `tests/spec/<slug>.bats` vor (Sammeldatei-Form, T002416-Widerspruch) — korrigieren.

4. **Verifikation.** Output-Verifikation (T002448-M4): Gate-Exit ≠ 0 für Stub, 0 für
   ausformuliertes Delta.

## Acceptance

- Stub-Delta → Exit ≠ 0 (fail-closed, kein warn).
- Ausformuliertes Delta → Exit 0 (Positiv-Anker).
- Platzhalter erreicht nie den SSOT.
