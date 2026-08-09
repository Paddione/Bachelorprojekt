---
title: "tickets-projects-split — Implementation Plan"
ticket_id: T002722
domains: [db, website, test]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# tickets-projects-split — Implementation Plan

_Ticket: T002722_

Design: `openspec/changes/tickets-projects-split/design.md`. Delta-Spec:
`openspec/changes/tickets-projects-split/specs/portal.md` (SSOT `openspec/specs/portal.md`).

## File Structure

```
website/src/lib/schema/customer-projects-schema.ts   (neu, ~55 Zeilen — DDL fuer
                                                        public.customer_projects +
                                                        public.customer_project_attachments,
                                                        Analogie zu provider-config-schema.ts)
website/src/lib/tickets-schema.ts                      (Ist 59 · Budget 841 — ruft
                                                        initCustomerProjectsSchema() zusätzlich auf,
                                                        da initTicketsSchema() bereits an jedem
                                                        Aufrufer von projects-db.ts läuft)
website/src/lib/projects-db.ts                         (Ist 430 · Budget 470 — SQL-Ziel
                                                        tickets.tickets → public.customer_projects,
                                                        Funktionssignaturen unverändert)
website/src/lib/project-portal-db.ts                   (Ist 161 · Budget 739 — Portal-CRUD auf
                                                        public.customer_projects)
website/src/lib/project-attachments-db.ts              (Ist 67 · Budget 833 — CRUD auf
                                                        public.customer_project_attachments)
website/src/lib/project-export-db.ts                   (Ist 154 · Budget 746 — Projektnamen-Export
                                                        liest public.customer_projects)
scripts/migrations/2026-08-09-customer-projects-copy.sql (neu — einmaliges, idempotentes
                                                        INSERT...SELECT + FK-Umhaengung, mit
                                                        --dry-run-faehigem Wrapper-Skript)
scripts/sdlc/migrate-customer-projects.sh              (neu, ~90 Zeilen — Wrapper analog
                                                        migrate-tickets.sh: preflight/copy/verify/
                                                        status, kubectl-exec-Pfad, kein freeze)
website/src/lib/website-db-projects.test.ts            (Ist ~610 nach RED-Test · Budget 290 —
                                                        bereits committeter RED-Test wird GREEN,
                                                        bestehende "verified via raw SQL"-Tests
                                                        auf public.customer_projects umgestellt)
website/src/data/test-inventory.json                   (regeneriert via task test:inventory)
```

## Vorbedingung — Live-Zeilenzahl vor DDL erneut verifizieren

Die Messwerte in `design.md` stammen vom 2026-08-09. Vor der Migration in Prod erneut
verifizieren (Zahlen koennten sich durch neue Portal-Aktivitaet seither veraendert haben):

```bash
kubectl --context fleet -n workspace exec -i deploy/shared-db -- psql -U postgres -d website -c \
  "select brand, count(*) from tickets.tickets where type='project' and parent_id is null group by brand;"
kubectl --context fleet -n workspace exec -i deploy/shared-db -- psql -U postgres -d website -c \
  "select count(*) from meetings where project_id is not null
   union all select count(*) from time_entries where project_id is not null or task_id is not null
   union all select count(*) from questionnaire_assignments where project_id is not null;"
```

Ergebnis MUSS mit `design.md` uebereinstimmen (41 Top-Level-Projekte, alle drei FK-Kanten 0).
Weichen die Zahlen ab: Ticket kommentieren, Plan-Autor konsultieren, NICHT stillschweigend
weiterlaufen — die FK-Umhaengung in Task 3 geht von unbelegten Kanten aus.

## Task 1 — Schema-DDL: neue Tabellen ausserhalb des Schemas `tickets`

Neue Datei `website/src/lib/schema/customer-projects-schema.ts`, Muster wie
`website/src/lib/schema/provider-config-schema.ts` (idempotente `CREATE TABLE IF NOT EXISTS` /
`CREATE INDEX IF NOT EXISTS`, `PoolClient`-Parameter):

