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

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-generator.md | impl | .github/workflows/build-docs.yml, scripts/docs.Dockerfile, scripts/build-docs.mjs, scripts/docs-gen/systembrett-html.mjs, scripts/systembrett-html.mjs, scripts/systembrett-generate.mjs, scripts/feature-promote.sh, scripts/lib/promote-phases.sh, .githooks/pre-commit, .githooks/post-merge, scripts/index-repo.ts, .github/workflows/codeql.yml, scripts/build-graph.mjs, scripts/code-quality/scan.test.mjs, commitlint.config.cjs, scripts/worktree-create.sh, .gitignore, package.json | |

## Verify (final, wächst mit den Partials)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
