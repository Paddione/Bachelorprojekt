---
id: P5
role: impl
ticket: T900999
depends_on: []
target_files:
  - .opencode/skills/references/plan-quality-gates.md
---

# P5 Lifecycle-Doktrin (T900999)

## Ziel

Lifecycle-Doktrin in `plan-quality-gates.md` festschreiben: jeder
ausgefuehrte Plan endet mit Receipt (Frontmatter + Check-Evidenz +
Merge-SHA in `tickets.ticket_plans`) und danach Delete des Plan-Ordners
per `git rm` — fail-closed: ohne verifizierten Record kein Delete.
Kein `.md`-Ueberhang: gemergte Plaene bleiben nicht im Repo liegen.
Abgrenzung: Generieren schreibt Plaene, Validieren (plan-lint, Gates,
Guards) prueft sie nur und schreibt nie.

## Betroffene Datei

Nur `.opencode/skills/references/plan-quality-gates.md`.

## Concrete-Steps

1. `plan-quality-gates.md` lesen (S1–S4-Abschnitte, Stil: Karte statt Kopie, keine Limit-Zahlen).
2. Neuen Abschnitt "Lifecycle Receipt + Delete" anhaengen: Receipt-Felder, `git rm`-Weg ueber Sammel-Cleanup-PR, Fail-closed-Satz, kein `.md`-Ueberhang-Satz, Generieren-vs-Validieren-Satz.
3. Auf P1–P4 verweisen (finalize, Reaper-Sweep, Guard-Tests, staged/superseded), nichts davon hier implementieren.
4. `wc -l` pruefen (Datei hat kein S1-Limit, Budget 0-Regel beachten).
5. Disjunktheit pruefen (`git status --porcelain`): nur die eine Datei geaendert.

## Gate

- `bash scripts/plan-lint.sh .agents/plans/spec-pipeline-lifecycle/tasks.md` PASS (0 hard)
- Referenzierende Docs-Guards gruen (keine capabilities-Aenderung, daher kein emit-map noetig; routing-docs-guard-mtime beachten)

## Disjunktheit

Nur `.opencode/skills/references/plan-quality-gates.md` anfassen. Keine andere Datei aendern — insbesondere nicht `scripts/devflow-post-merge-finalize.sh` (P1), `scripts/branch-reaper.sh` (P2), `scripts/plan-lint.sh` / BATS (P3), `scripts/ticket.sh` (P4).
