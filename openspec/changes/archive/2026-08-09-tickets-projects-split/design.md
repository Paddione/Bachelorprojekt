---
ticket_id: T002722
plan_ref: openspec/changes/tickets-projects-split/tasks.md
status: active
date: 2026-08-09
---

# Design: Kundenprojekte aus `tickets.tickets` herausloesen

## Kontext

ADR-006 sieht vor, die fleet-Kopie des `tickets`-Schemas nach dem lokalen Datenumzug (E3,
T002626) vollstaendig gegen Schreibzugriffe einzufrieren
(`scripts/sdlc/migrate-tickets.sh freeze`). Bei der E3-Umsetzung wurde gemessen (E3/D2), dass
`website/src/lib/projects-db.ts` aus dem **Produktions-Build** INSERT/UPDATE/DELETE auf
`tickets.tickets` (`type='project'`) ausfuehrt — 41 Kundenprojekt-Zeilen (34 mentolder,
7 korczewski), plus 23 zugehoerige Aufgaben (`type='chore'`, `parent_id` auf ein Projekt). Ein
`REVOKE` auf das gesamte `tickets`-Schema wuerde die Projektverwaltung im Kundenportal brechen.
Der Freeze wurde deshalb aus E3 herausgenommen und in dieses Ticket (T002722, informell "E4"
in den Ticket-Kommentaren; nicht zu verwechseln mit der gleichnamigen ADR-Etappe) verschoben.

**Entscheidung von Patrick (Klärungsrunde 2026-08-09, bindend):** Die Kundenprojekte werden aus
`tickets.tickets` in eine eigene Geschaeftstabelle migriert. Erst danach laeuft der vollstaendige
Freeze. Die Alternative ("granular einfrieren, `tickets.tickets` bleibt geteilt") ist verworfen —
sie liesse sich mit `cmd_freeze()`'s tabellen-granularer REVOKE/GRANT-Mechanik ohnehin nicht
ausdruecken (kein Trigger-basierter Guard fuer `type='project'` innerhalb derselben Tabelle).

## Ausgangslage, gemessen 2026-08-09 (fleet `shared-db`, Namespace `workspace`, DB `website`)

| Gegenstand | Messwert |
|---|---|
| `tickets.tickets` mit `type='project'`, `parent_id IS NULL` | 41 (34 mentolder, 7 korczewski) |
| `tickets.tickets` mit `type='project'`, `parent_id IS NOT NULL` (Sub-Projekte) | 0 |
| `tickets.tickets` mit `type='chore'`, `parent_id` -> ein Projekt | 23 |
| `meetings.project_id`, `time_entries.project_id/task_id`, `questionnaire_assignments.project_id` (alle FK auf `tickets.tickets`) | 0 Zeilen belegt |
| `tickets.ticket_attachments` fuer Projekt-/Aufgaben-Zeilen | 0 |
| `tickets.ticket_comments` fuer `type='project'`-Zeilen | 10.010, davon 9.964 auf einer einzigen Ausreisser-Zeile (T000413); die uebrigen 11 Projekte tragen zusammen 46 Kommentare |
| Aufrufer der `ticket_comments`-Tabelle im Code | ausschliesslich SDLC-Cockpit-Module (`src/lib/tickets/*`, `src/lib/sdlc/*`) — **keiner** im Kundenportal/Admin-Projekt-UI |

Wichtig fuer die Migrationsmethodik: die urspruengliche E3-Messung pruefte nur die Belegung der
FK-Kanten (alle 0) und schloss daraus faelschlich auf Folgenlosigkeit. Der reale Nutzungspfad
laeuft ueber die Spalte `type='project'`, nicht ueber eine Fremdschluessel-Kante. Diese
Migration verifiziert deshalb Nutzungspfade (welcher Code liest/schreibt was), nicht nur
Schema-Kanten.

## Entscheidungen

### D1 — Kopieren statt Verschieben; keine `DELETE` auf `tickets.tickets`

`migrate-tickets.sh freeze` entzieht nur Schreibrechte (`REVOKE INSERT, UPDATE, DELETE,
TRUNCATE`), es loescht keine Zeilen — die fleet-Kopie bleibt als lesbare Historie erhalten
(das ist der ganze Sinn von "einfrieren" statt "leeren"). Daraus folgt: die 41+23 Projekt-/
Aufgaben-Zeilen muessen **nicht** aus `tickets.tickets` entfernt werden. Sie werden mit
identischer `id` (UUID) in die neue Tabelle **kopiert** (`INSERT ... SELECT`), die App-Schicht
schwenkt auf die neue Tabelle um, und die alten Zeilen bleiben unangetastet als totes,
lesbares Altmaterial in `tickets.tickets` zurueck — inklusive ihrer 10.010 Kommentare, die so
nicht migriert werden muessen (kein `ON DELETE CASCADE`-Risiko, weil nichts geloescht wird).
Das reduziert die Migration auf einen einzigen additiven Schritt ohne Rollback-Fenster: schlaegt
der Cutover fehl, bleibt `tickets.tickets` unveraendert die Quelle der Wahrheit.

