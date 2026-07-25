# Design Spec: Observability-Remediation (T002151)

## Summary
Systematische Behebung und Härtung der Observability-Architektur auf dem `fleet`-Cluster (mentolder & korczewski) in 5 disjunkten Partials.

## Context & Root Causes

1. **Logging-Pipeline (Promtail & Loki & OTLP):**
   - **pino Numeric Level:** Node.js Microservices/Backend (pino logger) emittieren numerische Levels (`30`=info, `40`=warn, `50`=error). Promtail extrahiert `level="50"`, was in Loki als `detected_level="unknown"` landet. Grafana Error-Rate-Panels filtern auf `level="error"` und schlagen deshalb fehl.
   - **Promtail Brand Relabeling:** In `k3d/monitoring/values/promtail-values.yaml` greift das Regex `.*` auf namespace match-all vor der korczewski Regel oder überschreibt es. Dadurch erhalten Pods aus `workspace-korczewski` das Label `brand="mentolder"`.
   - **otel-collector Traffic:** `scripts/factory/otel-emit.cjs` sendet seit 25 Tagen keinen Traffic an den OTLP Endpoint, da Fallbacks oder Host-Endpoints gefehlt haben bzw. Stillschweigen bei Netzwerkfehlern herrschte.

2. **Service Health Goals & Metrics Persistence:**
   - Fehlende historische Persistenz von Health-Check-Ergebnissen und Schwellwerten pro Service.
   - Ziel: Neue Tabellen `service_health_checks` und `service_health_goals` in PostgreSQL (`website`-DB), K8s CronJob zur periodischen Ausführung der Checks und Erweiterung des Admin-UI-Dashboards (`website/src/pages/admin/observability.astro`).

3. **Agent-Tracing & Config-Standard:**
   - Lokale opencode Subagenten-Läufe (`bonsai-8b-*`, `gemma-*`, `deepseek-helper`) sind bisher Black-Boxes.
   - Ziel: Vollständiges Tracing (Modell, Effort, Prompt, Tool-Call-Sequenz, Dauer) via `codebase-memory-mcp` `ingest_traces` API und Dokumentation in `.claude/skills/references/agent-config-standard.md`.

4. **Alertmanager Secret Reseed:**
   - Das Secret `alertmanager-pushover` im Namespace `monitoring` enthält leere 0-Byte Keys `PUSHOVER_USER` und `PUSHOVER_TOKEN`.
   - Alertmanager-Operator verwirft die AlertmanagerConfig-CRD stillschweigend trotz `Reconciled: True`.
   - Ziel: Skript + Manifest-Patch für sauberes Reseeding aus SealedSecrets/Umgebungsvariablen.

5. **Testing (Disjunkte QA):**
   - BATS-Tests für Promtail/OTLP Pipeline, Backend/DB-Tests für Health-Goals, Playwright E2E-Tests für Health-Goal Admin-UI, Alertmanager Verification Task.

## Frontmatter
```yaml
title: "Observability-Remediation: Logging-Pipeline, Service-Health-Goals, Agent-Tracing, Alertmanager-Fix"
ticket_id: T002151
domains: [ops, infra, db, website, test]
status: active
```
