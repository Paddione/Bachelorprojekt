# Proposal: plan-archive-freshness-check

## Why

Nach `openspec.sh archive <slug>` + `task freshness:regenerate` + Archiv-Commit trug der
committete `website/src/data/openspec-status.json` den Change noch als `plan_staged` statt
`archived`. Das CI-Freshness-Gate schlug deshalb auf dem Archiv-PR #4552 fehl („regenerated
but not staged“) und der Archiv-Branch brauchte einen Follow-up-Fix-Commit
(„regenerate openspec-status.json for archived state“), bevor der PR grün wurde.

**Symptom (Fakt, belegt):** PR #4552 trägt genau zwei Commits — der Archiv-Commit
`chore(plans): archive s3-finetune-dataset-recipe → postgres + openspec/archive [T006252]`
und der Fix-Commit `chore(plans): regenerate openspec-status.json for archived state …`.
Das CI-Gate griff also erst NACH dem Push.

**Ursache (Hypothese des Tickets, reproduziert):** Die Regeneration lief, bevor die
Archiv-Verschiebung (`mv "$dir" "$dest"` in `scripts/openspec.sh cmd_archive`) im Arbeitsbaum
vollständig sichtbar war. Reproduziert im Ticket: eine lokale Regeneration auf dem
Archiv-Branch-Zustand (nach Cherry-Pick) liefert korrekt `archived` — d. h. die committete
Datei war stale, nicht die Regenerationslogik.

## What

`.claude/skills/references/plan-archive-steps.md` (Schritt 7, Archiv-Sequenz) wird um eine
**`task freshness:check`-Verifikation VOR dem Push des Archiv-Branches** gehärtet:

- Position: zwischen `git cherry-pick "$ARCHIVE_COMMIT"` und `git push -u origin
  "$ARCHIVE_BRANCH"` — genau dort, wo der Arbeitsbaum den Archiv-Zustand trägt und ein
  frischer Regenerationslauf den Ist-Zustand messen kann.
- `freshness:check` regeneriert (Phase 0) und diffet gegen HEAD; ein stale committetes
  `openspec-status.json` erzeugt Drift (Exit 201).
- Drift-Fall: die regenerierten Dateien werden gestaged und der Archiv-Commit per
  `git commit --amend --no-edit` korrigiert, dann erneut `freshness:check` — der
  Follow-up-Fix-Commit wandert damit von CI-Nacharbeit zu Pre-Push-Verifikation.

### Abgrenzung

Der Fix härter die **Referenz-Prozedur** (die ausführbare Anleitung für Archiv-Agenten),
nicht das Archiv-Verb `scripts/openspec.sh cmd_archive` selbst. Das Verb regeneriert die
Status-Map bereits (T003136); der Mishap entstand im Sequenz-Handling des Aufrufers, und
dort greift die Verifikation.

### SSOT

Neues Requirement in `openspec/specs/openspec-workflow.md` (ADDED-Delta):
„Der Archiv-Flow verifiziert die Status-Map vor dem Push“ — die Referenz MUSS vor dem Push
eine freshness:check-Verifikation mit Amend-Loop vorschreiben.

## Implementation

1. **RED:** `tests/spec/openspec-workflow/plan-archive-freshness-check.bats` — Querschnitts-
   Doku-Guard (Prüfmodus wie `plan-archive-git-add-coverage.bats`: die Referenz IST die
   ausführbare Prozedur). Positiv-Anker: `task freshness:check` erscheint zwischen
   `git cherry-pick` und `git push`. Drift-Loop-Anker: `git commit --amend` erscheint
   zwischen Cherry-Pick und Push (ohne Amend-Pfad bliebe der Archiv-Agent mit rotem Check
   stehen und der Follow-up-Commit wäre weiterhin die einzige Lösung).
2. **GREEN:** Referenz `plan-archive-steps.md` härten (Check + Drift-Loop vor Push).
3. **SSOT:** Delta `openspec/changes/plan-archive-freshness-check/specs/openspec-workflow.md`
   mit dem neuen Requirement.
4. **Verify:** Guards grün (`task test:changed`, `task freshness:regenerate` +
   `task freshness:check`), Test-Inventar regeneriert.

_Ticket: T006369_
