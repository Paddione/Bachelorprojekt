# fix-factory-lock-worktree-safety Delta — Worktree-Real-Path-Check

## ADDED Requirements

### Requirement: Create-Skript verifiziert den realen Worktree-Pfad

`scripts/worktree-create.sh` SHALL, after creating a worktree, resolve the actually
registered path via `git worktree list --porcelain` (helper
`scripts/lib/worktree-real-path.sh`, function `worktree_real_path`) and compare it with
the requested path. On mismatch the script SHALL print a warning naming both paths and
report the registered path in its final line; on match the existing behavior is
unchanged.

#### Scenario: Realer Pfad weicht ab — Drift wird sichtbar

- **GIVEN** worktree-create.sh wurde mit Pfad A aufgerufen, `git worktree list` registriert den Worktree aber unter Pfad B (z. B. Ticket-ID-Suffix)
- **WHEN** das Skript nach dem Anlegen den realen Pfad prüft
- **THEN** eine Warnung nennt beide Pfade, und die Abschlussmeldung nennt den registrierten Pfad B

#### Scenario: Pfad stimmt überein — Verhalten unverändert

- **GIVEN** der registrierte Pfad entspricht dem übergebenen Pfad
- **WHEN** das Skript den realen Pfad prüft
- **THEN** keine Warnung; Abschlussmeldung wie bisher

#### Scenario: Helper ist offline testbar und source-bar

- **GIVEN** ein lokales git-Fixture mit einem Worktree (oder ohne)
- **WHEN** `worktree_real_path <repo-root> <wt-path>` gesourct und aufgerufen wird
- **THEN** es liefert den registrierten Pfad bzw. leeren Output für nicht registrierte Pfade
