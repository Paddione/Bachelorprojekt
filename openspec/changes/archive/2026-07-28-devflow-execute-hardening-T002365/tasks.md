---
title: "devflow-execute-hardening-T002365 — Implementation Plan"
ticket_id: T002365
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# devflow-execute-hardening-T002365 — Implementation Plan

_Ticket: T002365_

## File Structure

```
CHANGED:
  .claude/skills/dev-flow-execute/SKILL.md  — CI-Watch verschieben, Preflight korrigieren
  docs/agent-guide/20-werkzeuge.md           — Worktree-Cleanup dokumentieren
```

## Tasks

### 1. CI-Watch-Zuständigkeit verschieben

CI-Watch-Überwachung aus Implementer-Prompt in Orchestrator-Schritt verschieben (SKILL.md Section 5.5 → Orchestrator).

### 2. Worktree-Cleanup dokumentieren

Nach Merge: agent-lock release + worktree remove + branch delete als Pflichtschritt in SKILL.md dokumentieren.

### 3. Preflight-Doku korrigieren

Veraltete Preflight-Beschreibungen in SKILL.md aktualisieren.

### 4. CI-Gates

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
