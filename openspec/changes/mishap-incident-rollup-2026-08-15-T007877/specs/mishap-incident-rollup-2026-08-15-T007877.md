---
title: "mishap-incident-rollup-2026-08-15-T007877 — Mishap-Bundle"
ticket_id: T007877
---

## ADDED Requirements

### Requirement: Auto-Merge rannte dem Code-Review-Gate davon — Review-Fixes verpassten den Merge

The rollup bundle SHALL address the mishap "Auto-Merge rannte dem Code-Review-Gate davon — Review-Fixes verpassten den Merge" (process, dev-flow-execute).

#### Scenario: Auto-Merge rannte dem Code-Review-Gate davon — Review-Fixes verpassten den Merge is covered by the bundle

- **GIVEN** a batch entry "Auto-Merge rannte dem Code-Review-Gate davon — Review-Fixes verpassten den Merge" (process, dev-flow-execute) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: finalize.sh Schritt 8 kennt kein --create-new für neue SSOT-Specs

The rollup bundle SHALL address the mishap "finalize.sh Schritt 8 kennt kein --create-new für neue SSOT-Specs" (process, devflow-post-merge-finalize.sh).

#### Scenario: finalize.sh Schritt 8 kennt kein --create-new für neue SSOT-Specs is covered by the bundle

- **GIVEN** a batch entry "finalize.sh Schritt 8 kennt kein --create-new für neue SSOT-Specs" (process, devflow-post-merge-finalize.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: 13 broken node_modules-Symlinks im Haupt-Checkout blockieren lokale Quality-Gates

The rollup bundle SHALL address the mishap "13 broken node_modules-Symlinks im Haupt-Checkout blockieren lokale Quality-Gates" (degraded, repo/node_modules).

#### Scenario: 13 broken node_modules-Symlinks im Haupt-Checkout blockieren lokale Quality-Gates is covered by the bundle

- **GIVEN** a batch entry "13 broken node_modules-Symlinks im Haupt-Checkout blockieren lokale Quality-Gates" (degraded, repo/node_modules) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Haupt-Checkout hängt auf abgeschlossenem Branch statt main (T007035 done, Branch nicht aufgeräumt)

The rollup bundle SHALL address the mishap "Haupt-Checkout hängt auf abgeschlossenem Branch statt main (T007035 done, Branch nicht aufgeräumt)" (drift, repo/main-checkout).

#### Scenario: Haupt-Checkout hängt auf abgeschlossenem Branch statt main (T007035 done, Branch nicht aufgeräumt) is covered by the bundle

- **GIVEN** a batch entry "Haupt-Checkout hängt auf abgeschlossenem Branch statt main (T007035 done, Branch nicht aufgeräumt)" (drift, repo/main-checkout) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: mcp-postgres-Gateway nicht erreichbar (curl-Probe 000) — M2-Fallback nötig

The rollup bundle SHALL address the mishap "mcp-postgres-Gateway nicht erreichbar (curl-Probe 000) — M2-Fallback nötig" (degraded, mcp-postgres-gateway).

#### Scenario: mcp-postgres-Gateway nicht erreichbar (curl-Probe 000) — M2-Fallback nötig is covered by the bundle

- **GIVEN** a batch entry "mcp-postgres-Gateway nicht erreichbar (curl-Probe 000) — M2-Fallback nötig" (degraded, mcp-postgres-gateway) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Repo-Reorg T006999 zog OpenSpec-Spec-Pfade nicht nach (website/src → components/website/src)

The rollup bundle SHALL address the mishap "Repo-Reorg T006999 zog OpenSpec-Spec-Pfade nicht nach (website/src → components/website/src)" (drift, openspec/specs).

#### Scenario: Repo-Reorg T006999 zog OpenSpec-Spec-Pfade nicht nach (website/src → components/website/src) is covered by the bundle

- **GIVEN** a batch entry "Repo-Reorg T006999 zog OpenSpec-Spec-Pfade nicht nach (website/src → components/website/src)" (drift, openspec/specs) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: cwd-Persistenz: Chore-Verify lief im falschen Worktree (Bash-cwd erbt zwischen Calls)

The rollup bundle SHALL address the mishap "cwd-Persistenz: Chore-Verify lief im falschen Worktree (Bash-cwd erbt zwischen Calls)" (degraded, skills/dev-flow-execute).

#### Scenario: cwd-Persistenz: Chore-Verify lief im falschen Worktree (Bash-cwd erbt zwischen Calls) is covered by the bundle

- **GIVEN** a batch entry "cwd-Persistenz: Chore-Verify lief im falschen Worktree (Bash-cwd erbt zwischen Calls)" (degraded, skills/dev-flow-execute) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Bonsai-Guard blockte seine eigene Löschung (Self-Referenz + absoluter hooksPath)

The rollup bundle SHALL address the mishap "Bonsai-Guard blockte seine eigene Löschung (Self-Referenz + absoluter hooksPath)" (degraded, githooks/pre-commit).

#### Scenario: Bonsai-Guard blockte seine eigene Löschung (Self-Referenz + absoluter hooksPath) is covered by the bundle

- **GIVEN** a batch entry "Bonsai-Guard blockte seine eigene Löschung (Self-Referenz + absoluter hooksPath)" (degraded, githooks/pre-commit) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Scope-Allowlist: veraltetes 'hooks' in commitlint.config.cjs führt Agenten in die Irre

The rollup bundle SHALL address the mishap "Scope-Allowlist: veraltetes 'hooks' in commitlint.config.cjs führt Agenten in die Irre" (drift, commitlint).

#### Scenario: Scope-Allowlist: veraltetes 'hooks' in commitlint.config.cjs führt Agenten in die Irre is covered by the bundle

- **GIVEN** a batch entry "Scope-Allowlist: veraltetes 'hooks' in commitlint.config.cjs führt Agenten in die Irre" (drift, commitlint) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: SID-Doppel-Claim: zweiter Branch-Claim derselben Session blockte Edit-Tools des Implementers

The rollup bundle SHALL address the mishap "SID-Doppel-Claim: zweiter Branch-Claim derselben Session blockte Edit-Tools des Implementers" (degraded, scripts/hooks/worktree-write-guard.sh).

#### Scenario: SID-Doppel-Claim: zweiter Branch-Claim derselben Session blockte Edit-Tools des Implementers is covered by the bundle

- **GIVEN** a batch entry "SID-Doppel-Claim: zweiter Branch-Claim derselben Session blockte Edit-Tools des Implementers" (degraded, scripts/hooks/worktree-write-guard.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap
