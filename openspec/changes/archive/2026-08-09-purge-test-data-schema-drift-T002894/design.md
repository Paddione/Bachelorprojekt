---
ticket_id: T002894
plan_ref: openspec/changes/purge-test-data-schema-drift-T002894/tasks.md
---

# Design: `tickets.fn_purge_test_data()` fails on hosts missing `questionnaire_test_status`

## Symptom (beobachtet, reproduzierbar)

`tickets.fn_purge_test_data()` — der Teardown-Pfad, den `tests/lib/factory-test-fixtures.sh`
aufruft — schlägt gegen die lokale k3d-`shared-db` fehl:

```
relation "questionnaire_test_status" does not exist
```

Der Fehler tritt in der allerersten Anweisung des Funktionskörpers auf:

```sql
UPDATE questionnaire_test_status
   SET last_failure_ticket_id = NULL
 WHERE last_failure_ticket_id IN (
         SELECT id FROM tickets.tickets WHERE is_test_data = true
       );
```

Weil PL/pgSQL beim ersten Fehler abbricht, läuft **keiner** der nachfolgenden 12 Sweep-Schritte
(DELETE auf `questionnaire_assignments`, `tickets.tickets`, `inbox_items`, `customers`, …). Jede
`is_test_data=true`-Zeile bleibt liegen. Ein Testlauf mit `seed_test_feature` hinterlässt also
garantiert Müll — bestätigt während T002830, dort mit einem gezielten `DELETE ... WHERE
external_id = ...` umgangen statt behoben.

## Ursache — verifiziert, nicht nur vermutet

