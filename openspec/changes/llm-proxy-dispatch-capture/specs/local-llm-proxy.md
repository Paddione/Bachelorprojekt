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

### Requirement: Correlation headers bind a dispatch to its originating work

The factory dispatch path SHALL send `x-slot-id`, `x-dispatch-ticket` and `x-dispatch-partial`
with each call it makes through the proxy, and the recorded row SHALL carry those values. When a
caller omits them — tab-selected opencode work, manual calls — the corresponding columns SHALL
remain `NULL`. Deriving the correlation by other means, such as matching timestamps against
`factory_phase_events`, is not permitted: with parallel slots that is a guess, and a guess
presented as a recorded fact is worse than an empty column.

Setting `x-slot-id` also activates the per-slot queue isolation in `slot-queue.mjs`, which until
now keyed every request on `backend.name` alone because no caller ever sent the header.

#### Scenario: A factory dispatch carries its ticket and partial into the row

- **GIVEN** the factory dispatches a partial through the proxy
- **WHEN** the dispatch is recorded
- **THEN** the row carries the slot id, the ticket external id and the partial id sent by the
  caller

#### Scenario: A dispatch without correlation headers leaves the columns empty

- **GIVEN** a caller that sends no correlation headers
- **WHEN** the dispatch is recorded
- **THEN** the slot, ticket and partial columns are `NULL` and no value is inferred from timing

#### Scenario: Per-slot isolation takes effect once the header is sent

- **GIVEN** two concurrent requests to the same backend carrying different `x-slot-id` values
- **WHEN** both are enqueued
- **THEN** each is admitted against its own semaphore rather than queuing behind the other

### Requirement: Recordings are retained for a bounded window

Rows in `tickets.llm_proxy_request_log` SHALL be removed after 14 days by an invocable maintenance
task, following the pattern already established for `ai_call_log`.

#### Scenario: The cleanup task removes rows past the window

- **GIVEN** rows older and newer than 14 days
- **WHEN** the cleanup task runs
- **THEN** only the rows older than 14 days are removed
