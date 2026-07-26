# Spec: Agent-Routing ↔ Frontmatter-Drift

## Acceptance Criteria

1. `bash scripts/health-goals-check.sh` zeigt G-AGENTIC02 = 0
2. Das Check-Script parst den korrekten Abschnitt (`Claude Code Domain Agents`-Table)
3. Bei verbleibendem echten Drift zwischen Signal-Spalte und Frontmatter-Triggern wird die Signal-Spalte aktualisiert

## Nicht-Scope

- Keine Änderung der `.claude/agents/*.md` Frontmatter-Inhalte (nur das Routing-Table)
- Keine Änderung des `## Agent Routing`-Tables (betrifft opencode lokale LLM-Agenten)
