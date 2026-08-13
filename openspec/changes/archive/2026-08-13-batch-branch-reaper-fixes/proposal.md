# Proposal: batch-branch-reaper-fixes

## Why

`scripts/branch-reaper.sh` meldet nach einem Remote-Branch-Delete „DELETED", lässt den
lokalen Branch-Ref im Ziel-Repo aber als Leiche zurück (Upstream ab da `[gone]`). Von den
vier geplanten Fixes ist nur dieser (T003182) offene Arbeit — die übrigen drei
(T003387 Allowlist, T003542 Push-Bündelung, T003074 Filter) wurden separat geschlossen
bzw. sind bereits auf main gemergt.

## What

_Ticket: T003794_

Nach erfolgreichem Remote-Delete entfernt der Reaper den lokalen Ref mit — ausschließlich
wenn er auf denselben SHA zeigt wie der archivierte Remote-Branch (Sicherheitsbedingung:
eigene, nie gepushte Arbeit darf nie gelöscht werden). Abweichende SHA oder ein fehlschlagendes
`git branch -D` (z. B. Branch in einem Worktree ausgecheckt) verschonen den lokalen Ref und
begründen das in der Ausgabe (`KEEP local <branch>`). Der bestehende Ausgabevertrag
(`REAP`/`KEEP`, `DELETED <branch>`-Präfix) bleibt erhalten.
