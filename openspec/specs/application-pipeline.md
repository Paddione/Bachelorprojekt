# application-pipeline

## Purpose

Bewerbungsprozess-Pipeline der Plattform: Stellenausschreibungen werden im Schema `applications.*` erfasst, gegen einen kuratierten Katalog realer Projekt-Evidenz abgeglichen und zu personalisierten Typst-Dossiers (Lebenslauf, Anschreiben) kompiliert. Der Funnel mit Status und Audit-Trail wird im internen Cockpit verwaltet.

## Requirements

### Requirement: Relational Data Model for Job Applications

The database SHALL provide a dedicated `applications` schema storing job postings, generated application dossiers, and interaction milestones in PostgreSQL.

#### Scenario: Database schema isolation and structure

- **GIVEN** the PostgreSQL database `website` on the platform cluster
- **WHEN** the `applications` migration is applied
- **THEN** tables `applications.jobs`, `applications.dossiers`, and `applications.timeline` exist with appropriate foreign keys, timestamps, and status check constraints.

#### Scenario: Status transitions obey permitted lifecycle stages

- **GIVEN** an existing job record in `applications.jobs`
- **WHEN** updating its lifecycle status
- **THEN** the status MUST be one of `found`, `drafting`, `applied`, `interviewing`, `offered`, `rejected`, or `withdrawn`.

---

### Requirement: CLI and Programmatic Job Ingestion

The platform SHALL provide a CLI ingestion utility (`scripts/vda/apply/ingest.sh`) and MCP tool interface capable of capturing job postings from raw text, Markdown, or web sources into `applications.jobs`.

#### Scenario: Ingest job posting via CLI from text file

- **GIVEN** a raw text file containing a job description
- **WHEN** invoking `scripts/vda/apply/ingest.sh --file <path>`
- **THEN** a new row is created in `applications.jobs` with title, company, requirements, and full text extracted.

#### Scenario: Duplicate detection on identical company and role

- **GIVEN** an existing job posting for Company X and Role Y
- **WHEN** ingesting the same posting URL or identical company and role title
- **THEN** the ingestion command warns of a duplicate and does not create an accidental duplicate record.

---

### Requirement: Automated Profile Matching against Platform Knowledge Graph

The system SHALL evaluate ingested job requirements against the candidate's structured skill-graph and platform project catalog to produce a match score and strategy recommendation.

#### Scenario: High-alignment match for Platform / DevOps position

- **GIVEN** a job posting requiring Kubernetes, CI/CD, and Linux platform engineering
- **WHEN** the matching routine evaluates the job against the platform capability inventory
- **THEN** it outputs a match score above 85% and recommends highlighting Fleet operations, k3s, and BATS quality gates.

#### Scenario: Strategy recommendation identifies core project evidence

- **GIVEN** a job posting emphasizing AI systems and LLM inference
- **WHEN** profile synthesis executes
- **THEN** the generated strategy recommendation explicitly references the FreeToken MoE integration, MCP ecosystem, and Software Factory autonomy.

---

### Requirement: Typst-Based Tailored Dossier Compilation

The system SHALL compile tailored PDF resumes and cover letters using Typst templates, dynamically prioritizing relevant platform projects and competencies.

#### Scenario: Headless compilation of tailored resume

- **GIVEN** a job record in `applications.jobs` and an active strategy profile
- **WHEN** triggering dossier generation via `scripts/vda/apply/render.sh --job-id <id>`
- **THEN** Typst compiles the tailored document into a production-grade PDF and registers the artifact path in `applications.dossiers`.

#### Scenario: Clean fail-safe when template parameters are incomplete

- **GIVEN** a job record missing key company or contact fields
- **WHEN** dossier compilation is initiated
- **THEN** the renderer alerts with a clear validation error without generating corrupt or placeholder-polluted PDFs.

---

### Requirement: Application Funnel and Audit Trail in Brett Cockpit

The Brett cockpit interface SHALL display an applications overview visualizing the status of all active job applications, next follow-up dates, and associated dossier artifacts.

#### Scenario: Viewing applications Kanban board

- **GIVEN** authenticated operator access to the Brett cockpit
- **WHEN** navigating to `/admin/applications`
- **THEN** active applications are rendered grouped by stage (`found`, `drafting`, `applied`, `interviewing`, `offered`) with quick access to view dossiers and add timeline events.

#### Scenario: Timeline event logging on interview feedback

- **GIVEN** an active application in the `interviewing` stage
- **WHEN** the operator logs an interview note or feedback
- **THEN** a structured entry is appended to `applications.timeline` preserving the timestamp, interviewer notes, and action items.

<!-- merged from change delta application-pipeline.md (797451330ee0) — Epic T900228, bei Archivierung #5732 nicht übernommen, nachgetragen T900337 -->

### Requirement: Deterministic Keyword-Based Match Scoring

The system SHALL compute a deterministic, reproducible match score (0-100) for a job posting by
reusing the evidence-catalog selection logic from dossier personalization, and persist the score
and selected evidence ids on the job record.

#### Scenario: Job with strong evidence-catalog overlap receives a high score

- **GIVEN** a job record whose requirements text matches several evidence-catalog keywords
- **WHEN** running `scripts/vda/apply/match.sh --job-id <id>`
- **THEN** `applications.jobs.match_score` is set above 70 and `match_evidence_ids` contains the
  matched catalog entry ids, ranked by keyword-hit count

