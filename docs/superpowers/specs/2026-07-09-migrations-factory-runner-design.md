---
title: "Migrations-System-Konsolidierung: scripts/migrations/ unter getrackten Runner"
ticket_id: T001677
plan_ref: openspec/changes/migrations-factory-runner/tasks.md
date: 2026-07-09
status: draft
domains: [website, infra, db, ops]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Migrations-System-Konsolidierung — Design

## Angenommene Entscheidungen (autonom getroffen, bitte gegenlesen)

Dieses Ticket wurde ohne Grilling-Session geplant (Hintergrund-Agent, kein
interaktives Board). Die folgenden Design-Entscheidungen wurden autonom
getroffen und sollten vom User gegengelesen werden, bevor `dev-flow-execute`
läuft:

1. **Neuer Runner als eigenständiges Node-Skript `scripts/migrate-factory.mjs`**,
   keine Erweiterung von `website/src/db/migrate.ts` und kein Import
   zwischen den beiden. Begründung: `website/src/db/migrate.ts` ist
   Website-Workspace-Code (in `website/package.json`, per `tsx` ausgeführt);
   `scripts/migrations/` gehört zum Repo-Root-`scripts`-Namespace
   (`bachelorprojekt-scripts`, `package.json` hat bereits `pg` als
   Dependency und Präzedenzfälle wie `scripts/migrate-bugs-to-tickets.mjs`).
   Ein Cross-Workspace-Import würde eine unnötige Kopplung zwischen Website-
   und Repo-Root-Tooling einführen. Stattdessen wird die Kernlogik
   (Sortier-/Tracking-/Backfill-Pattern) **dupliziert, nicht extrahiert** —
   eine gemeinsame Bibliothek wäre sauberer, ist aber für zwei Call-Sites
   mit unterschiedlichem DB-Zugriffsmuster (s. Punkt 3) Overkill für den
   Ticket-Scope.
2. **Eigene Tracking-Tabelle `public.factory_schema_migrations`**, NICHT
   Wiederverwendung von `public.schema_migrations` (das Website-System).
   Begründung: beide Systeme laufen zwar physisch gegen dieselbe DB
   (`website`-Datenbank auf `shared-db`, siehe `factory_psql -d website`),
   aber gegen unterschiedliche Postgres-Schemas (`tickets`/`coaching` vs.
   `website`/`assets`/`platform`). Eine gemeinsame Ledger-Tabelle würde zwei
   unabhängige Änderungsströme in einer Zeilenliste vermischen und die
   Skip-Logik (`sort()` + linearer Abgleich) für Namenskollisionen
   anfällig machen, da beide Systeme unterschiedliche Dateinamens-
   Konventionen nutzen (`YYYYMMDD_x.sql` vs. `YYYY-MM-DD-x.sql` — technisch
   kollisionsfrei, aber semantisch zwei Domänen). Getrennte Tabelle = klar
   getrennte Verantwortlichkeit, exakt spiegelbildlich zum bestehenden
   Muster.
3. **DB-Zugriff über `DATABASE_URL` + Port-Forward (wie `website:migrate`),
   NICHT über `factory_psql`/`kubectl exec`.** Begründung: Der neue Runner
   braucht pro-Statement-Transaktionskontrolle und SQLSTATE-Fehlerbehandlung
   (`BEGIN`/`COMMIT`/`ROLLBACK` auf derselben Connection, Catch von
   `42P07`/`42710`/`42701`) — das ist mit `pg`'s `Pool`/`Client`-API einfach,
   mit reinem `kubectl exec ... psql`-Stdin-Piping (wie `factory_psql`)
   dagegen nicht robust nachbildbar (keine programmatische Fehlerklassen-
   Unterscheidung). Der neue Taskfile-Task repliziert daher das
   Port-Forward-Muster von `website:migrate` (Taskfile.yml:3335) statt
   `factory_psql` zu nutzen.
