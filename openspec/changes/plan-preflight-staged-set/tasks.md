---
title: "plan-preflight-staged-set — Implementation Plan"
ticket_id: T005114
domains: [scripts, skills]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# plan-preflight-staged-set — Implementation Plan

_Ticket: T005114_

## File Structure

| Datei | Ist | Budget |
|---|---|---|
| `scripts/plan-preflight.sh` | 91 | 709 |
| `.claude/skills/dev-flow-plan/SKILL.md` | groß | nur Schritt-5-Block anpassen |
| `tests/spec/dev-flow-plan/plan-preflight-staged-set.bats` | neu | neu |
| `tests/spec/dev-flow-plan/plan-preflight.bats` | besteht | dirty-Tree-Testfall umstellen |
| `openspec/changes/plan-preflight-staged-set/{proposal,tasks}.md` | neu | Plan-Artefakte |
| `openspec/changes/plan-preflight-staged-set/specs/dev-flow-plan.md` | neu | Delta zum SSOT |
| `website/src/data/test-inventory.json` | generiert | via `task test:inventory` |

## Task 1: RED — failing Test für die Staged-Set-Semantik

- [ ] **Failing-Test-Step (RED).** `tests/spec/dev-flow-plan/plan-preflight-staged-set.bats`
      liegt im Branch und schlägt gegen den aktuellen Guard fehl: gestagte Plan-Artefakte
      werden mit rc=1 abgelehnt (Clean-Tree-Zwang).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/plan-preflight-staged-set.bats
# expected: FAIL (red — der gültige Staged-Set-Fall wird abgelehnt)
```

## Task 2: GREEN — Guard auf Staged-Set-Prüfung umstellen

- [ ] In `scripts/plan-preflight.sh` `cmd_pre_commit` die Zeile
      `[ -z "$(git status --porcelain)" ]` ersetzen: gestagte Dateien über
      `git diff --cached --name-only` ermitteln; erlaubt sind Pfade unter `tests/`,
      `openspec/changes/`, sowie exakt `website/src/data/openspec-status.json` und
      `website/src/data/test-inventory.json`. Jede andere gestagte Datei → fail mit
      Meldung „Fremd-Datei im Staged-Set". Unstaged/untracked wird nicht mehr geprüft.
- [ ] In `.claude/skills/dev-flow-plan/SKILL.md` Schritt 5 den Punkt
      „Clean git status / Sauberer Status ist Pflicht" auf die Staged-Set-Regel
      umformulieren (inkl. Abhilfe-Text).
- [ ] In `tests/spec/dev-flow-plan/plan-preflight.bats` den Testfall „dirty tree wird
      abgelehnt" auf die neue Semantik umstellen (unstaged dirty → rc=0; der
      Staged-Fremd-Fall ist durch die neue Datei abgedeckt).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/plan-preflight-staged-set.bats tests/spec/dev-flow-plan/plan-preflight.bats
# expected: PASS (green)
```

## Task 3: Inventory und Final Verification

- [ ] `task test:inventory` ausführen und `website/src/data/test-inventory.json` committen.
- [ ] `bash scripts/openspec.sh validate plan-preflight-staged-set` bleibt OK.

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
