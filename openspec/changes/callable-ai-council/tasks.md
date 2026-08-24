---
title: "callable-ai-council — Implementation Plan"
ticket_id: T016501
domains: [agents, scripts, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# callable-ai-council — Implementation Plan

## File Structure

| Path | Change |
|---|---|
| `scripts/council/decision.mjs` | New pure ballot parser and deterministic outcome state machine |
| `scripts/council/prompts.mjs` | New prompt builders for openings, cross-examination, synthesis, revisions, and ballots |
| `scripts/vda/council.mjs` | New CLI, registry resolver, process runner, scheduler, and run-artifact writer |
| `scripts/vda.sh` | Add the canonical `council` command and help entry |
| `.gitignore` | Ignore local `.council/` run artifacts |
| `docs/agent-guide/registry/tools.yaml` | Register the Council as a discoverable advisory tool |
| `components/website/src/lib/agent-guide.generated.json` | Regenerated agent-guide web surface |
| `components/website/src/lib/platform-descriptions.generated.json` | Regenerated platform descriptions if registry emission changes it |
| `docs/agent-guide/20-werkzeuge.md` | Regenerated Council tool documentation |
| `docs/agent-guide/maps/tools-map.md` | Regenerated Council tool map |
| `tests/unit/council-decision.test.mjs` | New offline decision/parser tests |
| `tests/unit/vda-council.bats` | New offline CLI, SSOT, read-only dispatch, and failure-contract tests |
| `components/website/src/data/test-inventory.json` | Regenerated test inventory |

## Partials

| id | plan | role | target_files | depends_on |
|---|---|---|---|---|
| p1-engine | tasks.d/p1-engine.md | impl | scripts/council/decision.mjs, scripts/council/prompts.mjs, scripts/vda/council.mjs | |
| p2-surface | tasks.d/p2-surface.md | impl | scripts/vda.sh, .gitignore, docs/agent-guide/registry/tools.yaml, components/website/src/lib/agent-guide.generated.json, components/website/src/lib/platform-descriptions.generated.json, docs/agent-guide/20-werkzeuge.md, docs/agent-guide/maps/tools-map.md | p1-engine |
| p3-tests | tasks.d/p3-tests.md | tests | tests/unit/council-decision.test.mjs, tests/unit/vda-council.bats, components/website/src/data/test-inventory.json | p1-engine, p2-surface |

## Partial Plans

- [p1-engine](tasks.d/p1-engine.md)
- [p2-surface](tasks.d/p2-surface.md)
- [p3-tests](tasks.d/p3-tests.md)

## Final Verification

- [ ] Run the mandatory repository gates after all partials are complete:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
