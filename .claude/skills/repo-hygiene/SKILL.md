---
name: repo-hygiene
description: Use for repository housekeeping — clean up stale branches/worktrees, triage and merge open PRs, close resolved tickets, manage GitHub issue intake, and check software factory queue status. Triggers — "clean branches", "merge PRs", "prune worktrees", "factory queue status".
---

> **Mishap Tracking:** Führe während dieses Skills ein `MISHAP_LOG` und rufe am Ende
> `mishap-tracker` auf — Eintragsformat und Ablauf: siehe `mishap-tracker` §Input.

# repo-hygiene

Day-to-day repository hygiene, PR merging, issue intake, and Software Factory queue management.

Der interne Postgres-Tracker `tickets.tickets` ist die SSOT für Issues. DB-Zugriff (MCP-first,
`psql()`-Helper): [`MCP-Tool-Guide`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/mcp-tool-guide.md) §mcp-postgres.

---

## Ablauf

Die gesamte Housekeeping-Mechanik ist **SSOT** in
[`repo-hygiene-ops`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/repo-hygiene-ops.md) —
die fünf Abschnitte der Reihe nach ausführen:

1. **Stale Git Worktrees** — §1
2. **Stale Branches** (inkl. squash-`[gone]`-Prune) — §2
3. **PR-Triage → verknüpftes Ticket schließen** — §3
4. **GitHub-Issue-Intake** (Dedupe-Guard [T001210]) — §4
5. **Software-Factory-Queue** (MCP-first via `factory-mcp`) — §5

Für Completeness-Triage, Klärungsrunden und Parallelisierungs-Masterplan (Phasen 1–3) →
`ticket-ops`.

---

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits cleanly.

## Related Skills

| Skill | Relationship |
|-------|--------------|
| `operations-management` | Routing hub that dispatches repository housekeeping |
| `ticket-ops` | Handles completeness triage and human clarification (Phase 4 = dieselbe SSOT-Reference) |
| `mishap-tracker` | Converts execution mishaps to tickets |
