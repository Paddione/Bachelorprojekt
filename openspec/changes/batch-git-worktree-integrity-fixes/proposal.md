# batch-git-worktree-integrity-fixes — Proposal

## Zweck

Batch-Gruppe aus 7 Tickets (Git/Worktree-Integrität). Ein gemeinsamer Branch
und Plan decken alle Kinder ab.

## Kinder

- T003069: Teilweiser git stash pop nach Rebase sieht aus wie erfolgreich
- T002998: Worktree-Schleife misst Waisenverzeichnisse als Hauptrepo
- T003131: worktree-write-guard SID-Besitzmodell für nebenläufige Subagenten
- T003070: Stash-Stack worktree-übergreifend geteilt
- T002994: Kaputte 0-Byte-Loose-Objects blockieren git fetch
- T002995: git status Falsch-Positiv "dirty" nach Crash
- T003105: Konfliktfreier Rebase verliert Freshness-Artefakte

## Nicht im Scope

- branch-reaper/Branch-Bereinigung (Batch T003490)
- Agent-Lock-Mechanik (T003102 — eigenes Ticket)
- Repo-Hygiene-Runbook selbst (Batch T003490)
