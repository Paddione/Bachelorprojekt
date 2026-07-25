# Spec Delta: observability-remediation

## ADDED Requirements

### Requirement: Promtail Pino Numeric Level Mapping & Brand Relabeling
Promtail MUST extract numeric pino levels (`30`, `40`, `50`) and map them to text labels (`info`, `warn`, `error`). Promtail MUST correctly label logs from namespace `workspace-korczewski` as `brand="korczewski"`.

### Requirement: OTLP Collector Traffic Hardening
`scripts/factory/otel-emit.cjs` MUST resolve valid OTLP collector endpoints and retry on network failure without silently dropping metric emission.

### Requirement: Service Health Goals & Historical Metrics
The platform MUST store service health metrics in `service_health_checks` and `service_health_goals` PostgreSQL tables and execute periodic evaluations via K8s CronJob.

### Requirement: Agent Tracing Instrumentation
Subagent executions MUST be instrumented and ingested into codebase-memory-mcp via `ingest_traces`.

### Requirement: Alertmanager Secret Reseed
Secret `alertmanager-pushover` MUST contain valid non-empty credentials for Pushover notifications.
