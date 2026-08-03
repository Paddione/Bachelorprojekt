## ADDED Requirements

### Requirement: Divergence-Guard aktualisiert main ohne Fetch-in-checked-out-Branch

The system SHALL avoid `git fetch origin main:main` in `scripts/worktree-create.sh` when local
`main` is checked out in another worktree, because Git refuses to update a branch that is
checked out elsewhere (`refusing to fetch into branch refs/heads/main checked out at ...`).
Instead the guard SHALL fetch `origin/main` into the remote-tracking ref and let the worktree
rebase from `origin/main`.

#### Scenario: main ist in einem anderen Worktree ausgecheckt

- **GIVEN** lokales `main` liegt hinter `origin/main` und ist in einem anderen Worktree ausgecheckt
- **WHEN** der Divergence-Guard in `worktree-create.sh` läuft
- **THEN** führt er kein `git fetch origin main:main` aus
- **AND** er läuft nicht in den `refusing to fetch`-Fehler

#### Scenario: Guard fetcht origin/main in den Remote-Tracking-Ref

- **GIVEN** der Divergence-Guard aktualisiert die Referenzen
- **WHEN** der Fetch ausgeführt wird
- **THEN** nutzt er `git fetch origin +refs/heads/main:refs/remotes/origin/main`
- **AND** der Worktree rebased von `origin/main`
