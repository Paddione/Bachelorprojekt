# p1 — factory-test-fixtures: seed_real_feature/purge_real_feature fuer echte Queue-Kandidaten (T005029)

## Ziel

FA-SF-24/25 seeden mit `seed_test_feature`, das hart `--is-test-data` setzt
(`tests/lib/factory-test-fixtures.sh:33`). queue.sh filtert seit T002830
`AND is_test_data = false` (scripts/factory/queue.sh:56) — die SF-TEST-Fixtures
sind damit strukturell unsichtbar fuer die Queue, und die Tests erwarteten einen
Zustand, den der Produktionscode nicht mehr herstellt. Der Filter ist die gewollte
Entscheidung (Fixtures duerfen nie im Dispatch-Pfad landen); driftend sind die
Test-Erwartungen. Fix ausschliesslich in den Test-Fixtures: echte Features seeden
(is_test_data=false), die in der Queue erscheinen, mit hartem DELETE-Cleanup.

## Steps

1. **RED (bereits im Stage-Commit dieses Plans).** scheduling.bats FA-SF-24/25/26
   wurden umgeschrieben. FA-SF-24 (Zeile 138) und FA-SF-25 (Zeilen 167/183) rufen
   `seed_real_feature` auf — die Helfer existieren nicht, die Tests brechen mit
   status 127. FA-SF-26 ist gruen (Test-Erwartungen an den Output-Vertrag
   angepasst, siehe p2). `expected: FAIL`.

2. **GREEN.** In `tests/lib/factory-test-fixtures.sh` zwei Helfer ergaenzen:
   - `seed_real_feature <brand> [touched_file ...]` → external_id auf stdout.
     Aufbau identisch zu `seed_test_feature` (Zeilen 20-39), aber OHNE das
     `--is-test-data`-Flag beim `ticket.sh create` — so entsteht ein Feature
     mit `is_test_data=false` in der Queue-Lane (type=feature, status=backlog,
     priority=mittel). Prod-Guard (FACTORY_ALLOW_PROD_SEED, Zeilen 24-27) und
     touched_files-Uebergabe (Zeilen 35-37) unveraendert uebernehmen. Title-Prefix
     `SF-REAL-` statt `SF-TEST-`, damit unaufgeraeumte Reste erkennbar sind.
   - `purge_real_feature <brand> <ext_id>` → hartes `DELETE FROM tickets.tickets
     WHERE external_id=...` auf dem shared-db-Pod. Pod-/Namespace-Aufloesung und
     Prod-Guard wie `purge_factory_test_data` (Zeilen 70-100) uebernehmen;
     `fn_purge_test_data()` hilft NICHT — die raeumt nur is_test_data=true-Zeilen.
     Aufruf im teardown der Tests statt des globalen Purges (der globale Purge
     laesst echte Features stehen).

3. **Verifikation.** `scheduling.bats --filter 'FA-SF-2[45]|FA-SF-26'` vollstaendig
   gruen; nach dem Lauf keine `sf-real-*`-Geisterzeilen in `tickets.tickets`
   (Stichprobe per psql auf dem k3d-Pod).
