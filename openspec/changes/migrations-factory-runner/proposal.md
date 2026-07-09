# Proposal: migrations-factory-runner

## Why

Zwei divergente Migrationssysteme existieren im Repo: `scripts/migrations/*.sql`
wird manuell und ungetrackt via `factory_psql` angewendet (Konsistenz zwischen
Brand-DBs nur über eine Cross-Brand-Pflege-SOP sichergestellt), während
`website/src/db/migrations/*.sql` über einen getrackten Runner
(`website/src/db/migrate.ts`, `public.schema_migrations`) deterministisch
angewendet wird. Dieser Dualismus wurde bereits im DB-Audit vom 2026-07-09
(`docs/db-audit/2026-07-09-index-and-nplus1-audit.md:331`) und im
db-legacy-cleanup-optimize-Plan als Follow-up (`FU1`) dokumentiert — beide
verlangten ausdrücklich ein eigenes Ticket, das mit T001677 nun umgesetzt wird.
Ohne getrackten Runner besteht das Risiko, dass mentolder und korczewski
unterschiedliche Migrationsstände haben, ohne dass dies auffällt.

## What

`scripts/migrations/*.sql` erhält einen eigenen getrackten Runner
(`scripts/migrate-factory.mjs`), der dem Muster von
`website/src/db/migrate.ts` folgt (Single-Client-Transaktion pro Datei,
lexikographische Sortierung, SQLSTATE-Backfill-Erkennung), aber eine eigene
Tracking-Tabelle (`public.factory_schema_migrations`) verwendet, um die
beiden Migrationsströme sauber getrennt zu halten. Ein neues Taskfile-Target
`factory:migrate` (Port-Forward-Pattern wie `website:migrate`) wird an den
drei Stellen in `task workspace:deploy` verankert, an denen aktuell
`website:migrate` läuft (Taskfile.yml:2554, 2683, 3512). Ein einmaliger,
Ist-Zustand-geprüfter Backfill markiert die 17 zum Zeitpunkt der
Konsolidierung bestehenden Migrationsdateien pro Brand-DB als bereits
angewendet, bevor der Runner produktiv in den Deploy-Pfad eingehängt wird.
`factory_psql` bleibt als Ad-hoc-Query-Helfer bestehen, wird aber nicht mehr
als impliziter Migrations-Anwendungsweg dokumentiert.

Volle Design-Entscheidungen (inkl. aller autonom getroffenen Annahmen, die
gegengelesen werden sollten) siehe
`docs/superpowers/specs/2026-07-09-migrations-factory-runner-design.md`.

Out of Scope: Umzug/Umbenennung der SQL-Dateien, Vereinheitlichung der
Naming-Konvention, Zusammenführung beider Tracking-Tabellen, Inhalte aus
T001676 (db-legacy-cleanup, separates Ticket).

_Ticket: T001677_
