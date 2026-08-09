## ADDED Requirements

### Requirement: backfill-id BATS-Verhaltenstests laufen bei erreichbarem Cluster tatsächlich

`tests/spec/ticket-system/backfill-id-sequence.bats` SHALL bei erreichbarem
`k3d-mentolder-dev`-Cluster den unter Test stehenden Befehl (`scripts/ticket.sh backfill-id`)
tatsächlich gegen die reale Datenbank ausführen, statt sich über den fail-closed
BATS-Guard aus `scripts/vda/ticket/_ticket-core.sh` (T002224, Sentinel-Kontext
`bats-no-cluster-t002224`) selbst zu blockieren.

#### Scenario: Verhaltenstests opten sich explizit in echten Cluster-Zugriff ein

- **GIVEN** ein Checkout mit erreichbarem `k3d-mentolder-dev`-Cluster (`cluster_running()`
  liefert `true`)
- **WHEN** `tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system/backfill-id-sequence.bats`
  läuft
- **THEN** setzt `setup()` `export TICKET_TEST_DB_OK=1`, sodass `scripts/ticket.sh backfill-id`
  mit dem im Test übergebenen `--brand`-Kontext gegen den echten `shared-db`-Pod läuft, statt
  gegen den nicht auflösbaren Sentinel-Kontext `bats-no-cluster-t002224`
- **AND** alle drei Tests (`assigns an external_id`, `reports the number of rows`,
  `an empty backfill-id run says so`) enden mit Exit-Code 0 und den dokumentierten
  Positiv-Ankern (`^T[0-9]{6}$`, `^backfill-id: [0-9]+ Zeile`, `^backfill-id: 0 Zeilen ohne
  external_id`)
