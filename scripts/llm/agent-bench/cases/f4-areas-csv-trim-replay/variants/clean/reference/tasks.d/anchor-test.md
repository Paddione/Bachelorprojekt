# p2 — Anker-Test

- In `tests/spec/ticket-system/areas-csv-trim.bats` einen `@test` ergaenzen, der:
  1. `local real_ctx="${TICKET_CTX:-fleet}"` setzt,
  2. ueber `scripts/ticket.sh create --is-test-data` eine Testrow anlegt,
  3. `teardown` laufen laesst,
  4. per `psql SELECT count(*)` **im selben Kontext** nachzaehlt und 0 erwartet.
- Ohne Cluster: `kubectl ... get nodes || skip`.
- Abnahme: `checks/run.sh` Exit 0.
