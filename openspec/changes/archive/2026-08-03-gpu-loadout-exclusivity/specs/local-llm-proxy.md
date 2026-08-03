## ADDED Requirements

### Requirement: Explicit loadout start honours exclusiveGroup

The explicit start endpoint (`POST /admin/loadouts/<slug>/start`) SHALL refuse to start a loadout
while another loadout sharing its `exclusiveGroup` is active, and SHALL do so with the same error
code (`exclusive_conflict`), the same HTTP status (409) and the same wording as the auto-start
path already uses. The proxy SHALL NOT stop the conflicting loadout by itself; the message SHALL
name the blocking slug, the shared group and the stop command.

The conflict predicate SHALL be defined exactly once and be shared by both start paths, so the
two cannot drift apart. A loadout that is itself already active SHALL NOT count as its own
conflict — that case remains `already_running`.

Loadouts without an `exclusiveGroup`, and loadouts in a different group, SHALL NOT block a start.

#### Scenario: Explicit start is refused across port boundaries

- **GIVEN** `gemma9-factory` (group `chat-gpu`, port 8092) is active
- **WHEN** `POST /admin/loadouts/gemma26-factory/start` is requested (group `chat-gpu`, port 8091)
- **THEN** the response is `409` with code `exclusive_conflict`, the message names
  `gemma9-factory` and its stop command, and no unit is started or stopped

#### Scenario: A different exclusive group does not block

- **GIVEN** only `bge-embed-cpu` (group `bge-cpu`) is active
- **WHEN** `POST /admin/loadouts/gemma26-factory/start` is requested
- **THEN** the start proceeds

#### Scenario: Both start paths share one conflict definition

- **GIVEN** the same set of active loadouts
- **WHEN** the conflict is evaluated for the auto-start path and for the explicit start path
- **THEN** both report the same blocking slug and group
