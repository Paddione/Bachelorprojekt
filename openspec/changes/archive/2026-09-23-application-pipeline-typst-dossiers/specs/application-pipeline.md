## ADDED Requirements

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
