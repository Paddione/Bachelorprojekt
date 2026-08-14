# Proposal: plan-preflight-staged-set

## Why

**Symptom (beobachtet, reproduzierbar):** `scripts/plan-preflight.sh pre-commit` bricht mit
„working tree ist nicht sauber" ab, sobald die Plan-Artefakte gestagt sind — exakt der
Zustand, in dem dev-flow-plan Schritt 5 den Guard aufruft. Der Guard kann in der
Skill-Reihenfolge nie grün werden (belegt: rc=1 bei T004898 und T005031).

**Ursache (belegt):** Zeile 40 in `scripts/plan-preflight.sh` erzwingt
`git status --porcelain` leer. Der Schutz gilt aber dem COMMIT — relevant ist das
staged-Set, nicht der Baum. Der bestehende BATS-Test pinnt nur den unstaged-Fall.

## What

- `scripts/plan-preflight.sh`: Clean-Tree-Zwang durch Staged-Set-Prüfung ersetzen
  (nur Plan-Artefakte erlaubt, Fremd-Datei im Staged-Set → rc=1, unstaged/untracked egal).
- Skill-Text `dev-flow-plan/SKILL.md` Schritt 5: „Clean git status" → Staged-Set-Regel.
- Tests: neue Datei `tests/spec/dev-flow-plan/plan-preflight-staged-set.bats` (RED belegt);
  bestehenden „dirty tree"-Testfall auf die neue Semantik umstellen.

_Ticket: T005114_