### D2 — Eine neue Tabelle `public.customer_projects`, ausserhalb des Schemas `tickets`

Zwingend: die neue Tabelle darf **nicht** im Schema `tickets` liegen, sonst faengt sie sich der
naechste `freeze`-Lauf wieder ein (`REVOKE ... ON ALL TABLES IN SCHEMA tickets`) — genau das
Problem, das diese Migration loest, waere sonst nur verschoben statt behoben. `meetings`,
`time_entries`, `questionnaire_assignments` und `customers` liegen bereits unqualifiziert im
Schema `public`; die neue Tabelle folgt dieser bestehenden Konvention statt ein neues Schema zu
eroeffnen.

Eine Tabelle statt drei (Projekt/Unterprojekt/Aufgabe), selbstreferenzierend ueber `parent_id`
wie im Original — das deckt sich mit dem in projects-db.ts bereits vorhandenen Datenmodell
(ein Baum, `type` unterscheidet die Ebene) und haelt die Migration auf ein `INSERT ... SELECT`
reduziert:

```sql
CREATE TABLE IF NOT EXISTS public.customer_projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id     UUID REFERENCES public.customer_projects(id) ON DELETE SET NULL,
  type          TEXT NOT NULL CHECK (type IN ('project','task')),
  brand         TEXT NOT NULL REFERENCES brands(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  title         TEXT NOT NULL,
  description   TEXT,
  notes         TEXT,
  start_date    DATE,
  due_date      DATE,
  status        TEXT NOT NULL DEFAULT 'backlog',
  resolution    TEXT,
  priority      TEXT NOT NULL DEFAULT 'mittel' CHECK (priority IN ('hoch','mittel','niedrig')),
  customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
  assignee_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_projects_parent_idx ON public.customer_projects(parent_id);
CREATE INDEX IF NOT EXISTS customer_projects_brand_idx  ON public.customer_projects(brand);
CREATE INDEX IF NOT EXISTS customer_projects_customer_idx ON public.customer_projects(customer_id) WHERE customer_id IS NOT NULL;
```

`type='chore'` wird beim Kopieren nach `type='task'` umbenannt — die neue Tabelle hat kein
gemeinsames Vokabular mehr mit `tickets_type_check` und braucht die SDLC-Altlast nicht
weiterzutragen. `status`/`resolution` behalten das interne Vokabular
(`backlog`/`in_progress`/`blocked`/`done`/`archived`/...), das `STATUS_FWD`/`STATUS_BACK_SQL`
in `projects-db.ts` bereits zwischen App-Status (`entwurf`/`aktiv`/...) und DB-Status uebersetzt
— diese Mapping-Tabellen aendern sich nicht, nur ihre Zieltabelle. Es gibt **keinen**
Zyklus-Schutz-Trigger (Analog zu `tickets.fn_prevent_cycle`) — bei maximal zwei Ebenen
(Projekt -> Aufgabe; Sub-Projekte kommen in der Praxis nicht vor, s.o.) ist das Risiko gering
und wird als Risiko dokumentiert statt vorab gebaut (YAGNI).

Ein zweites neues Table fuer Anhaenge (heute `tickets.ticket_attachments`, 0 Zeilen fuer
Projekte, aber vom Portal-Upload-Flow erreichbar):

```sql
CREATE TABLE IF NOT EXISTS public.customer_project_attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES public.customer_projects(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  nc_path       TEXT,
  data_url      TEXT,
  mime_type     TEXT NOT NULL DEFAULT 'application/octet-stream',
  file_size     BIGINT,
  uploaded_by   UUID REFERENCES customers(id) ON DELETE SET NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (nc_path IS NOT NULL OR data_url IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS customer_project_attachments_project_idx ON public.customer_project_attachments(project_id);
```

### D3 — FK-Umhaengung: `meetings`, `time_entries`, `questionnaire_assignments`