4. **Initialer Backfill als expliziter, einmaliger Schritt**, nicht rein
   über die SQLSTATE-Catch-Logik von `migrate.ts`. Begründung: Die
   SQLSTATE-Backfill-Erkennung (`ALREADY_EXISTS_SQLSTATES`) funktioniert
   nur für DDL-Migrationen (CREATE TABLE/INDEX/COLUMN wirft bei Re-Run
   einen Duplicate-Object-Error). Von den 17 bestehenden Dateien in
   `scripts/migrations/` sind mehrere reine Seed-/Data-Migrationen
   (`INSERT`-Statements, z. B. `2026-06-14-coaching-deepseek-seed.sql`,
   `2026-06-14-llm-availability-seed.sql`, `2026-07-03-local-qwen35-seed.sql`),
   die bei einem naiven Re-Run **stillschweigend doppelte Zeilen** erzeugen
   würden statt einen abfangbaren Fehler zu werfen. Der Plan sieht daher
   vor: nach Deploy des neuen Runners (aber vor dessen erstem produktiven
   Lauf) wird `factory_schema_migrations` für beide Brand-DBs
   (mentolder + korczewski) einmalig mit allen 17 zum Zeitpunkt der
   Konsolidierung existierenden Dateinamen vorbefüllt (`INSERT ... ON
   CONFLICT DO NOTHING`), sodass der erste echte Lauf des Runners nur noch
   künftige, ab jetzt neu hinzukommende Dateien anwendet. Diese Vorbefüllung
   ist ein Einmal-Schritt im Plan, kein Dauerzustand.
5. **Kein Wegfall von `factory_psql` als generischem Ad-hoc-Query-Helfer.**
   `factory_psql` bleibt für interaktive/Ad-hoc-Queries und für den
   Software-Factory-Dispatcher bestehen — es wird nur nicht mehr als
   impliziter, ungetrackter Migrations-Anwendungsweg für
   `scripts/migrations/*.sql` verwendet. Zukünftige Migrationen werden
   ausschließlich über den neuen Runner angewendet, nicht mehr manuell per
   `factory_psql < scripts/migrations/<datei>.sql`.
6. **Taskfile-Target-Name: `factory:migrate`** (Analogie zu `website:migrate`,
   Namespace `factory:` weil die Dateien historisch primär Software-
   Factory-/Ticket-Schema-Migrationen sind, `ENV=dev|mentolder|korczewski`
   wie beim Website-Pendant). Wird zusätzlich in `task workspace:deploy`
   verankert (analog zu den drei bestehenden `website:migrate`-Aufrufstellen:
   Taskfile.yml:2554, 2683, 3512), damit künftige Deploys beide
   Migrationssysteme automatisch anwenden — dies ist die eigentliche
   Verhaltensänderung des Tickets (bisher: manuell dokumentiert in Plan-
   Dateien und Ausführung vergessen ist möglich; danach: deterministisch
   bei jedem Deploy).
7. **Pfad `scripts/migrations/` bleibt unverändert** (kein Umzug der SQL-
   Dateien). Nur der Anwendungsweg ändert sich. Ein Umzug würde alle
   bestehenden Verweise in archivierten OpenSpec-Changes und Plan-Docs
   brechen, ohne funktionalen Mehrwert.
8. **Scope-Abgrenzung zu T001676** (db-legacy-cleanup-optimize, plan_staged):
   T001676 behandelt Datenmigration/Cleanup von `coaching.ki_config`
   Phase 2 — inhaltlich getrennt von diesem Ticket (reine
   Runner-Infrastruktur). Keine Abhängigkeit in beide Richtungen; beide
   Tickets können unabhängig voneinander laufen.
9. **Pfad-Wahl `feature`, nicht `chore`:** obwohl keine neue User-Facing-
   Funktion entsteht, ändert dieses Ticket das operative Verhalten von
   `task workspace:deploy` (ein neuer Migrations-Schritt wird in den
   produktiven Deploy-Pfad eingehängt) und führt eine neue Tracking-Tabelle
   ein — das ist eine strukturelle Änderung mit Risiko (Backfill-
   Korrektheit, Deploy-Reihenfolge), kein reines Doku-/Config-Chore.

## Kontext

Zwei divergente Migrationssysteme existieren aktuell:

| | `scripts/migrations/*.sql` | `website/src/db/migrations/*.sql` |
|---|---|---|
| Anwendung | manuell via `factory_psql < datei.sql`, dokumentiert in Plan-Dateien | automatisch via `website/src/db/migrate.ts`, `task website:migrate` |
| Tracking | keins — Konsistenz nur per Cross-Brand-Pflege-SOP | `public.schema_migrations` Tabelle |
| Naming | `YYYY-MM-DD-beschreibung.sql` (17 Dateien, Stand 2026-07-09) | `YYYYMMDD_beschreibung.sql` |
| Ziel-Schema | primär `tickets.*`, `coaching.*` | primär `website.*`, `assets.*`, `platform.*` |
| Aufruf-Ort | `scripts/factory/lib.sh::factory_psql`, kein zentrales Taskfile-Target | `Taskfile.yml:3335` `website:migrate`, aus `task workspace:deploy` |

