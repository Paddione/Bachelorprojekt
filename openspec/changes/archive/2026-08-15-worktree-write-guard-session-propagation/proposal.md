# Proposal: worktree-write-guard-session-propagation

## Why

Der Worktree-Write-Guard (`scripts/hooks/worktree-write-guard.sh`, PreToolUse-Hook
auf Write/Edit/NotebookEdit) blockiert delegierte Implementer- und
Plan-Subagenten in ihrem eigenen Worktree: Der Orchestrator hält den
branch-scoped Claim mit seiner Session-ID (`owner_sid`), aber Task-Tool-Subagenten
haben eine **eigene** Session-ID (Claude Code injiziert `CLAUDE_CODE_SESSION_ID`
pro Agenten-Session in die Bash-Calls). Der Subagent sieht den Claim seines
Parents als "fremden lebenden Claim" (Guard-Regel 3) → `exit 2` für jeden
Write im Worktree.

Belegt durch Mishap T006365: Implementer-Subagent für T005560 umging die
Blockade mit `python3`-Bash statt Datei-Tools (finaler Commit `841d48645`). Jeder
delegierte dev-flow-execute-Lauf und jeder Plan-Subagent in dev-flow-plan
Phase C verliert damit die Datei-Tools. Die Spec-Annahme in
`openspec/specs/agent-skills.md` (Z. 1046–1054), Subagenten derselben Session
hätten dieselbe SID, hält in der Praxis nicht — sie muss explizit hergestellt
werden.

## What

| Teil | Fix |
|---|---|
| 1 | **SID-Propagation**: `.claude/skills/dev-flow-execute/SKILL.md` (Implementer-Prompt) und `.claude/skills/dev-flow-plan/SKILL.md` (Plan-Subagenten, Schritt 3.7) tragen die PFLICHT-Direktive: der Orchestrator ermittelt seine SID (`bash scripts/agent-lock.sh mine`) und der delegierte Subagent führt in jedem Bash-Call `export AGENT_LOCK_SID=<sid>` aus. Damit gelten die Parent-Claims als eigene (Guard-Regel 2): Worktree-Writes erlaubt, Haupt-Checkout und fremde Claims bleiben blockiert. |
| 2 | **Guard-Hinweis**: `scripts/hooks/worktree-write-guard.sh` Regel-3-Meldung nennt zusätzlich den Propagations-Hinweis (`export AGENT_LOCK_SID=<FOREIGN_SID>`), statt den Betroffenen zu Workaround oder Notausgang zu treiben. |
| 3 | **Spec**: `openspec/specs/agent-skills.md` — Requirement + Scenarios für die SID-Propagations-Semantik (Delta). |
| 4 | **Tests**: `tests/spec/agent-skills/worktree-write-guard-session-propagation.bats` — RED (Regel-3-Hinweis fehlt; SKILL-Direktive fehlt) + Positiv-Anker (Guard erlaubt Worktree-Write mit `AGENT_LOCK_SID` = `owner_sid`). |

## Non-Goals

- Keine Änderung an der Blockade-Semantik für fremde Sessions (T002355-M3-Schutz bleibt).
- Kein neues Lock-Feld / `authorize`-Kommando (siehe design.md — verworfen).
- Keine Änderung an agent-lock.sh selbst.

_Ticket: T006365_
