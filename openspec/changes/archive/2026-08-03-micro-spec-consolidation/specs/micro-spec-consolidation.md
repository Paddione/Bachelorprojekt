## ADDED Requirements

### Requirement: Consolidation of Micro-Specs into Parent SSOT Specs

The system SHALL consolidate isolated micro-spec deltas into their corresponding parent SSOT
specification files under `openspec/specs/`, so that ticket-shaped micro-specs are merged
into their parent specs instead of remaining as orphaned standalone deltas.

#### Scenario: Validation after consolidation passes cleanly

- **GIVEN** 10 micro-specs merged into parent SSOT specs
- **WHEN** running `task openspec:validate`
- **THEN** all parent specs pass validation and no orphaned micro-specs remain

#### Scenario: Micro-Specs sind in ihre Parent-Specs gemergt

- **GIVEN** die Micro-Specs `coaching-studio-empty-customer-fallback`, `dora-dashboard`,
  `admin-content-db`, `agent-push-notifications`, `ai-ticket-auto-triage`,
  `contact-form-tab-fix`, `admin-nav-accordion`, `studio-sessions-reorganize`,
  `agent-behavior` und `decouple-tickets-db`
- **WHEN** die Konsolidierung abgeschlossen ist
- **THEN** sind alle in ihre jeweiligen Parent-Specs gemergt
- **AND** die Kleinst-Specs sind archiviert oder gelöscht
