## ADDED Requirements

### Requirement: Dispatch capture at the proxy chokepoint

Every `POST` to a `/v1/*` path SHALL be recorded in `tickets.llm_proxy_request_log` with its
request body, its response body, and the header data describing the call (timestamp, backend,
served model, duration, HTTP status, prompt and completion token counts where the backend reports
them).

Capture SHALL be free of effect on the transport. The write SHALL NOT be awaited on the request
path, and a failure to record SHALL NOT change the response the client receives, its timing, or
its status. When the ticket database is unreachable, the proxy continues to serve requests and
loses only the recordings.

#### Scenario: A non-streaming dispatch is recorded in full

- **GIVEN** a healthy backend and a reachable ticket database
- **WHEN** a client posts a non-streaming chat completion through the proxy
- **THEN** the response reaching the client is unchanged, and a row exists carrying the full
  request body, the full response body, the backend name, the served model, the duration and HTTP
  status

#### Scenario: An unreachable database does not break the dispatch

- **GIVEN** the ticket database refuses connections
- **WHEN** a client posts a chat completion through the proxy
- **THEN** the client receives the backend's response with the same status and body as it would
  with a reachable database, and no row is written

### Requirement: Recordings are written in batches, never per dispatch

Recordings SHALL be buffered in memory and flushed to the database in batches, at most a few
seconds apart, using a single database invocation per flush. The proxy SHALL NOT open a database
invocation per dispatch: the only available access path is
`kubectl exec -i <pod> -- psql` (`factory_psql` in `scripts/factory/lib.sh`), which costs a process
spawn per call and must not sit in the request path.

A pending buffer SHALL be flushed on graceful shutdown. Recordings still buffered when the process
dies unexpectedly are lost; this is accepted, bounded by the flush interval, and SHALL NOT be
compensated by writing synchronously.

#### Scenario: Many dispatches produce few database invocations

- **GIVEN** twenty dispatches complete within one flush interval
- **WHEN** the buffer is flushed
- **THEN** all twenty rows are present and the flush used a single database invocation

#### Scenario: Shutdown flushes what is pending

- **GIVEN** recordings sit in the buffer unflushed
- **WHEN** the proxy shuts down gracefully
- **THEN** those recordings are written before the process exits

### Requirement: Streaming responses are captured without touching the transport

Streaming responses SHALL be captured by a passive collector running alongside the existing pipe.
The collector SHALL NOT modify, delay, or gate the bytes reaching the client, and any error inside
it SHALL discard the recording rather than propagate.

When the upstream stream ends before the backend signals completion, the row SHALL still be
written and SHALL carry `stream_incomplete = true`. Omitting the row is not permitted: an absent
row is indistinguishable from a dispatch that never happened, which is the silent substitute value
that `sdlc-cockpit.md` forbids.

#### Scenario: A streaming dispatch reaches the client unchanged and is recorded

- **GIVEN** a backend that answers with a token stream
- **WHEN** a client posts a streaming chat completion through the proxy
- **THEN** the client receives byte-for-byte the same stream it would receive without capture, and
  a row exists whose response body is the reassembled stream content

#### Scenario: A backend that dies mid-stream leaves a marked row and a live queue

- **GIVEN** a backend that closes the connection after the first chunks
- **WHEN** a client posts a streaming chat completion through the proxy
- **THEN** the client keeps the chunks it already received, a subsequent request on the same
  backend is still served, and the row carries `stream_incomplete = true`

### Requirement: Oversized bodies are truncated visibly

A request or response body SHALL be stored in full up to 256 KiB per field. Beyond that the stored
value SHALL be truncated, and the row SHALL carry `truncated = true` together with
`original_bytes` holding the untruncated size.

#### Scenario: A body beyond the limit is marked rather than silently cut

- **GIVEN** a request body larger than 256 KiB
- **WHEN** the dispatch is recorded
- **THEN** the stored body is truncated to the limit, `truncated` is true, and `original_bytes`
  reports the size before truncation

### Requirement: The proxy records correlation headers when a caller sends them

The proxy SHALL read `x-slot-id`, `x-dispatch-ticket` and `x-dispatch-partial` from the incoming
request and store them on the recorded row. When a caller omits them, the corresponding columns
SHALL remain `NULL`. Deriving the correlation by other means, such as matching timestamps against
`factory_phase_events`, is not permitted: with parallel slots that is a guess, and a guess
presented as a recorded fact is worse than an empty column.

**Callers that go through opencode cannot currently supply per-dispatch values.** The opencode
configuration schema (`https://opencode.ai/config.json`) admits no `headers` field under
`provider.<name>.options` — the permitted keys are `apiKey`, `baseURL`, `enterpriseUrl`,
`setCacheKey` and the timeout family. Headers exist only under
`provider.<name>.models.<model>.headers`, which is static configuration and therefore cannot carry
a value that changes per dispatch. Since the factory dispatches by spawning opencode
(`scripts/factory/sandbox-run.sh`), its ticket and partial cannot reach the proxy this way. The
columns consequently stay `NULL` for that path, which this requirement permits rather than papers
over. Closing that gap is separate work.

#### Scenario: A caller that sends the headers is correlated

- **GIVEN** a request carrying `x-slot-id`, `x-dispatch-ticket` and `x-dispatch-partial`
- **WHEN** the dispatch is recorded
- **THEN** the row carries exactly those values

#### Scenario: A dispatch without correlation headers leaves the columns empty

- **GIVEN** a caller that sends no correlation headers
- **WHEN** the dispatch is recorded
- **THEN** the slot, ticket and partial columns are `NULL` and no value is inferred from timing

### Requirement: Recordings are retained for a bounded window

Rows in `tickets.llm_proxy_request_log` SHALL be removed after 14 days by an invocable maintenance
task, following the pattern already established for `ai_call_log`.

#### Scenario: The cleanup task removes rows past the window

- **GIVEN** rows older and newer than 14 days
- **WHEN** the cleanup task runs
- **THEN** only the rows older than 14 days are removed
