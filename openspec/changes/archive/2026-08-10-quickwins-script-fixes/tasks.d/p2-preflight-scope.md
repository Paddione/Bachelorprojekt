# p2 — preflight-pr-scope.bats Test 1: CI rot, lokal grün (T002726)

## Ziel

`tests/spec/ci-cd/preflight-pr-scope.bats` Test 1 läuft nur bei geänderten
`scripts/` überhaupt — in CI (ohne scripts-Änderung) rot, lokal grün.
Test 1 ist also abhängig von der Diff-Lage, nicht deterministisch.

## Steps

1. **RED.** Test in `tests/spec/quickwins-script-fixes.bats`: preflight-pr-scope-Test
   läuft deterministisch unabhängig von der Diff-Lage (Fixture-Verzeichnis).
   `expected: FAIL` (hängt an realem Diff).

2. **GREEN.** In `tests/spec/ci-cd/preflight-pr-scope.bats`: Test 1 gegen ein
   Fixture-Verzeichnis stabilisieren, sodass er nicht von den im PR geänderten
   Pfaden abhängt (T002448-M4: Output-Verifikation, Semantik statt Darstellung).

3. **GREEN.** `scripts/preflight-pr-scope.sh`: falls der Test eine Skript-Lücke
   aufdeckt (z.B. leeres Signal bei fehlender scripts-Änderung), diese beheben.

4. **Verifikation.** Test grün in CI (kein scripts-Diff) und lokal (mit scripts-Diff).

## Acceptance

- Test 1 deterministisch (Fixture-basiert), grün in CI und lokal.
- Kein "lokal grün, CI rot" mehr durch Diff-Abhängigkeit.
