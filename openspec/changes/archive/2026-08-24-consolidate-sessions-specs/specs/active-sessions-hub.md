## MODIFIED Requirements

### Requirement: Session-Registry als Single Source of Truth

The system SHALL maintain a JSON registry at `~/.local/share/bachelorprojekt/active-sessions.json`.
Mutations SHALL be atomic (write to `.tmp` then `mv`) and SHALL be performed exclusively through
`scripts/session-hub.sh` subcommands. The normative definition of the registry entry schema and of
the lifecycle semantics (registration, listing, deregistration, reaping, idempotent
re-registration) SHALL live in the `sessions-server` SSOT spec (`openspec/specs/sessions-server.md`);
this spec SHALL NOT duplicate it. The `tunnel_pid` field is deprecated — the implementation writes
a constant `0` and no consumer reads it.

#### Scenario: Register schreibt einen Eintrag in eine leere Registry

- **GIVEN** die Registry-Datei existiert nicht oder ist leer
- **WHEN** `bash scripts/session-hub.sh register --name foo --port 18080 --type brainstorm --title "Foo"` aufgerufen wird
- **THEN** enthält die Registry genau einen Eintrag mit `slug=foo` und `public_url=https://session-foo.${SESSION_HUB_DOMAIN}`

#### Scenario: Registry-Mutationen laufen ausschließlich über session-hub.sh

- **GIVEN** eine bestehende Registry-Datei
- **WHEN** ein Eintrag erzeugt, geändert oder entfernt wird
- **THEN** geschieht dies über einen `scripts/session-hub.sh`-Subcommand (oder den von ihm
  aufgerufenen atomaren Schreibpfad), nicht durch ad-hoc-Bearbeitung der Datei
