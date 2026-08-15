---
title: "post-merge-finalize-archive-branch-restore — Implementation Plan"
ticket_id: T006791
domains: [scripts, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# post-merge-finalize-archive-branch-restore — Implementation Plan

**Goal:** `scripts/devflow-post-merge-finalize.sh` merkt vor der Archiv-Sektion (Schritt 8)
den aktuellen Branch (`ARCHIVE_PREV_BRANCH`) und stellt ihn nach der Sektion wieder her —
auch auf Fehlerpfaden. Der BATS-Guard Assertion 5
(`tests/spec/agent-skills/post-merge-finalize-guards.bats`) wird von `skip` auf eine echte
Assertion zurückgestellt (im Stage-Commit bereits geschehen).

**Architecture:** Der Fix lebt in der Archiv-Sektion: PREV-Merken (Branch + SHA für
detached HEAD) im Hauptfluss vor der Subshell, Restore als EXIT-Trap IN der Subshell mit
Ownership-Guard (Restore nur, wenn der Baum auf dem Archiv-Branch steht — parallele
Wechsel bleiben unangetastet). Die Sektion wechselt per Order-Swap (Review PR #4586)
zuerst auf den Archiv-Branch von origin/main und committet die Archivierung direkt dort —
kein Streu-Commit, kein cherry-pick. Die Trap deckt sowohl den Happy-Path (nach Push/PR)
als auch die Fehlerpfade (`gh pr create`/`gh pr merge` FATAL → Subshell-Exit 1) ab — die
naheliegende Restore-Nach-der-Subshell-Variante liefe bei `set -euo pipefail`-Abbruch nie
und hinterließe genau im Fehlerfall den gewechselten Arbeitsbaum (T002357-Fallenklasse,
siehe design.md).

**Tech Stack:** Bash (Skript-Subshell), git (`git -C "$ARCHIVE_DIR" rev-parse`,
`git checkout`), BATS (vendored, `tests/unit/lib/bats-core/bin/bats`).

**Spec:** `design.md` + Delta-Spec in diesem Change — Ticket T006791, Branch
`fix/devflow-post-merge-finalize-archive-restore-T006791`.

## Global Constraints

- Kein Verhalten der Archiv-Sektion selbst ändern (Archive-Commit, checkout -B,
  push, gh pr create/merge bleiben unverändert) — nur PREV-Merken + Restore +
  Order-Swap der Commit-Reihenfolge (cherry-pick entfällt komplett).
- Der Restore darf den Subshell-Exit-Code nicht verschlucken: Fehler in der Sektion
  enden weiterhin mit Exit 1, ein Restore-Fehler ebenfalls (FATAL auf stderr +
  status-Dump).
- BATS-Guard Assertion 5 bleibt im Source-Grep-Modus (dokumentierte Ausnahme von
  T002448-M4: der Laufzeitpfad braucht Cluster/DB) — die Datei dokumentiert den Modus
  bereits im Header; die Restore-Mechanik wurde zusätzlich isoliert in einem
  Bare-Git-Repo + Fake-openspec.sh verifiziert (Code-Review PR #4586).
- Positiv-Anker (Test 4, `refs/heads/$ARCHIVE_BRANCH`) bleibt unangetastet.

## File Structure

| File | Change | Size | Budget |
|---|---|---|---|
| `scripts/devflow-post-merge-finalize.sh` | modify | ~340 L | +15 (PREV-Merken, Trap-Funktion, Restore) |
| `tests/spec/agent-skills/post-merge-finalize-guards.bats` | modify | 102 L | skip-Entfernung (im Stage-Commit enthalten) |
| `openspec/changes/post-merge-finalize-archive-branch-restore/*` | scaffold | — | bereits im Stage-Commit |

## Partials

- partial: 1/1 — post-merge-finalize-archive-branch-restore (Skript + Tests)

## Tasks

### Task 1: [x] RED — Assertion 5 aktivieren (Stage-Commit, bereits erledigt)

Die `skip`-Zeile in `tests/spec/agent-skills/post-merge-finalize-guards.bats` (Test 5,
`T006348: Skript restauriert den Arbeitsbaum-Branch nach der Archiv-Sektion`) wurde im
Stage-Commit entfernt; der Test prüft `grep -qF 'ARCHIVE_PREV_BRANCH' "$FINALIZE"`.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/post-merge-finalize-guards.bats
# expected: FAIL — Test 5 rot (7/8 grün, `[ "$status" -eq 0 ]' failed`), weil die
# Variable im Skript noch nicht existiert (verifiziert am 2026-08-15 gegen main).
```

### Task 2: [x] Fix implementieren — ARCHIVE_PREV_BRANCH merken + Restore-Trap (Order-Swap)

Datei: `scripts/devflow-post-merge-finalize.sh`, Archiv-Sektion (`if [[ -n "${ARCHIVE_DIR:-}" ]]`).
Umgesetzter Stand (PR #4586 + Review-Fixes): siehe design.md — Capture von Branch + SHA
im Hauptfluss vor der Subshell; EXIT-Trap `_restore_prev_branch` in der Subshell mit
Ownership-Guard (`HEAD == $ARCHIVE_BRANCH` → Restore; sonst WARN bei parallelem Wechsel);
Restore-Fehler → FATAL + `git status --short` + Lock-Hinweis, Exit 1. Sektion im
Order-Swap: erst `git fetch origin main` + `git checkout -B "$ARCHIVE_BRANCH" origin/main`,
dann `bash scripts/openspec.sh archive "$SLUG"` + `task freshness:regenerate` + Commit
direkt auf dem Archiv-Branch + `git push -u`. Schritt 10 überspringt den Delete, wenn
der Ticket-Branch nach dem Restore im Haupt-Checkout ausgecheckt ist (mark_skip statt
ERROR/exit 1 — Review-Finding 2, sonst wäre jeder Main-Checkout-Lauf dauerhaft rot).

Erwartung: `mark_ok "Schritt 8: OpenSpec-Change archiviert (Archiv-PR erstellt)"` bleibt
unverändert; im Normal-Lauf erscheint zusätzlich die Restore-Meldung der Trap.

### Task 3: [x] GREEN — BATS-Lauf

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/post-merge-finalize-guards.bats
# expected: PASS — 8/8 grün (Assertion 5 greift jetzt `ARCHIVE_PREV_BRANCH`).
```

### Task 4: [x] Verifikation + Commit

```bash
bash -n scripts/devflow-post-merge-finalize.sh
task test:changed
task freshness:regenerate
task freshness:check
task openspec:validate
git add scripts/devflow-post-merge-finalize.sh tests/ openspec/changes/post-merge-finalize-archive-branch-restore/ website/src/data/
git commit -m "fix(scripts): restore worktree branch after archive section in devflow finalize [T006791]"
git push origin fix/devflow-post-merge-finalize-archive-restore-T006791
```

- `task test:changed` — alle vom Branch betroffenen Offline-Tests (inkl. Guard-Datei).
- `task openspec:validate` — fail-closed Delta/SSOT-Gate; die Delta-Spec wurde auf den
  Parent-Slug `agent-skills.md` benannt (T001304).
- Der Commit-msg-Guard (`check-commit-vs-diff.sh`) verlangt hier `fix(scripts):`, weil der
  Diff Production-Code (Skript) + Tests enthält.

### Task 5: [x] Review-Fixes PR #4596 (nachgeholt, da PR #4586 vor Fertigstellung auto-gemergt)

Code-Review zu PR #4586 lieferte 15 Findings; die Kern-Fixes (Order-Swap,
Ownership-Guard, detached-HEAD-SHA) waren bereits im gemergten Stand, die folgenden
kamen als Follow-up-PR #4596 auf main:

- Schritt 10: ausgecheckter Ticket-Branch nach Restore → `mark_skip` statt
  `ERROR ... exit 1` (Finding 2 — ohne Fix wäre der Batch-Pfad permanent rot).
- FATAL-Meldungen präzisiert: keine Behauptung über den Ist-Zustand des Baums,
  Lock-Räum-Hinweis (Findings 6/12); `git status --short`-Dump bei Restore-Fehler
  (Finding 5).
- BATS Assertion 5 geschärft: prüft zusätzlich `trap _restore_prev_branch EXIT`
  (Finding 11 — die reine Capture-Variable wäre vakuos).
- Stale Zeilennummern-Kommentare in der BATS-Datei entfernt (Finding 13, T003104).
- design.md/proposal.md: Fix-Ansatz auf Order-Swap aktualisiert, Belege mit
  T002717-Pin (8422d5b39) nachstellbar gemacht (Finding 15).
