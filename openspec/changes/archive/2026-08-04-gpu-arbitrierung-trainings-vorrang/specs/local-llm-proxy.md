## ADDED Requirements

### Requirement: Training lock signals GPU occupancy

The repository SHALL provide `scripts/gpu-lock.sh` with the verbs `acquire`, `release`
and `status`. `acquire` SHALL write a lock file containing at least the acquiring process
id, an acquisition timestamp and a human-readable reason. `release` SHALL remove it.
`status` SHALL report whether a lock is held and, if so, by which process.

The lock file path SHALL be overridable by environment variable so the behaviour can be
exercised against fixtures without touching the real lock.

#### Scenario: acquire writes a lock carrying the process id

- **GIVEN** no lock file exists
- **WHEN** `scripts/gpu-lock.sh acquire` runs successfully
- **THEN** the lock file exists and contains the acquiring process id and a timestamp

#### Scenario: release removes the lock

- **GIVEN** a lock file written by `acquire`
- **WHEN** `scripts/gpu-lock.sh release` runs
- **THEN** the lock file no longer exists and `status` reports no lock held

#### Scenario: status distinguishes held from free

- **GIVEN** no lock file exists
- **WHEN** `scripts/gpu-lock.sh status` runs
- **THEN** it exits zero and reports that no lock is held

### Requirement: Acquisition drains before it stops, and proves free VRAM

`acquire` SHALL, in order: write the lock, wait until no request is in flight on the
local GPU backends, stop the loadouts of the `chat-gpu` exclusive group, and only then
verify that sufficient GPU memory is actually free.

Waiting SHALL NOT cancel in-flight requests; a request that is already running is allowed
to finish. A bounded overall wait SHALL apply so that `acquire` cannot hang indefinitely;
on expiry `acquire` SHALL fail and release its lock rather than cancel anything.

The success condition SHALL be measured free GPU memory, NOT the number of units stopped.
Because every loadout runs with `--fit on`, which silently offloads layers to host RAM
instead of failing, a stop-count would report success while the training run degrades
invisibly.

If insufficient memory is free after stopping the managed loadouts, `acquire` SHALL fail
and name the remaining holder with its process id, port and model, then release its lock.

#### Scenario: acquisition fails when memory stays occupied

- **GIVEN** a holder that keeps GPU memory allocated and is not a managed loadout
- **WHEN** `acquire` runs and the measured free memory stays below the required amount
- **THEN** it exits non-zero, its output names the remaining holder, and no lock file is
  left behind

#### Scenario: an in-flight request is awaited, not cancelled

- **GIVEN** a request in flight on a local backend
- **WHEN** `acquire` runs
- **THEN** the request completes normally and the stop step begins only afterwards

#### Scenario: the bounded wait fails instead of cancelling

- **GIVEN** a backend that never reports its in-flight count returning to zero
- **WHEN** `acquire` runs and the bounded wait expires
- **THEN** it exits non-zero, no request was cancelled, and no lock file is left behind

### Requirement: The proxy treats a held lock as draining, not as unhealthy

While the lock is held, the proxy SHALL treat backends of kind `llamacpp` and `lmstudio`
as `draining` — a state distinct from both `healthy` and `unhealthy`. Draining backends
SHALL NOT be selected for new requests, SHALL NOT enter the unhealthy backoff, and SHALL
NOT emit the unhealthy log line. The transition into and out of draining SHALL be logged
once each, naming the backend and the lock as the cause.

Which backends drain SHALL be decided by their `kind`, never by a hard-coded list of
backend names, so a newly added local backend is covered without a code change.

`/admin/state` SHALL expose the draining state and the lock information.

`/health` SHALL remain green while any backend can still serve. `/health` answers
readiness — during draining the proxy can be served, via the remote backend on the next
priority — so reporting unready would be the very deception the endpoint is meant to
prevent.

#### Scenario: a held lock removes local backends from selection

- **GIVEN** a held training lock whose process is alive
- **WHEN** the proxy selects a backend for a chat completion
- **THEN** it selects the remote backend and no `llamacpp` backend

#### Scenario: draining does not look like a failure

- **GIVEN** a held training lock
- **WHEN** the proxy evaluates backend health
- **THEN** the drained backends are reported as draining, not unhealthy, and no unhealthy
  log line is emitted for them

#### Scenario: health stays green while a remote backend can serve

- **GIVEN** a held training lock and a reachable remote backend
- **WHEN** `/health` is requested
- **THEN** it reports ready

#### Scenario: draining is decided by kind

- **GIVEN** a backend of kind `llamacpp` whose name appears in no list in the source
- **WHEN** a lock is held
- **THEN** that backend drains as well

### Requirement: An orphaned lock does not hold the GPU hostage

The proxy SHALL verify on each registry poll that the process named in the lock file is
still alive. A lock whose process has died SHALL be treated as absent and the lock file
removed, so a crashed training run cannot keep the local backends drained indefinitely.

A lock file that cannot be read or parsed SHALL be treated as held, and the condition
SHALL be logged prominently. This direction is deliberate: treating a damaged lock as
absent risks destroying a running multi-hour training run, whereas treating it as held
costs only remote inference, because the fallback works.

#### Scenario: a lock from a dead process is discarded

- **GIVEN** a lock file naming a process id that is no longer alive
- **WHEN** the proxy evaluates the lock
- **THEN** it treats no lock as held and removes the stale lock file

#### Scenario: an unreadable lock file counts as held

- **GIVEN** a lock file whose contents cannot be parsed
- **WHEN** the proxy evaluates the lock
- **THEN** it treats the lock as held and logs the unreadable lock file

### Requirement: The externally managed GPU holder is part of the exclusive group

`scripts/llm/loadouts.json` SHALL carry an entry for the Unsloth Studio inference server
with `exclusiveGroup: chat-gpu` and a marker identifying it as externally managed. Unlike
every other loadout it has no systemd unit: it is started as a child of the Unsloth
Studio process, so its liveness SHALL be determined from its port and process rather than
from unit state.

`findExclusiveConflict` SHALL report a conflict against this entry exactly as it does for
unit-backed loadouts, so that the single shared definition of conflict keeps covering
every GPU holder.

An externally managed loadout SHALL NOT be terminated by signal from the lock path. It is
stopped through its owner's interface if that is available; otherwise `acquire` fails and
names it. A holder that the tooling does not own is reported, not killed.

#### Scenario: the external holder participates in conflict detection

- **GIVEN** the externally managed entry is active
- **WHEN** `findExclusiveConflict` is called for another loadout of group `chat-gpu`
- **THEN** it reports a conflict naming the external entry

#### Scenario: liveness of the external holder comes from its port

- **GIVEN** an externally managed loadout entry with no systemd unit
- **WHEN** its active state is evaluated
- **THEN** the evaluation uses port and process rather than unit state and does not error
  on the missing unit
