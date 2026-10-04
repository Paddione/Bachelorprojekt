---
id: P2
role: impl
ticket: T900999
depends_on: []
target_files:
  - scripts/branch-reaper.sh
---

# P2 Cleanup-Sweep (T900999)

## Ziel

Sammel-Cleanup-PR ueber den Reaper-Sweep: Plan-Ordner mit verifiziertem
DB-Receipt (`tickets.ticket_plans`) per `git rm` entfernen. Kein Direkt-Push
nach main, nur der Reaper-Sweep-Weg. Fail-closed: ohne Receipt kein Delete.

## Concrete-Steps

1. `scripts/branch-reaper.sh` lesen: Sweep-Pfad (`--sweep`), KEEP-Regel und
   `_reap_local_ref()` verstehen (Sweep ist SSOT, vgl. Projektmemory).
2. Sweep-Modus um Plan-Ordner erweitern: Kandidat = `.agents/plans/<slug>/`
   ohne offenen PR und mit Ticket-Status done/shipped.
3. Vor jedem `git rm`: Receipt per `ticket.sh plan-meta` (o. DB-Read) prüfen —
   Record mit Frontmatter + Check-Evidenz + Merge-SHA vorhanden, sonst KEEP.
4. Fehlt das Receipt: Ordner überspringen, als KEEP mit Grund loggen.
5. Removal als Sammel-Cleanup-PR bündeln (ein PR, mehrere Ordner), Branch nach
   Reaper-Konvention benennen, nie direkt nach main pushen.
6. S1-Budget einhalten (`scripts/branch-reaper.sh`, Limit 800, Rest 253).

## Gate

- `bash scripts/plan-lint.sh .agents/plans/spec-pipeline-lifecycle/tasks.md` PASS (0 hard)
- `tests/spec/ci-cd/branch-reaper.bats` grün (reaper-BATS)

## Disjunktheit

Nur `scripts/branch-reaper.sh` anfassen. Keine andere Datei ändern —
insbesondere nicht `scripts/devflow-post-merge-finalize.sh` (P1),
`scripts/ticket.sh` (P4), `scripts/plan-lint.sh` / BATS (P3) oder
`.opencode/skills/references/plan-quality-gates.md` (P5).