Das Ticket formulierte die Ursache als offene Hypothese ("vermutlich: die Funktion kennt eine
Tabelle, die es in der lokalen shared-db nicht gibt — nur in fleet?"). Beide Seiten wurden vor
diesem Plan direkt geprüft, um Symptom von Annahme zu trennen (T002448-M5):

1. **Fleet-mentolder-DB** (Context `fleet`, Namespace `workspace`, Pod
   `shared-db-86d7d79f7b-52j2t`): `to_regclass('questionnaire_test_status')` liefert einen
   Treffer; die Tabelle existiert in `public`.
2. **Lokale k3d-Dev-DB** (Context `k3d-mentolder-dev`, Namespace `workspace`, Pod
   `shared-db-97c8495b5-w4f6t`): dieselbe Abfrage liefert `NULL` — geprüft über **alle** dort
   vorhandenen Datenbanken (`pocket_id`, `nextcloud`, `vaultwarden`, `website`); `docuseal`
   existiert lokal nicht einmal als Datenbank.
3. Beide Cluster wurden **unabhängig** und direkt per `kubectl exec ... psql` gegen den jeweils
   eigenen `shared-db`-Pod geprüft — nicht über eine einzige mehrdeutige Verbindung (Erinnerung:
   "Zwei lebende Ticket-DBs", ein Befund in einer DB beweist nichts über die andere).
4. `pg_get_functiondef('tickets.fn_purge_test_data'::regproc)` zeigt: **jede andere** optionale
   Tabelle im Funktionskörper (`questionnaire_assignment_scores`, `questionnaire_answers`,
   `test_results`, `test_runs`, `playwright_reports`, `meetings`, `inbox_items` /
   `message_threads` / `messages`-Flags, `coaching.sessions`) wird zuerst per
   `information_schema`-EXISTS-Probe in eine `has_*`-Variable geprüft und dann mit
   `IF has_* THEN ... END IF;` abgesichert. Der `UPDATE questionnaire_test_status`-Schritt ganz am
   Anfang ist die **einzige** Tabellenzugriffs-Stelle in der gesamten Funktion ohne diese Absicherung
   — eine Inkonsistenz mit dem eigenen etablierten Muster der Funktion, kein Einzelfall.
5. Ursprung des Drifts: `scripts/datamodel/2026-05-23-questionnaire-test-tables-korczewski.sql`
   ist ein One-Shot-Skript (Kopfkommentar: "All 4 tables exist on mentolder but were never
   created on korczewski... the Playwright/systemtest feature only landed in DB migrations on
   mentolder"), das `questionnaire_test_evidence` / `_test_fixtures` / `_test_seed_registry` /
   `_test_status` per `CREATE TABLE IF NOT EXISTS` direkt gegen Fleet-Cluster angewendet hat
   (`kubectl exec ... psql < file`). `grep` über `migrations/` (das versionierte
   Migrations-Verzeichnis) findet **keine** `CREATE TABLE`-Anweisung für eine dieser 4 Tabellen —
   nur einen unabhängigen `DROP INDEX`-Bezug in `migrations/20260717-drop-unused-indexes.sql`.
   Die Tabelle wurde also nie in der versionierten Migrations-Pipeline erfasst; sie existiert nur
   dort, wo das One-Shot-Skript manuell gelaufen ist (Fleet mentolder, Fleet korczewski) — nicht
   auf lokalem k3d-Dev und auf keinem zukünftigen frischen/restaurierten Cluster, der
   ausschließlich aus `migrations/` provisioniert wird.

## Fix-Richtung — abgewogen

**Option A — defensive Absicherung in `fn_purge_test_data()`:** `has_qts` per
`to_regclass('questionnaire_test_status') IS NOT NULL` (Muster identisch zu den bestehenden
`has_*`-Proben) ermitteln und Schritt 1 in `IF has_qts THEN ... END IF;` einbetten.

- **Für A:** entspricht exakt dem bereits etablierten Muster der Funktion (keine neue Konvention
  eingeführt); behebt das gemeldete Symptom sofort; macht die Funktion restore-sicher gegen
  *jede* Datenbank, der die Tabelle aus irgendeinem Grund fehlt (nicht nur diesen einen Drift-Fall
  — z. B. auch nach einem Restore eines älteren Backups); Risiko minimal (eine zusätzliche
  Guard-Variable + IF-Wrap, keine Schemaänderung); sofort auslieferbar, unabhängig von anderer
  In-Flight-Arbeit.
- **Gegen A:** behebt nicht die Ursache — die Tabelle bleibt auf lokalem k3d-Dev nicht existent,
  jeder andere Codepfad, der `questionnaire_test_status` direkt anspricht, bliebe verwundbar.

**Option B — Drift schließen:** die DDL aus dem One-Shot-Skript als echte Migration unter
`migrations/` nachtragen, damit ein frischer/restaurierter/lokaler Cluster die 4 Tabellen erhält.

- **Für B:** behebt die Ursache dauerhaft, nicht nur den einen Aufrufer.
- **Gegen B:** T002647 ("feature-migrations-runner-auto") führt gerade — auf einem separaten,
  laufenden Branch — einen automatisierten Migrations-Runner für `migrations/` ein. Eine
  Migration in diesem Ticket zu ergänzen, während der Runner selbst noch in Arbeit ist, birgt
  Koordinationsrisiko (Reihenfolge-/Merge-Konflikte mit T002647, unklares Verhalten, falls der
  Runner zum Zeitpunkt der Ausführung dieses Fixes noch nicht gemergt ist). Das Ticket selbst
  grenzt das explizit ab: "empfehle — berücksichtige, dass T002647 gerade einen automatischen
  Migrations-Runner ... einführt (in Arbeit, eigener Branch)".

**Entscheidung:** Dieser Plan setzt **Option A** um — sie ist die minimale, sofort wirksame und
mit dem bestehenden Code konsistente Behebung des major-Vorfalls, unabhängig vom Runner-Fortschritt
in T002647. **Option B bleibt als Folge-Ticket offen** (Migrationsdatei für die 4
`questionnaire_test_*`-Tabellen unter `migrations/`, zu erstellen **nachdem** T002647 gemergt und
der Runner-Vertrag stabil ist) — nicht Teil dieses Plans, um keine Kollision mit der laufenden
Runner-Arbeit zu riskieren.

## Betroffene Subsysteme

- `tickets.fn_purge_test_data()` (DB-Funktion, `website`-DB, Schema `tickets`) — einzige Änderung.
- `tests/lib/factory-test-fixtures.sh` — Aufrufer, unverändert; profitiert vom Fix.
- Kein Applikationscode betroffen (kein `scripts/factory/mcp-server.mjs`-Change nötig — die im
  Ticket genannte Komponente war der beobachtende Aufrufpfad, nicht die Fehlerquelle).

## Edge Cases

- Datenbanken, in denen `questionnaire_test_status` bereits existiert (Fleet mentolder/korczewski):
  Verhalten bleibt unverändert — `has_qts` ist dort `true`, Schritt 1 läuft wie bisher.
  `CREATE OR REPLACE FUNCTION` ist idempotent anwendbar.
- Ein DB-Restore aus einem alten Backup ohne die Tabelle: mit dem Fix bricht die Funktion nicht
  mehr ab, sondern überspringt Schritt 1 sauber (statt der gesamte Purge scheitert).
- Der Test muss beide Zustände (Tabelle vorhanden / nicht vorhanden) nicht separat simulieren —
  er läuft gegen die tatsächliche lokale k3d-DB, in der die Tabelle nachweislich fehlt, und
  beweist damit direkt den vorher roten, nachher grünen Pfad.

## Out of Scope

- Schema-Drift-Migration für `questionnaire_test_status` und die 3 Schwestertabellen
  (Option B) — Folge-Ticket nach T002647.
- Änderungen an `scripts/factory/mcp-server.mjs` — die Ticket-Komponentenangabe bezog sich auf
  den beobachtenden Aufrufpfad, nicht die Fehlerursache.
