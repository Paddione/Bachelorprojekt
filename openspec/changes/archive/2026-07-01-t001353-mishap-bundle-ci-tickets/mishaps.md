# Mishap-Bundle T001353 — Dokumentation & RCA

Bereiche: `tests/ci-pipeline`, `tickets`. Drei Mishap-Einträge, gesammelt via
Software-Factory-Autopilot. Für jeden Mishap: Titel, Bereich, Beschreibung,
Root-Cause, erwartetes Verhalten, Fix-Bedarf.

## Mishap 1 — `plan-lint.bats` B1-math-Test hardcodet stale Baseline-Wert

- **Bereich:** `tests/ci-pipeline`
- **Typ:** broken
- **Beschreibung:** Der Ticket-Text nannte ungenaue Details (Verweis auf ein
  "effective budget=5"-Szenario). Die tatsächliche Root Cause wurde während
  der Triage verifiziert und weicht davon ab (siehe unten).
- **Reproduktion:** `task test:unit` → `test:unit:plan-lint` schlägt fehl:
  `not ok 8 B1 math: baselined file uses max(limit, baseline.metric)` mit
  `` `[ "$output" = "1018" ]' failed ``.
- **Root-Cause (verifiziert):** `tests/unit/plan-lint.bats`, Test
  `"B1 math: baselined file uses max(limit, baseline.metric)"` (Zeile ~54-60)
  hardcoded den erwarteten Rückgabewert von
  `effective_threshold "website/src/components/inbox/InboxApp.svelte"` als
  `"1018"`. `docs/code-quality/baseline.json` führt den Eintrag
  `"S1:website/src/components/inbox/InboxApp.svelte"` inzwischen mit
  `metric: 1013` (die Datei ist durch einen späteren Cleanup-PR von 1018 auf
  1013 Zeilen geschrumpft), ohne dass der Test nachgezogen wurde. Der
  Linter selbst (`scripts/plan-lint.sh`) verhält sich korrekt — er liest den
  aktuellen Baseline-Wert dynamisch aus; nur die Testerwartung war stale.
- **Erwartetes Verhalten:** `effective_threshold` liefert
  `max(500, baseline.metric)` = `max(500, 1013)` = `1013` für die aktuelle
  Baseline. Der Test muss diesen aktuellen Wert (oder eine dynamisch aus
  `baseline.json` gelesene Erwartung) prüfen, statt einen historischen
  Snapshot hart zu kodieren.
- **Fix nötig:** Ja — Code-Fix in `tests/unit/plan-lint.bats` (Testerwartung
  von `1018` auf den dynamisch aus `baseline.json` gelesenen Ist-Wert
  `1013` korrigiert; Kommentar mit der neuen History ergänzt, analog zum
  bereits bestehenden Kommentar-Stil in der Datei).

## Mishap 2 — T001341 hing in `awaiting_deploy` fest

- **Bereich:** `tickets`
- **Typ:** drift
- **Beschreibung:** Ticket T001341 verblieb im Status `awaiting_deploy`,
  obwohl laut Merge=Abschluss-Konvention (T001092) ein grüner Auto-Merge
  nach `main` das Ticket direkt auf `done · resolution=shipped` überführen
  sollte. `awaiting_deploy` ist seit T001092 aus dem Happy-Path entfernt
  (bleibt nur als Enum-Wert für historische Zeilen / manuelle Sonderfälle /
  Watchdog `awaiting_deploy > 24h` gültig).
- **Root-Cause:** Ticket-Status-Übergang wurde zum Zeitpunkt des Merges
  nicht (oder fehlerhaft) auf `done`/`shipped` gesetzt — vermutlich ein
  Nachzügler aus der Übergangsphase, bevor die Merge=Abschluss-Konvention
  konsequent in allen Pfaden (Factory `pipeline.js` und dev-flow-execute)
  griff.
- **Erwartetes Verhalten:** Grüner Merge nach `main` → Ticket sofort
  `done · resolution=shipped`, kein separates "gemergt aber noch nicht
  live"-Zwischenstadium.
- **Fix nötig:** Nein — bereits während der Triage (2026-07-01) manuell auf
  `done/fixed` korrigiert. Diese Dokumentation hält die RCA für die
  Nachvollziehbarkeit fest; kein weiterer Code-Fix in diesem PR.

## Mishap 3 — T001350 `done` ohne Merge-Evidenz

- **Bereich:** `tickets`
- **Typ:** drift
- **Beschreibung:** Ticket T001350 trägt den Status `done`, ohne dass ein
  zugehöriger gemergter PR als Evidenz verlinkt ist. Die zugehörige Arbeit
  liegt (mutmaßlich unvollständig) im Worktree
  `/tmp/wt-vitest-coverage-strict-ts`.
  Verdacht: Ticket wurde manuell/fälschlich auf `done` gesetzt oder ein
  Merge fand statt, ohne dass PR-Link/Ticket korrekt nachgezogen wurden.
- **Root-Cause:** Nicht abschließend geklärt — erfordert manuelles Review,
  ob die Arbeit im genannten Worktree fortgeführt oder verworfen wird,
  bevor der Ticket-Status korrigiert werden kann.
- **Erwartetes Verhalten:** `done`-Tickets sollten laut Merge=Abschluss-
  Konvention (T001092) über einen PR-Link auf einen tatsächlich gemergten
  PR nachweisbar sein.
- **Fix nötig:** Nein — **explizit unangetastet gelassen per
  User-Entscheidung (2026-07-01)**, pending manuelles Review, ob die Arbeit
  im Worktree `/tmp/wt-vitest-coverage-strict-ts` fortgesetzt oder verworfen
  wird. Keine Statusänderung an T001350 in diesem PR. Diese Dokumentation
  hält die Beobachtung für ein späteres, gezieltes Follow-up fest.
