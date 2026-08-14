# T005564 — Archive-Status-Sed-Muster deckt `planning` nicht ab

## Problem

`dev-flow-execute` für T005307 (PR #4444): `archive-plan` lief, bevor das Plan-Frontmatter auf
`completed` stand. Das sed-Muster aus `.claude/skills/references/plan-archive-steps.md` Schritt 7

```bash
sed -E -i 's/^status: (active|plan_staged|in_progress)$/status: completed/' "$PLAN_FILE"
```

deckt nur `active|plan_staged|in_progress` ab — **nicht `planning`**. Bei Fix-Plänen ohne
`/opsx:apply` ist `planning` aber der Ist-Zustand (das Propose-Skeleton trägt `status: planning`,
siehe `scripts/openspec.sh propose` Zeile ~206: `proposed: $dir (ticket $ticket, status planning)`).
Folge: Das Frontmatter blieb `planning`, wurde erst NACH dem `archive-plan`-Lauf im Archiv-Ordner
von Hand korrigiert — die Postgres-Kopie (`tickets.ticket_plans`) trägt dadurch weiterhin
`planning` statt `completed`.

## Lösung

Das Sed-Muster um `planning` erweitern:

```bash
sed -E -i 's/^status: (active|plan_staged|in_progress|planning)$/status: completed/' "$PLAN_FILE"
```

Analog zum T004271-Querschnitts-Guard (gleiche Datei, gleicher Prüfmodus T002448-M4: die Referenz
IST die ausführbare Prozedur) wird ein Bats-Test ergänzt, der das erweiterte Muster einfordert —
damit genau dieser Drift (planning-fähiges Muster) künftig rot wird.

## Scope

- **In Scope:** `.claude/skills/references/plan-archive-steps.md` (Sed-Muster), Bats-Guard in
  `tests/spec/openspec-workflow/plan-archive-git-add-coverage.bats`.
- **Nicht in Scope:** Keine Änderung an `scripts/openspec.sh archive` selbst (der File-System-Ablauf
  ist korrekt); keine Backfill-Korrektur der bereits archivierten Postgres-Kopie von T005307.

## Offene Fragen

Keine — der Fix ist eindeutig und durch den Mishap-Befund (T005307, "Frontmatter wurde erst NACH
dem archive-plan-Lauf korrigiert") belegt.