Der bestehende Dualismus wurde bereits in
`docs/superpowers/specs/2026-07-09-db-legacy-cleanup-optimize-design.md`
(Zeilen 53–58, 110–113) als Out-of-Scope-Punkt dokumentiert, mit
Follow-up-Task `FU1` in
`openspec/changes/archive/2026-07-09-db-legacy-cleanup-optimize/tasks.md:356-372`,
der explizit ein neues Ticket forderte. T001677 ist dieses Ticket.

## Ziel

`scripts/migrations/*.sql` wird über einen getrackten Runner angewendet,
analog zu `website/src/db/migrate.ts`, sodass jede Brand-DB
(mentolder, korczewski) deterministisch denselben applizierten Stand
erreicht — ohne manuelle Cross-Brand-Pflege-SOP.

## Lösungsskizze

1. Neues Skript `scripts/migrate-factory.mjs`:
   - Liest `DATABASE_URL` aus Env (wie `migrate.ts`).
   - Bootstrap: `CREATE TABLE IF NOT EXISTS public.factory_schema_migrations
     (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`.
   - Liest `scripts/migrations/*.sql`, sortiert lexikographisch.
   - Pro Datei: skip falls getrackt; sonst `BEGIN`/SQL/`INSERT`/`COMMIT`
     auf einem dedizierten `pg.Client` (kein `Pool.query` direkt — gleiche
     Single-Connection-Garantie wie `migrate.ts`).
   - Gleiche SQLSTATE-Backfill-Logik (`42P07`/`42710`/`42701`) für künftige
     DDL-Migrationen, die versehentlich doppelt anwendbar sind.
2. Neues Taskfile-Target `factory:migrate` (Port-Forward-Pattern wie
   `website:migrate`), `ENV=dev|mentolder|korczewski`.
3. Einbindung in `task workspace:deploy` an den drei Stellen, an denen
   aktuell `task website:migrate ENV="{{.ENV}}"` aufgerufen wird
   (Taskfile.yml:2554, 2683, 3512) — `factory:migrate` läuft direkt daneben.
4. Einmaliger Backfill-Schritt (siehe Annahme 4) für mentolder + korczewski,
   bevor der Runner erstmals produktiv in `workspace:deploy` hängt.
5. Unit-Test analog zu `website/src/db/migrate.test.ts` für
   `scripts/migrate-factory.mjs` (Sortierreihenfolge, Skip getrackter
   Dateien, Backfill-SQLSTATE-Fälle, Abbruch bei Fremdfehler,
   Single-Client-Garantie).
6. `factory_psql` selbst bleibt unverändert (siehe Annahme 5) — nur die
   Doku/Konvention "neue Migrationen künftig via `factory:migrate` statt
   manuellem `factory_psql < datei.sql`" wird in
   `openspec/specs/database.md` verankert.

## Out of Scope

- Umzug oder Umbenennung der SQL-Dateien in `scripts/migrations/`.
- Vereinheitlichung der Naming-Konvention zwischen beiden Systemen.
- Zusammenführung beider Tracking-Tabellen in eine.
- Datenmigration/Cleanup-Inhalte aus T001676.
- Änderungen an `factory_psql` selbst (bleibt als Ad-hoc-Query-Helfer bestehen).

## Risiken

- **Backfill-Fehler:** falls der einmalige Backfill-Schritt vor dem ersten
  produktiven Runner-Lauf vergessen wird, würden Seed-Migrationen doppelt
  ausgeführt (Datenduplikate in `coaching`/`tickets`-Tabellen). Mitigation:
  Backfill ist ein expliziter, dokumentierter Plan-Task mit Verifikation
  (`SELECT count(*) FROM factory_schema_migrations` == 17 vor Aktivierung
  in `workspace:deploy`).
- **Divergenz zwischen Brand-DBs:** falls mentolder und korczewski aktuell
  bereits unterschiedliche Teilmengen der 17 Dateien angewendet haben
  (Cross-Brand-Pflege-SOP war nicht wasserdicht), muss der Backfill-Schritt
  den tatsächlichen Ist-Zustand pro Brand-DB verifizieren (z. B. via
  Existenzprüfung der jeweiligen Zieltabellen/-spalten), nicht blind alle
  17 Dateinamen eintragen. Dies wird als Plan-Task mit expliziter
  Ist-Zustand-Prüfung pro Brand vor dem Backfill-Insert ausgeführt.
