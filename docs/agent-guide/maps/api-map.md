# API-Endpoint-Register

<!-- GENERIERT aus docs/agent-guide/registry/api.yaml — nicht von Hand editieren.
     Neu erzeugen: task api:map · Prüfen: task api:check -->

Jede SDLC-API-Route mit Auth-Klasse und Tier. Mengengerüst: `api-inventory.json`
(Scan + Overlay); Kuratierung: diese Registry. Auth-Gate: `api-auth-check.mjs`.

| Endpoint | Auth | Tier | Quelle |
|---|---|---|---|
| `/sdlc/api/agents-overview` | admin | — | components/website/src/pages/sdlc/api/agents-overview.ts |
| `/sdlc/api/ai-quality` | admin | — | components/website/src/pages/sdlc/api/ai-quality.ts |
| `/sdlc/api/backup-status` | admin | — | components/website/src/pages/sdlc/api/backup-status.ts |
| `/sdlc/api/cluster/graph` | admin | — | components/website/src/pages/sdlc/api/cluster/graph.ts |
| `/sdlc/api/cluster/logs` | admin | — | components/website/src/pages/sdlc/api/cluster/logs.ts |
| `/sdlc/api/cluster/pods-list` | admin | — | components/website/src/pages/sdlc/api/cluster/pods-list.ts |
| `/sdlc/api/cluster/status` | public | — | components/website/src/pages/sdlc/api/cluster/status.ts |
| `/sdlc/api/cluster/warnings` | admin | — | components/website/src/pages/sdlc/api/cluster/warnings.ts |
| `/sdlc/api/cockpit-budget` | admin | — | components/website/src/pages/sdlc/api/cockpit-budget.ts |
| `/sdlc/api/cockpit-control` | admin | — | components/website/src/pages/sdlc/api/cockpit-control.ts |
| `/sdlc/api/cockpit-floor` | admin | — | components/website/src/pages/sdlc/api/cockpit-floor.ts |
| `/sdlc/api/cockpit-floor/[extId]` | admin | — | components/website/src/pages/sdlc/api/cockpit-floor/[extId].ts |
| `/sdlc/api/cockpit-floor/[extId]/ci` | admin | — | components/website/src/pages/sdlc/api/cockpit-floor/[extId]/ci.ts |
| `/sdlc/api/cockpit-floor/[extId]/deploy` | admin | — | components/website/src/pages/sdlc/api/cockpit-floor/[extId]/deploy.ts |
| `/sdlc/api/cockpit-floor/[extId]/inject` | admin | — | components/website/src/pages/sdlc/api/cockpit-floor/[extId]/inject.ts |
| `/sdlc/api/cockpit-floor/[extId]/release` | admin | — | components/website/src/pages/sdlc/api/cockpit-floor/[extId]/release.ts |
| `/sdlc/api/cockpit-floor/stream` | admin | — | components/website/src/pages/sdlc/api/cockpit-floor/stream.ts |
| `/sdlc/api/cockpit-live` | admin | — | components/website/src/pages/sdlc/api/cockpit-live.ts |
| `/sdlc/api/cockpit-metrics` | admin | — | components/website/src/pages/sdlc/api/cockpit-metrics.ts |
| `/sdlc/api/cockpit-observability` | admin | — | components/website/src/pages/sdlc/api/cockpit-observability.ts |
| `/sdlc/api/cockpit-serving` | admin | — | components/website/src/pages/sdlc/api/cockpit-serving.ts |
| `/sdlc/api/cockpit/actions` | admin | — | components/website/src/pages/sdlc/api/cockpit/actions.ts |
| `/sdlc/api/cockpit/audit` | admin | — | components/website/src/pages/sdlc/api/cockpit/audit.ts |
| `/sdlc/api/cockpit/batch` | admin | — | components/website/src/pages/sdlc/api/cockpit/batch.ts |
| `/sdlc/api/cockpit/container-count` | admin | — | components/website/src/pages/sdlc/api/cockpit/container-count.ts |
| `/sdlc/api/cockpit/feature` | admin | — | components/website/src/pages/sdlc/api/cockpit/feature.ts |
| `/sdlc/api/cockpit/feature-action` | admin | — | components/website/src/pages/sdlc/api/cockpit/feature-action.ts |
| `/sdlc/api/cockpit/feature-actions` | admin | — | components/website/src/pages/sdlc/api/cockpit/feature-actions.ts |
| `/sdlc/api/cockpit/parallel-status` | admin | — | components/website/src/pages/sdlc/api/cockpit/parallel-status.ts |
| `/sdlc/api/cockpit/portfolio` | admin | — | components/website/src/pages/sdlc/api/cockpit/portfolio.ts |
| `/sdlc/api/cockpit/reorder` | admin | — | components/website/src/pages/sdlc/api/cockpit/reorder.ts |
| `/sdlc/api/cockpit/reparent` | admin | — | components/website/src/pages/sdlc/api/cockpit/reparent.ts |
| `/sdlc/api/cockpit/stream` | admin | — | components/website/src/pages/sdlc/api/cockpit/stream.ts |
| `/sdlc/api/cockpit/suggest` | admin | — | components/website/src/pages/sdlc/api/cockpit/suggest.ts |
| `/sdlc/api/cockpit/ticket-status` | admin | — | components/website/src/pages/sdlc/api/cockpit/ticket-status.ts |
| `/sdlc/api/codesearch` | admin | — | components/website/src/pages/sdlc/api/codesearch.ts |
| `/sdlc/api/delivery-metrics` | admin | — | components/website/src/pages/sdlc/api/delivery-metrics.ts |
| `/sdlc/api/deployments` | admin | — | components/website/src/pages/sdlc/api/deployments.ts |
| `/sdlc/api/deployments/[name]/restart` | admin | — | components/website/src/pages/sdlc/api/deployments/[name]/restart.ts |
| `/sdlc/api/deployments/[name]/scale` | admin | — | components/website/src/pages/sdlc/api/deployments/[name]/scale.ts |
| `/sdlc/api/evidence/[id]/replay` | admin | — | components/website/src/pages/sdlc/api/evidence/[id]/replay.ts |
| `/sdlc/api/evidence/upload` | admin | — | components/website/src/pages/sdlc/api/evidence/upload.ts |
| `/sdlc/api/health-goals` | public | — | components/website/src/pages/sdlc/api/health-goals.ts |
| `/sdlc/api/health-goals/rescan` | admin | — | components/website/src/pages/sdlc/api/health-goals/rescan.ts |
| `/sdlc/api/health-goals/tickets` | admin | — | components/website/src/pages/sdlc/api/health-goals/tickets.ts |
| `/sdlc/api/ki/catalog` | admin | — | components/website/src/pages/sdlc/api/ki/catalog.ts |
| `/sdlc/api/ki/embeddings` | admin | — | components/website/src/pages/sdlc/api/ki/embeddings.ts |
| `/sdlc/api/ki/env-status` | admin | — | components/website/src/pages/sdlc/api/ki/env-status.ts |
| `/sdlc/api/ki/providers` | admin | — | components/website/src/pages/sdlc/api/ki/providers.ts |
| `/sdlc/api/ki/providers/[id]` | admin | — | components/website/src/pages/sdlc/api/ki/providers/[id].ts |
| `/sdlc/api/llm-proxy/backends` | admin | — | components/website/src/pages/sdlc/api/llm-proxy/backends.ts |
| `/sdlc/api/llm-proxy/backends/[id]` | admin | — | components/website/src/pages/sdlc/api/llm-proxy/backends/[id].ts |
| `/sdlc/api/llm-proxy/catalog` | admin | — | components/website/src/pages/sdlc/api/llm-proxy/catalog.ts |
| `/sdlc/api/llm-proxy/default` | admin | — | components/website/src/pages/sdlc/api/llm-proxy/default.ts |
| `/sdlc/api/llm-proxy/loadouts` | admin | — | components/website/src/pages/sdlc/api/llm-proxy/loadouts.ts |
| `/sdlc/api/llm-proxy/loadouts/[slug]/[action]` | admin | — | components/website/src/pages/sdlc/api/llm-proxy/loadouts/[slug]/[action].ts |
| `/sdlc/api/llm-proxy/loadouts/pin` | admin | — | components/website/src/pages/sdlc/api/llm-proxy/loadouts/pin.ts |
| `/sdlc/api/llm-proxy/loadouts/status` | admin | — | components/website/src/pages/sdlc/api/llm-proxy/loadouts/status.ts |
| `/sdlc/api/llm-proxy/models` | admin | — | components/website/src/pages/sdlc/api/llm-proxy/models.ts |
| `/sdlc/api/llm-proxy/reload` | admin | — | components/website/src/pages/sdlc/api/llm-proxy/reload.ts |
| `/sdlc/api/llm-proxy/requests` | admin | — | components/website/src/pages/sdlc/api/llm-proxy/requests.ts |
| `/sdlc/api/llm-proxy/requests/[id]` | admin | — | components/website/src/pages/sdlc/api/llm-proxy/requests/[id].ts |
| `/sdlc/api/llm-proxy/status` | admin | — | components/website/src/pages/sdlc/api/llm-proxy/status.ts |
| `/sdlc/api/mcp-health` | admin | — | components/website/src/pages/sdlc/api/mcp-health.ts |
| `/sdlc/api/monitoring` | admin | — | components/website/src/pages/sdlc/api/monitoring.ts |
| `/sdlc/api/ops/ai/reindex` | admin | — | components/website/src/pages/sdlc/api/ops/ai/reindex.ts |
| `/sdlc/api/ops/audit/log` | admin | — | components/website/src/pages/sdlc/api/ops/audit/log.ts |
| `/sdlc/api/ops/backup/list` | admin | — | components/website/src/pages/sdlc/api/ops/backup/list.ts |
| `/sdlc/api/ops/backup/trigger` | admin | — | components/website/src/pages/sdlc/api/ops/backup/trigger.ts |
| `/sdlc/api/ops/certs` | admin | — | components/website/src/pages/sdlc/api/ops/certs.ts |
| `/sdlc/api/ops/deployments/[ns]/[name]/restart` | admin | — | components/website/src/pages/sdlc/api/ops/deployments/[ns]/[name]/restart.ts |
| `/sdlc/api/ops/deployments/[ns]/[name]/scale` | admin | — | components/website/src/pages/sdlc/api/ops/deployments/[ns]/[name]/scale.ts |
| `/sdlc/api/ops/deployments/list` | admin | — | components/website/src/pages/sdlc/api/ops/deployments/list.ts |
| `/sdlc/api/ops/error-log` | admin | — | components/website/src/pages/sdlc/api/ops/error-log.ts |
| `/sdlc/api/ops/health` | admin | — | components/website/src/pages/sdlc/api/ops/health.ts |
| `/sdlc/api/ops/log-stream/stream` | admin | — | components/website/src/pages/sdlc/api/ops/log-stream/stream.ts |
| `/sdlc/api/ops/redeploy/brett` | admin | — | components/website/src/pages/sdlc/api/ops/redeploy/brett.ts |
| `/sdlc/api/ops/redeploy/docs` | admin | — | components/website/src/pages/sdlc/api/ops/redeploy/docs.ts |
| `/sdlc/api/ops/redeploy/website` | admin | — | components/website/src/pages/sdlc/api/ops/redeploy/website.ts |
| `/sdlc/api/ops/restore` | admin | — | components/website/src/pages/sdlc/api/ops/restore.ts |
| `/sdlc/api/ops/server-logs/stream` | admin | — | components/website/src/pages/sdlc/api/ops/server-logs/stream.ts |
| `/sdlc/api/ops/users/create` | admin | — | components/website/src/pages/sdlc/api/ops/users/create.ts |
| `/sdlc/api/ops/users/groups` | admin | — | components/website/src/pages/sdlc/api/ops/users/groups.ts |
| `/sdlc/api/ops/users/list` | admin | — | components/website/src/pages/sdlc/api/ops/users/list.ts |
| `/sdlc/api/plan-runner` | admin | — | components/website/src/pages/sdlc/api/plan-runner.ts |
| `/sdlc/api/planning-office` | admin | — | components/website/src/pages/sdlc/api/planning-office/index.ts |
| `/sdlc/api/planning-office/[extId]` | admin | — | components/website/src/pages/sdlc/api/planning-office/[extId].ts |
| `/sdlc/api/planning-office/[extId]/clarify` | admin | — | components/website/src/pages/sdlc/api/planning-office/[extId]/clarify.ts |
| `/sdlc/api/planning-office/[extId]/promote` | admin | — | components/website/src/pages/sdlc/api/planning-office/[extId]/promote.ts |
| `/sdlc/api/planungsbuero` | admin | — | components/website/src/pages/sdlc/api/planungsbuero/index.ts |
| `/sdlc/api/planungsbuero/[extId]` | admin | — | components/website/src/pages/sdlc/api/planungsbuero/[extId].ts |
| `/sdlc/api/platform/assets/[slug]/tickets` | admin | — | components/website/src/pages/sdlc/api/platform/assets/[slug]/tickets.ts |
| `/sdlc/api/platform/gpu-telemetry` | admin | — | components/website/src/pages/sdlc/api/platform/gpu-telemetry.ts |
| `/sdlc/api/platform/hardware` | admin | — | components/website/src/pages/sdlc/api/platform/hardware.ts |
| `/sdlc/api/platform/rig-telemetry` | admin | — | components/website/src/pages/sdlc/api/platform/rig-telemetry.ts |
| `/sdlc/api/platform/software` | admin | — | components/website/src/pages/sdlc/api/platform/software.ts |
| `/sdlc/api/platform/software/[id]` | admin | — | components/website/src/pages/sdlc/api/platform/software/[id].ts |
| `/sdlc/api/prompt-library` | admin | — | components/website/src/pages/sdlc/api/prompt-library/index.ts |
| `/sdlc/api/prompt-library/[id]` | admin | — | components/website/src/pages/sdlc/api/prompt-library/[id].ts |
| `/sdlc/api/prompt-library/[id]/use` | admin | — | components/website/src/pages/sdlc/api/prompt-library/[id]/use.ts |
| `/sdlc/api/qa-criteria` | admin | — | components/website/src/pages/sdlc/api/qa-criteria.ts |
| `/sdlc/api/qa-queue` | admin | — | components/website/src/pages/sdlc/api/qa-queue.ts |
| `/sdlc/api/qa-reviews` | admin | — | components/website/src/pages/sdlc/api/qa-reviews.ts |
| `/sdlc/api/systemtest/board` | admin | — | components/website/src/pages/sdlc/api/systemtest/board.ts |
| `/sdlc/api/systemtest/cleanup-fixtures` | admin | — | components/website/src/pages/sdlc/api/systemtest/cleanup-fixtures.ts |
| `/sdlc/api/systemtest/drain-outbox` | admin | — | components/website/src/pages/sdlc/api/systemtest/drain-outbox.ts |
| `/sdlc/api/systemtest/purge-all-test-data` | admin | — | components/website/src/pages/sdlc/api/systemtest/purge-all-test-data.ts |
| `/sdlc/api/systemtest/seed` | admin | — | components/website/src/pages/sdlc/api/systemtest/seed.ts |
| `/sdlc/api/test-results` | admin | — | components/website/src/pages/sdlc/api/test-results.ts |
| `/sdlc/api/test-runs` | admin | — | components/website/src/pages/sdlc/api/test-runs.ts |
| `/sdlc/api/testdata/purge` | admin | — | components/website/src/pages/sdlc/api/testdata/purge.ts |
| `/sdlc/api/testdata/seed` | admin | — | components/website/src/pages/sdlc/api/testdata/seed.ts |
| `/sdlc/api/tests/flake` | admin | — | components/website/src/pages/sdlc/api/tests/flake.ts |
| `/sdlc/api/tests/ingest-e2e` | admin | — | components/website/src/pages/sdlc/api/tests/ingest-e2e.ts |
| `/sdlc/api/tests/playwright-report` | admin | — | components/website/src/pages/sdlc/api/tests/playwright-report.ts |
| `/sdlc/api/tests/report` | admin | — | components/website/src/pages/sdlc/api/tests/report.ts |
| `/sdlc/api/tests/results/[jobId]` | admin | — | components/website/src/pages/sdlc/api/tests/results/[jobId].ts |
| `/sdlc/api/tests/run` | admin | — | components/website/src/pages/sdlc/api/tests/run.ts |
| `/sdlc/api/tests/stream/[jobId]` | admin | — | components/website/src/pages/sdlc/api/tests/stream/[jobId].ts |
| `/sdlc/api/tests/traceability` | admin | — | components/website/src/pages/sdlc/api/tests/traceability.ts |
| `/sdlc/api/tests/trend` | admin | — | components/website/src/pages/sdlc/api/tests/trend.ts |
| `/sdlc/api/tickets` | admin | — | components/website/src/pages/sdlc/api/tickets/index.ts |
| `/sdlc/api/tickets/[id]` | admin | — | components/website/src/pages/sdlc/api/tickets/[id].ts |
| `/sdlc/api/tickets/[id]/attachments` | admin | — | components/website/src/pages/sdlc/api/tickets/[id]/attachments.ts |
| `/sdlc/api/tickets/[id]/attachments/[aid]` | admin | — | components/website/src/pages/sdlc/api/tickets/[id]/attachments/[aid].ts |
| `/sdlc/api/tickets/[id]/classify` | admin | — | components/website/src/pages/sdlc/api/tickets/[id]/classify.ts |
| `/sdlc/api/tickets/[id]/comments` | admin | — | components/website/src/pages/sdlc/api/tickets/[id]/comments.ts |
| `/sdlc/api/tickets/[id]/links` | admin | — | components/website/src/pages/sdlc/api/tickets/[id]/links.ts |
| `/sdlc/api/tickets/[id]/readiness` | admin | — | components/website/src/pages/sdlc/api/tickets/[id]/readiness.ts |
| `/sdlc/api/tickets/[id]/transition` | admin | — | components/website/src/pages/sdlc/api/tickets/[id]/transition.ts |
| `/sdlc/api/tickets/[id]/triage` | admin | — | components/website/src/pages/sdlc/api/tickets/[id]/triage.ts |
| `/sdlc/api/tickets/bulk-status` | admin | — | components/website/src/pages/sdlc/api/tickets/bulk-status.ts |
| `/sdlc/api/tickets/bulk-status/undo` | admin | — | components/website/src/pages/sdlc/api/tickets/bulk-status/undo.ts |
| `/sdlc/api/tickets/comment` | admin | — | components/website/src/pages/sdlc/api/tickets/comment.ts |
| `/sdlc/api/tickets/graph` | admin | — | components/website/src/pages/sdlc/api/tickets/graph.ts |

## MCP-Server

| Server | Tier | Quelle |
|---|---|---|
| `bge-mcp` | — | docs/agent-guide/registry/mcp.yaml (clients) |
| `codebase-memory-mcp` | — | docs/agent-guide/registry/mcp.yaml (clients) |
| `context7` | — | docs/agent-guide/registry/mcp.yaml (clients) |
| `devflow-mcp` | — | docs/agent-guide/registry/mcp.yaml (clients) |
| `mcp-kubernetes` | core | docs/agent-guide/registry/mcp.yaml (clients) |
| `mcp-postgres` | — | docs/agent-guide/registry/mcp.yaml (clients) |
| `mcp-task-runner` | — | docs/agent-guide/registry/mcp.yaml (clients) |
| `playwright` | — | docs/agent-guide/registry/mcp.yaml (clients) |
| `warden` | — | docs/agent-guide/registry/mcp.yaml (clients) |

## Öffentliche Routen (ohne Auth-Guard)

- `/sdlc/api/cluster/status` — Ohne Auth-Guard (nur aggregierte Health-/Statusdaten, kein Secret im Payload).
- `/sdlc/api/health-goals` — Ohne Auth-Guard (nur aggregierte Health-/Statusdaten, kein Secret im Payload).
