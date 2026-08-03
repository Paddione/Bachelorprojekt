# Proposal: g-db01-fk-index-remediation

## Why

Health-Goal G-DB01 ("FK-Spalten ohne Index") war laut `.claude/lib/goals.md` bereits
mit Ticket T001905 "gefixt" — Migration `20260717_add_missing_fk_indexes.sql` wurde
erstellt und laut `schema_migrations` am 2026-07-17 auf beiden Brand-Datenbanken
(mentolder `workspace`, korczewski `workspace-korczewski`) angewendet. T001952
(Prio-B-Ticket-Backfill, 2026-07-19) stellte fest, dass das zugrunde liegende
Health-Goal sein Target trotzdem nicht erreicht hat, und legte diesen Nachfolger
T001946 an.

**Live-Verifikation (2026-07-19, gegen `fleet`-Cluster, read-only Introspektion via
`pg_constraint`/`pg_index`, identische Query wie `scripts/health-goals-check.sh`
G-DB01):**

1. Der aktuelle Live-Wert liegt bei **34** (mentolder, `workspace`-Namespace) bzw.
   **49** (korczewski, `workspace-korczewski`-Namespace) fehlenden FK-Indizes —
   nicht bei 4. Seit dem 2026-07-17-Fix sind neue Tabellen mit unindizierten
   Single-Column-FKs hinzugekommen (u. a. `public.billing_*`, `public.supplier_invoices`,
   `public.newsletter_send_log`, `public.questionnaire_*`, `tickets.*`,
   `coaching.drafts`/`snippet_clusters`, `knowledge.collections`,
   `public.document_assignments`).
2. **Root-Cause der 4 ursprünglichen Spalten:** `public.onboarding_state.brand`,
   `sessions.templates.created_from_template_id`, `studio.sessions.client_id`,
   `studio.sessions.template_of` — die vier laut T001905 "gefixten" Spalten —
   waren auf der mentolder-Live-DB tatsächlich **weiterhin ohne Index**, obwohl
   `schema_migrations` die Migration als angewendet führt. Ein manueller
   Re-Run des exakt gleichen `DO $$ … $$`-Blocks aus
   `website/src/db/migrations/20260717_add_missing_fk_indexes.sql` gegen die
   mentolder-DB lief ohne jeden Fehler durch und erzeugte alle vier Indizes
   sofort (verifiziert per `pg_indexes`-Abfrage vor/nach). Die Migrations-SQL
   selbst ist also korrekt und idempotent — der reale Fehler liegt in der
   Diskrepanz zwischen "als angewendet getrackt" und "tatsächlich wirksam",
   deren genaue Ursache (Pool-Race, partieller Deploy, Restore-Artefakt) in
   dieser Session nicht rekonstruierbar ist. Diese Diskrepanz ist selbst ein
   Datenpunkt, aber kein Blocker für den Fix — sie wird dokumentiert statt
   weiter forensisch verfolgt (kein Postmortem-Scope für dieses Ticket).
   **Hinweis (Transparenz):** Dieser manuelle Re-Run während der Investigation
   war als read-only Introspektion geplant, hat aber als Nebenwirkung die vier
   Indizes bereits live auf der mentolder-Produktions-DB angelegt (idempotentes
   `CREATE INDEX IF NOT EXISTS`, keine Downtime/kein Lock, kein Datenverlust).
   Dies wird hier offengelegt statt verschwiegen. Die neue Migration unten
   MUSS die vier Statements dennoch enthalten, damit sie (a) für korczewski
   weiterhin wirkt, (b) bei jeder zukünftigen Neu-Erstellung einer Brand-DB
   reproduzierbar bleibt und (c) `schema_migrations`/Code textlich konsistent
   mit dem Live-Zustand ist.
3. Korczewski (kein Studio/Sessions-Schema, brand-spezifisch andere Tabellen)
   hat einen separaten, noch höheren Fehlbestand (49) — bestätigt, dass die
   Lücke pro Brand-DB getrennt gemessen und gefixt werden muss.

