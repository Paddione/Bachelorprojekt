## MODIFIED Requirements

### Requirement: Public-API Fail-soft für `/api/timeline` und Slot-Endpoints

The system SHALL return `200` with an empty `rows` array (not `5xx`) when external services
(caldav, Nextcloud OCS) are unreachable from `/api/timeline` and the slot/booking endpoints, so
a public visitor never sees a stack trace and the homepage continues to render without the
widget. LiveKit is no longer part of this dependency set — the stack was removed in T002184.

#### Scenario: Nextcloud OCS ist down

- **GIVEN** the Nextcloud OCS endpoint is unreachable (connection refused)
- **WHEN** `GET /api/timeline` is called on `web.<brand>`
- **THEN** the server responds with `200` and `{ rows: [], error: 'fetch_failed' }`, and the
  timeline widget on the homepage hides itself

#### Scenario: Keine LiveKit-Umgebungsvariable wird mehr gelesen

- **GIVEN** the website build after the T002184 removal
- **WHEN** the API handlers under `website/src/pages/api/` are scanned
- **THEN** no handler reads `LLM_LIVEKIT_URL`, `LIVEKIT_DOMAIN` or `LIVEKIT_PIN_IP`
