---
title: "mishap-incident-rollup-2026-08-22-T013910 — Mishap-Bundle"
ticket_id: T013910
---

## ADDED Requirements

### Requirement: Factory-PR committet eigenes openspec-status.json nicht — BATS-Freshness-Gate rot (PR #5020, T013303)

The rollup bundle SHALL address the mishap "Factory-PR committet eigenes openspec-status.json nicht — BATS-Freshness-Gate rot (PR #5020, T013303)" (degraded, factory/executor).

#### Scenario: Factory-PR committet eigenes openspec-status.json nicht — BATS-Freshness-Gate rot (PR #5020, T013303) is covered by the bundle

- **GIVEN** a batch entry "Factory-PR committet eigenes openspec-status.json nicht — BATS-Freshness-Gate rot (PR #5020, T013303)" (degraded, factory/executor) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: merge=ours-Phantomkonflikt (DIRTY) unterdrückt auch synchronize-Re-Trigger — leerer Re-Trigger-Commit wirkungslos (PRs #5020/#5021)

The rollup bundle SHALL address the mishap "merge=ours-Phantomkonflikt (DIRTY) unterdrückt auch synchronize-Re-Trigger — leerer Re-Trigger-Commit wirkungslos (PRs #5020/#5021)" (degraded, ci/github-workflows).

#### Scenario: merge=ours-Phantomkonflikt (DIRTY) unterdrückt auch synchronize-Re-Trigger — leerer Re-Trigger-Commit wirkungslos (PRs #5020/#5021) is covered by the bundle

- **GIVEN** a batch entry "merge=ours-Phantomkonflikt (DIRTY) unterdrückt auch synchronize-Re-Trigger — leerer Re-Trigger-Commit wirkungslos (PRs #5020/#5021)" (degraded, ci/github-workflows) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: SCS-Reindex-Warnungen für ~30 Dateien bei Commits — Embed-Dienst :8081 transient nicht erreichbar

The rollup bundle SHALL address the mishap "SCS-Reindex-Warnungen für ~30 Dateien bei Commits — Embed-Dienst :8081 transient nicht erreichbar" (suspicious, scripts/index-repo.ts).

#### Scenario: SCS-Reindex-Warnungen für ~30 Dateien bei Commits — Embed-Dienst :8081 transient nicht erreichbar is covered by the bundle

- **GIVEN** a batch entry "SCS-Reindex-Warnungen für ~30 Dateien bei Commits — Embed-Dienst :8081 transient nicht erreichbar" (suspicious, scripts/index-repo.ts) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: git-worktree-health.sh objects: transienter fsck-Fehler bei Erstlauf, Zweitlauf sauber

The rollup bundle SHALL address the mishap "git-worktree-health.sh objects: transienter fsck-Fehler bei Erstlauf, Zweitlauf sauber" (degraded, scripts/git-worktree-health.sh).

#### Scenario: git-worktree-health.sh objects: transienter fsck-Fehler bei Erstlauf, Zweitlauf sauber is covered by the bundle

- **GIVEN** a batch entry "git-worktree-health.sh objects: transienter fsck-Fehler bei Erstlauf, Zweitlauf sauber" (degraded, scripts/git-worktree-health.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Factory-Tick-Vorcheck (flock-Probe) und factory_status tick_running widersprechen sich

The rollup bundle SHALL address the mishap "Factory-Tick-Vorcheck (flock-Probe) und factory_status tick_running widersprechen sich" (suspicious, skills/repo-hygiene §1).

#### Scenario: Factory-Tick-Vorcheck (flock-Probe) und factory_status tick_running widersprechen sich is covered by the bundle

- **GIVEN** a batch entry "Factory-Tick-Vorcheck (flock-Probe) und factory_status tick_running widersprechen sich" (suspicious, skills/repo-hygiene §1) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Hygiene-Lauf: Clean-Check-Exitcodes zunächst via Pipe auf tail gemessen

The rollup bundle SHALL address the mishap "Hygiene-Lauf: Clean-Check-Exitcodes zunächst via Pipe auf tail gemessen" (process, skills/repo-hygiene §1).

#### Scenario: Hygiene-Lauf: Clean-Check-Exitcodes zunächst via Pipe auf tail gemessen is covered by the bundle

- **GIVEN** a batch entry "Hygiene-Lauf: Clean-Check-Exitcodes zunächst via Pipe auf tail gemessen" (process, skills/repo-hygiene §1) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Merge=Closure nicht ausgeloest: T013843 blieb nach gemergtem PR #5034 auf triage

The rollup bundle SHALL address the mishap "Merge=Closure nicht ausgeloest: T013843 blieb nach gemergtem PR #5034 auf triage" (degraded, factory/post-merge-closure).

#### Scenario: Merge=Closure nicht ausgeloest: T013843 blieb nach gemergtem PR #5034 auf triage is covered by the bundle

- **GIVEN** a batch entry "Merge=Closure nicht ausgeloest: T013843 blieb nach gemergtem PR #5034 auf triage" (degraded, factory/post-merge-closure) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Subagent-Dispatch-Kette komplett ausgefallen (Cloud gecancelt, qwen38 locked)

The rollup bundle SHALL address the mishap "Subagent-Dispatch-Kette komplett ausgefallen (Cloud gecancelt, qwen38 locked)" (degraded, agents/dispatch).

#### Scenario: Subagent-Dispatch-Kette komplett ausgefallen (Cloud gecancelt, qwen38 locked) is covered by the bundle

- **GIVEN** a batch entry "Subagent-Dispatch-Kette komplett ausgefallen (Cloud gecancelt, qwen38 locked)" (degraded, agents/dispatch) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: BATS-Test finalize-hardening.bats nutzt fragilen awk-Wort-Anker ("branch-reaper")

The rollup bundle SHALL address the mishap "BATS-Test finalize-hardening.bats nutzt fragilen awk-Wort-Anker ("branch-reaper")" (suspicious, tests/spec/agent-skills).

#### Scenario: BATS-Test finalize-hardening.bats nutzt fragilen awk-Wort-Anker ("branch-reaper") is covered by the bundle

- **GIVEN** a batch entry "BATS-Test finalize-hardening.bats nutzt fragilen awk-Wort-Anker ("branch-reaper")" (suspicious, tests/spec/agent-skills) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: SCS-Incremental-Reindex schlägt fehl (WARN beim Commit, embed :8081)

The rollup bundle SHALL address the mishap "SCS-Incremental-Reindex schlägt fehl (WARN beim Commit, embed :8081)" (degraded, repo/hooks).

#### Scenario: SCS-Incremental-Reindex schlägt fehl (WARN beim Commit, embed :8081) is covered by the bundle

- **GIVEN** a batch entry "SCS-Incremental-Reindex schlägt fehl (WARN beim Commit, embed :8081)" (degraded, repo/hooks) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: llm_proxy_request_log verliert erfolgreiches Dispatch (Blind Spot bei Incident-Analyse)

The rollup bundle SHALL address the mishap "llm_proxy_request_log verliert erfolgreiches Dispatch (Blind Spot bei Incident-Analyse)" (suspicious, llm-proxy/request-log).

#### Scenario: llm_proxy_request_log verliert erfolgreiches Dispatch (Blind Spot bei Incident-Analyse) is covered by the bundle

- **GIVEN** a batch entry "llm_proxy_request_log verliert erfolgreiches Dispatch (Blind Spot bei Incident-Analyse)" (suspicious, llm-proxy/request-log) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap
