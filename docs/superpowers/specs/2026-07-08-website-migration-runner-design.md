---
ticket_id: T001652
plan_ref: openspec/changes/website-migration-runner/tasks.md
status: active
date: 2026-07-08
---

# website-migration-runner — Design Spec

## Problem

`website/src/db/migrations/*.sql` hat keinen Code-Pfad, der die Dateien automatisiert und
idempotent gegen eine Ziel-Datenbank anwendet. Andere Teilprojekte im selben Repo
(`studio-server/src/db/migrate.ts`, `brett/src/server/db.ts`, `VideoVault/server/migrate.ts`)
haben je einen eigenen `readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()`-Runner
mit Tracking-Tabelle, der beim Boot/Deploy läuft. `website` hat kein Äquivalent.

**Konkret beobachtet (T001652):** Auf der Prod-DB (`shared-db.workspace.svc.cluster.local`,
`fleet`-Cluster, DB `website`) fehlten mehrere Migrationen aus dem Zeitraum 2026-05-21 bis
2026-07-03 (`platform_assets`, `generation_jobs`, `folder_templates`, `audit_log`,
`sessions_templates`, `ai_call_log`, `error_log`), obwohl neuere Tabellen bereits vorhanden
waren. `ai_call_log` wurde manuell per `kubectl exec … psql` nachgezogen, um den 500er auf
`/api/admin/ai-quality` zu beheben — die anderen fehlenden Migrationen sind noch offen.

## Root Cause

Kein automatisierter Migrations-Schritt im Deploy-Flow für `website/src/db/migrations/`.
Migrationen werden offenbar manuell (oder gar nicht) gegen Prod angewendet, statt als fester
Bestandteil von `task workspace:deploy` zu laufen.

## Fix-Ansatz

1. **Runner-Modul** `website/src/db/migrate.ts` (analog `studio-server/src/db/migrate.ts`):
   - `readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()` — Dateinamen sind
     `YYYYMMDD_*`-präfixiert, lexikografische Sortierung ist chronologisch korrekt.
   - Für jede Datei: prüfen ob bereits in `schema_migrations` getrackt; falls nicht, Datei in
     einer Transaktion ausführen und in `schema_migrations (filename, applied_at)` eintragen.
   - Verbindung über `DATABASE_URL` env (kein Hardcoding einer Brand-DB).
2. **Neue Migration** `website/src/db/migrations/20260708_create_schema_migrations.sql`:
   - `CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at
     timestamptz NOT NULL DEFAULT now())`.
   - Diese Datei selbst muss vom Runner als "bootstrap" behandelt werden (die Tabelle muss
     existieren, bevor der Runner nachschauen kann, was bereits getrackt ist) — der Runner
     legt sie defensiv per `CREATE TABLE IF NOT EXISTS` an, bevor er die Tracking-Abfrage
     macht (nicht über den normalen Datei-Loop, sonst Henne-Ei-Problem).
3. **Backfill beim Erstlauf:** Da mehrere Migrationen in Prod bereits real angewendet sind
   (teils manuell, teils durch frühere Deploys, die die Statements zufällig idempotent
   ausgeführt haben), MUSS der Runner beim allerersten Lauf gegen eine Ziel-DB, in der
   `schema_migrations` neu angelegt wird, alle Dateien versuchen — Statements, die nicht
   `IF NOT EXISTS`/`IF NOT EXISTS`-sicher sind, dürfen serverseitig fehlschlagen (z. B. „relation
   already exists"), OHNE den gesamten Lauf abzubrechen: pro Datei einzeln versuchen, bei
   „already exists"-Fehlerklasse (Postgres SQLSTATE 42P07 u. ä.) als „already applied" tracken
   und weiterlaufen; bei anderen Fehlern abbrechen und laut melden.
4. **CLI + Task-Einbindung:**
   - `website/package.json`: neues Skript `db:migrate` → `tsx src/db/migrate.ts` (oder
     äquivalenter Runner-Aufruf, konsistent mit vorhandenem TS-Tooling in `website/`).
   - `Taskfile.yml`: neue Task `website:migrate` (ENV-Parameter wie bei anderen
     `website:*`-Tasks), die `DATABASE_URL` aus `environments/<env>.yaml` auflöst und
     `pnpm --dir website db:migrate` aufruft.
   - `workspace:deploy` (bzw. der website-spezifische Deploy-Task) ruft `website:migrate` vor
     dem Rollout der website-Deployment auf — analog zum bestehenden Sealed-Secret-Apply-vor-
     Manifest-Muster.

## Betroffene Dateien

- `website/src/db/migrate.ts` (neu)
- `website/src/db/migrations/20260708_create_schema_migrations.sql` (neu)
- `website/package.json` (neues Skript)
- `Taskfile.yml` (neue Task `website:migrate`, Einbindung in Deploy-Kette)
- Test: `website/src/db/migrate.test.ts` (neu) — deckt Sortierung, Tracking, Backfill-Verhalten
  bei „already exists" ab (gegen eine Test-DB oder gemockten `pg.Pool`)

## Edge Cases

- **Bereits angewendete, nicht-idempotente Migrationen:** siehe Backfill-Verhalten oben.
- **Mehrere Umgebungen (mentolder/korczewski/dev):** Runner läuft pro Zielumgebung mit der
  jeweiligen `DATABASE_URL` — kein Cross-Brand-Leakage.
- **Reihenfolge:** rein lexikografisch über Dateinamen; alle künftigen Migrationen müssen dem
  `YYYYMMDD_*`-Schema folgen (bereits durchgängig der Fall).

## Out of Scope (Follow-up, falls gewünscht)

- Dry-Run/Check-Modus (zeigt fehlende Migrationen ohne zu schreiben) für CI-Drift-Checks.
- Automatisches Nach-Ausführen bei jedem Pod-Boot (bewusst nur expliziter Deploy-Schritt,
  um konkurrierende Migrationsläufe bei mehreren Replicas zu vermeiden).
