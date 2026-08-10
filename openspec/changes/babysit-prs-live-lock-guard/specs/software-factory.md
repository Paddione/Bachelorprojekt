## ADDED Requirements

### Requirement: babysit-prs.sh respektiert live Agent-Locks beim Worktree-Removal

`scripts/factory/babysit-prs.sh` SHALL, unmittelbar vor dem Entfernen des für einen PR-Branch
angelegten Fix-Worktrees, denselben `agent-lock.sh check-branch-live`-Guard prüfen, den
`scripts/factory/cleanup.sh` seit T002896 vor jedem Worktree-Removal prüft. Trägt der Branch
einen live Agent-Lock, SHALL das Removal übersprungen werden, und das Skript SHALL eine
Diagnosezeile auf stderr ausgeben statt den Worktree stillschweigend zu entfernen. Der
`rm -rf`-Fallback SHALL nur innerhalb dieses Guards laufen (nachdem `check-branch-live` bereits
"nicht live" bestätigt hat), niemals als bedingungsloser Fallback über ein fehlgeschlagenes
`git worktree remove` hinweg.

#### Scenario: Worktree mit live Agent-Lock überlebt das Removal

- **GIVEN** `babysit-prs.sh` hat für einen roten PR einen Fix-Worktree angelegt, und der
  PR-Branch trägt einen live Agent-Lock (z. B. weil eine andere Session ihn während des
  Fix-Versuchs geclaimt hat)
- **WHEN** `babysit-prs.sh` den Worktree-Removal-Schritt erreicht
- **THEN** der Worktree bleibt auf der Festplatte erhalten, und `babysit-prs.sh` schließt seinen
  Lauf trotzdem mit Exit 0 ab

#### Scenario: Worktree ohne Lock wird wie bisher entfernt

- **GIVEN** derselbe Fix-Worktree, aber der PR-Branch trägt keinen Agent-Lock
- **WHEN** `babysit-prs.sh` den Worktree-Removal-Schritt erreicht
- **THEN** der Worktree wird entfernt
