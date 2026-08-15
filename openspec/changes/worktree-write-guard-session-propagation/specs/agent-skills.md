## ADDED Requirements

### Requirement: The worktree write guard accepts propagated parent session IDs for delegated subagents

Delegierende Skills SHALL die Parent-SID an delegierte Subagenten propagieren (`AGENT_LOCK_SID`, Quelle `bash scripts/agent-lock.sh mine`); Claims mit `owner_sid` gleich der `AGENT_LOCK_SID` des Aufrufers SHALL als eigene Claims gelten (Regel 2); die Regel-3-Ablehnungsmeldung SHALL den Propagations-Hinweis nennen.

#### Scenario: Delegierter Implementer schreibt mit propagierter Parent-SID in den Worktree des Parent-Claims

- **GIVEN** ein aktiver Branch-Claim des delegierenden Orchestrators auf einem Worktree
- **WHEN** ein delegierter Implementer mit propagierter `AGENT_LOCK_SID` gleich der `owner_sid` des Claims in den Worktree schreibt
- **THEN** der Worktree-Write-Guard erlaubt den Write (exit 0)

#### Scenario: Haupt-Checkout-Write des delegierten Subagenten bleibt blockiert

- **GIVEN** ein aktiver Branch-Claim des delegierenden Orchestrators auf einem Worktree
- **WHEN** der delegierte Subagent in den Haupt-Checkout schreibt (außerhalb der Phase-A-Pfade)
- **THEN** der Worktree-Write-Guard lehnt den Write ab (exit 2, Regel 2 bleibt aktiv)

#### Scenario: Fremder Claim einer anderen Session bleibt blockiert

- **GIVEN** ein fremder lebender Claim einer anderen Session auf einem Worktree
- **WHEN** der delegierte Subagent in diesen fremden Worktree schreibt
- **THEN** der Worktree-Write-Guard lehnt den Write ab (exit 2, Regel 3 bleibt aktiv) und die Meldung nennt den `AGENT_LOCK_SID`-Propagations-Hinweis
