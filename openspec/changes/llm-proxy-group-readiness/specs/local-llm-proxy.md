## MODIFIED Requirements

### Requirement: Health endpoint reports readiness, not liveness

The proxy SHALL answer `GET /health` with the question "can I serve requests",
not "is my process alive". Readiness is determined by the **enabled backends
with `priority = 1`** — the local primary path. A lower-priority backend
(cloud fallback) is reported but SHALL NOT make the proxy ready on its own,
because it is slower, costs money and sends data off-premises, which the
platform's GDPR-by-design stance treats as a fallback rather than a substitute.

The response body SHALL name the degraded backends in both the ready and the
not-ready case, so a caller sees *which* backend is missing rather than only
*that* something is missing.

If no `priority = 1` backend is present at all, the proxy SHALL be considered
not ready.

**GEAENDERT — exclusiveGroup als Gruppe:** Backends, die derselben
`exclusiveGroup` angehoeren (nur EIN Mitglied laeuft gleichzeitig), gelten
als Gruppe. Die Gruppe gilt als healthy, wenn **mindestens ein Mitglied**
healthy ist. Die Readiness-Auswertung aggregiert exclusiveGroup-Geschwister,
statt jedes Mitglied einzeln zu verlangen. `ready=true` ist damit erreichbar,
wenn jede priority=1-Gruppe mindestens ein healthy Mitglied hat.

#### Scenario: Mehrere chat-gpu-Loadouts, eines healthy

- **GIVEN** acht chat-gpu-Loadouts (gleiche exclusiveGroup), von denen nur eines laeuft und healthy ist
- **WHEN** `GET /health` aufgerufen wird
- **THEN** gilt die Gruppe als healthy
- **AND** `ready=true`, solange die anderen Gruppen ebenfalls mindestens ein healthy Mitglied haben

#### Scenario: Kein priority=1-Backend vorhanden

- **GIVEN** kein priority=1-Backend ist registriert
- **WHEN** `GET /health` aufgerufen wird
- **THEN** gilt der Proxy als not ready
- **AND** die Antwort nennt die degradierten Backends

#### Scenario: Cloud-Fallback allein

- **GIVEN** nur ein Cloud-Backend (priority > 1) ist healthy
- **WHEN** `GET /health` aufgerufen wird
- **THEN** macht das Cloud-Backend den Proxy NICHT ready
