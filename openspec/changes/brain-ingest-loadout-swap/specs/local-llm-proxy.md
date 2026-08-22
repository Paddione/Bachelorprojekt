## ADDED Requirements

### Requirement: A loadout pin blocks foreign start and stop

The proxy SHALL expose `POST /admin/loadouts/pin`, `GET /admin/loadouts/pin` and
`DELETE /admin/loadouts/pin`. A held pin SHALL record the pinned slug, the owning process id,
a human-readable reason, an acquisition timestamp and an opaque token returned to the acquirer.

While a pin is held, `POST /admin/loadouts/<slug>/start` and `POST /admin/loadouts/<slug>/stop`
SHALL be rejected with status `423` and error code `locked_by_pin` for every caller that does not
present the pin token. The rejection SHALL name the pinned slug and the owning process id, so the
operator can tell who holds it rather than only that something does.

A caller presenting the valid token SHALL be served normally. Acquiring a pin while another pin is
held SHALL fail with `409` unless the presented token matches the held pin.

The pin SHALL NOT affect request routing: pinning changes who may start and stop loadouts, not
which backend serves a completion.

#### Scenario: A foreign start is refused while a pin is held

- **GIVEN** a pin is held on `brain-ingest` by a live process
- **WHEN** `POST /admin/loadouts/gemma4/start` arrives without the pin token
- **THEN** the response is `423` with code `locked_by_pin` and names `brain-ingest` and the owner pid

#### Scenario: A foreign stop is refused while a pin is held

- **GIVEN** a pin is held on `brain-ingest` by a live process
- **WHEN** `POST /admin/loadouts/brain-ingest/stop` arrives without the pin token
- **THEN** the response is `423` with code `locked_by_pin`

#### Scenario: The pin owner may still switch loadouts

- **GIVEN** a pin is held on `brain-ingest`
- **WHEN** a start or stop request presents the matching pin token
- **THEN** the request is served normally

#### Scenario: No pin means no restriction

- **GIVEN** no pin is held
- **WHEN** `POST /admin/loadouts/gemma4/start` arrives
- **THEN** the request is served normally

### Requirement: A pin dies with its owner and fails closed when unreadable

Pin evaluation SHALL follow the liveness rules already established for the GPU lock in
`scripts/llm-proxy/gpu-lock.mjs`. A pin whose owning process no longer exists SHALL be discarded
and its state removed, so an ingest that crashed or was killed cannot freeze loadout selection
permanently.

Only "no such process" SHALL count as dead. A liveness check that fails because the process is not
ours SHALL count the pin as held, and a pin state that is unreadable, unparsable or carries no
valid process id SHALL likewise count as held. An unknown state is not an absent one.

#### Scenario: A pin held by a dead process is discarded

- **GIVEN** a pin naming a process id that no longer exists
- **WHEN** the pin is evaluated
- **THEN** it is reported as not held and the pin state is removed

#### Scenario: An unparsable pin state counts as held

- **GIVEN** a pin state that cannot be parsed
- **WHEN** the pin is evaluated
- **THEN** it is reported as held

#### Scenario: A pin without a valid process id counts as held

- **GIVEN** a pin state carrying no process id
- **WHEN** the pin is evaluated
- **THEN** it is reported as held

### Requirement: The brain ingest swaps to its own loadout and restores the previous one

The repository SHALL provide `scripts/brain-ingest-swap.sh`, which wraps `scripts/brain-ingest.sh`
and, in this order: record the currently running `chat-gpu` loadout, acquire a pin on
`brain-ingest`, drain, stop the recorded loadout, start `brain-ingest`, run the ingest, and then
restore the recorded loadout and release the pin.

The recorded loadout SHALL be read from `GET /admin/loadouts/status`, taking the entry reported as
running within `exclusiveGroup: "chat-gpu"`. If no such loadout runs, the swap SHALL record that
fact and restore to "nothing running" rather than starting an arbitrary loadout.

