---
title: "G-DOC03: README-Index in Hauptverzeichnissen anlegen (1/5→5/5)"
ticket_id: T001297
domains: ["docs"]
status: plan_staged
---

# g-doc03-readme-index — Implementation Plan

## File Structure

| File | Action | Notes |
|------|--------|-------|
| `website/README.md` | Create | Human-facing entry point; points to CLAUDE.md + WEBSITE-STANDARDS.md |
| `scripts/README.md` | Create | Grouped overview of 164+ utility scripts |
| `tests/README.md` | Create | Test framework overview and runner.sh usage |
| `k3d/README.md` | Create | Base Kustomize manifests overview and deploy flow |

## Task 0: Baseline messen (RED)

- [ ] Measure-command ausführen:

```bash
c=0; for d in website brett scripts tests k3d; do ls "$d"/README* >/dev/null 2>&1 && c=$((c+1)); done; echo "$c/5"
```

expected: FAIL (aktueller Wert: 1/5 Hauptverzeichnisse mit README (nur brett/) — Ziel: 5/5 — website/, brett/, scripts/, tests/, k3d/)

## Task 1: `website/README.md` anlegen

- [ ] Datei `website/README.md` erstellen mit:
  - Zweck: Astro + Svelte Website, Multi-Brand (mentolder / korczewski)
  - Local dev quick-start: `pnpm install && pnpm dev` → http://localhost:4321
  - Dockerfile für Container-Build
  - Verweis auf `CLAUDE.md` (agent quick-reference) und `WEBSITE-STANDARDS.md` (vollständige Standards)
  - Hinweis auf Vitest-Tests unter `website/test/` und Playwright-E2E unter `tests/e2e/`

Inhalt:

```markdown
# website/

Astro + Svelte multi-brand website for the Workspace MVP platform.
Serves two brands at runtime via `BRAND` / `BRAND_ID` env var:
`mentolder` (mentolder.de) and `korczewski` (korczewski.de).

## Local dev

```bash
pnpm install
pnpm dev          # http://localhost:4321
```

Requires Postgres with the `bachelorprojekt` database, or set
`DATABASE_URL` pointing to a dev cluster via port-forward on 15432.

## Container build

```bash
docker build -t workspace-website .
```

## Tests

```bash
pnpm test         # Vitest unit tests
```

End-to-end tests live in `../tests/e2e/` and run via Playwright.

## Key references

- `CLAUDE.md` — agent quick-reference for content patterns and data-flow
- `WEBSITE-STANDARDS.md` — authoritative frontend standards (components, a11y, i18n)
- `astro.config.mjs` — build configuration and integrations
```

## Task 2: `scripts/README.md` anlegen

- [ ] Datei `scripts/README.md` erstellen mit:
  - Zweck: ~164 Bash-Utility-Scripts für Cluster-Ops, Env-Management, Agent-Koordination
  - Einstiegspunkt: `bash scripts/vda.sh oracle '<goal>'`
  - Gruppierte Übersicht wichtiger Scripts
  - Hinweis auf naming conventions

Inhalt:

```markdown
# scripts/

Bash utility scripts for the Workspace MVP platform (~164 files).

## Entry point

Use the VDA oracle to find and run the right task instead of calling scripts directly:

```bash
bash scripts/vda.sh oracle '<goal in plain English>'
# Example: bash scripts/vda.sh oracle 'deploy website mentolder'
```

## Key scripts by function

| Script | Purpose |
|--------|---------|
| `env-resolve.sh` | Source to export per-env config vars (never execute directly) |
| `env-generate.sh` | Generate plaintext secrets for an environment |
| `worktree-create.sh` | Create a git worktree for branch work |
| `agent-lock.sh` | File-based session claim/release for parallel agents |
| `agent-msg.sh` | Inter-session message broadcast |
| `backup-restore.sh` | Orchestrate DB + PVC backup/restore |
| `health-goals-check.sh` | Check repository health goals (G-* targets) |
| `plan-context.sh` | Inject active plan context into agent prompts |
| `vda.sh` | VDA oracle — resolve task commands via local LLM |

## Conventions

Scripts that are meant to be sourced (not executed) contain `return 1 2>/dev/null || exit 1`
at error paths. Never run `bash scripts/env-resolve.sh` directly — always `source` it.
```

