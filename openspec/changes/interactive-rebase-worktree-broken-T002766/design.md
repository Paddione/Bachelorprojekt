---
title: "Design: Guard für unterbrochene git-Operationen in Worktrees"
ticket_id: T002766
domains: [skills/git-workflow, repo-hygiene]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Design — worktree-git-op-guard

> **Hinweis zur Entstehung:** Das Brainstorming lief nicht als interaktive Sitzung, sondern als
> belegte Root-Cause-Analyse mit ausgeführtem Reproducer (siehe `proposal.md`). Die dabei offen
> gebliebenen Ermessensfragen stehen am Ende dieses Dokuments und sind vor der Umsetzung zu
> beantworten.

## Schnittstelle

```
scripts/worktree-git-op-guard.sh [--quiet] [<repo-root>]
```

- `<repo-root>` — optional, Vorgabe ist das Repo des aktuellen Verzeichnisses. Das Argument
  existiert, damit der BATS-Test den Guard gegen ein Fixture-Repo laufen lassen kann, statt das
  Ergebnis vom Zustand des Entwicklungsrepos abhängig zu machen.
- `--quiet` — unterdrückt die Erfolgsmeldung; Befunde bleiben sichtbar.

Exit-Codes:

| rc | Bedeutung |
|----|-----------|
| 0 | kein Worktree mit unterbrochener Operation |
| 1 | mindestens ein Befund |
| 2 | Aufruffehler (unbekanntes Flag, `<repo-root>` ist kein git-Repo) |

## Erkennungsmechanik (verifiziert)

Je Worktree aus `git worktree list --porcelain`:

```bash
git -C "$wt" rev-parse --git-path rebase-merge   # → <repo>/.git/worktrees/<name>/rebase-merge
```

`--git-path` ist worktree-aware und liefert einen absoluten Pfad — geprüft an einem angelegten
linked worktree. Geprüfte Namen: `rebase-merge`, `rebase-apply`, `MERGE_HEAD`,
`CHERRY_PICK_HEAD`. Dieselbe Namensliste verwenden bereits `scripts/agent-lock.sh:302`,
`scripts/openspec-embed-lib.sh:32-33` und `.githooks/pre-commit:87` — dort jedoch als
Guard-Ausnahme („nicht eingreifen"), nicht als Melder.

Je Befund ausgegeben: Worktree-Pfad, Art der Operation, und ob noch ungelöste Konflikte offen
sind (`git -C "$wt" diff --name-only --diff-filter=U`). Die zweite Angabe unterscheidet
„jemand arbeitet gerade daran" von „liegengeblieben, alle Konflikte gelöst, nur `--continue`
fehlt" — letzteres ist der Fall aus T002766.

**Kein Branch-Name aus `git rev-parse --abbrev-ref HEAD`:** in einem laufenden Rebase liefert
das `HEAD` (detached), nicht den Branch. Der Branch steht in `rebase-merge/head-name`.

## Warum ein eigenes Skript statt Erweiterung

`agent-lock.sh reap` verwaltet Locks. Seine `_git_op_in_progress()` bedeutet ausdrücklich
„nicht eingreifen"; dieselbe Funktion zusätzlich zum Melder zu machen, gäbe ihr zwei
gegenläufige Bedeutungen. Ein eigenes Skript ist zudem gegen ein Fixture testbar, ohne den
Lock-Zustand der laufenden Session anzufassen.

## Nicht im Scope

- Automatisches `git rebase --continue`/`--abort` (Begründung: `proposal.md`, verworfene
  Alternativen).
- Eine Absicherung in `scripts/worktree-create.sh`, die einen mid-rebase-Worktree nicht
  stillschweigend weiterverwendet. Eigenständiger Vorgang, eigenes Ticket.

## Offene Ermessensfragen

1. **Reichweite der Einbindung.** Der Plan bindet den Guard in `repo-hygiene-ops.md` §1 (SSOT,
   geteilt von `repo-hygiene` und `ticket-ops`) und in `dev-flow-plan` Schritt −1 ein.
   Offen: ob `dev-flow-execute` Phase 0 und `dev-flow-chore` Schritt 0 ebenfalls aufrufen
   sollen. Dafür spricht Vollständigkeit, dagegen das Skill-Body-Budget (agent-skills.md
   Requirement „progressive-disclosure budget").
2. **Fail-closed vs. advisory in den Skills.** Exit 1 ist fail-closed für Automation. Ob eine
   Session bei einem Befund in einem *fremden* Worktree stoppen oder nur melden soll, ist eine
   Prozessentscheidung — der Plan wählt „melden, nicht stoppen", weil ein fremder Worktree
   legitim mitten in einer Operation stehen kann.
3. **CI-Einbindung.** Kein CI-Job aufgerufen: in CI existiert genau ein Worktree, der Guard
   wäre dort strukturell immer grün und würde die Ausstattung des Runners messen statt den
   Zustand des Codes.