The ingest SHALL be invoked against the `brain-ingest` loadout's own port with the parallelism its
loadout declares, rather than against whichever backend a caller's environment happens to name.
Explicit environment overrides SHALL continue to win, so a run against a different backend stays
possible.

#### Scenario: The previously running loadout is restored

- **GIVEN** `gemma4` is the running `chat-gpu` loadout
- **WHEN** the swap wrapper runs the ingest to completion
- **THEN** `brain-ingest` is stopped and `gemma4` is running again

#### Scenario: Nothing was running before

- **GIVEN** no `chat-gpu` loadout is running
- **WHEN** the swap wrapper runs the ingest to completion
- **THEN** `brain-ingest` is stopped and no other loadout has been started

#### Scenario: The ingest targets the ingest loadout

- **GIVEN** the swap wrapper runs with no environment overrides
- **WHEN** the ingest is invoked
- **THEN** it is directed at the port and slot count declared by the `brain-ingest` loadout

### Requirement: The swap drains before it displaces, with a bounded wait

Before stopping the recorded loadout, the swap SHALL wait until no request is in flight on the
local GPU backends, polling `GET /admin/state` as `scripts/gpu-lock.sh` already does. Waiting
SHALL NOT cancel in-flight requests; a request already running is allowed to finish.

A bounded overall wait SHALL apply. On expiry the swap SHALL fail, release its pin, and leave the
recorded loadout running — it SHALL NOT displace a busy loadout and SHALL NOT start the ingest.

An unreachable or unparsable `/admin/state` SHALL abort the swap rather than be treated as
"nothing in flight".

#### Scenario: A busy loadout is not displaced

- **GIVEN** the recorded loadout keeps reporting in-flight requests past the wait deadline
- **WHEN** the swap wrapper runs
- **THEN** it exits non-zero, the pin is released, the recorded loadout is still running and the
  ingest was never started

#### Scenario: Draining completes and the swap proceeds

- **GIVEN** in-flight requests reach zero within the deadline
- **WHEN** the swap wrapper runs
- **THEN** the recorded loadout is stopped and `brain-ingest` is started

#### Scenario: An unreadable state aborts the swap

- **GIVEN** `/admin/state` cannot be parsed
- **WHEN** the swap wrapper drains
- **THEN** the swap aborts instead of proceeding

### Requirement: Restoration runs on failure and on abort

Restoration of the recorded loadout and release of the pin SHALL run whether the ingest succeeded,
failed, or was interrupted. The wrapper SHALL install the restoring handler for normal exit and
for interrupt and termination signals, and SHALL install it before it stops anything, so an abort
between stopping and starting still restores.

The wrapper SHALL propagate the ingest's exit status, so a failing ingest stays visible as a
failure after restoration.

#### Scenario: The ingest fails

- **GIVEN** the ingest exits non-zero
- **WHEN** the swap wrapper finishes
- **THEN** the recorded loadout is running again, the pin is released, and the wrapper exits
  non-zero

#### Scenario: The operator interrupts the run

- **GIVEN** the wrapper receives an interrupt while the ingest runs
- **THEN** the recorded loadout is running again and the pin is released

#### Scenario: The handler covers the window around stopping

- **GIVEN** the wrapper is interrupted after stopping the recorded loadout and before the ingest
  starts
- **THEN** the recorded loadout is started again and the pin is released

### Requirement: The ingest tasks do not contradict the ingest port

The `brain:ingest:*` tasks SHALL NOT carry a default backend URL that names a port other than the
one the `brain-ingest` loadout declares. The existing cross-declaration check SHALL be extended to
cover the task definitions, so a task default that walks away from the loadout port fails the same
way a script default already does.

#### Scenario: A task default naming a foreign port fails the check

- **GIVEN** a `brain:ingest:*` task declares a default backend URL on a port other than the
  `brain-ingest` loadout port
- **WHEN** the test suite runs
- **THEN** the check fails and names the offending task
