# langfuse-agent-tracing — Proposal

_Ticket: T900688_

## Warum

Agenten-Sessions (Claude Code, OpenCode, Pi, Codex) inklusive ihrer Subagenten sind heute nur in
lokalen Transkripten sichtbar. Der vorhandene `otel-collector` auf fleet sammelt nur Metriken und
Logs des Factory-Autopiloten. Es fehlt eine Stelle, an der man Prompts, Tool-Calls, Token-Kosten
und die Subagent-Hierarchie einer Session nachvollziehen und über Sessions vergleichen kann.

## Was

1. Self-hosted Langfuse v4 auf devmesh (`dev-local/components/langfuse`): Web, Worker, ClickHouse,
   Valkey, MinIO, DB `langfuse` in `shared-db`, Headless-Init mit Projekt `agent-tracing`.
2. OTel-Collector `langfuse-otel-redact` vor dem OTLP-Ingest, der Secret-Muster maskiert.
3. `scripts/langfuse/client-env.sh` und `scripts/langfuse/setup-harnesses.sh` verdrahten die vier
   Harnesses mit ihren offiziellen Langfuse-Plugins, Keys bleiben außerhalb des Repos.
4. Langfuse-Skill repo-weit über `skills-lock.json`.
5. BATS-Guard `tests/spec/langfuse-agent-tracing.bats` und ein Live-Self-Audit der Traces gegen
   https://langfuse.com/docs/observability/best-practices.

Design und Entscheidungen D1–D7: `design.md`.
