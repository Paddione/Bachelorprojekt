# Proposal: sf-fixture-hardening

## Why

Review PR #4447: exec-Fehler in den SF-Test-Fixtures werden still zu „row missing" konflationiert (Ghost-Seeds ohne Spur — exakt der Defekt, den T005309 beseitigen sollte); Skip maskiert create-Fehler; Kontrakt-Assertions sind unpräzise.

## What

Exec-Observability (rc + stderr), Skip→Fail bei erreichbarer DB, Kontrakt-Präzisierung (Exit 4, echte Löschung), `< /dev/null`-Konsistenz, Doku-Kommentare. SQL-Interpolation bleibt (kein realistischer Vektor).

## Impact

`tests/lib/factory-test-fixtures.sh`, `tests/spec/software-factory/_sf_common.bash`, `tests/spec/software-factory/scheduling-cleanup-guard.bats`, neuer BATS-Test, SSOT-Delta.
