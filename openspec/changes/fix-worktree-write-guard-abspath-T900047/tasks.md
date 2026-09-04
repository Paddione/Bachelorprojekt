---
title: "fix-worktree-write-guard-abspath-T900047 — Implementation Plan"
ticket_id: T900047
domains: [scripts, testing]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-worktree-write-guard-abspath-T900047 — Implementation Plan

_Ticket: T900047 — `scripts/hooks/worktree-write-guard.sh` haengt den Repo-Root
vor bereits absolute Pfade (`C:\...`, `C:/...`), Root-Cause belegt via Rot-Lauf
mit verstuemmelter Meldung `Pfad: /c/.../Bachelorprojekt/C:/...`._

_Per Auftrag wurde Rot-Gruen inline in dieser Session ausgefuehrt (failing BATS
zuerst, dann Fix); dieser Plan haelt Fix, Tests und Verify fest. Disjunkte
`target_files` je Partial (Regel D1), Tests-Partial zuletzt._

## File Structure

- `scripts/hooks/worktree-write-guard.sh` — Fix: `_canon()`-Normalisierung plus
  kanonisierte Vergleiche (Partial p1)
- `tests/spec/agent-skills/worktree-write-guard-abspath-T900047.bats` — neuer
  BATS-Guard mit 6 Faellen (Partial p2)
- `openspec/changes/fix-worktree-write-guard-abspath-T900047/proposal.md` —
  geschaerftes Proposal (Entscheide: BATS unter `tests/spec/`,
  Laufwerksbuchstabe case-insensitiv)
- `openspec/changes/fix-worktree-write-guard-abspath-T900047/specs/agent-skills.md` —
  Delta benannt nach dem Parent-SSOT-Slug `agent-skills`

## Partials

| id | plan | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-guard-fix.md | impl | scripts/hooks/worktree-write-guard.sh |  |
| p2 | tasks.d/p2-guard-tests.md | tests | tests/spec/agent-skills/worktree-write-guard-abspath-T900047.bats |  |

## Verify

Der letzte Schritt jeder Ausfuehrung sind die drei mandatory Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusaetzlich vor dem Commit: `bash scripts/plan-lint.sh
openspec/changes/fix-worktree-write-guard-abspath-T900047/tasks.md` muss PASS
melden. Commit-Praefix fuer den Stage-Commit: `chore(plans):` (Plan-Artefakte
plus RED-Test, kein Production-Code — der Fix-Commit danach traegt einen
Implementierungs-Praefix mit passendem Scope).
