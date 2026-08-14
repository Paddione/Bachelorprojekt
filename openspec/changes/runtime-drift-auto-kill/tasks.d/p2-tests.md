# p2 — Tests: RED laeuft gruen, Regression gruen

Die RED-Testdatei `tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-auto-kill.bats`
liegt bereits im Branch (siehe tasks.md Verify). Aufgabe dieses Partials: die GREEN-Fahrt
belegen und die Regression absichern.

## Task 2.1 — RED-Befund dokumentieren

Auf dem Stand VOR der Implementierung (heutiger Branch) ist der rote Lauf belegt:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-auto-kill.bats
# expected: FAIL — beide Tests rot (Flag wird still ignoriert, kein Kill, Exit 1 bzw. 0)
```

## Task 2.2 — GREEN-Fahrt nach p1

Nach p1 (Implementierung) laufen beide neuen Tests durch:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-auto-kill.bats
# expected: PASS — Auto-Kill beendet registrierte Prozesse, Fremdprozess ueberlebt,
# Exit 0; unbekanntes Argument -> Usage + Exit 2
```

## Task 2.3 — Regression: Bestandstest bleibt gruen

Der Bestandstest garantiert das Default-Verhalten (ohne Flag kein Eingriff):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-check.bats
# expected: PASS — insbesondere "Guard beendet den driftenden Prozess NICHT"
```

Beide Testformen erfassen (T002696) — Sammeldatei und Verzeichnis:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/batch-repo-hygiene-ops-fixes*
```

## Task 2.4 — Testinventar nachziehen

Nach dem Test-Neuzugang das Inventar regenerieren (Pflicht fuer CI, siehe CLAUDE.md):

```bash
task freshness:regenerate
```

## Task 2.5 — Volle Regression

```bash
task test:changed
# expected: PASS
```
