---
title: "mishap-incident-rollup-2026-08-15-T006843 — Mishap-Bundle"
ticket_id: T006843
---

## ADDED Requirements

### Requirement: Plan-Subagenten schreiben invalide Commit-Scopes (llm statt ops) — Gates-Referenz kennt Allowlist nicht

The rollup bundle SHALL address the mishap "Plan-Subagenten schreiben invalide Commit-Scopes (llm statt ops) — Gates-Referenz kennt Allowlist nicht" (process, plan-quality-gates).

#### Scenario: Plan-Subagenten schreiben invalide Commit-Scopes (llm statt ops) — Gates-Referenz kennt Allowlist nicht is covered by the bundle

- **GIVEN** a batch entry "Plan-Subagenten schreiben invalide Commit-Scopes (llm statt ops) — Gates-Referenz kennt Allowlist nicht" (process, plan-quality-gates) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: devflow-post-merge-finalize hinterlässt uncommitteten status-Flip im geteilten Hauptcheckout

The rollup bundle SHALL address the mishap "devflow-post-merge-finalize hinterlässt uncommitteten status-Flip im geteilten Hauptcheckout" (suspicious, scripts/devflow-post-merge-finalize.sh).

#### Scenario: devflow-post-merge-finalize hinterlässt uncommitteten status-Flip im geteilten Hauptcheckout is covered by the bundle

- **GIVEN** a batch entry "devflow-post-merge-finalize hinterlässt uncommitteten status-Flip im geteilten Hauptcheckout" (suspicious, scripts/devflow-post-merge-finalize.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: mcp-postgres-Readonly-Pfad down: mcp-postgres-local + k3d-postgres-forward seit 06:46 CEST inaktiv

The rollup bundle SHALL address the mishap "mcp-postgres-Readonly-Pfad down: mcp-postgres-local + k3d-postgres-forward seit 06:46 CEST inaktiv" (degraded, scripts/mcp-gateway).

#### Scenario: mcp-postgres-Readonly-Pfad down: mcp-postgres-local + k3d-postgres-forward seit 06:46 CEST inaktiv is covered by the bundle

- **GIVEN** a batch entry "mcp-postgres-Readonly-Pfad down: mcp-postgres-local + k3d-postgres-forward seit 06:46 CEST inaktiv" (degraded, scripts/mcp-gateway) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: MCP-Gateway-Watchdog blind: probe.sh failt auf allen 4 Ports inkl. funktionierendem 18080 + ExecStartPre-Quoting-Bug

The rollup bundle SHALL address the mishap "MCP-Gateway-Watchdog blind: probe.sh failt auf allen 4 Ports inkl. funktionierendem 18080 + ExecStartPre-Quoting-Bug" (suspicious, scripts/mcp-gateway).

#### Scenario: MCP-Gateway-Watchdog blind: probe.sh failt auf allen 4 Ports inkl. funktionierendem 18080 + ExecStartPre-Quoting-Bug is covered by the bundle

- **GIVEN** a batch entry "MCP-Gateway-Watchdog blind: probe.sh failt auf allen 4 Ports inkl. funktionierendem 18080 + ExecStartPre-Quoting-Bug" (suspicious, scripts/mcp-gateway) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: git-worktree-health.sh objects erzeugt False-Befund während laufendem Factory-Tick (wechselnde missing-tree-Sets)

The rollup bundle SHALL address the mishap "git-worktree-health.sh objects erzeugt False-Befund während laufendem Factory-Tick (wechselnde missing-tree-Sets)" (suspicious, scripts/git-worktree-health.sh).

#### Scenario: git-worktree-health.sh objects erzeugt False-Befund während laufendem Factory-Tick (wechselnde missing-tree-Sets) is covered by the bundle

- **GIVEN** a batch entry "git-worktree-health.sh objects erzeugt False-Befund während laufendem Factory-Tick (wechselnde missing-tree-Sets)" (suspicious, scripts/git-worktree-health.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: freshness-regen.yml lässt überholte PRs mit aktivem Auto-Merge dauerhaft offen

The rollup bundle SHALL address the mishap "freshness-regen.yml lässt überholte PRs mit aktivem Auto-Merge dauerhaft offen" (drift, .github/workflows/freshness-regen.yml).

#### Scenario: freshness-regen.yml lässt überholte PRs mit aktivem Auto-Merge dauerhaft offen is covered by the bundle

- **GIVEN** a batch entry "freshness-regen.yml lässt überholte PRs mit aktivem Auto-Merge dauerhaft offen" (drift, .github/workflows/freshness-regen.yml) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Archiv-PR #4607 rast gegen nachfolgende Archive und steht im SSOT-Spec-Konflikt

The rollup bundle SHALL address the mishap "Archiv-PR #4607 rast gegen nachfolgende Archive und steht im SSOT-Spec-Konflikt" (suspicious, plan-archive).

#### Scenario: Archiv-PR #4607 rast gegen nachfolgende Archive und steht im SSOT-Spec-Konflikt is covered by the bundle

- **GIVEN** a batch entry "Archiv-PR #4607 rast gegen nachfolgende Archive und steht im SSOT-Spec-Konflikt" (suspicious, plan-archive) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Worktree T006842 (Ticket done/shipped) trägt uncommittete Löschungen — 2 Deliverables ungemergt

The rollup bundle SHALL address the mishap "Worktree T006842 (Ticket done/shipped) trägt uncommittete Löschungen — 2 Deliverables ungemergt" (suspicious, repo/worktrees).

#### Scenario: Worktree T006842 (Ticket done/shipped) trägt uncommittete Löschungen — 2 Deliverables ungemergt is covered by the bundle

- **GIVEN** a batch entry "Worktree T006842 (Ticket done/shipped) trägt uncommittete Löschungen — 2 Deliverables ungemergt" (suspicious, repo/worktrees) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Reaper-KEEP bei gemergten Branches ist Drift-Artefakt — Allowlist deckt specs/scripts/tests nicht ab

The rollup bundle SHALL address the mishap "Reaper-KEEP bei gemergten Branches ist Drift-Artefakt — Allowlist deckt specs/scripts/tests nicht ab" (drift, scripts/branch-reaper).

#### Scenario: Reaper-KEEP bei gemergten Branches ist Drift-Artefakt — Allowlist deckt specs/scripts/tests nicht ab is covered by the bundle

- **GIVEN** a batch entry "Reaper-KEEP bei gemergten Branches ist Drift-Artefakt — Allowlist deckt specs/scripts/tests nicht ab" (drift, scripts/branch-reaper) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: npm --package-lock-only schreibt node_modules/.package-lock.json durch Worktree-Symlink

The rollup bundle SHALL address the mishap "npm --package-lock-only schreibt node_modules/.package-lock.json durch Worktree-Symlink" (drift, worktree/npm).

#### Scenario: npm --package-lock-only schreibt node_modules/.package-lock.json durch Worktree-Symlink is covered by the bundle

- **GIVEN** a batch entry "npm --package-lock-only schreibt node_modules/.package-lock.json durch Worktree-Symlink" (drift, worktree/npm) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap
