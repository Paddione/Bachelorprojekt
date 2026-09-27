## MODIFIED Requirements

### Requirement: Required Task Declarations
<!-- bats: openclaw-taskfile.bats -->

The system SHALL declare all lifecycle tasks (`backup`, `install`, `configure`, `start`, `status`, `logs`, `restore`, `wipe`) in `Taskfile.openclaw.yml`. These tasks SHALL manage OpenClaw itself; the Taskfile SHALL NOT install, detect or configure opencode.

#### Scenario: Alle Pflicht-Tasks sind vorhanden *(BATS)*
- **GIVEN** `Taskfile.openclaw.yml` ist im Repository vorhanden
- **WHEN** nach jedem der Tasks `backup`, `install`, `configure`, `start`, `status`, `logs`, `restore`, `wipe` gesucht wird
- **THEN** jeder Task ist als Top-Level-Eintrag in der Form `  <name>:` deklariert und kein Task fehlt

#### Scenario: Das Taskfile verwaltet kein opencode *(BATS)*
- **GIVEN** `Taskfile.openclaw.yml` ist im Repository vorhanden
- **WHEN** die Datei nach dem Wort `opencode` durchsucht wird
- **THEN** es gibt keinen Treffer

## REMOVED Requirements

### Requirement: Local Ollama Base URL in Example Config

**Reason**: Der Ollama-Endpunkt `10.10.0.3:11434` existiert nicht mehr. Das lokale Modell läuft auf `127.0.0.1:1919`.

**Migration**: `OPENCLAW_LOCAL_BASE_URL` in `openclaw/.env.example`, geprüft durch die Spec `openclaw-ops-bot` (Requirement „The gateway is loopback-only and carries no secret in tracked files").

### Requirement: Chat Model Set in Example Config

**Reason**: Das Modell wird nicht mehr über `OPENAI_MODEL` gewählt, sondern über die Modellkette in `openclaw/openclaw.json5`.

**Migration**: Requirement „The model chain prefers the local model" in der Spec `openclaw-ops-bot`.
