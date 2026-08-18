# p2 — stage-plan: fehlende Hold-Entscheidung in Test-Aufrufen (T011900)

## Ziel

`scripts/vda/ticket/stage-plan.sh` verlangt seit T003267 (Commit a28e9f958,
PR #4129) zwingend `--hold` oder `--no-hold`. Ohne Flag bricht das Skript sofort
mit der Hold-Meldung ab (Exit 1, Zeilen 67-71), BEVOR die Pfadprüfung erreicht
wird. Zwei Tests rufen das Skript ohne Flag auf und prüfen auf die nie erreichte
"does not exist"-Meldung — beide schlagen in der vollen Testmenge fehl.

Der Hold-Pflicht-Guard existiert bereits:
`tests/spec/dev-flow-plan/stage-plan-contract.bats:31` ("ohne --hold/--no-hold →
rc=1, Meldung nennt beide Flags"). Kein neuer Guard nötig — der Nachweis seiner
Existenz gehört in die Verifikation dieses Partials.

## Steps

1. **RED.** Testlauf auf dem aktuellen Stand:

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/scripts/stage-plan.bats
# expected: FAIL (Hold-Exit 1 statt der "does not exist"-Meldung in beiden Tests)
```

2. **GREEN.** In `tests/unit/scripts/stage-plan.bats` beide Aufrufe um
   `--no-hold` ergänzen (Testabsicht ist die Pfadprüfung, keine
   Factory-Freigabe — `--no-hold` ist der passende Wert):
   - Zeile 12: `--plan "openspec/changes/nonexistent/tasks.md"` →
     `--plan "openspec/changes/nonexistent/tasks.md" --no-hold`
   - Zeile 88: `--plan "openspec/changes/ghost/tasks.md"` →
     `--plan "openspec/changes/ghost/tasks.md" --no-hold`

3. **Verifikation.** Beide Läufe grün, plus Guard-Nachweis:

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/scripts/stage-plan.bats
grep -qF 'ohne --hold/--no-hold' tests/spec/dev-flow-plan/stage-plan-contract.bats \
  && echo "Hold-Pflicht-Guard vorhanden (kein neuer nötig)"
```

## Acceptance

- Beide Tests erreichen die Pfadprüfung und prüfen die "does not exist"-Meldung.
- Die Hold-Pflicht (Exit 1 ohne Flag) bleibt durch den bestehenden
  contract-Guard abgesichert — nachgewiesen, nicht dupliziert.
- Kein Produktcode geändert (`stage-plan.sh` unangetastet).
