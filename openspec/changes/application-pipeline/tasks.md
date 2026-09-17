---
title: "application-pipeline — Implementation Plan (Phase 1: Schema & Ingest)"
ticket_id: T900228
domains: [database, scripts]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# application-pipeline — Implementation Plan

_Ticket: T900228_

Scope dieses Plans ist **Phase 1** des EPICs (Requirement "Relational Data Model for Job
Applications" + "CLI and Programmatic Job Ingestion" aus
`openspec/changes/application-pipeline/specs/application-pipeline.md`). Matching, Typst-Dossiers
und Brett-Cockpit-Integration (Requirements 3-5) sind spätere Phasen mit eigenem Plan.

## File Structure

```
components/website/src/db/migrations/20260917_application_pipeline_schema.sql   (neu)
scripts/vda/apply/ingest.sh                                                     (neu)
tests/spec/application-pipeline/schema.bats                                     (neu)
tests/spec/application-pipeline/ingest-cli.bats                                 (neu)
```

Budget: alle vier Dateien sind neu und nicht gebaselined. `.sh`-Limit laut
`docs/code-quality/gates.yaml` `s1.limits` ist 800 Zeilen — `ingest.sh` bleibt mit dem unten
skizzierten Umfang deutlich darunter (~120 Zeilen geschätzt). `.sql` ist in `s1.limits` nicht
gelistet (kein Gate). `.bats`-Dateien sind ebenfalls nicht limitiert.

## Task 1: Schema-Migration `applications.*` (RED → GREEN)

**RED — Failing-Test-Step (erwartet FAIL):**

Lege `tests/spec/application-pipeline/schema.bats` an, die per `psql` prüft, dass die Tabellen
`applications.jobs`, `applications.dossiers`, `applications.timeline` inklusive Status-Check-
Constraint existieren. Guard für fehlendes `psql`-Binary:
`command -v psql >/dev/null 2>&1 || skip "psql binary not installed"`.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/application-pipeline/schema.bats
# expected: FAIL (Migration existiert noch nicht, Schema applications fehlt)
```

**GREEN — Fix-Step:**

Erstelle `components/website/src/db/migrations/20260917_application_pipeline_schema.sql` (Vorbild:
`components/website/src/db/migrations/20260821_add_missing_fk_indexes_and_brand_checks.sql` für
Naming/Idempotenz-Stil):

```sql
CREATE SCHEMA IF NOT EXISTS applications;

CREATE TABLE IF NOT EXISTS applications.jobs (
  id            SERIAL PRIMARY KEY,
  company       TEXT NOT NULL,
  role_title    TEXT NOT NULL,
  source_url    TEXT,
  raw_text      TEXT NOT NULL,
  requirements  TEXT,
  status        TEXT NOT NULL DEFAULT 'found'
                CHECK (status IN ('found','drafting','applied','interviewing','offered','rejected','withdrawn')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company, role_title)
);

CREATE TABLE IF NOT EXISTS applications.dossiers (
  id            SERIAL PRIMARY KEY,
  job_id        INT NOT NULL REFERENCES applications.jobs(id) ON DELETE CASCADE,
  artifact_path TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('resume','cover_letter')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS applications.timeline (
  id            SERIAL PRIMARY KEY,
  job_id        INT NOT NULL REFERENCES applications.jobs(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Run des BATS-Tests aus dem RED-Step muss jetzt GREEN sein.

## Task 2: CLI-Ingest `scripts/vda/apply/ingest.sh` (RED → GREEN)

**RED — Failing-Test-Step (erwartet FAIL):**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/application-pipeline/ingest-cli.bats
# expected: FAIL (scripts/vda/apply/ingest.sh existiert noch nicht)
```

Die Test-Datei deckt zwei Szenarien aus der Spec ab:
- Ingest einer Textdatei via `--file <path>` erzeugt eine Zeile in `applications.jobs`
  (Company/Role/Requirements extrahiert).
- Erneutes Ingest derselben Company+Role gibt eine Warnung aus und legt **keinen** Duplikat-
  Datensatz an (`UNIQUE (company, role_title)`-Constraint aus Task 1 greift, Script muss den
  Konflikt sauber abfangen statt mit ungehandeltem SQL-Error abzubrechen).

**GREEN — Fix-Step:**

Erstelle `scripts/vda/apply/ingest.sh` (Vorbild für psql-Helper-Aufruf:
[mcp-tool-guide](.claude/skills/references/mcp-tool-guide.md) §psql-Helper). Parst `--file <path>`,
extrahiert Company/Role/Requirements aus dem Text (einfache Heuristik: erste Zeile = Role @ Company,
Rest = raw_text/requirements), führt `INSERT ... ON CONFLICT (company, role_title) DO NOTHING
RETURNING id` aus und meldet bei fehlendem `RETURNING`-Ergebnis explizit "Duplicate: <company>/<role>
already ingested" auf stderr statt eines rohen SQL-Fehlers.

Run des BATS-Tests aus dem RED-Step muss jetzt GREEN sein.

## Task 3: Finale Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich, weil neue Test-Dateien angelegt wurden:

```bash
task test:inventory   # components/website/src/data/test-inventory.json committen
```

<!-- vitest: kein neuer Test nötig, weil dieser Plan ausschließlich Bash-CLI, SQL-Migration und BATS-Tests umfasst, keine Dateien unter components/website/src/lib/** oder .../pages/api/** -->
