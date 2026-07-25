# Partial 1: Logging-Pipeline Fixes

Fixes Promtail pino numeric level mapping, Promtail brand relabeling regex bug for korczewski namespace, and otel-emit.cjs OTLP exporter traffic forwarding.

## Target Files
`k3d/monitoring/values/promtail-values.yaml`
`scripts/factory/otel-emit.cjs`

## Tasks

- [ ] Task 1.1: Fix Promtail pipelineStages in `k3d/monitoring/values/promtail-values.yaml` to map numeric levels (50->error, 40->warn, 30->info) and fix namespace regex for brand label assignment (`workspace-korczewski` -> `korczewski`).
- [ ] Task 1.2: Harden `scripts/factory/otel-emit.cjs` OTLP endpoint fallback resolution and error handling to ensure continuous metric/trace emission without silent failure.
