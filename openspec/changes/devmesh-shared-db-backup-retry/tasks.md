---
title: "devmesh-shared-db-backup-retry — Implementation Plan"
ticket_id: T900240
domains: [ops, devmesh]
status: active
file_locks: ["scripts/devmesh/db-backup.sh", "tests/spec/local-dev-mesh/db-backup-retention.bats"]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# devmesh-shared-db-backup-retry — Implementation Plan

_Ticket: T900240_

## File Structure

```
scripts/devmesh/db-backup.sh                              # MODIFIED — pg_isready-Retry vor pg_dumpall
tests/spec/local-dev-mesh/db-backup-retention.bats         # MODIFIED — 2 neue @test-Faelle (bereits RED, dieser Branch)
openspec/changes/devmesh-shared-db-backup-retry/proposal.md
openspec/changes/devmesh-shared-db-backup-retry/specs/local-dev-mesh.md
```

## Kontext

Root Cause (gemessen, T900240): `shared-db-backup` scheitert auf JEDEM Lauf — Schedule
UND manueller Trigger, jederzeit — mit `Connection refused`, obwohl Service/Endpoints/DB
gesund sind. Der Backup-Pod verbindet sich 0-1s nach `Running`, bevor kube-proxy/CNI die
Service-DNAT-Regeln fuer die neue Pod-Netns synchronisiert haben (Container-Start-Race).
`scripts/devmesh/db-backup.sh` ruft `pg_dumpall` aktuell sofort auf, ohne Wartezeit.

```bash
kubectl --context devmesh create job --from=cronjob/shared-db-backup manual-test2-t900240 -n workspace
kubectl --context devmesh logs -n workspace manual-test2-t900240-8l8zc
# pg_dumpall: error: connection to server at "shared-db" (10.53.198.67), port 5432 failed: Connection refused
# (Pod war < 1s zuvor Running geworden)
```

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Zwei neue `@test`-Faelle in
      `tests/spec/local-dev-mesh/db-backup-retention.bats` (bereits committed auf diesem
      Branch): (1) `pg_isready` schlaegt zweimal fehl, dann Erfolg — Script muss warten und
      am Ende trotzdem dumpen; (2) `pg_isready` schlaegt dauerhaft fehl — Script muss sauber
      mit Fehler abbrechen, ohne Teil-Dump. Beide schlagen auf dem aktuellen Skript-Stand fehl,
      weil `db-backup.sh` `pg_isready` gar nicht aufruft.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/db-backup-retention.bats
# expected: FAIL (2 von 5 Tests rot: "wartet auf pg_isready..." und "gibt sauber auf...")
```

- [ ] **Fix-Step (GREEN).** In `scripts/devmesh/db-backup.sh`, vor dem `pg_dumpall`-Aufruf
      (Zeile 19 im aktuellen Stand, innerhalb des `if [[ "${1:-}" != "--prune-only" ]]`-Blocks),
      eine Retry-Schleife einfuegen, die auf `pg_isready -h "$PGHOST" -U "$PGUSER"` wartet:

      - Neue Env-Variablen mit Defaults: `DB_WAIT_ATTEMPTS` (Default `10`), `DB_WAIT_SLEEP`
        (Default `2`).
      - Schleife: bis zu `DB_WAIT_ATTEMPTS`-mal `pg_isready -h "$PGHOST" -U "$PGUSER"`
        aufrufen; bei Erfolg (`rc=0`) die Schleife verlassen und mit dem Dump fortfahren;
        bei Fehlschlag `sleep "$DB_WAIT_SLEEP"` und erneut versuchen.
      - Sind alle Versuche ausgeschoepft, mit einer Fehlermeldung (`echo ... >&2`) und
        `exit 1` abbrechen — VOR dem `pg_dumpall`-Aufruf, damit kein Teil-Dump entsteht und
        (wegen `set -e`) auch kein Pruning laeuft.
      - `PGHOST`/`PGUSER` sind bereits als Env-Variablen im CronJob gesetzt (CronJob-Spec
        `dev-local/core/shared-db-backup.yaml`: `PGHOST=shared-db`, `PGUSER=postgres`); im
        Script mit denselben Defaults lesen wie
        `pg_dumpall` sie implizit von der Umgebung erwartet (`PGHOST="${PGHOST:-shared-db}"`,
        `PGUSER="${PGUSER:-postgres}"`), damit die BATS-Tests (die diese Variablen NICHT
        setzen) weiterhin lokal per `PATH`-Stub laufen.

      Nach dieser Aenderung muessen beide neuen Tests sowie die drei bestehenden Tests in
      derselben Datei gruen sein.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/db-backup-retention.bats
# expected: alle 5 Tests PASS
```

- [ ] **Cluster-Verifikation (devmesh, optional aber empfohlen).** Nach dem GREEN-Merge der
      ConfigMap-Aenderung (via `task devmesh:...` oder `kubectl --context devmesh apply -k
      dev-local/core/` — je nachdem, wie der devmesh-Stack synchronisiert wird) einen
      manuellen Job-Trigger ausserhalb des Schedule-Fensters ausfuehren, um zu bestaetigen,
      dass der reale Cronjob jetzt durchlaeuft:

```bash
kubectl --context devmesh create job --from=cronjob/shared-db-backup verify-t900240 -n workspace
kubectl --context devmesh wait --for=condition=complete job/verify-t900240 -n workspace --timeout=60s
kubectl --context devmesh delete job verify-t900240 -n workspace
```

      Nur gegen Context `devmesh` — niemals `fleet` (out of scope fuer dieses Ticket).

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
