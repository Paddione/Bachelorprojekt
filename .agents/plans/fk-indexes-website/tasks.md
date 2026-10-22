---
title: "fk-indexes-website — Implementation Plan"
domains: [infra, testing]
status: staged
---

# fk-indexes-website — Implementation Plan

Selektive FK-Indizes (6 customers-Children mit belegtem Delete-Pfad) aus
Audit-F1. Selektionsbegründung in `design.md`. Konvention aus T001830.

## File Structure

Neu:
- `components/website/src/db/migrations/20261022_fk_indexes_customer_children.sql`:
  6× `CREATE INDEX IF NOT EXISTS` im `to_regclass`-Guard.
- `tests/py/spec/website_db/test_fk_indexes_customer_children.py`: RED-Test
  (Rotphase belegt, failt aktuell: Migrationsdatei fehlt).

Referenziert, nicht geändert:
- `components/website/src/db/migrations/20260717_add_missing_fk_indexes.sql`
  (Muster), `components/website/src/db/migrate.ts` (Laufweg),
  `components/website/src/lib/tickets/purge-fn.ts:517` (Delete-Pfad-Beleg).

## S1 Budgets

Neue Dateien, beide weit unter 80 % ihrer wirksamen Schwelle
(.sql ohne S1-Limit → n/a; .py-Limit 800).

| Datei | Ist | Budget |
| --- | --- | --- |
| `.../migrations/20261022_fk_indexes_customer_children.sql` | neu (~50) | n/a (SQL) |
| `tests/py/spec/website_db/test_fk_indexes_customer_children.py` | neu (~35) | 800 (.py-Limit) |

Keine bestehenden Dateien geändert → keine Baseline-Rechnung nötig.
Keine Baseline-/Ignore-Änderung. CQ02: keine TS-Änderung. Keine neuen
Importzyklen, keine Brand-Domainliterale. S4: Migrationsdatei läuft über
den registrierten `db:migrate`-Pfad (kein Orphan); kein neues Skript.

## Task 1 — GREEN: Migration schreiben

- [x] Rotphase wiederholen (expected: FAIL):
  ```bash
  python3 -m pytest tests/py/spec/website_db/test_fk_indexes_customer_children.py -q
  ```
  (Beleg 2026-10-22: FAIL, `FileNotFoundError` Migrationsdatei fehlt.)
- [x] Laufweg zuerst verifizieren (F4-Frage): belegt lesen, ob `db:migrate`
  (`components/website/src/db/migrate.ts`) auf devmesh läuft und wohin es
  trackt — der Katalog kennt weder `schema_migrations` noch
  `factory_schema_migrations`. Falls der Laufweg tot ist: hier stoppen und
  als Deploy-Mechanik-Befund zurückmelden statt Indizes zu schreiben.
  Befund 2026-10-22: Laufweg LEBT. `migrate.ts:runMigrations` trackt
  `public.schema_migrations` (Spalte `filename`) und bootstrapt die Tabelle
  per `CREATE TABLE IF NOT EXISTS` vor dem ersten Lauf — das Fehlen im
  Katalog (`count=0` auf devmesh-`website`) heißt nur „noch nie gelaufen“,
  nicht „tot“. Runner-Skript `db:migrate` in `components/website/package.json:24`
  vorhanden. Alle 6 Ziel-Spalten auf devmesh verifiziert, keine
  Indexnamen-Kollision.
- [x] Migrationsdatei nach Muster `20260717` schreiben (6 Indizes aus
  File Structure, ein `DO $$`-Block je Tabelle mit `to_regclass`-Guard).
- [x] GREEN-Nachweis:
  ```bash
  python3 -m pytest tests/py/spec/website_db/test_fk_indexes_customer_children.py -q
  ```
  (Beleg 2026-10-22: 1 passed.)
- [x] Wirkungsprobe (bounded, read-only, Dev-Volumina — kein Speedup-Beleg
  erwartet, nur Plan-Nutzung zeigen):
  ```bash
  kubectl --context devmesh -n workspace exec deploy/shared-db -c postgres -- psql -U postgres -d website -Atc "EXPLAIN SELECT 1 FROM public.messages WHERE sender_customer_id = '00000000-0000-0000-0000-000000000000' LIMIT 1"
  ```
  nach `db:migrate`-Lauf auf devmesh (führt der Execute aus).
  Beleg 2026-10-22: `Index Only Scan using idx_messages_sender_customer_id`
  (alle 6 Indizes in `pg_indexes` verifiziert). Hinweis: `task website:migrate`
  scheiterte in diesem Worktree an `pnpm` („workspace hoist directory is not
  a real directory“, node_modules-Symlink des Worktree-Setups) — stattdessen
  derselbe Befehl manuell: Port-Forward + `tsx src/db/migrate.ts` mit
  DATABASE_URL (Exit 0; Erstlauf auf devmesh, `schema_migrations`
  gebotstrapt). Separater Vorbefund: `task db:migrate` (factory-Runner,
  Taskfile.data.yml) ist auf main kaputt (`unclosed here-document EOSQL`,
  T901440-Massage-Zweig) — betrifft diesen Plan nicht, ans
  Orchestrator-Backlog melden.

## Task 2 — Verify: Migrate + Gates

- [x] `db:migrate`-Lauf gegen devmesh-`website` (führt der Execute aus;
  reversibel via `DROP INDEX`, keine Datenänderung).
  Beleg 2026-10-22: `tsx src/db/migrate.ts` via Port-Forward, Exit 0,
  Datei `20261022_fk_indexes_customer_children.sql` als „applying“ geloggt,
  6 Indizes in `pg_indexes` belegt.
- [ ] CI-Gate: `task test:changed` + `task freshness:regenerate` + `task freshness:check` + `task workspace:validate`.

## Risiken

- `superpowers:brainstorming` steht in dieser Umgebung nicht zur Verfügung;
  Selektion inline in `design.md` begründet, Review durch dev-flow-execute.
- Falls `db:migrate` auf devmesh nicht läuft, ist Task 1 nach dem
  Laufweg-Check beendet (Befund statt Migration) — kein erzwungener Index-Bau.
- Zurückgestellte 11 Kandidaten bleiben Kandidaten; kein Anspruch auf
  Vollständigkeit.