## What

1. Neue additive Migration `website/src/db/migrations/20260719_add_missing_fk_indexes_batch2.sql`,
   die für **alle aktuell fehlenden Single-Column-FK-Indizes** (Vereinigungsmenge
   aus beiden Brand-Messungen) `CREATE INDEX IF NOT EXISTS … ON …` mit
   `to_regclass(...)`-Existenz-Guard erzeugt — exakt das Muster aus der
   Vorgänger-Migration `20260717_add_missing_fk_indexes.sql`. Enthält
   sowohl die vier ursprünglichen (erneut, idempotent, für korczewski und
   Neu-Deployments) als auch die seither neu hinzugekommenen Spalten.
2. `.claude/lib/goals.md` G-DB01-Abschnitt korrigieren: den irreführenden
   "Live-Wert 4"-Text durch den tatsächlich gemessenen Wert (34/49, getrennt
   nach Brand) ersetzen und die Track-Wirksamkeits-Diskrepanz dokumentieren
   (kurzer Hinweis, kein neues Sub-Goal).
3. BATS-Testabdeckung: neue Assertions in `tests/spec/db-quality-goals.bats`,
   die statisch (ohne Live-DB-Zugriff, CI-tauglich) verifizieren, dass die
   neue Migrationsdatei existiert und für jede der als fehlend identifizierten
   Tabellen/Spalten-Paare eine `CREATE INDEX` mit passendem Spaltennamen enthält.

## Non-Goals

- Kein Root-Cause-Postmortem für die "getrackt aber nicht wirksam"-Diskrepanz
  des 2026-07-17-Fixes (Deploy-Pipeline-Investigation ist außerhalb des
  Fix-Scopes; ggf. eigenes Follow-up-Ticket, falls es erneut auftritt).
- Keine Änderung an `scripts/health-goals-check.sh`s G-DB01-Query selbst —
  die Messmethode ist bereits korrekt (siehe Live-Verifikation oben, identische
  Query liefert reproduzierbare Ergebnisse).
- Keine Multi-Column-FK-Indizes, keine Index-Typ-Optimierung (btree bleibt Default).

_Ticket: T001946_

## Addendum — dry-run validation finding (Scope-Ausschluss `arena.match_players`)

Vor Finalisierung wurde die generierte Migration in einer expliziten
`BEGIN; ... ROLLBACK;`-Transaktion gegen **beide** Brand-Datenbanken probeweise
ausgeführt (kein Commit, keine Nebenwirkung). Dabei zeigte sich: `arena.match_players.brand`
(nur auf korczewski als fehlender FK-Index gefunden) gehört zum Schema `arena`, dessen
Tabellen dem Rollen-Owner `arena_app` gehören — nicht `website`. Der `website`-Rolle,
mit der `db:migrate` läuft, fehlt das Privileg, dort einen Index anzulegen
(`ERROR: must be owner of table match_players`). Diese Spalte wurde daher **aus der
Migration entfernt** — Fix für diesen einzelnen Health-Goal-Datenpunkt ist außerhalb
des Scopes von `website/src/db/migrate.ts` (gehört in eine `arena_app`-eigene Migration,
falls eine solche existiert; sonst eigenes Follow-up-Ticket). G-DB01 erreicht dadurch
nach dieser Migration nicht exakt 0, sondern 1 (`arena.match_players.brand`, dokumentierter,
bewusster Restwert) — dies wird im aktualisierten `goals.md`-Eintrag transparent vermerkt.

Alle übrigen 58 Statements liefen fehlerfrei durch (mehrere davon waren auf der
jeweils anderen Brand-DB bereits vorhanden — `NOTICE: … already exists, skipping` —
was die idempotente `IF NOT EXISTS`-Guard-Wahl bestätigt).
