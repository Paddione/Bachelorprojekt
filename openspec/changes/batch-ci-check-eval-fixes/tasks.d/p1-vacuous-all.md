# p1 — gh pr checks: vakuoses all() auf leerer Checkliste (T003109)

## Ziel

`gh pr checks <n> --json bucket --jq 'all(.bucket != "pending")'` liefert auf der
LEEREN Checkliste (PR DIRTY, CI nie gestartet) `true` — die Warteschleife bricht
sofort ab und liest "CI grün", obwohl nie geprüft wurde.

## Steps

1. **RED.** Test in `tests/spec/batch-ci-check-eval-fixes.bats`: leere Checkliste
   wird nicht als Erfolg gewertet. `expected: FAIL` (vakuos true).

2. **GREEN.** In `scripts/devflow-ci-watch.sh`: Nichtleere-Prüfung VOR das all()-
   Prädikat — belastbar ist erst `mergeStateStatus != DIRTY` UND eine NICHTLEERE
   Checkliste. Leere Liste → warten/abbrechen mit klarer Meldung, nie "CI ok".

3. **Verifikation.** Fall aus T003109: leere Checkliste bricht nicht mehr als Erfolg ab.

## Acceptance

- Leere Checkliste ≠ "CI ok" (kein vakuoses true).
- mergeStateStatus-Pflicht vor der Checklisten-Auswertung.
