# p2 — tests: scheduling.bats-Verifikation der umgeschriebenen FA-SF-24/25/26 (T005029)

## Ziel

Tests-Rolle des Plans: Die im Stage-Commit enthaltenen umgeschriebenen Tests
verifizieren — RED-Zustand ist bereits eingefroren (FA-SF-24/25 rot mit status
127, FA-SF-26 gruen), p2 prueft nach p1 den GREEN-Zustand und den Gesamtlauf.

## Steps

1. **RED-Status (im Stage-Commit dieses Plans eingefroren).** Die umgeschriebenen
   FA-SF-24/25-Tests rufen die noch nicht existierenden Helfer auf — der Lauf
   muss fehlschlagen:

```bash
TICKET_TEST_DB_OK=1 tests/unit/lib/bats-core/bin/bats --jobs 2 --no-parallelize-within-files \
  --filter 'FA-SF-2[45]|FA-SF-26' tests/spec/software-factory/scheduling.bats
# expected: FAIL (FA-SF-24 Zeile 138 und FA-SF-25 Zeilen 167/183 brechen mit
# 'seed_real_feature: command not found', status 127; FA-SF-26 x2 ist gruen)
```

2. **GREEN nach p1.** Erneuter Lauf mit demselben Filter — alle fuenf Tests
   gruen. Voraussetzung: k3d-Cluster mit Live-DB und Opt-in
   `TICKET_TEST_DB_OK=1` (die Tests skippen sonst via `_skip_if_no_db`).

3. **Gesamtlauf.** `scheduling.bats` ohne Filter vollstaendig gruen
   (dieselben Opt-in-Voraussetzungen).

## Warum FA-SF-26 kein Produktionscode-Fix ist

Der Watchdog schreibt INFRA-/Counter-Warnungen auf stderr (T002361/T002389) —
korrekt so, sie gehoeren in prod-Logs. Die frueheren Tests nutzten
`run … 2>/dev/null` und jq auf `$output`; BATS 1.x merged stderr in `$output`
(implementiert als `output="$( { "$@"; } 2>&1 )"`), wodurch die Redirection auf
dem run-Aufruf ueberschrieben wird und die Warnungen den jq-Parse brachen.
Neue Erwartung: die letzte Output-Zeile ist deterministisch das escalated-JSON
(`echo "$escalated"`, letzte Zeile von scripts/factory/watchdog.sh) — darauf
richtet sich die jq-Auswertung (`tail -n 1`), nicht auf stderr-Unterdrueckung.
