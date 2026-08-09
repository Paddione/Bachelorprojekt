---
title: "backfill-id-bats-local-red — Implementation Plan"
ticket_id: T002871
domains: [tests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# backfill-id-bats-local-red — Implementation Plan

_Ticket: T002871_

## File Structure

```
tests/spec/ticket-system/backfill-id-sequence.bats   [MODIFIED]  158 Zeilen · kein S1-Limit
                                                                   für .bats definiert
                                                                   (docs/code-quality/gates.yaml
                                                                   s1.limits enthält keinen
                                                                   .bats-Eintrag) — kein Budget
                                                                   zu prüfen.
```

## Task 1 — RED: Rot-Stand belegen (bereits reproduziert, kein neuer Test)

Der Bug ist bereits durch die bestehenden drei Verhaltenstests in
`tests/spec/ticket-system/backfill-id-sequence.bats` reproduziert (T002732) — es wird
**kein neuer Testfall** angelegt, sondern der bestehende Rot-Stand dokumentiert und
anschließend gefixt.

```bash
tests/unit/lib/bats-core/bin/bats --verbose-run tests/spec/ticket-system/backfill-id-sequence.bats
# expected: FAIL — die drei Tests "assigns an external_id", "reports the number of rows"
# und "an empty backfill-id run says so" enden mit `not ok` und der Meldung
# "ERROR: no shared-db pod found in namespace workspace (context bats-no-cluster-t002224)".
# Ursache: scripts/vda/ticket/_ticket-core.sh:30 biegt CTX unter BATS auf den nicht
# auflösbaren Sentinel um, solange TICKET_TEST_DB_OK != 1 — die Testdatei setzt dieses
# Flag bisher nicht (im Gegensatz zur Schwesterdatei list-test-data-filter.bats, die es
# in ihrem setup() korrekt exportiert).
```

## Task 2 — GREEN: `TICKET_TEST_DB_OK=1` im setup() ergänzen

**Datei:** `tests/spec/ticket-system/backfill-id-sequence.bats`

In der `setup()`-Funktion (aktuell Zeilen 14–21) nach der Variablenzuweisung
`TESTROW_TITLE="T002732 backfill-id testrow"` eine Zeile ergänzen:

```bash
export TICKET_TEST_DB_OK=1
```

Damit lässt der T002224-Guard aus `scripts/vda/ticket/_ticket-core.sh:30` den echten
`CTX="k3d-mentolder-dev"`-Wert unangetastet, wenn der Test `scripts/ticket.sh backfill-id`
aufruft (Zeilen 110, 136, 155 der Testdatei). Keine Änderung an `scripts/ticket.sh` oder
`scripts/vda/ticket/_ticket-core.sh` — der Guard selbst bleibt unverändert und schützt
weiterhin jeden Test, der `TICKET_TEST_DB_OK` NICHT setzt (Fail-closed-Prinzip bleibt
intakt, siehe T002224-Kommentar in der Kernbibliothek).

Kommentar direkt über der neuen Zeile ergänzen, der auf den ausgegliederten Folgebefund
verweist (kein Verhaltenscode, reine Dokumentation):

```bash
# [T002871] Ohne dieses Opt-in biegt scripts/vda/ticket/_ticket-core.sh:30 (T002224-Guard)
# CTX unter BATS auf einen nicht aufloesbaren Sentinel um -> jeder Aufruf von
# scripts/ticket.sh backfill-id in diesem File schlaegt lokal fehl, obwohl CI die
# Tests wegen fehlenden Clusters ohnehin nur skippt oder (diff-scoped) gar nicht
# selektiert -- Befund zur CI-Bindungsluecke in T002922.
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Rot-Stand nachweisen — der Fix ist noch nicht
      angewendet.

```bash
tests/unit/lib/bats-core/bin/bats --verbose-run tests/spec/ticket-system/backfill-id-sequence.bats
# expected: FAIL (3 von 4 Tests `not ok`, siehe Task 1)
```

- [ ] **Fix-Step (GREEN).** `TICKET_TEST_DB_OK=1`-Export aus Task 2 anwenden.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/ticket-system.bats tests/spec/ticket-system/
# alle Tests in beiden BATS-Konventionsformen (Sammeldatei + Verzeichnis, T002696) müssen
# `ok` sein — insbesondere die vier T002732-Tests in backfill-id-sequence.bats
```

- [ ] **Final Verification.** Die drei mandatory CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
