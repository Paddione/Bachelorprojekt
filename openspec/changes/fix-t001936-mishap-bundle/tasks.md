# Tasks: Mishap-Bundle skills/agents, scripts/worktree

## Task 1: Mishap-Einträge identifizieren

1. Lies den Ticket-Description (1551 chars) um die konkreten Mishap-Einträge zu verstehen
2. Analysiere die betroffenen Dateien in `skills/agents` und `scripts/worktree`
3. Identifiziere die Root Causes

## Task 2: Fixes anwenden

1. Fixe die in Task 1 identifizierten Probleme
2. Stelle sicher dass keine Regressionen entstehen

## Task 3: Tests laufen lassen

```bash
task test:changed
```
