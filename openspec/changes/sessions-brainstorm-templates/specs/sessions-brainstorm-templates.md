## ADDED Requirements

### Requirement: Brainstorm-Session-Template-Selection

The system SHALL provide 5 pre-installed brainstorm templates (Feature-Intake, Retro, Grilling, Workshop, Spezifikation) selectable at session start.

#### Scenario: Template-Auswahl beim Session-Start

- **GIVEN** ein Admin öffnet den neuen Brainstorm-Modal
- **WHEN** der TemplatePicker lädt
- **THEN** sieht er 5 Default-Templates plus seine eigenen Custom-Templates

#### Scenario: Clone-and-Edit

- **GIVEN** ein Admin klickt "Clone" auf dem Grilling-Default
- **WHEN** der Clone-Dialog bestätigt wird
- **THEN** wird ein neuer Eintrag in sessions.templates mit is_default=false erstellt

#### Scenario: DB-Fallback

- **GIVEN** die sessions.templates-Tabelle ist nicht erreichbar
- **WHEN** templates.ts versucht Templates zu laden
- **THEN** fallen die Funktionen auf DEFAULT_TEMPLATES (hardcoded) zurück
