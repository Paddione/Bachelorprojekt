# active-sessions-hub

## Purpose

Das Active Sessions Hub ist ein lokales Dev-Only-Feature, das laufende Dev-Sessions (HTML-Formulare, Brainstorm-Boards, Visual Companions) als klickbare Karten im Mediaviewer-Panel der Website sichtbar macht. Externe Nutzer (z.B. `gekko`) erreichen diese Sessions über Keycloak-gate-geschützte `sish`-Reverse-SSH-Tunnels hinter `session-*.${DEV_DOMAIN}`.

## Requirements

### Requirement: Session-Registry als Single Source of Truth

The system SHALL maintain a JSON registry at `~/.local/share/bachelorprojekt/active-sessions.json` whose entries describe one dev session each with the fields `{slug, type, title, port, public_url, local_url, tunnel_pid, server_pid, started_at}`. Mutations SHALL be atomic (write to `.tmp` then `mv`) and SHALL be performed exclusively through `scripts/session-hub.sh` subcommands.

#### Scenario: Register schreibt einen Eintrag in eine leere Registry

- **GIVEN** die Registry-Datei existiert nicht oder ist leer
- **WHEN** `bash scripts/session-hub.sh register --name foo --port 18080 --type brainstorm --title "Foo"` aufgerufen wird
- **THEN** enthält die Registry genau einen Eintrag mit `slug=foo` und `public_url=https://session-foo.${DEV_DOMAIN}`

#### Scenario: Register ist idempotent pro Slug (replace statt duplicate)

- **GIVEN** ein Eintrag mit `slug=dup` ist bereits in der Registry
- **WHEN** `register --name dup --port 2 --type form --title "v2"` ein zweites Mal aufgerufen wird
- **THEN** enthält die Registry genau einen Eintrag mit `slug=dup` und `port=2` (kein Duplikat)

#### Scenario: Reap entfernt Einträge deren PIDs nicht mehr laufen

- **GIVEN** ein Registry-Eintrag referenziert `tunnel_pid=999999` und `server_pid=999999`
- **WHEN** `bash scripts/session-hub.sh reap` aufgerufen wird
- **THEN** wird der Eintrag aus der Registry entfernt

<!-- from archive/2026-06-21-active-sessions-hub/tasks.md lines 50-244, 280-700 -->
