## ADDED Requirements

### Requirement: Agent-Push-Notification-Delivery

The system SHALL deliver opencode- and agy-Session-Events as HTTP-POST to a self-hosted ntfy-Server within 10 seconds of the event.

#### Scenario: Push bei aktiviertem Opt-in

- **GIVEN** Patrick hat opencode-Notifications in den Admin-Einstellungen aktiviert
- **WHEN** eine opencode-Session endet mit Exit-Code 0
- **THEN** sendet scripts/agent-push.sh einen POST an das Topic bachelorprojekt-opencode

#### Scenario: Kein Push bei deaktiviertem Opt-in

- **GIVEN** Opt-in ist deaktiviert (default)
- **WHEN** eine Session endet
- **THEN** sendet scripts/agent-push.sh keinen POST (fail-closed)

#### Scenario: Retry bei ntfy-Fehler

- **GIVEN** ntfy-Server ist nicht erreichbar
- **WHEN** scripts/agent-push.sh versucht zu senden
- **THEN** retryt 3x mit Backoff, beendet sich mit exit 0 (Session wird nicht blockiert)
