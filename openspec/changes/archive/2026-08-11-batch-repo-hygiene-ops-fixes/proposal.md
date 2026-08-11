# batch-repo-hygiene-ops-fixes — Proposal

## Zweck

Batch-Gruppe aus 6 Tickets, die das repo-hygiene-ops-Runbook (§1-§3) und seine
Werkzeuge (branch-reaper.sh, gh-Warteschleifen) reparieren. Ein gemeinsamer
Branch und Plan decken alle Kinder ab.

## Kinder

- T003074: branch-reaper kann den §2-Sweep nicht leisten (nur eine Ticket-ID)
- T003183: [gone]-Prune läuft VOR branch-reaper, der selbst [gone] erzeugt
- T003181: §3 Konfliktprobe ist im dirty Worktree nicht gangbar (invasiver Merge)
- T003224: gh pr checks faltet cancelled auf "fail"
- T003225: statusCheckRollup mischt head-SHAs + leere conclusion truthy
- T003227: kein Factory-Tick-Vorcheck — Worktrees ändern sich unter dem Lauf

## Nicht im Scope

- Stale Worktree/Branch-Bereinigung selbst (das macht der Sweep, nicht der Fix)
- PR-Triage/Factory-Queue-Zustand (repo-hygiene)
- gh-CLI-Upgrades
