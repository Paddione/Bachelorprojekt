---
title: Auto-Docs-Removal — Generator, Sites, Sweep
ticket_id: T900452
domains: [docs, cleanup]
status: active
---

# autodocs-removal — Implementation Plan

## File Structure

- `.github/workflows/build-docs.yml`, `scripts/docs.Dockerfile`, `scripts/build-docs.mjs`, `scripts/docs-gen/` (p1, DEL)
- `scripts/docs-gen/systembrett-html.mjs` → `scripts/systembrett-html.mjs` (p1, MOVE + Import-Rewire)
- `scripts/feature-promote.sh`, `scripts/lib/promote-phases.sh` (p1, docs-Zweige raus)
- `.githooks/pre-commit`, `.githooks/post-merge`, `scripts/index-repo.ts`, `.github/workflows/codeql.yml`, `scripts/build-graph.mjs`, `scripts/code-quality/scan.test.mjs` (p1, Ignore-Cleanup)
- `commitlint.config.cjs`, `scripts/worktree-create.sh`, `.gitignore`, `package.json` (p1, Scope/Kommentar/Ignore/Scripts)
- `k3d/docs.yaml`, `k3d/oauth2-proxy-docs.yaml`, `k3d/docs-content-built/` (p2, DEL), `k3d/kustomization.yaml`, `k3d/ingress.yaml`, `k3d/configmap-domains.yaml`, `k3d/website.yaml` (p2, Refs raus)
- 6× `environments/*.yaml` + `schema.yaml` (p2, DOCS-Keys raus), `k3d/vaultwarden-seed-job.yaml` (p2, Seed-Login raus)
- `Taskfile.yml` (p2, 4 Task-Dels + 3 Edits + envsubst), `scripts/datamodel/workflow-map.yaml` (p2, Header)
- `docs/brain/k4-brain-wiki.md`, `docs/DOCS-DESIGN-STANDARDS.md` (p2, DEL), `registry/tools.yaml` + Regen, `docs/bereitstellungsdetails.md`, `docs/systemtest-fragebogen.md`, `CLAUDE.md`, `build-website.yml`, `env.d.ts` (p2, Sweep)
- `tests/spec/autodocs-removal-guard.bats` (p-tests, neu) + 2 Guard-Löschungen + 6 Shrinks

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-generator.md | impl | .github/workflows/build-docs.yml, scripts/docs.Dockerfile, scripts/build-docs.mjs, scripts/docs-gen/systembrett-html.mjs, scripts/systembrett-html.mjs, scripts/systembrett-generate.mjs, scripts/feature-promote.sh, scripts/lib/promote-phases.sh, .githooks/pre-commit, .githooks/post-merge, scripts/index-repo.ts, .github/workflows/codeql.yml, scripts/build-graph.mjs, scripts/code-quality/scan.test.mjs, commitlint.config.cjs, scripts/worktree-create.sh, .gitignore, package.json, scripts/devflow-post-merge-deploy.sh | |
| p2 | tasks.d/p2-manifests-tasks-docs.md | impl | k3d/docs.yaml, k3d/oauth2-proxy-docs.yaml, k3d/docs-content-built/index.html, k3d/kustomization.yaml, k3d/ingress.yaml, k3d/configmap-domains.yaml, k3d/website.yaml, environments/mentolder.yaml, environments/korczewski.yaml, environments/fleet-mentolder.yaml, environments/fleet-korczewski.yaml, environments/staging.yaml, environments/dev.yaml, environments/schema.yaml, k3d/vaultwarden-seed-job.yaml, Taskfile.yml, scripts/datamodel/workflow-map.yaml, docs/brain/k4-brain-wiki.md, docs/DOCS-DESIGN-STANDARDS.md, docs/agent-guide/registry/tools.yaml, docs/agent-guide/20-werkzeuge.md, docs/bereitstellungsdetails.md, docs/systemtest-fragebogen.md, CLAUDE.md, .github/workflows/build-website.yml, components/website/src/env.d.ts | p1 |
| p-tests | tasks.d/p-tests.md | tests | tests/spec/autodocs-removal-guard.bats, tests/spec/ci-cd/docs-content-guards.bats, tests/e2e/specs/fa-13-docs.spec.ts, tests/e2e/playwright.config.ts, tests/spec/pre-commit-freshness.bats, tests/spec/devflow-selection-archive-hardening.bats, tests/unit/test-tasks-node-deps.bats, tests/spec/local-dev-mesh/no-k3d-context.bats, tests/unit/.coverage-allowlist | p1,p2 |

## Verify (final, wächst mit den Partials)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
