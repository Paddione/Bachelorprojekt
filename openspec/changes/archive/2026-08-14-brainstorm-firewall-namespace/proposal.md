# Proposal: brainstorm-firewall-namespace

## Why

`task brainstorm:firewall:open --dry` bricht mit `Task "brainstorm:dev:firewall:open" does not exist` ab — der cmds-Subcall `task: dev:firewall:open` wird von go-task relativ zum brainstorm-Include-Namespace aufgelöst. Damit sind `brainstorm:setup` und `brainstorm:firewall:open` unbenutzbar (Gefunden bei der verworfenen T005787-Arbeit).

## What

Eine Zeile: `task: dev:firewall:open` → `task: :dev:firewall:open` (führender Doppelpunkt = Root-Adressierung). Dazu BATS-Regressionstest (rot→grün) und die Konvention „Taskfile deps & Includes" in den Gotchas (deps parallel + Cross-Include-Syntax).

## Impact

- `taskfiles/Taskfile.brainstorm.yml`, `tests/spec/ci-cd/brainstorm-firewall-namespace.bats`, `docs/superpowers/references/gotchas-footguns.md`.
- Keine SSOT-Spec-Änderung.
