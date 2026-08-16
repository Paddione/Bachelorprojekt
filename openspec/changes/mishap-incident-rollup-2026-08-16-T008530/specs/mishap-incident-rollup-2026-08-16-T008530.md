---
title: "mishap-incident-rollup-2026-08-16-T008530 — Mishap-Bundle"
ticket_id: T008530
---

## ADDED Requirements

### Requirement: Lokale Build-Verifikation fehlt im Worktree — Svelte-Syntaxfehler fallen erst in CI auf (2 CI-Runden T007957)

The rollup bundle SHALL address the mishap "Lokale Build-Verifikation fehlt im Worktree — Svelte-Syntaxfehler fallen erst in CI auf (2 CI-Runden T007957)" (degraded, website-worktrees/verifikation).

#### Scenario: Lokale Build-Verifikation fehlt im Worktree — Svelte-Syntaxfehler fallen erst in CI auf (2 CI-Runden T007957) is covered by the bundle

- **GIVEN** a batch entry "Lokale Build-Verifikation fehlt im Worktree — Svelte-Syntaxfehler fallen erst in CI auf (2 CI-Runden T007957)" (degraded, website-worktrees/verifikation) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: worktree-create.sh verweigert bei Haupt-Checkout auf Fremdbranch

The rollup bundle SHALL address the mishap "worktree-create.sh verweigert bei Haupt-Checkout auf Fremdbranch" (degraded, scripts/worktree-create.sh).

#### Scenario: worktree-create.sh verweigert bei Haupt-Checkout auf Fremdbranch is covered by the bundle

- **GIVEN** a batch entry "worktree-create.sh verweigert bei Haupt-Checkout auf Fremdbranch" (degraded, scripts/worktree-create.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Pre-Commit-Hook entstaged Dateien still — Commit unvollstaendig

The rollup bundle SHALL address the mishap "Pre-Commit-Hook entstaged Dateien still — Commit unvollstaendig" (suspicious, .githooks/pre-commit).

#### Scenario: Pre-Commit-Hook entstaged Dateien still — Commit unvollstaendig is covered by the bundle

- **GIVEN** a batch entry "Pre-Commit-Hook entstaged Dateien still — Commit unvollstaendig" (suspicious, .githooks/pre-commit) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Prozess: test:changed-Diagnose durch tail-Pipe erschwert

The rollup bundle SHALL address the mishap "Prozess: test:changed-Diagnose durch tail-Pipe erschwert" (process, skills/dev-flow-chore).

#### Scenario: Prozess: test:changed-Diagnose durch tail-Pipe erschwert is covered by the bundle

- **GIVEN** a batch entry "Prozess: test:changed-Diagnose durch tail-Pipe erschwert" (process, skills/dev-flow-chore) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: node_modules-Stand: js-yaml fehlt im geteilten node_modules (Worktree-Symlink) — toolset-registry/llm-proxy-Testfamilien lokal rot

The rollup bundle SHALL address the mishap "node_modules-Stand: js-yaml fehlt im geteilten node_modules (Worktree-Symlink) — toolset-registry/llm-proxy-Testfamilien lokal rot" (drift, repo/node_modules).

#### Scenario: node_modules-Stand: js-yaml fehlt im geteilten node_modules (Worktree-Symlink) — toolset-registry/llm-proxy-Testfamilien lokal rot is covered by the bundle

- **GIVEN** a batch entry "node_modules-Stand: js-yaml fehlt im geteilten node_modules (Worktree-Symlink) — toolset-registry/llm-proxy-Testfamilien lokal rot" (drift, repo/node_modules) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Auto-Merge-Workflow umgeht Review-Gate (2× Merge vor Reviewer-APPROVED)

The rollup bundle SHALL address the mishap "Auto-Merge-Workflow umgeht Review-Gate (2× Merge vor Reviewer-APPROVED)" (suspicious, ci/auto-merge-workflow).

#### Scenario: Auto-Merge-Workflow umgeht Review-Gate (2× Merge vor Reviewer-APPROVED) is covered by the bundle

- **GIVEN** a batch entry "Auto-Merge-Workflow umgeht Review-Gate (2× Merge vor Reviewer-APPROVED)" (suspicious, ci/auto-merge-workflow) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: devflow-ci-watch.sh meldet grün bei roten Checks (Snapshot-Blindheit, 2×)

The rollup bundle SHALL address the mishap "devflow-ci-watch.sh meldet grün bei roten Checks (Snapshot-Blindheit, 2×)" (degraded, scripts/devflow-ci-watch.sh).

#### Scenario: devflow-ci-watch.sh meldet grün bei roten Checks (Snapshot-Blindheit, 2×) is covered by the bundle

- **GIVEN** a batch entry "devflow-ci-watch.sh meldet grün bei roten Checks (Snapshot-Blindheit, 2×)" (degraded, scripts/devflow-ci-watch.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Watchdog re-stagt Tickets trotz branch-Claim und nach Merge (3× Status-Reset)

The rollup bundle SHALL address the mishap "Watchdog re-stagt Tickets trotz branch-Claim und nach Merge (3× Status-Reset)" (degraded, factory/watchdog).

#### Scenario: Watchdog re-stagt Tickets trotz branch-Claim und nach Merge (3× Status-Reset) is covered by the bundle

- **GIVEN** a batch entry "Watchdog re-stagt Tickets trotz branch-Claim und nach Merge (3× Status-Reset)" (degraded, factory/watchdog) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Vitest-CI-Gate grün ohne Testlauf („No test files found") maskierte Review-Befund

The rollup bundle SHALL address the mishap "Vitest-CI-Gate grün ohne Testlauf („No test files found") maskierte Review-Befund" (degraded, ci/vitest-job).

#### Scenario: Vitest-CI-Gate grün ohne Testlauf („No test files found") maskierte Review-Befund is covered by the bundle

- **GIVEN** a batch entry "Vitest-CI-Gate grün ohne Testlauf („No test files found") maskierte Review-Befund" (degraded, ci/vitest-job) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Unbekannter Akteur startete Rebase im E4-Worktree (rebase-merge-Dir vorgefunden)

The rollup bundle SHALL address the mishap "Unbekannter Akteur startete Rebase im E4-Worktree (rebase-merge-Dir vorgefunden)" (suspicious, worktrees/sdlc-leitstand-e4).

#### Scenario: Unbekannter Akteur startete Rebase im E4-Worktree (rebase-merge-Dir vorgefunden) is covered by the bundle

- **GIVEN** a batch entry "Unbekannter Akteur startete Rebase im E4-Worktree (rebase-merge-Dir vorgefunden)" (suspicious, worktrees/sdlc-leitstand-e4) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap
