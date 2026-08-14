# Proposal: schedule-blocker-gate

## Purpose (deutsch)

Der Dependency-Blocker-Gate in `scripts/factory/schedule.sh` (Z. 48-67) fällt **fail-open**:
Das Subquery-Alias `d` liefert nur `dep_id` (`SELECT unnest(depends_on) AS dep_id`), aber der
Aggregator referenziert `json_agg(d.external_id)` — ein Spaltenname, den es dort nicht gibt.
Die SQL-Query scheitert still (stderr via `2>/dev/null` verworfen, `set +e`), `blocker_json`
bleibt leer, und die `[[ -n "$blocker_json" ]]`-Bedingung überspringt den Gate komplett.
Folge: Tickets werden geplant, obwohl ihre `depends_on`-Vorgänger offen sind — die
Reihenfolge-Zusicherung des Schedulers ist wirkungslos (gefunden bei der Implementierung von
T005029, PR #4438; als Bug-Ticket T005306 erfasst).

Dieser Change korrigiert die Query (Blocker-IDs korrekt auflösen), härtet die
Fehlerbehandlung (Query-Fehler ≠ „keine Blocker") und sichert das Verhalten mit einem
Verhaltens-Test gegen die Dev-DB ab: offener Blocker hält zurück, erfüllte Blocker lassen
durch.

## Goals

- `schedule.sh`-Blocker-Gate hält Tickets mit offenen `depends_on`-Vorgängern tatsächlich
  zurück (Verhaltens-Test, nicht nur Source-Präsenz).
- Query-Fehler werden sichtbar (stderr) statt als „keine Blocker" interpretiert.
- Positiv-Anker im selben Test: Ticket mit erfüllten Blockern läuft durch.

## Non-Goals

- Keine Änderung der Conflict-/Cap-/Slots-Gates.
- Keine UI-/Dashboard-Änderung (Sichtbarkeit blockierter Tickets ist separates Thema).
- Keine Retro-Analyse vergangener Fehl-Dispatches.

## Symptom vs. Ursache (T002448-M5)

- **Symptom (belegt, T005306-Beschreibung):** Der Blocker-Gate hat keine Wirkung —
  `blocker_json` ist bei offenen Blockern leer, der Gate wird übersprungen.
- **Ursache (am Code verifiziert):** `json_agg(d.external_id)` referenziert eine im
  Subquery nicht existierende Spalte (`d` hat nur `dep_id`). Die Query schlägt fehl,
  der Fehler wird verworfen, `set +e` maskiert den Exit-Code. Der Gate-Code
  (schedule.sh:50-67) ist vollständig oben zitiert — kein Reproducer über die Dev-DB
  nötig, der Codebeleg ist eindeutig; der neue Verhaltens-Test ist zugleich der
  Regression-Reproducer.

## Design-Entscheidungen

1. **Minimaler Query-Fix:** `json_agg(d.dep_id)` statt `d.external_id` — `dep_id` ist die
   unnest-Ausgabe und trägt bereits die externe Blocker-ID.
2. **Fehler-Sichtbarkeit:** stderr des `factory_psql` nicht mehr komplett verwerfen;
   bei leerem Ergebnis trotz Fehler abbrechen statt fail-open weiterzulaufen
   (fail-closed im Fehlerfall, das Gegenteil des heutigen Verhaltens).
3. **Verhaltens-Test** in `tests/spec/software-factory/schedule-blocker-gate.bats` mit dem
   `seed_real_feature`-Muster (Teardown-Cleanup seit T005309): Blocker-Ticket A offen,
   Kandidat B mit `depends_on=[A]`, Kandidat C ohne Deps — `schedule.sh` ausführen und
   Dispatches messen.
