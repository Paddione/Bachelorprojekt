---
title: "areas-csv-trim-testdata-leak — Implementation Plan"
ticket_id: T900250
domains: [tests]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# areas-csv-trim-testdata-leak — Implementation Plan

_Ticket: T900250_

## File Structure

```
tests/spec/ticket-system/areas-csv-trim.bats        (modified — 128 Zeilen, kein S1-Limit fuer .bats)
tests/spec/ticket-system/backfill-id-sequence.bats   (modified — 169 Zeilen, kein S1-Limit fuer .bats)
```

Beide Dateien haben keinen Eintrag unter `.s1.limits` in `docs/code-quality/gates.yaml`
(`.bats` ist keine gelistete Extension) — kein Budget-Check noetig.

## Ursache (verifiziert, nicht vermutet)

`tests/spec/ticket-system/areas-csv-trim.bats` setzt in `setup()`
`CTX="${FACTORY_CTX:-devmesh}"` und loescht in `teardown()` per `kubectl exec ... --context
"$CTX"`. `scripts/ticket.sh create` (aufgerufen ohne `TICKET_CTX`-Override) loest seinen
Schreibkontext dagegen ueber `scripts/vda/ticket/_ticket-core.sh:11` auf:
`CTX="${TICKET_CTX:-fleet}"` — eine andere Variable, ein anderer Default. Der Test schreibt
also nach `fleet`, der Teardown loescht gegen `devmesh`: der Teardown meldet Erfolg (Exit 0,
`|| true`) und trifft nichts. `tests/spec/ticket-system/backfill-id-sequence.bats` hat exakt
denselben Einzeiler in `setup()` und denselben Aufrufpfad (`ticket.sh backfill-id` ohne
`TICKET_CTX`).

Empirischer Beleg (2026-09-20, vor dem Fix):
```bash
pod=$(kubectl get pod -n workspace --context fleet -l 'app in (shared-db, shared-db-dev)' --field-selector status.phase=Running -o name | head -1)
kubectl exec -i "$pod" -n workspace --context fleet -c postgres -- psql -U website -d website -qtA \
  -c "SELECT external_id, title FROM tickets.tickets WHERE title = 'T004894 areas-csv-trim testrow';"
# -> 5 Zeilen (T900241, T900242, T900244, T900245 bereits als obsolete geschlossen, T900251 neu)
```

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Neuer Test `T900250: teardown actually
      deletes the testrow from the DB ticket.sh wrote to` in
      `areas-csv-trim.bats` — er loest den Schreibkontext unabhaengig vom
      (moeglicherweise falschen) `$CTX` ueber `${TICKET_CTX:-fleet}` auf,
      legt eine Testzeile an, ruft `teardown` vor, und fragt danach GENAU
      diesen Kontext auf verbleibende Zeilen mit `TESTROW_TITLE` ab
      (`SELECT count(*) ... = 0`). Das ist der Positiv-Anker aus dem
      Ticket — nicht "Teardown lief ohne Fehler", sondern die tatsaechliche
      Abwesenheit der Zeile in der Ziel-DB.

```bash
tests/unit/lib/bats-core/bin/bats --filter "T900250" tests/spec/ticket-system/areas-csv-trim.bats
# expected: FAIL (red — CTX zeigt noch auf devmesh, ticket.sh schrieb aber nach fleet)
```

- [x] **Fix-Step (GREEN).** In beiden Dateien `CTX="${FACTORY_CTX:-devmesh}"`
      durch `CTX="${TICKET_CTX:-fleet}"` ersetzen (identische Aufloesung wie
      `scripts/vda/ticket/_ticket-core.sh:11`), damit Teardown/`psql_q`
      denselben Kontext treffen, in den `ticket.sh` tatsaechlich schreibt.
      `scripts/ticket.sh` selbst bleibt unangetastet (T900246 arbeitet
      parallel an `cmd_get_timeline` in derselben Datei).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system/areas-csv-trim.bats tests/spec/ticket-system/backfill-id-sequence.bats
# expected: alle 7 Tests ok
```

- [x] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
