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
scripts/lib/application-pipeline-db.sh                                          (neu)
scripts/vda/apply/ingest.sh                                                     (neu)
scripts/vda/apply/import-bootstrap.sh                                           (neu)
tests/spec/application-pipeline/schema.bats                                     (neu)
tests/spec/application-pipeline/ingest-cli.bats                                 (neu)
tests/spec/application-pipeline/import-bootstrap.bats                          (neu)
tests/fixtures/application-pipeline/bootstrap/Anschreiben_TestCo_Test-Rolle.pdf  (neu, leere Fixture)
```

Budget: alle Dateien sind neu und nicht gebaselined. `.sh`-Limit laut
`docs/code-quality/gates.yaml` `s1.limits` ist 800 Zeilen — `ingest.sh`, `import-bootstrap.sh`
und die gemeinsame Lib bleiben mit dem unten skizzierten Umfang deutlich darunter (je ~80-120
Zeilen geschätzt). `.sql` ist in `s1.limits` nicht gelistet (kein Gate). `.bats`-Dateien sind
ebenfalls nicht limitiert.

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

Lege zuerst `scripts/lib/application-pipeline-db.sh` an mit einer Funktion
`app_pipeline_upsert_job <company> <role> <source_url> <raw_text> <requirements> <status>`, die
`INSERT ... ON CONFLICT (company, role_title) DO NOTHING RETURNING id` ausführt und bei leerem
Ergebnis `"DUPLICATE"` auf stdout zurückgibt statt eines rohen SQL-Fehlers — Task 2 (Ingest) UND
Task 3 (Bootstrap-Import) rufen dieselbe Funktion auf, damit die Dedup-Logik nicht doppelt
gepflegt wird.

Erstelle `scripts/vda/apply/ingest.sh` (Vorbild für psql-Helper-Aufruf:
[mcp-tool-guide](.claude/skills/references/mcp-tool-guide.md) §psql-Helper). Parst `--file <path>`,
extrahiert Company/Role/Requirements aus dem Text (einfache Heuristik: erste Zeile = Role @ Company,
Rest = raw_text/requirements), ruft `app_pipeline_upsert_job` auf und meldet bei `"DUPLICATE"`
explizit "Duplicate: <company>/<role> already ingested" auf stderr.

Run des BATS-Tests aus dem RED-Step muss jetzt GREEN sein.

## Task 3: Bootstrap-Import bestehender Bewerbungen (RED → GREEN)

Der Betreiber hat vor diesem Change bereits 5 reale Bewerbungen außerhalb der Plattform
vorbereitet und teils schon versendet (lokaler Ordner auf dem Arbeitsplatzrechner, nicht Teil
dieses Repos — Dateien: `Anschreiben_<Firma>_<Rolle>.pdf` + zugehörige Stellenausschreibungs-PDFs
+ `Bewerbungs-Mailtexte.md` mit Status/Datum je Bewerbung). Damit das System ab dem ersten Release
funktional nutzbar ist (nicht mit einer leeren Tabelle startet), braucht es einen einmaligen
Import-Pfad für genau diesen Altbestand.

**RED — Failing-Test-Step (erwartet FAIL):**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/application-pipeline/import-bootstrap.bats
# expected: FAIL (scripts/vda/apply/import-bootstrap.sh existiert noch nicht)
```

Test-Fixture `tests/fixtures/application-pipeline/bootstrap/Anschreiben_TestCo_Test-Rolle.pdf`
(leere Platzhalter-Datei — der Import liest nur den Dateinamen, nicht den PDF-Inhalt; **keine
echten/personenbezogenen Bewerbungsunterlagen im Repo**). Szenarien:
- `import-bootstrap.sh --dir <fixture-dir> --status applied --applied-at 2026-09-15` legt für
  `Anschreiben_TestCo_Test-Rolle.pdf` einen Job (`company=TestCo`, `role_title=Test-Rolle`,
  `status=applied`), einen Dossier-Eintrag (`kind=cover_letter`, `artifact_path=<absoluter
  Fixture-Pfad>`) und einen Timeline-Eintrag (`event_type=applied`, `created_at=2026-09-15`) an.
- Erneuter Lauf über dasselbe Verzeichnis legt **keinen** zweiten Job an (nutzt
  `app_pipeline_upsert_job` aus Task 2 — "DUPLICATE" wird als Info geloggt, kein Fehler).

**GREEN — Fix-Step:**

Erstelle `scripts/vda/apply/import-bootstrap.sh`. Parameter: `--dir <path>` (Pflicht, generisch —
**kein hartkodierter Pfad im Skript**), `--status <status>` (Default `found`), `--applied-at
<datum>` (optional, erzeugt zusätzlich einen Timeline-Event). Ablauf:
1. `find "$DIR" -maxdepth 1 -iname 'Anschreiben_*.pdf'` — Dateiname-Pattern
   `Anschreiben_<Firma>_<Rolle>.pdf` (Unterstriche trennen Firma/Rolle, Bindestriche innerhalb
   eines Feldes bleiben erhalten).
2. Je Treffer: `company`/`role` aus dem Dateinamen extrahieren, `app_pipeline_upsert_job` mit
   `raw_text="(Bootstrap-Import, Details siehe lokale Bewerbungsunterlagen)"` aufrufen.
3. Bei neuem Job (kein `"DUPLICATE"`): Dossier-Zeile mit `artifact_path=$(realpath "$file")`
   und `kind='cover_letter'` einfügen; ist `--applied-at` gesetzt, zusätzlich einen
   `applications.timeline`-Eintrag `event_type='applied'` mit diesem Datum.

Run des BATS-Tests aus dem RED-Step muss jetzt GREEN sein.

**Manueller Einmal-Lauf durch den Betreiber (kein CI-Schritt, kein Repo-Artefakt):** Nach GREEN
und Merge führt der Betreiber den Import einmalig gegen den echten lokalen Ordner aus — der Pfad
gehört **nicht** ins Repo, sondern in eine lokale Env-Variable:
```bash
export APPLICATION_BOOTSTRAP_DIR="<lokaler Pfad zum Bewerbungsordner>"
scripts/vda/apply/import-bootstrap.sh --dir "$APPLICATION_BOOTSTRAP_DIR" --status applied --applied-at 2026-09-15
```
Die 5 laut `Bewerbungs-Mailtexte.md` bereits verschickten Bewerbungen (Wolkenhof, ANG, evasys ×2,
ITK Harburg) landen damit als `status=applied` in `applications.jobs` statt als `found` — der
Cockpit-Funnel (Requirement 5, spätere Phase) zeigt danach den echten Stand statt einer leeren
Tabelle.

## Task 4: Finale Verifikation

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
