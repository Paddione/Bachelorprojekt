## MODIFIED Requirements

### Requirement: Optional vision-assisted verification (REQ-k8-04)

Where visual elements must be judged, the agent MAY delegate screenshots to the local
vision-capable loadout rather than asserting on the DOM alone. The endpoint is the local
llm-proxy, and the model is addressed by its registered alias — not by a raw server port.

The previous wording named port 8094 as the dedicated vision endpoint and port 8091 as its
fallback. Neither can serve a vision request: 8094 has no entry in `scripts/llm/loadouts.json`,
and the loadout on 8091 (`gemma26-factory`) carries no `mmprojPath`. Any client written against
that wording fails silently.

#### Scenario: Screenshot is validated by the vision model

- **GIVEN** the local llm-proxy is reachable on `127.0.0.1:18235`
- **AND** a backend row serves the model alias `gemma12-vision`
- **WHEN** the agent needs to verify a visual element
- **THEN** it POSTs the screenshot to `/v1/chat/completions` on the proxy with model
  `gemma12-vision` and validates the answer

#### Scenario: No vision endpoint is reachable

- **GIVEN** the llm-proxy does not answer, or no backend serves `gemma12-vision`
- **WHEN** a vision-assisted verification is attempted
- **THEN** the attempt is recorded as skipped with the reason
- **AND** the surrounding test run is NOT failed by the missing endpoint

## ADDED Requirements

### Requirement: Vision-judged visual sweep (REQ-vs-01)

The route visual sweep SHALL be able to submit each captured screenshot to the vision model
and record a structured verdict alongside the existing DOM-derived result row.

#### Scenario: Verdict is recorded per swept route

- **GIVEN** the vision stage is enabled for a sweep run
- **WHEN** a route has been captured
- **THEN** a verdict object for that route is written to the sweep's vision result file
- **AND** the verdict carries the route, the brand, the viewport and the detected issues

#### Scenario: Vision stage is off by default

- **GIVEN** a sweep run without the vision stage explicitly enabled
- **WHEN** the sweep executes
- **THEN** no request is sent to the vision model
- **AND** the sweep's existing result rows are unchanged

### Requirement: Vision verdicts never fail a test (REQ-vs-02)

A negative or missing vision verdict SHALL NOT change the outcome of the sweep run. The stage
reports; it does not gate. A 12B model judging screenshots is not a reliable pass/fail oracle,
and a flaky gate on a non-CI stage would be ignored rather than acted upon.

#### Scenario: A route is judged defective

- **GIVEN** the vision model reports a defect for one route
- **WHEN** the sweep run finishes
- **THEN** the run's exit status is the same as it would be without the vision stage
- **AND** the reported defect is visible in the vision result file

### Requirement: Bounded concurrency against the vision model (REQ-vs-03)

The vision stage SHALL hold at most three requests in flight at any time, matching the three
measured slots of the `gemma12-vision` loadout. The bound is enforced by running at most three
sweep workers, each of which is serial and therefore holds at most one request.

#### Scenario: Concurrency bound is derived from the worker count

- **GIVEN** the sweep runs with three workers
- **WHEN** the vision stage is active
- **THEN** at most three vision requests are in flight simultaneously

### Requirement: Structured, parseable verdicts (REQ-vs-04)

The vision request SHALL constrain the model to a fixed response shape, so the verdict can be
consumed without free-text parsing. A prose answer that has to be regex-matched is the failure
mode this requirement exists to prevent.

#### Scenario: Model output is schema-constrained

- **GIVEN** a vision request is issued
- **WHEN** the request is built
- **THEN** it carries a response-format constraint describing the verdict shape
- **AND** a response that does not satisfy the shape is recorded as an unusable verdict rather
  than being partially parsed
