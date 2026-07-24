## ADDED Requirements

### Requirement: Promtail maps numeric pino levels to text before labeling

The system SHALL insert a Promtail pipeline stage that translates pino's numeric
`level` field (10/20/30/40/50/60) to its textual equivalent (`trace`/`debug`/`info`/
`warn`/`error`/`fatal`) before the `level` Loki label is set, for every JSON log
source in the pipeline (not website-only).

#### Scenario: Numeric level becomes a queryable text label

- **GIVEN** a container writes `{"level":50,"msg":"boom"}` to stdout
- **WHEN** Promtail ships the line to Loki
- **THEN** the resulting stream carries the label `level="error"`, not `level="50"`

#### Scenario: Loki detected_level stops reporting unknown

- **GIVEN** the text-level mapping stage is active
- **WHEN** an operator queries a recent line via the Loki API
- **THEN** the response's `detected_level` field is `error`/`warn`/`info` (not `unknown`)

### Requirement: Grafana Log Explorer error panel matches text levels

The system SHALL update the `log-explorer` and `api-errors` Grafana dashboard
queries to filter on textual `level` label values, consistent with the Promtail
mapping stage.

#### Scenario: Error Rate by App panel returns data

- **GIVEN** error-level log lines exist in Loki for the current time range
- **WHEN** an operator opens the "Error Rate by App" panel in `log-explorer`
- **THEN** the panel renders non-empty series for those lines

### Requirement: Promtail brand relabeling is deterministic per namespace

The system SHALL configure Promtail's `brand` relabel rule so that a namespace
matching the korczewski pattern (`workspace-korczewski` / `website-korczewski`)
is labeled `brand="korczewski"`, and no later unconditional rule overwrites this
value with `mentolder`.

#### Scenario: korczewski namespace keeps its brand label

- **GIVEN** a pod runs in namespace `website-korczewski`
- **WHEN** Promtail relabels the log stream
- **THEN** the resulting stream carries `brand="korczewski"`

#### Scenario: mentolder namespace is unaffected

- **GIVEN** a pod runs in namespace `website`
- **WHEN** Promtail relabels the log stream
- **THEN** the resulting stream carries `brand="mentolder"`

### Requirement: Factory OTel metrics reach the otel-collector

The system SHALL ensure `scripts/factory/otel-emit.cjs` successfully delivers
`factory.phase.transition` / `factory.phase.duration` metrics to the
`monitoring/otel-collector` OTLP endpoint during factory-tick execution.

#### Scenario: Factory tick emits a received metric

- **GIVEN** a factory-tick run transitions a ticket's phase
- **WHEN** `otel-emit.cjs` runs for that transition
- **THEN** the otel-collector's Prometheus exporter exposes an updated
  `factory_phase_transition_total` sample within the same minute
