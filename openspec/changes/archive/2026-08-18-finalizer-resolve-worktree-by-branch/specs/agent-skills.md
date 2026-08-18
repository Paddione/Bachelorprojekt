## ADDED Requirements

### Requirement: Finalizer wählt den Aufräum-Worktree branch-exakt

`scripts/devflow-post-merge-finalize.sh` SHALL resolve the worktree to be removed in
step 10 primarily by exact branch match: the worktree whose `git worktree list
--porcelain` output carries `branch refs/heads/$BRANCH`. The slug-derived path
`$REPO_DIR/.worktrees/$SLUG` SHALL only be used as a fallback, and only when that
worktree actually has `$BRANCH` checked out.

A worktree holding a branch other than `$BRANCH` SHALL NOT be selected as the
removal target, regardless of its path matching the slug. Step 10 runs
`git worktree remove --force`, which discards uncommitted work; selecting a foreign
worktree would destroy another session's changes.

When no worktree has `$BRANCH` checked out, the resolved path SHALL remain
`$REPO_DIR/.worktrees/$SLUG` so that step 10 reports the existing "already removed"
skip instead of failing.

#### Scenario: Slug-Pfad hält einen fremden Branch

- **GIVEN** `.worktrees/<slug>-reuse` hat `chore/<slug>` ausgecheckt und
  `.worktrees/<slug>` hat einen anderen Branch ausgecheckt
- **WHEN** der Finalizer den Aufräum-Worktree für `chore/<slug>` auflöst
- **THEN** liefert die Auflösung `.worktrees/<slug>-reuse`, und der aufgelöste
  Worktree hat `chore/<slug>` ausgecheckt

#### Scenario: Worktree liegt unter abweichendem Pfad

- **GIVEN** der Ziel-Branch ist ausschließlich in `.worktrees/<slug>-reuse`
  ausgecheckt und `.worktrees/<slug>` existiert nicht
- **WHEN** der Finalizer den Aufräum-Worktree auflöst
- **THEN** liefert die Auflösung `.worktrees/<slug>-reuse`

#### Scenario: Kein Worktree hält den Branch

- **GIVEN** kein Worktree hat den Ziel-Branch ausgecheckt
- **WHEN** der Finalizer den Aufräum-Worktree auflöst
- **THEN** liefert die Auflösung `$REPO_DIR/.worktrees/<slug>`, das Verzeichnis
  existiert nicht, und Schritt 10 überspringt die Entfernung
