---
title: "unterstuetzermodelle-inbetriebnahme — Implementation Plan"
ticket_id: T006840
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# unterstuetzermodelle-inbetriebnahme — Implementation Plan

_Ticket: T006840_

## Partials

| id | file | role | target_files | depends_on |
|---|---|---|---|---|
| p1 | tasks.d/p1-config.md | impl | .opencode/agent-models.jsonc | |
| p2 | tasks.d/p2-tests.md | tests | tests/spec/local-llm-proxy/support-model-slots.bats | |

## File Structure

```
.opencode/agent-models.jsonc                            (mod — zwei neue lmstudio-Slots)
tests/spec/local-llm-proxy/support-model-slots.bats     (new — Guard nach D5)
website/src/data/test-inventory.json                    (regenerated — task freshness:regenerate)
```

## Verify (RED → GREEN)

- [ ] **p1 — Config-Step.** Die zwei Slots `gemma-4-12b@ud-iq3_xxs` und `qwen3.5-4b@q6_k`
      sind im `lmstudio`-Provider-Block von `.opencode/agent-models.jsonc` eingetragen
      (Details: `tasks.d/p1-config.md`).
- [ ] **p2 — Failing-Test-Step (RED).** Der Guard aus `tasks.d/p2-tests.md` ist geschrieben.
      Er schlägt auf dem aktuellen Branch fehl, weil die Slots noch fehlen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/support-model-slots.bats
# expected: FAIL (red — die zwei Slots sind in .opencode/agent-models.jsonc noch nicht deklariert)
```

- [ ] **Fix-Step (GREEN).** Nach p1 ist der Guard grün; der Erreichbarkeits-Check
      (über `:18235/v1/models`) skippt, wenn llm-proxy oder Geräte offline sind.
- [ ] **Final Verification.** Die drei CI-Gates laufen grün:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] **User-Task (K2/K3, nach Merge):** Device-Schritte (iGPU/Vulkan aktivieren, Modelle
      laden, LM Link fürs Tablet) und Vulkan-Messung mit ausführbarem Befehl — Ergebnis als
      Ticket-Kommentar T006840, Limits danach nachziehen (D3/D4).
