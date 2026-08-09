---
ticket_id: T002664
plan_ref: openspec/changes/main-checkout-freshness-cleanup-T002664/tasks.md
status: active
date: 2026-08-09
---

# main-checkout-freshness-cleanup-T002664 — Design Spec

## Context & Problem Statement

Nach `git pull --ff-only` auf `main` lief der `.githooks/post-merge`-Hook und führte `task freshness:regenerate` aus.
Durch ungetrackte Strays (`tests/spec/ci-cd/freshness-paths-exist.bats`, `tests/spec/health-goals/goals-data-sdlc-target.bats`) und Unsloth-Cache-Build-Artefakte wurden `website/src/data/test-inventory.json` und `docs/code-quality/repo-index.json` dirty regeneriert.
Da `.githooks/post-merge` diese Dateien nicht auf `HEAD` zurücksetzte, blieb der `main`-Checkout dirty und verhinderte nachfolgende `git pull --rebase`-Befehle.

## Proposed Changes

1. `scripts/build-test-inventory.sh`: Ersetzung der direkten `find`-Abfrage durch Git-ls-files-basierte Discovery (`git ls-files` + `git ls-files --others --exclude-standard`), damit `.gitignore`-Einträge eingehalten werden.
2. `.githooks/post-merge`: Wiederherstellen aller generierten Freshness-Dateien (`website/src/data/test-inventory.json`, `docs/code-quality/repo-index.json`, `docs/code-quality/loc-budget.json` etc.) auf `HEAD` nach dem `freshness:regenerate`-Lauf.

## Verification Plan

### Automated Tests
- `tests/spec/ci-cd/test-inventory-coverage.bats`: Test für `.gitignore`-Einhaltung in `build-test-inventory.sh` und Wiederherstellung von Freshness-Dateien in `.githooks/post-merge`.

### Manual / CI Verification
- `task test:changed`
- `task freshness:regenerate`
- `task freshness:check`
