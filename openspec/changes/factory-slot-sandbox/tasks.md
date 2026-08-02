---
title: "factory-slot-sandbox — Slot-Kopplung, Agent-Containerisierung und Per-Slot-Isolation"
ticket_id: T002483
domains: [factory, infra, llm]
status: planning
file_locks: []
shared_changes: false
batch_id: null
parent_feature: T002370
depends_on_plans: [T002482]
---

# factory-slot-sandbox — Implementation Plan

Koppelt `pipeline_slot` (1..3) an llama.cpp-Slot-IDs (0..2), upgraded `sandbox-run.sh`
vom Sub-Command-Wrapper zum Agent-Session-Wrapper (Stufe 2), und isoliert jeden
pipeline_slot in einem eigenen Container mit cgroups, Netzwerk-default-deny und
dediziertem Dateisystem.

Design: `openspec/changes/factory-slot-sandbox/design.md`.
Blockiert von T002482 (KV-Offload + Slot-Save/Restore).

_Ticket: T002483 · Epic: T002370_

## File Structure

| Datei | Ist | Budget |
| --- | --- | --- |
| `scripts/factory/sandbox-run.sh` | 88 | 712 |
| `scripts/factory/pipeline.mjs` | 696 | — |
| `scripts/factory/slots.sh` | 50 | 750 |
| `scripts/llm-proxy/server.mjs` | 465 | 335 |
| `scripts/llm/loadouts.json` | 183 | — |
| `scripts/factory/sandbox.Dockerfile` | 11 | — |

Neue Dateien: `scripts/factory/sandbox-agent.Dockerfile` (Stufe 2 Image).
`sandbox-run.sh` wächst moderat (Agent-Mode + egress-Enforcement), bleibt weit unter 800.
`pipeline.mjs` bekommt Sandbox-Integration (~20 Zeilen), `slots.sh` Slot-Mapping (~30).

## Partials

| id | Datei | Rolle | target_files | depends_on |
| --- | --- | --- | --- | --- |
| p1 | `tasks.d/p1-slot-mapping.md` | impl | `scripts/factory/slots.sh`, `scripts/llm-proxy/server.mjs`, `scripts/llm/loadouts.json` | |
| p2 | `tasks.d/p2-sandbox-agent.md` | impl | `scripts/factory/sandbox-run.sh`, `scripts/factory/sandbox.Dockerfile`, `scripts/factory/sandbox-agent.Dockerfile`, `scripts/factory/pipeline.mjs` | p1 |
| p3 | `tasks.d/p3-tests.md` | tests | `tests/spec/software-factory.bats`, `tests/spec/local-llm-proxy.bats`, `scripts/llm-proxy/server.test.mjs` | p1, p2 |

p2 hängt an p1 (Slot-Mapping muss stehen, bevor der Agent die Slot-ID nutzt).
p3 hängt an p1+p2 (Tests prüfen Mapping + Sandbox). Rot→grün in p3.

## Task 6 — Failing Test (red→green, vor Deployment)

- [ ] **FAILING (expected: FAIL)**: BATS-Test: `slots.sh claim` setzt `pipeline_slot_meta.llama_slot_id`. Run `bats tests/spec/software-factory.bats --filter 'slot-mapping'` and verify it fails — Slot-Mapping noch nicht implementiert.
- [ ] **FAILING (expected: FAIL)**: Vitest: llm-proxy akzeptiert `X-Slot-ID` Header. Run `npx vitest run server.test.mjs` and verify slot-routing test fails.

## Task 7 — Final verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
bash scripts/plan-lint.sh openspec/changes/factory-slot-sandbox/tasks.md
bash scripts/openspec.sh validate
```
