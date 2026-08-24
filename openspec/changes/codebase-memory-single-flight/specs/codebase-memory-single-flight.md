## ADDED Requirements

### Requirement: Single-flight index acquisition

The repo SHALL provide a cross-instance mutex for `codebase-memory-mcp`
full-index jobs so that at most one `index_repository` worker runs per project
at any time. An opencode plugin SHALL intercept `index_repository` tool calls
and gate them behind this mutex. A call that arrives while another instance
holds the lease SHALL fail fast (before starting any indexing work) with an
error that names the holding process and instructs the caller to use
`index_status` / graph queries against the existing store instead of
re-indexing.

#### Scenario: Second concurrent indexer fails fast

- **GIVEN** session A holds the index lease for project `p`
- **WHEN** session B invokes `index_repository` for `p`
- **THEN** the call is rejected immediately with a message naming session A's
  PID and recommending stale-graph reads, and no second index worker is started

#### Scenario: Free lock allows indexing

- **GIVEN** no lease exists for project `p`
- **WHEN** a session invokes `index_repository` for `p`
- **THEN** the lease is acquired and the call proceeds normally

### Requirement: Owner-scoped release and stale-lease takeover

The lease SHALL record its owner (PID, random token, acquisition time). Release
SHALL only succeed for the recorded owner token. A lease whose age exceeds a
configurable threshold (default 20 minutes) SHALL be considered stale and MAY
be taken over by a new acquirer, so crashed sessions cannot deadlock indexing
forever.

#### Scenario: Crashed session leaves recoverable lease

- **GIVEN** a session acquired the lease and died without releasing, and the
  lease is older than the stale threshold
- **WHEN** another session attempts to acquire
- **THEN** the stale lease is taken over and indexing proceeds

#### Scenario: Fresh foreign lease blocks takeover

- **GIVEN** a live session holds a lease younger than the stale threshold
- **WHEN** another session attempts to acquire
- **THEN** acquisition fails and the existing lease remains untouched

### Requirement: Fail-open guard infrastructure

The gating plugin SHALL degrade open: if the mutex script is missing,
unexecutable, or the lock directory is not writable, `index_repository` calls
SHALL proceed (with a warning) rather than being blocked. Guard defects MUST
NOT make indexing permanently unavailable.

#### Scenario: Broken guard does not brick indexing

- **GIVEN** the mutex script cannot be executed (missing or unwritable dir)
- **WHEN** a session invokes `index_repository`
- **THEN** the call proceeds and a warning is emitted describing the bypass
