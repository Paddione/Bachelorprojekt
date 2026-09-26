## REMOVED Requirements

### Requirement: REQ-BRAIN-FOUNDATION-008 — Glob-Based SSOT Spec Coverage

The ingest manifest it constrains is deleted; spec recall is served by
K1 embeddings without any manifest.

## ADDED Requirements

### Requirement: Kein Ingest-Manifest mehr (REQ-BRAIN-FOUNDATION-009)

The repository SHALL NOT maintain a brain ingest manifest: no file
SHALL declare `ssot-specs` or other ingest source groups for a
cross-repo wiki pipeline.

#### Scenario: Manifest absence

- **GIVEN** the repository after K4 surgery
- **WHEN** the absence guard runs
- **THEN** `scripts/brain/ingest-sources.yaml` does not exist
- **AND** no script reads an `ssot-specs` group definition