```typescript
export async function initCustomerProjectsSchema(c: PoolClient): Promise<void> {
  await c.query(`CREATE TABLE IF NOT EXISTS public.customer_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES public.customer_projects(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('project','task')),
    brand TEXT NOT NULL REFERENCES brands(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    title TEXT NOT NULL, description TEXT, notes TEXT,
    start_date DATE, due_date DATE,
    status TEXT NOT NULL DEFAULT 'backlog', resolution TEXT,
    priority TEXT NOT NULL DEFAULT 'mittel' CHECK (priority IN ('hoch','mittel','niedrig')),
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    assignee_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await c.query(`CREATE INDEX IF NOT EXISTS customer_projects_parent_idx ON public.customer_projects(parent_id)`);
  await c.query(`CREATE INDEX IF NOT EXISTS customer_projects_brand_idx ON public.customer_projects(brand)`);
  await c.query(`CREATE INDEX IF NOT EXISTS customer_projects_customer_idx ON public.customer_projects(customer_id) WHERE customer_id IS NOT NULL`);

  await c.query(`CREATE TABLE IF NOT EXISTS public.customer_project_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.customer_projects(id) ON DELETE CASCADE,
    filename TEXT NOT NULL, nc_path TEXT, data_url TEXT,
    mime_type TEXT NOT NULL DEFAULT 'application/octet-stream', file_size BIGINT,
    uploaded_by UUID REFERENCES customers(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (nc_path IS NOT NULL OR data_url IS NOT NULL))`);
  await c.query(`CREATE INDEX IF NOT EXISTS customer_project_attachments_project_idx ON public.customer_project_attachments(project_id)`);
}
```

Anschluss in `website/src/lib/tickets-schema.ts`: `initCustomerProjectsSchema(client)` innerhalb
des bestehenden `ensureSchemaOnce('tickets', ...)`-Blocks zusaetzlich aufrufen (gleicher
Advisory-Lock-Umfang, kein neuer `ensureSchemaOnce`-Key noetig — `initTicketsSchema()` ist bereits
der Single-Entry-Point, den jede Projekt-DB-Funktion vor ihrer Query aufruft).

> Kein Zyklus-Schutz-Trigger fuer `parent_id` (siehe design.md D2, Risiko dokumentiert statt
> gebaut — maximal zwei Ebenen in der Praxis).

## Task 2 — App-Schicht auf die neue Tabelle umstellen

`website/src/lib/projects-db.ts`: alle SQL-Fragmente (`PROJECT_SELECT`, `SUBPROJECT_SELECT`,
`TASK_SELECT`, `createProject`, `updateProject`, `deleteProject`, `createSubProject`, ...)
ersetzen `FROM tickets.tickets` durch `FROM public.customer_projects` und den Vergleich
`type = 'project'` bleibt (Sub-Projekte behalten `type='project'` mit gesetztem `parent_id`);
`createProjectTask`/`updateProjectTask`/`deleteProjectTask` schreiben `type='task'` statt
`'chore'` (neues, eigenes Vokabular — kein `tickets_type_check` mehr zu bedienen). Jede Funktion
ruft weiterhin zuerst `await initTicketsSchema()`.

`website/src/lib/project-portal-db.ts`: `listProjectsForCustomer` (SELECT gegen
`tickets.tickets t` + gejointe `pt`/`sp`) und `togglePortalTaskDone` (`UPDATE tickets.tickets ...
WHERE type IN ('task','chore')`) auf `public.customer_projects` + `type IN ('task')` umstellen.

`website/src/lib/project-attachments-db.ts`: alle vier Funktionen (`listProjectAttachments`,
`getProjectAttachment`, `createProjectAttachment`, `deleteProjectAttachmentRecord`) von
`tickets.ticket_attachments` auf `public.customer_project_attachments` umstellen (Spalte
`ticket_id` → `project_id`).

`website/src/lib/project-export-db.ts`: Projektnamen-Lookup (`FROM tickets.tickets WHERE
type='project' AND parent_id IS NULL`) auf `public.customer_projects` umstellen.

`getCustomerByEmail`, `listAllCustomers`, `listAdminUsers` (lesen `customers`, nicht
`tickets.tickets`) bleiben **unveraendert** — keine der 32 Aufruferdateien
(`api/portal/projekte.ts`, `portal.astro`, `admin.astro`, `admin/projekte*`,
`admin/subprojekte/*`, `admin/projekttasks/*`, ...) muss angefasst werden, weil die
TS-Funktionssignaturen gleich bleiben.

<!-- vitest: Test-Task siehe unten (RED bereits committet, GREEN in Task 2) -->

## Task 3 — FK-Umhaengung + einmalige Datenkopie (Migrationsscript)

Neue Datei `scripts/migrations/2026-08-09-customer-projects-copy.sql`:

```sql
BEGIN;

-- Vorbedingung: alle drei Kanten muessen unbelegt sein (siehe Vorbedingungs-Task oben).
-- Bricht die Transaktion ab, falls doch Zeilen referenzieren (kein stiller Fortschritt).
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM meetings WHERE project_id IS NOT NULL;
  SELECT n + count(*) INTO n FROM time_entries WHERE project_id IS NOT NULL OR task_id IS NOT NULL;
  SELECT n + count(*) INTO n FROM questionnaire_assignments WHERE project_id IS NOT NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'Vorbedingung verletzt: % Zeilen referenzieren tickets.tickets ueber project_id/task_id — Abbruch, siehe design.md D3', n;
  END IF;
END $$;

INSERT INTO public.customer_projects
  (id, parent_id, type, brand, title, description, notes, start_date, due_date,
   status, resolution, priority, customer_id, assignee_id, created_at, updated_at)
SELECT id, parent_id,
       CASE type WHEN 'chore' THEN 'task' ELSE type END,
       brand, title, description, notes, start_date, due_date,
       status, resolution, priority, customer_id, assignee_id, created_at, updated_at
FROM tickets.tickets
WHERE type = 'project'
   OR (type = 'chore' AND parent_id IN (SELECT id FROM tickets.tickets WHERE type = 'project'))
ON CONFLICT (id) DO NOTHING;

ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_project_id_fkey;
ALTER TABLE meetings ADD CONSTRAINT meetings_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.customer_projects(id) ON DELETE SET NULL;

ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entries_project_id_fkey;
ALTER TABLE time_entries ADD CONSTRAINT time_entries_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.customer_projects(id) ON DELETE CASCADE;
ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entries_task_id_fkey;
ALTER TABLE time_entries ADD CONSTRAINT time_entries_task_id_fkey
  FOREIGN KEY (task_id) REFERENCES public.customer_projects(id) ON DELETE SET NULL;

ALTER TABLE questionnaire_assignments DROP CONSTRAINT IF EXISTS questionnaire_assignments_project_id_fkey;
ALTER TABLE questionnaire_assignments ADD CONSTRAINT questionnaire_assignments_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.customer_projects(id) ON DELETE SET NULL;

COMMIT;
```

Wrapper-Skript `scripts/sdlc/migrate-customer-projects.sh` (Muster: `scripts/sdlc/migrate-tickets.sh`,
gleicher `_pgpod`-Cluster-Zugriffs-Helper, `--dry-run` zeigt das SQL ohne Ausfuehrung):

```bash
scripts/sdlc/migrate-customer-projects.sh copy --dry-run   # SQL ansehen
scripts/sdlc/migrate-customer-projects.sh copy             # ausfuehren (fleet, Namespace workspace)
scripts/sdlc/migrate-customer-projects.sh verify           # Zeilenzahl-Abgleich: 64 erwartet
                                                             # (41 Projekte + 23 Aufgaben), pro-id
                                                             # Feldvergleich gegen tickets.tickets
```

**Kein `DELETE` auf `tickets.tickets`** — die Alt-Zeilen bleiben als Historie liegen (design.md D1).
Ausfuehrung nur ueber den sanktionierten `kubectl exec -i ... psql`-Pfad,
`scripts/prod-write-guard.sh` vor jeder Prod-Namespace-Operation.

**Ausserhalb dieses PRs (post-merge, manuell, s. design.md D5 Schritt 5):** nach verifiziertem
Live-Betrieb `SDLC_FREEZE_CONFIRM=T002722 scripts/sdlc/migrate-tickets.sh freeze`. Dieser
Plan fuehrt den Freeze **nicht** aus — er ist eine separate, bewusst manuelle Operation.

## Task 4 — Tests (RED → GREEN)

Der RED-Test ist bereits im Stage-Commit dieses Plans enthalten
(`website/src/lib/website-db-projects.test.ts`, Test `T002722: createProject writes to
public.customer_projects, not tickets.tickets`, siehe pg-mem-Schema-Ergaenzung
`public.customer_projects` / `public.customer_project_attachments` im selben File).

- [ ] **Failing-Test-Step (RED) — bereits committet, hier nur der Nachweis-Lauf:**

```bash
cd website && npx vitest run src/lib/website-db-projects.test.ts -t "T002722"
# expected: FAIL (rot — projects-db.ts schreibt vor Task 2 noch nach tickets.tickets)
```

- [ ] **GREEN nach Task 1+2:** derselbe Lauf muss danach gruen sein.

- [ ] **Bestehende "verified via raw SQL"-Tests umstellen** (drei Tests in derselben Datei,
      Zeilen ~334–374 vor diesem Plan): `SELECT ... FROM tickets.tickets WHERE id=$1` →
      `SELECT ... FROM public.customer_projects WHERE id=$1`. Diese Tests pruefen dieselbe
      Funktionalitaet, nur gegen die neue Zieltabelle — sie sind nicht redundant zum neuen
      T002722-Test (der prueft zusaetzlich explizit die Abwesenheit in `tickets.tickets`).

- [ ] **`task test:inventory`** nach den Test-Aenderungen ausfuehren, `test-inventory.json`
      mitcommitten (CI-Gate).

## Task 5 — Finale Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusaetzlich manuell (nicht Teil des CI-Gates, aber Teil der Definition of Done fuer diesen PR):

```bash
cd website && npx vitest run src/lib/website-db-projects.test.ts
```
