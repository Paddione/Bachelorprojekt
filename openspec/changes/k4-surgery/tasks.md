---
title: K4-Surgery — Spiegel entfernen
ticket_id: T900451
domains: [brain, cleanup]
status: active
---

# k4-surgery — Implementation Plan

## File Structure

- `scripts/brain-ingest*.sh` + Helfer (p1, 18 Pfade DEL + Skill-Verzeichnis)
- `taskfiles/Taskfile.brain.yaml` (p1, Shrink auf brain:chunk/eval/chunk)
- `Taskfile.yml` (p1, Brain-Block entfernen)
- `scripts/health-goals-check.sh` (p1, G-BRAIN12/13/14 raus)
- `.claude/lib/goals.md` (p1, G-BRAIN12/13/14 raus)
- `scripts/brain-mcp-server.py` + `scripts/brain-mcp-node/` (p2, DEL)
- Registry/Harness-Wiring: `.mcp.json`, `.opencode/opencode.jsonc`, `registry/mcp.yaml`, `registry/capabilities.yaml`, `toolset-map.md` (p2, Brain-Blöcke raus)
- `docker/mcp-node/supervisor.sh`, `k3d/dev-pod/deployment.yaml`, `k3d/dev-pod/service.yaml` (p2, brain-mcp aus Bundle)
- Cockpit: `brain-links.ts`, `cockpit/brain.ts` + beide `.test.ts` (p2, DEL)
- `k3d/brain.yaml`, `k3d/oauth2-proxy-brain.yaml` (p2, DEL), `k3d/kustomization.yaml`, `k3d/ingress.yaml` (p2, Refs raus)
- `tests/spec/k4-surgery-guard.bats` (p-tests, neu) + 22 Guard-Löschungen + 7 Guard-Shrinks

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-pipeline.md | impl | scripts/brain-ingest.sh, scripts/brain-ingest-worklist.sh, scripts/brain-ingest-transform.sh, scripts/brain-ingest-moc.sh, scripts/brain-ingest-prune.sh, scripts/brain-ingest-restamp.sh, scripts/brain-ingest-swap.sh, scripts/brain-ingest-reset.sh, scripts/brain-ingest-coverage.sh, scripts/brain-group-match.sh, scripts/brain-source-provenance.sh, scripts/brain-page-metadata.py, scripts/brain-lifecycle-audit.py, scripts/brain-expertise.py, scripts/brain-bootstrap.sh, scripts/brain-merge-hook.sh, .github/workflows/brain-merge-hook.yml, scripts/brain/ingest-sources.yaml, .agents/skills/brain-ingest/SKILL.md, taskfiles/Taskfile.brain.yaml, Taskfile.yml, scripts/health-goals-check.sh, .claude/lib/goals.md | |
| p2 | tasks.d/p2-mcp-cockpit.md | impl | scripts/brain-mcp-server.py, scripts/brain-mcp-node/server.mjs, .mcp.json, .opencode/opencode.jsonc, docs/agent-guide/registry/mcp.yaml, docs/agent-guide/registry/capabilities.yaml, docs/agent-guide/maps/toolset-map.md, docker/mcp-node/supervisor.sh, k3d/dev-pod/deployment.yaml, k3d/dev-pod/service.yaml, components/website/src/lib/sdlc/brain-links.ts, components/website/src/pages/sdlc/api/cockpit/brain.ts, components/website/src/lib/sdlc/brain-links.test.ts, components/website/src/pages/sdlc/api/cockpit/brain.test.ts, k3d/brain.yaml, k3d/oauth2-proxy-brain.yaml, k3d/kustomization.yaml, k3d/ingress.yaml | p1 |
| p-tests | tasks.d/p-tests.md | tests | tests/spec/k4-surgery-guard.bats, tests/spec/brain-ingest.bats, tests/spec/brain-initial-ingest.bats, tests/spec/brain-ingest-task-defaults.bats, tests/spec/brain-ingest/delivery-rebase-before-push.bats, tests/spec/brain-k4-brain-wiki/coverage-gate.bats, tests/spec/brain-k4-brain-wiki/delivery-branch-staleness.bats, tests/spec/brain-k4-brain-wiki/mcp-registry.bats, tests/spec/brain-k4-brain-wiki/max-source-chars-guard.bats, tests/spec/brain-k4-brain-wiki/brain-mcp-server.bats, tests/spec/brain-k4-brain-wiki/node-parity.bats, tests/spec/sdlc-cockpit/brain-link-derivation.bats, tests/spec/local-llm-proxy/brain-ingest-swap.bats, tests/spec/brain-foundation/state-file-type-repair.bats, tests/spec/brain-foundation/from-scratch-rebuild.bats, tests/spec/brain-foundation/ingest-llm-endpoint.bats, tests/spec/brain-foundation/knowledge-lifecycle.bats, tests/spec/brain-merge-hook.bats, tests/unit/brain-ingest-moc.bats, tests/unit/brain-ingest-prune.bats, tests/unit/brain-ingest-restamp.bats, tests/unit/brain-lifecycle-audit.bats, tests/unit/brain-ingest-group.bats, tests/spec/brain-foundation.bats, tests/spec/local-llm-proxy/brain-ingest-port.bats, tests/spec/local-dev-mesh/llm-services.bats, tests/spec/health-goals/goal-integrity.bats, tests/spec/mcp-gateway/node-mcp-server-startup.bats, tests/spec/brain-quality-goals.bats, tests/spec/llm-local-dev/glimmer-serving-profile.bats | p1,p2 |

## Verify (final, wächst mit den Partials)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
