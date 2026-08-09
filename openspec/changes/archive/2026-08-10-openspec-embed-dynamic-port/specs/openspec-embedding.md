## ADDED Requirements

### Requirement: Der DB-Port-Forward wird pro Lauf dynamisch gewählt, nicht fest geteilt

The system SHALL, when `OPENSPEC_EMBED_PF_PORT` is not explicitly set, let `kubectl
port-forward` choose a free local port for its `svc/shared-db` forward instead of sharing a
fixed default port across all invocations, so that a permanently running, unrelated port-forward
on the same host does not block every commit's embedding step. When `OPENSPEC_EMBED_PF_PORT` is
explicitly set, the system SHALL retain the existing fixed-port behaviour including foreign-
process detection and fail-fast on collision.

#### Scenario: Kein OPENSPEC_EMBED_PF_PORT gesetzt, Port bereits fremd belegt

- **GIVEN** ein fremder Prozess läuft dauerhaft auf Port 15432
- **AND** `OPENSPEC_EMBED_PF_PORT` ist nicht gesetzt
- **WHEN** `scripts/openspec-embed-local.sh` einen Commit einbettet
- **THEN** kollidiert der eigene Port-Forward NICHT mit dem Fremdprozess
- **AND** das Embedding schlägt nicht wegen einer Portkollision fehl

#### Scenario: OPENSPEC_EMBED_PF_PORT explizit gesetzt und belegt

- **GIVEN** `OPENSPEC_EMBED_PF_PORT=15432` ist explizit gesetzt
- **AND** ein fremder Prozess belegt Port 15432
- **WHEN** `scripts/openspec-embed-local.sh` läuft
- **THEN** bricht das Skript mit einer Fehlermeldung ab, die den Fremdprozess benennt
