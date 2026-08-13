---
ticket_id: T004271
plan_ref: openspec/changes/plan-archive-steps-git-add/tasks.md
status: active
date: 2026-08-14
---

# Design: plan-archive-steps.md git-add-Liste deckt openspec/specs/ nicht ab (T004271)

Klassifikation (superpowers:brainstorming): **bounded** — Einzeilen-Fix an einer
bestehenden Referenz plus Guard-Test. Die Design-Entscheidung ist durch die
Ticket-Beschreibung vorgegeben und hier dokumentiert.

## Root-Cause (belegt, T002448-M5)

**Symptom:** Nach einer Archivierung fehlt das SSOT-Delta (der gemergte
Anforderungstext) im Archiv-Commit — die SSOT verliert Anforderungen, ohne dass
ein Guard anschlägt.

**Ursache (verifiziert am 2026-08-14):**

1. `scripts/openspec.sh cmd_archive` merged die Delta-Specs in die SSOT:
   `openspec-merge.mjs batch`, Pass 2 (`dry_run: false`), Ziel
   `openspec/specs/<delta-name>.md` — das ist eine **SSOT-Mutation** in
   `openspec/specs/`.
2. `cmd_archive` staged **nur** `website/src/data/openspec-status.json` selbst
   ([T003136]); die SSOT-Delta-Dateien in `openspec/specs/` muss der Aufrufer
   stagen ("cmd_archive überlässt das explizit dem Aufrufer").
3. Die Referenz `.claude/skills/references/plan-archive-steps.md` (Schritt 7,
   Archiv-Commit) listet in ihrer `git add`-Liste:
   `openspec/changes/ openspec/changes/archive/ website/src/data/openspec-status.json`
   — **`openspec/specs/` fehlt**. Folgt der Implementer der Referenz wörtlich,
   bleibt das SSOT-Delta unstaged und geht beim nächsten Rebase/Cleanup verloren.

**Beleg aus der Praxis:** T002614 (PR #4328, Commit 5b70a791) — das Delta-Update
in `openspec/specs/dev-flow-plan.md` fehlte nach der Archivierung im Commit; der
SSOT-Delta-Verlust wurde erst per Follow-up PR #4334 repariert.

## Fix-Ansatz

1. **Referenz ergänzen** (`.claude/skills/references/plan-archive-steps.md`):
   `openspec/specs/` in die `git add`-Liste aufnehmen, analog zur
   openspec-status.json-Zeile:
   ```
   git add openspec/changes/ openspec/changes/archive/ openspec/specs/ website/src/data/openspec-status.json
   ```
   `git add <dir>/` staged Modifikationen **und** Löschungen innerhalb des
   Verzeichnisses — eine Ergänzung genügt; die `git add -u`-Zeile für
   `website/… docs` bleibt unberührt (keine Doppel-Abdeckung nötig).
2. **Guard-Test** (`tests/spec/openspec-workflow/plan-archive-git-add-coverage.bats`):
   prüft die `git add`-Liste der Referenz gegen die **tatsächlich vom
   Archiv-Verb mutierten Pfade**:
   - `openspec/specs/` (SSOT-Delta-Merge)
   - `openspec/changes/` (Move-Quelle)
   - `openspec/changes/archive/` (Move-Ziel)
   - `website/src/data/openspec-status.json` (Regeneration, T003136)
   Prüfmodus: Querschnitts-Doku-Guard (Ausnahme T002448-M4, im Test-Header
   dokumentiert) — das Ergebnis manifestiert sich ausschließlich im Quelltext
   der Referenz. Positiv-Anker (T002356-M1): die git add-Zeile muss existieren,
   sonst besteht der Negativteil vakuos.

## Betroffene Dateien

| Datei | Aktion |
|---|---|
| `.claude/skills/references/plan-archive-steps.md` | modifizieren (git add-Liste) |
| `tests/spec/openspec-workflow/plan-archive-git-add-coverage.bats` | neu (Guard) |
| `openspec/changes/plan-archive-steps-git-add/specs/openspec-workflow.md` | neu (Delta) |

## Entscheidungen

- **Nur die erste `git add`-Zeile** wird geändert; die `-u`-Zeile bleibt, weil
  `git add openspec/specs/` Löschungen ohnehin mitnimmt und die `-u`-Zeile
  bewusst nur die Freshness-/Docs-Artefakte betrifft.
- **Kein Eingriff in `cmd_archive`:** Die SSOT-Delta-Dateien im Skript selbst zu
  stagen wäre eine Verhaltensänderung mit Nebenwirkungen (TICKET_OFFLINE-Modus,
  Batch-Archivierung); der Fix setzt an der Referenz an, weil diese der
  ausführbare Vertrag für den Archiv-Commit ist.
- **Kein Layout/Format-Refactoring der Referenz** — nur die Pfadliste.
