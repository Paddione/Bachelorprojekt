---
title: Agent-Routing-Doku — Schichtwahl + Sweep
ticket_id: T900453
domains: [docs, agents]
status: active
---

# agent-routing-docs — Implementation Plan

## File Structure

- `docs/brain/recall-routing.md` (p1, neu: Baum + Tabelle + Ownership)
- `AGENTS.md`, `registry/capabilities.yaml`, `mcp-tool-guide.md`, 3 Prompts (p1, Routing-Verdrahtung)
- Generiert via Keeper-Tasks (p1): `toolset-map.md`, `10/20/30-*.md`, `*-map.md`, 2× `generated.json`
- `docs/runbooks/brain-ingest.md` (p2, DEL), `registry/skills.yaml`, `system-audit/SKILL.md`, `deploy-routing.md` (p2, Blöcke raus)
- `k5-openspec.md`, `k2-bge-paare.md`, `gesamtbild.md` + Snapshot-Hinweis, `k1-vector-db.md`-Addendum, `CLAUDE.md:27` (p2, Fixes)

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-routing-core.md | impl | docs/brain/recall-routing.md, AGENTS.md, docs/agent-guide/registry/capabilities.yaml, .opencode/skills/references/mcp-tool-guide.md, .opencode/prompts/orchestrator.md, .opencode/prompts/primary-agent.md, .opencode/prompts/glimmer-primary.md, docs/agent-guide/maps/toolset-map.md, docs/agent-guide/20-werkzeuge.md, components/website/src/lib/agent-guide.generated.json | |
| p2 | tasks.d/p2-sweep.md | impl | docs/runbooks/brain-ingest.md, docs/agent-guide/registry/skills.yaml, .opencode/skills/system-audit/SKILL.md, .opencode/skills/references/deploy-routing.md, docs/brain/k5-openspec.md, docs/brain/k2-bge-paare.md, docs/diagrams/brain-architektur-gesamtbild.md, docs/diagrams/k1-vector-db.md, CLAUDE.md | p1 |

## Verify (final, wächst mit den Partials)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
