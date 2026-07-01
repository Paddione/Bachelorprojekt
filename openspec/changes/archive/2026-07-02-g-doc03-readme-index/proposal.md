# Proposal: g-doc03-readme-index

_Ticket: T001297_

## Why

Four of the five primary top-level directories (`website/`, `scripts/`, `tests/`, `k3d/`) have no README file. Any contributor — or a thesis examiner reproducing the platform — who opens one of these directories sees no entry point, no explanation of purpose, and no guidance on which files matter. The only exception is `brett/`, which has a concise README that already serves as a model.

Without these entry-point documents, onboarding requires reading scattered CLAUDE.md agent instructions (which are tool-facing, not human-facing) or diving straight into 164+ shell scripts without context. For the Bachelorarbeit this creates a reproducibility gap: the thesis text describes the platform but the repository itself does not guide a reader from directory listing to first successful command.

## What

Four new README.md files are written, one per missing directory:

- `website/README.md` — brief purpose statement, local dev quick-start (`pnpm dev`), Dockerfile note, pointer to `CLAUDE.md` and `WEBSITE-STANDARDS.md` for full standards.
- `scripts/README.md` — purpose (utility scripts for cluster ops, env management, agent coordination), key scripts grouped by function (env resolution, worktree/lock, backup-restore, health checks), usage pattern via `bash scripts/vda.sh oracle`.
- `tests/README.md` — purpose (BATS unit tests, integration, e2e, manual, factory-eval), directory layout, how to invoke `runner.sh`, CI integration note.
- `k3d/README.md` — purpose (base Kustomize manifests for all services), key files (`kustomization.yaml`, `configmap-domains.yaml`, service YAMLs), deployment flow (`task workspace:deploy`), note on sub-directories (`dev-cluster/`, `dev-stack/`, `coturn-stack/`).

Each file stays within the 20–40 line target described in the goal. No existing file is modified; this is additive only.

## Impact

**New files (4):**
- `website/README.md`
- `scripts/README.md`
- `tests/README.md`
- `k3d/README.md`

**Modified files:** none.

**Risk:** minimal — pure documentation additions. No manifests, no code, no CI configuration changes.

**Out of scope:** updating the root `README.md` (not a stated target), writing READMEs for sub-directories (e.g. `k3d/coturn-stack/`), and translating existing CLAUDE.md agent instructions.
