# p4 — Stash-Netz: worktree-lokale Stashes (T003070)

## Ziel

Der Stash-Stack ist worktree-übergreifend geteilt (`git stash` nutzt den
gemeinsamen refs/stash) — als Sicherungsnetz bei Parallelarbeit unbrauchbar,
ein Worktree sieht die Stashes der anderen.

## Steps

1. **RED.** Test in `tests/spec/batch-git-worktree-integrity-fixes.bats`: stash in
   Worktree A ist in Worktree B nicht sichtbar. `expected: FAIL`.

2. **GREEN.** In `scripts/git-stash-net.sh` (neu): worktree-lokales Stash-Verfahren
   einführen — z.B. pro-Worktree Stash-Refs (`refs/stash/<worktree>` oder
   `git stash push -- <worktree-lokale Dateien>` mit Namensschema).

3. **Verifikation.** Parallelarbeit: Stash in A beeinflusst B nicht.

## Acceptance

- Stash ist worktree-lokal (nicht global geteilt).
- Runbook dokumentiert das worktree-lokale Verfahren.
