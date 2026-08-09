# Proposal: purge-test-data-schema-drift-T002894

## Why

`tickets.fn_purge_test_data()` — der Teardown-Pfad von `tests/lib/factory-test-fixtures.sh` —
scheitert gegen die lokale k3d-`shared-db` mit `relation "questionnaire_test_status" does not
exist`, weil die allererste Anweisung der Funktion diese Tabelle ungeprüft anspricht. Verifiziert:
die Tabelle existiert auf Fleet mentolder (Pod `shared-db-86d7d79f7b-52j2t`), fehlt aber lokal auf
k3d-Dev (Pod `shared-db-97c8495b5-w4f6t`) — Schema-Drift aus einem One-Shot-Skript
(`scripts/datamodel/2026-05-23-questionnaire-test-tables-korczewski.sql`), das nie in
`migrations/` erfasst wurde. Weil PL/pgSQL beim ersten Fehler abbricht, laufen alle 12
nachfolgenden Sweep-Schritte nicht — jede `is_test_data=true`-Zeile bleibt liegen. Jeder Testlauf
mit `seed_test_feature` hinterlässt garantiert Müll (bestätigt in T002830, dort mit einem
gezielten `DELETE ... WHERE external_id = ...` umgangen statt behoben). Severity: major.

## What

Ergänze in `tickets.fn_purge_test_data()` eine `has_qts`-Existenzprobe für
`questionnaire_test_status` (identisches Muster zu den bereits vorhandenen `has_*`-Proben der
Funktion) und bette den `UPDATE questionnaire_test_status`-Schritt in
`IF has_qts THEN ... END IF;` ein. Damit läuft die Funktion auf jeder DB durch, der die Tabelle
fehlt — inklusive lokalem k3d-Dev — statt beim ersten Schritt abzubrechen. Der eigentliche
Schema-Drift (Tabelle fehlt lokal) wird bewusst NICHT in diesem Ticket geschlossen — siehe
`design.md` für die Abwägung gegen den in T002647 laufenden Migrations-Runner; das bleibt ein
Folge-Ticket.

_Ticket: T002894_
