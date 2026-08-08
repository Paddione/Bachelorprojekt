## MODIFIED Requirements

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

#### Scenario: A loadout without an exclusiveGroup does not block

- **GIVEN** only `bge-embed-cpu` is active (no `exclusiveGroup` since T002729)
- **WHEN** `POST /admin/loadouts/gemma26-factory/start` is requested
- **THEN** the start proceeds

#### Scenario: Both start paths share one conflict definition

- **GIVEN** the same set of active loadouts
- **WHEN** the conflict is evaluated for the auto-start path and for the explicit start path
- **THEN** both report the same blocking slug and group

## ADDED Requirements

### Requirement: bge-CPU loadouts start in parallel without an exclusiveGroup

The two bge-CPU loadouts (`bge-embed-cpu`, `bge-rerank-cpu`) SHALL NOT share an `exclusiveGroup`
and SHALL be startable simultaneously. `exclusiveGroup` models VRAM exclusivity — both loadouts
run CPU-bound (`args.ngl: 0`, `env.CUDA_VISIBLE_DEVICES: ""`) and allocate no VRAM, so the group
that previously serialized them (embedding and reranking are the two halves of the same RAG query)
has no justification.

The CPU-bound configuration SHALL remain in place and SHALL stay guarded by
`tests/spec/local-llm-proxy/bge-loadout-cpu-bound.bats`; that suite's group-absence assertion
SHALL anchor on a control group (a known GPU loadout reports `chat-gpu`) instead of asserting
that any group exists on the bge loadouts (T002356-M1).

`tests/spec/local-llm-proxy/bge-cpu-parallel-start.bats` SHALL assert that starting the second
bge-CPU loadout while the first runs succeeds without `exclusive_conflict`.

#### Scenario: Both bge-CPU loadouts run simultaneously

- **GIVEN** `bge-rerank-cpu` is active on port 8096
- **WHEN** `POST /admin/loadouts/bge-embed-cpu/start` is requested
- **THEN** the start succeeds (no `exclusive_conflict`) and both `/health` endpoints answer `200`

#### Scenario: The guard checks group absence via a control group

- **GIVEN** a known GPU loadout (`gptoss-context`) reports `exclusiveGroup: "chat-gpu"`
- **WHEN** the spec suite asserts the bge-CPU loadouts are not in `chat-gpu`
- **THEN** the assertion holds without requiring any group to exist on the bge loadouts
