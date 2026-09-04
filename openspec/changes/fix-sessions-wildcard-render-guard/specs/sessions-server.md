## ADDED Requirements

### Requirement: Sessions Wildcard Render Guard

The system SHALL fail the manifest render (non-zero exit) when a rendered
`dnsNames:` entry or `Host()`/`HostRegexp()` match contains an empty wildcard
remainder (e.g. `"*."`) or an unsubstituted `${VAR}` placeholder originating
from an empty `SESSIONS_DOMAIN`, covering both the Flux render path
(`scripts/flux-render-artifact.sh`) and the Taskfile `workspace:deploy` path.

#### Scenario: Leere SESSIONS_DOMAIN bricht den Render ab

- **GIVEN** `SESSIONS_DOMAIN` ist leer oder ungesetzt beim Rendern des
  mentolder-Overlays (`prod-fleet/mentolder/sessions-server.yaml`)
- **WHEN** der Render-Pfad ausgeführt wird
- **THEN** ist der Exit-Code nicht 0 und es wird kein Manifest mit
  `dnsNames: ["*."]` geschrieben

#### Scenario: Korrekt gesetzte Domain rendert fehlerfrei

- **GIVEN** `SESSIONS_DOMAIN` ist `sessions.mentolder.de`
- **WHEN** der Render-Pfad ausgeführt wird
- **THEN** ist der Exit-Code 0 und `dnsNames` enthält
  `"*.sessions.mentolder.de"`

#### Scenario: Korczewski-Render bleibt unberührt

- **GIVEN** der korczewski-Overlay wird gerendert (kein Sessions-Cert dort)
- **WHEN** der Guard läuft
- **THEN** schlägt der Guard nicht an (kein False Positive ohne
  Sessions-Manifeste)
