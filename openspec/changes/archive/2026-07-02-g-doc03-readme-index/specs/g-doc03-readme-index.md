# g-doc03-readme-index

## Purpose

Ensure every primary top-level directory in the Workspace MVP repository contains a README.md that serves as a human-readable entry point. This supports contributor onboarding and Bachelorarbeit reproducibility by making the purpose, key files, and first commands of each directory immediately discoverable without reading tool-facing agent instructions.

## ADDED Requirements

### Requirement: The measure command `c=0; for d in website brett scripts tes

The system SHALL the measure command `c=0; for d in website brett scripts tests k3d; do ls "$d"/README* >/dev/null 2>&1 && c=$((c+1)); done; echo "$c/5"` runs from the repository root without error and produces a numeric result comparable against the target.
- REQ-2: Each README covers at minimum: directory purpose, key files or sub-directories, and the primary command a new contributor would run first.
- REQ-3: `website/README.md` references `CLAUDE.md` and `WEBSITE-STANDARDS.md` rather than duplicating their content.
- REQ-4: `scripts/README.md` documents the VDA oracle (`bash scripts/vda.sh oracle`) as the preferred task-discovery entry point.
- REQ-5: `tests/README.md` documents the `runner.sh` interface and the directory layout of test categories.
- REQ-6: `k3d/README.md` documents the role of the base Kustomize directory and the correct deploy commands.
- REQ-7: No existing file is modified; all changes are additive new files.

## Acceptance Criteria

- THEN the measure command returns `5/5`
- THEN `bash scripts/health-goals-check.sh --only=G-DOC03` exits 0 and reports the goal as green
- THEN `git ls-files website/README.md scripts/README.md tests/README.md k3d/README.md` lists all four files as tracked
- THEN each README contains fewer than 60 lines (concise entry point, not a full specification)
- THEN `task test:changed` passes with no failures attributable to the new files
- THEN `task freshness:check` passes, confirming generated artifacts are up to date