## Task 3: `tests/README.md` anlegen

- [ ] Datei `tests/README.md` erstellen mit:
  - Zweck: Test-Framework (BATS unit, integration, e2e Playwright, manual, factory-eval)
  - Verzeichnis-Layout
  - `runner.sh` Nutzung
  - CI-Hinweis

Inhalt:

```markdown
# tests/

Test framework for the Workspace MVP platform. Combines BATS shell tests,
integration checks, Playwright end-to-end tests, and factory eval scripts.

## Directory layout

| Directory | Content |
|-----------|---------|
| `spec/` | BATS tests per OpenSpec SSOT spec (one `.bats` per `openspec/specs/*.md`) |
| `unit/` | BATS unit tests for cross-cutting concerns |
| `integration/` | Service integration tests (HTTP, SSO, DB) |
| `e2e/` | Playwright browser tests against live environments |
| `manual/` | Manual test checklists (not automated) |
| `factory-eval/` | Software Factory quality-gate eval scripts |
| `fixtures/` | Shared test fixtures and seed data |
| `lib/` | Shared BATS helper functions |

## Running tests

```bash
# Full local tier (requires k3d cluster running)
./tests/runner.sh local

# Specific test IDs
./tests/runner.sh local FA-01 SA-03

# Full prod tier
./tests/runner.sh prod

# Regenerate Markdown report
./tests/runner.sh report
```

Via task oracle:

```bash
bash scripts/vda.sh oracle 'run all offline tests'
```

## CI

GitHub Actions (`ci.yml`) runs `task test:all` on every PR.
New BATS entries belong in `tests/spec/<spec-slug>.bats`.
```

## Task 4: `k3d/README.md` anlegen

- [ ] Datei `k3d/README.md` erstellen mit:
  - Zweck: Base Kustomize-Manifeste für alle Services im `workspace` Namespace
  - Wichtigste Dateien
  - Deploy-Flow
  - Sub-Verzeichnisse

Inhalt:

```markdown
# k3d/

Base Kustomize manifests for all Workspace MVP services.
This directory is the single Kustomize base — production overlays
in `prod-fleet/<brand>/` extend it; never apply base or `prod/` directly.

## Key files

| File | Purpose |
|------|---------|
| `kustomization.yaml` | Root kustomization — lists all resources |
| `configmap-domains.yaml` | Centralised hostname definitions (edit here, not in service YAMLs) |
| `secrets.yaml` | Dev-only placeholder secrets (stripped by prod `$patch: delete`) |
| `ingress.yaml` | Traefik IngressRoutes for all services |
| `website.yaml` | Website Deployment + Service |
| `brett.yaml` | Systembrett Node.js Deployment |
| `livekit.yaml` | LiveKit server (hostNetwork, pinned to pk-hetzner-4) |
| `llm-gpu.yaml` | LLM gateway Services pointing to GPU host |

## Sub-directories

| Directory | Purpose |
|-----------|---------|
| `coturn-stack/` | CoTURN TURN server (deployed separately via `task workspace:office:deploy`) |
| `dev-cluster/` | k3d local cluster setup resources |
| `dev-stack/` | Dev-only service additions |
| `docs-content-built/` | Pre-built HTML for the Docs service (do not edit manually) |
| `monitoring/` | Prometheus + Grafana manifests |

## Deployment

```bash
# Deploy to dev (k3d)
task workspace:deploy

# Deploy to production (fleet cluster)
task workspace:deploy ENV=mentolder
task workspace:deploy ENV=korczewski
```

Validate manifests before committing:

```bash
task workspace:validate
```
```

## Task 5 (Verify): Quality Gates

- [ ] Measure-command erneut ausführen und 5/5 bestätigen:

```bash
c=0; for d in website brett scripts tests k3d; do ls "$d"/README* >/dev/null 2>&1 && c=$((c+1)); done; echo "$c/5"
```

- [ ] `bash scripts/health-goals-check.sh --only=G-DOC03` → Ziel-Status grün
- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
