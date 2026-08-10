# p6 — Cluster-bats: CI führt cluster-abhängige Tests nie aus (T002922)

## Ziel

Cluster-abhängige `tests/spec/*.bats` werden von CI nie tatsächlich ausgeführt —
sie skippen (kein Cluster) oder laufen nie, weil kein Job sie aufruft.

## Steps

1. **RED.** Test in `tests/spec/batch-ci-check-eval-fixes.bats`: cluster-abhängige
   Bats-Datei wird von CI aufgerufen (oder der Skip ist explizit und begründet).
   `expected: FAIL` (nie ausgeführt).

2. **GREEN.** In `scripts/ci-cluster-bats.mjs` (neu, oder im CI-Pfad): Cluster-bats
   gegen das fleet-Cluster ausführen (kubectl-Kontext) ODER den Skip explizit
   begründen und im CI-Log sichtbar machen. Bestandsaufnahme: welche
   tests/spec/*.bats sind cluster-abhängig, welche laufen aktuell nie?

3. **Verifikation.** Fall aus T002922: cluster-bats werden ausgeführt oder ihr Skip
   ist explizit dokumentiert.

## Acceptance

- Cluster-abhängige Bats laufen in CI (fleet-Kontext) oder skippen explizit begründet.
- Kein stilles "nie ausgeführt" mehr.
