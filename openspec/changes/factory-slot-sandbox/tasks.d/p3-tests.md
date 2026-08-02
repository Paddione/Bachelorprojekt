# Partial p3 — Tests

## Scope

BATS-Tests für Slot-Mapping und Sandbox, Vitest für llm-proxy Slot-Routing.

## Pre-Condition

p1 (Slot-Mapping) und p2 (Sandbox-Agent) müssen abgeschlossen sein.

## Task List

### 1. BATS — tests/spec/software-factory.bats

- [ ] **1.1** Test: `slots.sh claim` setzt `pipeline_slot` und `pipeline_slot_meta.llama_slot_id`
- [ ] **1.2** Test: `slots.sh slot-id <ticket>` gibt korrekte llama_slot_id zurück
- [ ] **1.3** Test: `slots.sh release` löscht `pipeline_slot` und `pipeline_slot_meta`
- [ ] **1.4** Test: Zwei parallele Claims belegen verschiedene Slots
- [ ] **1.5** Test: `sandbox-run.sh --agent --slot 1` startet Container mit korrektem Netzwerk
- [ ] **1.6** Test: Container hat `--cpus=2 --memory=4g` Limits
- [ ] **1.7** Test: Ohne Docker: Fallback auf Host-Prozess

### 2. BATS — tests/spec/local-llm-proxy.bats

- [ ] **2.1** Test: Request mit `X-Slot-ID: 0` wird korrekt geroutet
- [ ] **2.2** Test: Response enthält `X-LLM-Proxy-Slot` Header
- [ ] **2.3** Test: Ohne `X-Slot-ID`: Round-Robin-Verteilung

### 3. Vitest — scripts/llm-proxy/server.test.mjs

- [ ] **3.1** Test: `enqueue(backend, slotId=0, fn)` nutzt korrekte Per-Slot-Queue
- [ ] **3.2** Test: Per-Slot `max_inflight` Limit wird eingehalten
- [ ] **3.3** Test: `extractSlotId()` parst `X-Slot-ID` Header korrekt

### 4. Struct2 — Failing Test First (red→green)

- [ ] **4.1** **FAILING (expected: FAIL)**: BATS-Test für `slots.sh slot-id` — muss fehlschlagen bevor p1 implementiert ist. Run `bats tests/spec/software-factory.bats --filter 'slot-mapping'` and verify it fails.
- [ ] **4.2** **FAILING (expected: FAIL)**: Vitest für `enqueue(slotId)` — muss fehlschlagen bevor llm-proxy Slot-Routing implementiert ist. Run `npx vitest run server.test.mjs --reporter verbose` and verify slot-routing test fails.

## Verification

```bash
task test:changed
bash scripts/test-runner.sh tests/spec/software-factory.bats
bash scripts/test-runner.sh tests/spec/local-llm-proxy.bats
```
