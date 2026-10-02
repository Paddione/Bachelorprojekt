# p5 — OpenSpec-Prosa entfernen (5/7)

Ticket: T900724. Kontext: `design.md`. 64 Dateien.

## Regeln

Nur Prosa und Kommentare, kein Verhalten ändern.

Für jede Datei der Liste jede Erwähnung von OpenSpec entfernen (`openspec/…`-Pfade, `openspec`-Wort,
`openspec-*`-Skills, `/opsx:*`, „SSOT-Delta“/„Spec-Delta“ mit OpenSpec-Pfad):

1. Zeile ist nur ein Verweis (z. B. `# SSOT-Delta: openspec/changes/x/…`, `# Spec: openspec/specs/x.md`) → Zeile löschen.
2. Satz besteht nur aus dem Verweis → Satz löschen.
3. Satz hat weiteren Inhalt → nur den OpenSpec-Teil streichen, Rest grammatisch lassen.
4. Keinen neuen Verweis erfinden, nichts umformulieren, was nicht OpenSpec betrifft.
5. In `.bats`-Dateien nur Kommentarzeilen und `@test`-Titel ändern. Ändert sich ein `@test`-Titel,
   bleibt die Ticket-ID am Anfang erhalten.

Nach jeder Datei: `grep -in openspec <datei>` ist leer.

## Dateien

- `tests/spec/g-size02-large-files.bats`
- `tests/spec/grilling-flow.bats`
- `tests/spec/health-goals-erden.bats`
- `tests/spec/health-goals.bats`
- `tests/spec/health-goals/g-git03.bats`
- `tests/spec/health-goals/goal-integrity.bats`
- `tests/spec/health-goals/goals-data-path-consistency.bats`
- `tests/spec/health-goals/id-parity.bats`
- `tests/spec/health-goals/measured-at-field.bats`
- `tests/spec/hermes-mcp-access.bats`
- `tests/spec/image-drift.bats`
- `tests/spec/k4-surgery-guard.bats`
- `tests/spec/lavish.bats`
- `tests/spec/llm-local-dev.bats`
- `tests/spec/llm-local-dev/comfy-image-mcp.bats`
- `tests/spec/llm-local-dev/comfy-image-postprocess.bats`
- `tests/spec/llm-local-dev/fit-ngl-conflict.bats`
- `tests/spec/llm-local-dev/glimmer-serving-profile.bats`
- `tests/spec/llm-local-dev/glimmer-worker-mcp.bats`
- `tests/spec/llm-local-dev/opencode-compaction.bats`
- `tests/spec/llm-local-dev/plan-runner.bats`
- `tests/spec/llm-local-dev/qwen-tensor-split.bats`
- `tests/spec/llm-local-dev/system-message-merge.bats`
- `tests/spec/llm-pipeline/bge-usecase-reachability.bats`
- `tests/spec/llm-pipeline/knowledge-ingest-live-sources.bats`
- `tests/spec/llm-pipeline/kv-offload.bats`
- `tests/spec/local-dev-mesh/dev-stack-tasks.bats`
- `tests/spec/local-dev-mesh/k3d-tooling-removed.bats`
- `tests/spec/local-dev-mesh/llm-services.bats`
- `tests/spec/local-dev-mesh/migrate-from-k3d.bats`
- `tests/spec/local-dev-mesh/ticket-devmesh-guard.bats`
- `tests/spec/local-llm-proxy.bats`
- `tests/spec/local-llm-proxy/bge-chain-order.bats`
- `tests/spec/local-llm-proxy/bge-cpu-parallel-start.bats`
- `tests/spec/local-llm-proxy/bge-loadout-cpu-bound.bats`
- `tests/spec/local-llm-proxy/bge-no-probe-import.bats`
- `tests/spec/local-llm-proxy/bge-registry-roles.bats`
- `tests/spec/local-llm-proxy/bge-role-routes.bats`
- `tests/spec/local-llm-proxy/brain-ingest-port.bats`
- `tests/spec/local-llm-proxy/dev-pod-loadouts-path.bats`
- `tests/spec/local-llm-proxy/gemma-loadout-autorestart-queue.bats`
- `tests/spec/local-llm-proxy/gpu-lock.bats`
- `tests/spec/local-llm-proxy/lib/pick-small-model.sh`
- `tests/spec/local-llm-proxy/llama-tool-names-match-binary.bats`
- `tests/spec/local-llm-proxy/loadout-aux-files-exist.bats`
- `tests/spec/local-llm-proxy/loadout-enabled-flag.bats`
- `tests/spec/local-llm-proxy/loadout-env-property.bats`
- `tests/spec/local-llm-proxy/model-path-large-file.bats`
- `tests/spec/local-llm-proxy/readiness-primary-tier.bats`
- `tests/spec/local-llm-proxy/support-model-slots.bats`
- `tests/spec/local-llm-proxy/tools-runtime-sandbox.bats`
- `tests/spec/local-llm-proxy/ui-config-seed.bats`
- `tests/spec/mcp-gateway/agy-token-expansion.bats`
- `tests/spec/mcp-gateway/authenticated-http-headers-isolation.bats`
- `tests/spec/mcp-gateway/authenticated-http-headers.bats`
- `tests/spec/mcp-gateway/bge-host-routing.bats`
- `tests/spec/mcp-gateway/bge-http-only-get.bats`
- `tests/spec/mcp-gateway/bge-mcp-windows-esm-url.bats`
- `tests/spec/mcp-gateway/client-env-check.bats`
- `tests/spec/mcp-gateway/dev-shell-ssh.bats`
- `tests/spec/mcp-gateway/guarded-proxy-streaming.bats`
- `tests/spec/mcp-gateway/http-security-boundary.bats`
- `tests/spec/mcp-gateway/mcp-postgres-multistatement.bats`
- `tests/spec/mcp-gateway/mcp-postgres-readonly-role.bats`

## Abschluss

```bash
bats tests/spec/os-retirement-prose.bats
```

Der Test wird erst grün, wenn alle Partials fertig sind. Für diesen Partial reicht, dass keine Datei dieser Liste mehr gemeldet wird.
