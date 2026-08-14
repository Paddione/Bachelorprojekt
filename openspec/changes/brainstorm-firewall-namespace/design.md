---
ticket_id: T005899
plan_ref: openspec/changes/brainstorm-firewall-namespace/tasks.md
status: active
date: 2026-08-14
---

# Design: brainstorm-Include — Cross-Include-Aufruf korrigieren

## Root-Cause

`taskfiles/Taskfile.brainstorm.yml:62` ruft `task: dev:firewall:open` auf. go-task löst Task-Aufrufe aus included Taskfiles **relativ zum Include-Namespace** auf → `brainstorm:dev:firewall:open` → „does not exist". Verifiziert: `task brainstorm:firewall:open --dry` bricht ab; auch `brainstorm:setup` (ruft firewall:open) ist damit kaputt.

## Fix

Root-Adressierung mit führendem Doppelpunkt (go-task-Doku: „add a leading `:` to call a task declared in the root Taskfile"): `task: :dev:firewall:open`. Empirisch verifiziert: beide Dry-Runs laufen durch und delegieren an die dev-stack-ufw-Logik.

## Begleitend (Ticket-Umfang)

- BATS-Test `tests/spec/ci-cd/brainstorm-firewall-namespace.bats` (rot verifiziert, dann grün): beide Dry-Runs exit 0, ufw-Delegation sichtbar, keine „does not exist"-Auflösung.
- Gotchas-Referenz (`docs/superpowers/references/gotchas-footguns.md`): neue Sektion „Taskfile deps & Includes (T005899)" — deps laufen parallel (nicht seriell; kippte T005604/T005787) + Cross-Include-Aufrufe brauchen den führenden Doppelpunkt.

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `taskfiles/Taskfile.brainstorm.yml` | 1 Zeile: `task: dev:firewall:open` → `task: :dev:firewall:open` |
| `tests/spec/ci-cd/brainstorm-firewall-namespace.bats` | neu |
| `docs/superpowers/references/gotchas-footguns.md` | neue Sektion + Index-Eintrag |
