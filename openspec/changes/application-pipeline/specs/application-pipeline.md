## ADDED Requirements

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