Diese drei Tabellen referenzieren heute `tickets.tickets(id)` fuer Projekt-/Aufgaben-Bezuege
(`meetings.project_id`, `time_entries.project_id`, `time_entries.task_id`,
`questionnaire_assignments.project_id`) — alle 0 Zeilen belegt (E3-Messung, hier erneut
verifiziert). Da unbelegt, ist das Umhaengen eine reine DDL-Operation ohne Datenverlustrisiko:

```sql
ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_project_id_fkey,
  ADD CONSTRAINT meetings_project_id_fkey FOREIGN KEY (project_id)
    REFERENCES public.customer_projects(id) ON DELETE SET NULL;
-- analog fuer time_entries.project_id, time_entries.task_id, questionnaire_assignments.project_id
```

Ohne dieses Umhaengen wuerde jeder zukuenftige Versuch, eine Besprechung/Zeiterfassung/
Fragebogen-Zuweisung an ein (dann nur noch in `customer_projects` existierendes) Projekt zu
haengen, an einer toten FK auf die eingefrorene `tickets.tickets` scheitern.

### D4 — App-Schicht: Tabellenname/-schema tauschen, TS-Oberflaeche unveraendert

`projects-db.ts` exportiert bereits eine stabile TS-Oberflaeche (`Project`, `SubProject`,
`ProjectTask`, `listProjects`, `createProject`, ...), auf die **32 Aufrufer** (API-Routen,
`.astro`-Seiten, Komponenten) zugreifen — u. a. `api/portal/projekte.ts`, `portal.astro`,
`admin.astro`, `admin/projekte.astro`, `admin/projekte/[id].astro`, `admin/subprojekte/*`,
`admin/projekttasks/*`. Weil sich nur die zugrundeliegende SQL-Quelle aendert (Tabelle statt
`tickets.tickets`+`type='project'`-Filter), nicht die Funktionssignaturen, bleiben diese 32
Aufrufer **unveraendert** — das ist eine deutlich kleinere Aenderung als der Ticket-Text
("Umbau von ... `api/portal/projekte.ts`, `portal.astro`, `admin.astro`") vermuten liess; jene
Dateien nutzen `projects-db.ts` nur ueber die bereits stabile Funktions-API.

Tatsaechlich zu aendernde Dateien (SQL-Ebene, alle in `website/src/lib/`):

- `projects-db.ts` (430 Zeilen) — Kern-CRUD fuer Project/SubProject/ProjectTask
- `project-portal-db.ts` (161 Zeilen) — Portal-Sicht (`listProjectsForCustomer`,
  `togglePortalTaskDone`), liest/schreibt direkt `tickets.tickets`
- `project-attachments-db.ts` (67 Zeilen) — CRUD auf `tickets.ticket_attachments`
- `project-export-db.ts` (154 Zeilen) — Export-Zeilen, liest Projektnamen aus `tickets.tickets`
- neu: `schema/customer-projects-schema.ts` — idempotente DDL (Analogie zu
  `schema/provider-config-schema.ts`), aufgerufen aus `initTicketsSchema()`-Aufrufstelle bzw.
  einer eigenen `initCustomerProjectsSchema()`, die dieselbe `ensureSchemaOnce`-Sperre aus
  `db-pool.ts` nutzt

`getCustomerByEmail`, `listAllCustomers`, `listAdminUsers` (ebenfalls aus `projects-db.ts`
re-exportiert) bleiben unveraendert — sie lesen `customers`, nicht `tickets.tickets`.

### D5 — Migrationsscript: einmaliges, idempotentes `INSERT ... SELECT`

Kein Dual-Write-Fenster (Analogie zu E3/D2 — bei dieser Datenmenge, hier 64 Zeilen statt
36.700, ist ein Big-Bang erst recht verhaeltnismaessig). Ablauf:

1. Schema-DDL anwenden (`customer_projects`, `customer_project_attachments`, FK-Umhaengung).
2. `INSERT INTO public.customer_projects (id, parent_id, type, brand, title, description,
   notes, start_date, due_date, status, resolution, priority, customer_id, assignee_id,
   created_at, updated_at) SELECT id, parent_id, CASE type WHEN 'chore' THEN 'task' ELSE type
   END, brand, title, description, notes, start_date, due_date, status, resolution, priority,
   customer_id, assignee_id, created_at, updated_at FROM tickets.tickets WHERE type='project'
   OR (type='chore' AND parent_id IN (SELECT id FROM tickets.tickets WHERE type='project'))
   ON CONFLICT (id) DO NOTHING;` — idempotent, bei mehrfacher Ausfuehrung ohne Effekt.