#### Scenario: Job with no evidence-catalog overlap receives the default fallback score

- **GIVEN** a job record whose requirements text matches no evidence-catalog keyword
- **WHEN** running `scripts/vda/apply/match.sh --job-id <id>`
- **THEN** `applications.jobs.match_score` is set to the documented default (not null, not a
  crash) and `match_evidence_ids` contains the catalog's default-marked entries

<!-- merged from change delta application-pipeline.md (6f71f63b36fb) -->

### Requirement: Curated Project-Evidence Catalog for Dossier Personalization

The system SHALL provide a versionable catalog mapping platform project evidence (Fleet/k3s, Dev-Mesh, FreeToken MoE, Software Factory, BATS quality gates) to descriptive keywords, so dossier rendering can select the evidence most relevant to a given job posting.

#### Scenario: Evidence catalog selects relevant entries for a Platform/DevOps posting

- **GIVEN** a job record in `applications.jobs` with requirements mentioning Kubernetes and CI/CD
- **WHEN** dossier rendering resolves evidence for that job
- **THEN** the resolved evidence set includes the Fleet/k3s and BATS quality-gate catalog entries, ranked above unrelated entries

#### Scenario: Missing keyword match falls back to a default evidence set

- **GIVEN** a job record whose requirements text contains no keyword present in the evidence catalog
- **WHEN** dossier rendering resolves evidence for that job
- **THEN** a documented default evidence set is used instead of an empty selection, and the render does not fail

---

### Requirement: Visual Design Accent Themes for Typst Dossiers

The system SHALL support at least two distinct visual accent themes (color and typography) for Typst-rendered resumes and cover letters, selectable per render invocation, so generated dossiers carry a consistent, individual visual identity rather than a single generic template.

#### Scenario: Rendering with an explicit theme selection

- **GIVEN** a job record ready for dossier generation
- **WHEN** invoking `scripts/vda/apply/render.sh --job-id <id> --theme <theme-name>` with a valid theme name
- **THEN** the compiled PDF uses that theme's color and typography settings, and the theme name is recorded alongside the dossier artifact

#### Scenario: Invalid theme name is rejected before compilation

- **GIVEN** a job record ready for dossier generation
- **WHEN** invoking the renderer with a `--theme` value not present in the theme registry
- **THEN** the renderer exits with a clear validation error listing the available theme names, without producing a PDF

<!-- merged from change delta application-pipeline.md (f68991e1ce7e) -->

### Requirement: Cockpit Shows All Allowed Job Statuses

The cockpit Kanban board SHALL display columns for job statuses defined in the pipeline including `rejected`. Previously only 5 statuses were shown (found, drafting, applied, interviewing, offered); `rejected` and `withdrawn` were hidden.

Jobs with status `withdrawn` SHALL continue to be filtered out from the Kanban board to reduce clutter.

#### Scenario: Rejected jobs appear on Kanban board

- **GIVEN** there are jobs with `status = 'rejected'` in the database
- **WHEN** the user opens the cockpit Kanban board
- **THEN** a "Abgelehnt" column with the rejected CSS color is visible
- **THEN** the rejected cards show match score, dossier count, and source link

### Requirement: Job Detail Shows Raw Text and Requirements

The cockpit detail panel SHALL display the job's `raw_text` (original uploaded content) and `requirements` (structured job requirements) in separate collapsible sections.

- `raw_text` section: labeled "Quelltext", rendered with preserved line breaks
- `requirements` section: labeled "Anforderungen", rendered with preserved line breaks
- Sections are only shown if the respective field is non-empty

#### Scenario: Detail panel shows raw text and requirements

- **GIVEN** a job has non-empty `raw_text` and/or `requirements` fields
- **WHEN** the user clicks the job card to open the detail panel
- **THEN** sections for "Quelltext" and "Anforderungen" are rendered with the content
- **THEN** content is HTML-escaped to prevent XSS

### Requirement: Auto-Render Path Uses Configurable Directory

The cockpit status update handler SHALL look for the render script in a configurable directory.

**Configuration:**
- `APP_PIPELINE_SCRIPT_DIR` environment variable: absolute path to directory containing `scripts/vda/apply/render.sh`
- Fallback: derive from `process.cwd()` by finding first parent containing `scripts/vda/apply/render.sh` (recursive upward search, max 5 levels)
- If both fail, auto-render is skipped with a console warning (not an error)

#### Scenario: Auto-render works with env var

- **GIVEN** `APP_PIPELINE_SCRIPT_DIR` is set to `/opt/app/scripts`
- **WHEN** a job status changes to `drafting` or `applied`
- **THEN** the render script at `/opt/app/scripts/vda/apply/render.sh` is spawned
- **THEN** the response is not blocked while render runs in background

#### Scenario: Auto-render falls back gracefully

- **GIVEN** `APP_PIPELINE_SCRIPT_DIR` is not set
- **WHEN** the server is deployed from a path NOT containing `components/`
- **THEN** auto-render is skipped with a `console.warn` message
- **THEN** the status update response still succeeds

<!-- merged from change delta application-pipeline.md (09c8bd88951a) -->