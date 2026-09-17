---
title: "devflow-post-merge-guards — Implementation Plan"
ticket_id: T900096
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# devflow-post-merge-guards — Implementation Plan

_Ticket: T900096_

Ausgangslage: Branch `fix/devflow-post-merge-guards-T900096` enthält einen
fremden Partial-Fix (Reaper-Ancestor-Guard korrekt; Befund 2 via
`git checkout -- .` + `git clean -fd` destruktiv). Dieses Plan ersetzt den
Discard durch fail-closed Guards, ergänzt den lokalen Branch-Delete-Guard und
sichert beides per BATS ab. Spec:
`openspec/changes/devflow-post-merge-guards/specs/agent-skills.md`.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-impl-correct.md | impl | scripts/devflow-post-merge-finalize.sh, scripts/lib/finalize-step-guards.sh |  |
| p2 | tasks.d/p2-reaper-tests.md | tests | tests/spec/ci-cd/branch-reaper-unmerged-keep.bats | p1 |
| p3 | tasks.d/p3-finalize-tests.md | tests | tests/spec/agent-skills/post-merge-finalize-t900096.bats | p1 |

## File Structure

```
openspec/changes/devflow-post-merge-guards/
  proposal.md  Why/What (Befund 1+2, Fremd-Branch-Entscheid)
  design.md    Kontext, Fremd-Hunk-Bewertung, fail-closed-Entscheid
  specs/agent-skills.md  Delta: 3 ADDED Requirements + Szenarien
  intel.json   Plan Intel Bundle (4k)
  tasks.md     dieser Index
  tasks.d/
    p1-impl-correct.md   Discard-Entfernung, Lib-Guards, Call-Sites, S1-Neutralitaet
    p2-reaper-tests.md   Reaper-KEEP-Tests (Runtime, Sandbox)
    p3-finalize-tests.md Schritt-8/10-Tests (Runtime Lib + Source-Grep-Ausnahme)
scripts/lib/finalize-step-guards.sh  NEU (p1): finalize_assert_clean_tree, finalize_branch_fully_merged
tests/.../branch-reaper-unmerged-keep.bats  NEU (p2)
tests/.../post-merge-finalize-t900096.bats  NEU (p3)
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** p2-T1 + p3-T1 muessen auf Stand OHNE Guards
      FAILen (expected: FAIL), mit Guards (p1 umgesetzt) GREEN sein.
- [ ] **S1-Neutralitaet.** `wc -l scripts/devflow-post-merge-finalize.sh`
      expected: ≤ 811 (Baseline-Metrik 812); `task test:code-quality` gruen.
- [ ] **Nachbarn gruen.** Alle `branch-reaper*.bats` +
      `post-merge-finalize-guards`/`finalize-hardening`/`finalize-archive-state`/
      `finalize-worktree-branch-validation`/`archive-staged-scope` gruen.
- [ ] **Freshness.** `task freshness:regenerate` + `task freshness:check`
      gruen, Artefakte committet.
- [ ] **Changed-Gate.** `task test:changed` gruen (oder als pre-existing/env-only
      belegt und im Ticket vermerkt).