3. Verifikation: Zeilenzahl neu (`SELECT count(*) FROM public.customer_projects`) muss 64
   ergeben (41 Projekte + 23 Aufgaben) und pro `id` inhaltsgleich mit der Quelle sein.
4. App-Deploy (dieser PR) auf beide Brands.
5. **Erst nach verifiziertem Live-Betrieb** (Portal zeigt Projekte aus der neuen Tabelle,
   Schreibtest gruen): `SDLC_FREEZE_CONFIRM=T002722 scripts/sdlc/migrate-tickets.sh freeze`
   als **separater, manueller Schritt** ausserhalb dieses PRs (schreibende Prod-Operation,
   `scripts/prod-write-guard.sh`-pflichtig) — nicht Teil der automatisierten Verify-Kette.

Schema-DDL und Datenkopie laufen einmalig gegen die lebende fleet-DB (kubectl-exec-Pfad, nicht
`mcp-postgres` — das ist read-only). Sie sind **kein** Teil von `initCustomerProjectsSchema()`
(die legt nur die leere Struktur an); die Kopie ist ein einmaliger operativer Schritt, den
dieser Plan als eigene Aufgabe mit `--dry-run`-Vorschau fuehrt, analog zu
`migrate-tickets.sh`.

### D6 — Sequenz-Bruecke (T002731) wird nicht rueckgaengig gemacht

Am 2026-08-08 wurde als Ueberbrueckung `tickets.external_id_seq` auf 900000 gesetzt, weil
`projects-db.ts:246` ohne `external_id` in `tickets.tickets` einfuegte und sich damit denselben
Sequenz-Namensraum wie echte SDLC-Tickets teilte. Nach dieser Migration entfaellt das Problem
strukturell: `customer_projects` hat keine `external_id`-Spalte und beruehrt
`tickets.external_id_seq` nicht mehr. Die Bruecke bleibt unangetastet (kein Revert) — sie ist
harmlos und ihr Rueckbau ist nicht Teil dieses Tickets.

## Nicht migriert / bewusst ausgeklammert

- `tickets.ticket_comments`, `tickets.ticket_attachments` fuer die 41+23 Alt-Zeilen — kein
  Kundenportal-Code liest sie (s. Messung oben); sie bleiben als Historie in der eingefrorenen
  `tickets.tickets` lesbar.
- `coaching.sessions` -> `tickets.provider_config` — in E3 bereits entschieden ("bleibt auf
  fleet"), von dieser Migration nicht beruehrt.
- Zyklus-Schutz fuer `customer_projects.parent_id` — Risiko dokumentiert (s. D2), nicht gebaut.
- Der eigentliche `freeze`-Lauf ist eine manuelle Post-Merge-Operation, kein Teil dieses PRs
  (s. D5, Schritt 5).

## Risiken

| Risiko | Wirkung | Abmilderung |
|---|---|---|
| Freeze laeuft, bevor Live-Verifikation abgeschlossen ist | Portal-Schreibfehler in Prod | D5 trennt Freeze explizit vom PR, macht es zu einem bewussten manuellen Schritt |
| `customer_projects` faellt versehentlich unter `freeze`, weil es doch im Schema `tickets` landet | Kundenportal erneut blockiert — exakt der urspruengliche Fehler | D2 erzwingt `public`-Schema; ein Test (`tests/spec/`) prueft `pg_tables.schemaname != 'tickets'` fuer die neue Tabelle |
| FK-Umhaengung (D3) trifft in Prod doch belegte Zeilen (Messung veraltet) | `ALTER TABLE` schlaegt fehl oder verwaist Referenzen | Vor dem `ALTER` erneute `COUNT(*)`-Pruefung als Teil desselben Migrationsscripts; bei >0 Zeilen Abbruch statt stiller Fortsetzung |
| Zeilenwachstum in bereits nicht-baselineten `projects-db.ts` (430 Zeilen) | S1-Ratchet-Verstoss | Umbau ist Tabellen-/Schema-Rename, keine Netto-Zeilenaddition erwartet; Plan-Subagent prueft `wc -l` vor/nach |

## Out of Scope

- Physisches Loeschen der 41+23 Alt-Zeilen aus `tickets.tickets` (D1).
- Migration von `ticket_comments`/`ticket_attachments`-Inhalten fuer diese Zeilen.
- Ausfuehrung von `migrate-tickets.sh freeze` selbst (D5, Schritt 5 — manuell, post-PR).
- Rueckbau der Sequenz-Bruecke aus T002731 (D6).
- Etappen E2/E5/E6 aus ADR-006.
