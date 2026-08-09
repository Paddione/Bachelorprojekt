## ADDED Requirements

### Requirement: Spec-Tests SHALL NOT mutate tracked repository files

A `tests/spec/*.bats` test SHALL NOT leave the working tree in a state different from the
one before the test ran — neither in content nor in modification time — when it invokes a
task or script that regenerates tracked, committed output files. Where the test's purpose is
to assert "the tracked file is up to date", it SHALL perform the regeneration into an
untracked/tempdir location and diff against that, rather than overwriting the tracked file
in place.

#### Scenario: Freshness-style assertion regenerates into a tempdir

- **GIVEN** a spec test that asserts a generated, tracked Markdown file (e.g.
  `docs/agent-guide/maps/agents-map.md`) is up to date with its emitter
- **WHEN** the test runs the emitter to check freshness
- **THEN** the emitter writes its output to a tempdir path, and the test diffs that tempdir
  output against the tracked file, without overwriting the tracked file or changing its
  modification time

#### Scenario: Regenerating in place is rejected by the spec-tracked-file-guard

- **GIVEN** a spec test that calls a task wrapper (e.g. `task agent-guide:maps`) that writes
  directly to tracked file paths under `docs/agent-guide/maps/`
- **WHEN** the spec-tracked-file-guard runs after the spec suite in CI
- **THEN** the guard reports the tracked files as changed (by content or mtime), flagging the
  test as a working-tree mutator

### Requirement: Spec-Tests SHALL NOT rely on a fixed sleep to synchronize with background processes

A `tests/spec/*.bats` test that starts a background process (e.g. a helper HTTP server) and
then asserts something about reachability or behavior of that process SHALL wait for the
process's actual readiness signal (e.g. successful TCP connect to its port) with a bounded
retry loop, instead of a single fixed `sleep` duration. A positive-anchor assertion
(T002356-M1) that exists to prove a healthy dependency is reachable SHALL fail only because
the dependency is genuinely unreachable — not because a fixed wait was too short under load.

#### Scenario: A background HTTP server readiness wait uses active polling

- **GIVEN** a spec test that starts one or more Python `http.server` instances as background
  processes for a probe test
- **WHEN** the test needs to wait for those servers to be ready to accept connections
- **THEN** it polls each server's port (e.g. via `/dev/tcp/127.0.0.1/<port>`) in a bounded
  retry loop with a short interval and an explicit timeout, rather than a single fixed
  `sleep <N>`

#### Scenario: Under artificial CPU load, the positive anchor still passes once the server is ready

- **GIVEN** the same background-HTTP-server spec test running under contention (e.g. parallel
  spec shards or synthetic load)
- **WHEN** the test's active-wait loop is used instead of a fixed sleep
- **THEN** the positive-anchor assertion (verifying the healthy server is reported as
  reachable) passes once the server actually starts accepting connections, regardless of
  scheduling delay, up to the configured timeout
